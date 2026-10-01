/**
 * dsh-session-guard — step 级门控（v0.2.0，`agent/pre-step` waterfall）。
 *
 * 为什么需要它：turn 级暂停（pause-gate.js）只在安全边界停下整个回合，
 * 高峰切入时已经花掉当前 step 的 token。step 门控挂在 `agent/pre-step`，
 * 在**下一个 step 的模型请求发生之前**把回合挂起，退峰/手动继续后原地续跑。
 *
 * 关键语义（见计划 findings F2/F3/F6/F7/F8）：
 * - `agent/pre-step` 是 waterfall：监听器 `await` 任意 Promise 后再 `return next()` 合法。
 *   **不要**返回 `{kind:'reject'}`——loop 把 reject 映射为 `turnEnds={kind:'blocked'}` 并结束回合。
 * - abort：`await` 期间 signal abort 必须自己 resolve（否则 Promise 泄漏）；resolve 后
 *   loop 的 `signal.throwIfAborted()` 会抛出并结束回合，因此 agent.cancel 天然解锁。
 * - 超时（默认 5min）：不是放行，而是**升级为 turn 级 force 暂停**（F8），
 *   否则会在高峰形成「每 5 分钟一个 step」的 token drip。
 * - 互斥：请求级 hold（deferrals）已挂起该会话时绝不拉门（F7）。
 * - 手动「继续」置 bypass，本峰内不再拦该会话（否则下一个 pre-step 立刻再拉门）。
 *
 * 状态仅存内存：挂起的是 Promise，进程重启必然失效，落盘只会产生幽灵状态。
 * 零 `@deepseek-ai/*` 值导入；所有判定异常 fail-open 放行。
 */
import { shouldPause } from './time-policy.js'

/** 默认 step 门控超时（防死锁，与 PRD §2.2 的 5min 一致）。 */
export const DEFAULT_STEP_TIMEOUT_MS = 300_000

/**
 * 纯判定：该 step 是否应拉门。
 *
 * 顺序（全部满足才拉门，任一步抛错由调用方 fail-open）：
 *   1. enabled            2. stepLevelPause      3. step > 1
 *   4. 未被 bypass        5. root / guardSubagents
 *   6. pauseVerdict.pause（含周末 / 峰谷）        7. shouldHoldSession（providerGuard 二维判定）
 *   8. 未被请求级 hold    9. 该会话当前没有已挂起的门
 *
 * @param {object} input
 * @param {object} input.cfg 实时设置
 * @param {number} input.step 提议的 step 号（1 基）
 * @param {boolean} [input.isRoot] 是否 root agent
 * @param {{pause:boolean,reason:string}} input.pauseVerdict time.shouldPause 结果
 * @param {(cfg:object,sessionId:string)=>boolean} [input.shouldHoldSession] 目标 provider 判定
 * @param {boolean} [input.isHeldByDeferrals] 请求级守卫是否已挂起该会话
 * @param {boolean} [input.bypassed] 本峰内是否被用户手动跳过
 * @param {boolean} [input.alreadyHeld] 该会话是否已有挂起的门
 * @param {boolean} [input.manual] 用户手动点了「暂停会话」（优先级最高，不受峰谷/step/provider 限制）
 * @returns {{hold:boolean, why:string}}
 */
export function decideStepHold({
  cfg,
  step,
  isRoot = true,
  pauseVerdict,
  shouldHoldSession,
  isHeldByDeferrals = false,
  bypassed = false,
  alreadyHeld = false,
  manual = false,
} = {}) {
  // 手动暂停：用户显式意图，绕过 enabled / stepLevelPause / step>1 / 峰谷 / provider 判定，
  // 仅保留互斥铁律（请求已 hold）与防双门。
  if (manual === true) {
    if (isHeldByDeferrals === true) return { hold: false, why: 'request-held' }
    if (alreadyHeld === true) return { hold: false, why: 'already-held' }
    return { hold: true, why: 'manual' }
  }
  if (!cfg || cfg.enabled !== true) return { hold: false, why: 'disabled' }
  if (cfg.stepLevelPause !== true) return { hold: false, why: 'step-level-off' }
  if (!(Number(step) > 1)) return { hold: false, why: 'first-step' }
  if (bypassed === true) return { hold: false, why: 'bypassed' }
  if (isRoot === false && cfg.guardSubagents === false) return { hold: false, why: 'subagent' }
  if (!pauseVerdict || pauseVerdict.pause !== true) {
    return { hold: false, why: (pauseVerdict && pauseVerdict.reason) || 'not-peak' }
  }
  if (typeof shouldHoldSession === 'function' && shouldHoldSession(cfg) !== true) {
    return { hold: false, why: 'non-official' }
  }
  if (isHeldByDeferrals === true) return { hold: false, why: 'request-held' }
  if (alreadyHeld === true) return { hold: false, why: 'already-held' }
  return { hold: true, why: 'peak' }
}

/**
 * step 门控引擎。
 *
 * @param {object} deps
 * @param {()=>object} deps.getSettings 读实时设置
 * @param {(cfg:object,sessionId:string)=>boolean} [deps.shouldHoldSession] 复用 wiring.shouldPauseSession
 * @param {(sessionId:string)=>boolean} [deps.isHeldByDeferrals] 请求级 hold 查询
 * @param {(agent:object)=>boolean} [deps.isRootAgent] root 判定（默认恒 true）
 * @param {{pause:(id:string,opts:object)=>unknown}} [deps.pauseGate] 超时升级用的 turn 级门
 * @param {object} [deps.logger]
 * @param {()=>number} [deps.now]
 * @param {typeof setTimeout} [deps.setTimer]
 * @param {typeof clearTimeout} [deps.clearTimer]
 * @param {boolean} [deps.unrefTimers]
 * @param {(sessionId:string, state:object)=>void} [deps.onChange] 门控状态变化回调（SSE 推送用）
 */
export function createStepGate({
  getSettings,
  shouldHoldSession,
  isHeldByDeferrals = () => false,
  isRootAgent = () => true,
  pauseGate,
  logger,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  unrefTimers = true,
  onChange,
} = {}) {
  /** sessionId -> { sessionId, step, turn, since, resolve, timer, signal, onAbort } */
  const holds = new Map()
  /** 本峰内被用户手动跳过的会话 */
  const bypass = new Set()
  /** 用户手动点「暂停会话」但还没到 pre-step 边界的会话 */
  const manualPause = new Set()

  const warn = (m) => {
    try {
      logger?.warn?.(`[session-guard] ${m}`)
    } catch {
      /* 日志失败不影响门控 */
    }
  }
  const info = (m) => {
    try {
      logger?.info?.(`[session-guard] ${m}`)
    } catch {
      /* ignore */
    }
  }

  function readCfg() {
    try {
      const v = getSettings()
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  }

  /** 通知状态变化（SSE 推送；异常不得影响门控）。 */
  function emitChange(sessionId) {
    if (typeof onChange !== 'function') return
    try {
      onChange(String(sessionId), state(sessionId))
    } catch (e) {
      warn(`step gate onChange failed: ${String(e && e.message || e)}`)
    }
  }

  /** 摘掉一条挂起记录（不 resolve），幂等。 */
  function detach(entry) {
    if (!entry) return false
    if (holds.get(entry.sessionId) === entry) holds.delete(entry.sessionId)
    if (entry.timer !== null) {
      try {
        clearTimer(entry.timer)
      } catch {
        /* ignore */
      }
      entry.timer = null
    }
    if (entry.signal && entry.onAbort) {
      try {
        entry.signal.removeEventListener('abort', entry.onAbort)
      } catch {
        /* ignore */
      }
    }
    entry.onAbort = null
    return true
  }

  /**
   * 释放一会话的挂起门。幂等：未挂起 → `{released:false}`。
   * @param {string} sessionId
   * @param {string} [reason] manual | off-peak | abort | timeout | pause | cancel | command | disposed
   */
  function release(sessionId, reason = 'manual') {
    const id = String(sessionId)
    const entry = holds.get(id)
    if (entry === undefined) {
      // 没挂起，但可能有未落地的手动暂停请求 → 一并撤销
      if (manualPause.delete(id)) emitChange(id)
      return { released: false, reason }
    }
    detach(entry)
    manualPause.delete(id)
    info(`step gate released (${reason}) for ${id} (step ${entry.step})`)
    try {
      entry.resolve({ released: true, reason })
    } catch (e) {
      warn(`step gate resolve failed: ${String(e && e.message || e)}`)
    }
    emitChange(id)
    return { released: true, reason }
  }

  /** 释放全部挂起门（退峰 / 卸载）。返回被释放的会话 id 列表。 */
  function releaseAll(reason = 'releaseAll') {
    const ids = [...holds.keys()]
    for (const id of ids) release(id, reason)
    for (const id of [...manualPause]) {
      manualPause.delete(id)
      emitChange(id)
    }
    return ids
  }

  /**
   * 用户手动请求暂停（「暂停会话」按钮 / `stepPause` RPC / 服务端口）。
   * 不打断当前 step：在下一次 `agent/pre-step` 边界拉门（step 1 也拦）。
   * 已挂起时幂等；同时撤销本峰 bypass（显式暂停优先）。
   * @returns {{requested:boolean, held:boolean}}
   */
  function requestPause(sessionId) {
    const id = String(sessionId)
    bypass.delete(id)
    if (holds.has(id)) return { requested: true, held: true }
    manualPause.add(id)
    info(`step gate manual pause requested for ${id}`)
    emitChange(id)
    return { requested: true, held: false }
  }

  /** 超时：释放 + 升级为 turn 级 force 暂停（F8）。 */
  function escalate(sessionId) {
    const id = String(sessionId)
    release(id, 'timeout')
    if (!pauseGate || typeof pauseGate.pause !== 'function') return
    try {
      const r = pauseGate.pause(id, { mode: 'force', reason: 'stop' })
      if (r && typeof r.then === 'function') {
        r.then(undefined, (e) => warn(`step gate escalation pause failed for ${id}: ${String(e && e.message || e)}`))
      }
    } catch (e) {
      warn(`step gate escalation pause threw for ${id}: ${String(e && e.message || e)}`)
    }
  }

  /** 本峰内跳过该会话（用户手动继续）。 */
  function markBypass(sessionId) {
    const id = String(sessionId)
    manualPause.delete(id)
    bypass.add(id)
    emitChange(id)
  }

  function clearBypass(sessionId) {
    const id = String(sessionId)
    if (bypass.delete(id)) emitChange(id)
  }

  function clearAllBypass() {
    bypass.clear()
  }

  /** 该会话的 step 门控状态。 */
  function state(sessionId) {
    const id = String(sessionId)
    const entry = holds.get(id)
    return {
      held: entry !== undefined,
      step: entry ? entry.step : null,
      since: entry ? entry.since : null,
      bypass: bypass.has(id),
      /** 用户已请求暂停但还没到边界（按钮已应显示「继续会话」） */
      manual: manualPause.has(id) || (entry !== undefined && entry.manual === true),
    }
  }

  function heldIds() {
    return [...holds.keys()]
  }

  /**
   * `agent/pre-step` waterfall 主体：判定 → 拉门 → 释放后放行本 step。
   * @param {{agent?:object, step?:number, turn?:number, signal?:AbortSignal, messages?:unknown[]}} payload
   * @param {()=>Promise<unknown>} next
   */
  async function hold(payload, next) {
    const pass = () => (typeof next === 'function' ? next() : Promise.resolve({ kind: 'enter', messages: [] }))
    try {
      const agent = payload && payload.agent
      const id = String((agent && agent.id) ?? '')
      if (id === '') return pass()

      const cfg = readCfg()
      let verdict
      try {
        verdict = shouldPause(cfg, new Date(now()))
      } catch (e) {
        warn(`step gate peak verdict failed for ${id}: ${String(e && e.message || e)}`)
        verdict = { pause: false, reason: 'fail-open' }
      }

      let targetOk = true
      if (typeof shouldHoldSession === 'function') {
        try {
          targetOk = shouldHoldSession(cfg, id) === true
        } catch (e) {
          warn(`step gate target verdict failed for ${id}: ${String(e && e.message || e)}`)
          targetOk = false // fail-open 放行
        }
      }

      let held = false
      try {
        held = isHeldByDeferrals(id) === true
      } catch {
        held = false
      }

      let rootFlag = true
      try {
        rootFlag = isRootAgent(agent) !== false
      } catch {
        rootFlag = true
      }

      const manual = manualPause.has(id)
      const decision = decideStepHold({
        cfg,
        step: payload && payload.step,
        isRoot: rootFlag,
        pauseVerdict: verdict,
        shouldHoldSession: () => targetOk,
        isHeldByDeferrals: held,
        bypassed: bypass.has(id),
        alreadyHeld: holds.has(id),
        manual,
      })
      if (!decision.hold) return pass()

      const entry = {
        sessionId: id,
        step: Number(payload && payload.step),
        turn: Number(payload && payload.turn),
        since: now(),
        resolve: null,
        timer: null,
        signal: (payload && payload.signal) || null,
        onAbort: null,
        manual,
      }
      const promise = new Promise((resolve) => {
        entry.resolve = resolve
      })
      holds.set(id, entry)
      emitChange(id)

      // abort（agent.cancel / 冻结 / /pause / /cancel）→ 释放，让 loop 的 throwIfAborted 收尾
      if (entry.signal && typeof entry.signal.addEventListener === 'function') {
        entry.onAbort = () => release(id, 'abort')
        try {
          entry.signal.addEventListener('abort', entry.onAbort, { once: true })
        } catch {
          entry.onAbort = null
        }
        if (entry.signal.aborted === true) release(id, 'abort')
      }

      const rawTimeout = Number(cfg.stepGateTimeoutMs)
      const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_STEP_TIMEOUT_MS
      entry.timer = setTimer(() => {
        entry.timer = null
        escalate(id)
      }, timeoutMs)
      if (unrefTimers && entry.timer && typeof entry.timer.unref === 'function') entry.timer.unref()

      info(`step gate held for ${id} at step ${entry.step} (timeout ${timeoutMs}ms)`)
      await promise
      return pass()
    } catch (e) {
      // 门控自身异常 → fail-open 放行，绝不阻断回合
      warn(`step gate failed open: ${String(e && e.message || e)}`)
      return pass()
    }
  }

  return {
    hold,
    release,
    releaseAll,
    requestPause,
    escalate,
    markBypass,
    clearBypass,
    clearAllBypass,
    state,
    heldIds,
    /** 当前挂起门数（测试 / diag 用）。 */
    _count: () => holds.size,
    /** 本峰 bypass 集合（测试 / diag 用）。 */
    _bypassed: () => [...bypass],
    /** 待落地的手动暂停请求（测试 / diag 用）。 */
    _manualPending: () => [...manualPause],
  }
}

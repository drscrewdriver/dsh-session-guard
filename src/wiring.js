/**
 * dsh-session-guard — 接线层（host）：把纯逻辑模块装到 cordis 事件/服务上。
 *
 * 职责：
 * - 目标追踪：`session/event` 的 `request/header`（两版本）+ `model/selection`（0.1.2+）
 * - 请求级守卫：`agent/request` waterfall（覆盖入峰后新会话 / 中途切官方的缺口）
 * - 入峰：只暂停「最近目标为官方或 unknown」的 running 会话；**已 hold 的跳过**（互斥铁律）
 * - 退峰：先 `releaseAll` 放行挂起的请求，再按 `deferredResume` / `offPeakAutoResume` 决定续跑
 * - 精确释放：`msUntilOffPeak` 定时器在退峰瞬间放行（30s tick 只是兜底）
 * - 目标转非官方（`maybeAutoResume`）：step 门 + 回合级暂停 + **请求级 hold** 一起放行，
 *   并把放行的请求按新选择重路由（`applyTarget`）—— 否则切到本地源也只能干等退峰
 * - 输入不丢（`installClaimTracker` / `restoreUncommittedInput`）：宿主 `preStep()` 先
 *   `inbox.claim()`、`user/message` 才在请求通过后落库；hold 被拒时把这一批还回队列
 *
 * 本模块不做任何 `@deepseek-ai/*` 值导入；所有上游服务缺失都 fail-open 降级。
 */
import { createProviderDirectory } from './provider-directory.js'
import { createDeferrals } from './deferrals.js'
import { createRequestGuard } from './request-guard.js'
import { createTargets, applyTarget, UNKNOWN } from './targets.js'
import { msUntilOffPeak, shouldPause } from './time-policy.js'
import { PAUSED_REASON_PEAK } from './pause-gate.js'

/**
 * @param {object} deps
 * @param {object} deps.ctx host context
 * @param {()=>object} deps.getSettings 读实时配置
 * @param {{stopNextTurn:Function, resume:Function}} deps.gate 会话门
 * @param {ReturnType<import('./step-gate.js').createStepGate>} [deps.stepGate] step 级门控（v0.2.0）
 * @param {object} [deps.logger]
 * @param {()=>Date} [deps.clock]
 * @param {typeof setTimeout} [deps.setTimer]
 * @param {typeof clearTimeout} [deps.clearTimer]
 * @param {boolean} [deps.unrefTimers]
 * @param {(sessionId:string, date:Date)=>boolean} [deps.isFreeRunActive] 畅跑生效中的会话不拦（v0.3.0）
 */
export function createWiring({
  ctx,
  getSettings,
  gate,
  stepGate,
  logger,
  clock = () => new Date(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  unrefTimers = true,
  isFreeRunActive,
}) {
  const warn = (m) => logger?.warn?.(`[session-guard] ${m}`)
  const targets = createTargets()
  const directory = createProviderDirectory({ ctx, getSettings, warn })
  const deferrals = createDeferrals({
    maxHoldMs: () => {
      const cfg = safeCfg()
      return typeof cfg.deferredMaxHoldMs === 'number' ? cfg.deferredMaxHoldMs : 6 * 60 * 60 * 1000
    },
    unrefTimers,
  })

  function safeCfg() {
    try {
      const v = getSettings()
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  }

  let releaseTimer = null
  /** 本插件因入峰而暂停的会话（只自动恢复这些，绝不碰用户手动暂停的会话）。 */
  const pausedByPeak = new Set()
  /** 每个会话「本轮 step 已 claim、尚未落库」的输入批次（`agent/pre-step` payload.messages）。 */
  const claimedInput = new Map()

  /**
   * 记录 / 作废「已 claim、尚未落库」的输入批次。
   *
   * 为什么需要：宿主 `preStep()` 先 `inbox.claim()` 再派发 waterfall，`user/message` 要等
   * `agent/request` 通过之后才落库。任何在这个窗口里结束这一步的收场方式（我们的 hold 被
   * abort / 超限 / 顶替，或 error 模式抛错）都会让用户刚发的消息凭空消失 —— 记下这批输入，
   * 收场前还回 next-turn 队列即可（见 `restoreUncommittedInput`）。
   */
  function rememberClaimedInput(sessionId, messages) {
    const key = String(sessionId ?? '')
    if (key === '') return
    if (Array.isArray(messages) && messages.length > 0) claimedInput.set(key, messages)
    else claimedInput.delete(key) // 新 step 没有 claim 任何输入 → 旧批次作废（保守：宁可少还）
  }

  /** 该会话的输入已落库（`user/message`）或回合已结束 → 记录作废。 */
  function forgetClaimedInput(sessionId) {
    claimedInput.delete(String(sessionId ?? ''))
  }

  /**
   * 把该会话「已 claim、未落库」的输入还回 next-turn 队列（幂等：取走即删除）。
   *
   * `send(message, 'next-turn', false)`：**不唤醒 driver** —— 用户刚点了停止，不能立刻
   * 又替他起一轮（那一轮还会被高峰拦下）。消息留在队列里可见、可手动再发，留给用户决定。
   * @param {string} sessionId
   * @param {string} reason
   * @returns {number} 实际还回的条数
   */
  function restoreUncommittedInput(sessionId, reason) {
    const key = String(sessionId ?? '')
    const messages = claimedInput.get(key)
    if (messages === undefined || messages.length === 0) return 0
    claimedInput.delete(key)
    const agents = ctx && ctx.agents
    const agent = agents && typeof agents.get === 'function' ? agents.get(key) : undefined
    if (!agent || typeof agent.send !== 'function') {
      warn(`cannot restore ${messages.length} uncommitted input message(s) for ${key}: no live agent`)
      return 0
    }
    let restored = 0
    for (const message of messages) {
      try {
        agent.send(message, 'next-turn', false)
        restored += 1
      } catch (e) {
        warn(`restoring input for ${key} failed: ${String((e && e.message) || e)}`)
      }
    }
    if (restored > 0) logger?.info?.(`[session-guard] deferred request ended (${reason}) — restored ${restored} uncommitted input message(s) for ${key}`)
    return restored
  }

  /** 安排一次「退峰瞬间」的释放检查（幂等：重复调用只保留最新一个定时器）。 */
  function scheduleRelease() {
    const cfg = safeCfg()
    const ms = msUntilOffPeak(cfg, clock())
    if (!(ms > 0)) return 0
    if (releaseTimer !== null) clearTimer(releaseTimer)
    releaseTimer = setTimer(() => {
      releaseTimer = null
      try {
        const nowCfg = safeCfg()
        if (shouldPause(nowCfg, clock()).pause) {
          // 设置热改导致仍是高峰 → 重新排
          scheduleRelease()
          return
        }
        void onLeavePeak(nowCfg)
      } catch (e) {
        warn(`release timer failed: ${String(e && e.message || e)}`)
      }
    }, ms)
    if (unrefTimers && releaseTimer && typeof releaseTimer.unref === 'function') releaseTimer.unref()
    return ms
  }

  const guard = createRequestGuard({
    ctx,
    getSettings,
    directory,
    deferrals,
    gate,
    logger,
    clock,
    scheduleRelease,
    // 畅跑豁免必须接到请求级守卫上：否则「无视峰谷照常运行」在请求这一层是假的
    // （`shouldPauseSession` 里的豁免只管入峰与 step 门，管不到 agent/request）。
    isFreeRunActive,
    // 请求级守卫顺带记录真实目标：session/event 事件管道不可用时的可靠替代信号。
    recordTarget: (sessionId, provider, model) => {
      const rec = targets.set(sessionId, provider, model)
      if (rec !== null) maybeAutoResume(sessionId, rec)
    },
    // hold 被 abort / 超限 / 顶替（或 error 模式抛错）时，先把已 claim 未落库的输入还回队列
    restoreInput: restoreUncommittedInput,
  })

  /** `session/event` → 目标追踪（形状异常降级 unknown，不抛出）+ 目标转非官方时自动恢复。 */
  function onSessionEvent(session, event) {
    try {
      const id = session && session.id
      if (typeof id !== 'string' || id === '') return
      // 「已 claim、未落库」批次的收尾：落库即作废；回合结束仍有记录 = 这批输入没成为
      // 对话内容（step 门/回合级暂停被中止、hold 放行后用户立刻停止等）→ 还回队列，
      // 否则就是又一次「消息凭空消失」。
      if (event && event.type === 'turn/end') restoreUncommittedInput(id, 'turn-end-uncommitted')
      else if (event && (event.type === 'user/message' || event.type === 'turn/start')) forgetClaimedInput(id)
      const rec = targets.update(id, event)
      if (rec !== null) maybeAutoResume(id, rec)
    } catch (e) {
      warn(`target tracking failed: ${String(e && e.message || e)}`)
    }
  }

  /**
   * 高峰期目标从官方变为非官方 → 恢复本插件因入峰而暂停的会话（spec 需求 5）。
   * v0.2.0：先释放 step 门控（幂等，无门则 no-op）；turn 级只对 `pausedByPeak` 里的
   * 会话生效（不碰用户手动暂停的）；受 `deferredResume` 约束；
   * 用 queueMicrotask 跳出当前事件派发，避免 resume→followup→事件 的重入。
   *
   * v3.1.2：**请求级 hold 也必须一起放行**，否则「切到本地源」只解开 step 门/回合暂停，
   * 而被挂起的那个请求永远等不到退峰（用户实测卡死 50s 后只能点停止）。
   * 放行时用 `applyTarget` 按新选择重路由：不改路由的话，这次请求会照旧打到官方源
   * （高峰 2 倍单价），正是本插件要避免的事。
   */
  function maybeAutoResume(sessionId, rec) {
    const cfg = safeCfg()
    if (cfg.providerGuard !== true || cfg.deferredResume === false) return { releasedHold: false, resumed: false }
    if (!shouldPause(cfg, clock()).pause) return { releasedHold: false, resumed: false }
    // 判定与请求级守卫同口径：带上 model（名字带 deepseek 的模型在哪条路由上都算官方，
    // 因此「切到本地源 + deepseek 模型」不会被误放行）。
    const cls = directory.classify(rec.provider, rec.model)
    if (cls.official) return { releasedHold: false, resumed: false }
    // 请求级 hold：放行 + 重路由到这次选择（幂等，无 hold 时 no-op）
    const releasedHold = deferrals.release(sessionId, 'non-official', (config) => applyTarget(config, rec))
    if (releasedHold) {
      logger?.info?.(
        `[session-guard] target switched to non-official "${rec.provider}/${rec.model}" (matchedBy=${cls.matchedBy}) — released held request of ${sessionId} (rerouted)`,
      )
    }
    // step 门控：目标转非官方 → 放行被挂起的 step（step gate 自身按目标判定，无需 pausedByPeak）
    if (stepGate) {
      const r = stepGate.release(sessionId, 'non-official')
      if (r && r.released === true) {
        logger?.info?.(`[session-guard] target switched to non-official "${rec.provider}" (matchedBy=${cls.matchedBy}) — releasing step gate for ${sessionId}`)
      }
    }
    if (!pausedByPeak.has(sessionId)) return { releasedHold, resumed: false }
    pausedByPeak.delete(sessionId)
    logger?.info?.(`[session-guard] target switched to non-official "${rec.provider}" (matchedBy=${cls.matchedBy}) — auto-resuming ${sessionId}`)
    queueMicrotask(() => {
      Promise.resolve(gate.resume(sessionId, { choice: 'rerun', auto: true })).catch((e) => {
        warn(`auto-resume failed for ${sessionId}: ${String(e && e.message || e)}`)
      })
    })
    return { releasedHold, resumed: true }
  }

  /** 该会话此刻是否处于畅跑豁免中（唯一的畅跑判定入口）。 */
  function freeRunAllows(sessionId) {
    if (typeof isFreeRunActive !== 'function') return false
    try {
      return isFreeRunActive(sessionId, clock()) === true
    } catch {
      return false // 判定异常 → 退回常规峰谷判定（fail-closed 到既有行为）
    }
  }

  /** 该会话是否应因高峰被暂停（官方 / unknown 才停；已知非官方、畅跑生效中放行）。 */
  function shouldPauseSession(cfg, sessionId) {
    // 畅跑（单会话限时豁免）优先级最高：窗口内一律不拦。
    if (freeRunAllows(sessionId)) return false
    if (cfg.providerGuard !== true) return true // 退回现有纯时间判定：全部暂停
    const rec = targets.get(sessionId)
    if (rec === null || rec.provider === UNKNOWN) return true // 未知保守处理
    return directory.classify(rec.provider, rec.model).official
  }

  /** 入峰：暂停 running 会话（跳过已 hold / 目标非官方 / 畅跑生效中）。 */
  async function onEnterPeak(cfg) {
    const agents = ctx && ctx.agents
    if (!agents) return { paused: [], skipped: [] }
    const roots = typeof agents.roots === 'function' ? agents.roots() : typeof agents.list === 'function' ? agents.list() : []
    // Q1-A：step 级门控开启时，入峰不再 turn 级暂停——会话跑到下一个 pre-step 边界自动拉门。
    const stepLevel = cfg.stepLevelPause === true && !!stepGate
    const paused = []
    const skipped = []
    for (const agent of Array.isArray(roots) ? roots : []) {
      const id = String((agent && agent.id) ?? '')
      if (id === '' || !agent || agent.status !== 'running') continue
      // 畅跑生效中：单独报原因，便于排查「为什么这个会话没被拦」。
      if (freeRunAllows(id)) {
        skipped.push({ sessionId: id, why: 'free-run' })
        continue
      }
      // 互斥铁律：请求已被 hold 的会话，请求级挂起本身就是暂停，绝不再调 pauseGate
      if (deferrals.has(id)) {
        skipped.push({ sessionId: id, why: 'held' })
        continue
      }
      if (!shouldPauseSession(cfg, id)) {
        skipped.push({ sessionId: id, why: 'non-official', provider: targets.providerOf(id) })
        continue
      }
      if (stepLevel) {
        // 新一轮高峰：清掉上一轮的 bypass，让 step 门重新生效。
        stepGate.clearBypass(id)
        paused.push({ sessionId: id, via: 'stepGate', ok: true })
        continue
      }
      try {
        const r = await gate.stopNextTurn(id, { mode: cfg.pauseMode, reason: cfg.pauseReason, pausedReason: PAUSED_REASON_PEAK })
        if (!r || r.ok !== false) pausedByPeak.add(id)
        paused.push({ sessionId: id, via: r && r.via, ok: r && r.ok })
      } catch (e) {
        warn(`stopNextTurn failed for ${id}: ${String(e && e.message || e)}`)
      }
    }
    logger?.info?.(`[session-guard] peak entered — ${stepLevel ? 'step-level gate armed for' : 'paused'} ${paused.length} session(s): ${JSON.stringify(paused)}; skipped ${JSON.stringify(skipped)}`)
    return { paused, skipped }
  }

  /** 给一条延后记录发续跑消息（与 retry.js 同构：plugin-source 消息，零运行时依赖）。 */
  function sendResume(sessionId, text) {
    const agents = ctx && ctx.agents
    const agent = agents && typeof agents.get === 'function' ? agents.get(sessionId) : undefined
    if (!agent || agent.status !== 'idle') return false
    try {
      agent.followup({
        id: `session-guard-deferred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        content: [{ type: 'text', text }],
        source: { kind: 'plugin', plugin: 'session-guard', form: 'notice' },
      })
      return true
    } catch (e) {
      warn(`deferred resume send failed for ${sessionId}: ${String(e && e.message || e)}`)
      return false
    }
  }

  /** 退峰：先释放 step 门（回合原地续跑），再放行挂起的请求、恢复暂停的会话。 */
  async function onLeavePeak(cfg) {
    if (releaseTimer !== null) {
      clearTimer(releaseTimer)
      releaseTimer = null
    }
    // 0) step 级门控：先放行被挂起的 step —— 回合本来就还开着，无需 followup。
    if (stepGate) {
      const releasedSteps = stepGate.releaseAll('off-peak')
      stepGate.clearAllBypass()
      if (releasedSteps.length > 0) logger?.info?.(`[session-guard] peak left — released ${releasedSteps.length} step gate(s): ${JSON.stringify(releasedSteps)}`)
    }
    // 1) 先取延后记录快照（releaseAll 会清空），再放行全部挂起。
    const deferredSnapshot = deferrals.deferredList()
    const { released } = deferrals.releaseAll('off-peak')

    // 2) error 模式的续跑：deferredResume=false 时不自动继续（用户手动 /resume 或再发消息）
    const resumed = []
    if (cfg.deferredResume !== false) {
      const text = typeof cfg.deferredResumeText === 'string' && cfg.deferredResumeText !== ''
        ? cfg.deferredResumeText
        : '继续（高峰已过，自动继续）'
      for (const rec of deferredSnapshot) {
        if (sendResume(rec.sessionId, text)) resumed.push(rec.sessionId)
      }
    } else {
      logger?.info?.('[session-guard] deferredResume disabled — deferred sessions stay parked')
    }

    // 3) 低谷自动恢复：关掉则保持暂停，需手动恢复。
    if (cfg.offPeakAutoResume === false) {
      logger?.info?.(`[session-guard] off-peak auto-resume disabled — released ${released.length} held request(s), sessions stay paused`)
      return { released, resumed }
    }
    const agents = ctx && ctx.agents
    const roots = agents ? (typeof agents.roots === 'function' ? agents.roots() : typeof agents.list === 'function' ? agents.list() : []) : []
    for (const agent of Array.isArray(roots) ? roots : []) {
      const id = String((agent && agent.id) ?? '')
      if (id === '') continue
      try {
        // auto:true → 只放行峰谷策略暂停的会话，用户手动 /pause 的不动（spec §五）。
        await gate.resume(id, { choice: 'rerun', auto: true })
      } catch (e) {
        warn(`resume failed for ${id}: ${String(e && e.message || e)}`)
      }
    }
    pausedByPeak.clear()
    logger?.info?.(`[session-guard] peak left — released ${released.length} held request(s), resumed ${resumed.length} deferred session(s)`)
    return { released, resumed }
  }

  /** 安装请求级守卫（返回 disposer，交给 ctx.effect）。 */
  function installGuard() {
    return guard.install()
  }

  /**
   * 安装 step 级门控（`agent/pre-step` waterfall，v0.2.0）。
   * disposer 释放全部挂起门，避免卸载后 Promise 悬挂。
   */
  function installStepGuard() {
    if (!stepGate || !ctx || typeof ctx.on !== 'function') return () => {}
    const off = ctx.on('agent/pre-step', (payload, next) => stepGate.hold(payload, next))
    return () => {
      if (typeof off === 'function') off()
      stepGate.releaseAll('disposed')
    }
  }

  /**
   * 安装「已 claim、未落库」输入批次追踪（`agent/pre-step` waterfall）。
   *
   * 只记录、不拦：`payload.messages` 就是这一步 `inbox.claim()` 拿走的那批输入。
   * `prepend` → 永远排在 step 门（以及宿主任何监听）之前：门挂起时我们也要先拿到批次，
   * 否则门被取消时同样丢输入。
   */
  function installClaimTracker() {
    if (!ctx || typeof ctx.on !== 'function') return () => {}
    const off = ctx.on(
      'agent/pre-step',
      (payload, next) => {
        try {
          rememberClaimedInput(payload && payload.agent && payload.agent.id, payload && payload.messages)
        } catch {
          /* 记录失败绝不影响这一步 */
        }
        return next()
      },
      { prepend: true },
    )
    return () => {
      if (typeof off === 'function') off()
      claimedInput.clear()
    }
  }

  /** 插件卸载：清定时器 + 拒绝全部挂起（不泄漏 promise）。 */
  function dispose() {
    if (releaseTimer !== null) {
      clearTimer(releaseTimer)
      releaseTimer = null
    }
    pausedByPeak.clear()
    if (stepGate) {
      stepGate.releaseAll('disposed')
      stepGate.clearAllBypass()
    }
    deferrals.rejectAll('disposed')
    claimedInput.clear()
  }

  return {
    targets,
    directory,
    deferrals,
    guard,
    onSessionEvent,
    onEnterPeak,
    onLeavePeak,
    scheduleRelease,
    shouldPauseSession,
    installGuard,
    installClaimTracker,
    restoreUncommittedInput,
    installStepGuard,
    dispose,
  }
}

/**
 * dsh-session-guard — 接线层（host）：把纯逻辑模块装到 cordis 事件/服务上。
 *
 * 职责：
 * - 目标追踪：`session/event` 的 `request/header`（两版本）+ `model/selection`（0.1.2+）
 * - 请求级守卫：`agent/request` waterfall（覆盖入峰后新会话 / 中途切官方的缺口）
 * - 入峰：只暂停「最近目标为官方或 unknown」的 running 会话；**已 hold 的跳过**（互斥铁律）
 * - 退峰：先 `releaseAll` 放行挂起的请求，再按 `deferredResume` / `offPeakAutoResume` 决定续跑
 * - 精确释放：`msUntilOffPeak` 定时器在退峰瞬间放行（30s tick 只是兜底）
 *
 * 本模块不做任何 `@deepseek-ai/*` 值导入；所有上游服务缺失都 fail-open 降级。
 */
import { createProviderDirectory } from './provider-directory.js'
import { createDeferrals } from './deferrals.js'
import { createRequestGuard } from './request-guard.js'
import { createTargets, UNKNOWN } from './targets.js'
import { msUntilOffPeak, shouldPause } from './time.js'

/**
 * @param {object} deps
 * @param {object} deps.ctx host context
 * @param {()=>object} deps.getSettings 读实时配置
 * @param {{stopNextTurn:Function, resume:Function}} deps.gate 会话门
 * @param {object} [deps.logger]
 * @param {()=>Date} [deps.clock]
 * @param {typeof setTimeout} [deps.setTimer]
 * @param {typeof clearTimeout} [deps.clearTimer]
 * @param {boolean} [deps.unrefTimers]
 */
export function createWiring({
  ctx,
  getSettings,
  gate,
  logger,
  clock = () => new Date(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  unrefTimers = true,
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
  })

  /** `session/event` → 目标追踪（形状异常降级 unknown，不抛出）+ 目标转非官方时自动恢复。 */
  function onSessionEvent(session, event) {
    try {
      const id = session && session.id
      if (typeof id !== 'string' || id === '') return
      const rec = targets.update(id, event)
      if (rec !== null) maybeAutoResume(id, rec)
    } catch (e) {
      warn(`target tracking failed: ${String(e && e.message || e)}`)
    }
  }

  /**
   * 高峰期目标从官方变为非官方 → 恢复本插件因入峰而暂停的会话（spec 需求 5）。
   * 只对 `pausedByPeak` 里的会话生效（不碰用户手动暂停的）；受 `deferredResume` 约束；
   * 用 queueMicrotask 跳出当前事件派发，避免 resume→followup→事件 的重入。
   */
  function maybeAutoResume(sessionId, rec) {
    if (!pausedByPeak.has(sessionId)) return
    const cfg = safeCfg()
    if (cfg.providerGuard !== true || cfg.deferredResume === false) return
    if (!shouldPause(cfg, clock()).pause) return
    const cls = directory.classify(rec.provider)
    if (cls.official) return
    pausedByPeak.delete(sessionId)
    logger?.info?.(`[session-guard] target switched to non-official "${rec.provider}" (matchedBy=${cls.matchedBy}) — auto-resuming ${sessionId}`)
    queueMicrotask(() => {
      Promise.resolve(gate.resume(sessionId, { choice: 'rerun' })).catch((e) => {
        warn(`auto-resume failed for ${sessionId}: ${String(e && e.message || e)}`)
      })
    })
  }

  /** 该会话是否应因高峰被暂停（官方 / unknown 才停；已知非官方放行）。 */
  function shouldPauseSession(cfg, sessionId) {
    if (cfg.providerGuard !== true) return true // 退回现有纯时间判定：全部暂停
    const provider = targets.providerOf(sessionId)
    if (provider === UNKNOWN) return true // 未知保守处理
    const cls = directory.classify(provider)
    return cls.official
  }

  /** 入峰：暂停 running 会话（跳过已 hold / 已暂停 / 目标非官方）。 */
  async function onEnterPeak(cfg) {
    const agents = ctx && ctx.agents
    if (!agents) return { paused: [], skipped: [] }
    const roots = typeof agents.roots === 'function' ? agents.roots() : typeof agents.list === 'function' ? agents.list() : []
    const paused = []
    const skipped = []
    for (const agent of Array.isArray(roots) ? roots : []) {
      const id = String((agent && agent.id) ?? '')
      if (id === '' || !agent || agent.status !== 'running') continue
      // 互斥铁律：请求已被 hold 的会话，请求级挂起本身就是暂停，绝不再调 pauseGate
      if (deferrals.has(id)) {
        skipped.push({ sessionId: id, why: 'held' })
        continue
      }
      if (!shouldPauseSession(cfg, id)) {
        skipped.push({ sessionId: id, why: 'non-official', provider: targets.providerOf(id) })
        continue
      }
      try {
        const r = await gate.stopNextTurn(id, { mode: cfg.pauseMode, reason: cfg.pauseReason })
        if (!r || r.ok !== false) pausedByPeak.add(id)
        paused.push({ sessionId: id, via: r && r.via, ok: r && r.ok })
      } catch (e) {
        warn(`stopNextTurn failed for ${id}: ${String(e && e.message || e)}`)
      }
    }
    logger?.info?.(`[session-guard] peak entered — paused ${paused.length} session(s): ${JSON.stringify(paused)}; skipped ${JSON.stringify(skipped)}`)
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

  /** 退峰：先放行挂起的请求，再决定 error 模式续跑 / 恢复暂停的会话。 */
  async function onLeavePeak(cfg) {
    if (releaseTimer !== null) {
      clearTimer(releaseTimer)
      releaseTimer = null
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
        await gate.resume(id, { choice: 'rerun' })
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

  /** 插件卸载：清定时器 + 拒绝全部挂起（不泄漏 promise）。 */
  function dispose() {
    if (releaseTimer !== null) {
      clearTimer(releaseTimer)
      releaseTimer = null
    }
    pausedByPeak.clear()
    deferrals.rejectAll('disposed')
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
    dispose,
  }
}

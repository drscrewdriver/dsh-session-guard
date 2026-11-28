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
import type { TimeSettings } from './time.js'
import type { StepGate, StepPayload } from './step-gate.js'

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
 */
/** createWiring 依赖注入面。 */
export interface WiringDeps {
  ctx: {
    get?(name: string): unknown
    on?(event: string, fn: (a: unknown, b: unknown) => unknown): () => void
    agents?: { get?(id: string): unknown; roots?(): unknown[]; list?(): unknown[] }
    logger?: { warn?: (m: string) => void; info?: (m: string) => void }
  }
  getSettings?: () => unknown
  gate: {
    stopNextTurn?(id: string, opts?: Record<string, unknown>): unknown
    resume(id: string, opts?: Record<string, unknown>): unknown
    lockQueue?(id: string, reason: string): unknown
  }
  stepGate?: Partial<StepGate>
  logger?: { warn?: (m: string) => void; info?: (m: string) => void }
  clock?: () => Date
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  unrefTimers?: boolean
}

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
}: WiringDeps) {
  const warn = (m: string): void => logger?.warn?.(`[session-guard] ${m}`)
  const targets = createTargets()
  const directory = createProviderDirectory({ ctx, getSettings, warn })
  const deferrals = createDeferrals({
    maxHoldMs: () => {
      const cfg = safeCfg()
      return typeof cfg.deferredMaxHoldMs === 'number' ? cfg.deferredMaxHoldMs : 6 * 60 * 60 * 1000
    },
    unrefTimers,
  })

  /** 配置投影成 time 判定需要的形状（缺字段走 fail-open 默认）。 */
  function asTimeSettings(cfg: Record<string, unknown>): TimeSettings {
    return cfg as unknown as TimeSettings
  }

  function safeCfg(): Record<string, unknown> {
    try {
      const v = typeof getSettings === 'function' ? getSettings() : undefined
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  let releaseTimer: unknown = null
  /** 本插件因入峰而暂停的会话（只自动恢复这些，绝不碰用户手动暂停的会话）。 */
  const pausedByPeak = new Set<string>()

  /** 安排一次「退峰瞬间」的释放检查（幂等：重复调用只保留最新一个定时器）。 */
  function scheduleRelease(): number {
    const cfg = safeCfg()
    const ms = msUntilOffPeak(asTimeSettings(cfg), clock())
    if (!(ms > 0)) return 0
    if (releaseTimer !== null) clearTimer?.(releaseTimer)
    releaseTimer = setTimer(() => {
      releaseTimer = null
      try {
        const nowCfg = safeCfg()
        if (shouldPause(asTimeSettings(nowCfg), clock()).pause) {
          // 设置热改导致仍是高峰 → 重新排
          scheduleRelease()
          return
        }
        void onLeavePeak(nowCfg)
      } catch (e) {
        warn(`release timer failed: ${String((e as Error)?.message || e)}`)
      }
    }, ms)
    const handle = releaseTimer as { unref?: () => void } | null
    if (unrefTimers && handle && typeof handle.unref === 'function') handle.unref()
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
    // v4.2.11（issue #3）：请求级 hold 认 step 门上的「本峰 bypass」。
    // step 门与请求门共用同一个 bypass 集合，用户手动「继续」对两条路径同时生效。
    isBypassed: (id: string) => (stepGate?.state ? stepGate.state(id).bypass === true : false),
  })

  /** `session/event` → 目标追踪（形状异常降级 unknown，不抛出）+ 目标转非官方时自动恢复。 */
  function onSessionEvent(session: { id?: unknown } | undefined, event: unknown): void {
    try {
      const id = session?.id
      if (typeof id !== 'string' || id === '') return
      const rec = targets.update(id, event)
      if (rec !== null) maybeAutoResume(id, rec)
    } catch (e) {
      warn(`target tracking failed: ${String((e as Error)?.message || e)}`)
    }
  }

  /**
   * 高峰期目标从官方变为非官方 → 恢复本插件因入峰而暂停的会话（spec 需求 5）。
   * v0.2.0：先释放 step 门控（幂等，无门则 no-op）；turn 级只对 `pausedByPeak` 里的
   * 会话生效（不碰用户手动暂停的）；受 `deferredResume` 约束；
   * 用 queueMicrotask 跳出当前事件派发，避免 resume→followup→事件 的重入。
   */
  function maybeAutoResume(sessionId: string, rec: { provider: string }): void {
    const cfg = safeCfg()
    if (cfg.providerGuard !== true || cfg.deferredResume === false) return
    if (!shouldPause(asTimeSettings(cfg), clock()).pause) return
    const cls = directory.classify(rec.provider)
    if (cls.official) return
    // step 门控：目标转非官方 → 放行被挂起的 step（step gate 自身按目标判定，无需 pausedByPeak）
    if (stepGate) {
      const r = stepGate.release?.(sessionId, 'non-official')
      if (r && r.released === true) {
        logger?.info?.(`[session-guard] target switched to non-official "${rec.provider}" (matchedBy=${cls.matchedBy}) — releasing step gate for ${sessionId}`)
      }
    }
    if (!pausedByPeak.has(sessionId)) return
    pausedByPeak.delete(sessionId)
    logger?.info?.(`[session-guard] target switched to non-official "${rec.provider}" (matchedBy=${cls.matchedBy}) — auto-resuming ${sessionId}`)
    queueMicrotask(() => {
      Promise.resolve(gate.resume(sessionId, { choice: 'rerun' })).catch((e) => {
        warn(`auto-resume failed for ${sessionId}: ${String((e as Error)?.message || e)}`)
      })
    })
  }

  /** 该会话是否应因高峰被暂停（官方 / unknown 才停；已知非官方放行）。 */
  function shouldPauseSession(cfg: Record<string, unknown>, sessionId: string): boolean {
    if (cfg.providerGuard !== true) return true // 退回现有纯时间判定：全部暂停
    const provider = targets.providerOf(sessionId)
    if (provider === UNKNOWN) return true // 未知保守处理
    const cls = directory.classify(provider)
    return cls.official
  }

  /** 入峰：暂停 running 会话（跳过已 hold / 已暂停 / 目标非官方）。 */
  async function onEnterPeak(cfg: Record<string, unknown>): Promise<{ paused: unknown[]; skipped: unknown[] }> {
    const agents = ctx && ctx.agents
    if (!agents) return { paused: [], skipped: [] }
    const roots = typeof agents.roots === 'function' ? agents.roots() : typeof agents.list === 'function' ? agents.list() : []
    // Q1-A：step 级门控开启时，入峰不再 turn 级暂停——会话跑到下一个 pre-step 边界自动拉门。
    const stepLevel = cfg.stepLevelPause === true && !!stepGate
    const paused = []
    const skipped = []
    for (const agent of Array.isArray(roots) ? roots : []) {
      const a = agent as { id?: unknown; status?: unknown } | null | undefined
      const id = String(a?.id ?? '')
      if (id === '' || !a || a.status !== 'running') continue
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
        stepGate?.clearBypass?.(id)
        paused.push({ sessionId: id, via: 'stepGate', ok: true })
        continue
      }
      try {
        const r = (await gate.stopNextTurn?.(id, { mode: cfg.pauseMode, reason: cfg.pauseReason })) as
          | { ok?: boolean; via?: string }
          | undefined
        if (!r || r.ok !== false) pausedByPeak.add(id)
        paused.push({ sessionId: id, via: r?.via, ok: r?.ok })
      } catch (e) {
        warn(`stopNextTurn failed for ${id}: ${String((e as Error)?.message || e)}`)
      }
    }
    logger?.info?.(`[session-guard] peak entered — ${stepLevel ? 'step-level gate armed for' : 'paused'} ${paused.length} session(s): ${JSON.stringify(paused)}; skipped ${JSON.stringify(skipped)}`)
    return { paused, skipped }
  }

  /** 给一条延后记录发续跑消息（与 retry.js 同构：plugin-source 消息，零运行时依赖）。 */
  function sendResume(sessionId: string, text: string): boolean {
    const agents = ctx && ctx.agents
    const agent = (agents && typeof agents.get === 'function' ? agents.get(sessionId) : undefined) as
      | { status?: unknown; followup?: (msg: unknown) => void }
      | undefined
    if (!agent || agent.status !== 'idle') return false
    try {
      agent.followup?.({
        id: `session-guard-deferred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        content: [{ type: 'text', text }],
        source: { kind: 'plugin:session-guard', form: 'notice' },
      })
      return true
    } catch (e) {
      warn(`deferred resume send failed for ${sessionId}: ${String((e as Error)?.message || e)}`)
      return false
    }
  }

  /** 退峰：先释放 step 门（回合原地续跑），再放行挂起的请求、恢复暂停的会话。 */
  async function onLeavePeak(cfg: Record<string, unknown>): Promise<{ released: unknown[]; resumed: unknown[] }> {
    if (releaseTimer !== null) {
      clearTimer?.(releaseTimer)
      releaseTimer = null
    }
    // 0) step 级门控：先放行被挂起的 step —— 回合本来就还开着，无需 followup。
    if (stepGate) {
      const releasedSteps = stepGate.releaseAll?.('off-peak') ?? []
      stepGate.clearAllBypass?.()
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
      const id = String((agent as { id?: unknown } | null | undefined)?.id ?? '')
      if (id === '') continue
      try {
        await gate.resume(id, { choice: 'rerun' })
      } catch (e) {
        warn(`resume failed for ${id}: ${String((e as Error)?.message || e)}`)
      }
    }
    pausedByPeak.clear()
    logger?.info?.(`[session-guard] peak left — released ${released.length} held request(s), resumed ${resumed.length} deferred session(s)`)
    return { released, resumed }
  }

  /** 安装请求级守卫（返回 disposer，交给 ctx.effect）。 */
  function installGuard(): () => void {
    return guard.install()
  }

  /**
   * 安装 step 级门控（`agent/pre-step` waterfall，v0.2.0）。
   * disposer 释放全部挂起门，避免卸载后 Promise 悬挂。
   */
  function installStepGuard(): () => void {
    if (!stepGate || !ctx || typeof ctx.on !== 'function') return () => {}
    const off = ctx.on('agent/pre-step', (payload, next) =>
      stepGate?.hold?.(payload as StepPayload, next as () => Promise<unknown>) ?? (next as () => Promise<unknown>)())
    return () => {
      if (typeof off === 'function') off()
      stepGate.releaseAll?.('disposed')
    }
  }

  /** 插件卸载：清定时器 + 拒绝全部挂起（不泄漏 promise）。 */
  function dispose(): void {
    if (releaseTimer !== null) {
      clearTimer?.(releaseTimer)
      releaseTimer = null
    }
    pausedByPeak.clear()
    if (stepGate) {
      stepGate.releaseAll?.('disposed')
      stepGate.clearAllBypass?.()
    }
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
    installStepGuard,
    dispose,
  }
}

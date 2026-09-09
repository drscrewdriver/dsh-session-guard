/**
 * dsh-session-guard — 请求级守卫（`agent/request` waterfall，host）。
 *
 * 为什么需要它（findings F6）：现有 tick 只在 `NORMAL → PAUSED_PEAK` 跳变时处理
 * `status === 'running'` 的会话，入峰后新启动的会话、以及入峰后切到官方源的会话
 * 都漏网。请求级兜底覆盖这两个缺口。
 *
 * 判定顺序（**必须先 await next()**，见 findings F2：`installModelSelection` 会在
 * waterfall 内把 provider/model 覆盖成用户在 UI 选的值）：
 *   1. `providerGuard !== true` → 原样放行（退回现有纯时间判定）
 *   2. 非 root agent 且 `guardSubagents === false` → 放行
 *   3. 非高峰（含周末 / disabled）→ 放行
 *   4. 目标 provider 非官方 → 放行（本地/第三方源照常跑）
 *   5. 高峰 + 官方 → 拦截：hold（默认，挂起不报错）或 error（抛 PeakDeferredError）
 *
 * **互斥铁律**（findings F7）：hold 路径**严禁**调用 `gate.stopNextTurn` /
 * `pauseGate.pause`——暂停要等安全边界，而请求被挂住后永远到不了安全边界，双方互等。
 *
 * 任何判定异常都 fail-open 放行（绝不因为本插件让正常请求失败）。
 */
import { shouldPause } from './time.js'
import { PeakDeferredError } from './deferrals.js'

/**
 * 默认 root 判定：优先 `agents.roots()`，查不到再看 `agents.list()`；
 * 两边都查不到 → 视为 root（fail-open 到「纳入守卫」）。
 * @param {object} ctx
 * @returns {(agent:object)=>boolean}
 */
export function makeIsRoot(ctx) {
  return function isRoot(agent) {
    try {
      const agents = ctx && ctx.agents
      const id = String((agent && agent.id) ?? '')
      if (!agents || id === '') return true
      const roots = typeof agents.roots === 'function' ? agents.roots() : []
      if (Array.isArray(roots) && roots.some((a) => String((a && a.id) ?? '') === id)) return true
      const all = typeof agents.list === 'function' ? agents.list() : []
      if (Array.isArray(all) && all.some((a) => String((a && a.id) ?? '') === id)) return false
      return true
    } catch {
      return true
    }
  }
}

/**
 * @param {object} deps
 * @param {object} deps.ctx host context（需 `on` / 可选 `agents`）
 * @param {()=>object} deps.getSettings 读实时配置
 * @param {{classify:(id:string)=>{official:boolean,matchedBy:string}}} deps.directory 端点目录
 * @param {ReturnType<import('./deferrals.js').createDeferrals>} deps.deferrals 延后登记表
 * @param {{stopNextTurn:(id:string,opts?:object)=>unknown}} [deps.gate] 会话门（**仅 error 模式**使用）
 * @param {object} [deps.logger]
 * @param {()=>Date} [deps.clock]
 * @param {(agent:object)=>boolean} [deps.isRoot]
 * @param {(ms:number)=>void} [deps.scheduleRelease] 挂起后请求一次退峰释放检查
 * @returns {{install:()=>()=>void, handle:(payload:object, next:Function)=>Promise<unknown>, stats:()=>object}}
 */
export function createRequestGuard({
  ctx,
  getSettings,
  directory,
  deferrals,
  gate,
  logger,
  clock = () => new Date(),
  isRoot,
  scheduleRelease,
}) {
  const rootCheck = isRoot ?? makeIsRoot(ctx)
  const counters = { pass: 0, hold: 0, error: 0, skippedSubagent: 0, failOpen: 0 }

  function readCfg() {
    try {
      const v = getSettings()
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  }

  /** 同步决策：pass / error / hold。 */
  function decide(payload, config) {
    const cfg = readCfg()
    if (cfg.providerGuard !== true) return { action: 'pass', why: 'provider-guard-off' }

    const agent = payload && payload.agent
    const sessionId = String((agent && agent.id) ?? '')
    if (sessionId === '') {
      logger?.warn?.('[session-guard] agent/request without agent.id — provider guard skipped')
      counters.failOpen += 1
      return { action: 'pass', why: 'no-session-id' }
    }
    if (cfg.guardSubagents === false && !rootCheck(agent)) {
      counters.skippedSubagent += 1
      return { action: 'pass', why: 'subagent' }
    }

    const verdict = shouldPause(cfg, clock())
    if (!verdict.pause) return { action: 'pass', why: verdict.reason }

    const cls = directory.classify(config && config.provider)
    if (!cls.official) {
      logger?.info?.(`[session-guard] peak but target "${String(config && config.provider)}" is not official (matchedBy=${cls.matchedBy}) — pass`)
      return { action: 'pass', why: 'not-official' }
    }

    const info = {
      provider: (config && config.provider) ?? null,
      model: (config && config.model) ?? null,
      config,
      matchedBy: cls.matchedBy,
    }
    const mode = cfg.deferredMode === 'error' ? 'error' : 'hold'
    const resume = cfg.deferredResume !== false

    // 退峰不自动续跑：hold 也无法自动放行 → 直接转 error（避免无限挂起）
    if (mode === 'hold' && resume) {
      counters.hold += 1
      logger?.info?.(`[session-guard] peak + official "${info.provider}/${info.model}" — holding request of ${sessionId} (matchedBy=${cls.matchedBy})`)
      const promise = deferrals.hold(sessionId, info, payload && payload.signal)
      if (scheduleRelease) {
        try {
          scheduleRelease()
        } catch (e) {
          logger?.warn?.(`[session-guard] release scheduling failed: ${String(e && e.message || e)}`)
        }
      }
      return { action: 'hold', promise }
    }

    // error 模式（或 deferredResume=false）：记延后 + 抛可识别的错误
    counters.error += 1
    deferrals.remember(sessionId, info)
    // 互斥铁律只约束 hold 路径；error 路径回合立刻结束，调门控是安全的。
    if (gate && typeof gate.stopNextTurn === 'function') {
      try {
        const r = gate.stopNextTurn(sessionId, { mode: cfg.pauseMode, reason: cfg.pauseReason })
        if (r && typeof r.then === 'function') {
          r.then(undefined, (e) => logger?.warn?.(`[session-guard] stopNextTurn failed: ${String(e && e.message || e)}`))
        }
      } catch (e) {
        logger?.warn?.(`[session-guard] stopNextTurn threw: ${String(e && e.message || e)}`)
      }
    }
    logger?.info?.(`[session-guard] peak + official "${info.provider}/${info.model}" — deferring ${sessionId} with error (mode=${mode}, resume=${resume})`)
    const detail = resume
      ? `peak hours: ${info.provider}/${info.model} deferred to off-peak`
      : `peak hours: ${info.provider}/${info.model} deferred; auto-resume disabled`
    return { action: 'error', error: new PeakDeferredError(detail, { sessionId, ...info, config: undefined }) }
  }

  /** 一次 waterfall 调用。 */
  async function handle(payload, next) {
    const config = await next()
    let decision
    try {
      decision = decide(payload, config)
    } catch (e) {
      // 判定异常 → fail-open 放行；但自己的延后错误必须抛出
      if (e && e.code === 'PEAK_DEFERRED') throw e
      counters.failOpen += 1
      logger?.warn?.(`[session-guard] request guard failed open: ${String(e && e.message || e)}`)
      return config
    }
    if (decision.action === 'pass') {
      counters.pass += 1
      return config
    }
    if (decision.action === 'error') throw decision.error
    // hold：挂起 promise 的 resolve 值就是原 config（字段未被篡改）
    return decision.promise
  }

  /** 注册 waterfall 监听；返回 disposer（同时释放全部挂起，避免 promise 泄漏）。 */
  function install() {
    if (!ctx || typeof ctx.on !== 'function') return () => {}
    const off = ctx.on('agent/request', (payload, next) => handle(payload, next))
    return () => {
      if (typeof off === 'function') off()
      try {
        deferrals.rejectAll('guard-disposed')
      } catch {
        /* 释放失败不阻断卸载 */
      }
    }
  }

  return { install, handle, decide, stats: () => ({ ...counters }) }
}

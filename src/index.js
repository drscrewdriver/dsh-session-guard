/**
 * dsh-session-guard — host half。
 *
 * 高峰自动会话门：
 * - 每 30s tick 判定状态（NORMAL ↔ PAUSED_PEAK），纯状态机见 scheduler.js。
 * - 入峰（且非周末）：对所有 running root session 调 gate.stopNextTurn
 *   （有 taskControl → 会话门 safe+wait；无 → 回退锁等待队列）。
 * - 退峰/周末：gate.resume 全部。
 * - `ctx.provide('sessionGuard')` 冗余端口，input-traffic 冻结按钮透传接入。
 * - 设置：设置 → 插件 → session-guard 子板块，简单开关（enabled / weekendMode / queueFallback）。
 *   schemastery 为常规 dependency，设置经 `ctx.inject(['settings'])` 本地接口注册（src/settings.js，
 *   对齐 dsh-thinking-levels；不 value-import dsh-settings）；设置服务缺失时 fail-open 用默认配置照常运行。
 */
import { computeState, transition } from './scheduler.js'
import { wallClock, isWeekend, isInPeak } from './time.js'
import { createStore } from './store.js'
import { createGate } from './gate.js'
import { createBridge } from './bridge.js'
import { createRetry } from './retry.js'
import { createPauseStore } from './pause-store.js'
import { createPauseGate } from './pause-gate.js'
import { detectTaskControl } from './detect.js'
import { NS, DEFAULT_SETTINGS, SettingsSchema, registerSettings } from './settings.js'

export const name = 'session-guard'
export const inject = ['agents', 'webServer', 'settings', 'timer', 'commands', 'goals']

export { NS, DEFAULT_SETTINGS }

export function apply(ctx) {
  const store = createStore()
  let lastState = null

  /** 读实时设置（settings 服务不可用时回退默认）。 */
  function readCfg() {
    try {
      const v = ctx.settings.get(NS)
      return v && typeof v === 'object' ? { ...DEFAULT_SETTINGS, ...v } : { ...DEFAULT_SETTINGS }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  // ── 自研会话门（脱离 dsh-task-control，真暂停）──
  // 状态持久化 + 引擎；经 gate.stopNextTurn/resume 主路径接入；/pause /resume /cancel 命令。
  const pauseStore = createPauseStore()
  const pauseGate = createPauseGate({ ctx, pauseStore })
  const gate = createGate({ getCtx: () => ctx, getSettings: readCfg, store, pauseGate })
  const bridge = createBridge(ctx, gate, store, pauseGate)

  // ── 冗余端口：input-traffic 冻结按钮透传接入（D5/D6/D8）──
  ctx.provide('sessionGuard', bridge)

  // ── 自研会话门：安全边界监听（session/event 落地延迟暂停）──
  // 监听在命令注册之前，让任何会话事件都能在安全边界落地 pending pause。
  if (typeof ctx.on === 'function') {
    ctx.effect(() => ctx.on('session/event', (session, event) => {
      try {
        pauseGate.handleEvent(session, event)
      } catch (e) {
        ctx.logger?.warn?.('[session-guard] session event handling failed: ' + String(e))
      }
    }), 'session-guard: pause-gate events')
  }

  // ── 手动会话门命令（/pause /resume /cancel，全量移植）──
  if (typeof ctx.commands?.register === 'function') {
    const tokensOf = (rawInput) => String(rawInput ?? '').trim().split(/\s+/).filter(Boolean)
    ctx.effect(() => ctx.commands.register({
      name: 'pause',
      description: 'pause the running task (safe: defers to the safe boundary; force: interrupts tools and reasoning now; wait: let reasoning finish; bare /pause follows the pause settings)',
      input: { hint: '[force|safe] [stop|wait]' },
      handler: (invocation) => {
        const sid = String(invocation?.agent?.id ?? '')
        if (!sid) return { kind: 'error', text: 'no session for this command' }
        const opts = {}
        for (const t of tokensOf(invocation.rawInput)) {
          if (t === 'force' || t === 'safe') opts.mode = t
          if (t === 'stop' || t === 'wait') opts.reason = t
        }
        return pauseGate.pause(sid, opts)
      },
    }))
    ctx.effect(() => ctx.commands.register({
      name: 'resume',
      description: 'resume the paused task and continue from the pause point (a force-paused task with an interrupted tool needs `confirm`, plus `rerun`/`skip` for the tool)',
      input: { hint: '[confirm] [rerun|skip]' },
      handler: (invocation) => {
        const sid = String(invocation?.agent?.id ?? '')
        if (!sid) return { kind: 'error', text: 'no session for this command' }
        const tokens = tokensOf(invocation.rawInput)
        return pauseGate.resume(sid, {
          confirm: tokens.includes('confirm'),
          choice: tokens.includes('skip') ? 'skip' : 'rerun',
        })
      },
    }))
    ctx.effect(() => ctx.commands.register({
      name: 'cancel',
      description: 'cancel the running task (stops the current turn immediately, keeps the queue)',
      handler: (invocation) => {
        const sid = String(invocation?.agent?.id ?? '')
        if (!sid) return { kind: 'error', text: 'no session for this command' }
        return pauseGate.cancel(sid)
      },
    }))
  }

  // ── 后端自动重试（D9）：冻结/门控期间让路，绝不绕过会话门 ──
  createRetry({
    ctx,
    getSettings: readCfg,
    isFrozen: (sessionId) => {
      const st = bridge.state(sessionId)
      if (st.queueLocked) return true
      if (st.paused) return true // 自研会话门真暂停
      if (st.taskControl && st.taskControl.paused) return true
      return false
    },
  })

  // ── 设置子板块（设置 → 插件 → session-guard，简单开关）──
  // fail-open：原生设置栈可用才注册，缺失则静默降级用默认配置（永不因设置依赖而崩）。
  void registerSettings(ctx)

  // ── 状态机驱动（30s tick）──
  async function onEnterPeak(cfg) {
    const agents = ctx.agents
    const roots = typeof agents.roots === 'function' ? agents.roots() : agents.list()
    const paused = []
    for (const agent of roots) {
      if (agent && agent.status === 'running') {
        const r = await gate.stopNextTurn(String(agent.id), {
          mode: cfg.pauseMode,
          reason: cfg.pauseReason,
        })
        paused.push({ sessionId: String(agent.id), via: r.via, ok: r.ok })
      }
    }
    ctx.logger?.info?.(`[session-guard] peak entered — paused ${paused.length} running session(s): ${JSON.stringify(paused)}`)
  }

  async function onLeavePeak(cfg) {
    // 低谷自动恢复开关：关掉则退峰不自动恢复（会话保持暂停，需手动恢复）。
    if (cfg.offPeakAutoResume === false) {
      ctx.logger?.info?.('[session-guard] off-peak auto-resume disabled — sessions stay paused')
      return
    }
    const agents = ctx.agents
    const roots = typeof agents.roots === 'function' ? agents.roots() : agents.list()
    const resumed = []
    for (const agent of roots) {
      const r = await gate.resume(String(agent.id), { choice: 'rerun' })
      resumed.push({ sessionId: String(agent.id), via: r.via, ok: r.ok })
    }
    ctx.logger?.info?.(`[session-guard] peak left — resumed ${resumed.length} session(s): ${JSON.stringify(resumed)}`)
  }

  function tick() {
    try {
      const cfg = readCfg()
      const next = computeState(cfg, new Date())
      if (lastState === null) {
        lastState = next
        return // 首次 tick 只记录基线，不触发（避免装插件瞬间误暂停）
      }
      const t = transition(lastState, next)
      if (t.enter) {
        lastState = { ...next }
        void onEnterPeak(cfg)
      } else if (t.leave) {
        lastState = { ...next }
        void onLeavePeak(cfg)
      } else {
        lastState = next
      }
    } catch (e) {
      ctx.logger?.error?.(`[session-guard] tick failed: ${String(e && e.message || e)}`)
    }
  }

  ctx.effect(() => ctx.timer.interval(tick, 30_000), 'session-guard: tick')
  tick()

  // ── HTTP 路由 ──
  if (ctx.webServer && typeof ctx.webServer.register === 'function') {
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/session-guard',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://dsh.local')
          const method = req.method ?? 'GET'
          const json = (code, payload) => {
            res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify(payload))
          }
          // GET /session-guard/state?session=<id>
          if (method === 'GET' && url.pathname === '/session-guard/state') {
            const sessionId = url.searchParams.get('session') ?? ''
            if (!sessionId) return json(400, { ok: false, error: 'missing session' })
            return json(200, { ok: true, state: bridge.state(sessionId) })
          }
          // GET /session-guard/settings
          if (method === 'GET' && url.pathname === '/session-guard/settings') {
            const cfg = readCfg()
            return json(200, { ok: true, settings: cfg, taskControlAvailable: detectTaskControl(ctx) })
          }
          // GET /session-guard/status —— 全局当前阶段（状态徽标轮询用）
          if (method === 'GET' && url.pathname === '/session-guard/status') {
            const cfg = readCfg()
            const now = new Date()
            const wc = wallClock(cfg.timezone, now)
            const weekend = isWeekend(wc.weekday)
            const peak = cfg.enabled && !weekend && isInPeak(wc, cfg.peakWindows || [])
            return json(200, {
              ok: true,
              status: {
                phase: weekend ? 'weekend' : peak ? 'peak' : 'off-peak',
                weekend,
                peak,
                state: lastState,
                enabled: cfg.enabled,
                weekendMode: cfg.weekendMode,
                timezone: cfg.timezone,
                now: now.toISOString(),
              },
            })
          }
          // GET /session-guard/diag —— 运行时诊断：settings 服务形状 + 已注册 namespace 列表
          if (method === 'GET' && url.pathname === '/session-guard/diag') {
            const settings = ctx.settings
            let hasSettings = !!settings && typeof settings === 'object'
            let hasRegister = typeof (settings && settings.register) === 'function'
            let namespaces = null
            let describeErr = null
            try {
              const d = typeof settings.describe === 'function' ? settings.describe() : null
              namespaces = Array.isArray(d) ? d.map((x) => x && x.ns) : d
            } catch (e) {
              describeErr = String(e && e.message || e)
            }
            return json(200, {
              ok: true,
              diag: {
                hasSettings,
                settingsType: hasSettings ? (settings.constructor ? settings.constructor.name : typeof settings) : typeof settings,
                settingsKeys: hasSettings ? Object.keys(settings) : [],
                hasRegister,
                hasGet: typeof (settings && settings.get) === 'function',
                hasDescribe: typeof (settings && settings.describe) === 'function',
                namespaces,
                describeErr,
                ns: NS,
                schemaOk: !!SettingsSchema && typeof SettingsSchema === 'function',
              },
            })
          }
          // POST /session-guard/rpc { action, sessionId, ... }
          if (method === 'POST' && url.pathname === '/session-guard/rpc') {
            const chunks = []
            for await (const c of req) chunks.push(c)
            const body = Buffer.concat(chunks).toString('utf8')
            let parsed = {}
            try {
              parsed = body ? JSON.parse(body) : {}
            } catch {
              return json(400, { ok: false, error: 'invalid json' })
            }
            const sessionId = String(parsed.sessionId ?? '')
            if (!sessionId) return json(400, { ok: false, error: 'missing sessionId' })
            const action = String(parsed.action ?? '')
            if (action === 'stopNextTurn') return json(200, { ok: true, result: await bridge.stopNextTurn(sessionId, parsed) })
            if (action === 'resume') return json(200, { ok: true, result: await bridge.resume(sessionId, parsed) })
            if (action === 'lockQueue') return json(200, { ok: true, result: bridge.lockQueue(sessionId, parsed.reason) })
            if (action === 'unlockQueue') return json(200, { ok: true, result: bridge.unlockQueue(sessionId) })
            if (action === 'state') return json(200, { ok: true, state: bridge.state(sessionId) })
            return json(400, { ok: false, error: `unknown action ${action}` })
          }
          return json(404, { ok: false, error: `unknown ${method} ${url.pathname}` })
        } catch (e) {
          ctx.logger?.error?.(`[session-guard] route error: ${String(e && e.message || e)}`)
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }))
        }
      },
    }), 'session-guard: routes')
  }
}

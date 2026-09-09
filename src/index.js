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
import { wallClock, isWeekend, isInPeak, BILLING_TIMEZONE } from './time.js'
import { createStore } from './store.js'
import { createGate } from './gate.js'
import { createBridge } from './bridge.js'
import { createRetry } from './retry.js'
import { createPauseStore } from './pause-store.js'
import { createPauseGate } from './pause-gate.js'
import { createStepGate } from './step-gate.js'
import { detectTaskControl } from './detect.js'
import { makeIsRoot } from './request-guard.js'
import { createWiring } from './wiring.js'
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

  // ── SSE 推送（v0.2.0）：step 门状态变化时立刻推给对应会话页面 ──
  // 客户端「暂停会话 / 继续会话」按钮据此更新，无需等轮询。
  const sseClients = new Set()

  function sseSend(client, payload) {
    try {
      client.res.write(`data: ${JSON.stringify(payload)}\n\n`)
    } catch {
      /* 连接已断开：交给 close 事件清理 */
    }
  }

  function broadcastStep(sessionId, stepState) {
    const id = String(sessionId)
    for (const client of [...sseClients]) {
      if (client.sessionId !== '' && client.sessionId !== id) continue
      sseSend(client, { type: 'step', sessionId: id, state: stepState })
    }
  }

  // ── 自研会话门（脱离 dsh-task-control，真暂停）──
  // 状态持久化 + 引擎；经 gate.stopNextTurn/resume 主路径接入；/pause /resume /cancel 命令。
  // v0.2.0 追加 step 级门控（src/step-gate.js）：stepGate 与 pauseGate/wiring 互相需要，
  // 用 late-bound 引用装配，避免构造期循环依赖。
  const pauseStore = createPauseStore()
  let pauseGateRef = null
  let wiringRef = null
  const stepGate = createStepGate({
    getSettings: readCfg,
    shouldHoldSession: (cfg, id) => (wiringRef ? wiringRef.shouldPauseSession(cfg, id) : true),
    isHeldByDeferrals: (id) => (wiringRef ? wiringRef.deferrals.has(id) : false),
    isRootAgent: makeIsRoot(ctx),
    pauseGate: { pause: (id, opts) => pauseGateRef.pause(id, opts) },
    logger: ctx.logger,
    onChange: (id, snapshot) => broadcastStep(id, snapshot),
  })
  const pauseGate = createPauseGate({ ctx, pauseStore, stepGate })
  pauseGateRef = pauseGate
  const gate = createGate({ getCtx: () => ctx, getSettings: readCfg, store, pauseGate })
  const bridge = createBridge(ctx, gate, store, pauseGate, stepGate)

  // ── 官方 provider 二维判定接线（目标追踪 / 请求级守卫 / 入峰过滤 / 退峰释放）──
  // 纯逻辑见 provider.js / provider-directory.js / deferrals.js / request-guard.js / targets.js，
  // 接线与编排见 wiring.js；这里只负责装配与生命周期。
  const wiring = createWiring({ ctx, getSettings: readCfg, gate, stepGate, logger: ctx.logger })
  wiringRef = wiring

  // ── 冗余端口：input-traffic 冻结按钮透传接入（D5/D6/D8）──
  ctx.provide('sessionGuard', bridge)

  // ── 自研会话门：安全边界监听（session/event 落地延迟暂停）──
  // 监听在命令注册之前，让任何会话事件都能在安全边界落地 pending pause。
  // 同一条监听顺带做「最近真实目标」追踪（request/header 两版本通吃）。
  if (typeof ctx.on === 'function') {
    ctx.effect(() => ctx.on('session/event', (session, event) => {
      try {
        pauseGate.handleEvent(session, event)
      } catch (e) {
        ctx.logger?.warn?.('[session-guard] session event handling failed: ' + String(e))
      }
      wiring.onSessionEvent(session, event)
    }), 'session-guard: pause-gate events')
  }

  // ── 请求级守卫（agent/request waterfall）──
  // 覆盖缺口：tick 只在状态跳变时处理 running 会话，入峰后新启动 / 中途切官方都会漏。
  ctx.effect(() => wiring.installGuard(), 'session-guard: request guard')

  // ── step 级门控（agent/pre-step waterfall，v0.2.0）──
  // 高峰 + 非周末 + 目标官方 → 在下一个 step 的模型请求前拉门；退峰原地续跑。
  ctx.effect(() => wiring.installStepGuard(), 'session-guard: step guard')

  ctx.effect(() => () => wiring.dispose(), 'session-guard: wiring dispose')

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
        // v0.2.0：step 门挂起时，「恢复」= 放行该 step 且本峰内不再拦（用户显式继续）。
        bridge.stepResume(sid, { bypass: true, reason: 'command' })
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
        bridge.stepResume(sid, { bypass: false, reason: 'command' })
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
      if (st.pausedStep) return true // v0.2.0：step 门挂起同样让路，绝不绕过会话门
      if (st.taskControl && st.taskControl.paused) return true
      return false
    },
  })

  // ── 设置子板块（设置 → 插件 → session-guard，简单开关）──
  // fail-open：原生设置栈可用才注册，缺失则静默降级用默认配置（永不因设置依赖而崩）。
  void registerSettings(ctx)

  // ── 状态机驱动（30s tick）──
  // 入峰：只暂停「最近目标为官方或 unknown」的 running 会话（providerGuard 关闭时退回全部）；
  // 退峰：先放行挂起的请求，再按 deferredResume / offPeakAutoResume 决定续跑（见 wiring.js）。
  async function onEnterPeak(cfg) {
    await wiring.onEnterPeak(cfg)
  }

  async function onLeavePeak(cfg) {
    await wiring.onLeavePeak(cfg)
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
            const st = bridge.state(sessionId)
            return json(200, {
              ok: true,
              state: st,
              // v0.2.0：PRD §6.2 的 `paused: { step, turn }` 形状（顶层，兼容既有 state.paused 布尔）
              // step = 已拉门；manual = 已请求但还没到边界（按钮同样显示「继续会话」）
              paused: { step: st.pausedStep === true, turn: st.paused === true, manual: st.stepManual === true },
              stepGate: {
                held: st.pausedStep === true,
                manual: st.stepManual === true,
                since: st.stepHeldSince,
                bypass: st.stepBypass === true,
              },
              target: wiring.targets.get(sessionId),
              held: wiring.deferrals.has(sessionId),
              deferred: wiring.deferrals.isDeferred(sessionId),
            })
          }
          // GET /session-guard/events?session=<id> —— SSE：step 门状态变化即时推送
          if (method === 'GET' && url.pathname === '/session-guard/events') {
            const sessionId = url.searchParams.get('session') ?? ''
            res.writeHead(200, {
              'content-type': 'text/event-stream; charset=utf-8',
              'cache-control': 'no-cache, no-transform',
              connection: 'keep-alive',
            })
            res.write(': connected\n\n')
            const client = { sessionId, res }
            sseClients.add(client)
            sseSend(client, { type: 'step', sessionId, state: stepGate.state(sessionId) })
            const keepAlive = setInterval(() => {
              try {
                res.write(': ping\n\n')
              } catch {
                /* 连接已断开 */
              }
            }, 25_000)
            if (typeof keepAlive.unref === 'function') keepAlive.unref()
            const cleanup = () => {
              clearInterval(keepAlive)
              sseClients.delete(client)
            }
            req.on?.('close', cleanup)
            res.on?.('close', cleanup)
            return undefined
          }
          // GET /session-guard/provider?provider=<id> —— 官方判定诊断（排查误判用）
          if (method === 'GET' && url.pathname === '/session-guard/provider') {
            const provider = url.searchParams.get('provider') ?? ''
            if (!provider) return json(400, { ok: false, error: 'missing provider' })
            return json(200, { ok: true, verdict: wiring.directory.describe(provider) })
          }
          // GET /session-guard/settings
          if (method === 'GET' && url.pathname === '/session-guard/settings') {
            const cfg = readCfg()
            return json(200, { ok: true, settings: cfg, taskControlAvailable: detectTaskControl(ctx) })
          }
          // GET /session-guard/status —— 全局当前阶段（状态徽标轮询用）
          // 峰谷判定：固定北京时间（BILLING_TIMEZONE），与 DeepSeek 官方计费一致
          // 周末判定：用配置时区（用户本地的周末）
          if (method === 'GET' && url.pathname === '/session-guard/status') {
            const cfg = readCfg()
            const now = new Date()
            const wcUser = wallClock(cfg.timezone, now)
            const wcBilling = wallClock(BILLING_TIMEZONE, now)
            const weekend = isWeekend(wcUser.weekday)
            const peak = cfg.enabled && !weekend && isInPeak(wcBilling, cfg.peakWindows || [])
            return json(200, {
              ok: true,
              status: {
                phase: weekend ? 'weekend' : peak ? 'peak' : 'off-peak',
                weekend,
                peak,
                state: lastState,
                enabled: cfg.enabled,
                weekendMode: cfg.weekendMode,
                providerGuard: cfg.providerGuard === true,
                stepLevelPause: cfg.stepLevelPause === true,
                held: wiring.deferrals.size(),
                deferred: wiring.deferrals.deferredSize(),
                stepHeld: stepGate.heldIds().length,
                timezone: cfg.timezone,
                billingTimezone: BILLING_TIMEZONE,
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
                providerGuard: readCfg().providerGuard === true,
                configurableProviders: wiring.directory.entries().length,
                held: wiring.deferrals.size(),
                deferred: wiring.deferrals.deferredSize(),
                stepGate: {
                  held: stepGate.heldIds(),
                  bypass: stepGate._bypassed(),
                  timeoutMs: readCfg().stepGateTimeoutMs,
                  enabled: readCfg().stepLevelPause === true,
                },
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
            if (action === 'stepResume') {
              return json(200, {
                ok: true,
                result: bridge.stepResume(sessionId, {
                  bypass: parsed.bypass !== false,
                  reason: typeof parsed.reason === 'string' && parsed.reason !== '' ? parsed.reason : 'rpc',
                }),
              })
            }
            if (action === 'stepPause') return json(200, { ok: true, result: bridge.stepPause(sessionId) })
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

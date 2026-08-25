/**
 * dsh-session-guard — host half。
 *
 * 高峰自动会话门：
 * - 每 30s tick 判定状态（NORMAL ↔ PAUSED_PEAK），纯状态机见 scheduler.js。
 * - 入峰（且非周末）：对所有 running root session 调 gate.stopNextTurn
 *   （有 taskControl → 会话门 safe+wait；无 → 回退锁等待队列）。
 * - 退峰/周末：gate.resume 全部。
 * - `ctx.provide('sessionGuard')` 冗余端口，input-traffic 冻结按钮透传接入。
 * - 设置：设置 → 插件 → session-guard 子板块，简单开关（enabled / weekendMode / resumeOnWeekend / queueFallback）。
 */
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { computeState, transition } from './scheduler.js'
import { createStore } from './store.js'
import { createGate } from './gate.js'
import { createBridge } from './bridge.js'
import { createRetry, DEFAULT_RETRY } from './retry.js'
import { detectTaskControl } from './detect.js'

export const name = 'session-guard'
export const inject = ['agents', 'webServer', 'settings', 'timer']

/** 设置命名空间（设置 → 插件 → session-guard）。 */
export const NS = 'session-guard'

/** 默认配置。 */
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true, // ← 高峰自动处理开关（简单开关）
  weekendMode: true, // ← 周末模式开关：识别周末，无视峰谷（简单开关）
  timezone: 'Asia/Shanghai',
  peakWindows: [
    { start: '09:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  resumeOnWeekend: true, // 周末到了自动恢复（简单开关）
  pauseMode: 'safe', // 透传 taskControl.pause mode
  pauseReason: 'wait', // 透传 taskControl.pause reason
  queueFallback: true, // 无会话门时回退锁等待队列（简单开关）
  retryEnabled: false, // ← 自动重试开关（后端，D9；默认关，保守）
  retryText: DEFAULT_RETRY.retryText,
  retryGraceMs: DEFAULT_RETRY.retryGraceMs,
  retryCooldownMs: DEFAULT_RETRY.retryCooldownMs,
  retryBackoffFactor: DEFAULT_RETRY.retryBackoffFactor,
  retryBackoffMaxMs: DEFAULT_RETRY.retryBackoffMaxMs,
  retryMaxConsecutive: DEFAULT_RETRY.retryMaxConsecutive,
})

/** 设置 schema：布尔字段渲染为简单开关。 */
export const SessionGuardSchema = z.object({
  enabled: z.boolean().default(DEFAULT_SETTINGS.enabled),
  weekendMode: z.boolean().default(DEFAULT_SETTINGS.weekendMode),
  timezone: z.string().default(DEFAULT_SETTINGS.timezone),
  peakWindows: z
    .array(z.object({ start: z.string(), end: z.string() }))
    .default(DEFAULT_SETTINGS.peakWindows),
  resumeOnWeekend: z.boolean().default(DEFAULT_SETTINGS.resumeOnWeekend),
  pauseMode: z.union([z.literal('safe'), z.literal('force')]).default(DEFAULT_SETTINGS.pauseMode),
  pauseReason: z.union([z.literal('wait'), z.literal('stop')]).default(DEFAULT_SETTINGS.pauseReason),
  queueFallback: z.boolean().default(DEFAULT_SETTINGS.queueFallback),
  retryEnabled: z.boolean().default(DEFAULT_SETTINGS.retryEnabled),
  retryText: z.string().default(DEFAULT_SETTINGS.retryText),
  retryGraceMs: z.natural().default(DEFAULT_SETTINGS.retryGraceMs),
  retryCooldownMs: z.natural().default(DEFAULT_SETTINGS.retryCooldownMs),
  retryBackoffFactor: z.natural().default(DEFAULT_SETTINGS.retryBackoffFactor),
  retryBackoffMaxMs: z.natural().default(DEFAULT_SETTINGS.retryBackoffMaxMs),
  retryMaxConsecutive: z.natural().default(DEFAULT_SETTINGS.retryMaxConsecutive),
})

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

  const gate = createGate({ getCtx: () => ctx, getSettings: readCfg, store })
  const bridge = createBridge(ctx, gate, store)

  // ── 冗余端口：input-traffic 冻结按钮透传接入（D5/D6/D8）──
  ctx.provide('sessionGuard', bridge)

  // ── 后端自动重试（D9）：冻结/门控期间让路，绝不绕过会话门 ──
  createRetry({
    ctx,
    getSettings: readCfg,
    isFrozen: (sessionId) => {
      const st = bridge.state(sessionId)
      if (st.queueLocked) return true
      if (st.taskControl && st.taskControl.paused) return true
      return false
    },
  })

  // ── 设置子板块（设置 → 插件 → session-guard，简单开关）──
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(NS), SessionGuardSchema, { applies: 'live' })
  })

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

/**
 * dsh-session-guard — host half。
 *
 * 高峰自动会话门：
 * - 每 30s tick 判定状态（NORMAL ↔ PAUSED_PEAK），纯状态机见 scheduler.js。
 * - 入峰（且非周末）：按 `stepLevelPause` 走 step 门或回合级暂停。
 * - 退峰/周末：放行 step 门 + 恢复本插件暂停的会话。
 * - **畅跑（v0.3.0）**：单会话限时无视峰谷，见 src/free-run.js。
 * - `ctx.provide('sessionGuard')` 冗余端口，input-traffic 冻结按钮透传接入。
 * - 设置：设置 → 插件 → session-guard 子板块，简单开关。config/session-guard.json 为默认层。
 */
import { computeState, transition } from './scheduler.js'
import { MODES, createTimePolicyResolver, stableStringify } from './time-policy.js'
import { loadConfigFile } from './config-file.js'
import { fileURLToPath } from 'node:url'
import { createStore } from './store.js'
import { createGate } from './gate.js'
import { createBridge } from './bridge.js'
import { createRetry } from './retry.js'
import { createPauseStore } from './pause-store.js'
import { createPauseGate, PAUSED_REASON_PEAK } from './pause-gate.js'
import { createStepGate } from './step-gate.js'
import {
  appendWindow,
  createFreeRunStore,
  freeRunState,
  idleFreeRunState,
  isFreeRunActive as isFreeRunRecordActive,
  nextFreeRunBoundary,
  parseFreeRunInstant,
  pruneWindows,
  removeWindow,
  setAllPaused,
  setWindowPaused,
  windowStatus,
} from './free-run.js'
import { detectTaskControl } from './detect.js'
import { makeIsRoot } from './request-guard.js'
import { createWiring } from './wiring.js'
import { NS, DEFAULT_SETTINGS, SettingsSchema, registerSettings, effectiveDefaults, settingsBaseFor } from './settings.js'

export const name = 'session-guard'
export const inject = ['agents', 'webServer', 'settings', 'timer', 'commands', 'goals']

export { NS, DEFAULT_SETTINGS }
export { MODES } from './time-policy.js'
export { FREE_RUN_STATES } from './free-run.js'

/** 本插件包根目录（配置搜索顺序的最后兜底：随包发布的 config/session-guard.json）。 */
const PLUGIN_DIR = fileURLToPath(new URL('..', import.meta.url))

export function apply(ctx) {
  const store = createStore()
  let lastState = null

  // ── config/session-guard.json（v0.3.0）──
  // 用户改这个文件即可调整 peak 时间 / 提前提醒 / timeout / 默认动作 / 时区 / 周末定义。
  // 文件值是 settings 的**默认层**（设置面板里的用户覆盖仍然优先）。
  // 读取失败 / JSON 坏掉都不阻塞启动：收集 errors，回退内置默认（fail-open）。
  let configFile = loadConfigFile({ pluginDir: PLUGIN_DIR })

  function reloadConfigFile() {
    configFile = loadConfigFile({ pluginDir: PLUGIN_DIR })
    userLayerCache = null // 失效用户覆盖层缓存，保证 reload 后立刻按新配置判定
    if (configFile.errors.length > 0) {
      ctx.logger?.warn?.(`[session-guard] config file issues (${configFile.path}): ${configFile.errors.join('; ')}`)
    }
    return configFile
  }

  if (configFile.path !== null) {
    ctx.logger?.info?.(`[session-guard] config file: ${configFile.path}`)
    if (configFile.errors.length > 0) {
      ctx.logger?.warn?.(`[session-guard] config file issues: ${configFile.errors.join('; ')}`)
    }
  }

  /**
   * 启动时 settings 命名空间的**规范化基准快照**（= 用户还没动过任何开关时的形态）。
   *
   * 用途见 `readCfg` 的退化路径：当 settings 服务没有 `describe()` 时，
   * 靠「与启动基准的差集」推断哪些键是用户显式改过的。
   * 与 `registerSettings` 用的是同一份 base（`settingsBaseFor`），不会错位。
   */
  const settingsBaseline = settingsBaseFor(configFile.settings).canonical

  /**
   * 用户覆盖层（raw user layer）缓存。
   *
   * 为什么需要缓存：`settings.describe()` 会 `structuredClone` **每个**已注册命名空间的
   * base 与 user（dsh-settings 的实现如此），而 `readCfg()` 在 tick / 每个 LLM 请求 /
   * 每个 step 边界上都会被调用。用人可感知的 TTL 兜住成本——设置面板的改动晚 2 秒
   * 生效无关紧要，而 `reloadConfig` 会显式失效缓存。
   */
  const USER_LAYER_TTL_MS = 2000
  let userLayerCache = null

  /**
   * 安全取 `settings` 服务。
   *
   * **为什么不能直接写 `ctx.settings`**：cordis 的服务属性是带守卫的 getter，
   * 未在 `inject` 里声明就访问会**直接抛错**（`cannot get property "settings"
   * without inject`），而不是返回 `undefined`。插件在 `settings` 服务缺失的宿主上
   * （例如 0.1.7 线，宿主不再提供该服务）本该 fail-open 降级到配置文件，但直接访问
   * 会让每个路由 500 —— 也就是说「缺服务时自动降级」这句话在修复前是假的。
   * 这里统一经 `ctx.get()` 取，取不到就是 `undefined`。
   * @returns {object|undefined}
   */
  function settingsService() {
    // 先走 `ctx.get()`：cordis 下这是「有就返回、没有就是 undefined」的安全取法。
    try {
      if (typeof ctx.get === 'function') {
        const viaGet = ctx.get('settings')
        if (viaGet !== undefined && viaGet !== null) return viaGet
      }
    } catch {
      /* 取不到就继续退化 */
    }
    // 退化：某些注入面（以及单测的 fake ctx）只把服务挂在 `ctx.settings` 上；
    // 未 inject 时这句会抛，所以必须包在 try 里。
    try {
      return ctx.settings
    } catch {
      return undefined
    }
  }

  /**
   * 取用户在设置面板里**显式改过**的键（不是 schema 补的默认值）。
   *
   * `dsh-settings` 的 `describe()` 明确提供 raw `user` 层（文档原话：
   * "raw user layers so a form can mark which fields the user overrode"），
   * 这是最精确的来源。返回 `undefined` 表示「问不出来」，交给退化路径。
   * @returns {object|undefined}
   */
  function settingsUserLayer() {
    const nowMs = Date.now()
    if (userLayerCache !== null && nowMs - userLayerCache.at < USER_LAYER_TTL_MS) return userLayerCache.value
    let value
    const svc = settingsService()
    if (svc && typeof svc.describe === 'function') {
      try {
        const list = svc.describe()
        if (Array.isArray(list)) {
          const d = list.find((x) => x && x.ns === NS)
          if (d !== undefined) value = d.user !== null && typeof d.user === 'object' ? d.user : {}
        }
      } catch {
        value = undefined
      }
    }
    userLayerCache = { at: nowMs, value }
    return value
  }

  /**
   * 读实时设置。
   *
   * v0.3.0 的热重载语义（**这是 `reloadConfig` 真正生效的关键**）：
   * - 配置文件的当前值 = 新的 base（所以改完文件 reload 就能生效，无需重启）；
   * - 设置面板里**用户显式设过**的键 = 最高优先级覆盖；
   * - 其余键用文件里的新值。
   *
   * 若直接 `{...fallback, ...settings.get(NS)}`，settings 服务里那份**注册时就被
   * deepFreeze 的 resolved 快照**（含旧 base）会把文件的新值全部盖掉，
   * `reloadConfig` 就退化成只更新诊断信息的空操作。
   */
  function readCfg() {
    const base = effectiveDefaults(configFile.settings)
    const user = settingsUserLayer()
    if (user !== undefined) return { ...base, ...user }
    // 退化路径：settings 服务没有 describe() → 与启动基准做差集，推断用户覆盖。
    let merged
    try {
      merged = settingsService()?.get?.(NS)
    } catch {
      return base
    }
    if (!merged || typeof merged !== 'object') return base
    const overrides = {}
    for (const key of Object.keys(merged)) {
      if (stableStringify(merged[key]) !== stableStringify(settingsBaseline[key])) overrides[key] = merged[key]
    }
    return { ...base, ...overrides }
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

  // ── 畅跑（v0.3.0）：单会话限时无视峰谷 ──
  // 状态只挂在 per-session 钩子上，`resolve()`/`scheduler` 完全不知道它的存在
  // （全局斑标语义不变，且 time-policy 的纯函数性不被破坏）。
  const freeRunStore = createFreeRunStore()

  /** 畅跑原始记录（无记录 → idle 基线）。 */
  function freeRunRecord(sessionId) {
    try {
      return freeRunStore.current(sessionId)
    } catch {
      return null
    }
  }

  /** 该会话此刻是否处于畅跑豁免中（给 wiring / request-guard / 前端用）。 */
  function isFreeRunActiveAt(sessionId, date) {
    const rec = freeRunRecord(sessionId)
    if (rec === null) return false
    const t = date instanceof Date ? date.getTime() : Number(date)
    return isFreeRunRecordActive(rec, Number.isFinite(t) ? t : Date.now())
  }

  /** 配置时区（畅跑时间按它解释，与 peakWindows / 周末同源）。 */
  function configTimeZone() {
    try {
      return createTimePolicyResolver(readCfg()).policy.timezone
    } catch {
      return 'Asia/Shanghai'
    }
  }

  /** 把绝对时刻格式化为配置时区下的墙钟串（h23，避免 24:00）。 */
  function formatInZone(ms, timeZone) {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    const p = {}
    for (const part of f.formatToParts(new Date(ms))) p[part.type] = part.value
    return {
      input: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`,
      display: `${p.month}-${p.day} ${p.hour}:${p.minute}`,
    }
  }

  /**
   * 前端「畅跑」按钮 + 任务管理面板所需的全部信息（单会话）。
   * 时间同时给三种形态：ISO（绝对）、`input`（配置时区下的选择器值）、
   * `display`（配置时区下的短串）——客户端不必猜时区。
   */
  function freeRunView(sessionId) {
    const now = Date.now()
    const tz = configTimeZone()
    const rec = freeRunStore.get(sessionId) ?? idleFreeRunState(sessionId)
    const windows = (rec.windows ?? []).map((w) => ({
      id: w.id,
      from: new Date(w.fromMs).toISOString(),
      to: new Date(w.toMs).toISOString(),
      fromInput: formatInZone(w.fromMs, tz).input,
      toInput: formatInZone(w.toMs, tz).input,
      fromDisplay: formatInZone(w.fromMs, tz).display,
      toDisplay: formatInZone(w.toMs, tz).display,
      paused: w.paused === true,
      status: windowStatus(w, now),
    }))
    // 生效中 / 下一段都只看**未暂停**的窗口。
    const active = (rec.windows ?? []).find((w) => w.paused !== true && now >= w.fromMs && now < w.toMs) ?? null
    const upcoming =
      (rec.windows ?? [])
        .filter((w) => w.paused !== true && w.fromMs > now)
        .sort((a, b) => a.fromMs - b.fromMs)[0] ?? null
    return {
      state: freeRunState(rec, now),
      active: active !== null,
      available: readCfg().enabled === true,
      timezone: tz,
      windows,
      activeId: active === null ? null : active.id,
      msRemaining: active === null ? null : active.toMs - now,
      nextStartMs: upcoming === null ? null : upcoming.fromMs,
      nextStartDisplay: upcoming === null ? null : formatInZone(upcoming.fromMs, tz).display,
    }
  }

  // ── 官方 provider 二维判定接线（目标追踪 / 请求级守卫 / 入峰过滤 / 退峰释放）──
  // 纯逻辑见 provider.js / provider-directory.js / deferrals.js / request-guard.js / targets.js，
  // 接线与编排见 wiring.js；这里只负责装配与生命周期。
  const wiring = createWiring({
    ctx,
    getSettings: readCfg,
    gate,
    stepGate,
    logger: ctx.logger,
    isFreeRunActive: (sessionId, date) => isFreeRunActiveAt(sessionId, date),
  })
  wiringRef = wiring

  // ── 畅跑状态迁移 ──
  // 按**派生布尔 active** 的翻转驱动，而不是按五态逐个判断——多窗口下这样最不易漏。
  const freeRunActiveSeen = new Map()
  const freeRunTimers = new Map()

  function clearFreeRunTimer(sessionId) {
    const t = freeRunTimers.get(sessionId)
    if (t !== undefined) {
      clearTimeout(t)
      freeRunTimers.delete(sessionId)
    }
  }

  /** 在该会话的下一个窗口边界（开始 / 结束）设点，避免轮询。 */
  function scheduleFreeRunBoundary(sessionId) {
    clearFreeRunTimer(sessionId)
    const rec = freeRunRecord(sessionId)
    if (rec === null) return
    const at = nextFreeRunBoundary(rec, Date.now())
    if (at === null) return
    const delay = Math.max(0, at - Date.now())
    const timer = setTimeout(() => {
      freeRunTimers.delete(sessionId)
      syncFreeRun(sessionId, 'boundary')
    }, delay)
    if (typeof timer.unref === 'function') timer.unref()
    freeRunTimers.set(sessionId, timer)
  }

  /**
   * 畅跑豁免「进入 / 离开」的唯一副作用出口。
   *
   * - 进入：释放该会话的 step 门、放行该会话被 hold 的请求、恢复本插件因峰谷
   *   暂停的该会话（`auto` 保证不碰手动 `/pause`）。
   * - 离开：若当前仍在峰内，重新挂起该会话（step 门清 bypass 由下一个 pre-step 拉门；
   *   回合级则 stopNextTurn），退峰时既有 onLeavePeak 会恢复——即「自动挂起，等待波谷自动继续」。
   */
  async function applyFreeRunTransition(sessionId, nowActive) {
    if (nowActive) {
      try {
        stepGate.release(sessionId, 'free-run')
      } catch {
        /* 幂等，门不存在即 no-op */
      }
      try {
        wiring.deferrals.release(sessionId, 'free-run')
      } catch {
        /* ignore */
      }
      try {
        const st = pauseGate.state(sessionId)
        if (st?.paused === true && st?.pausedReason === PAUSED_REASON_PEAK) {
          await gate.resume(sessionId, { choice: 'rerun', auto: true })
        }
      } catch (e) {
        ctx.logger?.warn?.(`[session-guard] free-run release failed for ${sessionId}: ${String((e && e.message) || e)}`)
      }
      return
    }
    // 离开畅跑：只有在峰内才需要重新挂起。
    let inPeak
    try {
      inPeak = computeState(readCfg(), new Date()).state === 'PAUSED_PEAK'
    } catch {
      inPeak = false
    }
    if (!inPeak) return
    const cfg = readCfg()
    try {
      if (cfg.stepLevelPause === true && stepGate) {
        // 清 bypass 后，下一个 agent/pre-step 会因 shouldPauseSession 为真而拉门。
        stepGate.clearBypass(sessionId)
      } else {
        await gate.stopNextTurn(sessionId, {
          mode: cfg.pauseMode,
          reason: cfg.pauseReason,
          pausedReason: PAUSED_REASON_PEAK,
        })
      }
    } catch (e) {
      ctx.logger?.warn?.(`[session-guard] free-run suspend failed for ${sessionId}: ${String((e && e.message) || e)}`)
    }
  }

  /** 重算某会话的 active 并做迁移；返回当前状态。 */
  function syncFreeRun(sessionId, why = 'sync') {
    const rec = freeRunRecord(sessionId)
    const nowActive = rec !== null && isFreeRunRecordActive(rec, Date.now())
    const prev = freeRunActiveSeen.get(sessionId)
    freeRunActiveSeen.set(sessionId, nowActive)
    if (prev !== nowActive) {
      ctx.logger?.info?.(`[session-guard] free-run ${nowActive ? 'on' : 'off'} for ${sessionId} (${why})`)
      // 迁移是异步的（可能要 await gate.resume）；显式吞掉 rejection，绝不产生未处理拒绝。
      void applyFreeRunTransition(sessionId, nowActive).catch((e) => {
        ctx.logger?.warn?.(`[session-guard] free-run transition failed for ${sessionId}: ${String((e && e.message) || e)}`)
      })
    }
    scheduleFreeRunBoundary(sessionId)
    return freeRunState(rec, Date.now())
  }

  /** 启动 pass：把落盘状态重新对齐（`from` 可能在将来，重启不能丢排期）。 */
  function restoreFreeRun() {
    const ids = freeRunStore.listIds()
    const now = Date.now()
    for (const id of ids) {
      const rec = freeRunRecord(id)
      if (rec === null) continue
      const pruned = pruneWindows(rec, now)
      if (pruned.windows.length !== rec.windows.length) freeRunStore.set(id, pruned)
      freeRunActiveSeen.set(id, false) // 先置基线，再让它按真实状态迁移
      syncFreeRun(id, 'restore')
    }
  }

  // ── 畅跑写入操作（按钮 RPC 的唯一出口）──
  // 每个操作都「写盘 → 立即迁移 → 返回最新视图」，避免前端等下一次 tick。

  /** 追加一段。时间串按配置时区解释。 */
  function freeRunAdd(sessionId, from, to) {
    const tz = configTimeZone()
    const a = parseFreeRunInstant(from, tz)
    if (a.error !== undefined) return { error: `from: ${a.error}` }
    const b = parseFreeRunInstant(to, tz)
    if (b.error !== undefined) return { error: `to: ${b.error}` }
    const res = appendWindow(freeRunStore.get(sessionId), { fromMs: a.ms, toMs: b.ms }, { now: Date.now() })
    if (res.error !== undefined) return { error: res.error }
    freeRunStore.set(sessionId, res.record)
    syncFreeRun(sessionId, 'add')
    return { freeRun: freeRunView(sessionId) }
  }

  /** 删除一段。 */
  function freeRunRemove(sessionId, id) {
    const rec = freeRunStore.get(sessionId)
    if (rec === null) return { freeRun: freeRunView(sessionId) }
    freeRunStore.set(sessionId, removeWindow(rec, id, Date.now()))
    syncFreeRun(sessionId, 'remove')
    return { freeRun: freeRunView(sessionId) }
  }

  /**
   * 暂停 / 恢复**某一段**（面板每行的图标按钮）。
   * 其余段不受影响：`isFreeRunActive` 只看未暂停的段。
   */
  function freeRunSetPaused(sessionId, id, paused) {
    const rec = freeRunStore.get(sessionId)
    if (rec === null) return { error: 'no free-run windows for this session' }
    if (!rec.windows.some((w) => w.id === String(id))) return { error: `unknown free-run window ${JSON.stringify(id)}` }
    freeRunStore.set(sessionId, setWindowPaused(rec, id, paused, Date.now()))
    syncFreeRun(sessionId, paused ? 'pause' : 'resume')
    return { freeRun: freeRunView(sessionId) }
  }

  /** 暂停 / 恢复**全部未结束的段**（面板顶部的「暂停全部任务 / 恢复全部任务」）。 */
  function freeRunSetAllPaused(sessionId, paused) {
    const rec = freeRunStore.get(sessionId)
    if (rec === null) return { error: 'no free-run windows for this session' }
    freeRunStore.set(sessionId, setAllPaused(rec, paused, Date.now()))
    syncFreeRun(sessionId, paused ? 'pause-all' : 'resume-all')
    return { freeRun: freeRunView(sessionId) }
  }

  /** 清空全部时段。 */
  function freeRunClear(sessionId) {
    freeRunStore.clear(sessionId)
    syncFreeRun(sessionId, 'clear')
    return { freeRun: freeRunView(sessionId) }
  }

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
  // v0.3.0：config/session-guard.json 作为 base 默认层注入。
  void registerSettings(ctx, configFile.settings)

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

  // ── 畅跑兜底同步（30s）──
  // 精确迁移由窗口边界的 setTimeout 负责；这里覆盖系统休眠/唤醒、时钟漂移、
  // 以及任何漏掉的边界，顺带剪除已结束的窗口。
  function freeRunTick() {
    try {
      const now = Date.now()
      const ids = new Set([...freeRunStore.listIds(), ...freeRunActiveSeen.keys()])
      for (const id of ids) {
        if (freeRunStore.get(id) === null) {
          // 记录已被清除（清空 / 会话结束）：先按「不再豁免」迁移，再清跟踪。
          syncFreeRun(id, 'cleared')
          freeRunActiveSeen.delete(id)
          clearFreeRunTimer(id)
          continue
        }
        const rec = freeRunRecord(id)
        const pruned = pruneWindows(rec, now)
        if (pruned.windows.length !== rec.windows.length) freeRunStore.set(id, pruned)
        syncFreeRun(id, 'tick')
      }
    } catch (e) {
      ctx.logger?.warn?.(`[session-guard] free-run tick failed: ${String(e && e.message || e)}`)
    }
  }

  ctx.effect(() => ctx.timer.interval(tick, 30_000), 'session-guard: tick')
  ctx.effect(() => ctx.timer.interval(freeRunTick, 30_000), 'session-guard: free-run tick')
  ctx.effect(() => () => { for (const id of [...freeRunTimers.keys()]) clearFreeRunTimer(id) }, 'session-guard: free-run timers')
  tick()
  restoreFreeRun()

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
              paused: {
                step: st.pausedStep === true,
                turn: st.paused === true,
                manual: st.stepManual === true,
                // v0.3.0：'peak_window' = 峰谷策略暂停（退峰自动恢复）；'manual' = 用户显式暂停。
                reason: st.pausedReason ?? null,
              },
              stepGate: {
                held: st.pausedStep === true,
                manual: st.stepManual === true,
                since: st.stepHeldSince,
                bypass: st.stepBypass === true,
              },
              target: wiring.targets.get(sessionId),
              held: wiring.deferrals.has(sessionId),
              deferred: wiring.deferrals.isDeferred(sessionId),
              freeRun: freeRunView(sessionId),
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
            return json(200, {
              ok: true,
              settings: cfg,
              taskControlAvailable: detectTaskControl(ctx),
              // v0.3.0：配置文件来源（改哪个文件生效一目了然）
              configFile: { path: configFile.path, candidates: configFile.candidates, errors: configFile.errors },
            })
          }
          // GET /session-guard/peak —— 可配置峰谷策略的实时判定（v0.3.0）
          // 模式：PEAK / OFF_PEAK（周末整日）/ NORMAL（工作日谷时）
          if (method === 'GET' && url.pathname === '/session-guard/peak') {
            const cfg = readCfg()
            const now = new Date()
            const resolver = createTimePolicyResolver(cfg)
            const resolved = resolver.resolve(now)
            return json(200, {
              ok: true,
              peak: {
                mode: resolved.mode,
                reason: resolved.reason,
                weekend: resolved.weekend,
                weekday: resolved.weekday,
                minutesOfDay: resolved.minutes,
                windowName: resolved.windowName,
                policy: resolver.describe(),
                nextPeakAt: resolver.nextPeakStart(now),
                minutesUntilPeak: resolver.minutesUntilPeak(now),
                msUntilOffPeak: resolver.msUntilOffPeak(now),
                now: now.toISOString(),
              },
            })
          }
          // GET /session-guard/status —— 全局当前阶段（状态徽标轮询用）
          // v0.3.0：全部判定走 TimePolicyResolver（timezone / 窗口 days / 周末日 均可配置）。
          if (method === 'GET' && url.pathname === '/session-guard/status') {
            const cfg = readCfg()
            const now = new Date()
            const resolver = createTimePolicyResolver(cfg)
            const resolved = resolver.resolve(now)
            const peak = resolved.mode === MODES.PEAK
            const weekend = resolved.mode === MODES.OFF_PEAK
            return json(200, {
              ok: true,
              status: {
                // 保留 v0.2.0 的 phase 取值（weekend / peak / off-peak）以兼容既有徽标。
                phase: weekend ? 'weekend' : peak ? 'peak' : 'off-peak',
                mode: resolved.mode,
                weekend,
                peak,
                reason: resolved.reason,
                windowName: resolved.windowName,
                state: lastState,
                enabled: cfg.enabled,
                weekendMode: cfg.weekendMode,
                weekendDays: cfg.weekendDays,
                providerGuard: cfg.providerGuard === true,
                stepLevelPause: cfg.stepLevelPause === true,
                held: wiring.deferrals.size(),
                deferred: wiring.deferrals.deferredSize(),
                stepHeld: stepGate.heldIds().length,
                timezone: cfg.timezone,
                peakTimezone: resolver.policy.peakTimezone,
                minutesUntilPeak: resolver.minutesUntilPeak(now),
                configFile: configFile.path,
                now: now.toISOString(),
              },
            })
          }
          // GET /session-guard/diag —— 运行时诊断：settings 服务形状 + 已注册 namespace 列表
          if (method === 'GET' && url.pathname === '/session-guard/diag') {
            const settings = settingsService()
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
                // v0.3.0：config/session-guard.json 诊断 + 畅跑状态计数
                configFile: {
                  path: configFile.path,
                  candidates: configFile.candidates,
                  errors: configFile.errors,
                  keys: Object.keys(configFile.settings || {}),
                },
                freeRun: {
                  tracked: [...freeRunActiveSeen.keys()],
                  active: [...freeRunActiveSeen.entries()].filter(([, v]) => v === true).map(([k]) => k),
                  persisted: freeRunStore.listIds(),
                  root: freeRunStore.root,
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
            const action = String(parsed.action ?? '')
            const sessionId = String(parsed.sessionId ?? '')
            // 这个动作是插件级的，不需要 sessionId。
            if (action === 'reloadConfig') {
              // 改完 config/session-guard.json 无需重启即可生效（设置面板覆盖仍优先）。
              const cfg = reloadConfigFile()
              return json(200, {
                ok: true,
                result: { path: cfg.path, keys: Object.keys(cfg.settings || {}), errors: cfg.errors },
              })
            }
            if (!sessionId) return json(400, { ok: false, error: 'missing sessionId' })
            // ── 畅跑（v0.3.0）：按钮的全部写操作 ──
            if (action === 'freeRunAdd') {
              const r = freeRunAdd(sessionId, parsed.from, parsed.to)
              if (r.error !== undefined) return json(400, { ok: false, error: r.error })
              return json(200, { ok: true, result: r.freeRun })
            }
            if (action === 'freeRunRemove') {
              const r = freeRunRemove(sessionId, parsed.id)
              return json(200, { ok: true, result: r.freeRun })
            }
            if (action === 'freeRunPause') {
              const r = freeRunSetPaused(sessionId, parsed.id, true)
              if (r.error !== undefined) return json(400, { ok: false, error: r.error })
              return json(200, { ok: true, result: r.freeRun })
            }
            if (action === 'freeRunResume') {
              const r = freeRunSetPaused(sessionId, parsed.id, false)
              if (r.error !== undefined) return json(400, { ok: false, error: r.error })
              return json(200, { ok: true, result: r.freeRun })
            }
            if (action === 'freeRunPauseAll' || action === 'freeRunResumeAll') {
              const r = freeRunSetAllPaused(sessionId, action === 'freeRunPauseAll')
              if (r.error !== undefined) return json(400, { ok: false, error: r.error })
              return json(200, { ok: true, result: r.freeRun })
            }
            if (action === 'freeRunClear') {
              const r = freeRunClear(sessionId)
              return json(200, { ok: true, result: r.freeRun })
            }
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

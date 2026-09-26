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
import { MODES, createTimePolicyResolver } from './time-policy.js'
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
import { NS, DEFAULT_SETTINGS, SettingsSchema, effectiveDefaults } from './settings.js'

// 0.1.7：声明式设置 —— volatile 字段即自动表单。
export const Config = SettingsSchema

export const name = 'session-guard'
export const inject = ['agents', 'webServer', 'timer', 'commands', 'goals']

export { NS, DEFAULT_SETTINGS }
export { MODES } from './time-policy.js'
export { FREE_RUN_STATES } from './free-run.js'

/** 本插件包根目录（配置搜索顺序的最后兜底：随包发布的 config/session-guard.json）。 */
const PLUGIN_DIR = fileURLToPath(new URL('..', import.meta.url))

/**
 * 0.1.7：volatile 字段解引出普通值的助手。
 *
 * 组合条目里的 volatile 值是 live ref（`.get()` 读当前值）；裸值（单测、或未走 schema 的
 * 调用）直接返回。**`.get()` 抛错时视为「未设置」**（返回 undefined）—— 一个坏 ref 不该
 * 让 `readCfg` 炸掉，进而让每个路由 500。
 */
function readVolatileValue(value) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function') {
    try {
      return value.get()
    } catch {
      return undefined
    }
  }
  return value
}

export function apply(ctx, config = {}) {
  const store = createStore()
  let lastState = null

  // ── config/session-guard.json（v0.3.0）──
  // 用户改这个文件即可调整 peak 时间 / step 门控超时 / 时区 / 周末定义；文件值是**默认层**。
  // 读取失败 / JSON 坏掉都不阻塞启动：收集 errors，回退内置默认（fail-open）。
  let configFile = loadConfigFile({ pluginDir: PLUGIN_DIR })

  function reloadConfigFile() {
    configFile = loadConfigFile({ pluginDir: PLUGIN_DIR })
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
   * 组合条目快照（0.1.7 声明式设置）。
   *
   * `config` 是 dsh 按 `Config`（= `SettingsSchema`，字段带 `.volatile()`）解析后传进来的
   * 组合条目；volatile 值是 live ref，要 `.get()` 解引。**只并入已定义的值** ——
   * 单测里 `apply(ctx)` 不带 config 时 `config` 为 `{}`，若把 undefined 也并进去，
   * 会把配置文件默认层整片抹成 undefined。
   */
  function resolveEntryConfig() {
    const out = {}
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const v = readVolatileValue(config[key])
      if (v !== undefined) out[key] = v
    }
    return out
  }

  /**
   * 读实时设置。
   *
   * 0.1.7 线的优先级（本线没有 settings 服务，因此不再有「settings 用户层」这一层）：
   * - `config/session-guard.json` 的当前值 = **默认层**（改完文件 reload 即生效，无需重启）；
   * - dsh 设置表单（由 `Config` 的 volatile 字段自动生成）写回的组合条目 = **覆盖层**；
   * - 两者都没写的键用 `DEFAULT_SETTINGS` 兜底。
   *
   * `resolverFor` 的 memo 以整份 cfg 的稳定序列化为键，所以文件热重载会自然失效缓存。
   */
  function readCfg() {
    const base = effectiveDefaults(configFile.settings)
    const entry = resolveEntryConfig()
    return Object.keys(entry).length === 0 ? base : { ...base, ...entry }
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

  // ── 设置子板块 ──
  // 0.1.7：设置表单由 `Config`（= SettingsSchema 的 volatile 字段）自动生成，**无注册调用**；
  // 配置经 apply 的组合条目读取（readCfg → resolveEntryConfig），文件层由
  // config/session-guard.json 提供（见上方 readCfg 的优先级说明）。

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
  // 0.1.5 compat：注册失败只记日志，不让 apply 抛错炸掉宿主插件加载（#5926 教训）。
  // webServer.register 前缀路由 + SSE 在 0.1.5 契约不变（packages/host/webserver WebRoute）。
  if (ctx.webServer && typeof ctx.webServer.register === 'function') {
    ctx.effect(() => {
      try {
        return ctx.webServer.register({
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
          // GET /session-guard/diag —— 运行时诊断：声明式设置形态 + 配置文件 + 闸门状态
          if (method === 'GET' && url.pathname === '/session-guard/diag') {
            // 0.1.7 线没有 settings 服务：设置面由 `Config`（volatile 字段）自动生成，
            // 运行时值经 apply 的组合条目读取，因此这里报告的是组合条目形态而非服务形状。
            let entryKeys = []
            let entryErr = null
            try {
              entryKeys = Object.keys(resolveEntryConfig())
            } catch (e) {
              entryErr = String((e && e.message) || e)
            }
            return json(200, {
              ok: true,
              diag: {
                // 保持旧字段名以便既有排查习惯可用：本线恒为 false / 由 Config 取代。
                hasSettings: false,
                settingsType: 'declarative-config',
                settingsKeys: [],
                hasRegister: false,
                hasGet: false,
                hasDescribe: false,
                namespaces: null,
                describeErr: null,
                declConfig: {
                  exported: typeof Config === 'function' || (Config !== null && typeof Config === 'object'),
                  volatileFields: Object.keys(DEFAULT_SETTINGS).length,
                  entryKeys,
                  entryErr,
                },
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
      })
      } catch (e) {
        ctx.logger?.error?.(`[session-guard] webServer.register failed (routes disabled): ${String(e && e.message || e)}`)
      }
    }, 'session-guard: routes')
  }
}

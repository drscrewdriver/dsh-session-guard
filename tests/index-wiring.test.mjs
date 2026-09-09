/**
 * wiring.js 测试：接线编排（目标追踪 / 入峰过滤 / 退峰释放顺序 / 定时释放 / 卸载清理）。
 *
 * 用 fake ctx + fake gate，断言调用序列与延后表状态；不发任何真实请求。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWiring } from '../src/wiring.js'

const BASE_CFG = {
  enabled: true,
  weekendMode: true,
  timezone: 'Asia/Shanghai',
  peakWindows: [
    { start: '09:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  pauseMode: 'safe',
  pauseReason: 'wait',
  providerGuard: true,
  guardSubagents: true,
  deferredMode: 'hold',
  deferredResume: true,
  deferredResumeText: '继续（高峰已过，自动继续）',
  deferredMaxHoldMs: 6 * 60 * 60 * 1000,
  offPeakAutoResume: true,
}

const PEAK_NOW = () => new Date('2026-08-19T02:00:00Z') // 北京周三 10:00
const silent = { info() {}, warn() {}, error() {} }
const tick = () => new Promise((r) => setImmediate(r))

function harness({ cfg = {}, roots = [], setTimer, clearTimer, unrefTimers = true, clock = PEAK_NOW } = {}) {
  const paused = []
  const resumed = []
  const followups = []
  const clockRef = { current: clock }
  const agents = {
    roots: () => roots,
    list: () => roots,
    get: (id) => roots.find((a) => a.id === id),
  }
  const gate = {
    stopNextTurn: async (id, opts) => {
      paused.push([id, opts])
      return { via: 'pauseGate', ok: true }
    },
    resume: async (id, opts) => {
      resumed.push([id, opts])
      return { via: 'pauseGate', ok: true }
    },
  }
  const ctx = { agents, get: () => null, logger: silent }
  const wiring = createWiring({
    ctx,
    getSettings: () => ({ ...BASE_CFG, ...cfg }),
    gate,
    logger: silent,
    clock: () => clockRef.current(),
    setTimer,
    clearTimer,
    unrefTimers,
  })
  return { wiring, paused, resumed, followups, agents, clockRef }
}

/** 造一个 idle agent（可收 followup）。 */
function idleAgent(id, followups) {
  return {
    id,
    status: 'idle',
    followup: (msg) => followups.push({ id, text: msg.content[0].text }),
  }
}

// ── task_16：目标追踪接线 ──

test('onSessionEvent：request/header 写入目标；形状异常 → unknown；空 id 忽略', () => {
  const h = harness()
  h.wiring.onSessionEvent({ id: 's1' }, { type: 'request/header', data: { header: { config: { provider: 'deepseek-official', model: 'm' } } } })
  assert.equal(h.wiring.targets.providerOf('s1'), 'deepseek-official')
  h.wiring.onSessionEvent({ id: 's2' }, { type: 'request/header' })
  assert.equal(h.wiring.targets.providerOf('s2'), 'unknown')
  h.wiring.onSessionEvent({}, { type: 'request/header', data: { header: { config: { provider: 'x', model: 'y' } } } })
  assert.equal(h.wiring.targets.size(), 2)
})

test('onSessionEvent：model/selection 存在时被使用；不存在时不报错（0.1.1 兼容）', () => {
  const h = harness()
  h.wiring.onSessionEvent({ id: 's1' }, { type: 'request/header', data: { header: { config: { provider: 'deepseek-official', model: 'm' } } } })
  h.wiring.onSessionEvent({ id: 's1' }, { type: 'model/selection', data: { provider: 'local-35b', model: 'q' } })
  assert.equal(h.wiring.targets.providerOf('s1'), 'local-35b')
  // 0.1.1 没有该事件：收到其它事件只是 no-op
  assert.doesNotThrow(() => h.wiring.onSessionEvent({ id: 's1' }, { type: 'assistant/message' }))
})

// ── task_17：入峰过滤 ──

test('onEnterPeak：只暂停「官方或 unknown」的 running 会话', async () => {
  const roots = [
    { id: 'official', status: 'running' },
    { id: 'local', status: 'running' },
    { id: 'unknown', status: 'running' },
    { id: 'idle-one', status: 'idle' },
  ]
  const h = harness({ roots })
  h.wiring.targets.update('official', { type: 'model/selection', data: { provider: 'deepseek-official', model: 'm' } })
  h.wiring.targets.update('local', { type: 'model/selection', data: { provider: 'local-35b', model: 'q' } })
  const r = await h.wiring.onEnterPeak(BASE_CFG)
  assert.deepEqual(h.paused.map(([id]) => id).sort(), ['official', 'unknown'])
  assert.deepEqual(r.skipped.map((x) => x.sessionId), ['local'])
  assert.deepEqual(r.skipped[0].why, 'non-official')
})

test('onEnterPeak：已 hold 的会话跳过（互斥铁律，绝不调 pauseGate）', async () => {
  const roots = [{ id: 'held', status: 'running' }]
  const h = harness({ roots })
  h.wiring.targets.update('held', { type: 'model/selection', data: { provider: 'deepseek-official', model: 'm' } })
  const p = h.wiring.deferrals.hold('held', { provider: 'deepseek-official', model: 'm', config: {} })
  const r = await h.wiring.onEnterPeak(BASE_CFG)
  assert.equal(h.paused.length, 0)
  assert.deepEqual(r.skipped, [{ sessionId: 'held', why: 'held' }])
  h.wiring.deferrals.releaseAll()
  await p
})

test('onEnterPeak：providerGuard=false → 退回现有纯时间判定（全部暂停）', async () => {
  const roots = [
    { id: 'official', status: 'running' },
    { id: 'local', status: 'running' },
  ]
  const h = harness({ roots, cfg: { providerGuard: false } })
  h.wiring.targets.update('local', { type: 'model/selection', data: { provider: 'local-35b', model: 'q' } })
  await h.wiring.onEnterPeak({ ...BASE_CFG, providerGuard: false })
  assert.deepEqual(h.paused.map(([id]) => id).sort(), ['local', 'official'])
})

test('shouldPauseSession：unknown 保守暂停，已知非官方放行', () => {
  const h = harness()
  assert.equal(h.wiring.shouldPauseSession(BASE_CFG, 'never-seen'), true)
  h.wiring.targets.update('local', { type: 'model/selection', data: { provider: 'local-35b', model: 'q' } })
  assert.equal(h.wiring.shouldPauseSession(BASE_CFG, 'local'), false)
})

test('目标转非官方 → 自动恢复本插件因入峰暂停的会话', async () => {
  const roots = [{ id: 'official', status: 'running' }]
  const h = harness({ roots })
  h.wiring.targets.update('official', { type: 'model/selection', data: { provider: 'deepseek-official', model: 'm' } })
  await h.wiring.onEnterPeak(BASE_CFG)
  assert.equal(h.paused.length, 1)
  h.wiring.onSessionEvent({ id: 'official' }, { type: 'model/selection', data: { provider: 'local-35b', model: 'q' } })
  await tick()
  assert.deepEqual(h.resumed.map(([id]) => id), ['official'])
})

test('目标转非官方：deferredResume=false → 不自动恢复', async () => {
  const roots = [{ id: 'official', status: 'running' }]
  const h = harness({ roots, cfg: { deferredResume: false } })
  h.wiring.targets.update('official', { type: 'model/selection', data: { provider: 'deepseek-official', model: 'm' } })
  await h.wiring.onEnterPeak({ ...BASE_CFG, deferredResume: false })
  h.wiring.onSessionEvent({ id: 'official' }, { type: 'model/selection', data: { provider: 'local-35b', model: 'q' } })
  await tick()
  assert.equal(h.resumed.length, 0)
})

test('目标转非官方：未被本插件暂停的会话不自动恢复（不碰手动暂停）', async () => {
  const roots = [{ id: 'manual', status: 'running' }]
  const h = harness({ roots })
  // 没有经过 onEnterPeak → 不在 pausedByPeak 里
  h.wiring.onSessionEvent({ id: 'manual' }, { type: 'model/selection', data: { provider: 'local-35b', model: 'q' } })
  await tick()
  assert.equal(h.resumed.length, 0)
})

test('目标仍为官方 → 不自动恢复', async () => {
  const roots = [{ id: 'official', status: 'running' }]
  const h = harness({ roots })
  h.wiring.targets.update('official', { type: 'model/selection', data: { provider: 'deepseek-official', model: 'm' } })
  await h.wiring.onEnterPeak(BASE_CFG)
  h.wiring.onSessionEvent({ id: 'official' }, { type: 'model/selection', data: { provider: 'deepseek-official', model: 'm2' } })
  await tick()
  assert.equal(h.resumed.length, 0)
})

// ── task_17：退峰释放与续跑 ──

test('onLeavePeak：先释放挂起请求，再对 error 模式延后会话 followup', async () => {
  const agent = idleAgent('s1', [])
  const roots = [agent]
  const h = harness({ roots })
  const seen = []
  agent.followup = (msg) => seen.push({ text: msg.content[0].text, heldAtCall: h.wiring.deferrals.size() })
  const p = h.wiring.deferrals.hold('s1', { config: { provider: 'deepseek-official' } })
  h.wiring.deferrals.remember('s1', { provider: 'deepseek-official', model: 'm' })
  await h.wiring.onLeavePeak(BASE_CFG)
  assert.deepEqual(await p, { provider: 'deepseek-official' })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].heldAtCall, 0) // 释放发生在 followup 之前
  assert.equal(seen[0].text, BASE_CFG.deferredResumeText)
  assert.deepEqual(h.resumed.map(([id]) => id), ['s1'])
})

test('onLeavePeak：deferredResume=false → 不发 followup，但仍释放挂起（不挂死）', async () => {
  const calls = []
  const agent = { id: 's1', status: 'idle', followup: (msg) => calls.push(msg) }
  const h = harness({ roots: [agent] })
  const p = h.wiring.deferrals.hold('s1', { config: {} })
  h.wiring.deferrals.remember('s1', {})
  await h.wiring.onLeavePeak({ ...BASE_CFG, deferredResume: false })
  assert.deepEqual(await p, {})
  assert.equal(calls.length, 0)
  assert.equal(h.wiring.deferrals.deferredSize(), 0)
})

test('onLeavePeak：offPeakAutoResume=false → 释放挂起但不 resume 会话', async () => {
  const h = harness({ roots: [{ id: 's1', status: 'running' }] })
  const p = h.wiring.deferrals.hold('s1', { config: { ok: 1 } })
  await h.wiring.onLeavePeak({ ...BASE_CFG, offPeakAutoResume: false })
  assert.deepEqual(await p, { ok: 1 })
  assert.equal(h.resumed.length, 0)
})

test('onLeavePeak：followup 只在 agent 处于 idle 时发送', async () => {
  const calls = []
  const agent = { id: 's1', status: 'running', followup: (msg) => calls.push(msg) }
  const h = harness({ roots: [agent] })
  h.wiring.deferrals.remember('s1', {})
  await h.wiring.onLeavePeak(BASE_CFG)
  assert.equal(calls.length, 0)
  assert.equal(h.wiring.deferrals.deferredSize(), 0)
})

// ── 精确释放定时器 ──

test('scheduleRelease：按 msUntilOffPeak 排一个定时器，到点走 onLeavePeak', async () => {
  const timers = []
  const h = harness({
    roots: [{ id: 's1', status: 'running' }],
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false }
      timers.push(t)
      return t
    },
    clearTimer: (t) => {
      if (t) t.cleared = true
    },
  })
  const p = h.wiring.deferrals.hold('s1', { config: { ok: true } })
  const ms = h.wiring.scheduleRelease()
  assert.equal(ms, 2 * 60 * 60 * 1000) // 北京周三 10:00 → 12:00
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, ms)
  h.clockRef.current = () => new Date('2026-08-19T04:00:00Z') // 到点：北京周三 12:00（谷时）
  timers[0].fn()
  assert.deepEqual(await p, { ok: true })
})

test('scheduleRelease：非高峰返回 0 且不排定时器', () => {
  const timers = []
  const h = harness({
    cfg: { peakWindows: [] },
    setTimer: (fn, ms) => {
      timers.push({ fn, ms })
      return timers[timers.length - 1]
    },
    clearTimer: () => {},
  })
  assert.equal(h.wiring.scheduleRelease(), 0)
  assert.equal(timers.length, 0)
})

test('scheduleRelease 幂等：重复调用只保留最新定时器', () => {
  const timers = []
  const h = harness({
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false }
      timers.push(t)
      return t
    },
    clearTimer: (t) => {
      if (t) t.cleared = true
    },
  })
  h.wiring.scheduleRelease()
  h.wiring.scheduleRelease()
  assert.equal(timers.length, 2)
  assert.equal(timers[0].cleared, true)
  assert.equal(timers[1].cleared, false)
})

// ── 卸载清理 ──

test('dispose：清定时器 + 拒绝全部挂起（无泄漏）', async () => {
  const timers = []
  const h = harness({
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false }
      timers.push(t)
      return t
    },
    clearTimer: (t) => {
      if (t) t.cleared = true
    },
  })
  const p = h.wiring.deferrals.hold('s1', { config: {} })
  h.wiring.scheduleRelease()
  h.wiring.dispose()
  await assert.rejects(p, /disposed/)
  assert.equal(timers[0].cleared, true)
  assert.equal(h.wiring.deferrals.size(), 0)
})

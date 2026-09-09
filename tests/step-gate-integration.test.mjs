/**
 * step-gate.js × pause-gate.js 集成测试（真实组合，非 fake）：
 * 覆盖 F6 死锁回归（step 门挂起时 pause 必须先放行）与超时升级端到端。
 *
 * 用真实 pauseStore（临时目录）+ 假 agent；不触碰真实 DSH runtime。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPauseStore } from '../src/pause-store.js'
import { createPauseGate } from '../src/pause-gate.js'
import { createStepGate } from '../src/step-gate.js'

const PEAK_NOW = () => new Date('2026-08-19T02:00:00Z').getTime() // 北京周三 10:00

const CFG = {
  enabled: true,
  stepLevelPause: true,
  stepGateTimeoutMs: 300_000,
  guardSubagents: true,
  weekendMode: true,
  timezone: 'Asia/Shanghai',
  peakWindows: [
    { start: '09:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  pauseMode: 'safe',
  pauseReason: 'wait',
}

const tick = () => new Promise((r) => setImmediate(r))

/** 真实 stepGate + 真实 pauseGate 的组合（late-bound 互相引用，与 index.js 同构）。 */
function compose(t) {
  const dir = mkdtempSync(join(tmpdir(), 'session-guard-stepint-'))
  const old = process.env.DSH_SESSION_GUARD_STATE_DIR
  process.env.DSH_SESSION_GUARD_STATE_DIR = dir
  t.after(() => {
    rmSync(dir, { recursive: true, force: true })
    if (old === undefined) delete process.env.DSH_SESSION_GUARD_STATE_DIR
    else process.env.DSH_SESSION_GUARD_STATE_DIR = old
  })

  const pauseStore = createPauseStore()
  const calls = { cancelled: 0, followups: [] }
  const agent = {
    id: 's1',
    status: 'running',
    session: { events: [] },
    cancel: () => {
      calls.cancelled += 1
    },
    followup: (msg) => calls.followups.push(msg),
  }
  const ctx = {
    agents: { get: (id) => (id === 's1' ? agent : undefined) },
    get: () => null,
    logger: { warn() {}, info() {} },
  }
  const timers = []
  let pauseGate = null
  const stepGate = createStepGate({
    getSettings: () => CFG,
    shouldHoldSession: () => true,
    isHeldByDeferrals: () => false,
    isRootAgent: () => true,
    pauseGate: { pause: (id, opts) => pauseGate.pause(id, opts) },
    logger: { warn() {}, info() {} },
    now: PEAK_NOW,
    setTimer: (fn, ms) => {
      const h = { fn, ms, cleared: false, unref() {} }
      timers.push(h)
      return h
    },
    clearTimer: (h) => {
      if (h) h.cleared = true
    },
  })
  pauseGate = createPauseGate({ ctx, pauseStore, stepGate })
  return { stepGate, pauseGate, pauseStore, calls, agent, timers }
}

test('集成：step 门挂起时 pause(safe+wait) 先放行 step，安全边界随后落地暂停（F6 无死锁）', async (t) => {
  const c = compose(t)
  const listeners = []
  const signal = {
    aborted: false,
    addEventListener: (_e, fn) => listeners.push(fn),
    removeEventListener: (_e, fn) => {
      const i = listeners.indexOf(fn)
      if (i >= 0) listeners.splice(i, 1)
    },
  }
  let nextCalled = 0
  const held = c.stepGate.hold({ agent: c.agent, step: 2, turn: 1, signal }, () => {
    nextCalled += 1
    return Promise.resolve('NEXT')
  })
  await tick()
  assert.equal(c.stepGate._count(), 1, 'step 门应挂起')

  // 冻结按钮 / `/pause` 路径：turn 级暂停
  const r = c.pauseGate.pause('s1', { mode: 'safe', reason: 'wait' })
  assert.equal(r.kind, 'success')
  assert.equal(c.stepGate._count(), 0, 'step 门必须被解开（否则 pendingPause 永远等不到安全边界）')
  assert.equal(await held, 'NEXT')
  assert.equal(nextCalled, 1, '门开后 step 必须放行')
  assert.equal(listeners.length, 0, 'abort 监听已摘除')

  // 放行后的 step 产生安全边界事件 → 延迟暂停落地
  assert.equal(c.pauseStore.current('s1').paused, false)
  c.pauseGate.handleEvent({ id: 's1' }, { type: 'assistant/message', data: { message: { content: [] } } })
  await tick()
  assert.equal(c.pauseStore.current('s1').paused, true, '安全边界必须能落地')
  assert.equal(c.calls.cancelled, 1)
})

test('集成：step 门超时 → 释放并升级为 turn 级 force 暂停', async (t) => {
  const c = compose(t)
  let nextCalled = 0
  const held = c.stepGate.hold({ agent: c.agent, step: 2, turn: 1 }, () => {
    nextCalled += 1
    return Promise.resolve('NEXT')
  })
  await tick()
  assert.equal(c.stepGate._count(), 1)
  assert.equal(c.timers.length, 1)
  c.timers[0].fn() // 超时
  assert.equal(await held, 'NEXT')
  assert.equal(nextCalled, 1)
  assert.equal(c.stepGate._count(), 0)
  const st = c.pauseStore.current('s1')
  assert.equal(st.paused, true)
  assert.equal(st.forced, true, '超时必须走 force（safe 会再落进等待语义）')
  assert.equal(c.calls.cancelled, 1)
})

test('集成：退峰 releaseAll 后回合原地续跑，turn 级状态保持未暂停', async (t) => {
  const c = compose(t)
  let nextCalled = 0
  const held = c.stepGate.hold({ agent: c.agent, step: 3, turn: 1 }, () => {
    nextCalled += 1
    return Promise.resolve('NEXT')
  })
  await tick()
  assert.deepEqual(c.stepGate.releaseAll('off-peak'), ['s1'])
  assert.equal(await held, 'NEXT')
  assert.equal(nextCalled, 1)
  assert.equal(c.pauseStore.current('s1').paused, false, 'step 门释放不需要 turn 级 followup')
  assert.equal(c.calls.followups.length, 0)
  assert.equal(c.timers[0].cleared, true)
})

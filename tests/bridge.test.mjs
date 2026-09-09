/**
 * bridge.js + detect.js 测试：sessionGuard 冗余端口 + 自动检测（D7）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../src/store.js'
import { createGate } from '../src/gate.js'
import { createBridge } from '../src/bridge.js'
import { detectTaskControl, detectSessionGuard, detectInputTrafficBridge } from '../src/detect.js'

function fakeCtx(services) {
  return { get: (n) => services[n] }
}

const CFG = { pauseMode: 'safe', pauseReason: 'wait', queueFallback: true }

/** 每测试独立临时状态目录（避免污染默认 HOME 存储）。 */
function tmpStore(t) {
  const dir = mkdtempSync(join(tmpdir(), 'session-guard-bridge-'))
  const old = process.env.DSH_SESSION_GUARD_STATE_DIR
  process.env.DSH_SESSION_GUARD_STATE_DIR = dir
  t.after(() => {
    rmSync(dir, { recursive: true, force: true })
    if (old === undefined) delete process.env.DSH_SESSION_GUARD_STATE_DIR
    else process.env.DSH_SESSION_GUARD_STATE_DIR = old
  })
  return createStore()
}

function fakePauseGate(overrides = {}) {
  return {
    pause: () => ({ kind: 'success', text: 'paused' }),
    resume: () => ({ kind: 'success', text: 'resumed' }),
    cancel: () => ({ kind: 'success', text: 'cancelled' }),
    taskControlAvailable: () => true,
    state: (_id) => ({ paused: false, forced: false }),
    ...overrides,
  }
}

function setup(services = {}, t, pauseGate, stepGate) {
  const ctx = fakeCtx(services)
  const store = t ? tmpStore(t) : createStore()
  const gate = createGate({ getCtx: () => ctx, getSettings: () => CFG, store, pauseGate })
  const bridge = createBridge(ctx, gate, store, pauseGate, stepGate)
  return { ctx, store, gate, bridge }
}

/** 假 step gate：记录 release / markBypass / requestPause，state 可控。 */
function fakeStepGate({ held = false, since = null, bypass = false, manual = false } = {}) {
  const rec = { released: [], bypassed: [], requested: [] }
  return {
    rec,
    release: (id, reason) => {
      rec.released.push([id, reason])
      return { released: true, reason }
    },
    requestPause: (id) => {
      rec.requested.push(id)
      return { requested: true, held }
    },
    markBypass: (id) => rec.bypassed.push(id),
    state: () => ({ held, step: held ? 2 : null, since, bypass, manual }),
  }
}

test('bridge.state：无 taskControl 时回退路径状态', (t) => {
  const { bridge, gate } = setup({}, t)
  const st = bridge.state('s1')
  assert.equal(st.queueLocked, false)
  assert.equal(st.taskControlAvailable, false)
  assert.equal(st.taskControl, null)
  assert.equal(st.paused, false)
  assert.equal(gate.taskControlAvailable(), false)
})

test('bridge.state：自研 paused + 外部 taskControl 状态共存', (t) => {
  const tc = { state: () => ({ status: 'running', paused: false, forced: false }) }
  const { bridge } = setup({ taskControl: tc }, t, fakePauseGate())
  const st = bridge.state('s1')
  assert.equal(st.taskControlAvailable, true)
  assert.equal(st.taskControl.status, 'running')
  assert.equal(st.paused, false)
})

test('bridge.stopNextTurn 两路都通', async (t) => {
  // 无 pauseGate → 降级锁队列
  const fb = setup({}, t)
  const r1 = await fb.bridge.stopNextTurn('s1')
  assert.equal(r1.via, 'queueLock')
  // 有 pauseGate → 自研真暂停
  const gt = setup({}, t, fakePauseGate())
  const r2 = await gt.bridge.stopNextTurn('s1')
  assert.equal(r2.via, 'pauseGate')
})

test('detectTaskControl / detectSessionGuard', () => {
  assert.equal(detectTaskControl(fakeCtx({ taskControl: {} })), true)
  assert.equal(detectTaskControl(fakeCtx({})), false)
  assert.equal(detectSessionGuard(fakeCtx({ sessionGuard: {} })), true)
  assert.equal(detectSessionGuard(fakeCtx({})), false)
})

test('detectInputTrafficBridge：最小桥标记（client 侧）', () => {
  assert.equal(detectInputTrafficBridge({}), false)
  assert.equal(detectInputTrafficBridge({ __DSH_SESSION_GUARD_BRIDGE__: { stopNextTurn() {} } }), true)
  // 标记在但方法缺失 → 视为不存在（fail-open 走回退）
  assert.equal(detectInputTrafficBridge({ __DSH_SESSION_GUARD_BRIDGE__: {} }), false)
})

// ── task_13：step 门控端口（v0.2.0）──

test('bridge.state：paused 仍为布尔，新增 pausedStep / stepHeldSince / stepBypass / stepManual', (t) => {
  const { bridge } = setup({}, t, fakePauseGate(), fakeStepGate({ held: true, since: 1234 }))
  const st = bridge.state('s1')
  assert.equal(typeof st.paused, 'boolean')
  assert.equal(st.paused, false)
  assert.equal(st.pausedStep, true)
  assert.equal(st.stepHeldSince, 1234)
  assert.equal(st.stepBypass, false)
  assert.equal(st.stepManual, false)
})

test('bridge.state：手动请求未落地时 stepManual 为 true', (t) => {
  const { bridge } = setup({}, t, fakePauseGate(), fakeStepGate({ held: false, manual: true }))
  const st = bridge.state('s1')
  assert.equal(st.pausedStep, false)
  assert.equal(st.stepManual, true)
})

test('bridge.stepPause：委托 requestPause；无门时 fail-open', (t) => {
  const sg = fakeStepGate()
  const { bridge } = setup({}, t, fakePauseGate(), sg)
  assert.deepEqual(bridge.stepPause('s1'), { requested: true, held: false })
  assert.deepEqual(sg.rec.requested, ['s1'])

  const none = setup({}, t, fakePauseGate())
  assert.deepEqual(none.bridge.stepPause('s1'), { requested: false, held: false, reason: 'no-step-gate' })

  const throwing = setup({}, t, fakePauseGate(), {
    requestPause: () => {
      throw new Error('boom')
    },
    release: () => ({ released: false }),
    markBypass: () => {},
    state: () => ({ held: false }),
  })
  assert.deepEqual(throwing.bridge.stepPause('s1'), { requested: false, held: false, reason: 'error' })
})

test('bridge.state：无 stepGate / stepGate 抛错 → 回退默认值（fail-open）', (t) => {
  const plain = setup({}, t, fakePauseGate())
  const st1 = plain.bridge.state('s1')
  assert.equal(st1.pausedStep, false)
  assert.equal(st1.stepHeldSince, null)

  const broken = setup({}, t, fakePauseGate(), {
    release: () => ({ released: false }),
    markBypass: () => {},
    state: () => {
      throw new Error('boom')
    },
  })
  assert.doesNotThrow(() => broken.bridge.state('s1'))
  assert.equal(broken.bridge.state('s1').pausedStep, false)
})

test('bridge.stepResume：默认释放并置 bypass', (t) => {
  const sg = fakeStepGate({ held: true })
  const { bridge } = setup({}, t, fakePauseGate(), sg)
  assert.deepEqual(bridge.stepResume('s1'), { released: true, bypass: true, reason: 'manual' })
  assert.deepEqual(sg.rec.released, [['s1', 'manual']])
  assert.deepEqual(sg.rec.bypassed, ['s1'])
})

test('bridge.stepResume：bypass=false（自动释放）不置 bypass', (t) => {
  const sg = fakeStepGate({ held: true })
  const { bridge } = setup({}, t, fakePauseGate(), sg)
  assert.deepEqual(bridge.stepResume('s1', { bypass: false, reason: 'off-peak' }), {
    released: true,
    bypass: false,
    reason: 'off-peak',
  })
  assert.deepEqual(sg.rec.bypassed, [])
})

test('bridge.stepResume：无门 / 未挂起 / 抛错 → released:false（幂等）', (t) => {
  const none = setup({}, t, fakePauseGate())
  assert.deepEqual(none.bridge.stepResume('s1'), { released: false, bypass: false, reason: 'no-step-gate' })

  const idle = setup({}, t, fakePauseGate(), {
    release: () => ({ released: false, reason: 'manual' }),
    markBypass: () => {},
    state: () => ({ held: false }),
  })
  assert.deepEqual(idle.bridge.stepResume('s1'), { released: false, bypass: false, reason: 'manual' })

  const throwing = setup({}, t, fakePauseGate(), {
    release: () => {
      throw new Error('boom')
    },
    markBypass: () => {},
    state: () => ({ held: false }),
  })
  assert.deepEqual(throwing.bridge.stepResume('s1'), { released: false, bypass: false, reason: 'manual' })
})

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

function setup(services = {}, t, pauseGate) {
  const ctx = fakeCtx(services)
  const store = t ? tmpStore(t) : createStore()
  const gate = createGate({ getCtx: () => ctx, getSettings: () => CFG, store, pauseGate })
  const bridge = createBridge(ctx, gate, store, pauseGate)
  return { ctx, store, gate, bridge }
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

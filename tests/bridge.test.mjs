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

function setup(services = {}, t) {
  const ctx = fakeCtx(services)
  const store = t ? tmpStore(t) : createStore()
  const gate = createGate({ getCtx: () => ctx, getSettings: () => CFG, store })
  const bridge = createBridge(ctx, gate, store)
  return { ctx, store, gate, bridge }
}

test('bridge.state：无 taskControl 时回退路径状态', (t) => {
  const { bridge } = setup({}, t)
  const st = bridge.state('s1')
  assert.equal(st.queueLocked, false)
  assert.equal(st.taskControlAvailable, false)
  assert.equal(st.taskControl, null)
})

test('bridge.state：taskControl 在时暴露其状态', (t) => {
  const tc = { state: () => ({ status: 'running', paused: false, forced: false }) }
  const { bridge } = setup({ taskControl: tc }, t)
  const st = bridge.state('s1')
  assert.equal(st.taskControlAvailable, true)
  assert.equal(st.taskControl.status, 'running')
})

test('bridge.stopNextTurn 两路都通', async (t) => {
  // 无 taskControl → 锁队列
  const fb = setup({}, t)
  const r1 = await fb.bridge.stopNextTurn('s1')
  assert.equal(r1.via, 'queueLock')
  // 有 taskControl → 透传
  const tc = { pause: async (id) => ({ ok: true, paused: id }) }
  const gt = setup({ taskControl: tc }, t)
  const r2 = await gt.bridge.stopNextTurn('s1')
  assert.equal(r2.via, 'taskControl')
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

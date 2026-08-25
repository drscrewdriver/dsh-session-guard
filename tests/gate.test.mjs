/**
 * gate.js + store.js 测试：自研会话门主路径（pauseGate）+ 回退锁队列 + fail-open。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore, idleState } from '../src/store.js'
import { createGate } from '../src/gate.js'

/** 内存 fake ctx（get 返回可注入的服务）。 */
function fakeCtx(services) {
  return {
    get(name) {
      return services[name]
    },
  }
}

const CFG = {
  enabled: true,
  weekendMode: true,
  timezone: 'Asia/Shanghai',
  peakWindows: [],
  pauseMode: 'safe',
  pauseReason: 'wait',
  queueFallback: true,
}

/** 假自研会话门（可覆盖 pause/resume 行为）。 */
function fakePauseGate(overrides = {}) {
  return {
    pause: (_id, _opts) => ({ kind: 'success', text: 'paused' }),
    resume: (_id, _opts) => ({ kind: 'success', text: 'resumed' }),
    cancel: () => ({ kind: 'success', text: 'cancelled' }),
    taskControlAvailable: () => true,
    ...overrides,
  }
}

/** 每测试独立临时状态目录。 */
function tmpStore(t) {
  const dir = mkdtempSync(join(tmpdir(), 'session-guard-test-'))
  const old = process.env.DSH_SESSION_GUARD_STATE_DIR
  process.env.DSH_SESSION_GUARD_STATE_DIR = dir
  t.after(() => {
    rmSync(dir, { recursive: true, force: true })
    if (old === undefined) delete process.env.DSH_SESSION_GUARD_STATE_DIR
    else process.env.DSH_SESSION_GUARD_STATE_DIR = old
  })
  return createStore()
}

test('有 pauseGate → stopNextTurn 走自研真暂停（via pauseGate）', async (t) => {
  const store = tmpStore(t)
  const calls = []
  const pg = fakePauseGate({ pause: (id, opts) => { calls.push([id, opts]); return { kind: 'success' } } })
  const gate = createGate({ getCtx: () => fakeCtx({}), getSettings: () => CFG, store, pauseGate: pg })
  const r = await gate.stopNextTurn('s1')
  assert.equal(r.via, 'pauseGate')
  assert.equal(r.ok, true)
  assert.deepEqual(calls[0], ['s1', { mode: 'safe', reason: 'wait' }])
  // 走自研真暂停则不写 queueLock
  assert.equal(store.get('s1'), null)
})

test('有 pauseGate → resume 走自研真恢复（confirm + choice）', async (t) => {
  const store = tmpStore(t)
  const calls = []
  const pg = fakePauseGate({ resume: (id, opts) => { calls.push([id, opts]); return { kind: 'success' } } })
  const gate = createGate({ getCtx: () => fakeCtx({}), getSettings: () => CFG, store, pauseGate: pg })
  await gate.resume('s1', { choice: 'skip' })
  assert.deepEqual(calls[0], ['s1', { confirm: true, choice: 'skip' }])
})

test('pauseGate.pause 返回 error（如 agent 不可用）→ fail-open 降级锁队列', async (t) => {
  const store = tmpStore(t)
  const events = []
  const pg = fakePauseGate({ pause: () => ({ kind: 'error', text: 'no live agent' }) })
  const gate = createGate({
    getCtx: () => fakeCtx({}),
    getSettings: () => CFG,
    store,
    pauseGate: pg,
    emit: (ev, id, payload) => events.push(payload === undefined ? [ev, id] : [ev, id, payload]),
  })
  const r = await gate.stopNextTurn('s1')
  assert.equal(r.via, 'queueLock')
  assert.equal(r.ok, true)
  assert.equal(store.get('s1').queueLocked, true)
  assert.equal(store.get('s1').lockReason, 'peak')
  assert.deepEqual(events[0], ['queue-lock', 's1', { reason: 'peak' }])
})

test('无 pauseGate → 回退锁队列（fail-open，D3/D5）', async (t) => {
  const store = tmpStore(t)
  const events = []
  const gate = createGate({
    getCtx: () => fakeCtx({}),
    getSettings: () => CFG,
    store,
    emit: (ev, id, payload) => events.push(payload === undefined ? [ev, id] : [ev, id, payload]),
  })
  const r = await gate.stopNextTurn('s1')
  assert.equal(r.via, 'queueLock')
  assert.equal(r.ok, true)
  assert.equal(store.get('s1').queueLocked, true)
  assert.equal(store.get('s1').lockReason, 'peak')
  assert.deepEqual(events[0], ['queue-lock', 's1', { reason: 'peak' }])
  const r2 = await gate.resume('s1')
  assert.equal(r2.via, 'queueLock')
  assert.equal(store.get('s1').queueLocked, false)
  assert.deepEqual(events[1], ['queue-unlock', 's1'])
})

test('无 pauseGate 且 queueFallback=false → 不锁队列（如实上报）', async (t) => {
  const store = tmpStore(t)
  const gate = createGate({
    getCtx: () => fakeCtx({}),
    getSettings: () => ({ ...CFG, queueFallback: false }),
    store,
  })
  const r = await gate.stopNextTurn('s1')
  assert.equal(r.ok, false)
  assert.equal(r.via, 'queueLock')
  assert.equal(store.get('s1'), null)
})

test('lockQueue / unlockQueue 显式锁（bridge 手动路径）', async (t) => {
  const store = tmpStore(t)
  const gate = createGate({ getCtx: () => fakeCtx({}), getSettings: () => CFG, store })
  gate.lockQueue('s1', 'manual')
  assert.equal(store.get('s1').queueLocked, true)
  gate.unlockQueue('s1')
  assert.equal(store.get('s1').queueLocked, false)
})

test('idleState 基线', () => {
  const s = idleState('s1')
  assert.equal(s.queueLocked, false)
  assert.equal(s.lockReason, null)
})

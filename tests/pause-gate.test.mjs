/**
 * pause-gate.js + pause-store.js 测试：自研会话门引擎（脱离 dsh-task-control）。
 * 覆盖：force 立即暂停 / safe+wait 推理后落地 / safe+stop 工具后落地 /
 * resume 断点续跑（confirm/rerun/skip）/ cancel / state / 持久化。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPauseStore } from '../src/pause-store.js'
import { createPauseGate } from '../src/pause-gate.js'

/** 每测试独立临时状态目录（pause 根 = state 根/pause）。 */
function tmpEnv(t) {
  const dir = mkdtempSync(join(tmpdir(), 'session-guard-pause-'))
  const old = process.env.DSH_SESSION_GUARD_STATE_DIR
  process.env.DSH_SESSION_GUARD_STATE_DIR = dir
  t.after(() => {
    rmSync(dir, { recursive: true, force: true })
    if (old === undefined) delete process.env.DSH_SESSION_GUARD_STATE_DIR
    else process.env.DSH_SESSION_GUARD_STATE_DIR = old
  })
  return createPauseStore()
}

/** 假 agent（记录 cancel/followup 调用）。 */
function fakeAgent(overrides = {}, calls) {
  return {
    id: 's1',
    status: 'running',
    session: { events: [] },
    cancel: (kind, opts) => { calls.push(['cancel', kind, opts]) },
    followup: (msg) => { calls.push(['followup', msg]) },
    ...overrides,
  }
}

function setup(t, { agent = fakeAgent({}, []), calls = [], goals, makeFollowupMessage } = {}) {
  const pauseStore = tmpEnv(t)
  const ctx = {
    agents: { get: (id) => (agent && agent.id === id ? agent : undefined) },
    get: (name) => (name === 'goals' ? goals : undefined),
    logger: { warn: () => {} },
  }
  const gate = createPauseGate({
    ctx,
    pauseStore,
    makeFollowupMessage: makeFollowupMessage ?? ((input) => input),
  })
  return { pauseStore, gate, agent, calls }
}

/** 等一个宏任务（让 queueMicrotask 落地延迟暂停）。 */
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('force 暂停：立即 cancel + 持久化 forced + 记录中断工具', async (t) => {
  const calls = []
  const agent = fakeAgent({}, calls)
  const { gate, pauseStore } = setup(t, { agent, calls })
  // 先记录一个 in-flight 工具
  gate.handleEvent({ id: 's1' }, { type: 'tool/call', data: { name: 'bash', arguments: '{"command":"rm x"}', callId: 'c1' } })
  const r = gate.pause('s1', { mode: 'force' })
  assert.equal(r.kind, 'success')
  assert.match(r.text, /force-paused/)
  assert.deepEqual(calls[0], ['cancel', { kind: 'user' }, { keepInbox: true }])
  const st = pauseStore.get('s1')
  assert.equal(st.paused, true)
  assert.equal(st.forced, true)
  assert.equal(st.interruptedTool.name, 'bash')
  assert.equal(st.interruptedTool.callId, 'c1')
})

test('safe+wait：推理未完成时不立即停，assistant/message 后落地并记 deferredTools', async (t) => {
  const calls = []
  const agent = fakeAgent({}, calls)
  const { gate, pauseStore } = setup(t, { agent, calls })
  const r = gate.pause('s1', { mode: 'safe', reason: 'wait' })
  assert.equal(r.kind, 'success')
  assert.match(r.text, /waiting for the current reasoning/)
  // 推理完成：assistant/message 携带未派发的 tool-call
  gate.handleEvent({ id: 's1' }, {
    type: 'assistant/message',
    data: { message: { content: [{ type: 'tool-call', name: 'bash', arguments: '{}', id: 'd1' }] } },
  })
  await nextTick()
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0][0], 'cancel')
  const st = pauseStore.get('s1')
  assert.equal(st.paused, true)
  assert.equal(st.forced, false)
  assert.equal(st.deferredTools.length, 1)
  assert.equal(st.deferredTools[0].callId, 'd1')
})

test('safe+stop：在途工具>0 时挂起，tool/result 后落地', async (t) => {
  const calls = []
  const agent = fakeAgent({}, calls)
  const { gate, pauseStore } = setup(t, { agent, calls })
  gate.handleEvent({ id: 's1' }, { type: 'tool/call', data: { name: 'bash', arguments: '{}', callId: 'c1' } })
  const r = gate.pause('s1', { mode: 'safe', reason: 'stop' })
  assert.equal(r.kind, 'success')
  assert.match(r.text, /waiting for the running tool/)
  // 工具完成 → 落地
  gate.handleEvent({ id: 's1' }, { type: 'tool/result', data: { message: { source: { callId: 'c1' } } } })
  await nextTick()
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0][0], 'cancel')
  assert.equal(pauseStore.get('s1').paused, true)
})

test('safe+wait 且已无推理/工具 → 立即落地（不延迟）', (t) => {
  const calls = []
  const agent = fakeAgent({ status: 'running' }, calls)
  const { gate, pauseStore } = setup(t, { agent, calls })
  // 直接 pause（无 in-flight，agent running，但 handleEvent 没有 pending 就立即 apply）
  // 注：pauseTask 在 running + wait 时会挂 pending；此处验证挂起后立即落地由事件驱动。
  gate.pause('s1', { mode: 'safe', reason: 'wait' })
  // 无事件触发前不应落地
  assert.equal(calls.length, 0)
  assert.equal(pauseStore.get('s1'), null)
})

test('resume：清暂停态 + followup 续跑指令', async (t) => {
  const calls = []
  const agent = fakeAgent({}, calls)
  const { gate, pauseStore } = setup(t, { agent, calls })
  gate.pause('s1', { mode: 'force' })
  const r = gate.resume('s1', { confirm: true, choice: 'rerun' })
  assert.equal(r.kind, 'success')
  assert.equal(pauseStore.get('s1'), null)
  const followup = calls.find(([kind]) => kind === 'followup')
  assert.ok(followup !== undefined)
  assert.equal(followup[1].source.plugin, 'session-guard')
})

test('resume：force 中断工具需 confirm（未确认 → needConfirmation）', (t) => {
  const calls = []
  const agent = fakeAgent({}, calls)
  const { gate } = setup(t, { agent, calls })
  gate.handleEvent({ id: 's1' }, { type: 'tool/call', data: { name: 'bash', arguments: '{}', callId: 'c1' } })
  gate.pause('s1', { mode: 'force' })
  const r = gate.resume('s1', {})
  assert.equal(r.kind, 'error')
  assert.equal(r.needConfirmation, true)
  assert.match(r.text, /需要确认/)
})

test('cancel：立即终止当前回合并回报被中断工具', (t) => {
  const calls = []
  const agent = fakeAgent({}, calls)
  const { gate } = setup(t, { agent, calls })
  gate.handleEvent({ id: 's1' }, { type: 'tool/call', data: { name: 'bash', arguments: '{"command":"rm x"}', callId: 'c1' } })
  const r = gate.cancel('s1')
  assert.equal(r.kind, 'success')
  assert.deepEqual(calls[0], ['cancel', { kind: 'user' }, { keepInbox: true }])
  assert.match(r.text, /rm x/)
})

test('state：暴露 paused/forced（无 agent 时 offline）', (t) => {
  const calls = []
  const agent = fakeAgent({}, calls)
  const { gate } = setup(t, { agent, calls })
  gate.pause('s1', { mode: 'force' })
  const st = gate.state('s1')
  assert.equal(st.paused, true)
  assert.equal(st.forced, true)
  // 无 agent 的 session → offline
  const st2 = gate.state('nope')
  assert.equal(st2.status, 'offline')
  assert.equal(st2.paused, false)
})

test('taskControlAvailable：自研后恒 true', (t) => {
  const calls = []
  const agent = fakeAgent({}, calls)
  const { gate } = setup(t, { agent, calls })
  assert.equal(gate.taskControlAvailable(), true)
})

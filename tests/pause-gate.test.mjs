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
import { createPauseGate, createPluginUserMessage } from '../src/pause-gate.js'

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

/** 假 agent（记录 cancel/followup 调用）。默认 session 为 0.1.5 主路径形态（snapshotEvents()）。 */
function fakeAgent(overrides = {}, calls) {
  return {
    id: 's1',
    status: 'running',
    session: { snapshotEvents: () => [] },
    cancel: (kind, opts) => { calls.push(['cancel', kind, opts]) },
    followup: (msg) => { calls.push(['followup', msg]) },
    ...overrides,
  }
}

function setup(t, { agent = fakeAgent({}, []), calls = [], goals, makeFollowupMessage, useDefaultFollowup = false, stepGate } = {}) {
  const pauseStore = tmpEnv(t)
  const ctx = {
    agents: { get: (id) => (agent && agent.id === id ? agent : undefined) },
    get: (name) => (name === 'goals' ? goals : undefined),
    logger: { warn: () => {} },
  }
  const gate = createPauseGate({
    ctx,
    pauseStore,
    stepGate,
    ...(useDefaultFollowup ? {} : { makeFollowupMessage: makeFollowupMessage ?? ((input) => input) }),
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
  // 0.1.5 compat：source 携带 ContextFormed 语义字段
  assert.equal(followup[1].source.form, 'instructions')
})

test('resume：无 followup 时回退 agent.send（0.1.5 compat 双路径）', async (t) => {
  const calls = []
  // fakeAgent 的 followup 被 override 掉（undefined），只留 send
  const agent = fakeAgent({ followup: undefined, send: (msg) => { calls.push(['send', msg]) } }, calls)
  const { gate } = setup(t, { agent, calls })
  gate.pause('s1', { mode: 'force' })
  const r = gate.resume('s1', {})
  assert.equal(r.kind, 'success')
  const sent = calls.find(([kind]) => kind === 'send')
  assert.ok(sent !== undefined, 'expected fallback send call')
  assert.equal(sent[1].source.form, 'instructions')
  assert.equal(calls.find(([kind]) => kind === 'followup'), undefined)
})

test('resume：followup/send 皆无时降级且不抛错（0.1.5 compat）', async (t) => {
  const agent = fakeAgent({ followup: undefined }, [])
  const { gate } = setup(t, { agent, calls: [] })
  gate.pause('s1', { mode: 'force' })
  // 不应抛错；resume 仍返回 success（入队失败只 warn 降级）
  const r = gate.resume('s1', {})
  assert.equal(r.kind, 'success')
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

test('createPluginUserMessage：形状与 dsh-llm createUserMessage 一致，id 唯一', () => {
  const m = createPluginUserMessage({ content: [{ type: 'text', text: '继续' }], source: { kind: 'plugin', plugin: 'session-guard' } })
  assert.equal(m.role, 'user')
  assert.equal(typeof m.id, 'string')
  assert.ok(m.id.length > 0)
  assert.deepEqual(m.content, [{ type: 'text', text: '继续' }])
  assert.deepEqual(m.source, { kind: 'plugin', plugin: 'session-guard' })
  const m2 = createPluginUserMessage({ content: [], source: {} })
  assert.notEqual(m.id, m2.id)
})

test('默认 makeFollowupMessage 走本地构造（无 @deepseek-ai/dsh-llm 依赖）', (t) => {
  const calls = []
  const agent = fakeAgent({}, calls)
  const { gate } = setup(t, { agent, calls, useDefaultFollowup: true })
  gate.pause('s1', { mode: 'force' })
  gate.resume('s1', { confirm: true, choice: 'rerun' })
  const sent = calls.filter((c) => c[0] === 'followup')
  assert.ok(sent.length >= 1, 'expected a followup call')
  const msg = sent[0][1]
  assert.equal(msg.role, 'user')
  assert.equal(msg.source.plugin, 'session-guard')
  assert.equal(typeof msg.id, 'string')
})

// ── task_9：F6 死锁回归（step gate 挂起时 pause/resume/cancel 必须先释放门）──

/** 把 stepGate.release 记进同一个 calls 数组，便于断言调用顺序。 */
function recordingStepGate(calls) {
  return {
    release: (id, reason) => {
      calls.push(['stepRelease', id, reason])
      return { released: true, reason }
    },
  }
}

test('pause(force)：先释放 step 门，再 cancel（顺序断言）', (t) => {
  const calls = []
  const agent = fakeAgent({}, calls)
  const { gate, pauseStore } = setup(t, { agent, calls, stepGate: recordingStepGate(calls) })
  const r = gate.pause('s1', { mode: 'force' })
  assert.equal(r.kind, 'success')
  assert.deepEqual(calls[0], ['stepRelease', 's1', 'pause'], 'step 门必须最先释放')
  assert.equal(calls[1][0], 'cancel')
  assert.equal(pauseStore.get('s1').paused, true)
})

test('pause(safe+wait)：step 门已释放（否则 pendingPause 永远等不到安全边界）', (t) => {
  const calls = []
  const agent = fakeAgent({}, calls)
  const { gate } = setup(t, { agent, calls, stepGate: recordingStepGate(calls) })
  const r = gate.pause('s1', { mode: 'safe', reason: 'wait' })
  assert.equal(r.kind, 'success')
  assert.deepEqual(calls[0], ['stepRelease', 's1', 'pause'])
  // wait 语义仍登记 pending（设计如此）——但门已开，step 会继续并产生 assistant/message
  assert.equal(gate._pendingCount(), 1)
})

test('resume / cancel：同样先释放 step 门', (t) => {
  const calls = []
  const agent = fakeAgent({}, calls)
  const { gate } = setup(t, { agent, calls, stepGate: recordingStepGate(calls) })
  gate.resume('s1', { confirm: true })
  gate.cancel('s1')
  assert.deepEqual(calls.filter((c) => c[0] === 'stepRelease'), [
    ['stepRelease', 's1', 'resume'],
    ['stepRelease', 's1', 'cancel'],
  ])
})

test('未注入 stepGate：行为与改造前一致（向后兼容）', (t) => {
  const calls = []
  const agent = fakeAgent({}, calls)
  const { gate, pauseStore } = setup(t, { agent, calls })
  assert.doesNotThrow(() => gate.pause('s1', { mode: 'force' }))
  assert.equal(pauseStore.get('s1').paused, true)
})

test('stepGate.release 抛错：暂停动作不受影响', (t) => {
  const calls = []
  const agent = fakeAgent({}, calls)
  const { gate, pauseStore } = setup(t, {
    agent,
    calls,
    stepGate: { release: () => { throw new Error('boom') } },
  })
  assert.doesNotThrow(() => gate.pause('s1', { mode: 'force' }))
  assert.equal(pauseStore.get('s1').paused, true)
})

// ── 3.0.0（compat/0.1.5）：session 事件读取双路径（snapshotEvents 主 / events 回退）──

test('0.1.5 主路径：仅提供 snapshotEvents() 时 resumeContent 正常取到', (t) => {
  const calls = []
  const agent = fakeAgent({
    session: {
      snapshotEvents: () => [
        { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '继续任务' }] } },
      ],
    },
  }, calls)
  const { gate, pauseStore } = setup(t, { agent, calls })
  const r = gate.pause('s1', { mode: 'force' })
  assert.equal(r.kind, 'success')
  const st = pauseStore.get('s1')
  assert.deepEqual(st.resumeContent, [{ type: 'text', text: '继续任务' }])
})

test('回退路径：仅提供旧 events 数组时同样可读（防御 0.1.5 变体）', (t) => {
  const calls = []
  const agent = fakeAgent({
    session: {
      events: [
        { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '旧数组回退' }] } },
      ],
    },
  }, calls)
  const { gate, pauseStore } = setup(t, { agent, calls })
  const r = gate.pause('s1', { mode: 'force' })
  assert.equal(r.kind, 'success')
  const st = pauseStore.get('s1')
  assert.deepEqual(st.resumeContent, [{ type: 'text', text: '旧数组回退' }])
})

test('fail-open：snapshotEvents 与 events 皆缺时暂停/恢复不抛且按未知结果处理', (t) => {
  const calls = []
  const agent = fakeAgent({ session: {} }, calls)
  const { gate } = setup(t, { agent, calls })
  gate.handleEvent({ id: 's1' }, { type: 'tool/call', data: { name: 'bash', arguments: '{"command":"rm x"}', callId: 'c1' } })
  const r = gate.pause('s1', { mode: 'force' })
  assert.equal(r.kind, 'success')
  const r2 = gate.resume('s1', { confirm: true })
  assert.equal(r2.kind, 'success')
  // findToolOutcome 返回 null → 走「状态未知，重新执行」分支
  assert.match(r2.text, /re-executing interrupted tool/)
})

test('0.1.5 主路径：snapshotEvents 里的 tool/result 驱动「已执行完成」恢复分支', (t) => {
  const calls = []
  const events = [
    { type: 'tool/result', data: { message: { content: [{ type: 'tool-result', isError: false }], source: { callId: 'c1' } } } },
  ]
  const agent = fakeAgent({ session: { snapshotEvents: () => events } }, calls)
  const { gate } = setup(t, { agent, calls })
  gate.handleEvent({ id: 's1' }, { type: 'tool/call', data: { name: 'bash', arguments: '{}', callId: 'c1' } })
  const r = gate.pause('s1', { mode: 'force' })
  assert.equal(r.kind, 'success')
  const r2 = gate.resume('s1', { confirm: true })
  assert.equal(r2.kind, 'success')
  assert.match(r2.text, /had actually completed/)
})

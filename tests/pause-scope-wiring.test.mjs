/**
 * 暂停资源范围接线测试（Phase 6）——仿真 jobs/subagents 服务驱动真实 createPauseGate()。
 *
 * 照上游做法：**用仿真 Host 直接驱动真实代码路径**，断言的是「真实跑出来的输出」，
 * 不是读代码推断。核心断言：kill 参数含本会话 id、shield 先于 kill、interruptByUser 被调用、
 * 四态写进快照、开关关闭即整维度不动、服务缺失降级为 unsupported 且暂停照常完成。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPauseGate } from '../src/pause-gate.js'

const immediateSleep = async () => {}

/** 内存版 pauseStore（不碰磁盘）。 */
function memStore() {
  const m = new Map()
  return {
    get: (id) => (m.has(id) ? m.get(id) : null),
    set: (id, v) => { m.set(id, v) },
    clear: (id) => { m.delete(id) },
    current: (id) => m.get(id) ?? { sessionId: String(id), paused: false },
  }
}

/** 仿真 jobs 服务：list 返回本会话 owned 活跃 job；kill 后从活跃集移除；调用按序记入 log。 */
function fakeJobs({ jobs = [], failKill = null } = {}) {
  const log = []
  const active = new Map(jobs.map((j) => [j.id, { ...j }]))
  return {
    log,
    list: async (caller) => {
      log.push(['list', caller])
      return [...active.values()].map((j) => ({ id: j.id, status: j.status, owner: { id: caller } }))
    },
    wait: (id, ms, caller) => { log.push(['shield', id, caller]); return Promise.resolve() },
    kill: (id, caller, reason) => {
      log.push(['kill', id, caller, reason])
      if (failKill && failKill.includes(id)) throw new Error('JOB_FOREIGN_SESSION')
      active.delete(id)
      return {}
    },
  }
}

/** 仿真 subagents 服务。 */
function fakeSubagents({ children = [], failInterrupt = null } = {}) {
  const log = []
  const alive = new Set(children)
  return {
    log,
    listDescendants: async () => ({ descendants: [...alive].map((id) => ({ sessionId: id })) }),
    interruptByUser: (id) => {
      log.push(['interrupt', id])
      if (failInterrupt && failInterrupt.includes(id)) throw new Error('nope')
      alive.delete(id)
      return { accepted: true }
    },
  }
}

function buildGate({ jobsSvc, subagentsSvc, cfg, agentStatus = 'idle' }) {
  const pauseStore = memStore()
  const agent = { id: 's1', status: agentStatus, cancel: () => {}, session: { snapshotEvents: () => [] } }
  const ctx = {
    agents: { get: (id) => (id === 's1' ? agent : undefined), list: () => [agent] },
    logger: { info: () => {}, warn: () => {} },
    on: () => () => {},
    get: () => undefined,
  }
  const scope = { jobsSvc, subagentsSvc, cfg, sleep: immediateSleep }
  const gate = createPauseGate({ ctx, pauseStore, getScope: () => scope })
  return { gate, pauseStore }
}

test('安全边界暂停：kill 用本会话 caller、shield 先于 kill、四态写进快照', async () => {
  const jobsSvc = fakeJobs({ jobs: [{ id: 'j1', status: 'running' }, { id: 'j2', status: 'stopping' }] })
  const subagentsSvc = fakeSubagents({ children: ['c1'] })
  const { gate, pauseStore } = buildGate({
    jobsSvc,
    subagentsSvc,
    cfg: { pauseStopsJobs: true, pauseStopsChildren: true, pauseScopeDrainMs: 3000 },
  })

  const r = gate.pause('s1', { mode: 'safe', reason: 'stop' })
  assert.equal(r.kind, 'success')
  if (r.scopeReady) await r.scopeReady

  // kill 参数含本会话 id + reason
  const kills = jobsSvc.log.filter((e) => e[0] === 'kill')
  assert.deepEqual(kills.map((e) => [e[1], e[2], e[3]]), [
    ['j1', 's1', 'session-guard:pause'],
    ['j2', 's1', 'session-guard:pause'],
  ])
  // shield 先于 kill
  const firstShield = jobsSvc.log.findIndex((e) => e[0] === 'shield')
  const firstKill = jobsSvc.log.findIndex((e) => e[0] === 'kill')
  assert.ok(firstShield >= 0 && firstKill >= 0 && firstShield < firstKill, 'shield 必须早于 kill')
  // interruptByUser 被调用
  assert.deepEqual(subagentsSvc.log.filter((e) => e[0] === 'interrupt').map((e) => e[1]), ['c1'])
  // 四态进快照
  const snap = pauseStore.get('s1')
  assert.ok(snap && snap.paused === true)
  assert.deepEqual(snap.scope.killedJobs.sort(), ['j1', 'j2'])
  assert.deepEqual(snap.scope.interruptedChildren, ['c1'])
  assert.deepEqual(snap.scope.unknown, [])
  assert.equal(snap.scope.partial, false)
})

test('停不掉的 job 进 unknown 且 partial=true（不写「干净暂停」）', async () => {
  // j2 kill 抛错，且 list 仍会返回它（模拟停不掉）
  const log = []
  const active = new Map([['j1', { id: 'j1', status: 'running' }], ['j2', { id: 'j2', status: 'running' }]])
  const jobsSvc = {
    list: async (caller) => { log.push(['list', caller]); return [...active.values()].map((j) => ({ id: j.id, status: j.status, owner: { id: caller } })) },
    wait: () => Promise.resolve(),
    kill: (id) => { if (id === 'j2') throw new Error('stuck'); active.delete(id); return {} },
  }
  const { gate, pauseStore } = buildGate({
    jobsSvc,
    subagentsSvc: undefined,
    cfg: { pauseStopsJobs: true, pauseStopsChildren: false },
  })
  const r = gate.pause('s1', { mode: 'force' })
  if (r.scopeReady) await r.scopeReady
  const snap = pauseStore.get('s1')
  assert.deepEqual(snap.scope.killedJobs, ['j1'])
  assert.ok(snap.scope.unknown.includes('j2'), 'j2 停不掉必须进 unknown')
  assert.equal(snap.scope.partial, true)
})

test('pauseStopsJobs=false：整个 jobs 维度不动（list 都不调）', async () => {
  const jobsSvc = fakeJobs({ jobs: [{ id: 'j1', status: 'running' }] })
  const { gate, pauseStore } = buildGate({
    jobsSvc,
    subagentsSvc: fakeSubagents({ children: ['c1'] }),
    cfg: { pauseStopsJobs: false, pauseStopsChildren: true },
  })
  const r = gate.pause('s1', { mode: 'force' })
  if (r.scopeReady) await r.scopeReady
  assert.equal(jobsSvc.log.some((e) => e[0] === 'list' || e[0] === 'kill'), false, '关掉后不得 list/kill jobs')
  const snap = pauseStore.get('s1')
  assert.deepEqual(snap.scope.killedJobs, [])
  assert.deepEqual(snap.scope.interruptedChildren, ['c1'])
})

test('pauseStopsChildren=false：整个子会话维度不动', async () => {
  const sub = fakeSubagents({ children: ['c1'] })
  const { gate } = buildGate({
    jobsSvc: fakeJobs({ jobs: [] }),
    subagentsSvc: sub,
    cfg: { pauseStopsJobs: true, pauseStopsChildren: false },
  })
  const r = gate.pause('s1', { mode: 'force' })
  if (r.scopeReady) await r.scopeReady
  assert.equal(sub.log.some((e) => e[0] === 'interrupt'), false)
})

test('服务缺失（jobs/subagents 皆无）：暂停照常完成、标 unsupported、不抛错', async () => {
  const pauseStore = memStore()
  const agent = { id: 's1', status: 'running', cancel: () => {}, session: { snapshotEvents: () => [] } }
  const ctx = { agents: { get: () => agent, list: () => [agent] }, logger: { info: () => {}, warn: () => {} }, on: () => () => {}, get: () => undefined }
  const gate = createPauseGate({ ctx, pauseStore, getScope: () => ({ jobsSvc: undefined, subagentsSvc: undefined, cfg: {}, sleep: immediateSleep }) })
  const r = gate.pause('s1', { mode: 'force' })
  assert.equal(r.kind, 'success')
  if (r.scopeReady) await r.scopeReady
  const snap = pauseStore.get('s1')
  assert.ok(Array.isArray(snap.scope.unsupported) && snap.scope.unsupported.length > 0, '无能力维度应标 unsupported')
  assert.equal(snap.scope.partial, false, 'unsupported 不等于 partial/unknown')
})

test('未接线 getScope（默认 undefined）：pause 行为与改造前一致，scope 为 null', () => {
  const pauseStore = memStore()
  const agent = { id: 's1', status: 'running', cancel: () => {}, session: { snapshotEvents: () => [] } }
  const ctx = { agents: { get: () => agent }, logger: { info: () => {}, warn: () => {} }, on: () => () => {}, get: () => undefined }
  const gate = createPauseGate({ ctx, pauseStore }) // 无 getScope
  const r = gate.pause('s1', { mode: 'force' })
  assert.equal(r.kind, 'success')
  assert.equal(r.scopeReady, null)
  assert.equal(pauseStore.get('s1').scope, null)
})

test('task_19 顺带修：describeToolPurpose 对 pwsh 也走「运行命令」文案（不再退化 JSON）', () => {
  const pauseStore = memStore()
  const agent = { id: 's1', status: 'running', cancel: () => {}, session: { snapshotEvents: () => [] } }
  const ctx = { agents: { get: () => agent }, get: () => undefined, logger: { warn: () => {}, info: () => {} }, on: () => () => {} }
  const gate = createPauseGate({ ctx, pauseStore })
  gate.handleEvent({ id: 's1' }, { type: 'tool/call', data: { name: 'pwsh', arguments: '{"command":"Get-Process"}', callId: 'p1' } })
  const r = gate.pause('s1', { mode: 'force' })
  assert.equal(r.kind, 'success')
  assert.match(r.text, /运行命令：Get-Process/, 'pwsh 应走命令文案分支')
  // bash 仍走同一分支（回归）
  gate.handleEvent({ id: 's1' }, { type: 'tool/call', data: { name: 'bash', arguments: '{"command":"ls -la"}', callId: 'b1' } })
  assert.match(gate.state('s1').interruptedTool.name, /bash|pwsh/)
})

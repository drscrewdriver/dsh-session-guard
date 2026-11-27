/**
 * resource-scope.js 单测：四态聚合 / 有界 drain / 服务探测薄边界。
 * 只测判定与 IO 形状，真实接线另见 pause-scope-wiring.test.mjs。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyScope,
  settleScope,
  drainScope,
  listOwnedJobs,
  listActiveChildren,
  armShields,
  stopJobs,
  stopChildren,
  ACTIVE_JOB_STATUSES,
} from '../src/resource-scope.js'

const immediateSleep = async () => {}

// ── emptyScope / 口径 ──

test('emptyScope 形状与活跃口径常量', () => {
  const s = emptyScope()
  assert.deepEqual(s, { killedJobs: [], interruptedChildren: [], unknown: [], unsupported: [], partial: false })
  assert.deepEqual([...ACTIVE_JOB_STATUSES], ['running', 'stopping'])
})

// ── settleScope 四态聚合 ──

test('settleScope：killed 按 kind 分流到 killedJobs / interruptedChildren', () => {
  const s = settleScope([
    { kind: 'job', id: 'j1', outcome: 'killed' },
    { kind: 'job', id: 'j2', outcome: 'killed' },
    { kind: 'child', id: 'c1', outcome: 'killed' },
  ])
  assert.deepEqual(s.killedJobs, ['j1', 'j2'])
  assert.deepEqual(s.interruptedChildren, ['c1'])
  assert.deepEqual(s.unknown, [])
  assert.equal(s.partial, false)
})

test('settleScope：handoff / unknown 都进 unknown 并置 partial', () => {
  const s = settleScope([
    { kind: 'job', id: 'j1', outcome: 'killed' },
    { kind: 'job', id: 'j2', outcome: 'handoff' },
    { kind: 'child', id: 'c1', outcome: 'unknown' },
  ])
  assert.deepEqual(s.killedJobs, ['j1'])
  assert.deepEqual(s.unknown, ['j2', 'c1'])
  assert.equal(s.partial, true)
})

test('settleScope：unsupported 归 unsupported，不与 unknown 混淆', () => {
  const s = settleScope([
    { kind: 'jobs', outcome: 'unsupported' },
    { kind: 'child', id: 'c1', outcome: 'killed' },
  ])
  assert.deepEqual(s.unsupported, ['jobs'])
  assert.deepEqual(s.unknown, [])
  assert.deepEqual(s.interruptedChildren, ['c1'])
  assert.equal(s.partial, false)
})

test('settleScope：去重 + 未知 outcome 保守进 unknown', () => {
  const s = settleScope([
    { kind: 'job', id: 'j1', outcome: 'killed' },
    { kind: 'job', id: 'j1', outcome: 'killed' },
    { kind: 'job', id: 'j9', outcome: 'weird' },
  ])
  assert.deepEqual(s.killedJobs, ['j1'])
  assert.deepEqual(s.unknown, ['j9'])
  assert.equal(s.partial, true)
})

// ── drainScope 有界轮询 ──

test('drainScope：全成功（首轮即终态）', async () => {
  const out = await drainScope([{ id: 'a' }, { id: 'b' }], { isTerminal: () => true, sleep: immediateSleep })
  assert.equal(out.settled.length, 2)
  assert.equal(out.timedOut.length, 0)
})

test('drainScope：部分超时（a 终态、b 一直活跃）', async () => {
  const out = await drainScope([{ id: 'a' }, { id: 'b' }], {
    isTerminal: (t) => t.id === 'a',
    rounds: 3,
    sleep: immediateSleep,
  })
  assert.deepEqual(out.settled.map((t) => t.id), ['a'])
  assert.deepEqual(out.timedOut.map((t) => t.id), ['b'])
})

test('drainScope：全超时', async () => {
  const out = await drainScope([{ id: 'a' }], { isTerminal: () => false, rounds: 2, sleep: immediateSleep })
  assert.equal(out.settled.length, 0)
  assert.equal(out.timedOut.length, 1)
})

test('drainScope：空目标不轮询', async () => {
  let probed = 0
  const out = await drainScope([], { isTerminal: () => { probed += 1; return true }, sleep: immediateSleep })
  assert.equal(probed, 0)
  assert.deepEqual(out, { settled: [], timedOut: [] })
})

test('drainScope：第 2 轮才终态也算 settled（轮内多次判定）', async () => {
  let calls = 0
  const out = await drainScope([{ id: 'a' }], {
    isTerminal: () => { calls += 1; return calls >= 2 },
    rounds: 3,
    sleep: immediateSleep,
  })
  assert.equal(out.settled.length, 1)
  assert.equal(out.timedOut.length, 0)
})

// ── listOwnedJobs ──

test('listOwnedJobs：服务缺失 → null', async () => {
  assert.equal(await listOwnedJobs(undefined, 's1'), null)
  assert.equal(await listOwnedJobs({}, 's1'), null)
})

test('listOwnedJobs：过滤 running+stopping，丢弃 done/failed', async () => {
  const jobsSvc = {
    list: async () => [
      { id: 'j1', status: 'running', owner: { id: 's1' } },
      { id: 'j2', status: 'stopping', owner: { id: 's1' } },
      { id: 'j3', status: 'done', owner: { id: 's1' } },
      { id: 'j4', status: 'failed', owner: { id: 's1' } },
    ],
  }
  const out = await listOwnedJobs(jobsSvc, 's1')
  assert.deepEqual(out.map((j) => j.id), ['j1', 'j2'])
})

test('listOwnedJobs：不碰 unowned / 别会话 owner', async () => {
  const jobsSvc = {
    list: async () => [
      { id: 'j1', status: 'running', owner: { id: 'other' } },
      { id: 'j2', status: 'running', owner: { id: 's1' } },
      { id: 'j3', status: 'running' }, // 无 owner → 视为 caller 已过滤，保守接受
    ],
  }
  const out = await listOwnedJobs(jobsSvc, 's1')
  assert.deepEqual(out.map((j) => j.id), ['j2', 'j3'])
})

test('listOwnedJobs：list 抛错 → null（无能力，不抛）', async () => {
  const jobsSvc = { list: async () => { throw new Error('boom') } }
  assert.equal(await listOwnedJobs(jobsSvc, 's1'), null)
})

// ── listActiveChildren ──

test('listActiveChildren：服务缺失且无 ctx.agents.list → null', async () => {
  assert.equal(await listActiveChildren(undefined, 's1', undefined), null)
  assert.equal(await listActiveChildren({}, 's1', {}), null)
})

test('listActiveChildren：优先 listDescendants（含多层后代），排除自身', async () => {
  const subagentsSvc = {
    listDescendants: async () => ({
      descendants: [
        { sessionId: 'c1', children: [{ sessionId: 'c2' }] },
        { sessionId: 's1' }, // 自身，排除
      ],
    }),
  }
  const out = await listActiveChildren(subagentsSvc, 's1', {})
  assert.deepEqual(out.map((c) => c.sessionId).sort(), ['c1', 'c2'])
})

test('listActiveChildren：无 listDescendants 时退化 ctx.agents.list 过滤 running', async () => {
  const ctx = {
    agents: {
      list: () => [
        { id: 'c1', status: 'running', parentId: 's1' },
        { id: 'c2', status: 'idle', parentId: 's1' },
        { id: 's1', status: 'running' },
      ],
    },
  }
  const out = await listActiveChildren({}, 's1', ctx)
  assert.deepEqual(out, [{ sessionId: 'c1' }])
})

// ── armShields：必须在 kill 之前，且对每个 job 调 wait ──

test('armShields：wait 被调用次数 = job 数（shield 先于 kill 的前提）', async () => {
  let waits = 0
  const jobsSvc = { wait: () => { waits += 1; return Promise.resolve() }, kill: () => {} }
  await armShields(jobsSvc, [{ id: 'j1' }, { id: 'j2' }, { id: 'j3' }], 's1', 3000)
  assert.equal(waits, 3)
})

test('armShields：无 wait 方法时不抛、返回空', async () => {
  assert.deepEqual(await armShields({ kill: () => {} }, [{ id: 'j1' }], 's1', 3000), [])
})

// ── stopJobs ──

test('stopJobs：kill 传本会话 caller id；全成功', async () => {
  const calls = []
  const jobsSvc = { kill: (id, caller, reason) => { calls.push([id, caller, reason]); return {} } }
  const res = await stopJobs(jobsSvc, [{ id: 'j1' }, { id: 'j2' }], 's1', 'session-guard:pause')
  assert.deepEqual(calls, [['j1', 's1', 'session-guard:pause'], ['j2', 's1', 'session-guard:pause']])
  assert.deepEqual(res.map((r) => r.outcome), ['killed', 'killed'])
})

test('stopJobs：单个 kill 抛错记 unknown，仍继续其余', async () => {
  const killed = []
  const jobsSvc = {
    kill: (id) => {
      if (id === 'j2') throw new Error('JOB_FOREIGN_SESSION')
      killed.push(id)
      return {}
    },
  }
  const res = await stopJobs(jobsSvc, [{ id: 'j1' }, { id: 'j2' }, { id: 'j3' }], 's1', 'r')
  assert.deepEqual(killed, ['j1', 'j3'])
  assert.deepEqual(res.map((r) => [r.id, r.outcome]), [['j1', 'killed'], ['j2', 'unknown'], ['j3', 'killed']])
})

// ── stopChildren ──

test('stopChildren：优先 interruptByUser；单个失败退化 cancel', async () => {
  const interrupted = []
  const cancelled = []
  const subagentsSvc = {
    interruptByUser: (id) => {
      if (id === 'c2') throw new Error('nope')
      interrupted.push(id)
      return { accepted: true }
    },
  }
  const ctx = { agents: { get: (id) => ({ id, cancel: () => cancelled.push(id) }) } }
  const res = await stopChildren(subagentsSvc, [{ sessionId: 'c1' }, { sessionId: 'c2' }], ctx)
  assert.deepEqual(interrupted, ['c1'])
  assert.deepEqual(cancelled, ['c2'])
  assert.deepEqual(res.map((r) => r.outcome), ['killed', 'killed'])
})

test('stopChildren：无 interruptByUser 且无 cancel 时 → unsupported', async () => {
  const res = await stopChildren({}, [{ sessionId: 'c1' }], { agents: { get: () => undefined } })
  assert.deepEqual(res.map((r) => r.outcome), ['unsupported'])
})

/**
 * deferrals.js 测试：挂起 / 放行 / 取消 / 超限 / 顶替 / 幂等。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDeferrals, PeakDeferredError, PEAK_DEFERRED_CODE } from '../src/deferrals.js'

const CONFIG = Object.freeze({ provider: 'deepseek-official', model: 'deepseek-v4-pro' })

/** 下一个宏任务，让 abort/超限的 settle 生效。 */
const tick = () => new Promise((r) => setImmediate(r))

test('hold → release(sessionId) 只放行该会话（畅跑单会话豁免用）', async () => {
  const d = createDeferrals()
  const p1 = d.hold('s1', { config: { id: 1 } })
  const p2 = d.hold('s2', { config: { id: 2 } })
  assert.equal(d.size(), 2)

  assert.equal(d.release('s1', 'free-run'), true)
  assert.deepEqual(await p1, { id: 1 })
  assert.equal(d.size(), 1, 's2 必须仍然挂起')
  assert.equal(d.has('s2'), true)

  // 幂等：对不存在挂起的会话是 no-op
  assert.equal(d.release('s1'), false)
  assert.equal(d.release('nope'), false)

  d.releaseAll('test')
  assert.deepEqual(await p2, { id: 2 })
})

test('hold → releaseAll resolve 原 config', async () => {
  const d = createDeferrals()
  const p = d.hold('s1', { provider: 'deepseek-official', model: 'm', config: CONFIG })
  assert.equal(d.size(), 1)
  assert.deepEqual(d.list(), [{ sessionId: 's1', provider: 'deepseek-official', model: 'm', since: d.list()[0].since }])
  const r = d.releaseAll('off-peak')
  assert.deepEqual(r.released, ['s1'])
  assert.equal(await p, CONFIG)
  assert.equal(d.size(), 0)
})

test('hold → settle reject 抛 PeakDeferredError（精确码）', async () => {
  const d = createDeferrals()
  const p = d.hold('s1', { config: CONFIG })
  d.settle('s1', 'manual-cancel', 'reject')
  await assert.rejects(p, (e) => {
    assert.ok(e instanceof PeakDeferredError)
    assert.equal(e.code, PEAK_DEFERRED_CODE)
    assert.ok(e.message.startsWith('PEAK_DEFERRED:'))
    return true
  })
})

test('重复 hold 同一会话 → 旧记录被 reject superseded，新记录生效', async () => {
  const d = createDeferrals()
  const p1 = d.hold('s1', { config: { provider: 'a' } })
  const p2 = d.hold('s1', { config: { provider: 'b' } })
  await assert.rejects(p1, /superseded/)
  assert.equal(d.size(), 1)
  d.releaseAll()
  assert.deepEqual(await p2, { provider: 'b' })
})

test('deferredMaxHoldMs 到期 → reject max-hold-exceeded', async () => {
  const d = createDeferrals({ maxHoldMs: 5, unrefTimers: false })
  const p = d.hold('s1', { config: CONFIG })
  await assert.rejects(p, /max-hold-exceeded/)
  assert.equal(d.size(), 0)
})

test('maxHoldMs <= 0 → 不设上限（不会被定时器 reject）', async () => {
  const d = createDeferrals({ maxHoldMs: 0 })
  const p = d.hold('s1', { config: CONFIG })
  await tick()
  assert.equal(d.size(), 1)
  d.releaseAll()
  assert.equal(await p, CONFIG)
})

test('signal abort → reject 且清理干净', async () => {
  const d = createDeferrals()
  const ac = new AbortController()
  const p = d.hold('s1', { config: CONFIG }, ac.signal)
  ac.abort()
  await assert.rejects(p, /aborted/)
  assert.equal(d.size(), 0)
  assert.equal(d.has('s1'), false)
})

test('已 abort 的 signal → 立即 reject', async () => {
  const d = createDeferrals()
  const ac = new AbortController()
  ac.abort()
  const p = d.hold('s1', { config: CONFIG }, ac.signal)
  await assert.rejects(p, /aborted/)
  assert.equal(d.size(), 0)
})

test('releaseAll / settle 幂等：对不存在会话是 no-op', () => {
  const d = createDeferrals()
  assert.deepEqual(d.releaseAll(), { released: [], cleared: [] })
  assert.equal(d.settle('nope', 'x'), false)
  assert.deepEqual(d.rejectAll(), [])
  assert.equal(d.size(), 0)
})

test('rejectAll → 全部 reject（插件卸载路径）', async () => {
  const d = createDeferrals()
  const p1 = d.hold('s1', { config: CONFIG })
  const p2 = d.hold('s2', { config: CONFIG })
  assert.deepEqual(d.rejectAll('disposed').sort(), ['s1', 's2'])
  await assert.rejects(p1, /disposed/)
  await assert.rejects(p2, /disposed/)
  assert.equal(d.size(), 0)
})

test('remember / isDeferred / clearDeferred：error 模式延后记录', () => {
  const d = createDeferrals()
  d.remember('s1', { provider: 'deepseek-official', model: 'm' })
  assert.equal(d.isDeferred('s1'), true)
  assert.equal(d.deferredSize(), 1)
  assert.deepEqual(d.deferredList().map((x) => x.sessionId), ['s1'])
  d.clearDeferred('s1')
  assert.equal(d.isDeferred('s1'), false)
  assert.equal(d.remember('', {}), null)
})

test('releaseAll 同时清空延后记录', () => {
  const d = createDeferrals()
  d.remember('s1', {})
  const r = d.releaseAll()
  assert.deepEqual(r.cleared, ['s1'])
  assert.equal(d.deferredSize(), 0)
})

test('多会话并发挂起互不影响', async () => {
  const d = createDeferrals()
  const p1 = d.hold('s1', { config: { provider: 'a' } })
  const p2 = d.hold('s2', { config: { provider: 'b' } })
  d.settle('s1', 'off-peak', 'release')
  assert.deepEqual(await p1, { provider: 'a' })
  assert.equal(d.size(), 1)
  d.releaseAll()
  assert.deepEqual(await p2, { provider: 'b' })
})

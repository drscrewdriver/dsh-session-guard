/**
 * request-guard.js 测试：请求级守卫的 hold / error 两条路径 + 开关 + 互斥断言。
 *
 * 覆盖 checklist：
 * - 高峰 + 官方 → 请求不发出且不抛错（hold 默认）
 * - 退峰 → resolve 原 config（字段未被篡改）；abort → reject 且清理干净
 * - 超限 → 转 PeakDeferredError
 * - error 模式 → 抛 PEAK_DEFERRED + 调 gate.stopNextTurn + 记延后
 * - deferredResume=false → 两种模式都不自动续跑
 * - providerGuard=false / guardSubagents=false / 无 agent.id → 放行
 * - 互斥：hold 路径 gate.stopNextTurn 调用 0 次
 * - disposer → 挂起 promise 全部 reject
 * - 覆盖缺口：tick 已入峰后新会话发请求 → 被 hold
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequestGuard } from '../src/request-guard.js'
import { createDeferrals, PEAK_DEFERRED_CODE } from '../src/deferrals.js'

const CONFIG = Object.freeze({ provider: 'deepseek-official', model: 'deepseek-v4-pro' })
const PEAK_NOW = () => new Date('2026-08-19T02:00:00Z') // 北京周三 10:00
const OFF_PEAK_NOW = () => new Date('2026-08-19T05:00:00Z') // 北京周三 13:00

const BASE_CFG = {
  enabled: true,
  weekendMode: true,
  timezone: 'Asia/Shanghai',
  peakWindows: [
    { start: '09:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  providerGuard: true,
  guardSubagents: true,
  deferredMode: 'hold',
  deferredResume: true,
  pauseMode: 'safe',
  pauseReason: 'wait',
}

const silent = { info() {}, warn() {}, error() {} }

function harness({ cfg = {}, agents, classify, now = PEAK_NOW, isRoot } = {}) {
  let listener = null
  const ctx = {
    on: (name, fn) => {
      assert.equal(name, 'agent/request')
      listener = fn
      return () => {
        listener = null
      }
    },
    agents,
    get: () => null,
  }
  const deferrals = createDeferrals({ maxHoldMs: 0 })
  const gateCalls = []
  const gate = { stopNextTurn: (id, opts) => { gateCalls.push([id, opts]); return { ok: true } } }
  const directory = {
    classify: classify ?? ((id) => ({ official: id !== 'local-35b', matchedBy: 'endpoint' })),
  }
  const guard = createRequestGuard({
    ctx,
    getSettings: () => ({ ...BASE_CFG, ...cfg }),
    directory,
    deferrals,
    gate,
    logger: silent,
    clock: now,
    isRoot,
  })
  const off = guard.install()
  return {
    guard,
    off,
    deferrals,
    gateCalls,
    /** 触发一次 waterfall：next 返回 config。 */
    call: (payload, config = CONFIG) => listener(payload, async () => config),
    hasListener: () => listener !== null,
  }
}

const PAYLOAD = { agent: { id: 's1' }, turn: 1, step: 0, signal: undefined }
const tick = () => new Promise((r) => setImmediate(r))

/** 断言 promise 仍未 settle。 */
async function assertPending(p) {
  let settled = false
  p.then(() => { settled = true }, () => { settled = true })
  await tick()
  assert.equal(settled, false, 'expected promise to stay pending')
}

// ── task_11：hold 路径 ──

test('高峰 + 官方 → 请求不发出（promise 挂起），且不抛错', async () => {
  const h = harness()
  const p = h.call(PAYLOAD)
  await assertPending(p)
  assert.equal(h.deferrals.size(), 1)
  assert.equal(h.deferrals.has('s1'), true)
})

test('退峰 → resolve 原 config（同一引用，字段未被篡改）', async () => {
  const h = harness()
  const p = h.call(PAYLOAD)
  await assertPending(p)
  h.deferrals.releaseAll('off-peak')
  assert.equal(await p, CONFIG)
  assert.equal(h.deferrals.size(), 0)
})

test('abort → reject 且延后表清理干净', async () => {
  const h = harness()
  const ac = new AbortController()
  const p = h.call({ ...PAYLOAD, signal: ac.signal })
  await assertPending(p)
  ac.abort()
  await assert.rejects(p, /aborted/)
  assert.equal(h.deferrals.size(), 0)
})

test('deferredMaxHoldMs 到期 → 转 PeakDeferredError（延后表清空）', async () => {
  let listener = null
  const ctx = { on: (_n, fn) => { listener = fn; return () => {} }, get: () => null }
  const deferrals = createDeferrals({ maxHoldMs: 5, unrefTimers: false })
  const guard = createRequestGuard({
    ctx,
    getSettings: () => BASE_CFG,
    directory: { classify: () => ({ official: true, matchedBy: 'endpoint' }) },
    deferrals,
    logger: silent,
    clock: PEAK_NOW,
  })
  guard.install()
  const p = listener(PAYLOAD, async () => CONFIG)
  await assert.rejects(p, (e) => e.code === PEAK_DEFERRED_CODE)
  assert.equal(deferrals.size(), 0)
})

// ── task_12：error 路径 ──

test('deferredMode=error → 抛 PEAK_DEFERRED + 调 stopNextTurn + 记延后', async () => {
  const h = harness({ cfg: { deferredMode: 'error' } })
  await assert.rejects(h.call(PAYLOAD), (e) => {
    assert.equal(e.code, PEAK_DEFERRED_CODE)
    assert.ok(e.message.startsWith('PEAK_DEFERRED:'))
    return true
  })
  await tick()
  assert.deepEqual(h.gateCalls, [['s1', { mode: 'safe', reason: 'wait' }]])
  assert.equal(h.deferrals.isDeferred('s1'), true)
  assert.equal(h.deferrals.size(), 0)
})

test('deferredResume=false + hold 模式 → 直接转 error（不挂起）', async () => {
  const h = harness({ cfg: { deferredResume: false } })
  await assert.rejects(h.call(PAYLOAD), (e) => e.code === PEAK_DEFERRED_CODE)
  assert.equal(h.deferrals.size(), 0)
  assert.equal(h.deferrals.isDeferred('s1'), true)
  assert.match(h.deferrals.deferredList()[0].reason, /peak/)
  await tick()
  assert.equal(h.gateCalls.length, 1)
})

test('deferredResume=false + error 模式 → 同样抛错并记延后（不发 followup 由接线层负责）', async () => {
  const h = harness({ cfg: { deferredMode: 'error', deferredResume: false } })
  await assert.rejects(h.call(PAYLOAD), (e) => e.code === PEAK_DEFERRED_CODE)
  assert.equal(h.deferrals.isDeferred('s1'), true)
  await tick()
  assert.equal(h.gateCalls.length, 1)
})

test('error 模式的错误文案区分「自动续跑关闭」', async () => {
  const h = harness({ cfg: { deferredMode: 'error', deferredResume: false } })
  await assert.rejects(h.call(PAYLOAD), /auto-resume disabled/)
})

test('gate 缺失时 error 模式仍能抛错（不因门控缺失而崩）', async () => {
  let listener = null
  const ctx = { on: (_n, fn) => { listener = fn; return () => {} }, get: () => null }
  const deferrals = createDeferrals({ maxHoldMs: 0 })
  const guard = createRequestGuard({
    ctx,
    getSettings: () => ({ ...BASE_CFG, deferredMode: 'error' }),
    directory: { classify: () => ({ official: true, matchedBy: 'endpoint' }) },
    deferrals,
    logger: silent,
    clock: PEAK_NOW,
  })
  guard.install()
  await assert.rejects(listener(PAYLOAD, async () => CONFIG), (e) => e.code === PEAK_DEFERRED_CODE)
})

// ── task_13：开关与子代理分支 ──

test('providerGuard=false → 完全退回纯时间判定（不判定 provider）', async () => {
  const h = harness({ cfg: { providerGuard: false } })
  assert.equal(await h.call(PAYLOAD), CONFIG)
  assert.equal(h.deferrals.size(), 0)
})

test('guardSubagents=false → 非 root agent 直接放行；root 仍拦', async () => {
  const roots = [{ id: 'root-1' }]
  const h = harness({
    cfg: { guardSubagents: false },
    agents: { roots: () => roots, list: () => [...roots, { id: 'sub-1' }] },
  })
  assert.equal(await h.call({ agent: { id: 'sub-1' } }), CONFIG)
  const p = h.call({ agent: { id: 'root-1' } })
  await assertPending(p)
  assert.equal(h.deferrals.has('root-1'), true)
})

test('guardSubagents=true（默认）→ 子代理同样纳入', async () => {
  const roots = [{ id: 'root-1' }]
  const h = harness({ agents: { roots: () => roots, list: () => [...roots, { id: 'sub-1' }] } })
  const p = h.call({ agent: { id: 'sub-1' } })
  await assertPending(p)
  assert.equal(h.deferrals.has('sub-1'), true)
})

test('payload.agent.id 缺失 → 放行 + warn（不抛错）', async () => {
  const h = harness()
  assert.equal(await h.call({ agent: {} }), CONFIG)
  assert.equal(await h.call({}), CONFIG)
  assert.equal(h.deferrals.size(), 0)
})

// ── task_14：互斥与泄漏断言 ──

test('互斥：hold 路径 gate.stopNextTurn 调用次数为 0', async () => {
  const h = harness()
  const p = h.call(PAYLOAD)
  await assertPending(p)
  await tick()
  assert.equal(h.gateCalls.length, 0)
  h.deferrals.releaseAll()
  assert.equal(await p, CONFIG)
})

test('disposer → 挂起 promise 全部 reject，且监听被摘除', async () => {
  const h = harness()
  const p1 = h.call({ agent: { id: 's1' } })
  const p2 = h.call({ agent: { id: 's2' } })
  await assertPending(p1)
  assert.equal(h.deferrals.size(), 2)
  h.off()
  await assert.rejects(p1, /guard-disposed/)
  await assert.rejects(p2, /guard-disposed/)
  assert.equal(h.deferrals.size(), 0)
  assert.equal(h.hasListener(), false)
})

// ── task_19：覆盖缺口（tick 已入峰 → 新会话请求仍被拦）──

test('覆盖缺口：tick 已入峰后新启动的会话发请求 → 被 hold', async () => {
  // tick 入峰时只处理了已有会话；新会话不在那次遍历里 → 必须靠请求级兜底
  const h = harness()
  const p = h.call({ agent: { id: 'brand-new-session' } })
  await assertPending(p)
  assert.equal(h.deferrals.has('brand-new-session'), true)
})

// ── 放行路径 ──

test('非高峰 → 原样放行（429 / 传输重试链路完全不受影响）', async () => {
  const h = harness({ now: OFF_PEAK_NOW })
  assert.equal(await h.call(PAYLOAD), CONFIG)
  assert.equal(h.deferrals.size(), 0)
})

test('高峰 + 非官方目标 → 放行（本地 provider 照常跑）', async () => {
  const h = harness()
  const cfg = { provider: 'local-35b', model: 'qwen' }
  assert.equal(await h.call(PAYLOAD, cfg), cfg)
  assert.equal(h.deferrals.size(), 0)
})

test('周末 → 放行', async () => {
  const h = harness({ now: () => new Date('2026-08-22T02:00:00Z') }) // 北京周六 10:00
  assert.equal(await h.call(PAYLOAD), CONFIG)
})

test('判定异常 → fail-open 放行（不因本插件让请求失败）', async () => {
  const h = harness({
    classify: () => {
      throw new Error('directory exploded')
    },
  })
  assert.equal(await h.call(PAYLOAD), CONFIG)
})

test('next() 的返回值被使用（不看配置默认值，findings F2）', async () => {
  // next 返回 local-35b → 即使目录对 deepseek-official 判官方，也按 next 结果判定
  const h = harness({ classify: (id) => ({ official: id === 'deepseek-official', matchedBy: 'route-id' }) })
  const cfg = { provider: 'deepseek-official', model: 'm' }
  const p = h.call(PAYLOAD, cfg)
  await assertPending(p)
  h.deferrals.releaseAll()
  assert.equal(await p, cfg)
  // 换成非官方返回值 → 放行
  const cfg2 = { provider: 'local-35b', model: 'q' }
  assert.equal(await h.call(PAYLOAD, cfg2), cfg2)
})

test('scheduleRelease 在挂起时被调用一次', async () => {
  let scheduled = 0
  let listener = null
  const ctx = { on: (_n, fn) => { listener = fn; return () => {} }, get: () => null }
  const deferrals = createDeferrals({ maxHoldMs: 0 })
  const guard = createRequestGuard({
    ctx,
    getSettings: () => BASE_CFG,
    directory: { classify: () => ({ official: true, matchedBy: 'endpoint' }) },
    deferrals,
    logger: silent,
    clock: PEAK_NOW,
    scheduleRelease: () => { scheduled += 1 },
  })
  guard.install()
  const p = listener(PAYLOAD, async () => CONFIG)
  await assertPending(p)
  assert.equal(scheduled, 1)
  deferrals.releaseAll()
  await p
})

test('stats 计数可用于诊断', async () => {
  const h = harness()
  const p = h.call({ agent: { id: 's2' } })
  await assertPending(p)
  assert.equal(h.guard.stats().hold, 1)
  h.deferrals.releaseAll()
  await p
})

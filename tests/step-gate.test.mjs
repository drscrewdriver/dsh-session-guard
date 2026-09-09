/**
 * step-gate.js 测试：判定矩阵 + 门控生命周期（hold / release / abort / 超时升级 / releaseAll）。
 *
 * 全部用注入依赖，不触碰真实 DSH runtime、不写盘、不起真定时器。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStepGate, decideStepHold, DEFAULT_STEP_TIMEOUT_MS } from '../src/step-gate.js'

const PEAK_NOW = () => new Date('2026-08-19T02:00:00Z').getTime() // 北京周三 10:00（高峰）
const OFFPEAK_NOW = () => new Date('2026-08-19T04:00:00Z').getTime() // 北京周三 12:00（谷时）
const WEEKEND_NOW = () => new Date('2026-08-22T02:00:00Z').getTime() // 北京周六 10:00（周末）

const BASE_CFG = {
  enabled: true,
  stepLevelPause: true,
  guardSubagents: true,
  weekendMode: true,
  timezone: 'Asia/Shanghai',
  peakWindows: [
    { start: '09:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  providerGuard: true,
  stepGateTimeoutMs: DEFAULT_STEP_TIMEOUT_MS,
}

const tick = () => new Promise((r) => setImmediate(r))
const silent = { info() {}, warn() {}, error() {} }

const PEAK_VERDICT = { pause: true, reason: 'peak' }

/** 判定纯函数的最小输入。 */
function decide(overrides = {}) {
  return decideStepHold({
    cfg: BASE_CFG,
    step: 2,
    isRoot: true,
    pauseVerdict: PEAK_VERDICT,
    shouldHoldSession: () => true,
    isHeldByDeferrals: false,
    bypassed: false,
    alreadyHeld: false,
    ...overrides,
  })
}

// ── task_4：判定矩阵 ──

test('decideStepHold：全部满足 → 拉门', () => {
  assert.deepEqual(decide(), { hold: true, why: 'peak' })
})

test('decideStepHold：enabled=false → 放行', () => {
  assert.equal(decide({ cfg: { ...BASE_CFG, enabled: false } }).why, 'disabled')
})

test('decideStepHold：stepLevelPause=false → 放行', () => {
  assert.equal(decide({ cfg: { ...BASE_CFG, stepLevelPause: false } }).why, 'step-level-off')
  assert.equal(decide({ cfg: { ...BASE_CFG, stepLevelPause: undefined } }).why, 'step-level-off')
})

test('decideStepHold：step<=1 → 放行（step 1 由请求级守卫覆盖）', () => {
  assert.equal(decide({ step: 1 }).why, 'first-step')
  assert.equal(decide({ step: 0 }).why, 'first-step')
  assert.equal(decide({ step: undefined }).why, 'first-step')
})

test('decideStepHold：bypass → 放行', () => {
  assert.equal(decide({ bypassed: true }).why, 'bypassed')
})

test('decideStepHold：非 root + guardSubagents=false → 放行', () => {
  assert.equal(decide({ isRoot: false, cfg: { ...BASE_CFG, guardSubagents: false } }).why, 'subagent')
  // guardSubagents=true 时子代理同样纳入
  assert.equal(decide({ isRoot: false }).hold, true)
})

test('decideStepHold：谷时 / 周末 / disabled → 放行', () => {
  assert.equal(decide({ pauseVerdict: { pause: false, reason: 'off-peak' } }).why, 'off-peak')
  assert.equal(decide({ pauseVerdict: { pause: false, reason: 'weekend' } }).why, 'weekend')
  assert.equal(decide({ pauseVerdict: { pause: false, reason: 'disabled' } }).why, 'disabled')
  assert.equal(decide({ pauseVerdict: undefined }).why, 'not-peak')
})

test('decideStepHold：目标非官方 → 放行', () => {
  assert.equal(decide({ shouldHoldSession: () => false }).why, 'non-official')
})

test('decideStepHold：请求级已 hold → 放行（互斥铁律）', () => {
  assert.equal(decide({ isHeldByDeferrals: true }).why, 'request-held')
})

test('decideStepHold：该会话已有挂起门 → 放行（防双门）', () => {
  assert.equal(decide({ alreadyHeld: true }).why, 'already-held')
})

// ── 手动暂停（v0.2.0 修订：「暂停会话」按钮）──

test('decideStepHold：manual 绕过峰谷/step/provider/enabled，仅保留互斥与防双门', () => {
  assert.deepEqual(decide({ manual: true }), { hold: true, why: 'manual' })
  // 谷时 / step 1 / 非官方 / 未启用 / bypass —— 全部被 manual 覆盖
  assert.equal(decide({ manual: true, pauseVerdict: { pause: false, reason: 'off-peak' } }).hold, true)
  assert.equal(decide({ manual: true, step: 1 }).hold, true)
  assert.equal(decide({ manual: true, shouldHoldSession: () => false }).hold, true)
  assert.equal(decide({ manual: true, cfg: { ...BASE_CFG, enabled: false } }).hold, true)
  assert.equal(decide({ manual: true, cfg: { ...BASE_CFG, stepLevelPause: false } }).hold, true)
  assert.equal(decide({ manual: true, bypassed: true }).hold, true)
  // 互斥铁律 / 防双门仍然生效
  assert.equal(decide({ manual: true, isHeldByDeferrals: true }).why, 'request-held')
  assert.equal(decide({ manual: true, alreadyHeld: true }).why, 'already-held')
})

test('requestPause：登记待落地请求，state.manual 立即为 true（按钮立刻变「继续会话」）', async () => {
  const changes = []
  const h = harness({ now: OFFPEAK_NOW, onChange: (id, s) => changes.push([id, s.held, s.manual]) })
  assert.deepEqual(h.gate.requestPause('s1'), { requested: true, held: false })
  assert.deepEqual(h.gate.state('s1'), { held: false, step: null, since: null, bypass: false, manual: true })
  assert.deepEqual(h.gate._manualPending(), ['s1'])
  assert.deepEqual(changes, [['s1', false, true]])
  // 幂等：重复点击不叠加
  assert.deepEqual(h.gate.requestPause('s1'), { requested: true, held: false })
  assert.equal(h.gate._manualPending().length, 1)
})

test('requestPause：谷时 + step 1 也在下一次 pre-step 拉门（manual 优先）', async () => {
  const h = harness({ now: OFFPEAK_NOW })
  h.gate.requestPause('s1')
  const run = startHold(h.gate, h.payload({ step: 1 }))
  await tick()
  assert.equal(h.gate._count(), 1, '手动暂停必须能拦住 step 1 且不受峰谷限制')
  assert.equal(h.gate.state('s1').manual, true)
  h.gate.release('s1', 'manual')
  assert.equal(await run.promise, 'NEXT')
  assert.equal(h.gate.state('s1').manual, false, '释放后清除手动暂停请求')
  assert.deepEqual(h.gate._manualPending(), [])
})

test('requestPause：已挂起时幂等（held:true），不产生第二道门', async () => {
  const h = harness()
  const run = startHold(h.gate, h.payload())
  await tick()
  assert.deepEqual(h.gate.requestPause('s1'), { requested: true, held: true })
  assert.equal(h.gate._count(), 1)
  h.gate.release('s1', 'cleanup')
  await run.promise
})

test('markBypass 撤销未落地的手动暂停请求；release 也撤销', async () => {
  const h = harness({ now: OFFPEAK_NOW })
  h.gate.requestPause('s1')
  h.gate.markBypass('s1')
  assert.deepEqual(h.gate._manualPending(), [])
  assert.equal(h.gate.state('s1').bypass, true)
  // 已挂起 + 手动请求 → release 后两者都清
  const h2 = harness()
  h2.gate.requestPause('s2')
  const run = startHold(h2.gate, h2.payload({ agent: { id: 's2' } }))
  await tick()
  h2.gate.release('s2', 'manual')
  await run.promise
  assert.deepEqual(h2.gate.state('s2'), { held: false, step: null, since: null, bypass: false, manual: false })
})

test('releaseAll：一并清空未落地的手动暂停请求', () => {
  const changes = []
  const h = harness({ now: OFFPEAK_NOW, onChange: (id, s) => changes.push([id, s.manual]) })
  h.gate.requestPause('s1')
  assert.deepEqual(h.gate.releaseAll('off-peak'), [])
  assert.deepEqual(h.gate._manualPending(), [])
  assert.deepEqual(changes, [['s1', true], ['s1', false]])
})

test('onChange：拉门 / 释放 / bypass 都会通知（SSE 推送源）', async () => {
  const changes = []
  const h = harness({ onChange: (id, s) => changes.push([id, s.held, s.manual, s.bypass]) })
  const run = startHold(h.gate, h.payload())
  await tick()
  h.gate.release('s1', 'manual')
  await run.promise
  h.gate.markBypass('s1')
  assert.deepEqual(changes, [
    ['s1', true, false, false], // 拉门
    ['s1', false, false, false], // 释放
    ['s1', false, false, true], // bypass
  ])
})

test('onChange 抛错：门控不受影响（fail-open）', async () => {
  const h = harness({
    onChange: () => {
      throw new Error('sse down')
    },
  })
  const run = startHold(h.gate, h.payload())
  await tick()
  assert.equal(h.gate._count(), 1)
  h.gate.release('s1', 'manual')
  assert.equal(await run.promise, 'NEXT')
})

// ── task_5/6：门控生命周期 ──

/** 造一个 gate + 手动定时器 + 记录 next 调用。 */
function harness({ cfg = {}, now = PEAK_NOW, pauseGate, isHeldByDeferrals, shouldHoldSession, isRootAgent, onChange } = {}) {
  const timers = []
  const gate = createStepGate({
    getSettings: () => ({ ...BASE_CFG, ...cfg }),
    shouldHoldSession: shouldHoldSession ?? (() => true),
    isHeldByDeferrals: isHeldByDeferrals ?? (() => false),
    isRootAgent: isRootAgent ?? (() => true),
    pauseGate,
    logger: silent,
    now,
    onChange,
    setTimer: (fn, ms) => {
      const handle = { fn, ms, cleared: false, unref() { this.unrefed = true } }
      timers.push(handle)
      return handle
    },
    clearTimer: (handle) => {
      if (handle) handle.cleared = true
    },
    unrefTimers: true,
  })
  const payload = (over = {}) => ({
    agent: { id: 's1' },
    step: 2,
    turn: 1,
    signal: { aborted: false, addEventListener() {}, removeEventListener() {} },
    ...over,
  })
  return { gate, timers, payload }
}

function startHold(gate, payload) {
  const calls = { next: 0 }
  const promise = gate.hold(payload, () => {
    calls.next += 1
    return Promise.resolve('NEXT')
  })
  return { promise, calls }
}

test('hold：高峰 + 官方 → 拉门，next 不被调用；release 后放行并透传 next 结果', async () => {
  const h = harness()
  const run = startHold(h.gate, h.payload())
  await tick()
  assert.equal(run.calls.next, 0)
  assert.equal(h.gate._count(), 1)
  assert.deepEqual(h.gate.state('s1'), { held: true, step: 2, since: PEAK_NOW(), bypass: false, manual: false })
  const r = h.gate.release('s1', 'manual')
  assert.deepEqual(r, { released: true, reason: 'manual' })
  assert.equal(await run.promise, 'NEXT')
  assert.equal(run.calls.next, 1)
  assert.equal(h.gate._count(), 0)
  assert.equal(h.timers[0].cleared, true)
})

test('hold：谷时 / 周末 → 直接放行，不拉门', async () => {
  const off = harness({ now: OFFPEAK_NOW })
  assert.equal(await off.gate.hold(off.payload(), () => Promise.resolve('NEXT')), 'NEXT')
  assert.equal(off.gate._count(), 0)
  const wk = harness({ now: WEEKEND_NOW })
  assert.equal(await wk.gate.hold(wk.payload(), () => Promise.resolve('NEXT')), 'NEXT')
  assert.equal(wk.gate._count(), 0)
})

test('hold：abort → 释放并放行', async () => {
  const listeners = []
  const signal = {
    aborted: false,
    addEventListener: (_e, fn) => listeners.push(fn),
    removeEventListener: (_e, fn) => {
      const i = listeners.indexOf(fn)
      if (i >= 0) listeners.splice(i, 1)
    },
  }
  const h = harness()
  const run = startHold(h.gate, h.payload({ signal }))
  await tick()
  assert.equal(h.gate._count(), 1)
  assert.equal(listeners.length, 1)
  for (const fn of [...listeners]) fn()
  assert.equal(await run.promise, 'NEXT')
  assert.equal(h.gate._count(), 0)
  assert.equal(listeners.length, 0, 'abort 监听必须摘掉')
})

test('hold：signal 已 aborted → 立即释放', async () => {
  const signal = { aborted: true, addEventListener() {}, removeEventListener() {} }
  const h = harness()
  const run = startHold(h.gate, h.payload({ signal }))
  assert.equal(await run.promise, 'NEXT')
  assert.equal(h.gate._count(), 0)
})

test('hold：超时 → 释放并升级为 turn 级 force 暂停（F8）', async () => {
  const calls = []
  const h = harness({ pauseGate: { pause: (id, opts) => calls.push([id, opts]) } })
  const run = startHold(h.gate, h.payload())
  await tick()
  assert.equal(h.timers.length, 1)
  assert.equal(h.timers[0].ms, DEFAULT_STEP_TIMEOUT_MS)
  h.timers[0].fn()
  assert.equal(await run.promise, 'NEXT')
  assert.deepEqual(calls, [['s1', { mode: 'force', reason: 'stop' }]])
  assert.equal(h.gate._count(), 0)
})

test('hold：超时毫秒非法 → 回退默认值', async () => {
  const h = harness({ cfg: { stepGateTimeoutMs: 0 } })
  const run = startHold(h.gate, h.payload())
  await tick()
  assert.equal(h.timers[0].ms, DEFAULT_STEP_TIMEOUT_MS)
  h.gate.release('s1', 'cleanup')
  await run.promise
})

test('hold：pauseGate 缺失 / 抛错 → 超时仍能释放（不抛错）', async () => {
  const missing = harness()
  const r1 = startHold(missing.gate, missing.payload())
  await tick()
  missing.timers[0].fn()
  assert.equal(await r1.promise, 'NEXT')

  const throwing = harness({ pauseGate: { pause: () => { throw new Error('boom') } } })
  const r2 = startHold(throwing.gate, throwing.payload())
  await tick()
  assert.doesNotThrow(() => throwing.timers[0].fn())
  assert.equal(await r2.promise, 'NEXT')
})

test('hold：shouldHoldSession 抛错 → fail-open 放行', async () => {
  const h = harness({ shouldHoldSession: () => { throw new Error('directory down') } })
  assert.equal(await h.gate.hold(h.payload(), () => Promise.resolve('NEXT')), 'NEXT')
  assert.equal(h.gate._count(), 0)
})

test('hold：请求级已 hold → 放行（互斥）', async () => {
  const h = harness({ isHeldByDeferrals: () => true })
  assert.equal(await h.gate.hold(h.payload(), () => Promise.resolve('NEXT')), 'NEXT')
  assert.equal(h.gate._count(), 0)
})

test('hold：bypass 后放行；clearAllBypass 恢复拉门', async () => {
  const h = harness()
  h.gate.markBypass('s1')
  assert.deepEqual(h.gate.state('s1'), { held: false, step: null, since: null, bypass: true, manual: false })
  assert.equal(await h.gate.hold(h.payload(), () => Promise.resolve('NEXT')), 'NEXT')
  assert.equal(h.gate._count(), 0)
  h.gate.clearAllBypass()
  const run = startHold(h.gate, h.payload())
  await tick()
  assert.equal(h.gate._count(), 1)
  h.gate.release('s1', 'cleanup')
  await run.promise
})

test('hold：无 sessionId / next 缺失 → 不崩', async () => {
  const h = harness()
  assert.doesNotThrow(() => h.gate.hold({ step: 2 }, () => Promise.resolve('NEXT')))
  // next 缺失时 fail-open 返回 enter（用 step 1 避免真拉门）
  const r = await h.gate.hold(h.payload({ step: 1 }), undefined)
  assert.deepEqual(r, { kind: 'enter', messages: [] })
})

test('hold：同会话已挂起 → 第二次直接放行（防双门，不替换旧门）', async () => {
  const h = harness()
  const first = startHold(h.gate, h.payload())
  await tick()
  assert.equal(h.gate._count(), 1)
  // 第二次 hold：判定 alreadyHeld → fail-open 放行，不产生第二道门
  assert.equal(await h.gate.hold(h.payload(), () => Promise.resolve('SECOND')), 'SECOND')
  assert.equal(h.gate._count(), 1, '旧门保持不变')
  h.gate.release('s1', 'cleanup')
  assert.equal(await first.promise, 'NEXT')
  assert.equal(h.gate._count(), 0)
})

test('releaseAll：释放全部 + 幂等 + 清空计数', async () => {
  const h = harness()
  const a = startHold(h.gate, h.payload())
  const b = startHold(h.gate, h.payload({ agent: { id: 's2' } }))
  await tick()
  assert.deepEqual(h.gate.heldIds().sort(), ['s1', 's2'])
  const ids = h.gate.releaseAll('off-peak')
  assert.deepEqual(ids.sort(), ['s1', 's2'])
  assert.equal(await a.promise, 'NEXT')
  assert.equal(await b.promise, 'NEXT')
  assert.equal(h.gate._count(), 0)
  assert.deepEqual(h.gate.releaseAll('off-peak'), [], '第二次必须为空（幂等）')
  assert.deepEqual(h.gate.release('s1', 'off-peak'), { released: false, reason: 'off-peak' })
})

test('hold：release 清掉定时器与 abort 监听（无泄漏）', async () => {
  const listeners = []
  const signal = {
    aborted: false,
    addEventListener: (_e, fn) => listeners.push(fn),
    removeEventListener: (_e, fn) => listeners.splice(listeners.indexOf(fn), 1),
  }
  const h = harness()
  const run = startHold(h.gate, h.payload({ signal }))
  await tick()
  h.gate.release('s1', 'manual')
  await run.promise
  assert.equal(listeners.length, 0)
  assert.equal(h.timers[0].cleared, true)
})

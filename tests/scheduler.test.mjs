/**
 * scheduler.js 测试：状态机 + 迁移检测。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeState, transition, STATES } from '../src/scheduler.js'

const SETTINGS = {
  enabled: true,
  weekendMode: true,
  timezone: 'Asia/Shanghai',
  peakWindows: [{ start: '09:00', end: '12:00' }],
}

const PEAK = new Date('2026-08-19T02:00:00Z') // 北京周三 10:00
const VALLEY = new Date('2026-08-19T05:00:00Z') // 北京周三 13:00
const WEEKEND_PEAK = new Date('2026-08-22T02:00:00Z') // 北京周六 10:00

test('computeState 高峰 → PAUSED_PEAK', () => {
  const s = computeState(SETTINGS, PEAK)
  assert.equal(s.state, STATES.PAUSED_PEAK)
  assert.equal(s.reason, 'peak')
})

test('computeState 谷时 → NORMAL', () => {
  const s = computeState(SETTINGS, VALLEY)
  assert.equal(s.state, STATES.NORMAL)
  assert.equal(s.reason, 'off-peak')
})

test('computeState 周末高峰 → NORMAL（周末模式）', () => {
  const s = computeState(SETTINGS, WEEKEND_PEAK)
  assert.equal(s.state, STATES.NORMAL)
  assert.equal(s.reason, 'weekend')
})

test('transition 检测 入峰/退峰', () => {
  const normal = computeState(SETTINGS, VALLEY)
  const peak = computeState(SETTINGS, PEAK)
  assert.deepEqual(transition(normal, peak), { enter: true, leave: false })
  assert.deepEqual(transition(peak, normal), { enter: false, leave: true })
  assert.deepEqual(transition(peak, peak), { enter: false, leave: false })
  assert.deepEqual(transition(null, peak), { enter: true, leave: false })
})

test('transition 周末退峰也算 leave', () => {
  const peak = computeState({ ...SETTINGS, weekendMode: false }, WEEKEND_PEAK)
  const weekend = computeState(SETTINGS, WEEKEND_PEAK)
  assert.deepEqual(transition(peak, weekend), { enter: false, leave: true })
})

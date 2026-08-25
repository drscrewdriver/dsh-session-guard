/**
 * time.js 测试：高峰 / 周末 / 时区正确性（D1）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHHMM, inWindow, wallClock, isWeekend, shouldPause } from '../src/time.js'

const SETTINGS = {
  enabled: true,
  weekendMode: true,
  timezone: 'Asia/Shanghai',
  peakWindows: [
    { start: '09:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
}

// 北京某周三 10:00 = UTC 02:00
const WED_PEAK = new Date('2026-08-19T02:00:00Z')
// 北京某周三 13:00 = UTC 05:00（谷时）
const WED_VALLEY = new Date('2026-08-19T05:00:00Z')
// 北京周六 00:30 = UTC 周五 16:30 —— 这是 off-peak 的 bug 场景：
// 裸 getUTCDay() 会读到周五(5)，而北京已是周六(6)
const SAT_BOUNDARY = new Date('2026-08-21T16:30:00Z')
// 北京周六 10:00 = UTC 02:00（高峰时段但周末）
const SAT_PEAK = new Date('2026-08-22T02:00:00Z')
// 北京周日 17:00 = UTC 09:00（高峰时段但周末）
const SUN_PEAK = new Date('2026-08-23T09:00:00Z')

test('parseHHMM 解析与非法值', () => {
  assert.equal(parseHHMM('09:00'), 540)
  assert.equal(parseHHMM('14:30'), 870)
  assert.equal(parseHHMM('24:00'), null)
  assert.equal(parseHHMM('9:5'), null)
  assert.equal(parseHHMM('abc'), null)
})

test('inWindow 半开区间与跨午夜', () => {
  assert.equal(inWindow(540, 540, 720), true) // 9:00 在 [9:00,12:00)
  assert.equal(inWindow(719, 540, 720), true) // 11:59 在
  assert.equal(inWindow(720, 540, 720), false) // 12:00 不在（左闭右开）
  assert.equal(inWindow(60, 1320, 480), true) // 跨午夜 22:00-08:00, 01:00 在
  assert.equal(inWindow(600, 1320, 480), false) // 10:00 不在跨午夜窗
})

test('wallClock 用配置时区（非 UTC）', () => {
  // 北京周三 10:00 = UTC 02:00：UTC 是周二凌晨
  const wc = wallClock('Asia/Shanghai', WED_PEAK)
  assert.equal(wc.weekday, 3) // 周三
  assert.equal(wc.minutes, 10 * 60)
})

test('周末识别（D1 关键）：北京周六 00:30 必须是周末，即使 UTC 还是周五', () => {
  const wc = wallClock('Asia/Shanghai', SAT_BOUNDARY)
  assert.equal(wc.weekday, 6) // 北京周六
  assert.equal(isWeekend(wc.weekday), true)
  // off-peak 的错误做法（裸 getUTCDay）在这里会返回 5（周五）→ 非周末
  assert.equal(new Date(SAT_BOUNDARY).getUTCDay(), 5) // 对照：UTC 周五
})

test('shouldPause：工作日高峰 → pause', () => {
  const r = shouldPause(SETTINGS, WED_PEAK)
  assert.deepEqual(r, { pause: true, reason: 'peak' })
})

test('shouldPause：工作日谷时 → 不 pause', () => {
  const r = shouldPause(SETTINGS, WED_VALLEY)
  assert.deepEqual(r, { pause: false, reason: 'off-peak' })
})

test('shouldPause：周末高峰 → 不 pause（周末模式，畅快跑）', () => {
  const r = shouldPause(SETTINGS, SAT_PEAK)
  assert.deepEqual(r, { pause: false, reason: 'weekend' })
  const r2 = shouldPause(SETTINGS, SUN_PEAK)
  assert.deepEqual(r2, { pause: false, reason: 'weekend' })
})

test('shouldPause：weekendMode 关闭时周末高峰照常暂停', () => {
  const r = shouldPause({ ...SETTINGS, weekendMode: false }, SAT_PEAK)
  assert.deepEqual(r, { pause: true, reason: 'peak' })
})

test('shouldPause：enabled 关闭 → 永不暂停', () => {
  const r = shouldPause({ ...SETTINGS, enabled: false }, WED_PEAK)
  assert.deepEqual(r, { pause: false, reason: 'disabled' })
})

test('shouldPause：跨午夜高峰窗口', () => {
  const overnight = { ...SETTINGS, peakWindows: [{ start: '22:00', end: '06:00' }] }
  // 北京周四 01:00 = UTC 周三 17:00
  const r = shouldPause(overnight, new Date('2026-08-20T17:00:00Z'))
  assert.equal(r.pause, true)
  // 北京周四 12:00 = UTC 04:00 → 不在 [22:00,06:00)
  const r2 = shouldPause(overnight, new Date('2026-08-20T04:00:00Z'))
  assert.equal(r2.pause, false)
})

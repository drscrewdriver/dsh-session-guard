/**
 * time.js 测试：高峰 / 周末 / 时区正确性（D1）。
 *
 * 峰谷判定固定北京时间（BILLING_TIMEZONE = 'Asia/Shanghai'），
 * 周末判定用配置时区（settings.timezone）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHHMM, inWindow, wallClock, isWeekend, shouldPause, BILLING_TIMEZONE } from '../src/time.js'

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

// ── 峰谷固定北京时间（BILLING_TIMEZONE）测试 ──

test('BILLING_TIMEZONE 为 Asia/Shanghai', () => {
  assert.equal(BILLING_TIMEZONE, 'Asia/Shanghai')
})

test('shouldPause：东京用户（Asia/Tokyo）高峰仍按北京时间判定', () => {
  // 东京用户把 timezone 设为 Asia/Tokyo
  const tokyoSettings = { ...SETTINGS, timezone: 'Asia/Tokyo' }
  // 北京周三 10:00 = UTC 02:00 = 东京周三 11:00
  // 北京时间在高峰 [09:00,12:00) → 应暂停
  // 东京时间 11:00 也在 [09:00,12:00) → 但关键是必须按北京时间判
  const r = shouldPause(tokyoSettings, new Date('2026-08-19T02:00:00Z'))
  assert.equal(r.pause, true)
  assert.equal(r.reason, 'peak')
})

test('shouldPause：东京用户北京时间 12:00（东京 13:00）→ 谷时不暂停', () => {
  // 北京周三 12:00 = UTC 04:00 = 东京周三 13:00
  // 北京时间 12:00 不在 [09:00,12:00) → 谷时
  const tokyoSettings = { ...SETTINGS, timezone: 'Asia/Tokyo' }
  const r = shouldPause(tokyoSettings, new Date('2026-08-19T04:00:00Z'))
  assert.equal(r.pause, false)
  assert.equal(r.reason, 'off-peak')
})

test('shouldPause：东京用户东京周末但北京还是工作日 → 周末不暂停', () => {
  // 东京周六 00:30 = UTC 周五 15:30 = 北京周五 23:30
  // 东京已经是周六（周末），但北京时间还是周五
  // 周末判定用东京时区 → 周末 → 不暂停
  const tokyoSettings = { ...SETTINGS, timezone: 'Asia/Tokyo' }
  const r = shouldPause(tokyoSettings, new Date('2026-08-21T15:30:00Z'))
  assert.equal(r.pause, false)
  assert.equal(r.reason, 'weekend')
})

test('shouldPause：北京时间周末但东京还是工作日 → 按东京判定周末', () => {
  // 北京周日 00:30 = UTC 周六 16:30 = 东京周日 01:30
  // 北京和东京都是周日 → 周末
  // 换个场景：北京周一 00:30 = UTC 周日 16:30 = 东京周一 01:30
  // 北京已是周一（工作日），东京也是周一 → 不是周末
  // 再换：北京周日 23:30 = UTC 周日 15:30 = 东京周一 00:30
  // 北京还是周日（周末），东京已是周一（工作日）
  // 周末判定用东京时区 → 周一 → 不是周末 → 按峰谷判
  const tokyoSettings = { ...SETTINGS, timezone: 'Asia/Tokyo' }
  // 北京周日 23:30 = UTC 周日 15:30 → 东京周一 00:30
  const r = shouldPause(tokyoSettings, new Date('2026-08-23T15:30:00Z'))
  // 东京周一（工作日）→ 不是周末
  // 北京时间 23:30 → 不在高峰 → 谷时
  assert.equal(r.pause, false)
  assert.equal(r.reason, 'off-peak')
})

test('shouldPause：首尔用户（Asia/Seoul）与北京时间差相同，行为一致', () => {
  const seoulSettings = { ...SETTINGS, timezone: 'Asia/Seoul' }
  // 北京周三 10:00 = UTC 02:00 = 首尔周三 11:00
  const r = shouldPause(seoulSettings, new Date('2026-08-19T02:00:00Z'))
  assert.equal(r.pause, true)
  assert.equal(r.reason, 'peak')
})

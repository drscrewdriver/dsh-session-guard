/**
 * date-range.ts 测试：双月日历的网格、范围状态机、默认播种。
 *
 * 直接 import .ts（node 类型擦除），本文件自身保持纯 JS。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addMonths,
  compareIso,
  daysInMonth,
  fromIso,
  inRange,
  isEdge,
  monthGrid,
  monthTitle,
  nextRange,
  rangeLabel,
  seedRange,
  toIso,
  weekdayLabels,
} from '../src/client/date-range.ts'

test('toIso / fromIso：往返与非法输入', () => {
  assert.equal(toIso({ y: 2026, m: 9, d: 1 }), '2026-09-01')
  assert.equal(toIso({ y: 2026, m: 12, d: 31 }), '2026-12-31')
  assert.deepEqual(fromIso('2026-09-01'), { y: 2026, m: 9, d: 1 })
  for (const bad of ['', 'nope', '2026/09/01', '2026-13-01', '2026-00-10', '2026-09-32', null, undefined]) {
    assert.equal(fromIso(bad), null, `${String(bad)} 应判为非法`)
  }
})

test('daysInMonth：闰年 2 月', () => {
  assert.equal(daysInMonth(2026, 2), 28)
  assert.equal(daysInMonth(2024, 2), 29)
  assert.equal(daysInMonth(2026, 9), 30)
  assert.equal(daysInMonth(2026, 1), 31)
})

test('addMonths：跨年前后都能正确进位/借位', () => {
  assert.deepEqual(addMonths({ y: 2026, m: 12 }, 1), { y: 2027, m: 1 })
  assert.deepEqual(addMonths({ y: 2026, m: 1 }, -1), { y: 2025, m: 12 })
  assert.deepEqual(addMonths({ y: 2026, m: 9 }, 12), { y: 2027, m: 9 })
  assert.deepEqual(addMonths({ y: 2026, m: 9 }, -12), { y: 2025, m: 9 })
  assert.deepEqual(addMonths({ y: 2026, m: 11 }, 3), { y: 2027, m: 2 })
})

test('weekdayLabels：周一到周日（与 DSH 排期面板一致）', () => {
  assert.deepEqual(weekdayLabels(), ['一', '二', '三', '四', '五', '六', '日'])
})

test('monthGrid：2026-09 的正确排布（9/1 是周二 → 前面补 8/31 一格）', () => {
  const cells = monthGrid(2026, 9)
  assert.equal(cells.length % 7, 0, '格子数必须是整周的倍数')
  assert.deepEqual(cells[0], { day: 31, iso: '2026-08-31', inMonth: false })
  assert.deepEqual(cells[1], { day: 1, iso: '2026-09-01', inMonth: true })
  assert.equal(cells.filter((c) => c.inMonth).length, 30)
  // 9/1 落在第 2 列（索引 1）→ 表头「一」列是 8/31
  assert.equal(cells[7].iso, '2026-09-07')
})

test('monthGrid：2026-10 从周四开始（与设计稿一致）', () => {
  const cells = monthGrid(2026, 10)
  // 前 3 格是 9/28、9/29、9/30（周一~周三），第 4 格才是 10/1
  assert.deepEqual(cells.slice(0, 4).map((c) => c.iso), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'])
  assert.equal(cells[3].inMonth, true)
  assert.equal(cells.filter((c) => c.inMonth).length, 31)
})

test('monthGrid：恰好整周开始的月份不补前导格', () => {
  // 2026-06-01 是周一
  const cells = monthGrid(2026, 6)
  assert.equal(cells[0].iso, '2026-06-01')
  assert.equal(cells[0].inMonth, true)
})

test('monthTitle', () => {
  assert.equal(monthTitle(2026, 9), '2026年 9月')
  assert.equal(monthTitle(2026, 10), '2026年 10月')
})

test('compareIso / inRange / isEdge', () => {
  assert.equal(compareIso('2026-09-01', '2026-09-02'), -1)
  assert.equal(compareIso('2026-09-01', '2026-09-01'), 0)
  assert.equal(compareIso('2026-10-01', '2026-09-30'), 1)

  assert.equal(inRange('2026-09-15', '2026-09-01', '2026-09-30'), true)
  assert.equal(inRange('2026-09-01', '2026-09-01', '2026-09-30'), true, '闭区间含起点')
  assert.equal(inRange('2026-09-30', '2026-09-01', '2026-09-30'), true, '闭区间含终点')
  assert.equal(inRange('2026-10-01', '2026-09-01', '2026-09-30'), false)
  // 参数反着传也能正确判断
  assert.equal(inRange('2026-09-15', '2026-09-30', '2026-09-01'), true)
  // 未选满不算命中
  assert.equal(inRange('2026-09-15', '', '2026-09-30'), false)
  assert.equal(inRange('2026-09-15', '2026-09-01', ''), false)

  assert.equal(isEdge('2026-09-01', '2026-09-01', '2026-09-30'), true)
  assert.equal(isEdge('2026-09-15', '2026-09-01', '2026-09-30'), false)
})

test('nextRange：第一次点起点、第二次点终点', () => {
  const a = nextRange('', '', '2026-09-10')
  assert.deepEqual(a, { from: '2026-09-10', to: '', done: false })
  const b = nextRange(a.from, a.to, '2026-09-12')
  assert.deepEqual(b, { from: '2026-09-10', to: '2026-09-12', done: true })
})

test('nextRange：终点早于起点时自动对调', () => {
  const r = nextRange('2026-09-10', '', '2026-09-05')
  assert.deepEqual(r, { from: '2026-09-05', to: '2026-09-10', done: true })
})

test('nextRange：已有完整区间时再点是「重新开始」', () => {
  const r = nextRange('2026-09-10', '2026-09-12', '2026-09-20')
  assert.deepEqual(r, { from: '2026-09-20', to: '', done: false })
})

test('nextRange：同一天点两次 → 单日区间', () => {
  const r = nextRange('2026-09-10', '', '2026-09-10')
  assert.deepEqual(r, { from: '2026-09-10', to: '2026-09-10', done: true })
})

test('seedRange：开始 = 当前时刻整点，结束 = +2 小时', () => {
  const now = new Date(2026, 8, 26, 14, 37, 12)
  const s = seedRange(now)
  assert.equal(s.fromDate, '2026-09-26')
  assert.equal(s.fromHour, '14', '取当前小时，分钟被抹掉')
  assert.equal(s.toDate, '2026-09-26')
  assert.equal(s.toHour, '16')
})

test('seedRange：跨天时结束日期顺延', () => {
  const s = seedRange(new Date(2026, 8, 26, 23, 5, 0))
  assert.equal(s.fromDate, '2026-09-26')
  assert.equal(s.fromHour, '23')
  assert.equal(s.toDate, '2026-09-27', '23:00 + 2h 应落到次日')
  assert.equal(s.toHour, '01')
})

test('seedRange：跨月/跨年也正确', () => {
  const s = seedRange(new Date(2026, 11, 31, 23, 30, 0))
  assert.equal(s.fromDate, '2026-12-31')
  assert.equal(s.toDate, '2027-01-01')
  assert.equal(s.toHour, '01')
})

test('rangeLabel：未选满时给占位文案', () => {
  assert.deepEqual(rangeLabel('', ''), { text: '开始日期 → 结束日期', placeholder: true })
  assert.deepEqual(rangeLabel('2026-09-26', ''), { text: '2026-09-26 → 结束日期', placeholder: true })
  assert.deepEqual(rangeLabel('2026-09-26', '2026-09-27'), {
    text: '2026-09-26 → 2026-09-27',
    placeholder: false,
  })
})

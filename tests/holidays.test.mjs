/**
 * holidays.js / holiday-store.js 测试：修正表解析、指纹、查表与缓存/抓取链路。
 *
 * 全部离线：fetchImpl 注入 mock，root 注入临时目录；不触网。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BUILTIN_2026,
  normalizeDays,
  parseHolidayCn,
  fingerprint,
  buildMap,
  ymdOf,
  isRestDay,
} from '../src/holidays.js'
import { createHolidayStore, holidayFilePath } from '../src/holiday-store.js'

const FIXTURE = {
  year: 2027,
  days: [
    { name: '元旦', date: '2027-01-01', isOffDay: true },
    { name: '元旦', date: '2027-01-02', isOffDay: true },
    { name: '元旦', date: '2027-01-03', isOffDay: true },
    { name: '春节调休', date: '2027-02-06', isOffDay: false },
  ],
}

test('normalizeDays：排序去重，同日重复以末条为准', () => {
  const out = normalizeDays([
    { date: '2027-01-03', isOffDay: true },
    { date: '2027-01-01', isOffDay: false },
    { date: '2027-01-01', isOffDay: true },
  ])
  assert.deepEqual(out.map((d) => d.date), ['2027-01-01', '2027-01-03'])
  assert.equal(out[0].isOffDay, true) // 末条覆盖
})

test('normalizeDays / parseHolidayCn 拒绝非法形态', () => {
  assert.throws(() => normalizeDays('nope'))
  assert.throws(() => normalizeDays([{ date: '2027-1-1', isOffDay: true }])) // 未补零
  assert.throws(() => normalizeDays([{ date: '2027-01-01', isOffDay: 'true' }]))
  assert.deepEqual(normalizeDays([]), []) // 空表合法（parseHolidayCn 层再查 year）
  assert.throws(() => parseHolidayCn(null))
  assert.throws(() => parseHolidayCn({ year: 1999, days: [] }))
  assert.throws(() => parseHolidayCn({ year: 2027, days: [{ date: '2026-05-01', isOffDay: true }] })) // 跨年条目
  const ok = parseHolidayCn(FIXTURE)
  assert.equal(ok.year, 2027)
  assert.equal(ok.days.length, 4)
})

test('fingerprint：与顺序/无关字段无关，与内容一一对应', () => {
  const a = fingerprint(normalizeDays(FIXTURE.days))
  const b = fingerprint(normalizeDays([...FIXTURE.days].reverse().map((d) => ({ ...d, name: '改名了' }))))
  assert.equal(a, b)
  const c = fingerprint(normalizeDays([{ date: '2027-02-06', isOffDay: true }]))
  assert.notEqual(a, c)
  assert.match(a, /^sha256:[0-9a-f]{64}$/)
})

test('buildMap + isRestDay：表内条目定乾坤，表外回退自然周末', () => {
  const map = buildMap(normalizeDays(FIXTURE.days))
  assert.equal(isRestDay(map, '2027-01-01', 5), true) // 周五法定假 → 休
  assert.equal(isRestDay(map, '2027-02-06', 6), false) // 周六补班 → 工作
  assert.equal(isRestDay(map, '2027-02-07', 0), true) // 表外周日 → 自然周末
  assert.equal(isRestDay(map, '2027-02-08', 1), false) // 表外周一 → 工作
  assert.equal(isRestDay(null, '2027-02-06', 6), true) // 无表退回自然周末
})

test('ymdOf 补零', () => {
  assert.equal(ymdOf({ year: 2026, month: 9, day: 5 }), '2026-09-05')
})

test('BUILTIN_2026：39 条 = 33 放假日 + 6 调休补班日，与 holiday-cn 定稿一致', () => {
  const off = BUILTIN_2026.days.filter((d) => d.isOffDay === true)
  const work = BUILTIN_2026.days.filter((d) => d.isOffDay === false)
  assert.equal(BUILTIN_2026.days.length, 39)
  assert.equal(off.length, 33)
  assert.equal(work.length, 6)
  // 关键调休补班日（全部落周末）
  assert.deepEqual(work.map((d) => d.date).sort(), [
    '2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10',
  ])
  // 国庆 10-01 ~ 10-07 连续放假
  for (let d = 1; d <= 7; d++) {
    assert.equal(buildMap(BUILTIN_2026.days).get(`2026-10-0${d}`), true)
  }
})

// ── holiday-store：临时 root + mock fetch，覆盖启动指纹校验与按年抓取 ──

function withTmpRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'session-guard-hol-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

const fakeNow = () => Date.UTC(2026, 10, 20, 4, 0, 0) // 北京 2026-11-20 12:00 → 相关年份 2026 + 2027

test('store：内置打底；缺年经 mock 抓取落缓存，二次启动走缓存且指纹一致', async (t) => {
  const root = withTmpRoot(t)
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(String(url))
    if (String(url).includes('/2027.json')) {
      return { ok: true, json: async () => FIXTURE }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  const s1 = createHolidayStore({ fetchImpl, now: fakeNow, root })
  s1.loadAll()
  assert.equal(s1.map().get('2026-10-01'), true) // 内置 2026 立即可用
  assert.equal(s1.map().has('2027-01-01'), false)
  await s1.ensureFresh({ autoFetch: true })
  assert.equal(s1.map().get('2027-01-01'), true) // 2027 抓到
  assert.equal(s1.map().get('2027-02-06'), false) // 调休补班
  const cached = JSON.parse(readFileSync(holidayFilePath(2027, root), 'utf8'))
  assert.equal(cached.sha, fingerprint(normalizeDays(FIXTURE.days)))
  assert.equal(cached.year, 2027)

  // 二次启动：不抓也直接从缓存装载（source=cache），且 ensureFresh 24h 内不重抓
  calls.length = 0
  const s2 = createHolidayStore({ fetchImpl: () => assert.fail('不该再抓'), now: fakeNow, root })
  s2.loadAll()
  assert.equal(s2.map().get('2027-01-01'), true)
  const info27 = s2.info().find((x) => x.year === 2027)
  assert.equal(info27.source, 'cache')
  await s2.ensureFresh({ autoFetch: true })
  assert.equal(calls.length, 0)
})

test('store：缓存指纹不符 → 启动校验弃用，回退内置并触发重抓', async (t) => {
  const root = withTmpRoot(t)
  writeFileSync(holidayFilePath(2026, root), JSON.stringify({
    year: 2026,
    sha: 'sha256:' + '0'.repeat(64), // 故意对不上
    fetchedAt: 1,
    days: [{ date: '2026-10-01', isOffDay: false }],
  }))
  const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({}) })
  const s = createHolidayStore({ fetchImpl, now: fakeNow, root })
  s.loadAll()
  // 坏缓存被弃，内置接管：10-01 仍放假
  assert.equal(s.map().get('2026-10-01'), true)
  assert.equal(s.info().find((x) => x.year === 2026).source, 'builtin')
})

test('store：autoFetch=false 不发请求；fetchImpl=null（断网档）同样静默降级', async (t) => {
  const root = withTmpRoot(t)
  const s = createHolidayStore({ fetchImpl: () => assert.fail('不该抓'), now: fakeNow, root })
  s.loadAll()
  await s.ensureFresh({ autoFetch: false }) // 2027 缺表也不抓
  assert.equal(s.map().has('2027-01-01'), false)
  const s2 = createHolidayStore({ fetchImpl: null, now: fakeNow, root })
  s2.loadAll()
  await assert.doesNotReject(s2.ensureFresh({ autoFetch: true }))
})

test('store：抓取内容非法（跨年条目）不落缓存不脏内存', async (t) => {
  const root = withTmpRoot(t)
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ year: 2027, days: [{ date: '2026-12-31', isOffDay: true }] }),
  })
  const s = createHolidayStore({ fetchImpl, now: fakeNow, root })
  await s.ensureFresh({ autoFetch: true })
  assert.equal(s.map().has('2027-01-01'), false)
  assert.throws(() => readFileSync(holidayFilePath(2027, root), 'utf8')) // 文件未写
})

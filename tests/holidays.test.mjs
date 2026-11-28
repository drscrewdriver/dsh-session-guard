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
  BUILTIN_2027,
  BUILTIN_TABLES,
  normalizeDays,
  parseHolidayCn,
  fingerprint,
  buildMap,
  ymdOf,
  isRestDay,
} from '../lib/holidays.js'
import { createHolidayStore, holidayFilePath } from '../lib/holiday-store.js'

/**
 * 抓取夹具用 2028：2026 / 2027 都已在 BUILTIN_TABLES 里，
 * 只有 2028 是「内置缺表、必须联网补」的年份——正是 store 要测的场景。
 */
const FIXTURE = {
  year: 2028,
  days: [
    { name: '元旦', date: '2028-01-01', isOffDay: true },
    { name: '元旦', date: '2028-01-02', isOffDay: true },
    { name: '元旦', date: '2028-01-03', isOffDay: true },
    { name: '春节调休', date: '2028-02-06', isOffDay: false },
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
  assert.equal(ok.year, 2028)
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
  assert.equal(isRestDay(map, '2028-01-01', 5), true) // 周五法定假 → 休
  assert.equal(isRestDay(map, '2028-02-06', 6), false) // 周六补班 → 工作
  assert.equal(isRestDay(map, '2028-02-07', 0), true) // 表外周日 → 自然周末
  assert.equal(isRestDay(map, '2028-02-08', 1), false) // 表外周一 → 工作
  assert.equal(isRestDay(null, '2028-02-06', 6), true) // 无表退回自然周末
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

test('BUILTIN_2027：34 条 = 29 放假日 + 5 调休补班日，与 holiday-cn 定稿一致', () => {
  const off = BUILTIN_2027.days.filter((d) => d.isOffDay === true)
  const work = BUILTIN_2027.days.filter((d) => d.isOffDay === false)
  assert.equal(BUILTIN_2027.days.length, 34)
  assert.equal(off.length, 29)
  assert.equal(work.length, 5)
  // 5 个补班日（全部落周末）
  assert.deepEqual(work.map((d) => d.date).sort(), [
    '2027-01-31', '2027-02-14', '2027-05-08', '2027-09-26', '2027-10-09',
  ])
  // 补班日必须真的是周末，否则表本身写错了（拿不准就断言，别靠人眼）
  for (const d of work) {
    const wd = new Date(`${d.date}T12:00:00+08:00`).getUTCDay()
    assert.ok(wd === 0 || wd === 6, `${d.date} 补班日应落在周末，实际 weekday=${wd}`)
  }
  // 春节 2/5 ~ 2/13 连续放假、10/1 ~ 10/7 国庆连续放假
  const map = buildMap(BUILTIN_2027.days)
  for (let d = 5; d <= 13; d++) assert.equal(map.get(`2027-02-${String(d).padStart(2, '0')}`), true)
  for (let d = 1; d <= 7; d++) assert.equal(map.get(`2027-10-0${d}`), true)
  // 表内日期与 year 自洽
  for (const d of BUILTIN_2027.days) assert.equal(d.date.slice(0, 4), '2027')
  // 指纹钉住快照：上游改表 → 本断言红 → 提示同步内置表与 changelog（别静默漂移）
  assert.equal(fingerprint(BUILTIN_2027.days), 'sha256:8f999d47875f5216c39851ed46d0b4d6ee58ed112328fda94b5888f9780331af')
})

test('BUILTIN_TABLES：2026 + 2027 双年在册，且已排序去重（可直接参与指纹比对）', () => {
  assert.deepEqual(BUILTIN_TABLES.map((t) => t.year), [2026, 2027])
  for (const t of BUILTIN_TABLES) {
    assert.deepEqual(
      t.days.map((d) => d.date),
      normalizeDays(t.days).map((d) => d.date),
      `${t.year} 内置表应与 normalizeDays 归一化结果一致`,
    )
    assert.match(t.paper, /^https:\/\/www\.gov\.cn\//)
  }
})

// ── holiday-store：临时 root + mock fetch，覆盖启动指纹校验与按年抓取 ──

function withTmpRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'session-guard-hol-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

// 北京 2027-11-20 12:00 → 相关年份 2027 + 2028；2027 有内置表，2028 必须抓
const fakeNow = () => Date.UTC(2027, 10, 20, 4, 0, 0)

test('store：内置打底（2027 在册）；缺年经 mock 抓取落缓存，二次启动走缓存且指纹一致', async (t) => {
  const root = withTmpRoot(t)
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(String(url))
    if (String(url).includes('/2028.json')) {
      return { ok: true, json: async () => FIXTURE }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  const s1 = createHolidayStore({ fetchImpl, now: fakeNow, root })
  s1.loadAll()
  // 相关年份 = 2027（内置命中）+ 2028（缺表）；2026 此刻不相关，不装载
  assert.equal(s1.map().get('2027-10-01'), true) // 内置 2027 立即可用（离线也有春节/补班判定）
  assert.equal(s1.map().get('2027-02-14'), false) // 2027 春节补班日
  assert.equal(s1.map().has('2028-01-01'), false) // 2028 缺表
  assert.deepEqual(s1.info().map((x) => [x.year, x.source]), [[2027, 'builtin']]) // 2028 无表
  await s1.ensureFresh({ autoFetch: true })
  assert.equal(s1.map().get('2028-01-01'), true) // 2028 抓到
  assert.equal(s1.map().get('2028-02-06'), false) // 调休补班
  const cached = JSON.parse(readFileSync(holidayFilePath(2028, root), 'utf8'))
  assert.equal(cached.sha, fingerprint(normalizeDays(FIXTURE.days)))
  assert.equal(cached.year, 2028)

  // 二次启动：不抓也直接从缓存装载（source=cache），且 ensureFresh 24h 内不重抓
  calls.length = 0
  const s2 = createHolidayStore({ fetchImpl: () => assert.fail('不该再抓'), now: fakeNow, root })
  s2.loadAll()
  assert.equal(s2.map().get('2028-01-01'), true)
  const info28 = s2.info().find((x) => x.year === 2028)
  assert.equal(info28.source, 'cache')
  await s2.ensureFresh({ autoFetch: true })
  assert.equal(calls.length, 0)
})

test('store：缓存指纹不符 → 启动校验弃用，回退内置并触发重抓', async (t) => {
  const root = withTmpRoot(t)
  writeFileSync(holidayFilePath(2027, root), JSON.stringify({
    year: 2027,
    sha: 'sha256:' + '0'.repeat(64), // 故意对不上
    fetchedAt: 1,
    days: [{ date: '2027-10-01', isOffDay: false }],
  }))
  const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({}) })
  const s = createHolidayStore({ fetchImpl, now: fakeNow, root })
  s.loadAll()
  // 坏缓存被弃，内置接管：10-01 仍放假
  assert.equal(s.map().get('2027-10-01'), true)
  assert.equal(s.info().find((x) => x.year === 2027).source, 'builtin')
})

test('store：autoFetch=false 不发请求；fetchImpl=null（断网档）同样静默降级', async (t) => {
  const root = withTmpRoot(t)
  const s = createHolidayStore({ fetchImpl: () => assert.fail('不该抓'), now: fakeNow, root })
  s.loadAll()
  await s.ensureFresh({ autoFetch: false }) // 2028 缺表也不抓
  assert.equal(s.map().has('2028-01-01'), false)
  const s2 = createHolidayStore({ fetchImpl: null, now: fakeNow, root })
  s2.loadAll()
  await assert.doesNotReject(s2.ensureFresh({ autoFetch: true }))
  // 断网仍有内置表可用：2027 春节补班照常识别
  assert.equal(s2.map().get('2027-02-14'), false)
})

test('store：抓取内容非法（跨年条目）不落缓存不脏内存', async (t) => {
  const root = withTmpRoot(t)
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ year: 2028, days: [{ date: '2027-12-31', isOffDay: true }] }),
  })
  const s = createHolidayStore({ fetchImpl, now: fakeNow, root })
  await s.ensureFresh({ autoFetch: true })
  assert.equal(s.map().has('2028-01-01'), false)
  assert.throws(() => readFileSync(holidayFilePath(2028, root), 'utf8')) // 文件未写
})

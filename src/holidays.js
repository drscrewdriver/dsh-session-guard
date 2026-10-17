/**
 * dsh-session-guard — 法定节假日 / 调休修正表（纯逻辑，零 IO，可单测）。
 *
 * 数据源：holiday-cn（NateScarlet/holiday-cn，每日自动解析国务院公告），
 * 全年 JSON：`{ year, papers: [...], days: [{ name, date, isOffDay }] }`。
 * `isOffDay: true` = 放假（含落在周末的假日）；`false` = 调休补班日
 * （本来是周六日但要上班）。表外日期回退自然周末判定。
 *
 * 内置快照只覆盖已定稿年份（2026，39 条 = 33 放假日 + 6 调休补班日）；
 * 未覆盖年份由 holiday-store.js 按年自动抓取，抓不到即退化为纯自然周末
 * （fail-open，与插件一贯风格一致）。
 */
import { createHash } from 'node:crypto'

/** 'YYYY-MM-DD' 严格形态（月/日补零），也是 Map 键与指纹序列化的唯一形态。 */
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/**
 * 2026 年国务院放假安排（公告 content_7047091，经 holiday-cn 机读）。
 * 只保留判定需要的 date / isOffDay 两键；name 仅注释性内嵌于分组注释。
 */
export const BUILTIN_2026 = Object.freeze({
  year: 2026,
  paper: 'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm',
  days: Object.freeze([
    // 元旦：1/1(四)-1/3(六) 放假，1/4(日) 补班
    { date: '2026-01-01', isOffDay: true },
    { date: '2026-01-02', isOffDay: true },
    { date: '2026-01-03', isOffDay: true },
    { date: '2026-01-04', isOffDay: false },
    // 春节：2/15-2/23 放假，2/14(六)、2/28(六) 补班
    { date: '2026-02-14', isOffDay: false },
    { date: '2026-02-15', isOffDay: true },
    { date: '2026-02-16', isOffDay: true },
    { date: '2026-02-17', isOffDay: true },
    { date: '2026-02-18', isOffDay: true },
    { date: '2026-02-19', isOffDay: true },
    { date: '2026-02-20', isOffDay: true },
    { date: '2026-02-21', isOffDay: true },
    { date: '2026-02-22', isOffDay: true },
    { date: '2026-02-23', isOffDay: true },
    { date: '2026-02-28', isOffDay: false },
    // 清明：4/4-4/6 放假，无补班
    { date: '2026-04-04', isOffDay: true },
    { date: '2026-04-05', isOffDay: true },
    { date: '2026-04-06', isOffDay: true },
    // 劳动节：5/1-5/5 放假，5/9(六) 补班
    { date: '2026-05-01', isOffDay: true },
    { date: '2026-05-02', isOffDay: true },
    { date: '2026-05-03', isOffDay: true },
    { date: '2026-05-04', isOffDay: true },
    { date: '2026-05-05', isOffDay: true },
    { date: '2026-05-09', isOffDay: false },
    // 端午：6/19-6/21 放假，无补班
    { date: '2026-06-19', isOffDay: true },
    { date: '2026-06-20', isOffDay: true },
    { date: '2026-06-21', isOffDay: true },
    // 中秋：9/25-9/27 放假，9/20(日) 补班
    { date: '2026-09-20', isOffDay: false },
    { date: '2026-09-25', isOffDay: true },
    { date: '2026-09-26', isOffDay: true },
    { date: '2026-09-27', isOffDay: true },
    // 国庆：10/1-10/7 放假，10/10(六) 补班
    { date: '2026-10-01', isOffDay: true },
    { date: '2026-10-02', isOffDay: true },
    { date: '2026-10-03', isOffDay: true },
    { date: '2026-10-04', isOffDay: true },
    { date: '2026-10-05', isOffDay: true },
    { date: '2026-10-06', isOffDay: true },
    { date: '2026-10-07', isOffDay: true },
    { date: '2026-10-10', isOffDay: false },
  ]),
})

/** 内置快照数组（新定稿年份在此追加）。 */
export const BUILTIN_TABLES = Object.freeze([BUILTIN_2026])

/**
 * 校验并归一化 holiday-cn `days` 数组。
 * 逐条要求 `date` 为补零 'YYYY-MM-DD' 且 `isOffDay` 为布尔；
 * 排序去重（同日重复以末条为准，与上游「后公告覆盖前公告」一致）。
 * @param {unknown} raw days 原始数组
 * @returns {{date:string, isOffDay:boolean}[]} 归一化条目（新数组）
 * @throws {Error} 非数组 / 空条目 / 形态非法
 */
export function normalizeDays(raw) {
  if (!Array.isArray(raw)) throw new Error('holiday days: not an array')
  const byDate = new Map()
  for (const item of raw) {
    const date = item && typeof item === 'object' ? item.date : undefined
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      throw new Error(`holiday days: bad date ${JSON.stringify(date)}`)
    }
    if (typeof item.isOffDay !== 'boolean') {
      throw new Error(`holiday days: bad isOffDay for ${date}`)
    }
    byDate.set(date, { date, isOffDay: item.isOffDay })
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * 解析 holiday-cn 全年 JSON（远端响应 / 缓存文件通吃）。
 * @param {unknown} json 已 parse 的对象
 * @returns {{year:number, days:{date:string, isOffDay:boolean}[]}}
 * @throws {Error} 形态不合 schema（year 与条目日期必须一致）
 */
export function parseHolidayCn(json) {
  if (json === null || typeof json !== 'object') throw new Error('holiday json: not an object')
  const year = Number(json.year)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('holiday json: bad year')
  const days = normalizeDays(json.days)
  for (const d of days) {
    if (Number(d.date.slice(0, 4)) !== year) throw new Error(`holiday json: day ${d.date} outside ${year}`)
  }
  return { year, days }
}

/**
 * 修正表指纹：对归一化（排序去重）后的 `date=isOffDay` 序列做 sha256。
 * 只哈希判定语义相关字段——name / papers / 抓取时间不参与，
 * 上游改文案不会引起伪变化。
 * @param {{date:string, isOffDay:boolean}[]} days normalizeDays / parseHolidayCn 产物
 * @returns {string} 'sha256:<hex>'
 */
export function fingerprint(days) {
  const canon = days.map((d) => `${d.date}=${d.isOffDay ? 1 : 0}`).join(';')
  return `sha256:${createHash('sha256').update(canon).digest('hex')}`
}

/**
 * 归一化 days → 查表 Map：'YYYY-MM-DD' → 是否放假日。
 * @param {{date:string, isOffDay:boolean}[]} days
 * @returns {Map<string, boolean>}
 */
export function buildMap(days) {
  const m = new Map()
  for (const d of days) m.set(d.date, d.isOffDay)
  return m
}

/** wallClock 分量 → 补零 'YYYY-MM-DD'。 */
export function ymdOf(wc) {
  return `${wc.year}-${String(wc.month).padStart(2, '0')}-${String(wc.day).padStart(2, '0')}`
}

/**
 * 修正表感知的「当天是否休息日」：
 * - 表内条目：`isOffDay` 直接定乾坤（true 放假 / false 调休补班——周末也算上班）；
 * - 表外 / 无表（map 为 null 或空）：回退自然周末（0=周日、6=周六）。
 * @param {Map<string, boolean>|null|undefined} map buildMap 产物
 * @param {string} ymd 补零日期串
 * @param {number} weekday 该日期在用户时区的星期（0-6，同 wallClock 约定）
 * @returns {boolean}
 */
export function isRestDay(map, ymd, weekday) {
  if (map instanceof Map && map.has(ymd)) return map.get(ymd) === true
  return weekday === 0 || weekday === 6
}

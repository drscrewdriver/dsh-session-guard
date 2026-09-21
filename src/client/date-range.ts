/**
 * dsh-session-guard — 日期范围选择的纯逻辑（零依赖，可单测）。
 *
 * 供 `date-range-picker.tsx` 使用：双月日历的网格、范围高亮、默认值播种。
 * 全部按**本地日期**（年/月/日）运算，不做时区换算 —— 选出来的字符串是要交给
 * 主机按配置时区解释的墙钟日期。
 *
 * 约定：一周从**周一**开始（与 DSH 排期面板一致：一 二 三 四 五 六 日）。
 */

/** `YYYY-MM-DD` 形态。 */
export interface Ymd {
  y: number
  m: number // 1-12
  d: number // 1-31
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

/** 周一到周日的表头。 */
export function weekdayLabels(): string[] {
  return [...WEEKDAY_LABELS]
}

/** 两位补零。 */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** `Ymd` → `YYYY-MM-DD`。 */
export function toIso({ y, m, d }: Ymd): string {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** `YYYY-MM-DD` → `Ymd`；非法返回 null。 */
export function fromIso(value: string | null | undefined): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value : '')
  if (m === null) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, m: mo, d }
}

/** 该月天数（用「下个月 0 号」拿到，天然处理闰年）。 */
export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

/** 该月 1 号是周几（0=周日…6=周六）。 */
function firstWeekday(y: number, m: number): number {
  return new Date(y, m - 1, 1).getDay()
}

/** 月份偏移（可跨年）。 */
export function addMonths({ y, m }: Pick<Ymd, 'y' | 'm'>, delta: number): { y: number; m: number } {
  const total = y * 12 + (m - 1) + delta
  return { y: Math.floor(total / 12), m: (total % 12) + 1 }
}

/**
 * 该月的日历网格：周一开头，长度固定为 7 的倍数（可能 5 或 6 周）。
 * 非本月的格子用 `inMonth: false` 标出（界面上淡显）。
 */
export function monthGrid(y: number, m: number): Array<{ day: number; iso: string; inMonth: boolean }> {
  const lead = (firstWeekday(y, m) + 6) % 7 // 周一=0
  const total = daysInMonth(y, m)
  const cells: Array<{ day: number; iso: string; inMonth: boolean }> = []
  // 上月补位
  const prev = addMonths({ y, m }, -1)
  const prevTotal = daysInMonth(prev.y, prev.m)
  for (let i = lead - 1; i >= 0; i -= 1) {
    const d = prevTotal - i
    cells.push({ day: d, iso: toIso({ y: prev.y, m: prev.m, d }), inMonth: false })
  }
  for (let d = 1; d <= total; d += 1) cells.push({ day: d, iso: toIso({ y, m, d }), inMonth: true })
  // 下月补位到整周
  const next = addMonths({ y, m }, 1)
  let d = 1
  while (cells.length % 7 !== 0) {
    cells.push({ day: d, iso: toIso({ y: next.y, m: next.m, d }), inMonth: false })
    d += 1
  }
  return cells
}

/** 月份标题，如 `2026年 9月`。 */
export function monthTitle(y: number, m: number): string {
  return `${y}年 ${m}月`
}

/** 日期先后比较：a<b → -1，相等 → 0，a>b → 1（字符串直接比即可，形态定长）。 */
export function compareIso(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/** 该日是否落在 `[from, to]` 闭区间内（任一端为空则不算命中）。 */
export function inRange(iso: string, from: string, to: string): boolean {
  if (from === '' || to === '') return false
  const [lo, hi] = compareIso(from, to) <= 0 ? [from, to] : [to, from]
  return compareIso(iso, lo) >= 0 && compareIso(iso, hi) <= 0
}

/** 是否区间的端点。 */
export function isEdge(iso: string, from: string, to: string): boolean {
  return iso === from || iso === to
}

/**
 * 默认区间：**开始 = 当前时刻**（本小时整点），结束 = +2 小时（跨天则顺延到下一天）。
 *
 * 与用户要求一致：「默认开始时间是当前时刻」。返回 `YYYY-MM-DD` 与 `HH` 四段，
 * 直接喂给日历 + 小时下拉。
 */
export function seedRange(now: Date): { fromDate: string; fromHour: string; toDate: string; toHour: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
  return {
    fromDate: toIso({ y: start.getFullYear(), m: start.getMonth() + 1, d: start.getDate() }),
    fromHour: pad2(start.getHours()),
    toDate: toIso({ y: end.getFullYear(), m: end.getMonth() + 1, d: end.getDate() }),
    toHour: pad2(end.getHours()),
  }
}

/**
 * 一次点击后的范围状态机：
 * - 还没选起点，或已有完整区间 → 该点成为**新起点**，终点清空（等待第二次点击）；
 * - 已有起点、没有终点 → 该点成为终点；若它在起点之前，则两者对调（允许反着选）。
 */
export function nextRange(
  from: string,
  to: string,
  picked: string,
): { from: string; to: string; done: boolean } {
  if (from === '' || to !== '') return { from: picked, to: '', done: false }
  return compareIso(picked, from) >= 0
    ? { from, to: picked, done: true }
    : { from: picked, to: from, done: true }
}

/** 触发器上显示的区间文案（未选满时给占位）。 */
export function rangeLabel(from: string, to: string): { text: string; placeholder: boolean } {
  if (from !== '' && to !== '') return { text: `${from} → ${to}`, placeholder: false }
  if (from !== '') return { text: `${from} → 结束日期`, placeholder: true }
  return { text: '开始日期 → 结束日期', placeholder: true }
}

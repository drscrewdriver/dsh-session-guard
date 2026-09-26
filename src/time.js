/**
 * dsh-session-guard — 时间原语（纯函数，零依赖，可单测）。
 *
 * 本模块只保留**底层原语**：窗口算术、周几、时区投影。
 * 峰谷**策略判定**（哪些窗口生效、周末怎么算、什么时候该暂停）已迁到
 * `src/time-policy.js` 的 `TimePolicyResolver`——v0.3.0 起全部由
 * `config/session-guard.json` 配置驱动，不再硬编码 09:00-12:00 / 14:00-18:00。
 *
 * 时区一律通过 `Intl.DateTimeFormat(timeZone)` 投影成墙钟分量，
 * 避免裸 `getUTCDay()` 导致跨时区边界错一天的 bug（D1）。
 */

/**
 * DeepSeek 官方峰谷计费的基准时区（固定北京时间 UTC+8）。
 *
 * v0.3.0 起它只作**默认值**使用：`peakPolicy.timezone` 未设置时，
 * 峰窗口判定跟随顶层 `timezone`（默认同为 'Asia/Shanghai'，行为不变）。
 * 需要把峰谷钉在计费基准时区而周末仍按本地时区时，显式设置
 * `peakPolicy.timezone: "Asia/Shanghai"`。
 */
export const BILLING_TIMEZONE = 'Asia/Shanghai'

/** 解析 "HH:mm" → 当日分钟数，非法返回 null。 */
export function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

/** 闭开区间 [s, e)，跨午夜安全（s > e 时视为跨天环绕）。 */
export function inWindow(t, s, e) {
  if (s === e) return false
  return s < e ? t >= s && t < e : t >= s || t < e
}

/**
 * 把某时刻投影为配置时区（IANA，DST 感知）的墙钟分量。
 * @param {string} tz IANA 时区名，如 "Asia/Shanghai"
 * @param {Date} date
 * @returns {{year:number,month:number,day:number,weekday:number,minutes:number}}
 *          weekday: 0=周日 ... 6=周六（与 getUTCDay 同约定，但基于配置时区的日期）
 */
export function wallClock(tz, date) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const parts = {}
  for (const p of f.formatToParts(date)) parts[p.type] = p.value
  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  // 由该时区的「今天」日期反推 weekday，避免 UTC 边界错位（D1）。
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const minutes = Number(parts.hour) * 60 + Number(parts.minute)
  return { year, month, day, weekday, minutes }
}

/** 周末（0=周日, 6=周六）。 */
export function isWeekend(weekday) {
  return weekday === 0 || weekday === 6
}

/** 某墙钟分钟是否处于任一窗口内（不做周几过滤；周几过滤见 time-policy）。 */
export function isInPeak(wc, windows) {
  return windows.some((w) => {
    const s = parseHHMM(w && w.start)
    const e = parseHHMM(w && w.end)
    if (s === null || e === null) return false
    return inWindow(wc.minutes, s, e)
  })
}

/**
 * 某时区「本地 00:00」对应的绝对时刻（毫秒）。
 * 通过两次投影迭代消掉时区偏移（第二次覆盖 DST 切换日）。
 * @param {string} tz IANA 时区名
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} day
 * @returns {number} epoch 毫秒
 */
export function localMidnight(tz, year, month, day) {
  const target = Date.UTC(year, month - 1, day)
  let guess = target
  for (let i = 0; i < 2; i++) {
    const wc = wallClock(tz, new Date(guess))
    const actual = Date.UTC(wc.year, wc.month - 1, wc.day, Math.floor(wc.minutes / 60), wc.minutes % 60)
    guess -= actual - target
  }
  return guess
}

/**
 * dsh-session-guard — 时间判定（纯函数，零依赖，可单测）。
 *
 * 峰谷判定必须基于 DeepSeek 官方计费基准——北京时间（UTC+8），
 * 而不是用户配置的本地时区。用硬编码 BILLING_TIMEZONE = 'Asia/Shanghai'。
 *
 * 周末判定基于用户配置时区（settings.timezone），因为"周末"是用户本地概念。
 *
 * 两者都通过 `Intl.DateTimeFormat(timeZone)` 投影，避免裸 `getUTCDay()`
 * 导致北京周末边界错 8 小时的 bug。
 *
 * 高峰时段为左闭右开 [start, end)；跨午夜窗口（start > end）安全。
 */

/**
 * DeepSeek 峰谷计费基准时区（固定北京时间 UTC+8）。
 * 峰谷窗口判定必须用此时区，不受用户 timezone 配置影响。
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

/** 某墙钟分钟是否处于任一高峰窗口内。 */
export function isInPeak(wc, windows) {
  return windows.some((w) => {
    const s = parseHHMM(w && w.start)
    const e = parseHHMM(w && w.end)
    if (s === null || e === null) return false
    return inWindow(wc.minutes, s, e)
  })
}

/**
 * 主判定：此刻是否应触发高峰暂停。
 *
 * - 峰谷判定：固定使用 BILLING_TIMEZONE（北京时间），与 DeepSeek 官方计费一致；
 * - 周末判定：使用 settings.timezone（用户本地时区），因为周末是用户本地概念。
 *
 * @param {object} settings { enabled, weekendMode, timezone, peakWindows }
 * @param {Date} date
 * @returns {{pause:boolean, reason:string}}
 *          reason: 'disabled' | 'weekend' | 'peak' | 'off-peak'
 */
export function shouldPause(settings, date) {
  if (!settings || settings.enabled !== true) return { pause: false, reason: 'disabled' }
  // 周末判定：用用户配置时区（用户本地的周末）
  const wcUser = wallClock(settings.timezone, date)
  if (settings.weekendMode === true && isWeekend(wcUser.weekday)) {
    return { pause: false, reason: 'weekend' }
  }
  // 峰谷判定：固定北京时间（DeepSeek 官方计费基准）
  const wcBilling = wallClock(BILLING_TIMEZONE, date)
  if (isInPeak(wcBilling, settings.peakWindows || [])) {
    return { pause: true, reason: 'peak' }
  }
  return { pause: false, reason: 'off-peak' }
}

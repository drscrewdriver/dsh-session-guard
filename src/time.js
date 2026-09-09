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

/**
 * 从 `date` 出发、下一个「确定非峰」的时刻；找不到返回 null。
 * 取两个候选的最小值：
 * (a) 当前所在高峰窗口的结束时刻（计费时区，跨午夜安全）；
 * (b) 下一个周末日的本地 00:00（周末整天非峰，仅 weekendMode 开启时）。
 * @param {object} settings
 * @param {Date} date 已知处于高峰
 * @returns {number|null}
 */
function nextOffPeakInstant(settings, date) {
  const t0 = date.getTime()
  // 分钟对齐：秒/毫秒在墙钟分钟偏移下与时区无关（所有 IANA 偏移均为整分钟）
  const minuteStart = t0 - (date.getUTCSeconds() * 1000 + date.getUTCMilliseconds())
  const candidates = []
  const wcBilling = wallClock(BILLING_TIMEZONE, date)
  for (const w of settings.peakWindows || []) {
    const s = parseHHMM(w && w.start)
    const e = parseHHMM(w && w.end)
    if (s === null || e === null) continue
    if (!inWindow(wcBilling.minutes, s, e)) continue
    // 跨午夜窗口（s > e）在 m < e 时结束于当日，m >= s 时结束于次日
    const deltaMin =
      s < e
        ? e - wcBilling.minutes
        : wcBilling.minutes >= s
          ? e + 1440 - wcBilling.minutes
          : e - wcBilling.minutes
    candidates.push(minuteStart + deltaMin * 60_000)
  }
  if (settings.weekendMode === true) {
    const wcUser = wallClock(settings.timezone, date)
    for (let k = 1; k <= 7; k++) {
      const day = new Date(Date.UTC(wcUser.year, wcUser.month - 1, wcUser.day + k))
      if (!isWeekend(day.getUTCDay())) continue
      candidates.push(localMidnight(settings.timezone, day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()))
      break
    }
  }
  let best = null
  for (const c of candidates) {
    if (!Number.isFinite(c) || c <= t0) continue
    if (best === null || c < best) best = c
  }
  return best
}

/**
 * 距下一个「非峰」时刻的毫秒数（hold 释放定时用）。
 *
 * - 当前已非峰（含周末 / disabled）→ 0；
 * - 处于高峰 → 当前窗口结束时刻（跨午夜安全）；
 * - weekendMode 开启且窗口会跨进周末 → 取「周末开始」这个更早的时刻；
 * - 配置异常（非法窗口 / 无法算出）→ 0（由 30s tick 兜底，不挂死）。
 * @param {object} settings 同 shouldPause
 * @param {Date} [date]
 * @returns {number} 毫秒（>= 0）
 */
export function msUntilOffPeak(settings, date = new Date()) {
  if (!settings || settings.enabled !== true) return 0
  const t0 = date.getTime()
  let probe = date
  // 相邻窗口 / 设置热改时逐级往后找；上限 8 次防死循环。
  for (let i = 0; i < 8; i++) {
    if (!shouldPause(settings, probe).pause) return Math.max(0, probe.getTime() - t0)
    const next = nextOffPeakInstant(settings, probe)
    if (next === null) return 0
    probe = new Date(next)
  }
  return Math.max(0, probe.getTime() - t0)
}

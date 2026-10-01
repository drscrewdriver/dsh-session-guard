/**
 * dsh-session-guard — 可配置峰谷时间策略（TimePolicyResolver，纯函数，零依赖，可单测）。
 *
 * 这是 v0.3.0 引入的**唯一权威时间判定**：`time.js` 保留为底层原语
 * （parseHHMM / inWindow / wallClock / isWeekend / localMidnight），其
 * `shouldPause` / `msUntilOffPeak` 退化为本模块的薄适配层，因此所有既有调用点
 * （scheduler / wiring / request-guard / step-gate）自动升级为可配置策略。
 *
 * ── 模式（MODE）─────────────────────────────────────────────────────────
 *   OFF_PEAK  周末（weekendPolicy 命中）——全天谷时，畅快跑
 *   PEAK      命中任一 peakWindow
 *   NORMAL    工作日且不在任何 peakWindow 内
 *
 * 判定优先级（spec §二）：
 *   1. 命中 weekendPolicy（且 enabled）→ OFF_PEAK
 *   2. 否则命中 peakWindows → PEAK
 *   3. 否则 → NORMAL
 *
 * ── 时区 ────────────────────────────────────────────────────────────────
 * `timezone` 驱动**全部**判定（星期 / 周几 / 窗口），默认 'Asia/Shanghai'。
 * `peakPolicy.timezone` 可选，仅覆盖峰窗口判定——用于把峰谷钉在计费基准时区
 * （如 DeepSeek 官方按北京时间计费）而周末仍按用户本地时区。未设置时回退
 * `timezone`。默认配置下两者同为 Asia/Shanghai，行为与 v0.2.0 完全一致。
 *
 * ── 窗口 ────────────────────────────────────────────────────────────────
 * 窗口为左闭右开 [start, end)。`start > end` 视为**跨午夜**窗口。跨午夜窗口归属
 * 「起始日」：周五 22:00-06:00 覆盖周六 01:00，因此 `days: ['fri']` 时周六 01:00
 * 仍算 PEAK。窗口的 `days` 省略/为空 = 每天生效。
 *
 * ── 兼容 ────────────────────────────────────────────────────────────────
 * 同时接受旧形态（`peakWindows: [{start,end}]` + `weekendMode: true`）与新形态
 * （`peakPolicy.peakWindows[{name,start,end,days}]` + `weekendPolicy`），
 * 因此设置面板与 config/session-guard.json 可以混用。
 */
import { BILLING_TIMEZONE, localMidnight, parseHHMM, wallClock } from './time.js'

/** 时间模式（spec §二）。 */
export const MODES = {
  PEAK: 'PEAK',
  OFF_PEAK: 'OFF_PEAK',
  NORMAL: 'NORMAL',
}

/** 周末策略唯一支持的模式：整个周末视为谷时。 */
export const WEEKEND_MODE_OFF_PEAK = 'offPeak'

/** 周几 token（3 字母）→ JS weekday（0=周日 … 6=周六）。 */
export const DAY_TOKENS = Object.freeze(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])

/** 全称 / 常见别名 → 3 字母 token。 */
const DAY_ALIASES = {
  sunday: 'sun',
  monday: 'mon',
  tuesday: 'tue',
  tues: 'tue',
  wednesday: 'wed',
  thursday: 'thu',
  thurs: 'thu',
  friday: 'fri',
  saturday: 'sat',
}

/** 默认周末日（spec §一）。 */
export const DEFAULT_WEEKEND_DAYS = Object.freeze(['sat', 'sun'])

/**
 * 校验 IANA 时区名是否可用。
 *
 * 为什么必须校验：`wallClock()` 把时区直接交给 `Intl.DateTimeFormat`，
 * 一个拼错的时区（如 `Asia/Shangai`）会让 `resolve()` 抛 RangeError。
 * tick 里那个 catch 会把它吞掉 → **整个守卫静默失效（永不暂停）**，
 * 而用户看不到任何配置错误——这是最危险的失效方向。所以在配置边界就拦下。
 * @param {unknown} tz
 * @returns {boolean}
 */
export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || tz === '') return false
  try {
    // 构造即校验；非法名抛 RangeError。别名（Asia/Calcutta 等）同样被接受。
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * 稳定的 JSON 序列化（对象键排序，保证同一语义 → 同一字符串）。
 *
 * 两处用途：① `resolverFor` 的 memo 签名（漏字段会返回过期策略）；
 * ② `readCfg` 判断「设置面板里的键是否被用户改过」（键序无关比较）。
 * @param {unknown} v
 * @returns {string}
 */
export function stableStringify(v) {
  if (v === null) return 'null'
  const t = typeof v
  if (t === 'undefined') return 'undefined'
  if (t === 'number') return Number.isFinite(v) ? String(v) : 'null'
  if (t !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const keys = Object.keys(v).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`
}

/**
 * 单个周几 token → JS weekday。
 * @param {unknown} token 'mon' / 'Monday' / 1 / '1'
 * @returns {number|null} 0..6，非法返回 null
 */
export function parseDay(token) {
  if (typeof token === 'number' && Number.isInteger(token)) {
    return token >= 0 && token <= 6 ? token : null
  }
  if (typeof token !== 'string') return null
  const key = token.trim().toLowerCase()
  if (key === '') return null
  if (/^[0-6]$/.test(key)) return Number(key)
  const alias = DAY_ALIASES[key]
  if (alias !== undefined) return DAY_TOKENS.indexOf(alias)
  if (key.length === 3) {
    const idx = DAY_TOKENS.indexOf(key)
    return idx >= 0 ? idx : null
  }
  return null
}

/**
 * 周几列表 → Set<number>；空/缺失/全非法 → null（= 每天生效）。
 * @param {unknown} list
 * @returns {Set<number>|null}
 */
export function parseDays(list) {
  if (list === undefined || list === null) return null
  if (!Array.isArray(list)) return null
  const out = new Set()
  for (const t of list) {
    const d = parseDay(t)
    if (d !== null) out.add(d)
  }
  return out.size === 0 ? null : out
}

/**
 * 归一化峰窗口列表：兼容旧 `{start,end}` 与新 `{name,start,end,days}`，丢弃非法项。
 * @param {unknown} raw
 * @returns {Array<{name:string, start:string, end:string, startMin:number, endMin:number, days:Set<number>|null}>}
 */
export function normalizePeakWindows(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const w of raw) {
    if (w === null || typeof w !== 'object') continue
    const startMin = parseHHMM(w.start)
    const endMin = parseHHMM(w.end)
    if (startMin === null || endMin === null || startMin === endMin) continue
    out.push({
      name: typeof w.name === 'string' && w.name !== '' ? w.name : `${w.start}-${w.end}`,
      start: String(w.start),
      end: String(w.end),
      startMin,
      endMin,
      days: parseDays(w.days),
    })
  }
  return out
}

/**
 * 归一化周末策略：兼容旧 `weekendMode: boolean` 与新 `weekendPolicy`。
 * @param {unknown} raw weekendPolicy
 * @param {unknown} legacyWeekendMode settings.weekendMode
 * @param {string[]} [errors] 收集非法配置说明（可选）
 * @returns {{enabled:boolean, days:number[], mode:string}}
 */
export function normalizeWeekend(raw, legacyWeekendMode, errors) {
  const policy = raw !== null && typeof raw === 'object' ? raw : null
  if (policy === null) {
    // 旧形态：weekendMode 布尔决定，默认周六周日。
    return {
      enabled: legacyWeekendMode === undefined ? true : legacyWeekendMode === true,
      days: [0, 6],
      mode: WEEKEND_MODE_OFF_PEAK,
    }
  }
  let enabled = policy.enabled === undefined ? true : policy.enabled === true
  if (legacyWeekendMode === false && policy.enabled === undefined) enabled = false
  let mode = WEEKEND_MODE_OFF_PEAK
  if (policy.mode !== undefined) {
    if (policy.mode === WEEKEND_MODE_OFF_PEAK) mode = WEEKEND_MODE_OFF_PEAK
    else {
      // 未知 mode：拒绝并把周末规则关掉（绝不静默当作 offPeak——那会放大执行）。
      errors?.push(`weekendPolicy.mode ${JSON.stringify(policy.mode)} is not supported (only "offPeak") — weekend rule disabled`)
      enabled = false
    }
  }
  const days = parseDays(policy.days)
  const list = days === null ? [0, 6] : [...days].sort((a, b) => a - b)
  return { enabled, days: list, mode }
}

/** 把 'HH:mm' 归一化为 'HH:mm'（补零），失败返回原字符串。 */
function normalizeHHMM(value) {
  const m = parseHHMM(value)
  if (m === null) return String(value)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * 选一个可用时区：合法就用它；非法（或未提供）回退 `fallback` 并记 error。
 * @param {unknown} value
 * @param {string} fallback
 * @param {string} label 报错里显示的配置键名
 * @param {string[]} [errors]
 * @returns {string}
 */
function pickTimeZone(value, fallback, label, errors) {
  if (value === undefined || value === null || value === '') return fallback
  if (isValidTimeZone(value)) return value
  errors?.push(`${label} ${JSON.stringify(value)} is not a valid IANA time zone — falling back to ${fallback}`)
  return fallback
}

/**
 * 归一化整份策略配置（新 `peakPolicy`/`weekendPolicy` 优先，旧扁平字段兜底）。
 * @param {object} config settings 形态或 config/session-guard.json 形态
 * @param {string[]} [errors] 收集非法配置说明
 * @returns {{enabled:boolean, timezone:string, peakTimezone:string, windows:Array, weekend:{enabled:boolean,days:number[],mode:string}}}
 */
export function normalizePolicy(config, errors) {
  const cfg = config !== null && typeof config === 'object' ? config : {}
  const peakPolicy = cfg.peakPolicy !== null && typeof cfg.peakPolicy === 'object' ? cfg.peakPolicy : null

  // 时区必须校验：拼错的时区会让 wallClock 抛 RangeError，tick 的 catch 一吞，
  // 整个守卫就静默失效（永不暂停）——必须在边界拦下并回退默认。
  const timezone = pickTimeZone(cfg.timezone, BILLING_TIMEZONE, 'timezone', errors)
  // peakPolicy.timezone 仅覆盖峰窗口判定（计费基准钉扎）；未设置则跟随 timezone。
  // 扁平键 peakTimezone 由 config-file.normalizeConfig 产出，二者等价。
  const peakTzRaw =
    peakPolicy !== null && typeof peakPolicy.timezone === 'string' && peakPolicy.timezone !== ''
      ? peakPolicy.timezone
      : cfg.peakTimezone
  const peakTimezone = pickTimeZone(peakTzRaw, timezone, 'peakPolicy.timezone', errors)

  const windows = normalizePeakWindows(peakPolicy !== null && peakPolicy.peakWindows !== undefined ? peakPolicy.peakWindows : cfg.peakWindows)

  let enabled = true
  if (cfg.enabled !== undefined) enabled = cfg.enabled === true
  else if (peakPolicy !== null && peakPolicy.enabled !== undefined) enabled = peakPolicy.enabled === true

  // 周末：新嵌套形态优先；否则用扁平形态（weekendMode / weekendDays / weekendPolicyMode）。
  let weekendRaw = cfg.weekendPolicy
  if (weekendRaw === undefined || weekendRaw === null) {
    if (cfg.weekendMode !== undefined || cfg.weekendDays !== undefined || cfg.weekendPolicyMode !== undefined) {
      weekendRaw = {
        enabled: cfg.weekendMode === undefined ? true : cfg.weekendMode === true,
        days: cfg.weekendDays,
        mode: cfg.weekendPolicyMode,
      }
    }
  }

  return {
    enabled,
    timezone,
    peakTimezone,
    windows,
    weekend: normalizeWeekend(weekendRaw, cfg.weekendMode, errors),
  }
}

/** 某窗口是否命中给定「墙钟日 + 分钟」。跨午夜窗口按起始日归属。 */
export function windowMatches(w, weekday, minutes) {
  const { startMin: s, endMin: e, days } = w
  if (s < e) {
    if (!(minutes >= s && minutes < e)) return false
    return days === null || days.has(weekday)
  }
  // 跨午夜：[s, 24:00) 属当日，[00:00, e) 属前一日。
  if (minutes >= s) return days === null || days.has(weekday)
  if (minutes < e) return days === null || days.has((weekday + 6) % 7)
  return false
}

/**
 * 把某时区的「墙钟年月日时分」投影回绝对时刻（epoch ms），DST 感知。
 * 两次迭代消掉时区偏移（第二次覆盖 DST 切换日），与 time.localMidnight 同法。
 * @param {string} tz IANA 时区名
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} day
 * @param {number} minutes 当日分钟数
 * @returns {number} epoch 毫秒
 */
export function zonedTimeToEpoch(tz, year, month, day, minutes) {
  const target = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60)
  let guess = target
  for (let i = 0; i < 2; i++) {
    const wc = wallClock(tz, new Date(guess))
    const actual = Date.UTC(wc.year, wc.month - 1, wc.day, Math.floor(wc.minutes / 60), wc.minutes % 60)
    guess -= actual - target
  }
  return guess
}

/** 由墙钟日期反推「N 天后」的年月日 + 周几（用 UTC 算术避免本地时区干扰）。 */
function shiftWallDay(wc, deltaDays) {
  const d = new Date(Date.UTC(wc.year, wc.month - 1, wc.day + deltaDays))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() }
}

/**
 * 可配置峰谷时间策略解析器（spec §二 TimePolicyResolver）。
 *
 * @param {object} config settings 形态或 config/session-guard.json 形态
 * @param {{clock?:()=>Date, errors?:string[]}} [deps]
 */
export function createTimePolicyResolver(config, deps = {}) {
  const errors = deps.errors
  const policy = normalizePolicy(config, errors)
  const clock = typeof deps.clock === 'function' ? deps.clock : () => new Date()

  /** 周末：weekday ∈ weekendPolicy.days 且 enabled。 */
  function isWeekendDay(weekday) {
    return policy.weekend.enabled && policy.weekend.days.includes(weekday)
  }

  /**
   * 当前命中的峰窗口（含跨午夜起始日归属）；无则 null。
   * 周末优先（spec §二.1）：本地周末日一律 null，即使落在窗口区间内。
   */
  function activePeakWindow(date) {
    if (!policy.enabled) return null
    // 周末是**用户本地**概念 → 用 policy.timezone 判定（与 resolve 的周末判定同源）。
    if (isWeekendDay(wallClock(policy.timezone, date).weekday)) return null
    const wc = wallClock(policy.peakTimezone, date)
    for (const w of policy.windows) {
      if (windowMatches(w, wc.weekday, wc.minutes)) return w
    }
    return null
  }

  /**
   * 主判定（spec §二）：周一 10:00 → PEAK；周一 13:00 → NORMAL；周六/周日 → OFF_PEAK。
   * @param {Date} [date]
   * @returns {{mode:string, reason:string, weekday:number, minutes:number, window:object|null, windowName:string|null, weekend:boolean, at:number}}
   *          reason: 'disabled' | 'weekend' | 'peak' | 'off-peak'
   */
  function resolve(date = clock()) {
    const wcUser = wallClock(policy.timezone, date)
    const base = {
      weekday: wcUser.weekday,
      minutes: wcUser.minutes,
      window: null,
      windowName: null,
      weekend: false,
      at: date.getTime(),
    }
    if (!policy.enabled) return { ...base, mode: MODES.NORMAL, reason: 'disabled' }
    // 1) 周末优先（spec §二.1）：直接 OFF_PEAK，不再判峰窗口。
    if (isWeekendDay(wcUser.weekday)) {
      return { ...base, mode: MODES.OFF_PEAK, reason: 'weekend', weekend: true }
    }
    // 2) 峰窗口（spec §二.2）。
    const w = activePeakWindow(date)
    if (w !== null) {
      return { ...base, mode: MODES.PEAK, reason: 'peak', window: w, windowName: w.name }
    }
    // 3) 其余 → NORMAL（工作日谷时）。
    return { ...base, mode: MODES.NORMAL, reason: 'off-peak' }
  }

  /**
   * 下一个峰窗口「出现」（含是哪个窗口）。周末日不参与（周末整日 OFF_PEAK）。
   * @param {Date} [date]
   * @returns {{at:number, window:object, name:string}|null}
   */
  function nextPeakOccurrence(date = clock()) {
    if (!policy.enabled || policy.windows.length === 0) return null
    const t0 = date.getTime()
    // 日历日按 peakTimezone 迭代：`days` 是窗口自身的属性，窗口定义在 peakTimezone 里
    // （把峰谷钉在计费基准时区时，它与本地时区的日历日可能相差一天）。
    const wcPeak = wallClock(policy.peakTimezone, date)
    let best = null
    for (let offset = 0; offset <= 8; offset++) {
      const day = shiftWallDay(wcPeak, offset)
      for (const w of policy.windows) {
        if (w.days !== null && !w.days.has(day.weekday)) continue
        const t = zonedTimeToEpoch(policy.peakTimezone, day.year, day.month, day.day, w.startMin)
        // 同一天的窗口若已过去则跳过（严格 > now）。
        if (t <= t0) continue
        // 落在本地周末内的开始时刻不算峰。
        if (isWeekendDay(wallClock(policy.timezone, new Date(t)).weekday)) continue
        if (best === null || t < best.at) best = { at: t, window: w, name: w.name }
      }
      if (best !== null) break // 逐日前进，首次命中即最近
    }
    return best
  }

  /**
   * 下一个峰窗口开始时刻（epoch ms）；无则 null。
   * @param {Date} [date]
   * @returns {number|null}
   */
  function nextPeakStart(date = clock()) {
    const occ = nextPeakOccurrence(date)
    return occ === null ? null : occ.at
  }

  /**
   * 以 `startMs` 为起点的那次窗口出现，其结束时刻（epoch ms）。跨午夜窗口结束于次日。
   * @param {object} w 归一化窗口
   * @param {number} startMs 该次窗口的开始时刻
   * @returns {number}
   */
  function windowEndAfterStart(w, startMs) {
    const wc = wallClock(policy.peakTimezone, new Date(startMs))
    const day = shiftWallDay(wc, w.endMin > w.startMin ? 0 : 1)
    return zonedTimeToEpoch(policy.peakTimezone, day.year, day.month, day.day, w.endMin)
  }

  /**
   * 距下一个峰开始的分钟数。
   * 仅当当前处于 NORMAL 时有意义；已在 PEAK / OFF_PEAK / disabled → null。
   * @param {Date} [date]
   * @returns {number|null} 分钟（可含小数）
   */
  function minutesUntilPeak(date = clock()) {
    if (resolve(date).mode !== MODES.NORMAL) return null
    const next = nextPeakStart(date)
    if (next === null) return null
    return (next - date.getTime()) / 60_000
  }

  /**
   * 当前峰窗口的结束时刻（epoch ms）；不在峰内返回 null。跨午夜安全。
   */
  function currentPeakEnd(date = clock()) {
    const w = activePeakWindow(date)
    if (w === null) return null
    const wc = wallClock(policy.peakTimezone, date)
    const t0 = date.getTime()
    let deltaMin
    if (w.startMin < w.endMin) deltaMin = w.endMin - wc.minutes
    else if (wc.minutes >= w.startMin) deltaMin = w.endMin + 1440 - wc.minutes
    else deltaMin = w.endMin - wc.minutes
    // 秒级精度保留：从当前分钟的起点推进 deltaMin 分钟。
    const minuteStart = t0 - date.getUTCSeconds() * 1000 - date.getUTCMilliseconds()
    return minuteStart + deltaMin * 60_000
  }

  /**
   * 距「确定非峰」的毫秒数（hold 释放 / 精确退峰定时用）。
   *
   * 取两个候选的最小值：
   *   (a) 当前峰窗口结束；
   *   (b) weekendPolicy 生效时，下一个周末日的本地 00:00（周末整日谷时，比窗口结束更早）。
   * 已非峰 → 0；配置异常 → 0（由 tick 兜底，不挂死）。
   * @param {Date} [date]
   * @returns {number} 毫秒（>= 0）
   */
  function msUntilOffPeak(date = clock()) {
    if (!policy.enabled) return 0
    const t0 = date.getTime()
    // 已非峰（NORMAL / OFF_PEAK）→ 0。
    if (resolve(date).mode !== MODES.PEAK) return 0
    const candidates = []
    const end = currentPeakEnd(date)
    if (end !== null && end > t0) candidates.push(end)
    if (policy.weekend.enabled && policy.weekend.days.length > 0) {
      const wc = wallClock(policy.timezone, date)
      for (let k = 1; k <= 7; k++) {
        const day = shiftWallDay(wc, k)
        if (!policy.weekend.days.includes(day.weekday)) continue
        candidates.push(localMidnight(policy.timezone, day.year, day.month, day.day))
        break
      }
    }
    let best = null
    for (const c of candidates) {
      if (!Number.isFinite(c) || c <= t0) continue
      if (best === null || c < best) best = c
    }
    // 配置异常（算不出窗口结束）→ 0，由 30s tick 兜底，不挂死。
    return best === null ? 0 : Math.max(0, best - t0)
  }

  return {
    policy,
    modes: MODES,
    resolve,
    activePeakWindow,
    nextPeakOccurrence,
    nextPeakStart,
    windowEndAfterStart,
    minutesUntilPeak,
    currentPeakEnd,
    msUntilOffPeak,
    isWeekendDay,
    /** 归一化后的策略（只读快照）。 */
    describe: () => ({
      enabled: policy.enabled,
      timezone: policy.timezone,
      peakTimezone: policy.peakTimezone,
      weekend: { ...policy.weekend, days: [...policy.weekend.days] },
      windows: policy.windows.map((w) => ({
        name: w.name,
        start: normalizeHHMM(w.start),
        end: normalizeHHMM(w.end),
        days: w.days === null ? null : [...w.days].sort((a, b) => a - b).map((d) => DAY_TOKENS[d]),
      })),
    }),
  }
}

/** 1 条 memo：cfg 是每次读设置新造的浅对象，按语义签名命中即可。 */
let memoKey = null
let memoResolver = null

/**
 * 语义签名：**整份 cfg 的稳定序列化**。
 *
 * 早先只挑了「看起来相关」的字段，结果漏掉扁平键 `peakTimezone`（以及
 * `weekendDays` / `weekendPolicyMode`）→ 峰时区热改后 memo 继续返回旧策略，
 * 而 `/peak`、`snapshot()` 建的是新 resolver，UI 与判定路径口径不一致。
 * 整对象序列化虽然略贵，但**不可能漏字段**——这是热路径正确性的正确取舍。
 */
function policySignature(cfg) {
  try {
    return stableStringify(cfg ?? null)
  } catch {
    return null
  }
}

/**
 * 取（带 1 条 memo 的）策略解析器。热路径（tick / 每个请求）复用同一实例，
 * cfg 语义变化时自动重建。
 * @param {object} cfg
 * @param {{clock?:()=>Date, errors?:string[]}} [deps]
 */
export function resolverFor(cfg, deps) {
  const key = policySignature(cfg)
  if (key !== null && key === memoKey && memoResolver !== null) return memoResolver
  const next = createTimePolicyResolver(cfg, deps)
  if (key !== null) {
    memoKey = key
    memoResolver = next
  }
  return next
}

/**
 * 便捷判定：此刻模式 + 是否应暂停（`pause = mode === PEAK`）。
 * @param {object} cfg
 * @param {Date} [date]
 * @returns {{pause:boolean, reason:string, mode:string, windowName:string|null}}
 */
export function resolveVerdict(cfg, date) {
  const r = resolverFor(cfg).resolve(date)
  return { pause: r.mode === MODES.PEAK, reason: r.reason, mode: r.mode, windowName: r.windowName }
}

/**
 * 此刻是否应触发高峰暂停（v0.3.0 起的权威入口，替代 v0.2.0 `time.shouldPause`）。
 *
 * `reason` 取值：'disabled' | 'weekend' | 'peak' | 'off-peak'——
 * `'weekend'` 对应 OFF_PEAK，`'off-peak'` 对应工作日 NORMAL。
 * @param {object} settings
 * @param {Date} date
 * @returns {{pause:boolean, reason:string}}
 */
export function shouldPause(settings, date = new Date()) {
  const v = resolveVerdict(settings, date)
  return { pause: v.pause, reason: v.reason }
}

/**
 * 距下一个「非峰」时刻的毫秒数（hold 释放定时用，替代 v0.2.0 `time.msUntilOffPeak`）。
 * @param {object} settings
 * @param {Date} [date]
 * @returns {number} 毫秒（>= 0）
 */
export function msUntilOffPeak(settings, date = new Date()) {
  return resolverFor(settings).msUntilOffPeak(date)
}

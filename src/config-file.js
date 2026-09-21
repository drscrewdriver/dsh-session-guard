/**
 * dsh-session-guard — `config/session-guard.json` 配置加载（v0.3.0）。
 *
 * 用户只改这一个 JSON 文件即可调整：peak 时间 / 提前提醒时间 / timeout / 默认动作 /
 * 时区 / 周末定义。DSH 原生没有「按插件读配置文件」的机制（插件配置走 cordis
 * settings 服务），所以本模块自己定义搜索顺序，并且**永不抛异常**：
 * 任何读/解析失败都收集到 `errors` 里，调用方照常跑默认配置（fail-open）。
 *
 * ── 搜索顺序（先命中先用）──────────────────────────────────────────────
 *   1. `$DSH_SESSION_GUARD_CONFIG`           显式指定文件（便于测试 / 多环境）
 *   2. `$DSH_HOME/config/session-guard.json` 用户级（正常使用改这里）
 *   3. `<cwd>/config/session-guard.json`     项目级
 *   4. `<plugin>/config/session-guard.json`  插件自带默认（随包发布）
 *
 * ── 与 cordis settings 的关系 ───────────────────────────────────────────
 * 文件值作为 settings 命名空间的 **base（默认层）**，设置面板里的用户覆盖仍然优先。
 * 设置服务不可用时（fail-open）文件值直接生效。
 *
 * 本模块零 `@deepseek-ai/*` 值导入；文件系统访问可注入，便于单测。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DAY_TOKENS,
  DEFAULT_WEEKEND_DAYS,
  WEEKEND_MODE_OFF_PEAK,
  isValidTimeZone,
  parseDay,
  parseDays,
} from './time-policy.js'
import { parseHHMM } from './time.js'

/** 配置文件基名（spec §一）。 */
export const CONFIG_FILE_NAME = 'session-guard.json'

/** 配置目录名。 */
export const CONFIG_DIR_NAME = 'config'

/** `$DSH_HOME` 未设置时的兜底：`<home>/.dsh`。 */
export function dshHomeDir(env = process.env) {
  if (typeof env.DSH_HOME === 'string' && env.DSH_HOME !== '') return env.DSH_HOME
  const home = env.HOME || env.USERPROFILE || process.cwd()
  return join(home, '.dsh')
}

/**
 * 候选配置路径（按优先级）。
 * @param {{env?:object, cwd?:string, pluginDir?:string}} [deps]
 * @returns {string[]} 绝对/相对路径列表（可能不存在）
 */
export function candidateConfigPaths({ env = process.env, cwd = process.cwd(), pluginDir } = {}) {
  const out = []
  const explicit = env.DSH_SESSION_GUARD_CONFIG
  if (typeof explicit === 'string' && explicit !== '') out.push(explicit)
  out.push(join(dshHomeDir(env), CONFIG_DIR_NAME, CONFIG_FILE_NAME))
  out.push(join(cwd, CONFIG_DIR_NAME, CONFIG_FILE_NAME))
  if (typeof pluginDir === 'string' && pluginDir !== '') out.push(join(pluginDir, CONFIG_DIR_NAME, CONFIG_FILE_NAME))
  return out
}

/**
 * 取第一个存在的候选路径。
 * @param {string[]} paths
 * @param {(p:string)=>boolean} [exists]
 * @returns {string|null}
 */
export function selectConfigPath(paths, exists = existsSync) {
  for (const p of paths) {
    try {
      if (exists(p)) return p
    } catch {
      /* 忽略探测异常，继续下一个候选 */
    }
  }
  return null
}

/** 是否为纯对象（非数组 / null）。 */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * 校验时区串：非空字符串 **且** 能被 `Intl.DateTimeFormat` 接受。
 *
 * 只判「非空」是不够的——`Asia/Shangai` 这种拼写错误会一路走到 `wallClock`
 * 抛 RangeError，被 tick 的 catch 吞掉，导致守卫静默失效（永不暂停）。
 * @param {unknown} v
 * @param {string} label
 * @param {string[]} errors
 * @returns {string|undefined}
 */
function validTimeZone(v, label, errors) {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string' || v === '') {
    errors.push(`${label} must be a non-empty string — ignored`)
    return undefined
  }
  if (!isValidTimeZone(v)) {
    errors.push(`${label} ${JSON.stringify(v)} is not a valid IANA time zone — ignored (default kept)`)
    return undefined
  }
  return v
}

/**
 * 周几列表 → 规范 3 字母 token 数组，**保留用户书写顺序**（去重）。
 * 保留顺序是为了让 `weekendPolicy.days: ["sat","sun"]` 回读时仍是 ["sat","sun"]，
 * 而不是被排序成 ["sun","sat"]（判定本身走 Set，与顺序无关）。
 * @param {unknown[]} raw
 * @returns {string[]|null} null = 无有效项
 */
function canonicalDayTokens(raw) {
  if (parseDays(raw) === null) return null
  const out = []
  for (const t of raw) {
    const d = parseDay(t)
    if (d === null) continue
    const token = DAY_TOKENS[d]
    if (!out.includes(token)) out.push(token)
  }
  return out.length === 0 ? null : out
}

/**
 * 归一化 `peakPolicy.peakWindows`：保留 name / days，丢弃 start/end 非法的项。
 * @param {unknown} raw
 * @param {string[]} errors
 * @returns {Array<{name:string,start:string,end:string,days?:string[]}>}
 */
function normalizeConfigWindows(raw, errors) {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    errors.push('peakPolicy.peakWindows must be an array — ignored')
    return []
  }
  const out = []
  raw.forEach((w, i) => {
    if (!isPlainObject(w)) {
      errors.push(`peakPolicy.peakWindows[${i}] is not an object — ignored`)
      return
    }
    const startMin = parseHHMM(w.start)
    const endMin = parseHHMM(w.end)
    if (startMin === null || endMin === null) {
      errors.push(`peakPolicy.peakWindows[${i}] has an invalid start/end (expected "HH:mm") — ignored`)
      return
    }
    if (startMin === endMin) {
      errors.push(`peakPolicy.peakWindows[${i}] has start === end (empty window) — ignored`)
      return
    }
    const item = { name: typeof w.name === 'string' && w.name !== '' ? w.name : `${w.start}-${w.end}`, start: String(w.start), end: String(w.end) }
    if (w.days !== undefined && w.days !== null) {
      if (!Array.isArray(w.days)) {
        errors.push(`peakPolicy.peakWindows[${i}].days must be an array — treated as every day`)
      } else {
        const days = canonicalDayTokens(w.days)
        if (days === null) errors.push(`peakPolicy.peakWindows[${i}].days has no valid day name — treated as every day`)
        else item.days = days
      }
    }
    out.push(item)
  })
  return out
}

/**
 * 归一化 `weekendPolicy`。
 * @param {unknown} raw
 * @param {string[]} errors
 * @returns {{enabled:boolean, days?:string[], mode:string}}
 */
function normalizeConfigWeekend(raw, errors) {
  if (raw === undefined || raw === null) return { enabled: true, days: [...DEFAULT_WEEKEND_DAYS], mode: WEEKEND_MODE_OFF_PEAK }
  if (!isPlainObject(raw)) {
    errors.push('weekendPolicy must be an object — using defaults')
    return { enabled: true, days: [...DEFAULT_WEEKEND_DAYS], mode: WEEKEND_MODE_OFF_PEAK }
  }
  const out = { enabled: raw.enabled === undefined ? true : raw.enabled === true, mode: WEEKEND_MODE_OFF_PEAK }
  if (raw.mode !== undefined) {
    if (raw.mode === WEEKEND_MODE_OFF_PEAK) out.mode = WEEKEND_MODE_OFF_PEAK
    else {
      errors.push(`weekendPolicy.mode ${JSON.stringify(raw.mode)} is not supported (only "offPeak") — weekend rule disabled`)
      out.enabled = false
    }
  }
  if (raw.days !== undefined && raw.days !== null) {
    if (!Array.isArray(raw.days)) {
      errors.push('weekendPolicy.days must be an array — using default (sat, sun)')
      out.days = [...DEFAULT_WEEKEND_DAYS]
    } else {
      const days = canonicalDayTokens(raw.days)
      if (days === null) {
        errors.push('weekendPolicy.days has no valid day name — using default (sat, sun)')
        out.days = [...DEFAULT_WEEKEND_DAYS]
      } else {
        out.days = days
      }
    }
  } else {
    out.days = [...DEFAULT_WEEKEND_DAYS]
  }
  return out
}

/**
 * 把 `config/session-guard.json` 的形态转成插件内部的**扁平设置形态**
 * （可直接作为 cordis settings 的 base 层）。
 *
 * 只产出 JSON 里**实际出现**的键，未出现的键交给 DEFAULT_SETTINGS 兜底。
 * 纯函数：不做任何 IO，不抛异常。
 *
 * @param {unknown} raw JSON.parse 结果
 * @returns {{settings:object, errors:string[]}}
 */
export function normalizeConfig(raw) {
  const errors = []
  if (!isPlainObject(raw)) {
    if (raw !== undefined && raw !== null) errors.push('config root must be a JSON object — ignored')
    return { settings: {}, errors }
  }
  const settings = {}

  if (raw.enabled !== undefined) {
    if (typeof raw.enabled === 'boolean') settings.enabled = raw.enabled
    else errors.push('enabled must be a boolean — ignored')
  }
  if (raw.timezone !== undefined) {
    const tz = validTimeZone(raw.timezone, 'timezone', errors)
    if (tz !== undefined) settings.timezone = tz
  }

  const peak = raw.peakPolicy
  if (peak !== undefined && peak !== null) {
    if (!isPlainObject(peak)) {
      errors.push('peakPolicy must be an object — ignored')
    } else {
      if (peak.peakWindows !== undefined) {
        // 关键安全语义：**配置写坏时绝不静默清空窗口**。
        // 非数组、或数组里一项都不合法 → 报错并保留内置默认窗口，
        // 否则一个笔误就会让「高峰自动暂停」无声失效。
        if (!Array.isArray(peak.peakWindows)) {
          errors.push('peakPolicy.peakWindows must be an array — ignored (default windows kept)')
        } else {
          const windows = normalizeConfigWindows(peak.peakWindows, errors)
          if (windows.length === 0 && peak.peakWindows.length > 0) {
            errors.push('peakPolicy.peakWindows has no valid window — ignored (default windows kept)')
          } else {
            // 显式的空数组是合法意图（= 不要任何高峰窗口）。
            settings.peakWindows = windows
          }
        }
      }
      if (peak.timezone !== undefined) {
        const tz = validTimeZone(peak.timezone, 'peakPolicy.timezone', errors)
        if (tz !== undefined) settings.peakTimezone = tz
      }
    }
  }

  if (raw.weekendPolicy !== undefined && raw.weekendPolicy !== null) {
    const weekend = normalizeConfigWeekend(raw.weekendPolicy, errors)
    settings.weekendMode = weekend.enabled
    settings.weekendPolicyMode = weekend.mode
    if (weekend.days !== undefined) settings.weekendDays = weekend.days
  }

  return { settings, errors }
}

/**
 * 读 + 解析 + 归一化配置文件（永不抛异常）。
 * @param {{env?:object, cwd?:string, pluginDir?:string, exists?:(p:string)=>boolean, readFile?:(p:string)=>string}} [deps]
 * @returns {{path:string|null, candidates:string[], settings:object, errors:string[], raw:object|null}}
 */
export function loadConfigFile({ env = process.env, cwd = process.cwd(), pluginDir, exists = existsSync, readFile = (p) => readFileSync(p, 'utf8') } = {}) {
  const candidates = candidateConfigPaths({ env, cwd, pluginDir })
  const path = selectConfigPath(candidates, exists)
  if (path === null) return { path: null, candidates, settings: {}, errors: [], raw: null }

  let text
  try {
    text = readFile(path)
  } catch (e) {
    return { path, candidates, settings: {}, errors: [`cannot read config file: ${String((e && e.message) || e)}`], raw: null }
  }

  let raw
  try {
    raw = JSON.parse(text)
  } catch (e) {
    // JSON 坏掉时不阻塞插件启动——明确报错并退回默认配置。
    return { path, candidates, settings: {}, errors: [`invalid JSON: ${String((e && e.message) || e)}`], raw: null }
  }

  const { settings, errors } = normalizeConfig(raw)
  return { path, candidates, settings, errors, raw }
}

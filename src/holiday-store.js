/**
 * dsh-session-guard — 修正表的 IO 层：按年缓存落盘 + 自动抓取 + 启动指纹校验。
 *
 * 数据链路（全部 fail-open，任何失败只降级不抛错）：
 * 1. 内置快照（holidays.js BUILTIN_TABLES，已定稿年份）；
 * 2. 磁盘缓存 `$DSH_HOME/.dsh/session-guard/holidays/<year>.json`
 *    （`DSH_SESSION_GUARD_HOLIDAY_DIR` 可覆盖根目录）——**启动时校验指纹**：
 *    重算内容 sha256 与文件内记录比对，不一致视为损坏，弃用并触发重抓；
 * 3. 远端 holiday-cn（jsDelivr 主源、raw.githubusercontent 备源）——
 *    抓取成功且指纹有变化才原子写缓存（tmp + rename）；指纹一致只刷新
 *    checkedAt，不写盘（2026 已定稿，日常核对几乎恒等）。
 *
 * 「按年自动尝试抓取」：启动核对一次，之后每小时 ensureFresh；相关年份 =
 * 北京时间当年 + 12 月追加次年（国务院公告一般 11–12 月发布）。内置表
 * 覆盖的年份仍会被远端覆盖更新（公告修正 / 补录），但抓取节奏不变。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { storeRoot } from './store.js'
import { wallClock, BILLING_TIMEZONE } from './time.js'
import { BUILTIN_TABLES, buildMap, fingerprint, parseHolidayCn } from './holidays.js'

/** 单轮远端抓取超时（ms）。 */
const FETCH_TIMEOUT_MS = 10_000
/** 已到手年份表的复核间隔：24h。 */
const REFRESH_MS = 24 * 3600 * 1000

/** 缓存根目录（独立于 pause / 队列锁子目录）。 */
export function holidaysRoot() {
  return process.env.DSH_SESSION_GUARD_HOLIDAY_DIR || join(storeRoot(), 'holidays')
}

/** 某年缓存文件路径。 */
export function holidayFilePath(year, root = holidaysRoot()) {
  return join(root, `${Number(year)}.json`)
}

/** 远端候选源：jsDelivr 主源（国内可达性好），GitHub raw 备源。 */
export function holidayUrls(year) {
  const y = Number(year)
  return [
    `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
    `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${y}.json`,
  ]
}

/**
 * 创建修正表存储。
 * @param {object} [deps] { logger, fetchImpl, now, builtinTables, root }
 *        root 供单测注入临时目录；fetchImpl 供 mock。
 * @returns {{
 *   loadAll: () => void,
 *   ensureFresh: (opts?: { autoFetch?: boolean }) => Promise<void>,
 *   map: () => Map<string, boolean>,
 *   info: () => object[],
 * }}
 */
export function createHolidayStore(deps = {}) {
  const logger = deps.logger
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch
  const now = deps.now ?? (() => Date.now())
  const builtin = deps.builtinTables ?? BUILTIN_TABLES
  const root = deps.root ?? holidaysRoot()

  /** @type {Map<number, {days: {date:string,isOffDay:boolean}[], sha:string, source:'builtin'|'cache'|'live', fetchedAt:number|null, checkedAt:number|null}>} */
  const tables = new Map()
  /** map() 的惰性合并缓存：任何表更新时置 null。 */
  let merged = null

  const warn = (msg, e) => {
    const line = `[session-guard] ${msg}`
    if (logger?.warn) logger.warn(e ? `${line}: ${String(e && e.message || e)}` : line)
    else console.warn(e ? `${line}: ${String(e && e.message || e)}` : line)
  }

  function putTable(year, days, source, fetchedAt) {
    tables.set(year, { days, sha: fingerprint(days), source, fetchedAt, checkedAt: now() })
    merged = null
  }

  /** 装载单年：内置打底，缓存指纹校验通过则覆盖内置。 */
  function loadYear(year) {
    const seed = builtin.find((t) => t.year === year)
    if (seed) putTable(year, seed.days.slice(), 'builtin', null)
    let cached
    try {
      const f = holidayFilePath(year, root)
      if (!existsSync(f)) return
      cached = JSON.parse(readFileSync(f, 'utf8'))
    } catch (e) {
      warn('holiday cache unreadable (ignored)', e)
      return
    }
    try {
      const parsed = parseHolidayCn(cached)
      if (parsed.year !== year) throw new Error(`cache year ${parsed.year} != file slot ${year}`)
      const sha = fingerprint(parsed.days)
      if (cached.sha !== sha) {
        // 启动指纹校验失败：内容损坏/被改，弃用缓存（ensureFresh 会重抓）。
        warn(`holiday cache fingerprint mismatch for ${year}, discarding`)
        return
      }
      putTable(year, parsed.days, 'cache', Number(cached.fetchedAt) || null)
    } catch (e) {
      warn(`holiday cache invalid for ${year} (ignored)`, e)
    }
  }

  /** 相关年份：北京当年 +（11/12 月）次年——国务院一般年底公布来年安排。 */
  function relevantYears() {
    const wc = wallClock(BILLING_TIMEZONE, new Date(now()))
    const years = [wc.year]
    if (wc.month >= 11) years.push(wc.year + 1)
    return years
  }

  async function fetchYear(year) {
    if (typeof fetchImpl !== 'function') return false
    for (const url of holidayUrls(year)) {
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
        if (!res || res.ok !== true) continue
        const parsed = parseHolidayCn(await res.json())
        if (parsed.year !== year) throw new Error(`payload year ${parsed.year} != requested ${year}`)
        const sha = fingerprint(parsed.days)
        const cur = tables.get(year)
        if (cur && cur.sha === sha) {
          cur.checkedAt = now() // 指纹一致：不写盘，只记核对时间
          return true
        }
        try {
          mkdirSync(dirname(holidayFilePath(year, root)), { recursive: true })
          const tmp = `${holidayFilePath(year, root)}.tmp`
          writeFileSync(tmp, JSON.stringify({
            year, sha, fetchedAt: now(), sourceUrl: url,
            days: parsed.days,
          }, null, 2))
          renameSync(tmp, holidayFilePath(year, root))
        } catch (e) {
          warn(`holiday cache write failed for ${year} (memory table still updated)`, e)
        }
        putTable(year, parsed.days, 'live', now())
        warn(`holiday table updated for ${year} (${cur ? 'fingerprint changed' : 'new'}, ${sha.slice(0, 17)}…)`)
        return true
      } catch (e) {
        warn(`holiday fetch failed via ${url}`, e)
      }
    }
    return false
  }

  return {
    /** 启动装载（同步）：内置 + 缓存 + 指纹校验。 */
    loadAll() {
      for (const year of relevantYears()) loadYear(year)
    },

    /**
     * 按年自动抓取核对：缺表的年份立即抓；已有表超 24h 复核。
     * autoFetch=false（设置关）时只补缺年（缓存/内置仍生效），不发请求。
     */
    async ensureFresh(opts = {}) {
      const autoFetch = opts.autoFetch !== false
      for (const year of relevantYears()) {
        const cur = tables.get(year)
        const anchor = Math.max((cur && cur.fetchedAt) || 0, (cur && cur.checkedAt) || 0)
        if (cur && now() - anchor <= REFRESH_MS) continue // 24h 内已抓/已核对
        if (autoFetch !== true) continue // 关自动抓取时纯靠内置 + 缓存，不发请求
        await fetchYear(year)
      }
    },

    /** 合并所有已装载年份的查表 Map（'YYYY-MM-DD' → 是否放假日）。 */
    map() {
      if (merged) return merged
      const days = []
      for (const t of tables.values()) days.push(...t.days)
      merged = buildMap(days)
      return merged
    },

    /** 诊断输出（/session-guard/status 透出用）。 */
    info() {
      return [...tables.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([year, t]) => ({
          year,
          source: t.source,
          fingerprint: t.sha,
          fetchedAt: t.fetchedAt,
          checkedAt: t.checkedAt,
          entries: t.days.length,
        }))
    },
  }
}

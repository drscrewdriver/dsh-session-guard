/**
 * dsh-session-guard — 畅跑（free-run）状态：单会话限时无视峰谷。
 *
 * 语义（用户定案）：
 * - **单会话**：只有排定畅跑的那个会话被豁免，其他会话照常按峰谷暂停。
 * - **限时**：窗口是绝对起止时刻，半开区间 `[from, to)`，到点自动结束。
 * - **多段**：一次可排多段（`windows[]`）；**每段可独立暂停**（`paused`）。
 * - **一次性 + 可反复**：每段到点即失效（不做过期告警——那是正常生命周期）；
 *   用户随时可以再排新段。
 *
 * 为什么暂停标记放在**每段**上：面板对每个任务行提供「暂停 / 恢复」，语义就是
 * 「这一段不生效，其他段照常」。因此 `isFreeRunActive` = 「存在一个**未暂停**且
 * 覆盖此刻的窗口」——多段里只要有一段生效即豁免，被暂停的段自动让位。
 *
 * 为保持合并无歧义：**只合并 `paused` 相同的相邻/重叠窗口**；暂停段与启用段
 * 即使时间重叠也各自保留（启用段覆盖的时间照常生效）。
 *
 * 为什么必须落盘：`from` 可以排在将来（用户明确要求「可以是一段时间之后」），
 * 进程重启不能把排期丢掉。存储形态与 `pause-store.js` / `store.js` 一致
 * （每会话一个 JSON + tmp&rename 原子写）。
 *
 * 时区：墙钟形态（`"YYYY-MM-DDTHH:mm"`）按**顶层 `timezone`**（用户本地）解释，
 * 与 `peakWindows` / 周末判定同源；带偏移的 ISO 串则视为绝对时刻直接采信
 * （便于脚本与高级用法）。
 *
 * 本模块零 `@deepseek-ai/*` 值导入；时钟与文件系统访问均可注入，便于单测。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { storeRoot } from './store.js'
import { zonedTimeToEpoch } from './time-policy.js'

/** 会话内最多可排的畅跑段数（合并后）。防止误操作堆出无限状态。 */
export const MAX_FREE_RUN_WINDOWS = 8

/** 畅跑派生状态（主要供诊断与悬浮提示用；按钮文案已固定为「畅跑」）。 */
export const FREE_RUN_STATES = Object.freeze({
  NONE: 'none', // 没有任何未结束窗口
  SCHEDULED: 'scheduled', // 有启用中的窗口但都还没开始
  ACTIVE: 'active', // 有未暂停窗口覆盖此刻 → 豁免生效
  SUSPENDED: 'suspended', // 未结束的窗口全部被暂停
  EXPIRED: 'expired', // 所有窗口都已结束
})

/** 会话 id → 安全文件名（与 pause-store 同规则）。 */
export function encodeFreeRunId(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, '_')
}

/** 畅跑状态根目录（独立于队列锁与暂停态）。 */
export function freeRunRoot() {
  return process.env.DSH_SESSION_GUARD_FREE_RUN_DIR || join(storeRoot(), 'free-run')
}

/** 每会话畅跑文件路径。 */
export function freeRunFilePath(id) {
  return join(freeRunRoot(), `${encodeFreeRunId(id)}.json`)
}

/** 空记录基线。 */
export function idleFreeRunState(id) {
  return { sessionId: String(id ?? ''), windows: [], updatedAt: null }
}

/** 生成窗口 id（短、可读、无依赖）。 */
export function newWindowId() {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().slice(0, 8)
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 把用户输入的时间串解析成绝对时刻（epoch ms）。
 *
 * 接受：
 * - `"YYYY-MM-DDTHH:mm"` / `"YYYY-MM-DDTHH:mm:ss"` / `"YYYY-MM-DD"`（墙钟，按 `timeZone` 解释）
 * - 带偏移的 ISO（`...Z` / `...+08:00`）→ 绝对时刻，直接采信
 *
 * @param {unknown} value
 * @param {string} timeZone 顶层 timezone（IANA）
 * @returns {{ms:number}|{error:string}}
 */
export function parseFreeRunInstant(value, timeZone) {
  const s = String(value ?? '').trim()
  if (s === '') return { error: 'time is required' }
  // 带时区偏移 → 绝对时刻，与配置时区无关。
  if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const ms = Date.parse(s)
    return Number.isFinite(ms) ? { ms } : { error: `invalid time ${JSON.stringify(value)}` }
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(s)
  if (m === null) return { error: `invalid time ${JSON.stringify(value)} — expected "YYYY-MM-DDTHH:mm"` }
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const hour = m[4] === undefined ? 0 : Number(m[4])
  const minute = m[5] === undefined ? 0 : Number(m[5])
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return { error: `invalid time ${JSON.stringify(value)} — out of range` }
  }
  const ms = zonedTimeToEpoch(timeZone, year, month, day, hour * 60 + minute)
  return Number.isFinite(ms) ? { ms } : { error: `invalid time ${JSON.stringify(value)}` }
}

/** 归一化窗口数组：丢弃非法项、补 `paused` 默认值并按 `fromMs` 排序。 */
export function normalizeWindows(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const w of raw) {
    if (w === null || typeof w !== 'object') continue
    const fromMs = Number(w.fromMs)
    const toMs = Number(w.toMs)
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) continue
    out.push({
      id: typeof w.id === 'string' && w.id !== '' ? w.id : newWindowId(),
      fromMs,
      toMs,
      // 每段独立的暂停标志（旧记录没有该字段 → 默认未暂停）。
      paused: w.paused === true,
    })
  }
  out.sort((a, b) => a.fromMs - b.fromMs)
  return out
}

/**
 * 合并重叠或相邻且 **`paused` 相同**的窗口（并集）。
 *
 * 为什么要求 paused 相同：暂停与启用是两种意图，合并会丢掉其中一种。
 * 相邻（`next.fromMs === cur.toMs`）也合并——用户把 20:00-21:00 与 21:00-22:00
 * 排成两段，语义上就是连着跑到 22:00。
 * 暂停段与启用段即使重叠也各自保留：启用段覆盖的时间照常生效。
 * @param {Array<{id:string,fromMs:number,toMs:number,paused:boolean}>} windows
 * @param {{id:string,fromMs:number,toMs:number,paused:boolean}} addition
 * @returns {Array<{id:string,fromMs:number,toMs:number,paused:boolean}>}
 */
export function mergeWindows(windows, addition) {
  const all = normalizeWindows([...(Array.isArray(windows) ? windows : []), addition])
  const out = []
  for (const w of all) {
    const last = out.length > 0 ? out[out.length - 1] : null
    if (last !== null && last.paused === w.paused && w.fromMs <= last.toMs) {
      // 合并进前一段：保留先出现的那一段的 id（稳定，便于前端 key）。
      if (w.toMs > last.toMs) last.toMs = w.toMs
      continue
    }
    out.push({ ...w })
  }
  return out
}

/**
 * 追加一段畅跑（新段默认**未暂停**）。
 * @param {object|null} record 现有记录（可为 null）
 * @param {{fromMs:number, toMs:number}} input
 * @param {{now?:number, id?:string, maxWindows?:number, paused?:boolean}} [opts]
 * @returns {{record:object}|{error:string}}
 */
export function appendWindow(record, input, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now()
  const max = Number.isFinite(opts.maxWindows) ? opts.maxWindows : MAX_FREE_RUN_WINDOWS
  const fromMs = Number(input?.fromMs)
  const toMs = Number(input?.toMs)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return { error: 'from/to must be absolute instants' }
  // 「马上开始」：起点早于现在就钳到 now，不报错（用户选当前小时是常见意图）。
  const from = Math.max(fromMs, now)
  if (!(toMs > from)) return { error: 'to must be later than from' }
  const base = record !== null && typeof record === 'object' ? record : idleFreeRunState('')
  const windows = mergeWindows(base.windows, {
    id: opts.id ?? newWindowId(),
    fromMs: from,
    toMs,
    paused: opts.paused === true,
  })
  if (windows.length > max) return { error: `too many free-run windows (max ${max})` }
  return {
    record: { sessionId: String(base.sessionId ?? ''), windows, updatedAt: now },
  }
}

/** 删除一段（按 id）。返回新记录；未命中则原样返回。 */
export function removeWindow(record, id, now = Date.now()) {
  const base = record !== null && typeof record === 'object' ? record : idleFreeRunState('')
  const windows = normalizeWindows(base.windows).filter((w) => w.id !== String(id))
  return { sessionId: String(base.sessionId ?? ''), windows, updatedAt: now }
}

/**
 * 暂停 / 恢复**某一段**（面板每行的「暂停畅跑 / 恢复畅跑」）。
 * 未命中 id 时原样返回（幂等）。
 */
export function setWindowPaused(record, id, paused, now = Date.now()) {
  const base = record !== null && typeof record === 'object' ? record : idleFreeRunState('')
  const target = String(id)
  const windows = normalizeWindows(base.windows).map((w) => (w.id === target ? { ...w, paused: paused === true } : w))
  return { sessionId: String(base.sessionId ?? ''), windows, updatedAt: now }
}

/**
 * 暂停 / 恢复**全部未结束的段**（面板顶部的「暂停全部任务 / 恢复全部任务」）。
 * 已结束的段不动（它们的 `paused` 已无意义）。
 */
export function setAllPaused(record, paused, now = Date.now()) {
  const base = record !== null && typeof record === 'object' ? record : idleFreeRunState('')
  const windows = normalizeWindows(base.windows).map((w) =>
    w.toMs > now ? { ...w, paused: paused === true } : w,
  )
  return { sessionId: String(base.sessionId ?? ''), windows, updatedAt: now }
}

/** 丢弃已结束的窗口。 */
export function pruneWindows(record, now = Date.now()) {
  const base = record !== null && typeof record === 'object' ? record : idleFreeRunState('')
  const windows = normalizeWindows(base.windows).filter((w) => w.toMs > now)
  return { sessionId: String(base.sessionId ?? ''), windows, updatedAt: now }
}

/** 当前**生效中**（未暂停且覆盖此刻）的窗口。 */
export function activeWindows(record, now = Date.now()) {
  return normalizeWindows(record?.windows).filter((w) => w.paused !== true && now >= w.fromMs && now < w.toMs)
}

/**
 * 派生状态（诊断 / 悬浮提示用）。
 *
 * 判定顺序：没有任何未结束窗口 → NONE；有未暂停窗口覆盖此刻 → ACTIVE；
 * 还有未暂停的未来窗口 → SCHEDULED；否则（剩下的全被暂停）→ SUSPENDED。
 * @param {object|null} record
 * @param {number} [now]
 * @returns {string} FREE_RUN_STATES.*
 */
export function freeRunState(record, now = Date.now()) {
  const windows = normalizeWindows(record?.windows)
  if (windows.length === 0) return FREE_RUN_STATES.NONE
  const live = windows.filter((w) => w.toMs > now) // 还没结束的
  if (live.length === 0) return FREE_RUN_STATES.EXPIRED
  if (live.some((w) => w.paused !== true && now >= w.fromMs)) return FREE_RUN_STATES.ACTIVE
  if (live.some((w) => w.paused !== true)) return FREE_RUN_STATES.SCHEDULED
  return FREE_RUN_STATES.SUSPENDED
}

/** 豁免是否正在生效（判定链唯一的入口）。 */
export function isFreeRunActive(record, now = Date.now()) {
  return freeRunState(record, now) === FREE_RUN_STATES.ACTIVE
}

/**
 * 下一个需要对状态做迁移的时刻：窗口的 `from`（待开始）或当前窗口的 `to`（结束）。
 * **暂停段不产生边界**——它不会自己生效，只有用户恢复才需要迁移。
 * 定时器靠它设点，避免轮询。
 * @returns {number|null}
 */
export function nextFreeRunBoundary(record, now = Date.now()) {
  const windows = normalizeWindows(record?.windows).filter((w) => w.paused !== true)
  let best = null
  for (const w of windows) {
    const candidate = now >= w.fromMs && now < w.toMs ? w.toMs : w.fromMs > now ? w.fromMs : null
    if (candidate === null) continue
    if (best === null || candidate < best) best = candidate
  }
  return best
}

/**
 * 单段的状态标签（前端列表与诊断用）。
 * 已结束优先于暂停（过去的事不必再显示「已暂停」）。
 */
export function windowStatus(w, now = Date.now()) {
  if (now >= w.toMs) return 'ended'
  if (w.paused === true) return 'paused'
  if (now >= w.fromMs) return 'active'
  return 'scheduled'
}

/**
 * 创建畅跑存储（内存缓存 + 磁盘持久化）。
 * @param {{dir?:string}} [deps]
 */
export function createFreeRunStore({ dir } = {}) {
  const cache = new Map()
  const root = typeof dir === 'string' && dir !== '' ? dir : freeRunRoot()

  function fileOf(id) {
    return join(root, `${encodeFreeRunId(id)}.json`)
  }

  function read(id) {
    if (cache.has(id)) return cache.get(id)
    try {
      const f = fileOf(id)
      if (!existsSync(f)) return null
      const v = JSON.parse(readFileSync(f, 'utf8'))
      const rec = {
        sessionId: String(v?.sessionId ?? id),
        windows: normalizeWindows(v?.windows),
        updatedAt: Number.isFinite(v?.updatedAt) ? v.updatedAt : null,
      }
      cache.set(id, rec)
      return rec
    } catch {
      return null
    }
  }

  return {
    root,
    /** 读原始记录；无记录返回 null。 */
    get(id) {
      const key = String(id ?? '')
      return key === '' ? null : read(key)
    },
    /** 当前有效记录（无记录时 idle 基线）。 */
    current(id) {
      return read(String(id ?? '')) ?? idleFreeRunState(id)
    },
    /** 原子写；窗口为空则直接清除，避免留下空壳文件。 */
    set(id, record) {
      const key = String(id ?? '')
      if (key === '') return record
      const next = {
        sessionId: key,
        windows: normalizeWindows(record?.windows),
        updatedAt: Number.isFinite(record?.updatedAt) ? record.updatedAt : Date.now(),
      }
      if (next.windows.length === 0) {
        this.clear(key)
        return next
      }
      cache.set(key, next)
      try {
        const f = fileOf(key)
        mkdirSync(dirname(f), { recursive: true })
        const tmp = `${f}.tmp`
        writeFileSync(tmp, JSON.stringify(next, null, 2))
        renameSync(tmp, f)
      } catch (e) {
        // 落盘失败仅影响重启恢复，内存态仍可用。
        console.error(`[session-guard] free-run store write failed: ${String((e && e.message) || e)}`)
      }
      return next
    },
    /** 清除（清空全部窗口 / 会话结束后）。 */
    clear(id) {
      const key = String(id ?? '')
      cache.delete(key)
      try {
        rmSync(fileOf(key), { force: true })
      } catch {
        /* ignore */
      }
    },
    /**
     * 落盘过的全部会话 id（启动 pass 用来重建状态）。
     *
     * 返回的是**磁盘文件名**（已过 `encodeFreeRunId`）。DSH 的会话 id 是 UUID，
     * 编码是恒等的，因此它等于真实 sessionId —— 与 `pause-store.js` 同一约定。
     */
    listIds() {
      try {
        return readdirSync(root)
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.slice(0, -'.json'.length))
      } catch {
        return []
      }
    },
  }
}

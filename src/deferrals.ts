/**
 * dsh-session-guard — 延后登记表（host，进程内）。
 *
 * 两类记录：
 * - **挂起（hold）**：请求被挂在 `agent/request` 上，promise 待退峰 resolve。
 *   退峰 → `resolve(config)` 让请求照常发出；abort / 超限 / 被新 hold 顶替 → reject。
 * - **延后（deferred）**：error 模式下已经抛错的会话，记下来供退峰 `followup` 续跑。
 *
 * 纪律：
 * - **不做磁盘持久化**（挂起态是进程内 promise，重启即消失；写盘无收益）。
 * - 同一会话重复 hold → 先结算旧记录（reject `superseded`），再登记新记录。
 * - `releaseAll` / `rejectAll` / `settle` 幂等：对不存在的会话是 no-op。
 * - 定时器 `unref()`，不拖住进程退出。
 */

/** 机器可路由的延后失败码（`retry.js` 只按这个精确码短路）。 */
export const PEAK_DEFERRED_CODE = 'PEAK_DEFERRED'

/**
 * 延后错误：`code` 走结构化字段；`message` 以精确哨兵 `PEAK_DEFERRED:` 开头。
 *
 * 为什么要带哨兵：DSH 回合循环只对 `error instanceof LlmError` 保留结构化
 * `failure`，其它一律压成 `{ message: errorChain(error), code: 'UNKNOWN' }`
 * （findings 8.3）。本插件不能 value-import `@deepseek-ai/dsh-llm`，
 * 因此让 `code` 与 message 前缀同时携带同一个精确哨兵，两条路径都能识别。
 */
/** 延后错误的机器可路由事实（诊断/日志用）。 */
export interface DeferredFacts {
  provider?: string | null
  model?: string | null
  sessionId?: string
}

/** 活跃挂起记录。 */
interface HoldEntry {
  sessionId: string
  provider: string | null
  model: string | null
  config: unknown
  since: number
  resolve: (config: unknown) => void
  reject: (err: unknown) => void
  promise: Promise<unknown>
  timer: { unref?: () => void } | undefined
  signal: AbortSignalLike | null
  onAbort: (() => void) | undefined
}

/** error 模式的延后记录。 */
export interface DeferredRecord {
  sessionId: string
  provider: string | null
  model: string | null
  reason: string
  since: number
}

/** 挂起快照（对外只读投影）。 */
export interface HoldSnapshot {
  sessionId: string
  provider: string | null
  model: string | null
  since: number
}

/** AbortSignal 的最小面。 */
export interface AbortSignalLike {
  aborted?: boolean
  addEventListener?(type: 'abort', fn: () => void, opts?: { once?: boolean }): void
  removeEventListener?(type: 'abort', fn: () => void): void
}

/** 登记表依赖注入面。 */
export interface DeferralsDeps {
  maxHoldMs?: number | (() => number)
  now?: () => number
  unrefTimers?: boolean
}

/** 登记表面。 */
export interface Deferrals {
  hold(sessionId: string, info?: { provider?: string | null; model?: string | null; config?: unknown }, signal?: AbortSignalLike): Promise<unknown>
  settle(sessionId: string, reason: string, outcome?: 'release' | 'reject'): boolean
  releaseAll(reason?: string): { released: string[]; cleared: string[] }
  rejectAll(reason?: string): string[]
  remember(sessionId: string, info?: { provider?: string | null; model?: string | null; reason?: string }): DeferredRecord | null
  list(): HoldSnapshot[]
  deferredList(): DeferredRecord[]
  isDeferred(sessionId: string): boolean
  clearDeferred(sessionId: string): boolean
  has(sessionId: string): boolean
  size(): number
  deferredSize(): number
}

export class PeakDeferredError extends Error {
  /** 机器可路由的失败码（与 message 前缀同一哨兵）。 */
  readonly code: string
  /** 失败事实（provider/model/sessionId）。 */
  readonly facts: DeferredFacts

  /**
   * @param detail 人类可读补充说明
   * @param facts { provider, model, sessionId }
   */
  constructor(detail: string = 'peak hours, request deferred', facts: DeferredFacts = {}) {
    super(`${PEAK_DEFERRED_CODE}: ${detail}`)
    this.name = 'PeakDeferredError'
    this.code = PEAK_DEFERRED_CODE
    this.facts = facts
  }
}

/**
 * @param {object} [deps]
 * @param {number|(()=>number)} [deps.maxHoldMs] 挂起上限（毫秒），到期转 error；<=0 表示不设上限。
 *   传函数时每次 hold 实时读取（设置热改即时生效）。
 * @param {()=>number} [deps.now] 时钟（测试注入）
 * @param {boolean} [deps.unrefTimers] 定时器是否 unref（生产 true，测试可关以便等待定时器）
 * @returns {object} 延后登记表
 */
export function createDeferrals({ maxHoldMs = 6 * 60 * 60 * 1000, now = () => Date.now(), unrefTimers = true }: DeferralsDeps = {}): Deferrals {
  const resolveMaxHold = typeof maxHoldMs === 'function' ? maxHoldMs : () => maxHoldMs
  const holds = new Map<string, HoldEntry>()
  const deferred = new Map<string, DeferredRecord>()

  function clearTimer(entry: HoldEntry | undefined): void {
    if (entry && entry.timer !== undefined) {
      clearTimeout(entry.timer)
      entry.timer = undefined
    }
    if (entry && entry.signal && entry.onAbort) {
      try {
        entry.signal.removeEventListener?.('abort', entry.onAbort)
      } catch {
        /* 信号实现不完整时忽略 */
      }
    }
  }

  /**
   * 结算一个挂起记录。
   * @param {string} sessionId
   * @param {string} reason
   * @param {'release'|'reject'} outcome
   * @returns {boolean} 是否真的结算了一条
   */
  function settle(sessionId: string, reason: string, outcome: 'release' | 'reject' = 'release'): boolean {
    const key = String(sessionId ?? '')
    const entry = holds.get(key)
    if (!entry) return false
    holds.delete(key)
    clearTimer(entry)
    if (outcome === 'reject') {
      entry.reject(new PeakDeferredError(reason, { sessionId: key, provider: entry.provider, model: entry.model }))
    } else {
      entry.resolve(entry.config)
    }
    return true
  }

  /**
   * 挂起一次请求。
   * @param {string} sessionId
   * @param {{provider?:string, model?:string, config?:unknown}} info
   * @param {AbortSignal} [signal]
   * @returns {Promise<unknown>} 退峰 resolve 原 config
   */
  function hold(
    sessionId: string,
    info: { provider?: string | null; model?: string | null; config?: unknown } = {},
    signal?: AbortSignalLike,
  ): Promise<unknown> {
    const key = String(sessionId ?? '')
    // 重复 hold：先结算旧的（新请求代表同一会话的最新意图）
    if (holds.has(key)) settle(key, 'superseded', 'reject')

    let resolveFn!: (config: unknown) => void
    let rejectFn!: (err: unknown) => void
    const promise = new Promise<unknown>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })
    const entry: HoldEntry = {
      sessionId: key,
      provider: info.provider ?? null,
      model: info.model ?? null,
      config: info.config,
      since: now(),
      resolve: resolveFn,
      reject: rejectFn,
      promise,
      timer: undefined,
      signal: null,
      onAbort: undefined,
    }
    holds.set(key, entry)

    if (Number.isFinite(resolveMaxHold()) && resolveMaxHold() > 0) {
      entry.timer = setTimeout(() => {
        if (holds.get(key) !== entry) return
        settle(key, 'max-hold-exceeded', 'reject')
      }, resolveMaxHold()) as { unref?: () => void }
      const handle = entry.timer
      if (handle !== undefined && unrefTimers && typeof handle.unref === 'function') handle.unref()
    }

    if (signal && typeof signal.addEventListener === 'function') {
      entry.signal = signal
      if (signal.aborted) {
        settle(key, 'aborted', 'reject')
      } else {
        entry.onAbort = () => {
          if (holds.get(key) === entry) settle(key, 'aborted', 'reject')
        }
        signal.addEventListener('abort', entry.onAbort, { once: true })
      }
    }

    return promise
  }

  /** 放行全部挂起（退峰）：resolve 原 config，并清空延后记录。 */
  function releaseAll(reason: string = 'off-peak'): { released: string[]; cleared: string[] } {
    const released: string[] = []
    for (const key of [...holds.keys()]) {
      if (settle(key, reason, 'release')) released.push(key)
    }
    const cleared = [...deferred.keys()]
    deferred.clear()
    return { released, cleared }
  }

  /** 拒绝全部挂起（插件卸载 / 关闭自动续跑）。 */
  function rejectAll(reason: string = 'disposed'): string[] {
    const rejected: string[] = []
    for (const key of [...holds.keys()]) {
      if (settle(key, reason, 'reject')) rejected.push(key)
    }
    return rejected
  }

  /** error 模式：登记一条延后记录（退峰时按 deferredResume 决定是否 followup）。 */
  function remember(
    sessionId: string,
    info: { provider?: string | null; model?: string | null; reason?: string } = {},
  ): DeferredRecord | null {
    const key = String(sessionId ?? '')
    if (key === '') return null
    const rec: DeferredRecord = {
      sessionId: key,
      provider: info.provider ?? null,
      model: info.model ?? null,
      reason: info.reason ?? 'peak',
      since: now(),
    }
    deferred.set(key, rec)
    return rec
  }

  return {
    hold,
    settle,
    releaseAll,
    rejectAll,
    remember,
    /** 活跃挂起快照。 */
    list: () => [...holds.values()].map((e) => ({ sessionId: e.sessionId, provider: e.provider, model: e.model, since: e.since })),
    /** 延后记录快照。 */
    deferredList: () => [...deferred.values()],
    isDeferred: (sessionId) => deferred.has(String(sessionId ?? '')),
    clearDeferred: (sessionId) => deferred.delete(String(sessionId ?? '')),
    has: (sessionId) => holds.has(String(sessionId ?? '')),
    size: () => holds.size,
    deferredSize: () => deferred.size,
  }
}

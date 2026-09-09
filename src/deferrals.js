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
export class PeakDeferredError extends Error {
  /**
   * @param {string} [detail] 人类可读补充说明
   * @param {object} [facts] { provider, model, sessionId }
   */
  constructor(detail = 'peak hours, request deferred', facts = {}) {
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
export function createDeferrals({ maxHoldMs = 6 * 60 * 60 * 1000, now = () => Date.now(), unrefTimers = true } = {}) {
  const resolveMaxHold = typeof maxHoldMs === 'function' ? maxHoldMs : () => maxHoldMs
  /** @type {Map<string, object>} 活跃挂起 */
  const holds = new Map()
  /** @type {Map<string, object>} error 模式的延后记录 */
  const deferred = new Map()

  function clearTimer(entry) {
    if (entry && entry.timer !== null && entry.timer !== undefined) {
      clearTimeout(entry.timer)
      entry.timer = null
    }
    if (entry && entry.signal && entry.onAbort) {
      try {
        entry.signal.removeEventListener('abort', entry.onAbort)
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
  function settle(sessionId, reason, outcome = 'release') {
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
  function hold(sessionId, info = {}, signal) {
    const key = String(sessionId ?? '')
    // 重复 hold：先结算旧的（新请求代表同一会话的最新意图）
    if (holds.has(key)) settle(key, 'superseded', 'reject')

    let resolveFn
    let rejectFn
    const promise = new Promise((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })
    const entry = {
      sessionId: key,
      provider: info.provider ?? null,
      model: info.model ?? null,
      config: info.config,
      since: now(),
      resolve: resolveFn,
      reject: rejectFn,
      promise,
      timer: null,
      signal: null,
      onAbort: null,
    }
    holds.set(key, entry)

    if (Number.isFinite(resolveMaxHold()) && resolveMaxHold() > 0) {
      entry.timer = setTimeout(() => {
        if (holds.get(key) !== entry) return
        settle(key, 'max-hold-exceeded', 'reject')
      }, resolveMaxHold())
      if (entry.timer && unrefTimers && typeof entry.timer.unref === 'function') entry.timer.unref()
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
  function releaseAll(reason = 'off-peak') {
    const released = []
    for (const key of [...holds.keys()]) {
      if (settle(key, reason, 'release')) released.push(key)
    }
    const cleared = [...deferred.keys()]
    deferred.clear()
    return { released, cleared }
  }

  /** 拒绝全部挂起（插件卸载 / 关闭自动续跑）。 */
  function rejectAll(reason = 'disposed') {
    const rejected = []
    for (const key of [...holds.keys()]) {
      if (settle(key, reason, 'reject')) rejected.push(key)
    }
    return rejected
  }

  /** error 模式：登记一条延后记录（退峰时按 deferredResume 决定是否 followup）。 */
  function remember(sessionId, info = {}) {
    const key = String(sessionId ?? '')
    if (key === '') return null
    const rec = {
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

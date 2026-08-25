/**
 * dsh-session-guard — 会话门驱动（D3/D5/D6，自研真实锁定）。
 *
 * **主路径**（替换 dsh-task-control）：经自研 `pauseGate` 真暂停 session 推进——
 * `pauseGate.pause(id,{mode,reason})` 调用 agent.cancel / goals.pause / session/event
 * 安全边界落地（见 src/pause-gate.js），不再依赖 `ctx.get('taskControl')`，也不再退化成
 * 只写 `queueLocked` 标记。
 *
 * **降级路径**（fail-open，D8）：仅当自研暂停因 agent 不可用而失败时，按 `queueFallback`
 * 回退为只锁等待队列（`queueLocked` 持久化标记，供前端/重试让路）。
 *
 * resume 对称：自研 resume（从暂停点续跑）或清 queueLock。
 */
import { idleState } from './store.js'

/**
 * @param {object} deps
 * @param {()=>object|null} deps.getCtx 取当前 host ctx（懒，便于测试）
 * @param {()=>object} deps.getSettings 读实时配置（pauseMode/pauseReason）
 * @param {ReturnType<import('./store.js').createStore>} deps.store 持久化队列锁
 * @param {ReturnType<import('./pause-gate.js').createPauseGate>} [deps.pauseGate] 自研会话门引擎
 * @param {(event:string, sessionId:string, payload?:object)=>void} [deps.emit] 状态变化通知
 */
export function createGate({ getCtx: _getCtx, getSettings, store, pauseGate, emit }) {
  function lockQueue(sessionId, reason) {
    const cur = store.get(sessionId)
    const next = { ...(cur || idleState(sessionId)), queueLocked: true, lockReason: reason, updatedAt: Date.now() }
    store.set(sessionId, next)
    if (emit) emit('queue-lock', sessionId, { reason })
    return next
  }

  function unlockQueue(sessionId) {
    const cur = store.get(sessionId)
    const next = { ...(cur || idleState(sessionId)), queueLocked: false, lockReason: null, updatedAt: Date.now() }
    store.set(sessionId, next)
    if (emit) emit('queue-unlock', sessionId)
    return next
  }

  /**
   * 停掉 session 的下一回合（真实锁定推进）。
   * ① 自研 pauseGate.pause（真暂停）；② 自研失败/agent 不可用 → 按 queueFallback 降级锁队列。
   * @param {string} sessionId
   * @param {object} [opts] { mode, reason }
   */
  async function stopNextTurn(sessionId, opts = {}) {
    const cfg = getSettings()
    if (pauseGate) {
      try {
        const mode = opts.mode ?? cfg.pauseMode ?? 'safe'
        const reason = opts.reason ?? cfg.pauseReason ?? 'wait'
        const r = pauseGate.pause(sessionId, { mode, reason })
        if (r && r.kind === 'success') return { ok: true, via: 'pauseGate', result: r }
        // kind === 'error'（如 no live agent）→ 落到降级，语义如实上报。
      } catch {
        // 自研内部异常 → fail-open 降级，绝不中断冻结动作。
      }
    }
    // 无自研门或自研失败 → 回退只锁等待队列（自带实现，D5）。
    if (cfg.queueFallback === false) {
      return { ok: false, via: 'queueLock', error: 'queueFallback disabled' }
    }
    lockQueue(sessionId, 'peak')
    return { ok: true, via: 'queueLock' }
  }

  /**
   * 恢复 session 推进（从暂停点续跑）。
   * ① 自研 resume（confirm + choice）；② 降级清 queueLock。
   */
  async function resume(sessionId, opts = {}) {
    if (pauseGate) {
      try {
        const r = pauseGate.resume(sessionId, { confirm: true, choice: opts.choice ?? 'rerun' })
        if (r && r.kind === 'success') return { ok: true, via: 'pauseGate', result: r }
      } catch {
        // 降级清队列锁。
      }
    }
    unlockQueue(sessionId)
    return { ok: true, via: 'queueLock' }
  }

  return {
    stopNextTurn,
    resume,
    lockQueue,
    unlockQueue,
    /** 自研会话门是否可用（自研后恒视为可用；供 detect/UI 展示）。 */
    taskControlAvailable: () => (pauseGate ? pauseGate.taskControlAvailable() : false),
  }
}

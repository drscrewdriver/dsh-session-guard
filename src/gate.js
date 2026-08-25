/**
 * dsh-session-guard — 会话门驱动（D3/D5/D6）。
 *
 * stopNextTurn：停掉 session 的下一回合。
 * - 有 `taskControl` 服务（dsh-task-control 已装）→ 透传 pause（会话执行门，
 *   默认 safe + wait：不打断推理，推理完成在工具派发前暂停，给输入窗口让位）。
 * - 无 `taskControl` → 回退：只锁等待队列（queueLock 持久化状态，客户端据此
 *   冻结前端等待队列；fail-open，不报错，D8）。
 *
 * resume 对称：taskControl.resume(confirm) 或 清 queueLock。
 */
import { idleState } from './store.js'

/**
 * @param {object} deps
 * @param {()=>object|null} deps.getCtx 取当前 host ctx（懒，便于测试）
 * @param {()=>object} deps.getSettings 读实时配置（pauseMode/pauseReason）
 * @param {ReturnType<import('./store.js').createStore>} deps.store 持久化状态
 * @param {(event:string, sessionId:string, payload?:object)=>void} [deps.emit] 状态变化通知
 */
export function createGate({ getCtx, getSettings, store, emit }) {
  /** 探测 taskControl（会话门）。 */
  function taskControl() {
    const ctx = getCtx()
    return ctx && typeof ctx.get === 'function' ? ctx.get('taskControl') : undefined
  }

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
   * 停掉 session 的下一回合。
   * @param {string} sessionId
   * @param {object} [opts] { mode, reason }
   */
  async function stopNextTurn(sessionId, opts = {}) {
    const cfg = getSettings()
    const tc = taskControl()
    if (tc && typeof tc.pause === 'function') {
      try {
        const r = await tc.pause(sessionId, {
          mode: opts.mode ?? cfg.pauseMode ?? 'safe',
          reason: opts.reason ?? cfg.pauseReason ?? 'wait',
        })
        return { ok: true, via: 'taskControl', result: r }
      } catch (e) {
        // 会话门调用失败：不回退自动锁队列（避免误锁），如实上报，fail-open。
        return { ok: false, via: 'taskControl', error: String(e && e.message || e) }
      }
    }
    // 无会话门 → 回退只锁等待队列（自带实现，不依赖 input-traffic，D5）。
    if (cfg.queueFallback === false) {
      return { ok: false, via: 'queueLock', error: 'queueFallback disabled' }
    }
    lockQueue(sessionId, 'peak')
    return { ok: true, via: 'queueLock' }
  }

  /** 恢复：taskControl.resume 或 清 queueLock。 */
  async function resume(sessionId, opts = {}) {
    const tc = taskControl()
    if (tc && typeof tc.resume === 'function') {
      try {
        const r = await tc.resume(sessionId, { confirm: true, choice: opts.choice ?? 'rerun' })
        return { ok: true, via: 'taskControl', result: r }
      } catch (e) {
        return { ok: false, via: 'taskControl', error: String(e && e.message || e) }
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
    /** 会话门是否可用（探测结果，供 detect/UI 展示）。 */
    taskControlAvailable: () => taskControl() !== undefined,
  }
}

/**
 * dsh-session-guard — sessionGuard 冗余端口（D5/D6/D8）。
 *
 * `ctx.provide('sessionGuard', service)`：
 * - stopNextTurn / resume：会话门（透传 taskControl，或回退锁队列）。
 * - lockQueue / unlockQueue：显式队列锁（供 input-traffic 冻结按钮桥接，
 *   或未来手动触发）。
 * - state(sessionId)：{ queueLocked, lockReason, taskControlAvailable, taskControl }。
 *
 * input-traffic（方案 A，基于 feat/absorb-auto-continue 分支改造）在冻结按钮
 * 触发时调用 stopNextTurn；本服务不存在时 input-traffic 静默跳过（fail-open，D8）。
 */
import { idleState } from './store.js'

/**
 * @param {object} ctx host context
 * @param {ReturnType<import('./gate.js').createGate>} gate
 * @param {ReturnType<import('./store.js').createStore>} store
 */
export function createBridge(ctx, gate, store) {
  function taskControlState(sessionId) {
    let tcState = null
    try {
      const tc = ctx && typeof ctx.get === 'function' ? ctx.get('taskControl') : undefined
      if (tc && typeof tc.state === 'function') {
        const s = tc.state(sessionId)
        tcState = {
          status: s && s.status,
          paused: !!(s && s.paused),
          forced: !!(s && s.forced),
        }
      }
    } catch {
      /* 状态读取失败 → 保持 null，fail-open */
    }
    return tcState
  }

  return {
    /** 停掉 session 下一回合（会话门 / 回退锁队列）。 */
    stopNextTurn(sessionId, opts) {
      return gate.stopNextTurn(sessionId, opts)
    },
    /** 恢复。 */
    resume(sessionId, opts) {
      return gate.resume(sessionId, opts)
    },
    /** 显式锁队列（手动触发）。 */
    lockQueue(sessionId, reason = 'manual') {
      const next = gate.lockQueue(sessionId, reason)
      return { ok: true, state: next }
    },
    /** 显式解锁队列。 */
    unlockQueue(sessionId) {
      const next = gate.unlockQueue(sessionId)
      return { ok: true, state: next }
    },
    /** 读一会话状态。 */
    state(sessionId) {
      const cur = store.get(sessionId)
      const base = cur || idleState(sessionId)
      return {
        sessionId: String(sessionId),
        queueLocked: base.queueLocked === true,
        lockReason: base.lockReason ?? null,
        taskControlAvailable: gate.taskControlAvailable(),
        taskControl: taskControlState(sessionId),
        updatedAt: base.updatedAt ?? null,
      }
    },
  }
}

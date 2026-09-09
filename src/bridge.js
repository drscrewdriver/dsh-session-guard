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
 * @param {ReturnType<import('./pause-gate.js').createPauseGate>} [pauseGate]
 * @param {ReturnType<import('./step-gate.js').createStepGate>} [stepGate] step 级门控（v0.2.0）
 */
export function createBridge(ctx, gate, store, pauseGate, stepGate) {
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
    /**
     * 手动请求 step 级暂停（「暂停会话」按钮）。
     * 不打断当前 step：在下一次 `agent/pre-step` 边界拉门（step 1 也拦，且不受峰谷/provider 限制）。
     * @param {string} sessionId
     */
    stepPause(sessionId) {
      if (!stepGate || typeof stepGate.requestPause !== 'function') {
        return { requested: false, held: false, reason: 'no-step-gate' }
      }
      try {
        return stepGate.requestPause(sessionId)
      } catch {
        return { requested: false, held: false, reason: 'error' }
      }
    },
    /**
     * 解开 step 门（v0.2.0）：放行被挂起的 step。
     * 默认 `bypass=true`（用户手动「继续」）——本高峰窗口内不再拦该会话；
     * 退峰/非官方切换等自动释放请用 `{ bypass: false }`。
     * @param {string} sessionId
     * @param {{bypass?:boolean, reason?:string}} [opts]
     */
    stepResume(sessionId, opts = {}) {
      if (!stepGate || typeof stepGate.release !== 'function') {
        return { released: false, bypass: false, reason: 'no-step-gate' }
      }
      const reason = opts.reason ?? 'manual'
      let r
      try {
        r = stepGate.release(sessionId, reason)
      } catch {
        return { released: false, bypass: false, reason }
      }
      const released = !!(r && r.released === true)
      let bypassed = false
      if (released && opts.bypass !== false && typeof stepGate.markBypass === 'function') {
        try {
          stepGate.markBypass(sessionId)
          bypassed = true
        } catch {
          /* ignore */
        }
      }
      return { released, bypass: bypassed, reason }
    },
    /** 读一会话状态。 */
    state(sessionId) {
      const cur = store.get(sessionId)
      const base = cur || idleState(sessionId)
      const pausedState = pauseGate ? (pauseGate.state(sessionId) || {}) : {}
      let stepState = {}
      if (stepGate && typeof stepGate.state === 'function') {
        try {
          stepState = stepGate.state(sessionId) || {}
        } catch {
          stepState = {}
        }
      }
      return {
        sessionId: String(sessionId),
        queueLocked: base.queueLocked === true,
        lockReason: base.lockReason ?? null,
        // 自研会话门真暂停状态（脱离 task-control）。
        paused: pausedState.paused === true,
        pausedForced: pausedState.forced === true,
        // step 级门控（v0.2.0）：paused 保持布尔以兼容既有消费者，step 态用独立字段。
        pausedStep: stepState.held === true,
        stepHeldSince: stepState.since ?? null,
        stepBypass: stepState.bypass === true,
        stepManual: stepState.manual === true,
        taskControlAvailable: gate.taskControlAvailable(),
        taskControl: taskControlState(sessionId),
        updatedAt: base.updatedAt ?? null,
      }
    },
  }
}

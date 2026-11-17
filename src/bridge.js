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
 * @param {ReturnType<import('./deferrals.js').createDeferrals>} [deferrals] 请求级 hold 登记表（v4.2.11）
 */
export function createBridge(ctx, gate, store, pauseGate, stepGate, deferrals) {
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
     *
     * v4.2.11（issue #3）：**请求级 hold 也是「暂停」的一种**，但它在 step 1 就发生、
     * step 门根本没拉过，于是 `stepGate.release()` 返回 `{released:false}`，
     * 连 bypass 都不置——用户点「继续会话」放不掉任何东西（旧行为）。
     * 现在这里同时结算请求级 hold，并且**只要用户显式要继续就置 bypass**，
     * 不论门来自 step 级还是请求级。
     * @param {string} sessionId
     * @param {{bypass?:boolean, reason?:string}} [opts]
     */
    stepResume(sessionId, opts = {}) {
      const reason = opts.reason ?? 'manual'
      const wantBypass = opts.bypass !== false
      const id = String(sessionId)

      // ① 请求级 hold：先结算，让挂住的 promise 以原 config resolve（请求照常发出）。
      let requestReleased = false
      if (deferrals !== undefined && typeof deferrals.settle === 'function') {
        try {
          requestReleased = deferrals.settle(id, reason, 'release') === true
        } catch {
          requestReleased = false
        }
      }
      if (requestReleased && deferrals !== undefined && typeof deferrals.clearDeferred === 'function') {
        try {
          deferrals.clearDeferred(id)
        } catch {
          /* 延后记录清理失败不影响放行 */
        }
      }

      // ② step 级门：没有门可放时 released=false，但这不代表「什么也没发生」。
      if (!stepGate || typeof stepGate.release !== 'function') {
        return { released: requestReleased, requestReleased, bypass: false, reason: 'no-step-gate' }
      }
      let r
      try {
        r = stepGate.release(id, reason)
      } catch {
        return { released: requestReleased, requestReleased, bypass: false, reason }
      }
      const released = !!(r && r.released === true)
      let bypassed = false
      if (wantBypass && typeof stepGate.markBypass === 'function') {
        // 请求级 hold 也置 bypass：否则下一个请求立刻被同一峰期再挂一次，
        // 「继续」就变成了「点一下放一条」的假放行。
        try {
          stepGate.markBypass(id)
          bypassed = true
        } catch {
          /* ignore */
        }
      }
      return { released: released || requestReleased, requestReleased, bypass: bypassed, reason }
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
      // v4.2.11（issue #3）：请求级 hold 也是一种「暂停」，但它没有 step 门，
      // 所以旧投影里 pausedStep=false → 按钮显示「暂停会话」，用户看不到自己已被挂起。
      let requestHeld = false
      let requestHeldSince = null
      if (deferrals !== undefined && typeof deferrals.has === 'function') {
        try {
          requestHeld = deferrals.has(sessionId) === true
        } catch {
          requestHeld = false
        }
        if (requestHeld && typeof deferrals.list === 'function') {
          try {
            const hit = deferrals.list().find((e) => String(e.sessionId) === String(sessionId))
            requestHeldSince = hit ? (hit.since ?? null) : null
          } catch {
            requestHeldSince = null
          }
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
        // 请求级 hold（v4.2.11）：与 step 门并列的第二种暂停，按钮文案要认它。
        requestHeld,
        requestHeldSince,
        // 任一来源处于暂停态即为「已暂停」——按钮文案只看这一个字段。
        pausedAny: stepState.held === true || stepState.manual === true || requestHeld,
        taskControlAvailable: gate.taskControlAvailable(),
        taskControl: taskControlState(sessionId),
        updatedAt: base.updatedAt ?? null,
      }
    },
  }
}

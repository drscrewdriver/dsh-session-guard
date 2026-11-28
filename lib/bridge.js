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
import { idleState } from './store.js';
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
        let tcState = null;
        try {
            const tc = ctx && typeof ctx.get === 'function' ? ctx.get('taskControl') : undefined;
            if (tc && typeof tc.state === 'function') {
                const s = tc.state(sessionId);
                tcState = {
                    status: s && s.status,
                    paused: !!(s && s.paused),
                    forced: !!(s && s.forced),
                };
            }
        }
        catch {
            /* 状态读取失败 → 保持 null，fail-open */
        }
        return tcState;
    }
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
    function stepResume(sessionId, opts = {}) {
        const reason = opts.reason ?? 'manual';
        const wantBypass = opts.bypass !== false;
        const id = String(sessionId);
        // ① 请求级 hold：先结算，让挂住的 promise 以原 config resolve（请求照常发出）。
        let requestReleased = false;
        if (deferrals !== undefined && typeof deferrals.settle === 'function') {
            try {
                requestReleased = deferrals.settle(id, reason, 'release') === true;
            }
            catch {
                requestReleased = false;
            }
        }
        if (requestReleased && deferrals !== undefined && typeof deferrals.clearDeferred === 'function') {
            try {
                deferrals.clearDeferred(id);
            }
            catch {
                /* 延后记录清理失败不影响放行 */
            }
        }
        // ② step 级门：没有门可放时 released=false，但这不代表「什么也没发生」。
        if (!stepGate || typeof stepGate.release !== 'function') {
            return { released: requestReleased, requestReleased, bypass: false, reason: 'no-step-gate' };
        }
        let r;
        try {
            r = stepGate.release(id, reason);
        }
        catch {
            return { released: requestReleased, requestReleased, bypass: false, reason };
        }
        const released = !!(r && r.released === true);
        let bypassed = false;
        if (wantBypass && typeof stepGate.markBypass === 'function') {
            // 请求级 hold 也置 bypass：否则下一个请求立刻被同一峰期再挂一次，
            // 「继续」就变成了「点一下放一条」的假放行。
            try {
                stepGate.markBypass(id);
                bypassed = true;
            }
            catch {
                /* ignore */
            }
        }
        return { released: released || requestReleased, requestReleased, bypass: bypassed, reason };
    }
    /**
     * **恢复唯一入口**（v4.6.0）：任何恢复路径都必须经这里，保证 UI 按钮、
     * `/guard resume`、RPC、input-traffic 冻结桥四处的放行结果逐项一致。
     *
     * 顺序固定（不可交换）：
     * ① `stepResume` —— 放 step 门 + 结算请求级 hold，并置 bypass（用户显式继续）；
     * ② `pauseGate.resume` —— 从暂停点续跑，`confirm`/`choice` 原样透传。
     *
     * **不吞 `needConfirmation`**：force 中断工具 / safe 延迟工具时 `pauseGate.resume`
     * 返回 `{kind:'error', needConfirmation:true}`，此处原样上抛给调用方，
     * 由 UI 渲染三选一（重新执行 / 跳过 / 保持暂停），由命令面提示补 `confirm`。
     * 此时**不清暂停快照**（暂停保持，等待用户选择），`resumed` 为 false。
     *
     * @param {string} sessionId
     * @param {{confirm?:boolean, choice?:'rerun'|'skip', reason?:string, by?:string}} [opts]
     * @returns {{step:object, pause:object, needConfirmation:boolean, resumed:boolean}}
     */
    function resumeSession(sessionId, opts = {}) {
        const id = String(sessionId);
        const reason = typeof opts.reason === 'string' && opts.reason !== '' ? opts.reason : 'manual';
        const confirm = opts.confirm === true;
        const choice = opts.choice === 'skip' ? 'skip' : 'rerun';
        // ① step 门 / 请求级 hold：用户显式继续 → bypass 置位（本峰内不再拦该会话）。
        const step = stepResume(id, { bypass: true, reason });
        // ② turn 级真暂停：confirm 缺省为 false（与 `/guard resume` 一致，绝不隐式确认）。
        let pause;
        if (pauseGate && typeof pauseGate.resume === 'function') {
            try {
                pause = pauseGate.resume(id, { confirm, choice });
            }
            catch (e) {
                pause = { kind: 'error', text: `resume failed: ${String((e && e.message) || e)}` };
            }
        }
        else {
            pause = { kind: 'error', text: 'no pause gate available' };
        }
        const needConfirmation = !!(pause && pause.needConfirmation === true);
        const resumed = !!(pause && pause.kind === 'success');
        // ③ 兜底清队列锁：真暂停放不掉时不清（保持暂停态，等用户选）。
        if (resumed && gate && typeof gate.unlockQueue === 'function') {
            try {
                gate.unlockQueue(id);
            }
            catch {
                /* 队列锁清理失败不影响已完成的恢复 */
            }
        }
        return { step, pause, needConfirmation, resumed };
    }
    return {
        /** 停掉 session 下一回合（会话门 / 回退锁队列）。 */
        stopNextTurn(sessionId, opts) {
            return gate.stopNextTurn(sessionId, opts);
        },
        /** 恢复唯一入口（v4.6.0）。返回值形状见 {@link resumeSession}。 */
        resumeSession,
        /**
         * 旧名转发（v4.6.0）：外部消费者（input-traffic 冻结桥 / RPC 老调用方）按旧名调用。
         * 语义与 `resumeSession` 完全一致，**不再**隐式 `confirm:true`——不传 `confirm`
         * 时会收到 `needConfirmation`，由调用方决定是否二次确认。
         */
        resume(sessionId, opts = {}) {
            return resumeSession(sessionId, opts);
        },
        /** 显式锁队列（手动触发）。 */
        lockQueue(sessionId, reason = 'manual') {
            const next = gate.lockQueue(sessionId, reason);
            return { ok: true, state: next };
        },
        /** 显式解锁队列。 */
        unlockQueue(sessionId) {
            const next = gate.unlockQueue(sessionId);
            return { ok: true, state: next };
        },
        /**
         * 手动请求 step 级暂停（「暂停会话」按钮）。
         * 不打断当前 step：在下一次 `agent/pre-step` 边界拉门（step 1 也拦，且不受峰谷/provider 限制）。
         * @param {string} sessionId
         */
        stepPause(sessionId) {
            if (!stepGate || typeof stepGate.requestPause !== 'function') {
                return { requested: false, held: false, reason: 'no-step-gate' };
            }
            try {
                return stepGate.requestPause(sessionId);
            }
            catch {
                return { requested: false, held: false, reason: 'error' };
            }
        },
        /**
         * 解开 step 门 / 结算请求级 hold（v0.2.0 / v4.2.11）。
         * 语义见上方 {@link stepResume}；`resumeSession` 内部第一步就是它。
         */
        stepResume,
        /** 读一会话状态。 */
        state(sessionId) {
            const cur = store.get(sessionId);
            const base = cur || idleState(sessionId);
            const pausedState = pauseGate ? (pauseGate.state(sessionId) || {}) : {};
            let stepState = {};
            if (stepGate && typeof stepGate.state === 'function') {
                try {
                    stepState = stepGate.state(sessionId) || {};
                }
                catch {
                    stepState = {};
                }
            }
            // v4.2.11（issue #3）：请求级 hold 也是一种「暂停」，但它没有 step 门，
            // 所以旧投影里 pausedStep=false → 按钮显示「暂停会话」，用户看不到自己已被挂起。
            let requestHeld = false;
            let requestHeldSince = null;
            if (deferrals !== undefined && typeof deferrals.has === 'function') {
                try {
                    requestHeld = deferrals.has(sessionId) === true;
                }
                catch {
                    requestHeld = false;
                }
                if (requestHeld && typeof deferrals.list === 'function') {
                    try {
                        const hit = deferrals.list().find((e) => String(e.sessionId) === String(sessionId));
                        requestHeldSince = hit ? (hit.since ?? null) : null;
                    }
                    catch {
                        requestHeldSince = null;
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
                // turn 级真暂停（v4.6.0）：`pauseGate` 已落地的暂停快照。
                // 旧投影漏了这一项 → 真暂停时按钮仍显示「暂停会话」，用户点不到恢复入口。
                pausedTurn: pausedState.paused === true,
                // 任一来源处于暂停态即为「已暂停」——按钮文案只看这一个字段。
                // v4.6.0：纳入 turn 级（pauseGate 真暂停）。四来源必须同时覆盖
                // step / manual / request / turn，任一层遗漏都会重现「按钮像没反应」。
                pausedAny: stepState.held === true
                    || stepState.manual === true
                    || requestHeld
                    || pausedState.paused === true,
                taskControlAvailable: gate.taskControlAvailable(),
                taskControl: taskControlState(sessionId),
                updatedAt: base.updatedAt ?? null,
            };
        },
    };
}

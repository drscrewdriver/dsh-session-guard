/**
 * dsh-session-guard — 后端自动重试（host side，D9）。
 *
 * 监听 session/event：turn/end 以 error / interrupted / max-tokens 结束时，
 * 分类瞬时/永久失败，自适应退避后自动 `agent.followup(retryText)` 续跑。
 *
 * 关键纪律：
 * - **判定顺序即安全边界**：失败分类先查 `code` 白名单、再看 HTTP `status`、
 *   最后才降级用 `message` 文本——因为 message 会原样回显模型的工具参数，
 *   不可作为定档依据（见 classifyFailure）。
 * - **冻结让路**：会话被本插件门控（高峰暂停 / 队列锁）时不触发重试——
 *   与 input-traffic「freeze 是一等公民」一致，自动重试不得绕过会话门。
 * - 用户手动介入（user/message）与成功回合重置连续计数。
 * - 断网（网络类失败）不消耗重试预算，与 `retryPauseWhenOffline` 开关解耦。
 * - 宿主合成回合（turn/start reason 不在模型白名单）不触发重试。
 * - 子代理会话不重试（由父代理处理）。
 * - 永久失败（鉴权/余额/模型不存在/上下文超限等）重试无益 → 停止并告警。
 *
 * 纯决策逻辑（classifyTurnEnd / classifyFailure / isTransientFailure /
 * effectiveCooldown / shouldRetry）零依赖可单测；事件接线在 createRetry。
 */
import { isNetworkClassFailure, createOfflineWaiter, probeOnline } from './offline.js';
import { networkInterfaces } from 'node:os';
import { lookup as dnsLookup } from 'node:dns';
/** 默认重试配置。 */
export const DEFAULT_RETRY = Object.freeze({
    retryEnabled: false, // ← 自动重试开关（默认关，保守）
    retryText: '继续（自动重试）',
    retryGraceMs: 3000, // 失败后等待多久再发
    retryCooldownMs: 20000, // 同一会话两次重试最小间隔
    retryBackoffFactor: 2,
    retryBackoffMaxMs: 300000,
    retryMaxConsecutive: 3, // 连续重试上限，超过停止
    retryPauseWhenOffline: false, // 断网时暂停重试（默认关：跟着主开关的保守姿态）
    retryOfflineCheckMs: 15000, // 挂起期间重探间隔（下限 3000）
});
/** 本插件自己的延后失败哨兵（与 deferrals.js 的 PEAK_DEFERRED_CODE 同一个值）。 */
export const PEAK_DEFERRED_CODE = 'PEAK_DEFERRED';
/**
 * 是否本插件的「高峰延后」失败（**精确匹配，唯一短路**）。
 *
 * 两条路径都必须认：
 * - `code === 'PEAK_DEFERRED'`：结构化路径（若上层保留了 failure.code）；
 * - `message` 以 `PEAK_DEFERRED:` 开头：DSH 回合循环只对 `error instanceof LlmError`
 *   保留结构化 failure，其它一律压成 `{ message: errorChain(error), code: 'UNKNOWN' }`
 *   （见 findings 8.3），本插件不能 value-import `@deepseek-ai/dsh-llm`。
 *
 * **严禁**在这里加 `高峰` / `已延后` / `拦截` 之类宽泛关键词——那会误伤真实错误，
 * 也会破坏 429 / 传输层的重试语义。
 */
export function isPeakDeferredFailure({ code, message } = {}) {
    if (code === PEAK_DEFERRED_CODE)
        return true;
    return typeof message === 'string' && message.startsWith(`${PEAK_DEFERRED_CODE}:`);
}
/** 瞬时 vs 永久失败分类：瞬时值得重试，永久重试无益。 */
export function isTransientFailure(failure = {}) {
    // 本插件自己的延后失败是「永久」——重试只会再被拦一次，形成放大。
    // 精确短路优先于分档判定，不得被新分类覆盖。
    if (isPeakDeferredFailure(failure))
        return false;
    return classifyFailure(failure) !== 'permanent';
}
/**
 * 「必然瞬时」的 code 白名单（**大小写不敏感**：真实上游返回小写
 * `rate_limit_error` / `insufficient_quota`，宿主包装层返回大写）。
 * 命中即定档，**完全不读 message**——`MALFORMED_RESPONSE` 的 message 会回显
 * 模型当时的工具参数（含 `auth` / `permission` 等词），文本参与判定即被击穿。
 */
export const ALWAYS_TRANSIENT_CODES = Object.freeze(new Set([
    'MALFORMED_RESPONSE', 'TRANSPORT', 'TIMEOUT', 'DNS', 'CONNECTION',
    'RATE_LIMIT', 'RESOURCE_EXHAUSTED', 'OVERLOADED',
]));
/** 「必然永久」的 code 白名单（同样大小写不敏感）。 */
export const ALWAYS_PERMANENT_CODES = Object.freeze(new Set([
    'AUTH', 'UNAUTHORIZED', 'FORBIDDEN', 'INVALID_REQUEST',
    'MODEL_NOT_FOUND', 'CONTEXT_LENGTH_EXCEEDED',
]));
/**
 * 「模型发起」的 turn/start reason 白名单。实测基线（findings「task_01 实测」）：
 * 宿主 0.2.3-alpha.2 的 turn/start data 只有 `{ turn }`，**没有 reason 字段**，
 * 且全 asar 零命中 `message-ops` —— 所以 `undefined` / `null` 才是现状常态，必须视为
 * 模型回合（否则改造后一次都不续跑）。白名单只预防未来宿主补上该字段的情形。
 */
export const MODEL_START_REASONS = Object.freeze(new Set([
    'user', 'user-message', 'model', 'agent', 'followup', 'retry', 'queue', 'inbox', 'prompt',
]));
/** 本回合是否由模型发起（可参与重试判定）。合成回合返回 false。 */
export function isModelStartReason(reason) {
    if (reason === undefined || reason === null || reason === '')
        return true;
    if (typeof reason === 'string') {
        if (reason === 'unknown')
            return true;
        return MODEL_START_REASONS.has(reason.toLowerCase());
    }
    return false;
}
/**
 * 分档判定。**顺序即安全边界**：① code 白名单 → ② HTTP status → ③ 才轮到 message 文本。
 * 返回 `'transient' | 'permanent' | 'unknown'`（三值而非布尔：排查时要能看出
 * 是命中白名单还是落进文本兜底）。`unknown` 按可重试处理（与历史默认一致）。
 *
 * @param {{code?:string, status?:number, message?:string}} [failure]
 * @param {{warn?:(msg:string)=>void}} [opts] 兜底路径的观测口（补白名单用）
 */
export function classifyFailure(failure = {}, opts = {}) {
    const { code, status } = failure;
    const key = typeof code === 'string' ? code.toUpperCase() : '';
    // ① code 白名单：命中即定档，不读 message（故 message 只在③ 处惰取）
    if (ALWAYS_TRANSIENT_CODES.has(key))
        return 'transient';
    if (ALWAYS_PERMANENT_CODES.has(key))
        return 'permanent';
    // ② HTTP 状态优先于文本
    if (typeof status === 'number') {
        if (status === 401 || status === 402 || status === 403)
            return 'permanent';
        if (status === 408 || status === 429)
            return 'transient';
        if (status >= 500)
            return 'transient';
    }
    // ③ code/status 都给不出答案时，才降级用文本兜底，并留下观测
    if (key !== '' && key !== 'UNKNOWN' && typeof opts.warn === 'function') {
        opts.warn(`[session-guard] unrecognized failure code "${code}", fell back to text classification`);
    }
    return classifyByMessage(failure.message);
}
/**
 * 收窄后的文本兜底：永久侧只留**明确账务**词与「invalid + 凭据」强上下文。
 * - **不再**裸匹配 `auth` / `permission` / `forbidden`（工具参数回显会击穿）；
 * - **移除**旧的 insufficient 与 quota 组合正则：`insufficient_quota` 在多家上游是瞬时 tpm/rpm 限流，
 *   文本层面与「额度耗尽」不可区分 → 交给 code/status 定档，真账务由 402 与账务词覆盖。
 */
export function classifyByMessage(message) {
    const text = typeof message === 'string' ? message.toLowerCase() : '';
    if (text === '')
        return 'unknown';
    if (/insufficient[_\s-]*(balance|credit)|billing|payment|account.*suspend/i.test(text))
        return 'permanent';
    if (/(?:invalid|incorrect|bad|expired)[_\s-]*(?:api[_\s-]?key|token|credential)/i.test(text))
        return 'permanent';
    if (/model[^a-z]*not[^a-z]*found|unknown[_-]?model|not.*support.*model/i.test(text))
        return 'permanent';
    if (/context.*(length|limit|overflow|exceed)|token.*limit|max.*context/i.test(text))
        return 'permanent';
    if (/invalid[_-]?request|bad[_-]?request/i.test(text))
        return 'permanent';
    return 'unknown';
}
/**
 * turn/end reason → 是否可自动重试。
 * - completed / aborted（用户停）/ blocked（策略拒）→ 否
 * - error → 先按精确码短路 `PEAK_DEFERRED`（永久），再按 isTransientFailure 分类
 *   （可传 `classify` 以接入未识别 code 的观测口）
 * - interrupted（崩溃修复）→ 可重试
 * - max-tokens → 可重试
 */
export function classifyTurnEnd(reason, failure, classify) {
    const kind = reason && reason.kind;
    if (kind === 'completed' || kind === 'aborted' || kind === 'blocked')
        return false;
    if (kind === 'error') {
        if (isPeakDeferredFailure(failure))
            return false;
        if (typeof classify === 'function')
            return classify(failure) !== 'permanent';
        return isTransientFailure(failure);
    }
    if (kind === 'interrupted' || kind === 'max-tokens')
        return true;
    return false;
}
/** 自适应退避：consecutive 次连续后 cooldown * factor^n，封顶 max。 */
export function effectiveCooldown(consecutive, base, factor, max) {
    const mult = Math.pow(factor, Math.max(0, consecutive));
    return Math.min(Math.max(base, base * mult), Math.max(base, max));
}
/**
 * 纯决策：此刻是否应触发重试。
 * @param {object} s 会话状态 { consecutive, lastAttemptAt, pending }
 * @param {object} cfg 重试配置
 * @param {boolean} frozen 会话是否被门控（高峰暂停/队列锁）
 * @param {number} now
 */
export function shouldRetry(s, cfg, frozen, now = Date.now()) {
    if (!cfg.retryEnabled)
        return false;
    if (frozen)
        return false; // 冻结让路（D9）
    if (s.pending)
        return false; // 已有排队重试
    if (s.consecutive >= cfg.retryMaxConsecutive)
        return false;
    if (now - s.lastAttemptAt < effectiveCooldown(s.consecutive, cfg.retryCooldownMs, cfg.retryBackoffFactor, cfg.retryBackoffMaxMs))
        return false;
    return true;
}
/** 会话状态工厂。 */
export function freshRetryState() {
    return { consecutive: 0, lastAttemptAt: 0, pending: false, turnReason: null };
}
/**
 * 事件接线（host）：
 * @param {object} deps
 * @param {object} deps.ctx host context
 * @param {()=>object} deps.getSettings 读实时配置
 * @param {(sessionId:string)=>boolean} deps.isFrozen 会话是否被门控
 * @param {(sessionId:string, text:string)=>void} [deps.send] 发送函数（默认 agent.followup）
 * @param {()=>Promise<boolean>} [deps.probe] 在线探测（默认为 offline.js 的零请求探测，测试可注 fake）
 */
export function createRetry({ ctx, getSettings, isFrozen, send, probe }) {
    const states = new Map();
    const waiters = new Map();
    const isOnline = typeof probe === 'function'
        ? probe
        : () => probeOnline({ lookup: dnsLookup, interfaces: networkInterfaces, timeoutMs: 2000 });
    function state(sessionId) {
        let s = states.get(sessionId);
        if (!s) {
            s = freshRetryState();
            states.set(sessionId, s);
        }
        return s;
    }
    function waiterFor(sessionId) {
        let w = waiters.get(sessionId);
        if (!w) {
            const cfg = getSettings() ?? {};
            w = createOfflineWaiter({
                // 挂起期间的重探：冻结或重新在线都算「停止等待」（冻结后由 post-wait 的 shouldRetry 拦下）。
                probe: () => (isFrozen(sessionId) ? Promise.resolve(true) : isOnline()),
                everyMs: cfg.retryOfflineCheckMs ?? DEFAULT_RETRY.retryOfflineCheckMs,
                onHold: () => ctx.logger?.info?.(`[session-guard] offline hold ${sessionId}: retry paused, budget untouched`),
                onResume: () => ctx.logger?.info?.(`[session-guard] back online ${sessionId}: resuming retry`),
            });
            waiters.set(sessionId, w);
        }
        return w;
    }
    /** 取消挂起（用户消息 / 新回合 / 冻结 / 关闭开关都走这里）。 */
    function cancelOfflineHolds(sessionId) {
        if (typeof sessionId === 'string') {
            const w = waiters.get(sessionId);
            if (w)
                w.cancel();
            return;
        }
        for (const w of waiters.values())
            w.cancel();
        waiters.clear();
    }
    /** 从 turn/end reason 提取失败事实。 */
    function failureFacts(reason) {
        const error = reason && reason.error;
        return {
            code: error && typeof error.code === 'string' ? error.code : 'UNKNOWN',
            message: error && typeof error.message === 'string' ? error.message : '',
            status: error && typeof error.status === 'number' ? error.status : undefined,
        };
    }
    /** 分档（带观测）：未识别 code 落进文本兜底时打 warn，便于后续补白名单。 */
    function classifyWithLog(failure) {
        return classifyFailure(failure, { warn: (msg) => ctx.logger?.warn?.(msg) });
    }
    function schedule(sessionId, reason) {
        const s = state(sessionId);
        const cfg = getSettings();
        if (s.pending)
            return; // 已有排队重试（真正的去重门；下面的预检不得再伪造 pending）
        const frozen = isFrozen(sessionId);
        // 预检用**真实状态** `s`（pending 已为 false）：旧代码传 `{ ...s, pending: true }`
        // 会让 shouldRetry 的 `if (s.pending) return false` 永远短路 → 整个重试永不触发（隐藏死代码）。
        if (!shouldRetry(s, cfg, frozen))
            return;
        s.pending = true;
        const failure = failureFacts(reason);
        const grace = cfg.retryGraceMs ?? DEFAULT_RETRY.retryGraceMs;
        const timer = setTimeout(async () => {
            s.pending = false;
            // 到点再复核：门控/上限变化后放弃。
            const frozenNow = isFrozen(sessionId);
            if (frozenNow) {
                cancelOfflineHolds(sessionId); // 冻结即取消挂起（冻结让路）
                return;
            }
            if (!shouldRetry(s, cfg, false))
                return;
            const pauseOffline = (getSettings() ?? cfg).retryPauseWhenOffline === true;
            const networkClass = isNetworkClassFailure(failure);
            // ③ 计数豁免（与开关解耦）：断网导致的失败不消耗重试预算。
            //   开=挂起等网回来；关=本次直接跳过（不发送、也不涨 consecutive）。
            if (networkClass) {
                // fail-open：探测本身抛错/拒绝 → 视为在线（误判离线代价 > 放行代价）。
                let offline;
                try {
                    offline = !(await isOnline());
                }
                catch {
                    offline = false;
                }
                if (offline && pauseOffline) {
                    s.pending = true;
                    const verdict = await waiterFor(sessionId).wait();
                    s.pending = false;
                    if (verdict !== 'online')
                        return;
                    // 网回来后走原有 grace + cooldown；若期间被冻结则让路放弃。
                    if (!shouldRetry(s, getSettings() ?? cfg, isFrozen(sessionId)))
                        return;
                    offline = false;
                }
                if (offline) {
                    if (pauseOffline)
                        return; // 已被取消/未恢复：不消耗也不发送
                    ctx.logger?.info?.(`[session-guard] offline, retry skipped (budget untouched) ${sessionId}`);
                    return;
                }
            }
            const agent = ctx.agents.get(sessionId);
            if (!agent || agent.status !== 'idle')
                return;
            const text = cfg.retryText ?? DEFAULT_RETRY.retryText;
            try {
                if (send) {
                    send(sessionId, text);
                }
                else {
                    // 与 autoresume 同构：直接构造 plugin-source 消息，避免运行时依赖。
                    agent.followup({
                        id: `session-guard-retry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        role: 'user',
                        content: [{ type: 'text', text }],
                        source: { kind: 'plugin:session-guard', form: 'notice' },
                    });
                }
                s.lastAttemptAt = Date.now();
                s.consecutive += 1;
                ctx.logger?.info?.(`[session-guard] auto-retry ${sessionId} (${String(reason && reason.kind)}), #${s.consecutive}`);
            }
            catch (e) {
                ctx.logger?.warn?.(`[session-guard] auto-retry send failed: ${String(e && e.message || e)}`);
            }
        }, grace);
        // 会话对象上的清理钩子（若宿主提供）。
        const dispose = () => clearTimeout(timer);
        return dispose;
    }
    function onEvent(session, event) {
        const sessionId = session && session.id;
        if (typeof sessionId !== 'string')
            return;
        const s = state(sessionId);
        switch (event.type) {
            case 'turn/start': {
                // ④ 记录宿主合成回合的 reason；新回合一律取消可能在跑的断网挂起。
                cancelOfflineHolds(sessionId);
                const raw = event.data && event.data.reason;
                s.turnReason = typeof raw === 'string' ? raw : null;
                if (raw !== undefined && raw !== null && !isModelStartReason(raw)) {
                    if (!MODEL_START_REASONS.has(String(raw).toLowerCase()) && String(raw) !== 'unknown') {
                        ctx.logger?.warn?.(`[session-guard] unrecognized turn/start reason "${String(raw)}", treated as synthetic`);
                    }
                    // 合成回合（撤回/回滚类插件触发的自开回合）：不属于模型回合，直接让路。
                    s.pending = false;
                }
                return;
            }
            case 'turn/end': {
                const reason = event.data && event.data.reason;
                if (reason && reason.kind === 'completed') {
                    s.consecutive = 0; // 成功回合重置
                    s.pending = false;
                    s.turnReason = null;
                    return;
                }
                if (reason && reason.kind === 'aborted') {
                    // 用户主动停止：不重试，重置。
                    s.consecutive = 0;
                    s.pending = false;
                    s.turnReason = null;
                    return;
                }
                // 合成回合不触发重试、不计 consecutive。
                if (!isModelStartReason(s.turnReason)) {
                    s.turnReason = null;
                    return;
                }
                s.turnReason = null;
                if (reason && classifyTurnEnd(reason, failureFacts(reason), classifyWithLog)) {
                    schedule(sessionId, reason);
                }
                return;
            }
            case 'user/message': {
                // 用户手动介入：重置（无论是否我们的回显都保守重置），并取消挂起。
                if (event.data && event.data.source && event.data.source.kind === 'user') {
                    s.consecutive = 0;
                    s.pending = false;
                    cancelOfflineHolds(sessionId);
                }
                return;
            }
            default:
                return;
        }
    }
    ctx.on('session/event', (session, event) => {
        try {
            onEvent(session, event);
        }
        catch (e) {
            ctx.logger?.warn?.(`[session-guard] retry event failed: ${String(e && e.message || e)}`);
        }
    });
    return {
        onEvent,
        state,
        states,
        cancelOfflineHolds,
        waiters,
    };
}

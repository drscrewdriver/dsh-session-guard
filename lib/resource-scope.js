/**
 * dsh-session-guard — 暂停资源范围（host side，附加计划 A）。
 *
 * 「暂停」原本只停当前 agent 回合，完全不管两类并行资源：后台任务（`run_in_background`
 * 起的 job）与子会话（子代理/子任务）。本模块负责在一次暂停里把它们按**会话作用域**收干净，
 * 并**如实上报**四态：`killedJobs` / `interruptedChildren` / `unknown` / `partial`，
 * 外加 `unsupported`（宿主没这能力）。
 *
 * 三条硬约束（顺序即正确性）：
 * 1. **settlement shield 必须早于 kill**：job 结束事件若在会话尚未标记暂停时到达，会把
 *    会话重新唤醒——先挂 `jobs.wait()` 做 shield 正是为堵这个（上游点名的关键细节）。
 * 2. **活跃口径 = running || stopping**：照抄宿主 `dsh-jobs-local` 的 `activeJobCount`。
 *    只认 `running` 会把卡在 `stopping` 的 job 漏成静默空洞（证据链上的洞，不只是漏杀）。
 * 3. **有界循环（默认 3 轮 × 250ms）**：既补杀窗口内新起的资源，又不无限追新（那会让暂停
 *    无界）。轮外仍活跃 / 从未捕获到的 → 写进 `unknown` 并置 `partial`，绝不写「干净暂停」。
 *
 * 设计：纯决策（`settleScope` / `drainScope` 的判定）与 IO（`list*` / `armShields` /
 * `stopJobs` / `stopChildren` / `collectPauseScope` 的服务调用）分离——判定零依赖可单测，
 * IO 只在薄边界里出现、可被仿真服务驱动。**服务缺失是正常态**（返回 null → 上层标
 * `unsupported`），不是错误。
 */
export const ACTIVE_JOB_STATUSES = Object.freeze(['running', 'stopping']);
/** 有界补杀循环的默认轮数与每轮间隔（轮数刻意保守，见头注约束 3）。 */
export const DEFAULT_ROUNDS = 3;
export const DEFAULT_POLL_MS = 250;
/** 一次暂停要收的资源快照（四态 + unsupported）。 */
export function emptyScope() {
    return { killedJobs: [], interruptedChildren: [], unknown: [], unsupported: [], partial: false };
}
// ── 纯决策层（零服务依赖，可单测）──────────────────────────────────────
/**
 * 把逐项停止结果聚合成四态快照。
 * 结果项形状：`{ kind: 'job' | 'child', id, outcome: 'killed' | 'handoff' | 'unknown' | 'unsupported' }`。
 * - killed → 进对应 killedJobs / interruptedChildren；
 * - handoff / unknown → 进 unknown（**没确认停掉就不算停掉**）并置 partial；
 * - unsupported（维度级无能力）→ 进 unsupported（≠ unknown）。
 */
export function settleScope(results) {
    const scope = emptyScope();
    for (const raw of Array.isArray(results) ? results : []) {
        if (!raw || typeof raw !== 'object')
            continue;
        const r = raw;
        const kind = r.kind;
        const id = r.id;
        switch (r.outcome) {
            case 'killed':
                if (kind === 'job') {
                    if (!scope.killedJobs.includes(id))
                        scope.killedJobs.push(id);
                }
                else if (kind === 'child') {
                    if (!scope.interruptedChildren.includes(id))
                        scope.interruptedChildren.push(id);
                }
                break;
            case 'handoff':
            case 'unknown':
                if (!scope.unknown.includes(id))
                    scope.unknown.push(id);
                scope.partial = true;
                break;
            case 'unsupported':
                if (!scope.unsupported.includes(kind ?? id))
                    scope.unsupported.push(kind ?? id);
                break;
            default:
                // 未知结果形状：保守进 unknown + partial（宁多报不漏报）。
                if (id !== undefined && !scope.unknown.includes(id))
                    scope.unknown.push(id);
                scope.partial = true;
        }
    }
    return scope;
}
/**
 * 有界轮询直到所有目标进入终态或超时（**判定注入**，不碰真实服务）。
 * @param {Array} targets 待观察目标
 * @param {object} opts
 * @param {(t:any)=>boolean|Promise<boolean>} opts.isTerminal 目标是否已终态
 * @param {number} [opts.rounds] 最大轮数
 * @param {number} [opts.pollMs] 轮间隔
 * @param {(ms:number)=>Promise<void>} [opts.sleep] 定时注入（测试用即时 sleep）
 * @returns {Promise<{ settled: Array, timedOut: Array }>}
 */
export async function drainScope(targets, opts = {}) {
    const rounds = typeof opts.rounds === 'number' && Number.isFinite(opts.rounds) ? Math.max(1, opts.rounds) : DEFAULT_ROUNDS;
    const pollMs = typeof opts.pollMs === 'number' && Number.isFinite(opts.pollMs) ? opts.pollMs : DEFAULT_POLL_MS;
    const sleep = typeof opts.sleep === 'function' ? opts.sleep : (ms) => new Promise((r) => setTimeout(() => r(), ms));
    const isTerminal = typeof opts.isTerminal === 'function' ? opts.isTerminal : () => false;
    let pending = Array.isArray(targets) ? [...targets] : [];
    const settled = [];
    for (let round = 0; round < rounds && pending.length > 0; round++) {
        const still = [];
        for (const t of pending) {
            let done;
            try {
                done = (await isTerminal(t)) === true;
            }
            catch {
                done = false;
            }
            if (done)
                settled.push(t);
            else
                still.push(t);
        }
        pending = still;
        if (pending.length > 0 && round < rounds - 1)
            await sleep(pollMs);
    }
    return { settled, timedOut: pending };
}
// ── IO 薄边界（服务调用集中于此，可被仿真服务驱动）───────────────────────
/** 鸭子探测：服务是否存在且具备某方法。 */
function svcHas(svc, method) {
    return Boolean(svc) && typeof svc[method] === 'function';
}
/**
 * 列该会话拥有的活跃 job（含 stopping）。
 * 服务缺失 / list 抛错 → 返回 `null`（=无能力，上层标 unsupported）。
 * 有服务但无 owned job → 返回 `[]`（≠ null）。
 */
export async function listOwnedJobs(jobsSvc, sessionId) {
    const svc = jobsSvc;
    if (!svcHas(svc, 'list'))
        return null;
    let view;
    try {
        view = await svc?.list?.(sessionId);
    }
    catch {
        return null;
    }
    if (!Array.isArray(view))
        return [];
    const owned = [];
    for (const j of view) {
        if (!j || j.id === undefined)
            continue;
        // owner 作用域：只认本会话 owned（view 通常已按 caller 过滤，这里再兜一层）；unowned 不碰。
        const ownerRaw = j.owner;
        const owner = ownerRaw && typeof ownerRaw === 'object' ? ownerRaw.id : ownerRaw;
        if (owner !== undefined && owner !== null && String(owner) !== String(sessionId))
            continue;
        if (typeof j.status === 'string' && ACTIVE_JOB_STATUSES.includes(j.status))
            owned.push({ id: j.id, status: j.status });
    }
    return owned;
}
/** 从 listDescendants 的多形态返回里抽子会话 id（含多层后代）。 */
function extractDescendantIds(node, out, depth = 0) {
    if (node == null || depth > 16)
        return out;
    if (Array.isArray(node)) {
        for (const n of node)
            extractDescendantIds(n, out, depth);
        return out;
    }
    if (typeof node === 'object') {
        const obj = node;
        const id = obj.sessionId ?? obj.childSessionId ?? obj.id;
        if (typeof id === 'string' && id !== '')
            out.add(id);
        for (const key of ['descendants', 'children', 'nodes', 'tree', 'items', 'list']) {
            if (obj[key] !== undefined)
                extractDescendantIds(obj[key], out, depth + 1);
        }
    }
    return out;
}
/**
 * 列该会话的活跃子会话（含多层后代）。
 * 优先 `subagentsSvc.listDescendants`；退化 `ctx.agents.list()` 过滤 running；
 * 两条都不可用 / 抛错 → 返回 `null`（=无能力）。
 */
export async function listActiveChildren(subagentsSvc, sessionId, ctx) {
    const svc = subagentsSvc;
    if (svcHas(svc, 'listDescendants')) {
        let tree;
        try {
            tree = await svc?.listDescendants?.(sessionId);
        }
        catch {
            tree = null;
        }
        if (tree !== null && tree !== undefined) {
            const ids = extractDescendantIds(tree, new Set());
            return [...ids].filter((id) => String(id) !== String(sessionId)).map((id) => ({ sessionId: id }));
        }
        // listDescendants 存在但返回空 → 视为「有能力、无子会话」，不再走 ctx 退化
        return [];
    }
    // 退化路径：宿主没暴露 listDescendants 时用 agents.list 过滤运行中的后代
    const agents = ctx && ctx.agents;
    if (agents && typeof agents.list === 'function') {
        try {
            const list = agents.list();
            if (Array.isArray(list)) {
                return list
                    .map((a) => a)
                    .filter((a) => a && a.id && String(a.id) !== String(sessionId)
                    && (a.status === 'running' || a.status === 'stopping')
                    && (a.parentId === sessionId || a.parentSessionId === sessionId))
                    .map((a) => ({ sessionId: String(a.id) }));
            }
        }
        catch {
            /* ignore */
        }
    }
    return null;
}
/**
 * 对待停 job 挂 settlement shield（`jobs.wait`），返回可 await 的 settle 句柄数组。
 * **必须在 kill 之前调用**（否则 job 结束事件会在会话未标记暂停时把它唤醒）。
 * wait 抛错静默（shield 是尽力而为，不阻断暂停主线）。
 */
export async function armShields(jobsSvc, jobs, sessionId, waitMs) {
    if (!svcHas(jobsSvc, 'wait') || !Array.isArray(jobs))
        return [];
    const handles = [];
    const svc = jobsSvc;
    for (const job of jobs ?? []) {
        if (!job || job.id === undefined)
            continue;
        try {
            const h = svc?.wait?.(job.id, waitMs, sessionId, undefined);
            if (h && typeof h.then === 'function' && typeof h.catch === 'function') {
                handles.push(h.catch(() => undefined)); // shield 尽力而为
                // 触发一次对 wait 的调用即可（记录在调用方 spy 里）
            }
        }
        catch {
            /* ignore */
        }
    }
    return handles;
}
/** 逐个 kill(id, sessionId, reason)；caller=本会话 id（越权栅栏依赖它）；单项失败记 unknown 不阻断其余。 */
export async function stopJobs(jobsSvc, jobs, sessionId, reason) {
    const results = [];
    const svc = jobsSvc;
    if (!svcHas(svc, 'kill')) {
        if (Array.isArray(jobs) && jobs.length)
            results.push({ kind: 'job', id: 'dimension', outcome: 'unsupported' });
        return results;
    }
    for (const job of jobs ?? []) {
        if (!job || job.id === undefined)
            continue;
        try {
            const r = (await svc?.kill?.(job.id, sessionId, reason));
            // 宿主 kill 可能返回 {handoff:true} 之类；未显式确认停掉的一律保守处理
            const outcome = r && r.handoff ? 'handoff' : 'killed';
            results.push({ kind: 'job', id: job.id, outcome });
        }
        catch {
            results.push({ kind: 'job', id: job.id, outcome: 'unknown' });
        }
    }
    return results;
}
/**
 * 逐个 interruptByUser(childSessionId)；不存在该方法时退化 agent.cancel({kind:'user'})；
 * 都失败 → unknown。
 */
export async function stopChildren(subagentsSvc, children, ctx) {
    const results = [];
    if (!Array.isArray(children))
        return results;
    const canInterrupt = svcHas(subagentsSvc, 'interruptByUser');
    for (const child of children) {
        const cid = child && (child.sessionId ?? child.id);
        if (cid === undefined)
            continue;
        if (canInterrupt) {
            try {
                await subagentsSvc?.interruptByUser?.(cid);
                results.push({ kind: 'child', id: cid, outcome: 'killed' });
                continue;
            }
            catch {
                // interruptByUser 失败 → 试 cancel
            }
        }
        // 退化：agent.cancel
        const agent = ctx?.agents && typeof ctx.agents.get === 'function' ? ctx.agents.get(cid) : undefined;
        if (agent && typeof agent.cancel === 'function') {
            try {
                ;
                agent.cancel({ kind: 'user' }, { keepInbox: true });
                results.push({ kind: 'child', id: cid, outcome: 'killed' });
                continue;
            }
            catch {
                /* fallthrough */
            }
        }
        results.push({ kind: 'child', id: cid, outcome: canInterrupt ? 'unknown' : 'unsupported' });
    }
    return results;
}
/**
 * 编排：一次暂停的完整资源收集（list → shield → kill/interrupt → 有界补杀循环 → drain → settle）。
 * 供 pause-gate 调用；服务未接线时整块空转返回 unsupported。
 *
 * @param {object} deps
 * @param {string} deps.sessionId
 * @param {object} [deps.jobsSvc]
 * @param {object} [deps.subagentsSvc]
 * @param {object} [deps.ctx]
 * @param {object} deps.cfg { pauseStopsJobs, pauseStopsChildren, pauseScopeDrainMs }
 * @param {(msg:string)=>void} [deps.log]
 * @param {(ms:number)=>Promise<void>} [deps.sleep] 定时注入（测试即时）
 * @returns {Promise<object>} 四态快照
 */
export async function collectPauseScope(deps) {
    const { sessionId, jobsSvc, subagentsSvc, ctx, cfg = {}, log } = deps;
    const notify = typeof log === 'function' ? log : () => { };
    const sleep = typeof deps.sleep === 'function' ? deps.sleep : (ms) => new Promise((r) => setTimeout(() => r(), ms));
    const drainMs = Math.max(500, Number(cfg.pauseScopeDrainMs) || 3000);
    const perRoundMs = Math.max(50, Math.floor(drainMs / (DEFAULT_ROUNDS + 1)));
    const stopJobsOn = cfg.pauseStopsJobs !== false;
    const stopChildrenOn = cfg.pauseStopsChildren !== false;
    const reason = 'session-guard:pause';
    const attemptedJobs = new Set();
    const killedJobs = new Set();
    const attemptedChildren = new Set();
    const killedChildren = new Set();
    const unknown = new Set();
    const unsupported = [];
    const jobsCapable = svcHas(jobsSvc, 'kill') || svcHas(jobsSvc, 'list');
    const childCapable = svcHas(subagentsSvc, 'interruptByUser') || svcHas(subagentsSvc, 'listDescendants') || (ctx && ctx.agents && typeof ctx.agents.list === 'function');
    // ---- 首轮 + 有界补杀循环 ----
    for (let round = 0; round < DEFAULT_ROUNDS; round++) {
        // jobs 维度
        if (stopJobsOn && jobsCapable) {
            const owned = await listOwnedJobs(jobsSvc, sessionId);
            if (owned === null) {
                if (round === 0)
                    unsupported.push('jobs');
            }
            else {
                const fresh = owned.filter((j) => j.id !== undefined && !attemptedJobs.has(j.id));
                if (fresh.length > 0) {
                    await armShields(jobsSvc, fresh, sessionId, drainMs); // ① 先挂 shield
                    const res = await stopJobs(jobsSvc, fresh, sessionId, reason); // ② 再 kill
                    for (const r of res) {
                        attemptedJobs.add(r.id);
                        if (r.outcome === 'killed') {
                            killedJobs.add(r.id);
                            notify(`[session-guard] pause stopped job ${r.id} of ${sessionId}`);
                        }
                        else
                            unknown.add(r.id);
                    }
                }
            }
        }
        else if (stopJobsOn && !jobsCapable && round === 0) {
            unsupported.push('jobs');
        }
        // children 维度
        if (stopChildrenOn && childCapable) {
            const kids = await listActiveChildren(subagentsSvc, sessionId, ctx);
            if (kids === null) {
                if (round === 0)
                    unsupported.push('children');
            }
            else {
                const fresh = kids.filter((c) => {
                    const id = c.sessionId ?? c.id;
                    return id !== undefined && !attemptedChildren.has(id);
                });
                if (fresh.length > 0) {
                    const res = await stopChildren(subagentsSvc, fresh, ctx);
                    for (const r of res) {
                        attemptedChildren.add(r.id);
                        if (r.outcome === 'killed') {
                            killedChildren.add(r.id);
                            notify(`[session-guard] pause interrupted child ${r.id} of ${sessionId}`);
                        }
                        else if (r.outcome === 'unsupported') {
                            if (!unsupported.includes('children'))
                                unsupported.push('children');
                        }
                        else
                            unknown.add(r.id);
                    }
                }
            }
        }
        else if (stopChildrenOn && !childCapable && round === 0) {
            unsupported.push('children');
        }
        // 是否还需继续（无残留活跃则提前退出）
        const stillOwned = stopJobsOn && jobsCapable ? await listOwnedJobs(jobsSvc, sessionId) : [];
        const stillKids = stopChildrenOn && childCapable ? await listActiveChildren(subagentsSvc, sessionId, ctx) : [];
        const activeCount = (stillOwned ? stillOwned.length : 0) + (stillKids ? stillKids.length : 0);
        if (activeCount === 0)
            break;
        if (round < DEFAULT_ROUNDS - 1)
            await sleep(perRoundMs);
    }
    // ---- 轮外仍活跃 / 从未捕获 → unknown + partial ----
    const leftover = stopJobsOn && jobsCapable ? await listOwnedJobs(jobsSvc, sessionId) : null;
    if (leftover)
        for (const j of leftover)
            if (j.id !== undefined && !killedJobs.has(j.id))
                unknown.add(j.id);
    const leftoverKids = stopChildrenOn && childCapable ? await listActiveChildren(subagentsSvc, sessionId, ctx) : null;
    if (leftoverKids)
        for (const c of leftoverKids) {
            const id = c.sessionId ?? c.id;
            if (id !== undefined && !killedChildren.has(id))
                unknown.add(id);
        }
    return {
        killedJobs: [...killedJobs],
        interruptedChildren: [...killedChildren],
        unknown: [...unknown],
        unsupported,
        partial: unknown.size > 0,
    };
}

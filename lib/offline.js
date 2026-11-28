/**
 * dsh-session-guard — 断网探测与挂起（host side）。
 *
 * **为什么只查网卡 + DNS、绝不发 HTTP 请求**：
 * - 发重试的是宿主，不是页面——所有标签页关掉后它仍在跑，所以探测必须在 host 侧做；
 * - 一旦发请求，就把「探测」变成了真实网络调用：会被代理、防火墙、配额与隐私策略影响，
 *   也会在正是网络拥塞时额外烧一次往返。网卡 + 一次 DNS 足以区分「我连不出去」
 *   与「服务器让我慢点」，后者（5xx / 429）本就不该挂起。
 *
 * **为什么 fail-open（探测抛错/超时 → 视为在线）**：
 * 误判离线的代价是「白等一个探测周期」，且持续误判会让重试永久挂起；
 * 放行的代价只是「多试一次注定失败的请求」。前者更贵，所以探测自身不可靠时放行。
 *
 * 与 `retry.js` 的分工：本文件只做 IO 与时间等待（可被 fake），全部决策仍在 `retry.js`。
 */
import { networkInterfaces } from 'node:os';
import { lookup as dnsLookup } from 'node:dns';
/** 网络类失败码（只有这些值得等网回来；5xx / 429 是服务器信号，不是「连不上」）。 */
export const NETWORK_CLASS_CODES = Object.freeze(new Set([
    'TRANSPORT', 'TIMEOUT', 'DNS', 'CONNECTION',
    'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH',
]));
/** 这次失败是否属于「网络类」——决定它有没有资格进入断网挂起。
 * 只管 `TRANSPORT`/`TIMEOUT`/`DNS`/`CONNECTION`（及等价 errno）；带 HTTP 状态码的
 * 失败（5xx / 429 / 4xx）说明请求已经出去并拿到了回应，一律 false。 */
export function isNetworkClassFailure({ code, status } = {}) {
    if (typeof status === 'number' && status !== 408)
        return false;
    const key = typeof code === 'string' ? code.toUpperCase() : '';
    return NETWORK_CLASS_CODES.has(key);
}
/** 是否配置了代理：代理专用网络里 DNS 可能不直连，此时只查网卡。 */
function hasProxyEnv(env) {
    return Boolean(env && (env.HTTP_PROXY || env.HTTPS_PROXY || env.ALL_PROXY
        || env.http_proxy || env.https_proxy || env.all_proxy));
}
/** 有非回环网卡即视为「有本地链路」。 */
function hasRoutableInterface(interfaces) {
    const table = typeof interfaces === 'function' ? interfaces() : interfaces;
    if (!table || typeof table !== 'object')
        return true;
    for (const addrs of Object.values(table)) {
        for (const addr of addrs ?? []) {
            if (addr && addr.internal !== true && typeof addr.address === 'string' && addr.address !== '')
                return true;
        }
    }
    return false;
}
const PROBE_DNS_HOSTNAME = 'api.deepseek.com';
const PROBE_DNS_DEFAULT_MS = 2000;
/**
 * 探测本机是否有可用网络（零请求）：网卡 up + 一次 DNS 解析。
 * 任何异常 / 超时 → 返回 `true`（fail-open）。
 *
 * @param {{lookup?:Function, interfaces?:Function|object, timeoutMs?:number, env?:object}} [opts]
 * @returns {Promise<boolean>}
 */
export async function probeOnline(opts = {}) {
    const env = opts.env ?? (typeof process !== 'undefined' ? process.env : {});
    const timeoutMs = opts.timeoutMs ?? PROBE_DNS_DEFAULT_MS;
    try {
        if (!hasRoutableInterface(opts.interfaces ?? networkInterfaces))
            return false;
        // 代理环境下 DNS 常由代理侧解析，本地解析失败不代表离线 → 只查网卡。
        if (hasProxyEnv(env))
            return true;
        const lookup = opts.lookup ?? dnsLookup;
        if (typeof lookup !== 'function')
            return true;
        const verdict = await new Promise((resolve) => {
            let settled = false;
            const done = (value) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            };
            const timer = setTimeout(() => done(true), timeoutMs);
            try {
                const out = lookup(PROBE_DNS_HOSTNAME, { all: false }, (err) => done(!err));
                if (out && typeof out.then === 'function')
                    out.then((v) => done(Boolean(v)), () => done(true));
            }
            catch {
                done(true);
            }
        });
        return verdict === true;
    }
    catch {
        return true; // fail-open
    }
}
/**
 * 断网等待器：挂起期间只重探、不发请求、不动 consecutive。
 * `onHold` 只在首次进入时调一次（避免每个周期刷一条日志）。
 *
 * @param {{probe?:()=>Promise<boolean>, everyMs?:number, onHold?:()=>void, onResume?:()=>void}} deps
 * @returns {{wait:()=>Promise<string>, cancel:()=>void, isPending:()=>boolean, dispose:()=>void}}
 */
export function createOfflineWaiter({ probe, everyMs = 15000, onHold, onResume } = {}) {
    const isOnline = typeof probe === 'function' ? probe : () => probeOnline();
    const period = Number(everyMs) > 0 ? Number(everyMs) : 15000;
    let pending = null;
    function tick() {
        Promise.resolve()
            .then(() => isOnline())
            .catch(() => true)
            .then((online) => {
            if (!pending)
                return;
            if (online === true) {
                const wait = pending;
                pending = null;
                try {
                    onResume?.();
                }
                catch { /* 观测口不得影响主流程 */ }
                wait.resolve('online');
            }
            else {
                pending.timer = setTimeout(tick, period);
            }
        });
    }
    return {
        /** 进入挂起；返回 `'online'`（网回来）或 `'cancelled'`（被取消）。 */
        wait() {
            if (pending)
                return pending.promise;
            let resolve = null;
            const promise = new Promise((r) => {
                resolve = r;
            });
            pending = { resolve, promise, timer: null };
            try {
                onHold?.();
            }
            catch { /* 同上 */ }
            tick();
            return promise;
        },
        cancel() {
            if (!pending)
                return;
            const wait = pending;
            pending = null;
            clearTimeout(wait.timer);
            wait.resolve('cancelled');
        },
        isPending: () => pending !== null,
        dispose() {
            this.cancel();
        },
    };
}

/** host：会话门（dsh-task-control）是否可用。 */
export function detectTaskControl(ctx) {
    return !!(ctx && typeof ctx.get === 'function' && ctx.get('taskControl'));
}
/** host：sessionGuard 服务是否已提供（其他插件探测用）。 */
export function detectSessionGuard(ctx) {
    return !!(ctx && typeof ctx.get === 'function' && ctx.get('sessionGuard'));
}
/**
 * client：input-traffic 最小桥是否已注册。
 * @param g 显式传入全局对象（便于测试）；默认 globalThis
 */
export function detectInputTrafficBridge(g) {
    const root = (g ?? (typeof globalThis !== 'undefined' ? globalThis : {}));
    const bridge = root?.__DSH_SESSION_GUARD_BRIDGE__;
    return !!(bridge && typeof bridge.stopNextTurn === 'function');
}

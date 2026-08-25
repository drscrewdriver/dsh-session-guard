/**
 * dsh-session-guard — 自动检测（D7，诚实边界）。
 *
 * - host 可自动探测：`ctx.get('taskControl')`（会话门）、`ctx.get('sessionGuard')`。
 * - client 可自动探测：input-traffic 补的「最小桥」标记 `window.__DSH_SESSION_GUARD_BRIDGE__`
 *   （方案 A 中 input-traffic 冻结按钮触发时会调 sessionGuard.stopNextTurn）。
 *   探测不到 → 本插件客户端使用自带回退冻结（fallback），fail-open 不报错（D8）。
 */

/** host：会话门（dsh-task-control）是否可用。 */
export function detectTaskControl(ctx) {
  return !!(ctx && typeof ctx.get === 'function' && ctx.get('taskControl'))
}

/** host：sessionGuard 服务是否已提供（其他插件探测用）。 */
export function detectSessionGuard(ctx) {
  return !!(ctx && typeof ctx.get === 'function' && ctx.get('sessionGuard'))
}

/**
 * client：input-traffic 最小桥是否已注册。
 * @param {object} [g] 显式传入全局对象（便于测试）；默认 globalThis
 */
export function detectInputTrafficBridge(g) {
  const root = g || (typeof globalThis !== 'undefined' ? globalThis : {})
  return !!(root && root.__DSH_SESSION_GUARD_BRIDGE__ && typeof root.__DSH_SESSION_GUARD_BRIDGE__.stopNextTurn === 'function')
}

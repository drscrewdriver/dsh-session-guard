/**
 * dsh-session-guard — 自动检测（D7，诚实边界）。
 *
 * - host 可自动探测：`ctx.get('taskControl')`（会话门）、`ctx.get('sessionGuard')`。
 * - client 可自动探测：input-traffic 补的「最小桥」标记 `window.__DSH_SESSION_GUARD_BRIDGE__`
 *   （方案 A 中 input-traffic 冻结按钮触发时会调 sessionGuard.stopNextTurn）。
 *   探测不到 → 本插件客户端使用自带回退冻结（fallback），fail-open 不报错（D8）。
 */
import type { HostCtx } from './types/host.js'

/** host：会话门（dsh-task-control）是否可用。 */
export function detectTaskControl(ctx: HostCtx | undefined | null): boolean {
  return !!(ctx && typeof ctx.get === 'function' && ctx.get('taskControl'))
}

/** host：sessionGuard 服务是否已提供（其他插件探测用）。 */
export function detectSessionGuard(ctx: HostCtx | undefined | null): boolean {
  return !!(ctx && typeof ctx.get === 'function' && ctx.get('sessionGuard'))
}

/** input-traffic 桥的全局标记形状。 */
interface InputTrafficBridge {
  stopNextTurn?: (...args: unknown[]) => unknown
  [k: string]: unknown
}

/**
 * client：input-traffic 最小桥是否已注册。
 * @param g 显式传入全局对象（便于测试）；默认 globalThis
 */
export function detectInputTrafficBridge(g?: Record<string, unknown> | null): boolean {
  const root = (g ?? (typeof globalThis !== 'undefined' ? (globalThis as unknown as Record<string, unknown>) : {})) as
    | Record<string, unknown>
    | undefined
  const bridge = root?.__DSH_SESSION_GUARD_BRIDGE__ as InputTrafficBridge | undefined
  return !!(bridge && typeof bridge.stopNextTurn === 'function')
}

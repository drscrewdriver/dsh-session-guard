/**
 * dsh-session-guard — 浏览器 half。
 *
 * 职责（全部 fail-open，D8）：
 * - 在 composer 输入区右侧注册「畅跑」按钮与**纯展示**状态徽标（高峰/谷时/周末）；
 * - **不做**冻结/会话动作——冻结按钮由 input-traffic 接管并经 /session-guard/rpc
 *   桥接 host 会话门；本插件客户端不注册任何按钮，避免与 input-traffic 冲突。
 *
 * 兼容性注记（0.1.7 line）：`settingsScope` 客户端服务在 dsh 0.1.7 起不再提供，
 * 若把它写进静态 `inject`，客户端条目会永远 pending（waiting for service:
 * settingsScope）并让应用 **web boot 致命失败**。上游 compat/0.1.7 线因此整体去掉了
 * 设置卡片（`inject = ['slots','locale']`）。这里跟随同一条口径：设置面由
 * `config/session-guard.json` 承担，客户端不再依赖 settings 服务。
 *
 * 构建：tsdown → lib/client.js（__ModuleLoader__.load 注册，与 input-traffic 同构）。
 */
import { StatusBadge } from './status-badge'
import { FreeRunButton } from './free-run-button'

/** 客户端所需服务：slots（按钮 + 状态徽标）+ locale。 */
export const inject = ['slots', 'locale']

/** 轻量 ctx 类型（仅本客户端用到的方法；构建时类型被剥离）。 */
interface SlotsFace {
  inject: (_name: string, _fn: () => unknown) => () => void
  register: (_options: Record<string, unknown>, _component: unknown) => () => void
}
interface ClientCtx {
  slots: SlotsFace
}

export function apply(ctx: ClientCtx) {
  // 「畅跑」按钮（v0.3.0）：单会话限时无视峰谷 + 多任务管理弹层。
  // order 20 < input-traffic 冻结按钮的 30 → 排在左侧，两者并列互不取代（ADR-001/002）。
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'session-guard-free-run',
    order: 20,
    locale: 'session-guard',
  }, FreeRunButton))

  // 状态徽标：输入区右侧，纯展示。
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'session-guard-status',
    order: 40,
    locale: 'session-guard',
  }, StatusBadge))
}

/**
 * dsh-session-guard — 浏览器 half。
 *
 * 职责（全部 fail-open，D8）：
 * - 在 composer 输入区右侧注册一个**纯展示**状态徽标（高峰/谷时/周末），轮询
 *   /session-guard/status；
 * - 注册 `settings.plugin.item` 设置卡片，经 `settingsScope.bind({ namespace })`
 *   绑定 host 已注册的 `session-guard` 命名空间——这正是“插件配置”面板显示本
 *   插件的**必要**机制（对齐 dsh-thinking-levels / dsh-context）；
 * - **不做**冻结/会话动作——冻结按钮由 input-traffic 接管并经 /session-guard/rpc
 *   桥接 host 会话门；本插件客户端不注册任何按钮，避免与 input-traffic 冲突。
 *
 * 构建：tsdown → lib/client.js（__ModuleLoader__.load 注册，与 input-traffic 同构）。
 */
import { StatusBadge } from './status-badge'
import { SessionGuardCard } from './settings-card'

/** 客户端所需服务：slots（状态徽标 + 设置卡片）+ locale + settingsScope（设置卡片绑定）。 */
export const inject = ['slots', 'locale', 'settingsScope']

/** 轻量 ctx 类型（仅本客户端用到的方法；构建时类型被剥离）。 */
interface SlotsFace {
  inject: (_name: string, _fn: () => unknown) => () => void
  register: (_options: Record<string, unknown>, _component: unknown) => () => void
}
interface SettingsScopeFace {
  bind: (_spec: { namespace: string }) => unknown
}
interface ClientCtx {
  slots: SlotsFace
  settingsScope: SettingsScopeFace
}

/** host 侧 src/settings.js 注册的命名空间（保持一致）。 */
const NS = 'session-guard'

export function apply(ctx: ClientCtx) {
  // 状态徽标：输入区右侧，纯展示。
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'session-guard-status',
    order: 50,
    locale: 'session-guard',
  }, StatusBadge))

  // 插件配置卡片：绑定 session-guard 命名空间，经 settingsScope 渲染并提交。
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: NS,
    key: NS,
    locale: 'session-guard',
    inject: () => ({
      scope: ctx.settingsScope.bind({ namespace: NS }),
    }),
  }, SessionGuardCard))
}

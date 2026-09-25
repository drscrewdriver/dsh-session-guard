/**
 * dsh-session-guard — 浏览器 half。
 *
 * 职责（全部 fail-open，D8）：
 * - 在 composer 输入区右侧注册一个**纯展示**状态徽标（高峰/谷时/周末），轮询
 *   /session-guard/status；
 * - **不做**冻结/会话动作——冻结按钮由 input-traffic 接管并经 /session-guard/rpc
 *   桥接 host 会话门；本插件客户端不注册任何按钮，避免与 input-traffic 冲突。
 * - 0.1.7：旧的插件设置卡已随席位删除 —— 设置表单由 host
 *   侧 Config 的 `.volatile()` 字段自动生成。
 *
 * 构建：tsdown → lib/client.js（__ModuleLoader__.load 注册，与 input-traffic 同构）。
 */
import { StatusBadge } from './status-badge'
import { PauseButton } from './pause-button'
import { SessionGuardCard } from './settings-card'

// 起子插件族共用 tab（dsh-thinking-levels 注册并声明该子席位）；本插件只贡献
// 卡片，不注册任何设置席位。thinking-levels 缺席时 inject 静默等待（不阻塞
// 客户端半），设置卡缺席，其余功能不受影响。
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'dsh-family.tab': { kind: 'list'; scope: 'root' }
  }
}

/** 客户端所需服务：slots（状态徽标）+ locale + configForms（共用 tab 设置卡）。 */
export const inject = ['slots', 'locale', 'configForms']

/** 轻量 ctx 类型（仅本客户端用到的方法；构建时类型被剥离）。 */
interface SlotsFace {
  inject: (_name: string, _fn: () => unknown) => () => void
  register: (_options: Record<string, unknown>, _component: unknown) => () => void
}
interface ConfigFormsFace {
  get: <T>(_entryId: string) => import('./scope-face').SettingsScope<T>
}
interface ClientCtx {
  slots: SlotsFace
  configForms: ConfigFormsFace
}

export function apply(ctx: ClientCtx) {
  // 暂停会话按钮（v0.2.0）：step 级门控的状态显示 + 手动解除。
  // order 20 < input-traffic 冻结按钮的 30 → 排在左侧，两者并列互不取代（ADR-001/002）。
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'session-guard-pause',
    order: 20,
    locale: 'session-guard',
  }, PauseButton))

  // 状态徽标：输入区右侧，纯展示。
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'session-guard-status',
    order: 40,
    locale: 'session-guard',
  }, StatusBadge))

  // 插件族共用 tab 贡献卡：读写本插件 entry（`session-guard`）的 volatile 配置。
  ctx.slots.inject('dsh-family.tab', () => ctx.slots.register({
    name: 'dsh-family.tab',
    id: 'session-guard',
    order: 20,
    label: '会话守护门禁',
    locale: 'session-guard',
    inject: () => ({ scope: ctx.configForms.get<Record<string, unknown>>('session-guard') }),
  }, SessionGuardCard))
}

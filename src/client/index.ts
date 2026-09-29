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
import { GuardFamilySection, type FamilyTabEntry } from './family-section'

// 起子插件族共用设置节：宿主 dsh-thinking-levels 注册顶级 `settings.section`
// （id `dsh-family`）并声明 `dsh-family.tab` 子席位，本插件贡献卡片。宿主缺席
// 时本插件按下载量排名接管该节（见 apply 内的选举逻辑），节名仍为
// 「起子插件设置」；宿主在场时本插件只贡献卡片。
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'dsh-family.tab': { kind: 'list'; scope: 'root' }
  }
}

/** 家族节固定 id（与 thinking-levels 的注册严格一致）。 */
const FAMILY_SECTION_ID = 'dsh-family'
/** 家族子席位 key（与 thinking-levels 的声明严格一致）。 */
const FAMILY_CHILD_KEY = 'dsh-family.tab'
/**
 * 接管宽限期：等宿主（以及排名更前的贡献方）先落座。下载量排名 guard(1522)
 * 高于 session-steward(1090) → guard 宽限期更短、先尝试接管；并发冲突由
 * ui-slots 的「同 id 同 priority 重复注册抛错」仲裁，后到者放弃即可。
 */
const FAMILY_HOST_GRACE_MS = 2000

/** 客户端所需服务：slots（状态徽标）+ locale + configForms（共用 tab 设置卡）。 */
export const inject = ['slots', 'locale', 'configForms']

/** 轻量 ctx 类型（仅本客户端用到的方法；构建时类型被剥离）。 */
interface SlotsFace {
  inject: (_name: string, _fn: () => unknown) => () => void
  register: (_options: Record<string, unknown>, _component: unknown) => () => void
  entries: (_name: string) => Array<{ options: { id?: string; order?: number; label?: unknown } }>
  getVersion: (_name: string) => number
  subscribe: (_name: string, _listener: () => void) => () => void
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

  // 家族节宿主选举：宿主 dsh-thinking-levels 缺席时顶上「起子插件设置」节。
  // 宽限期后若 `settings.section` 里没有 id `dsh-family` 的条目，则按同一 id
  // 接管（声明同一个 dsh-family.tab 子席位，节内通用渲染全部贡献卡）。与
  // session-steward 的并发竞争由 ui-slots 同 id 重复注册抛错仲裁，先到者胜。
  // 节内各卡（含本插件自己的贡献卡）经子席位 renderSlot 渲染，抽屉默认展开。
  setTimeout(() => {
    if (ctx.slots.entries('settings.section').some(e => e.options.id === FAMILY_SECTION_ID)) return
    try {
      ctx.slots.register({
        name: 'settings.section',
        id: FAMILY_SECTION_ID,
        order: 40,
        label: () => '起子插件设置',
        inject: () => makeGuardFamilyTabsHooks(ctx.slots),
        children: { [FAMILY_CHILD_KEY]: { kind: 'list', scope: 'root' } },
      }, GuardFamilySection)
    } catch {
      // 并发接管竞争落败（或设置壳未声明席位）：胜出方的节服务整个家族。
    }
  }, FAMILY_HOST_GRACE_MS)
}

/** 接管节的账本投影 hooks（与 thinking-levels 的 FamilySectionInjected 同形）。 */
function makeGuardFamilyTabsHooks(slots: SlotsFace): {
  getSnapshot: () => readonly FamilyTabEntry[]
  subscribe: (listener: () => void) => () => void
} {
  let version = -1
  let tabs: readonly FamilyTabEntry[] = []
  return {
    getSnapshot: () => {
      const next = slots.getVersion(FAMILY_CHILD_KEY)
      if (next !== version) {
        version = next
        tabs = slots.entries(FAMILY_CHILD_KEY)
          .map(entry => ({
            id: entry.options.id ?? '',
            order: entry.options.order ?? 0,
            label: typeof entry.options.label === 'function'
              ? (() => { try { return String((entry.options.label as () => unknown)() ?? entry.options.id ?? '') } catch { return String(entry.options.id ?? '') } })()
              : String(entry.options.label ?? entry.options.id ?? ''),
          }))
          .sort((a, b) => a.order - b.order)
      }
      return tabs
    },
    subscribe: (listener: () => void) => slots.subscribe(FAMILY_CHILD_KEY, listener),
  }
}

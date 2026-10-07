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
 * - 跨版本（universal-rc）：持久设置经 configForms(0.1.7+)/settingsScope(≤0.1.5)
 *   双代腰产出同形 scope；无设置页宿主（0.1.0/0.1.1）经 shell.overlay 浮窗
 *   齿轮提供配置入口（配置存储全在 host 侧，浮层与宿主设置页解耦）。
 *
 * 构建：tsdown → lib/client.js（__ModuleLoader__.load 注册，与 input-traffic 同构）。
 */
import { createElement } from 'react'
import type { JSX } from 'react'
import { StatusBadge } from './status-badge'
import { PauseButton } from './pause-button'
import { SessionGuardCard } from './settings-card'
import { ShellSettingsEntry } from './shell-overlay'
import { GuardFamilySection, type FamilyTabEntry } from './family-section'
import type { SessionGuardConfig } from './settings-card'
import type { SettingsScope } from './scope-face'

// 起子插件族共用设置节：宿主 dsh-thinking-levels 注册顶级 `settings.section`
// （id `dsh-family`）并声明 `dsh-family.tab` 子席位，本插件贡献卡片。宿主缺席
// 时本插件按下载量排名接管该节（见 apply 内的选举逻辑），节名仍为
// 「起子插件设置」；宿主在场时本插件只贡献卡片。
// 类型导入（构建时擦除，bundle 无 value-import 平台包）：让下方 `declare
// module` 增补能解析到 @deepseek-ai/dsh-client-ui-slots 的 SlotMap。
import type {} from '@deepseek-ai/dsh-client-ui-slots'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'dsh-family.tab': { kind: 'list'; scope: 'root' }
    /**
     * 插件页配置卡（官方 ui-plugin-manager 契约，key = 包名）：DSH 0.2.0 的
     * Plugins 页不自动渲染 volatile 配置表单，bundle 详情页只渲染注册在本
     * keyed 席位下的卡片；owner props 由页面给（`{ view: 'page', form }`），
     * 本卡片改经 inject 工厂拿自己的 scope（与 dsh-family.tab 注册同源）。
     */
    'plugins.bundle.config': { kind: 'keyed'; scope: 'root'; owner: Record<string, unknown> }
    /** 无设置页宿主（0.1.0/0.1.1）的兜底配置入口（壳级 overlay）。 */
    'shell.overlay': { kind: 'list'; scope: 'root' }
  }
}

/** 家族节固定 id（与 thinking-levels 的注册严格一致）。 */
const FAMILY_SECTION_ID = 'dsh-family'
/** 家族子席位 key（与 thinking-levels 的声明严格一致）。 */
const FAMILY_CHILD_KEY = 'dsh-family.tab'

/**
 * 客户端所需服务：slots（状态徽标）+ locale。持久设置走双代腰
 * （registerSettingsFaces）：configForms 为 0.1.7+ 独有，顶层注入会在
 * 0.1.0/0.1.1（无此服务）上让整段 apply 静默死。
 */
export const inject = ['slots', 'locale']

/** 轻量 ctx 类型（仅本客户端用到的方法；构建时类型被剥离）。 */
interface SlotsFace {
  inject: (_name: string, _fn: () => unknown) => () => void
  register: (_options: Record<string, unknown>, _component: unknown) => () => void
  entries: (_name: string) => Array<{
    options: { id?: string; order?: number; label?: unknown }
    component?: unknown
    inject?: () => unknown
  }>
  getVersion: (_name: string) => number
  subscribe: (_name: string, _listener: () => void) => () => void
}
interface ConfigFormsFactoryFace {
  get: <T>(_entryId: string) => SettingsScope<T>
}
interface SettingsScopeFactoryFace {
  bind: <T>(_opts: { namespace: string }) => SettingsScope<T>
}
interface ClientCtx {
  slots: SlotsFace
  inject: (
    _names: string[],
    _fn: (sctx: { configForms?: ConfigFormsFactoryFace; settingsScope?: SettingsScopeFactoryFace }) => void,
  ) => void
}

/** 单面注册护栏：某条宿主线上未知槽名/缺服务的同步异常不得带走其它面。 */
function safe(tag: string, fn: () => void): void {
  try {
    fn()
  } catch (error) {
    console.warn(`dsh-session-guard: client surface '${tag}' failed:`, error)
  }
}

/**
 * 双代持久设置腰（移植 input-traffic registerSettingsFaces）：两个 scoped
 * 子注入各自产出同形 scope 后回调；0.2.0 两代并存时以 configForms 先到为准
 * （mounted 位防双挂载，ui-slots 同 id 仲裁兜底）。
 */
function registerSettingsFaces(
  ctx: ClientCtx,
  onScope: (scope: SettingsScope<SessionGuardConfig>, generation: 'configForms' | 'settingsScope') => void,
): void {
  let mounted = false
  ctx.inject(['configForms'], (sctx) => {
    if (mounted) return
    mounted = true
    onScope(sctx.configForms!.get<SessionGuardConfig>('session-guard'), 'configForms')
  })
  ctx.inject(['settingsScope'], (sctx) => {
    if (mounted) return
    mounted = true
    onScope(sctx.settingsScope!.bind<SessionGuardConfig>({ namespace: 'session-guard' }), 'settingsScope')
  })
}

/** 两张配置卡（family tab + bundle 详情页）挂载；scope 由双代腰产出。 */
function mountConfigCards(ctx: ClientCtx, scope: SettingsScope<SessionGuardConfig>): void {
  // 插件族共用 tab 贡献卡：读写本插件 entry（`session-guard`）的持久配置。
  ctx.slots.inject('dsh-family.tab', () => ctx.slots.register({
    name: 'dsh-family.tab',
    id: 'session-guard',
    order: 20,
    label: '会话守护门禁',
    locale: 'session-guard',
    inject: () => ({ scope }),
  }, SessionGuardCard))

  // 插件页配置卡（DSH 0.2.0）：Plugins 页不自动渲染 volatile 配置表单，须注册
  // `plugins.bundle.config` 席位（key = 包名），配置卡才渲染在 bundle 详情页。
  // 卡片组件与 props（scope）与上方 dsh-family.tab 注册完全同源。
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: 'dsh-session-guard',
    inject: () => ({ scope }),
  }, SessionGuardCard))
}

export function apply(ctx: ClientCtx) {
  // 暂停会话按钮（v0.2.0）：step 级门控的状态显示 + 手动解除。
  // order 20 < input-traffic 冻结按钮的 30 → 排在左侧，两者并列互不取代（ADR-001/002）。
  safe('conversation.input.right/pause', () => ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'session-guard-pause',
    order: 20,
    locale: 'session-guard',
  }, PauseButton)))

  // 状态徽标：输入区右侧，纯展示。
  safe('conversation.input.right/status', () => ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'session-guard-status',
    order: 40,
    locale: 'session-guard',
  }, StatusBadge)))

  // 双代腰：scope 就绪后按代挂载（每条宿主线恰好一代服务）。
  registerSettingsFaces(ctx, (scope, generation) => {
    safe(`config-cards/${generation}`, () => {
      // 两代共有：family tab（0.1.7+ 由 thinking-levels 容器渲染）与
      // bundle 详情页平铺卡（0.1.7+ 的 plugin-manager 槽）。
      mountConfigCards(ctx, scope)
      // 老设置页(≤0.1.5)插件列表配置卡;0.1.7+ 无此槽,注册静默闲置。
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        id: 'session-guard',
        key: 'session-guard',
        order: 60,
        locale: 'session-guard',
        inject: () => ({ scope }),
      }, SessionGuardCard))
    })
    // 无设置页宿主（0.1.0/0.1.1）的兜底配置入口：壳级 overlay 浮窗齿轮。
    safe('shell.overlay', () => ctx.slots.inject('shell.overlay', () => ctx.slots.register(
      { name: 'shell.overlay', id: 'session-guard-settings' },
      () => ShellSettingsEntry({ scope }),
    )))
  })

  // 家族节接管（2026-10 对齐 TL route A + bindInjectHooks 实证）：遮蔽位选举
  // —— TL（默认 priority 0）在场时恒为头位（lowest renders），本插件 p10 恒
  // 为阴影位；TL 缺席时 p10 即头位。不查账本、不靠同 id 抛错仲裁，注册先后
  // 无关紧要。子席位声明带冲突兜底：TL 先到已声明 → 去掉 children 重试（阴影
  // 位本就不需要声明）；同 p10 竞争者 → 双双抛错，放弃。inject 必须走
  // ctx.slots.inject 包装管道（裸 register 的 entry.inject 在 ≤0.1.5 壳上不解，
  // 4.1.5 的接管节体因此从未渲染成功过——「半补位」的真相）。
  safe('family-section-election', () => {
    console.log('[dsh-session-guard] election: registering settings.section inject (apply-time)')
    // inject 必须 apply 期注册——slots 核只在「声明事件」触发工厂，宽限期后
    // 注册的 inject 等不到下一次声明，接管永远不落座（0.1.0 实机日志定案：
    // 4.1.7/4.1.8 的 grace 后注册工厂零执行）。选举用同 id 异 priority 遮蔽：
    // TL（默认 p0）在场恒头位，本插件 p10 恒阴影，TL 缺席时 p10 即头位，
    // 注册先后无关紧要。子席位声明带冲突兜底：TL 先声明 → 去 children 重试
    // （阴影位不需要声明）；同 p10 竞争 → 双抛，放弃。
    ctx.slots.inject('settings.section', () => {
      console.log('[dsh-session-guard] election: factory fired (settings.section declared)')
      const base = {
        name: 'settings.section',
        id: FAMILY_SECTION_ID,
        order: 40,
        priority: 10,
        label: () => '起子插件设置',
        inject: () => ({
          hooks: makeGuardFamilyTabsHooks(ctx.slots),
          renderContributor,
        }),
      }
      try {
        ctx.slots.register({
          ...base,
          children: { [FAMILY_CHILD_KEY]: { kind: 'list', scope: 'root' } },
        }, GuardFamilySection)
        console.log('[dsh-session-guard] family takeover registered (p10, children declared)')
      } catch (error) {
        console.log(`[dsh-session-guard] children decl conflict (${error instanceof Error ? error.message : error}); registering shadow without children`)
        try {
          ctx.slots.register(base, GuardFamilySection)
          console.log('[dsh-session-guard] family takeover registered as shadow (no children)')
        } catch (secondary) {
          console.log(`[dsh-session-guard] family takeover abandoned: ${secondary instanceof Error ? secondary.message : secondary}`)
        }
      }
    })
  })
}

/** 直接挂载面（≤0.1.5 壳无 renderSlot 的降级）：从账本原始条目现挂激活卡。
 * entries 每代都带 component + inject（ui-slots SlotCore.entries 原始记录）；
 * 任何失败（条目消失/抛错 inject）降级为 null，不炸接管节。 */
function renderContributor(id: string): JSX.Element | null {
  try {
    const entry = ctx.slots.entries(FAMILY_CHILD_KEY).find(e => e.options.id === id)
    if (entry === undefined || typeof entry.component !== 'function') return null
    const injected = typeof entry.inject === 'function' ? entry.inject() : undefined
    return createElement(
      entry.component as (props: Record<string, unknown>) => JSX.Element | null,
      (injected ?? {}) as Record<string, unknown>,
    )
  } catch {
    return null
  }
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

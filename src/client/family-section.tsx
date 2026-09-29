/**
 * dsh-session-guard — 家族节接管组件（fallback host section）。
 *
 * 仅当宿主 dsh-thinking-levels 缺席、且本插件在接管选举中胜出时，由
 * index.ts 注册为顶级 `settings.section`（id 固定 `dsh-family`，节名仍为
 * 「起子插件设置」）。组件是纯通用渲染：把 `dsh-family.tab` 账本里的每张
 * 贡献卡（含本插件自己的，因为接管时本插件也声明了该子席位）按 order
 * 依次 renderSlot —— 卡片本身是默认展开的抽屉，整节即一页抽屉。
 *
 * 与 thinking-levels 的 FamilySettingsSection 的差别仅在不需要 thinking-
 * levels 自己的卡（宿主不在了，它的卡也不在）：渲染循环没有 own-tab 特例。
 */
import { useSyncExternalStore } from 'react'
import type { JSX } from 'react'

/** 与 FamilySectionInjected.hooks.tabs 同形的账本投影（结构化镜像）。 */
type HostObservable<T> = {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** 账本条目（id/order/label，label 已解析为字符串）。 */
export interface FamilyTabEntry {
  id: string
  order: number
  label: string
}

/** 组件 props：框架注入的子席位 dispatcher + 注册侧 inject 返回的 hooks。 */
export interface GuardFamilySectionProps {
  renderSlot: (key: 'dsh-family.tab', owner?: object, opts?: { only?: string; fallback?: JSX.Element | null }) => JSX.Element | null
  hooks: { tabs: HostObservable<readonly FamilyTabEntry[]> }
}

export function GuardFamilySection(props: GuardFamilySectionProps): JSX.Element {
  const tabs = useSyncExternalStore(props.hooks.tabs.subscribe, props.hooks.tabs.getSnapshot)
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      {tabs.map(row => (
        <div key={row.id}>
          {props.renderSlot('dsh-family.tab', {}, { only: row.id, fallback: null })}
        </div>
      ))}
    </div>
  )
}

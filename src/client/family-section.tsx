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
import { useEffect, useState } from 'react'
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

/** 组件 props：hooks 舱（宿主 bindInjectHooks 把 inject 面的 `hooks` 键剥掉
 * 转成 `useTabs`——0.1.0 起各代皆然，故 useTabs 是正路、raw hooks 只是
 * 无转换环境的兜底）+ ≤0.1.5 壳缺 renderSlot 时的直接挂载面。 */
export interface GuardFamilySectionProps {
  renderSlot?: (key: 'dsh-family.tab', owner?: object, opts?: { only?: string; fallback?: JSX.Element | null }) => JSX.Element | null
  /** 宿主转换后的 hooks 舱（`inject.hooks.tabs` → `useTabs`）。 */
  useTabs?: <S>(selector: (value: readonly FamilyTabEntry[]) => S) => S
  /** 未被宿主转换时的原始账本投影（防御位，实测各代都会转换走 useTabs）。 */
  hooks?: { tabs: HostObservable<readonly FamilyTabEntry[]> }
  /** 直接挂载面（≤0.1.5 壳无 renderSlot 时）：注册侧从账本原始条目
   * （entries 自带 component + inject）现挂激活卡。失败一律 null。 */
  renderContributor?: (id: string) => JSX.Element | null
}

const NO_TABS: readonly FamilyTabEntry[] = []

export function GuardFamilySection(props: GuardFamilySectionProps): JSX.Element {
  const raw = props.hooks?.tabs
  // 账本读取：useTabs 舱优先；raw 投影走 React 订阅。face 选择每代固定，
  // 两种路径的 hook 数不同但同实例内次序恒定。
  const [polled, setPolled] = useState<readonly FamilyTabEntry[]>(() => raw?.getSnapshot() ?? NO_TABS)
  useEffect(() => {
    if (props.useTabs !== undefined || raw === undefined) return
    return raw.subscribe(() => setPolled(raw.getSnapshot()))
  })
  const tabs = props.useTabs !== undefined ? props.useTabs(value => value) : polled
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      {tabs.map(row => (
        <div key={row.id}>
          {props.renderSlot
            ? props.renderSlot('dsh-family.tab', {}, { only: row.id, fallback: null })
            : props.renderContributor?.(row.id) ?? null}
        </div>
      ))}
    </div>
  )
}

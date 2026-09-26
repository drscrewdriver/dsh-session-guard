/**
 * dsh-session-guard — 「畅跑」按钮文案与状态投影（纯函数，零依赖，可单测）。
 *
 * 交互（用户定案）：**点击按钮一律打开任务管理面板**，面板里可以新建 / 暂停 /
 * 删除畅跑任务。因此按钮文案是**固定**的「畅跑」（任务数 >1 时带 `×N`），
 * 不再用文案表示生效状态——生效状态由按钮高亮色 + 悬浮提示表达，
 * 每段的「暂停 / 恢复」在面板里逐行操作。
 *
 * 这样也解决了上一版的死角：旧版「畅跑中」点击是直接暂停，导致面板在生效期间
 * 不可达；现在点击永远是打开面板。
 *
 * 本文件只有字符串与状态投影逻辑，不含 React；组件在 free-run-button.tsx。
 */

/** 与主机 `FREE_RUN_STATES` 对齐。 */
export type FreeRunStateName = 'none' | 'scheduled' | 'active' | 'suspended' | 'expired'

/** 单段状态（含每段暂停）。 */
export type FreeRunWindowStatus = 'scheduled' | 'active' | 'paused' | 'ended'

/** 单个畅跑时段（`/session-guard/state` 的 `freeRun.windows[]` 形状）。 */
export interface FreeRunWindow {
  id: string
  from: string
  to: string
  fromInput: string
  toInput: string
  fromDisplay: string
  toDisplay: string
  paused: boolean
  status: FreeRunWindowStatus
}

/** `/session-guard/state` 的 `freeRun` 字段。 */
export interface FreeRunView {
  state: FreeRunStateName
  /** 当前是否有未暂停的时段正在生效（按钮高亮用）。 */
  active: boolean
  available: boolean
  timezone: string
  windows: FreeRunWindow[]
  activeId: string | null
  msRemaining: number | null
  nextStartMs: number | null
  nextStartDisplay: string | null
}

/** 空视图（请求失败 / 未加载时的安全默认）。 */
export const EMPTY_FREE_RUN: FreeRunView = {
  state: 'none',
  active: false,
  available: false,
  timezone: '',
  windows: [],
  activeId: null,
  msRemaining: null,
  nextStartMs: null,
  nextStartDisplay: null,
}

/** 按钮文案：固定「畅跑」，多段时带计数。 */
export function freeRunLabel(view: FreeRunView | null | undefined): string {
  const count = view?.windows?.length ?? 0
  return count > 1 ? `畅跑 ×${count}` : '畅跑'
}

/** 悬浮提示：当前是否生效 + 逐条排期（多任务的重要信息出口）。 */
export function freeRunTitle(view: FreeRunView | null | undefined): string {
  const tz = view?.timezone !== undefined && view.timezone !== '' ? view.timezone : '本地时区'
  const lines: string[] = ['点击打开畅跑任务管理']
  if (view?.active === true) {
    const left = remainingText(view?.msRemaining ?? null)
    lines.unshift(left === null ? '畅跑生效中' : `畅跑生效中（剩 ${left}）`)
  } else if ((view?.windows?.length ?? 0) > 0) {
    const next = view?.nextStartDisplay ?? null
    lines.unshift(next === null ? '畅跑未生效' : `畅跑未生效，下一段 ${next}`)
  }
  const windows = view?.windows ?? []
  if (windows.length > 0) {
    lines.push('—— 畅跑任务 ——')
    for (const w of windows) {
      lines.push(`${w.fromDisplay} – ${w.toDisplay}  ${statusLabel(w.status)}`)
    }
  } else {
    lines.push(`还没有畅跑任务（时间按 ${tz}）`)
  }
  return lines.join('\n')
}

/** 单段状态标签。 */
export function statusLabel(status: FreeRunWindowStatus): string {
  if (status === 'active') return '进行中'
  if (status === 'paused') return '已暂停'
  if (status === 'scheduled') return '待开始'
  return '已结束'
}

/** 该行是否显示「暂停」图标（已结束的段无从暂停）。 */
export function canPause(w: FreeRunWindow): boolean {
  return w.status !== 'ended' && w.paused !== true
}

/** 该行是否显示「恢复」图标。 */
export function canResume(w: FreeRunWindow): boolean {
  return w.status !== 'ended' && w.paused === true
}

/** 未结束（可操作）的任务。 */
export function liveWindows(view: FreeRunView | null | undefined): FreeRunWindow[] {
  return (view?.windows ?? []).filter((w) => w.status !== 'ended')
}

/** 是否所有未结束的任务都已被暂停（决定顶部按钮显示「暂停全部任务」还是「恢复全部任务」）。 */
export function allTasksPaused(view: FreeRunView | null | undefined): boolean {
  const live = liveWindows(view)
  return live.length > 0 && live.every((w) => w.paused === true)
}

/** 顶部第二个文本按钮的文案。 */
export function pauseAllLabel(view: FreeRunView | null | undefined): string {
  return allTasksPaused(view) ? '恢复全部任务' : '暂停全部任务'
}

/** 顶部三个文本按钮是否可用（没有任务时后两个禁用）。 */
export function toolbarDisabled(view: FreeRunView | null | undefined): boolean {
  return liveWindows(view).length === 0
}

/**
 * 图标字形。带 `\uFE0E`（text presentation）强制按文字渲染，
 * 避免 `⏸` 在部分平台被渲染成彩色 emoji。零图标库依赖。
 */
export const ICON_PAUSE = '⏸\uFE0E'
export const ICON_RESUME = '▶\uFE0E'
export const ICON_DELETE = '×'

/** 每行暂停 / 恢复图标按钮的悬浮提示。 */
export function rowPauseTitle(w: FreeRunWindow): string {
  return w.paused === true ? '恢复这一段畅跑' : '暂停这一段畅跑（其他段不受影响）'
}

/** 每行删除图标按钮的悬浮提示。 */
export function rowDeleteTitle(): string {
  return '删除这一段畅跑'
}

/** 剩余时长文案（中文，粗粒度）。 */
export function remainingText(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return null
  const totalMinutes = Math.ceil(ms / 60_000)
  if (totalMinutes < 60) return `${totalMinutes} 分钟`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours} 小时` : `${hours} 小时 ${minutes} 分`
}

/** 从 `/session-guard/state` 响应体里取出 `freeRun`（形状异常 → 安全空视图）。 */
export function readFreeRun(body: unknown): FreeRunView {
  const b = (body ?? {}) as { ok?: unknown; freeRun?: unknown }
  if (b.ok !== true) return EMPTY_FREE_RUN
  const f = b.freeRun
  if (f === null || typeof f !== 'object') return EMPTY_FREE_RUN
  const raw = f as Partial<FreeRunView>
  const windows = Array.isArray(raw.windows)
    ? (raw.windows.filter((w) => w !== null && typeof w === 'object') as FreeRunWindow[])
    : []
  return {
    state: typeof raw.state === 'string' ? (raw.state as FreeRunStateName) : 'none',
    active: raw.active === true,
    available: raw.available === true,
    timezone: typeof raw.timezone === 'string' ? raw.timezone : '',
    windows,
    activeId: typeof raw.activeId === 'string' ? raw.activeId : null,
    msRemaining: typeof raw.msRemaining === 'number' ? raw.msRemaining : null,
    nextStartMs: typeof raw.nextStartMs === 'number' ? raw.nextStartMs : null,
    nextStartDisplay: typeof raw.nextStartDisplay === 'string' ? raw.nextStartDisplay : null,
  }
}

/**
 * dsh-session-guard — 状态徽标文案（纯函数，零依赖，可单测）。
 *
 * 分离出来的原因：徽标语义（高峰期「只拦官方」vs「全部暂停」）需要单测，
 * 而组件文件是 TSX（含 React 运行时）。这里只有字符串逻辑。
 */

/** /session-guard/status 返回的全局阶段（组件与测试共用）。 */
export interface Status {
  phase: 'peak' | 'off-peak' | 'weekend'
  enabled: boolean
  weekendMode: boolean
  /** 官方源二维判定是否开启（开启时高峰期只拦官方源）。 */
  providerGuard?: boolean
  /** 当前被挂起的请求数（hold 模式）。 */
  held?: number
  /** error 模式记下的延后会话数。 */
  deferred?: number
  /** 当前被 step 门挂起的会话数（v0.2.0）。 */
  stepHeld?: number
  timezone: string
}

/** 阶段文案。 */
export const PHASE_LABELS = {
  peak: '高峰',
  'off-peak': '谷时',
  weekend: '周末',
} as const

/** 高峰期的徽标文案：二维判定开启时区分「只拦官方」与「全部暂停」。 */
export function peakLabel(status: Pick<Status, 'phase' | 'providerGuard'>): string {
  if (status.phase !== 'peak') return PHASE_LABELS[status.phase]
  return status.providerGuard === true ? '高峰·拦官方' : '高峰·全部暂停'
}

/**
 * 徽标的 CSS 类：**每个阶段都是同一个按钮**（`sg-status sg-status-btn` + 配色变体）。
 *
 * 这条不变量要钉住：高峰（拦截）与谷时/周末（放行）**只有文案与颜色变**，交互形态一致 ——
 * 都是可点击按钮，点开同一个「高峰拦截列表」面板，绝不因为不是高峰就退化成不可点的展示元素。
 */
export function badgeClassNames(status: Pick<Status, 'phase'>): string {
  const variant = status.phase === 'peak' ? 'sg-peak' : status.phase === 'weekend' ? 'sg-weekend' : 'sg-off'
  return `sg-status sg-status-btn ${variant}`
}

/** 悬浮说明：把判定口径与当前挂起/延后数量写清楚。 */
export function badgeTitle(status: Status): string {
  const base = `${PHASE_LABELS[status.phase]} · ${status.timezone}${status.weekendMode ? ' · 周末模式' : ''}`
  if (status.phase !== 'peak') return base
  const mode = status.providerGuard === true ? '仅拦截 DeepSeek 官方源' : '全部会话暂停（未启用二维判定）'
  const held = status.held ?? 0
  const deferred = status.deferred ?? 0
  const stepHeld = status.stepHeld ?? 0
  const extra = held > 0 || deferred > 0 || stepHeld > 0
    ? ` · 挂起 ${held} · 延后 ${deferred} · step 挂起 ${stepHeld}`
    : ''
  return `${base} · ${mode}${extra}`
}

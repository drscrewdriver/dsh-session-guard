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

/** 悬浮说明：把判定口径与当前挂起/延后数量写清楚。 */
export function badgeTitle(status: Status): string {
  const base = `${PHASE_LABELS[status.phase]} · ${status.timezone}${status.weekendMode ? ' · 周末模式' : ''}`
  if (status.phase !== 'peak') return base
  const mode = status.providerGuard === true ? '仅拦截 DeepSeek 官方源' : '全部会话暂停（未启用二维判定）'
  const held = status.held ?? 0
  const deferred = status.deferred ?? 0
  const extra = held > 0 || deferred > 0 ? ` · 挂起 ${held} · 延后 ${deferred}` : ''
  return `${base} · ${mode}${extra}`
}

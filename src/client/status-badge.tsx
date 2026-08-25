/**
 * dsh-session-guard — 状态徽标（纯展示，fail-open）。
 *
 * 轮询 host 的 /session-guard/status（全局当前阶段），显示 高峰/谷时/周末。
 * 仅展示，不做任何队列/会话动作；冻结按钮由 input-traffic 经桥接管（D6/D8）。
 */
import { useEffect, useState } from 'react'

/** slot 运行时注入的会话级 props（sessionId 由 dsh 的 SessionStandardProps 提供）。 */
export interface StatusBadgeProps {
  sessionId?: string
}

/** /session-guard/status 返回的全局阶段。 */
export interface Status {
  phase: 'peak' | 'off-peak' | 'weekend'
  enabled: boolean
  weekendMode: boolean
  timezone: string
}

const LABELS = {
  peak: '高峰',
  'off-peak': '谷时',
  weekend: '周末',
} as const

const POLL_MS = 15_000

/** 状态徽标：轮询全局阶段，显示 高峰/谷时/周末（enabled 关闭或请求失败时静默隐藏）。 */
export function StatusBadge({ sessionId }: StatusBadgeProps) {
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch('/session-guard/status')
        const body = await res.json().catch(() => null)
        if (!cancelled && body?.ok && body.status) setStatus(body.status)
      } catch {
        // fail-open：路由/网络不可达 → 静默，徽标隐藏。
      }
    }
    void poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [sessionId])

  if (!status || !status.enabled) return null

  const cls = status.phase === 'peak' ? 'sg-peak' : status.phase === 'weekend' ? 'sg-weekend' : 'sg-off'
  return (
    <span
      className={`sg-status ${cls}`}
      title={`${LABELS[status.phase]} · ${status.timezone}${status.weekendMode ? ' · 周末模式' : ''}`}
      data-sg-phase={status.phase}
    >
      {LABELS[status.phase]}
    </span>
  )
}

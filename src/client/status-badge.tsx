/**
 * dsh-session-guard — 状态徽标（纯展示，fail-open）。
 *
 * 轮询 host 的 /session-guard/status（全局当前阶段），显示 高峰/谷时/周末；
 * 高峰期按二维判定区分「只拦官方」与「全部暂停」（文案见 badge-text.ts）。
 * 仅展示，不做任何队列/会话动作；冻结按钮由 input-traffic 经桥接管（D6/D8）。
 */
import { useEffect, useState } from 'react'
import { badgeTitle, peakLabel, type Status } from './badge-text'
import { injectClientCss } from './styles'

/** slot 运行时注入的会话级 props（sessionId 由 dsh 的 SessionStandardProps 提供）。 */
export interface StatusBadgeProps {
  sessionId?: string
}

const POLL_MS = 15_000

/** 状态徽标：轮询全局阶段，显示 高峰/谷时/周末（enabled 关闭或请求失败时静默隐藏）。 */
export function StatusBadge({ sessionId }: StatusBadgeProps) {
  const [status, setStatus] = useState<Status | null>(null)

  injectClientCss()

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
      title={badgeTitle(status)}
      data-sg-phase={status.phase}
      data-sg-provider-guard={status.providerGuard === true ? 'on' : 'off'}
      data-sg-step-held={String(status.stepHeld ?? 0)}
    >
      {peakLabel(status)}
    </span>
  )
}

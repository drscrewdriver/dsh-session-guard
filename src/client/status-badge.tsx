/**
 * dsh-session-guard — 状态徽标（**徽标即按钮**，fail-open）。
 *
 * 轮询 host 的 /session-guard/status（全局当前阶段），显示 高峰/谷时/周末；
 * 高峰期按二维判定区分「只拦官方」与「全部暂停」（文案见 badge-text.ts）；
 * 颜色即语义：拦截态红、放行态绿。
 *
 * **每个阶段都是同一个按钮**（类名见 `badgeClassNames`）：高峰与谷时/周末只有文案与颜色变，
 * 点开都是同一个「高峰拦截列表」面板 —— 不因阶段不同退化成不可点的展示元素。
 * 本线（0.1.7）客户端没有 settingsScope，所以面板**只读**（列出模型与当前拦截状态，
 * 改列表走 config/session-guard.json 或设置表单）。
 * 不做任何队列/会话动作；冻结按钮由 input-traffic 经桥接管（D6/D8）。
 */
import { useEffect, useState } from 'react'
import { badgeClassNames, badgeTitle, peakLabel, type Status } from './badge-text'
import { ModelListPanel } from './model-panel'
import { injectClientCss } from './styles'

/** slot 运行时注入的会话级 props（sessionId 由 dsh 的 SessionStandardProps 提供）。 */
export interface StatusBadgeProps {
  sessionId?: string
}

const POLL_MS = 15_000

/** 状态徽标：轮询全局阶段，显示 高峰/谷时/周末（enabled 关闭或请求失败时静默隐藏）。 */
export function StatusBadge({ sessionId }: StatusBadgeProps) {
  const [status, setStatus] = useState<Status | null>(null)
  const [open, setOpen] = useState(false)

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

  return (
    <div className="sg-status-root">
      <button
        type="button"
        className={badgeClassNames(status)}
        title={`${badgeTitle(status)} — 点击展开/收起「高峰拦截列表」`}
        aria-expanded={open}
        data-sg-phase={status.phase}
        data-sg-provider-guard={status.providerGuard === true ? 'on' : 'off'}
        data-sg-step-held={String(status.stepHeld ?? 0)}
        onClick={() => setOpen(!open)}
      >
        <span>{peakLabel(status)}</span>
        <span className={'sg-status-caret' + (open ? ' sg-status-caret-open' : '')} aria-hidden="true">
          ⌄
        </span>
      </button>
      {open && (
        <div className="sg-status-panel" role="dialog" aria-label="高峰拦截列表">
          <div className="sg-fr-head">
            <span className="sg-fr-title">高峰拦截列表（按模型名）</span>
            <button type="button" className="sg-fr-closeicon" onClick={() => setOpen(false)} aria-label="关闭">
              ×
            </button>
          </div>
          <ModelListPanel />
        </div>
      )}
    </div>
  )
}

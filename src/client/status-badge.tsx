/**
 * dsh-session-guard — 状态徽标（**徽标即按钮**，fail-open）。
 *
 * 轮询 host 的 /session-guard/status（全局当前阶段），显示 高峰/谷时/周末；
 * 高峰期按二维判定区分「只拦官方」与「全部暂停」（文案见 badge-text.ts）；
 * 颜色即语义：拦截态红、放行态绿。
 *
 * 点击展开「高峰拦截列表」（当前模型目录 + 勾选，写入 `officialModelPatterns`）——
 * 勾选只是改同一份设置项，host 侧判定与存储逻辑不变；没有 settingsScope（或快照只读）时
 * 面板只读。不做任何队列/会话动作；冻结按钮由 input-traffic 经桥接管（D6/D8）。
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { badgeClassNames, badgeTitle, peakLabel, type Status } from './badge-text'
import { ModelListPanel } from './model-panel'
import { injectClientCss } from './styles'

/** 徽标面板需要的设置面（只需这一个字段）。 */
interface BadgeConfig {
  officialModelPatterns?: string[]
}

/** slot 运行时注入的 props：会话级 sessionId + 插件绑定的设置 scope。 */
export interface StatusBadgeProps {
  sessionId?: string
  scope?: SettingsScope<BadgeConfig>
}

/** 无可写设置时的稳定快照（getSnapshot 必须返回稳定引用，否则会无限重渲染）。 */
const NO_SCOPE_SNAPSHOT = { status: 'unavailable' as const, writable: false, value: {} }

const POLL_MS = 15_000

/** 状态徽标：轮询全局阶段，显示 高峰/谷时/周末（enabled 关闭或请求失败时静默隐藏）。 */
export function StatusBadge({ sessionId, scope }: StatusBadgeProps) {
  const [status, setStatus] = useState<Status | null>(null)
  const [open, setOpen] = useState(false)

  const snapshot = useSyncExternalStore(
    (listener) => (scope ? scope.subscribe(listener) : () => undefined),
    () => (scope ? scope.getSnapshot() : NO_SCOPE_SNAPSHOT),
  )

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

  const patterns = (snapshot.value as BadgeConfig | undefined)?.officialModelPatterns ?? []
  const readonly = snapshot.status === 'unavailable' || snapshot.writable !== true
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
          {scope === undefined ? (
            <p className="sgMlHint">设置命名空间不可用（只读）：请确认 dsh-session-guard 已装配进此 profile。</p>
          ) : (
            <ModelListPanel
              patterns={patterns}
              disabled={readonly}
              onCommit={(next) => {
                void scope.set('officialModelPatterns', next)
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

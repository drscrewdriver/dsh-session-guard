/**
 * dsh-session-guard — 「暂停会话 / 继续会话」按钮（`conversation.input.right`，order 20）。
 *
 * 交互（v0.2.0 修订）：
 * - 未暂停 → 「暂停会话」，**可点**：点击 POST `{action:'stepPause'}`，在**下一次 step 边界**暂停
 *   （不打断当前 step；step 1 也拦，不受峰谷 / provider 限制）；
 * - 已暂停（高峰自动拉门 **或** 手动请求已登记）→ 「继续会话」，点击 POST `{action:'stepResume'}`；
 * - 状态更新双通道：① SSE `/session-guard/events?session=<id>` 即时推送；② 10s 轮询兜底
 *   （SSE 不可用 / 断线时仍能收敛）。全部 fail-open，绝不抛错。
 *
 * 与 input-traffic 的「❄ 冻结追加 / 恢复追加」并列（order 30 在其右侧），互不取代：
 * 本按钮控 step 门，冻结按钮控回合级冻结 + 队列摘除。
 */
import { useEffect, useState } from 'react'
import {
  pauseButtonLabel,
  pauseButtonTitle,
  readPauseState,
  readStepSnapshot,
  type PauseButtonState,
} from './pause-button-text'
import { injectClientCss } from './styles'

/** slot 运行时注入的会话级 props。 */
export interface PauseButtonProps {
  sessionId?: string
}

/** SSE 不可用时的兜底轮询间隔（正常路径由事件驱动，几乎不触发）。 */
const POLL_MS = 10_000

const IDLE: PauseButtonState = { paused: false, heldSince: null, manual: false }

/** 暂停 / 继续会话按钮。 */
export function PauseButton({ sessionId }: PauseButtonProps) {
  const [state, setState] = useState<PauseButtonState>(IDLE)
  const [busy, setBusy] = useState(false)

  injectClientCss()

  useEffect(() => {
    if (sessionId === undefined || sessionId === '') return
    let cancelled = false

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`/session-guard/state?session=${encodeURIComponent(sessionId)}`)
        const body = await res.json().catch(() => null)
        if (cancelled) return
        setState(readPauseState(body))
      } catch {
        // fail-open：路由不存在 / 网络失败 → 保持上一次状态。
      }
    }
    void poll()
    const timer = setInterval(() => {
      void poll()
    }, POLL_MS)

    let source: EventSource | undefined
    try {
      source = new EventSource(`/session-guard/events?session=${encodeURIComponent(sessionId)}`)
      source.onmessage = (ev: MessageEvent<string>) => {
        try {
          const msg = JSON.parse(ev.data) as { type?: string; state?: unknown }
          if (cancelled || msg?.type !== 'step') return
          setState(readStepSnapshot(msg.state))
        } catch {
          /* 非法负载：忽略，等下一次推送或轮询 */
        }
      }
      // onerror：EventSource 会自行重连；轮询同时兜底。
      source.onerror = () => undefined
    } catch {
      // 浏览器不支持 EventSource → 只靠轮询。
    }

    return () => {
      cancelled = true
      clearInterval(timer)
      try {
        source?.close()
      } catch {
        /* ignore */
      }
    }
  }, [sessionId])

  if (sessionId === undefined || sessionId === '') return null

  const paused = state.paused === true
  const onClick = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const action = paused ? 'stepResume' : 'stepPause'
      const res = await fetch('/session-guard/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, action }),
      })
      const body = await res.json().catch(() => null)
      if (body?.ok === true) {
        // 立即乐观更新；SSE / 轮询随后校正。
        setState(paused ? IDLE : { paused: true, heldSince: null, manual: true })
      }
    } catch {
      // fail-open：下一轮轮询会纠正显示。
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="sg-pause"
      disabled={busy}
      aria-pressed={paused || undefined}
      title={pauseButtonTitle(state)}
      data-sg-step-paused={paused ? 'on' : 'off'}
      onClick={() => {
        void onClick()
      }}
    >
      {pauseButtonLabel(state)}
    </button>
  )
}

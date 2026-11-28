/**
 * dsh-session-guard — 「暂停会话 / 继续会话」按钮（`conversation.input.right`，order 20）。
 *
 * 交互（v4.6.0 修订）：
 * - 未暂停 → 「暂停会话」，**可点**：点击 POST `{action:'stepPause'}`，在**下一次 step 边界**暂停
 *   （不打断当前 step；step 1 也拦，不受峰谷 / provider 限制）；
 * - 已暂停（任一来源：step 门 / 手动请求 / 请求级 hold / **turn 级真暂停**）→ 「继续会话」，
 *   点击 POST `{action:'resume'}`（v4.6.0 起走唯一入口 `bridge.resumeSession`，
 *   与 `/guard resume` 逐项一致）；
 * - **确认面**：`needConfirmation === true`（force 中断工具 / safe 延迟工具）时，
 *   按钮下方就地展开三选一 —— 重新执行 / 跳过 / 保持暂停。绝不隐式 `confirm:true`：
 *   重新执行可能已部分执行的工具，必须是一次明示选择。
 * - 状态更新三通道：① SSE `/session-guard/events?session=<id>` 即时推送（step + pause）；
 *   ② 10s 轮询兜底（SSE 不可用 / 断线时仍能收敛）；③ 点击后的乐观更新（仅成功时）。
 *   全部 fail-open，绝不抛错。
 *
 * 与 input-traffic 的「❄ 冻结追加 / 恢复追加」并列（order 30 在其右侧），互不取代：
 * 本按钮控 step 门 + turn 级暂停，冻结按钮控回合级冻结 + 队列摘除。
 */
import { useEffect, useState } from 'react'
import {
  pauseButtonLabel,
  pauseButtonTitle,
  readPauseSnapshot,
  readPauseState,
  readStepSnapshot,
  type PauseButtonState,
  type Translate,
} from './pause-button-text'
import { injectClientCss } from './styles'

/** slot 运行时注入的会话级 props。 */
export interface PauseButtonProps {
  sessionId?: string
  /** 宿主注入的字典查询（slot 注册声明了 `locale: 'session-guard'` 时由框架给出）。 */
  t?: Translate
}

/** SSE 不可用时的兜底轮询间隔（正常路径由事件驱动，几乎不触发）。 */
const POLL_MS = 10_000

const IDLE: PauseButtonState = { paused: false, heldSince: null, manual: false }

/** 恢复确认面的三种选择（`keep` 不上送，只收起确认行）。 */
type ResumeChoice = 'rerun' | 'skip' | 'keep'

/** 一次 RPC 的结果（只读关心的字段）。 */
interface ResumeResult {
  ok?: boolean
  needConfirmation?: boolean
  result?: {
    resumed?: boolean
    needConfirmation?: boolean
    pause?: { kind?: string; text?: string; needConfirmation?: boolean }
  }
}

/** 暂停 / 继续会话按钮。 */
export function PauseButton({ sessionId, t }: PauseButtonProps) {
  const [state, setState] = useState<PauseButtonState>(IDLE)
  const [busy, setBusy] = useState(false)
  /** 待用户确认时的提示文案（null = 不展开确认行）。 */
  const [confirmText, setConfirmText] = useState<string | null>(null)

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
          if (cancelled) return
          // v4.6.0：step 门与 pauseGate 同权合并——任一来源的暂停都要让按钮变「继续会话」。
          if (msg?.type === 'step') setState(readStepSnapshot(msg.state))
          else if (msg?.type === 'pause') setState(readPauseSnapshot(msg.state))
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

  /** POST 一次 rpc，返回解析后的响应体（失败 → null，fail-open）。 */
  const rpc = async (payload: Record<string, unknown>): Promise<ResumeResult | null> => {
    try {
      const res = await fetch('/session-guard/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, ...payload }),
      })
      return (await res.json().catch(() => null)) as ResumeResult | null
    } catch {
      return null
    }
  }

  const onClick = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      if (!paused) {
        const body = await rpc({ action: 'stepPause' })
        if (body?.ok === true) setState({ paused: true, heldSince: null, manual: true })
        return
      }
      // 已暂停 → 走唯一恢复入口（confirm 缺省 false，可能返回 needConfirmation）。
      const body = await rpc({ action: 'resume' })
      if (body?.ok !== true) return
      if (body.needConfirmation === true || body.result?.needConfirmation === true) {
        // 不乐观更新：暂停态原样保留，等用户三选一。
        const text = body.result?.pause?.text
        setConfirmText(typeof text === 'string' && text !== '' ? text : '需要确认：上次暂停时有工具未执行完成。')
        return
      }
      // 仅在真恢复成功时乐观更新；needConfirmation / error 一律不动显示。
      if (body.result?.resumed === true) setState(IDLE)
    } finally {
      setBusy(false)
    }
  }

  const onChoose = async (choice: ResumeChoice): Promise<void> => {
    if (busy) return
    if (choice === 'keep') {
      // 保持暂停：清空确认行，暂停快照与服务端状态都不动。
      setConfirmText(null)
      return
    }
    setBusy(true)
    try {
      const body = await rpc({ action: 'resume', confirm: true, choice })
      if (body?.ok === true && body.result?.resumed === true) {
        setState(IDLE)
        setConfirmText(null)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="sg-pause-wrap">
      <button
        type="button"
        className="sg-pause"
        disabled={busy}
        aria-pressed={paused || undefined}
        title={pauseButtonTitle(state, t)}
        data-sg-step-paused={paused ? 'on' : 'off'}
        onClick={() => {
          void onClick()
        }}
      >
        {pauseButtonLabel(state, t)}
      </button>
      {confirmText === null ? null : (
        <span className="sg-confirm" role="group" aria-label="恢复确认">
          <span className="sg-confirm-text">{confirmText}</span>
          <button type="button" className="sg-confirm-btn" disabled={busy} onClick={() => { void onChoose('rerun') }}>
            重新执行
          </button>
          <button type="button" className="sg-confirm-btn" disabled={busy} onClick={() => { void onChoose('skip') }}>
            跳过
          </button>
          <button type="button" className="sg-confirm-btn" disabled={busy} onClick={() => { void onChoose('keep') }}>
            保持暂停
          </button>
        </span>
      )}
    </span>
  )
}

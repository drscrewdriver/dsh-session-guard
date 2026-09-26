/**
 * dsh-session-guard — 「畅跑」按钮 + 畅跑任务管理面板（`conversation.input.right`，order 20）。
 *
 * 交互（用户定案）：**点击按钮一律打开任务管理面板**。
 * 面板布局：
 * - **顶部三个文本按钮**：`新建畅跑任务` / `暂停全部任务`（全暂停时变 `恢复全部任务`）/ `删除全部任务`；
 *   「新建」在面板内联展开起止时间选择器（开始 / 结束，到小时）。
 * - **每行两个图标按钮**：`⏸ / ▶`（暂停 / 恢复该段）与 `×`（删除该段）。
 *
 * 按钮文案固定为「畅跑」（任务数 >1 时 `×N`）；是否正在生效靠按钮高亮色 + 悬浮提示
 * 表达。点击永远打开面板，因此没有「生效期间面板不可达」的死角。
 *
 * 时间选择器的输入值按**配置时区**解释（主机侧解析），面板顶部标注该时区。
 *
 * 状态更新：5s 轮询 `/session-guard/state`（畅跑是低频交互，轮询足够且最简单）
 * + 本地定时器保证到点后状态及时刷新。全部 fail-open，绝不抛错。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EMPTY_FREE_RUN,
  ICON_DELETE,
  ICON_PAUSE,
  ICON_RESUME,
  allTasksPaused,
  canPause,
  canResume,
  freeRunLabel,
  freeRunTitle,
  pauseAllLabel,
  readFreeRun,
  rowDeleteTitle,
  rowPauseTitle,
  statusLabel,
  toolbarDisabled,
  type FreeRunView,
} from './free-run-button-text'
import { DateRangePicker } from './date-range-picker'
import { combineEnd, combineStart, seedRange } from './date-range'
import { injectClientCss } from './styles'

/** slot 运行时注入的会话级 props。 */
export interface FreeRunButtonProps {
  sessionId?: string
}

/** 兜底轮询间隔（畅跑是低频交互，5s 足够；到点切换另有本地定时器）。 */
const POLL_MS = 5_000

// 日期 + 小时的拼接与「按小时包含」语义见 date-range.ts 的 combineStart / combineEnd：
// 开始 = H:00，结束 = H:59（否则选「23 时」会变成 23:00，当天最后一小时选不进来）。

/** 拆出 `YYYY-MM-DD` 与 `HH`（供选择器回填）。 */
export function splitDateTime(value: string | null | undefined): { date: string; hour: string } {
  const s = typeof value === 'string' ? value : ''
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})/.exec(s)
  if (m === null) return { date: '', hour: '' }
  return { date: m[1], hour: m[2] }
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))

/** 畅跑按钮 + 任务管理面板。 */
export function FreeRunButton({ sessionId }: FreeRunButtonProps) {
  const [view, setView] = useState<FreeRunView>(EMPTY_FREE_RUN)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [fromHour, setFromHour] = useState('')
  const [toDate, setToDate] = useState('')
  const [toHour, setToHour] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)

  /** 用「当前时刻」重新播种起止（开始 = 本小时整点，结束 = +2h）。 */
  const seedFromNow = useCallback((): void => {
    const s = seedRange(new Date())
    setFromDate(s.fromDate)
    setFromHour(s.fromHour)
    setToDate(s.toDate)
    setToHour(s.toHour)
  }, [])

  injectClientCss()

  const poll = useCallback(async (): Promise<void> => {
    if (sessionId === undefined || sessionId === '') return
    try {
      const res = await fetch(`/session-guard/state?session=${encodeURIComponent(sessionId)}`)
      const body = await res.json().catch(() => null)
      setView(readFreeRun(body))
    } catch {
      // fail-open：路由不存在 / 网络失败 → 保持上一次状态。
    }
  }, [sessionId])

  useEffect(() => {
    if (sessionId === undefined || sessionId === '') return
    let cancelled = false
    void poll()
    const timer = setInterval(() => {
      if (!cancelled) void poll()
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [sessionId, poll])

  // 到点后要立刻刷新（按钮高亮 / 列表状态）：按剩余毫秒设一个本地定时器。
  useEffect(() => {
    const ms = view.msRemaining
    if (ms === null || !Number.isFinite(ms) || ms <= 0) return
    const timer = setTimeout(() => {
      void poll()
    }, ms + 500)
    return () => {
      clearTimeout(timer)
    }
  }, [view.msRemaining, poll])

  // 点面板外面关闭。
  useEffect(() => {
    if (!open) return
    const onDown = (ev: MouseEvent): void => {
      const el = rootRef.current
      if (el !== null && ev.target instanceof Node && !el.contains(ev.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const rpc = useCallback(
    async (action: string, payload: Record<string, unknown> = {}): Promise<boolean> => {
      if (sessionId === undefined || sessionId === '') return false
      setBusy(true)
      setError('')
      try {
        const res = await fetch('/session-guard/rpc', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, action, ...payload }),
        })
        const body = await res.json().catch(() => null)
        if (body?.ok === true) {
          setView(readFreeRun({ ok: true, freeRun: body.result }))
          return true
        }
        setError(typeof body?.error === 'string' ? body.error : '操作失败')
        return false
      } catch {
        setError('操作失败（网络或路由不可用）')
        return false
      } finally {
        setBusy(false)
      }
    },
    [sessionId],
  )

  const onClick = useCallback((): void => {
    if (busy) return
    setOpen((prev) => {
      if (prev) return false
      // 打开面板时**默认播种为当前时刻**（开始 = 本小时整点，结束 = +2h），
      // 用户想改再改——「新建畅跑任务」最常见的意图就是现在就开始。
      seedFromNow()
      setError('')
      return true
    })
  }, [busy, seedFromNow])

  // Esc 关闭面板。
  useEffect(() => {
    if (!open) return
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (sessionId === undefined || sessionId === '') return null
  // 插件整体关掉且没有任何任务时不给按钮；已有任务则保留，便于清理。
  if (!view.available && view.windows.length === 0) return null

  const onAdd = async (): Promise<void> => {
    if (fromDate === '' || fromHour === '' || toDate === '' || toHour === '') {
      setError('请选择开始与结束时间')
      return
    }
    const ok = await rpc('freeRunAdd', {
      from: combineStart(fromDate, fromHour),
      to: combineEnd(toDate, toHour),
    })
    if (ok) {
      setError('')
      setCreating(false)
    }
  }

  const nothingToAct = toolbarDisabled(view)
  const allPaused = allTasksPaused(view)

  return (
    <div className="sg-fr-root" ref={rootRef}>
      <button
        type="button"
        className={`sg-fr ${view.active ? 'sg-fr-active' : ''}`}
        disabled={busy}
        title={freeRunTitle(view)}
        data-sg-free-run-active={view.active ? 'on' : 'off'}
        data-sg-free-run-count={String(view.windows.length)}
        aria-expanded={open}
        onClick={onClick}
      >
        {freeRunLabel(view)}
      </button>

      {open && (
        <div className="sg-fr-panel" role="dialog" aria-label="畅跑任务管理">
          <div className="sg-fr-head">
            <span className="sg-fr-title">畅跑任务</span>
            <span className="sg-fr-tz">按 {view.timezone === '' ? '本地时区' : view.timezone}</span>
            <button
              type="button"
              className="sg-fr-closeicon"
              title="关闭"
              aria-label="关闭"
              onClick={() => {
                setOpen(false)
              }}
            >
              {ICON_DELETE}
            </button>
          </div>

          {/* 顶部三个文本按钮：新建 / 暂停全部 / 删除全部 */}
          <div className="sg-fr-bar">
            <button
              type="button"
              className={`sg-fr-bar-btn ${creating ? 'sg-fr-bar-on' : ''}`}
              disabled={busy}
              aria-pressed={creating}
              onClick={() => {
                setCreating((prev) => !prev)
                setError('')
              }}
            >
              新建畅跑任务
            </button>
            <button
              type="button"
              className="sg-fr-bar-btn"
              disabled={busy || nothingToAct}
              onClick={() => {
                void rpc(allPaused ? 'freeRunResumeAll' : 'freeRunPauseAll')
              }}
            >
              {pauseAllLabel(view)}
            </button>
            <button
              type="button"
              className="sg-fr-bar-btn sg-fr-bar-danger"
              disabled={busy || view.windows.length === 0}
              onClick={() => {
                void rpc('freeRunClear')
              }}
            >
              删除全部任务
            </button>
          </div>

          {creating && (
            <div className="sg-fr-form">
              {/* 日期范围：双月日历（对齐 DSH 排期面板的样式）。
                  小时仍用下拉，保持「到小时」的精度。 */}
              <DateRangePicker
                from={fromDate}
                to={toDate}
                disabled={busy}
                onChange={(f, t) => {
                  setFromDate(f)
                  setToDate(t)
                  setError('')
                }}
              />
              <div className="sg-fr-hours">
                <label className="sg-fr-hour">
                  <span>开始</span>
                  <select
                    value={fromHour}
                    disabled={busy}
                    onChange={(e) => {
                      setFromHour(e.target.value)
                    }}
                  >
                    <option value="">时</option>
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  <span className="sg-fr-unit">时</span>
                </label>
                <label className="sg-fr-hour">
                  <span>结束</span>
                  <select
                    value={toHour}
                    disabled={busy}
                    onChange={(e) => {
                      setToHour(e.target.value)
                    }}
                  >
                    <option value="">时</option>
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  <span className="sg-fr-unit">时</span>
                </label>
                <button type="button" className="sg-fr-now" disabled={busy} title="重置为当前时刻" onClick={seedFromNow}>
                  现在
                </button>
              </div>
              <div className="sg-fr-form-actions">
                <button type="button" className="sg-fr-add" disabled={busy} onClick={() => void onAdd()}>
                  确定
                </button>
                <button
                  type="button"
                  className="sg-fr-cancel"
                  disabled={busy}
                  onClick={() => {
                    setCreating(false)
                    setError('')
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {view.windows.length === 0 ? (
            <div className="sg-fr-empty">还没有畅跑任务，点「新建畅跑任务」添加</div>
          ) : (
            <ul className="sg-fr-list">
              {view.windows.map((w) => (
                <li key={w.id} className="sg-fr-item">
                  <span className="sg-fr-range">
                    {w.fromDisplay} – {w.toDisplay}
                  </span>
                  <span className={`sg-fr-tag sg-fr-tag-${w.status}`}>{statusLabel(w.status)}</span>
                  <button
                    type="button"
                    className="sg-fr-icon"
                    title={rowPauseTitle(w)}
                    aria-label={w.paused === true ? '恢复' : '暂停'}
                    disabled={busy || (!canPause(w) && !canResume(w))}
                    onClick={() => {
                      void rpc(w.paused === true ? 'freeRunResume' : 'freeRunPause', { id: w.id })
                    }}
                  >
                    {w.paused === true ? ICON_RESUME : ICON_PAUSE}
                  </button>
                  <button
                    type="button"
                    className="sg-fr-icon sg-fr-icon-danger"
                    title={rowDeleteTitle()}
                    aria-label="删除"
                    disabled={busy}
                    onClick={() => {
                      void rpc('freeRunRemove', { id: w.id })
                    }}
                  >
                    {ICON_DELETE}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error !== '' && <div className="sg-fr-error">{error}</div>}
        </div>
      )}
    </div>
  )
}

/**
 * dsh-session-guard — 日期范围选择器（双月日历，风格对齐 DSH 排期面板）。
 *
 * 交互：
 * - 触发器是一行 `开始日期 → 结束日期` + 日历图标；
 * - 点开后是两个并排月份，`‹‹ ‹  2026年 9月   2026年 10月  › ››`；
 * - 第一次点选起点、第二次点选终点（反着点会自动对调）；选满即收起；
 * - 已有完整区间时再点一次 = 重新开始选。
 *
 * 只有日期；**小时**由调用方在日历旁另配下拉（保持「到小时」的精度）。
 * 纯展示 + 受控回调，不做校验（非法组合由主机侧拒绝并回报错误）。
 */
import { useEffect, useRef, useState } from 'react'
import {
  addMonths,
  compareIso,
  fromIso,
  inRange,
  isEdge,
  monthGrid,
  monthTitle,
  nextRange,
  rangeLabel,
  toIso,
  weekdayLabels,
} from './date-range'

export interface DateRangePickerProps {
  from: string
  to: string
  /** 任一端变化都会回调（`YYYY-MM-DD`；未选满时另一侧为 ''）。 */
  onChange: (_from: string, _to: string) => void
  disabled?: boolean
}

/** 双月范围日历。 */
export function DateRangePicker({ from, to, onChange, disabled = false }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState(() => {
    const seed = fromIso(from) ?? fromIso(to) ?? fromIso(toIso(new Date()))!
    return { y: seed.y, m: seed.m }
  })
  const rootRef = useRef<HTMLDivElement | null>(null)

  // 外部值变化时把视图跟到起点所在月（只在「打开」这一下跟随，
  // 避免用户翻月时被立刻拽回去）。
  useEffect(() => {
    const seed = fromIso(from) ?? fromIso(to)
    if (seed !== null && open) setAnchor({ y: seed.y, m: seed.m })
  }, [open])

  // 点外面 / Esc 收起。
  useEffect(() => {
    if (!open) return
    const onDown = (ev: MouseEvent): void => {
      const el = rootRef.current
      if (el !== null && ev.target instanceof Node && !el.contains(ev.target)) setOpen(false)
    }
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const label = rangeLabel(from, to)
  const right = addMonths(anchor, 1)
  const todayIso = toIso(new Date())

  function pick(iso: string): void {
    const r = nextRange(from, to, iso)
    onChange(r.from, r.to)
    if (r.done) setOpen(false)
  }

  function cellClass(iso: string, inMonth: boolean): string {
    const parts = ['sg-dr-day']
    if (!inMonth) parts.push('sg-dr-out')
    if (inRange(iso, from, to)) parts.push('sg-dr-in')
    if (isEdge(iso, from, to) && compareIso(from, to) !== 0) parts.push('sg-dr-edge')
    else if (isEdge(iso, from, to)) parts.push('sg-dr-edge', 'sg-dr-single')
    if (iso === todayIso) parts.push('sg-dr-today')
    return parts.join(' ')
  }

  function renderMonth(y: number, m: number) {
    const cells = monthGrid(y, m)
    return (
      <div className="sg-dr-month">
        <div className="sg-dr-mtitle">{monthTitle(y, m)}</div>
        <div className="sg-dr-grid">
          {weekdayLabels().map((w) => (
            <span key={w} className="sg-dr-wd">
              {w}
            </span>
          ))}
          {cells.map((c) => (
            <button
              key={c.iso}
              type="button"
              className={cellClass(c.iso, c.inMonth)}
              disabled={disabled}
              onClick={() => pick(c.iso)}
            >
              {c.day}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="sg-dr-root" ref={rootRef}>
      <button
        type="button"
        className={`sg-dr-trigger ${label.placeholder ? 'sg-dr-ph' : ''}`}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
      >
        <span className="sg-dr-text">{label.text}</span>
        <span className="sg-dr-icon" aria-hidden="true">
          {/* 极简日历字形，零图标依赖 */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="sg-dr-panel" role="dialog" aria-label="选择日期范围">
          <div className="sg-dr-head">
            <button
              type="button"
              className="sg-dr-nav"
              title="上一年"
              onClick={() => setAnchor((a) => addMonths(a, -12))}
            >
              ‹‹
            </button>
            <button type="button" className="sg-dr-nav" title="上个月" onClick={() => setAnchor((a) => addMonths(a, -1))}>
              ‹
            </button>
            <span className="sg-dr-spacer" />
            <button type="button" className="sg-dr-nav" title="下个月" onClick={() => setAnchor((a) => addMonths(a, 1))}>
              ›
            </button>
            <button
              type="button"
              className="sg-dr-nav"
              title="下一年"
              onClick={() => setAnchor((a) => addMonths(a, 12))}
            >
              ››
            </button>
          </div>
          <div className="sg-dr-months">
            {renderMonth(anchor.y, anchor.m)}
            {renderMonth(right.y, right.m)}
          </div>
        </div>
      )}
    </div>
  )
}

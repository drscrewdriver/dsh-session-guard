/**
 * dsh-session-guard — 暂停/继续按钮文案与状态投影（纯函数，零依赖，可单测）。
 *
 * 交互（v0.2.0 修订）：
 * - 未暂停 → 「暂停会话」（**可点**：点击 = 在下一次 step 边界手动暂停该会话）；
 * - 已暂停（step 门已拉 / 已请求但未到边界）→ 「继续会话」（点击 = 放行并本峰不再拦）。
 * 按钮不置灰：step 暂停虽然会自动发生，但按钮同时是**手动暂停**入口。
 */

/** 按钮状态。 */
export interface PauseButtonState {
  /** 是否处于暂停态（step 门已挂起，或已请求暂停但还没到边界） */
  paused: boolean
  /** 挂起起始时间戳（毫秒）；未知为 null */
  heldSince?: number | null
  /** 暂停是否来自用户手动请求（而非高峰自动拉门） */
  manual?: boolean
}

/** 按钮文案。 */
export function pauseButtonLabel(state: PauseButtonState): string {
  return state.paused === true ? '继续会话' : '暂停会话'
}

/** 悬浮说明：写清当前状态与点击后的语义。 */
export function pauseButtonTitle(state: PauseButtonState): string {
  if (state.paused !== true) {
    return '暂停会话：在下一次 step 的模型请求前暂停（高峰 + 官方源时会自动暂停）'
  }
  const since = typeof state.heldSince === 'number' && Number.isFinite(state.heldSince) ? new Date(state.heldSince) : null
  const at = since === null ? null : `${String(since.getHours()).padStart(2, '0')}:${String(since.getMinutes()).padStart(2, '0')}`
  const why = state.manual === true ? '手动暂停' : '高峰自动暂停'
  const base = at === null ? `已暂停（${why}）` : `已暂停（${why}，自 ${at}）`
  return `${base} · 点击继续：放行当前 step，且本高峰内不再拦该会话`
}

/** 把 `/session-guard/state` 的响应体投影为按钮状态（形状异常 → 未暂停，fail-open）。 */
export function readPauseState(body: unknown): PauseButtonState {
  const b = (body ?? {}) as {
    ok?: unknown
    paused?: { step?: unknown; manual?: unknown }
    stepGate?: { since?: unknown; manual?: unknown }
    state?: { pausedStep?: unknown; stepHeldSince?: unknown; stepManual?: unknown }
  }
  if (b.ok !== true) return { paused: false, heldSince: null, manual: false }
  const manual = b.paused?.manual === true || b.stepGate?.manual === true || b.state?.stepManual === true
  const paused = b.paused?.step === true || b.state?.pausedStep === true || manual
  const raw = b.stepGate?.since ?? b.state?.stepHeldSince ?? null
  const heldSince = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
  return { paused, heldSince, manual }
}

/** 把 SSE `/session-guard/events` 的 `state` 快照投影为按钮状态。 */
export function readStepSnapshot(snapshot: unknown): PauseButtonState {
  const s = (snapshot ?? {}) as { held?: unknown; since?: unknown; manual?: unknown }
  const manual = s.manual === true
  const paused = s.held === true || manual
  const heldSince = typeof s.since === 'number' && Number.isFinite(s.since) ? s.since : null
  return { paused, heldSince, manual }
}

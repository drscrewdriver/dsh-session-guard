/**
 * dsh-session-guard — 暂停/继续按钮文案与状态投影（纯函数，零依赖，可单测）。
 *
 * 交互（v4.6.0 修订）：
 * - 未暂停 → 「暂停会话」（**可点**：点击 = 在下一次 step 边界手动暂停该会话）；
 * - 已暂停（step 门 / 手动请求 / 请求级 hold / **turn 级真暂停**）→ 「继续会话」
 *   （点击 = 走唯一恢复入口 `bridge.resumeSession`，与 `/guard resume` 一致）。
 * 按钮不置灰：step 暂停虽然会自动发生，但按钮同时是**手动暂停**入口。
 *
 * 文案全部走字典（`session-guard` 命名空间，10 语）；`tr` 缺省时回退中文，
 * 保证纯函数单测无需装配 locale 服务。
 */

/** 按钮状态。 */
export interface PauseButtonState {
  /** 是否处于暂停态（step 门已挂起，或已请求暂停但还没到边界，或 turn 级真暂停） */
  paused: boolean
  /** 挂起起始时间戳（毫秒）；未知为 null */
  heldSince?: number | null
  /** 暂停是否来自用户手动请求（而非高峰自动拉门） */
  manual?: boolean
}

/** 字典查询函数（`ctx.locale.bind(NS)` 或注入的 `t`）；缺省回退到 key 本身。 */
export type Translate = (key: string, vars?: Record<string, string | number>) => string

/** 缺省翻译：无 locale 服务时返回 key（单测/降级路径不崩）。 */
const identity: Translate = (key) => key

/** 极简插值：把 `{name}` 替换成 vars[name]（缺值原样保留）。 */
function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (vars === undefined) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = vars[name]
    return v === undefined ? whole : String(v)
  })
}

/** 取翻译并插值。 */
function say(tr: Translate, key: string, vars?: Record<string, string | number>): string {
  return interpolate(tr(key), vars)
}

/** 按钮文案。 */
export function pauseButtonLabel(state: PauseButtonState, tr: Translate = identity): string {
  return state.paused === true ? tr('pause.button.resume') : tr('pause.button.pause')
}

/** 悬浮说明：写清当前状态与点击后的语义。 */
export function pauseButtonTitle(state: PauseButtonState, tr: Translate = identity): string {
  if (state.paused !== true) return tr('pause.title.idle')
  const since = typeof state.heldSince === 'number' && Number.isFinite(state.heldSince) ? new Date(state.heldSince) : null
  const at = since === null ? null : `${String(since.getHours()).padStart(2, '0')}:${String(since.getMinutes()).padStart(2, '0')}`
  const why = state.manual === true ? tr('pause.title.manual') : tr('pause.title.auto')
  const base = at === null ? say(tr, 'pause.title.plain', { why }) : say(tr, 'pause.title.at', { why, at })
  return `${base}${tr('pause.title.hint')}`
}

/** 把 `/session-guard/state` 的响应体投影为按钮状态（形状异常 → 未暂停，fail-open）。 */
export function readPauseState(body: unknown): PauseButtonState {
  const b = (body ?? {}) as {
    ok?: unknown
    paused?: { step?: unknown; turn?: unknown; manual?: unknown; request?: unknown; any?: unknown }
    stepGate?: { since?: unknown; manual?: unknown }
    requestGate?: { held?: unknown; since?: unknown }
    state?: {
      pausedStep?: unknown
      pausedTurn?: unknown
      stepHeldSince?: unknown
      stepManual?: unknown
      requestHeld?: unknown
      requestHeldSince?: unknown
      pausedAny?: unknown
    }
  }
  if (b.ok !== true) return { paused: false, heldSince: null, manual: false }
  const manual = b.paused?.manual === true || b.stepGate?.manual === true || b.state?.stepManual === true
  // v4.2.11（issue #3）：请求级 hold 也是「已暂停」，否则峰期新会话被挂住时按钮仍显示「暂停会话」。
  const requestHeld = b.paused?.request === true || b.requestGate?.held === true || b.state?.requestHeld === true
  // v4.6.0：turn 级真暂停（pauseGate 已落地快照）。旧投影漏这一项 → 真暂停时按钮仍显示
  // 「暂停会话」，用户根本点不到恢复入口（本计划的直接成因）。
  const turnPaused = b.paused?.turn === true || b.state?.pausedTurn === true
  const paused =
    turnPaused ||
    b.paused?.any === true ||
    b.state?.pausedAny === true ||
    b.paused?.step === true ||
    b.state?.pausedStep === true ||
    requestHeld ||
    manual
  const raw = b.stepGate?.since ?? b.state?.stepHeldSince ?? b.requestGate?.since ?? b.state?.requestHeldSince ?? null
  const heldSince = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
  // turn 级真暂停无 since（快照里只有 paused/forced），manual 语义不适用 → 保留原值。
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

/**
 * 把 SSE `{type:'pause'}` 的 `state` 快照投影为按钮状态（v4.6.0）。
 *
 * 与 `readPauseState` 的区别：SSE 负载是 pauseGate 的**单来源**视图，
 * 不含 step 门的 `since`/`manual`，因此只按 `any`/`paused` 定布尔，
 * 时间戳留空（由随后的 `/state` 轮询补齐）。
 */
export function readPauseSnapshot(snapshot: unknown): PauseButtonState {
  const s = (snapshot ?? {}) as { paused?: unknown; any?: unknown }
  const paused = s.any === true || s.paused === true
  return { paused, heldSince: null, manual: false }
}

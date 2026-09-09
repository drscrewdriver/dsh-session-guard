/**
 * dsh-session-guard — 会话「最近一次真实目标」追踪（纯函数 + 小状态表）。
 *
 * 主信号：`session/event` 的 `request/header`（**两个版本都有**，findings F5）。
 *   `session.append('request/header', { header, reason })`，`header.config.{provider,model}`
 *   是这次请求真正要去的路由（`installModelSelection` 覆盖之后的值）。
 * 加速信号：`model/selection`（**仅 0.1.2+**）→ 用户切模型时立即更新；
 *   0.1.1 侧不存在该事件，忽略即可（退化为「等下次请求」）。
 *
 * 形状异常 / 缺失一律安全降级为 `unknown`，绝不抛出。
 */

/** 未知目标哨兵（保守：高峰时按「可能是官方」处理）。 */
export const UNKNOWN = 'unknown'

/** 规范化一个 provider/model 对。 */
function shape(provider, model) {
  const p = typeof provider === 'string' && provider !== '' ? provider : UNKNOWN
  const m = typeof model === 'string' && model !== '' ? model : UNKNOWN
  return { provider: p, model: m }
}

/**
 * 从会话事件中读出目标（只认 `request/header` / `model/selection`）。
 * @param {object} event 会话事件
 * @returns {{provider:string, model:string}|null} 不关心的类型返回 null
 */
export function readTarget(event) {
  const type = event && event.type
  if (type === 'request/header') {
    const config = event.data && event.data.header && event.data.header.config
    return shape(config && config.provider, config && config.model)
  }
  if (type === 'model/selection') {
    const sel = event.data
    return shape(sel && sel.provider, sel && sel.model)
  }
  return null
}

/** 目标表：`sessionId → {provider, model, at}`。 */
export function createTargets() {
  /** @type {Map<string, {provider:string, model:string, at:number}>} */
  const map = new Map()
  return {
    /** 用一条会话事件更新目标；返回写入的目标（不关心的事件返回 null）。 */
    update(sessionId, event, at = Date.now()) {
      const key = String(sessionId ?? '')
      if (key === '') return null
      const t = readTarget(event)
      if (t === null) return null
      const rec = { ...t, at }
      map.set(key, rec)
      return rec
    },
    get(sessionId) {
      return map.get(String(sessionId ?? '')) ?? null
    },
    /** provider 值（没有记录 → unknown，保守处理）。 */
    providerOf(sessionId) {
      const rec = map.get(String(sessionId ?? ''))
      return rec ? rec.provider : UNKNOWN
    },
    clear(sessionId) {
      return map.delete(String(sessionId ?? ''))
    },
    entries: () => [...map.entries()],
    size: () => map.size,
  }
}

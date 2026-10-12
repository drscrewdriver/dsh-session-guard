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

/**
 * 规范化一个 provider/model(/reasoningEffort) 三元组。
 * `reasoningEffort` 只在事件真的带了它时才入表（整体替换，不留上一轮的值）——
 * 与宿主 `selection.current` 的语义一致：没选 effort = 用模型默认。
 */
function shape(provider, model, reasoningEffort) {
  const p = typeof provider === 'string' && provider !== '' ? provider : UNKNOWN
  const m = typeof model === 'string' && model !== '' ? model : UNKNOWN
  const rec = { provider: p, model: m }
  if (typeof reasoningEffort === 'string' && reasoningEffort !== '') rec.reasoningEffort = reasoningEffort
  return rec
}

/**
 * 从会话事件中读出目标（只认 `request/header` / `model/selection`）。
 * @param {object} event 会话事件
 * @returns {{provider:string, model:string, reasoningEffort?:string}|null} 不关心的类型返回 null
 */
export function readTarget(event) {
  const type = event && event.type
  if (type === 'request/header') {
    const config = event.data && event.data.header && event.data.header.config
    return shape(config && config.provider, config && config.model, config && config.reasoningEffort)
  }
  if (type === 'model/selection') {
    const sel = event.data
    return shape(sel && sel.provider, sel && sel.model, sel && sel.reasoningEffort)
  }
  return null
}

/**
 * 把一条目标记录套到一次请求的 config 上（放行被 hold 的请求时按**新选择**重路由）。
 *
 * 语义对齐宿主 `installModelSelection`：覆盖 provider/model；记录带 effort 就用它，
 * 不带就把继承来的 effort **删掉**（否则旧 provider 的 effort 会漏给新 provider）。
 * 不修改入参；UNKNOWN 不覆盖（未知不是「用户选择」）。
 * @param {unknown} config 原 config（形状异常按空对象处理）
 * @param {{provider?:string, model?:string, reasoningEffort?:string}} target
 * @returns {object} 新的 config
 */
export function applyTarget(config, target) {
  const out = { ...(config !== null && typeof config === 'object' ? config : {}) }
  const t = target ?? {}
  if (typeof t.provider === 'string' && t.provider !== '' && t.provider !== UNKNOWN) out.provider = t.provider
  if (typeof t.model === 'string' && t.model !== '' && t.model !== UNKNOWN) out.model = t.model
  if (typeof t.reasoningEffort === 'string' && t.reasoningEffort !== '') out.reasoningEffort = t.reasoningEffort
  else delete out.reasoningEffort
  return out
}

/** 目标表：`sessionId → {provider, model, reasoningEffort?, at}`。 */
export function createTargets() {
  /** @type {Map<string, {provider:string, model:string, reasoningEffort?:string, at:number}>} */
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
    /**
     * 直接用**已经拿到的** provider/model 写入目标。
     *
     * 为什么需要它：`session/event` 的 `request/header` 是主信号，但它依赖会话事件管道
     * 按时送达；某些宿主版本上该事件没有到达插件（实测 dsh 0.2.0 上追踪表恒为空，
     * 于是判定退化成 `unknown` → 保守暂停 → 连非官方源一起拦）。
     * 请求级守卫手上本来就有这次请求真正要去的 `config.provider`，把它作为**独立于
     * 事件管道**的实时信号补写进来，判定就不会再因为事件缺失而全员保守。
     * @returns {{provider:string,model:string,reasoningEffort?:string,at:number}|null}
     */
    set(sessionId, provider, model, at = Date.now()) {
      const key = String(sessionId ?? '')
      if (key === '') return null
      const rec = { ...shape(provider, model), at }
      map.set(key, rec)
      return rec
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

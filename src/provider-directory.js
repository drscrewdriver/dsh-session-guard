/**
 * dsh-session-guard — 端点目录（host 适配层，读上游只读信息，全部 fail-open）。
 *
 * 端点来源（见 findings F4）：
 *   1. `ctx.get('llm')` 懒取（**不进 inject**：llm 缺失时降级为纯 id 判定，保持 fail-open）；
 *   2. `llm.listConfigurableProviders()` 按 `entry.provider === id` 找到目录条目
 *      （`{ settingsNs, settingsPath }`）；
 *   3. `ctx.settings.get(settingsNs)` 读该命名空间解析值，按 `settingsPath` 逐层取 profile 的 `baseURL`；
 *   4. 交给纯函数 `classifyProvider`。
 *
 * 只读非密字段（`baseURL`），绝不触碰 `apiKeyEnv` 的值。
 * `llm-deepseek` / `llm-pi-ai` 的内部结构属上游实现细节：任何异常 / 形状不符
 * 一律降级为「无端点」，由 `classifyProvider` 走 id / 内置端点兜底，**绝不抛出**。
 *
 * 每次请求实时计算（两次内存读 + 一次目录枚举），不缓存 → 免疫 provider 配置热改。
 */
import { classifyProvider } from './provider.js'

/** 逐层按 path 取值；任一层不是对象即返回 undefined。 */
function pickPath(root, path) {
  let cur = root
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = cur[key]
  }
  return cur
}

/**
 * @param {object} deps
 * @param {object} deps.ctx host context（需 `get` / `settings`，两者缺失均降级）
 * @param {()=>object} deps.getSettings 读实时配置（officialProviders / officialBaseURLs）
 * @param {(msg:string)=>void} [deps.warn] 诊断日志
 * @returns {{classify:(providerId:string)=>{official:boolean,matchedBy:string}, describe:(providerId:string)=>object, endpointOf:(providerId:string)=>string|null, entries:()=>object[]}}
 */
export function createProviderDirectory({ ctx, getSettings, warn }) {
  function readCfg() {
    try {
      const v = getSettings()
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  }

  /** 目录条目（llm 服务缺失 / 抛错 → 空数组）。 */
  function entries() {
    try {
      const llm = ctx && typeof ctx.get === 'function' ? ctx.get('llm') : null
      if (!llm || typeof llm.listConfigurableProviders !== 'function') return []
      const list = llm.listConfigurableProviders()
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  }

  /**
   * 读某路由的实时端点（`baseURL`）；取不到返回 null。
   * @param {string} providerId
   * @returns {string|null}
   */
  function endpointOf(providerId) {
    if (typeof providerId !== 'string' || providerId === '') return null
    try {
      const entry = entries().find((e) => e && e.provider === providerId)
      if (!entry) return null
      const settings = ctx && ctx.settings
      if (!settings || typeof settings.get !== 'function') return null
      const section = settings.get(entry.settingsNs)
      const profile = pickPath(section, Array.isArray(entry.settingsPath) ? entry.settingsPath : [])
      const baseURL = profile && typeof profile === 'object' ? profile.baseURL : undefined
      return typeof baseURL === 'string' && baseURL.trim() !== '' ? baseURL : null
    } catch (e) {
      if (warn) warn(`provider directory lookup failed for "${providerId}": ${String(e && e.message || e)}`)
      return null
    }
  }

  /**
   * 判定某路由是否官方源（端点优先 + id 兜底）。
   * @param {string} providerId
   * @returns {{official:boolean, matchedBy:'explicit'|'endpoint'|'endpoint-default'|'route-id'|'unknown'}}
   */
  function classify(providerId) {
    const cfg = readCfg()
    return classifyProvider(providerId, {
      endpoint: endpointOf(providerId),
      officialProviders: cfg.officialProviders,
      officialHosts: cfg.officialBaseURLs,
    })
  }

  /** 带可解释信息的判定结果（日志 / 路由诊断用）。 */
  function describe(providerId) {
    const r = classify(providerId)
    return { provider: providerId, official: r.official, matchedBy: r.matchedBy, endpoint: endpointOf(providerId) }
  }

  return { classify, describe, endpointOf, entries }
}

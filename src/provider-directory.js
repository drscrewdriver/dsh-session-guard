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

/** 单个路由的模型发现超时（毫秒）。 */
const DISCOVERY_TIMEOUT_MS = 3000

/** 超时哨兵（不是数组，调用侧的 `Array.isArray` 会自然忽略它）。 */
const DISCOVERY_TIMEOUT = Symbol('model-discovery-timeout')

/**
 * 给模型发现加超时。
 *
 * `llm.listModels` 是**可能不 settle** 的外部调用（适配器里可能带网络发现）：没有超时的话
 * `GET /session-guard/models` 会一直挂着，设置卡片/徽标面板就永远停在「获取中…」。
 */
function timeoutAfter(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(DISCOVERY_TIMEOUT), ms)
    if (t && typeof t.unref === 'function') t.unref()
  })
}

/**
 * @param {object} deps
 * @param {object} deps.ctx host context（需 `get` / `settings`，两者缺失均降级）
 * @param {()=>object} deps.getSettings 读实时配置（officialProviders / officialBaseURLs）
 * @param {(msg:string)=>void} [deps.warn] 诊断日志
 * @returns {{classify:(providerId:string, model?:string|null)=>{official:boolean,matchedBy:string}, describe:(providerId:string, model?:string|null)=>object, endpointOf:(providerId:string)=>string|null, entries:()=>object[], models:()=>Promise<object[]>}}
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
   * 安全取 `settings` 服务。
   *
   * **不能直接写 `ctx.settings`**：cordis 的服务属性是带守卫的 getter，未在 `inject` 里
   * 声明就访问会**直接抛错**（`cannot get property "settings" without inject`），而不是
   * 返回 undefined。本仓库的 0.1.7+ 线为了兼容声明式设置已经**不再 inject `settings`**，
   * 于是这里每次都会抛 → 端点查询恒为 null → 判定退化成「只按 id 猜」，
   * 「名为 deepseek-official 但 baseURL 已指向中转」这类配置会被**误拦**。
   * 统一经 `ctx.get()` 取，取不到就是 undefined。
   * @returns {object|undefined}
   */
  function settingsService() {
    try {
      if (ctx && typeof ctx.get === 'function') {
        const viaGet = ctx.get('settings')
        if (viaGet !== undefined && viaGet !== null) return viaGet
      }
    } catch {
      /* 取不到继续退化 */
    }
    try {
      return ctx && ctx.settings
    } catch {
      return undefined
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
      const settings = settingsService()
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
   * 判定某路由 + 模型是否官方源（模型名关键字 → 端点 → id 兜底）。
   * @param {string} providerId
   * @param {string|null} [model] 这次请求真正要用的模型名（判定「名字带 deepseek」用）
   * @returns {{official:boolean, matchedBy:'explicit'|'model-pattern'|'endpoint'|'endpoint-default'|'route-id'|'unknown'}}
   */
  function classify(providerId, model) {
    const cfg = readCfg()
    return classifyProvider(providerId, {
      model,
      endpoint: endpointOf(providerId),
      officialProviders: cfg.officialProviders,
      officialModelPatterns: cfg.officialModelPatterns,
      officialHosts: cfg.officialBaseURLs,
    })
  }

  /** 带可解释信息的判定结果（日志 / 路由诊断用）。 */
  function describe(providerId, model) {
    const r = classify(providerId, model)
    return { provider: providerId, model: model ?? null, official: r.official, matchedBy: r.matchedBy, endpoint: endpointOf(providerId) }
  }

  /**
   * 当前可用模型目录：各路由**自报**的模型（`llm.listModels`）。
   *
   * 给设置卡片的「高峰拦截列表」勾选用。逐路由独立 try/catch —— 单个路由发现失败（网络、
   * 适配器未实现 discovery）只丢它自己；`llm` 服务缺失 → 空数组。模型项形状兼容
   * `LlmModelInfo` 对象（取 `id`）与裸字符串。
   *
   * @returns {Promise<Array<{provider:string, model:string, source:'catalog'}>>}
   */
  async function models() {
    const out = []
    let llm
    try {
      llm = ctx && typeof ctx.get === 'function' ? ctx.get('llm') : null
    } catch {
      return out
    }
    if (!llm || typeof llm.listModels !== 'function') return out
    for (const entry of entries()) {
      const provider = entry && typeof entry.provider === 'string' ? entry.provider : ''
      if (provider === '') continue
      let list
      try {
        const raced = await Promise.race([llm.listModels(provider), timeoutAfter(DISCOVERY_TIMEOUT_MS)])
        list = raced === DISCOVERY_TIMEOUT ? [] : raced
      } catch (e) {
        if (warn) warn(`model discovery failed for "${provider}": ${String(e && e.message || e)}`)
        list = []
      }
      for (const item of Array.isArray(list) ? list : []) {
        const model = typeof item === 'string' ? item : item && typeof item.id === 'string' ? item.id : ''
        if (model !== '') out.push({ provider, model, source: 'catalog' })
      }
    }
    return out
  }

  return { classify, describe, endpointOf, entries, models }
}

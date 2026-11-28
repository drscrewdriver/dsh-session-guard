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
import type { ProviderVerdict } from './provider.js'

/** 目录条目（llm.listConfigurableProviders 返回项的最小读面）。 */
export interface DirectoryEntry {
  provider?: string
  settingsNs?: string
  settingsPath?: unknown
  [k: string]: unknown
}

/** 带可解释信息的判定结果。 */
export interface ProviderDescription extends ProviderVerdict {
  provider: string
  endpoint: string | null
}

/** 目录依赖注入面。 */
export interface ProviderDirectoryDeps {
  ctx: {
    get?(name: string): unknown
    settings?: { get?(ns: unknown): unknown }
  }
  getSettings?: () => unknown
  warn?: (msg: string) => void
}

/** 目录对外面。 */
export interface ProviderDirectory {
  classify(providerId: string): ProviderVerdict
  describe(providerId: string): ProviderDescription
  endpointOf(providerId: string): string | null
  entries(): DirectoryEntry[]
}

/** 逐层按 path 取值；任一层不是对象即返回 undefined。 */
function pickPath(root: unknown, path: readonly string[]): unknown {
  let cur: unknown = root
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
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
export function createProviderDirectory({ ctx, getSettings, warn }: ProviderDirectoryDeps): ProviderDirectory {
  function readCfg(): Record<string, unknown> {
    try {
      const v = typeof getSettings === 'function' ? getSettings() : undefined
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  /** 目录条目（llm 服务缺失 / 抛错 → 空数组）。 */
  function entries(): DirectoryEntry[] {
    try {
      const llm = ctx && typeof ctx.get === 'function' ? ctx.get('llm') : null
      const svc = llm as { listConfigurableProviders?: () => unknown } | null | undefined
      if (!svc || typeof svc.listConfigurableProviders !== 'function') return []
      const list = svc.listConfigurableProviders()
      return Array.isArray(list) ? (list as DirectoryEntry[]) : []
    } catch {
      return []
    }
  }

  /**
   * 读某路由的实时端点（`baseURL`）；取不到返回 null。
   * @param {string} providerId
   * @returns {string|null}
   */
  function endpointOf(providerId: string): string | null {
    if (typeof providerId !== 'string' || providerId === '') return null
    try {
      const entry = entries().find((e) => e && e.provider === providerId)
      if (!entry) return null
      const settings = ctx && ctx.settings
      if (!settings || typeof settings.get !== 'function') return null
      const section = settings.get(entry.settingsNs)
      const profile = pickPath(section, Array.isArray(entry.settingsPath) ? entry.settingsPath : [])
      const baseURL = profile && typeof profile === 'object' ? (profile as { baseURL?: unknown }).baseURL : undefined
      return typeof baseURL === 'string' && baseURL.trim() !== '' ? baseURL : null
    } catch (e) {
      if (warn) warn(`provider directory lookup failed for "${providerId}": ${String((e as Error)?.message || e)}`)
      return null
    }
  }

  /**
   * 判定某路由是否官方源（端点优先 + id 兜底）。
   * @param {string} providerId
   * @returns {{official:boolean, matchedBy:'explicit'|'endpoint'|'endpoint-default'|'route-id'|'unknown'}}
   */
  function classify(providerId: string): ProviderVerdict {
    const cfg = readCfg()
    const asStringList = (v: unknown): readonly string[] | undefined =>
      Array.isArray(v) ? (v.filter((x): x is string => typeof x === 'string')) : undefined
    return classifyProvider(providerId, {
      endpoint: endpointOf(providerId),
      officialProviders: asStringList(cfg.officialProviders),
      officialHosts: asStringList(cfg.officialBaseURLs),
    })
  }

  /** 带可解释信息的判定结果（日志 / 路由诊断用）。 */
  function describe(providerId: string): ProviderDescription {
    const r = classify(providerId)
    return { provider: providerId, official: r.official, matchedBy: r.matchedBy, endpoint: endpointOf(providerId) }
  }

  return { classify, describe, endpointOf, entries }
}

/**
 * dsh-session-guard — 官方 provider 判定（纯函数，零依赖，可单测）。
 *
 * 目标：判断「这次请求真正要去的路由」是不是 DeepSeek 官方源。
 *
 * 判定口径（优先级从高到低）：
 *   1. `officialProviders` 显式名单（用户最高优先，精确 id 匹配）
 *   2. 实时端点 `baseURL`（归一化 host 后与官方 host 名单比对）
 *   3. 内置端点兜底（catalog 默认端点，如 pi-ai 的 `deepseek`）
 *   4. 内置 id 名单（`deepseek-official`）
 *   5. 未知 → 非官方
 *
 * 端点优先的理由（见 findings F3）：
 * - 名为 `deepseek-official` 但把 `baseURL` 改到中转的配置必须**不拦**（第 2 步先命中）；
 * - pi-ai 内置 `deepseek` 路由的 catalog 端点就是官方 API，只按 id 会**漏拦**（第 3 步兜底）。
 *
 * 纯函数：不读 ctx / settings / 网络，输入即输出，便于穷举判定矩阵。
 */

/** 内置官方 provider id 名单（catalog 路由 id）。 */
export const BUILTIN_OFFICIAL_IDS = Object.freeze(['deepseek-official'])

/**
 * 内置路由 → 默认端点映射。
 * - `deepseek-official`：`dsh-llm-deepseek` 的 `PUBLIC_BASE_URL`（schema 无默认值，用户没配时用它兜底）。
 * - `deepseek`：pi-ai 内置 catalog 的两个模型 `baseUrl` 均为官方端点（本机 pi-ai 0.82.1 实测）。
 */
export const BUILTIN_OFFICIAL_ENDPOINTS = Object.freeze({
  'deepseek-official': 'https://api.deepseek.com',
  deepseek: 'https://api.deepseek.com',
})

/** 默认官方端点 host 名单（`officialBaseURLs` 设置项可增删）。 */
export const DEFAULT_OFFICIAL_HOSTS = Object.freeze(['api.deepseek.com'])

/** `matchedBy` 的全部合法取值。 */
export const MATCHED_BY = Object.freeze(['explicit', 'endpoint', 'endpoint-default', 'route-id', 'unknown'])

/**
 * 归一化端点 → host（小写、无协议、无 www.、无端口、无路径）。
 *
 * 接受 `https://API.DeepSeek.com/v1`、`//host/path`、`host:8200`、裸 `host`；
 * 非法值（空串 / null / 含空格 / 非字符串）返回 `null`。
 * @param {unknown} raw 原始端点（provider 的 `baseURL`）
 * @returns {string|null} 归一化后的 host，或 null
 */
export function normalizeEndpoint(raw) {
  if (typeof raw !== 'string') return null
  let s = raw.trim().toLowerCase()
  if (s === '') return null
  // 剥协议（http:// https:// 或协议相对 //）
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  s = s.replace(/^\/\//, '')
  // 剥 userinfo（user:pass@host）
  const at = s.indexOf('@')
  if (at !== -1) s = s.slice(at + 1)
  // 剥路径 / 查询 / 片段
  s = s.split(/[/?#]/, 1)[0]
  if (s === '') return null
  // 剥端口（IPv6 形如 [::1]:8200 只取括号内）
  if (s.startsWith('[')) {
    const close = s.indexOf(']')
    if (close === -1) return null
    const host6 = s.slice(1, close)
    return /^[0-9a-f:.]+$/.test(host6) ? host6 : null
  }
  s = s.replace(/:\d+$/, '')
  if (s === '') return null
  // 剥前导 www.
  s = s.replace(/^www\./, '')
  if (s === '') return null
  // host 合法性：字母数字 + 连字符 + 点（拒绝空格、下划线、非 ASCII 等）
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/.test(s)) return null
  return s
}

/**
 * host 是否属于官方端点名单（精确匹配，名单项同样归一化）。
 * @param {string|null} host 归一化 host
 * @param {readonly string[]|undefined} hosts 官方 host 名单（可含协议/端口，会被归一化）
 * @returns {boolean}
 */
export function isOfficialEndpoint(host, hosts) {
  if (typeof host !== 'string' || host === '') return false
  const list = Array.isArray(hosts) && hosts.length > 0 ? hosts : DEFAULT_OFFICIAL_HOSTS
  for (const item of list) {
    const norm = normalizeEndpoint(item)
    if (norm !== null && norm === host) return true
  }
  return false
}

/**
 * 五级判定：这次请求的目标 provider 是否官方源。
 * @param {string} providerId 路由 id（`next()` 返回值里的 `config.provider`）
 * @param {object} [options]
 * @param {string|null} [options.endpoint] 实时端点（settings 里的 `baseURL`，取不到为 null）
 * @param {readonly string[]} [options.officialProviders] 用户显式追加的官方 id
 * @param {readonly string[]} [options.officialHosts] 官方端点 host 名单
 * @param {readonly string[]} [options.builtinIds] 内置官方 id 名单
 * @param {Record<string,string>} [options.builtinEndpoints] 内置路由 → 默认端点
 * @returns {{official: boolean, matchedBy: 'explicit'|'endpoint'|'endpoint-default'|'route-id'|'unknown'}}
 */
export function classifyProvider(providerId, options = {}) {
  const id = typeof providerId === 'string' ? providerId.trim() : ''
  const explicit = Array.isArray(options.officialProviders) ? options.officialProviders : []
  const hosts = options.officialHosts
  const builtinIds = Array.isArray(options.builtinIds) ? options.builtinIds : BUILTIN_OFFICIAL_IDS
  const builtinEndpoints =
    options.builtinEndpoints && typeof options.builtinEndpoints === 'object'
      ? options.builtinEndpoints
      : BUILTIN_OFFICIAL_ENDPOINTS

  // 1) 用户显式名单最高优先（精确 id，大小写敏感以保持可预测）
  if (id !== '' && explicit.some((x) => typeof x === 'string' && x === id)) {
    return { official: true, matchedBy: 'explicit' }
  }

  // 2) 实时端点优先于 id：中转改到别处 → 不拦
  const endpointHost = normalizeEndpoint(options.endpoint)
  if (endpointHost !== null) {
    return { official: isOfficialEndpoint(endpointHost, hosts), matchedBy: 'endpoint' }
  }

  // 3) 内置端点兜底（catalog 默认端点，插件看不到 settings 时的官方路由）
  const builtinRaw = id !== '' ? builtinEndpoints[id] : undefined
  const builtinHost = normalizeEndpoint(builtinRaw)
  if (builtinHost !== null) {
    return { official: isOfficialEndpoint(builtinHost, hosts), matchedBy: 'endpoint-default' }
  }

  // 4) 内置 id 兜底
  if (id !== '' && builtinIds.some((x) => typeof x === 'string' && x === id)) {
    return { official: true, matchedBy: 'route-id' }
  }

  // 5) 未知 → 非官方（fail-open：非官方即放行，绝不在未知路径上拦）
  return { official: false, matchedBy: 'unknown' }
}

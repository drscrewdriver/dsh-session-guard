/**
 * dsh-session-guard — 官方 provider 判定（纯函数，零依赖，可单测）。
 *
 * 目标：判断「这次请求真正要去的路由」是不是 DeepSeek 官方源。
 *
 * 判定口径（优先级从高到低）：
 *   1. `officialProviders` 显式名单（用户最高优先，精确 id 匹配）
 *   2. **模型名关键字**（`officialModelPatterns`，按正则判包含：名字里带 `deepseek` 的模型，
 *      无论跑在哪个路由上，都算官方 —— 中转/本地源转发 deepseek 模型同样吃官方计费）
 *   3. 实时端点 `baseURL`（归一化 host 后与官方 host 名单比对）
 *   4. 内置端点兜底（catalog 默认端点，如 pi-ai 的 `deepseek`）
 *   5. 内置 id 名单（`deepseek-official`）
 *   6. 未知 → 非官方
 *
 * 端点优先的理由（见 findings F3）：
 * - 名为 `deepseek-official` 但把 `baseURL` 改到中转的配置**按 id 本不该拦**（第 3 步先命中）；
 * - pi-ai 内置 `deepseek` 路由的 catalog 端点就是官方 API，只按 id 会**漏拦**（第 4 步兜底）。
 *
 * ⚠️ 第 2 步**先于**端点，且判定依据是 `model`：这是「deepseek 名字 = 官方计费」的直接表达 ——
 * 只按 provider id 判会让「本地源转发 deepseek 模型」漏拦。要放行某类名字，把
 * `officialModelPatterns` 收窄或置空即可（配置项，无需改代码）。
 *
 * 纯函数：不读 ctx / settings / 网络，输入即输出，便于穷举判定矩阵。
 */

/** 内置官方 provider id 名单（catalog 路由 id）。 */
export const BUILTIN_OFFICIAL_IDS = Object.freeze(['deepseek-official'])

/**
 * 内置官方**模型名**关键字名单（自动匹配，默认 `deepseek`）。
 *
 * 每一项都是正则源码，匹配语义为「包含」（大小写不敏感）：`'deepseek'` 即命中
 * `deepseek-v4-pro` / `ocg/deepseek-flash` / `DeepSeek-Chat`。因此**将来新增的模型只要名字带
 * deepseek 就自动纳入**，不需要任何手工维护；要排掉/放宽某类名字，改配置项即可。
 */
export const BUILTIN_OFFICIAL_MODEL_PATTERNS = Object.freeze(['deepseek'])

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
export const MATCHED_BY = Object.freeze(['explicit', 'model-pattern', 'endpoint', 'endpoint-default', 'route-id', 'unknown'])

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
 * 模型名关键字 / 正则的长度上限：超过即视为不安全（见 `isUnsafePattern`）。
 * 模型名本身很短，正常关键字远小于此值。
 */
export const MAX_PATTERN_LENGTH = 200

/**
 * 静态安全筛查：拒绝会引发**灾难性回溯**（ReDoS）的写法 —— 把量词套在「本身已含量词的组」上，
 * 例如 `(a+)+` / `(\d*)*` / `((a+)+)+`。
 *
 * 为什么必须静态拒绝：JS 没有同步的正则匹配超时，`new RegExp` 只能抓语法错，抓不到这种
 * 「合法但指数级」的写法 —— 它在 `agent/request` 判定、`maybeAutoResume`、step 门判定里
 * 每步都会跑，一条坏配置就能把整个高峰期的请求全卡死（实测 `(a+)+$` 对 41 字符输入耗时 88s）。
 * 残留风险：分支重叠的交替（如 `(a|a)+`）覆盖不到，已在 README / CHANGELOG 写明。
 *
 * @param {unknown} src 正则源码
 * @returns {boolean} true = 不安全，必须跳过（判定侧跳过即「不命中」）
 */
export function isUnsafePattern(src) {
  if (typeof src !== 'string' || src === '') return true
  if (src.length > MAX_PATTERN_LENGTH) return true
  return /\([^)]*[*+{][^)]*\)\s*[*+{]/.test(src)
}

/** 编译缓存（源码 → RegExp | null）；上限 64 条，异常配置不会把缓存写肿。 */
const PATTERN_CACHE = new Map()

/** 编译一条关键字（不安全 / 语法错 → null）。命中缓存走缓存。 */
function compilePattern(src) {
  if (PATTERN_CACHE.has(src)) return PATTERN_CACHE.get(src)
  let re = null
  if (!isUnsafePattern(src)) {
    try {
      re = new RegExp(src, 'i')
    } catch {
      re = null
    }
  }
  if (PATTERN_CACHE.size >= 64) PATTERN_CACHE.clear()
  PATTERN_CACHE.set(src, re)
  return re
}

/**
 * 模型名是否命中关键字名单（**包含**语义：正则 `test`，大小写不敏感）。
 *
 * 每一项按**正则源码**编译，`'deepseek'` 即命中 `deepseek-v4-pro` / `ocg/deepseek-flash`；
 * 编译失败 / 不安全（见 `isUnsafePattern`）/ 非字符串 / 空串的条目被跳过（fail-open：
 * 绝不让一条写坏的配置把判定抛挂，配置边界另有 `configFile.errors` 记录）。
 * `patterns` 传空数组 = 关闭该判定。
 *
 * @param {unknown} model 这次请求真正要用的模型名（`config.model`）
 * @param {readonly string[]|undefined} patterns 关键字 / 正则源码名单（未传 → 内置默认）
 * @returns {boolean}
 */
export function matchesModelPattern(model, patterns) {
  if (typeof model !== 'string' || model.trim() === '') return false
  const list = Array.isArray(patterns) ? patterns : BUILTIN_OFFICIAL_MODEL_PATTERNS
  const name = model.trim()
  for (const raw of list) {
    if (typeof raw !== 'string' || raw === '') continue
    const re = compilePattern(raw)
    if (re !== null && re.test(name)) return true
  }
  return false
}

/**
 * 六级判定：这次请求的目标 provider 是否官方源。
 * @param {string} providerId 路由 id（`next()` 返回值里的 `config.provider`）
 * @param {object} [options]
 * @param {string|null} [options.endpoint] 实时端点（settings 里的 `baseURL`，取不到为 null）
 * @param {string|null} [options.model] 这次请求真正要用的模型名（判定「名字带 deepseek」用）
 * @param {readonly string[]} [options.officialProviders] 用户显式追加的官方 id
 * @param {readonly string[]} [options.officialModelPatterns] 官方模型名关键字 / 正则（含 `deepseek`）
 * @param {readonly string[]} [options.officialHosts] 官方端点 host 名单
 * @param {readonly string[]} [options.builtinIds] 内置官方 id 名单
 * @param {Record<string,string>} [options.builtinEndpoints] 内置路由 → 默认端点
 * @returns {{official: boolean, matchedBy: 'explicit'|'model-pattern'|'endpoint'|'endpoint-default'|'route-id'|'unknown'}}
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

  // 2) 模型名关键字（默认含 deepseek）：名字即计费口径 —— 中转/本地源转发 deepseek 模型
  //    同样按官方处理，否则「切到本地源就连官方计费一起绕过」。
  if (matchesModelPattern(options.model, options.officialModelPatterns)) {
    return { official: true, matchedBy: 'model-pattern' }
  }

  // 3) 实时端点优先于 id：中转改到别处 → 不拦
  const endpointHost = normalizeEndpoint(options.endpoint)
  if (endpointHost !== null) {
    return { official: isOfficialEndpoint(endpointHost, hosts), matchedBy: 'endpoint' }
  }

  // 4) 内置端点兜底（catalog 默认端点，插件看不到 settings 时的官方路由）
  const builtinRaw = id !== '' ? builtinEndpoints[id] : undefined
  const builtinHost = normalizeEndpoint(builtinRaw)
  if (builtinHost !== null) {
    return { official: isOfficialEndpoint(builtinHost, hosts), matchedBy: 'endpoint-default' }
  }

  // 5) 内置 id 兜底
  if (id !== '' && builtinIds.some((x) => typeof x === 'string' && x === id)) {
    return { official: true, matchedBy: 'route-id' }
  }

  // 6) 未知 → 非官方（fail-open：非官方即放行，绝不在未知路径上拦）
  return { official: false, matchedBy: 'unknown' }
}

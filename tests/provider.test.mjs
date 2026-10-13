/**
 * provider.js 测试：端点归一化 + 六级官方判定矩阵（含 v0.3.1 的模型名关键字层）。
 *
 * 覆盖 checklist 的三组硬要求：
 * - 归一化 8 例（协议/大小写/端口/路径/协议相对/裸 host/空/null/非法）
 * - 判定矩阵 6 例（显式名单 / 端点命中 / 端点未命中 / 内置端点 / 仅 id / unknown）
 * - 两个回归：中转误判（deepseek-official 指向中转必须不拦）+ pi-ai 漏判（deepseek 无端点必须拦）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeEndpoint,
  isOfficialEndpoint,
  classifyProvider,
  matchesModelPattern,
  isUnsafePattern,
  BUILTIN_OFFICIAL_IDS,
  BUILTIN_OFFICIAL_ENDPOINTS,
  BUILTIN_OFFICIAL_MODEL_PATTERNS,
  DEFAULT_OFFICIAL_HOSTS,
  MATCHED_BY,
} from '../src/provider.js'

test('normalizeEndpoint：协议 / 大小写 / 路径', () => {
  assert.equal(normalizeEndpoint('https://api.deepseek.com'), 'api.deepseek.com')
  assert.equal(normalizeEndpoint('https://API.DeepSeek.com/v1'), 'api.deepseek.com')
})

test('normalizeEndpoint：端口 / 协议相对 / 裸 host', () => {
  assert.equal(normalizeEndpoint('http://host:8200/v1'), 'host')
  assert.equal(normalizeEndpoint('//host/path'), 'host')
  assert.equal(normalizeEndpoint('host'), 'host')
})

test('normalizeEndpoint：空值 / 非字符串 / 非法', () => {
  assert.equal(normalizeEndpoint(''), null)
  assert.equal(normalizeEndpoint(null), null)
  assert.equal(normalizeEndpoint('not a url'), null)
})

test('normalizeEndpoint：更多边界（userinfo / 尾斜杠 / www / 查询）', () => {
  assert.equal(normalizeEndpoint('https://user:pass@api.deepseek.com/v1?x=1'), 'api.deepseek.com')
  assert.equal(normalizeEndpoint('api.deepseek.com/'), 'api.deepseek.com')
  assert.equal(normalizeEndpoint('https://www.api.deepseek.com'), 'api.deepseek.com')
  assert.equal(normalizeEndpoint('https://'), null)
  assert.equal(normalizeEndpoint(undefined), null)
  assert.equal(normalizeEndpoint(123), null)
})

test('isOfficialEndpoint：名单项会被归一化后精确比对', () => {
  assert.equal(isOfficialEndpoint('api.deepseek.com', DEFAULT_OFFICIAL_HOSTS), true)
  assert.equal(isOfficialEndpoint('api.deepseek.com', ['https://API.DeepSeek.com/v1']), true)
  assert.equal(isOfficialEndpoint('relay.example.com', DEFAULT_OFFICIAL_HOSTS), false)
  assert.equal(isOfficialEndpoint(null, DEFAULT_OFFICIAL_HOSTS), false)
  // 名单为空 → 回退默认名单
  assert.equal(isOfficialEndpoint('api.deepseek.com', []), true)
})

test('classifyProvider 矩阵 1：显式名单命中（最高优先，压过端点）', () => {
  const r = classifyProvider('my-relay', {
    endpoint: 'https://relay.example.com/v1',
    officialProviders: ['my-relay'],
  })
  assert.deepEqual(r, { official: true, matchedBy: 'explicit' })
})

test('classifyProvider 矩阵 2：端点命中官方', () => {
  const r = classifyProvider('some-route', { endpoint: 'https://api.deepseek.com/v1' })
  assert.deepEqual(r, { official: true, matchedBy: 'endpoint' })
})

test('classifyProvider 矩阵 3：端点未命中（自建中转）', () => {
  const r = classifyProvider('some-route', { endpoint: 'http://192.168.100.242:8200/v1' })
  assert.deepEqual(r, { official: false, matchedBy: 'endpoint' })
})

test('classifyProvider 矩阵 4：内置端点兜底（catalog 默认端点）', () => {
  const r = classifyProvider('deepseek', { endpoint: null })
  assert.deepEqual(r, { official: true, matchedBy: 'endpoint-default' })
})

test('classifyProvider 矩阵 5：仅 id 兜底（无端点、无内置端点）', () => {
  const r = classifyProvider('custom-official', { builtinIds: ['custom-official'], builtinEndpoints: {} })
  assert.deepEqual(r, { official: true, matchedBy: 'route-id' })
  // 默认名单下 deepseek-official 由内置端点兜底（catalog 默认端点可见）
  assert.deepEqual(classifyProvider('deepseek-official', {}), { official: true, matchedBy: 'endpoint-default' })
})

test('classifyProvider 矩阵 6：全 unknown → 非官方（fail-open）', () => {
  assert.deepEqual(classifyProvider('local-35b', {}), { official: false, matchedBy: 'unknown' })
  assert.deepEqual(classifyProvider('', {}), { official: false, matchedBy: 'unknown' })
  assert.deepEqual(classifyProvider(undefined, {}), { official: false, matchedBy: 'unknown' })
})

test('回归·中转误判：deepseek-official 指向中转 → 必须不拦', () => {
  const r = classifyProvider('deepseek-official', { endpoint: 'https://relay.example.com/v1' })
  assert.equal(r.official, false)
  assert.equal(r.matchedBy, 'endpoint')
})

test('回归·pi-ai 漏判：deepseek 无显式端点 → 必须拦', () => {
  const r = classifyProvider('deepseek', { endpoint: null })
  assert.equal(r.official, true)
  assert.equal(r.matchedBy, 'endpoint-default')
})

test('matchedBy 取值集合固定', () => {
  const seen = new Set()
  for (const opts of [
    { officialProviders: ['a'] },
    { endpoint: 'https://api.deepseek.com' },
    { endpoint: 'https://relay.example.com' },
    {},
    { endpoint: 'not a url' },
  ]) {
    seen.add(classifyProvider('a', opts).matchedBy)
    seen.add(classifyProvider('deepseek', opts).matchedBy)
  }
  for (const v of seen) assert.ok(MATCHED_BY.includes(v), `unexpected matchedBy ${v}`)
})

test('内置名单常量形状', () => {
  assert.deepEqual([...BUILTIN_OFFICIAL_IDS], ['deepseek-official'])
  assert.equal(BUILTIN_OFFICIAL_ENDPOINTS['deepseek-official'], 'https://api.deepseek.com')
  assert.equal(BUILTIN_OFFICIAL_ENDPOINTS.deepseek, 'https://api.deepseek.com')
  assert.deepEqual([...DEFAULT_OFFICIAL_HOSTS], ['api.deepseek.com'])
})

test('officialBaseURLs 自定义：名单覆盖默认', () => {
  const r = classifyProvider('relay', {
    endpoint: 'https://relay.internal/v1',
    officialHosts: ['relay.internal'],
  })
  assert.deepEqual(r, { official: true, matchedBy: 'endpoint' })
  // 默认名单被替换后，api.deepseek.com 不再是官方
  const r2 = classifyProvider('x', { endpoint: 'https://api.deepseek.com', officialHosts: ['relay.internal'] })
  assert.deepEqual(r2, { official: false, matchedBy: 'endpoint' })
})

test('内置端点归一化失败时继续走 id 兜底', () => {
  const r = classifyProvider('deepseek-official', { builtinEndpoints: { 'deepseek-official': 'not a url' } })
  assert.deepEqual(r, { official: true, matchedBy: 'route-id' })
})

// ── v0.3.1：模型名关键字（默认 `deepseek`，正则包含语义，自动覆盖将来新增的模型）──

test('matchesModelPattern：包含语义 + 大小写不敏感 + 正则', () => {
  assert.equal(matchesModelPattern('deepseek-v4-pro'), true)
  assert.equal(matchesModelPattern('ocg/deepseek-flash'), true, '中转前缀也算命中（包含关系）')
  assert.equal(matchesModelPattern('DeepSeek-Chat'), true, '大小写不敏感')
  assert.equal(matchesModelPattern('qwen3.5-flash'), false)
  assert.equal(matchesModelPattern('deep-seek'), false, '包含的是 deepseek 连写，不拆分')
  // 正则源码：锚定 / 交替 / 分组都能用
  assert.equal(matchesModelPattern('my-deepseek-lab', ['^my-']), true)
  assert.equal(matchesModelPattern('a-v4-pro', ['^(deepseek|a)-v4']), true)
  // 空 / 非字符串 / 非字符串名单项
  assert.equal(matchesModelPattern('', ['deepseek']), false)
  assert.equal(matchesModelPattern(null, ['deepseek']), false)
  assert.equal(matchesModelPattern('deepseek-x', [null, 7, '']), false, '垃圾项跳过')
})

test('matchesModelPattern：写坏的正则条目跳过后仍能命中其他条目', () => {
  assert.equal(matchesModelPattern('deepseek-v4-pro', ['[', 'deepseek']), true)
})

test('matchesModelPattern：显式空数组 = 关闭该判定（不回退内置默认）', () => {
  assert.equal(matchesModelPattern('deepseek-v4-pro', []), false)
  assert.equal(matchesModelPattern('deepseek-v4-pro', undefined), true, '未配置 → 内置默认 deepseek')
})

test('classifyProvider 矩阵 7：模型名关键字先于端点（本地路由 + deepseek 模型 → 官方）', () => {
  const r = classifyProvider('my-relay', { endpoint: 'https://relay.example.com/v1', model: 'ocg/deepseek-flash' })
  assert.deepEqual(r, { official: true, matchedBy: 'model-pattern' })
  // 同一路由换非 deepseek 模型 → 端点判定照旧（非官方）
  const r2 = classifyProvider('my-relay', { endpoint: 'https://relay.example.com/v1', model: 'qwen3.5-flash' })
  assert.deepEqual(r2, { official: false, matchedBy: 'endpoint' })
})

test('classifyProvider 矩阵 8：模型名关键字压过「官方 id 指向中转」的端点结论', () => {
  // 文档口径里「deepseek-official 改到中转 → 不拦」；但模型名带 deepseek 时按名字判官方
  const r = classifyProvider('deepseek-official', { endpoint: 'https://relay.example.com/v1', model: 'deepseek-v4-pro' })
  assert.deepEqual(r, { official: true, matchedBy: 'model-pattern' })
})

test('classifyProvider 矩阵 9：显式名单仍最高优先；自定义关键字可替换默认', () => {
  const r = classifyProvider('my-relay', { officialProviders: ['my-relay'], model: 'ocg/deepseek-flash' })
  assert.deepEqual(r, { official: true, matchedBy: 'explicit' })
  // 自定义名单不含 deepseek → 不再按 deepseek 判
  const r2 = classifyProvider('my-relay', { model: 'ocg/deepseek-flash', officialModelPatterns: ['^relay-'] })
  assert.deepEqual(r2, { official: false, matchedBy: 'unknown' })
  const r3 = classifyProvider('my-relay', { model: 'relay-x', officialModelPatterns: ['^relay-'] })
  assert.deepEqual(r3, { official: true, matchedBy: 'model-pattern' })
})

test('classifyProvider：无 model / 空 model 时不影响既有判定（行为不变）', () => {
  assert.deepEqual(classifyProvider('deepseek-official', { endpoint: 'https://api.deepseek.com' }), {
    official: true,
    matchedBy: 'endpoint',
  })
  assert.deepEqual(classifyProvider('deepseek-official', { model: '' }), { official: true, matchedBy: 'endpoint-default' })
  assert.deepEqual(classifyProvider('relay', { model: null }), { official: false, matchedBy: 'unknown' })
})

test('内置模型名关键字常量形状', () => {
  assert.deepEqual([...BUILTIN_OFFICIAL_MODEL_PATTERNS], ['deepseek'])
})

// ── ReDoS 防线：合法但指数级的写法必须在配置边界被拒（实测 (a+)+$ 对 41 字符耗时 88s）──

test('isUnsafePattern：嵌套量词 / 超长 / 语法垃圾一律判不安全', () => {
  for (const bad of ['(a+)+', '(a+)+$', '(\\d*)*', '((a+)+)+', '(x{1,9})+', 'a'.repeat(201)]) {
    assert.equal(isUnsafePattern(bad), true, `${bad} 应判为不安全`)
  }
  for (const ok of ['deepseek', '^my-', '(deepseek|qwen)-v4', 'a+', '[a-z]+-flash']) {
    assert.equal(isUnsafePattern(ok), false, `${ok} 应判为安全`)
  }
  assert.equal(isUnsafePattern(''), true)
  assert.equal(isUnsafePattern(null), true)
})

test('matchesModelPattern：不安全条目被跳过，其余条目照常命中（绝不卡死）', () => {
  const started = Date.now()
  // 若 (a+)+ 真被拿去匹配，这一行会跑几十秒；必须秒回 false（跳过）+ 命中后面的 deepseek
  assert.equal(matchesModelPattern(`${'a'.repeat(40)}!`, ['(a+)+$']), false)
  assert.equal(matchesModelPattern('ocg/deepseek-flash', ['(a+)+$', 'deepseek']), true)
  assert.ok(Date.now() - started < 2000, '不安全条目必须不参与匹配')
})

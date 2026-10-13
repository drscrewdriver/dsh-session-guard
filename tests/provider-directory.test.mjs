/**
 * provider-directory.js 测试：端点读取 + 全链路降级（fail-open）。
 *
 * 注入 fake ctx 覆盖：无 llm 服务 / 无目录条目 / 有条目带 baseURL / 非法 baseURL /
 * settings.get 抛错 / settingsPath 逐层缺失 / llm 抛错。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createProviderDirectory } from '../src/provider-directory.js'

const CFG = { officialProviders: [], officialBaseURLs: ['api.deepseek.com'] }

/** fake ctx：services 由 `get` 返回，settings 单独注入。 */
function fakeCtx({ services = {}, settings } = {}) {
  return {
    get: (name) => services[name],
    settings,
  }
}

/** fake llm 服务：listConfigurableProviders 返回给定目录；listModels 按 provider 返回模型。 */
function fakeLlm(entries, { throwOnList = false, models = {}, throwOnModels = [] } = {}) {
  return {
    listConfigurableProviders: () => {
      if (throwOnList) throw new Error('boom')
      return entries
    },
    listModels: (provider) => {
      if (throwOnModels.includes(provider)) return Promise.reject(new Error('discovery boom'))
      return Promise.resolve(models[provider] ?? [])
    },
  }
}

/** fake settings 服务：按 ns 返回值，可整体抛错。 */
function fakeSettings(values, { throwOnGet = false } = {}) {
  return {
    get: (ns) => {
      if (throwOnGet) throw new Error('settings exploded')
      return values[ns]
    },
  }
}

test('无 llm 服务 → 降级为 id 判定', () => {
  const d = createProviderDirectory({ ctx: fakeCtx({}), getSettings: () => CFG })
  assert.deepEqual(d.classify('deepseek-official'), { official: true, matchedBy: 'endpoint-default' })
  assert.deepEqual(d.classify('local-35b'), { official: false, matchedBy: 'unknown' })
  assert.equal(d.endpointOf('deepseek-official'), null)
})

// ── 回归：cordis 的服务属性是**带守卫的 getter**，未在 inject 里声明就访问会抛错 ──
// 本仓库 0.1.7+ 线为兼容声明式设置已不再 inject `settings`，所以直接写 `ctx.settings`
// 每次都会抛 → 端点查询恒为 null → 判定退化成「只按 id 猜」。

test('回归：ctx.settings 抛错（未 inject）时，经 ctx.get 仍能拿到服务并解出端点', () => {
  const entries = [{ provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] }]
  const settings = fakeSettings({ 'llm-deepseek': { baseURL: 'https://api.deepseek.com' } })
  const ctx = {
    get: (name) => (name === 'llm' ? fakeLlm(entries) : name === 'settings' ? settings : undefined),
    // 模拟未 inject `settings` 的守卫 getter
    get settings() {
      throw new Error('cannot get property "settings" without inject')
    },
  }
  const d = createProviderDirectory({ ctx, getSettings: () => CFG })
  assert.equal(d.endpointOf('deepseek-official'), 'https://api.deepseek.com')
  assert.deepEqual(d.classify('deepseek-official'), { official: true, matchedBy: 'endpoint' })
})

test('回归：ctx.settings 抛错且 ctx.get 取不到 → 端点 null，判定降级但不抛错', () => {
  const entries = [{ provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] }]
  const ctx = {
    get: (name) => (name === 'llm' ? fakeLlm(entries) : undefined),
    get settings() {
      throw new Error('cannot get property "settings" without inject')
    },
  }
  const d = createProviderDirectory({ ctx, getSettings: () => CFG })
  assert.equal(d.endpointOf('deepseek-official'), null)
  // 无端点时回落到内置端点表 → 仍判定为官方
  assert.deepEqual(d.classify('deepseek-official'), { official: true, matchedBy: 'endpoint-default' })
})

test('回归：中转改到别处（deepseek-official 但 baseURL 非官方）→ 不判定为官方', () => {
  const entries = [{ provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] }]
  const settings = fakeSettings({ 'llm-deepseek': { baseURL: 'https://my-relay.example.com/v1' } })
  const ctx = {
    get: (name) => (name === 'llm' ? fakeLlm(entries) : name === 'settings' ? settings : undefined),
    get settings() {
      throw new Error('cannot get property "settings" without inject')
    },
  }
  const d = createProviderDirectory({ ctx, getSettings: () => CFG })
  assert.deepEqual(d.classify('deepseek-official'), { official: false, matchedBy: 'endpoint' })
})

test('llm 存在但目录里没有该条目 → 无端点', () => {
  const ctx = fakeCtx({ services: { llm: fakeLlm([]) }, settings: fakeSettings({}) })
  const d = createProviderDirectory({ ctx, getSettings: () => CFG })
  assert.equal(d.endpointOf('deepseek-official'), null)
  assert.deepEqual(d.classify('deepseek-official'), { official: true, matchedBy: 'endpoint-default' })
})

test('目录条目带 baseURL（deepseek-official，settingsPath=[]）→ 端点判定', () => {
  const entries = [{ provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] }]
  const ctx = fakeCtx({
    services: { llm: fakeLlm(entries) },
    settings: fakeSettings({ 'llm-deepseek': { baseURL: 'https://api.deepseek.com' } }),
  })
  const d = createProviderDirectory({ ctx, getSettings: () => CFG })
  assert.equal(d.endpointOf('deepseek-official'), 'https://api.deepseek.com')
  assert.deepEqual(d.classify('deepseek-official'), { official: true, matchedBy: 'endpoint' })
})

test('pi-ai 路由条目（settingsPath=providers.<id>）→ 逐层取值', () => {
  const entries = [{ provider: 'local-35b', displayName: 'local', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'local-35b'] }]
  const ctx = fakeCtx({
    services: { llm: fakeLlm(entries) },
    settings: fakeSettings({ 'llm-pi-ai': { providers: { 'local-35b': { baseURL: 'http://192.168.100.242:8200/v1' } } } }),
  })
  const d = createProviderDirectory({ ctx, getSettings: () => CFG })
  assert.equal(d.endpointOf('local-35b'), 'http://192.168.100.242:8200/v1')
  assert.deepEqual(d.classify('local-35b'), { official: false, matchedBy: 'endpoint' })
})

test('中转场景：deepseek-official 但 baseURL 指向中转 → 不误判为官方', () => {
  const entries = [{ provider: 'deepseek-official', settingsNs: 'llm-deepseek', settingsPath: [] }]
  const ctx = fakeCtx({
    services: { llm: fakeLlm(entries) },
    settings: fakeSettings({ 'llm-deepseek': { baseURL: 'https://relay.example.com/v1' } }),
  })
  const d = createProviderDirectory({ ctx, getSettings: () => CFG })
  assert.deepEqual(d.classify('deepseek-official'), { official: false, matchedBy: 'endpoint' })
})

test('非法 baseURL（非字符串 / 空串 / 空格）→ 视为无端点，走 id 兜底', () => {
  const entries = [{ provider: 'deepseek-official', settingsNs: 'llm-deepseek', settingsPath: [] }]
  for (const bad of [123, '', '   ', null, {}, ['x']]) {
    const ctx = fakeCtx({
      services: { llm: fakeLlm(entries) },
      settings: fakeSettings({ 'llm-deepseek': { baseURL: bad } }),
    })
    const d = createProviderDirectory({ ctx, getSettings: () => CFG })
    assert.equal(d.endpointOf('deepseek-official'), null)
    assert.deepEqual(d.classify('deepseek-official'), { official: true, matchedBy: 'endpoint-default' })
  }
})

test('settings.get 抛错 → matchedBy unknown / 端点兜底，不抛出', () => {
  const entries = [{ provider: 'local-35b', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'local-35b'] }]
  const ctx = fakeCtx({ services: { llm: fakeLlm(entries) }, settings: fakeSettings({}, { throwOnGet: true }) })
  const logs = []
  const d = createProviderDirectory({ ctx, getSettings: () => CFG, warn: (m) => logs.push(m) })
  assert.doesNotThrow(() => d.classify('local-35b'))
  assert.deepEqual(d.classify('local-35b'), { official: false, matchedBy: 'unknown' })
  assert.equal(logs.length, 2) // endpointOf 在 classify / describe 各调用一次
})

test('settings 服务缺失（ctx.settings undefined）→ 降级', () => {
  const entries = [{ provider: 'deepseek-official', settingsNs: 'llm-deepseek', settingsPath: [] }]
  const ctx = fakeCtx({ services: { llm: fakeLlm(entries) } })
  const d = createProviderDirectory({ ctx, getSettings: () => CFG })
  assert.equal(d.endpointOf('deepseek-official'), null)
  assert.deepEqual(d.classify('deepseek-official'), { official: true, matchedBy: 'endpoint-default' })
})

test('listConfigurableProviders 抛错 / 返回非数组 → 空目录，不抛出', () => {
  const ctx1 = fakeCtx({ services: { llm: fakeLlm([], { throwOnList: true }) }, settings: fakeSettings({}) })
  const d1 = createProviderDirectory({ ctx: ctx1, getSettings: () => CFG })
  assert.deepEqual(d1.entries(), [])
  assert.doesNotThrow(() => d1.classify('deepseek-official'))

  const ctx2 = fakeCtx({ services: { llm: { listConfigurableProviders: () => 'nope' } }, settings: fakeSettings({}) })
  const d2 = createProviderDirectory({ ctx: ctx2, getSettings: () => CFG })
  assert.deepEqual(d2.entries(), [])
})

test('settingsPath 中间层缺失 / 类型不符 → 无端点', () => {
  const entries = [{ provider: 'local-35b', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'local-35b'] }]
  for (const section of [
    { providers: null },
    { providers: { 'local-35b': null } },
    { providers: { 'local-35b': 'string' } },
    { providers: {} },
    undefined,
    'not-an-object',
  ]) {
    const ctx = fakeCtx({ services: { llm: fakeLlm(entries) }, settings: fakeSettings({ 'llm-pi-ai': section }) })
    const d = createProviderDirectory({ ctx, getSettings: () => CFG })
    assert.equal(d.endpointOf('local-35b'), null)
  }
})

test('getSettings 抛错 → 用空配置（默认名单）判定', () => {
  const d = createProviderDirectory({
    ctx: fakeCtx({}),
    getSettings: () => {
      throw new Error('cfg boom')
    },
  })
  assert.deepEqual(d.classify('deepseek-official'), { official: true, matchedBy: 'endpoint-default' })
})

test('显式 officialProviders 优先于端点', () => {
  const entries = [{ provider: 'my-relay', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'my-relay'] }]
  const ctx = fakeCtx({
    services: { llm: fakeLlm(entries) },
    settings: fakeSettings({ 'llm-pi-ai': { providers: { 'my-relay': { baseURL: 'https://relay.example.com' } } } }),
  })
  const d = createProviderDirectory({
    ctx,
    getSettings: () => ({ officialProviders: ['my-relay'], officialBaseURLs: ['api.deepseek.com'] }),
  })
  assert.deepEqual(d.classify('my-relay'), { official: true, matchedBy: 'explicit' })
})

test('describe 带端点与 matchedBy（可解释诊断）', () => {
  const entries = [{ provider: 'deepseek-official', settingsNs: 'llm-deepseek', settingsPath: [] }]
  const ctx = fakeCtx({
    services: { llm: fakeLlm(entries) },
    settings: fakeSettings({ 'llm-deepseek': { baseURL: 'https://api.deepseek.com' } }),
  })
  const d = createProviderDirectory({ ctx, getSettings: () => CFG })
  assert.deepEqual(d.describe('deepseek-official'), {
    provider: 'deepseek-official',
    model: null,
    official: true,
    matchedBy: 'endpoint',
    endpoint: 'https://api.deepseek.com',
  })
  // 带模型名时同口径：中转路由 + 名字带 deepseek 的模型 → 官方（模型名先于端点判定）
  assert.deepEqual(d.describe('my-relay', 'ocg/deepseek-flash'), {
    provider: 'my-relay',
    model: 'ocg/deepseek-flash',
    official: true,
    matchedBy: 'model-pattern',
    endpoint: null,
  })
  assert.deepEqual(d.describe('my-relay', 'qwen3.5-flash'), {
    provider: 'my-relay',
    model: 'qwen3.5-flash',
    official: false,
    matchedBy: 'unknown',
    endpoint: null,
  })
})

// ── v0.3.1：models() —— 设置卡片「高峰拦截列表」的模型目录来源 ──

test('models：逐路由取 listModels（对象取 id、裸字符串也接受）', async () => {
  const entries = [
    { provider: 'deepseek-official', settingsNs: 'llm-deepseek', settingsPath: [] },
    { provider: 'local', settingsNs: 'llm-local', settingsPath: [] },
  ]
  const ctx = fakeCtx({
    services: {
      llm: fakeLlm(entries, {
        models: {
          'deepseek-official': [{ id: 'deepseek-v4-pro' }, { id: 'deepseek-flash' }, { nope: 1 }],
          local: ['ocg/deepseek-flash', 7, ''],
        },
      }),
    },
  })
  const d = createProviderDirectory({ ctx, getSettings: () => CFG })
  assert.deepEqual(await d.models(), [
    { provider: 'deepseek-official', model: 'deepseek-v4-pro', source: 'catalog' },
    { provider: 'deepseek-official', model: 'deepseek-flash', source: 'catalog' },
    { provider: 'local', model: 'ocg/deepseek-flash', source: 'catalog' },
  ])
})

test('models：单个路由发现失败只丢它自己（fail-open，不抛）', async () => {
  const entries = [
    { provider: 'a', settingsNs: 'ns-a', settingsPath: [] },
    { provider: 'b', settingsNs: 'ns-b', settingsPath: [] },
  ]
  const warnings = []
  const ctx = fakeCtx({ services: { llm: fakeLlm(entries, { models: { b: ['b-model'] }, throwOnModels: ['a'] }) } })
  const d = createProviderDirectory({ ctx, getSettings: () => CFG, warn: (m) => warnings.push(m) })
  assert.deepEqual(await d.models(), [{ provider: 'b', model: 'b-model', source: 'catalog' }])
  assert.match(warnings[0], /model discovery failed for "a"/)
})

test('models：llm 缺失 / 无 listModels / 目录枚举抛错 → 空数组（绝不抛）', async () => {
  const noLlm = createProviderDirectory({ ctx: { get: () => undefined }, getSettings: () => CFG })
  assert.deepEqual(await noLlm.models(), [])

  const bareLlm = createProviderDirectory({ ctx: { get: (n) => (n === 'llm' ? {} : undefined) }, getSettings: () => CFG })
  assert.deepEqual(await bareLlm.models(), [])

  const boom = createProviderDirectory({
    ctx: fakeCtx({ services: { llm: fakeLlm([{ provider: 'x' }], { throwOnList: true }) } }),
    getSettings: () => CFG,
  })
  assert.deepEqual(await boom.models(), [])
})

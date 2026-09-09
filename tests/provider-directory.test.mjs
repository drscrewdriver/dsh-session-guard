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

/** fake llm 服务：listConfigurableProviders 返回给定目录。 */
function fakeLlm(entries, { throwOnList = false } = {}) {
  return {
    listConfigurableProviders: () => {
      if (throwOnList) throw new Error('boom')
      return entries
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
    official: true,
    matchedBy: 'endpoint',
    endpoint: 'https://api.deepseek.com',
  })
})

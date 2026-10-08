/**
 * settings-bridge 测试（M4/T20-b）：
 * 1. 服务端 settings-bridge.js：路由派生、describe/mutate 信封契约、POST-only、
 *    ns 过滤、conflict 映射。
 * 2. 客户端 settings-bridge.ts（BridgeDocHandle）：set→mutate 请求形状、
 *    conflict→refresh、非重试码→unavailable、瞬态码→有限重试后 ready。
 * 3. P0 结构钉：client/index.ts 的双代腰回调只写 scopeRef（注册已提顶层）。
 *
 * client .tsx 无法进 node:test（JSX），P0 的行为级验收由五格 probe 闸承担；
 * 此处用源码结构断言钉住「注册已出回调」的形态，防回归。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { registerSettingsBridgeRoutes } from '../src/settings-bridge.js'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')

/** 假 req/res：describe 只看 method；mutate 走 on('data'/'end') 收流。 */
function fakeReq(method, body) {
  const listeners = {}
  const raw = body === undefined ? '' : JSON.stringify(body)
  return {
    method,
    url: '/api/session-guard/settings/x',
    on(event, cb) {
      listeners[event] = cb
      return this
    },
    resume() {},
    /** 测试内手动放流（模拟 socket 已有数据）。 */
    flush() {
      listeners.data?.(Buffer.from(raw))
      listeners.end?.()
    },
  }
}

function fakeRes() {
  const out = { code: undefined, headers: undefined, body: undefined }
  out.writeHead = (code, headers) => {
    out.code = code
    out.headers = headers
  }
  out.end = (bodyStr) => {
    out.body = bodyStr === undefined ? undefined : JSON.parse(bodyStr)
  }
  return out
}

/** 假宿主 settings 服务：describe 返回两个 ns（验过滤），mutate 可编程。 */
function fakeSvc({ ns = 'session-guard', failMutate } = {}) {
  return {
    writable: true,
    describe: () => [
      { ns, value: { enabled: true }, revision: 7 },
      { ns: 'other-ns', value: { x: 1 }, revision: 1 },
    ],
    mutate: async (n, ops, expectedRevision) => {
      if (failMutate) throw failMutate
      if (expectedRevision !== undefined && expectedRevision !== 7) {
        throw new Error('settings revision conflict (expected 7)')
      }
      return { ok: true }
    },
  }
}

test('路由派生：server 与 client 契约逐字符一致', async () => {
  const clientSrc = readFileSync(join(ROOT, 'src', 'client', 'settings-bridge.ts'), 'utf8')
  assert.ok(clientSrc.includes('`/api/${ns}/settings/describe`'), 'client describe 派生式')
  assert.ok(clientSrc.includes('`/api/${ns}/settings/mutate`'), 'client mutate 派生式')
  // server 侧直接验证
  const routes = []
  registerSettingsBridgeRoutes({ register: (r) => { routes.push(r); return () => {} } }, () => undefined, 'session-guard')
  assert.deepEqual(routes.map((r) => r.path), ['/api/session-guard/settings/describe', '/api/session-guard/settings/mutate'])
  assert.ok(routes.every((r) => r.kind === 'exact'))
})

test('describe：非 POST → 405；无服务 → settings-unavailable；ns 过滤只回自家', async () => {
  const routes = []
  let svc
  registerSettingsBridgeRoutes({ register: (r) => { routes.push(r); return () => {} } }, () => svc, 'session-guard')
  const describe = routes[0].handler

  const res405 = fakeRes()
  describe(fakeReq('GET'), res405)
  assert.equal(res405.code, 405)
  assert.equal(res405.body.code, 'method-not-allowed')

  const resNoSvc = fakeRes()
  describe(fakeReq('POST'), resNoSvc)
  assert.equal(resNoSvc.code, 200)
  assert.equal(resNoSvc.body.ok, false)
  assert.equal(resNoSvc.body.code, 'settings-unavailable')

  svc = fakeSvc()
  const resOk = fakeRes()
  describe(fakeReq('POST'), resOk)
  assert.equal(resOk.body.ok, true)
  assert.equal(resOk.body.value.descriptor.ns, 'session-guard', '只回自家 ns')
  assert.equal(resOk.body.value.writable, true)
})

test('mutate：malformed ops → settings-rejected；成功 → describe 回填；revision 冲突 → settings-conflict', async () => {
  const routes = []
  let svc
  registerSettingsBridgeRoutes({ register: (r) => { routes.push(r); return () => {} } }, () => svc, 'session-guard')
  const mutate = routes[1].handler

  svc = fakeSvc()
  const resBad = fakeRes()
  const resOk = fakeRes()
  const resConflict = fakeRes()
  const reqBad = fakeReq('POST', { ops: [{ op: 'delete' }] })
  mutate(reqBad, resBad)
  reqBad.flush()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(resBad.body.code, 'settings-rejected')

  const reqOk = fakeReq('POST', { ops: [{ op: 'set', path: ['enabled'], value: false }], expectedRevision: 7 })
  mutate(reqOk, resOk)
  reqOk.flush()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(resOk.body.ok, true)
  assert.equal(resOk.body.value.descriptor.value.enabled, true)

  const reqConflict = fakeReq('POST', { ops: [{ op: 'set', path: ['enabled'], value: false }], expectedRevision: 3 })
  mutate(reqConflict, resConflict)
  reqConflict.flush()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(resConflict.body.ok, false)
  assert.equal(resConflict.body.code, 'settings-conflict')
})

test('BridgeDocHandle：set→mutate 请求形状 + conflict→refresh + 终态 unavailable', async (t) => {
  const { BridgeDocHandle } = await import('../src/client/settings-bridge.ts')
  const calls = []
  const originalFetch = globalThis.fetch
  let describeResponse
  let mutateResponse
  globalThis.fetch = async (path, init) => {
    calls.push({ path, body: init?.body === undefined ? undefined : JSON.parse(init.body) })
    if (String(path).endsWith('/describe')) {
      return { ok: true, json: async () => describeResponse }
    }
    return { ok: true, json: async () => mutateResponse }
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  describeResponse = { ok: true, value: { descriptor: { ns: 'session-guard', value: { enabled: true }, revision: 7 }, writable: true } }
  mutateResponse = { ok: true, value: { descriptor: { ns: 'session-guard', value: { enabled: false }, revision: 8 } } }
  const handle = new BridgeDocHandle('session-guard')
  await handle.refresh()
  assert.equal(handle.getSnapshot().status, 'ready')
  assert.equal(handle.getSnapshot().value.enabled, true)

  // set → mutate 请求形状（ops + expectedRevision）
  await handle.set('enabled', false)
  const mutateCall = calls.find((c) => String(c.path).endsWith('/mutate'))
  assert.deepEqual(mutateCall.body, { ops: [{ op: 'set', path: ['enabled'], value: false }], expectedRevision: 7 })
  assert.equal(handle.getSnapshot().revision, 8)
  assert.equal(handle.getSnapshot().value.enabled, false)

  // conflict → 自动 refresh 拉权威值
  mutateResponse = { ok: false, code: 'settings-conflict', message: 'revision conflict' }
  describeResponse = { ok: true, value: { descriptor: { ns: 'session-guard', value: { enabled: true }, revision: 9 }, writable: true } }
  const setOk = await handle.set('enabled', false)
  assert.equal(setOk, false, 'conflict 写入返回 false')
  assert.equal(handle.getSnapshot().revision, 9)

  // 非重试码 → 终态 unavailable
  describeResponse = { ok: false, code: 'internal', message: 'boom' }
  const dead = new BridgeDocHandle('session-guard')
  await dead.refresh()
  assert.equal(dead.getSnapshot().status, 'unavailable')
})

test('BridgeDocHandle：瞬态 settings-unavailable 在重试预算内转 ready', async (t) => {
  const { BridgeDocHandle } = await import('../src/client/settings-bridge.ts')
  const originalFetch = globalThis.fetch
  let attempts = 0
  globalThis.fetch = async (path) => {
    if (String(path).endsWith('/describe')) {
      attempts += 1
      if (attempts < 2) return { ok: true, json: async () => ({ ok: false, code: 'settings-unavailable' }) }
      return { ok: true, json: async () => ({ ok: true, value: { descriptor: { ns: 'session-guard', value: { enabled: true }, revision: 2 }, writable: true } }) }
    }
    return { ok: true, json: async () => ({ ok: true, value: {} }) }
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  const handle = new BridgeDocHandle('session-guard')
  const deadline = Date.now() + 4000
  while (handle.getSnapshot().status !== 'ready' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100))
  }
  assert.equal(handle.getSnapshot().status, 'ready', `瞬态重试后应 ready（attempts=${attempts}）`)
})

test('P0 结构钉：双代腰回调只写 scopeRef，注册已提 apply 顶层', async () => {
  const src = readFileSync(join(ROOT, 'src', 'client', 'index.ts'), 'utf8')
  // 回调体 = 纯数据臂（注册若回流回调，此断言即红）
  assert.match(src, /registerSettingsFaces\(ctx, \(scope\) => \{\s*scopeRef\.scope = scope\s*\}\)/)
  // 三面 + mountConfigCards 在 apply 顶层无条件注册（不在任何回调字面量内）
  assert.ok(src.includes('safe(\'config-cards/family-tab\', () => mountConfigCards(ctx))'))
  assert.ok(src.includes("safe('config-cards/settings-plugin-item'"))
  assert.ok(src.includes("safe('shell.overlay'"))
  // 卡面数据源 = currentScope()（scopeRef ?? bridge 桥兜底）
  assert.match(src, /function currentScope\(\): SettingsScope<SessionGuardConfig> \{\s*return scopeRef\.scope \?\? bridgeScope\(\)/)
})

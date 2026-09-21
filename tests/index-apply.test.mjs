/**
 * index.js 装配测试：`apply()` 在最小 fake ctx 下能装好命令 / 监听 / 路由，
 * 且 `/pause` `/resume` `/cancel` handler 在无 live agent 时返回错误而不是抛错。
 *
 * 覆盖 C21（命令行为不变）与 C23（新增路径 fail-open）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, name, inject } from '../src/index.js'

/** 最小 cordis 风格 ctx：effect 立即执行回调（与 cordis 语义一致）并收集 disposer。 */
function fakeCtx() {
  const commands = []
  const listeners = []
  const disposers = []
  const routes = []
  const provided = []
  const ctx = {
    settings: { get: () => ({}), register: () => ({ get: () => ({}), watch: () => () => {} }) },
    agents: { get: () => undefined, roots: () => [], list: () => [] },
    timer: { interval: () => ({ unref() {} }) },
    webServer: { register: (def) => { routes.push(def); return () => {} } },
    commands: { register: (def) => { commands.push(def); return () => {} } },
    get: () => undefined,
    provide: (key, value) => { provided.push([key, value]) },
    on: (event, fn) => { listeners.push([event, fn]); return () => {} },
    effect: (fn) => {
      const d = fn()
      if (typeof d === 'function') disposers.push(d)
    },
    logger: { warn() {}, error() {}, info() {} },
  }
  return { ctx, commands, listeners, disposers, routes, provided }
}

function withTmpState(t) {
  const dir = mkdtempSync(join(tmpdir(), 'session-guard-apply-'))
  const old = process.env.DSH_SESSION_GUARD_STATE_DIR
  process.env.DSH_SESSION_GUARD_STATE_DIR = dir
  t.after(() => {
    rmSync(dir, { recursive: true, force: true })
    if (old === undefined) delete process.env.DSH_SESSION_GUARD_STATE_DIR
    else process.env.DSH_SESSION_GUARD_STATE_DIR = old
  })
}

test('apply()：契约（name/inject）与关键接线', (t) => {
  withTmpState(t)
  const { ctx, listeners, provided, routes } = fakeCtx()
  assert.equal(name, 'session-guard')
  assert.deepEqual(inject, ['agents', 'webServer', 'settings', 'timer', 'commands', 'goals'])
  assert.doesNotThrow(() => apply(ctx))
  // 冗余端口 + 三个 waterfall 监听（session/event、agent/request、agent/pre-step）
  assert.deepEqual(provided.map(([k]) => k), ['sessionGuard'])
  const events = listeners.map(([e]) => e)
  assert.ok(events.includes('session/event'))
  assert.ok(events.includes('agent/request'))
  assert.ok(events.includes('agent/pre-step'), 'step 门控监听必须装上')
  assert.equal(routes.length, 1)
  assert.equal(routes[0].path, '/session-guard')
})

test('apply()：/pause /resume /cancel 注册且无 live agent 时返回 error（不抛错）', (t) => {
  withTmpState(t)
  const { ctx, commands } = fakeCtx()
  apply(ctx)
  assert.deepEqual(commands.map((c) => c.name).sort(), ['cancel', 'pause', 'resume'])
  for (const c of commands) {
    assert.equal(typeof c.handler, 'function')
    const withAgent = c.handler({ agent: { id: 's1' }, rawInput: 'confirm rerun' })
    assert.equal(typeof withAgent, 'object')
    assert.equal(withAgent.kind, 'error', `${c.name} 无 live agent 应返回 error`)
    const noAgent = c.handler({ rawInput: '' })
    assert.deepEqual(noAgent, { kind: 'error', text: 'no session for this command' })
  }
})

test('apply()：disposer 全部可调用（卸载不抛错）', (t) => {
  withTmpState(t)
  const { ctx, disposers } = fakeCtx()
  apply(ctx)
  assert.ok(disposers.length > 0)
  for (const d of disposers) assert.doesNotThrow(() => d())
})

// ── settings 服务缺失时必须 fail-open（而不是让每个路由 500）──

/**
 * 复现 **cordis 的真实行为**：服务属性是带守卫的 getter，未 inject 就访问会
 * **抛错**而不是返回 undefined ——
 * `cannot get property "settings" without inject`。
 *
 * 修复前 `settingsUserLayer()` / `/diag` 直接读 `ctx.settings`，于是任何不提供
 * settings 服务的宿主上，`/status`、`/state`、`/diag` 全部 500，前端按钮因为拿不到
 * `/state` 而静默不渲染。
 */
function fakeCtxWithoutSettings() {
  const routes = []
  const ctx = {
    agents: { get: () => undefined, roots: () => [], list: () => [] },
    timer: { interval: () => ({ unref() {} }) },
    webServer: { register: (def) => { routes.push(def); return () => {} } },
    commands: { register: () => () => {} },
    // 未注入：直接读会抛（与 cordis 一致）
    get: () => undefined,
    provide: () => {},
    on: () => () => {},
    effect: (fn) => {
      const d = fn()
      return typeof d === 'function' ? d : undefined
    },
    logger: { warn() {}, error() {}, info() {} },
  }
  Object.defineProperty(ctx, 'settings', {
    get() {
      throw new Error('cannot get property "settings" without inject')
    },
  })
  return { ctx, routes }
}

test('无 settings 服务时：/status、/state、/diag、/peak 全部 200（不再 500）', async (t) => {
  withTmpState(t)
  const { ctx, routes } = fakeCtxWithoutSettings()
  assert.doesNotThrow(() => apply(ctx), 'apply 本身不应因缺 settings 而抛')

  for (const url of ['/session-guard/status', '/session-guard/state?session=s1', '/session-guard/diag', '/session-guard/peak']) {
    const rec = await callRoute(routes[0], fakeReq('GET', url), fakeRes())
    assert.equal(rec.code, 200, `${url} 应返回 200，实际 ${rec.code}: ${rec.chunks.join('')}`)
    assert.equal(JSON.parse(rec.chunks.join('')).ok, true, `${url} 应 ok:true`)
  }

  // /state 的畅跑视图要仍然可用（前端按钮就是靠它决定渲不渲染）
  const rec = await callRoute(routes[0], fakeReq('GET', '/session-guard/state?session=s1'), fakeRes())
  const body = JSON.parse(rec.chunks.join(''))
  assert.equal(body.freeRun.available, true, '没有 settings 也要报告可用（配置来自文件）')
  assert.equal(body.freeRun.state, 'none')

  // /diag 要如实报告「没有 settings 服务」，而不是抛
  const drec = await callRoute(routes[0], fakeReq('GET', '/session-guard/diag'), fakeRes())
  const diag = JSON.parse(drec.chunks.join('')).diag
  assert.equal(diag.hasSettings, false)
  assert.equal(diag.hasRegister, false)
})

test('无 settings 服务时：畅跑 RPC 仍可写入（配置与状态都不依赖 settings）', async (t) => {
  withTmpState(t)
  const { ctx, routes } = fakeCtxWithoutSettings()
  apply(ctx)

  const rpc = async (payload) => {
    const rec = await callRoute(routes[0], fakeReq('POST', '/session-guard/rpc', JSON.stringify(payload)), fakeRes())
    return { code: rec.code, body: JSON.parse(rec.chunks.join('')) }
  }
  const add = await rpc({ sessionId: 's1', action: 'freeRunAdd', from: '2020-01-01T00:00', to: '2099-01-01T00:00' })
  assert.equal(add.code, 200)
  assert.equal(add.body.result.state, 'active')
  assert.equal(add.body.result.windows.length, 1)
})

// ── HTTP 路由（v0.2.0：/state 形状 / SSE / stepPause RPC）──

/** 最小 req / res。 */
function fakeReq(method, url, body) {
  return {
    method,
    url,
    on: () => {},
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(body)
    },
  }
}

function fakeRes() {
  const rec = { code: null, headers: null, chunks: [], ended: false }
  return {
    rec,
    writeHead: (code, headers) => {
      rec.code = code
      rec.headers = headers
    },
    write: (chunk) => {
      rec.chunks.push(String(chunk))
      return true
    },
    end: (body) => {
      rec.ended = true
      if (body !== undefined) rec.chunks.push(String(body))
    },
    on: () => {},
  }
}

async function callRoute(route, req, res) {
  await route.handler(req, res)
  return res.rec
}

test('路由：GET /state 返回 paused{step,turn,manual,reason} 与 stepGate', async (t) => {
  withTmpState(t)
  const { ctx, routes } = fakeCtx()
  apply(ctx)
  const rec = await callRoute(routes[0], fakeReq('GET', '/session-guard/state?session=s1'), fakeRes())
  assert.equal(rec.code, 200)
  const body = JSON.parse(rec.chunks.join(''))
  assert.equal(body.ok, true)
  // v0.3.0：paused 带 reason（'peak_window' / 'manual'）；畅跑状态走 freeRun
  assert.deepEqual(body.paused, { step: false, turn: false, manual: false, reason: null })
  assert.equal(body.freeRun.state, 'none')
  assert.deepEqual(body.freeRun.windows, [])
  assert.equal(body.freeRun.active, false)
  assert.equal(body.freeRun.available, true)
  assert.equal(body.freeRun.timezone, 'Asia/Shanghai')
  assert.deepEqual(body.stepGate, { held: false, manual: false, since: null, bypass: false })
})

test('路由：POST /rpc stepPause / stepResume 均返回 ok', async (t) => {
  withTmpState(t)
  const { ctx, routes } = fakeCtx()
  apply(ctx)
  const pause = await callRoute(
    routes[0],
    fakeReq('POST', '/session-guard/rpc', JSON.stringify({ sessionId: 's1', action: 'stepPause' })),
    fakeRes(),
  )
  assert.equal(pause.code, 200)
  assert.deepEqual(JSON.parse(pause.chunks.join('')).result, { requested: true, held: false })

  const resume = await callRoute(
    routes[0],
    fakeReq('POST', '/session-guard/rpc', JSON.stringify({ sessionId: 's1', action: 'stepResume' })),
    fakeRes(),
  )
  assert.equal(JSON.parse(resume.chunks.join('')).result.released, false, '未挂起时释放为 no-op')
})

test('路由：GET /events 建立 SSE 并立刻推一次 state', async (t) => {
  withTmpState(t)
  const { ctx, routes } = fakeCtx()
  apply(ctx)
  const rec = await callRoute(routes[0], fakeReq('GET', '/session-guard/events?session=s1'), fakeRes())
  assert.equal(rec.code, 200)
  assert.match(rec.headers['content-type'], /text\/event-stream/)
  assert.equal(rec.ended, false, 'SSE 不得 end')
  const joined = rec.chunks.join('')
  assert.match(joined, /: connected/)
  assert.match(joined, /^data: /m)
  const payload = JSON.parse(joined.split('data: ')[1].split('\n')[0])
  assert.equal(payload.type, 'step')
  assert.equal(payload.sessionId, 's1')
  assert.equal(payload.state.held, false)
})

// ── HTTP 路由（v0.3.0：可配置峰谷策略）──

test('路由：GET /peak 返回归一化策略，且配置文件解析到随包发布的 config/', async (t) => {
  withTmpState(t)
  const { ctx, routes } = fakeCtx()
  apply(ctx)
  const rec = await callRoute(routes[0], fakeReq('GET', '/session-guard/peak'), fakeRes())
  assert.equal(rec.code, 200)
  const { peak } = JSON.parse(rec.chunks.join(''))
  // 三种模式之一（取决于跑测试时的真实时刻）
  assert.ok(['PEAK', 'OFF_PEAK', 'NORMAL'].includes(peak.mode))
  assert.equal(peak.policy.timezone, 'Asia/Shanghai')
  assert.deepEqual(peak.policy.windows.map((w) => w.name), ['morning', 'afternoon'])
  assert.deepEqual(peak.policy.windows[0].days, ['mon', 'tue', 'wed', 'thu', 'fri'])
  assert.equal(peak.policy.weekend.enabled, true)
  assert.equal(peak.policy.weekend.mode, 'offPeak')
  // 已无 ask 相关字段
  assert.equal(peak.warningMinutes, undefined)
  assert.equal(peak.guard, undefined)
})

test('路由：GET /status 暴露 mode / reason / 可配置项 / configFile', async (t) => {
  withTmpState(t)
  const { ctx, routes } = fakeCtx()
  apply(ctx)
  const rec = await callRoute(routes[0], fakeReq('GET', '/session-guard/status'), fakeRes())
  const { status } = JSON.parse(rec.chunks.join(''))
  assert.ok(['peak', 'off-peak', 'weekend'].includes(status.phase), '保留 v0.2.0 的 phase 形状')
  assert.ok(['PEAK', 'OFF_PEAK', 'NORMAL'].includes(status.mode))
  assert.equal(status.peak, status.mode === 'PEAK')
  assert.equal(status.weekend, status.mode === 'OFF_PEAK')
  assert.equal(status.timezone, 'Asia/Shanghai')
  assert.equal(status.peakTimezone, 'Asia/Shanghai')
  assert.deepEqual(status.weekendDays, ['sat', 'sun'])
  assert.equal(status.enabled, true)
  assert.equal(status.continuePasses, undefined, 'ask 移除后不应再有通行证字段')
  assert.match(status.configFile, /config[\\/]session-guard\.json$/, '应解析到随包发布的默认配置')
})

test('路由：GET /settings 带出 configFile 来源与 errors', async (t) => {
  withTmpState(t)
  const { ctx, routes } = fakeCtx()
  apply(ctx)
  const rec = await callRoute(routes[0], fakeReq('GET', '/session-guard/settings'), fakeRes())
  const body = JSON.parse(rec.chunks.join(''))
  assert.equal(body.ok, true)
  assert.match(body.configFile.path, /config[\\/]session-guard\.json$/)
  assert.ok(Array.isArray(body.configFile.candidates))
  assert.ok(body.configFile.candidates.length >= 2)
  assert.deepEqual(body.configFile.errors, [])
  // 设置值已带出配置文件里的可配置项
  assert.equal(body.settings.timezone, 'Asia/Shanghai')
  assert.deepEqual(body.settings.weekendDays, ['sat', 'sun'])
  assert.equal(body.settings.peakWindows.length, 2)
})

test('路由：GET /diag 带出 configFile 与 free-run 诊断', async (t) => {
  withTmpState(t)
  const { ctx, routes } = fakeCtx()
  apply(ctx)
  const rec = await callRoute(routes[0], fakeReq('GET', '/session-guard/diag'), fakeRes())
  const { diag } = JSON.parse(rec.chunks.join(''))
  assert.equal(diag.ns, 'session-guard')
  assert.deepEqual(diag.configFile.errors, [])
  assert.ok(typeof diag.configFile.path === 'string')
  assert.deepEqual(diag.freeRun.active, [])
  assert.deepEqual(diag.freeRun.tracked, [])
  assert.ok(typeof diag.freeRun.root === 'string')
})

test('路由：POST /rpc reloadConfig 与 checkPeak 不需要 sessionId', async (t) => {
  withTmpState(t)
  const { ctx, routes } = fakeCtx()
  apply(ctx)
  const reload = await callRoute(
    routes[0],
    fakeReq('POST', '/session-guard/rpc', JSON.stringify({ action: 'reloadConfig' })),
    fakeRes(),
  )
  assert.equal(reload.code, 200)
  const reloadBody = JSON.parse(reload.chunks.join(''))
  assert.equal(reloadBody.ok, true)
  assert.match(reloadBody.result.path, /config[\\/]session-guard\.json$/)
  assert.deepEqual(reloadBody.result.errors, [])
  assert.ok(reloadBody.result.keys.includes('timezone'))
})

test('路由：POST /rpc 五个 freeRun 动作（新增/删除/暂停/恢复/清空）', async (t) => {
  withTmpState(t)
  const { ctx, routes } = fakeCtx()
  apply(ctx)
  const rpc = async (body) => {
    const rec = await callRoute(routes[0], fakeReq('POST', '/session-guard/rpc', JSON.stringify(body)), fakeRes())
    return { code: rec.code, body: JSON.parse(rec.chunks.join('')) }
  }

  // 新增一段（过去的起点会被钳到 now，因此立刻进入 active）
  const add = await rpc({ sessionId: 's1', action: 'freeRunAdd', from: '2020-01-01T00:00', to: '2099-01-01T00:00' })
  assert.equal(add.code, 200)
  assert.equal(add.body.ok, true)
  assert.equal(add.body.result.state, 'active')
  assert.equal(add.body.result.active, true)
  assert.equal(add.body.result.windows.length, 1)
  assert.equal(add.body.result.windows[0].paused, false)
  assert.equal(add.body.result.windows[0].status, 'active')
  const id = add.body.result.windows[0].id

  // 暂停某一段（面板每行的 ⏸）→ 不再生效
  const pause = await rpc({ sessionId: 's1', action: 'freeRunPause', id })
  assert.equal(pause.body.result.state, 'suspended')
  assert.equal(pause.body.result.active, false)
  assert.equal(pause.body.result.windows[0].paused, true)
  assert.equal(pause.body.result.windows[0].status, 'paused')

  // 恢复该段（▶）
  const resume = await rpc({ sessionId: 's1', action: 'freeRunResume', id })
  assert.equal(resume.body.result.state, 'active')
  assert.equal(resume.body.result.windows[0].paused, false)

  // 暂停 / 恢复全部（顶部第二个文本按钮）
  const pauseAll = await rpc({ sessionId: 's1', action: 'freeRunPauseAll' })
  assert.equal(pauseAll.body.result.state, 'suspended')
  assert.equal(pauseAll.body.result.windows.every((w) => w.paused), true)
  const resumeAll = await rpc({ sessionId: 's1', action: 'freeRunResumeAll' })
  assert.equal(resumeAll.body.result.state, 'active')

  // 未知 id → 400
  const badId = await rpc({ sessionId: 's1', action: 'freeRunPause', id: 'nope' })
  assert.equal(badId.code, 400)
  assert.match(badId.body.error, /unknown free-run window/)

  // 参数非法 → 400 且说明原因
  const bad = await rpc({ sessionId: 's1', action: 'freeRunAdd', from: 'nope', to: '2099-01-01T00:00' })
  assert.equal(bad.code, 400)
  assert.match(bad.body.error, /from:/)

  const badRange = await rpc({ sessionId: 's1', action: 'freeRunAdd', from: '2099-01-02T00:00', to: '2099-01-01T00:00' })
  assert.equal(badRange.code, 400)
  assert.match(badRange.body.error, /later than from/)

  // 删除单条（面板每行的 ×）
  const remove = await rpc({ sessionId: 's1', action: 'freeRunRemove', id })
  assert.equal(remove.body.result.windows.length, 0)
  assert.equal(remove.body.result.state, 'none')

  // 删除全部
  await rpc({ sessionId: 's1', action: 'freeRunAdd', from: '2020-01-01T00:00', to: '2099-01-01T00:00' })
  const clear = await rpc({ sessionId: 's1', action: 'freeRunClear' })
  assert.equal(clear.body.result.windows.length, 0)
  assert.equal(clear.body.result.state, 'none')

  // 无窗口时暂停/恢复全部应报错
  const noWin = await rpc({ sessionId: 's1', action: 'freeRunPauseAll' })
  assert.equal(noWin.code, 400)
  assert.match(noWin.body.error, /no free-run windows/)
})

test('路由：GET /state 的 freeRun 反映已排期的畅跑（含窗口列表与剩余时间）', async (t) => {
  withTmpState(t)
  const { ctx, routes } = fakeCtx()
  apply(ctx)
  await callRoute(
    routes[0],
    fakeReq('POST', '/session-guard/rpc', JSON.stringify({ sessionId: 's1', action: 'freeRunAdd', from: '2020-01-01T00:00', to: '2099-01-01T00:00' })),
    fakeRes(),
  )
  const rec = await callRoute(routes[0], fakeReq('GET', '/session-guard/state?session=s1'), fakeRes())
  const body = JSON.parse(rec.chunks.join(''))
  assert.equal(body.freeRun.state, 'active')
  assert.equal(body.freeRun.active, true)
  assert.equal(body.freeRun.windows.length, 1)
  assert.equal(body.freeRun.windows[0].status, 'active')
  assert.equal(body.freeRun.windows[0].paused, false)
  assert.ok(body.freeRun.msRemaining > 0)
  assert.ok(typeof body.freeRun.windows[0].fromDisplay === 'string')
  assert.equal(body.freeRun.available, true)
})

test('路由：POST /rpc 未知 action 仍报错，缺 sessionId 的会话级 action 也报错', async (t) => {
  withTmpState(t)
  const { ctx, routes } = fakeCtx()
  apply(ctx)
  const unknown = await callRoute(
    routes[0],
    fakeReq('POST', '/session-guard/rpc', JSON.stringify({ action: 'nope', sessionId: 's1' })),
    fakeRes(),
  )
  assert.equal(unknown.code, 400)
  assert.match(JSON.parse(unknown.chunks.join('')).error, /unknown action/)

  const noSession = await callRoute(
    routes[0],
    fakeReq('POST', '/session-guard/rpc', JSON.stringify({ action: 'state' })),
    fakeRes(),
  )
  assert.equal(noSession.code, 400)
  assert.match(JSON.parse(noSession.chunks.join('')).error, /missing sessionId/)
})

test('apply()：config/session-guard.json 作为 settings 的 base 层注册', (t) => {
  withTmpState(t)
  const registered = []
  const { ctx } = fakeCtx()
  ctx.settings = {
    get: () => ({}),
    register: (ns, schema, options) => {
      registered.push({ ns, schema, options })
      return { get: () => ({}), watch: () => () => {} }
    },
  }
  apply(ctx)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].ns, 'session-guard')
  const base = registered[0].options.base
  assert.deepEqual(base.weekendDays, ['sat', 'sun'])
  assert.equal(base.weekendMode, true)
  assert.deepEqual(base.peakWindows.map((w) => w.name), ['morning', 'afternoon'])
  // 已无 ask 字段
  assert.equal(base.peakWarningMinutes, undefined)
  assert.equal(base.peakAskTimeoutSeconds, undefined)
  assert.equal(base.peakDefaultAction, undefined)
  // 未在配置文件里出现的键仍来自内置默认
  assert.equal(base.providerGuard, true)
  assert.equal(base.stepLevelPause, true)
})

// ══════════════════════════════════════════════════════════════════════
// 配置文件热重载（v0.3.0）：必须真的改变**生效配置**，而不只是诊断信息
//
// 曾经的 bug：settings 服务把「注册时捕获的 base + 用户覆盖」合并返回，
// readCfg 直接展开它 → 文件的新值被那份旧 base 全部盖掉，
// reloadConfig 变成一个只更新 /settings 里 configFile 路径的空操作。
// ══════════════════════════════════════════════════════════════════════

/**
 * 模拟 cordis settings 服务：register 时**快照并 deepFreeze** base，get(ns) 返回该快照
 * + 用户覆盖（与 dsh-settings 的真实语义一致：`resolved` 注册后就定死了）。
 *
 * `withDescribe: true` 时额外实现 `describe()` —— 真实服务的 `describe()` 会带出
 * raw `user` 层；不实现则走插件的「与启动基准做差集」退化路径。两条路都要测。
 */
function fakeSettingsService({ withDescribe = false } = {}) {
  const scopes = new Map()
  const baseOf = (ns) => scopes.get(ns).base
  const userOf = (ns) => scopes.get(ns).overrides
  return {
    service: {
      register(ns, schema, options) {
        scopes.set(ns, { base: Object.freeze({ ...(options?.base ?? {}) }), overrides: {} })
        return { get: () => ({}), watch: () => () => {} }
      },
      get(ns) {
        const s = scopes.get(ns)
        return s === undefined ? {} : { ...s.base, ...s.overrides }
      },
      ...(withDescribe
        ? {
            describe() {
              return [...scopes.entries()].map(([ns, s]) => ({
                ns,
                value: { ...s.base, ...s.overrides },
                base: { ...s.base },
                user: { ...s.overrides },
              }))
            },
          }
        : {}),
    },
    override(ns, key, value) {
      scopes.get(ns).overrides[key] = value
    },
    registeredBase: baseOf,
    userLayer: userOf,
  }
}

/** 临时配置文件 + `$DSH_SESSION_GUARD_CONFIG` 指向它。 */
function withConfigFile(t, initial) {
  const dir = mkdtempSync(join(tmpdir(), 'session-guard-cfg-'))
  const file = join(dir, 'session-guard.json')
  const old = process.env.DSH_SESSION_GUARD_CONFIG
  process.env.DSH_SESSION_GUARD_CONFIG = file
  writeFileSync(file, initial)
  t.after(() => {
    rmSync(dir, { recursive: true, force: true })
    if (old === undefined) delete process.env.DSH_SESSION_GUARD_CONFIG
    else process.env.DSH_SESSION_GUARD_CONFIG = old
  })
  return {
    write: (obj) => writeFileSync(file, JSON.stringify(obj)),
    file,
  }
}

const CFG_MORNING = JSON.stringify({
  enabled: true,
  timezone: 'Asia/Shanghai',
  peakPolicy: { peakWindows: [{ name: 'morning', start: '09:00', end: '12:00', days: ['mon'] }] },
  weekendPolicy: { enabled: true, days: ['sat', 'sun'], mode: 'offPeak' },
})

const CFG_NIGHT = {
  enabled: true,
  timezone: 'Asia/Tokyo',
  peakPolicy: { timezone: 'Asia/Shanghai', peakWindows: [{ name: 'night', start: '20:00', end: '22:00', days: ['mon'] }] },
  weekendPolicy: { enabled: true, days: ['sat'], mode: 'offPeak' },
}

for (const withDescribe of [true, false]) {
  const label = withDescribe ? 'describe() 路径' : '差集退化路径'

  test(`reloadConfig（${label}）：改配置文件后**生效配置**真的变了`, async (t) => {
    withTmpState(t)
    const cf = withConfigFile(t, CFG_MORNING)
    const { ctx, routes } = fakeCtx()
    const settings = fakeSettingsService({ withDescribe })
    ctx.settings = settings.service
    apply(ctx)

    const readSettings = async () => {
      const rec = await callRoute(routes[0], fakeReq('GET', '/session-guard/settings'), fakeRes())
      return JSON.parse(rec.chunks.join('')).settings
    }

    const before = await readSettings()
    assert.deepEqual(before.peakWindows.map((w) => w.name), ['morning'])
    assert.equal(before.timezone, 'Asia/Shanghai')

    cf.write(CFG_NIGHT)
    const reload = await callRoute(routes[0], fakeReq('POST', '/session-guard/rpc', JSON.stringify({ action: 'reloadConfig' })), fakeRes())
    assert.equal(reload.code, 200)
    assert.deepEqual(JSON.parse(reload.chunks.join('')).result.errors, [])

    const after = await readSettings()
    assert.deepEqual(after.peakWindows.map((w) => w.name), ['night'], 'reloadConfig 必须真的换掉峰窗口')
    assert.equal(after.timezone, 'Asia/Tokyo')
    assert.equal(after.peakTimezone, 'Asia/Shanghai')
    assert.deepEqual(after.weekendDays, ['sat'])
  })

  test(`reloadConfig（${label}）：设置面板里的用户覆盖仍然优先于新文件值`, async (t) => {
    withTmpState(t)
    const cf = withConfigFile(t, CFG_MORNING)
    const { ctx, routes } = fakeCtx()
    const settings = fakeSettingsService({ withDescribe })
    ctx.settings = settings.service
    apply(ctx)

    settings.override('session-guard', 'weekendDays', ['sun'])

    cf.write(CFG_NIGHT)
    await callRoute(routes[0], fakeReq('POST', '/session-guard/rpc', JSON.stringify({ action: 'reloadConfig' })), fakeRes())

    const rec = await callRoute(routes[0], fakeReq('GET', '/session-guard/settings'), fakeRes())
    const cfg = JSON.parse(rec.chunks.join('')).settings
    assert.deepEqual(cfg.weekendDays, ['sun'], '用户显式设过的键必须继续优先')
    assert.deepEqual(cfg.peakWindows.map((w) => w.name), ['night'], '用户没动过的键应采用文件新值')
    assert.equal(cfg.timezone, 'Asia/Tokyo', '用户没动过的键应采用文件新值')
  })
}

test('reloadConfig：配置文件写坏 → 记 error 且不静默清空窗口（守卫不会无声失效）', async (t) => {
  withTmpState(t)
  const cf = withConfigFile(t, CFG_MORNING)
  const { ctx, routes } = fakeCtx()
  const settings = fakeSettingsService({ withDescribe: true })
  ctx.settings = settings.service
  apply(ctx)

  cf.write({ enabled: true, timezone: 'Asia/Shangai', peakPolicy: { peakWindows: { start: '09:00' } } })
  const rec = await callRoute(routes[0], fakeReq('POST', '/session-guard/rpc', JSON.stringify({ action: 'reloadConfig' })), fakeRes())
  const result = JSON.parse(rec.chunks.join('')).result
  assert.ok(Array.isArray(result.errors) && result.errors.length >= 2, `应收集到多处错误: ${JSON.stringify(result.errors)}`)
  assert.ok(result.errors.some((e) => /valid IANA time zone/.test(e)), `应报告坏时区: ${result.errors.join('; ')}`)
  assert.ok(result.errors.some((e) => /peakWindows must be an array/.test(e)), `应报告坏窗口: ${result.errors.join('; ')}`)

  const srec = await callRoute(routes[0], fakeReq('GET', '/session-guard/settings'), fakeRes())
  const cfg = JSON.parse(srec.chunks.join('')).settings
  // 坏值被忽略 → 仍是内置默认（默认窗口 = morning/afternoon），绝不变成「无窗口」
  assert.equal(cfg.timezone, 'Asia/Shanghai')
  assert.deepEqual(cfg.peakWindows.map((w) => w.name), ['morning', 'afternoon'])
})

test('readCfg：settings 服务完全没有 describe()/get() 时也不炸（fail-open）', async (t) => {
  withTmpState(t)
  withConfigFile(t, CFG_MORNING)
  const { ctx, routes } = fakeCtx()
  ctx.settings = {}
  assert.doesNotThrow(() => apply(ctx))
  const rec = await callRoute(routes[0], fakeReq('GET', '/session-guard/settings'), fakeRes())
  const cfg = JSON.parse(rec.chunks.join('')).settings
  assert.deepEqual(cfg.peakWindows.map((w) => w.name), ['morning'], '应回退到配置文件的值')
})

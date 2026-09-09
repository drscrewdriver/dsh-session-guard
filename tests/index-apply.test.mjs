/**
 * index.js 装配测试：`apply()` 在最小 fake ctx 下能装好命令 / 监听 / 路由，
 * 且 `/pause` `/resume` `/cancel` handler 在无 live agent 时返回错误而不是抛错。
 *
 * 覆盖 C21（命令行为不变）与 C23（新增路径 fail-open）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
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

test('路由：GET /state 返回 paused{step,turn,manual} 与 stepGate', async (t) => {
  withTmpState(t)
  const { ctx, routes } = fakeCtx()
  apply(ctx)
  const rec = await callRoute(routes[0], fakeReq('GET', '/session-guard/state?session=s1'), fakeRes())
  assert.equal(rec.code, 200)
  const body = JSON.parse(rec.chunks.join(''))
  assert.equal(body.ok, true)
  assert.deepEqual(body.paused, { step: false, turn: false, manual: false })
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

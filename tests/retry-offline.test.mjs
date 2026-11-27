/**
 * offline.js + retry.js 断网挂起测试（③）。
 *
 * 三条主线：
 * 1. 探测口径（网卡 + DNS、零 HTTP、代理只查网卡、抛错 fail-open）；
 * 2. 等待器（进入→恢复；中途 cancel；onHold 只调一次）；
 * 3. 接线（挂起不消耗 consecutive —— 且与开关解耦；四个取消触发点）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isNetworkClassFailure, createOfflineWaiter, probeOnline, NETWORK_CLASS_CODES } from '../src/offline.js'
import { createRetry, DEFAULT_RETRY } from '../src/retry.js'
import { DEFAULT_SETTINGS } from '../src/settings.js'

const LAN_ON = { en0: [{ address: '192.168.1.10', internal: false, family: 'IPv4' }] }
const LAN_OFF = { lo0: [{ address: '127.0.0.1', internal: true, family: 'IPv4' }] }
const okLookup = (host, opts, cb) => cb(null, '1.2.3.4')
const failLookup = (host, opts, cb) => cb(new Error('ENOTFOUND'))

// ── 1. 网络类判定 ──

test('isNetworkClassFailure：只管网络类，5xx / 429 一律 false', () => {
  assert.equal(isNetworkClassFailure({ code: 'TRANSPORT' }), true)
  assert.equal(isNetworkClassFailure({ code: 'timeout' }), true)
  assert.equal(isNetworkClassFailure({ code: 'DNS' }), true)
  assert.equal(isNetworkClassFailure({ code: 'ECONNRESET' }), true)
  assert.equal(isNetworkClassFailure({ code: 'OVERLOADED', status: 503 }), false)
  assert.equal(isNetworkClassFailure({ code: 'RATE_LIMIT', status: 429 }), false)
  assert.equal(isNetworkClassFailure({ status: 500 }), false)
  assert.equal(isNetworkClassFailure({}), false)
  assert.equal(isNetworkClassFailure(), false)
  assert.equal(NETWORK_CLASS_CODES.size, 11)
})

// ── 2. 探测 probeOnline ──

test('probeOnline：网卡 up + DNS 通 → true', async () => {
  const out = await probeOnline({ interfaces: LAN_ON, lookup: okLookup, env: {} })
  assert.equal(out, true)
})

test('probeOnline：无非回环网卡 → false（且不做 DNS 解析）', async () => {
  let lookups = 0
  const out = await probeOnline({
    interfaces: LAN_OFF,
    lookup: (h, o, cb) => { lookups += 1; cb(null, '1.2.3.4') },
    env: {},
  })
  assert.equal(out, false)
  assert.equal(lookups, 0)
})

test('probeOnline：有链路但 DNS 失败 → false', async () => {
  assert.equal(await probeOnline({ interfaces: LAN_ON, lookup: failLookup, env: {} }), false)
})

test('probeOnline：探测自身抛错 → fail-open 返回 true', async () => {
  assert.equal(await probeOnline({
    interfaces: LAN_ON,
    lookup: () => { throw new Error('boom') },
    env: {},
  }), true)
  assert.equal(await probeOnline({
    interfaces: () => { throw new Error('boom') },
    lookup: okLookup,
    env: {},
  }), true)
})

test('probeOnline：超时 → fail-open 返回 true', async () => {
  const out = await probeOnline({ interfaces: LAN_ON, lookup: () => {}, timeoutMs: 30, env: {} })
  assert.equal(out, true)
})

test('probeOnline：设了 HTTP(S)_PROXY / ALL_PROXY 时只查网卡、不查 DNS', async () => {
  for (const env of [{ HTTP_PROXY: 'http://127.0.0.1:7890' }, { https_proxy: 'http://x' }, { ALL_PROXY: 'socks5://x' }]) {
    let lookups = 0
    const out = await probeOnline({
      interfaces: LAN_ON,
      lookup: (h, o, cb) => { lookups += 1; cb(new Error('ENOTFOUND')) },
      env,
    })
    assert.equal(out, true, JSON.stringify(env))
    assert.equal(lookups, 0, JSON.stringify(env) + ' 下不得做 DNS 解析')
  }
})

// ── 3. 等待器 ──

const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms))

test('createOfflineWaiter：进入挂起 → 网回来自动恢复；onHold 只调一次', async () => {
  let holds = 0
  let resumes = 0
  let online = false
  const w = createOfflineWaiter({
    probe: async () => online,
    everyMs: 3000,
    onHold: () => { holds += 1 },
    onResume: () => { resumes += 1 },
  })
  const p = w.wait()
  await settle(10)
  assert.equal(holds, 1)
  assert.equal(w.isPending(), true)
  // 再 wait 一次不得重复进入（同一挂起）
  const p2 = w.wait()
  await settle(10)
  assert.equal(holds, 1)
  assert.equal(p2, p)
  online = true
  await settle(3050)
  assert.equal(await p, 'online')
  assert.equal(resumes, 1)
  assert.equal(w.isPending(), false)
})

test('createOfflineWaiter：中途 cancel → 立刻结束且不误报恢复', async () => {
  let resumes = 0
  const w = createOfflineWaiter({ probe: async () => false, everyMs: 3000, onResume: () => { resumes += 1 } })
  const p = w.wait()
  await settle(10)
  w.cancel()
  assert.equal(await p, 'cancelled')
  assert.equal(resumes, 0)
  assert.equal(w.isPending(), false)
  w.cancel() // 幂等
})

// ── 4. 接线：挂起与计数豁免 ──

function harness({ probe, settings = {}, frozen = () => false } = {}) {
  const handlers = []
  const sent = []
  const ctx = {
    agents: new Map([['s1', { status: 'idle', followup: (m) => sent.push(m) }]]),
    logger: { info: () => {}, warn: () => {} },
    on(name, fn) {
      handlers.push(fn)
      return () => {}
    },
  }
  let cfg = { ...DEFAULT_RETRY, ...DEFAULT_SETTINGS, retryEnabled: true, retryGraceMs: 5, ...settings }
  const retry = createRetry({ ctx, getSettings: () => cfg, isFrozen: frozen, probe })
  const emit = (type, data) => retry.onEvent({ id: 's1' }, { type, data })
  return {
    retry,
    sent,
    emit,
    setSettings: (patch) => { cfg = { ...cfg, ...patch } },
    state: () => retry.state('s1'),
  }
}

const NET_FAIL_DATA = { reason: { kind: 'error', error: { code: 'TRANSPORT', message: 'socket hang up' } } }

test('开关打开 + 断网：进入挂起，consecutive 不涨；网回来后正常续一次', async () => {
  let online = false
  const h = harness({ probe: async () => online, settings: { retryPauseWhenOffline: true, retryOfflineCheckMs: 3000 } })
  h.emit('turn/end', NET_FAIL_DATA)
  await settle(40)
  assert.equal(h.sent.length, 0, '断网期间不得发送')
  assert.equal(h.state().consecutive, 0, '挂起不消耗重试预算')
  assert.equal(h.retry.waiters.get('s1').isPending(), true, '应处于挂起')
  online = true
  await settle(3100)
  assert.equal(h.sent.length, 1, '网回来后应续一次')
  assert.equal(h.state().consecutive, 1)
})

test('计数豁免与开关解耦：开关关闭时断网也不涨 consecutive', async () => {
  const h = harness({ probe: async () => false, settings: { retryPauseWhenOffline: false } })
  h.emit('turn/end', NET_FAIL_DATA)
  await settle(40)
  assert.equal(h.sent.length, 0, '关=直接跳过本次')
  assert.equal(h.state().consecutive, 0, '断网失败不计入预算')
  assert.equal(h.retry.waiters.size, 0, '关时不建等待器')
})

test('非网络类失败不受开关影响：仍走原 grace + 计数', async () => {
  const h = harness({ probe: async () => false, settings: { retryPauseWhenOffline: true } })
  h.emit('turn/end', { reason: { kind: 'error', error: { code: 'OVERLOADED', status: 503, message: 'busy' } } })
  await settle(40)
  assert.equal(h.sent.length, 1, '5xx 不是断网，应照常重试')
  assert.equal(h.state().consecutive, 1)
})

test('取消触发点一：用户消息取消挂起', async () => {
  const h = harness({ probe: async () => false, settings: { retryPauseWhenOffline: true } })
  h.emit('turn/end', NET_FAIL_DATA)
  await settle(40)
  assert.equal(h.retry.waiters.get('s1').isPending(), true)
  h.emit('user/message', { source: { kind: 'user' }, content: [] })
  await settle(20)
  assert.equal(h.retry.waiters.get('s1').isPending(), false)
  assert.equal(h.sent.length, 0)
})

test('取消触发点二：新回合（turn/start）取消挂起', async () => {
  const h = harness({ probe: async () => false, settings: { retryPauseWhenOffline: true } })
  h.emit('turn/end', NET_FAIL_DATA)
  await settle(40)
  h.emit('turn/start', { turn: 2 })
  await settle(20)
  assert.equal(h.retry.waiters.get('s1').isPending(), false)
  assert.equal(h.sent.length, 0)
})

test('取消触发点三：会话冻结取消挂起（waiter 重探轮询到 frozen 即解除）', async () => {
  let frozen = false
  const h = harness({
    probe: async () => false, // 一直离线
    settings: { retryPauseWhenOffline: true, retryOfflineCheckMs: 20 },
    frozen: () => frozen,
  })
  h.emit('turn/end', NET_FAIL_DATA)
  await settle(30)
  assert.equal(h.retry.waiters.get('s1').isPending(), true, '先确认已进入挂起')
  frozen = true
  await settle(60) // 下一个重探周期发现冻结 → 解除挂起
  assert.equal(h.retry.waiters.get('s1').isPending(), false, '冻结时不得继续挂起（让路优先）')
  assert.equal(h.sent.length, 0, '冻结期间不发送')
  assert.equal(h.state().consecutive, 0)
})

test('取消触发点四：运行中关掉开关 → cancelOfflineHolds 解除挂起', async () => {
  const h = harness({ probe: async () => false, settings: { retryPauseWhenOffline: true } })
  h.emit('turn/end', NET_FAIL_DATA)
  await settle(40)
  assert.equal(h.retry.waiters.get('s1').isPending(), true)
  h.setSettings({ retryPauseWhenOffline: false }) // 模拟用户在设置页关掉
  h.retry.cancelOfflineHolds() // index.js 的 onChange 钩子正是这么接的
  await settle(20)
  assert.equal(h.retry.waiters.size, 0)
  assert.equal(h.sent.length, 0)
  assert.equal(h.state().consecutive, 0)
})

test('探测抛错时接线侧 fail-open：照常重试（不误挂起）', async () => {
  const h = harness({
    probe: async () => { throw new Error('probe blew up') },
    settings: { retryPauseWhenOffline: true },
  })
  h.emit('turn/end', NET_FAIL_DATA)
  await settle(40)
  assert.equal(h.sent.length, 1)
  assert.equal(h.state().consecutive, 1)
})

// ── 5. 配置默认值 ──

test('两个新键的默认值：retryPauseWhenOffline 关、检查间隔 15000', () => {
  assert.equal(DEFAULT_SETTINGS.retryPauseWhenOffline, false)
  assert.equal(DEFAULT_SETTINGS.retryOfflineCheckMs, 15000)
  assert.equal(DEFAULT_RETRY.retryPauseWhenOffline, false)
  assert.equal(DEFAULT_RETRY.retryOfflineCheckMs, 15000)
})

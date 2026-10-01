/**
 * 畅跑「单会话隔离」端到端测试。
 *
 * 这是本特性最核心的不变量：**只有排定畅跑的那个会话被豁免**，其他会话照常按峰谷暂停；
 * 而且畅跑只能挂在 per-session 钩子上生效（`resolve()` / `scheduler` 是全局的，不知道它存在）。
 *
 * 用真实 `stepGate` + 真实 `wiring` + 真实 `scheduler` 组合，只把「时间」与「agent」做成可控的。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeState, transition } from '../src/scheduler.js'
import { createWiring } from '../src/wiring.js'
import { createStepGate } from '../src/step-gate.js'
import { FREE_RUN_STATES, createFreeRunStore, freeRunState, isFreeRunActive } from '../src/free-run.js'

const TZ = 'Asia/Shanghai'
/** 周一 2026-08-24 13:00 北京 = UTC 05:00 → NORMAL（下午峰之前）。 */
const VALLEY_AT = new Date('2026-08-24T05:00:00Z')
/** 周一 2026-08-24 14:30 北京 = UTC 06:30 → PEAK（afternoon 窗口内）。 */
const PEAK_AT = new Date('2026-08-24T06:30:00Z')
const H = 60 * 60 * 1000

/** 覆盖谷时与峰时的窗口（北京 13:00–17:00）。 */
const WINDOW_FROM = VALLEY_AT.getTime()
const WINDOW_TO = VALLEY_AT.getTime() + 4 * H

const CFG = {
  enabled: true,
  timezone: TZ,
  peakPolicy: { peakWindows: [{ name: 'afternoon', start: '14:00', end: '18:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] }] },
  weekendPolicy: { enabled: true, days: ['sat', 'sun'], mode: 'offPeak' },
  providerGuard: false, // 纯时间判定：把变量收敛到「畅跑豁免」本身
  stepLevelPause: true,
  stepGateTimeoutMs: 300_000,
  pauseMode: 'safe',
  pauseReason: 'wait',
  offPeakAutoResume: true,
  guardSubagents: true,
}

const silent = { info() {}, warn() {}, error() {} }

function env(t, sessionIds, now = VALLEY_AT) {
  const dir = mkdtempSync(join(tmpdir(), 'session-guard-fr-e2e-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const clockRef = { now }
  const freeRunStore = createFreeRunStore({ dir })
  const agents = sessionIds.map((id) => ({ id, status: 'running' }))
  const agentsById = new Map(agents.map((a) => [a.id, a]))

  function isActiveNow(id) {
    const rec = freeRunStore.get(id)
    return rec === null ? false : isFreeRunActive(rec, clockRef.now.getTime())
  }

  const resumeCalls = []
  const wiringRef = { wiring: null }

  const stepGate = createStepGate({
    getSettings: () => CFG,
    shouldHoldSession: (cfg, id) => wiringRef.wiring.shouldPauseSession(cfg, id) === true,
    isHeldByDeferrals: () => false,
    isRootAgent: () => true,
    pauseGate: { pause: () => ({ kind: 'success' }) },
    logger: silent,
    // 关键：step 门内部用 now() 判定峰谷，必须注入可控时钟，否则读到的是真实时间。
    now: () => clockRef.now.getTime(),
    onChange: () => {},
  })

  const gate = {
    stopNextTurn: async () => ({ ok: true, via: 'pauseGate' }),
    resume: async (id, opts) => {
      resumeCalls.push([id, opts])
      return { ok: true, via: 'pauseGate' }
    },
  }

  const wiring = createWiring({
    ctx: {
      agents: { roots: () => agents, list: () => agents, get: (id) => agentsById.get(id) },
      get: () => undefined,
      logger: silent,
      on: () => () => {},
    },
    getSettings: () => CFG,
    gate,
    stepGate,
    logger: silent,
    clock: () => clockRef.now,
    isFreeRunActive: (id, date) => {
      const rec = freeRunStore.get(id)
      if (rec === null) return false
      const ts = date instanceof Date ? date.getTime() : Number(date)
      return isFreeRunActive(rec, Number.isFinite(ts) ? ts : clockRef.now.getTime())
    },
  })
  wiringRef.wiring = wiring

  /** 与 index.js 的 30s tick 同构。 */
  const st = { last: null }
  async function tick() {
    const next = computeState(CFG, clockRef.now)
    if (st.last === null) {
      st.last = next
      return null
    }
    const tr = transition(st.last, next)
    st.last = { ...next }
    if (tr.enter) {
      await wiring.onEnterPeak(CFG)
      return 'enter'
    }
    if (tr.leave) {
      await wiring.onLeavePeak(CFG)
      return 'leave'
    }
    return null
  }

  /**
   * 模拟 index.js 的 `applyFreeRunTransition`（host 侧唯一的副作用出口），
   * 只保留与隔离性有关的部分：进入时放行该会话的门；离开且仍在峰内时重新挂起。
   */
  async function applyTransition(id, nowActive) {
    if (nowActive) {
      stepGate.release(id, 'free-run')
      return
    }
    if (computeState(CFG, clockRef.now).state === 'PAUSED_PEAK') stepGate.clearBypass(id)
  }

  /** 写入一段畅跑并驱动一次迁移；返回写入后是否生效。 */
  async function setWindow(id, fromMs, toMs, paused = false) {
    const before = isActiveNow(id)
    freeRunStore.set(id, { sessionId: id, windows: [{ id: 'w', fromMs, toMs, paused }], updatedAt: clockRef.now.getTime() })
    const after = isActiveNow(id)
    if (before !== after) await applyTransition(id, after)
    return after
  }

  /** 暂停 / 恢复**某一段**并驱动一次迁移（对应面板每行的 ⏸ / ▶）。 */
  async function setWindowPaused(id, windowId, paused) {
    const rec = freeRunStore.get(id)
    if (rec === null) return false
    const before = isActiveNow(id)
    freeRunStore.set(id, {
      ...rec,
      windows: rec.windows.map((w) => (w.id === windowId ? { ...w, paused } : w)),
      updatedAt: clockRef.now.getTime(),
    })
    const after = isActiveNow(id)
    if (before !== after) await applyTransition(id, after)
    return after
  }

  return {
    wiring,
    stepGate,
    freeRunStore,
    clockRef,
    resumeCalls,
    tick,
    setWindow,
    setWindowPaused,
    applyTransition,
    isActive: isActiveNow,
    stateOf: (id) => freeRunState(freeRunStore.get(id), clockRef.now.getTime()),
    /** 模拟会话跑到下一个 pre-step 边界（step 2，step>1 是拉门的前提）。 */
    preStep: (id) => stepGate.hold({ agent: agentsById.get(id), step: 2, turn: 1 }, () => Promise.resolve({ kind: 'enter', messages: [] })),
    held: (id) => stepGate.state(id).held === true,
  }
}

test('畅跑只豁免排定的那个会话：入峰时 A 被跳过、B 照常拉门', async (t) => {
  const e = env(t, ['A', 'B'])
  await e.tick() // 基线（谷时 NORMAL）
  assert.equal(await e.setWindow('A', WINDOW_FROM, WINDOW_TO), true)
  assert.equal(e.stateOf('A'), FREE_RUN_STATES.ACTIVE)
  assert.equal(e.stateOf('B'), FREE_RUN_STATES.NONE)

  e.clockRef.now = PEAK_AT
  assert.equal(await e.tick(), 'enter')
  const { paused, skipped } = await e.wiring.onEnterPeak(CFG)
  assert.deepEqual(paused.map((p) => p.sessionId), ['B'], '只有 B 应被拉门')
  assert.deepEqual(skipped, [{ sessionId: 'A', why: 'free-run' }])

  // A 的 pre-step 不拦，B 的 pre-step 被拦
  const aHold = e.preStep('A')
  assert.equal(e.held('A'), false, '畅跑会话不应被 step 门拦住')
  await aHold
  const bHold = e.preStep('B')
  assert.equal(e.held('B'), true, '普通会话应被 step 门拦住')
  e.stepGate.release('B', 'test')
  await bHold
})

test('暂停该段畅跑后该会话在下一个 pre-step 被拉门（自动挂起）', async (t) => {
  const e = env(t, ['A'])
  await e.tick()
  await e.setWindow('A', WINDOW_FROM, WINDOW_TO)
  e.clockRef.now = PEAK_AT
  await e.tick() // enter

  const aHold = e.preStep('A')
  assert.equal(e.held('A'), false, '畅跑生效中不拦')
  await aHold

  // 用户点面板该行的 ⏸（只暂停这一段）
  assert.equal(await e.setWindowPaused('A', 'w', true), false)
  assert.equal(e.stateOf('A'), FREE_RUN_STATES.SUSPENDED)
  await e.applyTransition('A', false)

  const held = e.preStep('A')
  assert.equal(e.held('A'), true, '暂停畅跑后应在下一个 pre-step 被挂起')
  e.stepGate.release('A', 'test')
  await held
})

test('畅跑开始时释放该会话已挂起的 step 门', async (t) => {
  const e = env(t, ['A'])
  await e.tick()
  e.clockRef.now = PEAK_AT
  await e.tick() // enter
  assert.equal(e.held('A'), false, '尚未拉门（会话还没走到 pre-step）')
  const held = e.preStep('A')
  assert.equal(e.held('A'), true, '入峰后走到 pre-step 被挂起')

  // 会话此时是挂着的：开畅跑应把门放开
  await e.setWindow('A', WINDOW_FROM, WINDOW_TO)
  assert.equal(e.held('A'), false, '开畅跑应把已挂起的门放开')
  await held
})

test('多段畅跑：第一段结束仍在峰内则挂起，第二段开始再次放行', async (t) => {
  const e = env(t, ['A'])
  await e.tick()
  const base = VALLEY_AT.getTime()
  // 两段：谷时那段 + 2h 后那段（中间空档落在峰内）
  e.freeRunStore.set('A', {
    sessionId: 'A',
    windows: [
      { id: 'w1', fromMs: base, toMs: base + 1 * H },
      { id: 'w2', fromMs: base + 3 * H, toMs: base + 5 * H },
    ],
    updatedAt: base,
  })
  await e.applyTransition('A', true)
  e.clockRef.now = new Date(base + 30 * 60 * 1000) // 第一段内（13:30，谷时）
  await e.tick()

  const h1 = e.preStep('A')
  assert.equal(e.held('A'), false, '第一段生效中不拦')
  await h1

  // 第一段结束、第二段未开始，且当前在峰内 → 挂起
  e.clockRef.now = new Date(base + 2 * H) // 15:00 峰内
  assert.equal(e.isActive('A'), false)
  assert.equal(e.stateOf('A'), FREE_RUN_STATES.SCHEDULED)
  await e.applyTransition('A', false)
  const h2 = e.preStep('A')
  assert.equal(e.held('A'), true, '段间空档（峰内）应被挂起')
  e.stepGate.release('A', 'test')
  await h2

  // 第二段开始 → 再次放行
  e.clockRef.now = new Date(base + 3 * H + 60_000) // 16:01 峰内，但第二段生效
  assert.equal(e.isActive('A'), true)
  await e.applyTransition('A', true)
  assert.equal(e.held('A'), false, '第二段开始应再次放行')
})

test('退峰时畅跑会话与普通会话都恢复（走既有 onLeavePeak 路径）', async (t) => {
  const e = env(t, ['A', 'B'])
  await e.tick()
  await e.setWindow('A', WINDOW_FROM, WINDOW_TO)
  e.clockRef.now = PEAK_AT
  await e.tick() // enter
  e.clockRef.now = new Date('2026-08-24T10:30:00Z') // 北京 18:30 → 谷时
  assert.equal(await e.tick(), 'leave')
  assert.deepEqual(e.resumeCalls.map(([id]) => id).sort(), ['A', 'B'], '退峰应恢复全部 root 会话')
})

test('畅跑与周末规则互不干扰：周末本就空闲，畅跑不改变结论', async (t) => {
  const e = env(t, ['A'], new Date('2026-08-22T02:00:00Z')) // 周六 10:00
  await e.tick()
  assert.equal(computeState(CFG, e.clockRef.now).state, 'NORMAL', '周末非峰')
  assert.equal(e.isActive('A'), false)
  assert.equal(e.stateOf('A'), FREE_RUN_STATES.NONE)
})

test('手动「暂停会话」不受畅跑边界影响（畅跑释放只认 peak_window）', async (t) => {  const e = env(t, ['A'])
  await e.tick()
  e.clockRef.now = PEAK_AT
  await e.tick() // enter
  // 用户手动请求暂停（优先级最高，绕过峰谷/step/provider）
  e.stepGate.requestPause('A')
  const h = e.preStep('A')
  assert.equal(e.held('A'), true, '手动暂停应拉门')

  // 畅跑生效 → 释放的是 step 门（用户显式开了畅跑，就该继续跑）
  await e.setWindow('A', WINDOW_FROM, WINDOW_TO)
  assert.equal(e.held('A'), false)
  await h
})

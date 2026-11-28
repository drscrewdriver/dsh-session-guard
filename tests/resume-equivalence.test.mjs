/**
 * resume-equivalence.test.mjs — **恢复入口等效性矩阵**（v4.6.0）。
 *
 * 事故根因：三条恢复路径各自演进 —— UI 按钮走 `stepResume`（只放 step 门 +
 * 请求级 hold，**从不调 pauseGate.resume**）、`/guard resume` 走 `pauseGate.resume`、
 * RPC `resume` 走 `gate.resume`（硬编码 `confirm:true`）。于是「真暂停时点按钮
 * 什么也没发生」，而命令却能恢复。
 *
 * 本测试把「入口 × 暂停来源」的期望矩阵锁死：任何一处分叉都会在这里变红，
 * 且失败信息直接指出**是哪条入口**不一致（每个 test 名带入口名）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.js'
import { createGate } from '../lib/gate.js'
import { createBridge } from '../lib/bridge.js'

// ── 测试脚手架 ────────────────────────────────────────────────────────

/** 每测试独立临时状态目录（store 落盘隔离）。 */
function tmpStore(t) {
  const dir = mkdtempSync(join(tmpdir(), 'session-guard-equiv-'))
  const old = process.env.DSH_SESSION_GUARD_STATE_DIR
  process.env.DSH_SESSION_GUARD_STATE_DIR = dir
  t.after(() => {
    rmSync(dir, { recursive: true, force: true })
    if (old === undefined) delete process.env.DSH_SESSION_GUARD_STATE_DIR
    else process.env.DSH_SESSION_GUARD_STATE_DIR = old
  })
  return createStore()
}

/**
 * 假 pauseGate：用一个内存「暂停快照」模拟四种暂停来源的恢复语义。
 *
 * - `force+interruptedTool`：`confirm !== true` → `needConfirmation`，快照保留；
 * - `safe+deferredTools`   ：同上；
 * - `plain turn pause`     ：直接 success 并清快照；
 * - 未暂停                 ：`success` + `no paused task to resume`（不误报 error）。
 */
function fakePauseGate(initial, t) {
  const snap = { paused: initial.paused === true, forced: initial.forced === true, calls: [] }
  const api = {
    pause: () => ({ kind: 'success', text: 'paused' }),
    resume: (id, opts) => {
      snap.calls.push({ id, opts })
      if (!snap.paused) return { kind: 'success', text: 'no paused task to resume' }
      if (snap.forced && opts.confirm !== true) {
        return { kind: 'error', needConfirmation: true, text: '需要确认' }
      }
      snap.paused = false
      return { kind: 'success', text: 'task resumed' }
    },
    cancel: () => ({ kind: 'success', text: 'cancelled' }),
    state: () => ({ paused: snap.paused, forced: snap.forced }),
    taskControlAvailable: () => true,
  }
  t.after(() => {
    /* no-op */
  })
  return { api, snap }
}

/** 假 stepGate：held 状态 + release/markBypass 记录。 */
function fakeStepGate(initialHeld, t) {
  const st = { held: initialHeld === true, bypass: false, releases: [] }
  const api = {
    requestPause: () => ({ requested: true, held: st.held }),
    release: (id, reason) => {
      st.releases.push({ id, reason })
      const was = st.held
      st.held = false
      return { released: was }
    },
    markBypass: () => {
      st.bypass = true
    },
    state: () => ({ held: st.held, manual: false, since: st.held ? 1 : null, bypass: st.bypass }),
    heldIds: () => (st.held ? ['s1'] : []),
  }
  t.after(() => {
    /* no-op */
  })
  return { api, st }
}

/** 假 deferrals：请求级 hold 登记表。 */
function fakeDeferrals(initialHeld, t) {
  const d = { held: initialHeld === true, settled: [], cleared: [] }
  const api = {
    settle: (id, reason, outcome) => {
      d.settled.push({ id, reason, outcome })
      if (!d.held) return false
      d.held = false
      return true
    },
    clearDeferred: (id) => {
      d.cleared.push(id)
      return true
    },
    has: () => d.held,
    list: () => (d.held ? [{ sessionId: 's1', since: 7 }] : []),
    size: () => (d.held ? 1 : 0),
  }
  t.after(() => {
    /* no-op */
  })
  return { api, d }
}

const CFG = {
  enabled: true, weekendMode: true, timezone: 'Asia/Shanghai', peakWindows: [],
  pauseMode: 'safe', pauseReason: 'wait', queueFallback: true,
}

/**
 * 装一套完整装置，返回三条「入口」的统一调用器。
 *
 * 三入口刻意用**不同的调用形状**（这正是事故根源），但都必须落到
 * `bridge.resumeSession`：
 * - `command`：`/guard resume` 形态（tokens → confirm/choice）
 * - `rpc`    ：POST /rpc `{action:'resume', confirm, choice}` 形态
 * - `ui`     ：按钮形态（先 `{action:'resume'}` 无 confirm，再带 confirm 二次点击）
 */
function harness(t, { paused = false, forced = false, stepHeld = false, requestHeld = false } = {}) {
  const store = tmpStore(t)
  const { api: pauseGate, snap } = fakePauseGate({ paused, forced }, t)
  const { api: stepGate, st: stepSt } = fakeStepGate(stepHeld, t)
  const { api: deferrals, d: defState } = fakeDeferrals(requestHeld, t)
  const gate = createGate({ getCtx: () => ({ get: () => undefined }), getSettings: () => CFG, store, pauseGate })
  const bridge = createBridge({ get: () => undefined }, gate, store, pauseGate, stepGate, deferrals)

  const entries = {
    /** `/guard resume [confirm] [rerun|skip]` */
    command: (tokens = []) => bridge.resumeSession('s1', {
      confirm: tokens.includes('confirm'),
      choice: tokens.includes('skip') ? 'skip' : 'rerun',
      reason: 'command',
      by: 'command:guard',
    }),
    /** POST /rpc {action:'resume', confirm, choice} */
    rpc: (body = {}) => bridge.resumeSession('s1', {
      confirm: body.confirm === true,
      choice: body.choice === 'skip' ? 'skip' : 'rerun',
      reason: 'rpc',
      by: 'rpc:resume',
    }),
    /** UI 按钮：首次点击不带 confirm，确认行二次点击带 confirm */
    ui: (choice) => bridge.resumeSession('s1', {
      confirm: choice !== undefined,
      choice: choice ?? 'rerun',
      reason: 'manual',
      by: 'ui:pause-button',
    }),
  }
  return { bridge, gate, pauseGate, stepGate, deferrals, snap, stepSt, defState, entries, store }
}

/** 归一化一次恢复结果，只留语义字段（供跨入口 deepEqual）。 */
function shape(r) {
  return {
    resumed: r.resumed === true,
    needConfirmation: r.needConfirmation === true,
    pauseKind: r.pause?.kind ?? null,
    stepReleased: r.step?.released === true,
    stepBypass: r.step?.bypass === true,
    requestReleased: r.step?.requestReleased === true,
  }
}

// ── 矩阵：5 种暂停来源 × 3 条入口 ─────────────────────────────────────

/** 五种暂停来源及其「不带 confirm 首次点击」的期望。 */
const SCENARIOS = [
  {
    name: 'force 真暂停 + 中断工具',
    setup: { paused: true, forced: true },
    // 未确认：三入口都必须返回 needConfirmation，且**不**清快照
    firstExpect: { resumed: false, needConfirmation: true, pauseKind: 'error' },
    afterConfirm: { resumed: true, needConfirmation: false, pauseKind: 'success' },
  },
  {
    name: 'safe 真暂停（无延迟工具）',
    setup: { paused: true, forced: false },
    firstExpect: { resumed: true, needConfirmation: false, pauseKind: 'success' },
    afterConfirm: { resumed: true, needConfirmation: false, pauseKind: 'success' },
  },
  {
    name: '仅 step 门挂起',
    setup: { stepHeld: true },
    firstExpect: { resumed: true, needConfirmation: false, pauseKind: 'success', stepReleased: true, stepBypass: true },
    afterConfirm: { resumed: true, needConfirmation: false, pauseKind: 'success', stepReleased: true, stepBypass: true },
  },
  {
    name: '仅请求级 hold',
    setup: { requestHeld: true },
    firstExpect: { resumed: true, needConfirmation: false, pauseKind: 'success', requestReleased: true, stepBypass: true },
    afterConfirm: { resumed: true, needConfirmation: false, pauseKind: 'success', requestReleased: true, stepBypass: true },
  },
  {
    name: '未暂停',
    setup: {},
    firstExpect: { resumed: true, needConfirmation: false, pauseKind: 'success' },
    afterConfirm: { resumed: true, needConfirmation: false, pauseKind: 'success' },
  },
]

for (const sc of SCENARIOS) {
  test(`等效矩阵 · ${sc.name}：三入口首次点击结果一致`, (t) => {
    const results = {}
    for (const name of ['command', 'rpc', 'ui']) {
      const h = harness(t, sc.setup)
      // 首次点击：command 无 token、rpc 无 confirm、ui 无 choice（三者都是「未确认」）
      const call = name === 'command' ? h.entries.command([]) : name === 'rpc' ? h.entries.rpc({}) : h.entries.ui()
      results[name] = shape(call)
    }
    // 三入口两两相等（失败信息指名入口）
    assert.deepEqual(results.command, results.rpc, `command 与 rpc 不一致：${JSON.stringify(results)}`)
    assert.deepEqual(results.rpc, results.ui, `rpc 与 ui 不一致：${JSON.stringify(results)}`)
    // 且符合该场景的期望子集
    for (const [k, v] of Object.entries(sc.firstExpect)) {
      assert.equal(results.command[k], v, `${sc.name} · command.${k} 期望 ${String(v)}`)
    }
  })

  test(`等效矩阵 · ${sc.name}：三入口带 confirm 后结果一致`, (t) => {
    const results = {}
    for (const name of ['command', 'rpc', 'ui']) {
      const h = harness(t, sc.setup)
      const call = name === 'command'
        ? h.entries.command(['confirm'])
        : name === 'rpc'
          ? h.entries.rpc({ confirm: true })
          : h.entries.ui('rerun')
      results[name] = shape(call)
    }
    assert.deepEqual(results.command, results.rpc, `command 与 rpc 不一致：${JSON.stringify(results)}`)
    assert.deepEqual(results.rpc, results.ui, `rpc 与 ui 不一致：${JSON.stringify(results)}`)
    for (const [k, v] of Object.entries(sc.afterConfirm)) {
      assert.equal(results.command[k], v, `${sc.name} · command.${k} 期望 ${String(v)}`)
    }
  })
}

// ── 关键不变量：确认语义与状态回写 ────────────────────────────────────

test('不变量 · force 真暂停未确认时**不清暂停快照**（保持暂停，等用户选）', (t) => {
  const h = harness(t, { paused: true, forced: true })
  const r = h.entries.ui()
  assert.equal(r.needConfirmation, true)
  assert.equal(h.snap.paused, true, '未确认时暂停快照必须保留')
  // 用户选「保持暂停」= 不再调用任何恢复入口 → 状态原样
  assert.equal(h.bridge.state('s1').pausedAny, true, 'pausedAny 必须仍为 true')
})

test('不变量 · force 真暂停确认后清快照，且 followup 由 pauseGate 负责', (t) => {
  const h = harness(t, { paused: true, forced: true })
  const r = h.entries.ui('rerun')
  assert.equal(r.resumed, true)
  assert.equal(h.snap.paused, false, '确认后暂停快照必须被清')
  // confirm 与 choice 原样透传到 pauseGate（顺序：一次调用，参数不丢）
  const last = h.snap.calls.at(-1)
  assert.deepEqual(last.opts, { confirm: true, choice: 'rerun' })
})

test('不变量 · skip 选择原样透传（不静默改成 rerun）', (t) => {
  const h = harness(t, { paused: true, forced: true })
  h.entries.ui('skip')
  assert.deepEqual(h.snap.calls.at(-1).opts, { confirm: true, choice: 'skip' })
})

test('不变量 · step 门与请求级 hold 在恢复时**同时**被结算（不只放一个）', (t) => {
  const h = harness(t, { paused: true, stepHeld: true, requestHeld: true })
  const r = h.entries.command(['confirm'])
  assert.equal(r.step.released, true, 'step 门必须释放')
  assert.equal(r.step.requestReleased, true, '请求级 hold 必须结算')
  assert.equal(h.defState.held, false)
  assert.equal(h.stepSt.held, false)
})

test('不变量 · 未暂停会话上恢复不误报 error（no paused task to resume）', (t) => {
  const h = harness(t, {})
  const r = h.entries.command([])
  assert.equal(r.pause.kind, 'success')
  assert.equal(r.pause.text, 'no paused task to resume')
})

test('不变量 · resumeSession 的 step 部分永远置 bypass（用户显式继续）', (t) => {
  const h = harness(t, { stepHeld: true })
  const r = h.entries.ui()
  assert.equal(r.step.bypass, true)
  assert.equal(h.stepSt.bypass, true)
})

// ── 旧名兼容 ──────────────────────────────────────────────────────────

test('兼容 · bridge.resume（旧名）与 resumeSession 语义一致', (t) => {
  const h1 = harness(t, { paused: true, forced: true })
  const legacy = shape(h1.bridge.resume('s1', {}))
  const h2 = harness(t, { paused: true, forced: true })
  const fresh = shape(h2.bridge.resumeSession('s1', {}))
  assert.deepEqual(legacy, fresh)
  assert.equal(legacy.needConfirmation, true, '旧名不得隐式 confirm')
})

test('兼容 · bridge.resume 不再隐式 confirm:true（老调用方会收到 needConfirmation）', (t) => {
  const h = harness(t, { paused: true, forced: true })
  const r = h.bridge.resume('s1', {})
  assert.equal(r.needConfirmation, true)
  assert.equal(r.resumed, false)
  assert.equal(h.snap.calls.at(-1).opts.confirm, false)
})

// ── 状态投影：四来源都算「已暂停」 ────────────────────────────────────

test('投影 · pausedAny 覆盖 turn / step / manual / request 四来源', (t) => {
  // turn 级
  const turn = harness(t, { paused: true })
  const sTurn = turn.bridge.state('s1')
  assert.equal(sTurn.pausedTurn, true, 'pausedTurn 字段必须存在')
  assert.equal(sTurn.pausedAny, true, 'turn 级真暂停必须让 pausedAny 为 true')

  // step 级
  const step = harness(t, { stepHeld: true })
  assert.equal(step.bridge.state('s1').pausedAny, true)

  // 请求级
  const req = harness(t, { requestHeld: true })
  assert.equal(req.bridge.state('s1').pausedAny, true)

  // 全无
  const idle = harness(t, {})
  const sIdle = idle.bridge.state('s1')
  assert.equal(sIdle.pausedAny, false)
  assert.equal(sIdle.pausedTurn, false)
})

/**
 * pause-button-text.ts 测试：按钮文案（暂停会话 / 继续会话）、状态投影（HTTP + SSE）、fail-open。
 *
 * 直接 import .ts（node 22 类型擦除），无需编译。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pauseButtonLabel,
  pauseButtonTitle,
  readPauseState,
  readStepSnapshot,
} from '../src/client/pause-button-text.ts'

test('pauseButtonLabel：未暂停 → 暂停会话；已暂停 → 继续会话', () => {
  assert.equal(pauseButtonLabel({ paused: false }), '暂停会话')
  assert.equal(pauseButtonLabel({ paused: true }), '继续会话')
  assert.equal(pauseButtonLabel({ paused: true, manual: true }), '继续会话')
})

test('pauseButtonTitle：未暂停说明点击语义（下一次 step 边界）', () => {
  const t = pauseButtonTitle({ paused: false })
  assert.match(t, /下一次 step 的模型请求前暂停/)
})

test('pauseButtonTitle：已暂停区分手动/自动并带起始时间', () => {
  const since = new Date(2026, 8, 10, 9, 30, 0).getTime()
  const auto = pauseButtonTitle({ paused: true, heldSince: since })
  assert.match(auto, /已暂停（高峰自动暂停，自 09:30）/)
  assert.match(auto, /本高峰内不再拦该会话/)
  const manual = pauseButtonTitle({ paused: true, heldSince: null, manual: true })
  assert.match(manual, /^已暂停（手动暂停） · 点击继续/)
  assert.match(pauseButtonTitle({ paused: true, heldSince: Number.NaN }), /^已暂停（高峰自动暂停） · 点击继续/)
})

test('readPauseState：已拉门 / 已请求未落地 都算暂停', () => {
  assert.deepEqual(readPauseState({ ok: true, paused: { step: true, turn: false }, stepGate: { since: 42 } }), {
    paused: true,
    heldSince: 42,
    manual: false,
  })
  // 手动请求已登记但还没到 pre-step 边界 → 按钮应立即显示「继续会话」
  assert.deepEqual(readPauseState({ ok: true, paused: { step: false, manual: true } }), {
    paused: true,
    heldSince: null,
    manual: true,
  })
})

test('readPauseState：回退 state.pausedStep / stepManual 形状', () => {
  assert.deepEqual(readPauseState({ ok: true, state: { pausedStep: true, stepHeldSince: 7 } }), {
    paused: true,
    heldSince: 7,
    manual: false,
  })
  assert.deepEqual(readPauseState({ ok: true, state: { stepManual: true } }), {
    paused: true,
    heldSince: null,
    manual: true,
  })
})

test('readPauseState：形状异常 / ok=false → 未暂停（fail-open）', () => {
  const empty = { paused: false, heldSince: null, manual: false }
  assert.deepEqual(readPauseState(null), empty)
  assert.deepEqual(readPauseState(undefined), empty)
  assert.deepEqual(readPauseState({}), empty)
  assert.deepEqual(readPauseState({ ok: false, paused: { step: true } }), empty)
  assert.deepEqual(readPauseState({ ok: true, paused: { step: 'yes' } }), empty)
  assert.deepEqual(readPauseState({ ok: true, paused: { step: true }, stepGate: { since: 'x' } }), {
    paused: true,
    heldSince: null,
    manual: false,
  })
})

test('readStepSnapshot：SSE 快照投影（held / manual / since）', () => {
  assert.deepEqual(readStepSnapshot({ held: true, since: 123, bypass: false, manual: false }), {
    paused: true,
    heldSince: 123,
    manual: false,
  })
  assert.deepEqual(readStepSnapshot({ held: false, since: null, manual: true }), {
    paused: true,
    heldSince: null,
    manual: true,
  })
  assert.deepEqual(readStepSnapshot({ held: false, since: null, manual: false }), {
    paused: false,
    heldSince: null,
    manual: false,
  })
  assert.deepEqual(readStepSnapshot(null), { paused: false, heldSince: null, manual: false })
  assert.deepEqual(readStepSnapshot({ held: true, since: 'x' }), { paused: true, heldSince: null, manual: false })
})

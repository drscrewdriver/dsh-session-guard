/**
 * pause-button-text.ts 测试：按钮文案（暂停会话 / 继续会话）、状态投影（HTTP + SSE）、fail-open。
 *
 * 直接 import .ts（node 22 类型擦除），无需编译。
 * v4.6.0：文案走字典（`session-guard` 命名空间），测试用 zh 字典做 `tr`，
 * 并额外验证「无 locale 服务时回退 key」与「10 语键集一致」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pauseButtonLabel,
  pauseButtonTitle,
  readPauseSnapshot,
  readPauseState,
  readStepSnapshot,
} from '../src/client/pause-button-text.ts'
import { zh, en, ja, ko, fr, de, it, ru, es, pt, dictionaries } from '../src/client/locales.ts'

/** zh 字典查询（含插值由 pause-button-text 内部完成）。 */
const tr = (key) => zh[key] ?? key
const trEn = (key) => en[key] ?? key

test('pauseButtonLabel：未暂停 → 暂停会话；已暂停 → 继续会话', () => {
  assert.equal(pauseButtonLabel({ paused: false }, tr), '暂停会话')
  assert.equal(pauseButtonLabel({ paused: true }, tr), '继续会话')
  assert.equal(pauseButtonLabel({ paused: true, manual: true }, tr), '继续会话')
  // 无 locale 服务（tr 缺省）→ 回退 key，不抛错
  assert.equal(pauseButtonLabel({ paused: false }), 'pause.button.pause')
  assert.equal(pauseButtonLabel({ paused: true }), 'pause.button.resume')
  // 其它语种
  assert.equal(pauseButtonLabel({ paused: true }, trEn), 'Resume session')
})

test('pauseButtonTitle：未暂停说明点击语义（下一次 step 边界）', () => {
  const t = pauseButtonTitle({ paused: false }, tr)
  assert.match(t, /下一次 step 的模型请求前暂停/)
})

test('pauseButtonTitle：已暂停区分手动/自动并带起始时间', () => {
  const since = new Date(2026, 8, 10, 9, 30, 0).getTime()
  const auto = pauseButtonTitle({ paused: true, heldSince: since }, tr)
  assert.match(auto, /已暂停（高峰自动暂停，自 09:30）/)
  assert.match(auto, /本高峰内不再拦该会话/)
  const manual = pauseButtonTitle({ paused: true, heldSince: null, manual: true }, tr)
  assert.match(manual, /^已暂停（手动暂停） · 点击继续/)
  assert.match(pauseButtonTitle({ paused: true, heldSince: Number.NaN }, tr), /^已暂停（高峰自动暂停） · 点击继续/)
})

test('字典：10 语键集与 zh 完全一致（新增文案必须落全语种）', () => {
  const langs = [en, ja, ko, fr, de, it, ru, es, pt]
  const zhKeys = Object.keys(zh).sort()
  for (const dict of langs) {
    assert.deepEqual(Object.keys(dict).sort(), zhKeys, '语种键集必须与 zh 一致')
  }
  // 注册表覆盖 10 语
  assert.deepEqual(Object.keys(dictionaries).sort(), ['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'zh'])
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

// ── v4.6.0：turn 级真暂停必须让按钮变「继续会话」──

test('readPauseState：paused.turn（pauseGate 真暂停）→ 已暂停', () => {
  // 真暂停：paused.turn=true，step 门与请求级 hold 都没动
  assert.deepEqual(readPauseState({ ok: true, paused: { step: false, turn: true, any: true } }), {
    paused: true,
    heldSince: null,
    manual: false,
  })
  // 只读 state.pausedTurn 的回退形状也要认
  assert.deepEqual(readPauseState({ ok: true, state: { pausedTurn: true } }), {
    paused: true,
    heldSince: null,
    manual: false,
  })
  // turn=false 且其它来源都没有 → 未暂停
  assert.deepEqual(readPauseState({ ok: true, paused: { step: false, turn: false, any: false } }), {
    paused: false,
    heldSince: null,
    manual: false,
  })
})

test('readPauseSnapshot：SSE pause 事件投影（any / paused）', () => {
  assert.deepEqual(readPauseSnapshot({ paused: true, forced: true, any: true }), {
    paused: true,
    heldSince: null,
    manual: false,
  })
  assert.deepEqual(readPauseSnapshot({ paused: true, any: false }), {
    paused: true,
    heldSince: null,
    manual: false,
  })
  assert.deepEqual(readPauseSnapshot({ paused: false, any: false }), {
    paused: false,
    heldSince: null,
    manual: false,
  })
  assert.deepEqual(readPauseSnapshot(null), { paused: false, heldSince: null, manual: false })
})

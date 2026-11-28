/**
 * retry.js turn/start.reason 合成回合识别测试（④）。
 *
 * 实测基线（见 findings「task_01 实测」）：宿主 0.2.3-alpha.2 的 turn/start data 只有
 * `{ turn }`，**没有 reason**，全 asar 零命中 `message-ops`。因此 `undefined`/`null`
 * 是现状常态，必须视为模型回合（否则改造后一次都不续跑）；白名单只预防未来补字段的情形。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRetry, freshRetryState, isModelStartReason, MODEL_START_REASONS } from '../lib/retry.js'
import { DEFAULT_RETRY } from '../lib/retry.js'
import { DEFAULT_SETTINGS } from '../lib/settings.js'

const settle = (ms) => new Promise((r) => setTimeout(r, ms))
const TRANSIENT = { reason: { kind: 'error', error: { code: 'OVERLOADED', message: 'busy' } } }

function harness() {
  const sent = []
  const warns = []
  const ctx = {
    agents: new Map([['s1', { status: 'idle', followup: (m) => sent.push(m) }]]),
    logger: { info: () => {}, warn: (m) => warns.push(m) },
    on: () => () => {},
  }
  const cfg = { ...DEFAULT_RETRY, ...DEFAULT_SETTINGS, retryEnabled: true, retryGraceMs: 5, retryPauseWhenOffline: false }
  const retry = createRetry({ ctx, getSettings: () => cfg, isFrozen: () => false, probe: async () => true })
  const emit = (type, data) => retry.onEvent({ id: 's1' }, { type, data })
  return { retry, sent, warns, emit, state: () => retry.state('s1') }
}

test('freshRetryState 初始化含 turnReason: null', () => {
  const s = freshRetryState()
  assert.equal('turnReason' in s, true)
  assert.equal(s.turnReason, null)
})

test('isModelStartReason：无 reason / 空 / unknown 都算模型回合（现状常态）', () => {
  assert.equal(isModelStartReason(undefined), true)
  assert.equal(isModelStartReason(null), true)
  assert.equal(isModelStartReason(''), true)
  assert.equal(isModelStartReason('unknown'), true)
  for (const r of MODEL_START_REASONS) assert.equal(isModelStartReason(r), true)
})

test('isModelStartReason：白名单外的合成 reason 判 false，非字符串也判 false', () => {
  assert.equal(isModelStartReason('message-ops'), false)
  assert.equal(isModelStartReason('rollback'), false)
  assert.equal(isModelStartReason({ some: 'object' }), false)
})

test('onEvent turn/start 记录 s.turnReason', () => {
  const h = harness()
  h.emit('turn/start', { turn: 1, reason: 'message-ops' })
  assert.equal(h.state().turnReason, 'message-ops')
})

test('合成回合：turn/start.reason 不在模型白名单 → turn/end 不重试、不计 consecutive', async () => {
  const h = harness()
  h.emit('turn/start', { turn: 1, reason: 'message-ops' })
  h.emit('turn/end', TRANSIENT)
  await settle(40)
  assert.equal(h.sent.length, 0, '合成回合不得触发重试')
  assert.equal(h.state().consecutive, 0)
})

test('未知 reason（白名单外字符串）→ 视为合成 + 打一次 warn', () => {
  const h = harness()
  h.emit('turn/start', { turn: 1, reason: 'brand-new-host-reason' })
  assert.equal(h.state().turnReason, 'brand-new-host-reason')
  assert.ok(h.warns.some((w) => /brand-new-host-reason/.test(w) && /synthetic/i.test(w)), '应对未知 reason 打 warn')
})

test('模型发起的正常回合（无 reason 字段，现状）→ 行为与改造前一致：正常重试', async () => {
  const h = harness()
  // 宿主现状：turn/start 只有 { turn }，无 reason
  h.emit('turn/start', { turn: 1 })
  h.emit('turn/end', TRANSIENT)
  await settle(40)
  assert.equal(h.sent.length, 1, '现状常态回合应照常续跑')
  assert.equal(h.state().consecutive, 1)
})

test('模型白名单内 reason（如 user）→ 正常重试', async () => {
  const h = harness()
  h.emit('turn/start', { turn: 1, reason: 'user' })
  h.emit('turn/end', TRANSIENT)
  await settle(40)
  assert.equal(h.sent.length, 1)
})

test('合成回合结束后 turnReason 清空，不影响下一回合', async () => {
  const h = harness()
  h.emit('turn/start', { turn: 1, reason: 'message-ops' })
  h.emit('turn/end', TRANSIENT)
  await settle(30)
  assert.equal(h.state().turnReason, null)
  // 下一回合是正常回合（无 reason）
  h.emit('turn/start', { turn: 2 })
  h.emit('turn/end', TRANSIENT)
  await settle(30)
  assert.equal(h.sent.length, 1, '合成回合后的正常回合应能续跑')
})

/**
 * retry.js 测试：失败分类 / 自适应退避 / 决策 / 冻结让路（D9）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyTurnEnd,
  isTransientFailure,
  isPeakDeferredFailure,
  effectiveCooldown,
  shouldRetry,
  freshRetryState,
  DEFAULT_RETRY,
  PEAK_DEFERRED_CODE,
} from '../src/retry.js'

const CFG = { ...DEFAULT_RETRY, retryEnabled: true }

test('isTransientFailure：瞬时 vs 永久', () => {
  assert.equal(isTransientFailure({ message: 'socket hang up' }), true)
  assert.equal(isTransientFailure({ code: 'UPSTREAM', message: 'upstream error', status: 502 }), true)
  assert.equal(isTransientFailure({ code: 'RATE_LIMIT_EXCEEDED', message: 'too many', status: 429 }), true)
  assert.equal(isTransientFailure({ message: 'invalid api key', status: 401 }), false)
  assert.equal(isTransientFailure({ message: 'insufficient balance' }), false)
  assert.equal(isTransientFailure({ message: 'model not found' }), false)
  assert.equal(isTransientFailure({ message: 'context length exceeded' }), false)
})

test('classifyTurnEnd：可重试/不可重试 reason', () => {
  assert.equal(classifyTurnEnd({ kind: 'error' }, { message: 'network timeout' }), true)
  assert.equal(classifyTurnEnd({ kind: 'error' }, { message: 'invalid api key' }), false)
  assert.equal(classifyTurnEnd({ kind: 'interrupted' }), true)
  assert.equal(classifyTurnEnd({ kind: 'max-tokens' }), true)
  assert.equal(classifyTurnEnd({ kind: 'completed' }), false)
  assert.equal(classifyTurnEnd({ kind: 'aborted' }), false) // 用户停
  assert.equal(classifyTurnEnd({ kind: 'blocked' }), false) // 策略拒
})

test('effectiveCooldown：乘性退避 + 封顶', () => {
  assert.equal(effectiveCooldown(0, 20000, 2, 300000), 20000)
  assert.equal(effectiveCooldown(1, 20000, 2, 300000), 40000)
  assert.equal(effectiveCooldown(2, 20000, 2, 300000), 80000)
  assert.equal(effectiveCooldown(10, 20000, 2, 300000), 300000)
})

test('shouldRetry：基础决策', () => {
  const now = 1_000_000
  const s = freshRetryState()
  assert.equal(shouldRetry(s, CFG, false, now), true)
  // 冻结让路（D9）
  assert.equal(shouldRetry(s, CFG, true, now), false)
  // 开关关闭
  assert.equal(shouldRetry(s, { ...CFG, retryEnabled: false }, false, now), false)
  // 已有排队
  assert.equal(shouldRetry({ ...s, pending: true }, CFG, false, now), false)
  // 连续上限
  assert.equal(shouldRetry({ ...s, consecutive: CFG.retryMaxConsecutive }, CFG, false, now), false)
  // 冷却期内
  assert.equal(shouldRetry({ ...s, lastAttemptAt: now - 1000 }, CFG, false, now), false)
  // 冷却过后
  assert.equal(shouldRetry({ ...s, lastAttemptAt: now - CFG.retryCooldownMs - 1 }, CFG, false, now), true)
})

// ── 与全局重试的边界（findings F9）：只短路自己的精确码，429 等一律保留 ──

test('PEAK_DEFERRED（结构化 code）→ 不重试', () => {
  assert.equal(isPeakDeferredFailure({ code: PEAK_DEFERRED_CODE }), true)
  assert.equal(isTransientFailure({ code: PEAK_DEFERRED_CODE }), false)
  assert.equal(classifyTurnEnd({ kind: 'error' }, { code: PEAK_DEFERRED_CODE }), false)
})

test('PEAK_DEFERRED（DSH 压成 UNKNOWN 后的 message 哨兵）→ 不重试', () => {
  const failure = { code: 'UNKNOWN', message: 'PEAK_DEFERRED: peak hours: deepseek-official/x deferred' }
  assert.equal(isPeakDeferredFailure(failure), true)
  assert.equal(classifyTurnEnd({ kind: 'error' }, failure), false)
})

test('429 保留：RATE_LIMIT / 文案 429 / status 429 仍判瞬时（重试不丢）', () => {
  assert.equal(classifyTurnEnd({ kind: 'error' }, { code: 'RATE_LIMIT' }), true)
  assert.equal(classifyTurnEnd({ kind: 'error' }, { message: '429 Too Many Requests' }), true)
  assert.equal(classifyTurnEnd({ kind: 'error' }, { status: 429, message: 'rate limited' }), true)
  assert.equal(isTransientFailure({ code: 'RATE_LIMIT', status: 429 }), true)
})

test('传输类保留：TRANSPORT / ECONNRESET / 超时仍判瞬时', () => {
  assert.equal(classifyTurnEnd({ kind: 'error' }, { code: 'TRANSPORT' }), true)
  assert.equal(classifyTurnEnd({ kind: 'error' }, { message: 'read ECONNRESET' }), true)
  assert.equal(classifyTurnEnd({ kind: 'error' }, { message: 'request timeout' }), true)
})

test('永久失败不回归：鉴权 / 余额 / 模型不存在 / 上下文超限仍判永久', () => {
  assert.equal(classifyTurnEnd({ kind: 'error' }, { message: 'invalid api key', status: 401 }), false)
  assert.equal(classifyTurnEnd({ kind: 'error' }, { message: 'insufficient balance' }), false)
  assert.equal(classifyTurnEnd({ kind: 'error' }, { message: 'model not found' }), false)
  assert.equal(classifyTurnEnd({ kind: 'error' }, { message: 'context length exceeded' }), false)
})

test('哨兵必须是精确前缀：相似但不含冒号前缀的文案不误判', () => {
  assert.equal(isPeakDeferredFailure({ message: 'PEAK_DEFERRED without colon' }), false)
  assert.equal(isPeakDeferredFailure({ message: 'some PEAK_DEFERRED: in the middle' }), false)
  assert.equal(isPeakDeferredFailure({}), false)
  assert.equal(isPeakDeferredFailure(undefined), false)
})

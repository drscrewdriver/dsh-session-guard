/**
 * retry.js 测试：失败分类 / 自适应退避 / 决策 / 冻结让路（D9）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyTurnEnd,
  isTransientFailure,
  effectiveCooldown,
  shouldRetry,
  freshRetryState,
  DEFAULT_RETRY,
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

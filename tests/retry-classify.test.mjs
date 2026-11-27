/**
 * retry.js 分档判定测试（① 失败分类 + ② 额度 vs 限流）。
 *
 * 核心回归是第一条：MALFORMED_RESPONSE 的 message 回显了模型当时的工具参数，
 * 参数里带 auth / permission 不得把一次可重试的失败判成永久。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyFailure,
  classifyByMessage,
  classifyTurnEnd,
  isTransientFailure,
  ALWAYS_TRANSIENT_CODES,
  ALWAYS_PERMANENT_CODES,
} from '../src/retry.js'

// ── 常量形状 ──

test('code 白名单常量：尺寸与内容符合 spec', () => {
  assert.equal(ALWAYS_TRANSIENT_CODES.size, 8)
  assert.equal(ALWAYS_PERMANENT_CODES.size, 6)
  for (const code of ['MALFORMED_RESPONSE', 'TRANSPORT', 'TIMEOUT', 'DNS', 'CONNECTION', 'RATE_LIMIT', 'RESOURCE_EXHAUSTED', 'OVERLOADED']) {
    assert.equal(ALWAYS_TRANSIENT_CODES.has(code), true, `transient 白名单缺 ${code}`)
  }
  for (const code of ['AUTH', 'UNAUTHORIZED', 'FORBIDDEN', 'INVALID_REQUEST', 'MODEL_NOT_FOUND', 'CONTEXT_LENGTH_EXCEEDED']) {
    assert.equal(ALWAYS_PERMANENT_CODES.has(code), true, `permanent 白名单缺 ${code}`)
  }
})

// ── ① 回显文本不得击穿分类（P0 核心回归）──

test('MALFORMED_RESPONSE + 回显含 auth → transient（核心回归）', () => {
  const failure = {
    code: 'MALFORMED_RESPONSE',
    message: 'Tool call "bash": ... Received arguments: {"command":"gh auth status"}',
  }
  assert.equal(classifyFailure(failure), 'transient')
  assert.equal(isTransientFailure(failure), true)
})

test('MALFORMED_RESPONSE + 回显含 permission / credential → 仍 transient', () => {
  assert.equal(classifyFailure({
    code: 'MALFORMED_RESPONSE',
    message: 'Received arguments: {"command":"cat /etc/sudoers"} // permission denied',
  }), 'transient')
  assert.equal(classifyFailure({
    code: 'MALFORMED_RESPONSE',
    message: 'Received arguments: {"cmd":"aws configure list-credentials"}',
  }), 'transient')
})

test('code 白名单命中时完全不读 message（getter 哨兵）', () => {
  let reads = 0
  for (const code of ALWAYS_TRANSIENT_CODES) {
    const probe = { code, get message() { reads += 1; return 'auth permission billing' } }
    assert.equal(classifyFailure(probe), 'transient', `${code} 应短路为 transient`)
  }
  for (const code of ALWAYS_PERMANENT_CODES) {
    const probe = { code, get message() { reads += 1; return 'socket hang up timeout' } }
    assert.equal(classifyFailure(probe), 'permanent', `${code} 应短路为 permanent`)
  }
  assert.equal(reads, 0, 'classifyFailure 的白名单分支不得访问 message')
})

test('小写 code 也命中白名单（真实上游是小写）', () => {
  assert.equal(classifyFailure({ code: 'rate_limit_error' }), 'unknown')
  assert.equal(classifyFailure({ code: 'overloaded', message: 'Overloaded' }), 'transient')
  assert.equal(classifyFailure({ code: 'malformed_response', message: 'gh auth status' }), 'transient')
  assert.equal(classifyFailure({ code: 'unauthorized' }), 'permanent')
})

test('文本兜底不再裸匹配 auth / permission', () => {
  assert.equal(classifyByMessage('permission denied while reading config'), 'unknown')
  assert.equal(classifyByMessage('auth mode enabled for this host'), 'unknown')
  assert.equal(classifyFailure({ code: 'UPSTREAM', message: 'permission denied' }), 'unknown')
  assert.equal(isTransientFailure({ code: 'UPSTREAM', message: 'permission denied' }), true)
})

// ── ② HTTP status 优先于文本 ──

test('status 401 / 402 / 403 → permanent', () => {
  assert.equal(classifyFailure({ status: 401 }), 'permanent')
  assert.equal(classifyFailure({ status: 402 }), 'permanent')
  assert.equal(classifyFailure({ status: 403 }), 'permanent')
  assert.equal(classifyFailure({ status: 401, message: 'socket hang up' }), 'permanent')
})

test('status 408 / 429 / >=500 → transient', () => {
  assert.equal(classifyFailure({ status: 408 }), 'transient')
  assert.equal(classifyFailure({ status: 429 }), 'transient')
  assert.equal(classifyFailure({ status: 500 }), 'transient')
  assert.equal(classifyFailure({ status: 503, message: 'invalid api key' }), 'transient')
})

test('status 缺省且 code 未知时才落文本兜底', () => {
  assert.equal(classifyFailure({ code: 'WEIRD_CODE', message: 'insufficient balance' }), 'permanent')
  assert.equal(classifyFailure({ code: 'WEIRD_CODE', message: 'socket hang up' }), 'unknown')
})

// ── ② 额度 vs 限流（P1）──

test('insufficient_quota 一律 transient（旧正则已移除）', () => {
  assert.equal(classifyFailure({ code: 'insufficient_quota' }), 'unknown')
  assert.equal(isTransientFailure({ code: 'insufficient_quota' }), true)
  assert.equal(classifyFailure({ code: 'insufficient_quota', status: 429 }), 'transient')
  assert.equal(isTransientFailure({ code: 'insufficient_quota', status: 429, message: 'inference exceeds tpm/rpm limit' }), true)
  assert.equal(classifyByMessage('insufficient quota for this workspace'), 'unknown')
})

test('限流类 code → transient', () => {
  assert.equal(classifyFailure({ code: 'OVERLOADED' }), 'transient')
  assert.equal(classifyFailure({ code: 'RESOURCE_EXHAUSTED' }), 'transient')
  assert.equal(classifyFailure({ code: 'RATE_LIMIT' }), 'transient')
})

test('纯账务文本 → permanent', () => {
  assert.equal(classifyFailure({ message: 'insufficient balance' }), 'permanent')
  assert.equal(classifyFailure({ message: 'please update your billing info' }), 'permanent')
  assert.equal(classifyFailure({ message: 'payment required' }), 'permanent')
  assert.equal(classifyFailure({ message: 'your account was suspended' }), 'permanent')
  assert.equal(isTransientFailure({ message: 'insufficient credit' }), false)
})

test('鉴权文本要求强上下文（invalid + 凭据）', () => {
  assert.equal(classifyFailure({ message: 'invalid api key' }), 'permanent')
  assert.equal(classifyFailure({ message: 'Incorrect token provided' }), 'permanent')
  assert.equal(classifyFailure({ message: 'credential expired' }), 'unknown')
})

// ── 未识别 code 的观测口 ──

test('未识别 code 落兜底时打一次 warn；白名单命中不打', () => {
  const warns = []
  classifyFailure({ code: 'BRAND_NEW_CODE', message: 'boom' }, { warn: (m) => warns.push(m) })
  assert.equal(warns.length, 1)
  assert.match(warns[0], /BRAND_NEW_CODE/)
  const warns2 = []
  classifyFailure({ code: 'TRANSPORT', message: 'boom' }, { warn: (m) => warns2.push(m) })
  classifyFailure({ code: 'UNKNOWN', message: 'boom' }, { warn: (m) => warns2.push(m) })
  classifyFailure({ message: 'boom' }, { warn: (m) => warns2.push(m) })
  assert.equal(warns2.length, 0, '白名单命中 / UNKNOWN / 无 code 都不该刷 warn')
})

// ── 向后兼容 ──

test('isTransientFailure 保留原签名与语义（薄封装）', () => {
  assert.equal(isTransientFailure(), true)
  assert.equal(isTransientFailure({}), true)
  assert.equal(isTransientFailure({ message: 'socket hang up' }), true)
  assert.equal(isTransientFailure({ message: 'invalid api key', status: 401 }), false)
})

test('PEAK_DEFERRED 精确短路不被新分类覆盖', () => {
  assert.equal(isTransientFailure({ code: 'PEAK_DEFERRED' }), false)
  assert.equal(isTransientFailure({ code: 'PEAK_DEFERRED', message: 'socket hang up' }), false)
  assert.equal(isTransientFailure({ code: 'UNKNOWN', message: 'PEAK_DEFERRED: deferred' }), false)
  assert.equal(classifyTurnEnd({ kind: 'error' }, { code: 'PEAK_DEFERRED', message: 'auth' }), false)
})

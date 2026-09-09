/**
 * targets.js 测试：会话「最近真实目标」追踪（request/header 两版本 + model/selection 仅 0.1.2）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTargets, readTarget, UNKNOWN } from '../src/targets.js'

const headerEvent = (provider, model) => ({ type: 'request/header', data: { header: { config: { provider, model } }, reason: 'initial' } })

test('readTarget：request/header 提取 provider/model', () => {
  assert.deepEqual(readTarget(headerEvent('deepseek-official', 'deepseek-v4-pro')), {
    provider: 'deepseek-official',
    model: 'deepseek-v4-pro',
  })
})

test('readTarget：model/selection 提取（仅 0.1.2+ 存在）', () => {
  assert.deepEqual(readTarget({ type: 'model/selection', data: { provider: 'local-35b', model: 'qwen' } }), {
    provider: 'local-35b',
    model: 'qwen',
  })
})

test('readTarget：形状异常 / 缺失 → unknown，不抛出', () => {
  assert.deepEqual(readTarget({ type: 'request/header' }), { provider: UNKNOWN, model: UNKNOWN })
  assert.deepEqual(readTarget({ type: 'request/header', data: { header: {} } }), { provider: UNKNOWN, model: UNKNOWN })
  assert.deepEqual(readTarget({ type: 'request/header', data: { header: { config: { provider: '', model: 42 } } } }), {
    provider: UNKNOWN,
    model: UNKNOWN,
  })
  assert.deepEqual(readTarget({ type: 'model/selection' }), { provider: UNKNOWN, model: UNKNOWN })
})

test('readTarget：不关心的类型返回 null', () => {
  assert.equal(readTarget({ type: 'assistant/message' }), null)
  assert.equal(readTarget({}), null)
  assert.equal(readTarget(null), null)
})

test('targets：update / get / providerOf（无记录 → unknown）', () => {
  const t = createTargets()
  assert.equal(t.providerOf('s1'), UNKNOWN)
  assert.equal(t.get('s1'), null)
  t.update('s1', headerEvent('deepseek-official', 'm'))
  assert.equal(t.providerOf('s1'), 'deepseek-official')
  assert.equal(t.get('s1').model, 'm')
  assert.equal(t.size(), 1)
})

test('targets：model/selection 覆盖 request/header（切模型立即生效）', () => {
  const t = createTargets()
  t.update('s1', headerEvent('deepseek-official', 'm'))
  t.update('s1', { type: 'model/selection', data: { provider: 'local-35b', model: 'qwen' } })
  assert.equal(t.providerOf('s1'), 'local-35b')
})

test('targets：空 sessionId / 不关心事件 → no-op', () => {
  const t = createTargets()
  assert.equal(t.update('', headerEvent('a', 'b')), null)
  assert.equal(t.update('s1', { type: 'tool/call' }), null)
  assert.equal(t.size(), 0)
})

test('targets：clear / entries', () => {
  const t = createTargets()
  t.update('s1', headerEvent('a', 'b'))
  t.update('s2', headerEvent('c', 'd'))
  assert.equal(t.entries().length, 2)
  assert.equal(t.clear('s1'), true)
  assert.equal(t.clear('s1'), false)
  assert.equal(t.size(), 1)
})

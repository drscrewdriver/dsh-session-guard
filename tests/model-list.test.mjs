/**
 * model-list.ts 测试：「高峰拦截列表」行状态的纯逻辑（本线只读展示）。
 *
 * 与 host 判定同源（正则、包含语义、大小写不敏感）；本线（0.1.7）客户端没有设置写入口，
 * 所以这里只有「算状态 / 出提示」两个纯函数 —— TSX 侧只负责渲染。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesPattern, rowState, rowHint } from '../src/client/model-list.ts'

test('matchesPattern：包含语义 + 大小写不敏感 + 正则', () => {
  assert.equal(matchesPattern('ocg/deepseek-flash', 'deepseek'), true)
  assert.equal(matchesPattern('DeepSeek-V4-Pro', 'deepseek'), true)
  assert.equal(matchesPattern('qwen3.5-flash', 'deepseek'), false)
  assert.equal(matchesPattern('my-deepseek-lab', '^my-'), true)
  assert.equal(matchesPattern('', 'deepseek'), false)
  assert.equal(matchesPattern('deepseek-x', ''), false)
})

test('matchesPattern：写坏的正则与垃圾输入不抛（视为不命中）', () => {
  assert.equal(matchesPattern('deepseek-x', '['), false)
  assert.equal(matchesPattern('deepseek-x', '[a-'), false)
})

test('rowState：命中关键字 / 显式条目 / 未覆盖 三种形态', () => {
  // 关键字盖住（默认配置下的常见形态）
  const covered = rowState('ocg/deepseek-flash', ['deepseek'])
  assert.deepEqual(covered, { matched: ['deepseek'], explicit: false, covered: true })
  assert.equal(rowHint(covered), '由关键字「deepseek」覆盖')

  // 显式条目
  const explicit = rowState('ocg/qwen3.5-flash', ['deepseek', 'ocg/qwen3.5-flash'])
  assert.deepEqual(explicit, { matched: ['ocg/qwen3.5-flash'], explicit: true, covered: true })
  assert.equal(rowHint(explicit), '显式条目')

  // 未覆盖
  const none = rowState('ocg/qwen3.5-flash', ['deepseek'])
  assert.deepEqual(none, { matched: [], explicit: false, covered: false })
  assert.equal(rowHint(none), '')
})

test('rowState：多个关键字命中时按列表顺序给出全部命中项', () => {
  const s = rowState('ocg/deepseek-flash', ['deepseek', 'flash'])
  assert.deepEqual(s.matched, ['deepseek', 'flash'])
  assert.equal(rowHint(s), '由关键字「deepseek」覆盖', '提示取列表首个命中项')
})

test('rowState：列表为空 → 全部放行（关闭按模型名判定后的形态）', () => {
  assert.deepEqual(rowState('deepseek-v4-pro', []), { matched: [], explicit: false, covered: false })
})

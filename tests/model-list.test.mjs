/**
 * model-list.ts 测试：「高峰拦截列表」模型勾选的纯逻辑。
 *
 * 与 host 判定同源（正则、包含语义、大小写不敏感）；勾选只是增删同一份设置项里的条目 ——
 * 这里把这些不变量钉死，TSX 侧只负责渲染。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  matchesPattern,
  rowState,
  rowHint,
  toggleModel,
  filterRows,
  allCovered,
  bulkToggle,
} from '../src/client/model-list.ts'

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

  // 显式条目（勾选后写进去的同名条目）
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

test('toggleModel：未覆盖 → 追加同名条目（不改入参、去重）', () => {
  const before = ['deepseek']
  const next = toggleModel(before, 'ocg/qwen3.5-flash')
  assert.deepEqual(next, ['deepseek', 'ocg/qwen3.5-flash'])
  assert.deepEqual(before, ['deepseek'], '纯函数：不修改入参')

  assert.deepEqual(toggleModel([], 'qwen'), ['qwen'])
  assert.deepEqual(toggleModel([], ''), [])
  // 已存在同名条目 → 不重复追加（勾选不会把列表写肿）
  assert.deepEqual(toggleModel(['qwen'], 'qwen'), [])
})

test('toggleModel：已有同名条目 → 删除它（取消勾选）', () => {
  assert.deepEqual(toggleModel(['deepseek', 'ocg/qwen3.5-flash'], 'ocg/qwen3.5-flash'), ['deepseek'])
  assert.deepEqual(toggleModel(['a', 'b', 'a'], 'a'), ['b', 'a'], '只删第一个同名条目')
})

test('toggleModel：勾上再取消 == 原列表（往返一致）', () => {
  const before = ['deepseek', '^my-']
  const after = toggleModel(toggleModel(before, 'ocg/glm-5.3-flash'), 'ocg/glm-5.3-flash')
  assert.deepEqual(after, before)
})

test('toggleModel + rowState：勾选后该行变成「显式条目」且被覆盖', () => {
  const next = toggleModel(['deepseek'], 'ocg/glm-5.3-flash')
  assert.deepEqual(rowState('ocg/glm-5.3-flash', next), {
    matched: ['ocg/glm-5.3-flash'],
    explicit: true,
    covered: true,
  })
})

// ── v0.3.2：过滤 + 全选（只作用于展示与批量范围，不改模型集合与列表本身）──

const ROWS = [
  { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
  { provider: 'local-35b', model: 'ocg/deepseek-flash' },
  { provider: 'local-35b', model: 'ocg/glm-5.3-flash' },
  { provider: 'openai', model: 'gpt-5.2' },
]

test('filterRows：空关键词 = 不过滤（返回新数组，不改入参）', () => {
  const got = filterRows(ROWS, '')
  assert.deepEqual(got, ROWS)
  assert.notEqual(got, ROWS, '返回副本')
  assert.deepEqual(filterRows(ROWS, '   '), ROWS, '纯空白同样视为不过滤')
})

test('filterRows：按 provider/model 子串、大小写不敏感', () => {
  assert.deepEqual(
    filterRows(ROWS, 'deepseek').map((r) => r.model),
    ['deepseek-v4-pro', 'ocg/deepseek-flash'],
  )
  assert.deepEqual(
    filterRows(ROWS, 'local-35b/').map((r) => r.model),
    ['ocg/deepseek-flash', 'ocg/glm-5.3-flash'],
    '可带 provider 前缀',
  )
  assert.deepEqual(filterRows(ROWS, 'GLM').map((r) => r.model), ['ocg/glm-5.3-flash'])
  assert.deepEqual(filterRows(ROWS, 'nothing-matches'), [])
})

test('filterRows：只影响展示，不改模型集合（原数组不变）', () => {
  const before = JSON.stringify(ROWS)
  filterRows(ROWS, 'local')
  assert.equal(JSON.stringify(ROWS), before)
})

test('allCovered：过滤结果是否已全部被拦（决定按钮文案）', () => {
  assert.equal(allCovered(['deepseek'], filterRows(ROWS, 'deepseek')), true)
  assert.equal(allCovered(['deepseek'], filterRows(ROWS, 'local')), false)
  assert.equal(allCovered([], ROWS), false)
  assert.equal(allCovered(['deepseek'], []), false, '空结果不显示「取消全选」')
})

test('bulkToggle：全选 = 把过滤结果里未覆盖的模型名补成显式条目', () => {
  const filtered = filterRows(ROWS, 'local')
  assert.deepEqual(bulkToggle(['deepseek'], filtered, true), ['deepseek', 'ocg/glm-5.3-flash'])
})

test('bulkToggle（取消全选）：只删与过滤结果同名的条目，关键字覆盖仍在', () => {
  const filtered = filterRows(ROWS, 'local')
  const patterns = ['deepseek', 'ocg/glm-5.3-flash']
  assert.deepEqual(bulkToggle(patterns, filtered, false), ['deepseek'])
})

test('bulkToggle：全选 → 取消全选 往返一致（纯函数、不修改入参）', () => {
  const before = ['deepseek']
  const filtered = filterRows(ROWS, 'openai')
  const after = bulkToggle(bulkToggle(before, filtered, true), filtered, false)
  assert.deepEqual(after, before)
  assert.deepEqual(before, ['deepseek'])
})

test('bulkToggle：全选不重复追加已有条目', () => {
  const filtered = filterRows(ROWS, 'deepseek')
  assert.deepEqual(bulkToggle(['deepseek', 'deepseek-v4-pro'], filtered, true), ['deepseek', 'deepseek-v4-pro'])
})

test('bulkToggle + rowState：全选后过滤结果全部 covered', () => {
  const filtered = filterRows(ROWS, 'local')
  const next = bulkToggle(['deepseek'], filtered, true)
  assert.equal(allCovered(next, filtered), true)
})

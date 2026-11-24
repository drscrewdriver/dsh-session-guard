/**
 * client/styles.ts 测试：峰谷配色语义。
 *
 * 约束：
 * - 谷时（`.sg-off`）与周末（`.sg-weekend`）= 绿（半价区间）；
 * - 峰时（`.sg-peak`）= 红（原价区间，值得注意）；
 * - 「暂停会话 / 继续会话」按钮常驻绿字绿边；
 * - 只用 DSH 真实存在的状态令牌：`state-error-primary` / `state-success-primary`。
 *   旧样式里的 `state-warning-primary` 在 DSH 里不存在（一直命中 #d97706 兜底色），
 *   这里顺手钉住，防止回退。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLIENT_CSS } from '../src/client/styles.ts'

/** 取出单个选择器对应的声明块（CSS 里每条规则都是单行）。 */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`^${escaped}\\{([^}]*)\\}$`, 'm').exec(CLIENT_CSS)
  return match?.[1] ?? ''
}

const GREEN = '--dsw-alias-state-success-primary'
const RED = '--dsw-alias-state-error-primary'

test('谷时与周末徽标为绿色（文字 + 边框 + 浅色底）', () => {
  const block = rule('.sg-status.sg-off,.sg-status.sg-weekend')
  assert.match(block, new RegExp(`border-color:var\\(${GREEN}`))
  assert.match(block, new RegExp(`color:var\\(${GREEN}`))
  assert.match(block, /background:color-mix\(/)
})

test('峰时徽标为红色，不再是橙黄', () => {
  const block = rule('.sg-status.sg-peak')
  assert.match(block, new RegExp(`border-color:var\\(${RED}`))
  assert.match(block, new RegExp(`color:var\\(${RED}`))
  assert.doesNotMatch(block, /state-warning|state-warn/)
})

test('「暂停会话」按钮：绿字绿边，未暂停状态即如此', () => {
  const block = rule('.sg-pause')
  assert.match(block, new RegExp(`border:1px solid var\\(${GREEN}`))
  assert.match(block, new RegExp(`color:var\\(${GREEN}`))
  assert.doesNotMatch(block, /state-warning|state-warn/)
})

test('「继续会话」按下态沿用绿色，不回到橙黄', () => {
  const block = rule(".sg-pause[aria-pressed='true']")
  assert.match(block, new RegExp(`var\\(${GREEN}`))
  assert.doesNotMatch(block, /state-warning|state-warn/)
})

test('样式只用 DSH 真实存在的状态令牌', () => {
  assert.doesNotMatch(CLIENT_CSS, /--dsw-alias-state-warning-primary/)
  const tokens = [...CLIENT_CSS.matchAll(/--dsw-alias-state-[a-z-]+/g)].map((m) => m[0])
  assert.ok(tokens.length > 0)
  for (const token of tokens) {
    assert.ok([GREEN, RED].includes(token), `unexpected state token: ${token}`)
  }
})

/**
 * 写侧署名闸（v4 适配）：三处写会话路径必须使用 producer-owned kind。
 *
 * 宿主 ≥0.1.7-rc.1（会话格式 v4）拒绝 `kind: 'plugin'`（SessionFormatError，整轮失败）。
 * 任一处漏改都会在对应兜底场景（延迟恢复 / 自动重试 / 暂停恢复）复发——
 * 这些路径平时不触发，测试无法全部真跑，故以静态闸 + 功能断言双保险钉住。
 * 取证：`dsh-session-format-v3-to-v4@0.1.7-rc.2` 的 `source()` 只查
 * `kind` 非空且 ≠ 'plugin'，伴随字段（form 等）不校验、原样保留。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const src = (name) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', name), 'utf8')

test('wiring.js：延迟恢复注入使用 plugin:session-guard + form:notice', () => {
  const code = src('wiring.js')
  assert.match(code, /source: \{ kind: 'plugin:session-guard', form: 'notice' \}/)
  assert.doesNotMatch(code, /kind: 'plugin'/)
})

test('retry.js：自动重试注入使用 plugin:session-guard + form:notice', () => {
  const code = src('retry.js')
  assert.match(code, /source: \{ kind: 'plugin:session-guard', form: 'notice' \}/)
  assert.doesNotMatch(code, /kind: 'plugin'/)
})

test('pause-gate.js：followup 使用 plugin:${pluginId} + form:instructions', () => {
  const code = src('pause-gate.js')
  assert.match(code, /kind: `plugin:\$\{pluginId\}`/)
  assert.doesNotMatch(code, /kind: 'plugin'/)
})

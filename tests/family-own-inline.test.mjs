/**
 * 家族节接管 own 卡内联直挂的源码结构钉（2026-11-02 own-tab 批量修复）。
 *
 * 背景：client/index.ts 与 family-section.tsx 传递依赖 JSX（node:test 无法类型擦除），
 * 沿用本仓 family-election.test.mjs 的既有做法——用源码结构钉把「接管时本卡内联直挂」
 * 这个不变量钉死，谁把「只靠账本 renderSlot 渲染 own 卡」（= 空白缺陷）接回来这里立刻红。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const FSEC = readFileSync(join(ROOT, 'src', 'client', 'family-section.tsx'), 'utf8')
const SRC = readFileSync(join(ROOT, 'src', 'client', 'index.ts'), 'utf8')

test('GuardFamilySection 接管态内联直挂 own 卡（renderOwn 行 + 账本去重）', () => {
  // own 行走 renderOwn 内联，而非交回账本 renderSlot。
  assert.match(
    FSEC,
    /props\.renderOwn && row\.id === ownId/,
    'GuardFamilySection 必须为 ownId 行内联直挂 props.renderOwn()',
  )
  // own id 已在账本（外部 owner 在场、自身 inject 已触发）时去重，绝不双渲。
  assert.match(
    FSEC,
    /tabs\.filter\(tab => tab\.id !== ownId\)/,
    'own 行必须把同 id 的账本条目 filter 掉，避免重复 tab/双渲染',
  )
})

test('接管 inject 面必须提供 ownId + renderOwn(SessionGuardCard, currentScope)', () => {
  assert.match(
    SRC,
    /ownId:\s*'session-guard'/,
    '选举接管注册的 inject 面必须声明 ownId=session-guard',
  )
  assert.match(
    SRC,
    /renderOwn:\s*\(\)\s*=>\s*createElement\(SessionGuardCard,\s*\{\s*scope:\s*currentScope\(\)\s*\}\)/,
    'inject 面必须内联直挂 SessionGuardCard（scope 走 apply 级 currentScope，非空白）',
  )
})

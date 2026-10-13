/**
 * badge-text.ts 测试：状态徽标语义（高峰期区分「只拦官方」与「全部暂停」）。
 *
 * 直接 import .ts（node 22 类型擦除），无需编译。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { peakLabel, badgeTitle, badgeClassNames, PHASE_LABELS } from '../src/client/badge-text.ts'

const BASE = { enabled: true, weekendMode: true, timezone: 'Asia/Shanghai' }

// ── v0.3.2：高峰与谷时必须是**同一个按钮**，只有文案与配色变 ──

test('badgeClassNames：三个阶段都是同一个按钮（不因状态退化）', () => {
  const peak = badgeClassNames({ phase: 'peak' })
  const off = badgeClassNames({ phase: 'off-peak' })
  const weekend = badgeClassNames({ phase: 'weekend' })
  for (const [name, cls] of [
    ['peak', peak],
    ['off-peak', off],
    ['weekend', weekend],
  ]) {
    assert.ok(cls.startsWith('sg-status sg-status-btn '), `${name} 必须带按钮类：${cls}`)
    assert.equal(cls.split(' ').length, 3, `${name} 的类名个数固定：${cls}`)
  }
  // 交互形态一致：按钮类没有任何差异，只有配色变体不同
  assert.equal(peak.replace('sg-peak', ''), off.replace('sg-off', ''))
  assert.equal(off.replace('sg-off', ''), weekend.replace('sg-weekend', ''))
})

test('badgeClassNames：配色变体与阶段一一对应（拦截红 / 放行绿）', () => {
  assert.equal(badgeClassNames({ phase: 'peak' }), 'sg-status sg-status-btn sg-peak')
  assert.equal(badgeClassNames({ phase: 'off-peak' }), 'sg-status sg-status-btn sg-off')
  assert.equal(badgeClassNames({ phase: 'weekend' }), 'sg-status sg-status-btn sg-weekend')
})

test('peakLabel：高峰期 + 二维判定开启 → 只拦官方', () => {
  assert.equal(peakLabel({ phase: 'peak', providerGuard: true }), '高峰·拦官方')
})

test('peakLabel：高峰期 + 二维判定关闭 → 全部暂停', () => {
  assert.equal(peakLabel({ phase: 'peak', providerGuard: false }), '高峰·全部暂停')
  assert.equal(peakLabel({ phase: 'peak' }), '高峰·全部暂停')
})

test('peakLabel：非高峰期不受二维判定影响', () => {
  assert.equal(peakLabel({ phase: 'off-peak', providerGuard: true }), PHASE_LABELS['off-peak'])
  assert.equal(peakLabel({ phase: 'weekend', providerGuard: true }), PHASE_LABELS.weekend)
})

test('badgeTitle：非高峰只显示阶段/时区/周末模式', () => {
  assert.equal(badgeTitle({ ...BASE, phase: 'off-peak' }), '谷时 · Asia/Shanghai · 周末模式')
  assert.equal(
    badgeTitle({ ...BASE, phase: 'weekend', weekendMode: false }),
    '周末 · Asia/Shanghai',
  )
})

test('badgeTitle：高峰期写清判定口径', () => {
  assert.equal(badgeTitle({ ...BASE, phase: 'peak', providerGuard: true }), '高峰 · Asia/Shanghai · 周末模式 · 仅拦截 DeepSeek 官方源')
  assert.equal(
    badgeTitle({ ...BASE, phase: 'peak', providerGuard: false }),
    '高峰 · Asia/Shanghai · 周末模式 · 全部会话暂停（未启用二维判定）',
  )
})

test('badgeTitle：带上挂起/延后数量', () => {
  const t = badgeTitle({ ...BASE, phase: 'peak', providerGuard: true, held: 2, deferred: 1 })
  assert.match(t, /挂起 2 · 延后 1/)
  // 全为 0 时不显示
  assert.doesNotMatch(badgeTitle({ ...BASE, phase: 'peak', providerGuard: true, held: 0, deferred: 0 }), /挂起/)
})

test('badgeTitle：step 门挂起数（v0.2.0）', () => {
  const t = badgeTitle({ ...BASE, phase: 'peak', providerGuard: true, stepHeld: 2 })
  assert.match(t, /step 挂起 2/)
  assert.doesNotMatch(badgeTitle({ ...BASE, phase: 'peak', providerGuard: true, stepHeld: 0 }), /step 挂起/)
  // 与请求级挂起/延后共存
  const both = badgeTitle({ ...BASE, phase: 'peak', providerGuard: true, held: 1, deferred: 0, stepHeld: 3 })
  assert.match(both, /挂起 1 · 延后 0 · step 挂起 3/)
})

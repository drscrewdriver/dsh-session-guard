/**
 * 家族节选举契约用例（task_5 + task_6，2026-10-14）。
 *
 * 为什么是"结构钉 + 假宿主语义"两面：
 *  - client/index.ts 的 `apply()` 传递依赖 .tsx（status-badge / settings-card /
 *    family-section …），node:test 无法类型擦除 JSX ⇒ 不能直接 import 跑行为。
 *    这与 settings-bridge.test.mjs 的既有做法一致：JSX 客户端用**源码结构钉**
 *    把"注册已出降级分支"钉死，谁把残废降级接回来这里立刻红。
 *  - 自愈契约（task_6）验的是**宿主机制**：假门面按 ui-registry 的 reconcile
 *    语义（宿主 registry.ts:196-245：槽未声明 → 工厂不执行；声明发生时经
 *    subscribe 通知重放）建模，把"成员不需要 re-arm"这个假设钉成可回归的契约。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const SRC = readFileSync(join(ROOT, 'src', 'client', 'index.ts'), 'utf8')

// ── task_5：declare-or-withdraw 不变量（残废霸位回归闸）──────────────────
//
// 旧缺陷：`catch → register(base)` 坐上一个**不带 children** 的 settings.section
// 残废容器 ⇒ 占住导航行、后到者按"已有 dsh-family"集体让位、子槽整轮无人声明
// ⇒ 11 个成员 tab 全灭而节还在。修复=撞车即整节撤销。下面三钉分别对应
// "唯一一次注册"、"带 children"、"撞车只撤销不再注册"。

test('family election: 只注册一次 settings.section，且必须携带 children 声明', () => {
  // 整份 client 源里对 settings.section 的容器注册只有一处（选举接管那次）。
  const sectionNames = SRC.match(/name: 'settings\.section'/g) ?? []
  assert.equal(sectionNames.length, 1, 'settings.section 容器只允许一处注册点')
  // 该处必须带 children（声明即授权），否则就是残废容器。
  assert.match(
    SRC,
    /ctx\.slots\.register\(\{\s*\.\.\.base,\s*children:\s*\{\s*\[FAMILY_CHILD_KEY\]:\s*\{\s*kind:\s*'list',\s*scope:\s*'root'\s*\}\s*\},?\s*\},\s*GuardFamilySection\)/,
    '接管注册必须携带 children: { [FAMILY_CHILD_KEY]: … }',
  )
})

test('family election: 撞车只撤销（declare-or-withdraw），不得裸注册残废行', () => {
  // 反面钉：任何"不带 children 的第二次尝试 / 降级注册"都必须缺席。
  assert.ok(!/registering without children/i.test(SRC), '不得残留 "registering without children" 降级日志')
  assert.ok(!/register\(\s*base\s*[,)]/.test(SRC), '不得存在 catch 内 register(base, …) 的裸注册')
  // 正面钉：family 接管的 catch 分支只写 withdraw 日志，不触碰 register。
  // 精确定位：从 `}, GuardFamilySection)` 起、到紧随其后的 catch 块结束。
  const catchBlock = SRC.match(/\}, GuardFamilySection\)[\s\S]*?catch \(error\) \{([\s\S]*?)\n {8}\}/)?.[1] ?? ''
  assert.ok(catchBlock.length > 0, '应存在 family 接管的 catch(error) 分支')
  assert.match(catchBlock, /children claim lost — withdrawing/, 'catch 必须记录 "children claim lost — withdrawing"')
  assert.ok(!/register\(/.test(catchBlock), 'catch 分支内不得出现任何 register 调用（降级即残废霸位）')
})

test('family election: 让位判据读账本 id，且延迟由 rank 阶梯派生（非硬编码毫秒）', () => {
  assert.match(
    SRC,
    /ctx\.slots\.entries\('settings\.section'\)\.some\(e => e\.options\.id === FAMILY_SECTION_ID\)/,
    '让位判据必须查账本里是否已有 dsh-family 行',
  )
  assert.match(SRC, /const FAMILY_CLAIM_RANK = 2\b/, 'guard rank=2（与 _tools/family-rank.mjs 唯一真源一致）')
  assert.match(
    SRC,
    /const FAMILY_YIELD_MS = FAMILY_CLAIM_BASE_MS \+ FAMILY_CLAIM_RANK \* FAMILY_CLAIM_STEP_MS/,
    '延迟必须由 BASE + RANK * STEP 派生',
  )
  assert.ok(!/FAMILY_YIELD_MS\s*=\s*\d{3,}/.test(SRC), '不得残留硬编码毫秒（旧值 500ms 是拍的）')
})

// ── task_6：成员自愈契约（钉住"不做 re-arm"的依据）──────────────────────
//
// 假门面按宿主 ui-registry 的既有语义建模：
//  - register 未声明槽 → 抛 not declared；children key 重复 → 抛 already declared；
//  - inject：槽已声明 → 工厂立即执行；未声明 → 入队，待该槽被声明时重放。
// 断言：槽未声明 → 成员工厂**不执行**；owner 声明该槽 → 成员工厂**被重放**。

/** 最小宿主槽门面替身（语义对齐 registry.ts:196-245 的 reconcile/replay）。 */
function fakeHostSlots(seedDeclared = ['settings.section']) {
  const declared = new Set(seedDeclared)
  const childOwner = new Map()
  const entriesOf = new Map()
  const pending = new Map()
  const replay = (slot) => {
    const queued = pending.get(slot) ?? []
    pending.delete(slot)
    for (const fn of queued) fn()
  }
  return {
    register(opts, component) {
      const slot = opts.name
      if (!declared.has(slot)) throw new Error(`slot "${slot}" is not declared`)
      for (const key of Object.keys(opts.children ?? {})) {
        if (childOwner.has(key)) throw new Error(`slot "${key}" is already declared (by ${childOwner.get(key)})`)
      }
      const list = entriesOf.get(slot) ?? []
      list.push({ options: opts, component })
      entriesOf.set(slot, list)
      for (const key of Object.keys(opts.children ?? {})) {
        childOwner.set(key, slot)
        declared.add(key)
        replay(key) // 晚声明重放：声明一发生，排队的成员工厂立刻跑
      }
      return () => {}
    },
    inject(slot, factory) {
      if (declared.has(slot)) factory()
      else {
        const q = pending.get(slot) ?? []
        q.push(factory)
        pending.set(slot, q)
      }
      return () => {}
    },
    entries: (slot) => entriesOf.get(slot) ?? [],
    getVersion: () => (entriesOf.size === 0 ? 0 : 1),
    subscribe: () => () => {},
  }
}

test('成员自愈：子槽未声明时成员工厂不执行，owner 声明后重放执行', () => {
  const slots = fakeHostSlots(['settings.section'])
  let memberFactoryRan = 0
  // 成员侧注册（与 mountConfigCards 同形：inject 到子席位，工厂内 register）。
  slots.inject('dsh-family.tab', () => {
    memberFactoryRan += 1
    slots.register({ name: 'dsh-family.tab', id: 'session-guard', order: 20 }, null)
  })
  // ① 尚未有人声明 dsh-family.tab → 成员工厂不得执行（宿主 reconcile 直接 return）。
  assert.equal(memberFactoryRan, 0, '子槽未声明时成员工厂不得执行')

  // ② owner 声明：settings.section 落账并 children 声明 dsh-family.tab → 触发重放。
  slots.register({ name: 'settings.section', id: 'dsh-family', children: { 'dsh-family.tab': { kind: 'list', scope: 'root' } } }, null)
  assert.equal(memberFactoryRan, 1, 'owner 声明子槽后成员工厂必须被重放一次')
  assert.equal(slots.entries('dsh-family.tab').length, 1, '重放后成员条目进入子席位账本')
})

test('成员自愈：owner 缺席则成员工厂永不执行（成员不自补位时保持沉默）', () => {
  const slots = fakeHostSlots(['settings.section'])
  let memberFactoryRan = 0
  slots.inject('dsh-family.tab', () => { memberFactoryRan += 1 })
  // 无人声明 dsh-family.tab：成员工厂始终不执行——证明"不做 re-arm"是安全的。
  assert.equal(memberFactoryRan, 0)
  assert.equal(slots.entries('dsh-family.tab').length, 0)
})

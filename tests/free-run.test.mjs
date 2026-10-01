/**
 * free-run.js 测试：畅跑（单会话限时无视峰谷）的模型、合并、状态派生与持久化。
 *
 * 覆盖用户定案的关键语义：
 * - 窗口是绝对起止时刻、半开区间 `[from, to)`，一次性的（到点自动结束）；
 * - 可反复排多段；重叠/相邻自动合并；有段数上限；
 * - **每段独立暂停**（`paused`）：暂停某段不影响其他段；
 * - `from` 早于 now → 钳到 now（「马上开始」）；
 * - 落盘（`from` 可能在将来，重启不能丢排期）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FREE_RUN_STATES,
  MAX_FREE_RUN_WINDOWS,
  appendWindow,
  createFreeRunStore,
  freeRunState,
  idleFreeRunState,
  isFreeRunActive,
  mergeWindows,
  nextFreeRunBoundary,
  normalizeWindows,
  parseFreeRunInstant,
  pruneWindows,
  removeWindow,
  setAllPaused,
  setWindowPaused,
  windowStatus,
} from '../src/free-run.js'

const TZ = 'Asia/Shanghai'
/** 周一 2026-08-24 10:00 北京 = UTC 02:00。 */
const NOW = Date.UTC(2026, 7, 24, 2, 0, 0)
const H = 60 * 60 * 1000

function tmpStore(t) {
  const dir = mkdtempSync(join(tmpdir(), 'session-guard-freerun-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return { store: createFreeRunStore({ dir }), dir }
}

// ── 时间解析 ───────────────────────────────────────────────────────────

test('parseFreeRunInstant：墙钟形态按配置时区解释', () => {
  const r = parseFreeRunInstant('2026-10-01T20:00', TZ)
  assert.equal(r.ms, Date.UTC(2026, 9, 1, 12, 0, 0)) // 北京 20:00 = UTC 12:00
  // 只给日期 = 当天 00:00
  const d = parseFreeRunInstant('2026-10-01', TZ)
  assert.equal(d.ms, Date.UTC(2026, 8, 30, 16, 0, 0))
})

test('parseFreeRunInstant：带偏移的 ISO 视为绝对时刻（与配置时区无关）', () => {
  assert.equal(parseFreeRunInstant('2026-10-01T20:00:00Z', TZ).ms, Date.UTC(2026, 9, 1, 20, 0, 0))
  assert.equal(parseFreeRunInstant('2026-10-01T20:00:00+08:00', TZ).ms, Date.UTC(2026, 9, 1, 12, 0, 0))
  // 同一时刻，换个配置时区结果不变（因为带偏移）
  assert.equal(parseFreeRunInstant('2026-10-01T20:00:00Z', 'Asia/Tokyo').ms, Date.UTC(2026, 9, 1, 20, 0, 0))
})

test('parseFreeRunInstant：非法输入报错（不抛异常）', () => {
  for (const bad of ['', 'nope', '2026/10/01', '2026-13-01T00:00', '2026-10-01T25:00', null, undefined]) {
    const r = parseFreeRunInstant(bad, TZ)
    assert.equal(typeof r.error, 'string', `${String(bad)} 应报错`)
    assert.equal(r.ms, undefined)
  }
})

// ── 合并 / 追加 ────────────────────────────────────────────────────────

test('mergeWindows：重叠与相邻都合并（相邻是「连着跑」，留两段只多一个计数）', () => {
  const a = { id: 'a', fromMs: 100, toMs: 200 }
  assert.deepEqual(mergeWindows([a], { id: 'b', fromMs: 200, toMs: 300 }).map((w) => [w.fromMs, w.toMs]), [[100, 300]])
  assert.deepEqual(mergeWindows([a], { id: 'b', fromMs: 150, toMs: 300 }).map((w) => [w.fromMs, w.toMs]), [[100, 300]])
  assert.deepEqual(mergeWindows([a], { id: 'b', fromMs: 50, toMs: 250 }).map((w) => [w.fromMs, w.toMs]), [[50, 250]])
  // 不相交 → 两段
  assert.equal(mergeWindows([a], { id: 'b', fromMs: 500, toMs: 600 }).length, 2)
  // 被包含 → 仍是原来那一大段，取并集
  assert.deepEqual(mergeWindows([a], { id: 'b', fromMs: 120, toMs: 180 }).map((w) => [w.fromMs, w.toMs]), [[100, 200]])
})

test('mergeWindows：保持按 fromMs 排序，并保留先出现那段的 id', () => {
  const merged = mergeWindows([{ id: 'later', fromMs: 500, toMs: 600 }], { id: 'earlier', fromMs: 100, toMs: 200 })
  assert.deepEqual(merged.map((w) => w.id), ['earlier', 'later'])
  const joined = mergeWindows([{ id: 'first', fromMs: 100, toMs: 200 }], { id: 'second', fromMs: 200, toMs: 300 })
  assert.equal(joined.length, 1)
  assert.equal(joined[0].id, 'first')
})

test('normalizeWindows：丢弃非法项并排序', () => {
  const out = normalizeWindows([
    { id: 'b', fromMs: 200, toMs: 300 },
    { id: 'bad', fromMs: 300, toMs: 300 },
    { fromMs: Number.NaN, toMs: 100 },
    null,
    'nope',
    { id: 'a', fromMs: 100, toMs: 200 },
  ])
  assert.deepEqual(out.map((w) => w.id), ['a', 'b'])
  assert.equal(normalizeWindows(null).length, 0)
})

test('appendWindow：from 早于 now → 钳到 now（「马上开始」）', () => {
  const r = appendWindow(null, { fromMs: NOW - 5 * H, toMs: NOW + 2 * H }, { now: NOW, id: 'w' })
  assert.equal(r.error, undefined)
  assert.equal(r.record.windows[0].fromMs, NOW)
  assert.equal(r.record.windows[0].toMs, NOW + 2 * H)
  assert.equal(isFreeRunActive(r.record, NOW), true)
})

test('appendWindow：to <= from 拒绝；非法数字拒绝', () => {
  assert.match(appendWindow(null, { fromMs: NOW + 2 * H, toMs: NOW + H }, { now: NOW }).error, /later than from/)
  assert.match(appendWindow(null, { fromMs: NOW + H, toMs: NOW + H }, { now: NOW }).error, /later than from/)
  assert.match(appendWindow(null, { fromMs: Number.NaN, toMs: NOW + H }, { now: NOW }).error, /absolute instants/)
})

test('appendWindow：段数上限（合并后超过 MAX 才拒绝）', () => {
  let rec = null
  for (let i = 0; i < MAX_FREE_RUN_WINDOWS; i += 1) {
    const r = appendWindow(rec, { fromMs: NOW + i * 10 * H, toMs: NOW + i * 10 * H + H }, { now: NOW })
    assert.equal(r.error, undefined, `第 ${i + 1} 段应可加`)
    rec = r.record
  }
  assert.equal(rec.windows.length, MAX_FREE_RUN_WINDOWS)
  const over = appendWindow(rec, { fromMs: NOW + 500 * H, toMs: NOW + 501 * H }, { now: NOW })
  assert.match(over.error, /too many free-run windows/)
})

test('appendWindow：合并后不超限（相邻段合并成一段）', () => {
  const a = appendWindow(null, { fromMs: NOW + H, toMs: NOW + 2 * H }, { now: NOW }).record
  const b = appendWindow(a, { fromMs: NOW + 2 * H, toMs: NOW + 3 * H }, { now: NOW }).record
  assert.equal(b.windows.length, 1)
  assert.equal(b.windows[0].toMs, NOW + 3 * H)
})

test('appendWindow：新段默认未暂停，且不影响既有段的暂停状态', () => {
  const paused = { sessionId: 's1', windows: [{ id: 'x', fromMs: NOW + H, toMs: NOW + 2 * H, paused: true }], updatedAt: NOW }
  const r = appendWindow(paused, { fromMs: NOW + 5 * H, toMs: NOW + 6 * H }, { now: NOW })
  assert.equal(r.record.windows.length, 2, '暂停段与启用段不合并，各自保留')
  assert.equal(r.record.windows[0].paused, true, '既有段的暂停状态不受新段影响')
  assert.equal(r.record.windows[1].paused, false, '新段默认未暂停')
  assert.equal(freeRunState(r.record, NOW), FREE_RUN_STATES.SCHEDULED, '新段启用 → 还有待开始的段')
})

// ── 每段独立暂停（面板每行的 ⏸ / ▶）────────────────────────────────────

test('setWindowPaused / setAllPaused：只影响该段 / 影响全部未结束段', () => {
  const base = {
    sessionId: 's1',
    windows: [
      { id: 'a', fromMs: NOW, toMs: NOW + H },
      { id: 'b', fromMs: NOW + 5 * H, toMs: NOW + 6 * H },
      { id: 'old', fromMs: NOW - 5 * H, toMs: NOW - H },
    ],
    updatedAt: NOW,
  }
  assert.equal(isFreeRunActive(base, NOW + 60_000), true)

  // 只暂停正在生效的那段 → 不再生效
  const one = setWindowPaused(base, 'a', true, NOW)
  assert.equal(one.windows.find((w) => w.id === 'a').paused, true)
  assert.equal(one.windows.find((w) => w.id === 'b').paused, false, '其他段不受影响')
  assert.equal(isFreeRunActive(one, NOW + 60_000), false)
  assert.equal(freeRunState(one, NOW + 60_000), FREE_RUN_STATES.SCHEDULED, 'B 段仍待开始')

  // 恢复该段
  const back = setWindowPaused(one, 'a', false, NOW)
  assert.equal(isFreeRunActive(back, NOW + 60_000), true)

  // 暂停全部：只有未结束的段被暂停，已结束的段不动
  const all = setAllPaused(base, true, NOW)
  assert.equal(all.windows.find((w) => w.id === 'a').paused, true)
  assert.equal(all.windows.find((w) => w.id === 'b').paused, true)
  assert.equal(all.windows.find((w) => w.id === 'old').paused, false, '已结束的段不动')
  assert.equal(freeRunState(all, NOW + 60_000), FREE_RUN_STATES.SUSPENDED)
  assert.equal(isFreeRunActive(all, NOW + 60_000), false)

  // 恢复全部
  assert.equal(freeRunState(setAllPaused(all, false, NOW), NOW + 60_000), FREE_RUN_STATES.ACTIVE)

  // 未命中 id 幂等
  assert.deepEqual(
    setWindowPaused(base, 'nope', true, NOW).windows.map((w) => w.paused),
    [false, false, false],
  )
})

test('mergeWindows：只合并 paused 相同的段（暂停与启用各自保留）', () => {
  const a = { id: 'a', fromMs: 100, toMs: 200, paused: false }
  const b = { id: 'b', fromMs: 200, toMs: 300, paused: true }
  // 相邻但 paused 不同 → 不合并
  assert.equal(mergeWindows([a], b).length, 2)
  // 同 paused 相邻 → 合并
  assert.equal(mergeWindows([a], { ...b, paused: false }).length, 1)
  const c = { id: 'c', fromMs: 200, toMs: 300, paused: true }
  assert.equal(mergeWindows([b], c).length, 1)
})

test('nextFreeRunBoundary：暂停段不产生边界（它不会自己生效）', () => {
  const rec = {
    sessionId: 's1',
    windows: [
      { id: 'paused', fromMs: NOW + H, toMs: NOW + 2 * H, paused: true },
      { id: 'live', fromMs: NOW + 5 * H, toMs: NOW + 6 * H },
    ],
    updatedAt: NOW,
  }
  assert.equal(nextFreeRunBoundary(rec, NOW), NOW + 5 * H, '跳过被暂停的那段')
})

test('windowStatus：已结束优先于已暂停；暂停中的未来段显示 paused', () => {
  assert.equal(windowStatus({ fromMs: NOW, toMs: NOW + H, paused: true }, NOW - 1), 'paused')
  assert.equal(windowStatus({ fromMs: NOW, toMs: NOW + H, paused: true }, NOW), 'paused')
  assert.equal(windowStatus({ fromMs: NOW, toMs: NOW + H, paused: true }, NOW + H), 'ended')
  assert.equal(windowStatus({ fromMs: NOW, toMs: NOW + H, paused: false }, NOW), 'active')
  assert.equal(windowStatus({ fromMs: NOW + H, toMs: NOW + 2 * H, paused: false }, NOW), 'scheduled')
})

// ── 状态派生 ──────────────────────────────────────────────────────────

test('freeRunState：五态与半开区间边界', () => {
  const windows = [{ id: 'w', fromMs: NOW, toMs: NOW + 2 * H }]
  const rec = { sessionId: 's1', windows }
  // 半开 [from, to)：from 含、to 不含
  assert.equal(freeRunState(rec, NOW - 1), FREE_RUN_STATES.SCHEDULED)
  assert.equal(freeRunState(rec, NOW), FREE_RUN_STATES.ACTIVE)
  assert.equal(freeRunState(rec, NOW + 2 * H - 1), FREE_RUN_STATES.ACTIVE)
  assert.equal(freeRunState(rec, NOW + 2 * H), FREE_RUN_STATES.EXPIRED)
  // 无窗口
  assert.equal(freeRunState(idleFreeRunState('s1'), NOW), FREE_RUN_STATES.NONE)
  // 唯一的段被暂停 → suspended
  assert.equal(freeRunState({ ...rec, windows: [{ ...windows[0], paused: true }] }, NOW), FREE_RUN_STATES.SUSPENDED)
  // 段在将来但被暂停 → suspended（不是 scheduled）
  assert.equal(freeRunState({ ...rec, windows: [{ ...windows[0], paused: true }] }, NOW - 1), FREE_RUN_STATES.SUSPENDED)
})

test('freeRunState：多段——一段生效即 active，全部结束才 expired', () => {
  const rec = {
    sessionId: 's1',
    windows: [
      { id: 'a', fromMs: NOW, toMs: NOW + H },
      { id: 'b', fromMs: NOW + 10 * H, toMs: NOW + 11 * H },
    ],
  }
  assert.equal(freeRunState(rec, NOW + 30 * 60 * 1000), FREE_RUN_STATES.ACTIVE)
  // 第一段结束、第二段未开始 → scheduled
  assert.equal(freeRunState(rec, NOW + 5 * H), FREE_RUN_STATES.SCHEDULED)
  // 两段都结束 → expired
  assert.equal(freeRunState(rec, NOW + 20 * H), FREE_RUN_STATES.EXPIRED)
})

test('isFreeRunActive 严格等价于 state === active', () => {
  const rec = { sessionId: 's1', windows: [{ id: 'w', fromMs: NOW, toMs: NOW + H }] }
  for (const at of [NOW - 1, NOW, NOW + H - 1, NOW + H, NOW + 99 * H]) {
    assert.equal(isFreeRunActive(rec, at), freeRunState(rec, at) === FREE_RUN_STATES.ACTIVE)
  }
})

test('nextFreeRunBoundary：待开始时给 from，生效中给 to，其余给最近的下一个 from', () => {
  const rec = {
    sessionId: 's1',
    windows: [
      { id: 'a', fromMs: NOW + H, toMs: NOW + 2 * H },
      { id: 'b', fromMs: NOW + 5 * H, toMs: NOW + 6 * H },
    ],
  }
  assert.equal(nextFreeRunBoundary(rec, NOW), NOW + H) // 第一段的开始
  assert.equal(nextFreeRunBoundary(rec, NOW + H), NOW + 2 * H) // 生效中 → 结束
  assert.equal(nextFreeRunBoundary(rec, NOW + 3 * H), NOW + 5 * H) // 第二段的开始
  assert.equal(nextFreeRunBoundary(rec, NOW + 99 * H), null) // 全结束
  assert.equal(nextFreeRunBoundary(idleFreeRunState('s1'), NOW), null)
})

test('windowStatus / pruneWindows / removeWindow', () => {
  const w = { id: 'w', fromMs: NOW, toMs: NOW + H }
  assert.equal(windowStatus(w, NOW - 1), 'scheduled')
  assert.equal(windowStatus(w, NOW), 'active')
  assert.equal(windowStatus(w, NOW + H), 'ended')

  const rec = {
    sessionId: 's1',
    windows: [w, { id: 'old', fromMs: NOW - 5 * H, toMs: NOW - H }],
  }
  const pruned = pruneWindows(rec, NOW)
  assert.deepEqual(pruned.windows.map((x) => x.id), ['w'])

  const removed = removeWindow(pruned, 'w', NOW)
  assert.equal(removed.windows.length, 0)
  // 未命中 id → 原样
  assert.equal(removeWindow(pruned, 'nope', NOW).windows.length, 1)
})

// ── 存储 / 持久化 ─────────────────────────────────────────────────────

test('store：写入后可读；空窗口自动清文件（不留空壳）', (t) => {
  const { store, dir } = tmpStore(t)
  const rec = { sessionId: 's1', windows: [{ id: 'w', fromMs: NOW, toMs: NOW + H }], updatedAt: NOW }
  store.set('s1', rec)
  assert.equal(store.get('s1').windows.length, 1)
  assert.deepEqual(store.listIds(), ['s1'])
  // 落盘内容可读回
  const raw = JSON.parse(readFileSync(join(dir, 's1.json'), 'utf8'))
  assert.equal(raw.windows[0].fromMs, NOW)

  store.set('s1', { sessionId: 's1', windows: [], updatedAt: NOW })
  assert.equal(store.get('s1'), null)
  assert.equal(store.listIds().length, 0)
})

test('store：重建实例模拟重启 → scheduled / active / paused 全部保留', (t) => {
  const { store, dir } = tmpStore(t)
  const future = { id: 'f', fromMs: NOW + 10 * H, toMs: NOW + 12 * H }
  const open = { id: 'o', fromMs: NOW, toMs: NOW + H }
  store.set('scheduled', { sessionId: 'scheduled', windows: [future], updatedAt: NOW })
  store.set('active', { sessionId: 'active', windows: [open], updatedAt: NOW })
  store.set('off', { sessionId: 'off', windows: [{ ...open, paused: true }], updatedAt: NOW })

  // 新实例 = 重启
  const reopened = createFreeRunStore({ dir })
  assert.equal(freeRunState(reopened.get('scheduled'), NOW), FREE_RUN_STATES.SCHEDULED)
  assert.equal(freeRunState(reopened.get('active'), NOW), FREE_RUN_STATES.ACTIVE)
  assert.equal(freeRunState(reopened.get('off'), NOW), FREE_RUN_STATES.SUSPENDED)
  assert.equal(reopened.listIds().length, 3)
})

test('store：current() 对无记录返回 idle 基线；get() 返回 null', (t) => {
  const { store } = tmpStore(t)
  assert.equal(store.get('nope'), null)
  assert.deepEqual(store.current('nope'), idleFreeRunState('nope'))
  assert.deepEqual(idleFreeRunState('nope').windows, [])
  assert.deepEqual(idleFreeRunState('nope').windows, [])
})

test('store：损坏的 JSON 不抛异常（退回无记录）', (t) => {
  const { store, dir } = tmpStore(t)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'broken.json'), '{ not json')
  assert.equal(store.get('broken'), null)
})

test('新窗口 id 唯一（用于前端 key 与按 id 删除）', () => {
  const a = appendWindow(null, { fromMs: NOW + H, toMs: NOW + 2 * H }, { now: NOW }).record.windows[0]
  const b = appendWindow(null, { fromMs: NOW + 5 * H, toMs: NOW + 6 * H }, { now: NOW }).record.windows[0]
  assert.notEqual(a.id, b.id)
  assert.ok(typeof a.id === 'string' && a.id.length > 0)
})

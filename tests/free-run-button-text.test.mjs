/**
 * free-run-button-text.ts 测试：「畅跑」按钮的文案 / 提示 / 行状态投影（纯函数）。
 *
 * 用户定案的交互：按钮文案**固定**为「畅跑」，点击**一律打开任务管理面板**；
 * 面板顶部三个文本按钮（新建 / 暂停全部 / 删除全部），每行两个图标按钮（暂停、删除）。
 *
 * 直接 import .ts（node 类型擦除），本文件自身保持纯 JS。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_FREE_RUN,
  ICON_DELETE,
  ICON_PAUSE,
  ICON_RESUME,
  allTasksPaused,
  canPause,
  canResume,
  freeRunLabel,
  freeRunTitle,
  liveWindows,
  pauseAllLabel,
  readFreeRun,
  remainingText,
  rowDeleteTitle,
  rowPauseTitle,
  statusLabel,
  toolbarDisabled,
} from '../src/client/free-run-button-text.ts'

/** 造一个视图。 */
function view(over = {}) {
  return { ...EMPTY_FREE_RUN, available: true, timezone: 'Asia/Shanghai', ...over }
}

/** 造一个时段。 */
function win(id, from, status, paused = false) {
  return {
    id,
    from: `2026-10-01T${from}:00.000Z`,
    to: '2026-10-01T23:00:00.000Z',
    fromInput: `2026-10-01T${from}:00`,
    toInput: '2026-10-01T23:00',
    fromDisplay: `10-01 ${from}:00`,
    toDisplay: '10-01 23:00',
    paused,
    status,
  }
}

test('freeRunLabel：固定为「畅跑」，多任务时带计数', () => {
  assert.equal(freeRunLabel(view({ state: 'none' })), '畅跑')
  assert.equal(freeRunLabel(view({ state: 'active' })), '畅跑', '生效中也不改文案（状态靠高亮）')
  assert.equal(freeRunLabel(view({ state: 'suspended' })), '畅跑')
  assert.equal(freeRunLabel(view({ state: 'expired' })), '畅跑')
  assert.equal(freeRunLabel(view({ windows: [win('a', '20', 'active')] })), '畅跑')
  assert.equal(freeRunLabel(view({ windows: [win('a', '20', 'active'), win('b', '21', 'scheduled')] })), '畅跑 ×2')
  assert.equal(freeRunLabel(null), '畅跑')
})

test('freeRunTitle：点击语义 + 生效状态 + 逐条排期', () => {
  const idle = freeRunTitle(view({ state: 'none' }))
  assert.match(idle, /点击打开畅跑任务管理/)
  assert.match(idle, /还没有畅跑任务/)
  assert.match(idle, /Asia\/Shanghai/)
  assert.doesNotMatch(idle, /undefined/)

  const active = freeRunTitle(view({ active: true, msRemaining: 90 * 60 * 1000, windows: [win('a', '20', 'active')] }))
  assert.match(active, /畅跑生效中（剩 1 小时 30 分）/)

  const scheduled = freeRunTitle(view({ active: false, nextStartDisplay: '10-02 09:00', windows: [win('b', '21', 'scheduled')] }))
  assert.match(scheduled, /畅跑未生效，下一段 10-02 09:00/)

  const listed = freeRunTitle(view({ windows: [win('a', '20', 'active'), win('b', '21', 'paused', true), win('c', '22', 'ended')] }))
  assert.match(listed, /畅跑任务/)
  assert.match(listed, /进行中/)
  assert.match(listed, /已暂停/)
  assert.match(listed, /已结束/)
  assert.equal(listed.split('\n').filter((l) => l.includes('10-01')).length, 3)
})

test('statusLabel / canPause / canResume', () => {
  assert.equal(statusLabel('active'), '进行中')
  assert.equal(statusLabel('paused'), '已暂停')
  assert.equal(statusLabel('scheduled'), '待开始')
  assert.equal(statusLabel('ended'), '已结束')

  const live = win('a', '20', 'active')
  assert.equal(canPause(live), true)
  assert.equal(canResume(live), false)
  const paused = win('a', '20', 'paused', true)
  assert.equal(canPause(paused), false)
  assert.equal(canResume(paused), true)
  const ended = win('a', '20', 'ended')
  assert.equal(canPause(ended), false, '已结束的段无从暂停')
  assert.equal(canResume(ended), false)
})

test('allTasksPaused / pauseAllLabel：全暂停时顶部按钮变「恢复全部任务」', () => {
  const mixed = view({ windows: [win('a', '20', 'active'), win('b', '21', 'paused', true)] })
  assert.equal(allTasksPaused(mixed), false)
  assert.equal(pauseAllLabel(mixed), '暂停全部任务')

  const allPaused = view({ windows: [win('a', '20', 'paused', true), win('b', '21', 'paused', true)] })
  assert.equal(allTasksPaused(allPaused), true)
  assert.equal(pauseAllLabel(allPaused), '恢复全部任务')

  // 已结束的段不参与判定（只有它时没有可操作任务）
  const onlyEnded = view({ windows: [win('a', '20', 'ended')] })
  assert.equal(liveWindows(onlyEnded).length, 0)
  assert.equal(allTasksPaused(onlyEnded), false, '没有可操作任务时不算「全部已暂停」')
  assert.equal(toolbarDisabled(onlyEnded), true)
  assert.equal(toolbarDisabled(view({ windows: [win('a', '20', 'active')] })), false)
  assert.equal(toolbarDisabled(view({})), true)

  // 全部未暂停 → 暂停全部；全部暂停但混有已结束 → 仍算全暂停
  const withEnded = view({ windows: [win('a', '20', 'paused', true), win('b', '21', 'ended')] })
  assert.equal(allTasksPaused(withEnded), true)
})

test('rowPauseTitle / rowDeleteTitle：提示随状态变化', () => {
  assert.match(rowPauseTitle(win('a', '20', 'active')), /暂停这一段畅跑/)
  assert.match(rowPauseTitle(win('a', '20', 'active')), /其他段不受影响/)
  assert.match(rowPauseTitle(win('a', '20', 'paused', true)), /恢复这一段畅跑/)
  assert.match(rowDeleteTitle(), /删除这一段畅跑/)
})

test('图标字形带 text-presentation 变体选择符（避免被渲染成彩色 emoji）', () => {
  assert.equal(ICON_PAUSE, '⏸\uFE0E')
  assert.equal(ICON_RESUME, '▶\uFE0E')
  assert.equal(ICON_DELETE, '×')
})

test('remainingText', () => {
  assert.equal(remainingText(null), null)
  assert.equal(remainingText(0), null)
  assert.equal(remainingText(-5), null)
  assert.equal(remainingText(30 * 60 * 1000), '30 分钟')
  assert.equal(remainingText(60 * 60 * 1000), '1 小时')
  assert.equal(remainingText(61 * 60 * 1000), '1 小时 1 分')
})

test('readFreeRun：形状异常一律退回安全空视图（fail-open）', () => {
  assert.deepEqual(readFreeRun(null), EMPTY_FREE_RUN)
  assert.deepEqual(readFreeRun({ ok: false, freeRun: { state: 'active' } }), EMPTY_FREE_RUN)
  assert.deepEqual(readFreeRun({ ok: true }), EMPTY_FREE_RUN)
  assert.deepEqual(readFreeRun({ ok: true, freeRun: 'nope' }), EMPTY_FREE_RUN)
})

test('readFreeRun：正常负载被完整投影（含 active 与每段 paused）', () => {
  const v = readFreeRun({
    ok: true,
    freeRun: {
      state: 'active',
      active: true,
      available: true,
      timezone: 'Asia/Shanghai',
      windows: [win('a', '20', 'active'), win('b', '21', 'paused', true)],
      activeId: 'a',
      msRemaining: 1000,
      nextStartMs: null,
      nextStartDisplay: null,
    },
  })
  assert.equal(v.state, 'active')
  assert.equal(v.active, true)
  assert.equal(v.available, true)
  assert.equal(v.timezone, 'Asia/Shanghai')
  assert.equal(v.windows.length, 2)
  assert.equal(v.windows[1].paused, true)
  assert.equal(v.activeId, 'a')
  assert.equal(v.msRemaining, 1000)
})

test('readFreeRun：windows 里的非对象项被过滤掉', () => {
  const v = readFreeRun({ ok: true, freeRun: { state: 'none', windows: [win('a', '20', 'active'), null, 'x'] } })
  assert.equal(v.windows.length, 1)
})

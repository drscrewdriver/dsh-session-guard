// TUI 可见反馈：拉门时必须向会话追加一条 plugin 源 user/message（dsh-tui 折叠成 `· …`）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createStepGate } from '../src/step-gate.js'

function makeGate() {
  return createStepGate({
    // manual 暂停绕过 enabled/峰谷判定，只保留互斥铁律
    getSettings: () => ({}),
    shouldHoldSession: () => true,
    isHeldByDeferrals: () => false,
    isRootAgent: () => true,
    logger: { warn() {}, error() {}, info() {} },
    onHold: (sessionId, agent, info) => {
      const reason = info.manual ? '手动暂停' : (info.why === 'peak' ? '高峰拦截' : `门控(${info.why})`)
      const text = `⏳ session-guard：${reason} — 本回合已在 step 边界挂起（step ${info.step || '?'}）`
      agent.session.append('user/message', {
        id: `guard-${info.since}`,
        role: 'user',
        content: [{ type: 'text', text }],
        source: { kind: 'plugin', name: 'session-guard' },
      }, { surfaceOp: 'append' })
    },
  })
}

/** 假 agent：session.append 把调用记到 list 里。 */
function makeAgent(id, list) {
  return {
    id,
    session: {
      append: (event, message, opts) => { list.push({ event, message, opts }) },
    },
  }
}

test('step 抬门时追加 plugin 源 user/message（TUI 一行反馈）', async () => {
  const appended = []
  const gate = makeGate()
  gate.requestPause('s1')
  const agent = makeAgent('s1', appended)
  let released = false
  const holding = gate.hold({ agent, step: 2, turn: 3, signal: null }, () => { released = true; return Promise.resolve({ kind: 'enter', messages: [] }) })
  assert.equal(appended.length, 1, '拉门应立即追加一条消息')
  assert.equal(appended[0].event, 'user/message')
  assert.equal(appended[0].message.source.kind, 'plugin')
  assert.equal(appended[0].message.source.name, 'session-guard')
  assert.ok(String(appended[0].message.content[0].text).includes('手动暂停'))
  gate.release('s1', 'test')
  await holding
  assert.equal(released, true)
})

test('同一门控不会重复追加（onHold 去重由调用方负责，这里只验证只调一次）', async () => {
  const appended = []
  const gate = makeGate()
  gate.requestPause('s2')
  const agent = makeAgent('s2', appended)
  const holding = gate.hold({ agent, step: 2, turn: 1, signal: null }, () => Promise.resolve({ kind: 'enter', messages: [] }))
  assert.equal(appended.length, 1)
  gate.release('s2', 'test')
  await holding
})
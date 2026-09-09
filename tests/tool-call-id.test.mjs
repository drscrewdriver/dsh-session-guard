/**
 * dsh-session-guard — `tool/result` 调用 id 双形态读取的单测。
 *
 * 覆盖 DSH 0.1.1-rc.2 与 0.1.2-rc.1 都存在的两种记录形态（现行 `content[].toolCallId`
 * 与遗留 `source.callId`），并锁定「块优先」的读取顺序——这是暂停点判定与 in-flight
 * 工具落地共用的不变量，改成单读会在其中一种形态上丢 id。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readToolResultBlockId, readToolResultCallId } from '../src/tool-call-id.js'

test('readToolResultCallId：现行形态 content[].toolCallId', () => {
  const message = { content: [{ type: 'tool-result', toolCallId: 'call-1', content: [] }] }
  assert.equal(readToolResultCallId(message), 'call-1')
})

test('readToolResultCallId：遗留形态 source.callId', () => {
  const message = { content: [], source: { callId: 'call-legacy' } }
  assert.equal(readToolResultCallId(message), 'call-legacy')
})

test('readToolResultCallId：两形态并存时块优先', () => {
  const message = {
    content: [{ type: 'tool-result', toolCallId: 'call-block' }],
    source: { callId: 'call-legacy' },
  }
  assert.equal(readToolResultCallId(message), 'call-block')
})

test('readToolResultCallId：跳过非 tool-result 块，取第一个命中块', () => {
  const message = {
    content: [
      { type: 'text', text: '前置文本' },
      { type: 'tool-result', toolCallId: 'call-2' },
      { type: 'tool-result', toolCallId: 'call-3' },
    ],
  }
  assert.equal(readToolResultCallId(message), 'call-2')
})

test('readToolResultCallId：缺失或非法输入返回 undefined', () => {
  assert.equal(readToolResultCallId(undefined), undefined)
  assert.equal(readToolResultCallId(null), undefined)
  assert.equal(readToolResultCallId('not-an-object'), undefined)
  assert.equal(readToolResultCallId({}), undefined)
  assert.equal(readToolResultCallId({ content: 'not-an-array' }), undefined)
  assert.equal(readToolResultCallId({ content: [{ type: 'tool-result' }] }), undefined)
  assert.equal(readToolResultCallId({ content: [{ type: 'tool-result', toolCallId: 42 }] }), undefined)
  assert.equal(readToolResultCallId({ source: { callId: 42 } }), undefined)
})

test('readToolResultBlockId：只认 tool-result 块且 id 必须是字符串', () => {
  assert.equal(readToolResultBlockId({ type: 'tool-result', toolCallId: 'call-4' }), 'call-4')
  assert.equal(readToolResultBlockId({ type: 'text', toolCallId: 'call-4' }), undefined)
  assert.equal(readToolResultBlockId({ type: 'tool-result' }), undefined)
  assert.equal(readToolResultBlockId({ type: 'tool-result', toolCallId: 42 }), undefined)
  assert.equal(readToolResultBlockId(undefined), undefined)
  assert.equal(readToolResultBlockId(null), undefined)
})

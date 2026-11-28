/**
 * index.js 传给 createBridge 的 deferrals 壳必须转出 bridge.js 读到的**每一个**方法（issue #4）。
 *
 * 背景：v4.2.11 的壳只有 settle / clearDeferred，而 bridge.state() 用
 * `typeof deferrals.has === 'function'` 判定可用性 → requestHeld 恒为 false，
 * 按钮永远显示「暂停会话」，得连点两下才放行。
 *
 * 这里钉的是**跨文件不变量**而不是某一行代码：从 bridge.js 里抽出所有
 * `deferrals.<name>` 的读取点，逐一断言 index.js 的壳里有同名键。
 * 以后 bridge.js 多读一个方法，这个测试立刻红——不需要有人记得回来改壳。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createBridge } from '../lib/bridge.js'
import { createStore } from '../lib/store.js'
import { createGate } from '../lib/gate.js'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const BRIDGE_SRC = readFileSync(join(ROOT, 'src', 'bridge.js'), 'utf8')
const INDEX_SRC = readFileSync(join(ROOT, 'src', 'index.js'), 'utf8')

/** 去掉块注释与行注释，只留可执行代码（JSDoc 里的 `deferrals.js` 不是方法读取）。 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** bridge.js 里读到的所有 deferrals 方法名（`deferrals.foo` 与 `typeof deferrals.foo`）。 */
function methodsReadByBridge() {
  const names = new Set()
  for (const m of stripComments(BRIDGE_SRC).matchAll(/deferrals\.([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  return [...names].sort()
}

/** index.js 里 createBridge(..., { ... }) 那个对象字面量的键。 */
function shellKeysInIndex() {
  const at = INDEX_SRC.indexOf('createBridge(ctx, gate, store, pauseGate, stepGate, {')
  assert.notEqual(at, -1, 'index.js 必须把壳对象内联传给 createBridge')
  const open = INDEX_SRC.indexOf('{', at)
  let depth = 0
  let end = -1
  for (let i = open; i < INDEX_SRC.length; i += 1) {
    const ch = INDEX_SRC[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  assert.notEqual(end, -1, '壳对象字面量必须闭合')
  const body = INDEX_SRC.slice(open + 1, end)
  // 只取顶层的 `key:` —— 值里的箭头函数体也含 `:`，按缩进+行首判断。
  const keys = new Set()
  for (const line of body.split('\n')) {
    const m = /^\s{2,4}([A-Za-z_$][\w$]*)\s*:/.exec(line)
    if (m) keys.add(m[1])
  }
  return [...keys].sort()
}

test('issue #4：bridge 读到的每个 deferrals 方法都在 index.js 的壳里', () => {
  const needed = methodsReadByBridge()
  const have = shellKeysInIndex()
  assert.ok(needed.length >= 4, `bridge 至少读 4 个方法，实际 ${needed.join(',')}`)
  for (const name of needed) {
    assert.ok(have.includes(name), `index.js 的 deferrals 壳缺 ${name}（bridge.js 会读它）——缺 has/list 时 requestHeld 恒 false`)
  }
})

test('issue #4：壳的 has/list 在 deferrals 未就绪时返回中性值而不是抛错', () => {
  // 构造期 deferralsRef 还是 null，bridge.state() 随时可能被 /state 路由读到。
  const deferralsShell = {
    settle: () => false,
    clearDeferred: () => false,
    has: () => false,
    list: () => [],
  }
  const ctx = { get: () => undefined }
  const store = createStore()
  const gate = createGate({ getCtx: () => ctx, getSettings: () => ({}), store })
  const bridge = createBridge(ctx, gate, store, undefined, undefined, deferralsShell)
  const st = bridge.state('s1')
  assert.equal(st.requestHeld, false)
  assert.equal(st.requestHeldSince, null)
  assert.equal(st.pausedAny, false)
})

test('issue #4：壳把 has/list 转给真 deferrals 后，requestHeld 才会被投影出来', () => {
  const held = new Map([['s1', { sessionId: 's1', provider: 'p', model: 'm', since: 777 }]])
  const deferralsShell = {
    settle: () => false,
    clearDeferred: () => false,
    has: (id) => held.has(String(id)),
    list: () => [...held.values()],
  }
  const ctx = { get: () => undefined }
  const store = createStore()
  const gate = createGate({ getCtx: () => ctx, getSettings: () => ({}), store })
  const bridge = createBridge(ctx, gate, store, undefined, undefined, deferralsShell)
  const st = bridge.state('s1')
  assert.equal(st.requestHeld, true, '壳转出 has 后必须能看见请求级 hold')
  assert.equal(st.requestHeldSince, 777)
  assert.equal(st.pausedAny, true, 'pausedAny 为真，按钮才会显示「继续会话」')
})

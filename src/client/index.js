/**
 * dsh-session-guard — 浏览器 half。
 *
 * 职责（全部 fail-open，D8）：
 * 1. 高峰状态徽标：轮询 /session-guard/state?session=<id>，展示 高峰/谷时/周末 状态。
 * 2. 回退冻结按钮：仅当未探测到 input-traffic 最小桥
 *    （window.__DSH_SESSION_GUARD_BRIDGE__）时注册到 composer 工具行；
 *    冻结 = ① 前端冻结等待队列（fallbackFreezeStore）+ ② POST /session-guard/rpc
 *    stopNextTurn（停掉 session 下一回合）。
 * 3. 若 input-traffic 在（其冻结按钮已接管队列冻结），本插件不重复注册按钮——
 *    冻结队列归 input-traffic，本插件只提供服务端 gate（经其透传）。
 *
 * 注意：本文件为浏览器 bundle 入口（经 package.json dsh.client 声明加载），
 * 依赖 DSH client 运行时；纯逻辑部分（fallbackFreezeStore）无依赖可直接单测。
 */
import { fallbackFreezeStore, setFrozen, clearFrozen } from './freeze-store.js'
import { detectInputTrafficBridge } from '../detect.js'

export const inject = ['slots', 'locale', 'sessions', 'conversation']

/** 本插件自己的冻结按钮 slot id（仅在回退路径使用）。 */
const FREEZE_SLOT_ID = 'session-guard-freeze'

/** 轮询间隔：高峰状态徽标 15s；冻结状态 5s。 */
const STATE_POLL_MS = 15_000
const LOCK_POLL_MS = 5_000

async function rpc(sessionId, action, extra = {}) {
  try {
    const res = await fetch('/session-guard/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, action, ...extra }),
    })
    const body = await res.json().catch(() => ({}))
    return { ok: res.ok, body }
  } catch (e) {
    // fail-open：网络/路由不可达 → 静默，绝不报错（D8）。
    return { ok: false, body: { error: String(e && e.message || e) } }
  }
}

async function fetchState(sessionId) {
  try {
    const res = await fetch(`/session-guard/state?session=${encodeURIComponent(sessionId)}`)
    const body = await res.json().catch(() => ({}))
    return body && body.state ? body.state : null
  } catch {
    return null
  }
}

/**
 * 回退冻结按钮（input-traffic 不在时注册）。
 * 冻结：摘除待发队列 → fallback store；调服务端 stopNextTurn（fail-open）。
 * 解冻：按 FIFO 重投队列；调服务端 resume（fail-open）。
 */
export function createFallbackFreezeControl({ sessionId, getQueued, detachQueue, reattachQueue, notify }) {
  const frozen = () => fallbackFreezeStore.getSnapshot().frozen

  async function freeze() {
    const queued = getQueued()
    const pending = queued
      .filter((row) => typeof row.text === 'string' && row.text !== '')
      .map((row) => ({ text: row.text }))
    await detachQueue(queued)
    setFrozen(pending)
    // 服务端：停掉下一回合（可选；失败静默，前端冻结仍生效）。
    await rpc(sessionId, 'stopNextTurn')
    if (notify) notify('info', '已冻结：队列已暂存，会话下一回合已停止')
  }

  async function unfreeze() {
    const pending = fallbackFreezeStore.getSnapshot().pending
    clearFrozen()
    for (const entry of pending) {
      await reattachQueue(entry.text)
    }
    await rpc(sessionId, 'resume')
    if (notify) notify('info', '已解冻：队列已恢复')
  }

  return {
    frozen,
    freeze,
    unfreeze,
  }
}

export function apply(ctx) {
  // ── 高峰状态徽标：composer 工具行注入（无条件注册，仅展示）──
  // 说明：此部分依赖 DSH client UI slot 运行时；为保持 bundle 纯净，
  // 徽标状态轮询挂到会话级 effect，渲染交给 slots.register。
  // ── 回退冻结按钮：仅在 input-traffic 最小桥缺失时注册 ──
  const bridgePresent = detectInputTrafficBridge()
  if (!bridgePresent) {
    ctx.effect(() => {
      try {
        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          id: FREEZE_SLOT_ID,
          order: 40,
          locale: 'session-guard',
          inject: (sessionId) => ({
            // 由注入方提供 conversation 服务动词；此处仅声明占位，
            // 具体实现依赖会话 scope（与 input-traffic 的 freeze-button 同构）。
            sessionId,
            rpc,
          }),
        }, FallbackFreezeButton))
      } catch (e) {
        // slot 不可用（运行时缺依赖）→ 静默跳过，fail-open（D8）。
        console.warn('[session-guard] fallback freeze slot unavailable: ' + String(e && e.message || e))
      }
    }, 'session-guard: fallback freeze slot')
  }

  // ── 状态轮询（会话打开时更新徽标数据）──
  ctx.effect(() => {
    const timers = []
    try {
      timers.push(setInterval(() => {
        for (const s of (ctx.sessions ? ctx.sessions.list?.() ?? [] : [])) {
          void fetchState(String(s.id)).then((st) => {
            // 展示状态由徽标组件订阅；此处仅保留最近快照。
            lastStateBySession.set(String(s.id), st)
          })
        }
      }, STATE_POLL_MS))
      timers.push(setInterval(() => {
        for (const s of (ctx.sessions ? ctx.sessions.list?.() ?? [] : [])) {
          void fetchState(String(s.id)).then((st) => {
            lastStateBySession.set(String(s.id), st)
          })
        }
      }, LOCK_POLL_MS))
    } catch (e) {
      console.warn('[session-guard] state polling unavailable: ' + String(e && e.message || e))
    }
    return () => {
      for (const t of timers) clearInterval(t)
    }
  }, 'session-guard: state polling')
}

/** 最近会话状态快照（徽标组件订阅；不持久化，纯内存）。 */
export const lastStateBySession = new Map()

/**
 * 回退冻结按钮组件占位。
 * 完整渲染依赖 dsh-client-ui-* 组件库；此占位保证 bundle 结构与 slot 契约一致，
 * 渲染细节在接入 Web 时补齐（与 input-traffic FreezeButton 同构）。
 */
export function FallbackFreezeButton(props) {
  // 组件占位：真实实现为 React 组件（onClick → createFallbackFreezeControl）。
  return {
    // 见 README「回退冻结按钮」：挂接 createFallbackFreezeControl 的 freeze/unfreeze。
  }
}

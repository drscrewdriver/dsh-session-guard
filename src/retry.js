/**
 * dsh-session-guard — 后端自动重试（host side，D9）。
 *
 * 监听 session/event：turn/end 以 error / interrupted / max-tokens 结束时，
 * 分类瞬时/永久失败，自适应退避后自动 `agent.followup(retryText)` 续跑。
 *
 * 关键纪律：
 * - **冻结让路**：会话被本插件门控（高峰暂停 / 队列锁）时不触发重试——
 *   与 input-traffic「freeze 是一等公民」一致，自动重试不得绕过会话门。
 * - 用户手动介入（user/message）与成功回合重置连续计数。
 * - 子代理会话不重试（由父代理处理）。
 * - 永久失败（鉴权/余额/模型不存在/上下文超限等）重试无益 → 停止并告警。
 *
 * 纯决策逻辑（classifyTurnEnd / isTransientFailure / effectiveCooldown /
 * shouldRetry）零依赖可单测；事件接线在 createRetry。
 */

/** 默认重试配置。 */
export const DEFAULT_RETRY = Object.freeze({
  retryEnabled: false, // ← 自动重试开关（默认关，保守）
  retryText: '继续（自动重试）',
  retryGraceMs: 3000, // 失败后等待多久再发
  retryCooldownMs: 20000, // 同一会话两次重试最小间隔
  retryBackoffFactor: 2,
  retryBackoffMaxMs: 300000,
  retryMaxConsecutive: 3, // 连续重试上限，超过停止
})

/** 瞬时 vs 永久失败分类：瞬时值得重试，永久重试无益。 */
export function isTransientFailure({ code, message, status } = {}) {
  const haystack = `${code ?? ''} ${message ?? ''}`.toLowerCase()
  if (status !== undefined && (status === 401 || status === 403)) return false
  const permanent =
    /auth|unauthor|forbidden|credential|api\s*[_-]?\s*key|permission/i.test(haystack) ||
    /insufficient.*(balance|quota)|billing|payment/i.test(haystack) ||
    /model[^a-z]*not[^a-z]*found|unknown[_-]?model|not.*support.*model/i.test(haystack) ||
    /context.*(length|limit|overflow|exceed)|token.*limit|max.*context/i.test(haystack) ||
    /invalid[_-]?request|bad[_-]?request/i.test(haystack)
  return !permanent
}

/**
 * turn/end reason → 是否可自动重试。
 * - completed / aborted（用户停）/ blocked（策略拒）→ 否
 * - error → 按 isTransientFailure 分类
 * - interrupted（崩溃修复）→ 可重试
 * - max-tokens → 可重试
 */
export function classifyTurnEnd(reason, failure) {
  const kind = reason && reason.kind
  if (kind === 'completed' || kind === 'aborted' || kind === 'blocked') return false
  if (kind === 'error') return isTransientFailure(failure)
  if (kind === 'interrupted' || kind === 'max-tokens') return true
  return false
}

/** 自适应退避：consecutive 次连续后 cooldown * factor^n，封顶 max。 */
export function effectiveCooldown(consecutive, base, factor, max) {
  const mult = Math.pow(factor, Math.max(0, consecutive))
  return Math.min(Math.max(base, base * mult), Math.max(base, max))
}

/**
 * 纯决策：此刻是否应触发重试。
 * @param {object} s 会话状态 { consecutive, lastAttemptAt, pending }
 * @param {object} cfg 重试配置
 * @param {boolean} frozen 会话是否被门控（高峰暂停/队列锁）
 * @param {number} now
 */
export function shouldRetry(s, cfg, frozen, now = Date.now()) {
  if (!cfg.retryEnabled) return false
  if (frozen) return false // 冻结让路（D9）
  if (s.pending) return false // 已有排队重试
  if (s.consecutive >= cfg.retryMaxConsecutive) return false
  if (now - s.lastAttemptAt < effectiveCooldown(s.consecutive, cfg.retryCooldownMs, cfg.retryBackoffFactor, cfg.retryBackoffMaxMs)) return false
  return true
}

/** 会话状态工厂。 */
export function freshRetryState() {
  return { consecutive: 0, lastAttemptAt: 0, pending: false }
}

/**
 * 事件接线（host）：
 * @param {object} deps
 * @param {object} deps.ctx host context
 * @param {()=>object} deps.getSettings 读实时配置
 * @param {(sessionId:string)=>boolean} deps.isFrozen 会话是否被门控
 * @param {(sessionId:string, text:string)=>void} [deps.send] 发送函数（默认 agent.followup）
 */
export function createRetry({ ctx, getSettings, isFrozen, send }) {
  const states = new Map()

  function state(sessionId) {
    let s = states.get(sessionId)
    if (!s) {
      s = freshRetryState()
      states.set(sessionId, s)
    }
    return s
  }

  /** 从 turn/end reason 提取失败事实。 */
  function failureFacts(reason) {
    const error = reason && reason.error
    return {
      code: error && typeof error.code === 'string' ? error.code : 'UNKNOWN',
      message: error && typeof error.message === 'string' ? error.message : '',
      status: error && typeof error.status === 'number' ? error.status : undefined,
    }
  }

  function schedule(sessionId, reason) {
    const s = state(sessionId)
    const cfg = getSettings()
    if (s.pending) return
    const frozen = isFrozen(sessionId)
    const facts = failureFacts(reason)
    if (!shouldRetry({ ...s, pending: true }, cfg, frozen)) return
    s.pending = true
    const grace = cfg.retryGraceMs ?? DEFAULT_RETRY.retryGraceMs
    const timer = setTimeout(() => {
      s.pending = false
      // 到点再复核：门控/上限变化后放弃。
      if (!shouldRetry(s, cfg, isFrozen(sessionId))) return
      const agent = ctx.agents.get(sessionId)
      if (!agent || agent.status !== 'idle') return
      const text = cfg.retryText ?? DEFAULT_RETRY.retryText
      try {
        if (send) {
          send(sessionId, text)
        } else {
          // 与 autoresume 同构：直接构造 plugin-source 消息，避免运行时依赖。
          agent.followup({
            id: `session-guard-retry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: 'user',
            content: [{ type: 'text', text }],
            source: { kind: 'plugin', plugin: 'session-guard', form: 'notice' },
          })
        }
        s.lastAttemptAt = Date.now()
        s.consecutive += 1
        ctx.logger?.info?.(`[session-guard] auto-retry ${sessionId} (${String(reason && reason.kind)}), #${s.consecutive}`)
      } catch (e) {
        ctx.logger?.warn?.(`[session-guard] auto-retry send failed: ${String(e && e.message || e)}`)
      }
    }, grace)
    // 会话对象上的清理钩子（若宿主提供）。
    const dispose = () => clearTimeout(timer)
    return dispose
  }

  function onEvent(session, event) {
    const sessionId = session && session.id
    if (typeof sessionId !== 'string') return
    const s = state(sessionId)
    switch (event.type) {
      case 'turn/end': {
        const reason = event.data && event.data.reason
        if (reason && reason.kind === 'completed') {
          s.consecutive = 0 // 成功回合重置
          s.pending = false
          return
        }
        if (reason && reason.kind === 'aborted') {
          // 用户主动停止：不重试，重置。
          s.consecutive = 0
          s.pending = false
          return
        }
        if (reason && classifyTurnEnd(reason, failureFacts(reason))) {
          schedule(sessionId, reason)
        }
        return
      }
      case 'user/message': {
        // 用户手动介入：重置（无论是否我们的回显都保守重置）。
        if (event.data && event.data.source && event.data.source.kind === 'user') {
          s.consecutive = 0
          s.pending = false
        }
        return
      }
      default:
        return
    }
  }

  ctx.on('session/event', (session, event) => {
    try {
      onEvent(session, event)
    } catch (e) {
      ctx.logger?.warn?.(`[session-guard] retry event failed: ${String(e && e.message || e)}`)
    }
  })

  return {
    onEvent,
    state,
    states,
  }
}

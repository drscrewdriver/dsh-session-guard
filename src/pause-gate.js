/**
 * dsh-session-guard — 自研会话门引擎（脱离 dsh-task-control，全量移植）。
 *
 * 真实锁定「session 推进」：复用 dsh runtime 自身的原语，不依赖任何外部会话门：
 * - `agent.cancel({ kind:'user' }, { keepInbox:true })` —— 停住当前回合（中断推理/在途工具）。
 * - `goals.pause(agent, { id, revision })` —— 停住同会话 goal，防 goal-round driver 再排。
 * - `ctx.on('session/event')` —— 安全边界：tool/call 记 in-flight，tool/result 落地，
 *   assistant/message 记录 deferredTools，再落地延迟暂停（queueMicrotask）。
 * - `agent.followup(createUserMessage({ content, source:{kind:'plugin',plugin} }))` —— 恢复续跑指令。
 * - 暂停状态持久化（src/pause-store.js），不写 session log。
 *
 * 三粒度（对齐 task-control）：
 *   force        立即中断推理+在途工具，记 interruptedTool，resume 需 confirm 选 rerun/skip
 *   safe + stop  在途工具跑完后再暂停（不中断推理则工具完成后落地）
 *   safe + wait  不中断推理，assistant/message 后记 deferredTools 再落地（默认）
 *
 * 设计为目标可单测：ctx / pauseStore / createUserMessage 全部依赖注入，
 * 停/续/取消判定不依赖真实 dsh runtime；`getAgent(sessionId)` 经 `ctx.agents.get` 懒取。
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm'

/**
 * @param {object} deps
 * @param {object} deps.ctx host context（含 agents.get / get / logger，可选 goals）
 * @param {ReturnType<import('./pause-store.js').createPauseStore>} deps.pauseStore 暂停状态存储
 * @param {string} [deps.pluginId] followup 消息的 source.plugin（默认 'session-guard'）
 * @param {(content: object) => unknown} [deps.makeFollowupMessage] 恢复消息构造（默认 dsh-llm createUserMessage；测试注入）
 */
export function createPauseGate({ ctx, pauseStore, pluginId = 'session-guard', makeFollowupMessage = createUserMessage }) {
  const state = { inFlight: new Map(), pendingPause: new Map() }
  const getAgent = (sessionId) => (ctx && typeof ctx.agents?.get === 'function' ? ctx.agents.get(sessionId) : undefined)

  /** 会话门（dsh-task-control）当前是否可用（兼容探测；自研后始终视为可用）。 */
  const taskControlAvailable = () => true

  // ── in-flight 工具跟踪 ──────────────────────────────────────────────

  function inflightOf(sessionId) {
    let map = state.inFlight.get(sessionId)
    if (map === undefined) {
      map = new Map()
      state.inFlight.set(sessionId, map)
    }
    return map
  }

  function latestInflight(sessionId) {
    const map = inflightOf(sessionId)
    const entries = [...map.values()]
    return entries.length > 0 ? entries[entries.length - 1] : null
  }

  function clearInflight(sessionId) {
    state.inFlight.delete(sessionId)
  }

  // ── 工具描述 / 结果查阅（resume 断点决策） ────────────────────────────

  /** 描述工具目的：优先 model 写的 description，再 bash command，再 compact args。 */
  function describeToolPurpose(info) {
    if (info === undefined || info === null) return '未知工具'
    const raw = info.arguments
    const parseArgs = (text) => {
      try {
        return JSON.parse(text)
      } catch {
        return null
      }
    }
    const args = typeof raw === 'string' ? parseArgs(raw) : raw
    if (args !== null && typeof args.description === 'string' && args.description.length > 0) return args.description
    if (info.name === 'bash' && args !== null && typeof args.command === 'string') return `运行命令：${args.command}`
    if (args !== null) {
      try {
        return JSON.stringify(args).slice(0, 120)
      } catch {
        /* ignore */
      }
    }
    return `工具 ${info.name}`
  }

  function describeTool(info) {
    return `${info?.name ?? '未知工具'}（${describeToolPurpose(info)}）`
  }

  /** 在 session log 查一个中断工具的实际结果（kernel 会 drain 已启动工具到 tool/result）。 */
  function findToolOutcome(agent, callId) {
    if (!agent?.session?.events) return null
    let outcome = null
    for (const event of agent.session.events) {
      if (event.type === 'tool/result') {
        const message = event.data?.message ?? {}
        const block = (Array.isArray(message.content) ? message.content : []).find((b) => b?.type === 'tool-result')
        const id = block?.toolCallId ?? message.source?.callId
        if (id === callId) {
          outcome = {
            hasResult: true,
            isError: block?.isError === true,
            abortedBeforeDispatch: event.data?.error?.code === 'ABORTED_BEFORE_DISPATCH',
            content: block?.content ?? [],
          }
        }
      } else if (event.type === 'user/message') {
        const content = Array.isArray(event.data?.content) ? event.data.content : []
        for (const block of content) {
          if (block?.type === 'tool-result' && block.toolCallId === callId) {
            outcome = { hasResult: true, isError: block.isError === true, abortedBeforeDispatch: false, content: block.content ?? [] }
          }
        }
      }
    }
    return outcome
  }

  function lastUserPrompt(agent) {
    if (!agent?.session?.events) return null
    for (let index = agent.session.events.length - 1; index >= 0; index -= 1) {
      const event = agent.session.events[index]
      if (event.type !== 'user/message') continue
      if (event.data?.source?.kind !== 'user') continue
      return event.data.content ?? null
    }
    return null
  }

  // ── 暂停状态读写 ────────────────────────────────────────────────────

  function currentPause(id) {
    return pauseStore.current(id)
  }

  function markPaused(id, resumeContent, forcedContext, deferredTools) {
    const snapshot = {
      sessionId: String(id),
      paused: true,
      resumeContent: resumeContent ?? null,
      forced: forcedContext?.forced === true,
      interruptedTool: forcedContext?.interruptedTool ?? null,
      deferredTools: deferredTools ?? null,
      updatedAt: Date.now(),
    }
    pauseStore.set(id, snapshot)
    return snapshot
  }

  function clearPaused(id) {
    pauseStore.clear(id)
  }

  // ── goal 暂停（防 goal-round driver 再排同会话轮次） ──────────────────

  function pauseSessionGoal(agent) {
    try {
      const goals = ctx && typeof ctx.get === 'function' ? ctx.get('goals') : undefined
      if (goals === undefined) return
      const goal = goals.get(agent)
      if (goal !== undefined && goal.phase === 'active') {
        goals.pause(agent, { id: goal.id, revision: goal.revision })
      }
    } catch (e) {
      ctx?.logger?.warn?.('[session-guard] goal pause failed: ' + String(e))
    }
  }

  // ── 立即落地暂停 ────────────────────────────────────────────────────

  /** 立即停止运行回合（agent.cancel 保 inbox）+ 停 goal + 持久化快照。 */
  function applyPauseNow(id, resumeContent, forcedContext, deferredTools) {
    state.pendingPause.delete(id)
    const current = currentPause(id)
    if (current.paused) return { kind: 'success', text: 'task is already paused' }
    const agent = getAgent(id)
    if (agent !== undefined && agent.status === 'running') agent.cancel({ kind: 'user' }, { keepInbox: true })
    clearInflight(id)
    if (agent !== undefined) pauseSessionGoal(agent)
    markPaused(id, resumeContent, forcedContext, deferredTools)
    return { kind: 'success', text: agent !== undefined && agent.status === 'running' ? 'task paused — the running turn was stopped' : 'task paused' }
  }

  // ── 暂停主逻辑（三粒度） ─────────────────────────────────────────────

  /**
   * 暂停一会话。opts: { mode:'safe'|'force', reason:'stop'|'wait' }。
   * 默认 safe+wait（对齐 DEFAULT_SETTINGS）。返回 { kind, text, needConfirmation? }。
   */
  function pauseTask(sessionId, opts = {}) {
    const agent = getAgent(sessionId)
    if (agent === undefined) return { kind: 'error', text: 'no live agent for this session — nothing to pause' }
    const current = currentPause(sessionId)
    if (current.paused) return { kind: 'success', text: 'task is already paused' }
    const mode = opts.mode ?? 'safe'
    const reason = opts.reason ?? 'wait'
    const resumeContent = agent.status === 'running' ? lastUserPrompt(agent) : null

    if (mode === 'force') {
      const interruptedTool = latestInflight(sessionId)
      if (agent.status === 'running') agent.cancel({ kind: 'user' }, { keepInbox: true })
      clearInflight(sessionId)
      pauseSessionGoal(agent)
      markPaused(sessionId, resumeContent, {
        forced: true,
        interruptedTool: interruptedTool ? { name: interruptedTool.name, arguments: interruptedTool.arguments, callId: interruptedTool.callId } : null,
      })
      return {
        kind: 'success',
        text: interruptedTool !== null
          ? `task force-paused — interrupted tool ${interruptedTool.name}（预期目的：${describeToolPurpose(interruptedTool)}），可能已部分执行`
          : 'task force-paused — interrupted the running turn',
      }
    }

    // safe mode —— 延迟到安全边界
    if (agent.status === 'running' && inflightOf(sessionId).size > 0) {
      state.pendingPause.set(sessionId, { resumeContent, mode: 'safe', reason })
      return { kind: 'success', text: 'task pausing — waiting for the running tool to finish (safe boundary), trace keeps recording until then' }
    }
    if (agent.status === 'running' && reason === 'wait') {
      state.pendingPause.set(sessionId, { resumeContent, mode: 'safe', reason: 'wait' })
      return { kind: 'success', text: 'task pausing — waiting for the current reasoning to complete before pausing' }
    }
    return applyPauseNow(sessionId, resumeContent, { forced: false, interruptedTool: null })
  }

  // ── 恢复主逻辑 ───────────────────────────────────────────────────────

  /**
   * 恢复一会话（从暂停点继续，session log 即 trace，不整体重发）。
   * opts: { confirm:boolean, choice:'rerun'|'skip' }。
   */
  function resumeTask(sessionId, opts = {}) {
    const agent = getAgent(sessionId)
    if (agent === undefined) return { kind: 'error', text: 'no live agent for this session' }
    state.pendingPause.delete(sessionId)
    const current = currentPause(sessionId)
    if (!current.paused) return { kind: 'success', text: 'no paused task to resume' }
    const followup = (blocks) => agent.followup(makeFollowupMessage({ content: blocks, source: { kind: 'plugin', plugin: pluginId } }))

    if (current.forced) {
      const tool = current.interruptedTool
      if (tool !== null) {
        if (opts?.confirm !== true) {
          return { kind: 'error', needConfirmation: true, text: `需要确认：上次暂停时工具 ${describeTool(tool)} 没有执行完成，将重新执行。请选择：重新执行该工具 / 跳过该工具 / 保持暂停。` }
        }
        const outcome = findToolOutcome(agent, tool.callId)
        clearPaused(sessionId)
        if (outcome !== null && !outcome.isError) {
          followup([{ type: 'text', text: `任务已恢复。上次暂停时工具 ${describeTool(tool)} 实际已执行完成（结果见上方上下文）。请基于该结果继续执行，不要重复执行该工具。` }])
          return { kind: 'success', text: `task resumed — tool ${tool.name} had actually completed, continuing` }
        }
        if (outcome !== null && outcome.abortedBeforeDispatch) {
          if (opts?.choice === 'skip') {
            followup([{ type: 'text', text: `任务已恢复。上次暂停时工具 ${describeTool(tool)} 未及执行（无副作用），你选择跳过。请直接继续后续工作。` }])
            return { kind: 'success', text: `task resumed — skipped tool ${tool.name}` }
          }
          followup([{ type: 'text', text: `任务已恢复。上次暂停时工具 ${describeTool(tool)} 未及执行（无副作用）。请执行该工具调用，然后继续任务。` }])
          return { kind: 'success', text: `task resumed — re-executing tool ${tool.name}` }
        }
        if (opts?.choice === 'skip') {
          followup([{ type: 'text', text: `任务已恢复。上次暂停时工具 ${describeTool(tool)} 没有执行完成（可能已部分执行，状态未知）。你选择跳过该工具：请基于已有上下文继续任务，不再执行该工具。` }])
          return { kind: 'success', text: `task resumed — skipped tool ${tool.name}` }
        }
        followup([{ type: 'text', text: `任务已恢复。上次暂停时工具 ${describeTool(tool)} 没有执行完成（可能已部分执行并产生副作用，状态未知）。你选择重新执行：请先评估/清理该工具可能产生的部分副作用，再重新执行该工具调用，然后继续任务。` }])
        return { kind: 'success', text: `task resumed — re-executing interrupted tool ${tool.name}` }
      }
      clearPaused(sessionId)
      followup([{ type: 'text', text: '任务已恢复。请基于以上上下文（暂停点之前的完整执行记录）继续执行任务。' }])
      return { kind: 'success', text: 'task resumed — continuing from the latest trace' }
    }

    // safe pause
    const deferred = Array.isArray(current.deferredTools) ? current.deferredTools : []
    if (deferred.length > 0) {
      if (opts?.confirm !== true) {
        return { kind: 'error', needConfirmation: true, text: `需要确认：上次暂停发生在推理完成后、工具执行前，以下工具未及执行（无副作用）：${deferred.map(describeTool).join('、')}。请选择：重新执行 / 跳过 / 保持暂停。` }
      }
      clearPaused(sessionId)
      const rerun = deferred.filter((tool) => {
        const outcome = findToolOutcome(agent, tool.callId)
        return outcome === null || outcome.abortedBeforeDispatch === true
      })
      if (rerun.length === 0) {
        followup([{ type: 'text', text: '任务已恢复。上次暂停时待执行的工具均已实际执行完成，请基于以上结果继续执行，不要重复执行。' }])
        return { kind: 'success', text: 'task resumed — deferred tools had actually completed' }
      }
      if (opts?.choice === 'skip') {
        followup([{ type: 'text', text: `任务已恢复。上次暂停时以下工具未及执行（无副作用），你选择跳过：${rerun.map(describeTool).join('、')}。请直接继续后续工作。` }])
        return { kind: 'success', text: 'task resumed — skipped deferred tools' }
      }
      followup([{ type: 'text', text: `任务已恢复。上次暂停时以下工具未及执行（无副作用），请执行这些工具调用，然后继续任务：${rerun.map(describeTool).join('、')}。` }])
      return { kind: 'success', text: 'task resumed — re-executing deferred tools' }
    }

    clearPaused(sessionId)
    if (agent.status === 'running') {
      return { kind: 'success', text: 'task resumed — the task was still actually running; execution results keep flowing' }
    }
    followup([{ type: 'text', text: '任务已恢复。请基于以上上下文（暂停点之前的完整执行记录）从暂停点继续执行，不要重复已完成的工作。' }])
    return { kind: 'success', text: 'task resumed — continuing from the pause point' }
  }

  // ── 取消 ─────────────────────────────────────────────────────────────

  /** 立即终止当前回合，回报被中断工具的目的/副作用风险。 */
  function cancelTask(sessionId) {
    const agent = getAgent(sessionId)
    if (agent === undefined) return { kind: 'error', text: 'no live agent for this session' }
    const current = currentPause(sessionId)
    if (current.paused) clearPaused(sessionId)
    state.pendingPause.delete(sessionId)
    let interrupted = null
    if (agent.status === 'running') {
      interrupted = latestInflight(sessionId)
      agent.cancel({ kind: 'user' }, { keepInbox: true })
      clearInflight(sessionId)
    }
    if (interrupted !== null) {
      return { kind: 'success', text: `task cancelled — 已立即终止正在执行的工具 ${interrupted.name}。其预期目的：${describeToolPurpose(interrupted)}。请检查该操作是否产生了副作用（文件修改、进程、网络等）。` }
    }
    return { kind: 'success', text: 'task cancelled' }
  }

  // ── 安全边界：session/event 监听落点 ─────────────────────────────────

  function scheduleDeferredPause(sessionId, resumeContent, deferredTools) {
    queueMicrotask(() => {
      try {
        const agent = getAgent(sessionId)
        if (agent === undefined) {
          state.pendingPause.delete(sessionId)
          return
        }
        applyPauseNow(sessionId, resumeContent, { forced: false, interruptedTool: null }, deferredTools)
      } catch (e) {
        ctx?.logger?.warn?.('[session-guard] deferred pause failed: ' + String(e))
        state.pendingPause.delete(sessionId)
      }
    })
  }

  function tryApplyPending(sessionId) {
    const pending = state.pendingPause.get(sessionId)
    if (pending === undefined) return
    if (pending.mode !== 'safe') return
    if (inflightOf(sessionId).size > 0) return
    scheduleDeferredPause(sessionId, pending.resumeContent ?? null, pending.deferredTools ?? null)
  }

  /** 会话事件监听：跟踪在途工具 + 在安全边界落地延迟暂停。 */
  function handleEvent(session, event) {
    const sessionId = session?.id
    if (typeof sessionId !== 'string') return
    if (event.type === 'tool/call') {
      const info = { name: event.data?.name ?? 'tool', arguments: event.data?.arguments ?? null, callId: event.data?.callId ?? 'unknown' }
      if (typeof event.data?.callId === 'string') inflightOf(sessionId).set(event.data.callId, info)
      return
    }
    if (event.type === 'tool/result') {
      const callId = event.data?.message?.source?.callId ?? event.data?.message?.content?.[0]?.toolCallId
      if (typeof callId === 'string') inflightOf(sessionId).delete(callId)
      tryApplyPending(sessionId)
      return
    }
    if (event.type === 'assistant/message') {
      const pending = state.pendingPause.get(sessionId)
      if (pending !== undefined && pending.mode === 'safe' && pending.reason === 'wait') {
        const content = Array.isArray(event.data?.message?.content) ? event.data.message.content : []
        const calls = content.filter((block) => block?.type === 'tool-call').map((block) => ({
          name: block.name ?? 'tool',
          arguments: block.arguments ?? null,
          callId: block.id ?? 'unknown',
        }))
        if (calls.length > 0) pending.deferredTools = calls
      }
      tryApplyPending(sessionId)
      return
    }
    if (event.type === 'user/message') {
      const content = Array.isArray(event.data?.content) ? event.data.content : []
      for (const block of content) {
        if (block?.type === 'tool-result' && typeof block.toolCallId === 'string') inflightOf(sessionId).delete(block.toolCallId)
      }
      tryApplyPending(sessionId)
      return
    }
  }

  // ── 状态读取 ─────────────────────────────────────────────────────────

  function sessionState(sessionId) {
    const agent = getAgent(sessionId)
    const current = currentPause(sessionId)
    return {
      sessionId: String(sessionId),
      status: agent === undefined ? 'offline' : agent.status,
      paused: current.paused === true,
      forced: current.forced === true,
      interruptedTool: current.interruptedTool ?? null,
      deferredTools: current.deferredTools ?? null,
      resumeContent: current.resumeContent ?? null,
    }
  }

  return {
    pause: pauseTask,
    resume: resumeTask,
    cancel: cancelTask,
    state: sessionState,
    handleEvent,
    taskControlAvailable,
    /** 当前 in-flight 工具数（测试用）。 */
    _inflightCount: (id) => inflightOf(id).size,
    /** 是否挂起了延迟暂停（测试用）。 */
    _pendingCount: () => state.pendingPause.size,
  }
}

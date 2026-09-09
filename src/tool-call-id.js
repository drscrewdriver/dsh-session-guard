/**
 * dsh-session-guard — `tool/result` 调用 id 的双形态读取（**零依赖**，可单测）。
 *
 * 为什么需要它：DSH 0.1.1-rc.2 与 0.1.2-rc.1 的 `session/event` 形状一致
 * （已逐行核对 `packages/session/session-persistence/src/coordinator.ts` 的
 * `tool/result` 分支，两版本都保留两种形态），但**同一条记录有两种历史形态**：
 *
 * - 现行形态：`event.data.message.content[].toolCallId`（`tool-result` 块）；
 * - 遗留形态：`event.data.message.source.callId`（旧记录经持久化协调器迁移后的
 *   形态，两版本的回放日志里都可能出现）。
 *
 * 读取顺序：优先块上的 `toolCallId`（更精确），缺失才回退 `source.callId`。
 * **不要改成单读**——只读块会在旧记录上丢 id（in-flight 工具无法落地），
 * 只读 `source.callId` 会在新记录上丢 id（暂停点判定失效）。
 *
 * 本文件刻意不导入任何 `@deepseek-ai/*` 包，因此可在没有 DSH 运行时依赖的
 * 环境下直接单测（见 `tests/tool-call-id.test.mjs`）。
 */

/**
 * 读一条 `tool/result` 记录（`event.data.message`）的调用 id。
 * @param {unknown} message - `event.data.message`（可能缺失或非对象）
 * @returns {string|undefined} 调用 id；两种形态都缺时返回 undefined
 */
export function readToolResultCallId(message) {
  if (message === null || typeof message !== 'object') return undefined
  const content = Array.isArray(message.content) ? message.content : []
  for (const block of content) {
    if (block?.type === 'tool-result' && typeof block.toolCallId === 'string') return block.toolCallId
  }
  const legacy = message.source?.callId
  return typeof legacy === 'string' ? legacy : undefined
}

/**
 * 读一个 `user/message` 内容块（`tool-result` 形态）的调用 id。
 * @param {unknown} block - 内容块
 * @returns {string|undefined} 调用 id；非 `tool-result` 或 id 非字符串时 undefined
 */
export function readToolResultBlockId(block) {
  if (block === null || typeof block !== 'object') return undefined
  if (block.type !== 'tool-result') return undefined
  return typeof block.toolCallId === 'string' ? block.toolCallId : undefined
}

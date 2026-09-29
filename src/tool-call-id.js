/**
 * dsh-session-guard — `tool/result` 调用 id 的多形态读取（**零依赖**，可单测）。
 *
 * 形状代际（2026-09-27 v4 适配订正；engines.dsh ≥0.1.7-rc.1）：
 *
 * - **v4 native（现行，必读）**：`event.data.message` 为一等 `role:'tool'` 消息，
 *   `toolCallId` 在 message 顶层（`ToolResultMessage`，0.1.7-rc.2 dsh-llm
 *   message.d.ts 实证）。v4 解码 native-only，`type:'tool-result'` 块被宿主
 *   `assertBlock` 硬拒——**本文件的第一读取顺位**。
 * - v3 wrapper（历史兼容）：`event.data.message.content[].toolCallId`
 *   （`tool-result` 块）。未迁移的 v3 日志读侧仍可见。
 * - 遗留形态：`event.data.message.source.callId`（旧记录经持久化协调器迁移）。
 *
 * 读取顺序：native 顶层 `toolCallId` → 块上 `toolCallId` → `source.callId`。
 * **不要改成单读**——只读一层会在其它代际的记录上丢 id（in-flight 工具无法落地
 * / 暂停点判定失效）。
 *
 * 本文件刻意不导入任何 `@deepseek-ai/*` 包，因此可在没有 DSH 运行时依赖的
 * 环境下直接单测（见 `tests/tool-call-id.test.mjs`）。
 */

/**
 * 读一条 `tool/result` 记录（`event.data.message`）的调用 id。
 * @param {unknown} message - `event.data.message`（可能缺失或非对象）
 * @returns {string|undefined} 调用 id；各形态都缺时返回 undefined
 */
export function readToolResultCallId(message) {
  if (message === null || typeof message !== 'object') return undefined
  // v4 native：一等 tool-role 消息，id 在顶层。
  if (typeof message.toolCallId === 'string') return message.toolCallId
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

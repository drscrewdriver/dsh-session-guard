/**
 * dsh-session-guard — 回退冻结存储（浏览器 half，模块私有）。
 *
 * 仅在未探测到 input-traffic 最小桥时使用（D8 fail-open）：
 * 把当前会话的待发队列「脱离」到本地 store，driver 找不到待办自然停；
 * resume 按原顺序重投。语义对齐 input-traffic 的 freeze-store（不打断正在跑的回合）。
 *
 * 注意：这是回退层；若 input-traffic 已装（其最小桥在），冻结队列归 input-traffic 管，
 * 本插件只做服务端 stopNextTurn。
 */
const listeners = new Set()
let state = { frozen: false, pending: [] }

export const fallbackFreezeStore = {
  getSnapshot() {
    return state
  },
  subscribe(listener) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

function emit() {
  for (const l of listeners) l()
}

/** 冻结：保存待发文本（非文本行丢弃，与 input-traffic 一致的限制）。 */
export function setFrozen(pending) {
  state = { frozen: true, pending: pending || [] }
  emit()
}

/** 解冻并清空。 */
export function clearFrozen() {
  state = { frozen: false, pending: [] }
  emit()
}

/** 测试重置。 */
export function resetFallbackFreezeStore() {
  state = { frozen: false, pending: [] }
  emit()
}

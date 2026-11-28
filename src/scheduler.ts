/**
 * dsh-session-guard — 纯状态机（可单测，零依赖）。
 *
 * 状态：NORMAL ↔ PAUSED_PEAK。
 * 副作用（暂停/恢复具体会话）由 host 的 tick 执行，这里只做判定与迁移检测。
 */
import { shouldPause } from './time.js'
import type { TimeSettings } from './time.js'

export const STATES = {
  NORMAL: 'NORMAL',
  PAUSED_PEAK: 'PAUSED_PEAK',
} as const

/** 状态机状态值。 */
export type GuardState = typeof STATES[keyof typeof STATES]

/** 一次状态判定结果。 */
export interface StateSnapshot {
  state: GuardState
  reason: string
  at: number
}

/**
 * 计算当前状态。
 * @param {object} settings 同 time.shouldPause 的 settings
 * @param {Date|number} now
 * @returns {{state:string, reason:string, at:number}}
 */
export function computeState(settings: TimeSettings, now: Date | number): StateSnapshot {
  const date = now instanceof Date ? now : new Date(now)
  const d = shouldPause(settings, date)
  return {
    state: d.pause ? STATES.PAUSED_PEAK : STATES.NORMAL,
    reason: d.reason,
    at: date.getTime(),
  }
}

/**
 * 迁移检测：从 prev 到 next 是否发生了 入峰(enter) / 退峰(leave)。
 * @param {{state:string}|null} prev
 * @param {{state:string}} next
 * @returns {{enter:boolean, leave:boolean}}
 */
export function transition(prev: { state: GuardState } | null | undefined, next: { state: GuardState }): { enter: boolean; leave: boolean } {
  const was = prev && prev.state
  return {
    enter: next.state === STATES.PAUSED_PEAK && was !== STATES.PAUSED_PEAK,
    leave: was === STATES.PAUSED_PEAK && next.state !== STATES.PAUSED_PEAK,
  }
}

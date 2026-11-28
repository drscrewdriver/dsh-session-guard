/**
 * dsh-session-guard — 自研会话门暂停状态持久化（脱离 dsh-task-control）。
 *
 * 与 queueLock（src/store.ts，队列锁）分离：这里是「真暂停」的持久化快照，
 * 仿 task-control 的状态模型，但独立子目录 /pause 避免与队列锁文件互相污染。
 *
 * 暂停/锁定状态仍**不写 session log**（harness 持久化 reader 只有已知事件集，
 * 自定义 `session-guard/*` 事件会导致重启后会话无法加载），走插件自有 JSON 文件：
 * `$DSH_HOME/.dsh/session-guard/pause/<sessionId>.json`（`DSH_SESSION_GUARD_PAUSE_DIR`
 * 可覆盖根目录）。原子写：tmp + rename。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { storeRoot } from './store.js'

/** 被中断/延迟的工具描述（暂停点决策的输入）。 */
export interface PausedTool {
  name: string
  arguments: unknown
  callId: string
}

/**
 * 暂停资源范围四态上报 —— **单一真源在 `resource-scope.ts`**。
 * 这里 re-export 只是为了让 `PauseSnapshot` 的消费者不必多导一个模块；
 * 不要在本文件重新声明同名字段（形状漂移会让 pause-gate 的类型转换报错）。
 */
export type { PauseScopeReport } from './resource-scope.js'
import type { PauseScopeReport } from './resource-scope.js'

/**
 * 暂停快照（持久化形状）。
 *
 * `paused` 是唯一判据；`forced` 区分 force（可能已部分执行副作用）与 safe
 * （延迟工具，无副作用）。`interruptedTool` / `deferredTools` 是恢复时
 * 需要用户确认（rerun / skip）的输入。
 */
export interface PauseSnapshot {
  sessionId: string
  paused: boolean
  resumeContent: unknown
  forced: boolean
  interruptedTool: PausedTool | null
  deferredTools: PausedTool[] | null
  scope?: PauseScopeReport | null
  updatedAt: number | null
}

/** 会话 id → 安全文件名（与队列锁同规则）。 */
export function encodeSessionId(id: string): string {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, '_')
}

/** 自研暂停状态根目录（独立于队列锁）。 */
export function pauseStateRoot(): string {
  return (
    process.env.DSH_SESSION_GUARD_PAUSE_DIR ||
    join(storeRoot(), 'pause')
  )
}

/** 每会话暂停状态文件路径。 */
export function pauseFilePath(id: string): string {
  return join(pauseStateRoot(), `${encodeSessionId(id)}.json`)
}

/** 未暂停基线快照。 */
export function idlePauseState(id: string): PauseSnapshot {
  return {
    sessionId: String(id),
    paused: false,
    resumeContent: null,
    forced: false,
    interruptedTool: null,
    deferredTools: null,
    updatedAt: null,
  }
}

/** 暂停状态存储面。 */
export interface PauseStore {
  /** 读一会话暂停态；无记录返回 null（调用方 fallback idlePauseState）。 */
  get(id: string): PauseSnapshot | null
  /** 原子写。 */
  set(id: string, value: PauseSnapshot): void
  /** 清除（resume/cancel 后）。 */
  clear(id: string): void
  /** 当前有效快照（无记录时 idle 基线）。 */
  current(id: string): PauseSnapshot
}

/**
 * 创建暂停状态存储（内存缓存 + 磁盘持久化，原子写）。
 * 独立于队列锁 store，字段形态仿 task-control（paused/forced/interruptedTool/deferredTools）。
 */
export function createPauseStore(): PauseStore {
  const cache = new Map<string, PauseSnapshot>()

  function read(id: string): PauseSnapshot | null {
    const hit = cache.get(id)
    if (hit !== undefined) return hit
    try {
      const f = pauseFilePath(id)
      if (!existsSync(f)) return null
      const v = JSON.parse(readFileSync(f, 'utf8')) as PauseSnapshot
      cache.set(id, v)
      return v
    } catch {
      return null
    }
  }

  return {
    get(id: string): PauseSnapshot | null {
      return read(id)
    },
    set(id: string, value: PauseSnapshot): void {
      cache.set(id, value)
      try {
        const f = pauseFilePath(id)
        mkdirSync(dirname(f), { recursive: true })
        const tmp = `${f}.tmp`
        writeFileSync(tmp, JSON.stringify(value, null, 2))
        renameSync(tmp, f)
      } catch (e) {
        // 落盘失败仅影响重启恢复，内存态仍可用。
        console.error(`[session-guard] pause store write failed: ${String((e as Error)?.message || e)}`)
      }
    },
    clear(id: string): void {
      cache.delete(id)
      try {
        rmSync(pauseFilePath(id), { force: true })
      } catch {
        /* ignore */
      }
    },
    current(id: string): PauseSnapshot {
      const v = read(id)
      return v !== null && typeof v === 'object' ? v : idlePauseState(id)
    },
  }
}

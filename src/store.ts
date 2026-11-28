/**
 * dsh-session-guard — 每会话持久化状态存储（学 dsh-task-control 的独立存储模式，D4）。
 *
 * 暂停/锁定状态不写 session log（harness 持久化 reader 只认已知事件类型），
 * 改为插件自有 JSON 文件：`$DSH_HOME/.dsh/session-guard/<sessionId>.json`
 * （可用 DSH_SESSION_GUARD_STATE_DIR 覆盖根目录）。原子写：tmp + rename。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 队列锁状态（持久化到 `<sessionId>.json`）。 */
export interface QueueState {
  sessionId: string
  queueLocked: boolean
  lockReason: string | null
  updatedAt: number | null
}

/** 状态根目录。 */
export function storeRoot(): string {
  return (
    process.env.DSH_SESSION_GUARD_STATE_DIR ||
    join(process.env.DSH_HOME || process.env.HOME || process.cwd(), '.dsh', 'session-guard')
  )
}

/** 会话 id → 安全文件名。 */
function encodeSessionId(id: string): string {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, '_')
}

/** 每会话状态文件路径。 */
export function stateFilePath(id: string): string {
  return join(storeRoot(), `${encodeSessionId(id)}.json`)
}

/** 未锁定基线。 */
export function idleState(id: string): QueueState {
  return { sessionId: String(id), queueLocked: false, lockReason: null, updatedAt: null }
}

/** 存储面（内存缓存 + 磁盘持久化）。 */
export interface Store {
  /** 读一会话状态；无记录返回 null（调用方自行 fallback idleState）。 */
  get(id: string): QueueState | null
  /** 原子写。 */
  set(id: string, value: QueueState): void
  /** 清除（解锁时）。 */
  clear(id: string): void
}

/**
 * 创建存储（内存缓存 + 磁盘持久化）。
 */
export function createStore(): Store {
  const cache = new Map<string, QueueState>()
  return {
    get(id: string): QueueState | null {
      const hit = cache.get(id)
      if (hit !== undefined) return hit
      try {
        const f = stateFilePath(id)
        if (!existsSync(f)) return null
        const v = JSON.parse(readFileSync(f, 'utf8')) as QueueState
        cache.set(id, v)
        return v
      } catch {
        return null
      }
    },
    set(id: string, value: QueueState): void {
      cache.set(id, value)
      try {
        const f = stateFilePath(id)
        mkdirSync(dirname(f), { recursive: true })
        const tmp = `${f}.tmp`
        writeFileSync(tmp, JSON.stringify(value, null, 2))
        renameSync(tmp, f)
      } catch (e) {
        // 落盘失败仅影响重启恢复，内存态仍可用。
        console.error(`[session-guard] store write failed: ${String((e as Error)?.message || e)}`)
      }
    },
    clear(id: string): void {
      cache.delete(id)
      try {
        rmSync(stateFilePath(id), { force: true })
      } catch {
        /* ignore */
      }
    },
  }
}

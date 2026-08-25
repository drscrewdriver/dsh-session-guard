/**
 * dsh-session-guard — 自研会话门暂停状态持久化（脱离 dsh-task-control）。
 *
 * 与 queueLock（src/store.js，队列锁）分离：这里是「真暂停」的持久化快照，
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

/** 会话 id → 安全文件名（与队列锁同规则）。 */
export function encodeSessionId(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, '_')
}

/** 自研暂停状态根目录（独立于队列锁）。 */
export function pauseStateRoot() {
  return (
    process.env.DSH_SESSION_GUARD_PAUSE_DIR ||
    join(storeRoot(), 'pause')
  )
}

/** 每会话暂停状态文件路径。 */
export function pauseFilePath(id) {
  return join(pauseStateRoot(), `${encodeSessionId(id)}.json`)
}

/** 未暂停基线快照。 */
export function idlePauseState(id) {
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

/**
 * 创建暂停状态存储（内存缓存 + 磁盘持久化，原子写）。
 * 独立于队列锁 store，字段形态仿 task-control（paused/forced/interruptedTool/deferredTools）。
 */
export function createPauseStore() {
  const cache = new Map()

  function read(id) {
    if (cache.has(id)) return cache.get(id)
    try {
      const f = pauseFilePath(id)
      if (!existsSync(f)) return null
      const v = JSON.parse(readFileSync(f, 'utf8'))
      cache.set(id, v)
      return v
    } catch {
      return null
    }
  }

  return {
    /** 读一会话暂停态；无记录返回 null（调用方 fallback idlePauseState）。 */
    get(id) {
      return read(id)
    },
    /** 原子写。 */
    set(id, value) {
      cache.set(id, value)
      try {
        const f = pauseFilePath(id)
        mkdirSync(dirname(f), { recursive: true })
        const tmp = `${f}.tmp`
        writeFileSync(tmp, JSON.stringify(value, null, 2))
        renameSync(tmp, f)
      } catch (e) {
        // 落盘失败仅影响重启恢复，内存态仍可用。
        console.error(`[session-guard] pause store write failed: ${String(e && e.message || e)}`)
      }
    },
    /** 清除（resume/cancel 后）。 */
    clear(id) {
      cache.delete(id)
      try {
        rmSync(pauseFilePath(id), { force: true })
      } catch {
        /* ignore */
      }
    },
    /** 当前有效快照（无记录时 idle 基线）。 */
    current(id) {
      const v = read(id)
      return v !== null && typeof v === 'object' ? v : idlePauseState(id)
    },
  }
}

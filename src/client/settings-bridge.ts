/**
 * BridgeDocHandle — 设置卡双轨数据源的桥轨（M4/T20-b）。
 *
 * ≤0.1.5（settingsScope fiber 永不解 / 0.1.0-0.1.1 无 client 服务）时，
 * 配置卡经本句柄走自家 webServer 桥（describe/mutate）读写宿主 settings 服务。
 * 与原生 SettingsScope（scope-face.ts）同构：getSnapshot/subscribe/set/unset。
 * 读 = POST /api/<ns>/settings/describe；写 = POST …/mutate（ops 转发宿主服务），
 * 成功即用回填描述符刷新快照并通知订阅者（无本地第二份状态——权威值始终在宿主）。
 *
 * 与 perm-gate src/client/bridge-scope.ts（T13b/T20-b 泛化模板）的差异：
 * ① 快照形状对齐本仓 SettingsScope（status: loading/ready/unavailable + mode）；
 * ② describe 未就绪（settings-unavailable/ns-not-registered）时有限重试
 *    （宿主 settings 服务解析晚于卡挂载的窗口），重试耗尽才落 'unavailable'。
 */

/** 与 server 侧 settingsBridgeRoutesFor（src/settings-bridge.js）必须逐字符一致。 */
function settingsBridgeRoutesFor(ns: string): { describe: string; mutate: string } {
  return { describe: `/api/${ns}/settings/describe`, mutate: `/api/${ns}/settings/mutate` }
}

interface Snapshot<T> {
  status: 'loading' | 'ready' | 'unavailable'
  value: T | undefined
  revision: number | undefined
  writable: boolean
  base: unknown
  user: unknown
  mode: 'bridge'
}

interface Descriptor {
  value?: unknown
  revision?: number
  [k: string]: unknown
}

interface BridgeBody {
  ok?: boolean
  code?: string
  message?: string
  value?: { descriptor?: Descriptor; writable?: boolean }
}

interface MutateOp {
  op: 'set' | 'unset'
  path: string[]
  value?: unknown
}

/**
 * ≤0.1.5 宿主 describe 的 descriptor.value 是「每字段 → {}」骨架（0.1.0/0.1.5
 * 实测：value={enabled:{},…,officialProviders:{}}，真值拆在 base（合并默认层）
 * 与 user（用户层））——直接吞 value 会让卡拿到 officialProviders={}，
 * `?? []` 不兜底（{} 非 nullish）→ ListRow values.join 崩，整族 tab 槽殉葬。
 * 判特征：对象且每个自有值都是空 plain 对象（guard 字段是标量/数组，不会全空）。
 * 命中即以 {...base, ...user} 重组有效值（guard 配置全是顶层标量/数组，浅合并即语义）。
 */
function isFieldSkeleton(v: unknown): v is Record<string, Record<string, never>> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
  const values = Object.values(v as Record<string, unknown>)
  return values.length > 0
    && values.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.keys(x as object).length === 0)
}

function plainObject(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {}
}

/** descriptor → 卡面可用 plain 值：正常代际用 value；骨架代际用 base+user 浅合并。 */
function descriptorPlainValue(d: Descriptor): unknown {
  if (!isFieldSkeleton(d.value)) return d.value
  return { ...plainObject(d.base), ...plainObject(d.user) }
}

/** describe 不可就绪码：宿主 settings 未解析/未注册——值得重试的瞬态。 */
const RETRYABLE_CODES = new Set(['settings-unavailable', 'ns-not-registered'])
const RETRY_DELAY_MS = 1500
const RETRY_MAX = 4

export class BridgeDocHandle<T> {
  private snapshot: Snapshot<T>
  private listeners = new Set<() => void>()
  private revision: number | undefined
  private retriesLeft = RETRY_MAX
  private inflight: Promise<void> | undefined
  private readonly ns: string
  private readonly routes: { describe: string; mutate: string }

  constructor(ns: string) {
    this.ns = ns
    this.routes = settingsBridgeRoutesFor(ns)
    this.snapshot = {
      status: 'loading',
      value: undefined,
      revision: undefined,
      writable: true,
      base: undefined,
      user: undefined,
      mode: 'bridge',
    }
    void this.refresh()
  }

  getSnapshot(): Snapshot<T> {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async set(field: string, value: unknown): Promise<boolean> {
    return this.mutate([{ op: 'set', path: [field], value }])
  }

  async unset(field: string): Promise<boolean> {
    return this.mutate([{ op: 'unset', path: [field] }])
  }

  private notify(): void {
    for (const l of [...this.listeners]) l()
  }

  private applyDescriptor(d: Descriptor, writable: boolean): void {
    this.revision = typeof d.revision === 'number' ? d.revision : undefined
    this.snapshot = {
      status: 'ready',
      value: descriptorPlainValue(d) as T | undefined,
      revision: this.revision,
      writable,
      base: undefined,
      user: undefined,
      mode: 'bridge',
    }
  }

  private async request(path: string, body?: unknown): Promise<BridgeBody> {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    if (!response.ok) throw new Error(`bridge ${path} HTTP ${response.status}`)
    return (await response.json()) as BridgeBody
  }

  /** describe 拉取；瞬态未就绪码在重试预算内延迟重拉，耗尽才落 unavailable。 */
  refresh(): Promise<void> {
    if (this.inflight !== undefined) return this.inflight
    this.inflight = (async () => {
      try {
        const body = await this.request(this.routes.describe)
        if (body.ok && body.value?.descriptor !== undefined) {
          this.retriesLeft = RETRY_MAX
          this.applyDescriptor(body.value.descriptor, body.value.writable !== false)
        } else if (body.code !== undefined && RETRYABLE_CODES.has(body.code) && this.retriesLeft > 0) {
          this.retriesLeft -= 1
          this.inflight = undefined
          setTimeout(() => {
            void this.refresh()
          }, RETRY_DELAY_MS)
          return
        } else {
          this.snapshot = { ...this.snapshot, status: 'unavailable', writable: false }
        }
      } catch {
        // 网络异常：按瞬态处理，预算内重试
        if (this.retriesLeft > 0) {
          this.retriesLeft -= 1
          this.inflight = undefined
          setTimeout(() => {
            void this.refresh()
          }, RETRY_DELAY_MS)
          return
        }
        this.snapshot = { ...this.snapshot, status: 'unavailable', writable: false }
      }
      // 重试路径已在上面清过 inflight（setTimeout 后由 refresh() 重建）；
      // 终态路径在此清挂起标记并广播。重试等待期 notify 无害（快照未变）。
      this.inflight = undefined
      this.notify()
    })()
    return this.inflight
  }

  private async mutate(ops: MutateOp[]): Promise<boolean> {
    const body = await this.request(this.routes.mutate, { ops, expectedRevision: this.revision })
    if (body.ok && body.value?.descriptor !== undefined) {
      this.applyDescriptor(body.value.descriptor, this.snapshot.writable)
      this.notify()
      return true
    }
    if (body.code === 'settings-conflict') {
      await this.refresh() // 乐观并发失败：拉权威值，让下次写入带新 revision
      return false
    }
    throw new Error(`bridge mutate failed: ${body.code ?? 'unknown'} ${body.message ?? ''}`)
  }
}

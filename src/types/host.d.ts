/**
 * 宿主 ctx / 服务的**最小**类型声明（`src/types/host.d.ts`）。
 *
 * 口径（findings.md）：不为 `@deepseek-ai/*` 新增运行时依赖，也不引入
 * `@deepseek-ai/dsh-host` 之类只为类型的包（离线依赖树里没有它们，装了也装不上）。
 * 本文件只声明本插件**实际鸭子探测**到的形状，探测语义不变：
 *
 * - `ctx.get(name)` 永不 throw（cordis 语义），缺服务返回 `undefined`；
 * - 所有可选方法都可能缺席（跨 0.1.0-rc.2 … 0.2.2-rc.5 十余条宿主线）；
 * - 因此本文件里的成员一律 `?`，调用侧仍按 fail-open 判空。
 *
 * 只覆盖用到的面：ctx / agents / agent / session / goals / jobs / subagents /
 * webServer / timer / settings / commands / logger。
 */

/** 会话事件（`session/event` 的第二参）；形状按代际变化，这里只给公共外壳。 */
export interface SessionEvent {
  type?: string
  data?: {
    message?: unknown
    content?: unknown
    [k: string]: unknown
  }
  [k: string]: unknown
}

/** 会话（`agent.session`）。`events` 数组访问器在 0.1.5 被移除，改用 snapshotEvents()。 */
export interface HostSession {
  append?(type: string, payload: unknown, opts?: Record<string, unknown>): void
  snapshotEvents?(): unknown[]
  /** @deprecated 0.1.5 起移除；仅作防御性回退读取。 */
  events?: unknown[]
  [k: string]: unknown
}

/** 代理（一个会话的驱动器）。 */
export interface HostAgent {
  id: string
  status?: string
  session?: HostSession
  cancel?(opts: { kind: string }, extra?: { keepInbox?: boolean }): void
  followup?(message: unknown): void
  send?(message: unknown): void
  [k: string]: unknown
}

/** 后台任务服务（`ctx.get('jobs')`）。 */
export interface HostJobsService {
  list?(): unknown[]
  stop?(id: string): unknown
  [k: string]: unknown
}

/** 子代理服务（`ctx.get('subagents')`）。 */
export interface HostSubagentsService {
  list?(): unknown[]
  interrupt?(id: string): unknown
  [k: string]: unknown
}

/** 目标服务（`ctx.get('goals')`）。 */
export interface HostGoalsService {
  get?(agent: HostAgent): { phase?: string; id?: string; revision?: number } | undefined
  pause?(agent: HostAgent, opts: { id?: string; revision?: number }): void
  [k: string]: unknown
}

/** 会话门服务（`ctx.get('taskControl')`，历史兼容探测）。 */
export interface HostTaskControlService {
  state?(sessionId: string): { status?: string; paused?: boolean; forced?: boolean } | undefined
  [k: string]: unknown
}

/** 命令注册面（`ctx.commands`）。 */
export interface HostCommandInvocation {
  agent?: { id?: string }
  rawInput?: string
  [k: string]: unknown
}

/** 命令 handler 的返回形状（宿主只认 kind + text）。 */
export interface HostCommandResult {
  kind: 'success' | 'error'
  text: string
  [k: string]: unknown
}

export interface HostCommandsService {
  register(def: {
    name: string
    description?: string
    input?: { hint?: string }
    handler: (invocation: HostCommandInvocation) => HostCommandResult | Promise<HostCommandResult>
  }): () => void
}

/** webServer 路由面（0.1.5+ 契约不变）。 */
export interface HostWebRoute {
  kind?: 'prefix' | 'exact'
  path: string
  handler: (req: unknown, res: unknown) => unknown
}

export interface HostWebServer {
  register(route: HostWebRoute): () => void
  [k: string]: unknown
}

/** timer 服务（`ctx.timer.interval`）。 */
export interface HostTimer {
  interval(fn: () => void, ms: number): { unref?(): void } | (() => void)
  [k: string]: unknown
}

/** logger（全部可选；宿主缺字段时不崩）。 */
export interface HostLogger {
  info?(msg: string): void
  warn?(msg: string): void
  error?(msg: string): void
  debug?(msg: string): void
}

/**
 * 宿主 ctx。字段全部可选：老宿主线可能没有 webServer / timer / commands，
 * 本插件的每个使用点都自带存在性判断（fail-open）。
 */
export interface HostCtx {
  get?(name: string): unknown
  on?(event: string, fn: (session: HostSession, event: SessionEvent) => void): () => void
  effect?(fn: () => (() => void) | void, label?: string): void
  inject?(deps: string[], fn: (ctx: HostCtx) => void): void
  provide?(name: string, value: unknown): void
  agents?: {
    get?(id: string): HostAgent | undefined
    roots?(): HostAgent[]
    list?(): HostAgent[]
  }
  goals?: HostGoalsService
  webServer?: HostWebServer
  timer?: HostTimer
  commands?: HostCommandsService
  settings?: unknown
  logger?: HostLogger
  [k: string]: unknown
}

/** 暂停资源范围收集用到的服务集合（`getScope()` 返回）。 */
export interface HostScopeServices {
  jobsSvc?: HostJobsService
  subagentsSvc?: HostSubagentsService
  cfg: unknown
  /** 可注入的 sleep（测试用）。 */
  sleep?(ms: number): Promise<void>
}

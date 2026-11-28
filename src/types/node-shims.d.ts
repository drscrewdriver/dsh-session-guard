/**
 * 本地 Node 内置模块最小声明（`src/types/node-shims.d.ts`）。
 *
 * **为什么不用 `@types/node`**：本仓的依赖树是离线安装的（pnpm 内容寻址存储里
 * 只有运行期真正用到的包），`@types/node` 不在其中，而 `npm install` 在无网
 * 环境会静默失败——引入一个装不上的 devDependency 会让 `pnpm install --frozen-lockfile`
 * 在 CI 上假绿、本地直接红。本文件只声明本插件**实际用到**的那一小片 Node API，
 * 形状与 Node 22 一致，够 strict 检查用，且零依赖。
 *
 * 口径（与 findings.md「不为 @deepseek-ai/* 新增运行时依赖」一致）：
 * 宿主侧不为类型引入任何新包；`src/types/host.d.ts` 声明 ctx 形状，本文件声明
 * 标准库形状。两者都只覆盖用到的面，不做完整 SDK 复刻。
 */

declare module 'node:fs' {
  /** 同步读取文件（本插件只做小 JSON 读写，不碰流）。 */
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function readFileSync(path: string): Uint8Array
  export function writeFileSync(path: string, data: string): void
  export function writeFileSync(path: string, data: Uint8Array): void
  export function existsSync(path: string): boolean
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void
  export function renameSync(from: string, to: string): void
  export function rmSync(path: string, opts?: { recursive?: boolean; force?: boolean }): void
}

declare module 'node:path' {
  export function join(...parts: string[]): string
  export function dirname(path: string): string
  export function resolve(...parts: string[]): string
  export function basename(path: string, ext?: string): string
}

declare module 'node:crypto' {
  /** 只用到默认 digest 的 createHash（sha256 指纹）。 */
  interface Hash {
    update(data: string): Hash
    digest(encoding: 'hex'): string
  }
  export function createHash(algorithm: string): Hash
}

declare module 'node:os' {
  interface NetworkInterfaceInfo {
    family: string
    internal: boolean
    address: string
  }
  export function networkInterfaces(): Record<string, NetworkInterfaceInfo[] | undefined>
}

declare module 'node:dns' {
  /**
   * 只用到 lookup（离线判定）。两种调用形态都要认：
   * `lookup(host, cb)` 与 `lookup(host, { all:false }, cb)`；返回值在部分实现上是
   * promise（`dns.promises` 同签名），故声明为 `unknown`，调用侧按 thenable 判。
   */
  export function lookup(
    hostname: string,
    optsOrCb: { all?: boolean } | ((err: Error | null, address?: string, family?: number) => void),
    cb?: (err: Error | null, address?: string, family?: number) => void,
  ): unknown
}

/** `Buffer` 全局（本插件只用 concat/from/isBuffer/toString）。 */
declare const Buffer: {
  concat(chunks: Uint8Array[]): { toString(encoding: 'utf8'): string }
  from(chunk: string | Uint8Array): { toString(encoding: 'utf8'): string }
  isBuffer(value: unknown): boolean
}

/** `process.env` 全局（宿主注入环境变量；本插件只读）。 */
declare const process: {
  env: Record<string, string | undefined>
  cwd(): string
}

/** `AbortSignal.timeout(ms)`（Node 17.3+ / 浏览器均提供；本插件只做 fetch 超时）。 */
declare const AbortSignal: {
  timeout(ms: number): unknown
}

/** 定时器全局（Node 提供；返回句柄按 unknown 收，clearTimeout 只要求可传入）。 */
declare function setTimeout(fn: () => void, ms: number): unknown
declare function clearTimeout(handle: unknown): void
declare function setInterval(fn: () => void, ms: number): unknown
declare function clearInterval(handle: unknown): void
/** `queueMicrotask`（暂停落地用：跳出当前事件派发，避免 resume→followup→事件 重入）。 */
declare function queueMicrotask(fn: () => void): void

/** `console` 全局（宿主日志兜底；与 eslint 的 readonly 声明一致）。 */
declare const console: {
  log(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  info(...args: unknown[]): void
  debug(...args: unknown[]): void
}

/** `globalThis.fetch` 在 Node 18+ 存在；本插件只透传它做 holiday 抓取。 */
interface FetchResponse {
  ok: boolean
  status: number
  text(): Promise<string>
  json(): Promise<unknown>
}
declare function fetch(input: string, init?: { signal?: unknown; headers?: Record<string, string> }): Promise<FetchResponse>

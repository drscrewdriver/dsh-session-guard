/**
 * 0.1.7-rc.2 停止从 `@deepseek-ai/dsh-client-ui-settings/client` 导出
 * `SettingsScope`；卡片消费的结构化面移到此处，字段逐一镜像
 * `configForms.get(entryId)` 返回的 ConfigForm。
 *
 * `mode` 含 `'bridge'`（v4.7.0）：≤0.1.5 线没有 settingsScope 服务，数据源是
 * `BridgeDocHandle`（走自家 webServer describe/mutate 桥），其快照 `mode` 就是
 * `'bridge'`。两个句柄在本插件里同构消费（getSnapshot/subscribe/set/unset），
 * 类型面必须承认第三态，否则 `currentScope()` 的桥兜底分支无法赋值。
 */
export interface SettingsScope<T> {
  getSnapshot(): {
    status: 'loading' | 'ready' | 'unavailable'
    value: T | undefined
    revision: number | undefined
    writable: boolean
    base: unknown
    user: unknown
    mode: 'host' | 'memory' | 'bridge'
  }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<boolean>
  unset(field: string): Promise<boolean>
  mutate?(ops: readonly { path: readonly string[]; op: string; value?: unknown }[]): Promise<boolean>
}

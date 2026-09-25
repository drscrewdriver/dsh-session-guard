/**
 * 0.1.7-rc.2 停止从 `@deepseek-ai/dsh-client-ui-settings/client` 导出
 * `SettingsScope`；卡片消费的结构化面移到此处，字段逐一镜像
 * `configForms.get(entryId)` 返回的 ConfigForm。
 */
export interface SettingsScope<T> {
  getSnapshot(): {
    status: 'loading' | 'ready' | 'unavailable'
    value: T | undefined
    revision: number | undefined
    writable: boolean
    base: unknown
    user: unknown
    mode: 'host' | 'memory'
  }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<boolean>
  unset(field: string): Promise<boolean>
  mutate?(ops: readonly { path: readonly string[]; op: string; value?: unknown }[]): Promise<boolean>
}

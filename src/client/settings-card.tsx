/**
 * dsh-session-guard — 插件配置卡片（settings.plugin.item 面）。
 *
 * 对齐 dsh-thinking-levels / dsh-context 的设置面板机制：
 * 通过 `settingsScope.bind({ namespace: NS })` 绑定 host 已注册的
 * `session-guard` 命名空间，渲染 高峰自动处理 / 周末模式 等简单开关。
 * 每次变更立即经 scope 提交（无 staged form），host 的 readCfg 每次读取即生效。
 *
 * 仅依赖 react；scope 用 useSyncExternalStore 订阅，控件为原生 HTML，
 * 客户端 bundle 无需 CSS 模块、无需 value-import 任何 @deepseek-ai/* 平台包
 * （类型导入被构建擦除，运行态只经 cordis 服务协作）。
 */
import { useSyncExternalStore } from 'react'
import type { CSSProperties, JSX } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'

/** host 侧 src/settings.js 注册的命名空间（保持一致）。 */
/** 命名空间值形状（与 host 的 DEFAULT_SETTINGS 对应）。 */
export interface SessionGuardConfig {
  enabled: boolean
  weekendMode: boolean
  resumeOnWeekend: boolean
  queueFallback: boolean
  retryEnabled: boolean
  timezone: string
  pauseMode: 'safe' | 'force'
  pauseReason: 'wait' | 'stop'
}

/** 注入给卡片的面：绑定到 session-guard 命名空间的 settings scope。 */
export interface SettingsCardInjected {
  scope: SettingsScope<SessionGuardConfig>
}

export type SettingsCardProps = SettingsCardInjected

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '6px 0',
  fontSize: '13px',
  lineHeight: '20px',
}

const labelStyle: CSSProperties = { margin: 0, color: 'var(--dsw-alias-label-primary)' }

/** 一个布尔开关行，绑定 scope。 */
function ToggleRow(props: {
  id: string
  label: string
  hint?: string
  checked: boolean
  disabled: boolean
  onChange: (_next: boolean) => void
}): JSX.Element {
  const { id, label, hint, checked, disabled, onChange } = props
  return (
    <div style={rowStyle}>
      <label htmlFor={id} style={labelStyle}>
        {label}
        {hint ? <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }}>{hint}</span> : null}
      </label>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </div>
  )
}

/** 插件配置卡片主体。 */
export function SessionGuardCard({ scope }: SettingsCardProps): JSX.Element {
  const snapshot = useSyncExternalStore(
    (listener) => scope.subscribe(listener),
    () => scope.getSnapshot(),
  )
  const unavailable = snapshot.status === 'unavailable'
  const readonly = unavailable || !snapshot.writable
  const value = (snapshot.value ?? {}) as Partial<SessionGuardConfig>

  if (unavailable) {
    return (
      <div style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)' }}>
        设置命名空间不可用：请确认 dsh-session-guard 已装配进此 profile。
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      <ToggleRow
        id="plugin-config-session-guard-enabled"
        label="高峰自动处理"
        hint="高峰时段自动暂停运行会话"
        checked={value.enabled ?? true}
        disabled={readonly}
        onChange={(next) => { void scope.set('enabled', next) }}
      />
      <ToggleRow
        id="plugin-config-session-guard-weekend"
        label="周末模式"
        hint="识别周末，无视峰谷畅快跑"
        checked={value.weekendMode ?? true}
        disabled={readonly}
        onChange={(next) => { void scope.set('weekendMode', next) }}
      />
      <ToggleRow
        id="plugin-config-session-guard-resume-weekend"
        label="周末自动恢复"
        hint="周末到了自动恢复运行"
        checked={value.resumeOnWeekend ?? true}
        disabled={readonly}
        onChange={(next) => { void scope.set('resumeOnWeekend', next) }}
      />
      <ToggleRow
        id="plugin-config-session-guard-queue-fallback"
        label="回退锁队列"
        hint="无会话门时锁等待队列"
        checked={value.queueFallback ?? true}
        disabled={readonly}
        onChange={(next) => { void scope.set('queueFallback', next) }}
      />
      <ToggleRow
        id="plugin-config-session-guard-retry"
        label="自动重试"
        hint="后端重试，默认关（保守）"
        checked={value.retryEnabled ?? false}
        disabled={readonly}
        onChange={(next) => { void scope.set('retryEnabled', next) }}
      />
      {!snapshot.writable && (
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }}>
          当前只读，无法修改。
        </p>
      )}
    </div>
  )
}

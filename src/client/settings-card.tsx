/**
 * dsh-session-guard — 插件配置卡片（settings.plugin.item 面）。
 *
 * 对齐 dsh-thinking-levels / dsh-tidychat 的卡片语法：一个可展开的 `<li>`，
 * header 按钮（插件名 + 描述 + chevron）切换字段体；开关为 pill switch
 * （track + thumb），不是复选框对勾。
 *
 * 通过 `settingsScope.bind({ namespace: NS })` 绑定 host 已注册的
 * `session-guard` 命名空间；每次变更立即经 scope 提交（无 staged form）。
 * 仅依赖 react；CSS 经 `<style data-plugin-css>` 注入一次，控件为原生 HTML，
 * 客户端 bundle 无 value-import @deepseek-ai/* 平台包（类型导入被构建擦除）。
 */
import { useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'

/** 命名空间值形状（与 host 的 DEFAULT_SETTINGS 对应）。 */
export interface SessionGuardConfig {
  enabled: boolean
  weekendMode: boolean
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

/** 卡片样式，注入一次（保持 bundle CSS-free）。 */
const CARD_CSS = `
.sgCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}
.sgCard:hover{border-color:var(--dsw-alias-label-dimmed)}
.sgCard-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.sgCardHeader{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:transparent;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.sgCardHeadtext{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.sgCardName{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.sgCardDesc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.sgCardChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.sgCardChevron-open{transform:rotate(180deg)}
.sgCardBody{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:4px 0 12px}
.sgRow{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}
.sgRow:last-child{border-bottom:0}
.sgRowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}
.sgTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.sgDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}
.sgSwitch{position:relative;width:40px;height:22px;flex:none}
.sgSwitch>input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer}
.sgSwitch>input:disabled{cursor:not-allowed}
.sgSwitchTrack{position:absolute;inset:0;border-radius:22px;background:var(--dsw-alias-interactive-bg-hover);transition:background .16s}
.sgSwitch>input:checked+.sgSwitchTrack{background:var(--dsw-alias-button-primary-fill)}
.sgSwitchThumb{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--dsw-alias-bg-base);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .16s}
.sgSwitch>input:checked~.sgSwitchThumb{transform:translateX(18px)}
.sgReadonly{color:var(--dsw-alias-label-tertiary);font-size:12px;margin:8px 0 0}
`

/** 注入一次卡片样式。 */
function injectCss(): void {
  if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="session-guard-card"]') === null) {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-session-guard'
    tag.dataset.pluginCss = 'session-guard-card'
    tag.textContent = CARD_CSS
    document.head.appendChild(tag)
  }
}

/** 一行 pill switch（滑块开关，绑定 scope）。 */
function SwitchRow(props: {
  label: string
  description?: string
  checked: boolean
  disabled: boolean
  onChange: (_next: boolean) => void
}): JSX.Element {
  const { label, description, checked, disabled, onChange } = props
  return (
    <div className="sgRow">
      <div className="sgRowText">
        <div className="sgTitle">{label}</div>
        {description !== undefined && <div className="sgDesc">{description}</div>}
      </div>
      <label className="sgSwitch">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
        <span className="sgSwitchTrack" />
        <span className="sgSwitchThumb" />
      </label>
    </div>
  )
}

/** 插件配置卡片主体：可展开的 <li> + header 按钮 + pill switch 字段体。 */
export function SessionGuardCard({ scope }: SettingsCardProps): JSX.Element {
  const snapshot = useSyncExternalStore(
    (listener) => scope.subscribe(listener),
    () => scope.getSnapshot(),
  )
  const unavailable = snapshot.status === 'unavailable'
  const readonly = unavailable || !snapshot.writable
  const value = (snapshot.value ?? {}) as Partial<SessionGuardConfig>
  const [open, setOpen] = useState(false)

  injectCss()

  const toggle = (field: keyof SessionGuardConfig, next: boolean) => { void scope.set(field, next) }

  return (
    <li className={'sgCard' + (open ? ' sgCard-open' : '')}>
      <button
        type="button"
        className="sgCardHeader"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="sgCardHeadtext">
          <span className="sgCardName">会话守护门禁</span>
          <span className="sgCardDesc">高峰自动暂停运行会话，周末模式无视峰谷畅快跑</span>
        </span>
        <svg
          className={'sgCardChevron' + (open ? ' sgCardChevron-open' : '')}
          viewBox="0 0 14 14"
          width={14}
          height={14}
          fill="none"
          aria-hidden="true"
        >
          <path d="M3.5 5.5L7 9l3.5-3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="sgCardBody">
          {unavailable ? (
            <p style={{ margin: '0', padding: '12px 0', fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)' }}>
              设置命名空间不可用：请确认 dsh-session-guard 已装配进此 profile。
            </p>
          ) : (
            <>
              <SwitchRow
                label="高峰自动处理"
                description="高峰时段自动暂停运行会话"
                checked={value.enabled ?? true}
                disabled={readonly}
                onChange={(next) => toggle('enabled', next)}
              />
              <SwitchRow
                label="周末模式"
                description="识别周末，无视峰谷畅快跑"
                checked={value.weekendMode ?? true}
                disabled={readonly}
                onChange={(next) => toggle('weekendMode', next)}
              />
              <SwitchRow
                label="回退锁队列"
                description="无会话门时锁等待队列"
                checked={value.queueFallback ?? true}
                disabled={readonly}
                onChange={(next) => toggle('queueFallback', next)}
              />
              <SwitchRow
                label="自动重试"
                description="后端重试，默认关（保守）"
                checked={value.retryEnabled ?? false}
                disabled={readonly}
                onChange={(next) => toggle('retryEnabled', next)}
              />
              {!snapshot.writable && <p className="sgReadonly">当前只读，无法修改。</p>}
            </>
          )}
        </div>
      )}
    </li>
  )
}

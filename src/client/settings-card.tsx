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
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'

/** 命名空间值形状（与 host 的 DEFAULT_SETTINGS 对应）。 */
export interface SessionGuardConfig {
  enabled: boolean
  offPeakAutoResume: boolean
  weekendMode: boolean
  queueFallback: boolean
  retryEnabled: boolean
  timezone: string
  pauseMode: 'safe' | 'force'
  pauseReason: 'wait' | 'stop'
  // ── step 级门控（v0.2.0）──
  stepLevelPause: boolean
  stepGateTimeoutMs: number
  // ── 官方 provider 二维判定（高峰 × 目标源）──
  providerGuard: boolean
  officialProviders: string[]
  officialBaseURLs: string[]
  deferredResume: boolean
  deferredResumeText: string
  deferredMode: 'hold' | 'error'
  deferredMaxHoldMs: number
  guardSubagents: boolean
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
.sgRowText-wide{padding-right:0}
.sgTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.sgDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}
.sgSwitch{position:relative;width:40px;height:22px;flex:none}
.sgSwitch>input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer}
.sgSwitch>input:disabled{cursor:not-allowed}
.sgSwitchTrack{position:absolute;inset:0;border-radius:22px;background:var(--dsw-alias-interactive-bg-hover);transition:background .16s}
.sgSwitch>input:checked+.sgSwitchTrack{background:var(--dsw-alias-button-primary-fill)}
.sgSwitchThumb{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .16s}
.sgSwitch>input:checked~.sgSwitchThumb{transform:translateX(18px)}
.sgInput{appearance:none;min-width:0;width:100%;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;margin-top:8px}
.sgInput:disabled{opacity:.6;cursor:not-allowed}
.sgSelect{appearance:none;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;min-width:160px;flex:none}
.sgSelect:disabled{opacity:.6;cursor:not-allowed}
.sgHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:6px 0 0}
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

/** 一行文本输入（失焦提交；外部值变化时同步草稿）。 */
function TextRow(props: {
  label: string
  description?: string
  value: string
  placeholder?: string
  disabled: boolean
  onCommit: (_next: string) => void
}): JSX.Element {
  const { label, description, value, placeholder, disabled, onCommit } = props
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])
  return (
    <div className="sgRow">
      <div className="sgRowText sgRowText-wide">
        <div className="sgTitle">{label}</div>
        {description !== undefined && <div className="sgDesc">{description}</div>}
        <input
          className="sgInput"
          type="text"
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={() => onCommit(draft)}
        />
      </div>
    </div>
  )
}

/** 一行「逗号/换行分隔」的字符串列表（失焦提交为数组）。 */
function ListRow(props: {
  label: string
  description?: string
  values: string[]
  placeholder?: string
  disabled: boolean
  onCommit: (_next: string[]) => void
}): JSX.Element {
  const { label, description, values, placeholder, disabled, onCommit } = props
  const joined = values.join(', ')
  const [draft, setDraft] = useState(joined)
  useEffect(() => {
    setDraft(joined)
  }, [joined])
  return (
    <div className="sgRow">
      <div className="sgRowText sgRowText-wide">
        <div className="sgTitle">{label}</div>
        {description !== undefined && <div className="sgDesc">{description}</div>}
        <input
          className="sgInput"
          type="text"
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={() => {
            const next = draft
              .split(/[,\n]/)
              .map((s) => s.trim())
              .filter((s) => s !== '')
            onCommit(next)
          }}
        />
      </div>
    </div>
  )
}

/** 一行下拉选择。 */
function SelectRow<T extends string>(props: {
  label: string
  description?: string
  value: T
  options: readonly { value: T; label: string }[]
  disabled: boolean
  onChange: (_next: T) => void
}): JSX.Element {
  const { label, description, value, options, disabled, onChange } = props
  return (
    <div className="sgRow">
      <div className="sgRowText">
        <div className="sgTitle">{label}</div>
        {description !== undefined && <div className="sgDesc">{description}</div>}
      </div>
      <select
        className="sgSelect"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
                label="高峰自动暂停冻结会话"
                description="高峰时段自动暂停运行会话"
                checked={value.enabled ?? true}
                disabled={readonly}
                onChange={(next) => toggle('enabled', next)}
              />
              <SwitchRow
                label="step 级门控"
                description="高峰在下一个 step 的模型请求前拉门（省 token 更彻底）；关闭则回退为回合级暂停"
                checked={value.stepLevelPause ?? true}
                disabled={readonly}
                onChange={(next) => toggle('stepLevelPause', next)}
              />
              <TextRow
                label="step 门控超时（毫秒）"
                description="到期释放 step 门并升级为回合级暂停（防死锁）；0 或非法值用默认 300000"
                value={String(value.stepGateTimeoutMs ?? 300000)}
                placeholder="300000"
                disabled={readonly}
                onCommit={(next) => {
                  const n = Number(String(next).trim())
                  void scope.set('stepGateTimeoutMs', Number.isFinite(n) && n > 0 ? n : 300000)
                }}
              />
              <SwitchRow
                label="官方源二维判定"
                description="高峰期只拦 DeepSeek 官方源；本地/第三方 provider 照常跑"
                checked={value.providerGuard ?? true}
                disabled={readonly}
                onChange={(next) => toggle('providerGuard', next)}
              />
              <ListRow
                label="追加官方 provider id"
                description="精确匹配，优先级最高（逗号分隔）"
                values={value.officialProviders ?? []}
                placeholder="deepseek-official"
                disabled={readonly}
                onCommit={(next) => { void scope.set('officialProviders', next) }}
              />
              <ListRow
                label="官方端点名单"
                description="baseURL 归一化后的 host（逗号分隔）"
                values={value.officialBaseURLs ?? []}
                placeholder="api.deepseek.com"
                disabled={readonly}
                onCommit={(next) => { void scope.set('officialBaseURLs', next) }}
              />
              <SelectRow<'hold' | 'error'>
                label="拦截方式"
                description="挂起等待不报错；或报错并记入延后队列"
                value={value.deferredMode ?? 'hold'}
                options={[
                  { value: 'hold', label: '挂起等待（退峰自动放行）' },
                  { value: 'error', label: '报错并延后（退峰续跑）' },
                ]}
                disabled={readonly}
                onChange={(next) => { void scope.set('deferredMode', next) }}
              />
              <SwitchRow
                label="退峰自动继续"
                description="关闭后延后的请求/会话不自动续跑，需手动 /resume"
                checked={value.deferredResume ?? true}
                disabled={readonly}
                onChange={(next) => toggle('deferredResume', next)}
              />
              <TextRow
                label="退峰续跑文案"
                description="error 模式退峰时发送的消息内容"
                value={value.deferredResumeText ?? ''}
                placeholder="继续（高峰已过，自动继续）"
                disabled={readonly}
                onCommit={(next) => { void scope.set('deferredResumeText', next) }}
              />
              <SwitchRow
                label="纳入子代理请求"
                description="子代理请求同样计费，默认一并拦截"
                checked={value.guardSubagents ?? true}
                disabled={readonly}
                onChange={(next) => toggle('guardSubagents', next)}
              />
              <SwitchRow
                label="低谷自动恢复"
                description="低峰时段自动恢复被暂停的会话"
                checked={value.offPeakAutoResume ?? true}
                disabled={readonly}
                onChange={(next) => toggle('offPeakAutoResume', next)}
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
              <p className="sgHint">
                判定口径：显式 id 名单 → baseURL 端点 → catalog 默认端点 → 内置 id。
                排查误判访问 /session-guard/provider?provider=&lt;id&gt; 看 matchedBy。
              </p>
              {!snapshot.writable && <p className="sgReadonly">当前只读，无法修改。</p>}
            </>
          )}
        </div>
      )}
    </li>
  )
}

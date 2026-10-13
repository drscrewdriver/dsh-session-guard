/**
 * dsh-session-guard — 「高峰拦截列表」模型勾选面板（设置卡片 与 状态徽标 共用）。
 *
 * 挂载即拉取：父组件只在**展开时**挂载本面板，于是「展开区域自动获取当前模型列表」
 * 不需要额外的开关。数据来自 `GET /session-guard/models`（各路由自报的模型 + 本插件
 * 观察到的真实目标），全链路 fail-open（失败只显示提示，不影响任何会话）。
 *
 * 勾选动作与行状态都在 `model-list.ts`（纯函数、可单测）；面板只负责渲染与提交，
 * **判定与存储逻辑不变**：提交的是同一份 `officialModelPatterns` 设置项。
 */
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { rowHint, rowState, toggleModel } from './model-list'

/** `GET /session-guard/models` 的一行。 */
export interface CatalogModel {
  provider: string
  model: string
  source?: string
}

export interface ModelListPanelProps {
  /** 当前列表（关键字 / 正则源码）。 */
  patterns: readonly string[]
  /** 只读（无 settingsScope 或快照不可写）。 */
  disabled?: boolean
  /** 提交新列表。 */
  onCommit: (_next: string[]) => void
}

export function ModelListPanel({ patterns, disabled = false, onCommit }: ModelListPanelProps): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [models, setModels] = useState<readonly CatalogModel[]>([])
  const [error, setError] = useState<string | null>(null)
  /** 正在写入的行：写入是异步往返，期间禁用该行，避免连点把两次变更叠在同一份旧列表上。 */
  const [pending, setPending] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/session-guard/models')
      const body = (await res.json().catch(() => null)) as { ok?: boolean; models?: CatalogModel[] } | null
      if (body?.ok && Array.isArray(body.models)) setModels(body.models)
      else setError('模型列表不可用')
    } catch {
      setError('模型列表不可用')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 只在挂载（= 展开）时拉一次；「刷新」按钮负责后续更新。
    void load()
  }, [])

  // 父层的列表变了（写入生效）→ 解除 pending。
  useEffect(() => {
    setPending('')
  }, [patterns])

  const rows = models.map((m) => ({ ...m, state: rowState(m.model, patterns) }))
  const covered = rows.filter((r) => r.state.covered).length
  const providers = [...new Set(rows.map((r) => r.provider))].sort()

  return (
    <div className="sgMlBody">
      <div className="sgMlPatterns">
        <span className="sgMlSentinel">关键字</span>
        {patterns.length === 0 ? (
          <span className="sgMlSentinel">（空：不按模型名判定）</span>
        ) : (
          patterns.map((p) => (
            <span key={p} className="sgMlChip">
              {p}
            </span>
          ))
        )}
        <button type="button" className="sgMlRefresh" disabled={loading} onClick={() => void load()} title="重新获取模型列表">
          {loading ? '获取中…' : '刷新'}
        </button>
      </div>
      {error !== null && <p className="sgMlHint">{error}（可稍后刷新重试）</p>}
      {error === null && !loading && rows.length === 0 && <p className="sgMlHint">没有可枚举的模型。</p>}
      {rows.length > 0 && (
        <ul className="sgMlList">
          {providers.map((provider) => (
            <li key={provider}>
              <div className="sgMlProvider">{provider}</div>
              <ul className="sgMlList">
                {rows
                  .filter((r) => r.provider === provider)
                  .map((r) => {
                    const locked = r.state.covered && !r.state.explicit
                    const hint = rowHint(r.state)
                    return (
                      <li key={`${provider}/${r.model}`} className="sgMlItem">
                        <label className="sgMlCheck" title={locked ? hint : '加入 / 移出高峰拦截列表'}>
                          <input
                            type="checkbox"
                            checked={r.state.covered}
                            disabled={disabled || locked || pending === r.model}
                            onChange={() => {
                              setPending(r.model)
                              onCommit(toggleModel(patterns, r.model))
                            }}
                          />
                          <span className="sgMlModel">{r.model}</span>
                          {hint !== '' && <span className="sgMlTag">{hint}</span>}
                        </label>
                      </li>
                    )
                  })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <p className="sgMlHint">
        勾选 = 该模型名加入列表（高峰一律拦）；默认关键字 deepseek 会把名字带 deepseek 的模型全部算进来
        {rows.length > 0 ? `（当前 ${covered}/${rows.length} 已被拦截）` : ''}。
        只读行是被**更宽的关键字**盖住的 —— 要放行得改「官方模型名关键字」（设置 → 插件 →
        会话守护门禁，或 `config/session-guard.json` 的 `officialModelPatterns`），置空即关闭按模型名判定。
      </p>
    </div>
  )
}

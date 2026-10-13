/**
 * dsh-session-guard — 「模型列表」面板（状态徽标 与 设置卡片 共用）。
 *
 * 形态（v0.3.2）：
 *   - 列表 = **DSH 当前的全部模型**（`GET /session-guard/models`：各路由自报 + 本插件观察到的
 *     真实目标），每行一个模型，**复选框在行右侧**；
 *   - 顶部**关键词过滤框**：按 `provider/model` 子串过滤（大小写不敏感）—— 只影响展示与
 *     「全选」范围，**不改模型集合、也不改拦截列表**；
 *   - **全选 / 取消全选**：作用于当前过滤结果（`bulkToggle`）；
 *   - **勾选即联动**：经 `onCommit` 写回 `officialModelPatterns`（本线走 settingsScope；
 *     写入是异步往返，期间禁用交互，避免连点把两次变更叠在同一份旧列表上）。
 *
 * 行状态与过滤/批量逻辑都在 `model-list.ts`（纯函数、可单测）；host 侧判定逻辑不变。
 */
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { allCovered, bulkToggle, filterRows, rowHint, rowState, toggleModel } from './model-list'

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
  const [keyword, setKeyword] = useState('')
  /** 正在写入：写入是异步往返，期间禁用交互，避免连点把两次变更叠在同一份旧列表上。 */
  const [pending, setPending] = useState(false)

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
  // 用拼接出的稳定键做依赖：父层可能传 `value.x ?? []` 这种每次渲染都新建的数组。
  const patternKey = patterns.join('\u0000')
  useEffect(() => {
    setPending(false)
  }, [patternKey])

  const commit = (next: string[]) => {
    setPending(true)
    onCommit(next)
  }

  const filtered = filterRows(models, keyword)
  const providers = [...new Set(filtered.map((r) => r.provider))].sort()
  const covered = filtered.filter((r) => rowState(r.model, patterns).covered).length
  const everyCovered = allCovered(patterns, filtered)

  return (
    <div className="sgMlBody">
      <div className="sgMlFilterRow">
        <input
          className="sgMlInput"
          type="text"
          value={keyword}
          placeholder="过滤模型（provider/model 子串）"
          onChange={(e) => setKeyword(e.currentTarget.value)}
        />
        <button
          type="button"
          className="sgMlRefresh"
          disabled={disabled || pending || filtered.length === 0}
          onClick={() => commit(bulkToggle(patterns, filtered, !everyCovered))}
          title="只作用于当前过滤结果"
        >
          {everyCovered ? '取消全选' : '全选'}
        </button>
        <button type="button" className="sgMlRefresh" disabled={loading} onClick={() => void load()} title="重新获取模型列表">
          {loading ? '获取中…' : '刷新'}
        </button>
      </div>
      <div className="sgMlPatterns">
        <span className="sgMlSentinel">已拦截关键字</span>
        {patterns.length === 0 ? (
          <span className="sgMlSentinel">（空：不按模型名判定）</span>
        ) : (
          patterns.map((p) => (
            <span key={p} className="sgMlChip">
              {p}
            </span>
          ))
        )}
      </div>
      {error !== null && <p className="sgMlHint">{error}（可稍后刷新重试）</p>}
      {error === null && !loading && filtered.length === 0 && (
        <p className="sgMlHint">{models.length === 0 ? '没有可枚举的模型。' : '没有匹配的模型。'}</p>
      )}
      {filtered.length > 0 && (
        <ul className="sgMlList">
          {providers.map((provider) => (
            <li key={provider}>
              <div className="sgMlProvider">{provider}</div>
              <ul className="sgMlList">
                {filtered
                  .filter((r) => r.provider === provider)
                  .map((r) => {
                    const state = rowState(r.model, patterns)
                    const locked = state.covered && !state.explicit
                    const hint = rowHint(state)
                    return (
                      <li key={`${provider}/${r.model}`} className="sgMlItem">
                        <label className="sgMlCheck" title={locked ? hint : '勾选 = 加入高峰拦截列表'}>
                          <span className="sgMlModel">{r.model}</span>
                          {hint !== '' && <span className="sgMlTag">{hint}</span>}
                          <input
                            type="checkbox"
                            checked={state.covered}
                            disabled={disabled || pending || locked}
                            onChange={() => commit(toggleModel(patterns, r.model))}
                          />
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
        勾选 = 该模型名加入列表（高峰一律拦）；默认关键字 deepseek 会把名字带 deepseek 的模型全部算进来，
        这些行只读 —— 要放行得改上面的「官方模型名关键字」（或 `config/session-guard.json` 的
        `officialModelPatterns`），置空即关闭按模型名判定。
        {filtered.length > 0 ? ` 当前 ${covered}/${filtered.length} 已拦截。` : ''}
      </p>
      {disabled && <p className="sgMlHint">当前只读：设置命名空间不可写。</p>}
    </div>
  )
}

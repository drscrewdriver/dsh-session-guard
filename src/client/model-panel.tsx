/**
 * dsh-session-guard — 「模型列表」面板（状态徽标展开区）。
 *
 * 形态（v3.1.5）：
 *   - 列表 = **DSH 当前的全部模型**（`GET /session-guard/models`：各路由自报 + 本插件观察到的
 *     真实目标），每行一个模型，**复选框在行右侧**；
 *   - 顶部**关键词过滤框**：按 `provider/model` 子串过滤（大小写不敏感）—— 只影响展示与
 *     「全选」范围，**不改模型集合、也不改拦截列表**；
 *   - **全选 / 取消全选**：作用于当前过滤结果（`bulkToggle`）；
 *   - **勾选即联动**：写回 `officialModelPatterns`（本线经 `POST /session-guard/rpc
 *     {action:'setModelPatterns'}` 落到 `config/session-guard.json` 并立即 reload；
 *     0.1.7 客户端没有 settingsScope，这是本线唯一的写入口）。
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

export function ModelListPanel(): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [models, setModels] = useState<readonly CatalogModel[]>([])
  const [patterns, setPatterns] = useState<readonly string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [writeError, setWriteError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [pending, setPending] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    const [modelsRes, settingsRes] = await Promise.allSettled([
      fetch('/session-guard/models').then((r) => r.json()),
      fetch('/session-guard/settings').then((r) => r.json()),
    ])
    const modelsBody = modelsRes.status === 'fulfilled' ? modelsRes.value : null
    if (modelsBody?.ok && Array.isArray(modelsBody.models)) setModels(modelsBody.models)
    else setError('模型列表不可用（host 需为 v3.1.5+：重启 DSH 后 /session-guard/models 才存在）')

    const settingsBody = settingsRes.status === 'fulfilled' ? settingsRes.value : null
    const list = settingsBody?.settings?.officialModelPatterns
    if (Array.isArray(list)) setPatterns(list)
    setLoading(false)
  }

  useEffect(() => {
    // 只在挂载（= 展开）时拉一次；「刷新」按钮负责后续更新。
    void load()
  }, [])

  /** 写回拦截列表（本线：写配置文件 + reload；失败只提示，不改本地展示）。 */
  const commit = async (next: string[]) => {
    setPending(true)
    setWriteError(null)
    const before = patterns
    setPatterns(next) // 乐观更新，失败时回滚
    try {
      const res = await fetch('/session-guard/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'setModelPatterns', patterns: next }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || body?.ok !== true) {
        setPatterns(before)
        setWriteError(String(body?.error ?? `写入失败（HTTP ${res.status}）`))
      } else if (Array.isArray(body.result?.patterns)) {
        setPatterns(body.result.patterns)
      }
    } catch (e) {
      setPatterns(before)
      setWriteError(`写入失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setPending(false)
    }
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
          disabled={pending || filtered.length === 0}
          onClick={() => void commit(bulkToggle(patterns, filtered, !everyCovered))}
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
      {writeError !== null && <p className="sgMlError">✗ {writeError}</p>}
      {error !== null && <p className="sgMlHint">{error}</p>}
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
                    return (
                      <li key={`${provider}/${r.model}`} className="sgMlItem">
                        <label className="sgMlCheck" title={locked ? rowHint(state) : '勾选 = 加入高峰拦截列表'}>
                          <span className="sgMlModel">{r.model}</span>
                          {rowHint(state) !== '' && <span className="sgMlTag">{rowHint(state)}</span>}
                          <input
                            type="checkbox"
                            checked={state.covered}
                            disabled={pending || locked}
                            onChange={() => void commit(toggleModel(patterns, r.model))}
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
        勾选 = 该模型名加入高峰拦截列表（高峰一律拦）；被更宽关键字（默认 deepseek）盖住的行只读 ——
        要放行就改 `officialModelPatterns`（`config/session-guard.json` 或设置表单），置空即关闭按模型名判定。
        {filtered.length > 0 ? ` 当前 ${covered}/${filtered.length} 已拦截。` : ''}
      </p>
    </div>
  )
}

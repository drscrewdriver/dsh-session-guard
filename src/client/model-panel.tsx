/**
 * dsh-session-guard — 「高峰拦截列表」面板（状态徽标展开区，**只读**）。
 *
 * 挂载即拉取：父组件只在**展开时**挂载本面板，于是「展开区域自动获取当前模型列表」
 * 不需要额外的开关。两个来源都是 host 的只读路由：
 *   - `GET /session-guard/models` —— 当前模型目录（各路由自报 + 本插件观察到的真实目标）；
 *   - `GET /session-guard/settings` —— 生效中的 `officialModelPatterns`（列表项本身）。
 * 全链路 fail-open：任一请求失败只显示提示，不影响任何会话。
 *
 * 本线（0.1.7）客户端**没有 settingsScope**，所以这里没有勾选写入 —— 行状态与文案由
 * `model-list.ts` 的纯函数算出（与 host 判定同源），改列表走 `config/session-guard.json`
 * 或设置表单。
 */
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { rowHint, rowState } from './model-list'

/** `GET /session-guard/models` 的一行。 */
export interface CatalogModel {
  provider: string
  model: string
  source?: string
}

/** 本线设置里与判定相关的字段（只读展示）。 */
interface SettingsShape {
  officialModelPatterns?: string[]
}

export function ModelListPanel(): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [models, setModels] = useState<readonly CatalogModel[]>([])
  const [patterns, setPatterns] = useState<readonly string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    const [modelsRes, settingsRes] = await Promise.allSettled([
      fetch('/session-guard/models').then((r) => r.json()),
      fetch('/session-guard/settings').then((r) => r.json()),
    ])
    const modelsBody = modelsRes.status === 'fulfilled' ? modelsRes.value : null
    if (modelsBody?.ok && Array.isArray(modelsBody.models)) setModels(modelsBody.models)
    else setError('模型列表不可用')

    const settingsBody = settingsRes.status === 'fulfilled' ? settingsRes.value : null
    const list = (settingsBody?.settings as SettingsShape | undefined)?.officialModelPatterns
    if (Array.isArray(list)) {
      setPatterns(list)
      setSettingsError(false)
    } else {
      setSettingsError(true)
    }
    setLoading(false)
  }

  useEffect(() => {
    // 只在挂载（= 展开）时拉一次；「刷新」按钮负责后续更新。
    void load()
  }, [])

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
      {settingsError && <p className="sgMlHint">读不到生效设置（关键字按内置默认展示）。</p>}
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
                  .map((r) => (
                    <li key={`${provider}/${r.model}`} className="sgMlItem">
                      <span className={'sgMlCheck' + (r.state.covered ? ' sgMlCovered' : '')}>
                        <span className="sgMlDot" aria-hidden="true">
                          {r.state.covered ? '●' : '○'}
                        </span>
                        <span className="sgMlModel">{r.model}</span>
                        {rowHint(r.state) !== '' && <span className="sgMlTag">{rowHint(r.state)}</span>}
                      </span>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <p className="sgMlHint">
        ● = 已被拦截（高峰一律拦），○ = 放行；默认关键字 deepseek 会把名字带 deepseek 的模型全部算进来
        {rows.length > 0 ? `（当前 ${covered}/${rows.length} 已被拦截）` : ''}。
      </p>
      <p className="sgMlHint">
        当前只读：本线（0.1.7）客户端没有设置写入口 —— 改 `config/session-guard.json` 的
        `officialModelPatterns`（或设置 → 插件 → 会话守护门禁里的同名项），置空即关闭按模型名判定。
      </p>
    </div>
  )
}

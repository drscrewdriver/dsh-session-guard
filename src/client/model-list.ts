/**
 * dsh-session-guard — 「高峰拦截列表」勾选的纯逻辑（零 React、零依赖，可单测）。
 *
 * 与 host 判定**同源**：列表项（`officialModelPatterns`）是正则源码，匹配语义为**包含**
 * （`new RegExp(entry, 'i')`）。这里只做三件事：
 *   1. 某模型名是否被列表覆盖（`covered`）；
 *   2. 该行状态（命中哪些关键字 / 是否存在与模型名完全相同的显式条目）；
 *   3. 勾选动作 → 新的列表（增/删条目）。
 *
 * **判定与存储逻辑都不在这里**：勾选只是往同一份设置项里增删条目，host 侧的判定与
 * 持久化路径一字不改。
 */

/** 一行的判定状态。 */
export interface ModelRowState {
  /** 命中的列表项（按列表顺序，取首个即可用于提示）。 */
  matched: string[]
  /** 列表里存在与模型名**完全相同**的条目 → 可以直接取消勾选。 */
  explicit: boolean
  /** 是否已被拦截（命中任一关键字，或存在显式条目）。 */
  covered: boolean
}

/** 单个条目是否命中模型名（正则、大小写不敏感、包含语义；写坏的条目视为不命中）。 */
export function matchesPattern(model: string, pattern: string): boolean {
  if (typeof model !== 'string' || model === '' || typeof pattern !== 'string' || pattern === '') return false
  try {
    return new RegExp(pattern, 'i').test(model)
  } catch {
    return false
  }
}

/** 算出某模型名在给定列表下的行状态。 */
export function rowState(model: string, patterns: readonly string[]): ModelRowState {
  const list = Array.isArray(patterns) ? patterns : []
  const matched = list.filter((p) => matchesPattern(model, p))
  const explicit = list.some((p) => p === model)
  return { matched, explicit, covered: matched.length > 0 }
}

/** 给一行生成提示文案（命中哪个关键字 / 是否是显式条目）。 */
export function rowHint(state: ModelRowState): string {
  if (state.explicit) return '显式条目'
  if (state.covered) return `由关键字「${state.matched[0]}」覆盖`
  return ''
}

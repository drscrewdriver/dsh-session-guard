/**
 * dsh-session-guard — 「高峰拦截列表」模型勾选的纯逻辑（零 React、零依赖，可单测。
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

/**
 * 勾选/取消勾选一个模型 → 新列表。
 *
 * - 已存在**完全同名**条目 → 删掉它（取消勾选；若仍有更宽的关键字覆盖，行会变成
 *   只读并提示是哪个关键字盖着 —— 那种情况下需要改关键字，而不是逐个模型取消）；
 * - 否则 → 把模型名作为一个新条目追加（正则里模型名都是字面量安全的普通名字；
 *   带正则元字符的名字仍按其字面语义匹配，见 README）。
 *
 * 纯函数：不修改入参，返回新数组（去重、保持原有顺序）。
 */
export function toggleModel(patterns: readonly string[], model: string): string[] {
  const list = Array.isArray(patterns) ? [...patterns] : []
  if (typeof model !== 'string' || model === '') return list
  const at = list.indexOf(model)
  if (at !== -1) {
    list.splice(at, 1)
    return list
  }
  if (!list.includes(model)) list.push(model)
  return list
}

/** 给一行生成提示文案（勾选语义 / 为什么不能取消）。 */
export function rowHint(state: ModelRowState): string {
  if (state.explicit) return '显式条目'
  if (state.covered) return `由关键字「${state.matched[0]}」覆盖`
  return ''
}

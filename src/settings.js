/**
 * dsh-session-guard — 设置 schema（0.1.7 线：**声明式 volatile 设置**）。
 *
 * **本线的 `settings` 服务仍在**（类 `SettingsForms`，有 `describe()` / `configure()`），
 * 但 `dsh-settings` **已没有 `register()` 与 `get()`** —— 这（而非「服务缺席」）才是设置面
 * 改用官方推荐声明式形态的原因：
 * - `src/index.js` 导出 `export const Config = SettingsSchema`，dsh 依据 schema 里的
 *   `.volatile()` 字段**自动生成设置表单**；
 * - 运行时经 `apply(ctx, config)` 的组合条目读取（volatile 值是 live ref，
 *   用 `.get()` 解引），见 `src/index.js` 的 `resolveEntryConfig()`；
 * - **不再有任何 register 调用**（没有可调用的 `register`），插件也**不 inject `settings`**
 *   —— 它不从该服务消费任何东西，少一个依赖更干净。
 *
 * ⚠️ 真正会让应用 **web boot 致命失败**的是**客户端**缺失的 `settingsScope`（写成静态
 * `inject` 会让客户端条目永远 pending），与宿主的 `settings` 服务无关 —— 见
 * `src/client/index.ts` 的兼容性注记。
 *
 * 本文件只保留纯数据 + 纯校验：
 * - `DEFAULT_SETTINGS`：核心逻辑依赖的默认值；
 * - `SettingsSchema`：字段级 `.default()` + `.volatile()`；
 * - `effectiveDefaults` / `canonicalSettings` / `settingsBaseFor`：把
 *   `config/session-guard.json` 的值并进默认层并用 schema 校验（坏值回退内置默认，
 *   绝不因配置文件写错而让守卫静默失效）。
 */
import z from '@deepseek-ai/schemastery'
import { DEFAULT_RETRY } from './retry.js'
import { DEFAULT_WEEKEND_DAYS, WEEKEND_MODE_OFF_PEAK } from './time-policy.js'

/** 设置命名空间（设置 → 插件 → session-guard）。 */
export const NS = 'session-guard'

/** 默认配置（核心逻辑依赖；设置不可用时即用此值）。 */
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true, // 高峰自动处理开关（简单开关）
  offPeakAutoResume: true, // 低谷自动恢复开关：低峰时段自动恢复被高峰暂停的会话
  weekendMode: true, // 周末模式开关：周末整日视为 off-peak（简单开关）
  timezone: 'Asia/Shanghai', // 全部判定的时区（spec §六.3）
  weekendDays: [...DEFAULT_WEEKEND_DAYS], // 哪几天算周末（spec §一 weekendPolicy.days）
  weekendPolicyMode: WEEKEND_MODE_OFF_PEAK, // 周末策略模式（目前仅 offPeak）
  // 峰窗口：name 仅用于展示/日志，days 省略或为空 = 每天生效（spec §六.1）。
  // v0.3.0 起不再硬编码——全部来自 config/session-guard.json。
  peakWindows: [
    { name: 'morning', start: '09:00', end: '12:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    { name: 'afternoon', start: '14:00', end: '18:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  ],
  peakTimezone: '', // 仅覆盖峰窗口判定的时区；'' = 跟随 timezone（spec §六.3）
  pauseMode: 'safe', // 透传 taskControl.pause mode
  pauseReason: 'wait', // 透传 taskControl.pause reason
  stepLevelPause: true, // step 级门控（agent/pre-step）：高峰在下一个 step 前拉门
  stepGateTimeoutMs: 300_000, // step 门控超时（防死锁；到期升级为 turn 级 force 暂停）
  queueFallback: true, // 无会话门时回退锁等待队列（简单开关）
  retryEnabled: false, // 自动重试开关（后端，D9；默认关，保守）
  retryText: DEFAULT_RETRY.retryText,
  retryGraceMs: DEFAULT_RETRY.retryGraceMs,
  retryCooldownMs: DEFAULT_RETRY.retryCooldownMs,
  retryBackoffFactor: DEFAULT_RETRY.retryBackoffFactor,
  retryBackoffMaxMs: DEFAULT_RETRY.retryBackoffMaxMs,
  retryMaxConsecutive: DEFAULT_RETRY.retryMaxConsecutive,
  // ── 官方 provider 二维判定（高峰 × 目标源）──
  providerGuard: true, // 二维判定总开关；关掉 = 现有纯时间判定
  officialProviders: [], // 追加的官方 provider id（精确匹配，最高优先级）
  officialBaseURLs: ['api.deepseek.com'], // 官方端点 host 名单
  deferredResume: true, // 退峰自动继续被延后的请求/会话
  deferredResumeText: '继续（高峰已过，自动继续）', // error 模式退峰 followup 文案
  deferredMode: 'hold', // hold（挂起不报错）/ error（抛错 + 记延后）
  deferredMaxHoldMs: 6 * 60 * 60 * 1000, // 挂起上限（6h），到期转 error
  guardSubagents: true, // 是否纳入子代理请求
})

/**
 * 设置 schema（schemastery 原生命令，zod 变体）：
 * - 枚举用 z.union([z.const(...)])；默认值用字段级 .default()。
 * - **每个字段都标 `.volatile()`**：0.1.7 线用它自动生成设置表单。
 * - peakWindows 的 name/days 为 v0.3.0 新增；未提供时 default 兜底，
 *   因此升级后已存的旧形态（只有 start/end）仍然合法。
 */
export const SettingsSchema = z.object({
  enabled: z.boolean().default(DEFAULT_SETTINGS.enabled).volatile(),
  offPeakAutoResume: z.boolean().default(DEFAULT_SETTINGS.offPeakAutoResume).volatile(),
  weekendMode: z.boolean().default(DEFAULT_SETTINGS.weekendMode).volatile(),
  timezone: z.string().default(DEFAULT_SETTINGS.timezone).volatile(),
  weekendDays: z.array(z.string()).default([...DEFAULT_SETTINGS.weekendDays]).volatile(),
  weekendPolicyMode: z
    .union([z.const(WEEKEND_MODE_OFF_PEAK)])
    .default(DEFAULT_SETTINGS.weekendPolicyMode)
    .volatile(),
  peakWindows: z
    .array(
      z.object({
        name: z.string().default(''),
        start: z.string(),
        end: z.string(),
        days: z.array(z.string()).default([]),
      }),
    )
    .default(DEFAULT_SETTINGS.peakWindows)
    .volatile(),
  peakTimezone: z.string().default(DEFAULT_SETTINGS.peakTimezone).volatile(),
  pauseMode: z.union([z.const('safe'), z.const('force')]).default(DEFAULT_SETTINGS.pauseMode).volatile(),
  pauseReason: z.union([z.const('wait'), z.const('stop')]).default(DEFAULT_SETTINGS.pauseReason).volatile(),
  stepLevelPause: z.boolean().default(DEFAULT_SETTINGS.stepLevelPause).volatile(),
  stepGateTimeoutMs: z.number().min(0).default(DEFAULT_SETTINGS.stepGateTimeoutMs).volatile(),
  queueFallback: z.boolean().default(DEFAULT_SETTINGS.queueFallback).volatile(),
  retryEnabled: z.boolean().default(DEFAULT_SETTINGS.retryEnabled).volatile(),
  retryText: z.string().default(DEFAULT_SETTINGS.retryText).volatile(),
  retryGraceMs: z.number().min(0).default(DEFAULT_SETTINGS.retryGraceMs).volatile(),
  retryCooldownMs: z.number().min(0).default(DEFAULT_SETTINGS.retryCooldownMs).volatile(),
  retryBackoffFactor: z.number().min(1).default(DEFAULT_SETTINGS.retryBackoffFactor).volatile(),
  retryBackoffMaxMs: z.number().min(0).default(DEFAULT_SETTINGS.retryBackoffMaxMs).volatile(),
  retryMaxConsecutive: z.number().min(0).default(DEFAULT_SETTINGS.retryMaxConsecutive).volatile(),
  providerGuard: z.boolean().default(DEFAULT_SETTINGS.providerGuard).volatile(),
  officialProviders: z.array(z.string()).default(DEFAULT_SETTINGS.officialProviders).volatile(),
  officialBaseURLs: z.array(z.string()).default(DEFAULT_SETTINGS.officialBaseURLs).volatile(),
  deferredResume: z.boolean().default(DEFAULT_SETTINGS.deferredResume).volatile(),
  deferredResumeText: z.string().default(DEFAULT_SETTINGS.deferredResumeText).volatile(),
  deferredMode: z.union([z.const('hold'), z.const('error')]).default(DEFAULT_SETTINGS.deferredMode).volatile(),
  deferredMaxHoldMs: z.number().min(0).default(DEFAULT_SETTINGS.deferredMaxHoldMs).volatile(),
  guardSubagents: z.boolean().default(DEFAULT_SETTINGS.guardSubagents).volatile(),
})

/**
 * 把 base 过一遍 schema，得到**规范化形态**（补齐 schema 的字段级默认值）。
 *
 * 注意：因为字段都标了 `.volatile()`，`SettingsSchema(base)` 解析出来的是 **live ref**
 * （每个字段一个带 `.get()` 的对象，dsh 的自动表单与实时读取依赖这个形态）。
 * 本函数负责把 ref **解引成普通值**，供默认层合并与比较使用。
 *
 * 坏值不抛给调用方，而是带回 `error` 说明。
 *
 * @param {object} base
 * @returns {{value:object, error:string|null}}
 */
export function canonicalSettings(base) {
  try {
    const resolved = SettingsSchema(base)
    const value = {}
    for (const [key, v] of Object.entries(resolved)) {
      if (v !== null && typeof v === 'object' && typeof v.get === 'function') {
        try {
          value[key] = v.get()
        } catch {
          // 坏 ref → 视为未设置，交给默认层兜底（绝不让它把整份配置拖挂）。
          value[key] = undefined
        }
      } else {
        value[key] = v
      }
    }
    return { value, error: null }
  } catch (e) {
    return { value: base, error: String((e && e.message) || e) }
  }
}

/**
 * 算出用于默认层的 base，以及与之配套的**规范化快照**。
 *
 * 若文件值过不了 schema（例如某个字段类型写错），这里回退内置默认 —— 设置表单保住，
 * 坏值被忽略（而不是让整个守卫静默失效）。
 *
 * @param {object} [fileConfig]
 * @returns {{base:object, canonical:object, error:string|null}}
 */
export function settingsBaseFor(fileConfig) {
  const fileBase = effectiveDefaults(fileConfig)
  const checked = canonicalSettings(fileBase)
  if (checked.error === null) return { base: fileBase, canonical: checked.value, error: null }
  const fallback = { ...DEFAULT_SETTINGS }
  return { base: fallback, canonical: canonicalSettings(fallback).value, error: checked.error }
}

/**
 * 由配置文件算出「有效默认值」（DEFAULT_SETTINGS + 文件覆盖）。
 * @param {object} [fileConfig]
 * @returns {object}
 */
export function effectiveDefaults(fileConfig) {
  return { ...DEFAULT_SETTINGS, ...(fileConfig !== null && typeof fileConfig === 'object' ? fileConfig : {}) }
}

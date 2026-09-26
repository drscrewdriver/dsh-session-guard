/**
 * dsh-session-guard — 设置子板块（设置 → 插件 → session-guard，简单开关）。
 *
 * 注册方式对齐 dsh-thinking-levels 的官方做法：
 * - `@deepseek-ai/schemastery` 为**常规 dependency**（随插件安装，可解析）。
 * - **不 value-import `@deepseek-ai/dsh-settings`**：该服务由 dsh runtime 经
 *   cordis `settings` 注入面提供，不属于 profile 的可解析树；这里只用本地最小
 *   接口（SettingsScopeLike / SettingsServiceLike / SettingsAwareCtx）在
 *   `ctx.inject(['settings'], ...)` 里注册命名空间，`base` 层叠组合配置。
 * - 仍 fail-open：任何解析 / 注入失败都静默降级用 DEFAULT_SETTINGS，绝不因
 *   设置依赖而崩。
 */
import z from '@deepseek-ai/schemastery'
import { DEFAULT_RETRY } from './retry.js'
import { DEFAULT_WEEKEND_DAYS, WEEKEND_MODE_OFF_PEAK } from './time-policy.js'

/** 设置命名空间（设置 → 插件 → session-guard）。 */
export const NS = 'session-guard'

/** 默认配置（核心逻辑依赖；设置服务不可用时即用此值）。 */
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
 * - peakWindows 的 name/days 为 v0.3.0 新增；未提供时 default 兜底，
 *   因此升级后已存的旧形态（只有 start/end）仍然合法。
 */
export const SettingsSchema = z.object({
  enabled: z.boolean().default(DEFAULT_SETTINGS.enabled),
  offPeakAutoResume: z.boolean().default(DEFAULT_SETTINGS.offPeakAutoResume),
  weekendMode: z.boolean().default(DEFAULT_SETTINGS.weekendMode),
  timezone: z.string().default(DEFAULT_SETTINGS.timezone),
  weekendDays: z.array(z.string()).default([...DEFAULT_SETTINGS.weekendDays]),
  weekendPolicyMode: z.union([z.const(WEEKEND_MODE_OFF_PEAK)]).default(DEFAULT_SETTINGS.weekendPolicyMode),
  peakWindows: z
    .array(
      z.object({
        name: z.string().default(''),
        start: z.string(),
        end: z.string(),
        days: z.array(z.string()).default([]),
      }),
    )
    .default(DEFAULT_SETTINGS.peakWindows),
  peakTimezone: z.string().default(DEFAULT_SETTINGS.peakTimezone),
  pauseMode: z.union([z.const('safe'), z.const('force')]).default(DEFAULT_SETTINGS.pauseMode),
  pauseReason: z.union([z.const('wait'), z.const('stop')]).default(DEFAULT_SETTINGS.pauseReason),
  stepLevelPause: z.boolean().default(DEFAULT_SETTINGS.stepLevelPause),
  stepGateTimeoutMs: z.number().min(0).default(DEFAULT_SETTINGS.stepGateTimeoutMs),
  queueFallback: z.boolean().default(DEFAULT_SETTINGS.queueFallback),
  retryEnabled: z.boolean().default(DEFAULT_SETTINGS.retryEnabled),
  retryText: z.string().default(DEFAULT_SETTINGS.retryText),
  retryGraceMs: z.number().min(0).default(DEFAULT_SETTINGS.retryGraceMs),
  retryCooldownMs: z.number().min(0).default(DEFAULT_SETTINGS.retryCooldownMs),
  retryBackoffFactor: z.number().min(1).default(DEFAULT_SETTINGS.retryBackoffFactor),
  retryBackoffMaxMs: z.number().min(0).default(DEFAULT_SETTINGS.retryBackoffMaxMs),
  retryMaxConsecutive: z.number().min(0).default(DEFAULT_SETTINGS.retryMaxConsecutive),
  providerGuard: z.boolean().default(DEFAULT_SETTINGS.providerGuard),
  officialProviders: z.array(z.string()).default(DEFAULT_SETTINGS.officialProviders),
  officialBaseURLs: z.array(z.string()).default(DEFAULT_SETTINGS.officialBaseURLs),
  deferredResume: z.boolean().default(DEFAULT_SETTINGS.deferredResume),
  deferredResumeText: z.string().default(DEFAULT_SETTINGS.deferredResumeText),
  deferredMode: z.union([z.const('hold'), z.const('error')]).default(DEFAULT_SETTINGS.deferredMode),
  deferredMaxHoldMs: z.number().min(0).default(DEFAULT_SETTINGS.deferredMaxHoldMs),
  guardSubagents: z.boolean().default(DEFAULT_SETTINGS.guardSubagents),
})

/**
 * dsh settings 服务的最小本地接口（仿 dsh-thinking-levels 的 local face）：
 * 插件不 value-import `@deepseek-ai/dsh-settings`，只通过这些形状在注入面调用。
 */

/** @typedef {{ get(): unknown; watch(cb: () => void): () => void }} SettingsScopeLike */
/** @typedef {{ register(ns: string, schema: unknown, options?: { base?: unknown }): SettingsScopeLike }} SettingsServiceLike */
/** @typedef {{ inject(deps: readonly string[], fn: (s: { settings: SettingsServiceLike; effect(cb: () => (() => void) | void, label?: string): void }) => void): void }} SettingsAwareCtx */

/**
 * 注册 设置 → 插件 → session-guard 子板块（简单开关）。
 * - 走 `settings` 注入面，`base` 层叠组合配置；对 runtime 调用方经 `ctx.settings.get(NS)` 读取。
 * - `base` 可由 `config/session-guard.json` 覆盖（v0.3.0）：文件值是**默认层**，
 *   设置面板里的用户覆盖仍然优先。
 * - 任何失败（settings 服务缺失 / 注入异常）→ 返回 false，静默降级用默认配置。
 * @param {object} ctx - host context（应含 cordis `settings` 注入面）。
 * @param {object} [fileConfig] 配置文件归一化后的扁平设置（见 config-file.js）
 * @returns {boolean} 注册成功 true；设置服务不可用时 false（fail-open）。
 */
export function registerSettings(ctx, fileConfig) {
  const { base, error } = settingsBaseFor(fileConfig)
  if (error !== null) {
    ctx?.logger?.warn?.(
      `[session-guard] config file values failed settings validation (${error}) — registering the settings panel with built-in defaults instead`,
    )
  }
  try {
    // 本插件顶层 `inject` 已声明 `settings`（见 src/index.js 的
    // `export const inject`），所以 apply 时 `ctx.settings` 已是完整
    // SettingsProvider（带 .register），直接注册即可 —— 无需再 `ctx.inject`
    // 二次动态注入（对已在 fiber 上解析的服务做二次注入，回调作为异步插件
    // apply 排队，`registerSettings` 同步返回 true 会掩盖实际操作未生效）。
    // 与 dsh-thinking-levels / dsh-context 的区别仅在于它们顶层未声明
    // settings，才必须动态注入；这里已声明，直接用最可靠。
    const svc = /** @type {{ register(ns: string, schema: unknown, options?: { base?: unknown }): unknown }} */ (ctx.settings)
    svc.register(NS, SettingsSchema, { base })
    return true
  } catch {
    return false
  }
}

/**
 * 把 base 过一遍 schema，得到**规范化形态**（与 `settings.get(NS)` 同一形状）。
 *
 * 用途：启动时算出「用户没动过」的基准快照，`readCfg` 用它区分
 * 「设置面板里的用户覆盖」与「schema 补的默认值」——否则无法在热重载配置文件后
 * 既让文件值生效、又让用户覆盖继续优先。
 *
 * @param {object} base
 * @returns {{value:object, error:string|null}}
 */
export function canonicalSettings(base) {
  try {
    return { value: SettingsSchema(base), error: null }
  } catch (e) {
    return { value: base, error: String((e && e.message) || e) }
  }
}

/**
 * 算出真正要注册给 settings 服务的 base，以及与之配套的**规范化基准快照**。
 *
 * 两者必须成对使用：`registerSettings` 用 `base` 注册，`src/index.js` 用
 * `canonical` 当「用户没动过」的比对基准。若文件值过不了 schema（例如某个字段类型
 * 写错），这里回退内置默认 —— 设置面板保住，坏值被忽略。
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
 * 设置服务不可用 / 读取失败时用它做 fail-open 兜底。
 * @param {object} [fileConfig]
 * @returns {object}
 */
export function effectiveDefaults(fileConfig) {
  return { ...DEFAULT_SETTINGS, ...(fileConfig !== null && typeof fileConfig === 'object' ? fileConfig : {}) }
}

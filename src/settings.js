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

/** 设置命名空间（设置 → 插件 → session-guard）。 */
export const NS = 'session-guard'

/** 默认配置（核心逻辑依赖；设置服务不可用时即用此值）。 */
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true, // 高峰自动处理开关（简单开关）
  offPeakAutoResume: true, // 低谷自动恢复开关：低峰时段自动恢复被高峰暂停的会话
  weekendMode: true, // 周末模式开关：识别周末，无视峰谷（简单开关）
  timezone: 'Asia/Shanghai',
  peakWindows: [
    { start: '09:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  pauseMode: 'safe', // 透传 taskControl.pause mode
  pauseReason: 'wait', // 透传 taskControl.pause reason
  queueFallback: true, // 无会话门时回退锁等待队列（简单开关）
  retryEnabled: false, // 自动重试开关（后端，D9；默认关，保守）
  retryText: DEFAULT_RETRY.retryText,
  retryGraceMs: DEFAULT_RETRY.retryGraceMs,
  retryCooldownMs: DEFAULT_RETRY.retryCooldownMs,
  retryBackoffFactor: DEFAULT_RETRY.retryBackoffFactor,
  retryBackoffMaxMs: DEFAULT_RETRY.retryBackoffMaxMs,
  retryMaxConsecutive: DEFAULT_RETRY.retryMaxConsecutive,
})

/**
 * 设置 schema（schemastery 原生命令，zod 变体）：
 * - 枚举用 z.union([z.const(...)])；默认值用字段级 .default()。
 */
export const SettingsSchema = z.object({
  enabled: z.boolean().default(DEFAULT_SETTINGS.enabled),
  offPeakAutoResume: z.boolean().default(DEFAULT_SETTINGS.offPeakAutoResume),
  weekendMode: z.boolean().default(DEFAULT_SETTINGS.weekendMode),
  timezone: z.string().default(DEFAULT_SETTINGS.timezone),
  peakWindows: z
    .array(z.object({ start: z.string(), end: z.string() }))
    .default(DEFAULT_SETTINGS.peakWindows),
  pauseMode: z.union([z.const('safe'), z.const('force')]).default(DEFAULT_SETTINGS.pauseMode),
  pauseReason: z.union([z.const('wait'), z.const('stop')]).default(DEFAULT_SETTINGS.pauseReason),
  queueFallback: z.boolean().default(DEFAULT_SETTINGS.queueFallback),
  retryEnabled: z.boolean().default(DEFAULT_SETTINGS.retryEnabled),
  retryText: z.string().default(DEFAULT_SETTINGS.retryText),
  retryGraceMs: z.number().min(0).default(DEFAULT_SETTINGS.retryGraceMs),
  retryCooldownMs: z.number().min(0).default(DEFAULT_SETTINGS.retryCooldownMs),
  retryBackoffFactor: z.number().min(1).default(DEFAULT_SETTINGS.retryBackoffFactor),
  retryBackoffMaxMs: z.number().min(0).default(DEFAULT_SETTINGS.retryBackoffMaxMs),
  retryMaxConsecutive: z.number().min(0).default(DEFAULT_SETTINGS.retryMaxConsecutive),
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
 * - 任何失败（settings 服务缺失 / 注入异常）→ 返回 false，静默降级用默认配置。
 * @param {object} ctx - host context（应含 cordis `settings` 注入面）。
 * @returns {boolean} 注册成功 true；设置服务不可用时 false（fail-open）。
 */
export function registerSettings(ctx) {
  try {
    // 本插件顶层 `inject` 已声明 `settings`（见 src/index.js 的
    // `export const inject`），所以 apply 时 `ctx.settings` 已是完整
    // SettingsProvider（带 .register），直接注册即可 —— 无需再 `ctx.inject`
    // 二次动态注入（对已在 fiber 上解析的服务做二次注入，回调作为异步插件
    // apply 排队，`registerSettings` 同步返回 true 会掩盖实际操作未生效）。
    // 与 dsh-thinking-levels / dsh-context 的区别仅在于它们顶层未声明
    // settings，才必须动态注入；这里已声明，直接用最可靠。
    const svc = /** @type {{ register(ns: string, schema: unknown, options?: { base?: unknown }): unknown }} */ (ctx.settings)
    // base 用副本：DEFAULT_SETTINGS 被 Object.freeze，直接当 base 可能被写。
    svc.register(NS, SettingsSchema, { base: { ...DEFAULT_SETTINGS } })
    return true
  } catch {
    return false
  }
}

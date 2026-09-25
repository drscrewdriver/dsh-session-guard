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
 */
export const SettingsSchema = z.object({
  enabled: z.boolean().default(DEFAULT_SETTINGS.enabled).volatile(),
  offPeakAutoResume: z.boolean().default(DEFAULT_SETTINGS.offPeakAutoResume).volatile(),
  weekendMode: z.boolean().default(DEFAULT_SETTINGS.weekendMode).volatile(),
  timezone: z.string().default(DEFAULT_SETTINGS.timezone).volatile(),
  peakWindows: z
    .array(z.object({ start: z.string(), end: z.string() }))
    .default(DEFAULT_SETTINGS.peakWindows)
    .volatile(),
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
 * dsh settings 服务的最小本地接口（仿 dsh-thinking-levels 的 local face）：
 * 插件不 value-import `@deepseek-ai/dsh-settings`，只通过这些形状在注入面调用。
 */

// 0.1.7：设置面改声明式 —— SettingsSchema 的 volatile 字段即自动表单，
// 不再有任何 register 调用；运行时经 apply 的组合条目（live ref）读取。


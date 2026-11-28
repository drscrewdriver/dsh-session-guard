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

/** 高峰窗口（"HH:mm"，左闭右开）。 */
export interface PeakWindowConfig {
  start: string
  end: string
}

/** 拦截方式：hold（挂起不报错）/ error（抛错 + 记延后队列）。 */
export type DeferredMode = 'hold' | 'error'

/** 暂停模式（透传 pauseGate）。 */
export type PauseMode = 'safe' | 'force'

/** 暂停原因（透传 pauseGate）。 */
export type PauseReason = 'wait' | 'stop'

/**
 * 插件配置（**从 DEFAULT_SETTINGS 推导，不手写重复类型**）。
 *
 * 口径（tasks.md task_3.3）：schemastery 的 `SettingsSchema` 是运行期真源，
 * 这里用 `typeof DEFAULT_SETTINGS` 拿到同形状的静态类型——两处不会漂移，
 * 因为 DEFAULT_SETTINGS 的每个字段都在 schema 里有对应的 `.default(...)`。
 * 三个枚举字段用字面量联合收窄（schema 里是 `z.union([z.const(...)])`）。
 */
export type GuardConfig = {
  enabled: boolean
  offPeakAutoResume: boolean
  weekendMode: boolean
  holidayMode: boolean
  holidayAutoFetch: boolean
  timezone: string
  peakWindows: PeakWindowConfig[]
  pauseMode: PauseMode
  pauseReason: PauseReason
  stepLevelPause: boolean
  stepGateTimeoutMs: number
  queueFallback: boolean
  retryEnabled: boolean
  retryText: string
  retryGraceMs: number
  retryCooldownMs: number
  retryBackoffFactor: number
  retryBackoffMaxMs: number
  retryMaxConsecutive: number
  retryPauseWhenOffline: boolean
  retryOfflineCheckMs: number
  providerGuard: boolean
  officialProviders: string[]
  officialBaseURLs: string[]
  deferredResume: boolean
  deferredResumeText: string
  deferredMode: DeferredMode
  deferredMaxHoldMs: number
  guardSubagents: boolean
  pauseStopsJobs: boolean
  pauseStopsChildren: boolean
  pauseScopeDrainMs: number
  /** holidayMode 开启时由 readCfg 挂上的修正表（不在 schema 里）。 */
  holidayMap?: Map<string, boolean>
}

/** 默认配置（核心逻辑依赖；设置服务不可用时即用此值）。 */
export const DEFAULT_SETTINGS: Readonly<GuardConfig> = Object.freeze({
  enabled: true, // 高峰自动处理开关（简单开关）
  offPeakAutoResume: true, // 低谷自动恢复开关：低峰时段自动恢复被高峰暂停的会话
  weekendMode: true, // 周末模式开关：识别周末/休息日，无视峰谷（简单开关）
  holidayMode: true, // 法定节假日修正表：法定假视同周末，调休补班周末按工作日（简单开关）
  holidayAutoFetch: true, // 按年自动抓取 holiday-cn 修正表（关=只用内置+已缓存；启动仍校验缓存指纹）
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
  retryPauseWhenOffline: DEFAULT_RETRY.retryPauseWhenOffline, // 断网时暂停重试（默认关）
  retryOfflineCheckMs: DEFAULT_RETRY.retryOfflineCheckMs, // 挂起期间重探间隔
  // ── 官方 provider 二维判定（高峰 × 目标源）──
  providerGuard: true, // 二维判定总开关；关掉 = 现有纯时间判定
  officialProviders: [], // 追加的官方 provider id（精确匹配，最高优先级）
  officialBaseURLs: ['api.deepseek.com'], // 官方端点 host 名单
  deferredResume: true, // 退峰自动继续被延后的请求/会话
  deferredResumeText: '继续（高峰已过，自动继续）', // error 模式退峰 followup 文案
  deferredMode: 'hold', // hold（挂起不报错）/ error（抛错 + 记延后）
  deferredMaxHoldMs: 6 * 60 * 60 * 1000, // 挂起上限（6h），到期转 error
  guardSubagents: true, // 是否纳入子代理请求
  // ── 暂停资源范围（附加计划 A：后台任务 + 子会话）──
  pauseStopsJobs: true, // 暂停时停该会话的后台任务（默认开：属「暂停」应有之义）
  pauseStopsChildren: true, // 暂停时停该会话的子会话（默认开）
  pauseScopeDrainMs: 3000, // 等资源进入终态的有界超时（min 500）
})

/**
 * 设置 schema（schemastery 原生命令，zod 变体）：
 * - 枚举用 z.union([z.const(...)])；默认值用字段级 .default()。
 */
export const SettingsSchema = z.object({
  enabled: z.boolean().default(DEFAULT_SETTINGS.enabled).volatile(),
  offPeakAutoResume: z.boolean().default(DEFAULT_SETTINGS.offPeakAutoResume).volatile(),
  weekendMode: z.boolean().default(DEFAULT_SETTINGS.weekendMode).volatile(),
  holidayMode: z.boolean().default(DEFAULT_SETTINGS.holidayMode).volatile(),
  holidayAutoFetch: z.boolean().default(DEFAULT_SETTINGS.holidayAutoFetch).volatile(),
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
  retryPauseWhenOffline: z.boolean().default(DEFAULT_SETTINGS.retryPauseWhenOffline).volatile(),
  retryOfflineCheckMs: z.number().min(3000).default(DEFAULT_SETTINGS.retryOfflineCheckMs).volatile(),
  providerGuard: z.boolean().default(DEFAULT_SETTINGS.providerGuard).volatile(),
  officialProviders: z.array(z.string()).default(DEFAULT_SETTINGS.officialProviders).volatile(),
  officialBaseURLs: z.array(z.string()).default(DEFAULT_SETTINGS.officialBaseURLs).volatile(),
  deferredResume: z.boolean().default(DEFAULT_SETTINGS.deferredResume).volatile(),
  deferredResumeText: z.string().default(DEFAULT_SETTINGS.deferredResumeText).volatile(),
  deferredMode: z.union([z.const('hold'), z.const('error')]).default(DEFAULT_SETTINGS.deferredMode).volatile(),
  deferredMaxHoldMs: z.number().min(0).default(DEFAULT_SETTINGS.deferredMaxHoldMs).volatile(),
  guardSubagents: z.boolean().default(DEFAULT_SETTINGS.guardSubagents).volatile(),
  pauseStopsJobs: z.boolean().default(DEFAULT_SETTINGS.pauseStopsJobs).volatile(),
  pauseStopsChildren: z.boolean().default(DEFAULT_SETTINGS.pauseStopsChildren).volatile(),
  pauseScopeDrainMs: z.number().min(500).default(DEFAULT_SETTINGS.pauseScopeDrainMs).volatile(),
})

/**
 * dsh settings 服务的最小本地接口（仿 dsh-thinking-levels 的 local face）：
 * 插件不 value-import `@deepseek-ai/dsh-settings`，只通过这些形状在注入面调用。
 */

// 0.1.7：设置面改声明式 —— SettingsSchema 的 volatile 字段即自动表单，
// 不再有任何 register 调用；运行时经 apply 的组合条目（live ref）读取。


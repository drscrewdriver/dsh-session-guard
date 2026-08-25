/**
 * dsh-session-guard — 设置（fail-open）。
 *
 * 设置栈（@deepseek-ai/schemastery + @deepseek-ai/dsh-settings）是 dsh 原生组件，
 * 但本插件**不硬依赖**它们：
 * - schema 构建与设置注册全部走动态 import，并用 try/catch 包住；
 * - 原生设置栈可用 → 注册 设置 → 插件 → session-guard 子板块（简单开关）；
 * - 不可用（解析失败 / API 不符 / 版本缺失）→ 静默跳过，插件用 DEFAULT_SETTINGS
 *   照常运行，绝不因设置依赖而崩（fail-open）。
 */
import { DEFAULT_RETRY } from './retry.js'

/** 设置命名空间（设置 → 插件 → session-guard）。 */
export const NS = 'session-guard'

/** 默认配置（核心逻辑依赖；设置栈缺失时即用此值）。 */
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true, // ← 高峰自动处理开关（简单开关）
  weekendMode: true, // ← 周末模式开关：识别周末，无视峰谷（简单开关）
  timezone: 'Asia/Shanghai',
  peakWindows: [
    { start: '09:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  resumeOnWeekend: true, // 周末到了自动恢复（简单开关）
  pauseMode: 'safe', // 透传 taskControl.pause mode
  pauseReason: 'wait', // 透传 taskControl.pause reason
  queueFallback: true, // 无会话门时回退锁等待队列（简单开关）
  retryEnabled: false, // ← 自动重试开关（后端，D9；默认关，保守）
  retryText: DEFAULT_RETRY.retryText,
  retryGraceMs: DEFAULT_RETRY.retryGraceMs,
  retryCooldownMs: DEFAULT_RETRY.retryCooldownMs,
  retryBackoffFactor: DEFAULT_RETRY.retryBackoffFactor,
  retryBackoffMaxMs: DEFAULT_RETRY.retryBackoffMaxMs,
  retryMaxConsecutive: DEFAULT_RETRY.retryMaxConsecutive,
})

/**
 * 动态构建设置 schema（schemastery 原生命令，zod 变体）：
 * - 枚举用 z.union([z.const(...)])；
 * - 默认值用字段级 .default()；
 * 原生设置栈缺失或 API 不符时返回 null（fail-open）。
 */
async function tryLoadSchema() {
  try {
    const { default: z } = await import('@deepseek-ai/schemastery')
    const { settingsNamespace } = await import('@deepseek-ai/dsh-settings')
    const schema = z.object({
      enabled: z.boolean().default(DEFAULT_SETTINGS.enabled),
      weekendMode: z.boolean().default(DEFAULT_SETTINGS.weekendMode),
      timezone: z.string().default(DEFAULT_SETTINGS.timezone),
      peakWindows: z
        .array(z.object({ start: z.string(), end: z.string() }))
        .default(DEFAULT_SETTINGS.peakWindows),
      resumeOnWeekend: z.boolean().default(DEFAULT_SETTINGS.resumeOnWeekend),
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
    return { z, settingsNamespace, schema }
  } catch {
    return null
  }
}

/**
 * 注册 设置 → 插件 → session-guard 子板块（简单开关）。
 * @returns 注册成功 true；原生设置栈缺失时为 false（静默降级，插件照常用默认）。
 */
export async function registerSettings(ctx) {
  const loaded = await tryLoadSchema()
  if (!loaded) return false
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(loaded.settingsNamespace(NS), loaded.schema, { applies: 'live' })
  })
  return true
}

/**
 * time-policy.js 测试（v0.3.0 可配置峰谷策略）。
 *
 * 覆盖 spec §七 要求的前 4 项 + §六 的时间规则要求：
 *   1. 周一 10:00 进入 PEAK
 *   2. 周一 13:00 → NORMAL
 *   3. 周六全天 OFF_PEAK
 *   4. 周日全天 OFF_PEAK
 *   + 多个 peak 窗口 / 跨午夜窗口 / 自定义 timezone / 周末可配置 /
 *     窗口 days 过滤 / 无硬编码（全部来自配置）
 *
 * 时区换算（Asia/Shanghai = UTC+8）：
 *   2026-08-24 是周一，08-22 周六，08-23 周日。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  MODES,
  createTimePolicyResolver,
  normalizePeakWindows,
  normalizePolicy,
  normalizeWeekend,
  parseDay,
  parseDays,
  resolveVerdict,
  shouldPause,
  msUntilOffPeak,
  isValidTimeZone,
  stableStringify,
  windowMatches,
  zonedTimeToEpoch,
} from '../src/time-policy.js'
import { wallClock } from '../src/time.js'
import { loadConfigFile } from '../src/config-file.js'

/** spec §一 的配置形状（与 config/session-guard.json 一致）。 */
const CONFIG = {
  enabled: true,
  timezone: 'Asia/Shanghai',
  peakPolicy: {
    peakWindows: [
      { name: 'morning', start: '09:00', end: '12:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      { name: 'afternoon', start: '14:00', end: '18:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    ],
  },
  weekendPolicy: { enabled: true, days: ['sat', 'sun'], mode: 'offPeak' },
}

const at = (iso) => new Date(iso)
const r = (cfg = CONFIG) => createTimePolicyResolver(cfg)

// ── 1 & 2：工作日峰 / 谷 ────────────────────────────────────────────────

test('周一 10:00（北京）→ PEAK（spec §七.1）', () => {
  const v = r().resolve(at('2026-08-24T02:00:00Z'))
  assert.equal(v.mode, MODES.PEAK)
  assert.equal(v.reason, 'peak')
  assert.equal(v.windowName, 'morning')
  assert.equal(v.weekday, 1) // 周一
  assert.equal(v.weekend, false)
})

test('周一 13:00（北京）→ NORMAL（spec §七.2）', () => {
  const v = r().resolve(at('2026-08-24T05:00:00Z'))
  assert.equal(v.mode, MODES.NORMAL)
  assert.equal(v.reason, 'off-peak')
  assert.equal(v.windowName, null)
  assert.equal(v.weekday, 1)
})

test('周一 15:00（北京）→ PEAK（afternoon 窗口）', () => {
  const v = r().resolve(at('2026-08-24T07:00:00Z'))
  assert.equal(v.mode, MODES.PEAK)
  assert.equal(v.windowName, 'afternoon')
})

test('周一 12:00 与 18:00 是窗口右开边界 → NORMAL', () => {
  assert.equal(r().resolve(at('2026-08-24T04:00:00Z')).mode, MODES.NORMAL) // 12:00
  assert.equal(r().resolve(at('2026-08-24T10:00:00Z')).mode, MODES.NORMAL) // 18:00
})

test('周一 09:00 是窗口左闭边界 → PEAK', () => {
  assert.equal(r().resolve(at('2026-08-24T01:00:00Z')).mode, MODES.PEAK) // 09:00
})

// ── 3 & 4：周末全天 OFF_PEAK ────────────────────────────────────────────

test('周六全天 OFF_PEAK，即使落在 peak 窗口内（spec §七.3）', () => {
  const resolver = r()
  for (const iso of ['2026-08-21T16:00:00Z', '2026-08-22T02:00:00Z', '2026-08-22T08:00:00Z', '2026-08-22T15:59:00Z']) {
    const v = resolver.resolve(at(iso))
    assert.equal(v.mode, MODES.OFF_PEAK, `周六 ${iso} 应为 OFF_PEAK`)
    assert.equal(v.reason, 'weekend')
    assert.equal(v.weekend, true)
    assert.equal(v.weekday, 6)
  }
})

test('周日全天 OFF_PEAK，即使落在 peak 窗口内（spec §七.4）', () => {
  const resolver = r()
  for (const iso of ['2026-08-22T16:00:00Z', '2026-08-23T09:00:00Z', '2026-08-23T15:59:00Z']) {
    const v = resolver.resolve(at(iso))
    assert.equal(v.mode, MODES.OFF_PEAK, `周日 ${iso} 应为 OFF_PEAK`)
    assert.equal(v.weekday, 0)
  }
})

test('周末优先于 peak 窗口（spec §二 优先级 1 > 2）', () => {
  // 周六 10:00 完全落在 morning 窗口的钟点区间内，但周六不在窗口 days 里，
  // 且周末规则优先——无论 days 怎么配都必须 OFF_PEAK。
  const saturdayWindow = {
    ...CONFIG,
    peakPolicy: { ...CONFIG.peakPolicy, peakWindows: [{ name: 'all-week', start: '00:00', end: '23:59' }] },
  }
  assert.equal(r(saturdayWindow).resolve(at('2026-08-22T02:00:00Z')).mode, MODES.OFF_PEAK)
})

test('周末识别用 timezone（东京用户周六但北京还是周五）', () => {
  const tokyo = { ...CONFIG, timezone: 'Asia/Tokyo' }
  // 东京周六 00:30 = UTC 周五 15:30 = 北京周五 23:30
  const v = r(tokyo).resolve(at('2026-08-21T15:30:00Z'))
  assert.equal(v.mode, MODES.OFF_PEAK)
  assert.equal(v.weekday, 6)
  // 同一时刻按北京时间是周五 → 不在周末；北京 23:30 也不在峰内 → NORMAL
  assert.equal(r(CONFIG).resolve(at('2026-08-21T15:30:00Z')).mode, MODES.NORMAL)
})

test('weekendPolicy.enabled=false → 周末不再特殊，按窗口判定', () => {
  const off = { ...CONFIG, weekendPolicy: { enabled: false, days: ['sat', 'sun'], mode: 'offPeak' } }
  // 周六 10:00 不在窗口 days（mon-fri）里 → NORMAL
  assert.equal(r(off).resolve(at('2026-08-22T02:00:00Z')).mode, MODES.NORMAL)
})

test('weekendPolicy.days 可自定义（周五也算周末）', () => {
  const friWeekend = { ...CONFIG, weekendPolicy: { enabled: true, days: ['fri', 'sat'], mode: 'offPeak' } }
  // 周五 10:00 北京 = UTC 02:00
  const v = r(friWeekend).resolve(at('2026-08-21T02:00:00Z'))
  assert.equal(v.mode, MODES.OFF_PEAK)
  assert.equal(v.weekday, 5)
  // 周日 10:00 不再是周末；且周日不在窗口 days → NORMAL
  assert.equal(r(friWeekend).resolve(at('2026-08-23T02:00:00Z')).mode, MODES.NORMAL)
})

test('未知 weekendPolicy.mode → 拒绝并关掉周末规则（不静默放行）', () => {
  const errors = []
  const wk = normalizeWeekend({ enabled: true, days: ['sat'], mode: 'onPeak' }, undefined, errors)
  assert.equal(wk.enabled, false)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /not supported/)
})

// ── §六.1 多个 peak 窗口 ────────────────────────────────────────────────

test('多个 peak 窗口各自带 name，命中哪个就报哪个', () => {
  const many = {
    ...CONFIG,
    peakPolicy: {
      ...CONFIG.peakPolicy,
      peakWindows: [
        { name: 'dawn', start: '06:00', end: '07:00', days: ['mon'] },
        { name: 'morning', start: '09:00', end: '12:00', days: ['mon'] },
        { name: 'night', start: '22:00', end: '23:00', days: ['mon'] },
      ],
    },
  }
  assert.equal(r(many).resolve(at('2026-08-23T22:30:00Z')).windowName, 'dawn') // 周一 06:30
  assert.equal(r(many).resolve(at('2026-08-24T02:00:00Z')).windowName, 'morning')
  assert.equal(r(many).resolve(at('2026-08-24T14:30:00Z')).windowName, 'night')
})

// ── §六.2 跨午夜窗口 ────────────────────────────────────────────────────

test('跨午夜 peak 窗口 22:00-06:00 正确命中', () => {
  const overnight = {
    ...CONFIG,
    peakPolicy: { ...CONFIG.peakPolicy, peakWindows: [{ name: 'night', start: '22:00', end: '06:00' }] },
  }
  const resolver = r(overnight)
  assert.equal(resolver.resolve(at('2026-08-24T14:00:00Z')).mode, MODES.PEAK) // 周一 22:00
  assert.equal(resolver.resolve(at('2026-08-24T17:00:00Z')).mode, MODES.PEAK) // 周二 01:00
  assert.equal(resolver.resolve(at('2026-08-24T21:59:00Z')).mode, MODES.PEAK) // 周二 05:59
  assert.equal(resolver.resolve(at('2026-08-24T22:00:00Z')).mode, MODES.NORMAL) // 周二 06:00
  assert.equal(resolver.resolve(at('2026-08-24T04:00:00Z')).mode, MODES.NORMAL) // 周一 12:00
})

test('跨午夜窗口的 days 归属「起始日」（周五 22:00-06:00 覆盖周六 01:00）', () => {
  const friNight = {
    ...CONFIG,
    weekendPolicy: { enabled: false, days: [], mode: 'offPeak' }, // 关掉周末，让周六能被窗口命中
    peakPolicy: { ...CONFIG.peakPolicy, peakWindows: [{ name: 'fri-night', start: '22:00', end: '06:00', days: ['fri'] }] },
  }
  const resolver = r(friNight)
  // 周五 23:00 北京 = UTC 15:00
  assert.equal(resolver.resolve(at('2026-08-21T15:00:00Z')).mode, MODES.PEAK)
  // 周六 01:00 北京 = UTC 周五 17:00 → 属周五那次窗口 → 仍 PEAK
  assert.equal(resolver.resolve(at('2026-08-21T17:00:00Z')).mode, MODES.PEAK)
  // 周六 23:00 北京 = UTC 15:00（周六不在 days）→ NORMAL
  assert.equal(resolver.resolve(at('2026-08-22T15:00:00Z')).mode, MODES.NORMAL)
  // 周日 01:00 → 属周六那次窗口（周六不在 days）→ NORMAL
  assert.equal(resolver.resolve(at('2026-08-22T17:00:00Z')).mode, MODES.NORMAL)
})

test('windowMatches：非跨午夜窗口按当日 days 过滤', () => {
  const w = { startMin: 540, endMin: 720, days: new Set([1]) }
  assert.equal(windowMatches(w, 1, 600), true)
  assert.equal(windowMatches(w, 2, 600), false)
  assert.equal(windowMatches({ ...w, days: null }, 3, 600), true)
})

test('两条规则的交互：周六午夜的跨午夜窗口，周末规则开/关结论相反', () => {
  // 窗口 22:00-06:00、只归周六；周末 = 周六 + 周日
  const windows = [{ name: 'sat-night', start: '22:00', end: '06:00', days: ['sat'] }]
  const withWeekend = { ...CONFIG, peakPolicy: { ...CONFIG.peakPolicy, peakWindows: windows } }
  const noWeekend = { ...withWeekend, weekendPolicy: { enabled: false, days: ['sat', 'sun'], mode: 'offPeak' } }

  const rw = r(withWeekend)
  const rn = r(noWeekend)

  // 周六 23:00 北京 = UTC 15:00 —— 周末优先 → OFF_PEAK；关掉周末规则 → 命中窗口 → PEAK
  assert.equal(rw.resolve(at('2026-08-22T15:00:00Z')).mode, MODES.OFF_PEAK)
  assert.equal(rn.resolve(at('2026-08-22T15:00:00Z')).mode, MODES.PEAK)

  // 周日 01:00 北京 = UTC 周六 17:00 —— 跨午夜，归「周六」那次窗口
  assert.equal(rw.resolve(at('2026-08-22T17:00:00Z')).mode, MODES.OFF_PEAK) // 周日仍是周末
  assert.equal(rn.resolve(at('2026-08-22T17:00:00Z')).mode, MODES.PEAK) // days=['sat'] 覆盖到周日凌晨

  // 周日 23:00 北京 = UTC 15:00 —— 窗口起始日是周日（不在 days）→ 两边都 NORMAL
  assert.equal(rw.resolve(at('2026-08-23T15:00:00Z')).mode, MODES.OFF_PEAK) // 周日仍是周末
  assert.equal(rn.resolve(at('2026-08-23T15:00:00Z')).mode, MODES.NORMAL)

  // 周六 10:00 北京 = UTC 02:00 —— 不在 22:00-06:00 内
  assert.equal(rw.resolve(at('2026-08-22T02:00:00Z')).mode, MODES.OFF_PEAK)
  assert.equal(rn.resolve(at('2026-08-22T02:00:00Z')).mode, MODES.NORMAL)

  // 周末规则开启时，msUntilOffPeak 在窗口内取更早的「周末起点」= 0（已经是周末）
  assert.equal(rw.msUntilOffPeak(at('2026-08-22T15:00:00Z')), 0)
  // 关闭时取窗口结束（周六 06:00 次日 = 7h）
  assert.equal(rn.msUntilOffPeak(at('2026-08-22T15:00:00Z')), 7 * 60 * 60 * 1000)
})

// ── §六.3 自定义 timezone ───────────────────────────────────────────────

test('timezone 驱动峰窗口判定（北京 12:00 = 东京 13:00，按东京是谷时）', () => {
  // 北京周三 12:00 = UTC 04:00 = 东京周三 13:00 → 东京不在 [09,12) 也不在 [14,18)
  assert.equal(r({ ...CONFIG, timezone: 'Asia/Tokyo' }).resolve(at('2026-08-19T04:00:00Z')).mode, MODES.NORMAL)
  // 同一时刻按北京时间是 12:00（窗口右开）→ 也是 NORMAL；换 03:00Z（北京 11:00 峰 / 东京 12:00 谷）验证差异
  assert.equal(r(CONFIG).resolve(at('2026-08-19T03:00:00Z')).mode, MODES.PEAK) // 北京 11:00
  assert.equal(r({ ...CONFIG, timezone: 'Asia/Tokyo' }).resolve(at('2026-08-19T03:00:00Z')).mode, MODES.NORMAL) // 东京 12:00
})

test('peakPolicy.timezone 把峰谷钉在计费基准时区，周末仍按本地时区', () => {
  const pinned = {
    ...CONFIG,
    timezone: 'Asia/Tokyo',
    peakPolicy: { ...CONFIG.peakPolicy, timezone: 'Asia/Shanghai' },
  }
  const resolver = r(pinned)
  assert.equal(resolver.policy.peakTimezone, 'Asia/Shanghai')
  assert.equal(resolver.policy.timezone, 'Asia/Tokyo')
  // 北京 11:00 = 东京 12:00：峰按北京 → PEAK
  assert.equal(resolver.resolve(at('2026-08-19T03:00:00Z')).mode, MODES.PEAK)
  // 东京周六 00:30 = 北京周五 23:30：周末按东京 → OFF_PEAK
  assert.equal(resolver.resolve(at('2026-08-21T15:30:00Z')).mode, MODES.OFF_PEAK)
})

test('顶层 peakTimezone 扁平键与 peakPolicy.timezone 等价', () => {
  const flat = { enabled: true, timezone: 'Asia/Tokyo', peakTimezone: 'Asia/Shanghai', peakWindows: [{ start: '09:00', end: '12:00' }], weekendMode: true }
  assert.equal(r(flat).policy.peakTimezone, 'Asia/Shanghai')
  assert.equal(r(flat).resolve(at('2026-08-19T03:00:00Z')).mode, MODES.PEAK) // 北京 11:00
})

// ── 热路径 memo（resolverFor）不得漏字段 ────────────────────────────────
// 曾经的 bug：policySignature 只挑了「看起来相关」的字段，漏掉扁平键 peakTimezone
// → 改 peakTimezone 后 memo 继续返回旧策略，而 /peak、snapshot() 建的是新 resolver，
//   UI 与真正执行的判定路径口径不一致。

test('resolverFor：改扁平 peakTimezone 必须重建 resolver（memo 不漏字段）', () => {
  const before = { enabled: true, timezone: 'Asia/Tokyo', peakTimezone: 'Asia/Tokyo', peakWindows: [{ name: 'w', start: '09:00', end: '12:00' }], weekendMode: true }
  const after = { ...before, peakTimezone: 'Asia/Shanghai' }
  // 周一 00:30Z = 东京 09:30（峰）/ 上海 08:30（谷）
  const instant = at('2026-08-24T00:30:00Z')

  assert.equal(createTimePolicyResolver(before).resolve(instant).mode, MODES.PEAK)
  assert.equal(createTimePolicyResolver(after).resolve(instant).mode, MODES.NORMAL)

  // 经 memo 的路径必须与「新建 resolver」一致
  assert.equal(resolveVerdict(before, instant).mode, MODES.PEAK)
  assert.equal(resolveVerdict(after, instant).mode, MODES.NORMAL, 'memo 返回了过期策略')
})

test('resolverFor：改 weekendDays / weekendPolicyMode 也必须重建', () => {
  const base = { enabled: true, timezone: 'Asia/Shanghai', peakWindows: [{ name: 'w', start: '09:00', end: '12:00' }], weekendMode: true, weekendDays: ['sat', 'sun'] }
  const instant = at('2026-08-21T02:00:00Z') // 周五 10:00，在峰窗口内
  assert.equal(resolveVerdict(base, instant).mode, MODES.PEAK) // 周五非周末 → 峰
  const friOff = { ...base, weekendDays: ['fri', 'sat'] }
  assert.equal(resolveVerdict(friOff, instant).mode, MODES.OFF_PEAK, 'memo 忽略了 weekendDays 变化')
  // 周末规则关掉 → 回到 PEAK
  assert.equal(resolveVerdict({ ...base, weekendMode: false }, instant).mode, MODES.PEAK)
})

test('resolverFor：决策路径与「新建 resolver」在同一时刻永远一致（含峰时区钉扎）', () => {
  const configs = [
    CONFIG,
    { ...CONFIG, timezone: 'Asia/Tokyo' },
    { ...CONFIG, timezone: 'America/New_York', peakPolicy: { ...CONFIG.peakPolicy, timezone: 'Asia/Shanghai' } },
    { ...CONFIG, weekendPolicy: { enabled: false, days: ['sat', 'sun'], mode: 'offPeak' } },
    { ...CONFIG, peakPolicy: { ...CONFIG.peakPolicy, peakWindows: [{ name: 'n', start: '22:00', end: '06:00' }] } },
  ]
  for (const cfg of configs) {
    for (let step = 0; step < 24 * 4; step += 1) {
      const instant = new Date(Date.UTC(2026, 7, 20, 0, 0, 0) + step * 3_600_000)
      // 注意：交错调用不同 cfg，专门施压那条 1 槽 memo
      const fresh = createTimePolicyResolver(cfg).resolve(instant)
      const memoized = resolveVerdict(cfg, instant)
      assert.equal(
        memoized.mode,
        fresh.mode,
        `memo 与 fresh 不一致 cfg.timezone=${cfg.timezone} at ${instant.toISOString()}`,
      )
      assert.equal(memoized.windowName, fresh.windowName)
      assert.equal(msUntilOffPeak(cfg, instant), createTimePolicyResolver(cfg).msUntilOffPeak(instant))
    }
  }
})

test('isValidTimeZone / stableStringify 基础行为', () => {
  assert.equal(isValidTimeZone('Asia/Shanghai'), true)
  assert.equal(isValidTimeZone('UTC'), true)
  assert.equal(isValidTimeZone('Asia/Shangai'), false)
  assert.equal(isValidTimeZone(''), false)
  assert.equal(isValidTimeZone(null), false)
  assert.equal(isValidTimeZone(7), false)
  // stableStringify：键序无关
  assert.equal(stableStringify({ a: 1, b: [2, { c: 3, d: 4 }] }), stableStringify({ b: [2, { d: 4, c: 3 }], a: 1 }))
  assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }))
  assert.equal(stableStringify(undefined), 'undefined')
  assert.equal(stableStringify(null), 'null')
  assert.equal(stableStringify([1, 'x', null]), '[1,"x",null]')
})

test('normalizePolicy：非法时区回退默认并记 error（不让 resolve 抛 RangeError）', () => {
  const errors = []
  const p = normalizePolicy({ timezone: 'Asia/Shangai', peakTimezone: 'Mars/Olympus' }, errors)
  assert.equal(p.timezone, 'Asia/Shanghai')
  assert.equal(p.peakTimezone, 'Asia/Shanghai')
  assert.equal(errors.length, 2)
  // 绝不抛
  assert.doesNotThrow(() => createTimePolicyResolver({ timezone: 'nope/nope' }).resolve(new Date()))
})

// ── §六.5 全部规则来自配置（无硬编码）────────────────────────────────────

test('没有硬编码 09:00-12:00 / 14:00-18:00：只改配置就能换窗口', () => {
  const custom = {
    ...CONFIG,
    peakPolicy: { ...CONFIG.peakPolicy, peakWindows: [{ name: 'only-2030', start: '20:30', end: '21:00' }] },
  }
  const resolver = r(custom)
  assert.equal(resolver.resolve(at('2026-08-24T02:00:00Z')).mode, MODES.NORMAL) // 周一 10:00 不再是峰
  assert.equal(resolver.resolve(at('2026-08-24T12:30:00Z')).mode, MODES.PEAK) // 周一 20:30
})

test('enabled=false → NORMAL / reason disabled', () => {
  const v = r({ ...CONFIG, enabled: false }).resolve(at('2026-08-24T02:00:00Z'))
  assert.equal(v.mode, MODES.NORMAL)
  assert.equal(v.reason, 'disabled')
})

test('peakWindows 为空 → 永远 NORMAL（工作日）', () => {
  const empty = { ...CONFIG, peakPolicy: { ...CONFIG.peakPolicy, peakWindows: [] } }
  assert.equal(r(empty).resolve(at('2026-08-24T02:00:00Z')).mode, MODES.NORMAL)
})

// ── minutesUntilPeak（spec §三 提醒条件）────────────────────────────────

test('minutesUntilPeak：周一 08:35 → 25 分钟；周一 08:00 → 60 分钟', () => {
  const resolver = r()
  assert.equal(resolver.minutesUntilPeak(at('2026-08-24T00:35:00Z')), 25)
  assert.equal(resolver.minutesUntilPeak(at('2026-08-24T00:00:00Z')), 60)
})

test('minutesUntilPeak：已在峰内 / 周末 → null', () => {
  const resolver = r()
  assert.equal(resolver.minutesUntilPeak(at('2026-08-24T02:00:00Z')), null) // 峰内
  assert.equal(resolver.minutesUntilPeak(at('2026-08-22T02:00:00Z')), null) // 周六
})

test('minutesUntilPeak：跳过周末，直接指向周一第一个窗口', () => {
  // 周五 18:30 北京 = UTC 10:30 → 下一个峰是周一 09:00
  const resolver = r()
  const minutes = resolver.minutesUntilPeak(at('2026-08-21T10:30:00Z'))
  assert.equal(minutes, 60 * 24 * 2 + 14.5 * 60) // 周五18:30 → 周一09:00 = 62.5h
})

test('nextPeakOccurrence：给出是哪个窗口', () => {
  // 周一 08:30 北京 = UTC 00:30 → 下一个峰是当天 09:00 的 morning
  const occ = r().nextPeakOccurrence(at('2026-08-24T00:30:00Z'))
  assert.equal(occ.name, 'morning')
  assert.equal(occ.at, Date.UTC(2026, 7, 24, 1, 0, 0)) // 北京 09:00
  // 周一 09:30（已在 morning 内）→ 下一个是 afternoon 14:00
  assert.equal(r().nextPeakOccurrence(at('2026-08-24T01:30:00Z')).name, 'afternoon')
})

test('nextPeakOccurrence：周末日不产生候选，直接指向下个工作日', () => {
  const occ = r().nextPeakOccurrence(at('2026-08-22T02:00:00Z')) // 周六 10:00
  assert.equal(occ.name, 'morning')
  // 周六 10:00 北京 → 下周一 09:00 北京 = UTC 周一 01:00
  assert.equal(occ.at, Date.UTC(2026, 7, 24, 1, 0, 0))
})

// ── msUntilOffPeak（退峰定时）──────────────────────────────────────────

test('msUntilOffPeak：峰中 → 距窗口结束；谷时 → 0', () => {
  const resolver = r()
  assert.equal(resolver.msUntilOffPeak(at('2026-08-24T02:00:00Z')), 2 * 60 * 60 * 1000) // 10:00 → 12:00
  assert.equal(resolver.msUntilOffPeak(at('2026-08-24T05:00:00Z')), 0) // 13:00 谷时
  assert.equal(resolver.msUntilOffPeak(at('2026-08-22T02:00:00Z')), 0) // 周六
})

test('msUntilOffPeak：窗口跨进周末 → 取周末起点（更早）', () => {
  const overnight = {
    ...CONFIG,
    peakPolicy: { ...CONFIG.peakPolicy, peakWindows: [{ name: 'night', start: '22:00', end: '06:00' }] },
  }
  // 周五 23:00 北京 = UTC 15:00 → 窗口到周六 06:00，但周六 00:00 已是周末 → 1h
  assert.equal(r(overnight).msUntilOffPeak(at('2026-08-21T15:00:00Z')), 60 * 60 * 1000)
})

test('msUntilOffPeak：非法窗口不挂死 → 0', () => {
  const bad = { ...CONFIG, peakPolicy: { ...CONFIG.peakPolicy, peakWindows: [{ start: 'abc', end: 'xyz' }] } }
  assert.equal(r(bad).msUntilOffPeak(at('2026-08-24T02:00:00Z')), 0)
})

// ── 适配层：shouldPause / resolveVerdict（所有既有调用点的入口）──────────

test('shouldPause 适配层：pause = (mode === PEAK)，reason 沿用 v0.2.0 取值', () => {
  assert.deepEqual(shouldPause(CONFIG, at('2026-08-24T02:00:00Z')), { pause: true, reason: 'peak' })
  assert.deepEqual(shouldPause(CONFIG, at('2026-08-24T05:00:00Z')), { pause: false, reason: 'off-peak' })
  assert.deepEqual(shouldPause(CONFIG, at('2026-08-22T02:00:00Z')), { pause: false, reason: 'weekend' })
  assert.deepEqual(shouldPause({ ...CONFIG, enabled: false }, at('2026-08-24T02:00:00Z')), { pause: false, reason: 'disabled' })
})

test('msUntilOffPeak 适配层与 resolver 一致', () => {
  assert.equal(msUntilOffPeak(CONFIG, at('2026-08-24T02:00:00Z')), 2 * 60 * 60 * 1000)
  assert.equal(msUntilOffPeak(CONFIG, at('2026-08-22T02:00:00Z')), 0)
})

test('resolveVerdict 带窗口名', () => {
  const v = resolveVerdict(CONFIG, at('2026-08-24T07:00:00Z'))
  assert.equal(v.pause, true)
  assert.equal(v.mode, MODES.PEAK)
  assert.equal(v.windowName, 'afternoon')
})

// ── 归一化：兼容 v0.2.0 旧形态 ─────────────────────────────────────────

test('旧形态 peakWindows[{start,end}] + weekendMode 仍可用', () => {
  const legacy = {
    enabled: true,
    weekendMode: true,
    timezone: 'Asia/Shanghai',
    peakWindows: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
  }
  const resolver = r(legacy)
  assert.equal(resolver.resolve(at('2026-08-24T02:00:00Z')).mode, MODES.PEAK)
  assert.equal(resolver.resolve(at('2026-08-24T05:00:00Z')).mode, MODES.NORMAL)
  assert.equal(resolver.resolve(at('2026-08-22T02:00:00Z')).mode, MODES.OFF_PEAK)
  // 旧形态窗口没有 days → 每天生效
  assert.equal(resolver.policy.windows[0].days, null)
  assert.equal(resolver.policy.weekend.days.join(','), '0,6')
})

test('parseDay / parseDays 容错', () => {
  assert.equal(parseDay('mon'), 1)
  assert.equal(parseDay('Monday'), 1)
  assert.equal(parseDay('MON'), 1)
  assert.equal(parseDay('tues'), 2)
  assert.equal(parseDay('sun'), 0)
  assert.equal(parseDay(3), 3)
  assert.equal(parseDay('noday'), null)
  assert.equal(parseDay(''), null)
  assert.equal(parseDay(null), null)
  assert.deepEqual([...parseDays(['mon', 'bad', 'fri'])].sort(), [1, 5])
  assert.equal(parseDays(['bad']), null)
  assert.equal(parseDays([]), null)
  assert.equal(parseDays(undefined), null)
})

test('normalizePeakWindows 丢弃非法项、保留 name/days', () => {
  const out = normalizePeakWindows([
    { name: 'ok', start: '09:00', end: '12:00', days: ['mon'] },
    { start: 'abc', end: '12:00' },
    { start: '10:00', end: '10:00' }, // 空窗口
    null,
    'nope',
    { start: '22:00', end: '06:00' }, // 无 name → 自动命名
  ])
  assert.equal(out.length, 2)
  assert.equal(out[0].name, 'ok')
  assert.deepEqual([...out[0].days], [1])
  assert.equal(out[1].name, '22:00-06:00')
  assert.equal(out[1].days, null)
})

test('normalizePolicy 缺省时回退 BILLING_TIMEZONE 语义（Asia/Shanghai）', () => {
  const p = normalizePolicy({})
  assert.equal(p.timezone, 'Asia/Shanghai')
  assert.equal(p.peakTimezone, 'Asia/Shanghai')
  assert.equal(p.enabled, true)
})

// ── 随包发布的 config/session-guard.json 必须真的可用 ────────────────────

test('config/session-guard.json（仓库自带）可加载且判定符合 spec §七.1-4', () => {
  const pluginDir = fileURLToPath(new URL('..', import.meta.url))
  const loaded = loadConfigFile({ env: {}, cwd: '\\definitely\\not\\here', pluginDir })
  assert.equal(loaded.errors.length, 0, `config errors: ${loaded.errors.join('; ')}`)
  assert.match(loaded.path, /config[\\/]session-guard\.json$/)

  const resolver = r(loaded.settings)
  assert.equal(resolver.resolve(at('2026-08-24T02:00:00Z')).mode, MODES.PEAK) // 周一 10:00
  assert.equal(resolver.resolve(at('2026-08-24T05:00:00Z')).mode, MODES.NORMAL) // 周一 13:00
  assert.equal(resolver.resolve(at('2026-08-22T02:00:00Z')).mode, MODES.OFF_PEAK) // 周六
  assert.equal(resolver.resolve(at('2026-08-23T09:00:00Z')).mode, MODES.OFF_PEAK) // 周日
  // 文件里的可配置项被带出来
  assert.deepEqual(loaded.settings.weekendDays, ['sat', 'sun'])
  assert.equal(loaded.settings.weekendMode, true)
  assert.equal(loaded.settings.peakWindows.length, 2)
  assert.deepEqual(loaded.settings.peakWindows[0].days, ['mon', 'tue', 'wed', 'thu', 'fri'])
})

test('仓库自带 config 与 spec §一 的示例逐字一致', () => {
  const p = fileURLToPath(new URL('../config/session-guard.json', import.meta.url))
  const raw = JSON.parse(readFileSync(p, 'utf8'))
  assert.equal(raw.enabled, true)
  assert.equal(raw.timezone, 'Asia/Shanghai')
  assert.deepEqual(Object.keys(raw).sort(), ['enabled', 'peakPolicy', 'timezone', 'weekendPolicy'])
  assert.deepEqual(Object.keys(raw.peakPolicy).sort(), ['peakWindows'])
  assert.equal(raw.peakPolicy.peakWindows.length, 2)
  assert.equal(raw.peakPolicy.peakWindows[0].name, 'morning')
  assert.equal(raw.peakPolicy.peakWindows[0].start, '09:00')
  assert.equal(raw.peakPolicy.peakWindows[0].end, '12:00')
  assert.equal(raw.peakPolicy.peakWindows[1].name, 'afternoon')
  assert.equal(raw.peakPolicy.peakWindows[1].start, '14:00')
  assert.equal(raw.peakPolicy.peakWindows[1].end, '18:00')
  assert.deepEqual(raw.weekendPolicy, { enabled: true, days: ['sat', 'sun'], mode: 'offPeak' })
})

// ── zonedTimeToEpoch ───────────────────────────────────────────────────

test('zonedTimeToEpoch：Asia/Shanghai 09:00 = UTC 01:00', () => {
  assert.equal(zonedTimeToEpoch('Asia/Shanghai', 2026, 8, 24, 9 * 60), Date.UTC(2026, 7, 24, 1, 0, 0))
})

// ── 不变量（属性测试）：峰时区 ≠ 本地时区时仍自洽 ───────────────────────

test('不变量：nextPeakOccurrence 永远给出「未来 + 命中窗口 days + 非本地周末」的时刻', () => {
  // 峰谷钉在北京时间（计费基准），但用户在纽约（本地周末按纽约判定）——两者日历日相差半天到一天。
  const cfg = {
    enabled: true,
    timezone: 'America/New_York',
    peakPolicy: {
      timezone: 'Asia/Shanghai',
      peakWindows: [{ name: 'work', start: '09:00', end: '12:00', days: ['mon', 'wed', 'fri'] }],
    },
    weekendPolicy: { enabled: true, days: ['sat', 'sun'], mode: 'offPeak' },
  }
  const resolver = r(cfg)
  const window = resolver.policy.windows[0]
  const start = Date.UTC(2026, 7, 20, 0, 0, 0) // 2026-08-20
  let checked = 0

  for (let step = 0; step < 24 * 21; step += 1) {
    const now = new Date(start + step * 60 * 60 * 1000) // 逐小时扫 3 周
    const occ = resolver.nextPeakOccurrence(now)
    assert.notEqual(occ, null, `${now.toISOString()} 应能找到下一个峰`)

    // (a) 严格在未来
    assert.ok(occ.at > now.getTime(), `${now.toISOString()} → 峰时刻必须在未来`)
    // (b) 该时刻的「峰时区」周几必须在窗口 days 里
    const wcPeak = wallClock('Asia/Shanghai', new Date(occ.at))
    assert.ok(window.days.has(wcPeak.weekday), `${new Date(occ.at).toISOString()} 的北京周几 ${wcPeak.weekday} 必须在 days 内`)
    // (c) 该时刻不能落在本地（纽约）周末
    const wcLocal = wallClock('America/New_York', new Date(occ.at))
    assert.ok(!(wcLocal.weekday === 0 || wcLocal.weekday === 6), `${new Date(occ.at).toISOString()} 不得落在纽约周末`)
    // (d) 该时刻确实是 PEAK（与 resolve 自洽）
    assert.equal(resolver.resolve(new Date(occ.at)).mode, MODES.PEAK, `${new Date(occ.at).toISOString()} 应为 PEAK`)
    // (e) 没有更早的峰被漏掉：
    //     若 now 本身已在峰内，nextPeakOccurrence 语义上给的是「下一个」峰，
    //     因此只要求它晚于当前峰的结束；否则 now→occ.at 之间不得出现 PEAK。
    if (resolver.resolve(now).mode === MODES.PEAK) {
      assert.ok(occ.at > resolver.currentPeakEnd(now), `${now.toISOString()} 峰内 → 下一个峰必须晚于当前峰结束`)
    } else {
      for (let m = now.getTime() + 60_000; m < occ.at; m += 5 * 60_000) {
        assert.notEqual(resolver.resolve(new Date(m)).mode, MODES.PEAK, `${new Date(m).toISOString()} 不应已是 PEAK`)
      }
    }
    checked += 1
  }
  assert.equal(checked, 24 * 21)
})

test('不变量：minutesUntilPeak 与 nextPeakOccurrence 一致，且非 NORMAL 时为 null', () => {
  const cfg = {
    enabled: true,
    timezone: 'America/New_York',
    peakPolicy: { timezone: 'Asia/Shanghai', peakWindows: [{ name: 'w', start: '09:00', end: '18:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] }] },
    weekendPolicy: { enabled: true, days: ['sat', 'sun'], mode: 'offPeak' },
  }
  const resolver = r(cfg)
  const start = Date.UTC(2026, 7, 20, 0, 0, 0)
  for (let step = 0; step < 24 * 7; step += 1) {
    const now = new Date(start + step * 3_600_000)
    const resolved = resolver.resolve(now)
    const minutes = resolver.minutesUntilPeak(now)
    if (resolved.mode === MODES.NORMAL) {
      const occ = resolver.nextPeakOccurrence(now)
      assert.equal(minutes, (occ.at - now.getTime()) / 60_000, `${now.toISOString()} 分钟数应与 nextPeakOccurrence 一致`)
      assert.ok(minutes > 0)
    } else {
      assert.equal(minutes, null, `${now.toISOString()} mode=${resolved.mode} 时应为 null`)
    }
  }
})

test('不变量：msUntilOffPeak > 0 当且仅当当前是 PEAK', () => {
  const cfg = {
    enabled: true,
    timezone: 'America/New_York',
    peakPolicy: { timezone: 'Asia/Shanghai', peakWindows: [{ name: 'w', start: '09:00', end: '12:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] }] },
    weekendPolicy: { enabled: true, days: ['sat', 'sun'], mode: 'offPeak' },
  }
  const resolver = r(cfg)
  const start = Date.UTC(2026, 7, 20, 0, 0, 0)
  for (let step = 0; step < 24 * 7; step += 1) {
    const now = new Date(start + step * 3_600_000)
    const ms = resolver.msUntilOffPeak(now)
    if (resolver.resolve(now).mode === MODES.PEAK) {
      assert.ok(ms > 0, `${now.toISOString()} 在峰内 → msUntilOffPeak 应 > 0`)
      // 走到那个时刻必须已经退出 PEAK
      assert.notEqual(resolver.resolve(new Date(now.getTime() + ms)).mode, MODES.PEAK, `${now.toISOString()} 释放时刻应已离开 PEAK`)
    } else {
      assert.equal(ms, 0, `${now.toISOString()} 非峰 → msUntilOffPeak 应为 0`)
    }
  }
})

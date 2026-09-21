/**
 * config-file.js 测试：`config/session-guard.json` 的定位 / 读取 / 归一化。
 *
 * 重点：任何坏输入都**不抛异常**、不阻塞插件启动；非法字段被丢弃并记进 errors；
 * 合法字段完整映射到插件内部的扁平设置形态。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import {
  CONFIG_FILE_NAME,
  candidateConfigPaths,
  dshHomeDir,
  loadConfigFile,
  normalizeConfig,
  selectConfigPath,
} from '../src/config-file.js'

/** 内存文件系统（exists/readFile 注入，无需真实落盘）。 */
function memFs(files) {
  const map = new Map(Object.entries(files))
  return {
    exists: (p) => map.has(p),
    readFile: (p) => {
      if (!map.has(p)) throw new Error(`ENOENT: ${p}`)
      return map.get(p)
    },
  }
}

const j = (...parts) => join(...parts)

test('dshHomeDir：优先 $DSH_HOME，其次 HOME/.dsh', () => {
  assert.equal(dshHomeDir({ DSH_HOME: 'D:\\dsh' }), 'D:\\dsh')
  assert.equal(dshHomeDir({ HOME: '/home/u' }), j('/home/u', '.dsh'))
  assert.equal(dshHomeDir({ USERPROFILE: 'C:\\Users\\u' }), j('C:\\Users\\u', '.dsh'))
})

test('candidateConfigPaths：顺序为 env → DSH_HOME → cwd → plugin', () => {
  const paths = candidateConfigPaths({ env: { DSH_SESSION_GUARD_CONFIG: 'X:\\explicit.json', DSH_HOME: 'D:\\dsh' }, cwd: 'C:\\proj', pluginDir: 'C:\\plug' })
  assert.equal(paths[0], 'X:\\explicit.json')
  assert.equal(paths[1], j('D:\\dsh', 'config', CONFIG_FILE_NAME))
  assert.equal(paths[2], j('C:\\proj', 'config', CONFIG_FILE_NAME))
  assert.equal(paths[3], j('C:\\plug', 'config', CONFIG_FILE_NAME))
})

test('candidateConfigPaths：无 pluginDir 时少一个候选（仍含 DSH_HOME 与 cwd）', () => {
  const paths = candidateConfigPaths({ env: { DSH_HOME: 'D:\\dsh' }, cwd: 'C:\\proj' })
  assert.equal(paths.length, 2)
  assert.deepEqual(paths, [j('D:\\dsh', 'config', CONFIG_FILE_NAME), j('C:\\proj', 'config', CONFIG_FILE_NAME)])
  // env 完全为空时 dshHomeDir 用 HOME/USERPROFILE/cwd 兜底 → 仍是 2 个
  assert.equal(candidateConfigPaths({ env: {}, cwd: 'C:\\proj' }).length, 2)
})

test('selectConfigPath：返回第一个存在的；都不存在返回 null', () => {
  const fs = memFs({ b: '{}' })
  assert.equal(selectConfigPath(['a', 'b', 'c'], fs.exists), 'b')
  assert.equal(selectConfigPath(['x', 'y'], fs.exists), null)
})

test('selectConfigPath：exists 抛异常时不影响后续候选（fail-open）', () => {
  const boom = () => {
    throw new Error('EACCES')
  }
  assert.equal(selectConfigPath(['a'], boom), null)
  assert.equal(
    selectConfigPath(['a', 'b'], (p) => {
      if (p === 'a') throw new Error('EACCES')
      return true
    }),
    'b',
  )
})

test('loadConfigFile：命中并完整归一化 spec §一 配置', () => {
  const p = j('C:\\dsh', 'config', CONFIG_FILE_NAME)
  const fs = memFs({
    [p]: JSON.stringify({
      enabled: false,
      timezone: 'Asia/Tokyo',
      peakPolicy: {
        timezone: 'Asia/Shanghai',
        peakWindows: [{ name: 'night', start: '22:00', end: '06:00', days: ['fri', 'sat'] }],
      },
      weekendPolicy: { enabled: true, days: ['sun'], mode: 'offPeak' },
    }),
  })
  const out = loadConfigFile({ env: { DSH_HOME: 'C:\\dsh' }, cwd: 'C:\\none', ...fs })
  assert.equal(out.path, p)
  assert.deepEqual(out.errors, [])
  assert.deepEqual(out.settings, {
    enabled: false,
    timezone: 'Asia/Tokyo',
    peakTimezone: 'Asia/Shanghai',
    peakWindows: [{ name: 'night', start: '22:00', end: '06:00', days: ['fri', 'sat'] }],
    weekendMode: true,
    weekendDays: ['sun'],
    weekendPolicyMode: 'offPeak',
  })
})

test('loadConfigFile：只有一个候选存在时也能命中（cwd 优先于 plugin）', () => {
  const cwdPath = j('C:\\proj', 'config', CONFIG_FILE_NAME)
  const pluginPath = j('C:\\plug', 'config', CONFIG_FILE_NAME)
  const fs = memFs({ [cwdPath]: '{"enabled":true}', [pluginPath]: '{"enabled":false}' })
  const out = loadConfigFile({ env: {}, cwd: 'C:\\proj', pluginDir: 'C:\\plug', ...fs })
  assert.equal(out.path, cwdPath)
  assert.equal(out.settings.enabled, true)
})

test('loadConfigFile：无任何文件 → path null，空设置，不报错', () => {
  const out = loadConfigFile({ env: {}, cwd: 'C:\\none', ...memFs({}) })
  assert.equal(out.path, null)
  assert.deepEqual(out.settings, {})
  assert.deepEqual(out.errors, [])
})

test('loadConfigFile：JSON 坏掉 → 记 error、退回空设置（不抛异常）', () => {
  const p = j('C:\\proj', 'config', CONFIG_FILE_NAME)
  const out = loadConfigFile({ env: {}, cwd: 'C:\\proj', ...memFs({ [p]: '{ not json' }) })
  assert.equal(out.path, p)
  assert.deepEqual(out.settings, {})
  assert.equal(out.errors.length, 1)
  assert.match(out.errors[0], /invalid JSON/)
})

test('loadConfigFile：读文件失败 → 记 error、退回空设置', () => {
  const p = j('C:\\proj', 'config', CONFIG_FILE_NAME)
  const out = loadConfigFile({
    env: {},
    cwd: 'C:\\proj',
    exists: (x) => x === p,
    readFile: () => {
      throw new Error('EACCES')
    },
  })
  assert.equal(out.path, p)
  assert.deepEqual(out.settings, {})
  assert.match(out.errors[0], /cannot read config file/)
})

test('normalizeConfig：非对象根 → error', () => {
  assert.match(normalizeConfig([1, 2]).errors[0], /must be a JSON object/)
  assert.deepEqual(normalizeConfig(null), { settings: {}, errors: [] })
  assert.deepEqual(normalizeConfig(undefined), { settings: {}, errors: [] })
})

test('normalizeConfig：只产出 JSON 里出现的键（未出现的交给 DEFAULT_SETTINGS）', () => {
  const { settings, errors } = normalizeConfig({ timezone: 'UTC' })
  assert.deepEqual(settings, { timezone: 'UTC' })
  assert.deepEqual(errors, [])
})

test('normalizeConfig：非法标量被丢弃并记 error', () => {
  const { settings, errors } = normalizeConfig({
    enabled: 'yes',
    timezone: '',
    peakPolicy: { peakWindows: 'nope' },
    weekendPolicy: 'nope',
  })
  assert.equal(settings.enabled, undefined)
  assert.equal(settings.timezone, undefined)
  assert.equal(settings.peakWindows, undefined)
  // weekendPolicy 非对象 → 用默认（enabled true / sat,sun）
  assert.equal(settings.weekendMode, true)
  assert.deepEqual(settings.weekendDays, ['sat', 'sun'])
  assert.equal(errors.length, 4, errors.join(' | '))
})

test('normalizeConfig：删掉的 ask 字段即使出现在文件里也被忽略（不报错、不生效）', () => {
  const { settings, errors } = normalizeConfig({
    peakPolicy: { warningMinutes: 15, askTimeoutSeconds: 45, defaultAction: 'continue' },
  })
  assert.deepEqual(settings, {})
  assert.deepEqual(errors, [])
})

test('normalizeConfig：windows 非法项逐个丢弃，合法的保留', () => {
  const { settings, errors } = normalizeConfig({
    peakPolicy: {
      peakWindows: [
        { name: 'ok', start: '09:00', end: '12:00', days: ['mon', 'MON', 'tue'] },
        { start: '9:0', end: '12:00' },
        { start: '10:00', end: '10:00' },
        { start: '22:00', end: '06:00' },
      ],
    },
  })
  assert.equal(settings.peakWindows.length, 2)
  assert.deepEqual(settings.peakWindows[0].days, ['mon', 'tue']) // 去重且保序
  assert.equal(settings.peakWindows[1].name, '22:00-06:00')
  assert.equal(settings.peakWindows[1].days, undefined)
  assert.equal(errors.length, 2, errors.join(' | '))
})

test('normalizeConfig：peakWindows 不是数组 → error 且不覆盖默认窗口', () => {
  const { settings, errors } = normalizeConfig({ peakPolicy: { peakWindows: { start: '09:00' } } })
  assert.equal(settings.peakWindows, undefined)
  assert.match(errors[0], /must be an array/)
})

test('normalizeConfig：peakWindows 有项但全部非法 → error 且不覆盖默认窗口（防空转）', () => {
  const { settings, errors } = normalizeConfig({ peakPolicy: { peakWindows: [{ start: 'abc', end: 'xyz' }] } })
  assert.equal(settings.peakWindows, undefined)
  assert.equal(errors.length, 2, errors.join(' | '))
  assert.match(errors[1], /no valid window/)
})

test('normalizeConfig：显式空数组是合法意图（= 不要任何高峰窗口）', () => {
  const { settings, errors } = normalizeConfig({ peakPolicy: { peakWindows: [] } })
  assert.deepEqual(settings.peakWindows, [])
  assert.deepEqual(errors, [])
})

test('normalizeConfig：window days 全是非法名 → 记 error 并按每天生效', () => {
  const { settings, errors } = normalizeConfig({ peakPolicy: { peakWindows: [{ start: '09:00', end: '12:00', days: ['noday'] }] } })
  assert.equal(settings.peakWindows[0].days, undefined)
  assert.match(errors[0], /no valid day name/)
})

test('normalizeConfig：weekendPolicy.days 保留书写顺序', () => {
  const { settings } = normalizeConfig({ weekendPolicy: { enabled: true, days: ['sat', 'sun'], mode: 'offPeak' } })
  assert.deepEqual(settings.weekendDays, ['sat', 'sun'])
  assert.equal(settings.weekendMode, true)
  assert.equal(settings.weekendPolicyMode, 'offPeak')
})

test('normalizeConfig：weekendPolicy.enabled=false 透传', () => {
  const { settings } = normalizeConfig({ weekendPolicy: { enabled: false, days: ['sat'], mode: 'offPeak' } })
  assert.equal(settings.weekendMode, false)
})

test('normalizeConfig：未知 weekendPolicy.mode → 关掉周末规则并记 error', () => {
  const { settings, errors } = normalizeConfig({ weekendPolicy: { enabled: true, mode: 'workday' } })
  assert.equal(settings.weekendMode, false)
  assert.match(errors[0], /not supported/)
})

test('loadConfigFile 结果可直接喂给 registerSettings/effectiveDefaults 的 base 层', async () => {
  const { effectiveDefaults } = await import('../src/settings.js')
  const p = j('C:\\proj', 'config', CONFIG_FILE_NAME)
  const out = loadConfigFile({ env: {}, cwd: 'C:\\proj', ...memFs({ [p]: '{"peakPolicy":{"timezone":"Asia/Tokyo"}}' }) })
  const base = effectiveDefaults(out.settings)
  assert.equal(base.peakTimezone, 'Asia/Tokyo')
  // 未在文件里出现的键仍来自内置默认
  assert.equal(base.offPeakAutoResume, true)
  assert.equal(base.providerGuard, true)
  assert.equal(base.timezone, 'Asia/Shanghai')
})

// ══════════════════════════════════════════════════════════════════════
// 时区校验（BLOCKER 回归测试）
// 拼错的时区会让 wallClock 抛 RangeError → 被 tick 的 catch 吞掉 →
// 整个守卫静默失效（永不暂停）且用户看不到任何配置错误。必须在配置边界拦下。
// ══════════════════════════════════════════════════════════════════════

test('normalizeConfig：非法 IANA 时区被拒绝并记 error（不回退成静默失效）', () => {
  const { settings, errors } = normalizeConfig({ timezone: 'Asia/Shangai' })
  assert.equal(settings.timezone, undefined, '非法时区不得进入设置')
  assert.equal(errors.length, 1)
  assert.match(errors[0], /not a valid IANA time zone/)
})

test('normalizeConfig：非法 peakPolicy.timezone 同样被拒绝', () => {
  const { settings, errors } = normalizeConfig({ peakPolicy: { timezone: 'Mars/Olympus' } })
  assert.equal(settings.peakTimezone, undefined)
  assert.match(errors[0], /not a valid IANA time zone/)
})

test('normalizeConfig：合法时区（含别名）照常通过', () => {
  for (const tz of ['Asia/Shanghai', 'UTC', 'America/New_York', 'Asia/Calcutta']) {
    const { settings, errors } = normalizeConfig({ timezone: tz })
    assert.equal(settings.timezone, tz, `${tz} 应通过`)
    assert.deepEqual(errors, [])
  }
})

test('normalizeConfig：非字符串 / 空串时区被拒绝', () => {
  assert.match(normalizeConfig({ timezone: 42 }).errors[0], /non-empty string/)
  assert.match(normalizeConfig({ timezone: '' }).errors[0], /non-empty string/)
  assert.equal(normalizeConfig({ timezone: null }).settings.timezone, undefined)
})

test('时区校验的端到端效果：坏时区不会让 resolve() 抛错（守卫不会静默失效）', async () => {
  const { createTimePolicyResolver } = await import('../src/time-policy.js')
  const p = j('C:\\proj', 'config', CONFIG_FILE_NAME)
  const out = loadConfigFile({
    env: {},
    cwd: 'C:\\proj',
    ...memFs({ [p]: '{"timezone":"Asia/Shangai","peakPolicy":{"peakWindows":[{"name":"w","start":"09:00","end":"12:00"}]}}' }),
  })
  assert.equal(out.settings.timezone, undefined)
  assert.equal(out.errors.length, 1)
  // 关键：拿到坏配置也不会炸，仍按默认时区正常判定
  const resolver = createTimePolicyResolver(out.settings)
  assert.equal(resolver.policy.timezone, 'Asia/Shanghai')
  assert.doesNotThrow(() => resolver.resolve(new Date('2026-08-24T02:00:00Z')))
  assert.equal(resolver.resolve(new Date('2026-08-24T02:00:00Z')).mode, 'PEAK')
})

// ══════════════════════════════════════════════════════════════════════
// 与 settings schema 的校验一致性（否则设置面板会被静默摘掉）
// ══════════════════════════════════════════════════════════════════════

test('loadConfigFile + settingsBaseFor：文件值过不了 schema 时保住设置面板', async () => {
  const { settingsBaseFor, registerSettings } = await import('../src/settings.js')
  const p = j('C:\\proj', 'config', CONFIG_FILE_NAME)
  // 手工构造一个「合法 JSON 但过不了 schema」的值（weekendDays 里塞了非法类型），
  // 验证 settingsBaseFor 的兜底路径本身是可靠的。
  const out = { settings: { weekendDays: 'sat,sun' }, errors: [] }
  const { base, canonical, error } = settingsBaseFor(out.settings)
  assert.notEqual(error, null, 'schema 应拒绝非数组的 weekendDays')
  assert.deepEqual(base.weekendDays, ['sat', 'sun'], '回退内置默认')
  assert.deepEqual(canonical.weekendDays, ['sat', 'sun'])
  // 坏值也不该让 registerSettings 返回 false（否则设置面板消失）
  const registered = []
  const ok = registerSettings(
    { settings: { register: (ns, schema, opts) => registered.push({ ns, opts }) }, logger: { warn() {} } },
    out.settings,
  )
  assert.equal(ok, true)
  assert.equal(registered.length, 1)
  assert.deepEqual(registered[0].opts.base.weekendDays, ['sat', 'sun'])

  // 正常文件 → 不报错，base 就是文件值
  const good = loadConfigFile({ env: {}, cwd: 'C:\\proj', ...memFs({ [p]: '{"peakPolicy":{"timezone":"Asia/Tokyo"}}' }) })
  const sb = settingsBaseFor(good.settings)
  assert.equal(sb.error, null)
  assert.equal(sb.base.peakTimezone, 'Asia/Tokyo')
})

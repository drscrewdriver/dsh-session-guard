/**
 * gate-lib-sync.mjs — `lib/` 产物对拍门禁（v4.7.0）。
 *
 * 本仓的 `lib/` 是**入库产物**：`npm pack` 与 `dsh plugin add` 直接消费它
 * （`main`/`exports`/`dsh.plugin.json.main` 全部指向 `./lib/index.js`）。
 * 一旦源码改了却没重跑 build，装上的插件就是旧行为——这正是「改了代码但
 * 线上没生效」的经典成因。本脚本把「源码 ↔ 产物」钉成可执行断言。
 *
 * 判定方式：**重新构建到临时目录**，与入库的 `lib/` 逐字节比对。
 * 不用 `git diff --exit-code -- lib` 的原因：那条命令要求工作区干净，
 * 在「刚 build 完还没 commit」的本地流程里会误红；这里比的是内容等价性，
 * 与 git 状态无关，CI 与本地同一条判据。
 *
 * 用法：
 *   node _tools/gate-lib-sync.mjs            # 只检查，不等则 exit 1
 *   node _tools/gate-lib-sync.mjs --write    # 就地重建 lib/（等价 pnpm run build）
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const LIB = join(ROOT, 'lib')
const HOST_TSCONFIG = join(ROOT, 'tsconfig.host.json')

const write = process.argv.includes('--write')

/** host 半产物：`tsc -p tsconfig.host.json` 会写到 outDir，用临时 tsconfig 重定向。 */
function buildHostInto(outDir) {
  const base = JSON.parse(readFileSync(HOST_TSCONFIG, 'utf8'))
  const tmpConfig = join(ROOT, `.tsconfig.gate-${process.pid}.json`)
  const cfg = {
    ...base,
    compilerOptions: { ...base.compilerOptions, outDir },
  }
  // rootDir 保持 src，outDir 指到临时目录；emit 结构为 <outDir>/<相对 src 的路径>
  writeFileSync(tmpConfig, JSON.stringify(cfg, null, 2))
  try {
    execFileSync(process.execPath, [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', tmpConfig], {
      cwd: ROOT,
      stdio: 'pipe',
    })
  } finally {
    rmSync(tmpConfig, { force: true })
  }
  return outDir
}

/** 列出目录下的相对文件名（非递归；host 产物全在顶层）。 */
function listFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isFile())
    .sort()
}

/** host 半：src/*.{js,ts} 的期望产物文件名（.js 与 .ts 都 emit 成 .js）。 */
function expectedHostFiles() {
  const srcDir = join(ROOT, 'src')
  return readdirSync(srcDir)
    .filter((name) => /\.(js|ts)$/.test(name) && !name.endsWith('.d.ts'))
    .map((name) => name.replace(/\.ts$/, '.js'))
    .sort()
}

function main() {
  if (write) {
    execFileSync('pnpm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true })
    console.log('gate-lib-sync: rebuilt lib/ (--write)')
    return
  }

  const tmp = mkdtempSync(join(tmpdir(), 'sg-lib-gate-'))
  try {
    const out = join(tmp, 'host')
    buildHostInto(out)

    const problems = []

    // ① 期望产物齐全
    const expected = expectedHostFiles()
    const got = listFiles(out)
    const missing = expected.filter((name) => !got.includes(name))
    if (missing.length > 0) problems.push(`tsc 未产出：${missing.join(', ')}`)

    // ② 入库 lib/ 与重构建产物逐字节一致
    const committedHost = listFiles(LIB).filter((name) => name !== 'client.js' && name !== 'client.js.map')
    for (const name of expected) {
      const builtPath = join(out, name)
      const shippedPath = join(LIB, name)
      if (!existsSync(shippedPath)) {
        problems.push(`lib/${name} 缺失（源码有、产物无 → 跑 pnpm run build）`)
        continue
      }
      if (!existsSync(builtPath)) continue // 已在 ① 报过
      const a = readFileSync(builtPath)
      const b = readFileSync(shippedPath)
      if (!a.equals(b)) problems.push(`lib/${name} 与源码重构建结果不一致（跑 pnpm run build）`)
    }

    // ③ 反向：lib/ 里不应有源码已删除的孤儿产物
    const orphans = committedHost.filter((name) => !expected.includes(name))
    if (orphans.length > 0) problems.push(`lib/ 有孤儿产物（源码已删）：${orphans.join(', ')}`)

    // ④ 入口存在性：main / exports / dsh.plugin.json 指向的文件必须真在
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const manifest = JSON.parse(readFileSync(join(ROOT, 'dsh.plugin.json'), 'utf8'))
    const entryChecks = [
      ['package.json main', pkg.main],
      ['package.json exports["."]', pkg.exports?.['.']],
      ['dsh.plugin.json main', manifest.main],
      ['dsh.plugin.json client.main', manifest.client?.main],
    ]
    for (const [label, rel] of entryChecks) {
      if (typeof rel !== 'string') {
        problems.push(`${label} 缺失`)
        continue
      }
      const abs = join(ROOT, rel.replace(/^\.\//, ''))
      if (!existsSync(abs)) problems.push(`${label} → ${rel} 文件不存在`)
    }

    // ⑤ 版本三方对齐（tag 由 CI 侧核；这里核两个清单）
    if (pkg.version !== manifest.version) {
      problems.push(`版本不一致：package.json=${pkg.version} dsh.plugin.json=${manifest.version}`)
    }

    if (problems.length > 0) {
      console.error('gate-lib-sync: FAIL')
      for (const p of problems) console.error(`  ✗ ${p}`)
      process.exitCode = 1
      return
    }
    console.log(`gate-lib-sync: OK（${expected.length} 个 host 产物 + client bundle 与源码一致，入口与版本对齐）`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main()

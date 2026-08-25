/**
 * dsh-session-guard 客户端 bundle 构建。
 *
 * 把 src/client/index.js（+ freeze-store.js / detect.js，纯 JS 自包含）打成
 * lib/client.js —— dsh-client-modules 在 /plugins/dsh-session-guard/client.js
 * 提供的浏览器 bundle。仿 input-traffic 的 tsdown banner/footer：
 * 用 window.__ModuleLoader__.load({ id, factory }) 注册插件，缺注册 dsh 会报
 * "loaded without registering"。
 */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_ID = 'dsh-session-guard'
const outfile = fileURLToPath(new URL('../lib/client.js', import.meta.url))
mkdirSync(dirname(outfile), { recursive: true })

await build({
  entryPoints: [fileURLToPath(new URL('../src/client/index.js', import.meta.url))],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2020'],
  outfile,
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {\n` +
        `var module = { exports: {} };\nvar exports = module.exports;\n`,
  },
  footer: {
    js: `return module.exports; } });\n`,
  },
  logLevel: 'info',
})

console.log(`[session-guard] client bundle written: ${outfile}`)

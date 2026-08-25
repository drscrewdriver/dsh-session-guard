/**
 * dsh-session-guard 客户端 bundle 构建（tsdown）。
 *
 * 仿 deepseek-harness/packages/client/tsdown.client.ts 语义：
 * src/client/index.ts -> lib/client.js（CJS，browser），带 __ModuleLoader__.load
 * 闭包工厂 banner/footer（与 input-traffic 同构，dsh-client-modules 在
 * /plugins/dsh-session-guard/client.js 提供）。react 与 dsh-client-* 为平台外部模块，
 * 由 dsh 共享模块表提供，禁止打进 bundle。
 */
import { fileURLToPath } from 'node:url'

const PLUGIN_ID = 'dsh-session-guard'

/** dsh 共享给浏览器 bundle 的平台模块（external，不打包）。 */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-conversation',
]

const entry = fileURLToPath(new URL('./src/client/index.ts', import.meta.url))

export default {
  name: `${PLUGIN_ID}/client`,
  entry: { client: entry },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  dts: false,
  sourcemap: true,
  clean: false,
  external: PLATFORM_MODULES,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

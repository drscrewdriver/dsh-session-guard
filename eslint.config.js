// @ts-check
import js from '@eslint/js'

/** 精简 flat 配置（纯 JS 插件；typescript-eslint 仅对 TS 需要）。 */
export default [
  {
    ignores: ['node_modules/', 'lib/', 'dist/', 'scripts/'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // 浏览器/Node 全局，host 端 fail-open 记录日志时用到。
        console: 'readonly',
        window: 'readonly',
        globalThis: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      // 插件宿主端常用可选链/空值合并，eslint 推荐规则对它们无异议。
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
]

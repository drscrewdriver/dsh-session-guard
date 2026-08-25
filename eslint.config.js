// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/** flat 配置：host 纯 JS + 客户端 TS/TSX（mirror thinking-levels）。 */
export default tseslint.config(
  {
    ignores: ['node_modules/', 'lib/', 'dist/', 'scripts/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
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
)

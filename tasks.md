# Tasks

## Phase 1: 分支与基线
- [ ] task_1: `git checkout -b compat/0.1.5 origin/main`，确认工作区干净、`npm test` 基线全绿

## Phase 2: 代码适配
- [ ] task_2: src/pause-gate.js — 新增 `enqueueFollowup(agent, blocks)` 双路径帮助函数（followup → send → warn），替换 6 处 `agent.followup(...)` 调用
- [ ] task_3: src/pause-gate.js — `makeFollowupMessage` 的 source 增加 `form: 'instructions'`
- [ ] task_4: src/index.js — webServer.register 包 try/catch，失败记 error 日志
- [ ] task_5: tests/pause-gate.test.mjs — 新增双路径用例（有 followup / 无 followup 有 send / 两者皆无）

## Phase 3: 元数据与文档
- [ ] task_6: package.json + dsh.plugin.json 版本 → 0.2.0-beta.2
- [ ] task_7: README.md / README.en.md / README.ja.md / README.ko.md 适配矩阵 0.1.5 行更新
- [ ] task_8: CHANGELOG.md（+ ja/ko）增补条目

## Phase 4: 验证
- [ ] task_9: `npm test` + `npm run build` 全绿
- [ ] task_10: 提交 commit（feat: 0.1.5 compat — followup dual-path + webServer guard）

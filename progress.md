# progress.md — 会话日志

## 2026 (会话 start)
- 调研并 clone 峰谷/会话控制插件到 `.peakref/`：save-money, off-peak, automations,
  companion, peak-cost-mode, sleep-send, scheduler, input-traffic, task-control,
  sideband, auto-continue, client-auto-retry, auto-continue-429, autoresume,
  restart-recover, smart-restart, interrupt-button, session-manager。
- 已精读：task-control `lib/index.js`（会话执行门）、input-traffic freeze-store/steer-queue-dock、
  save-money core.ts/state.ts（周末正确识别）、off-peak window.js（周末 bug）、
  companion time.ts/scheduler.ts、peak-cost-mode index.mjs、autoresume service.js、
  auto-continue host/engine.ts、interrupt-button index.js、restart-recover index.ts。
- 创建项目 `session-guard/`，写入 findings.md / task_plan.md / progress.md。
- P0 调研 complete。

## 决策确认
- [x] 独立 DSH 插件 + 设置→插件子板块 + 简单开关。
- [x] 回退自带队列 + 暴露冗余端口（input-traffic 适配）。
- [x] 高峰暂停默认全局生效；冻结按钮 = 前端冻结队列 + 服务端 stopNextTurn。
- [x] input-traffic 改造（方案 A）：基座 = 未合并 main 的 feature 分支
      `feat/absorb-auto-continue`（fork + peak-bridge 子分支 + PR）；遵循"冻结=一等公民"。
- [x] D8 fail-open：无后端协作插件时冻结按钮静默降级只冻队列，不报错。

## P2–P4 实现
- [x] P2 host：`src/time.js`（时区正确高峰/周末）、`src/scheduler.js`（状态机）、
      `src/store.js`（持久化）、`src/gate.js`（会话门+回退）、`src/bridge.js`（sessionGuard 端口）、
      `src/detect.js`（自动检测）、`src/index.js`（设置子板块/路由/tick/提供服务）。
- [x] P3 client：`src/client/freeze-store.js`（回退冻结）、`src/client/index.js`（徽标+回退按钮）。
- [x] P4 验证：**31/31 用例全绿**（node --test）——含 D1 周末边界（北京周六 00:30 = UTC 周五）、
      周末模式开关、状态机迁移、会话门两路、fail-open、显式锁队列、跨午夜窗口、
      重试失败分类/退避/冻结让路。
- [x] 后端自动重试（D9）：`src/retry.js`（turn/end 监听、瞬时/永久分类、自适应退避、
      冻结让路、用户介入重置）+ 设置 `retryEnabled` 开关 + 接线。
- [x] **改名 dsh-session-guard（会话守卫/门卫）**：目录/包名/服务契约 sessionGuard/
      路由/存储/env/文档全量替换，31/31 测试仍绿。
- [x] **input-traffic 最小桥完成**（本地 link 仓库 `E:\test\rewrite-agently\dsh-input-traffic`，
      D9：只做冻结增强，不吸收 auto-continue）：
      - 新增 `src/client/session-guard-bridge.ts`（fail-open RPC：stopNextTurn/resume，
        404/网络失败静默）；
      - `freeze-button.tsx`：冻结摘除 queued+steering（steering→safe_point）+ 桥调用；
        resume 用 sendSteer 投 next-step + 桥调用；
      - `index.ts`：新增 steerPrompt 注入 sendSteer + sessionId；
      - `steer-queue-dock.tsx`：Injected 接口加 sendSteer/sessionId（可选）；
      - 测试 +5（steering 摘除/safe_point 重投/fail-open/桥可达），**47/47 全绿**。
- [x] 全部 src 语法检查通过；package.json / cordis.patch.yml / README.md 就绪。
- [ ] 待接入真实 DSH 环境：npm install 依赖后实机验证（webServer/agents/timer/settings 注入面）、
      input-traffic 最小桥（方案 A，只做冻结增强）实现与联调。

## 错误记录
| 错误 | 尝试 | 解决 |
|---|---|---|
| git clone schannel/连接失败 | 禁用 SSL / 换分支 | 网络间歇，改用 codeload tarball + GitHub API |
| tarball 截断 | 换大超时重下 | 完整 3.5MB 解出 |
| task-control src 不在 tarball | 用 GitHub API tree 定位 lib/*.js | raw 单独下载成功 |
| node --test tests/ 目录参数失败(Windows) | 用 glob | `node --test "tests/*.test.mjs"` |
| bridge 测试被残留 ~/.dsh/session-guard/s1.json 污染 | 加临时目录隔离 | tmpStore(t) |
| D1 测试用例 UTC/北京边界算错 | 改用 08-21T16:30Z（北京周六00:30=UTC周五） | 修正用例 |

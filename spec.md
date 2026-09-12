# Spec: dsh-session-guard compat/0.1.5 适配

## 需求
- 从远程最新分支（origin/main，唯一分支）checkout 出 `compat/0.1.5` 分支。
- 完成对 DSH 0.1.5-rc.x 的适配，使 v0.2.0-beta.1 代码在 0.1.5 上：加载成功、设置可注册、HTTP/SSE 路由可用、高峰暂停后可恢复续跑。
- README 适配矩阵将 0.1.5 行从「未验证」更新为「已适配」。

## 技术方案
1. **分支**：`git checkout -b compat/0.1.5 origin/main`。
2. **followup 双路径**（src/pause-gate.js）：新增 `enqueueFollowup(agent, blocks)` 帮助函数 —— `typeof agent.followup === 'function'` 优先；否则 `typeof agent.send === 'function'` 回退；再否则 `ctx.logger?.warn` 降级并返回 false。6 处调用点统一改走它。消息 `source` 补 `form: 'instructions'`（0.1.5 ContextFormed 契约，旧版本无害）。
3. **webServer.register 防御**（src/index.js）：注册调用包 try/catch，失败时 `ctx.logger?.error` 而非让 apply 抛错炸掉宿主加载（#5926 教训）。
4. **session/event 防御已有**，不动。
5. **元数据**：README（4 语言）适配矩阵 0.1.5 行更新；CHANGELOG 增补 compat 条目；`dsh.plugin.json`/`package.json` 版本号升 `0.2.0-beta.2`。
6. **验证**：`npm test`（18 个测试文件全绿）+ `npm run build` 产物生成。

## 决策记录
| 选项 | 选择 | 理由 |
|------|------|------|
| 分支基点 | origin/main（唯一远程分支） | SSH fetch --prune 确认无其他分支 |
| followup 适配 | 运行时检测双路径 | 0.1.5 Inbox 改投影，followup 保留与否无法本地核实；双路径兼容所有版本 |
| source.form | 补 `form: 'instructions'` | 0.1.5 契约要求；旧版本忽略未知字段 |
| 客户端 fetch 路径 | 不改 | webServer 前缀路由在 0.1.5 契约不变，`/api` 前缀仅影响 DSH 自身 endpoint |

## 约束
- 不写自定义 message source kind 进会话日志（#6311 教训），现有 `kind:'plugin'` 为内置 kind，保留。
- 单一产物继续双版本兼容（0.1.x 全系），不做分叉大改。
- 测试框架保持 `node --test`，改动需补 pause-gate 双路径用例。

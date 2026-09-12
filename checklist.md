# Checklist

## Must Pass
- [ ] `compat/0.1.5` 分支基于 origin/main（5e46b89）创建
- [ ] `npm test` 全部 18 个测试文件通过（含新增 followup 双路径用例）
- [ ] `npm run build` 产出 lib/client.js 无报错
- [ ] pause-gate：agent.followup 存在时行为与旧版完全一致（回归）
- [ ] pause-gate：agent.followup 缺失时回退 agent.send，两者皆缺时 warn 且不抛错
- [ ] followup 消息 source 含 `form: 'instructions'`
- [ ] index.js webServer.register 失败时仅记 error 日志，apply 不抛错
- [ ] README（zh/en/ja/ko）适配矩阵 0.1.5 行更新为已适配 + followup 双路径说明
- [ ] CHANGELOG 增补 0.2.0-beta.2 条目
- [ ] package.json / dsh.plugin.json 版本号 0.2.0-beta.2

## Should Pass
- [ ] 在 DSH 0.1.5-rc.2 实测：插件加载、设置面板、状态徽标、SSE 按钮、高峰暂停→恢复续跑
- [ ] 在 DSH 0.1.2-rc.1 回归一次（双版本承诺）

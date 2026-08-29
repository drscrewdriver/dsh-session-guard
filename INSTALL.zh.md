# 安装指南（官方 DSH CLI）

- [安装指南](./INSTALL.zh.md)
- [English installation guide](./INSTALL.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [中文 README](./README.md)
- [English README](./README.en.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [版本更新日志](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## 0. 前置条件

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
```

## 1. 安装

```bash
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard
```

重启 dsh web 并刷新页面。

## 2. 验证

打开「设置 → 插件 → session-guard」。开关：`enabled`、`offPeakAutoResume`、`weekendMode`、`queueFallback`、`retryEnabled`。

检查会话界面中的状态徽标——显示当前阶段（NORMAL / PAUSED_PEAK）。

## 3. 卸载

```bash
dsh plugin --profile web remove dsh-session-guard
```

重启 dsh web。

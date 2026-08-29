# 설치 안내(공식 DSH CLI)

- [한국어 설치 안내](./INSTALL.ko.md)
- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 README](./README.ko.md)
- [English README](./README.en.md)
- [中文 README](./README.md)
- [日本語 README](./README.ja.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## 0. 사전 확인

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
```

## 1. 설치

```bash
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard
```

dsh web을 재시작하고 페이지를 새로고침.

## 2. 검증

**설정 → 플러그인 → session-guard** 열기. 스위치: `enabled`, `offPeakAutoResume`, `weekendMode`, `queueFallback`, `retryEnabled`.

세션 UI의 상태 배지 확인—현재 단계(NORMAL / PAUSED_PEAK) 표시.

## 3. 제거

```bash
dsh plugin --profile web remove dsh-session-guard
```

dsh web 재시작.

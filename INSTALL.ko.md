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
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.5#compat/0.1.5
```

`compat/0.1.5`는 DSH `0.1.5-rc.x` 전용 라인(3.x, `engines.dsh: >=0.1.5-rc.2 <0.2.0-0`)입니다. `main`은
계속 DSH `0.1.0-rc.7` – `0.1.2-rc.1`(2.x / 0.2.x)을 담당합니다.

dsh web을 재시작하고 페이지를 새로고침.

## 2. 검증

**설정 → 플러그인 → session-guard** 열기. 스위치: `enabled`, `providerGuard`, `guardSubagents`,
`offPeakAutoResume`, `weekendMode`, `deferredResume`, `queueFallback`, `retryEnabled`;
텍스트/목록 항목: `officialProviders`, `officialBaseURLs`, `deferredResumeText`.

세션 UI의 상태 배지 확인—현재 단계(`高峰·拦官方` / `高峰·全部暂停` / `谷时` / `周末`) 표시.

특정 라우트의 공식 소스 판정 확인(host 라우트, 재시작 불필요):

```bash
curl -s 'http://127.0.0.1:3080/session-guard/provider?provider=deepseek-official'
# {"ok":true,"verdict":{"provider":"deepseek-official","official":true,"matchedBy":"endpoint","endpoint":"https://api.deepseek.com"}}
```

테스트 실행(네트워크·자격 증명 불필요):

```bash
npm test
```

## 3. 업그레이드

```bash
dsh plugin --profile web remove dsh-session-guard
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.5
```

dsh web을 재시작하고 페이지를 새로고침. 설정은 `$DSH_HOME/settings.yaml`의 `session-guard`
네임스페이스에 있어 업그레이드 후에도 유지됩니다. 새 키(`providerGuard`, `deferredMode` 등)는
건드리기 전까지 기본값입니다.

`0.1.3`/`0.1.4-beta.1`에서 `0.1.5-beta.1`로의 유일한 동작 변경은 피크 시 기본적으로
**공식 소스만** 차단한다는 점입니다. 예전의 전체 정지로 되돌리려면 `providerGuard: false`
(또는 `officialProviders` / `officialBaseURLs`로 판정을 좁히기).

## 4. 문제 해결

| 증상 | 확인 |
|---|---|
| 피크인데 세션이 계속 실행 | `GET /session-guard/status` → `phase`가 `peak`; `GET /session-guard/settings` → `enabled: true` |
| 로컬 provider가 차단됨 | `GET /session-guard/provider?provider=<id>` → `matchedBy`가 `endpoint`/`unknown`이고 `official: false`여야 함. `explicit`이면 `officialProviders`에서 제거 |
| 공식 요청이 차단되지 않음 | `matchedBy: 'endpoint'`에 `official: false`면 `baseURL`이 `officialBaseURLs`에 없음; host를 추가하거나 라우트 id를 `officialProviders`에 추가 |
| 요청이 계속 보류됨 | `hold` 모드의 설계된 동작. 명시적 오류로 만들려면 `deferredMode: 'error'` 또는 `deferredMaxHoldMs`를 줄이기 |
| 피크 후 재개되지 않음 | `deferredResume`이 켜져 있어야 함(또는 `/resume`); 세션급은 `offPeakAutoResume` |
| 판정 진단 불가 | `GET /session-guard/diag` → `providerGuard`, `configurableProviders`, `held`, `deferred` |

## 5. 제거

```bash
dsh plugin --profile web remove dsh-session-guard
```

dsh web 재시작. 언로드 시 보류 중인 요청은 해제(reject)되며 promise 누수는 없습니다.

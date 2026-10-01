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
dsh plugin --profile web add dsh-session-guard@dsh-0.1.7

# 또는 git 브랜치 직접 지정
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.7
```

`compat/0.1.7`는 DSH `0.1.7-rc.x` 전용 라인입니다: npm 패키지 버전 **`3.1.1`**,
dist-tag **`dsh-0.1.7`**, `package.json`과 `dsh.plugin.json`의 `engines.dsh` 모두
`>=0.1.7-rc.1 <0.1.8-0`.

DSH `0.1.5-rc.x` 호스트는 **`compat/0.1.5`** 브랜치(npm dist-tag `dsh-0.1.5`, 버전 `3.0.0`)를
사용하세요. DSH `0.1.2-rc.x` 호스트는 **`legacy/0.1.2`** 브랜치(npm dist-tag `dsh-0.1.2`,
버전 `0.3.1`)를 사용하세요. `main`은 `0.2.0-beta.1`에서 동결되었고
**0.1.2 라인의 릴리스 브랜치가 아닙니다**.

> ⚠️ 맨 패키지명 `dsh-session-guard`에 의존하지 마세요: npm `latest` 태그는
> 상호 배타적인 두 버전 라인(`engines.dsh`가 semver 프리릴리스 매칭상 배타)을
> 동시에 제공할 수 없습니다. 반드시 dist-tag를 명시하세요.

dsh web을 재시작하고 페이지를 새로고침.

## 2. 검증

**설정 → 플러그인 → session-guard** 열기. 본 라인의 플러그인은 네임스페이스를 등록하지 않고 자체 설정
카드도 두지 않습니다: `Config = SettingsSchema`를 export하고 각 필드에 `.volatile()`을 붙였으므로 dsh가
**이 폼을 자동 생성**합니다. 스위치: `enabled`, `providerGuard`, `guardSubagents`,
`offPeakAutoResume`, `weekendMode`, `deferredResume`, `queueFallback`, `retryEnabled`;
텍스트/목록 항목: `officialProviders`, `officialBaseURLs`, `deferredResumeText`.

피크/주말 정책은 JSON 파일로도 설정할 수 있습니다(해석 순서: `$DSH_SESSION_GUARD_CONFIG` →
`$DSH_HOME/config/session-guard.json` → `<cwd>/config/session-guard.json` →
`<plugin>/config/session-guard.json`). 이 파일은 기본 레이어이며 자동 생성 폼에서 설정한 값이 계속
우선합니다. `POST /session-guard/rpc {"action":"reloadConfig"}`로 재시작 없이 다시 읽을 수 있습니다.
자세한 내용은 [README.ko.md](./README.ko.md)의 "설정 가능한 피크 정책"을 참조하세요.

세션 UI의 상태 배지 확인—현재 단계(`高峰·拦官方` / `高峰·全部暂停` / `谷时` / `周末`) 표시.
그 옆(order 20, input-traffic 동결 버튼 왼쪽)이 **畅跑** 버튼입니다: 문구는 `畅跑`(작업이 2개 이상이면
`畅跑 ×N`)로 고정되며, **클릭하면 항상 畅跑 작업 관리 패널이 열리고**, 거기서 **단일 세션**의 시간 한정
피크 면제를 생성·일시정지 / 재개·삭제할 수 있습니다(일시정지는 작업별이며 세션급 스위치가 아닙니다).
자세한 내용은 [README.ko.md](./README.ko.md)의 "畅跑(free-run)"을 참조하세요.

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
dsh plugin --profile web add dsh-session-guard@dsh-0.1.7
```

dsh web을 재시작하고 페이지를 새로고침. 설정은 apply의 합성 엔트리에 있고(자동 생성 폼에서 편집)
업그레이드 후에도 유지됩니다. 새 키(`providerGuard`, `deferredMode` 등)는 건드리기 전까지 기본값입니다.
피크 정책은 `config/session-guard.json`에서 읽으므로 이것도 유지됩니다.

`0.1.3`/`0.1.4-beta.1`에서 `0.1.5-beta.1`로의 유일한 동작 변경은 피크 시 기본적으로
**공식 소스만** 차단한다는 점입니다. 예전의 전체 정지로 되돌리려면 `providerGuard: false`
(또는 `officialProviders` / `officialBaseURLs`로 판정을 좁히기).

### "일시정지 버튼"이 있는 버전에서 업그레이드하는 경우

예전 컴포저의 "일시정지 / 재개" 버튼은 **제거**되었고, **畅跑** 버튼(slot `session-guard-free-run`,
order 20)이 그 자리를 대신합니다. `/pause`, `/resume`, `/cancel` 명령과 `sessionGuard` 포트
(`stepPause` / `stepResume` 포함)는 변경 없습니다. 畅跑 윈도우는 작업 패널에서 시간 정밀도로 편집할 수
있으며(시작 시 = `H:00`, 끝 시 = `H:59`라 끝 시 한 시간 전체가 포함되고 `"끝 23시"` = `23:59`),
피크에 대한 특별 처리는 설정 파일이 담당합니다.

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

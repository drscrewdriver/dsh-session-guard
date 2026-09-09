<p align="center">
  <strong>피크 자동 세션 게이트: 주말 모드 + 피크 자동 일시정지 + 세션급 동결 + 백엔드 자동 재시도</strong>
</p>
<p align="center">
  <a href="README.en.md">English</a> · <a href="README.md">中文</a> · <a href="README.ja.md">日本語</a> · <strong>한국어</strong>
</p>
<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square"></a>
  <img src="https://camo.githubusercontent.com/2c11fb2e0e14bb9985c5acbe61123a7441c5ee63aa27fa6e04e2a707ebfd6022/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f6473682d2d706c7567696e2d72656164792d3437384342463f6c6f676f3d646565707365656b266c6f676f436f6c6f723d7768697465" alt="dsh-plugin" style="max-width: 100%;">
  <img alt="Public beta" src="https://img.shields.io/badge/status-public%20beta-7da1de?style=flat-square">
</p>

# dsh-session-guard

- [English README](./README.en.md)
- [中文 README](./README.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [Installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

> **호환성 참고:** v0.1.1에는 일본어(`ja`)와 한국어(`ko`) 사전이 포함되어 있지만, 현재 공식 DSH 릴리스는 `LocaleRuntime`을 통해 `zh`와 `en`만 제공합니다. 순정 DSH에서 `ja` 또는 `ko`를 선택하면 `locale "<id>" is not registered` 오류가 발생합니다. 공식 DSH가 해당 locale ID를 추가할 때까지 사용할 수 없습니다. 고급 사용자는 DSH 포크를 유지하면서 업데이트하세요.

> 피크 과금 시간대에 실행 중인 세션을 자동 일시정지하고 오피크/주말에 자동 재개; input-traffic의 동결 버튼과 페어링하여 **세션급** 잠금 구현; 백엔드 **자동 재시도**는 동결/게이트 기간 중 양보. 커스텀 세션 게이트(`agent.cancel keepInbox + goals.pause + session/event 안전 경계 + followup 재개`) 기반, dsh-task-control 의존성 제거.

`dsh plugin` 명령으로 조립 + 번들 패치로 장착하는 cordis 플러그인. dsh 소스 변경이나 PR 필요 없음.

> 💡 **권장 이유**: DeepSeek는 2026-08-17부터 **피크/오피크 과금**을 시행. 피크 시간대 단가 2배. 본 플러그인이 피크 시 실행 세션을 자동 일시정지하고 오피크에 자동 재개하여 장시간 세션 비용을 최대 **50%** 절감. 수동 동결(input-traffic 버튼 경유)로 세션별 정밀 제어 가능.

## 기능

- **주말 모드**: `Intl.DateTimeFormat`으로 주말을 정확히 인식(타임존 정확) → 주말은 피크/오피크 무시하고 자유 실행.
- **피크 자동 일시정지(글로벌)**: 피크 진입 시(그리고 주말이 아닌 경우) 모든 running 루트 세션을 자동 일시정지; 이탈 시 자동 재개 — **글로벌 스위치, 수동 불필요**.
- **공식 소스 2차 판정(`providerGuard`)**: 피크 시간에는 **요청 대상이 DeepSeek 공식 소스일 때만** 차단. 로컬/서드파티 provider(예: `local-35b`)는 정상 실행. 판정 순서 = 명시 id 목록 → `baseURL` 엔드포인트 → catalog 기본 엔드포인트 → 내장 id.
- **요청급 백스톱 + 연기 큐**: 피크 진입 후 시작된 세션, 도중에 공식 소스로 전환된 세션은 `agent/request` 가드가 포착(기본 `hold`: 요청을 보류하고 오류 없이, 피크 종료 시 자동 해제).
- **세션급 동결/재개**: `sessionGuard` 중복 포트 + `POST /session-guard/rpc`, input-traffic 동결 버튼으로 세션별 패스스루. `/pause /resume /cancel` 수동 명령도 제공.
- **백엔드 자동 재시도(D9)**: turn/end 일시적 실패(error/429/max-tokens)는 적응형 백오프로 자동 재시도; 영구 실패는 중지; **동결/게이트 기간 중 양보**, 세션 게이트를 우회하지 않음.
- **fail-open**: 커스텀 세션 게이트 사용 불가, session-guard 미설치, 설정 서비스 누락 — 모두 조용히 성능 저하, 의존성으로 크래시하지 않음.

## 설치

```bash
dsh plugin --profile web add github:<owner>/dsh-session-guard
```

설치 후 dsh web을 재시작하고 페이지를 새로고침.

## 설정 (설정 → 플러그인 → session-guard)

| 스위치 | 기본값 | 설명 |
|---|---|---|
| `enabled` | on | **피크 자동 일시정지**: 피크 시간대에 실행 세션을 자동 일시정지 |
| `providerGuard` | on | **공식 소스 2차 판정**: 피크에는 DeepSeek 공식 소스만 차단, 로컬/서드파티 provider는 정상 실행 |
| `guardSubagents` | on | **서브에이전트 포함**: 서브에이전트 요청도 과금 대상, 기본 포함 |
| `offPeakAutoResume` | on | **오피크 자동 재개**: 오피크에 일시정지 세션을 자동 재개 |
| `weekendMode` | on | **주말 모드**: 주말 인식 → 주말 자동 일시정지 안 함 |
| `deferredResume` | on | **피크 후 자동 재개**: 끄면 연기된 요청/세션은 수동 `/resume` 전까지 멈춤 |
| `queueFallback` | on | 커스텀 세션 게이트 사용 불가 시 락 대기 큐로 폴백 (fail-open) |
| `retryEnabled` | off | **자동 재시도 (백엔드)**: 일시적 실패 자동 재시도 (기본값 off, 보수적) |

추가 설정:

- `timezone` (기본값 Asia/Shanghai) — **주말 판정**과 배지 표시에 사용. **피크/오피크 판정에는 영향 없음** (피크는 항상 북경 시간)；
- `peakWindows` (기본값 09:00–12:00 / 14:00–18:00) — 북경 시간(UTC+8) 기준 피크 윈도우. DeepSeek 공식 과금과 일치；
- `pauseMode` (`safe`/`force`), `pauseReason` (`wait`/`stop`)；
- 공식 소스 판정: `officialProviders`(공식 provider id 추가, 쉼표 구분, 최우선), `officialBaseURLs`(공식 엔드포인트 host, 기본 `api.deepseek.com`)；
- 연기 큐: `deferredMode`(`hold`/`error`), `deferredResumeText`, `deferredMaxHoldMs`(보류 상한, 기본 6h, 초과 시 error)；
- 재시도 매개변수: `retryText`, `retryGraceMs`, `retryCooldownMs`, `retryBackoffFactor`, `retryBackoffMaxMs`, `retryMaxConsecutive`.

## 동작

### 피크 자동 게이트 (글로벌)

- **피크 진입** (그리고 주말 아님): 모든 running 루트 세션에 `gate.stopNextTurn` 호출 — 커스텀 세션 게이트로 진정한 일시정지 (추론 중단 안 함, 안전 경계에서 일시정지), `queueFallback`으로 락 대기 큐 폴백；
- **오피크 / 주말**: `gate.resume` **모든** 세션 (자동 재개, 수동 불필요) — `offPeakAutoResume` 스위치로 제어；
- **피크 타임존**: 하드코딩된 북경 시간 (`Asia/Shanghai`), DeepSeek 공식 과금 기준과 일치 — `timezone` 설정의 영향을 받지 않음；
- 상태 머신: 단일 인스턴스 `NORMAL ↔ PAUSED_PEAK` (`scheduler.js`), 단일 30s tick으로 구동.

### 공식 소스 판정 (`providerGuard`)

피크 시간에 무차별 정지하지 않고, 먼저 "이 요청이 실제로 향하는 라우트가 DeepSeek 공식 소스인가"를 판정합니다.

| 우선순위 | 근거 | `matchedBy` | 예 |
|---|---|---|---|
| 1 | `officialProviders` 명시 id 목록 | `explicit` | 자체 게이트웨이를 공식으로 선언 |
| 2 | 실시간 `baseURL` 정규화 host | `endpoint` | `deepseek-official`을 중계로 변경 → **차단 안 함** |
| 3 | catalog 내장 기본 엔드포인트 | `endpoint-default` | pi-ai의 `deepseek` 라우트는 기본이 공식 API → **차단함** |
| 4 | 내장 id 목록 (`deepseek-official`) | `route-id` | 엔드포인트를 읽을 수 없을 때 폴백 |
| 5 | 그 외 | `unknown` | 비공식, 통과 |

- **엔드포인트가 id보다 우선**: `deepseek-official`의 `baseURL`을 중계로 돌려도 오차단하지 않습니다. 반대로 pi-ai 내장 `deepseek` 라우트는 누락되지 않습니다.
- **엔드포인트 출처**: `ctx.get('llm').listConfigurableProviders()` → 디렉터리 항목 → `ctx.settings.get(settingsNs)` → `settingsPath`로 `baseURL`(비밀 아닌 필드만, `apiKeyEnv` 값은 읽지 않음). 요청마다 재계산·캐시 없음 → provider 설정 변경이 즉시 반영.
- **비공식으로 전환 시 자동 복귀**: 피크 진입으로 정지된 세션을 로컬/서드파티 provider로 바꾸면(0.1.2+의 `model/selection` 이벤트) 자동으로 재개합니다(`deferredResume` 제약). 본 플러그인이 피크 진입 시 정지한 세션만 대상이며 수동 `/pause`는 덮어쓰지 않습니다. 0.1.1에는 이 이벤트가 없어 "다음 요청 또는 수동 `/resume`"으로 강등.
- **읽을 수 없을 때**: `llm` 서비스 부재, 네임스페이스 구조 변경, 비문자열 필드 — 모두 id / 내장 엔드포인트 판정으로 강등하고 `matchedBy`를 기록, **예외를 던지지 않습니다**.
- **오판정 조사**: `GET /session-guard/provider?provider=<id>`가 `{ official, matchedBy, endpoint }`를 반환.

### 요청급 가드와 연기 큐

- **왜 요청급인가**: 30s tick은 `NORMAL → PAUSED_PEAK` 전환 시점에 `running`이던 세션만 처리합니다. 피크 진입 후 시작된 세션, 도중에 공식 소스로 바뀐 세션은 누락됩니다. `agent/request` waterfall은 **모든 요청**을 지납니다.
- **`next()` 반환값으로 판정**: 모델 선택 미들웨어가 waterfall 내부에서 provider/model을 덮어쓰므로 `await next()` 후에 판정합니다.
- **`hold` 모드(기본)**: 요청을 보류 — **전송도 오류도 없음** — 피크 종료 순간 자동 해제(`msUntilOffPeak` 정밀 타이머, 30s tick은 백스톱); abort 시 정상 중단.
- **`error` 모드**: 식별 가능한 `PEAK_DEFERRED` 오류를 던지고 연기 큐에 기록, 피크 종료 시 `deferredResumeText`로 재개(`deferredResume` 끄면 자동 재개 안 함).
- **상한**: `deferredMaxHoldMs`(기본 6h)로 무한 보류를 error로 전환.
- **상호 배타**: 보류 중에는 세션 게이트 일시정지를 **함께 쓰지 않습니다**(일시정지는 안전 경계를 기다리지만 보류된 요청은 도달할 수 없음). 피크 진입 시 이미 보류 중인 세션은 건너뜁니다.
- **영속화 없음**: 연기 큐는 프로세스 내 promise, 재시작 시 사라집니다.

### 경계 (대상 아님)

- **provider 재라우팅 없음**(차단만).
- **compaction은 `agent/request`를 지나지 않음**: 세션이 정지된 동안에는 발생하지 않습니다. 피크 중 수동 압축은 공식 소스로 갈 수 있습니다(`ctx.llm.stream` 계층은 개입하지 않음).
- **0.1.1에는 `model/selection` 이벤트가 없음**: 비공식 소스로 전환 후 자동 복귀는 "다음 요청 또는 수동 `/resume`"으로 강등(0.1.2+는 즉시).
- **npm 의존성 추가 없음**, 자격 증명 읽기 없음, `dsh-llm-retry`의 429 / 전송 재시도는 그대로.

### 타임존 처리

- **피크/오피크判定**: 항상 **북경 시간(UTC+8)** 사용 (`BILLING_TIMEZONE = 'Asia/Shanghai'`). DeepSeek 공식 과금 기준. `timezone` 설정으로 변경 불가 (하드코딩)；
- **주말判定**: 사용자 설정 `timezone` (예: `Asia/Tokyo`, `Asia/Seoul`) 사용. "주말"은 로컬 개념이므로；
- `Intl.DateTimeFormat`으로 타임존 투영. 잘못된 IANA 타임존 이름은 `RangeError`로 fail-open하여 `Asia/Shanghai`로 폴백；
- 피크 윈도우는 **좌폐우개** `[start, end)`. 자정 횡단 윈도우 (예: `22:00–06:00`) 지원.

### 상태 배지 (프론트엔드 표시)

컴포저 입력 영역 오른쪽에 **읽기 전용** 상태 배지 표시:

| 단계 | 라벨 | CSS 클래스 | 의미 |
|---|---|---|---|
| `peak` (2차 판정 on) | 高峰·拦官方 | `sg-peak` | 피크 시간대, DeepSeek 공식 소스만 차단 |
| `peak` (2차 판정 off) | 高峰·全部暂停 | `sg-peak` | 피크 시간대, 모든 세션 정지 |
| `off-peak` | 谷时 | `sg-off` | 오피크 시간대, 세션 정상 실행 |
| `weekend` | 週末 | `sg-weekend` | 주말 (주말 모드 활성화 시), 피크/오피크 무시 |

- 15초마다 `GET /session-guard/status` 폴링(`phase` / `providerGuard` / `held` / `deferred`)；
- fail-open: 라우트 도달 불가·네트워크 오류·`enabled` OFF → 배지 숨김；
- **input-traffic에 의존하지 않음**: session-guard 클라이언트 코드가 단독으로 렌더링. input-traffic는 동결 버튼만 담당；

### input-traffic와의 협업

- input-traffic의 **동결 버튼**은 `sessionGuard.stopNextTurn` (RPC, 세션별) 경유 서버사이드에 전달；
- input-traffic는 **동결 강화만** (큐 동결/해제 + composer 차단), 재시도는 본 플러그인 백엔드가 처리；
- 둘 다 "세션 격리" 시맨틱 공유: input-traffic 동결 큐는 sessionId로 격리, session-guard RPC도 sessionId로 격리.

## 라이선스

MIT — [LICENSE](LICENSE) 참조.

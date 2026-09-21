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

> 💡 **권장 이유**: DeepSeek는 2026-08-17부터 **피크/오피크 과금**을 시행. 피크 시간대(기본 북경 시간 09:00-12:00, 14:00-18:00) 단가 2배. 본 플러그인이 피크 시 실행 세션을 자동 일시정지하고 오피크에 자동 재개하여 장시간 세션 비용을 최대 **50%** 절감. 수동 동결(input-traffic 버튼 경유)로 세션별 정밀 제어 가능.

> ⚙️ **v0.3.0부터 피크 정책은 설정 가능**: 시간대·타임존·요일 제한·주말 규칙이 모두 `config/session-guard.json`에서 결정되며 하드코딩이 없습니다. 또한 **畅跑(프리런)** — 단일 세션을 시간 한정으로 피크 일시정지에서 면제하는 기능이 추가되었습니다(아래 "畅跑(free-run)" 참조).

## 기능

- **설정 가능한 피크 정책(v0.3.0)**: 피크/주말 정책이 `config/session-guard.json`에 정의됩니다(4단계 해석 순서, 설정 UI에서 명시한 값이 우선). 3가지 모드 `OFF_PEAK / PEAK / NORMAL`, 다중 윈도우·자정 횡단·요일 제한 지원. 잘못된 파일은 fail-open, `reloadConfig`로 핫 리로드.
- **畅跑(프리런)**: 컴포저에 "畅跑" 버튼 하나. **단일 세션**에 하나 이상의 시간 한정 윈도우를 예약하며, 윈도우 안에서는 피크/오피크를 무시하고 정상 실행되고, 종료 시각에 자동으로 끝나 일반 피크 판정으로 돌아갑니다. 예약은 영속화되므로 재시작해도 유지됩니다.
- **주말 모드**: `Intl.DateTimeFormat`으로 주말을 정확히 인식(타임존 정확) → 주말은 피크/오피크 무시하고 자유 실행.
- **피크 자동 일시정지(글로벌)**: 피크 진입 시(그리고 주말이 아닌 경우) 모든 running 루트 세션을 자동 일시정지; 이탈 시 **본 플러그인이 정지한 세션만** 자동 재개(수동 `/pause`는 대상 아님) — **글로벌 스위치, 수동 불필요**.
- **공식 소스 2차 판정(`providerGuard`)**: 피크 시간에는 **요청 대상이 DeepSeek 공식 소스일 때만** 차단. 로컬/서드파티 provider(예: `local-35b`)는 정상 실행. 판정 순서 = 명시 id 목록 → `baseURL` 엔드포인트 → catalog 기본 엔드포인트 → 내장 id.
- **요청급 백스톱 + 연기 큐**: 피크 진입 후 시작된 세션, 도중에 공식 소스로 전환된 세션은 `agent/request` 가드가 포착(기본 `hold`: 요청을 보류하고 오류 없이, 피크 종료 시 자동 해제).
- **세션급 동결/재개**: `sessionGuard` 중복 포트 + `POST /session-guard/rpc`, input-traffic 동결 버튼으로 세션별 패스스루. `/pause /resume /cancel` 수동 명령도 제공.
- **백엔드 자동 재시도(D9)**: turn/end 일시적 실패(error/429/max-tokens)는 적응형 백오프로 자동 재시도; 영구 실패는 중지; **동결/게이트 기간 중 양보**, 세션 게이트를 우회하지 않음.
- **fail-open**: 커스텀 세션 게이트 사용 불가, session-guard 미설치, 설정 서비스 누락 — 모두 조용히 성능 저하, 의존성으로 크래시하지 않음.

## 설치

```bash
# npm (recommended; dsh-0.1.5 for DSH 0.1.5, dsh-0.1.2 for DSH 0.1.2)
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
# GitHub (alternative, builds from source): dsh plugin --profile web add github:drscrewdriver/dsh-session-guard
```

설치 후 dsh web을 재시작하고 페이지를 새로고침.

## 설정 (설정 → 플러그인 → session-guard)

| 스위치 | 기본값 | 설명 |
|---|---|---|
| `enabled` | on | **피크 자동 일시정지**: 피크 시간대에 실행 세션을 자동 일시정지 |
| `stepLevelPause` | on | **step급 게이트**: 피크에 다음 step의 모델 요청 **전에** 게이트를 닫음(턴급보다 이르고 더 절약). 끄면 턴급 일시정지로 폴백 |
| `providerGuard` | on | **공식 소스 2차 판정**: 피크에는 DeepSeek 공식 소스만 차단, 로컬/서드파티 provider는 정상 실행 |
| `guardSubagents` | on | **서브에이전트 포함**: 서브에이전트 요청도 과금 대상, 기본 포함 |
| `offPeakAutoResume` | on | **오피크 자동 재개**: 오피크에 일시정지 세션을 자동 재개 |
| `weekendMode` | on | **주말 모드**: 주말 인식 → 주말 자동 일시정지 안 함 |
| `deferredResume` | on | **피크 후 자동 재개**: 끄면 연기된 요청/세션은 수동 `/resume` 전까지 멈춤 |
| `queueFallback` | on | 커스텀 세션 게이트 사용 불가 시 락 대기 큐로 폴백 (fail-open) |
| `retryEnabled` | off | **자동 재시도 (백엔드)**: 일시적 실패 자동 재시도 (기본값 off, 보수적) |

추가 설정:

- `timezone` (기본값 Asia/Shanghai) — IANA 이름으로 **모든** 시간 판정(요일 / 주말 / 윈도우 일치)을 구동. `peakPolicy.timezone`은 피크 윈도우 판정만 덮어씀(아래 "설정 가능한 피크 정책" 참조)；
- `peakWindows` / `peakPolicy` (기본값 09:00–12:00 / 14:00–18:00, 평일) — 윈도우와 주말 규칙의 권위 있는 출처는 이제 설정 파일 `config/session-guard.json`입니다. 설정 UI에서 명시한 값이 최우선이라는 점은 그대로입니다；
- `pauseMode` (`safe`/`force`), `pauseReason` (`wait`/`stop`)；
- `stepGateTimeoutMs` (기본값 300000) — step 게이트 보류 타임아웃. 만료 시 게이트를 해제하고 **턴급 일시정지로 승격**(교착 방지, "5분마다 1 step" 토큰 누수도 방지)；
- 공식 소스 판정: `officialProviders`(공식 provider id 추가, 쉼표 구분, 최우선), `officialBaseURLs`(공식 엔드포인트 host, 기본 `api.deepseek.com`)；
- 연기 큐: `deferredMode`(`hold`/`error`), `deferredResumeText`, `deferredMaxHoldMs`(보류 상한, 기본 6h, 초과 시 error)；
- 재시도 매개변수: `retryText`, `retryGraceMs`, `retryCooldownMs`, `retryBackoffFactor`, `retryBackoffMaxMs`, `retryMaxConsecutive`.

## 동작

### 피크 자동 게이트 (글로벌)

- **피크 진입** (그리고 주말 아님): `stepLevelPause`가 켜져 있으면 **턴을 즉시 중단하지 않음** — 세션은 다음 `agent/pre-step` 경계까지 진행하고 거기서 step 게이트가 닫힘(아래). 꺼져 있으면 모든 running 루트 세션에 `gate.stopNextTurn` 호출(커스텀 세션 게이트, `queueFallback`으로 락 대기 큐 폴백)；
- **오피크 / 주말**: 먼저 보류 중인 step을 `releaseAll`로 해제(턴은 그 자리에서 계속), 그다음 `gate.resume`으로 **본 플러그인이 정지한 세션**을 재개 — `offPeakAutoResume` 스위치로 제어. 해제는 `auto: true`로 호출되므로 수동 `/pause`한 세션은 그대로 남습니다；
- **피크 타임존**: 설정으로 결정됩니다 — `peakPolicy.timezone`(생략 시 `timezone`을 따름)이 피크 윈도우 판정을 구동하며 기본값은 `Asia/Shanghai`(DeepSeek 공식 과금 기준과 일치). v0.2.0의 "항상 북경 시간"은 더 이상 하드코딩이 아닙니다(아래 "설정 가능한 피크 정책" 참조)；
- 상태 머신: 단일 인스턴스 `NORMAL ↔ PAUSED_PEAK` (`scheduler.js`), 단일 30s tick으로 구동.

### step급 게이트 (v0.2.0, 절약의 핵심)

`agent/pre-step` waterfall에 연결되어 **다음 step의 모델 요청이 발생하기 전에** 턴을 보류합니다.

- **게이트 조건** (모두 충족): `enabled` + `stepLevelPause` + `step > 1` + 피크(설정된 피크 타임존, 기본 북경 시간, 주말 아님) + 대상 provider가 공식(`providerGuard`, 끄면 전부) + 요청급 hold 아님 + 이번 피크 구간에서 수동 스킵 아님；
- **`step > 1`인 이유**: 턴의 첫 step은 요청급 가드가 담당하므로 두 게이트가 겹치지 않음；
- **해제 경로**: ① `POST /session-guard/rpc {action:'stepResume'}` / `/resume` / 중복 포트 `stepResume` → 현재 step을 통과시키고 **이번 피크 구간 동안 더 이상 게이트하지 않음**；② 오피크 → 전부 해제, 턴은 그 자리에서 계속(**followup 불필요**)；③ 동결 버튼 / `/pause` / `/cancel` → 게이트 해제 후 턴급 일시정지로；④ `signal` abort → 해제；
- **타임아웃 승격**: `stepGateTimeoutMs`(기본 5분) 초과 시 게이트 해제 + **턴급 force 일시정지로 승격**, 오피크에 복귀(교착 없음·토큰 누수 없음)；
- **상태**: `GET /session-guard/state?session=<id>`가 `paused: { step, turn }`과 `stepGate: { held, since, bypass }` 반환. 서비스 포트 `state().paused`는 **호환을 위해 불리언 유지**, step 상태는 `pausedStep`；
- **영속화 안 함**: 보류는 프로세스 내 Promise, 재시작 시 소멸(유령 상태 방지).

### 설정 가능한 피크 정책 (v0.3.0: `config/session-guard.json`)

피크/주말 정책은 **더 이상 하드코딩되지 않습니다** — 피크 시간대, 타임존, 요일 제한, 주말 규칙 변경은 설정 파일 편집만으로 끝납니다. 일상적으로는 **사용자급** 파일을 편집하고, `POST /session-guard/rpc {"action":"reloadConfig"}`로 재시작 없이 반영합니다.

해석 순서(**먼저 맞는 것 승리**):

| # | 경로 | 계층 |
|---|---|---|
| 1 | `$DSH_SESSION_GUARD_CONFIG` | 명시 경로 |
| 2 | `$DSH_HOME/config/session-guard.json` | 사용자급(**평소 여기를 편집**) |
| 3 | `<cwd>/config/session-guard.json` | 프로젝트급 |
| 4 | `<plugin>/config/session-guard.json` | 패키지 동봉 기본값 |

- 이 파일은 cordis `settings` 네임스페이스의 **기본 레이어**입니다: 설정 UI(설정 → 플러그인 → session-guard)에서 명시한 값이 **우선**하며, `settings` 서비스를 쓸 수 없으면 파일 값이 그대로 적용됩니다. `reloadConfig`는 설정 서비스의 **원시 사용자 레이어**를 읽으므로, 재로드로 바뀌는 것은 당신이 **화면에서 직접 덮어쓰지 않은** 키뿐입니다 — 화면에서 바꾼 값은 계속 파일보다 우선합니다；
- **값은 검증됩니다. 잘못된 값이 가드를 조용히 망가뜨릴 수 없습니다**: 읽을 수 없는 파일, 잘못된 JSON, 배열이 아니거나 잘못된 `peakWindows`, 범위를 벗어난 스칼라는 `errors`에 기록되고 **해당 키는 기본값을 유지합니다** — "피크 윈도우 없음" 상태나 작동하지 않는 가드로 조용히 떨어지지 않습니다. 명시적 `"peakWindows": []`는 의도적인 "피크 윈도우 없음"으로 존중됩니다；
- **잘못된 파일이 시작을 막지 않습니다(fail-open)**: 오류는 수집되어 warning으로 기록되고(시작 시와 `reloadConfig` 시 모두) 내장 기본값으로 폴백합니다 — 원인은 `GET /session-guard/settings`와 `GET /session-guard/diag`의 `configFile.errors`에서 확인할 수 있습니다. 파일 값이 설정 schema를 통과하지 못하더라도 설정 패널은 **내장 기본값으로 등록됩니다**(조용히 사라지지 않음). 잘못된 값은 무시되고 warning이 기록됩니다.

```json
{
  "enabled": true,
  "timezone": "Asia/Shanghai",
  "peakPolicy": {
    "timezone": "Asia/Shanghai",
    "peakWindows": [
      { "name": "morning",   "start": "09:00", "end": "12:00", "days": ["mon","tue","wed","thu","fri"] },
      { "name": "afternoon", "start": "14:00", "end": "18:00", "days": ["mon","tue","wed","thu","fri"] }
    ]
  },
  "weekendPolicy": { "enabled": true, "days": ["sat","sun"], "mode": "offPeak" }
}
```

| 필드 | 기본값 | 설명 |
|---|---|---|
| `enabled` | `true` | 전체 스위치 |
| `timezone` | `Asia/Shanghai` | IANA 이름으로 **모든** 판정(요일·주말·윈도우 일치)을 구동. **IANA 데이터베이스로 검증**되며, 잘못되거나 철자가 틀린 타임존(예: `"Asia/Shangai"`)은 거부되고 기본값이 유지됩니다(`Asia/Calcutta` 같은 별칭은 허용) |
| `peakPolicy.timezone` | 생략 | **피크 윈도우 판정만** 덮어씀 — 피크를 DeepSeek 과금 타임존(예: `Asia/Shanghai`)에 고정하면서 주말은 `timezone`을 따르게 함. 생략 시 `timezone`을 따름. 역시 IANA 검증됨 |
| `peakPolicy.peakWindows[].name` | — | 윈도우 이름(`/peak` 응답에 표시) |
| `peakPolicy.peakWindows[].start` / `end` | — | `HH:MM`, **좌폐우개** `[start, end)` |
| `peakPolicy.peakWindows[].days` | 생략/빈 값 = 매일 | `mon`…`sun`. `start > end`는 **자정 횡단**이며 **시작일**에 귀속(`fri` 22:00–06:00은 토요일 01:00도 포함) |
| `weekendPolicy.enabled` | `true` | 주말 규칙 스위치 |
| `weekendPolicy.days` | `["sat","sun"]` | 어떤 요일을 주말로 볼지 |
| `weekendPolicy.mode` | `"offPeak"` | 현재는 `"offPeak"`만 지원(주말 전체를 오피크로 취급). 인식할 수 없는 `mode`는 **경고를 기록하고 주말 규칙을 비활성화**하며 조용히 받아들이지 않음 |

`peakWindows`는 **여러 개**의 윈도우를 지원합니다. 기본 동작은 v0.2.0과 동일합니다: `timezone` 기본값이 `Asia/Shanghai`이고 동봉 기본 설정에는 `peakPolicy.timezone`이 없으므로(이 경우 `timezone`을 따름) 결과도 `Asia/Shanghai`이며, 요일 한정 윈도우에 기본 주말 규칙이 겹칩니다. 레거시 설정 형태 `peakWindows: [{start,end}]` + `weekendMode: true/false`도 계속 동작합니다(`days` 없음 = 매일).

#### 3가지 모드와 우선순위 (`TimePolicyResolver`)

| 우선순위 | 조건 | 모드 |
|---|---|---|
| 1 | 당일이 주말일(`weekendPolicy` 기준) | **OFF_PEAK** — 종일, 피크 윈도우 무시 |
| 2 | 그렇지 않고 피크 윈도우에 일치 | **PEAK** |
| 3 | 그 외 | **NORMAL**(평일 오피크) |

v0.2.0의 2값 판정은 호환을 위해 유지합니다: `pause === (mode === PEAK)`, `reason`은 기존값 `'disabled' | 'weekend' | 'peak' | 'off-peak'`(`/status`의 레거시 `phase` 필드도 기존 배지를 위해 유지).

#### 畅跑(free-run, v0.3.0)

컴포저 오른쪽의 "畅跑" 버튼(slot `conversation.input.right`, id `session-guard-free-run`, order 20 — input-traffic "❄ 동결 후 추가" 왼쪽)이 **단일 세션**에 **시간 한정 피크 면제** 작업을 예약합니다.

**버튼**:

- 문구는 **고정**: `畅跑`, 작업이 2개 이상이면 `畅跑 ×N` — 문구로 상태를 나타내지 않습니다;
- **클릭은 항상 "畅跑 작업 관리" 패널을 엽니다**(더 이상 직접 동작을 수행하지 않음). 현재 효력이 있는지는 버튼의 **강조 색**과 호버 표시로 나타납니다;
- 호버 표시는 **각 작업의 시간 범위와 상태를 모두 나열**하고, 클릭하면 관리 패널이 열린다는 점도 알려줍니다.

**패널 구성(팝업 하나뿐, 추가 UI 표면 없음)**:

- 상단 툴바의 텍스트 버튼 3개:
  1. `新建畅跑任务` — 인라인 폼(`开始` / `结束`, 각각 네이티브 날짜 선택기 + 시간 셀렉트, **시간 단위**)을 열고 닫음. `确定` / `取消` 포함;
  2. `暂停全部任务` — 아직 끝나지 않은 모든 작업을 일시정지. 아직 끝나지 않은 작업이 모두 일시정지 상태면 문구가 `恢复全部任务`로 뒤집힘. 조작할 작업이 없으면 비활성;
  3. `删除全部任务` — 모든 작업을 삭제. 작업이 없으면 비활성.
- 각 작업 행 오른쪽에 아이콘 버튼 2개:
  1. `⏸` / `▶` — **그 작업 하나**를 일시정지 / 재개(아이콘과 툴팁은 작업 상태에 따라 뒤집힘). 이미 끝난 작업은 비활성;
  2. `×` — 그 작업을 삭제.
- 각 행에는 시간 범위와 상태 태그 `进行中` / `已暂停` / `待开始` / `已结束`도 표시됩니다;
- 패널 헤더에는 제목, 시간을 해석하는 타임존, 닫기용 작은 `×`가 표시됩니다. 바깥을 클릭하거나 Esc를 눌러도 닫힙니다.

시맨틱(정확히):

- **단일 세션**: 그 버튼을 사용한 세션만 면제되며, 다른 세션은 피크에 평소처럼 일시정지됩니다;
- **일시정지 단위는 "작업별"**이며 세션 단위가 아닙니다: 세션급 활성/비활성 스위치는 더 이상 없습니다. 작업 하나를 일시정지해도 나머지 작업은 정상 동작합니다;
- **효력 판정**: **일시정지되지 않은 작업이 하나 이상 현재 시각을 포함**할 때만 畅跑가 효력을 가집니다. 일시정지된 작업은 판정에 참여하지 않습니다;
- 작업은 **절대 기시각/종시각**이고 반개구간 `[from, to)`, **시간 정밀도**입니다. 폼의 값은 설정된 `timezone`으로 해석됩니다(패널이 그 타임존을 표기하며, `peakWindows`와 주말 규칙과 같은 타임존);
- `from`은 **곧**일 수도 **아주 먼 미래**일 수도 있습니다. 현재보다 이른 `from`은 현재 시각으로 클램프되므로 "즉시 시작"이 동작합니다;
- **일회성**: 각 작업은 `to`에서 자동 종료되고 더 이상 매칭되지 않습니다 — 이것은 정상 수명 주기이며 **설정 오류가 아니므로 오류로 보고되지 않습니다**. 사용자는 언제든 새 작업을 추가할 수 있습니다;
- **자동 병합은 일시정지 상태가 같은 윈도우 사이에서만 발생합니다**: 겹치거나 인접(인접 = 이어서 계속 달리기)하면서 **일시정지 상태가 같은** 윈도우가 병합됩니다. 일시정지 윈도우와 활성 윈도우가 겹치면 둘 다 유지됩니다(활성 윈도우는 그 커버 시간 동안 계속 효력을 가집니다). 병합 후 최대 **8**개이며, 초과 추가는 명확한 오류로 실패합니다;
- 일시정지된 작업은 **자동 상태 전환을 만들지 않습니다**(스스로 시작하지 않습니다). 사용자가 `▶` / `恢复全部任务`를 눌러야 다시 효력을 가집니다;
- 작업은 **영속화**됩니다(플러그인 자체 상태 디렉터리 아래에 세션당 JSON 하나). `from`이 미래일 수 있으므로 dsh 재시작이 예약을 잃어서는 안 됩니다;
- 畅跑가 효력을 가지는 동안 그 세션은 어디에도 보류되지 않습니다: 자동 턴급 / step 게이트 일시정지는 건너뛰고, 원래 `agent/request`에서 보류될 요청도 통과시킵니다(이를 위해 **세션 단위 `release`**를 추가해 이미 보류 중인 요청을 진행시킵니다);
- 畅跑가 더 이상 적용되지 않을 때(현재를 포함하는 모든 작업이 일시정지되었거나, 작업의 윈도우가 피크 안에서 끝났을 때) 세션은 **다시 일시정지**되고 다음 오피크에 자동으로 재개됩니다 — 즉 "세션은 자동으로 일시정지되고, 밸리에서 자동으로 계속됩니다";
- `providerGuard`, 수동 `/pause`, 주말 규칙, 전역 피크 상태 기계에는 영향을 주지 않습니다(`GET /session-guard/status`는 전역 그대로 — 畅跑는 세션급 개념이며 전역 배지를 바꾸지 않습니다).

#### 일시정지 / 재개 시맨틱 (v0.3.0부터)

- `pause`는 기존 세션 게이트를 재사용합니다: 일시정지 스냅샷을 저장하고 안전 경계를 기다리며, 이제 **`pausedReason`도 기록**합니다 — 피크 정책 정지는 `"peak_window"`, 명시적 `/pause`는 `"manual"`；
- 자동 해제(피크 종료·주말·비공식 provider로 전환)는 `auto: true`로 호출되므로 **본 플러그인이 정지한 세션만** 재개합니다: **사용자가 수동 `/pause`한 세션은 그대로 둡니다**. 수동 `/resume`은 **항상 유효**；
- 복귀는 모드가 **더 이상 PEAK가 아닐 때** 발생 — OFF_PEAK(주말)와 NORMAL(평일 오피크) 모두 포함；
- `GET /session-guard/state`가 `paused.reason`을 반환합니다.

#### 라우트 델타

- `GET /session-guard/peak` — **신규**: 실시간 모드(PEAK/OFF_PEAK/NORMAL), 일치한 윈도우 이름, 피크까지 남은 분, 다음 피크, 오피크까지 남은 ms, 정규화된 정책；
- `GET /session-guard/status` — `mode` / `reason` / `windowName` / `minutesUntilPeak` / `peakTimezone` / `weekendDays` / 해석된 `configFile` 경로를 추가하고 **`billingTimezone`은 더 이상 보고하지 않습니다**；
- `GET /session-guard/settings` — `configFile: {path, candidates, errors}` 추가；
- `GET /session-guard/diag` — `configFile`과 `freeRun` 진단(`{tracked, active, persisted, root}`) 추가；
- `GET /session-guard/events`(SSE) — `step` 이벤트만(step 게이트 상태 변화를 즉시 전달)；
- `GET /session-guard/state?session=<id>` — `freeRun` 객체 추가: `{ state, active, available, timezone, windows: [{id, from, to, fromInput, toInput, fromDisplay, toDisplay, paused, status}], activeId, msRemaining, nextStartMs, nextStartDisplay }` — 새 `active` 불리언(제거된 `enabled` 불리언을 대체)에 주의. 각 윈도우는 `paused`를 가지며 `status`는 `active` / `paused` / `scheduled` / `ended`일 수 있습니다；
- `POST /session-guard/rpc` — 플러그인급 액션 `reloadConfig`(**`sessionId` 불필요**)와 세션급 畅跑 액션 `freeRunAdd {sessionId, from, to}`(작업 생성. 일시정지 상태가 같은 겹침/인접 작업과 병합), `freeRunRemove {sessionId, id}`(작업 하나 삭제), `freeRunPause {sessionId, id}` / `freeRunResume {sessionId, id}`(**하나**의 작업 일시정지 / 재개), `freeRunPauseAll {sessionId}` / `freeRunResumeAll {sessionId}`(아직 끝나지 않은 모든 작업 일시정지 / 재개 — 툴바의 두 번째 버튼), `freeRunClear {sessionId}`(모든 작업 삭제 — 툴바의 세 번째 버튼)를 추가. 예전 세션급 `freeRunSuspend` / `freeRunResume`(`id`를 받지 않음)는 **제거되었습니다**. 잘못된 입력(그리고 알 수 없는 작업 `id`)은 이유를 설명하는 `{ok:false, error}`를 반환합니다(예: `to`는 `from`보다 뒤여야 함).

#### 기본 피크 정의, 그리고 "중국 법정 공휴일은 인식하지 않습니다" (중요한 제약)

**출하 기본 피크 정의**를 한 문장으로: 타임존 `Asia/Shanghai`(북경 시간); **피크** = 월–금
`09:00–12:00`과 `14:00–18:00`(`peakWindows[].days: [mon…fri]`로 한정); **그 외는 모두 유휴**
(주말 포함. 단 **법정 공휴일은 포함하지 않음** — 다음 문단 참조). 시간대·타임존·주말 규칙 변경은
설정 파일 편집만으로 끝납니다(위의 표 참조).

**본 플러그인은 중국 법정 공휴일을 인식하지 않습니다**. 공휴일 캘린더가 없으며, 평일에 해당하는 법정
공휴일은 **평범한 평일**로 취급되므로 피크 윈도우에 들어가면 **피크**가 되고 가드는 **평소처럼 세션을
일시정지합니다**(예: 국경절·단오절·중추절·춘절 연휴 중 평일 10:00은 PEAK). 이는 **의도적인 범위 결정**입니다
— 공휴일 캘린더는 대체 근무일(调休), 작업 스케줄링, 다중 세션 관리와 마찬가지로 명시적 비대상입니다.

**반면 주말은 무조건 유휴입니다 — 대체 근무일(调休)까지 포함합니다**: 국무원이 근무일로 지정한 토요일도
여전히 `OFF_PEAK`이며 피크로 취급되지 않습니다.

**"유휴"는 "일시정지되지 않음"**을 뜻하며 내부의 두 모드를 포함합니다: `OFF_PEAK`(주말, 종일)와
`NORMAL`(평일 피크 윈도우 밖). 일시정지를 일으키는 것은 `PEAK`뿐입니다 — 세 가지 모드 용어가 섞이지 않도록
여기서 한 번 명시합니다.

**날짜 단위 제외 설정은 현재 없습니다** — `peakWindows[].days`는 **요일** 단위까지의 세분성만 가지므로
특정 하루를 설정 파일 편집으로 제외할 수 **없습니다**(`"2026-10-01"` 같은 값은 인식되지 않습니다).
오늘 취할 수 있는 현실적인 선택은 두 가지뿐입니다: 그날만 가드를 끄거나(`config/session-guard.json`의
`enabled`, 또는 설정 패널), 그날 피크 윈도우에서 일시정지되는 것을 받아들이는 것입니다.

> 앞으로 공휴일 지원을 한다면 기존 아키텍처에서 자연스러운 형태는 `config/session-guard.json`에
> `holidays: ["YYYY-MM-DD", …]` 목록을 두고 설정 타임존으로 평가하는 것입니다 — **현재는 미구현**.

#### 동작 변경과 제약 (정직하게 기재)

- **기본 피크 윈도우에 `days: ["mon"…"fri"]`가 붙습니다**: 기본 주말 규칙과 함께면 실효 동작은 그대로지만, 주말 규칙을 끄고 **출하 기본 윈도우를 유지**하면 토/일은 더 이상 피크가 아닙니다 — 주말 피크를 원하면 `days`를 넓히거나 생략하세요；
- **피크 윈도우는 이제 설정 타임존으로 판정됩니다**: `timezone`을 명시적으로 비북경 권역으로 둔 사용자는 피크가 이동합니다(이것이 본 기능의 목적입니다). 과금 정렬을 유지하려면 `peakPolicy.timezone: "Asia/Shanghai"`를 고정하세요. 기본 `timezone`에서는 no-op입니다；
- **자동 오피크 복귀는 더 이상 수동 `/pause`를 덮어쓰지 않습니다**；
- **명시적 비대상**: 공휴일 캘린더(위 "중국 법정 공휴일은 인식하지 않습니다" 참조), 대체 근무일(调休), 작업 스케줄링, 다중 세션 관리.

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

- **피크/오피크判定**: `timezone`(기본 `Asia/Shanghai`)이 **모든** 판정(요일·주말·피크 윈도우 일치)을 구동합니다. v0.3.0부터 이는 **하드코딩이 아닙니다**: `peakPolicy.timezone`으로 피크 판정만 DeepSeek 과금 타임존에 고정하고 주말은 로컬 `timezone`을 따르게 할 수 있습니다；
- **주말判定**: 사용자 설정 `timezone` (예: `Asia/Tokyo`, `Asia/Seoul`) 사용. "주말"은 로컬 개념이므로；
- `Intl.DateTimeFormat`으로 타임존 투영. 잘못된 IANA 타임존 이름은 `RangeError`로 fail-open하여 `Asia/Shanghai`로 폴백；
- 피크 윈도우는 **좌폐우개** `[start, end)`. 자정 횡단 윈도우 (예: `22:00–06:00`, **시작일**에 귀속) 지원.

### 상태 배지 (프론트엔드 표시)

컴포저 입력 영역 오른쪽에 **읽기 전용** 상태 배지 표시:

| 단계 | 라벨 | CSS 클래스 | 의미 |
|---|---|---|---|
| `peak` (2차 판정 on) | 高峰·拦官方 | `sg-peak` | 피크 시간대, DeepSeek 공식 소스만 차단 |
| `peak` (2차 판정 off) | 高峰·全部暂停 | `sg-peak` | 피크 시간대, 모든 세션 정지 |
| `off-peak` | 谷时 | `sg-off` | 오피크 시간대, 세션 정상 실행 |
| `weekend` | 週末 | `sg-weekend` | 주말 (주말 모드 활성화 시), 피크/오피크 무시 |

- 15초마다 `GET /session-guard/status` 폴링(`phase` / `providerGuard` / `held` / `deferred` / `stepHeld`. v0.3.0부터는 `mode` / `reason` / `windowName` / `minutesUntilPeak` / `peakTimezone` / `weekendDays` / `configFile`도 반환하며 `phase`는 호환을 위해 유지)；
- fail-open: 라우트 도달 불가·네트워크 오류·`enabled` OFF → 배지 숨김；
- **input-traffic에 의존하지 않음**: session-guard 클라이언트 코드가 단독으로 렌더링. input-traffic는 동결 버튼만 담당；

### input-traffic와의 협업

- input-traffic의 **"❄ 동결 후 추가" 버튼**은 `sessionGuard.stopNextTurn` (RPC, 세션별)로 전달하며 **먼저 step 게이트를 해제**합니다 (그렇지 않으면 턴급 일시정지가 영원히 오지 않는 안전 경계를 기다려 상호 대기가 됨)；
### input-traffic와의 역할 분담: "멈추는" 쪽과 "줄 세우는" 쪽

**DSH 큐 의미론(두 개의 큐)**: `next-step` = "다음 step 경계를 기다리는 입력"(다음 `agent/pre-step`에서 **도구 결과와 같은 레벨**의 step으로 같은 turn 안에서 소비), `next-turn` = "독립 턴을 기다리는 프롬프트"(현재 턴 종료 후 **새 turn**으로 소비). `Inbox.claim()`은 **항상 `next-step`을 먼저 전부** 가져가고, 새 턴을 여는 경계에서만 `next-turn`을 **1건** 추가로 가져갑니다.

- **session-guard = 멈춤**: 언제 진행 가능한지만 결정하며 **큐 내용·순서는 건드리지 않습니다**. step 게이트(`agent/pre-step`, 다음 step의 모델 요청 전), 턴급 일시정지(`agent.cancel({keepInbox:true})` + `goals.pause`, **큐는 그대로 보존**), 요청급 hold(`agent/request`).
- **input-traffic = 줄 세움**: 사용자 입력이 어느 큐에, 어떤 단계로 들어가 언제 소비될지만 결정합니다(3단계: 빨강=interrupt는 `cancel()` 후 `steer`, 노랑=`steer`(→ `next-step`), 초록=`next-turn` 대기). 동결 = `queued`+`steering` 행을 단계째로 분리 + composer 차단 + `sessionGuard.stopNextTurn`; 재개 = 차단 해제 → `sessionGuard.resume` → 단계 순 재투입.
- **접점의 두 불변식**: ① 동결은 본 플러그인이 **먼저 step 게이트를 해제**하게 해야 합니다(아니면 턴급 일시정지가 영원히 오지 않는 안전 경계를 기다려 상호 대기). ② step 게이트 보류 중에는 `preStep()`이 waterfall 전에 `inbox.claim()`을 끝냈으므로 새 입력은 이미 가져간 배치 뒤에 줄을 섭니다(`keepInbox`는 턴급에만 적용).
- 버튼: 본 플러그인의 "畅跑"(order 20)와 input-traffic의 "❄ 동결 후 추가 / 재개 후 추가"(order 30)는 **병렬 표시·상호 대체 없음** — 전자는 단일 세션에 시간 한정 피크 면제를 예약하고, 후자는 큐 분리 + 턴급 동결을 담당합니다.

## 테스트

```bash
npm test   # node --test "tests/*.test.mjs"（368개 통과: 타임존/피크 정책/설정 파일/주말/상태 기계/세션 게이트/畅跑/브리지/재시도）
```

## 라이선스

MIT — [LICENSE](LICENSE) 참조.

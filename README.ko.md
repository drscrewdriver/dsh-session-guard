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
| `offPeakAutoResume` | on | **오피크 자동 재개**: 오피크에 일시정지 세션을 자동 재개 |
| `weekendMode` | on | **주말 모드**: 주말 인식 → 주말 자동 일시정지 안 함 |
| `queueFallback` | on | 커스텀 세션 게이트 사용 불가 시 락 대기 큐로 폴백 (fail-open) |
| `retryEnabled` | off | **자동 재시도 (백엔드)**: 일시적 실패 자동 재시도 (기본값 off, 보수적) |

추가 설정:

- `timezone` (기본값 Asia/Shanghai) — **주말判定**과 배지 표시에 사용. **피크/오피크判定에는 영향 없음** (피크는 항상 북경 시간)；
- `peakWindows` (기본값 09:00–12:00 / 14:00–18:00) — 북경 시간(UTC+8) 기준 피크 윈도우. DeepSeek 공식 과금과 일치；
- `pauseMode` (`safe`/`force`), `pauseReason` (`wait`/`stop`)；
- 재시도 매개변수: `retryText`, `retryGraceMs`, `retryCooldownMs`, `retryBackoffFactor`, `retryBackoffMaxMs`, `retryMaxConsecutive`.

## 동작

### 피크 자동 게이트 (글로벌)

- **피크 진입** (그리고 주말 아님): 모든 running 루트 세션에 `gate.stopNextTurn` 호출 — 커스텀 세션 게이트로 진정한 일시정지 (추론 중단 안 함, 안전 경계에서 일시정지), `queueFallback`으로 락 대기 큐 폴백；
- **오피크 / 주말**: `gate.resume` **모든** 세션 (자동 재개, 수동 불필요) — `offPeakAutoResume` 스위치로 제어；
- **피크 타임존**: 하드코딩된 북경 시간 (`Asia/Shanghai`), DeepSeek 공식 과금 기준과 일치 — `timezone` 설정의 영향을 받지 않음；
- 상태 머신: 단일 인스턴스 `NORMAL ↔ PAUSED_PEAK` (`scheduler.js`), 단일 30s tick으로 구동.

### 타임존 처리

- **피크/오피크判定**: 항상 **북경 시간(UTC+8)** 사용 (`BILLING_TIMEZONE = 'Asia/Shanghai'`). DeepSeek 공식 과금 기준. `timezone` 설정으로 변경 불가 (하드코딩)；
- **주말判定**: 사용자 설정 `timezone` (예: `Asia/Tokyo`, `Asia/Seoul`) 사용. "주말"은 로컬 개념이므로；
- `Intl.DateTimeFormat`으로 타임존 투영. 잘못된 IANA 타임존 이름은 `RangeError`로 fail-open하여 `Asia/Shanghai`로 폴백；
- 피크 윈도우는 **좌폐우개** `[start, end)`. 자정 횡단 윈도우 (예: `22:00–06:00`) 지원.

### 상태 배지 (프론트엔드 표시)

컴포저 입력 영역 오른쪽에 **읽기 전용** 상태 배지 표시:

| 단계 | 라벨 | CSS 클래스 | 의미 |
|---|---|---|---|
| `peak` | 高峰 | `sg-peak` | 평일 피크 시간대, 세션 자동 일시정지 중 |
| `off-peak` | 谷时 | `sg-off` | 오피크 시간대, 세션 정상 실행 |
| `weekend` | 週末 | `sg-weekend` | 주말 (주말 모드 활성화 시), 피크/오피크 무시 |

- 15초마다 `GET /session-guard/status` 폴링；
- fail-open: 라우트 도달 불가·네트워크 오류·`enabled` OFF → 배지 숨김；
- **input-traffic에 의존하지 않음**: session-guard 클라이언트 코드가 단독으로 렌더링. input-traffic는 동결 버튼만 담당；

### input-traffic와의 협업

- input-traffic의 **동결 버튼**은 `sessionGuard.stopNextTurn` (RPC, 세션별) 경유 서버사이드에 전달；
- input-traffic는 **동결 강화만** (큐 동결/해제 + composer 차단), 재시도는 본 플러그인 백엔드가 처리；
- 둘 다 "세션 격리" 시맨틱 공유: input-traffic 동결 큐는 sessionId로 격리, session-guard RPC도 sessionId로 격리.

## 라이선스

MIT — [LICENSE](LICENSE) 참조.

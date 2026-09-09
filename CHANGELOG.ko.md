# 변경 기록

`dsh-session-guard`의 주요 변경 사항을 기록합니다. 버전은 시맨틱 버저닝을 따릅니다.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## Unreleased

### 추가

- **공식 소스 2차 판정(피크 × 대상 provider)**: 피크 시간에는 대상 라우트가 DeepSeek 공식 소스일 때만 차단하고, 로컬/서드파티 provider는 정상 실행. 판정 순서는 명시 `officialProviders` id 목록 → 실시간 `baseURL` 엔드포인트 → catalog 내장 엔드포인트(pi-ai의 `deepseek`) → 내장 id(`deepseek-official`)이며 `matchedBy`를 반환. 신규 모듈: `src/provider.js`(순수), `src/provider-directory.js`, `src/deferrals.js`, `src/request-guard.js`, `src/targets.js`, `src/wiring.js`.
- **요청급 백스톱(`agent/request`)**: 피크 진입 후 시작된 세션, 도중에 공식 소스로 전환된 세션을 포착(30s tick은 전환 시점에 `running`이던 세션만 처리). 기본 `hold`는 오류 없이 보류하고 피크 종료 순간 해제(`msUntilOffPeak`); `error`는 식별 가능한 `PEAK_DEFERRED`를 던지고 연기 큐에 기록.
- **새 설정**: `providerGuard`, `officialProviders`, `officialBaseURLs`, `deferredResume`, `deferredResumeText`, `deferredMode`, `deferredMaxHoldMs`(기본 6h), `guardSubagents`.
- **새 라우트**: `GET /session-guard/provider?provider=<id>`(판정 진단). `/session-guard/status`가 `providerGuard` / `held` / `deferred` 반환.
- **드리프트 가드** `tools/check-api-drift.ps1`(4개 tag에서 필수 API 존재 검증).

### 변경

- **DSH 이중 버전 지원(0.1.0-rc.7 … 0.1.2-rc.1)**: 하나의 산출물로 `dsh-v0.1.1-rc.2`와 `dsh-v0.1.2-rc.1` 지원.
- **설정 표면은 교집합 API만**: `settings.register` + `settings.get`. `installSection`(0.1.2+)과 제거된 `installSettingsSection`은 사용하지 않음. 선택적 API는 특성 감지 후 강등.
- **`src/retry.js`는 정확한 `PEAK_DEFERRED`만 단락**: 429 / `RATE_LIMIT` / `TRANSPORT` / 타임아웃은 여전히 일시적으로 처리. DSH 전역 재시도(`dsh-llm-retry`)는 불변.
- 배지가 "피크·공식만"과 "피크·전체 정지"를 구분.

## 0.1.4 — 2026-09-09

### 변경

- **공개 베타**(`0.1.4-beta.1`): 이중 버전 라인의 베타 채널용으로 버전 표기·README 호환 표·패키지 메타데이터 정비.

## 0.1.1 — 2026-08-24

### 추가

- **백엔드 자동 재시도(D9)**: `turn/end` 일시적 실패(error/429/max-tokens)는 적응형 백오프의 `followup(retryText)`로 자동 재개; 영구 실패(인증/잔액/모델/컨텍스트 제한)는 중지; 사용자 개입 또는 성공 턴에서 연속 실패 카운트 리셋.
- **동결/게이트 양보**: `isFrozen(sessionId)`가 참일 때 재시도 건너뜀, 세션 게이트를 우회하지 않음.

### 변경

- `sessionGuard` 중복 포트가 `state(sessionId)`를 노출하여 `{ queueLocked, lockReason, paused, taskControlAvailable, taskControl }` 반환.
- HTTP 라우트 `GET /session-guard/diag`가 재시도 상태를 포함한 런타임 진단 반환.

### 수정

- 주말 감지를 벌거벗은 `getUTCDay()`에서 `Intl.DateTimeFormat`(설정된 타임존 사용)으로 변경, 베이징 타임존 8시간 경계 버그 수정.

## 0.1.0 — 2026-08-18

### 추가

- 최초 릴리스: 피크 자동 일시정지(글로벌), 주말 모드, `sessionGuard` 중복 포트 + RPC 브리지 기반 세션별 동결/재개, 커스텀 세션 게이트, 설정 패널.

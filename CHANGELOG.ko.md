# 변경 기록

`dsh-session-guard`의 주요 변경 사항을 기록합니다. 버전은 시맨틱 버저닝을 따릅니다.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

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

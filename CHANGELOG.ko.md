# 변경 기록

`dsh-session-guard`의 주요 변경 사항을 기록합니다. 버전은 시맨틱 버저닝을 따릅니다.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## 0.4.0 — 2026-09-18 (잘못된 버전 번호, 3.0.0으로 대체됨)

### 수정

- **버전 식별**: 본 라인은 `0.4.0`으로 배포되었지만 `dsh.plugin.json`과 본 변경 기록은 이미
  `3.0.0`을 표기하고 있어, 하나의 산출물에 두 개의 버전 번호가 존재했습니다. `package.json`을
  `3.0.0`으로 통일하여 패키지 버전·매니페스트 버전·변경 기록이 일치합니다. npm 버전은 불변이므로
  `0.4.0`은 역사적 기록으로 남깁니다. `3.0.0` 배포 후에는 `dist-tag dsh-0.1.5`를 `3.0.0`으로
  다시 지정해야 합니다.
- **문서**: README/INSTALL(zh/en/ja/ko)이 형제 라인을 `main`에 있다고 설명하던 것을 수정.
  0.1.2 라인의 릴리스 브랜치는 **`legacy/0.1.2`**(npm dist-tag `dsh-0.1.2`, 버전 `0.3.1`)이며
  `main`은 `0.2.0-beta.1`에서 동결되었습니다. INSTALL.zh/ja/ko의 중복된
  브랜치 조각을 수정하고, dist-tag를 명시한 설치 명령을 기재했습니다.
  "2.x / 3.x"는 **라인 통칭**이며 버전 번호가 아님을 명시.

### 비고

- **소스 변경 없음**(`3.0.0` 대비). `0.4.0`은 동일 트리의 패키징 전용 배포입니다.

## 3.0.0 — 2026-09-14

### 변경

- **DSH v0.1.5-rc.2 전용 라인(`compat/0.1.5`).** `engines.dsh`와 `dsh-client-*` peer 범위를
  `>=0.1.5-rc.2 <0.2.0-0`으로 좁혔습니다(semver 프리릴리스 규칙상 기존 `>=0.1.0-rc.7`은
  `0.1.5-rc.2`와 일치하지 않음). `dsh.plugin.json`에 `engines.dsh`를 추가했습니다. 구버전
  호스트용으로는 `main`의 2.x / 0.2.x 라인이 계속 유지됩니다.
- **`session.events` → `snapshotEvents()`.** DSH 0.1.5에서 `session.events` 배열 접근자가
  제거됨에 따라(compatibility-guide §20.3) `pause-gate.js`는 듀얼 패스 헬퍼로 세션 이벤트를
  읽습니다: 우선 `snapshotEvents()`, 방어적으로 구 `events` 배열로 폴백, 둘 다 없으면 `null`
  (fail-open). 대상은 `findToolOutcome`과 `lastUserPrompt` 두 곳뿐이며 이벤트 타입 매칭은
  불변입니다.

### 변경 없음

- 나머지 연동면은 전부 무변경: 자체 webServer prefix 라우트(`/session-guard/rpc`),
  `settings.register`, `settings.plugin.item` 슬롯, 클라이언트 주입,
  `llm.listConfigurableProviders()`는 공개된 0.1.5-rc.2 번들 기준으로 검증 완료
  (`tools/check-api-drift.ps1`, 필수 어설션 12/12).

### 보류

- 실제 DSH 0.1.5-rc.2 호스트에서의 라이브 스모크(perm-gate 0.1.5 라인과 동일 상태).

## 0.2.0-beta.2 — 2026-09-13

### 수정 (DSH 0.1.5 호환 — `compat/0.1.5` 브랜치)

- **재개 큐잉 듀얼 경로.** DSH 0.1.5에서는 Inbox가 agent-loop의 읽기 전용 프로젝션으로
  바뀌어 `agent.followup`이 존재하지 않을 수 있습니다. 재개 시 `agent.followup` →
  `agent.send` → warn 강등(예외 없음) 순으로 시도합니다.
- **재개 메시지 `source`에 `form: 'instructions'` 추가** (0.1.5 `ContextFormed` 계약;
  구버전은 알 수 없는 필드를 무시합니다).
- **`webServer.register` try/catch 보호**: 라우트 등록 실패는 로그만 남기고 `apply`에서
  예외를 던져 호스트 플러그인 로딩을 깨뜨리지 않습니다.
- 0.1.5-rc.2 소스 기준 `WebRoute`(exact/prefix + SSE) 계약이 불변임을 확인했습니다.
  클라이언트 `fetch('/session-guard/...')`에 `/api` 접두사는 불필요합니다.

## 0.2.0-beta.1 — 2026-09-10

### 추가

- **step급 게이트(`agent/pre-step`)**: 피크 시간에 턴 경계에서 중단하는 대신 **다음 step의 모델 요청 전에** 턴을 보류합니다. 세션은 다음 `agent/pre-step`까지 진행하고 거기서 게이트가 닫힙니다(설정 `stepLevelPause`, 기본 on). 오피크에는 **그 자리에서** 재개되며 followup 메시지가 필요 없습니다. 게이트 조건: 피크(북경 시간) + 주말 아님 + `step > 1` + 대상 provider가 공식(`providerGuard`) + 요청급 hold 아님 + 이번 피크 구간에서 스킵 아님. 신규 모듈 `src/step-gate.js`(순수 `decideStepHold` + hold / release / abort / timeout 엔진).
- **`stepResume` 포트 + RPC + `/resume`**: `sessionGuard.stepResume(sessionId, {bypass})`, `POST /session-guard/rpc {action:'stepResume'}`, `/resume` 모두 게이트를 해제합니다. 수동 재개는 해당 피크 구간 동안 게이트를 중단합니다.
- **타임아웃 승격**: `stepGateTimeoutMs`(기본 300000)로 게이트를 해제하고 **턴급 force 일시정지로 승격**합니다. 긴 피크에서도 교착이 없고 "5분마다 1 step" 누수도 없습니다.
- **"⏸ 일시정지" 버튼**(클라이언트, slot `conversation.input.right`, id `session-guard-pause`, order 20 — input-traffic 동결 버튼 왼쪽). 1초마다 `/session-guard/state`를 폴링하며, 미보류 시 비활성, 보류 시 `stepResume`을 호출합니다. 배지는 order 40으로 이동하고 step 보류 수를 표시합니다.
- **신규 설정**: `stepLevelPause`, `stepGateTimeoutMs`.
- **신규 상태**: `GET /session-guard/state`가 `paused: { step, turn }`과 `stepGate: { held, since, bypass }`를 반환하고, `/status`는 `stepHeld`, `/diag`는 `stepGate`를 반환합니다. 서비스 포트 `state().paused`는 호환을 위해 불리언 유지(신규 필드 `pausedStep`).

### 수정

- **step 보류와 턴급 일시정지의 교착**: `pauseTask` / `resumeTask` / `cancelTask`가 먼저 step 게이트를 해제합니다. step 보류는 `agent/pre-step`에 있어 `assistant/message` / `tool/result`가 영원히 오지 않으므로, `safe` 일시정지가 무한 대기하고 `paused`도 영속화되지 않았습니다.

### 변경

- **피크 진입 시 실행 중 턴을 중단하지 않습니다**(`stepLevelPause` on일 때 `onEnterPeak`는 `stopNextTurn` 대신 step 게이트를 arm). off일 때는 기존 턴급 동작 그대로입니다.
- input-traffic 동결 버튼 라벨이 **"동결 후 추가"**로 바뀌었고(`冻结追加` / `Freeze & append` / `凍結して追加`), 재개 라벨은 **"재개 후 추가"**(`恢复追加` / `Resume & append` / `再開して追加`)입니다 — 턴을 동결하면서 큐를 보존하는 동작으로, 일시정지 버튼과는 다릅니다.
- **일시정지 버튼이 토글이 되었습니다**: "일시정지" / "재개" (회색 비활성 상태 제거). "일시정지"는 새 `stepPause`를 호출해 **다음 step 경계**에서 세션을 보류합니다(step 1도 대상, 피크/provider 제한 없음). "재개"는 `stepResume`. 신규 포트 메서드 `sessionGuard.stepPause(sessionId)`.
- **SSE push**: 새 라우트 `GET /session-guard/events?session=<id>`가 step 게이트 상태 변화를 즉시 전달 — 피크에서 자동으로 닫히는 순간 버튼이 "재개"로 바뀝니다. 10초 폴링은 폴백으로 남습니다. `/state`는 `paused.manual`과 `stepGate.manual`을 반환합니다.
- **스타일을 input-traffic 컴포저 버튼과 맞췄습니다**(높이 24px / 반경 6px / 12px 글꼴 / 동일 border·hover·pressed 토큰). 버튼과 상태 배지 모두. 스타일은 `<style data-plugin-css="session-guard-client">`로 한 번만 주입.

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

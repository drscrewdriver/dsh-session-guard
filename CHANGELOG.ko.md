# 변경 기록

`dsh-session-guard`의 주요 변경 사항을 기록합니다. 버전은 시맨틱 버저닝을 따릅니다.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## 0.3.0 — 2026-09-21

### 추가

- **설정 가능한 피크/오피크 정책(`config/session-guard.json`)**: 피크/주말 정책이 더 이상 코드에 하드코딩되지 않고 하나의 JSON으로 기술됩니다. 해석 순서(먼저 맞는 것 승리): `$DSH_SESSION_GUARD_CONFIG` → `$DSH_HOME/config/session-guard.json`(사용자급, 평소 여기를 편집) → `<cwd>/config/session-guard.json`(프로젝트급) → `<plugin>/config/session-guard.json`(패키지 동봉 기본값). 이 파일은 cordis `settings` 네임스페이스의 **기본 레이어**입니다: 설정 UI(설정 → 플러그인 → session-guard)에서 명시한 값이 우선하며, `settings` 서비스를 쓸 수 없으면 파일 값이 그대로 적용됩니다. 잘못된 파일이 시작을 막는 일은 **없습니다**: 오류는 수집되어 warning으로 기록되고 내장 기본값으로 폴백합니다(fail-open). `POST /session-guard/rpc {"action":"reloadConfig"}`로 재시작 없이 다시 읽을 수 있습니다.
- **시간 정책 리졸버(`TimePolicyResolver`), 3가지 모드**: ① 당일이 주말일(`weekendPolicy` 기준) → **OFF_PEAK**(종일, 피크 윈도우 무시); ② 그렇지 않고 피크 윈도우에 일치 → **PEAK**; ③ 그 외 → **NORMAL**(평일 오피크). v0.2.0의 2값 판정은 호환을 위해 유지: `pause === (mode === PEAK)`, `reason`은 기존값 `'disabled' | 'weekend' | 'peak' | 'off-peak'`. 레거시 설정 형태(`peakWindows: [{start,end}]` + `weekendMode: true/false`)도 계속 동작합니다(`days` 없음 = 매일).
- **畅跑(free-run, 신규)**: 컴포저에 "畅跑" 버튼 하나(slot `conversation.input.right`, id `session-guard-free-run`, order 20). **단일 세션**에 시간 한정 피크 면제 작업을 예약합니다. 작업 윈도우는 절대 기시각/종시각·반개구간 `[from, to)`·시간 정밀도이며 설정 `timezone`으로 해석됩니다. `from`이 현재보다 이르면 현재로 클램프됩니다("즉시 시작" 가능). 각 작업은 `to`에서 자동 종료되어 더 이상 매칭되지 않습니다 — 정상 수명 주기이며 **오류가 아닙니다**. 반복해서 다시 예약할 수 있습니다. **일시정지 단위는 작업별**: `paused`는 **개별 작업**에 붙고(세션급 활성/비활성 스위치는 더 이상 없음), **일시정지되지 않은 작업이 하나 이상 지금 이 순간을 포함**하면 畅跑가 효력을 가집니다. 일시정지된 작업은 판정에 참여하지 않고 자동 상태 전환도 만들지 않습니다(스스로 시작하지 않음). **자동 병합은 일시정지 상태가 같은 윈도우 사이에서만 발생**: 겹치거나 인접(인접 = 이어서 계속 달리기)하면서 일시정지 상태가 같은 윈도우가 병합되고, 일시정지 윈도우와 활성 윈도우가 겹치면 둘 다 유지됩니다. 병합 후 최대 8개이며 초과는 명확한 오류. 예약은 **영속화**(세션당 JSON 하나)되어 재시작해도 유지됩니다. 효력이 있는 동안에는 그 세션이 어디에도 보류되지 않으며, 턴급 / step 게이트 일시정지는 건너뛰고 원래 `agent/request`에서 보류될 요청도 통과시킵니다(**세션 단위 `release`** 추가). 畅跑가 더 이상 적용되지 않을 때(이 순간을 포함하는 모든 작업이 일시정지되었거나 작업이 피크 안에서 끝났을 때) **다시 일시정지**되고 오피크에서 자동 계속됩니다.
- **畅跑 관리 패널(재설계)**: 버튼 문구는 **고정**으로 "畅跑"(작업이 2개 이상이면 `畅跑 ×N`). **클릭은 항상 "畅跑 작업 관리" 패널을 엽니다**(구버전에서는 "畅跑中" 클릭이 곧바로 일시정지여서 효력 중에는 패널에 도달할 수 없는 사각지대가 있었는데, 그것이 해소되었습니다). 효력 상태는 버튼 강조 색과 호버 표시로 나타나며, 호버 표시는 각 작업의 시간 범위와 상태도 나열합니다. 패널이 유일한 UI 표면입니다: 상단 툴바의 텍스트 버튼 3개 `新建畅跑任务`(인라인 폼: `开始` / `结束`, 네이티브 날짜 선택기 + 시간 셀렉트, 시간 단위, `确定` / `取消`), `暂停全部任务`(끝나지 않은 작업이 모두 일시정지 상태면 `恢复全部任务`로 반전. 대상이 없으면 비활성), `删除全部任务`(작업이 없으면 비활성); 각 작업 행 오른쪽에 `⏸` / `▶`(그 작업 하나를 일시정지 / 재개, 끝난 작업은 비활성)와 `×`(그 작업 삭제) 아이콘 버튼 2개; 각 행에 시간 범위와 상태 태그 `进行中` / `已暂停` / `待开始` / `已结束`; 헤더에 제목·타임존·닫기 `×`를 표시하며 바깥 클릭이나 Esc로도 닫힙니다.
- **신규 모듈**: `src/free-run.js`(畅跑 모델 + 스토어), `src/client/free-run-button.tsx`, `src/client/free-run-button-text.ts`(문구와 상태 투영, 순수 함수로 단위 테스트 가능), 그리고 `TimePolicyResolver`(시간 정책 해석). 테스트는 `tests/free-run.test.mjs`(25), `tests/free-run-isolation.test.mjs`(7), `tests/free-run-button-text.test.mjs`(10)를 추가했고 `tests/config-file.test.mjs`는 29, `tests/index-apply.test.mjs`는 21. **368개 전부 통과**.
- **신규 라우트** `GET /session-guard/peak`: 실시간 모드(PEAK/OFF_PEAK/NORMAL), 일치한 윈도우 이름, 피크까지 남은 분, 다음 피크, 오피크까지 남은 ms, 정규화된 정책.
- **신규 필드와 RPC 액션**: `GET /session-guard/state`에 `freeRun` 객체(`state` / `active` / `available` / `timezone` / `windows[]`(각 항목에 `id` / `from` / `to` / `fromInput` / `toInput` / `fromDisplay` / `toDisplay` / `paused` / `status`) / `activeId` / `msRemaining` / `nextStartMs` / `nextStartDisplay`) 추가 — `active`는 기존 `enabled`를 대체하며, 윈도우의 `status`는 `active` / `paused` / `scheduled` / `ended`일 수 있습니다; `GET /session-guard/diag`에 `freeRun`(`{tracked, active, persisted, root}`) 추가; `POST /session-guard/rpc`에 플러그인급 `reloadConfig`(`sessionId` 불필요)와 세션급 `freeRunAdd` / `freeRunRemove` / `freeRunPause` / `freeRunResume` / `freeRunPauseAll` / `freeRunResumeAll` / `freeRunClear` 추가(잘못된 입력과 알 수 없는 작업 `id`는 `{ok:false, error}`를 반환하며, 예를 들어 `to`는 `from`보다 뒤여야 함).
- **신규 설정**(`peakPolicy` 내): `timezone`(선택, 피크 윈도우 판정만 덮어씀), `peakWindows`(여러 개 지원, `days` 생략/빈 값 = 매일, `start > end` = 자정 횡단이며 **시작일**에 귀속), 그리고 최상위 `weekendPolicy`.
- **파라미터 검증과 안전한 폴백(가드를 조용히 망가뜨리는 일은 더 이상 없습니다)**: `timezone`(`peakPolicy.timezone` 포함)은 **IANA 데이터베이스**로 검증되며, 잘못되거나 철자가 틀린 값(예: `"Asia/Shangai"`)은 거부되고 기본 `Asia/Shanghai`가 유지됩니다(`Asia/Calcutta` 같은 별칭은 허용). 파일을 읽을 수 없음, 잘못된 JSON, `peakWindows`가 배열이 아니거나 잘못됨, 스칼라 범위 초과 — 모두 `configFile.errors`(`GET /session-guard/settings`와 `/diag`에서 확인 가능)에 기록되고 시작 시와 `reloadConfig` 시 warning이 남습니다. 영향을 받은 키는 기본값을 유지하며 "피크 윈도우 없음" 상태나 작동하지 않는 가드로 퇴화하지 않습니다. 명시적 `"peakWindows": []`는 의도적인 "피크 윈도우 없음"으로 취급됩니다. 설정 값이 설정 schema를 통과하지 못해도 설정 패널은 **내장 기본값으로 등록되며**(조용히 사라지지 않음) 잘못된 값은 무시되고 warning이 기록됩니다.

### 변경

- **피크 윈도우 판정 타임존 설정 가능**: `timezone`(IANA 이름)이 이제 **모든** 판정(요일·주말·윈도우 일치)을 구동하며 기본값은 `Asia/Shanghai`입니다. `peakPolicy.timezone`은 선택이며, 피크를 DeepSeek 과금 타임존에 고정하면서 주말은 로컬 `timezone`을 따르게 할 수 있습니다. 기본 설정에서는 둘 다 `Asia/Shanghai`라 v0.2.0과 동일하게 동작합니다.
- **기본 피크 윈도우에 `days: ["mon"…"fri"]`가 붙습니다.** 기본 주말 규칙과 함께면 실효 동작은 그대로지만, **주말 규칙을 끄고 출하 기본 윈도우를 유지**하면 토/일은 더 이상 피크가 아닙니다. 주말 피크를 원하면 `days`를 넓히거나 생략하세요.
- **자동 복귀는 모드가 더 이상 PEAK가 아닐 때** 발생합니다(OFF_PEAK 주말과 NORMAL 평일 오피크 모두). 자동 해제(피크 종료·주말·비공식 provider로 전환)는 `auto: true`로 호출되므로 **본 플러그인이 정지한 세션만** 재개합니다. 사용자가 수동 `/pause`한 세션은 자동 복귀 대상이 아닙니다(수동 `/resume`은 항상 유효).
- **일시정지가 `pausedReason`을 기록**: 피크 정책 정지는 `"peak_window"`, 명시적 `/pause`는 `"manual"`. `GET /session-guard/state`가 `paused.reason`을 반환합니다.
- **`GET /session-guard/status`**는 `mode`, `reason`, `windowName`, `minutesUntilPeak`, `peakTimezone`, `weekendDays`, 해석된 `configFile` 경로를 보고하며 **`billingTimezone`은 더 이상 보고하지 않습니다**. 기존 클라이언트 배지를 위해 레거시 `phase`(`weekend`/`peak`/`off-peak`)는 유지합니다.
- **`GET /session-guard/settings`**에 `configFile: {path, candidates, errors}` 추가; **`GET /session-guard/diag`**에 `configFile`과 `freeRun` 진단 추가.
- **`GET /session-guard/events`(SSE)**는 이제 `step` 이벤트만 스트리밍합니다.
- **컴포저 버튼 교체**: 예전 "일시정지 / 재개" 버튼(slot `session-guard-pause`)을 제거하고, "畅跑" 버튼(slot `session-guard-free-run`, order 20, input-traffic 동결 버튼 왼쪽)이 그 자리를 대신합니다. `/pause`, `/resume`, `/cancel` 슬래시 명령과 `sessionGuard` 중복 포트(`stepPause` / `stepResume` 포함)는 **변경 없습니다**.
- **畅跑 인터랙션 재설계(같은 PR 안에서 개정)**: 버튼 문구는 "畅跑"/"畅跑 ×N"으로 고정되고 **클릭은 항상 관리 패널을 엽니다**(구버전에서는 "畅跑中" 클릭이 곧바로 일시정지여서 효력 중에는 패널에 도달할 수 없는 사각지대가 있었는데, 그것이 해소되었습니다). 일시정지는 **세션급**에서 **작업별**로 바뀌었고 세션급 활성/비활성 스위치는 제거되었습니다. 세션급 `freeRunSuspend` / `freeRunResume`(`id` 없음)는 제거되고, 작업 `id` 단위의 `freeRunPause` / `freeRunResume`와 툴바에 대응하는 `freeRunPauseAll` / `freeRunResumeAll`로 대체되었습니다. 윈도우 시맨틱(단일 세션, 절대 기시각/종시각 `[from, to)`, 시간 정밀도, `from`의 현재 클램프, 도달 시 자동 종료하며 오류로 보고하지 않는 일회성, 영속화, 상한 8)은 모두 그대로입니다.
- **더 이상 하드코딩이 없습니다**: 피크 시각, 타임존, 요일 제한, 주말 규칙 변경은 모두 설정 파일 편집만으로 가능합니다.

### 비고

- **피크 전 질문은 리뷰에서 제거되었습니다**: 실용적인 용도가 없었기 때문입니다 — 실제 요구는 "이 세션을 지금 바로 돌리는 것"이었고, 畅跑가 더 단순하고 예측 가능한 형태로 그것을 충족했습니다. 따라서 피크 전 경고·카운트다운·계속 패스는 모두 삭제되었습니다.
- **중국 법정 공휴일은 인식하지 않습니다(의도적)**: 출하 기본 피크 정의 = "`Asia/Shanghai` 타임존에서 월–금
  `09:00–12:00` / `14:00–18:00`이 피크, 그 외는 유휴". 공휴일 캘린더가 **없으며**, 평일에 해당하는 법정 공휴일은
  평범한 평일로 취급되므로 피크 윈도우에 들어가면 **피크가 되어 평소처럼 일시정지됩니다**(국경절·단오절·중추절·
  춘절 연휴 중 평일 10:00은 PEAK). 반면 주말은 무조건 유휴이며 **대체 근무일(调休)까지 포함합니다**(근무일로
  지정된 토요일도 `OFF_PEAK` 유지). "유휴" = 일시정지되지 않음, 즉 `OFF_PEAK`(주말 종일)와 `NORMAL`(평일 피크
  윈도우 밖) 두 모드이고 일시정지를 일으키는 것은 `PEAK`뿐입니다. **날짜 단위 제외 설정은 현재 없습니다**
  (`peakWindows[].days`는 요일 단위까지) — 그날만 `enabled`를 끄거나(설정 파일 또는 설정 패널) 일시정지를
  받아들이는 두 가지뿐입니다.
- **명시적 비대상**: 공휴일 캘린더, 대체 근무일(调休), 작업 스케줄링, 다중 세션 관리.

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

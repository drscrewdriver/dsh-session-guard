# 변경 기록

`dsh-session-guard`의 주요 변경 사항을 기록합니다. 버전은 시맨틱 버저닝을 따릅니다.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## Unreleased — `compat/0.1.7` 라인: 설정 가능한 피크 정책 + 畅跑

### 추가

- **설정 가능한 피크 정책(`config/session-guard.json`)**: 피크/주말 정책이 더 이상 코드에 하드코딩되지 않고 하나의 JSON으로 기술됩니다. 해석 순서(먼저 맞는 것 승리): `$DSH_SESSION_GUARD_CONFIG` → `$DSH_HOME/config/session-guard.json`(사용자급, 평소 여기를 편집) → `<cwd>/config/session-guard.json`(프로젝트급) → `<plugin>/config/session-guard.json`(패키지 동봉 기본값). 이 파일은 **기본 레이어**이며, dsh가 `Config`의 `.volatile()` 필드에서 자동 생성하는 설정 폼에서 명시한 값이 우선합니다(런타임 값 = 설정 파일 기본 레이어 ← 합성 엔트리의 폼 덮어쓰기 레이어). 잘못된 파일이 시작을 막는 일은 **없습니다**: 오류는 수집되어 warning으로 기록되고 해당 키는 내장 기본값을 유지합니다(fail-open) — 원인은 `GET /session-guard/settings`와 `GET /session-guard/diag`의 `configFile.errors`에서 확인할 수 있습니다. `POST /session-guard/rpc {"action":"reloadConfig"}`로 재시작 없이 다시 읽을 수 있습니다(다시 읽는 것은 기본 레이어뿐이며 폼에 입력한 값은 계속 우선합니다).
- **잘못된 설정이 가드를 조용히 무효화하는 일은 이제 없습니다**: 읽을 수 없는 파일, 잘못된 JSON, 배열이 아니거나 완전히 잘못된 `peakWindows`, 범위를 벗어난 스칼라, 잘못된 타임존은 모두 기록되고 해당 키는 기본값을 유지합니다 — "피크 윈도우 없음"으로의 조용한 퇴화나 결코 일시정지하지 않는 가드가 되지 않습니다. 명시적 `"peakWindows": []`는 의도적인 "피크 윈도우 없음"으로 존중되며, 설정 schema를 통과하지 못하는 파일 값이라도 폼은 **내장 기본값으로 계속 생성됩니다**(조용히 사라지지 않음).
- **시간 정책 리졸버(`TimePolicyResolver`), 3가지 모드**: ① 당일이 주말일(`weekendPolicy` 기준) → **OFF_PEAK**(종일, 피크 윈도우 무시); ② 그렇지 않고 피크 윈도우에 일치 → **PEAK**; ③ 그 외 → **NORMAL**(평일 오피크). v0.2.0의 2값 판정은 호환을 위해 유지: `pause === (mode === PEAK)`, `reason`은 기존값 `'disabled' | 'weekend' | 'peak' | 'off-peak'`. 레거시 설정 형태(`peakWindows: [{start,end}]` + `weekendMode: true/false`)도 계속 동작합니다(`days` 없음 = 매일).
- **畅跑(free-run)**: 컴포저에 "畅跑" 버튼 하나(slot `conversation.input.right`, id `session-guard-free-run`, order 20 — input-traffic 동결 버튼 왼쪽)가 **단일 세션**에 시간 한정 피크 면제 작업을 예약합니다. 문구는 **고정**으로 `畅跑`(작업이 2개 이상이면 `畅跑 ×N`)이고, **클릭은 항상 "畅跑 작업 관리" 패널을 엽니다**. 현재 효력이 있는지는 버튼 강조 색과 호버 표시로 나타나며, 호버 표시는 각 작업의 시간 범위와 상태도 나열합니다.
- **畅跑 패널**: 유일한 새 UI 표면입니다. 툴바의 텍스트 버튼 `新建畅跑任务`(인라인 폼 `开始` / `结束`, `确定` / `取消`), `暂停全部任务`(끝나지 않은 작업이 모두 일시정지 상태면 `恢复全部任务`로 반전. 대상이 없으면 비활성), `删除全部任务`(작업이 없으면 비활성). 각 작업 행에는 `⏸` / `▶`(**그 작업 하나**를 일시정지 / 재개. 끝난 작업은 비활성)와 `×`(그 작업 삭제) 아이콘 버튼 2개, 시간 범위, 상태 태그(`进行中` / `已暂停` / `待开始` / `已结束`)가 붙습니다. 헤더에는 제목, 시간을 해석하는 타임존, 닫기용 `×`가 표시되며 바깥 클릭이나 Esc로도 닫힙니다.
- **畅跑 새 작업 폼은 듀얼 먼스 날짜 범위 달력**입니다: `‹‹ ‹ … › ››` 연/월 내비게이션과 함께 두 달이 나란히 표시되고, 주 시작은 월요일, 오늘은 테두리, 선택 범위는 배경 강조, 양 끝점은 채워진 원입니다. 첫 클릭이 시작, 두 번째가 끝을 고르며 역순이면 자동 교체되고 범위가 채워지면 자동으로 닫힙니다. 패널을 열면 **현재 시각**으로 초기화되고(시작 = 현재 시의 정각 `H:00`, 끝 = 다음 시의 `H+1:59` — 시계 두 시간), 시간 정밀도를 위해 시간 셀렉트가 함께 있으며 `现在` 버튼으로 다시 시드할 수 있습니다.
- **畅跑 시맨틱**: 작업은 **절대 기시각/종시각**·반개구간 `[from, to)`·**시간 정밀도**이며 설정된 `timezone`으로 해석됩니다. 과거의 `from`은 현재로 클램프("즉시 시작" 가능); **일회성**이라 `to`를 지나면 단순히 더 이상 매칭되지 않는 것이 정상 수명 주기이고 **오류가 아닙니다**(만료 임박 경고도 없습니다). **자동 병합은 일시정지 상태가 같은 윈도우 사이에서만** 발생하며(겹침 또는 인접 = 이어서 계속 달리기), 일시정지 윈도우와 활성 윈도우가 겹치면 둘 다 유지되고 병합 후 상한은 **8**개(초과는 명확한 오류)입니다. **일시정지는 작업별**이고 세션급 스위치는 폐지되었으며, **일시정지되지 않은 작업이 하나 이상 현재를 포함**하면 면제가 효력을 가집니다. 일시정지된 작업은 자동 상태 전환을 만들지 않습니다. 예약은 세션당 JSON으로 **영속화**되어 dsh를 재시작해도 미래의 `from`을 잃지 않습니다.
- **세 곳 모두에서의 세션 단위 면제**: 畅跑가 효력을 가지는 동안 그 세션은 어디에도 보류되지 않습니다 — 자동 턴급 / step 게이트 일시정지는 건너뛰고, 원래 `agent/request`에서 보류될 요청도 해제됩니다(**세션 단위 `release`** 추가). 畅跑가 더 이상 적용되지 않을 때(현재를 포함하는 모든 작업이 일시정지되었거나 작업의 윈도우가 피크 안에서 끝났을 때) 세션이 **다시 일시정지**되고 다음 오피크에 자동 재개됩니다. `providerGuard`, 수동 `/pause`, 주말 규칙, 전역 피크 상태 기계에는 영향을 주지 않습니다(`GET /session-guard/status`는 전역 그대로 — 畅跑는 세션급이며 상태 배지를 바꾸지 않습니다).
- **畅跑 시간은 시간 단위로 끝 시각을 포함합니다**: 시작 시 H는 `H:00`, 끝 시 H는 `H:59`이므로 끝 시의 한 시간이 통째로 포함됩니다 — `"시작 12시 → 끝 14시"` = `12:00 → 14:59`(12·13·14시 세 시간), `"시작 12시 → 끝 12시"`는 정확히 그 한 시간만 덮고, `"끝 23시"` = `23:59`라 하루의 마지막 한 시간(23:00–24:00)도 고를 수 있습니다(이전에는 `23:00`이라 그 한 시간을 고를 수 없었습니다). 호스트의 윈도우는 여전히 반개구간 `[from, to)`이고 선택기가 `:59`를 넘겨줄 뿐입니다. 기본 시드도 그에 맞춰 바뀌었습니다: 시작 = 현재 시(`H:00`), 끝 = **다음 시**(`H+1:59`) — 시계 두 시간이며 23시를 넘기면 다음 날로 이월합니다(이전에는 `+2h`).
- **신규 라우트** `GET /session-guard/peak`: 실시간 모드(PEAK/OFF_PEAK/NORMAL), 일치한 윈도우 이름, 피크까지 남은 분, 다음 피크, 오피크까지 남은 ms, 정규화된 정책.
- **신규 필드와 RPC 액션**: `GET /session-guard/state`에 `freeRun` 객체(`state` / `active` / `available` / `timezone` / `windows[]`(각 항목에 `id` / `from` / `to` / `fromInput` / `toInput` / `fromDisplay` / `toDisplay` / `paused` / `status`) / `activeId` / `msRemaining` / `nextStartMs` / `nextStartDisplay`) 추가 — `active`는 제거된 `enabled`를 대체하며, 윈도우의 `status`는 `active` / `paused` / `scheduled` / `ended`일 수 있습니다; `GET /session-guard/diag`에 `freeRun`(`{tracked, active, persisted, root}`) 추가; `POST /session-guard/rpc`에 플러그인급 `reloadConfig`(`sessionId` 불필요)와 세션급 `freeRunAdd` / `freeRunRemove` / `freeRunPause` / `freeRunResume` / `freeRunPauseAll` / `freeRunResumeAll` / `freeRunClear` 추가(잘못된 입력과 알 수 없는 작업 `id`는 `{ok:false, error}`를 반환하며, 예를 들어 `to`는 `from`보다 뒤여야 함).
- **신규 모듈**: `src/time-policy.js`(`TimePolicyResolver`), `src/config-file.js`, `src/free-run.js`, `src/client/free-run-button.tsx`, `src/client/free-run-button-text.ts`, `src/client/date-range-picker.tsx`, `src/client/date-range.ts`. 신규 테스트: `tests/time-policy.test.mjs`, `tests/config-file.test.mjs`, `tests/free-run.test.mjs`, `tests/free-run-isolation.test.mjs`, `tests/free-run-button-text.test.mjs`, `tests/date-range.test.mjs`. **397개 전부 통과**(`node --test "tests/*.test.mjs"`).
- **신규 설정**(`peakPolicy` 내): `timezone`(선택, 피크 윈도우 판정만 덮어씀), `peakWindows`(여러 개 지원, `days` 생략/빈 값 = 매일, `start > end` = 자정 횡단이며 **시작일**에 귀속), 그리고 최상위 `weekendPolicy`.
- **파라미터 검증과 안전한 폴백(가드를 조용히 망가뜨리는 일은 더 이상 없습니다)**: `timezone`(`peakPolicy.timezone` 포함)은 **IANA 데이터베이스**로 검증되며, 잘못되거나 철자가 틀린 값(예: `"Asia/Shangai"`)은 거부되고 기본 `Asia/Shanghai`가 유지됩니다(`Asia/Calcutta` 같은 별칭은 허용). 파일을 읽을 수 없음, 잘못된 JSON, `peakWindows`가 배열이 아니거나 잘못됨, 스칼라 범위 초과 — 모두 `configFile.errors`(`GET /session-guard/settings`와 `/diag`에서 확인 가능)에 기록되고 시작 시와 `reloadConfig` 시 warning이 남습니다.

### 변경

- **본 라인의 설정면이 선언식이 되었습니다.** 본 라인의 `settings` 서비스는 **여전히 존재합니다**(구현 클래스 `SettingsForms`, `describe()` 있음). 다만 `dsh-settings`는 **`register()`를 더 이상 제공하지 않고(`get()`도 없습니다)** `describe()`와 `configure()`만 남습니다. 플러그인은 `export const Config = SettingsSchema`로 바꾸고 각 필드에 `.volatile()`을 붙였으므로 dsh가 **설정 폼을 자동 생성**합니다. 런타임 값은 apply의 합성 엔트리를 `config/session-guard.json` 기본 레이어 위에 병합해 읽습니다. 플러그인은 네임스페이스를 등록하지 않고 자체 설정 카드도 두지 않으며 `settings`를 **inject하지 않습니다** — **서비스가 없기 때문이 아니라** 이 서비스에서 아무것도 소비하지 않기 때문입니다(호출할 `register`도, 읽을 `get`도 없음). 클라이언트 절반은 별개로, **클라이언트 측** `settingsScope`는 본 라인에서 실제로 제공되지 않으며 이를 클라이언트의 정적 `inject`에 선언하면 엔트리가 영원히 pending(`waiting for service: settingsScope`)이 되어 web boot가 치명적으로 실패했습니다 — 그래서 클라이언트는 `inject = ['slots', 'locale']`를 쓰고 설정 카드도 두지 않습니다.
- **컴포저 버튼 교체**: 예전 "일시정지 / 재개" 버튼(slot `session-guard-pause`, `src/client/pause-button.tsx` / `pause-button-text.ts`, 그 4가지 상태)을 제거하고, "畅跑" 버튼(slot `session-guard-free-run`, order 20)이 그 자리를 대신합니다. `/pause`, `/resume`, `/cancel` 슬래시 명령과 `sessionGuard` 중복 포트(`stepPause` / `stepResume` 포함)는 **변경 없습니다**.
- **피크 윈도우 판정 타임존 설정 가능**: `timezone`(IANA 이름)이 이제 **모든** 판정(요일·주말·윈도우 일치)을 구동하며 기본값은 `Asia/Shanghai`입니다. `peakPolicy.timezone`(플랫 설정에서는 `peakTimezone`)은 선택이며, 피크를 DeepSeek 과금 타임존에 고정하면서 주말은 로컬 `timezone`을 따르게 할 수 있습니다. 기본 설정에서는 둘 다 `Asia/Shanghai`라 v0.2.0과 동일하게 동작합니다. 타임존은 IANA 데이터베이스로 검증되므로 `"Asia/Shangai"` 같은 철자 오류는 거부되고 기본값이 유지됩니다.
- **기본 피크 윈도우에 `days: ["mon"…"fri"]`가 붙습니다.** 기본 주말 규칙과 함께면 실효 동작은 그대로지만, **주말 규칙을 끄고 출하 기본 윈도우를 유지**하면 토/일은 더 이상 피크가 아닙니다. 주말 피크를 원하면 `days`를 넓히거나 생략하세요.
- **자동 오피크 해제는 본 플러그인이 정지한 세션만 재개합니다.** 자동 해제(피크 종료·주말·비공식 provider로 전환)는 `auto: true`로 호출되므로 수동 `/pause`한 세션은 덮어쓰지 않습니다(수동 `/resume`은 항상 유효). `pause`는 `pausedReason`을 기록하고(피크 정책은 `"peak_window"`, 명시적 `/pause`는 `"manual"`), `GET /session-guard/state`가 `paused.reason`을 반환합니다.
- **`GET /session-guard/status`**는 `mode`, `reason`, `windowName`, `minutesUntilPeak`, `peakTimezone`, `weekendDays`, 해석된 `configFile` 경로를 보고하며 **`billingTimezone`은 더 이상 보고하지 않습니다**. 기존 클라이언트 배지를 위해 레거시 `phase`(`weekend`/`peak`/`off-peak`)는 유지합니다. `GET /session-guard/settings`에 `configFile: {path, candidates, errors}` 추가; `GET /session-guard/diag`에 `configFile`과 `freeRun` 추가; `GET /session-guard/events`(SSE)는 `step` 이벤트만 스트리밍합니다. 상태 배지는 전역이며 畅跑로 바뀌지 않습니다.
- **더 이상 하드코딩이 없습니다**: 피크 시각, 타임존, 요일 제한, 주말 규칙 변경은 모두 설정 파일(또는 자동 생성 폼) 편집만으로 가능합니다.

### 비고

- **중국 법정 공휴일은 인식하지 않습니다(의도적)**: 출하 기본 피크 정의 = "`Asia/Shanghai` 타임존에서 월–금
  `09:00–12:00` / `14:00–18:00`이 피크, 그 외는 유휴". 공휴일 캘린더가 **없으며**, 평일에 해당하는 법정 공휴일은
  평범한 평일로 취급되므로 피크 윈도우에 들어가면 **피크가 되어 평소처럼 일시정지됩니다**(국경절·단오절·중추절·
  춘절 연휴 중 평일 10:00은 PEAK). 반면 주말은 무조건 유휴이며 **대체 근무일(调休)까지 포함합니다**(근무일로
  지정된 토요일도 `OFF_PEAK` 유지). "유휴" = 일시정지되지 않음, 즉 `OFF_PEAK`(주말 종일)와 `NORMAL`(평일 피크
  윈도우 밖) 두 모드이고 일시정지를 일으키는 것은 `PEAK`뿐입니다. **날짜 단위 제외 설정은 현재 없습니다**
  (`peakWindows[].days`는 요일 단위까지) — 그날만 `enabled`를 끄거나(설정 파일 또는 설정 폼) 일시정지를
  받아들이는 두 가지뿐입니다.
- **명시적 비대상**: 공휴일 캘린더, 대체 근무일(调休), 작업 스케줄링, 다중 세션 관리.
- **피크 전 질문은 리뷰에서 제거되었습니다**: 실용적인 용도가 없었기 때문입니다 — 실제 요구는 "이 세션을 지금 바로 돌리는 것"이었고, 畅跑가 더 단순하고 예측 가능한 형태로 그것을 충족했습니다. 따라서 피크 전 경고·카운트다운·계속 패스는 모두 삭제되었습니다.
- **본 라인 식별 정보는 불변**: 브랜치 `compat/0.1.7`, npm 버전 `3.1.1`, dist-tag `dsh-0.1.7`, `package.json`과 `dsh.plugin.json`의 `engines.dsh = >=0.1.7-rc.1 <0.1.8-0`.

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

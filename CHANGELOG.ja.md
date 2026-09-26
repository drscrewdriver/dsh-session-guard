# 変更履歴

`dsh-session-guard` の主な変更を記録します。バージョンはセマンティックバージョニングに従います。

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## 0.3.0 — 2026-09-21

### 追加

- **設定可能な峰谷ポリシー（`config/session-guard.json`）**：峰谷/週末ポリシーはコードにハードコードされず、1 つの JSON で記述します。解決順（最初にヒットしたものが有効）：`$DSH_SESSION_GUARD_CONFIG` → `$DSH_HOME/config/session-guard.json`（ユーザー級、通常はここを編集）→ `<cwd>/config/session-guard.json`（プロジェクト級）→ `<plugin>/config/session-guard.json`（パッケージ同梱の既定値）。このファイルは cordis `settings` 名前空間の**既定レイヤー**です：設定 UI（設定 → プラグイン → session-guard）で明示した値が優先され、`settings` サービスが利用できない場合はファイル値がそのまま使われます。壊れたファイルが起動を止めることは**ありません**：エラーは収集され warning として記録され、内蔵既定値へフォールバックします（fail-open）。`POST /session-guard/rpc {"action":"reloadConfig"}` で再起動なしに再読み込みできます。
- **時間ポリシーリゾルバ（`TimePolicyResolver`）、3 モード**：① 当日が週末日（`weekendPolicy` 準拠）→ **OFF_PEAK**（終日、峰谷ウィンドウを無視）；② そうでなく峰谷ウィンドウに一致 → **PEAK**；③ それ以外 → **NORMAL**（平日の谷時）。v0.2.0 の 2 値判定は互換のため維持：`pause === (mode === PEAK)`、`reason` は従来どおり `'disabled' | 'weekend' | 'peak' | 'off-peak'`。旧設定形状（`peakWindows: [{start,end}]` + `weekendMode: true/false`）も引き続き動作します（`days` なし = 毎日）。
- **畅跑（free-run、新規）**：コンポーザーに 1 つの「畅跑」ボタン（slot `conversation.input.right`、id `session-guard-free-run`、order 20）。**単一セッション**に時間限定の峰谷免除タスクを排定します。タスクのウィンドウは絶対起止時刻・半開区間 `[from, to)`・時間精度で、設定 `timezone` で解釈されます。`from` が現在より前なら現在にクランプ（「すぐ開始」が可能）。各タスクは `to` で自動終了しマッチしなくなります——これは正常なライフサイクルで**エラーではありません**。繰り返し再排定できます。**一時停止の粒度はタスクごと**：`paused` は**個々のタスク**に付き（セッション級の有効/無効スイッチはもうありません）、**未一時停止のタスクが 1 つ以上この瞬間をカバー**していれば畅跑が生效します。一時停止中のタスクは判定に参加せず、自動状態遷移も起こしません（自分から開始しません）。**自動マージは一時停止状態が同じウィンドウ間でのみ発生**：重複または隣接（隣接 = そのまま続けて走る）し、一時停止状態が同じウィンドウがマージされ、一時停止ウィンドウと有効ウィンドウが重なっても両方とも保持されます。マージ後は最大 8 個で、超過は明確なエラー。排期は**永続化**（1 セッション 1 JSON）され再起動でも失われません。生效中はそのセッションがどこにも保留されず、ターン級 / step ゲート一時停止はスキップし、本来 `agent/request` で保留されるリクエストも通します（**セッション単位の `release`** を追加）。畅跑が適用されなくなったとき（この瞬間をカバーする全タスクが一時停止、またはタスクがピーク内で終了）は**再び一時停止**し、退峰で自動継続します。
- **畅跑の時間は時間単位で終端を含みます**：開始時間 H は `H:00`、終了時間 H は `H:59` で、終了時間の 1 時間は丸ごと含まれます（「開始 12 時 → 終了 14 時」= `12:00 → 14:59` で 12・13・14 時の 3 時間、「開始 12 時 → 終了 12 時」はちょうどその 1 時間だけ、「終了 23 時」= `23:59` となり一日の最後の 1 時間 23:00–24:00 も選べます）。ホスト側のウィンドウは半開区間 `[from, to)` のままで、ピッカーが `:59` を渡すだけです。
- **畅跑管理パネル（再設計）**：ボタン文言は**固定**で「畅跑」（タスクが 2 つ以上なら `畅跑 ×N`）。**クリックは常に「畅跑タスク管理」パネルを開き**、生效状態はボタンのハイライト色とホバー表示で示されます。ホバー表示は各タスクの時間範囲と状態も一覧します。パネルが唯一の UI 表面です：上部ツールバーの 3 つのテキストボタン `新建畅跑任务`（インラインフォーム：`开始` / `结束`、ネイティブ日付ピッカー + 時間セレクト、時間粒度、`确定` / `取消`）、`暂停全部任务`（未終了タスクがすべて一時停止済みなら `恢复全部任务` に反転。対象がないときは無効）、`删除全部任务`（タスクがないときは無効）；各タスク行の右側に `⏸` / `▶`（その 1 つのタスクを一時停止 / 再開、終了済みは無効）と `×`（そのタスクを削除）の 2 つのアイコンボタン；各行に時間範囲と状態タグ `进行中` / `已暂停` / `待开始` / `已结束`；ヘッダーにタイトル・タイムゾーン・閉じる `×` を表示し、外側クリックまたは Esc でも閉じられます。
- **新モジュール**：`src/free-run.js`（畅跑モデル + ストア）、`src/client/free-run-button.tsx`、`src/client/free-run-button-text.ts`（文言と状態投影、純関数で単測可能）、および `TimePolicyResolver`（時間ポリシー解析）。テストは `tests/free-run.test.mjs`（25）、`tests/free-run-isolation.test.mjs`（7）、`tests/free-run-button-text.test.mjs`（10）を追加し、`tests/config-file.test.mjs` は 29、`tests/date-range.test.mjs` は 20、`tests/index-apply.test.mjs` は 23。**390 件すべて成功**。
- **新ルート** `GET /session-guard/peak`：リアルタイムモード（PEAK/OFF_PEAK/NORMAL）、一致したウィンドウ名、ピークまでの分数、次のピーク、退峰までのミリ秒、正規化されたポリシー。
- **新フィールドと RPC アクション**：`GET /session-guard/state` に `freeRun` オブジェクト（`state` / `active` / `available` / `timezone` / `windows[]`（各項に `id` / `from` / `to` / `fromInput` / `toInput` / `fromDisplay` / `toDisplay` / `paused` / `status`）/ `activeId` / `msRemaining` / `nextStartMs` / `nextStartDisplay`）を追加——`active` は旧 `enabled` を置き換え、ウィンドウの `status` は `active` / `paused` / `scheduled` / `ended` を取り得ます；`GET /session-guard/diag` に `freeRun`（`{tracked, active, persisted, root}`）を追加；`POST /session-guard/rpc` にプラグイン級 `reloadConfig`（`sessionId` 不要）とセッション級 `freeRunAdd` / `freeRunRemove` / `freeRunPause` / `freeRunResume` / `freeRunPauseAll` / `freeRunResumeAll` / `freeRunClear` を追加（不正入力と未知のタスク `id` は `{ok:false, error}` を返し、例えば `to` は `from` より後でなければならない）。
- **新設定**（`peakPolicy` 内）：`timezone`（任意、ピークウィンドウ判定のみ上書き）、`peakWindows`（複数可、`days` 省略/空 = 毎日、`start > end` = 深夜跨ぎで**開始日**に帰属）、およびトップレベルの `weekendPolicy`。
- **パラメータ検証と安全なフォールバック（「静かにガードを壊す」ことはもう起きません）**：`timezone`（`peakPolicy.timezone` を含む）は **IANA データベース**で検証され、無効・綴り間違い（例 `"Asia/Shangai"`）は拒否されて既定の `Asia/Shanghai` が保たれます（`Asia/Calcutta` などの別名は可）。ファイルが読めない、JSON が不正、`peakWindows` が配列でない/不正、スカラーが範囲外——いずれも `configFile.errors`（`GET /session-guard/settings` と `/diag` で確認可）に記録され、起動時と `reloadConfig` 時に warning が出ます。影響を受けたキーは既定値に留まり、「峰ウィンドウが無い」状態や機能しないガードに退化しません。明示的な `"peakWindows": []` は意図的な「峰ウィンドウ無し」として扱われます。設定値が設定 schema を通らない場合でも、設定パネルは**内蔵既定値で登録され**（黙って消えることはありません）、不正値は無視されて warning が記録されます。

### 変更

- **ピークウィンドウ判定のタイムゾーンが設定可能に**：`timezone`（IANA 名）が**すべての**判定（曜日・週末・ウィンドウ一致）を駆動し、既定は `Asia/Shanghai`。`peakPolicy.timezone` は任意で、ピークを DeepSeek 課金タイムゾーンに固定しつつ、週末はローカル `timezone` に従わせられます。既定設定では両方 `Asia/Shanghai` のため v0.2.0 と同一挙動です。
- **既定のピークウィンドウが `days: ["mon"…"fri"]` を持ちます。** 既定の週末ルールと組み合わせると実効挙動は不変ですが、**週末ルールを無効化して出荷時の既定ウィンドウを残す**と土日はピークではなくなります。週末もピークにしたい場合は `days` を広げるか省略してください。
- **自動復帰はモードが PEAK でなくなったとき**（OFF_PEAK の週末と NORMAL の平日谷時の両方）に発生します。自動解放（退峰・週末・非公式 provider への切り替え）は `auto: true` で呼ばれるため、**本プラグインが停止したセッションのみ**を再開します。手動 `/pause` したセッションは自動復帰の対象外です（手動 `/resume` は常に有効）。
- **一時停止が `pausedReason` を記録**：峰谷ポリシーによる停止は `"peak_window"`、明示的な `/pause` は `"manual"`。`GET /session-guard/state` は `paused.reason` を返すようになりました。
- **`GET /session-guard/status`** は `mode`、`reason`、`windowName`、`minutesUntilPeak`、`peakTimezone`、`weekendDays`、解決された `configFile` パスを返し、**`billingTimezone` は返さなくなりました**。既存クライアントバッジ用に旧 `phase`（`weekend`/`peak`/`off-peak`）は維持します。
- **`GET /session-guard/settings`** に `configFile: {path, candidates, errors}` を追加；**`GET /session-guard/diag`** に `configFile` と `freeRun` 診断を追加。
- **`GET /session-guard/events`（SSE）** は `step` イベントのみを配信するようになりました。
- **コンポーザーボタンの交代**：旧「一時停止 / 再開」ボタン（slot `session-guard-pause`）を削除し、「畅跑」ボタン（slot `session-guard-free-run`、order 20、input-traffic の凍結ボタンの左）がその位置を引き継ぎます。`/pause`、`/resume`、`/cancel` スラッシュコマンドと `sessionGuard` 冗余ポート（`stepPause` / `stepResume` を含む）は**変更ありません**。
- **畅跑インタラクションの再設計（同一 PR 内で改定）**：ボタン文言は「畅跑」/「畅跑 ×N」に固定され、**クリックは常に管理パネルを開きます**（旧版では「畅跑中」のクリックが直接一時停止になり、生效中はパネルに到達できない死角がありました——それが解消されました）。一時停止は**セッション級**から**タスクごと**に変わり、セッション級の有効/無効スイッチは削除されました。セッション級 `freeRunSuspend` / `freeRunResume`（`id` なし）は削除され、タスク `id` 単位の `freeRunPause` / `freeRunResume` と、ツールバーに対応する `freeRunPauseAll` / `freeRunResumeAll` に置き換わりました。ウィンドウのセマンティクス（単一セッション、絶対起止時刻 `[from, to)`、`from` の現在へのクランプ、到点で自動終了しエラーにしない一回性、永続化、上限 8）はすべて不変です；時間精度はその後**終端包含**（開始時間 = `H:00`、終了時間 = `H:59`。上記参照）に細分化されました。
- **ハードコードは一切なくなりました**：ピーク時刻・タイムゾーン・曜日限定・週末ルールの変更は設定ファイルの編集のみです。

### 備考

- **ピーク前の確認はレビューで削除されました**：実用的な用途がなかったためです——本当の要件は「このセッションを今すぐ走らせる」ことで、畅跑がより単純で予測可能な形でそれを満たしました。そのためピーク前の警告・カウントダウン・継続パスはすべて削除しました。
- **中国の法定祝日は認識しません（意図的）**：出荷時の既定の峰谷定義 = 「`Asia/Shanghai` タイムゾーンで月〜金
  `09:00–12:00` / `14:00–18:00` がピーク、それ以外はアイドル」。祝日カレンダーは**存在せず**、平日にあたる
  法定祝日は通常の平日として扱われるため、ピークウィンドウに入れば**ピークとなり通常どおり一時停止します**
  （国慶節・端午節・中秋節・春節の休日期間中の平日 10:00 は PEAK）。一方、週末は無条件にアイドルで、
  **振替出勤日も含みます**（就業日と指定された土曜も `OFF_PEAK` のまま）。「アイドル」= 一時停止されない、
  つまり `OFF_PEAK`（週末終日）と `NORMAL`（平日のピークウィンドウ外）の 2 モードで、一時停止を起こすのは
  `PEAK` のみです。**日付単位の除外設定は現在ありません**（`peakWindows[].days` は曜日粒度まで）——その日だけ
  `enabled` を切る（設定ファイルまたは設定パネル）か、一時停止を受け入れるかの二択です。
- **明示的に対象外**：祝日カレンダー、振替出勤日、タスクスケジューリング、マルチセッション管理。

## 0.2.0-beta.1 — 2026-09-10

### 追加

- **step 級ゲート（`agent/pre-step`）**：ピーク時、ターン境界で中断するのではなく、**次の step のモデルリクエスト前**にターンを保留します。セッションは次の `agent/pre-step` まで走り、そこでゲートが閉じます（設定 `stepLevelPause`、既定 on）。退峰時は**その場で**再開し、followup メッセージは不要。ゲート条件：ピーク（北京時間）+ 非週末 + `step > 1` + 対象 provider が公式（`providerGuard`）+ リクエスト級 hold なし + このピーク期間でスキップなし。新規モジュール `src/step-gate.js`（純関数 `decideStepHold` + hold / release / abort / timeout エンジン）。
- **`stepResume` ポート + RPC + `/resume`**：`sessionGuard.stepResume(sessionId, {bypass})`、`POST /session-guard/rpc {action:'stepResume'}`、`/resume` のいずれでもゲートを解放。手動再開はそのピーク期間中のゲートを停止します。
- **タイムアウト昇格**：`stepGateTimeoutMs`（既定 300000）でゲートを解放し**ターン級 force 一時停止へ昇格**。長時間ピークでもデッドロックせず、「5 分ごとに 1 step」の滴漏も起きません。
- **「⏸ 一時停止」ボタン**（クライアント、slot `conversation.input.right`、id `session-guard-pause`、order 20 — input-traffic の凍結ボタンの左）。1 秒ごとに `/session-guard/state` をポーリングし、未保留時は無効、保留時は `stepResume` を呼びます。バッジは order 40 へ移動し、step 保留数を表示。
- **新規設定**：`stepLevelPause`、`stepGateTimeoutMs`。
- **新規状態**：`GET /session-guard/state` が `paused: { step, turn }` と `stepGate: { held, since, bypass }` を返し、`/status` は `stepHeld`、`/diag` は `stepGate` を返します。サービス側 `state().paused` は互換のため真偽値のまま（新フィールド `pausedStep`）。

### 修正

- **step 保留とターン級一時停止のデッドロック**：`pauseTask` / `resumeTask` / `cancelTask` が先に step ゲートを解放します。step 保留は `agent/pre-step` 上にあり `assistant/message` / `tool/result` が永遠に来ないため、`safe` 一時停止が永久に待ち、`paused` も永続化されませんでした。

### 変更

- **ピーク入りで実行中ターンを中断しなくなりました**（`stepLevelPause` 有効時、`onEnterPeak` は `stopNextTurn` ではなく step ゲートを arm）。無効時は従来のターン級動作のままです。
- input-traffic の凍結ボタンのラベルは **「凍結して追加」** になりました（`冻结追加` / `Freeze & append` / `동결 후 추가`）。再開ラベルは **「再開して追加」**（`恢复追加` / `Resume & append` / `재개 후 추가`）——ターンを凍結しつつキューを保持する動作で、一時停止ボタンとは別物です。
- **一時停止ボタンはトグルになりました**：「一時停止」/「再開」（グレー無効状態は廃止）。「一時停止」は新規 `stepPause` を呼び、**次の step 境界**でセッションを保留します（step 1 も対象、峰谷 / provider の制限なし）。「再開」は `stepResume`。新ポートメソッド `sessionGuard.stepPause(sessionId)`。
- **SSE プッシュ**：新ルート `GET /session-guard/events?session=<id>` が step ゲート状態の変化を即時配信——ピークで自動的に閉じた瞬間にボタンが「再開」へ変わります。10 秒ポーリングはフォールバックとして残ります。`/state` は `paused.manual` と `stepGate.manual` を返すようになりました。
- **スタイルを input-traffic のコンポーザーボタンに揃えました**（高さ 24px / 角丸 6px / 12px フォント / 同じ border・hover・pressed トークン）。ボタンとステータスバッジの両方。スタイルは `<style data-plugin-css="session-guard-client">` で一度だけ注入。

## Unreleased

### 追加

- **公式ソース二次判定（ピーク × 対象 provider）**：ピーク時は対象ルートが DeepSeek 公式ソースの場合のみ遮断し、ローカル/第三者 provider は通常実行。判定順は明示 `officialProviders` id リスト → 実時間 `baseURL` エンドポイント → catalog 内蔵エンドポイント（pi-ai の `deepseek`）→ 内蔵 id（`deepseek-official`）で、`matchedBy` を返します。新規モジュール：`src/provider.js`（純関数）、`src/provider-directory.js`、`src/deferrals.js`、`src/request-guard.js`、`src/targets.js`、`src/wiring.js`。
- **リクエスト級バックストップ（`agent/request`）**：ピーク入場後に起動したセッション、途中で公式ソースへ切り替えたセッションを捕捉（30s tick は遷移時に `running` だったセッションのみ処理）。既定 `hold` はエラーなしで保留し、退峰の瞬間に解放（`msUntilOffPeak`）；`error` は識別可能な `PEAK_DEFERRED` を投げ延後キューに記録。
- **新しい設定**：`providerGuard`、`officialProviders`、`officialBaseURLs`、`deferredResume`、`deferredResumeText`、`deferredMode`、`deferredMaxHoldMs`（既定 6h）、`guardSubagents`。
- **新しいルート**：`GET /session-guard/provider?provider=<id>`（判定診断）。`/session-guard/status` は `providerGuard` / `held` / `deferred` を返します。
- **ドリフトガード** `tools/check-api-drift.ps1`（4 つの tag で必須 API の存在を検証）。

### 変更

- **DSH 二重バージョン対応（0.1.0-rc.7 … 0.1.2-rc.1）**：`dsh-v0.1.1-rc.2` と `dsh-v0.1.2-rc.1` を 1 つの成果物でカバー。
- **設定面は共通 API のみ**：`settings.register` + `settings.get`。`installSection`（0.1.2+）と削除された `installSettingsSection` は使用しません。任意 API は特性検出して降格。
- **`src/retry.js` は正確な `PEAK_DEFERRED` のみ短絡**：429 / `RATE_LIMIT` / `TRANSPORT` / タイムアウトは引き続き瞬時扱い。DSH のグローバルリトライ（`dsh-llm-retry`）は不変。
- バッジが「ピーク・公式のみ」と「ピーク・全停止」を区別。

## 0.1.4 — 2026-09-09

### 変更

- **公開ベータ**（`0.1.4-beta.1`）：二重バージョン系のベータチャネル向けにバージョン表記・README 互換表・パッケージメタデータを整備。

## 0.1.1 — 2026-08-24

### 追加

- **バックエンド自動リトライ（D9）**：`turn/end` の瞬時失敗（error/429/max-tokens）はアダプティブバックオフの `followup(retryText)` で自動再開。永久失敗（認証/残高/モデル/コンテキスト上限）は停止。ユーザー介入または成功ターンで連続失敗カウントをリセット。
- **凍結/ゲート譲歩**：`isFrozen(sessionId)` が真のときリトライをスキップ、セッションゲートを迂回しません。

### 変更

- `sessionGuard` 冗余ポートが `state(sessionId)` を公開し、`{ queueLocked, lockReason, paused, taskControlAvailable, taskControl }` を返すように。
- HTTP ルート `GET /session-guard/diag` がリトライ状態を含むランタイム診断を返すように。

### 修正

- 週末検出を裸 `getUTCDay()` から `Intl.DateTimeFormat`（設定タイムゾーン使用）に変更し、北京タイムゾーンの 8 時間境界バグを修正。

## 0.1.0 — 2026-08-18

### 追加

- 初回リリース：ピーク自動一時停止（グローバル）、週末モード、`sessionGuard` 冗余ポート + RPC ブリッジによるセッションごとの凍結/再開、カスタムセッションゲート、設定パネル。

# 変更履歴

`dsh-session-guard` の主な変更を記録します。バージョンはセマンティックバージョニングに従います。

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## Unreleased — `compat/0.1.7` ライン：設定可能な峰谷ポリシー + 畅跑

### 追加

- **設定可能な峰谷ポリシー（`config/session-guard.json`）**：峰谷/週末ポリシーはコードにハードコードされず、1 つの JSON で記述します。解決順（最初にヒットしたものが有効）：`$DSH_SESSION_GUARD_CONFIG` → `$DSH_HOME/config/session-guard.json`（ユーザー級、通常はここを編集）→ `<cwd>/config/session-guard.json`（プロジェクト級）→ `<plugin>/config/session-guard.json`（パッケージ同梱の既定値）。このファイルは**既定レイヤー**で、dsh が `Config` の `.volatile()` フィールドから自動生成する設定フォームで明示した値が優先されます（実行時の値 = 設定ファイルの既定レイヤー ← 合成エントリのフォーム上書き層）。壊れたファイルが起動を止めることは**ありません**：エラーは収集され warning として記録され、該当キーは内蔵既定値を保ちます（fail-open）——原因は `GET /session-guard/settings` と `GET /session-guard/diag` の `configFile.errors` で確認できます。`POST /session-guard/rpc {"action":"reloadConfig"}` で再起動なしに再読み込みできます（読み直すのは既定レイヤーのみで、フォームで入力した値は引き続き優先されます）。
- **不正な設定がガードを黙って無効化することはもうありません**：読めないファイル、不正な JSON、配列でない/完全に不正な `peakWindows`、範囲外のスカラー、不正なタイムゾーンはすべて記録され、該当キーは既定値を保ちます——「峰ウィンドウが無い」への静かな退化や、決して一時停止しないガードにはなりません。明示的な `"peakWindows": []` は意図的な「峰ウィンドウ無し」として尊重され、設定 schema を通らないファイル値でもフォームは**内蔵既定値から生成され続けます**（黙って消えることはありません）。
- **時間ポリシーリゾルバ（`TimePolicyResolver`）、3 モード**：① 当日が週末日（`weekendPolicy` 準拠）→ **OFF_PEAK**（終日、峰谷ウィンドウを無視）；② そうでなく峰谷ウィンドウに一致 → **PEAK**；③ それ以外 → **NORMAL**（平日の谷時）。v0.2.0 の 2 値判定は互換のため維持：`pause === (mode === PEAK)`、`reason` は従来どおり `'disabled' | 'weekend' | 'peak' | 'off-peak'`。旧設定形状（`peakWindows: [{start,end}]` + `weekendMode: true/false`）も引き続き動作します（`days` なし = 毎日）。
- **畅跑（free-run）**：コンポーザーに 1 つの「畅跑」ボタン（slot `conversation.input.right`、id `session-guard-free-run`、order 20 — input-traffic の凍結ボタンの左）が、**単一セッション**に時間限定の峰谷免除タスクを排定します。文言は**固定**で `畅跑`（タスクが 2 つ以上なら `畅跑 ×N`）、**クリックは常に「畅跑タスク管理」パネルを開きます**。現在生效しているかどうかはボタンのハイライト色とホバー表示で示され、ホバー表示は各タスクの時間範囲と状態も一覧します。
- **畅跑パネル**：唯一の新しい UI 表面です。ツールバーのテキストボタン `新建畅跑任务`（インラインフォーム `开始` / `结束`、`确定` / `取消`）、`暂停全部任务`（未終了タスクがすべて一時停止済みなら `恢复全部任务` に反転。対象がなければ無効）、`删除全部任务`（タスクがなければ無効）。各タスク行には `⏸` / `▶`（**その 1 つのタスク**を一時停止 / 再開。終了済みは無効）と `×`（そのタスクを削除）の 2 つのアイコンボタン、時間範囲、状態タグ（`进行中` / `已暂停` / `待开始` / `已结束`）が付きます。ヘッダーにはタイトル、時刻を解釈するタイムゾーン、閉じるための `×` が表示され、外側クリックまたは Esc でも閉じられます。
- **畅跑の新規タスクフォームは双月の日付範囲カレンダー**：`‹‹ ‹ … › ››` の年月ナビゲーション付きで 2 か月が並び、週の開始は月曜、今日は枠線、選択範囲は下地ハイライト、両端点は塗りつぶし。1 回目のクリックで開始、2 回目で終了を選び、逆順なら自動で入れ替え、範囲が埋まると自動で閉じます。パネルを開くと**現在時刻**で初期化され（開始 = 現在の時間の正時、終了 = +2 時間）、時間精度のために時間セレクトが併設され、`现在` ボタンで再シードできます。
- **畅跑のセマンティクス**：タスクは**絶対起止時刻**・半開区間 `[from, to)`・**時間精度**で、設定された `timezone` で解釈されます。過去の `from` は現在時刻にクランプ（「すぐ開始」が可能）；**一回限り**で、`to` を過ぎると単にマッチしなくなるのは正常なライフサイクルであり**エラーではありません**（期限切れ警告もありません）。**自動マージは一時停止状態が同じウィンドウ間でのみ**発生し（重複または隣接 = そのまま続けて走る）、一時停止ウィンドウと有効ウィンドウが重なっても両方とも保持され、マージ後の上限は **8** タスク（超過は明確なエラー）。**一時停止はタスクごと**でセッション級スイッチは廃止され、**未一時停止のタスクが 1 つ以上現在をカバー**していれば免除が効きます。一時停止中のタスクは自動状態遷移を起こしません。排期はセッションごとの JSON として**永続化**され、dsh を再起動しても将来の `from` を失いません。
- **3 か所すべてでのセッション単位免除**：畅跑が生效している間、そのセッションはどこにも保留されません——自動のターン級 / step ゲート一時停止はスキップし、本来 `agent/request` で保留されるリクエストも解放されます（**セッション単位の `release`** を追加し、すでに保留中のリクエストを進めます）。畅跑が適用されなくなったとき（現在をカバーする全タスクが一時停止、またはタスクのウィンドウがピーク内で終了）はセッションが**再び一時停止**され、次のオフピークで自動再開します。`providerGuard`、手動 `/pause`、週末ルール、グローバルな峰谷状態機械には影響しません（`GET /session-guard/status` はグローバルのまま——畅跑はセッション級で、ステータスバッジを変えません）。
- **新ルート** `GET /session-guard/peak`：リアルタイムモード（PEAK/OFF_PEAK/NORMAL）、一致したウィンドウ名、ピークまでの分数、次のピーク、退峰までのミリ秒、正規化されたポリシー。
- **新フィールドと RPC アクション**：`GET /session-guard/state` に `freeRun` オブジェクト（`state` / `active` / `available` / `timezone` / `windows[]`（各項に `id` / `from` / `to` / `fromInput` / `toInput` / `fromDisplay` / `toDisplay` / `paused` / `status`）/ `activeId` / `msRemaining` / `nextStartMs` / `nextStartDisplay`）を追加——`active` は削除された `enabled` を置き換え、ウィンドウの `status` は `active` / `paused` / `scheduled` / `ended` を取り得ます；`GET /session-guard/diag` に `freeRun`（`{tracked, active, persisted, root}`）を追加；`POST /session-guard/rpc` にプラグイン級 `reloadConfig`（`sessionId` 不要）とセッション級 `freeRunAdd` / `freeRunRemove` / `freeRunPause` / `freeRunResume` / `freeRunPauseAll` / `freeRunResumeAll` / `freeRunClear` を追加（不正入力と未知のタスク `id` は `{ok:false, error}` を返し、例えば `to` は `from` より後でなければならない）。
- **新モジュール**：`src/time-policy.js`（`TimePolicyResolver`）、`src/config-file.js`、`src/free-run.js`、`src/client/free-run-button.tsx`、`src/client/free-run-button-text.ts`、`src/client/date-range-picker.tsx`、`src/client/date-range.ts`。新テスト：`tests/time-policy.test.mjs`、`tests/config-file.test.mjs`、`tests/free-run.test.mjs`、`tests/free-run-isolation.test.mjs`、`tests/free-run-button-text.test.mjs`、`tests/date-range.test.mjs`。**394 件すべて成功**（`node --test "tests/*.test.mjs"`）。
- **新設定**（`peakPolicy` 内）：`timezone`（任意、ピークウィンドウ判定のみ上書き）、`peakWindows`（複数可、`days` 省略/空 = 毎日、`start > end` = 深夜跨ぎで**開始日**に帰属）、およびトップレベルの `weekendPolicy`。
- **パラメータ検証と安全なフォールバック（「静かにガードを壊す」ことはもう起きません）**：`timezone`（`peakPolicy.timezone` を含む）は **IANA データベース**で検証され、無効・綴り間違い（例 `"Asia/Shangai"`）は拒否されて既定の `Asia/Shanghai` が保たれます（`Asia/Calcutta` などの別名は可）。ファイルが読めない、JSON が不正、`peakWindows` が配列でない/不正、スカラーが範囲外——いずれも `configFile.errors`（`GET /session-guard/settings` と `/diag` で確認可）に記録され、起動時と `reloadConfig` 時に warning が出ます。

### 変更

- **本ラインの設定面は宣言式になりました。** dsh 0.1.7 は `settings` サービスを提供せず、`dsh-settings` に `register()` もありません。プラグインは `export const Config = SettingsSchema` とし、各フィールドに `.volatile()` を付けたため、dsh が**設定フォームを自動生成**します。実行時の値は apply の合成エントリを `config/session-guard.json` の既定レイヤーにマージして読みます。プラグインは名前空間を登録せず、独自の設定カードも持たず、`settings` を **inject しません**（本ラインに無いサービスを宣言するとエントリが永遠に pending になり、web boot が致命的に失敗します）。
- **コンポーザーボタンの交代**：旧「一時停止 / 再開」ボタン（slot `session-guard-pause`、`src/client/pause-button.tsx` / `pause-button-text.ts`、その 4 状態）は削除され、「畅跑」ボタン（slot `session-guard-free-run`、order 20）がその位置を引き継ぎます。`/pause`、`/resume`、`/cancel` スラッシュコマンドと `sessionGuard` 冗余ポート（`stepPause` / `stepResume` を含む）は**変更ありません**。
- **ピークウィンドウ判定のタイムゾーンが設定可能に**：`timezone`（IANA 名）が**すべての**判定（曜日・週末・ウィンドウ一致）を駆動し、既定は `Asia/Shanghai`。`peakPolicy.timezone`（フラット設定では `peakTimezone`）は任意で、ピークを DeepSeek 課金タイムゾーンに固定しつつ、週末はローカル `timezone` に従わせられます。既定設定では両方 `Asia/Shanghai` のため v0.2.0 と同一挙動です。タイムゾーンは IANA データベースで検証されるため、`"Asia/Shangai"` のような綴り間違いは拒否され既定値が保たれます。
- **既定のピークウィンドウが `days: ["mon"…"fri"]` を持ちます。** 既定の週末ルールと組み合わせると実効挙動は不変ですが、**週末ルールを無効化して出荷時の既定ウィンドウを残す**と土日はピークではなくなります。週末もピークにしたい場合は `days` を広げるか省略してください。
- **自動退峰解放は本プラグインが停止したセッションのみを再開します。** 自動解放（退峰・週末・非公式 provider への切り替え）は `auto: true` で呼ばれるため、手動 `/pause` したセッションは上書きされません（手動 `/resume` は常に有効）。`pause` は `pausedReason` を記録し（峰谷ポリシーは `"peak_window"`、明示的な `/pause` は `"manual"`）、`GET /session-guard/state` は `paused.reason` を返します。
- **`GET /session-guard/status`** は `mode`、`reason`、`windowName`、`minutesUntilPeak`、`peakTimezone`、`weekendDays`、解決された `configFile` パスを返し、**`billingTimezone` は返さなくなりました**。既存クライアントバッジ用に旧 `phase`（`weekend`/`peak`/`off-peak`）は維持します。`GET /session-guard/settings` に `configFile: {path, candidates, errors}` を追加；`GET /session-guard/diag` に `configFile` と `freeRun` を追加；`GET /session-guard/events`（SSE）は `step` イベントのみを配信します。ステータスバッジはグローバルで、畅跑によって変わりません。
- **ハードコードは一切なくなりました**：ピーク時刻・タイムゾーン・曜日限定・週末ルールの変更は設定ファイル（または自動生成フォーム）の編集のみです。

### 備考

- **中国の法定祝日は認識しません（意図的）**：出荷時の既定の峰谷定義 = 「`Asia/Shanghai` タイムゾーンで月〜金
  `09:00–12:00` / `14:00–18:00` がピーク、それ以外はアイドル」。祝日カレンダーは**存在せず**、平日にあたる
  法定祝日は通常の平日として扱われるため、ピークウィンドウに入れば**ピークとなり通常どおり一時停止します**
  （国慶節・端午節・中秋節・春節の休日期間中の平日 10:00 は PEAK）。一方、週末は無条件にアイドルで、
  **振替出勤日も含みます**（就業日と指定された土曜も `OFF_PEAK` のまま）。「アイドル」= 一時停止されない、
  つまり `OFF_PEAK`（週末終日）と `NORMAL`（平日のピークウィンドウ外）の 2 モードで、一時停止を起こすのは
  `PEAK` のみです。**日付単位の除外設定は現在ありません**（`peakWindows[].days` は曜日粒度まで）——その日だけ
  `enabled` を切る（設定ファイルまたは設定フォーム）か、一時停止を受け入れるかの二択です。
- **明示的に対象外**：祝日カレンダー、振替出勤日、タスクスケジューリング、マルチセッション管理。
- **ピーク前の確認はレビューで削除されました**：実用的な用途がなかったためです——本当の要件は「このセッションを今すぐ走らせる」ことで、畅跑がより単純で予測可能な形でそれを満たしました。そのためピーク前の警告・カウントダウン・継続パスはすべて削除しました。
- **本ラインの識別情報は不変**：ブランチ `compat/0.1.7`、npm バージョン `3.1.1`、dist-tag `dsh-0.1.7`、`package.json` と `dsh.plugin.json` の `engines.dsh = >=0.1.7-rc.1 <0.1.8-0`。

## 0.4.0 — 2026-09-18（誤ったバージョン番号。3.0.0 に置き換え）

### 修正

- **バージョン識別**：本ラインは `0.4.0` として公開されましたが、`dsh.plugin.json` と本変更履歴は
  すでに `3.0.0` を名乗っており、1 つの成果物に 2 つのバージョン番号が存在していました。
  `package.json` を `3.0.0` に統一し、パッケージ版・マニフェスト版・変更履歴が一致しました。
  npm のバージョンは不変のため `0.4.0` は歴史的記録として残します。`3.0.0` 公開後は
  `dist-tag dsh-0.1.5` を `3.0.0` に向け直すべきです。
- **ドキュメント**：README/INSTALL（zh/en/ja/ko）が兄弟ラインを `main` にあると説明していたのを
  修正。0.1.2 ラインのリリースブランチは **`legacy/0.1.2`**（npm dist-tag `dsh-0.1.2`、
  バージョン `0.3.1`）で、`main` は `0.2.0-beta.1` で凍結されています。INSTALL.zh/ja/ko の
  重複したブランチ断片を修正し、dist-tag を明示したインストールコマンドを
  記載。「2.x / 3.x」は**ラインの通称**でありバージョン番号ではないことを明記しました。

### 備考

- **ソース変更なし**（`3.0.0` 比）。`0.4.0` は同一ツリーのパッケージングのみの公開です。

## 3.0.0 — 2026-09-14

### 変更

- **DSH v0.1.5-rc.2 専用ライン（`compat/0.1.5`）。** `engines.dsh` と `dsh-client-*` の peer
  範囲を `>=0.1.5-rc.2 <0.2.0-0` に狭めました（semver のプレリリース規則上、旧
  `>=0.1.0-rc.7` は `0.1.5-rc.2` に一致しません）。`dsh.plugin.json` に `engines.dsh` を追加。
  旧ホスト向けには `main` 上の 2.x / 0.2.x ラインが継続します。
- **`session.events` → `snapshotEvents()`。** DSH 0.1.5 で `session.events` 配列アクセサが
  削除されたため（compatibility-guide §20.3）、`pause-gate.js` はデュアルパスのヘルパーで
  セッションイベントを読みます：まず `snapshotEvents()`、防御的に旧 `events` 配列へフォール
  バック、どちらも無ければ `null`（fail-open）。対象は `findToolOutcome` と `lastUserPrompt`
  のみで、イベント型のマッチングは不変です。

### 変更なし

- その他の接続面は一切変更なし：自前の webServer prefix ルート（`/session-guard/rpc`）、
  `settings.register`、`settings.plugin.item` スロット、クライアント注入、
  `llm.listConfigurableProviders()` は公開済み 0.1.5-rc.2 バンドルに対して検証済み
  （`tools/check-api-drift.ps1`、必須アサーション 12/12）。

### 未実施

- 実機 DSH 0.1.5-rc.2 ホストでのライブスモーク（perm-gate の 0.1.5 ラインと同じ状態）。

## 0.2.0-beta.2 — 2026-09-13

### 修正（DSH 0.1.5 互換 — `compat/0.1.5` ブランチ）

- **レジューム入隊のデュアルパス。** DSH 0.1.5 では Inbox が agent-loop の読み取り専用
  投影に変わるため、`agent.followup` が存在しない可能性があります。レジューム時は
  `agent.followup` → `agent.send` → warn 降級（例外は投げない）の順で試行します。
- **レジュームメッセージの `source` に `form: 'instructions'` を追加**（0.1.5 の
  `ContextFormed` 契約。旧バージョンは未知フィールドを無視します）。
- **`webServer.register` を try/catch で保護**：ルート登録の失敗はログのみで、
  `apply` から例外を投げてホストのプラグイン読み込みを壊しません。
- 0.1.5-rc.2 ソースに対し `WebRoute`（exact/prefix + SSE）契約が不変であることを確認。
  クライアントの `fetch('/session-guard/...')` に `/api` プレフィックスは不要です。

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

# 変更履歴

`dsh-session-guard` の主な変更を記録します。バージョンはセマンティックバージョニングに従います。

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## 0.3.1 — 2026-09-18

### 修正

- **リポジトリメタデータ**：`repository.url` / `homepage` を実在するリポジトリ
  （`drscrewdriver/dsh-session-guard`。以前は存在しない `drscrewdriver/session-guard`）に修正。
- **ホスト範囲をフィールドソースで宣言**：`@deepseek-ai/dsh-client-*` の peer 下限を
  `>=0.1.0-rc.7` から `>=0.1.2-rc.1` に狭め、`engines.dsh` と一致させました。`dsh.plugin.json` に
  対応する `engines.dsh`（`>=0.1.2-rc.1 <0.2.0-0`）を追加し、`version` をパッケージ版に再同期。
  以前はマニフェスト版が `0.2.0-beta.1` のまま遅延し、ホスト範囲を宣言していませんでした。
- **ドキュメント**：README/INSTALL（zh/en/ja/ko）が本ラインの識別情報（ブランチ `legacy/0.1.2`、
  dist-tag `dsh-0.1.2`）を明記し、「1 つの成果物で両バージョン対応」という記述を削除。`0.1.5-rc.2`
  の行は専用ラインへのポインタに置換。インストールコマンドの未置換オーナープレースホルダを除去。

### 備考

- **ソース変更なし**：`src/`、`lib/`、`tests/` は `0.2.0-beta.1` とバイト単位で同一。
  `0.3.0` と `0.3.1` は同一ツリーのパッケージングのみの再リリースです。

## 0.3.0 — 2026-09-18

### 変更

- **0.2.0-beta.1 ツリーのパッケージング再リリース**：`publishConfig`
  （`registry: https://registry.npmjs.org`、`access: public`、`tag: dsh-0.1.2`）を追加し、
  `engines.dsh` を `>=0.1.2-rc.1 <0.2.0-0` に狭めました（旧 `>=0.1.0-rc.7` 範囲は
  strict-semver 照合では `0.1.2-rc.x` プレリリースに一致しません）。

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

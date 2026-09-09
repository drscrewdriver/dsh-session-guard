# 変更履歴

`dsh-session-guard` の主な変更を記録します。バージョンはセマンティックバージョニングに従います。

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

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

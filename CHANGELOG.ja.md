# 変更履歴

`dsh-session-guard` の主な変更を記録します。バージョンはセマンティックバージョニングに従います。

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

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

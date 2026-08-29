<p align="center">
  <strong>ピーク自動セッションゲート：週末モード + ピーク自動一時停止 + セッション級凍結 + バックエンド自動リトライ</strong>
</p>
<p align="center">
  <a href="README.en.md">English</a> · <a href="README.md">中文</a> · <strong>日本語</strong> · <a href="README.ko.md">한국어</a>
</p>
<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square"></a>
  <img src="https://camo.githubusercontent.com/2c11fb2e0e14bb9985c5acbe61123a7441c5ee63aa27fa6e04e2a707ebfd6022/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f6473682d2d706c7567696e2d72656164792d3437384342463f6c6f676f3d646565707365656b266c6f676f436f6c6f723d7768697465" alt="dsh-plugin" style="max-width: 100%;">
  <img alt="Public beta" src="https://img.shields.io/badge/status-public%20beta-7da1de?style=flat-square">
</p>

# dsh-session-guard

- [English README](./README.en.md)
- [中文 README](./README.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [Installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

> **互換性について：** v0.1.1 には日本語（`ja`）と韓国語（`ko`）の辞書が含まれていますが、現在の公式 DSH リリースは `LocaleRuntime` 経由で `zh` と `en` のみを提供しています。純正 DSH で `ja` または `ko` を選択すると `locale "<id>" is not registered` で失敗します。公式 DSH が对应的 locale ID を追加するまで利用できません。上級ユーザーは DSH フォークを保守して更新してください。

> ピーク課金時間帯に実行中のセッションを自動一時停止し、オフピーク/週末に自動再開。input-traffic の凍結ボタンと連携して**セッション級**ロックを実現。バックエンド**自動リトライ**は凍結/ゲート期間中は譲歩。カスタムセッションゲート（`agent.cancel keepInbox + goals.pause + session/event 安全境界 + followup 再開`）に基づき、dsh-task-control に依存しません。

`dsh plugin` コマンドで组装 + バンドルパッチで装配する cordis プラグイン。dsh ソース変更も PR も不要。

> 💡 **推奨理由**：DeepSeek は 2026-08-17 から**峰谷課金**を開始しました。ピーク時間帯の単価はオフピークの 2 倍。本プラグインはピーク時に実行セッションを自動一時停止、オフピーク時に自動再開し、長時間セッションの費用を最大 **50%** 削減。手動凍結（input-traffic ボタン経由）でセッションごとの精密制御が可能。

## 機能

- **週末モード**：`Intl.DateTimeFormat` で週末を正しく識別（タイムゾーン正確）→ 週末は峰谷を無視して自由実行。
- **ピーク自動一時停止（グローバル）**：ピーク入場時（かつ非週末）、全 running ルートセッションを自動一時停止。退峰時自動再開——**グローバルスイッチ、手動不要**。
- **セッション級凍結/再開**：`sessionGuard` 冗余ポート + `POST /session-guard/rpc`、input-traffic 凍結ボタンでセッションごと透伝。`/pause /resume /cancel` 手動コマンドも提供。
- **バックエンド自動リトライ（D9）**：turn/end 瞬時失敗（error/429/max-tokens）はアダプティブバックオフで自動再試行。永久失敗は停止。**凍結/ゲート期間中は譲歩**、セッションゲートを迂回しません。
- **fail-open**：カスタムセッションゲート利用不可、session-guard 未インストール、設定サービス欠如——すべて静的降格、依存でクラッシュしません。

## インストール

```bash
dsh plugin --profile web add github:<owner>/dsh-session-guard
```

インストール後 dsh web を再起動し、ページをリフレッシュ。

## 設定（設定 → プラグイン → session-guard）

| スイッチ | デフォルト | 説明 |
|---|---|---|
| `enabled` | on | **ピーク自動一時停止**：ピーク時間帯に実行セッションを自動一時停止 |
| `offPeakAutoResume` | on | **オフピーク自動再開**：オフピーク時に一時停止セッションを自動再開 |
| `weekendMode` | on | **週末モード**：週末を認識→週末は自動一時停止しない |
| `queueFallback` | on | カスタムセッションゲート利用不可時にロック待機キューにフォールバック（fail-open） |
| `retryEnabled` | off | **自動リトライ（バックエンド）**：瞬時失敗自動再試行（デフォルトオフ、保守的） |

追加設定：

- `timezone`（デフォルト Asia/Shanghai）——**週末判定**とバッジ表示に使用。**峰谷判定には影響しない**（峰谷は常に北京時間）；
- `peakWindows`（デフォルト 09:00–12:00 / 14:00–18:00）——北京時間（UTC+8）の峰谷ウィンドウ。DeepSeek 公式課金と一致；
- `pauseMode`（`safe`/`force`）、`pauseReason`（`wait`/`stop`）；
- リトライパラメータ：`retryText`、`retryGraceMs`、`retryCooldownMs`、`retryBackoffFactor`、`retryBackoffMaxMs`、`retryMaxConsecutive`。

## 動作

### ピーク自動ゲート（グローバル）

- **ピーク入り**（かつ非週末）：全 running ルートセッションに `gate.stopNextTurn` を呼び出し——カスタムセッションゲートで真の一時停止（推論を中断せず、安全境界で一時停止）、`queueFallback` でロック待機キューにフォールバック；
- **退峰 / 週末**：`gate.resume` **全**セッション（自動再開、手動不要）——`offPeakAutoResume` スイッチで制御；
- **峰谷タイムゾーン**：常に北京時間（`Asia/Shanghai`）を使用。DeepSeek 公式課金基準に一致。`timezone` 設定の影響を受けません；
- 状態機械：単一インスタンス `NORMAL ↔ PAUSED_PEAK`（`scheduler.js`）、単一 30s tick で駆動。

### タイムゾーン処理

- **峰谷判定**：常に **北京時間（UTC+8）** を使用（`BILLING_TIMEZONE = 'Asia/Shanghai'`）。DeepSeek 公式課金基準。`timezone` 設定で変更不可（ハードコード）；
- **週末判定**：ユーザー設定の `timezone`（例：`Asia/Tokyo`、`Asia/Seoul`）を使用。「週末」はローカル概念のため；
- `Intl.DateTimeFormat` でタイムゾーン投影。無効な IANA タイムゾーン名は `RangeError` で fail-open し `Asia/Shanghai` にフォールバック；
- 峰谷ウィンドウは**左閉右開** `[start, end)`。深夜跨ぎウィンドウ（例：`22:00–06:00`）対応。

### status-badge（フロントエンド表示）

コンポーザー入力エリア右側に**読み取り専用**のステータスバッジを表示：

| 階層 | ラベル | CSS クラス | 意味 |
|---|---|---|---|
| `peak` | 高峰 | `sg-peak` | 平日ピーク時間帯、セッション自動一時停止中 |
| `off-peak` | 谷時 | `sg-off` | オフピーク時間帯、セッション通常稼働 |
| `weekend` | 週末 | `sg-weekend` | 週末（週末モード有効時）、峰谷無視 |

- 15 秒ごとに `GET /session-guard/status` をポーリング；
- fail-open：ルート到達不可・ネットワークエラー・`enabled` オフ時→バッジ非表示；
- **input-traffic に依存しない**：session-guard クライアントコードが単独で描画。input-traffic は凍結ボタンのみ担当；

### input-traffic との連携

- input-traffic の**凍結ボタン**は `sessionGuard.stopNextTurn`（RPC、セッション経由）経由でサーバーサイドに伝達；
- input-traffic は**凍結強化のみ**（キュー凍結/解凍 + composer ブロック）、リトライは本プラグインのバックエンドが処理；
- 両方「セッション分離」セマンティスを共有：input-traffic 凍結キューは sessionId で分離、session-guard RPC も sessionId で分離。

## ライセンス

MIT — [LICENSE](LICENSE) 参照。

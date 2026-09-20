<p align="center">
  <strong>ピーク自動セッションゲート：週末モード + ピーク自動一時停止 + 公式ソース二次判定 + セッション級凍結 + バックエンド自動リトライ</strong>
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

> **▼ DSH バージョン適合**
>
> | DSH バージョン | ロード | 設定登録 | セッションイベント / ゲート | クライアント側 |
> | --- | --- | --- | --- | --- |
> | 0.1.2-rc.1 ~ 0.1.4-beta.1 | ✅ 本ライン対応 | `ctx.settings.register(ns, schema, { base })` | ✅ 形状一致 | ✅ プラットフォーム値の import なし |
> | 0.1.2-alpha.2+ / 0.1.2-rc.1 | ✅ 本ライン対応 | `register` は維持（`installSection` 追加） | ✅ 形状一致 | ✅ プラットフォーム値の import なし |
> | 0.1.5-rc.2 | ➖ **本ライン対象外** | 下記の専用ラインを参照 | 同左 | 同左 |
>
> **本ラインの識別情報**：ブランチ `legacy/0.1.2`、npm バージョン `0.3.x`、dist-tag **`dsh-0.1.2`**、
> ホスト範囲 `engines.dsh = >=0.1.2-rc.1 <0.2.0-0`。
> **0.1.0-rc.7 ~ 0.1.1-rc.x は本ラインの対象外です**——`package.json` と `dsh.plugin.json` の
> 両方で `engines.dsh` および `@deepseek-ai/dsh-client-*` の peer 下限を `>=0.1.2-rc.1` に固定しています。
> これらの旧ホストは `0.1.2` 以下の過去バージョンを使用してください。
> これらのフィールドソースの正規定義は
> `mine-dsh-plugins/improve-dsh-plugins/DSH-PLUGIN-VERSION-DISTRIBUTION-STRATEGY.md` §2.2 にあります。
>
> **0.1.5-rc.2 は専用ラインに分離されました**：DSH 0.1.5 で `session.events` 配列アクセサが削除され
> （イベントは `snapshotEvents()` 経由で読む必要があります）、また semver のプレリリース照合規則により
> `engines.dsh` が `>=0.1.2-rc.1` と排他になります。
> **0.1.5-rc.x ホストは `compat/0.1.5` ブランチ**（npm dist-tag **`dsh-0.1.5`**、バージョン `3.0.0`）**を使用してください**：
> `dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.5`。
> **「1 つの成果物で両バージョン対応」は 0.1.5 分離以降成立しません。**
> ドリフトガード：`tools/check-api-drift.ps1`（本ラインは既定で 4 つの tag に対して必須 API の存在を検証）。

> ピーク課金時間帯に実行中のセッションを自動一時停止し、オフピーク/週末に自動再開。input-traffic の凍結ボタンと連携して**セッション級**ロックを実現。バックエンド**自動リトライ**は凍結/ゲート期間中は譲歩。カスタムセッションゲート（`agent.cancel keepInbox + goals.pause + session/event 安全境界 + followup 再開`）に基づき、dsh-task-control に依存しません。

`dsh plugin` コマンドで组装 + バンドルパッチで装配する cordis プラグイン。dsh ソース変更も PR も不要。

> 💡 **推奨理由**：DeepSeek は 2026-08-17 から**峰谷課金**を開始しました。ピーク時間帯の単価はオフピークの 2 倍。本プラグインはピーク時に実行セッションを自動一時停止、オフピーク時に自動再開し、長時間セッションの費用を最大 **50%** 削減。手動凍結（input-traffic ボタン経由）でセッションごとの精密制御が可能。

## 機能

- **週末モード**：`Intl.DateTimeFormat` で週末を正しく識別（タイムゾーン正確）→ 週末は峰谷を無視して自由実行。
- **ピーク自動一時停止（グローバル）**：ピーク入場時（かつ非週末）、全 running ルートセッションを自動一時停止。退峰時自動再開——**グローバルスイッチ、手動不要**。
- **公式ソース二次判定（`providerGuard`）**：ピーク時は**リクエスト先が DeepSeek 公式ソースの場合のみ**遮断。ローカル/第三者 provider（例 `local-35b`）は通常どおり実行。判定順 = 明示 id リスト → `baseURL` エンドポイント → catalog 既定エンドポイント → 内蔵 id。
- **リクエスト級バックストップ + 延後キュー**：ピーク入場後に起動したセッション、途中で公式ソースへ切り替えたセッションは `agent/request` ガードが捕捉（既定 `hold`：リクエストを保留しエラーなし、退峰時に自動解放）。
- **セッション級凍結/再開**：`sessionGuard` 冗余ポート + `POST /session-guard/rpc`、input-traffic 凍結ボタンでセッションごと透伝。`/pause /resume /cancel` 手動コマンドも提供。
- **バックエンド自動リトライ（D9）**：turn/end 瞬時失敗（error/429/max-tokens）はアダプティブバックオフで自動再試行。永久失敗は停止。**凍結/ゲート期間中は譲歩**、セッションゲートを迂回しません。
- **fail-open**：カスタムセッションゲート利用不可、session-guard 未インストール、設定サービス欠如——すべて静的降格、依存でクラッシュしません。

## インストール

```bash
# DSH 0.1.2-rc.x ホスト（本ライン、dist-tag dsh-0.1.2）
dsh plugin --profile web add dsh-session-guard@dsh-0.1.2

# または git ブランチを直接指定
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#legacy/0.1.2

# DSH 0.1.5-rc.x ホストは専用ライン（dist-tag dsh-0.1.5）を使用
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
```

> ⚠️ **裸のパッケージ名 `dsh-session-guard` に依存しないでください**：npm の `latest` タグは
> 排他的な 2 つのバージョンライン（`engines.dsh` が semver プレリリース照合で排他）を
> 同時に提供できません。必ず dist-tag を明示してください。

インストール後 dsh web を再起動し、ページをリフレッシュ。

## 設定（設定 → プラグイン → session-guard）

| スイッチ | デフォルト | 説明 |
|---|---|---|
| `enabled` | on | **ピーク自動一時停止**：ピーク時間帯に実行セッションを自動一時停止 |
| `stepLevelPause` | on | **step 級ゲート**：ピーク時、次の step のモデルリクエスト**前**にゲートを閉じる（ターン級より早く・より節約）。オフでターン級一時停止にフォールバック |
| `providerGuard` | on | **公式ソース二次判定**：ピーク時は DeepSeek 公式ソースのみ遮断、ローカル/第三者 provider は通常実行 |
| `guardSubagents` | on | **サブエージェントも対象**：サブエージェントのリクエストも課金対象、既定で遮断 |
| `offPeakAutoResume` | on | **オフピーク自動再開**：オフピーク時に一時停止セッションを自動再開 |
| `weekendMode` | on | **週末モード**：週末を認識→週末は自動一時停止しない |
| `deferredResume` | on | **ピーク後の自動再開**：オフにすると延後したリクエスト/セッションは手動 `/resume` まで停止 |
| `queueFallback` | on | カスタムセッションゲート利用不可時にロック待機キューにフォールバック（fail-open） |
| `retryEnabled` | off | **自動リトライ（バックエンド）**：瞬時失敗自動再試行（デフォルトオフ、保守的） |

追加設定：

- `timezone`（デフォルト Asia/Shanghai）——**週末判定**とバッジ表示に使用。**峰谷判定には影響しない**（峰谷は常に北京時間）；
- `peakWindows`（デフォルト 09:00–12:00 / 14:00–18:00）——北京時間（UTC+8）の峰谷ウィンドウ。DeepSeek 公式課金と一致；
- `pauseMode`（`safe`/`force`）、`pauseReason`（`wait`/`stop`）；
- `stepGateTimeoutMs`（既定 300000）——step ゲートの保留タイムアウト。期限切れでゲートを解放し**ターン級一時停止へ昇格**（デッドロック回避、「5 分ごとに 1 step」のトークン滴漏も回避）；
- 公式ソース判定：`officialProviders`（公式 provider id を追加、カンマ区切り、最優先）、`officialBaseURLs`（公式エンドポイント host、既定 `api.deepseek.com`）；
- 延後キュー：`deferredMode`（`hold` / `error`）、`deferredResumeText`、`deferredMaxHoldMs`（保留上限、既定 6h、超過で error）；
- リトライパラメータ：`retryText`、`retryGraceMs`、`retryCooldownMs`、`retryBackoffFactor`、`retryBackoffMaxMs`、`retryMaxConsecutive`。

## 動作

### ピーク自動ゲート（グローバル）

- **ピーク入り**（かつ非週末）：`stepLevelPause` が有効なら**ターンを即中断しない**——セッションは次の `agent/pre-step` 境界まで走り、そこで step ゲートが閉じます（下記）。無効なら全 running ルートセッションに `gate.stopNextTurn`（カスタムセッションゲート、`queueFallback` でロック待機キューにフォールバック）；
- **退峰 / 週末**：まず保留中の step を `releaseAll` で解放（ターンはその場で継続）、次に `gate.resume` **全**セッション（`offPeakAutoResume` で制御）；
- **峰谷タイムゾーン**：常に北京時間（`Asia/Shanghai`）を使用。DeepSeek 公式課金基準に一致。`timezone` 設定の影響を受けません；
- 状態機械：単一インスタンス `NORMAL ↔ PAUSED_PEAK`（`scheduler.js`）、単一 30s tick で駆動。

### step 級ゲート（v0.2.0、節約の要）

`agent/pre-step` waterfall に接続し、**次の step のモデルリクエストが発生する前**にターンを保留します。

- **ゲート条件**（すべて満たす）：`enabled` + `stepLevelPause` + `step > 1` + ピーク（北京時間、非週末）+ 対象 provider が公式（`providerGuard`、オフなら全部）+ リクエスト級 hold されていない + このピーク期間で手動スキップされていない；
- **`step > 1` の理由**：ターン最初の step はリクエスト級ガードが担当するため、二重ゲートにならない；
- **解放経路**：①「⏸ 一時停止中（再開）」ボタン / `POST /session-guard/rpc {action:'stepResume'}` / `/resume` → 現在の step を通し、**このピーク期間はもうゲートしない**；② 退峰 → 全解放、ターンはその場で継続（**followup 不要**）；③ 凍結ボタン / `/pause` / `/cancel` → ゲート解放してターン級一時停止へ；④ `signal` abort → 解放；
- **タイムアウト昇格**：`stepGateTimeoutMs`（既定 5 分）超過でゲート解放 + **ターン級 force 一時停止へ昇格**、退峰で復帰（デッドロックなし・トークン滴漏なし）；
- **状態**：`GET /session-guard/state?session=<id>` が `paused: { step, turn }` と `stepGate: { held, since, bypass }` を返す。サービス側 `state().paused` は**互換のため真偽値のまま**、step 状態は `pausedStep`；
- **永続化しない**：保留はプロセス内 Promise、再起動で消滅（幽霊状態を避ける）。

#### 「一時停止 / 再開」ボタン（session-guard が提供）

コンポーザー右側の「一時停止」ボタン（slot `conversation.input.right`、id `session-guard-pause`、order 20 — input-traffic の「❄ 凍結して追加」の左）：

- 未一時停止 → 「一時停止」、**クリック可**：`stepPause` を呼び、**次の step のモデルリクエスト前**にセッションを停止（現在の step は中断しない。step 1 も対象で、峰谷 / provider の制限を受けない）；
- 一時停止中 → 「再開」、`stepResume` を呼び現在の step を放行、このピーク期間はもうゲートしない；
- **イベント push**：`GET /session-guard/events?session=<id>`（SSE）が step ゲート状態の変化を**即時**通知——ピークで自動的に閉じたらボタンは即「再開」に変わります。10 秒ごとの `/session-guard/state` ポーリングはフォールバック（SSE 不通でも収束）；
- 同じ行の input-traffic ボタンと見た目を揃えています（高さ 24px / 角丸 6px / 12px フォント / 同じ CSS トークン）。

### 公式ソース判定（providerGuard）

ピーク時は無差別停止ではなく、まず「このリクエストが実際に向かうルートが DeepSeek 公式ソースか」を判定します。

| 優先 | 根拠 | `matchedBy` | 例 |
|---|---|---|---|
| 1 | `officialProviders` 明示 id リスト | `explicit` | 自前ゲートウェイを公式として宣言 |
| 2 | リアルタイム `baseURL` の host | `endpoint` | `deepseek-official` を中継へ変更 → **遮断しない** |
| 3 | catalog 内蔵の既定エンドポイント | `endpoint-default` | pi-ai の `deepseek` ルートは既定で公式 API → **遮断する** |
| 4 | 内蔵 id リスト（`deepseek-official`） | `route-id` | エンドポイントが読めない場合のフォールバック |
| 5 | その他 | `unknown` | 非公式、通過 |

- **エンドポイントが id より優先**：`deepseek-official` の `baseURL` を中継へ向けても誤遮断しません。逆に pi-ai 内蔵 `deepseek` ルートは漏れません。
- **エンドポイント取得元**：`ctx.get('llm').listConfigurableProviders()` → ディレクトリ項目 → `ctx.settings.get(settingsNs)` → `settingsPath` で `baseURL`（非機密フィールドのみ、`apiKeyEnv` の値は読みません）。毎リクエスト再計算・キャッシュなし → provider 設定の変更が即時反映。
- **非公式へ切替で自動復帰**：ピーク入場で停止したセッションをローカル/第三者 provider へ切り替えると（0.1.2+ の `model/selection` イベント）、自動的に再開します（`deferredResume` の制約下）。本プラグインが入峰時に停止したセッションだけが対象で、手動 `/pause` は上書きしません。0.1.1 にはこのイベントがないため「次回リクエストまたは手動 `/resume`」に降格。
- **取得できない場合**：`llm` サービス欠如、名前空間構造の変化、非文字列フィールド——すべて id / 内蔵エンドポイント判定へ降格し `matchedBy` を記録、**例外は投げません**。
- **誤判定の調査**：`GET /session-guard/provider?provider=<id>` が `{ official, matchedBy, endpoint }` を返します。

### リクエスト級ガードと延後キュー

- **なぜリクエスト級か**：30s tick は `NORMAL → PAUSED_PEAK` 遷移時に `running` だったセッションのみ処理します。ピーク入場後に起動したセッションや途中で公式ソースへ切り替えたセッションは漏れます。`agent/request` waterfall は**毎リクエスト**通ります。
- **`next()` の戻り値で判定**：モデル選択ミドルウェアが waterfall 内で provider/model を上書きするため、`await next()` の後に判定します。
- **`hold` モード（既定）**：リクエストを保留——**送信もエラーもなし**、退峰の瞬間に自動解放（`msUntilOffPeak` の精密タイマー、30s tick はバックストップ）；abort で通常どおり中断。
- **`error` モード**：識別可能な `PEAK_DEFERRED` エラーを投げ延後キューに記録、退峰時に `deferredResumeText` で再開（`deferredResume` オフなら自動再開しない）。
- **上限**：`deferredMaxHoldMs`（既定 6h）で、無期限の保留を error に変換。
- **相互排他**：保留中はセッションゲートの一時停止を**併用しません**（一時停止は安全境界を待ちますが、保留中のリクエストはそこへ到達できません）。ピーク入場時、既に保留中のセッションはスキップされます。
- **永続化なし**：延後キューはプロセス内 promise、再起動で消えます。

### 境界（対象外）

- **provider の付け替えはしません**（遮断のみ）。
- **compaction は `agent/request` を通りません**：セッション停止中は発生しません。ピーク中に手動で圧縮すると公式ソースへ行く可能性があります（`ctx.llm.stream` 層は介入しません）。
- **0.1.1 には `model/selection` イベントがありません**：非公式ソースへ切り替えた後の自動復帰は「次回リクエストまたは手動 `/resume`」に降格（0.1.2+ では即時）。
- **npm 依存の追加なし**、資格情報の読み取りなし、`dsh-llm-retry` の 429 / トランスポート再試行は不変。

### タイムゾーン処理

- **峰谷判定**：常に **北京時間（UTC+8）** を使用（`BILLING_TIMEZONE = 'Asia/Shanghai'`）。DeepSeek 公式課金基準。`timezone` 設定で変更不可（ハードコード）；
- **週末判定**：ユーザー設定の `timezone`（例：`Asia/Tokyo`、`Asia/Seoul`）を使用。「週末」はローカル概念のため；
- `Intl.DateTimeFormat` でタイムゾーン投影。無効な IANA タイムゾーン名は `RangeError` で fail-open し `Asia/Shanghai` にフォールバック；
- 峰谷ウィンドウは**左閉右開** `[start, end)`。深夜跨ぎウィンドウ（例：`22:00–06:00`）対応。

### status-badge（フロントエンド表示）

コンポーザー入力エリア右側に**読み取り専用**のステータスバッジを表示：

| 階層 | ラベル | CSS クラス | 意味 |
|---|---|---|---|
| `peak`（二次判定 on） | 高峰·拦官方 | `sg-peak` | ピーク時間帯、DeepSeek 公式ソースのみ遮断 |
| `peak`（二次判定 off） | 高峰·全部暂停 | `sg-peak` | ピーク時間帯、全セッション停止 |
| `off-peak` | 谷時 | `sg-off` | オフピーク時間帯、セッション通常稼働 |
| `weekend` | 週末 | `sg-weekend` | 週末（週末モード有効時）、峰谷無視 |

- 15 秒ごとに `GET /session-guard/status` をポーリング（`phase` / `providerGuard` / `held` / `deferred` / `stepHeld`）；
- fail-open：ルート到達不可・ネットワークエラー・`enabled` オフ時→バッジ非表示；
- **input-traffic に依存しない**：session-guard クライアントコードが単独で描画。input-traffic は凍結ボタンのみ担当；

### input-traffic との連携

- input-traffic の**「❄ 凍結して追加」ボタン**は `sessionGuard.stopNextTurn`（RPC、セッション経由）で伝達し、**まず step ゲートを解放**します（そうしないとターン級一時停止が永遠に来ない安全境界を待ち、相互待機になります）；
### input-traffic との役割分担：「止める」側と「並べる」側

**DSH のキュー意味論（2 本のキュー）**：`next-step` = 「次の step 境界を待つ入力」（次の `agent/pre-step` で**ツール結果と同じレベル**の step として同一 turn 内で消費）、`next-turn` = 「独立したターンを待つプロンプト」（現在のターン終了後に**新しい turn** として消費）。`Inbox.claim()` は**必ず `next-step` を先に全部取り**、新ターンを開く境界でのみ `next-turn` を **1 件**追加で取ります。

- **session-guard = 止める**：いつ進めるかだけを決め、**キューの内容・順序には触れません**。step ゲート（`agent/pre-step`、次の step のモデルリクエスト前）、ターン級一時停止（`agent.cancel({keepInbox:true})` + `goals.pause`、**キューは保持**）、リクエスト級 hold（`agent/request`）。
- **input-traffic = 並べる**：ユーザー入力がどのキューに、どの段階で入り、いつ消費されるかだけを決めます（三档：赤=interrupt は `cancel()` 後に `steer`、黄=`steer`（→ `next-step`）、緑=`next-turn` に待機）。凍結 = `queued`+`steering` 行を段階ごと退避 + composer ブロック + `sessionGuard.stopNextTurn`；再開 = ブロック解除 → `sessionGuard.resume` → 段階順に再投入。
- **接点の 2 つの不変条件**：① 凍結は本プラグインに**先に step ゲートを解放**させる（でないとターン級一時停止が永遠に来ない安全境界を待ち、相互待機になる）；② step ゲート保留中は `preStep()` が waterfall 前に `inbox.claim()` 済みなので、新しい入力は取られた分の後ろに並ぶ（`keepInbox` はターン級のみ）。
- ボタン：本プラグインの「一時停止 / 再開」（order 20）と input-traffic の「❄ 凍結して追加 / 再開して追加」（order 30）は**並列表示・相互に置き換えなし**。

## ライセンス

MIT — [LICENSE](LICENSE) 参照。

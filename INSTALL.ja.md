# インストールガイド（公式 DSH CLI）

- [日本語インストールガイド](./INSTALL.ja.md)
- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [日本語 README](./README.ja.md)
- [English README](./README.en.md)
- [中文 README](./README.md)
- [한국어 README](./README.ko.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## 0. 前提条件

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
```

## 1. インストール

```bash
dsh plugin --profile web add dsh-session-guard@dsh-0.1.7

# または git ブランチを直接指定
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.7
```

`compat/0.1.7` は DSH `0.1.7-rc.x` 専用ラインです：npm パッケージバージョン **`3.1.1`**、
dist-tag **`dsh-0.1.7`**、`package.json` と `dsh.plugin.json` の `engines.dsh` はいずれも
`>=0.1.7-rc.1 <0.1.8-0`。

DSH `0.1.5-rc.x` ホストは **`compat/0.1.5`** ブランチ（npm dist-tag `dsh-0.1.5`、バージョン `3.0.0`）
を使用してください。DSH `0.1.2-rc.x` ホストは **`legacy/0.1.2`** ブランチ（npm dist-tag `dsh-0.1.2`、
バージョン `0.3.1`）を使用してください。`main` は `0.2.0-beta.1` で凍結済みで、
**0.1.2 ラインのリリースブランチではありません**。

> ⚠️ 裸のパッケージ名 `dsh-session-guard` に依存しないでください：npm の `latest` タグは
> 排他的な 2 つのバージョンライン（`engines.dsh` が semver プレリリース照合で排他）を
> 同時に提供できません。必ず dist-tag を明示してください。

dsh web を再起動し、ページをリフレッシュ。

## 2. 検証

「設定 → プラグイン → session-guard」を開く。本ラインのプラグインは名前空間を登録せず、独自の設定カードも
持ちません：`Config = SettingsSchema` を export し、各フィールドに `.volatile()` を付けているため、dsh が
**このフォームを自動生成**します。スイッチ：`enabled`、`providerGuard`、`guardSubagents`、
`offPeakAutoResume`、`weekendMode`、`deferredResume`、`queueFallback`、`retryEnabled`；
テキスト/リスト項目：`officialProviders`、`officialBaseURLs`、`deferredResumeText`。

峰谷/週末ポリシーは JSON ファイルでも設定できます（解決順：`$DSH_SESSION_GUARD_CONFIG` →
`$DSH_HOME/config/session-guard.json` → `<cwd>/config/session-guard.json` →
`<plugin>/config/session-guard.json`）。このファイルは既定レイヤーで、自動生成フォームで設定した値が
引き続き優先されます。`POST /session-guard/rpc {"action":"reloadConfig"}` で再起動なしに再読み込みできます。
詳細は [README.ja.md](./README.ja.md) の「設定可能な峰谷ポリシー」を参照。

セッション UI のステータスバッジを確認——現在のフェーズ（`高峰·拦官方` / `高峰·全部暂停` / `谷时` / `周末`）を表示。
その隣（order 20、input-traffic の凍結ボタンの左）が**畅跑**ボタンです：文言は `畅跑`（タスクが 2 つ以上なら
`畅跑 ×N`）に固定され、**クリックすると常に畅跑タスク管理パネルが開き**、そこから**単一セッション**の
時間限定峰谷免除を作成・一時停止 / 再開・削除できます（一時停止はタスクごとで、セッション級スイッチでは
ありません）。詳細は [README.ja.md](./README.ja.md) の「畅跑（free-run）」を参照。

特定ルートの公式ソース判定を確認（host ルート、再起動不要）：

```bash
curl -s 'http://127.0.0.1:3080/session-guard/provider?provider=deepseek-official'
# {"ok":true,"verdict":{"provider":"deepseek-official","official":true,"matchedBy":"endpoint","endpoint":"https://api.deepseek.com"}}
```

テスト実行（ネットワーク・資格情報不要）：

```bash
npm test
```

## 3. アップグレード

```bash
dsh plugin --profile web remove dsh-session-guard
dsh plugin --profile web add dsh-session-guard@dsh-0.1.7
```

dsh web を再起動しページをリフレッシュ。設定は apply の合成エントリにあり（自動生成フォームから編集）、
アップグレード後も残ります。新しいキー（`providerGuard`、`deferredMode` など）は触るまで既定値です。
峰谷ポリシーは `config/session-guard.json` から読むため、こちらも失われません。

`0.1.3`/`0.1.4-beta.1` から `0.1.5-beta.1` への唯一の挙動変更は、ピーク時に既定で
**公式ソースのみ**遮断する点です。従来の一律停止に戻すには `providerGuard: false`
（または `officialProviders` / `officialBaseURLs` で判定を狭める）。

### 「一時停止ボタン」がある版からアップグレードする場合

旧コンポーザーの「一時停止 / 再開」ボタンは**削除**され、**畅跑**ボタン（slot `session-guard-free-run`、
order 20）がその位置を引き継ぎます。`/pause`、`/resume`、`/cancel` コマンドと `sessionGuard` ポート
（`stepPause` / `stepResume` を含む）は変更ありません。畅跑ウィンドウはタスクパネルで時間精度で編集でき
（開始時間 = `H:00`、終了時間 = `H:59` で終了時間の 1 時間全体が含まれ、「終了 23 時」= `23:59`）、
峰谷に対する特別扱いは設定ファイルが担います。

## 4. トラブルシューティング

| 症状 | 確認 |
|---|---|
| ピーク時でもセッションが動く | `GET /session-guard/status` → `phase` が `peak`；`GET /session-guard/settings` → `enabled: true` |
| ローカル provider が遮断される | `GET /session-guard/provider?provider=<id>` → `matchedBy` が `endpoint`/`unknown` で `official: false` のはず。`explicit` なら `officialProviders` から削除 |
| 公式リクエストが遮断されない | `matchedBy: 'endpoint'` かつ `official: false` は `baseURL` が `officialBaseURLs` にない；host を追加するか、ルート id を `officialProviders` へ |
| リクエストが保留のまま | `hold` モードの仕様。明示エラーにするなら `deferredMode: 'error'`、または `deferredMaxHoldMs` を短く |
| ピーク後に再開しない | `deferredResume` が有効（または `/resume`）；セッション級は `offPeakAutoResume` |
| 判定診断が使えない | `GET /session-guard/diag` → `providerGuard`、`configurableProviders`、`held`、`deferred` |

## 5. アンインストール

```bash
dsh plugin --profile web remove dsh-session-guard
```

dsh web を再起動。アンロード時に保留中のリクエストは解放（reject）され、promise リークはありません。

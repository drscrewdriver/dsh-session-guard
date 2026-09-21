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
# npm (recommended; dsh-0.1.5 for DSH 0.1.5, dsh-0.1.2 for DSH 0.1.2)
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
# GitHub (alternative, builds from source): dsh plugin --profile web add github:drscrewdriver/dsh-session-guard
```

dsh web を再起動し、ページをリフレッシュ。

## 2. 検証

「設定 → プラグイン → session-guard」を開く。スイッチ：`enabled`、`providerGuard`、`guardSubagents`、
`offPeakAutoResume`、`weekendMode`、`deferredResume`、`queueFallback`、`retryEnabled`；
テキスト/リスト項目：`officialProviders`、`officialBaseURLs`、`deferredResumeText`。

セッション UI のステータスバッジを確認——現在のフェーズ（`高峰·拦官方` / `高峰·全部暂停` / `谷时` / `周末`）を表示。

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
# npm (recommended; dsh-0.1.5 for DSH 0.1.5, dsh-0.1.2 for DSH 0.1.2)
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
# GitHub (alternative, builds from source): dsh plugin --profile web add github:drscrewdriver/dsh-session-guard
```

dsh web を再起動しページをリフレッシュ。設定は `$DSH_HOME/settings.yaml` の `session-guard`
名前空間にありアップグレード後も残ります。新しいキー（`providerGuard`、`deferredMode` など）は
触るまで既定値です。

`0.1.3`/`0.1.4-beta.1` から `0.1.5-beta.1` への唯一の挙動変更は、ピーク時に既定で
**公式ソースのみ**遮断する点です。従来の一律停止に戻すには `providerGuard: false`
（または `officialProviders` / `officialBaseURLs` で判定を狭める）。

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

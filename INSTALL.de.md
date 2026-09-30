# Installationsanleitung (offizielle DSH-CLI)

Diese Anleitung nutzt ausschließlich den offiziellen DSH-Befehl `dsh plugin`.

- [Installationsanleitung auf Deutsch](./INSTALL.de.md)
- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [Guide d'installation en français](./INSTALL.fr.md)
- [Guida all'installazione in italiano](./INSTALL.it.md)
- [Руководство по установке на русском](./INSTALL.ru.md)
- [Guía de instalación en español](./INSTALL.es.md)
- [English README](./README.en.md)
- [中文 README](./README.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [README en français](./README.fr.md)
- [README auf Deutsch](./README.de.md)
- [README in italiano](./README.it.md)
- [README auf Russisch](./README.ru.md)
- [README en español](./README.es.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)
- [Changelog en français](./CHANGELOG.fr.md)
- [Changelog auf Deutsch](./CHANGELOG.de.md)
- [Changelog in italiano](./CHANGELOG.it.md)
- [Changelog auf Russisch](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)

## 0. Voraussetzungen

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
```

## 1. Installieren

```bash
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5

# oder direkt über den git-Zweig
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.5
```

`compat/0.1.5` ist die DSH-`0.1.5-rc.x`-Linie: npm-Paketversion **`3.0.0`**, dist-tag
**`dsh-0.1.5`**, mit `engines.dsh = >=0.1.5-rc.2 <0.2.0-0` **sowohl** in `package.json` als auch in
`dsh.plugin.json`.

DSH-`0.1.2-rc.x`-Hosts sollten den Zweig **`legacy/0.1.2`** verwenden (npm-dist-tag `dsh-0.1.2`,
Version `0.3.1`). **`main` ist bei `0.2.0-beta.1` eingefroren und ist nicht mehr der Release-Zweig der
0.1.2-Linie.**

> ⚠️ Verlassen Sie sich nicht auf den nackten Paketnamen `dsh-session-guard`: npm's `latest`-Tag kann
> zwei sich gegenseitig ausschließende Versionslinien nicht gleichzeitig bedienen (ihre `engines.dsh`-Bereiche sind nach
> semver-Prerelease-Abgleich exklusiv) — geben Sie den dist-tag immer explizit an.

dsh web neu starten und die Seite neu laden.

## 2. Prüfen

**Einstellungen → Plugins → session-guard** öffnen. Schalter: `enabled`, `providerGuard`, `guardSubagents`,
`offPeakAutoResume`, `weekendMode`, `deferredResume`, `queueFallback`, `retryEnabled`; Text-/Listenfelder:
`officialProviders`, `officialBaseURLs`, `deferredResumeText`.

Prüfen Sie das Status-Badge in der Session-Oberfläche — es zeigt die aktuelle Phase (`高峰·拦官方` / `高峰·全部暂停`
/ `谷时` / `周末`).

Prüfen Sie das Urteil zur offiziellen Quelle für eine Route (Host-Route, kein Neustart nötig):

```bash
curl -s 'http://127.0.0.1:3080/session-guard/provider?provider=deepseek-official'
# {"ok":true,"verdict":{"provider":"deepseek-official","official":true,"matchedBy":"endpoint","endpoint":"https://api.deepseek.com"}}
```

Führen Sie die Testsuite aus (kein Netzwerk, keine Zugangsdaten):

```bash
npm test
```

## 3. Aktualisieren

```bash
dsh plugin --profile web remove dsh-session-guard
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
```

dsh web neu starten und die Seite neu laden. Die Einstellungen liegen in `$DSH_HOME/settings.yaml` im
Namespace `session-guard` und überstehen das Update; neue Schlüssel (`providerGuard`, `deferredMode`, …)
bleiben auf ihren Standardwerten, bis Sie sie anfassen.

Vom **Plugin** `0.1.3` / `0.1.4-beta.1` zum **Plugin** `0.1.5-beta.1` ist die einzige Verhaltensänderung, dass Spitzenzeiten nun
standardmäßig **nur** offizielle Quellziele blockieren. Um das alte Pauschverhalten wiederherzustellen, setzen Sie
`providerGuard: false` (oder verengen Sie das Urteil mit `officialProviders` / `officialBaseURLs`).
(Das sind Plugin-Versionen, keine DSH-Versionen — verwechseln Sie sie nicht mit den Host-Bereichen oben.)

## 4. Fehlerbehebung

| Symptom | Prüfung |
|---|---|
| Sessions laufen weiter während der Spitzenzeit | `GET /session-guard/status` → `phase` muss `peak` sein; `GET /session-guard/settings` → `enabled: true` |
| Ein lokaler Provider wird in der Spitzenzeit blockiert | `GET /session-guard/provider?provider=<id>` → `matchedBy` sollte `endpoint`/`unknown` mit `official: false` sein. Steht dort `explicit`, entfernen Sie die ID aus `officialProviders` |
| Eine offizielle Anfrage wird NICHT blockiert | `matchedBy: 'endpoint'` mit `official: false` bedeutet, dass die `baseURL` der Route nicht in `officialBaseURLs` steht; den Host dort ergänzen, oder die Route-ID in `officialProviders` aufnehmen |
| Anfragen hängen, statt zu scheitern | Das ist der `hold`-Modus, so gewollt. Für einen expliziten Fehler `deferredMode: 'error'` setzen oder `deferredMaxHoldMs` senken |
| Nach der Spitzenzeit setzt nichts fort | `deferredResume` muss an sein (oder `/resume` ausführen); `offPeakAutoResume` steuert die Fortsetzung auf Session-Ebene |
| Urteilsdiagnostik nicht verfügbar | `GET /session-guard/diag` → `providerGuard`, `configurableProviders`, `held`, `deferred` |

## 5. Deinstallieren

```bash
dsh plugin --profile web remove dsh-session-guard
```

dsh web neu starten. Gehaltene Anfragen werden beim Entladen freigegeben (abgewiesen) — keine Promise-Lecks.

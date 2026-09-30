<p align="center">
  <strong>Automatisches Session-Gate zu Spitzenzeiten: Wochenendmodus + automatische Spitzenzeiten-Pause + zweidimensionale Prüfung offizieller Quellen + Session-Freeze + automatische Backend-Wiederholung</strong>
</p>
<img width="832" height="182" alt="00c4b89a-b026-4bf1-a358-a068e80d2da7" src="https://github.com/user-attachments/assets/31a8836f-0fe0-4043-948a-f0865bb1b3bb" />

<p align="center">
  <a href="README.en.md">English</a> · <a href="README.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.fr.md">Français</a> · <strong>Deutsch</strong> · <a href="README.it.md">Italiano</a> · <a href="README.ru.md">Русский</a> · <a href="README.es.md">Español</a>
</p>
<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square"></a>
  <img src="https://camo.githubusercontent.com/2c11fb2e0e14bb9985c5acbe61123a7441c5ee63aa27fa6e04e2a707ebfd6022/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f6473682d2d706c7567696e2d72656164792d3437384342463f6c6f676f3d646565707365656b266c6f676f436f6c6f723d7768697465" alt="dsh-plugin" data-canonical-src="https://img.shields.io/badge/dsh--plugin-ready-478CBF?logo=deepseek&amp;logoColor=white" style="max-width: 100%;">
  <img alt="Public beta" src="https://img.shields.io/badge/status-public%20beta-7da1de?style=flat-square">
</p>

# dsh-session-guard

- [English README](./README.en.md)
- [中文 README](./README.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [README en français](./README.fr.md)
- [README auf Deutsch](./README.de.md)
- [README in italiano](./README.it.md)
- [README auf Russisch](./README.ru.md)
- [README en español](./README.es.md)
- [Installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [Guide d'installation en français](./INSTALL.fr.md)
- [Installationsanleitung auf Deutsch](./INSTALL.de.md)
- [Guida all'installazione in italiano](./INSTALL.it.md)
- [Руководство по установке на русском](./INSTALL.ru.md)
- [Guía de instalación en español](./INSTALL.es.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)
- [Changelog en français](./CHANGELOG.fr.md)
- [Changelog auf Deutsch](./CHANGELOG.de.md)
- [Changelog in italiano](./CHANGELOG.it.md)
- [Changelog auf Russisch](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)

> **Kompatibilitätshinweis:** v0.1.1 enthält bereits japanische (`ja`) und koreanische (`ko`) Wörterbücher, aber die aktuellen offiziellen DSH-Versionen stellen über `LocaleRuntime` nur `zh` und `en` bereit. In einem unveränderten DSH schlägt die Wahl von `ja` oder `ko` mit `locale "<id>" is not registered` fehl. Es muss abgewartet werden, bis das offizielle DSH die entsprechenden Locale-IDs ergänzt. Fortgeschrittene Benutzer können einen DSH-Fork pflegen, um dies zu erweitern.

> **▼ DSH-Versionskompatibilität**
>
> | DSH-Version | Laden | Einstellungsregistrierung | Session-Events / Gate | Client-Seite |
> | --- | --- | --- | --- | --- |
> | 0.1.0-rc.7 ~ 0.1.1-rc.x | ➖ nicht in dieser Linie (historische Versionen vor `legacy/0.1.2`) | `ctx.settings.register(ns, schema, { base })` | ✅ gleiche Form | ✅ keine Plattformwert-Imports |
> | 0.1.2-alpha.2+ / 0.1.2-rc.1 | ➖ nicht in dieser Linie → `legacy/0.1.2` verwenden (npm `@dsh-0.1.2`) | `register` bleibt erhalten (zusätzlich `installSection`) | ✅ gleiche Form | ✅ keine Plattformwert-Imports |
> | **0.2.0-rc.1+** | ✅ (**diese Linie**, dist-tag `dsh-0.2.0`, npm `4.0.0`) | deklarativ: `.volatile()`-Felder des Config werden vom Host zu Formularen projiziert, `register` entfernt | ✅ Events über den Dual-Pfad `snapshotEvents()` gelesen | ✅ Client-Einstellungskarte auf `configForms` umgestellt |
> | 0.1.7-rc.1+ | ✅ (Zweig `compat/0.1.7`, dist-tag `dsh-0.1.7`) | deklarativ: `.volatile()`-Felder des Config werden vom Host zu Formularen projiziert, `register` entfernt | ✅ Events über den Dual-Pfad `snapshotEvents()` gelesen | ✅ Client-Einstellungskarte auf `configForms` umgestellt |
> | 0.1.5-rc.2 | ✅ (Zweig `compat/0.1.5`, dist-tag `dsh-0.1.5`) | `register` weiterhin vorhanden (String-Namespaces) | ✅ Events über den Dual-Pfad `snapshotEvents()` gelesen | ✅ |
>
> **Identität dieser Linie**: Zweig `compat/0.2.0`, npm-Versionsnummer **`4.0.0`** (semver), dist-tag **`dsh-0.2.0`**.
> Die `engines.dsh` in `package.json` und `dsh.plugin.json` sowie die vier `@deepseek-ai/dsh-client-*`-Peers
> sind einheitlich auf `>=0.2.0-rc.1 <0.2.1-0` gesetzt; die Untergrenze des `@deepseek-ai/cordis`-Peers entspricht dem `^4.0.4` der Host-Linie.
> Früher benutzte das README „2.x / 3.x" als **Liniencoden** — das war eine Erzählkonvention, **keine aus der Registry
> pullbare Versionsnummer** — maßgeblich sind ausschließlich die npm-Versionen `0.3.1` (0.1.2-Linie), `3.0.0`/`3.0.1` (0.1.5-Linie),
> `3.2.4` (0.1.7-Linie) und `4.0.0` (0.2.0-Linie).
>
> **0.2.0-Anpassung (Zweig compat/0.2.0, npm 4.0.0)**:
> Die von diesem Plugin genutzte Plugin-API (Manifest/Settings/HMR/Slot/Session V4) ist in 0.2.0-rc.1 vollständig kompatibel mit 0.1.7;
> die Anpassung ist ein reiner Metadaten-Generationswechsel (Peer/Engines/dist-tag/Version 4.0.0). Mit der Basis gemeinsam übernommene
> Engineering-Fixes:
> ① `src/client/family-section.tsx` ist in die Versionskontrolle aufgenommen (vorher nur im lokalen Arbeitsbereich vorhanden, ein sauberer Checkout konnte nicht bauen);
> ② die eslint-Konfiguration verzichtet auf das Core-`no-unused-vars`, das TS-Typsignatur-Parameter fälschlich meldete — die Lint-Baseline ist wieder komplett grün;
> ③ die statischen v4-Gates für die Signaturen der Schreibpfade (`tests/source-kind.test.mjs`) kommen mit der Basis in diese Linie;
> ④ der `@deepseek-ai/cordis`-Peer ist auf `^4.0.4` ausgerichtet (die Host-UI-Pakete von 0.2.0-rc.1 deklarieren `~4.0.4`; das frühere `^4.0.1` kollidierte nicht, lag aber mit seiner Untergrenze zu tief).
>
> **Verbleib anderer Linien**: DSH-`0.1.2-rc.x`-Hosts verwenden bitte den Zweig **`legacy/0.1.2`** (npm-dist-tag
> `dsh-0.1.2`, Version `0.3.1`). **`main` ist bei `0.2.0-beta.1` eingefroren und ist nicht der Release-Zweig der 0.1.2-Linie.**
> DSH-`0.1.0-rc.7` ~ `0.1.1-rc.x`-Hosts verwenden bitte historische Versionen ≤ `0.1.2`.
> Feldursprungs-Definitionen siehe
> `mine-dsh-plugins/improve-dsh-plugins/DSH-PLUGIN-VERSION-DISTRIBUTION-STRATEGY.md` §2.2.
>
> **0.1.5-Anpassung (Zweig compat/0.1.5, npm 3.0.0)**:
> ① Dual-Pfad für `agent.followup` — 0.1.5 macht die Inbox zu einer schreibgeschützten Projektion der Agent-Loop; existiert `followup`
> nicht mehr, wird auf `agent.send` zurückgefallen, ist beides nicht vorhanden, folgt eine Warnung statt eines Fehlers (Absicherung für die Fortsetzung);
> ② Fortsetzungsnachrichten erhalten `source` mit `form: 'instructions'` (0.1.5-ContextFormed-Vertrag, ältere Versionen ignorieren das);
> ③ `webServer.register` ist in try/catch gepackt; eine fehlgeschlagene Registrierung wird nur geloggt und bringt das Host-Plugin-Loading nicht zum Absturz;
> ④ 0.1.5 entfernt den Array-Accessor `session.events`; Events werden über `snapshotEvents()` als Hauptpfad +
> Rückfall auf das alte Array gelesen (betrifft nur die beiden Hilfswege `findToolOutcome` / `lastUserPrompt`, das Event-Typ-Matching bleibt unverändert).
> Verifiziert: Der `WebRoute`-Vertrag (exact/prefix + SSE) von 0.1.5 ist unverändert; der Client-
> `fetch('/session-guard/...')` braucht kein `/api`-Präfix.
> Die folgende Kompatibilitätstabelle überspannt zwei API-Generationen (0.1.1 / 0.1.2); diese Linie beansprucht nur die 0.1.5-Zeile.
> `session/event`, `agent.cancel`, `goals.pause`,
> `agent.followup`, `commands.register`, `timer.interval`, `webServer.register`,
> `agent/request`, `llm.listConfigurableProviders`, `settings.register/get` haben zwischen
> `dsh-v0.1.1-rc.2` und `dsh-v0.1.2-rc.1` identische Signaturen (diese Linie ist bis `dsh-v0.1.5-rc.2` verifiziert);
> einzig die Form der von `tool/result` aufgezeichneten Call-ID erfordert eine Doppellektüre (`content[].toolCallId` zuerst,
> `source.callId` als Rückfallebene), ausgelagert in `src/tool-call-id.js` mit Unit-Tests — in Replay-Logs beider Versionen können beide Formen auftreten.
> Ab 0.1.5 ist der Array-Accessor `session.events` entfernt; diese Linie liest über `snapshotEvents()` (alter Array als Rückfallebene erhalten),
> was nur die beiden Hilfswege `findToolOutcome` / `lastUserPrompt` betrifft.
> Das `model/selection`-Event gibt es **nur ab 0.1.2**, dient nur der Modellwechsel-Beschleunigung und muss per Feature-Erkennung abgefragt werden; die Einstellungsoberfläche nutzt nur
> die `register` + `get`-Schnittmenge (niemals `installSection` / das entfernte `installSettingsSection`).
> Drift-Wächter-Skript: `tools/check-api-drift.ps1` (diese Linie prüft standardmäßig gegen `dsh-v0.1.5-rc.2`, ob die benötigten Schnittstellen existieren).

> Pausiert laufende Sessions automatisch während der Spitzenzeiten, setzt sie automatisch außerhalb der Spitzenzeiten/am Wochenende fort; zusammen mit dem Freeze-Button von input-traffic für **Session-weise** Sperren; die **automatische Backend-Wiederholung** weicht während Freeze/Gate aus. Der Kern basiert auf einem **eigenen Session-Gate** (`agent.cancel keepInbox + goals.pause + session/event sichere Grenze + followup-Fortsetzung`) und hängt nicht mehr von dsh-task-control ab.

Ein cordis-Plugin, zusammengesetzt über den `dsh plugin`-Befehl und einen Bundle-Patch — ohne dsh-Quellcode-Änderungen, ohne PR.

> 💡 **Warum empfohlen**: DeepSeek hat am 2026-08-17 die **Peak-/Off-Peak-Abrechnung** eingeführt — in Spitzenzeiten (Pekinger Zeit 9:00-12:00, 14:00-18:00) kostet die Einheit das **Doppelte** der Schwachlastzeit (einschließlich Mittag, Nacht, Wochenende und Feiertage). Dieses Plugin pausiert laufende Sessions während der Spitzenzeiten automatisch und setzt sie außerhalb automatisch fort; zeitversetzte Langläufe sparen bis zu **50 %**; manuelles Einfrieren (mit dem input-traffic-Button) erlaubt zusätzlich eine präzise, sessiongenaue Steuerung.

## Funktionsübersicht

- **Wochenendmodus**: erkennt Wochenenden (zeitzonengenau via `Intl.DateTimeFormat`, ohne den 8-Stunden-Grenzfehler des nackten `getUTCDay()` bei der Pekinger Zeitzone) → am Wochenende gelten keine Peak-/Off-Peak-Zeiten, freies Laufen.
- **Automatische Spitzenzeiten-Pause (global)**: beim Eintritt in die Spitzenzeit (und nicht am Wochenende) werden alle laufenden Root-Sessions automatisch pausiert; nach der Spitzenzeit werden alle automatisch fortgesetzt — **globaler Schalter, keine manuelle Arbeit**.
- **Zweidimensionale Prüfung offizieller Quellen (providerGuard)**: in Spitzenzeiten wird **nur blockiert, wenn das Ziel der Anfrage eine offizielle DeepSeek-Quelle ist**; mit lokalen/Drittanbieter-Providern (z. B. `local-35b`) läuft alles normal, unberührt vom Peak-Gate. Prüfreihenfolge = explizite ID-Liste → `baseURL`-Endpunkt → Katalog-Standardendpunkt → eingebaute ID.
- **Anfragegenaues Sicherheitsnetz + verzögerte Warteschlange**: Sessions, die nach dem Spitzenbeginn starten oder unterwegs auf eine offizielle Quelle umgeschaltet werden, greift der Anfrage-Wächter `agent/request` auf (Standard `hold`: die Anfrage wird ohne Fehler angehalten und nach der Spitzenzeit automatisch freigegeben).
- **Session-weise Einfrieren / Fortsetzen**: redundanter Port `sessionGuard` + `POST /session-guard/rpc`, sessiongenau angeschlossen über den input-traffic-Freeze-Button; zusätzlich die manuellen Befehle `/pause /resume /cancel`.
- **Automatische Backend-Wiederholung (D9)**: transiente turn/end-Fehler (error/429/max-tokens) werden mit adaptivem Backoff automatisch fortgesetzt; permanente Fehler stoppen; **weicht während Freeze/Gate aus**, umgeht nie das Session-Gate.
- **fail-open**: eigenes Session-Gate nicht verfügbar, session-guard nicht installiert, Settings-Dienst fehlt — in allen Fällen stille Degradierung, niemals ein Absturz wegen einer Abhängigkeit.

## Vorschau der Oberfläche

Echter Lauf-Screenshot (Windows, dsh web) — aktivierter Wochenendmodus:

<figure>
  <img style="max-width:100%" alt="Statusleiste im Eingabebereich: der aktivierte „Wochenende"-Button ist hervorgehoben (bei aktivem Wochenendmodus laufen Sessions frei, ohne Peak-/Off-Peak-Rücksicht), daneben der Button „Session einfrieren" (mit input-traffic), die DeepSeek-V4-Flash-Denkstufe und Sendesteuerelemente, unten Statusleisten mit Runden/Schritten, LLM-Zeit, Cache-Trefferquote u. a." src="assets/高峰低峰周末提醒-周末状态.png" />
  <figcaption>Wochenendmodus aktiv: das „Wochenende"-Badge im Eingabebereich ist hervorgehoben, neben „Session einfrieren"; am Wochenende gibt es keine Peak-/Off-Peak-Zeiten, Sessions laufen frei.</figcaption>
</figure>

## Installation

```bash
# DSH-0.1.5-rc.x-Hosts (diese Linie, dist-tag dsh-0.1.5)
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5

# oder direkt über den git-Zweig
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.5

# DSH-0.1.2-rc.x-Hosts müssen die 0.1.2-Linie verwenden
dsh plugin --profile web add dsh-session-guard@dsh-0.1.2
```

`compat/0.1.5` ist die DSH-`0.1.5-rc.x`-Speziallinie, npm-Versionsnummer **`3.0.0`**; DSH-`0.1.2-rc.x`-Hosts verwenden bitte den
Zweig **`legacy/0.1.2`** (npm-dist-tag `dsh-0.1.2`, Version `0.3.1`). **`main` ist bei `0.2.0-beta.1` eingefroren,
nicht der Release-Zweig der 0.1.2-Linie.**

> ⚠️ Verlassen Sie sich nicht auf den nackten Paketnamen `dsh-session-guard`: npm's `latest`-Tag kann zwei sich gegenseitig ausschließende
> Versionslinien nicht gleichzeitig bedienen (ihre `engines.dsh`-Bereiche sind nach den semver-Prerelease-Regeln exklusiv) — der dist-tag muss explizit angegeben werden.

Nach der Installation dsh web neu starten und die Seite neu laden.

## Einstellungen (Einstellungen → Plugins → session-guard, einfache Schalter)

| Schalter | Standard | Beschreibung |
|---|---|---|
| `enabled` | on | **Automatische Pausierung/Einfrieren von Sessions in Spitzenzeiten**: pausiert laufende Sessions während der Spitzenzeiten automatisch |
| `stepLevelPause` | on | **Gate auf Step-Ebene**: in Spitzenzeiten wird das Gate **vor** der Modellanfrage des nächsten Steps geschlossen (früher und sparsamer als eine Pausierung auf Rundenebene); aus = Rückfall auf Runden-Pause |
| `providerGuard` | on | **Zweidimensionale Prüfung offizieller Quellen**: in Spitzenzeiten werden nur offizielle DeepSeek-Quellen blockiert, lokale/Drittanbieter-Provider laufen normal |
| `guardSubagents` | on | **Subagenten-Anfragen einbeziehen**: auch Subagenten-Anfragen werden abgerechnet, standardmäßig mit blockiert |
| `offPeakAutoResume` | on | **Automatische Fortsetzung in Schwachlastzeiten**: pausierte Sessions werden außerhalb der Spitzenzeiten automatisch fortgesetzt; aus = keine automatische Fortsetzung nach der Spitzenzeit (manuell nötig) |
| `weekendMode` | on | **Wochenendmodus**: erkennt Wochenenden → am Wochenende keine automatische Pausierung (am Wochenende gibt es keine Spitzenzeit, freies Laufen) |
| `deferredResume` | on | **Automatische Fortsetzung nach der Spitzenzeit**: aus = verzögerte Anfragen/Sessions laufen nicht automatisch weiter, `/resume` nötig |
| `queueFallback` | on | Rückfall auf die Lock-Wait-Warteschlange, wenn das eigene Session-Gate nicht verfügbar ist (fail-open) |
| `retryEnabled` | off | **Automatische Wiederholung (Backend)**: transiente Fehler werden automatisch fortgesetzt (Standard aus, konservativ) |

Zusätzliche Konfiguration:

- `timezone` (Standard Asia/Shanghai) — Zeitzone für die **Wochenenderkennung** und die Badge-Anzeige; **beeinflusst die Peak-/Off-Peak-Erkennung nicht** (immer Pekinger Zeit);
- `peakWindows` (Standard 09:00–12:00 / 14:00–18:00) — Peak-/Off-Peak-Fenster in Pekinger Zeit (UTC+8), identisch mit DeepSeeks offizieller Abrechnung;
- `pauseMode` (`safe`/`force`), `pauseReason` (`wait`/`stop`) — Art der Pausierung;
- `stepGateTimeoutMs` (Standard 300000) — Halte-Timeout des Step-Gates; bei Ablauf wird das Gate freigegeben und zu einer **Pausierung auf Rundenebene eskaliert** (Anti-Deadlock, kein „alle 5 Minuten ein Step"-Token-Tropf);
- Prüfung offizieller Quellen: `officialProviders` (zusätzliche offizielle Provider-IDs, kommasepariert, höchste Priorität), `officialBaseURLs` (Liste offizieller Endpoint-Hosts, Standard `api.deepseek.com`);
- Verzögerte Warteschlange: `deferredMode` (`hold` anhalten / `error` Fehler und verzögern), `deferredResumeText` (Text der Fortsetzung nach der Spitzenzeit), `deferredMaxHoldMs` (Haltelimit, Standard 6 h, bei Ablauf Umwandlung in error);
- Retry-Parameter: `retryText`, `retryGraceMs`, `retryCooldownMs`, `retryBackoffFactor`, `retryBackoffMaxMs`, `retryMaxConsecutive`.

## Verhalten

### Automatisches Peak-Gate (global)

- **Spitzenbeginn** (und nicht Wochenende): mit aktiviertem `stepLevelPause` wird die laufende Runde **nicht mehr sofort unterbrochen** — die Session läuft bis zur nächsten `agent/pre-step`-Grenze, wo das Step-Gate schließt (siehe nächster Abschnitt); ausgeschaltet wird für alle laufenden Root-Sessions `gate.stopNextTurn` aufgerufen (echte Pause über das eigene Session-Gate, oder je nach `queueFallback` Rückfall auf die Lock-Wait-Warteschlange);
- **Spitzenende / Wochenende**: zuerst `releaseAll` für die gehaltenen Steps (die Runde läuft an Ort und Stelle weiter), dann `gate.resume` **aller** Sessions — gesteuert durch den Schalter `offPeakAutoResume`, ausgeschaltet keine automatische Fortsetzung nach der Spitzenzeit;
- **Peak-Zeitzone**: immer Pekinger Zeit (`Asia/Shanghai`), identisch mit der Abrechnungsbasis von DeepSeek, unbeeinflusst von der `timezone`-Einstellung;
- Zustandsmaschine: einzelne Instanz `NORMAL ↔ PAUSED_PEAK` (`scheduler.js`), angetrieben von einem einzigen 30-s-Tick.

### Step-Gate (v0.2.0, der Schlüssel zur Token-Ersparnis)

Hängt an der `agent/pre-step`-Waterfall: die Runde wird angehalten, **bevor die Modellanfrage des nächsten Steps passiert**.

- **Haltebedingungen** (alle erforderlich): `enabled` + `stepLevelPause` + `step > 1` + Spitzenzeit (Pekinger Zeit, nicht Wochenende) + offizieller Ziel-Provider (`providerGuard`, bei „aus" werden alle blockiert) + Session nicht anfragegehalten + in diesem Peak-Fenster nicht manuell umgangen;
- **Warum `step > 1`**: der erste Step einer Runde wird vom Anfrage-Wächter abgedeckt, damit sich die beiden Gates nicht überlappen;
- **Freigabewege**: ① Button „⏸ pausiert (fortsetzen)" / `POST /session-guard/rpc {action:'stepResume'}` / `/resume` → lässt den aktuellen Step durch und **blockiert diese Session für den Rest der Spitzenzeit nicht mehr**; ② Spitzenende → alles freigeben, die Runde läuft an Ort und Stelle weiter (**kein followup nötig**); ③ Freeze-Button / `/pause` / `/cancel` → Gate freigeben und zur Runden-Pause übergehen; ④ `signal`-abort (Benutzerabbruch) → freigeben;
- **Timeout-Eskalation**: Haltung über `stepGateTimeoutMs` (Standard 5 Minuten) hinaus → Gate freigeben und **Eskalation zu einer force-Pause auf Rundenebene**, nach der Spitzenzeit einheitlich fortgesetzt (kein Stillstand, kein Token-Tropfen während der Spitzenzeit);
- **Zustand**: `GET /session-guard/state?session=<id>` liefert `paused: { step, turn }` und `stepGate: { held, since, bypass }`; das `paused` des Service-Ports `state()` **bleibt boolesch** (Rückwärtskompatibilität), der Step-Zustand steckt in `pausedStep`;
- **Keine Persistenz**: der Halt ist eine Promise im Prozess, ein Neustart verwirft sie (keine Geisterzustände).

#### Buttons „Session pausieren / Session fortsetzen" (von session-guard bereitgestellt)

Der Button „Session pausieren" rechts im Eingabebereich (slot `conversation.input.right`, id `session-guard-pause`, order 20, links vom input-traffic-Button „❄ Einfrieren & Anhang"):

- nicht pausiert → „Session pausieren", **klickbar**: der Klick ruft `stepPause` auf und pausiert die Session **vor der Modellanfrage des nächsten Steps** (der aktuelle Step wird nicht unterbrochen; auch Step 1 wird gehalten, unabhängig von Peak-Zeiten / Provider);
- pausiert → „Session fortsetzen", der Klick ruft `stepResume` auf: lässt den aktuellen Step durch und blockiert diese Session für den Rest der Spitzenzeit nicht mehr;
- **Event-Push**: `GET /session-guard/events?session=<id>` (SSE) pusht Step-Gate-Zustandsänderungen **sofort** — schließt die Spitzenzeit das Gate automatisch, wechselt der Button augenblicklich zu „Session fortsetzen", ohne auf einen Poll zu warten; zusätzlich dient ein 10-Sekunden-Poll von `/session-guard/state` als Sicherheitsnetz (konvergiert auch, wenn SSE nicht verfügbar / getrennt ist);
- Stil an den input-traffic-Buttons derselben Zeile ausgerichtet (24 px Höhe / 6 px Radius / 12 px Schrift / dieselben CSS-Tokens), mit Hover- und Pausen-Zustandsrückmeldung.

### Session-Sperre (Einfrieren)

- **Redundanter Port**: `ctx.provide('sessionGuard', service)` — `stopNextTurn(sessionId)` / `resume(sessionId)` / `lockQueue(sessionId)` / `unlockQueue(sessionId)` / `state(sessionId)`;
- **RPC-Brücke**: `POST /session-guard/rpc { action, sessionId }` — der input-traffic-Freeze-Button ruft `stopNextTurn` / `resume` **sessionweise** nach `sessionId` auf; wird still übersprungen, wenn dieses Plugin nicht installiert ist (fail-open D8);
- **Manuelle Befehle**: `/pause [force|safe] [stop|wait]`, `/resume [confirm] [rerun|skip]`, `/cancel` — wirken auf die aufrufende Session (`invocation.agent.id`).

### Automatische Backend-Wiederholung (D9)

Hört auf `turn/end` und klassifiziert Fehler:

- **Transiente Fehler** (error/429/max-tokens usw.) → automatische `followup(retryText)`-Fortsetzung mit adaptivem Backoff;
- **Permanente Fehler** (Authentifizierung/Guthaben/Modell/Kontextlimit) → Stopp;
- **Ausweichen während Freeze/Gate**: keine Wiederholung, solange `isFrozen(sessionId)` wahr ist (queueLocked / paused / taskControl paused);
- Benutzereingriff oder erfolgreiche Runde setzt den Zähler aufeinanderfolgender Fehler zurück.

### Status-Badge (Frontend-Anzeige)

Rechts im Eingabebereich erscheint ein **rein informatives** Status-Badge, das die aktuelle Phase in Echtzeit widerspiegelt:

| Phase | Badge-Text | CSS-Klasse | Bedeutung |
|---|---|---|---|
| `peak` (Prüfung an) | 高峰·拦官方 | `sg-peak` | Spitzenzeit, nur Anfragen an offizielle DeepSeek-Quellen werden blockiert |
| `peak` (Prüfung aus) | 高峰·全部暂停 | `sg-peak` | Spitzenzeit, alle Sessions pausiert |
| `off-peak` | 谷时 | `sg-off` | Außerhalb der Spitzenzeit, Sessions laufen normal |
| `weekend` | 周末 | `sg-weekend` | Wochenende (bei aktivem Wochenendmodus), ohne Peak-/Off-Peak-Rücksicht |

- **Polling**: alle 15 Sekunden wird `GET /session-guard/status` abgefragt, für globales `phase`, `providerGuard`, `held`, `deferred`, `stepHeld`;
- **fail-open**: Route nicht erreichbar, Netzwerkfehler oder `enabled` aus → Badge wird still ausgeblendet, keine Session betroffen;
- **Unabhängig von input-traffic**: das Badge rendert der session-guard-Client allein, es erscheint **ohne Installation des input-traffic-Plugins**. input-traffic liefert nur den Freeze-Button, keine Abhängigkeit zum Badge;
- **Tooltip**: beim Hover zeigt es `Phase · Zeitzone · Wochenendmodus · Prüfbasis · Anzahl gehaltener/verzögerter/Step-gehaltener`.

### Prüfbasis für offizielle Quellen (providerGuard)

In Spitzenzeiten werden Sessions nicht pauschal gestoppt: Zuerst wird geprüft, ob „die Route, die diese Anfrage wirklich nimmt, eine offizielle DeepSeek-Quelle ist":

| Priorität | Grundlage | `matchedBy` | Beispiel |
|---|---|---|---|
| 1 | explizite ID-Liste `officialProviders` | `explicit` | Benutzer deklariert ein selbst betriebenes Gateway als offiziell |
| 2 | Host der live normalisierten `baseURL` | `endpoint` | `deepseek-official` auf ein Relay umgestellt → **nicht blockiert** |
| 3 | Katalog-Standardendpunkt | `endpoint-default` | pi-ais `deepseek`-Route zielt standardmäßig auf die offizielle API → **blockiert** |
| 4 | eingebaute ID-Liste (`deepseek-official`) | `route-id` | Rückfallebene, wenn der Endpunkt nicht lesbar ist |
| 5 | alles andere | `unknown` | nicht offiziell, durchlassen |

- **Endpunkt schlägt ID**: eine Konfiguration namens `deepseek-official`, deren `baseURL` auf ein Relay zeigt, wird **nicht** fälschlich blockiert; umgekehrt entgeht pi-ais eingebaute `deepseek`-Route mit Standardendpunkt auf die offizielle API der Blockierung **nicht**.
- **Endpunktquelle**: `ctx.get('llm').listConfigurableProviders()` findet den Katalogeintrag → `ctx.settings.get(settingsNs)` liest die `baseURL` über `settingsPath` (nur nicht-sensible Felder, der Wert von `apiKeyEnv` wird nie gelesen). Bei jeder Anfrage neu berechnet, nie gecached → Provider-Konfigurationsänderungen greifen sofort.
- **Umschaltung weg von offiziell löst Fortsetzung aus**: wird eine beim Spitzenbeginn pausierte Session auf einen lokalen/Drittanbieter-Provider umgestellt (`model/selection`-Event ab 0.1.2) → automatische Fortsetzung dieser Session (unter dem Vorbehalt von `deferredResume`); nur Sessions, die dieses Plugin beim Spitzenbeginn pausiert hat, werden berührt, manuell per `/pause` pausierte **niemals**. Ohne dieses Event unter 0.1.1 → Rückfall auf „nächste Anfrage oder manuelles `/resume`".
- **Endpunkt nicht lesbar**: `llm`-Dienst fehlt, Namespace-Struktur geändert, Feld kein String — durchweg Degradierung zur ID-/eingebauten-Endpunkt-Prüfung mit protokolliertem `matchedBy`, **niemals wird eine Exception geworfen**.
- **Fehlurteil untersuchen**: `GET /session-guard/provider?provider=<id>` liefert `{ official, matchedBy, endpoint }`.

### Anfragegenauer Wächter und verzögerte Warteschlange

- **Warum Anfrageebene**: der 30-s-Tick verarbeitet beim Sprung `NORMAL → PAUSED_PEAK` nur die dann `running` Sessions; danach gestartete oder unterwegs auf offizielle Quellen umgeschaltete Sessions würden durchrutschen. Die `agent/request`-Waterfall läuft bei **jeder Anfrage**.
- **Die Prüfung nutzt den Rückgabewert von `next()`**: die Modellauswahl-Middleware überschreibt provider/model innerhalb der Waterfall mit den in der UI gewählten Werten, daher muss erst `await next()` abgewartet werden, bevor geprüft wird.
- **Hold-Modus (Standard)**: die Anfrage wird angehalten, **weder gesendet noch mit Fehler**, und exakt zum Spitzenende freigegeben (`msUntilOffPeak`-Präzisionszeitgeber, 30-s-Tick als Rückfallebene); ein Benutzerabbruch (abort) unterbricht normal.
- **Error-Modus**: wirft einen erkennbaren `PEAK_DEFERRED`-Fehler + Eintrag in die verzögerte Warteschlange, Fortsetzung nach der Spitzenzeit mit `deferredResumeText` (keine automatische Fortsetzung, wenn `deferredResume` aus ist).
- **Obergrenze**: läuft `deferredMaxHoldMs` (Standard 6 h) ab, ohne dass die Spitzenzeit endet → Umwandlung in error, um endloses Anhalten zu vermeiden.
- **Eiserne Ausschließungsregel**: während eines Holds wird **nie** zusätzlich das Session-Gate zum Pausieren aufgerufen (eine Pause wartet auf die sichere Grenze, die eine gehaltene Anfrage nie erreicht → beide warten aufeinander). Beim Spitzenbeginn werden bereits gehaltene Sessions übersprungen.
- **Keine Persistenz**: die verzögerte Warteschlange ist eine In-Prozess-Promise, ein Neustart löscht sie.

### Grenzen (ausdrücklich nicht im Umfang)

- **Kein Provider-Wechsel / kein Umleiten**: nur blockieren, nicht routen;
- **Compaction läuft nicht durch `agent/request`**: während eine Session pausiert ist, findet sie nicht statt; eine manuell ausgelöste Komprimierung während der Spitzenzeit kann weiterhin die offizielle Quelle treffen (dieses Plugin greift nicht in die `ctx.llm.stream`-Schicht ein);
- **0.1.1 hat kein `model/selection`-Event**: die automatische Fortsetzung nach Umschaltung auf eine nicht-offizielle Quelle fällt auf „nächste Anfrage oder manuelles `/resume`" zurück (ab 0.1.2 sofort);
- **Keine neuen npm-Abhängigkeiten**, kein Lesen/Schreiben von Zugangsdaten, keine Berührung der 429-/Transport-Retries von `dsh-llm-retry`.

### Zeitzonenbehandlung und -validierung

- Die Zeitzonenerkennung basiert auf **IANA-Zeitzonennamen** (z. B. `Asia/Shanghai`, `Asia/Tokyo`, `Asia/Seoul`), projiziert über `Intl.DateTimeFormat` auf die Wanduhr der konfigurierten Zeitzone, **ohne nacktes `getUTCDay()`** — vermeidet den klassischen 8-Stunden-Grenzfehler der UTC+8-Zone Pekings (Samstag 00:30 Pekinger Zeit ist in UTC noch Freitag);
- `Intl.DateTimeFormat` ist selbst die Validierungsschicht: ein ungültiger Zeitzonenname (z. B. `Foo/Bar`) wirft eine `RangeError`, die von einem äußeren try-catch still auf die Standardzeitzone `Asia/Shanghai` zurückfällt (fail-open);
- Peak-Fenster sind **links geschlossen, rechts offen** `[start, end)`, mit Unterstützung für Fenster über Mitternacht (z. B. `22:00–06:00`);
- Die `timezone`-Einstellung verhält sich in allen Sprachen (zh/en/ja/ko) identisch — die IANA-Zeitzonennamen von `Intl.DateTimeFormat` sind locale-unabhängig, das Zeitzonenverhalten unter japanischer/koreanischer Oberfläche ist exakt wie im Chinesischen.

### Arbeitsteilung mit input-traffic: das eine „stoppt", das andere „reiht"

Beide wirken auf **unterschiedlichen Gliedern derselben Kette**, die Grenze zieht DSHs eigenes Inbox-Modell:

```
Benutzereingabe ──(input-traffic wählt die Stufe)──▶ next-step / next-turn Warteschlangen
                                        │
                          agent/pre-step ──(Step-Gate dieses Plugins)──▶ durchlassen / anhalten
                                        │
                            agent/request ──(Anfrage-Hold dieses Plugins)──▶ durchlassen / anhalten
                                        │
                                     Modellanruf
```

**DSHs Warteschlangen-Semantik (zwei Warteschlangen, nicht verwechseln)**

| Warteschlange | Bedeutung | Verbrauch |
|---|---|---|
| `next-step` | „Eingabe, die auf die nächste Step-Grenze wartet" | Am nächsten `agent/pre-step`: **auf gleicher Ebene wie ein Tool-Ergebnis**, ein weiterer Step in derselben Runde |
| `next-turn` | „Prompt, der auf eine eigene Runde wartet" | Nach Abschluss der aktuellen Runde, gestartet als **neue Runde** |

`Inbox.claim()` **räumt immer zuerst `next-step` ab** und nimmt nur dann zusätzlich **1** `next-turn`, wenn die Grenze eine neue Runde eröffnet; der erste Step einer Runde liest next-turn, alle folgenden lesen next-step.

**Zuständigkeiten**

- **session-guard = stoppen**: entscheidet nur, „wann fortgeschritten werden darf", **fasst Inhalt und Reihenfolge der Warteschlangen nie an**.
  - Step-Gate (`agent/pre-step`): hält **vor** der Modellanfrage des nächsten Steps;
  - Runden-Pause (`agent.cancel({keepInbox:true})` + `goals.pause` + sichere Grenze): stoppt die aktuelle Runde, **Warteschlangen bleiben unverändert**;
  - Anfragegenauer Wächter (Hold auf `agent/request`): hält **genau diese eine Modellanfrage** an.
- **input-traffic = reihen**: entscheidet nur, „in welche Warteschlange die Benutzereingabe kommt, in welcher Stufe, und wann sie verbraucht wird".
  - drei Stufen = welche Warteschlange: rot „unterbrechen" ruft erst `cancel()` auf, dann `steer`; gelb „einfügen" ruft `steer` auf (→ `next-step`, der nächste Step derselben Runde); grün „einreihen" bleibt in `next-turn`;
  - Einfrieren = alle `queued` + `steering`-Zeilen herauslösen (Stufen bleiben erhalten) + Composer-Sperre + Aufruf von `sessionGuard.stopNextTurn`; Fortsetzen = Sperre aufheben → zuerst `sessionGuard.resume` → erneute Einreichung nach Stufe.

**Zwei eiserne Regeln am Treffpunkt**

1. **Einfrieren muss dieses Plugin zuerst die Step-Gate freigeben lassen**: das Step-Gate hängt an `agent/pre-step`, während die Runden-Pause auf ein Ereignis an der sicheren Grenze wartet — beide würden aufeinander warten (`pauseTask` / `cancelTask` dieses Plugins machen zuerst `release`);
2. **Beim Step-Gate-Halt sind die Nachrichten bereits entnommen**: `preStep()` macht `inbox.claim()`, bevor es die Waterfall dispatcht, neue Eingaben reihen sich also hinter dem bereits entnommenen Stapel an; `keepInbox` gilt nur für die Runden-Pause.

**Kein gegenseitiges Übergreifen**: input-traffic hört weder `agent/pre-step` noch `agent/request` (einzige Ausnahme ist das explizite `cancel()` der Stufe „unterbrechen", das vom Benutzer verlangt wurde); dieses Plugin schreibt niemals Inhalt oder Reihenfolge von `next-step` / `next-turn` um.

Zu den Buttons: die Buttons „Session pausieren / Session fortsetzen" dieses Plugins (order 20) und die input-traffic-Buttons „❄ Einfrieren & Anhang / Fortsetzen & Anhang" (order 30) stehen nebeneinander und ersetzen sich nicht — erstere steuern das Step-Gate, letztere das Herauslösen aus der Warteschlange + das Einfrieren auf Rundenebene.

## Redundanter Port `sessionGuard`

```js
{
  stopNextTurn(sessionId, opts),  // stoppt die nächste Runde der Session (eigenes Session-Gate / Rückfall Lock-Warteschlange)
  resume(sessionId, opts),        // fortsetzen (confirm + choice: rerun|skip)
  lockQueue(sessionId, reason),   // Warteschlange explizit sperren
  unlockQueue(sessionId),         // Warteschlange explizit entsperren
  stepPause(sessionId),           // manuell eine Step-Pause anfordern (Gate schließt an der nächsten pre-step-Grenze, Step 1 inklusive)
  stepResume(sessionId, opts),    // Step-Gate öffnen (v0.2.0); mit opts.bypass=false kein Peak-Umgehen
  state(sessionId),               // { queueLocked, lockReason, paused, pausedStep, stepHeldSince, stepBypass, taskControlAvailable, taskControl }
}
```

## HTTP-Routen

- `GET /session-guard/state?session=<id>` — Session-Zustand (mit `paused: { step, turn, manual }` / `stepGate` / letztes Ziel / gehalten? / verzögert?)
- `GET /session-guard/events?session=<id>` — **SSE**: sofortiger Push von Step-Gate-Zustandsänderungen (der Button aktualisiert sich danach)
- `GET /session-guard/settings` — Einstellungen + taskControl-Verfügbarkeit
- `GET /session-guard/status` — aktuelle globale Phase (Polling des Status-Badges; enthält `stepHeld`)
- `GET /session-guard/provider?provider=<id>` — Diagnose des Offiziell-Quellen-Urteils (`official` / `matchedBy` / `endpoint`)
- `GET /session-guard/diag` — Laufzeitdiagnose (enthält `stepGate`)
- `POST /session-guard/rpc` — `{ action: stopNextTurn|resume|lockQueue|unlockQueue|stepPause|stepResume|state, sessionId }`

## Zustandsspeicher

JSON pro Session: `$DSH_HOME/.dsh/session-guard/<sessionId>.json` (atomares Schreiben; überschreibbar mit `DSH_SESSION_GUARD_STATE_DIR`).

## Tests

```bash
npm test   # node --test tests/*.test.mjs (Zeitzonen/Wochenende/Zustandsmaschine/Session-Gate/Brücke/Retry)
```

## Module

| Datei | Verantwortung |
|---|---|
| `src/time.js` | Peak-/Wochenenderkennung (zeitzonengenau) + `msUntilOffPeak` (präzises Timing des Spitzenendes) |
| `src/scheduler.js` | Reine Zustandsmaschine NORMAL ↔ PAUSED_PEAK |
| `src/provider.js` | Fünfstufige Prüfung offizieller Quellen (pure Funktion: Endpunkt-Normalisierung + Entscheidungsmatrix) |
| `src/provider-directory.js` | Endpunktverzeichnis (`llm.listConfigurableProviders` + `settings.get`, Degradierung auf der ganzen Kette) |
| `src/deferrals.js` | Register der Verzögerungen (Halten / Freigabe / Limitüberschreitung / `PeakDeferredError`) |
| `src/request-guard.js` | Anfragegenauer Wächter auf `agent/request` (zwei Modi hold / error) |
| `src/step-gate.js` | **Step-Gate auf `agent/pre-step`** (v0.2.0: Schließen / Freigeben / Timeout-Eskalation / Bypass, das reine `decideStepHold` ist unit-testbar) |
| `src/targets.js` | Nachverfolgung des „letzten echten Ziels" einer Session (`request/header` + `model/selection`) |
| `src/wiring.js` | Verdrahtungs-Orchestrierung (Spitzenbeginn-Filter / Step-Gate-Verdrahtung / Freigabe nach der Spitzenzeit / präziser Zeitgeber / Aufräumen beim Entladen) |
| `src/pause-gate.js` | Engine des eigenen Session-Gates (agent.cancel keepInbox + goals.pause + sichere Grenze + followup-Fortsetzung; gibt vor dem Pausieren zuerst das Step-Gate frei) |
| `src/pause-store.js` | Persistenz des eigenen Pausenzustands |
| `src/gate.js` | Treiber des Session-Gates (echte eigene Pause / Rückfall Lock-Warteschlange, fail-open) |
| `src/bridge.js` | Redundanter Port `sessionGuard` |
| `src/retry.js` | Automatische Backend-Wiederholung (Fehlerklassifikation/Backoff/Ausweichen bei Freeze; Kurzschluss nur beim exakten Code `PEAK_DEFERRED`) |
| `src/detect.js` | Automatische Erkennung (Host-taskControl / Client-input-traffic-Brücke) |
| `src/store.js` | Persistenter Zustand pro Session |
| `src/settings.js` | Einstellungsunterbereich (schemastery-Schema + fail-open-Registrierung) |
| `src/index.js` | Host-apply (Einstellungen/Routen/Tick/Dienst bereitstellen/Retry-Verdrahtung/Anfrage-Wächter) |
| `src/client/` | Browser-Hälfte (**Session-Pausieren-Button** + Status-Badge + Einstellungskarte) |

## Lizenz

MIT — siehe [LICENSE](LICENSE).

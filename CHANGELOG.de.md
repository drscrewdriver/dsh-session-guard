# Änderungsprotokoll

Alle nennenswerten Änderungen an `dsh-session-guard` werden hier festgehalten. Versionen folgen semver.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)
- [Changelog en français](./CHANGELOG.fr.md)
- [Changelog auf Deutsch](./CHANGELOG.de.md)
- [Changelog in italiano](./CHANGELOG.it.md)
- [Changelog auf Russisch](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)

## 4.0.0 — 2026-09-29

### Geändert
- **Anpassung an die DSH-0.2.0-Linie**: `engines.dsh` und die vier `@deepseek-ai/dsh-client-*`-Peers wechseln zu `>=0.2.0-rc.1 <0.2.1-0` (ersetzt die 0.1.7-Bereiche); npm-dist-tag `dsh-0.2.0`; Manifest-Version auf `4.0.0` ausgerichtet. Die pluginseitige API-Oberfläche (Manifest / Settings / HMR / Slots / Session v4) ist gegenüber 0.1.7 unverändert — keine Änderungen am Laufzeitcode.
- Untergrenze des `@deepseek-ai/cordis`-Peers auf `^4.0.4` ausgerichtet (die Host-UI-Pakete von 0.2.0-rc.1 deklarieren `~4.0.4`; das bisherige `^4.0.1` akzeptierte sie, gab die Untergrenze aber zu niedrig an).

### Behoben
- `src/client/family-section.tsx` wurde in die Versionskontrolle aufgenommen (es existierte seit 3.2.x nur im Arbeitsbaum, ein sauberer Checkout konnte nicht bauen).
- eslint flat config: die Core-Regel `no-unused-vars` wurde entfernt — sie meldete TS-Typsignatur-Parameter zu Unrecht; die typescript-eslint-Variante bleibt, und die Lint-Baseline ist wieder grün.
- Die statischen v4-Source-kind-Gates (`tests/source-kind.test.mjs`) sind nun versioniert und laufen in `npm test` (248 Tests).

## 3.2.4 — 2026-09-27

### Behoben
- **Anpassung an das Session-Format v4 (Host >= 0.1.7-rc.1)**: die drei Session-Schreibpfade nutzen nicht mehr die entfernte Signatur `source: { kind: 'plugin', plugin: 'session-guard' }`, die der v4-Host mit `SessionFormatError` ablehnt (gesamte Runde schlägt fehl). Alle drei verwenden jetzt die producer-eigene kind:
  - Injektion der Hinweise für verzögerte Fortsetzung (`src/wiring.js`);
  - Injektion der Hinweise für automatische Wiederholung (`src/retry.js`);
  - Pause-Resume-followup (`src/pause-gate.js`, ```kind: `plugin:${pluginId}````).
  - **Native tool-result-v4-Anpassung (N1)**: `findToolOutcome` in `src/pause-gate.js` liest zuerst die v4-native `role:'tool'`-Nachricht erster Klasse (`toolCallId`/`isError` auf Nachrichtenebene); der v3-Pfad über `tool-result`-Blöcke bleibt als historischer Rückfall erhalten. Ohne dies wurde ein beim Pausieren fehlgeschlagenes Werkzeug bei der Fortsetzung als abgeschlossen gemeldet („nicht erneut ausführen") — eine stille Fehlentscheidung. `src/tool-call-id.js` liest zuerst die native ID auf oberster Ebene; veraltete Kopfnotizen aus der Zeit 0.1.1/0.1.2 auf die Drei-Formen-Generationstabelle korrigiert.
  `form` und alle übrigen Felder sind unverändert; die eigene v3-nach-v4-Migration des Hosts hebt bestehende Altzeilen an, daher werden keine historischen Daten umgeschrieben. Beleg: `@deepseek-ai/dsh-session-format-v3-to-v4@0.1.7-rc.2` prüft nur, dass `source.kind` nicht leer und nicht `'plugin'` ist.

## 0.4.0 — 2026-09-18 (falsch versioniert; durch 3.0.0 ersetzt)

### Behoben

- **Versionsidentität.** Diese Linie wurde als `0.4.0` veröffentlicht, während `dsh.plugin.json` und dieses
  Protokoll bereits `3.0.0` angaben — ein Artefakt mit zwei Versionsnummern. `package.json` lautet nun
  `3.0.0`, sodass Paketversion, Manifestversion und Protokoll übereinstimmen. `0.4.0` bleibt
  hier als historischer Eintrag, da npm-Versionen unveränderlich sind; der `dist-tag dsh-0.1.5` sollte
  nach Veröffentlichung auf `3.0.0` umgestellt werden.
- **Dokumentation.** README/INSTALL (zh/en/ja/ko) beschreiben die Schwesterlinie nicht mehr als auf `main` lebend.
  Der Release-Zweig der 0.1.2-Linie ist **`legacy/0.1.2`** (npm-dist-tag `dsh-0.1.2`, Version `0.3.1`);
  `main` ist bei `0.2.0-beta.1` eingefroren. Das doppelt vorhandene Zweig-Fragment im Installationsbefehl der
  INSTALL.zh/ja/ko ist behoben, Installationsbefehle mit explizitem dist-tag sind dokumentiert, und „2.x / 3.x" ist
  jetzt als **Linien-Spitzname** statt als Versionsnummer gekennzeichnet.

### Hinweise

- **Keine Quellcode-Änderungen** gegenüber `3.0.0`; `0.4.0` ist eine reine Paketierungs-Veröffentlichung desselben Baums.

## 3.0.0 — 2026-09-14

### Geändert

- **DSH-v0.1.5-rc.2-dedizierte Linie (`compat/0.1.5`).** Die Bereiche von `engines.dsh` und den `dsh-client-*`-Peers
  verengen sich auf `>=0.1.5-rc.2 <0.2.0-0` (strenges semver-Prerelease-Matching bedeutet, dass der alte
  Bereich `>=0.1.0-rc.7` `0.1.5-rc.2` nie traf); `dsh.plugin.json` erhält `engines.dsh`.
  Die 2.x-/0.2.x-Linie auf `main` bedient weiterhin DSH 0.1.0-rc.7 … 0.1.2-rc.1.
- **`session.events` → `snapshotEvents()`.** DSH 0.1.5 hat den Array-Accessor `session.events`
  entfernt (compatibility-guide §20.3). `pause-gate.js` liest Session-Events jetzt über einen
  Dual-Pfad-Helfer: zuerst `snapshotEvents()`, das Legacy-Array `events` als defensiver
  Rückfall, `null` (fail-open), wenn keines von beiden existiert. Betrifft nur `findToolOutcome` und
  `lastUserPrompt`; das Event-Typ-Matching ist unverändert.

### Unverändert

- Null Änderungen an allen übrigen Integrationsnähten: die selbst gehaltene webServer-Präfixroute
  (`/session-guard/rpc`), `settings.register`, der `settings.plugin.item`-Slot, Client-Injektionen und
  `llm.listConfigurableProviders()` sind alle gegen das veröffentlichte 0.1.5-rc.2-Bundle als intakt verifiziert
  (`tools/check-api-drift.ps1`, 12/12 erforderliche Assertionen).

### Ausstehend

- Live-Smoke auf einem echten DSH-0.1.5-rc.2-Host (gleicher Stand wie die perm-gate-0.1.5-Linie).

## 0.2.0-beta.2 — 2026-09-13

### Behoben (DSH-0.1.5-Kompatibilität — Zweig `compat/0.1.5`)

- **Dual-Pfad für das Einreihen zur Fortsetzung.** DSH 0.1.5 macht die Inbox zu einer schreibgeschützten
  Projektion der Agent-Loop, sodass `agent.followup` möglicherweise nicht mehr existiert. Der Fortsetzungsfluss
  probiert zuerst `agent.followup`, fällt auf `agent.send` zurück und degradiert zu einer Warnung (wirft nie),
  wenn beides nicht verfügbar ist — ein fehlgeschlagenes Einreihen kann die Fortsetzung nicht mehr brechen.
- **Fortsetzungsnachrichten tragen `source.form: 'instructions'`** gemäß dem 0.1.5-`ContextFormed`-
  Nachrichtenquellen-Vertrag (`kind: 'plugin'` ist eine eingebaute Art; ältere DSH-Versionen ignorieren
  das zusätzliche Feld).
- **`webServer.register` ist in try/catch gepackt**: eine fehlgeschlagene Routenregistrierung protokolliert
  nun einen Fehler, statt aus `apply` zu werfen und das Plugin-Laden des Hosts zu brechen.
- Gegen die 0.1.5-rc.2-Quelle verifiziert: der `WebRoute`-Vertrag (exact/prefix + SSE) ist
  unverändert, Client-`fetch('/session-guard/...')`-Pfade brauchen kein `/api`-Präfix.

## 0.2.0-beta.1 — 2026-09-10

### Hinzugefügt

- **Step-Gate (`agent/pre-step`).** In Spitzenzeiten wird der Rundendurchlauf nun **vor** der
  Modellanfrage des nächsten Steps gehalten statt an einer Rundengrenze unterbrochen: die Session läuft
  bis zum nächsten `agent/pre-step`, wo das Gate sie hält (Einstellung `stepLevelPause`, standardmäßig
  an). Die Runde läuft außerhalb der Spitzenzeit **an Ort und Stelle** weiter — keine Followup-Nachricht nötig. Haltebedingungen:
  Spitzenzeit (Pekinger Zeit) + kein Wochenende + `step > 1` + offizieller Ziel-Provider (`providerGuard`) +
  nicht anfragegehalten + in diesem Spitzenfenster nicht umgangen. Neues Modul `src/step-gate.js` (reines
  `decideStepHold` + Hold-/Release-/Abort-/Timeout-Engine).
- **`stepResume`-Port + RPC + `/resume`.** `sessionGuard.stepResume(sessionId, {bypass})`,
  `POST /session-guard/rpc {action:'stepResume'}` und `/resume` geben das Gate alle frei; ein manuelles
  Fortsetzen hört zusätzlich auf, diese Session für den Rest des Spitzenfensters zu kontrollieren.
- **Timeout-Eskalation.** `stepGateTimeoutMs` (Standard 300000) gibt das Gate frei und eskaliert zu einer
  **Force**-Pause auf Rundenebene, sodass eine lange Spitzenzeit weder deadlocket noch alle fünf Minuten einen Step „tropfen" lässt.
- **Button „⏸ Session pausieren"** (Client, slot `conversation.input.right`, id `session-guard-pause`,
  order 20 — links vom input-traffic-Freeze-Button). Er pollt `/session-guard/state` einmal pro Sekunde,
  bleibt deaktiviert, solange nichts gehalten wird, und ruft `stepResume` auf, sobald ja. Das Status-Badge zog auf
  order 40 und meldet nun die Anzahl der Step-gehaltenen Sessions.
- **Neue Einstellungen**: `stepLevelPause`, `stepGateTimeoutMs`.
- **Neue Zustände**: `GET /session-guard/state` liefert nun `paused: { step, turn }` und
  `stepGate: { held, since, bypass }`; `/status` liefert `stepHeld`; `/diag` liefert `stepGate`.
  Das `state().paused` des Service-Ports bleibt der Kompatibilität halber boolesch (neues Feld `pausedStep`).

### Behoben

- **Deadlock zwischen gehaltenem Step und Pause auf Rundenebene.** `pauseTask` / `resumeTask` /
  `cancelTask` geben nun zuerst das Step-Gate frei: ein Step-Halt sitzt an `agent/pre-step`, wo nie ein
  `assistant/message` oder `tool/result` ankommen kann, sodass eine `safe`-Pause ewig wartete und
  `paused` nie persistierte.

### Geändert

- **Spitzenbeginn unterbricht laufende Runden nicht mehr**, wenn `stepLevelPause` an ist (`onEnterPeak` rüstet
  das Step-Gate aus, statt `stopNextTurn` zu rufen); bei „aus" bleibt das bisherige Verhalten auf Rundenebene.
- Das Label des input-traffic-Freeze-Buttons lautet nun **„Freeze & append"** (`冻结追加` / `凍結して追加` /
  `동결 후 추가`), das Fortsetzungs-Label **„Resume & append"** (`恢复追加` / `再開して追加` /
  `재개 후 추가`) — es friert die Runde und behält die eingereihten Nachrichten, vom Pause-Button zu unterscheiden.
- **Der Pause-Button ist jetzt ein Umschalter**: „Session pausieren" / „Session fortsetzen" (kein deaktivierter Grauzustand mehr).
  „Session pausieren" ruft die neue `stepPause`-Aktion auf, die die Session an der **nächsten
  Step-Grenze** hält (Step 1 eingeschlossen, unabhängig von Spitzenzeit oder Provider); „Session fortsetzen" ruft
  `stepResume` auf. Neue Port-Methode `sessionGuard.stepPause(sessionId)`.
- **SSE-Push**: die neue Route `GET /session-guard/events?session=<id>` pusht Step-Gate-Zustandsänderungen im
  Moment des Geschehens, sodass automatische Spitzenzeiten-Halte den Button ohne Poll-Wartezeit auf
  „Session fortsetzen" umschalten; der 10-s-Poll von `/session-guard/state` bleibt als Rückfall. `/state` meldet nun
  `paused.manual` und `stepGate.manual`.
- **Stil an den Composer-Button von input-traffic angeglichen** (24 px Höhe, 6 px Radius, 12 px Schrift, dieselben
  border/hover/pressed-Tokens), für den Pause-Button wie für das Status-Badge; Stile werden einmalig über
  `<style data-plugin-css="session-guard-client">` injiziert.

## Unveröffentlicht

### Hinzugefügt

- **Zweidimensionale Wache für offizielle Quellen (Spitze × Ziel-Provider).** Spitzenzeiten blockieren nun nur
  Anfragen, deren Zielroute eine offizielle DeepSeek-Quelle ist; lokale/Drittanbieter-Provider laufen weiter.
  Urteilsfolge: explizite `officialProviders`-ID-Liste → live `baseURL`-Endpunkt →
  Katalog-eingebauter Endpunkt (pi-ais `deepseek`) → eingebaute ID (`deepseek-official`); jedes Urteil meldet
  `matchedBy`. Neue Module: `src/provider.js` (pur), `src/provider-directory.js`,
  `src/deferrals.js`, `src/request-guard.js`, `src/targets.js`, `src/wiring.js`.
- **Anfragegenaues Sicherheitsnetz (`agent/request`).** Deckt nach Spitzenbeginn gestartete Sessions und
  unterwegs auf eine offizielle Quelle umgeschaltete Sessions ab — der 30-s-Tick behandelte nur Sessions, die bei der
  Umstellung bereits `running` waren. Der Standard-`hold`-Modus suspendiert die Anfrage ohne Fehler
  und gibt sie exakt zum Spitzenende frei (`msUntilOffPeak`); der `error`-Modus wirft einen erkennbaren
  `PEAK_DEFERRED`-Fehler und vermerkt eine Verzögerung für die Fortsetzung außerhalb der Spitzenzeit.
- **Neue Einstellungen**: `providerGuard`, `officialProviders`, `officialBaseURLs`, `deferredResume`,
  `deferredResumeText`, `deferredMode`, `deferredMaxHoldMs` (Standard 6 h), `guardSubagents`.
- **Neue Routen**: `GET /session-guard/provider?provider=<id>` (Urteilsdiagnostik);
  `/session-guard/status` meldet nun `providerGuard` / `held` / `deferred`;
  `/session-guard/state` meldet das letzte Ziel der Session.
- **Drift-Wache** `tools/check-api-drift.ps1`, die das Vorhandensein der benötigten APIs auf
  `dsh-v0.1.1-rc.2` / `dsh-v0.1.2-rc.1` / `dsh-v0.1.3-alpha.2` / `dsh-v0.1.5-alpha.1` behauptet.

### Geändert

- **DSH-Dualversions-Unterstützung (0.1.0-rc.7 … 0.1.2-rc.1).** Ein Artefakt deckt nun sowohl
  `dsh-v0.1.1-rc.2` als auch `dsh-v0.1.2-rc.1` ab. Die Dual-Lektüre der `tool/result`-Call-ID
  (`content[].toolCallId` zuerst, `source.callId` als Rückfall — beide Formen tauchen in Replay-Logs
  beider Versionen auf) ist in das abhängigkeitsfreie `src/tool-call-id.js` mit Unit-Tests ausgelagert.
  `dsh.client.inject` benennt nicht mehr `@deepseek-ai/dsh-client-runtime` (in 0.1.2 entfernt) oder
  `@deepseek-ai/dsh-client-ui-slots` (keine dynamische Client-Zeile); Peer-Bereiche erweitert auf
  `>=0.1.0-rc.7 <0.2.0-0`, das entfernte Paket gestrichen. `engines.dsh` und eine
  Versionskompatibilitätstabelle im README (ZH/EN) ergänzt.
- **Einstellungsoberfläche bleibt auf der Schnittmengen-API**: nur `settings.register` + `settings.get`;
  `installSection` (0.1.2+) und das entfernte `installSettingsSection` werden nie benutzt. Optionale
  APIs (`model/selection`, `llm.listConfigurableProviders`, `settings.get`) werden per Feature-Sonde abgefragt und
  degradieren, statt zu werfen.
- **`src/retry.js` schaltet nur beim exakten `PEAK_DEFERRED`-Signal kurz.** 429 / `RATE_LIMIT` /
  `TRANSPORT` / Timeout-Fehler bleiben transient, sodass DSHs globales Retry (`dsh-llm-retry` auf
  `agent/request-error`) und die eigene Retry-Semantik dieses Plugins unverändert bleiben. `dsh-llm-retry`
  selbst wird nie berührt.
- Das Badge unterscheidet „Peak · nur offiziell" von „Peak · alle pausiert".

## 0.1.4 — 2026-09-09

### Geändert

- **Öffentliche Beta-Veröffentlichung** der Dualversions-Linie (`0.1.4-beta.1`): Versionsmetadaten, README-
  Kompatibilitätstabelle und Paketmetadaten für den Beta-Kanal ausgerichtet.

## 0.1.3 — 2026-09-09

### Behoben

- **package.json-Kodierung wiederhergestellt**: die Beschreibung war korrumpiert (GB2312-Bytes als UTF-8 gelesen); mit korrektem chinesischem Text neu geschrieben.
- **Fehlende Metadaten**: die Felder `repository` und `homepage` ergänzt.
- **peerDependencies korrigiert**: die exakte `dsh-llm`-Festlegung entfernt; `cordis`, `dsh-client-runtime`, `dsh-client-locale`, `dsh-client-ui-settings`, `dsh-client-ui-slots` als optionale Peers passend zu `dsh.client.inject` ergänzt.
- `dsh.plugin.json`-Manifest ergänzt.

## 0.1.2 — 2026-08-28

### Behoben

- **Spitzenzeit-Zeitzone korrigiert**: 峰谷判定固定北京时间 (`BILLING_TIMEZONE`), Wochenerkennung mit konfigurierter Zeitzone.

## 0.1.1 — 2026-08-24

### Hinzugefügt

- **Automatische Backend-Wiederholung (D9)**: transiente `turn/end`-Fehler (error/429/max-tokens) lösen eine `followup(retryText)`-Fortsetzung mit adaptivem Backoff aus; permanente Fehler (Auth/Guthaben/Modell/Kontextlimit) stoppen; Benutzereingriff oder erfolgreiche Runde setzt den Zähler aufeinanderfolgender Fehler zurück.
- **Ausweichen bei Freeze/Gate**: die Wiederholung überspringt, wenn `isFrozen(sessionId)` wahr ist (queueLocked / paused / taskControl paused), umgeht das Session-Gate nie.

### Geändert

- Der redundante Port `sessionGuard` legt nun `state(sessionId)` offen und liefert `{ queueLocked, lockReason, paused, taskControlAvailable, taskControl }`.
- Die HTTP-Route `GET /session-guard/diag` liefert Laufzeitdiagnostik inklusive Retry-Zustand.

### Behoben

- Die Wochenerkennung nutzt nun `Intl.DateTimeFormat` mit der konfigurierten Zeitzone statt des nackten `getUTCDay()`, was einen 8-Stunden-Grenzfehler für die Pekinger Zeitzone behebt.

## 0.1.0 — 2026-08-18

### Hinzugefügt

- Erste Veröffentlichung: automatische Spitzenzeiten-Pause (global), Wochenendmodus, Session-weise Freeze/Resume über den redundanten Port `sessionGuard` + RPC-Brücke, eigenes Session-Gate (`agent.cancel keepInbox + goals.pause + session/event sichere Grenze + followup-Fortsetzung`), Einstellungsbereich (Einstellungen → Plugins → session-guard).

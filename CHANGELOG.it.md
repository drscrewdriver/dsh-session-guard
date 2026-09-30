# Registro delle modifiche

Tutte le modifiche significative di `dsh-session-guard` vengono annotate qui. Le versioni seguono il semver.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)
- [Changelog en français](./CHANGELOG.fr.md)
- [Changelog auf Deutsch](./CHANGELOG.de.md)
- [Changelog in italiano](./CHANGELOG.it.md)
- [Changelog in russo](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)

## 4.0.0 — 2026-09-29

### Modificato
- **Adattamento alla linea DSH 0.2.0**: `engines.dsh` e i quattro peer `@deepseek-ai/dsh-client-*` passano a `>=0.2.0-rc.1 <0.2.1-0` (al posto degli intervalli 0.1.7); dist-tag npm `dsh-0.2.0`; versione del manifest allineata a `4.0.0`. La superficie API lato plugin (manifest / settings / HMR / slot / sessione v4) è invariata rispetto alla 0.1.7 — nessuna modifica al codice di runtime.
- Floor del peer `@deepseek-ai/cordis` allineato a `^4.0.4` (i pacchetti UI host di 0.2.0-rc.1 dichiarano `~4.0.4`; il precedente `^4.0.1` lo accettava ma indicava un floor troppo basso).

### Corretto
- `src/client/family-section.tsx` è entrato nel controllo di versione (dalla 3.2.x esisteva solo nell'albero di lavoro, quindi un checkout pulito non riusciva a compilare).
- eslint flat config: eliminata la regola core `no-unused-vars` — segnalava erroneamente i parametri nelle firme dei tipi TS; la variante typescript-eslint resta, e la baseline di lint torna verde.
- I gate statici di source-kind v4 (`tests/source-kind.test.mjs`) sono ora tracciati ed eseguiti in `npm test` (248 test).

## 3.2.4 — 2026-09-27

### Corretto
- **Adattamento al formato sessione v4 (host >= 0.1.7-rc.1)**: i tre percorsi di scrittura della sessione non usano più la firma ritirata `source: { kind: 'plugin', plugin: 'session-guard' }`, che l'host v4 respinge con `SessionFormatError` (fallisce l'intero turno). Tutti e tre ora usano il kind posseduto dal produttore:
  - iniezione degli avvisi di ripresa differita (`src/wiring.js`);
  - iniezione degli avvisi di retry automatico (`src/retry.js`);
  - followup di pausa-riprendi (`src/pause-gate.js`, ```kind: `plugin:${pluginId}````).
  - **Adattamento nativo v4 del tool-result (N1)**: `findToolOutcome` in `src/pause-gate.js` ora legge per prima cosa il messaggio v4 di prima classe `role:'tool'` (`toolCallId`/`isError` al livello più alto del messaggio); il percorso v3 a blocchi `tool-result` resta come fallback storico. Senza questo, un tool fallito al momento della pausa veniva riportato come completato alla ripresa («non rieseguire») — una decisione sbagliata silenziosa. `src/tool-call-id.js` legge prima l'id nativo al livello più alto; note d'intestazione datate 0.1.1/0.1.2 corrette verso la tabella delle tre forme per generazione.
  `form` e tutti gli altri campi sono invariati; la migrazione v3→v4 dell'host stesso promuove le righe storiche esistenti, quindi nessun dato storico viene riscritto. Prova: `@deepseek-ai/dsh-session-format-v3-to-v4@0.1.7-rc.2` valida solo che `source.kind` sia non vuoto e diverso da `'plugin'`.

## 0.4.0 — 2026-09-18 (versione errata; sostituita dalla 3.0.0)

### Corretto

- **Identità di versione.** Questa linea è stata pubblicata come `0.4.0` mentre `dsh.plugin.json` e questo
  registro indicavano già `3.0.0` — un unico artefatto con due numeri di versione. `package.json` ora è
  a `3.0.0`, quindi versione del pacchetto, versione del manifest e registro coincidono. `0.4.0` resta
  qui come traccia storica perché le versioni npm sono immutabili; il `dist-tag dsh-0.1.5` dovrebbe essere
  ripuntato su `3.0.0` una volta pubblicata.
- **Documentazione.** README/INSTALL (zh/en/ja/ko) non descrivono più la linea gemella come residente su `main`.
  Il branch di rilascio della linea 0.1.2 è **`legacy/0.1.2`** (dist-tag npm `dsh-0.1.2`, versione `0.3.1`);
  `main` è congelato a `0.2.0-beta.1`. Il frammento di branch duplicato nel comando di installazione di
  INSTALL.zh/ja/ko è corretto, i comandi di installazione con dist-tag esplicito sono documentati, e «2.x / 3.x»
  è ora contrassegnato come **soprannome di linea** anziché numero di versione.

### Note

- **Nessuna modifica al sorgente** rispetto a `3.0.0`; `0.4.0` è una pubblicazione solo di pacchettizzazione dello stesso albero.

## 3.0.0 — 2026-09-14

### Modificato

- **Linea dedicata a DSH v0.1.5-rc.2 (`compat/0.1.5`).** Gli intervalli di `engines.dsh` e dei peer
  `dsh-client-*` si restringono a `>=0.1.5-rc.2 <0.2.0-0` (il matching semver stretto delle prerelease fa sì che il
  vecchio intervallo `>=0.1.0-rc.7` non corrispondesse mai a `0.1.5-rc.2`); `dsh.plugin.json` ottiene `engines.dsh`.
  La linea 2.x / 0.2.x su `main` continua a servire DSH 0.1.0-rc.7 … 0.1.2-rc.1.
- **`session.events` → `snapshotEvents()`.** DSH 0.1.5 ha rimosso l'accessore ad array `session.events`
  (compatibility-guide §20.3). `pause-gate.js` ora legge gli eventi di sessione tramite un
  helper a doppio percorso: prima `snapshotEvents()`, il vecchio array `events` come fallback difensivo,
  `null` (fail-open) quando nessuno dei due esiste. Riguarda solo `findToolOutcome` e
  `lastUserPrompt`; il matching per tipo di evento è invariato.

### Invariato

- Zero modifiche su ogni altra giunzione di integrazione: la route a prefisso webServer auto-ospitata
  (`/session-guard/rpc`), `settings.register`, lo slot `settings.plugin.item`, le iniezioni client e
  `llm.listConfigurableProviders()` sono tutti verificati intatti rispetto al bundle 0.1.5-rc.2 pubblicato
  (`tools/check-api-drift.ps1`, 12/12 asserzioni richieste).

### In sospeso

- Smoke test dal vivo su un host DSH 0.1.5-rc.2 reale (stesso stato della linea 0.1.5 del perm-gate).

## 0.2.0-beta.2 — 2026-09-13

### Corretto (compat DSH 0.1.5 — branch `compat/0.1.5`)

- **Accodamento della ripresa a doppio percorso.** DSH 0.1.5 trasforma l'Inbox in una proiezione in sola
  lettura dell'agent-loop, quindi `agent.followup` potrebbe non esistere più. Il flusso di ripresa ora prova
  prima `agent.followup`, poi ripiega su `agent.send`, e degrada a un warn (senza mai lanciare)
  quando né l'uno né l'altro è disponibile — un accodamento fallito non può più rompere la ripresa.
- **I messaggi di ripresa portano `source.form: 'instructions'`** secondo il contratto delle sorgenti dei
  messaggi `ContextFormed` di 0.1.5 (`kind: 'plugin'` è un kind integrato; le versioni precedenti di DSH ignorano
  il campo extra).
- **`webServer.register` è avvolto in try/catch**: un errore di registrazione di route ora registra un
  errore nei log invece di uscire da `apply` con un'eccezione e rompere il caricamento dei plugin dell'host.
- Verificato contro il sorgente 0.1.5-rc.2: il contratto `WebRoute` (exact/prefix + SSE) è
  invariato, quindi i percorsi client `fetch('/session-guard/...')` non necessitano del prefisso `/api`.

## 0.2.0-beta.1 — 2026-09-10

### Aggiunto

- **Gate a livello di step (`agent/pre-step`).** Durante le ore di punta il turno ora viene trattenuto **prima**
  della richiesta al modello del prossimo step invece di essere interrotto a un confine di turno: la sessione continua
  fino al prossimo `agent/pre-step`, dove il gate la trattiene (impostazione `stepLevelPause`, attiva per
  impostazione predefinita). Il turno si riprende **sul posto** fuori punta — nessun messaggio followup necessario. Condizioni di trattenuta:
  punta (ora di Pechino) + non weekend + `step > 1` + provider di destinazione ufficiale (`providerGuard`) +
  non trattenuta a livello di richiesta + non bypassata in questa finestra di punta. Nuovo modulo `src/step-gate.js` (puro
  `decideStepHold` + motore hold / release / abort / timeout).
- **Porta `stepResume` + RPC + `/resume`.** `sessionGuard.stepResume(sessionId, {bypass})`,
  `POST /session-guard/rpc {action:'stepResume'}` e `/resume` rilasciano tutti il gate; una ripresa
  manuale cessa inoltre di governare quella sessione per il resto della finestra di punta.
- **Escalation a scadenza.** `stepGateTimeoutMs` (300000 predefinito) rilascia il gate e scala a una
  pausa **force** a livello di turno, così una punta lunga né va in deadlock né gocciola uno step ogni cinque minuti.
- **Pulsante «⏸ Sospendi sessione»** (client, slot `conversation.input.right`, id `session-guard-pause`,
  order 20 — alla sinistra del pulsante di congelamento di input-traffic). Interroga `/session-guard/state` una volta al secondo,
  resta disabilitato finché nulla è trattenuto, e chiama `stepResume` quando lo è. Il badge di stato si è spostato a
  order 40 e ora riporta il numero di sessioni trattenute a livello di step.
- **Nuove impostazioni**: `stepLevelPause`, `stepGateTimeoutMs`.
- **Nuovi stati**: `GET /session-guard/state` ora restituisce `paused: { step, turn }` e
  `stepGate: { held, since, bypass }`; `/status` restituisce `stepHeld`; `/diag` restituisce `stepGate`.
  Il `state().paused` della porta di servizio resta booleano per compatibilità (nuovo campo `pausedStep`).

### Corretto

- **Deadlock tra uno step trattenuto e una pausa a livello di turno.** `pauseTask` / `resumeTask` /
  `cancelTask` ora rilasciano prima il gate di step: una trattenuta di step sta su `agent/pre-step`, dove non può mai
  arrivare un `assistant/message` o un `tool/result`, quindi una pausa `safe` aspettava per sempre e
  non persisteva mai `paused`.

### Modificato

- **L'ingresso in punta non interrompe più i turni in corso** quando `stepLevelPause` è attivo (`onEnterPeak` arma
  il gate di step invece di chiamare `stopNextTurn`); disattivo, il comportamento precedente a livello di turno è invariato.
- L'etichetta del pulsante di congelamento di input-traffic ora è **"Freeze & append"** (`冻结追加` / `凍結して追加` /
  `동결 후 추가`), e quella di ripresa **"Resume & append"** (`恢复追加` / `再開して追加` /
  `재개 후 추가`) — congela il turno e conserva i messaggi in coda, distinto dal pulsante di pausa.
- **Il pulsante di pausa è ora un interruttore**: "Sospendi sessione" / "Riprendi sessione" (niente più stato grigio disabilitato).
  Cliccare "Sospendi sessione" chiama la nuova azione `stepPause`, che trattiene la sessione al **prossimo
  confine di step** (step 1 compreso, indipendentemente da punta o provider); "Riprendi sessione" chiama
  `stepResume`. Nuovo metodo della porta `sessionGuard.stepPause(sessionId)`.
- **Push SSE**: la nuova route `GET /session-guard/events?session=<id>` notifica le variazioni di stato del
  gate di step nel momento stesso in cui avvengono, così le trattenute automatiche di punta invertono il pulsante su
  "Riprendi sessione" senza aspettare un sondaggio; il sondaggio `/session-guard/state` ogni 10 s resta come fallback. `/state` ora riporta
  `paused.manual` e `stepGate.manual`.
- **Stile allineato** al pulsante composer di input-traffic (24 px di altezza, 6 px di raggio, font 12 px, stessi
  token border/hover/pressed) sia per il pulsante di pausa sia per il badge di stato; gli stili sono
  iniettati una sola volta tramite `<style data-plugin-css="session-guard-client">`.

## Non rilasciato

### Aggiunto

- **Guardia bidimensionale sulle sorgenti ufficiali (punta × provider di destinazione).** Le ore di punta ora bloccano solo
  le richieste la cui route di destinazione è una sorgente ufficiale DeepSeek; i provider locali/di terze parti continuano
  a girare. Ordine di verdetto: lista esplicita di id `officialProviders` → endpoint `baseURL` dal vivo →
  endpoint integrato nel catalog (il `deepseek` di pi-ai) → id integrato (`deepseek-official`); ogni verdetto
  riporta `matchedBy`. Nuovi moduli: `src/provider.js` (puro), `src/provider-directory.js`,
  `src/deferrals.js`, `src/request-guard.js`, `src/targets.js`, `src/wiring.js`.
- **Rete di sicurezza a livello di richiesta (`agent/request`).** Copre le sessioni avviate dopo l'ingresso in punta e
  le sessioni spostate su una sorgente ufficiale durante l'esecuzione — il tick di 30 s gestiva solo le sessioni già
  `running` al momento della transizione. La modalità `hold` predefinita sospende la richiesta senza errore
  e la rilascia all'istante esatto fuori punta (`msUntilOffPeak`); la modalità `error` lancia un fallimento riconoscibile
  `PEAK_DEFERRED` e registra un rinvio per la ripresa fuori punta.
- **Nuove impostazioni**: `providerGuard`, `officialProviders`, `officialBaseURLs`, `deferredResume`,
  `deferredResumeText`, `deferredMode`, `deferredMaxHoldMs` (6 h predefinite), `guardSubagents`.
- **Nuove route**: `GET /session-guard/provider?provider=<id>` (diagnostica del verdetto);
  `/session-guard/status` ora riporta `providerGuard` / `held` / `deferred`;
  `/session-guard/state` riporta l'ultima destinazione della sessione.
- **Guardia alla deriva** `tools/check-api-drift.ps1` che asserisce l'esistenza delle API richieste su
  `dsh-v0.1.1-rc.2` / `dsh-v0.1.2-rc.1` / `dsh-v0.1.3-alpha.2` / `dsh-v0.1.5-alpha.1`.

### Modificato

- **Supporto a doppia versione DSH (0.1.0-rc.7 … 0.1.2-rc.1).** Un unico artefatto copre ora sia
  `dsh-v0.1.1-rc.2` sia `dsh-v0.1.2-rc.1`. La doppia lettura dell'id di chiamata `tool/result`
  (`content[].toolCallId` per primo, `source.callId` come fallback — entrambe le forme compaiono nei log di replay delle
  due versioni) è estratta nel `src/tool-call-id.js` privo di dipendenze, con test unitari.
  `dsh.client.inject` non nomina più `@deepseek-ai/dsh-client-runtime` (rimosso in 0.1.2) né
  `@deepseek-ai/dsh-client-ui-slots` (non una riga client dinamica); intervalli dei peer allargati a
  `>=0.1.0-rc.7 <0.2.0-0` e rimosso il pacchetto eliminato. Aggiunti `engines.dsh` e una
  tabella di compatibilità delle versioni nel README (ZH/EN).
- **La superficie delle impostazioni resta sull'API di intersezione**: solo `settings.register` + `settings.get`;
  `installSection` (0.1.2+) e il rimosso `installSettingsSection` non vengono mai usati. Le API opzionali
  (`model/selection`, `llm.listConfigurableProviders`, `settings.get`) vengono sondate come feature e
  degradano invece di lanciare.
- **`src/retry.js` cortocircuita solo il segnale esatto `PEAK_DEFERRED`.** I fallimenti 429 / `RATE_LIMIT` /
  `TRANSPORT` / timeout restano transitori, così il retry globale di DSH (`dsh-llm-retry` su
  `agent/request-error`) e la semantica di retry propria di questo plugin sono invariati. `dsh-llm-retry`
  non viene mai toccato.
- Il badge distingue "punta · solo ufficiale" da "punta · tutto in pausa".

## 0.1.4 — 2026-09-09

### Modificato

- **Rilascio beta pubblico** della linea a doppia versione (`0.1.4-beta.1`): metadati di versione, tabella di compatibilità
  del README e metadati del pacchetto allineati per il canale beta.

## 0.1.3 — 2026-09-09

### Corretto

- **Codifica di package.json ripristinata**: la descrizione era corrotta (byte GB2312 letti come UTF-8); riscritta con il testo cinese corretto.
- **Metadati mancanti**: aggiunti i campi `repository` e `homepage`.
- **peerDependencies corrette**: rimossa la versione esatta bloccata di `dsh-llm`; aggiunti `cordis`, `dsh-client-runtime`, `dsh-client-locale`, `dsh-client-ui-settings`, `dsh-client-ui-slots` come peer opzionali coerenti con `dsh.client.inject`.
- Aggiunto il manifest `dsh.plugin.json`.

## 0.1.2 — 2026-08-28

### Corretto

- **Fuso orario della punta corretto**: 峰谷判定固定北京时间 (`BILLING_TIMEZONE`), rilevamento del weekend con il fuso configurato.

## 0.1.1 — 2026-08-24

### Aggiunto

- **Retry automatico lato backend (D9)**: i fallimenti transitori `turn/end` (error/429/max-tokens) innescano una ripresa `followup(retryText)` con backoff adattivo; i fallimenti permanenti (auth/saldo/modello/limite di contesto) fermano; l'intervento utente o un turno riuscito azzera il conteggio dei fallimenti consecutivi.
- **Cedimento durante congelamento/gate**: il retry salta quando `isFrozen(sessionId)` è vero (queueLocked / paused / taskControl paused), non aggira mai il gate di sessione.

### Modificato

- La porta ridondante `sessionGuard` ora espone `state(sessionId)` che restituisce `{ queueLocked, lockReason, paused, taskControlAvailable, taskControl }`.
- La route HTTP `GET /session-guard/diag` restituisce diagnostica di runtime comprensiva dello stato del retry.

### Corretto

- Il rilevamento del weekend ora usa `Intl.DateTimeFormat` con il fuso configurato invece del nudo `getUTCDay()`, correggendo un bug di confine di 8 ore per il fuso di Pechino.

## 0.1.0 — 2026-08-18

### Aggiunto

- Rilascio iniziale: pausa automatica in punta (globale), modalità weekend, congelamento/ripresa per sessione tramite la porta ridondante `sessionGuard` + ponte RPC, gate di sessione proprietario (`agent.cancel keepInbox + goals.pause + session/event confine di sicurezza + ripresa via followup`), pannello impostazioni (Impostazioni → Plugin → session-guard).

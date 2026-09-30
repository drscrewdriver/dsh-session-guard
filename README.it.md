<p align="center">
  <strong>Gate di sessione automatico nelle ore di punta: modalità weekend + pausa automatica in punta + giudizio bidimensionale sulle sorgenti ufficiali + congelamento a livello di sessione + retry automatico lato backend</strong>
</p>
<img width="832" height="182" alt="00c4b89a-b026-4bf1-a358-a068e80d2da7" src="https://github.com/user-attachments/assets/31a8836f-0fe0-4043-948a-f0865bb1b3bb" />

<p align="center">
  <a href="README.en.md">English</a> · <a href="README.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <strong>Italiano</strong> · <a href="README.ru.md">Русский</a> · <a href="README.es.md">Español</a>
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
- [README in russo](./README.ru.md)
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
- [Changelog in russo](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)

> **Nota di compatibilità:** la v0.1.1 include già i dizionari giapponese (`ja`) e coreano (`ko`), ma i rilasci ufficiali attuali di DSH espongono tramite `LocaleRuntime` solo `zh` e `en`. Su un DSH originale, selezionare `ja` o `ko` fallisce con `locale "<id>" is not registered`. Sarà necessario attendere che il DSH ufficiale aggiunga i locale ID corrispondenti. Gli utenti avanzati possono mantenere un fork di DSH per estenderlo.

> **▼ Compatibilità delle versioni DSH**
>
> | Versione DSH | Caricamento | Registrazione impostazioni | Eventi di sessione / gate | Metà client |
> | --- | --- | --- | --- | --- |
> | 0.1.0-rc.7 ~ 0.1.1-rc.x | ➖ fuori da questa linea (versioni storiche precedenti a `legacy/0.1.2`) | `ctx.settings.register(ns, schema, { base })` | ✅ forma identica | ✅ nessun import di valori di piattaforma |
> | 0.1.2-alpha.2+ / 0.1.2-rc.1 | ➖ fuori da questa linea → usare `legacy/0.1.2` (npm `@dsh-0.1.2`) | `register` mantenuto (in aggiunta `installSection`) | ✅ forma identica | ✅ nessun import di valori di piattaforma |
> | **0.2.0-rc.1+** | ✅ (**questa linea**, dist-tag `dsh-0.2.0`, npm `4.0.0`) | dichiarativo: i campi `.volatile()` del Config vengono proiettati in form dall'host, `register` rimosso | ✅ eventi letti tramite il doppio percorso `snapshotEvents()` | ✅ scheda impostazioni del client passata a `configForms` |
> | 0.1.7-rc.1+ | ✅ (branch `compat/0.1.7`, dist-tag `dsh-0.1.7`) | dichiarativo: i campi `.volatile()` del Config vengono proiettati in form dall'host, `register` rimosso | ✅ eventi letti tramite il doppio percorso `snapshotEvents()` | ✅ scheda impostazioni del client passata a `configForms` |
> | 0.1.5-rc.2 | ✅ (branch `compat/0.1.5`, dist-tag `dsh-0.1.5`) | `register` ancora presente (namespace a stringa) | ✅ eventi letti tramite il doppio percorso `snapshotEvents()` | ✅ |
>
> **Identità di questa linea**: branch `compat/0.2.0`, numero di versione npm **`4.0.0`** (semver), dist-tag **`dsh-0.2.0`**.
> I `engines.dsh` di `package.json` e `dsh.plugin.json` e i quattro peer `@deepseek-ai/dsh-client-*`
> sono unificati a `>=0.2.0-rc.1 <0.2.1-0`; il floor del peer `@deepseek-ai/cordis` è allineato al `^4.0.4` della linea host.
> In passato il README usava «2.x / 3.x» come **nomi in codice di linea**: era una convenzione narrativa, **non numeri di versione
> scaricabili dal registry** — fare riferimento sempre alle versioni npm `0.3.1` (linea 0.1.2), `3.0.0`/`3.0.1` (linea 0.1.5),
> `3.2.4` (linea 0.1.7) e `4.0.0` (linea 0.2.0).
>
> **Adattamento 0.2.0 (branch compat/0.2.0, npm 4.0.0)**:
> la superficie API del plugin usata da questo plugin (manifest/settings/HMR/slot/sessione V4) in 0.2.0-rc.1 è del tutto compatibile con 0.1.7;
> l'adattamento è un semplice cambio di generazione dei metadati (peer/engines/dist-tag/versione 4.0.0). Correzioni ingegneristiche allineate insieme alla base:
> ① `src/client/family-section.tsx` è entrato nel controllo di versione (prima esisteva solo nell'area di lavoro locale, un checkout pulito non riusciva a compilare);
> ② la configurazione eslint elimina la regola core `no-unused-vars` che segnalava erroneamente i parametri nelle firme dei tipi TS, la baseline di lint torna tutta verde;
> ③ i gate statici sulla firma dei percorsi di scrittura v4 (`tests/source-kind.test.mjs`) entrano in questa linea insieme alla base;
> ④ il peer `@deepseek-ai/cordis` è allineato a `^4.0.4` (i pacchetti UI host di 0.2.0-rc.1 dichiarano `~4.0.4`; il precedente `^4.0.1` non era in conflitto ma aveva un floor troppo vecchio).
>
> **Punto di approdo delle altre linee**: per host DSH `0.1.2-rc.x` usare il branch **`legacy/0.1.2`** (dist-tag npm
> `dsh-0.1.2`, versione `0.3.1`). **`main` è congelato a `0.2.0-beta.1` e non è il branch di rilascio della linea 0.1.2.**
> Per host DSH `0.1.0-rc.7` ~ `0.1.1-rc.x` usare versioni storiche ≤ `0.1.2`.
> Definizione delle sorgenti dei campi:
> `mine-dsh-plugins/improve-dsh-plugins/DSH-PLUGIN-VERSION-DISTRIBUTION-STRATEGY.md` §2.2.
>
> **Adattamento 0.1.5 (branch compat/0.1.5, npm 3.0.0)**:
> ① doppio percorso per `agent.followup` — 0.1.5 trasforma l'Inbox in una proiezione in sola lettura dell'agent-loop; se `followup`
> non esiste più si ripiega su `agent.send`, e se non esiste nessuno dei due si degrada con un warn senza lanciare errori (rete di sicurezza per la ripresa);
> ② i messaggi di ripresa aggiungono a `source` il campo `form: 'instructions'` (contratto ContextFormed di 0.1.5, ignorato dalle versioni precedenti);
> ③ `webServer.register` è avvolto in try/catch: un errore di registrazione viene solo registrato nei log senza far crashare il caricamento dei plugin dell'host;
> ④ 0.1.5 rimuove l'accessore ad array `session.events`; la lettura degli eventi passa per `snapshotEvents()` come percorso principale +
> fallback sull'array storico (riguarda solo i due percorsi ausiliari `findToolOutcome` / `lastUserPrompt`, il matching per tipo di evento resta invariato).
> Verificato che il contratto `WebRoute` di 0.1.5 (exact/prefix + SSE) è invariato: il client
> `fetch('/session-guard/...')` non necessita del prefisso `/api`.
> La tabella di compatibilità qui sotto copre due generazioni di API (0.1.1 / 0.1.2); questa linea rivendica solo la riga 0.1.5.
> `session/event`, `agent.cancel`, `goals.pause`,
> `agent.followup`, `commands.register`, `timer.interval`, `webServer.register`,
> `agent/request`, `llm.listConfigurableProviders`, `settings.register/get` hanno firme
> identiche tra `dsh-v0.1.1-rc.2` e `dsh-v0.1.2-rc.1` (questa linea è verificata fino a `dsh-v0.1.5-rc.2`);
> l'unico punto che richiede una doppia lettura è la forma dell'id di chiamata registrato da `tool/result` (`content[].toolCallId` in priorità,
> `source.callId` come fallback), estratto in `src/tool-call-id.js` con test unitari — nei log di replay di entrambe le versioni possono comparire entrambe le forme.
> Dal 0.1.5 l'accessore ad array `session.events` è rimosso; questa linea legge tramite `snapshotEvents()` (fallback sull'array storico conservato),
> con effetto solo sui due percorsi ausiliari `findToolOutcome` / `lastUserPrompt`.
> L'evento `model/selection` esiste **solo dal 0.1.2**, serve solo ad accelerare il cambio di modello e va sempre sondato come feature; la superficie delle impostazioni usa solo
> l'intersezione `register` + `get` (mai `installSection` / il rimosso `installSettingsSection`).
> Script di guardia alla deriva: `tools/check-api-drift.ps1` (questa linea verifica per impostazione predefinita contro `dsh-v0.1.5-rc.2` l'esistenza delle interfacce richieste).

> Mette in pausa automaticamente le sessioni in esecuzione durante le ore di punta e le riprende automaticamente fuori punta/nei weekend; insieme al pulsante di congelamento di input-traffic realizza il blocco **a livello di sessione**; il **retry automatico** del backend lascia il passo durante congelamento/gate. Il nucleo si basa su un **gate di sessione sviluppato internamente** (`agent.cancel keepInbox + goals.pause + session/event confine di sicurezza + ripresa via followup`) e non dipende più da dsh-task-control.

Plugin cordis assemblato con il comando `dsh plugin` e una patch al bundle — senza modificare il codice sorgente di dsh e senza PR.

> 💡 **Perché è consigliato**: DeepSeek dal 2026-08-17 applica la **fatturazione a ore di punta/fuori punta** — nelle ore di punta (ora di Pechino 9:00-12:00, 14:00-18:00) il prezzo unitario è **2 volte** quello delle ore fuori punta (incluso mezzogiorno, notte, weekend e festivi). Questo plugin mette in pausa automaticamente le sessioni in esecuzione durante la punta e le riprende automaticamente fuori punta: le esecuzioni lunghe in fascia scaglionata possono risparmiare fino al **50 %**; il congelamento manuale (col pulsante di input-traffic) permette un controllo ancora più preciso, sessione per sessione.

## Panoramica delle funzionalità

- **Modalità weekend**: riconosce i weekend (tramite `Intl.DateTimeFormat` con il fuso orario configurato, evitando il classico bug di 8 ore del `getUTCDay()` nudo al confine del fuso di Pechino) → nel weekend si ignorano punta e fuori punta e si gira liberamente.
- **Pausa automatica in punta (globale)**: all'ingresso in punta (e se non è weekend) mette in pausa automaticamente tutte le sessioni root `running`; fuori punta riprende tutto automaticamente — **interruttore globale, nessun intervento manuale**.
- **Giudizio bidimensionale sulle sorgenti ufficiali (providerGuard)**: nelle ore di punta si blocca **solo se la destinazione della richiesta è una sorgente ufficiale DeepSeek**; con provider locali/di terze parti (es. `local-35b`) si continua normalmente, senza subire il gate di punta. Ordine di giudizio = lista esplicita di id → endpoint `baseURL` → endpoint predefinito del catalog → id incorporato.
- **Rete di sicurezza a livello di richiesta + coda differita**: le sessioni avviate dopo l'ingresso in punta o passate nel frattempo a una sorgente ufficiale vengono intercettate dalla guardia a livello di richiesta `agent/request` (predefinito `hold`: la richiesta è sospesa senza errori e rilasciata automaticamente fuori punta).
- **Congelamento / ripresa a livello di sessione**: porta ridondante `sessionGuard` + `POST /session-guard/rpc`, collegato sessione per sessione tramite il pulsante di congelamento di input-traffic; fornisce anche i comandi manuali `/pause /resume /cancel`.
- **Retry automatico lato backend (D9)**: i fallimenti transitori di turn/end (error/429/max-tokens) vengono ripresi automaticamente con backoff adattivo; i fallimenti permanenti si fermano; **lascia il passo durante congelamento/gate**, non aggira mai il gate di sessione.
- **fail-open**: gate di sessione interno non disponibile, session-guard non installato, servizio delle impostazioni assente — in tutti i casi degradazione silenziosa, mai un crash per colpa di una dipendenza.

## Anteprima dell'interfaccia

Screenshot di un'esecuzione reale (Windows, dsh web) — modalità weekend attiva:

<figure>
  <img style="max-width:100%" alt="Barra di controllo di stato nell'area di input: il pulsante «Weekend» attivo è evidenziato (quando la modalità weekend è attiva si ignorano punta e fuori punta e si gira liberamente), accanto il pulsante «Congela sessione» (con input-traffic), il livello di pensiero DeepSeek-V4-Flash e i controlli di invio, in basso barre di stato con turni/passi, tempo LLM, hit rate della cache e altro" src="assets/高峰低峰周末提醒-周末状态.png" />
  <figcaption>Modalità weekend attiva: il badge «weekend» nell'area di input è evidenziato, accanto a «Congela sessione»; nel weekend si ignorano punta e fuori punta e le sessioni girano liberamente.</figcaption>
</figure>

## Installazione

```bash
# Host DSH 0.1.5-rc.x (questa linea, dist-tag dsh-0.1.5)
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5

# oppure direttamente dal branch git
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.5

# Gli host DSH 0.1.2-rc.x devono usare la linea 0.1.2
dsh plugin --profile web add dsh-session-guard@dsh-0.1.2
```

`compat/0.1.5` è la linea dedicata a DSH `0.1.5-rc.x`, numero di versione npm **`3.0.0`**; per host DSH `0.1.2-rc.x` usare
il branch **`legacy/0.1.2`** (dist-tag npm `dsh-0.1.2`, versione `0.3.1`). **`main` è congelato a `0.2.0-beta.1`,
non è il branch di rilascio della linea 0.1.2.**

> ⚠️ Non affidarsi al nome di pacchetto nudo `dsh-session-guard`: il tag `latest` di npm non può servire simultaneamente due linee di
> versione mutuamente esclusive (i loro `engines.dsh` sono esclusivi secondo le regole semver delle prerelease) — occorre indicare sempre esplicitamente il dist-tag.

Dopo l'installazione riavviare dsh web e ricaricare la pagina.

## Impostazioni (Impostazioni → Plugin → session-guard, semplici interruttori)

| Interruttore | Predefinito | Descrizione |
|---|---|---|
| `enabled` | on | **Pausa/congelamento automatico in punta delle sessioni**: mette in pausa automaticamente le sessioni in esecuzione durante le ore di punta |
| `stepLevelPause` | on | **Gate a livello di step**: in punta il gate si chiude **prima** della richiesta al modello del prossimo step (più presto e più economico della pausa a livello di turno); off si ripiega sulla pausa a livello di turno |
| `providerGuard` | on | **Giudizio bidimensionale sulle sorgenti ufficiali**: in punta vengono bloccate solo le sorgenti ufficiali DeepSeek, i provider locali/di terze parti girano normalmente |
| `guardSubagents` | on | **Includere le richieste dei sub-agenti**: anche le richieste dei sub-agenti vengono fatturate, bloccate per impostazione predefinita |
| `offPeakAutoResume` | on | **Ripresa automatica fuori punta**: le sessioni in pausa vengono riprese automaticamente fuori punta; off nessuna ripresa automatica a fine punta (serve l'intervento manuale) |
| `weekendMode` | on | **Modalità weekend**: riconosce i weekend → nessuna pausa automatica nel weekend (nel weekend non c'è punta, si gira liberamente) |
| `deferredResume` | on | **Ripresa automatica dopo la punta**: off le richieste/sessioni differite non riprendono automaticamente, serve un `/resume` manuale |
| `queueFallback` | on | Ripiega sulla coda di attesa a blocco quando il gate di sessione interno non è disponibile (fail-open) |
| `retryEnabled` | off | **Retry automatico (backend)**: ripresa automatica dopo fallimenti transitori (off per impostazione predefinita, conservativo) |

Configurazione accessoria:

- `timezone` (predefinito Asia/Shanghai) — fuso usato per il **riconoscimento del weekend** e la visualizzazione del badge; **non influisce sul giudizio punta/fuori punta** (sempre ora di Pechino);
- `peakWindows` (predefinito 09:00–12:00 / 14:00–18:00) — finestre punta/fuori punta in ora di Pechino (UTC+8), in linea con la fatturazione ufficiale DeepSeek;
- `pauseMode` (`safe`/`force`), `pauseReason` (`wait`/`stop`) — modalità di avanzamento della pausa;
- `stepGateTimeoutMs` (predefinito 300000) — timeout di sospensione del gate di step; alla scadenza il gate viene rilasciato e **promosso a pausa a livello di turno** (anti-deadlock, niente «un step ogni 5 minuti» a gocciolio di token);
- Giudizio sulle sorgenti ufficiali: `officialProviders` (id di provider ufficiali aggiuntivi, separati da virgole, priorità massima), `officialBaseURLs` (lista degli host degli endpoint ufficiali, predefinito `api.deepseek.com`);
- Coda differita: `deferredMode` (`hold` sospende in attesa / `error` segnala errore e differisce), `deferredResumeText` (testo di ripresa fuori punta), `deferredMaxHoldMs` (limite di sospensione, predefinito 6 ore, alla scadenza diventa error);
- Parametri di retry: `retryText`, `retryGraceMs`, `retryCooldownMs`, `retryBackoffFactor`, `retryBackoffMaxMs`, `retryMaxConsecutive`.

## Comportamento

### Gate automatico di punta (globale)

- **Ingresso in punta** (e non weekend): con `stepLevelPause` attivo il turno **non viene più interrotto subito** — la sessione corre naturalmente fino al prossimo confine `agent/pre-step`, dove il gate di step si chiude (vedi la sezione seguente); disattivato, su tutte le sessioni root `running` viene chiamato `gate.stopNextTurn` (vera pausa con il gate di sessione interno, oppure ripiego sulla coda di attesa a blocco secondo `queueFallback`);
- **Fine punta / weekend**: prima `releaseAll` per rilasciare gli step sospesi (il turno prosegue sul posto), poi `gate.resume` su **tutte** le sessioni — controllato dall'interruttore `offPeakAutoResume`, disattivato non c'è ripresa automatica a fine punta;
- **Fuso punta/fuori punta**: sempre ora di Pechino (`Asia/Shanghai`), in linea con la base di fatturazione ufficiale DeepSeek, non influenzato dall'impostazione `timezone`;
- Macchina a stati: istanza singola `NORMAL ↔ PAUSED_PEAK` (`scheduler.js`), guidata da un unico tick di 30 s.

### Gate a livello di step (v0.2.0, la chiave del risparmio di token)

Appeso alla waterfall `agent/pre-step`: il turno viene sospeso **prima che avvenga la richiesta al modello del prossimo step**.

- **Condizioni di chiusura** (tutte necessarie): `enabled` + `stepLevelPause` + `step > 1` + punta (ora di Pechino, non weekend) + provider di destinazione ufficiale (`providerGuard`, se disattivato si blocca tutto) + sessione non già trattenuta a livello di richiesta + non bypassata manualmente in questa punta;
- **Perché `step > 1`**: il primo step di un turno è coperto dalla guardia a livello di richiesta, così i due gate non si sovrappongono;
- **Percorsi di rilascio**: ① pulsante «⏸ in pausa (riprendi)» / `POST /session-guard/rpc {action:'stepResume'}` / `/resume` → fa passare lo step corrente e **non blocca più questa sessione per il resto della punta**; ② fine punta → rilascio completo, il turno prosegue sul posto (**followup non necessario**); ③ pulsante di congelamento / `/pause` / `/cancel` → il gate viene rilasciato e si passa alla pausa a livello di turno; ④ abort del `signal` (annullamento utente) → rilascio;
- **Promozione a scadenza**: sospensione oltre `stepGateTimeoutMs` (5 minuti predefiniti) → il gate viene rilasciato e **promosso a pausa force a livello di turno**, con ripresa uniforme fuori punta (niente stallo definitivo, niente gocciolio di token in punta);
- **Stato**: `GET /session-guard/state?session=<id>` restituisce `paused: { step, turn }` e `stepGate: { held, since, bypass }`; il `paused` della porta di servizio `state()` **resta booleano** (compatibilità all'indietro), lo stato step sta in `pausedStep`;
- **Nessuna persistenza**: la sospensione è una Promise nel processo, al riavvio sparisce (evita stati fantasma).

#### Pulsanti «Sospendi sessione / Riprendi sessione» (forniti da session-guard)

Il pulsante «Sospendi sessione» a destra dell'area di input (slot `conversation.input.right`, id `session-guard-pause`, order 20, alla sinistra del «❄ Congela e accoda» di input-traffic):

- non in pausa → «Sospendi sessione», **cliccabile**: il clic chiama `stepPause` e sospende la sessione **prima della richiesta al modello del prossimo step** (senza interrompere lo step corrente; anche lo step 1 viene bloccato, senza condizioni di punta/fuori punta o di provider);
- in pausa → «Riprendi sessione», il clic chiama `stepResume`: fa passare lo step corrente e non blocca più questa sessione per il resto della punta;
- **Push degli eventi**: `GET /session-guard/events?session=<id>` (SSE) notifica **immediatamente** le variazioni di stato del gate di step — quando la punta chiude automaticamente il gate il pulsante passa subito a «Riprendi sessione», senza attendere il polling; in aggiunta un polling di `/session-guard/state` ogni 10 secondi fa da rete di sicurezza (converge anche con SSE non disponibile/disconnesso);
- stile allineato ai pulsanti di input-traffic sulla stessa riga (24 px di altezza / 6 px di raggio / font 12 px / stessi token CSS), con risposte visive all'hover e nello stato di pausa.

### Blocco della sessione (congelamento)

- **Porta ridondante**: `ctx.provide('sessionGuard', service)` — `stopNextTurn(sessionId)` / `resume(sessionId)` / `lockQueue(sessionId)` / `unlockQueue(sessionId)` / `state(sessionId)`;
- **Ponte RPC**: `POST /session-guard/rpc { action, sessionId }` — il pulsante di congelamento di input-traffic chiama `stopNextTurn` / `resume` **sessione per sessione** secondo `sessionId`; ignorato silenziosamente se il plugin non è installato (fail-open D8);
- **Comandi manuali**: `/pause [force|safe] [stop|wait]`, `/resume [confirm] [rerun|skip]`, `/cancel` — agiscono sulla sessione che li invoca (presa da `invocation.agent.id`).

### Retry automatico lato backend (D9)

Ascolta `turn/end` e classifica i fallimenti:

- **Fallimenti transitori** (error/429/max-tokens ecc.) → ripresa automatica `followup(retryText)` con backoff adattivo;
- **Fallimenti permanenti** (autenticazione/saldo/modello/superamento del contesto) → stop;
- **Lascia il passo durante congelamento/gate**: nessun retry quando `isFrozen(sessionId)` è vero (queueLocked / paused / taskControl paused);
- Un intervento dell'utente o un turno riuscito azzera il conteggio dei fallimenti consecutivi.

### Badge di stato (visualizzazione frontend)

A destra dell'area di input compare un badge di stato **puramente indicativo**, che riflette in tempo reale la fase in corso:

| Fase | Testo del badge | Classe CSS | Significato |
|---|---|---|---|
| `peak` (giudizio bidimensionale attivo) | 高峰·拦官方 | `sg-peak` | Ore di punta, vengono bloccate solo le richieste verso le sorgenti ufficiali DeepSeek |
| `peak` (giudizio bidimensionale inattivo) | 高峰·全部暂停 | `sg-peak` | Ore di punta, tutte le sessioni in pausa |
| `off-peak` | 谷时 | `sg-off` | Fuori punta, le sessioni girano normalmente |
| `weekend` | 周末 | `sg-weekend` | Weekend (con modalità weekend attiva), si ignorano punta e fuori punta |

- **Polling**: ogni 15 secondi viene richiesta `GET /session-guard/status`, per il `phase` globale, `providerGuard`, `held`, `deferred`, `stepHeld`;
- **fail-open**: route irraggiungibile, errore di rete o `enabled` disattivato → il badge si nasconde silenziosamente, nessuna sessione ne è influenzata;
- **Indipendente da input-traffic**: il badge è disegnato solo dal client di session-guard e appare **senza dover installare il plugin input-traffic**. input-traffic fornisce solo il pulsante di congelamento, nessuna dipendenza col badge;
- **Tooltip**: al passaggio del mouse mostra `fase · fuso orario · modalità weekend · criterio di giudizio · numeri di sospensioni/differite/sospensioni di step`.

### Criterio di giudizio delle sorgenti ufficiali (providerGuard)

In punta non si fermano le sessioni indiscriminatamente: si valuta prima se «la route che questa richiesta percorrerà davvero è una sorgente ufficiale DeepSeek»:

| Priorità | Base | `matchedBy` | Esempio |
|---|---|---|---|
| 1 | lista esplicita di id `officialProviders` | `explicit` | l'utente dichiara ufficiale il proprio gateway |
| 2 | host della `baseURL` normalizzata in tempo reale | `endpoint` | `deepseek-official` spostato su un relay → **non bloccato** |
| 3 | endpoint predefinito incorporato nel catalog | `endpoint-default` | la route `deepseek` di pi-ai punta per default all'API ufficiale → **bloccato** |
| 4 | lista di id incorporata (`deepseek-official`) | `route-id` | ripiego quando l'endpoint non è leggibile |
| 5 | tutto il resto | `unknown` | non ufficiale, lascia passare |

- **L'endpoint prevale sull'id**: una configurazione chiamata `deepseek-official` ma con `baseURL` puntata a un relay **non** viene bloccata per errore; al contrario, la route `deepseek` incorporata di pi-ai ha per default l'API ufficiale come endpoint e **non** sfugge al blocco.
- **Sorgente degli endpoint**: `ctx.get('llm').listConfigurableProviders()` trova la voce del catalogo → `ctx.settings.get(settingsNs)` legge la `baseURL` tramite `settingsPath` (solo campi non segreti, il valore di `apiKeyEnv` non viene mai letto). Ricalcolato a ogni richiesta, senza cache → le modifiche a caldo della configurazione dei provider hanno effetto immediato.
- **Il passaggio fuori da ufficiale ripristina la sessione**: dopo la pausa di punta, se la sessione viene spostata su un provider locale/di terze parti (evento `model/selection` dal 0.1.2+) → ripresa automatica di quella sessione (subordinata a `deferredResume`); vengono toccate solo le sessioni messe in pausa da questo plugin all'ingresso in punta, quelle sospese manualmente con `/pause` **non** vengono mai toccate. Senza questo evento su 0.1.1 → degrada in «prossima richiesta o `/resume` manuale».
- **Endpoint non leggibile**: servizio `llm` assente, struttura del namespace cambiata, campo non stringa — si degrada sempre al giudizio per id / endpoint incorporato registrando il `matchedBy`, **mai un'eccezione lanciata**.
- **Indagare un giudizio errato**: `GET /session-guard/provider?provider=<id>` restituisce `{ official, matchedBy, endpoint }`.

### Guardia a livello di richiesta e coda differita

- **Perché il livello di richiesta**: il tick di 30 s elabora, al salto `NORMAL → PAUSED_PEAK`, solo le sessioni che erano `running` in quel momento; le sessioni avviate dopo l'ingresso in punta o passate nel frattempo a una sorgente ufficiale sfuggirebbero. La waterfall `agent/request` è la rete che passa **a ogni richiesta**.
- **Il giudizio si basa sul valore di ritorno di `next()`**: il middleware di selezione del modello sovrascrive provider/model dentro la waterfall con i valori scelti nell'interfaccia, quindi bisogna prima fare `await next()` e poi giudicare.
- **Modalità hold (predefinita)**: la richiesta è sospesa, **non inviata e senza errori**, e viene rilasciata all'istante esatto di fine punta (`msUntilOffPeak` con tempistica precisa, tick di 30 s come rete di sicurezza); l'annullamento utente (abort) interrompe normalmente.
- **Modalità error**: lancia un errore riconoscibile `PEAK_DEFERRED` + iscrizione in coda differita, con ripresa fuori punta tramite `deferredResumeText` (nessuna ripresa automatica se `deferredResume` è disattivato).
- **Protezione da tetto**: se `deferredMaxHoldMs` (6 ore predefinite) scade senza che la punta sia finita → si passa a error, per evitare sospensioni infinite.
- **Regola ferrea di mutua esclusione**: durante un hold **non** si richiede mai in aggiunta la pausa tramite il gate di sessione (la pausa attende un confine di sicurezza che una richiesta trattenuta non raggiungerà mai → le due parti si aspetterebbero a vicenda). All'ingresso in punta le sessioni già sospese vengono saltate.
- **Nessuna persistenza**: la coda differita è una promise nel processo, al riavvio sparisce.

### Confini (esplicitamente fuori dal perimetro)

- **Nessun cambio di provider / nessun instradamento**: si blocca solo, non si instrada;
- **La compaction non passa da `agent/request`**: non può avvenire mentre una sessione è in pausa; una compressione attivata manualmente in punta può comunque raggiungere la sorgente ufficiale (questo plugin non intercetta il livello `ctx.llm.stream`);
- **0.1.1 non ha l'evento `model/selection`**: la ripresa automatica dopo il passaggio a una sorgente non ufficiale degrada in «attendere la prossima richiesta o un `/resume` manuale» (immediato dal 0.1.2);
- **Nessuna nuova dipendenza npm**, nessuna lettura/scrittura di credenziali, e i retry 429 / di livello trasporto di `dsh-llm-retry` non vengono toccati.

### Gestione e validazione dei fusi orari

- Il riconoscimento del fuso si basa sui **nomi di fuso IANA** (come `Asia/Shanghai`, `Asia/Tokyo`, `Asia/Seoul`), proiettati tramite `Intl.DateTimeFormat` sull'ora a muro del fuso configurato, **senza affidarsi al `getUTCDay()` nudo** — evitando il classico bug di 8 ore al confine UTC+8 del fuso di Pechino (sabato 00:30 ora di Pechino, in UTC è ancora venerdì);
- `Intl.DateTimeFormat` è a sua volta lo strato di validazione: un nome di fuso non valido (come `Foo/Bar`) lancia una `RangeError`, intercettata da un try-catch esterno che degrada silenziosamente al fuso predefinito `Asia/Shanghai` (fail-open);
- Le finestre punta/fuori punta sono **chiuse a sinistra e aperte a destra** `[start, end)`, con supporto per finestre a cavallo della mezzanotte (come `22:00–06:00`);
- L'impostazione `timezone` si comporta identicamente in tutte le lingue (zh/en/ja/ko) — i nomi di fuso IANA di `Intl.DateTimeFormat` non dipendono dalla locale: il comportamento del fuso con interfaccia giapponese/coreana è identico a quello in cinese.

### Ripartizione con input-traffic: uno «ferma», l'altro «accoda»

I due agiscono su **maglie diverse della stessa catena**, il confine è deciso dal modello di inbox di DSH stesso:

```
Input utente ──(input-traffic sceglie la fascia)──▶ code in attesa next-step / next-turn
                                        │
                          agent/pre-step ──(gate di step del plugin)──▶ lascia passare / sospende
                                        │
                            agent/request ──(hold a livello di richiesta del plugin)──▶ lascia passare / sospende
                                        │
                                     chiamata al modello
```

**Semantica delle code DSH (due code, da non confondere)**

| Coda | Significato | Quando viene consumata |
|---|---|---|
| `next-step` | «Input in attesa del prossimo confine di step» | Al prossimo `agent/pre-step`: **allo stesso livello di un risultato di tool**, un altro step nello stesso turno |
| `next-turn` | «Prompt in attesa di un turno indipendente» | Al termine del turno corrente, avviato come **nuovo turno** |

`Inbox.claim()` **svuota sempre prima `next-step`** e preleva **1** `next-turn` in aggiunta solo quando quel confine apre un nuovo turno; il primo step di un turno legge next-turn, tutti i seguenti leggono next-step.

**Ripartizione dei compiti**

- **session-guard = fermare**: decide solo «quando si può proseguire», **non tocca mai contenuto e ordine delle code**.
  - gate di step (`agent/pre-step`): sospende **prima** della richiesta al modello del prossimo step;
  - pausa a livello di turno (`agent.cancel({keepInbox:true})` + `goals.pause` + confine di sicurezza): ferma il turno corrente, **le code restano intatte**;
  - guardia a livello di richiesta (hold su `agent/request`): sospende **questa singola richiesta al modello**.
- **input-traffic = accodare**: decide solo «in quale coda va l'input utente, con quale fascia, e quando viene consumato».
  - tre fasce = in quale coda mettere: rosso «interrompi» fa prima `cancel()` e poi `steer`; giallo «intercala» fa `steer` (→ `next-step`, il prossimo step dello stesso turno); verde «in coda» resta in `next-turn`;
  - congelamento = estrarre le righe `queued` + `steering` (fascia conservata) + blocco del composer + chiamata a `sessionGuard.stopNextTurn`; ripresa = rimozione del blocco → prima `sessionGuard.resume` → reinserimento secondo la fascia.

**Due regole ferree al punto d'incontro**

1. **Il congelamento deve far sì che il plugin rilasci prima il gate di step**: il gate di step è appeso a `agent/pre-step`, mentre la pausa a livello di turno attende un evento al confine di sicurezza — le due parti si aspetterebbero a vicenda (`pauseTask` / `cancelTask` di questo plugin fanno prima `release`);
2. **Con il gate di step chiuso i messaggi sono già stati presi**: `preStep()` fa `inbox.claim()` prima di dispatchare la waterfall, quindi i nuovi input si accodano dietro al lotto già prelevato; `keepInbox` si applica solo alla pausa a livello di turno.

**Nessun sconfinamento reciproco**: input-traffic non ascolta `agent/pre-step` / `agent/request` (unica eccezione il `cancel()` esplicito della fascia «interrompi», voluto dall'utente); questo plugin non riscrive mai contenuto e ordine di `next-step` / `next-turn`.

Sui pulsanti: i pulsanti «Sospendi sessione / Riprendi sessione» di questo plugin (order 20) e quelli di input-traffic «❄ Congela e accoda / Riprendi e accoda» (order 30) compaiono fianco a fianco senza sostituirsi — i primi governano il gate di step, i secondi l'estrazione dalla coda + il congelamento a livello di turno.

## Porta ridondante `sessionGuard`

```js
{
  stopNextTurn(sessionId, opts),  // ferma il prossimo turno della sessione (gate di sessione interno / ripiego sulla coda a blocco)
  resume(sessionId, opts),        // riprende (confirm + choice: rerun|skip)
  lockQueue(sessionId, reason),   // blocca esplicitamente la coda
  unlockQueue(sessionId),         // sblocca esplicitamente
  stepPause(sessionId),           // richiede manualmente una pausa a livello di step (chiusura al prossimo confine pre-step, anche lo step 1)
  stepResume(sessionId, opts),    // apre il gate di step (v0.2.0); con opts.bypass=false nessun bypass per questa punta
  state(sessionId),               // { queueLocked, lockReason, paused, pausedStep, stepHeldSince, stepBypass, taskControlAvailable, taskControl }
}
```

## Route HTTP

- `GET /session-guard/state?session=<id>` — stato della sessione (con `paused: { step, turn, manual }` / `stepGate` / ultima destinazione / in sospensione o no / differita o no)
- `GET /session-guard/events?session=<id>` — **SSE**: notifica immediata delle variazioni di stato del gate di step (il pulsante si aggiorna grazie a questo)
- `GET /session-guard/settings` — impostazioni + disponibilità di taskControl
- `GET /session-guard/status` — fase globale corrente (polling del badge di stato; include `stepHeld`)
- `GET /session-guard/provider?provider=<id>` — diagnostica del giudizio sulle sorgenti ufficiali (`official` / `matchedBy` / `endpoint`)
- `GET /session-guard/diag` — diagnostica a runtime (include `stepGate`)
- `POST /session-guard/rpc` — `{ action: stopNextTurn|resume|lockQueue|unlockQueue|stepPause|stepResume|state, sessionId }`

## Archiviazione dello stato

JSON per sessione: `$DSH_HOME/.dsh/session-guard/<sessionId>.json` (scrittura atomica; sostituibile con `DSH_SESSION_GUARD_STATE_DIR`).

## Test

```bash
npm test   # node --test tests/*.test.mjs (fusi orari/weekend/macchina a stati/gate di sessione/ponte/retry)
```

## Moduli

| File | Compito |
|---|---|
| `src/time.js` | Riconoscimento punta/weekend (fuso orario corretto) + `msUntilOffPeak` (temporizzazione precisa della fine punta) |
| `src/scheduler.js` | Macchina a stati pura NORMAL ↔ PAUSED_PEAK |
| `src/provider.js` | Giudizio a cinque livelli sulle sorgenti ufficiali (funzione pura: normalizzazione endpoint + matrice decisionale) |
| `src/provider-directory.js` | Catalogo degli endpoint (`llm.listConfigurableProviders` + `settings.get`, degradazione su tutta la catena) |
| `src/deferrals.js` | Registro delle differite (sospensione / rilascio / superamento del limite / `PeakDeferredError`) |
| `src/request-guard.js` | Guardia a livello di richiesta su `agent/request` (due modalità hold / error) |
| `src/step-gate.js` | **Gate di step su `agent/pre-step`** (v0.2.0: chiusura / rilascio / promozione a scadenza / bypass, il `decideStepHold` puro è testabile unitariamente) |
| `src/targets.js` | Tracciamento della «vera ultima destinazione» della sessione (`request/header` + `model/selection`) |
| `src/wiring.js` | Orchestrazione del cablaggio (filtro all'ingresso in punta / cablaggio del gate di step / rilascio fuori punta / temporizzazione precisa / pulizia allo scarico) |
| `src/pause-gate.js` | Motore del gate di sessione interno (agent.cancel keepInbox + goals.pause + confine di sicurezza + ripresa via followup; rilascia prima il gate di step prima di mettere in pausa) |
| `src/pause-store.js` | Persistenza dello stato di pausa interno |
| `src/gate.js` | Driver del gate di sessione (vera pausa interna / ripiego sulla coda a blocco, fail-open) |
| `src/bridge.js` | Porta ridondante `sessionGuard` |
| `src/retry.js` | Retry automatico lato backend (classificazione dei fallimenti/backoff/cedimento durante il congelamento; cortocircuito solo sul codice esatto `PEAK_DEFERRED`) |
| `src/detect.js` | Rilevamento automatico (taskControl dell'host / ponte client input-traffic) |
| `src/store.js` | Stato persistente per sessione |
| `src/settings.js` | Sotto-sezione delle impostazioni (schema schemastery + registrazione fail-open) |
| `src/index.js` | apply lato host (impostazioni/route/tick/fornitura del servizio/cablaggio del retry/guardia delle richieste) |
| `src/client/` | Metà browser (**pulsante di sospensione sessione** + badge di stato + scheda impostazioni) |

## Licenza

MIT — vedi [LICENSE](LICENSE).

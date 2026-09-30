# Guida all'installazione (CLI DSH ufficiale)

Questa guida usa solo il comando ufficiale `dsh plugin` di DSH.

- [Guida all'installazione in italiano](./INSTALL.it.md)
- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [Guide d'installation en français](./INSTALL.fr.md)
- [Installationsanleitung auf Deutsch](./INSTALL.de.md)
- [Руководство по установке на русском](./INSTALL.ru.md)
- [Guía de instalación en español](./INSTALL.es.md)
- [English README](./README.en.md)
- [中文 README](./README.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [README en français](./README.fr.md)
- [README auf Deutsch](./README.de.md)
- [README in italiano](./README.it.md)
- [README in russo](./README.ru.md)
- [README en español](./README.es.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)
- [Changelog en français](./CHANGELOG.fr.md)
- [Changelog auf Deutsch](./CHANGELOG.de.md)
- [Changelog in italiano](./CHANGELOG.it.md)
- [Changelog in russo](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)

## 0. Prerequisiti

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
```

## 1. Installare

```bash
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5

# oppure direttamente dal branch git
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.5
```

`compat/0.1.5` è la linea dedicata a DSH `0.1.5-rc.x`: numero di versione npm **`3.0.0`**, dist-tag
**`dsh-0.1.5`**, con `engines.dsh = >=0.1.5-rc.2 <0.2.0-0` **sia** in `package.json` **che** in
`dsh.plugin.json`.

Gli host DSH `0.1.2-rc.x` devono usare il branch **`legacy/0.1.2`** (dist-tag npm `dsh-0.1.2`,
versione `0.3.1`). **`main` è congelato a `0.2.0-beta.1` e non è più il branch di rilascio della
linea 0.1.2.**

> ⚠️ Non affidarsi al nome di pacchetto nudo `dsh-session-guard`: il tag `latest` di npm non può servire
> due linee di versione mutuamente esclusive (i loro intervalli `engines.dsh` sono esclusivi secondo il
> matching semver delle prerelease) — indicare sempre esplicitamente il dist-tag.

Riavviare dsh web e ricaricare la pagina.

## 2. Verificare

Aprire **Impostazioni → Plugin → session-guard**. Interruttori: `enabled`, `providerGuard`, `guardSubagents`,
`offPeakAutoResume`, `weekendMode`, `deferredResume`, `queueFallback`, `retryEnabled`; campi testo/lista:
`officialProviders`, `officialBaseURLs`, `deferredResumeText`.

Controllare il badge di stato nell'interfaccia di sessione — mostra la fase corrente (`高峰·拦官方` / `高峰·全部暂停`
/ `谷时` / `周末`).

Verificare il giudizio sulla sorgente ufficiale per una route (route dell'host, senza riavvio):

```bash
curl -s 'http://127.0.0.1:3080/session-guard/provider?provider=deepseek-official'
# {"ok":true,"verdict":{"provider":"deepseek-official","official":true,"matchedBy":"endpoint","endpoint":"https://api.deepseek.com"}}
```

Eseguire la suite di test (senza rete, senza credenziali):

```bash
npm test
```

## 3. Aggiornare

```bash
dsh plugin --profile web remove dsh-session-guard
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
```

Riavviare dsh web e ricaricare la pagina. Le impostazioni vivono in `$DSH_HOME/settings.yaml` nel namespace
`session-guard` e sopravvivono all'aggiornamento; le nuove chiavi (`providerGuard`, `deferredMode`, …)
restano sui valori predefiniti finché non vengono toccate.

Dal **plugin** `0.1.3` / `0.1.4-beta.1` al **plugin** `0.1.5-beta.1` l'unico cambio di comportamento è che nelle ore di punta vengono
bloccati **per impostazione predefinita solo** gli obiettivi di sorgente ufficiale. Per tornare al vecchio comportamento generalizzato
impostare `providerGuard: false` (o restringere il giudizio con `officialProviders` / `officialBaseURLs`).
(Queste sono versioni del plugin, non di DSH — non confonderle con gli intervalli dell'host indicati sopra.)

## 4. Risoluzione dei problemi

| Sintomo | Verifica |
|---|---|
| Le sessioni continuano a girare in punta | `GET /session-guard/status` → `phase` deve essere `peak`; `GET /session-guard/settings` → `enabled: true` |
| Un provider locale viene bloccato in punta | `GET /session-guard/provider?provider=<id>` → `matchedBy` dovrebbe essere `endpoint`/`unknown` con `official: false`. Se è `explicit`, rimuovere l'id da `officialProviders` |
| Una richiesta ufficiale NON viene bloccata | `matchedBy: 'endpoint'` con `official: false` significa che la `baseURL` della route non è in `officialBaseURLs`; aggiungere lì l'host, oppure aggiungere l'id della route a `officialProviders` |
| Le richieste restano sospese invece di fallire | È la modalità `hold`, voluta per progetto. Per un errore esplicito impostare `deferredMode: 'error'`, oppure abbassare `deferredMaxHoldMs` |
| Dopo la punta nulla si riprende | `deferredResume` deve essere attivo (o eseguire `/resume`); `offPeakAutoResume` governa la ripresa a livello di sessione |
| Diagnostica del giudizio non disponibile | `GET /session-guard/diag` → `providerGuard`, `configurableProviders`, `held`, `deferred` |

## 5. Disinstallare

```bash
dsh plugin --profile web remove dsh-session-guard
```

Riavviare dsh web. Le richieste trattenute vengono rilasciate (respinte) allo scaricamento — nessuna perdita di promise.

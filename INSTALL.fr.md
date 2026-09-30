# Guide d'installation (CLI DSH officiel)

Ce guide n'utilise que la commande officielle `dsh plugin` de DSH.

- [Guide d'installation en français](./INSTALL.fr.md)
- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [Installationsanleitung auf Deutsch](./INSTALL.de.md)
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
- [README en russe](./README.ru.md)
- [README en español](./README.es.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)
- [Changelog en français](./CHANGELOG.fr.md)
- [Changelog auf Deutsch](./CHANGELOG.de.md)
- [Changelog in italiano](./CHANGELOG.it.md)
- [Changelog en russe](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)

## 0. Prérequis

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
```

## 1. Installer

```bash
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5

# ou directement depuis la branche git
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.5
```

`compat/0.1.5` est la ligne dédiée à DSH `0.1.5-rc.x` : numéro de version npm **`3.0.0`**, dist-tag
**`dsh-0.1.5`**, avec `engines.dsh = >=0.1.5-rc.2 <0.2.0-0` **à la fois** dans `package.json` et
`dsh.plugin.json`.

Les hôtes DSH `0.1.2-rc.x` doivent utiliser la branche **`legacy/0.1.2`** (dist-tag npm `dsh-0.1.2`,
version `0.3.1`). **`main` est gelé à `0.2.0-beta.1` et n'est plus la branche de publication de la
ligne 0.1.2.**

> ⚠️ Ne vous fiez pas au nom de paquet nu `dsh-session-guard` : le tag `latest` de npm ne peut pas
> servir deux lignes de versions mutuellement exclusives (leurs plages `engines.dsh` sont exclusives selon
> les règles semver des pré-releases) — épinglez toujours explicitement le dist-tag.

Redémarrez dsh web et rafraîchissez la page.

## 2. Vérifier

Ouvrez **Réglages → Plugins → session-guard**. Interrupteurs : `enabled`, `providerGuard`, `guardSubagents`,
`offPeakAutoResume`, `weekendMode`, `deferredResume`, `queueFallback`, `retryEnabled` ; champs texte/liste :
`officialProviders`, `officialBaseURLs`, `deferredResumeText`.

Vérifiez le badge d'état dans l'interface de session — il affiche la phase en cours (`高峰·拦官方` / `高峰·全部暂停`
/ `谷时` / `周末`).

Contrôlez le verdict de source officielle d'une route (route hôte, sans redémarrage) :

```bash
curl -s 'http://127.0.0.1:3080/session-guard/provider?provider=deepseek-official'
# {"ok":true,"verdict":{"provider":"deepseek-official","official":true,"matchedBy":"endpoint","endpoint":"https://api.deepseek.com"}}
```

Lancez la suite de tests (sans réseau, sans identifiants) :

```bash
npm test
```

## 3. Mettre à niveau

```bash
dsh plugin --profile web remove dsh-session-guard
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
```

Redémarrez dsh web et rafraîchissez la page. Les réglages vivent dans `$DSH_HOME/settings.yaml` sous l'espace
de noms `session-guard` et survivent à la mise à niveau ; les nouvelles clés (`providerGuard`, `deferredMode`, …)
gardent leur valeur par défaut jusqu'à ce que vous les touchiez.

Du **plugin** `0.1.3` / `0.1.4-beta.1` au **plugin** `0.1.5-beta.1`, le seul changement de comportement est que les heures
de pointe ne bloquent **par défaut que les cibles de source officielle**. Pour retrouver l'ancien comportement global,
mettez `providerGuard: false` (ou resserrez le verdict avec `officialProviders` / `officialBaseURLs`).
(Ce sont des versions du plugin, pas des versions de DSH — ne les confondez pas avec les plages d'hôte ci-dessus.)

## 4. Dépannage

| Symptôme | Vérification |
|---|---|
| Les sessions tournent toujours pendant la pointe | `GET /session-guard/status` → `phase` doit être `peak` ; `GET /session-guard/settings` → `enabled: true` |
| Un provider local est bloqué pendant la pointe | `GET /session-guard/provider?provider=<id>` → `matchedBy` devrait être `endpoint`/`unknown` avec `official: false`. Si c'est `explicit`, retirez l'id de `officialProviders` |
| Une requête officielle n'est PAS bloquée | `matchedBy: 'endpoint'` avec `official: false` signifie que la `baseURL` de la route n'est pas dans `officialBaseURLs` ; ajoutez le host là, ou ajoutez l'id de route à `officialProviders` |
| Les requêtes restent suspendues au lieu d'échouer | C'est le mode `hold`, voulu par la conception. Mettez `deferredMode: 'error'` pour une erreur explicite, ou baissez `deferredMaxHoldMs` |
| Rien ne reprend après la pointe | `deferredResume` doit être activé (ou lancez `/resume`) ; `offPeakAutoResume` contrôle la reprise au niveau session |
| Diagnostics du verdict indisponibles | `GET /session-guard/diag` → `providerGuard`, `configurableProviders`, `held`, `deferred` |

## 5. Désinstaller

```bash
dsh plugin --profile web remove dsh-session-guard
```

Redémarrez dsh web. Les requêtes retenues sont libérées (rejetées) au déchargement — aucune fuite de promise.

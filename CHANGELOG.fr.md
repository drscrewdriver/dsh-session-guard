# Journal des modifications

Tous les changements notables de `dsh-session-guard` sont consignés ici. Les versions suivent semver.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)
- [Changelog en français](./CHANGELOG.fr.md)
- [Changelog auf Deutsch](./CHANGELOG.de.md)
- [Changelog in italiano](./CHANGELOG.it.md)
- [Changelog en russe](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)

## 4.0.0 — 2026-09-29

### Modifié
- **Adaptation à la ligne DSH 0.2.0** : `engines.dsh` et les quatre peers `@deepseek-ai/dsh-client-*` passent à `>=0.2.0-rc.1 <0.2.1-0` (en remplacement des plages 0.1.7) ; dist-tag npm `dsh-0.2.0` ; version du manifeste alignée sur `4.0.0`. La surface d'API côté plugin (manifest / settings / HMR / slots / session v4) est inchangée par rapport à 0.1.7 — aucune modification du code d'exécution.
- Plancher du peer `@deepseek-ai/cordis` aligné sur `^4.0.4` (les paquets UI hôtes de 0.2.0-rc.1 déclarent `~4.0.4` ; l'ancien `^4.0.1` l'acceptait mais sous-estimait le plancher).

### Corrigé
- `src/client/family-section.tsx` a rejoint le contrôle de version (il n'existait que dans l'arborescence de travail depuis 3.2.x, un checkout propre ne pouvait donc pas compiler).
- Configuration eslint plate : abandon de la règle `no-unused-vars` du core — elle signalait à tort les paramètres des signatures de types TS ; la variante typescript-eslint est conservée et la baseline de lint est à nouveau verte.
- Les gardes statiques de source-kind v4 (`tests/source-kind.test.mjs`) sont suivies dans le dépôt et exécutées par `npm test` (248 tests).

## 3.2.4 — 2026-09-27

### Corrigé
- **Adaptation au format de session v4 (hôte >= 0.1.7-rc.1)** : les trois chemins d'écriture de session n'utilisent plus la signature retirée `source: { kind: 'plugin', plugin: 'session-guard' }`, que l'hôte v4 refuse avec `SessionFormatError` (échec du tour entier). Tous les trois emploient désormais le kind possédé par le producteur :
  - injection de l'avis de reprise différée (`src/wiring.js`) ;
  - injection de l'avis de relance automatique (`src/retry.js`) ;
  - followup de pause-reprise (`src/pause-gate.js`, ```kind: `plugin:${pluginId}````).
  - **Adaptation native v4 du tool-result (N1)** : `findToolOutcome` dans `src/pause-gate.js` lit d'abord le message v4 de première classe `role:'tool'` (`toolCallId`/`isError` au plus haut niveau du message) ; le chemin v3 par bloc `tool-result` est conservé comme repli historique. Sans cela, un outil en échec au moment de la pause était rapporté comme terminé à la reprise (« ne pas relancer ») — une mauvaise décision silencieuse. `src/tool-call-id.js` lit d'abord l'id natif de plus haut niveau ; notes d'en-tête périmées de l'époque 0.1.1/0.1.2 corrigées vers le tableau des trois formes par génération.
  `form` et tous les autres champs sont inchangés ; la migration v3-vers-v4 de l'hôte remonte elle-même les lignes héritées existantes, donc aucune donnée historique n'est réécrite. Preuve : `@deepseek-ai/dsh-session-format-v3-to-v4@0.1.7-rc.2` ne valide que `source.kind` non vide et différent de `'plugin'`.

## 0.4.0 — 2026-09-18 (version erronée ; remplacée par 3.0.0)

### Corrigé

- **Identité de version.** Cette ligne a été publiée sous le numéro `0.4.0` alors que `dsh.plugin.json` et ce
  journal indiquaient déjà `3.0.0` — un même artefact avec deux numéros de version. `package.json` est désormais
  à `3.0.0`, si bien que la version du paquet, celle du manifeste et celle du journal concordent. `0.4.0` est conservé
  ici comme trace historique car les versions npm sont immuables ; le `dist-tag dsh-0.1.5` devrait être
  repointé vers `3.0.0` une fois celle-ci publiée.
- **Documentation.** Les README/INSTALL (zh/en/ja/ko) ne décrivent plus la ligne voisine comme vivant sur `main`.
  La branche de publication de la ligne 0.1.2 est **`legacy/0.1.2`** (dist-tag npm `dsh-0.1.2`, version `0.3.1`) ;
  `main` est gelé à `0.2.0-beta.1`. Le fragment de branche dupliqué dans la commande d'installation des INSTALL.zh/ja/ko
  est corrigé, les commandes d'installation avec dist-tag explicite sont documentées, et « 2.x / 3.x » est
  désormais marqué comme **surnom de ligne** plutôt que numéro de version.

### Notes

- **Aucun changement de code** par rapport à `3.0.0` ; `0.4.0` est une publication purement empaquetage du même arbre.

## 3.0.0 — 2026-09-14

### Modifié

- **Ligne dédiée à DSH v0.1.5-rc.2 (`compat/0.1.5`).** Les plages `engines.dsh` et des peers `dsh-client-*`
  se resserrent à `>=0.1.5-rc.2 <0.2.0-0` (l'appariement strict-semver des pré-releases fait que l'ancienne
  plage `>=0.1.0-rc.7` ne correspondait jamais à `0.1.5-rc.2`) ; `dsh.plugin.json` gagne un `engines.dsh`.
  La ligne 2.x / 0.2.x sur `main` continue de servir DSH 0.1.0-rc.7 … 0.1.2-rc.1.
- **`session.events` → `snapshotEvents()`.** DSH 0.1.5 a supprimé l'accesseur tableau `session.events`
  (compatibility-guide §20.3). `pause-gate.js` lit désormais les événements de session via un
  assistant à double chemin : `snapshotEvents()` d'abord, l'ancien tableau `events` en repli défensif,
  `null` (fail-open) quand aucun des deux n'existe. Ne concerne que `findToolOutcome` et
  `lastUserPrompt` ; l'appariement par type d'événement est inchangé.

### Inchangé

- Zéro changement sur toutes les autres coutures d'intégration : la route préfixe webServer auto-portée
  (`/session-guard/rpc`), `settings.register`, le slot `settings.plugin.item`, les injections client et
  `llm.listConfigurableProviders()` sont tous vérifiés intacts contre le bundle 0.1.5-rc.2 publié
  (`tools/check-api-drift.ps1`, 12/12 assertions requises).

### En attente

- Smoke test en conditions réelles sur un hôte DSH 0.1.5-rc.2 (même statut que la ligne 0.1.5 du perm-gate).

## 0.2.0-beta.2 — 2026-09-13

### Corrigé (compat DSH 0.1.5 — branche `compat/0.1.5`)

- **Mise en file de reprise à double chemin.** DSH 0.1.5 transforme l'Inbox en projection en lecture seule
  de la boucle agent, si bien que `agent.followup` peut ne plus exister. Le flux de reprise essaie d'abord
  `agent.followup`, se rabat sur `agent.send`, et dégrade en avertissement (sans jamais lever d'exception)
  quand ni l'un ni l'autre n'est disponible — un échec d'empilement ne peut plus casser la reprise.
- **Les messages de reprise portent `source.form: 'instructions'`** conformément au contrat de source de
  messages `ContextFormed` de 0.1.5 (`kind: 'plugin'` est un kind intégré ; les anciennes versions de DSH
  ignorent le champ supplémentaire).
- **`webServer.register` est enveloppé dans un try/catch** : un échec d'enregistrement de route journalise
  désormais une erreur au lieu de sortir de `apply` par une exception et de casser le chargement des plugins de l'hôte.
- Vérifié contre le code source de 0.1.5-rc.2 : le contrat `WebRoute` (exact/prefix + SSE) est
  inchangé, si bien que les chemins client `fetch('/session-guard/...')` n'ont pas besoin du préfixe `/api`.

## 0.2.0-beta.1 — 2026-09-10

### Ajouté

- **Barrière au niveau du step (`agent/pre-step`).** Pendant les heures de pointe, le tour est désormais retenu **avant**
  la requête modèle du prochain step au lieu d'être interrompu à une frontière de tour : la session continue
  jusqu'au prochain `agent/pre-step`, où la barrière la retient (réglage `stepLevelPause`, activé par
  défaut). Le tour reprend **sur place** hors pointe — aucun message followup nécessaire. Conditions de retenue :
  pointe (heure de Pékin) + hors week-end + `step > 1` + provider cible officiel (`providerGuard`) +
  pas de retenue au niveau requête + pas de contournement dans cette fenêtre de pointe. Nouveau module `src/step-gate.js`
  (`decideStepHold` pur + moteur hold / release / abort / timeout).
- **Port `stepResume` + RPC + `/resume`.** `sessionGuard.stepResume(sessionId, {bypass})`,
  `POST /session-guard/rpc {action:'stepResume'}` et `/resume` relâchent tous la barrière ; une reprise
  manuelle cesse aussi de contrôler cette session pour le reste de la fenêtre de pointe.
- **Escalade sur expiration.** `stepGateTimeoutMs` (300000 par défaut) relâche la barrière et escalade vers une
  pause **force** au niveau du tour, si bien qu'une pointe longue ne provoque ni interblocage ni goutte-à-goutte d'un step toutes les cinq minutes.
- **Bouton « ⏸ Suspendre la session »** (client, slot `conversation.input.right`, id `session-guard-pause`,
  order 20 — à gauche du bouton de gel d'input-traffic). Il interroge `/session-guard/state` une fois par seconde,
  reste désactivé tant que rien n'est retenu, et appelle `stepResume` quand c'est le cas. Le badge d'état passe à
  l'order 40 et signale désormais le nombre de sessions retenues au niveau du step.
- **Nouveaux réglages** : `stepLevelPause`, `stepGateTimeoutMs`.
- **Nouveaux états** : `GET /session-guard/state` renvoie désormais `paused: { step, turn }` et
  `stepGate: { held, since, bypass }` ; `/status` renvoie `stepHeld` ; `/diag` renvoie `stepGate`.
  Le `state().paused` du port de service reste booléen pour compatibilité (nouveau champ `pausedStep`).

### Corrigé

- **Interblocage entre un step retenu et une pause au niveau du tour.** `pauseTask` / `resumeTask` /
  `cancelTask` relâchent désormais la barrière de step d'abord : un step retenu se trouve sur `agent/pre-step`, où aucun
  `assistant/message` ni `tool/result` ne peut jamais arriver, si bien qu'une pause `safe` attendait indéfiniment et
  ne persistait jamais `paused`.

### Modifié

- **L'entrée en pointe n'interrompt plus les tours en cours** quand `stepLevelPause` est activé (`onEnterPeak` arme
  la barrière de step au lieu d'appeler `stopNextTurn`) ; désactivé, le comportement antérieur au niveau du tour est inchangé.
- L'étiquette du bouton de gel d'input-traffic devient **« Freeze & append »** (`冻结追加` / `凍結して追加` /
  `동결 후 추가`), et celle de reprise **« Resume & append »** (`恢复追加` / `再開して追加` /
  `재개 후 추가`) — il gèle le tour et conserve les messages en file, à distinguer du bouton de pause.
- **Le bouton de pause devient un interrupteur** : « Suspendre la session » / « Reprendre la session » (plus d'état gris désactivé).
  Un clic sur « Suspendre la session » appelle la nouvelle action `stepPause`, qui retient la session à la **prochaine
  frontière de step** (step 1 inclus, quelles que soient la pointe ou le provider) ; « Reprendre la session » appelle
  `stepResume`. Nouvelle méthode de port `sessionGuard.stepPause(sessionId)`.
- **Poussée SSE** : la nouvelle route `GET /session-guard/events?session=<id>` pousse les changements d'état de la
  barrière de step au moment où ils se produisent, si bien que les retenues automatiques de pointe basculent le bouton sur
  « Reprendre la session » sans attendre un sondage ; le sondage `/session-guard/state` toutes les 10 s reste en repli. `/state` signale désormais
  `paused.manual` et `stepGate.manual`.
- **Style aligné** sur le bouton composer d'input-traffic (hauteur 24 px, rayon 6 px, police 12 px, mêmes
  jetons border/hover/pressed) pour le bouton de pause comme pour le badge d'état ; les styles sont
  injectés une seule fois via `<style data-plugin-css="session-guard-client">`.

## Non publié

### Ajouté

- **Garde bidimensionnelle des sources officielles (pointe × provider cible).** Les heures de pointe ne bloquent désormais que
  les requêtes dont la route cible est une source officielle DeepSeek ; les providers locaux/tiers continuent
  de tourner. Ordre de verdict : liste explicite d'id `officialProviders` → endpoint `baseURL` en direct →
  endpoint intégré au catalog (le `deepseek` de pi-ai) → id intégré (`deepseek-official`) ; chaque verdict
  rapporte `matchedBy`. Nouveaux modules : `src/provider.js` (pur), `src/provider-directory.js`,
  `src/deferrals.js`, `src/request-guard.js`, `src/targets.js`, `src/wiring.js`.
- **Filet de sécurité au niveau requête (`agent/request`).** Couvre les sessions démarrées après l'entrée en pointe et
  les sessions basculées vers une source officielle en cours de route — le tick de 30 s ne traitait que les sessions déjà
  `running` à la transition. Le mode `hold` par défaut suspend la requête sans erreur
  et la libère à l'instant exact hors pointe (`msUntilOffPeak`) ; le mode `error` lève un échec reconnaissable
  `PEAK_DEFERRED` et enregistre un différé pour la reprise hors pointe.
- **Nouveaux réglages** : `providerGuard`, `officialProviders`, `officialBaseURLs`, `deferredResume`,
  `deferredResumeText`, `deferredMode`, `deferredMaxHoldMs` (6 h par défaut), `guardSubagents`.
- **Nouvelles routes** : `GET /session-guard/provider?provider=<id>` (diagnostics du verdict) ;
  `/session-guard/status` signale désormais `providerGuard` / `held` / `deferred` ;
  `/session-guard/state` signale la dernière cible de la session.
- **Garde anti-dérive** `tools/check-api-drift.ps1` vérifiant l'existence des API requises sur
  `dsh-v0.1.1-rc.2` / `dsh-v0.1.2-rc.1` / `dsh-v0.1.3-alpha.2` / `dsh-v0.1.5-alpha.1`.

### Modifié

- **Support bi-version DSH (0.1.0-rc.7 … 0.1.2-rc.1).** Un seul artefact couvre désormais à la fois
  `dsh-v0.1.1-rc.2` et `dsh-v0.1.2-rc.1`. La double lecture de l'id d'appel `tool/result`
  (`content[].toolCallId` d'abord, `source.callId` en repli — les deux formes apparaissent dans les journaux de relecture des
  deux versions) est extraite vers `src/tool-call-id.js`, sans dépendance, avec tests unitaires.
  `dsh.client.inject` ne nomme plus `@deepseek-ai/dsh-client-runtime` (supprimé en 0.1.2) ni
  `@deepseek-ai/dsh-client-ui-slots` (pas une ligne client dynamique) ; les plages de peers sont élargies à
  `>=0.1.0-rc.7 <0.2.0-0` et le paquet supprimé est retiré. Ajout de `engines.dsh` et d'un
  tableau de compatibilité de versions au README (ZH/EN).
- **La surface de réglages reste sur l'API d'intersection** : `settings.register` + `settings.get` uniquement ;
  `installSection` (0.1.2+) et le `installSettingsSection` supprimé ne sont jamais utilisés. Les API optionnelles
  (`model/selection`, `llm.listConfigurableProviders`, `settings.get`) sont sondées par fonctionnalité et
  se dégradent au lieu de lever une exception.
- **`src/retry.js` ne court-circuite que le sentinelle exact `PEAK_DEFERRED`.** Les échecs 429 / `RATE_LIMIT` /
  `TRANSPORT` / timeout restent transitoires, si bien le retry global de DSH (`dsh-llm-retry` sur
  `agent/request-error`) et la sémantique de relance propre de ce plugin sont inchangés. `dsh-llm-retry`
  n'est jamais touché.
- Le badge distingue « pointe · officiel seulement » de « pointe · tout en pause ».

## 0.1.4 — 2026-09-09

### Modifié

- **Publication bêta publique** de la ligne bi-version (`0.1.4-beta.1`) : métadonnées de version, tableau de compatibilité
  du README et métadonnées du paquet alignées pour le canal bêta.

## 0.1.3 — 2026-09-09

### Corrigé

- **Encodage de package.json rétabli** : la description était corrompue (octets GB2312 relus comme de l'UTF-8) ; réécrite avec le texte chinois correct.
- **Métadonnées manquantes** : ajout des champs `repository` et `homepage`.
- **peerDependencies corrigées** : suppression de la version exacte épinglée de `dsh-llm` ; ajout de `cordis`, `dsh-client-runtime`, `dsh-client-locale`, `dsh-client-ui-settings`, `dsh-client-ui-slots` comme peers optionnels correspondant à `dsh.client.inject`.
- Ajout du manifeste `dsh.plugin.json`.

## 0.1.2 — 2026-08-28

### Corrigé

- **Fuseau horaire de la pointe corrigé** : 峰谷判定固定北京时间 (`BILLING_TIMEZONE`), détection du week-end sur le fuseau configuré.

## 0.1.1 — 2026-08-24

### Ajouté

- **Relance automatique côté backend (D9)** : les échecs transitoires `turn/end` (error/429/max-tokens) déclenchent une reprise `followup(retryText)` avec backoff adaptatif ; les échecs permanents (auth/solde/modèle/limite de contexte) s'arrêtent ; l'intervention utilisateur ou un tour réussi remet à zéro le compteur d'échecs consécutifs.
- **Cession pendant gel/barrière** : la relance est ignorée quand `isFrozen(sessionId)` est vrai (queueLocked / paused / taskControl paused), la barrière de session n'est jamais contournée.

### Modifié

- Le port redondant `sessionGuard` expose désormais `state(sessionId)` renvoyant `{ queueLocked, lockReason, paused, taskControlAvailable, taskControl }`.
- La route HTTP `GET /session-guard/diag` renvoie des diagnostics d'exécution incluant l'état de relance.

### Corrigé

- La détection du week-end utilise désormais `Intl.DateTimeFormat` avec le fuseau configuré au lieu du `getUTCDay()` brut, corrigeant un bug de frontière de 8 heures pour le fuseau de Pékin.

## 0.1.0 — 2026-08-18

### Ajouté

- Version initiale : pause automatique en pointe (globale), mode week-end, gel/reprise par session via le port redondant `sessionGuard` + pont RPC, barrière de session maison (`agent.cancel keepInbox + goals.pause + session/event frontière de sécurité + reprise par followup`), panneau de réglages (Réglages → Plugins → session-guard).

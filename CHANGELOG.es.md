# Registro de cambios

Todos los cambios notables de `dsh-session-guard` se registran aquí. Las versiones siguen semver.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)
- [Changelog en français](./CHANGELOG.fr.md)
- [Changelog auf Deutsch](./CHANGELOG.de.md)
- [Changelog in italiano](./CHANGELOG.it.md)
- [Changelog en ruso](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)

## 4.0.0 — 2026-09-29

### Cambiado
- **Adaptación a la línea DSH 0.2.0**: `engines.dsh` y los cuatro pares `@deepseek-ai/dsh-client-*` pasan a `>=0.2.0-rc.1 <0.2.1-0` (en sustitución de los rangos 0.1.7); dist-tag npm `dsh-0.2.0`; versión del manifiesto alineada a `4.0.0`. La superficie de API que usa el plugin (manifest / settings / HMR / slots / sesión v4) no cambia respecto a 0.1.7 — sin modificaciones en el código de ejecución.
- Límite inferior del par `@deepseek-ai/cordis` alineado con `^4.0.4` (los paquetes de UI del host 0.2.0-rc.1 declaran `~4.0.4`; el anterior `^4.0.1` lo aceptaba, pero subestimaba el límite).

### Corregido
- `src/client/family-section.tsx` ha entrado en el control de versiones (desde 3.2.x existía solo en el árbol de trabajo, de modo que un checkout limpio no podía compilar).
- eslint flat config: se elimina la regla `no-unused-vars` del núcleo — marcaba erróneamente los parámetros de las firmas de tipos TS; la variante typescript-eslint se conserva y la línea base de lint vuelve a estar en verde.
- Las compuertas estáticas de source-kind v4 (`tests/source-kind.test.mjs`) quedan bajo seguimiento y se ejecutan en `npm test` (248 pruebas).

## 3.2.4 — 2026-09-27

### Corregido
- **Adaptación al formato de sesión v4 (host >= 0.1.7-rc.1)**: las tres rutas de escritura de sesión ya no usan la firma retirada `source: { kind: 'plugin', plugin: 'session-guard' }`, que el host v4 rechaza con `SessionFormatError` (falla el turno completo). Las tres usan ahora el kind de propiedad del productor:
  - inyección de avisos de reanudación diferida (`src/wiring.js`);
  - inyección de avisos de reintento automático (`src/retry.js`);
  - followup de pausa-reanudación (`src/pause-gate.js`, ```kind: `plugin:${pluginId}````).
  - **Adaptación nativa v4 del tool-result (N1)**: `findToolOutcome` en `src/pause-gate.js` ahora lee primero el mensaje v4 de primera clase `role:'tool'` (`toolCallId`/`isError` en el nivel superior del mensaje); la ruta v3 por bloques `tool-result` se conserva como respaldo histórico. Sin esto, una herramienta fallida en el momento de la pausa se informaba como completada al reanudar («no volver a ejecutar») — una decisión errónea silenciosa. `src/tool-call-id.js` lee primero el id nativo del nivel superior; notas de cabecera obsoletas de la época 0.1.1/0.1.2 corregidas a la tabla de tres formas por generación.
  `form` y todos los demás campos no cambian; la propia migración v3→v4 del host promueve las filas históricas existentes, así que no se reescribe ningún dato histórico. Evidencia: `@deepseek-ai/dsh-session-format-v3-to-v4@0.1.7-rc.2` valida solo que `source.kind` no esté vacío y no sea `'plugin'`.

## 0.4.0 — 2026-09-18 (versión errónea; sustituida por 3.0.0)

### Corregido

- **Identidad de versión.** Esta línea se publicó como `0.4.0` mientras `dsh.plugin.json` y este
  registro ya decían `3.0.0` — un artefacto con dos números de versión. `package.json` ahora es
  `3.0.0`, de modo que la versión del paquete, la del manifiesto y la del registro coinciden. `0.4.0` se conserva
  aquí como registro histórico porque las versiones de npm son inmutables; el `dist-tag dsh-0.1.5` debería
  reorientarse a `3.0.0` una vez publicada.
- **Documentación.** README/INSTALL (zh/en/ja/ko) ya no describen la línea hermana como residente en `main`.
  La rama de publicaciones de la línea 0.1.2 es **`legacy/0.1.2`** (dist-tag npm `dsh-0.1.2`, versión `0.3.1`);
  `main` está congelado en `0.2.0-beta.1`. Se corrigió el fragmento de rama duplicado en el comando de instalación de
  INSTALL.zh/ja/ko, se documentaron los comandos de instalación con dist-tag explícito, y «2.x / 3.x» queda
  ahora marcado como **apodo de línea** en lugar de número de versión.

### Notas

- **Sin cambios en el código fuente** respecto a `3.0.0`; `0.4.0` es una publicación solo de empaquetado del mismo árbol.

## 3.0.0 — 2026-09-14

### Cambiado

- **Línea dedicada a DSH v0.1.5-rc.2 (`compat/0.1.5`).** Los rangos de `engines.dsh` y de los pares
  `dsh-client-*` se estrechan a `>=0.1.5-rc.2 <0.2.0-0` (la correspondencia semver estricta de prerelease significa que el
  antiguo rango `>=0.1.0-rc.7` nunca coincidía con `0.1.5-rc.2`); `dsh.plugin.json` gana `engines.dsh`.
  La línea 2.x / 0.2.x en `main` sigue atendiendo DSH 0.1.0-rc.7 … 0.1.2-rc.1.
- **`session.events` → `snapshotEvents()`.** DSH 0.1.5 eliminó el acceso de matriz `session.events`
  (compatibility-guide §20.3). `pause-gate.js` ahora lee los eventos de sesión mediante un
  ayudante de doble vía: primero `snapshotEvents()`, la matriz antigua `events` como respaldo defensivo,
  `null` (fail-open) cuando no existe ninguna de las dos. Afecta solo a `findToolOutcome` y
  `lastUserPrompt`; la comparación por tipo de evento no cambia.

### Sin cambios

- Cero cambios en las demás juntas de integración: la ruta con prefijo webServer autoalojada
  (`/session-guard/rpc`), `settings.register`, el slot `settings.plugin.item`, las inyecciones del cliente y
  `llm.listConfigurableProviders()` están todas verificadas intactas frente al bundle 0.1.5-rc.2 publicado
  (`tools/check-api-drift.ps1`, 12/12 aserciones requeridas).

### Pendiente

- Prueba de humo en vivo sobre un host real DSH 0.1.5-rc.2 (mismo estado que la línea 0.1.5 del perm-gate).

## 0.2.0-beta.2 — 2026-09-13

### Corregido (compatibilidad con DSH 0.1.5 — rama `compat/0.1.5`)

- **Puesta en cola de la reanudación por doble vía.** DSH 0.1.5 convierte el Inbox en una proyección de solo
  lectura del bucle del agente, así que `agent.followup` puede dejar de existir. El flujo de reanudación
  ahora prueba primero `agent.followup`, recurre a `agent.send` y degrada a un aviso (nunca lanza)
  cuando no está disponible ninguno de los dos — un fallo de puesta en cola ya no puede romper la reanudación.
- **Los mensajes de reanudación llevan `source.form: 'instructions'`** conforme al contrato de fuentes de
  mensajes `ContextFormed` de 0.1.5 (`kind: 'plugin'` es un kind integrado; las versiones anteriores de DSH ignoran
  el campo extra).
- **`webServer.register` se envuelve en try/catch**: un fallo de registro de ruta ahora registra un
  error en lugar de salir de `apply` con una excepción y romper la carga de plugins del host.
- Verificado contra el código fuente 0.1.5-rc.2: el contrato `WebRoute` (exact/prefix + SSE) no
  cambia, de modo que las rutas del cliente `fetch('/session-guard/...')` no necesitan el prefijo `/api`.

## 0.2.0-beta.1 — 2026-09-10

### Añadido

- **Compuerta a nivel de paso (`agent/pre-step`).** Durante las horas punta el turno ahora se retiene **antes**
  de la solicitud al modelo del siguiente paso en vez de interrumpirse en un límite de turno: la sesión sigue
  hasta el siguiente `agent/pre-step`, donde la compuerta la retiene (ajuste `stepLevelPause`, activado por
  defecto). El turno se reanuda **en su sitio** fuera de punta — sin necesidad de mensaje followup. Condiciones de retención:
  punta (hora de Pekín) + no fin de semana + `step > 1` + proveedor de destino oficial (`providerGuard`) +
  sin retención a nivel de solicitud + no saltada en esta ventana de punta. Nuevo módulo `src/step-gate.js` (puro
  `decideStepHold` + motor hold / release / abort / timeout).
- **Puerto `stepResume` + RPC + `/resume`.** `sessionGuard.stepResume(sessionId, {bypass})`,
  `POST /session-guard/rpc {action:'stepResume'}` y `/resume` liberan todos la compuerta; una reanudación
  manual deja además de controlar esa sesión por el resto de la ventana de punta.
- **Escalado por tiempo agotado.** `stepGateTimeoutMs` (300000 por defecto) libera la compuerta y escala a una
  pausa **force** a nivel de turno, de modo que una punta larga ni se bloquea ni gotea un paso cada cinco minutos.
- **Botón «⏸ Pausar sesión»** (cliente, slot `conversation.input.right`, id `session-guard-pause`,
  order 20 — a la izquierda del botón de congelación de input-traffic). Sondea `/session-guard/state` una vez por segundo,
  permanece desactivado mientras nada esté retenido, y llama a `stepResume` cuando lo está. La insignia de estado se movió a
  order 40 y ahora informa del número de sesiones retenidas a nivel de paso.
- **Nuevos ajustes**: `stepLevelPause`, `stepGateTimeoutMs`.
- **Nuevos estados**: `GET /session-guard/state` ahora devuelve `paused: { step, turn }` y
  `stepGate: { held, since, bypass }`; `/status` devuelve `stepHeld`; `/diag` devuelve `stepGate`.
  El `state().paused` del puerto de servicio sigue siendo booleano por compatibilidad (nuevo campo `pausedStep`).

### Corregido

- **Bloqueo mutuo entre un paso retenido y una pausa a nivel de turno.** `pauseTask` / `resumeTask` /
  `cancelTask` liberan ahora la compuerta de paso primero: una retención de paso está en `agent/pre-step`, donde nunca
  puede llegar un `assistant/message` o un `tool/result`, de modo que una pausa `safe` esperaba para siempre y
  nunca persistía `paused`.

### Cambiado

- **La entrada en punta ya no interrumpe los turnos en curso** cuando `stepLevelPause` está activado (`onEnterPeak` arma
  la compuerta de paso en vez de llamar a `stopNextTurn`); desactivado, el comportamiento anterior a nivel de turno no cambia.
- La etiqueta del botón de congelación de input-traffic ahora es **"Freeze & append"** (`冻结追加` / `凍結して追加` /
  `동결 후 추가`), y la de reanudación **"Resume & append"** (`恢复追加` / `再開して追加` /
  `재개 후 추가`) — congela el turno y conserva los mensajes en cola, distinto del botón de pausa.
- **El botón de pausa es ahora un conmutador**: "Pausar sesión" / "Reanudar sesión" (sin estado gris desactivado).
  Pulsar "Pausar sesión" llama a la nueva acción `stepPause`, que retiene la sesión en el **siguiente
  límite de paso** (paso 1 incluido, sin importar punta ni proveedor); "Reanudar sesión" llama a
  `stepResume`. Nuevo método del puerto `sessionGuard.stepPause(sessionId)`.
- **Empuje SSE**: la nueva ruta `GET /session-guard/events?session=<id>` empuja los cambios de estado de la
  compuerta de paso en el momento en que ocurren, de modo que las retenciones automáticas de punta voltean el botón a
  "Reanudar sesión" sin esperar un sondeo; el sondeo de `/session-guard/state` cada 10 s queda como respaldo. `/state` ahora informa
  `paused.manual` y `stepGate.manual`.
- **Estilo alineado** con el botón composer de input-traffic (24 px de alto, 6 px de radio, fuente 12 px, los mismos
  tokens border/hover/pressed) tanto para el botón de pausa como para la insignia de estado; los estilos se
  inyectan una sola vez mediante `<style data-plugin-css="session-guard-client">`.

## Sin publicar

### Añadido

- **Guardia bidimensional de fuentes oficiales (punta × proveedor de destino).** Las horas punta ahora bloquean solo
  las solicitudes cuya ruta de destino es una fuente oficial de DeepSeek; los proveedores locales/externos siguen
  funcionando. Orden del veredicto: lista explícita de id `officialProviders` → endpoint `baseURL` en vivo →
  endpoint integrado en el catalog (el `deepseek` de pi-ai) → id integrado (`deepseek-official`); cada veredicto
  informa `matchedBy`. Módulos nuevos: `src/provider.js` (puro), `src/provider-directory.js`,
  `src/deferrals.js`, `src/request-guard.js`, `src/targets.js`, `src/wiring.js`.
- **Red de seguridad a nivel de solicitud (`agent/request`).** Cubre las sesiones iniciadas tras el inicio de la punta y
  las sesiones cambiadas a una fuente oficial durante la ejecución — el tick de 30 s solo atendía a las sesiones ya
  `running` en la transición. El modo `hold` por defecto suspende la solicitud sin error
  y la libera en el instante exacto fuera de punta (`msUntilOffPeak`); el modo `error` lanza un fallo reconocible
  `PEAK_DEFERRED` y registra un diferimiento para la reanudación fuera de punta.
- **Nuevos ajustes**: `providerGuard`, `officialProviders`, `officialBaseURLs`, `deferredResume`,
  `deferredResumeText`, `deferredMode`, `deferredMaxHoldMs` (6 h por defecto), `guardSubagents`.
- **Nuevas rutas**: `GET /session-guard/provider?provider=<id>` (diagnóstico del veredicto);
  `/session-guard/status` ahora informa `providerGuard` / `held` / `deferred`;
  `/session-guard/state` informa el último destino de la sesión.
- **Centinela contra la deriva** `tools/check-api-drift.ps1` que verifica la existencia de las APIs requeridas en
  `dsh-v0.1.1-rc.2` / `dsh-v0.1.2-rc.1` / `dsh-v0.1.3-alpha.2` / `dsh-v0.1.5-alpha.1`.

### Cambiado

- **Soporte de doble versión de DSH (0.1.0-rc.7 … 0.1.2-rc.1).** Un solo artefacto cubre ahora tanto
  `dsh-v0.1.1-rc.2` como `dsh-v0.1.2-rc.1`. La doble lectura del id de llamada de `tool/result`
  (primero `content[].toolCallId`, respaldo en `source.callId` — ambas formas aparecen en los registros de reproducción de
  ambas versiones) se extrajo a `src/tool-call-id.js`, sin dependencias, con pruebas unitarias.
  `dsh.client.inject` ya no nombra a `@deepseek-ai/dsh-client-runtime` (eliminado en 0.1.2) ni a
  `@deepseek-ai/dsh-client-ui-slots` (no es una fila de cliente dinámica); rangos de pares ampliados a
  `>=0.1.0-rc.7 <0.2.0-0` y eliminado el paquete retirado. Se añadieron `engines.dsh` y una
  tabla de compatibilidad de versiones al README (ZH/EN).
- **La superficie de ajustes se queda en la API de intersección**: solo `settings.register` + `settings.get`;
  `installSection` (0.1.2+) y el `installSettingsSection` eliminado no se usan nunca. Las APIs opcionales
  (`model/selection`, `llm.listConfigurableProviders`, `settings.get`) se sondan por capacidad y
  degradan en lugar de lanzar.
- **`src/retry.js` hace cortocircuito solo con el centinela exacto `PEAK_DEFERRED`.** Los fallos 429 / `RATE_LIMIT` /
  `TRANSPORT` / timeout siguen siendo transitorios, así que el reintento global de DSH (`dsh-llm-retry` en
  `agent/request-error`) y la semántica de reintento propia de este plugin no cambian. `dsh-llm-retry`
  en sí jamás se toca.
- La insignia distingue "punta · solo oficial" de "punta · todo en pausa".

## 0.1.4 — 2026-09-09

### Cambiado

- **Publicación beta pública** de la línea de doble versión (`0.1.4-beta.1`): metadatos de versión, tabla de compatibilidad
  del README y metadatos del paquete alineados para el canal beta.

## 0.1.3 — 2026-09-09

### Corregido

- **Codificación de package.json restaurada**: la descripción estaba corrompida (bytes GB2312 leídos como UTF-8); reescrita con el texto chino correcto.
- **Metadatos ausentes**: se añadieron los campos `repository` y `homepage`.
- **peerDependencies corregidas**: se retiró la versión exacta fijada de `dsh-llm`; se añadieron `cordis`, `dsh-client-runtime`, `dsh-client-locale`, `dsh-client-ui-settings`, `dsh-client-ui-slots` como pares opcionales acordes con `dsh.client.inject`.
- Se añadió el manifiesto `dsh.plugin.json`.

## 0.1.2 — 2026-08-28

### Corregido

- **Zona horaria de punta corregida**: 峰谷判定固定北京时间 (`BILLING_TIMEZONE`), detección del fin de semana con la zona configurada.

## 0.1.1 — 2026-08-24

### Añadido

- **Reintento automático del backend (D9)**: los fallos transitorios `turn/end` (error/429/max-tokens) disparan una reanudación `followup(retryText)` con retroceso adaptativo; los fallos permanentes (autenticación/saldo/modelo/límite de contexto) paran; la intervención del usuario o un turno con éxito reinician el contador de fallos consecutivos.
- **Cesión durante congelación/compuerta**: el reintento se salta cuando `isFrozen(sessionId)` es verdadero (queueLocked / paused / taskControl paused), jamás rodea la compuerta de sesión.

### Cambiado

- El puerto redundante `sessionGuard` ahora expone `state(sessionId)` que devuelve `{ queueLocked, lockReason, paused, taskControlAvailable, taskControl }`.
- La ruta HTTP `GET /session-guard/diag` devuelve diagnóstico de tiempo de ejecución incluido el estado de reintento.

### Corregido

- La detección del fin de semana usa ahora `Intl.DateTimeFormat` con la zona horaria configurada en lugar del `getUTCDay()` desnudo, corrigiendo un fallo de frontera de 8 horas para la zona horaria de Pekín.

## 0.1.0 — 2026-08-18

### Añadido

- Lanzamiento inicial: pausa automática en punta (global), modo fin de semana, congelación/reanudación por sesión mediante el puerto redundante `sessionGuard` + puente RPC, compuerta de sesión propia (`agent.cancel keepInbox + goals.pause + session/event frontera segura + reanudación por followup`), panel de ajustes (Ajustes → Plugins → session-guard).

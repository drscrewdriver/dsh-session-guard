<p align="center">
  <strong>Compuerta automática de sesión en horas punta: modo fin de semana + pausa automática en punta + veredicto bidimensional de fuentes oficiales + congelación a nivel de sesión + reintento automático del backend</strong>
</p>
<img width="832" height="182" alt="00c4b89a-b026-4bf1-a358-a068e80d2da7" src="https://github.com/user-attachments/assets/31a8836f-0fe0-4043-948a-f0865bb1b3bb" />

<p align="center">
  <a href="README.en.md">English</a> · <a href="README.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.it.md">Italiano</a> · <a href="README.ru.md">Русский</a> · <strong>Español</strong>
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
- [README en ruso](./README.ru.md)
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
- [Changelog en ruso](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)

> **Nota de compatibilidad:** la v0.1.1 ya incluye diccionarios de japonés (`ja`) y coreano (`ko`), pero las versiones oficiales actuales de DSH solo exponen `zh` y `en` a través de `LocaleRuntime`. En un DSH sin modificar, seleccionar `ja` o `ko` falla con `locale "<id>" is not registered`. Habrá que esperar a que el DSH oficial añada los identificadores de configuración regional correspondientes. Los usuarios avanzados pueden mantener un fork de DSH para ampliarlo.

> **▼ Compatibilidad de versiones de DSH**
>
> | Versión de DSH | Carga | Registro de ajustes | Eventos de sesión / compuerta | Mitad cliente |
> | --- | --- | --- | --- | --- |
> | 0.1.0-rc.7 ~ 0.1.1-rc.x | ➖ fuera de esta línea (versiones históricas anteriores a `legacy/0.1.2`) | `ctx.settings.register(ns, schema, { base })` | ✅ misma forma | ✅ sin importar valores de plataforma |
> | 0.1.2-alpha.2+ / 0.1.2-rc.1 | ➖ fuera de esta línea → usar `legacy/0.1.2` (npm `@dsh-0.1.2`) | `register` se mantiene (se añade `installSection`) | ✅ misma forma | ✅ sin importar valores de plataforma |
> | **0.2.0-rc.1+** | ✅ (**esta línea**, dist-tag `dsh-0.2.0`, npm `4.0.0`) | declarativo: los campos `.volatile()` del Config los proyecta el host como formularios, `register` eliminado | ✅ eventos leídos por la doble vía `snapshotEvents()` | ✅ tarjeta de ajustes del cliente migrada a `configForms` |
> | 0.1.7-rc.1+ | ✅ (rama `compat/0.1.7`, dist-tag `dsh-0.1.7`) | declarativo: los campos `.volatile()` del Config los proyecta el host como formularios, `register` eliminado | ✅ eventos leídos por la doble vía `snapshotEvents()` | ✅ tarjeta de ajustes del cliente migrada a `configForms` |
> | 0.1.5-rc.2 | ✅ (rama `compat/0.1.5`, dist-tag `dsh-0.1.5`) | `register` sigue presente (espacios de nombres como cadenas) | ✅ eventos leídos por la doble vía `snapshotEvents()` | ✅ |
>
> **Identidad de esta línea**: rama `compat/0.2.0`, número de versión npm **`4.0.0`** (semver), dist-tag **`dsh-0.2.0`**.
> Los `engines.dsh` de `package.json` y `dsh.plugin.json` y los cuatro pares `@deepseek-ai/dsh-client-*`
> se unifican en `>=0.2.0-rc.1 <0.2.1-0`; el límite inferior del par `@deepseek-ai/cordis` se alinea con el `^4.0.4` de la línea del host.
> Históricamente el README usó «2.x / 3.x» como **apodos de línea**: era una costumbre narrativa, **no números de versión
> descargables del registro** — guíate siempre por las versiones npm `0.3.1` (línea 0.1.2), `3.0.0`/`3.0.1` (línea 0.1.5),
> `3.2.4` (línea 0.1.7) y `4.0.0` (línea 0.2.0).
>
> **Adaptación a 0.2.0 (rama compat/0.2.0, npm 4.0.0)**:
> la API de plugins que usa este complemento (manifest/settings/HMR/slot/sesión V4) es en 0.2.0-rc.1 totalmente compatible con 0.1.7;
> la adaptación es un simple relevo de metadatos (peer/engines/dist-tag/versión 4.0.0). Correcciones de ingeniería alineadas junto con la base:
> ① `src/client/family-section.tsx` entra en el control de versiones (antes existía solo en el árbol de trabajo local, un checkout limpio no podía compilar);
> ② la configuración de eslint elimina el `no-unused-vars` del núcleo, que marcaba erróneamente parámetros de firmas de tipos TS; la línea base de lint vuelve a estar toda en verde;
> ③ las compuertas estáticas de firma de las rutas de escritura v4 (`tests/source-kind.test.mjs`) entran en esta línea junto con la base;
> ④ el par `@deepseek-ai/cordis` se alinea con `^4.0.4` (los paquetes de UI del host 0.2.0-rc.1 declaran `~4.0.4`; el anterior `^4.0.1` no entraba en conflicto, pero su límite inferior era demasiado antiguo).
>
> **Dónde quedan las otras líneas**: para hosts DSH `0.1.2-rc.x` usa la rama **`legacy/0.1.2`** (dist-tag npm
> `dsh-0.1.2`, versión `0.3.1`). **`main` está congelado en `0.2.0-beta.1` y ya no es la rama de publicaciones de la línea 0.1.2.**
> Para hosts DSH `0.1.0-rc.7` ~ `0.1.1-rc.x` usa versiones históricas ≤ `0.1.2`.
> Definiciones de las fuentes de los campos:
> `mine-dsh-plugins/improve-dsh-plugins/DSH-PLUGIN-VERSION-DISTRIBUTION-STRATEGY.md` §2.2.
>
> **Adaptación a 0.1.5 (rama compat/0.1.5, npm 3.0.0)**:
> ① doble vía para `agent.followup` — 0.1.5 convierte el Inbox en una proyección de solo lectura del bucle del agente; si `followup`
> ya no existe, se recurre a `agent.send`, y si no existe ninguno de los dos se degrada a un warn sin lanzar errores (red de seguridad para la reanudación);
> ② los mensajes de reanudación añaden a `source` el campo `form: 'instructions'` (contrato ContextFormed de 0.1.5, las versiones anteriores lo ignoran);
> ③ `webServer.register` se envuelve en try/catch: un fallo de registro solo queda en el registro y no tumba la carga de plugins del host;
> ④ 0.1.5 elimina el acceso de matriz a `session.events`; la lectura de eventos pasa por `snapshotEvents()` como vía principal +
> respaldo en la matriz antigua (afecta solo a las dos rutas auxiliares `findToolOutcome` / `lastUserPrompt`, la comparación por tipo de evento no cambia).
> Verificado que el contrato `WebRoute` de 0.1.5 (exact/prefix + SSE) no cambia: el cliente
> `fetch('/session-guard/...')` no necesita el prefijo `/api`.
> La tabla de compatibilidad de abajo abarca dos generaciones de API (0.1.1 / 0.1.2); esta línea solo reclama la fila 0.1.5.
> `session/event`, `agent.cancel`, `goals.pause`,
> `agent.followup`, `commands.register`, `timer.interval`, `webServer.register`,
> `agent/request`, `llm.listConfigurableProviders`, `settings.register/get` tienen firmas
> idénticas entre `dsh-v0.1.1-rc.2` y `dsh-v0.1.2-rc.1` (esta línea está verificada hasta `dsh-v0.1.5-rc.2`);
> lo único que exige doble lectura es la forma del id de llamada que registra `tool/result` (prioridad de `content[].toolCallId`,
> respaldo en `source.callId`), extraída a `src/tool-call-id.js` con pruebas unitarias — en los registros de reproducción de ambas versiones pueden aparecer ambas formas.
> Desde 0.1.5 el acceso de matriz a `session.events` está eliminado; esta línea lee por `snapshotEvents()` (conservando el respaldo de la matriz antigua),
> afectando solo a las dos rutas auxiliares `findToolOutcome` / `lastUserPrompt`.
> El evento `model/selection` existe **solo desde 0.1.2**, sirve únicamente para acelerar el cambio de modelo y exige siempre detección de capacidad; la superficie de ajustes usa solo
> la intersección de `register` + `get` (nunca `installSection` / el `installSettingsSection` eliminado).
> Script centinela contra la deriva: `tools/check-api-drift.ps1` (esta línea verifica por defecto contra `dsh-v0.1.5-rc.2` la existencia de las interfaces necesarias).

> Pausa automáticamente las sesiones en ejecución durante las horas punta y las reanuda automáticamente fuera de punta y los fines de semana; junto con el botón de congelación de input-traffic consigue un bloqueo **a nivel de sesión**; el **reintento automático** del backend cede el paso durante la congelación/la compuerta. El núcleo se basa en una **compuerta de sesión propia** (`agent.cancel keepInbox + goals.pause + session/event frontera segura + reanudación por followup`) y ya no depende de dsh-task-control.

Plugin de cordis montado con el comando `dsh plugin` y un parche del bundle — sin modificar el código fuente de dsh y sin PR.

> 💡 **Por qué se recomienda**: DeepSeek aplica desde el 2026-08-17 una **facturación por horas punta y valle** — en las horas punta (hora de Pekín 9:00-12:00, 14:00-18:00) el precio unitario es el **doble** que en horas valle (incluidas las de mediodía, noche, fines de semana y festivos). Este complemento detiene automáticamente las sesiones en ejecución durante la punta y las reanuda automáticamente al salir de ella; las ejecuciones largas escalonadas pueden ahorrar hasta un **50 %**; la congelación manual (con el botón de input-traffic) permite un control aún más preciso, sesión a sesión.

## Resumen de funciones

- **Modo fin de semana**: identifica los fines de semana (con `Intl.DateTimeFormat` según la zona horaria configurada, evitando el clásico fallo de 8 horas en el límite UTC+8 del `getUTCDay()` desnudo para la hora de Pekín) → los fines de semana se ignoran punta y valle y se ejecuta con libertad.
- **Pausa automática en punta (global)**: al entrar en punta (y si no es fin de semana), pausa automáticamente todas las sesiones raíz `running`; al salir de punta las reanuda todas automáticamente — **interruptor global, sin gestión manual**.
- **Veredicto bidimensional de fuentes oficiales (providerGuard)**: en las horas punta solo se bloquea **si el destino de la solicitud es una fuente oficial de DeepSeek**; con proveedores locales/externos (como `local-35b`) la ejecución sigue con normalidad, sin que la afecte la compuerta de punta. Criterio de veredicto = lista explícita de id → endpoint de `baseURL` → endpoint por defecto del catalog → id integrado.
- **Red de seguridad a nivel de solicitud + cola diferida**: las sesiones iniciadas tras el inicio de la punta, o cambiadas a mitad de camino a una fuente oficial, las captura la guardia a nivel de solicitud `agent/request` (por defecto `hold`: la solicitud queda suspendida sin error y se libera automáticamente al salir de punta).
- **Congelación / reanudación a nivel de sesión**: puerto redundante `sessionGuard` + `POST /session-guard/rpc`, conectado sesión a sesión mediante el botón de congelación de input-traffic; también ofrece los comandos manuales `/pause /resume /cancel`.
- **Reintento automático del backend (D9)**: los fallos transitorios de turn/end (error/429/max-tokens) se reanudan automáticamente con retroceso adaptativo; los fallos permanentes detienen; **cede el paso durante congelación/compuerta**, nunca la rodea.
- **fail-open**: compuerta de sesión propia no disponible, session-guard no instalado, servicio de ajustes ausente — en todos los casos degradación silenciosa, nunca un fallo por causa de una dependencia.

## Vista previa de la interfaz

Captura de una ejecución real (Windows, dsh web) — modo fin de semana activo:

<figure>
  <img style="max-width:100%" alt="Barra de control de estado del área de entrada: el botón «Fin de semana» activo aparece resaltado (con el modo fin de semana activo las sesiones corren libres, sin tener en cuenta punta y valle), junto a él el botón «Congelar sesión» (con input-traffic), el nivel de razonamiento DeepSeek-V4-Flash y los controles de envío, y abajo barras de estado con turnos/pasos, tiempo del LLM, aciertos de caché, etc." src="assets/高峰低峰周末提醒-周末状态.png" />
  <figcaption>Modo fin de semana activo: la insignia de «fin de semana» del área de entrada aparece resaltada, junto a «Congelar sesión»; los fines de semana se ignoran punta y valle y las sesiones corren libres.</figcaption>
</figure>

## Instalación

```bash
# Hosts DSH 0.1.5-rc.x (esta línea, dist-tag dsh-0.1.5)
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5

# o directamente desde la rama git
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.5

# Los hosts DSH 0.1.2-rc.x deben usar la línea 0.1.2
dsh plugin --profile web add dsh-session-guard@dsh-0.1.2
```

`compat/0.1.5` es la línea dedicada a DSH `0.1.5-rc.x`, número de versión npm **`3.0.0`**; los hosts DSH `0.1.2-rc.x` deben usar la
rama **`legacy/0.1.2`** (dist-tag npm `dsh-0.1.2`, versión `0.3.1`). **`main` está congelado en `0.2.0-beta.1`,
ya no es la rama de publicaciones de la línea 0.1.2.**

> ⚠️ No confíes en el nombre de paquete desnudo `dsh-session-guard`: la etiqueta `latest` de npm no puede servir a la vez dos líneas de
> versión mutuamente excluyentes (sus `engines.dsh` son excluyentes según las reglas de semver para prerelease) — hay que indicar siempre el dist-tag de forma explícita.

Tras instalar, reinicia dsh web y actualiza la página.

## Ajustes (Ajustes → Plugins → session-guard, interruptores simples)

| Interruptor | Por defecto | Descripción |
|---|---|---|
| `enabled` | on | **Pausa/congelación automática de sesiones en punta**: pausa automáticamente las sesiones en ejecución durante las horas punta |
| `stepLevelPause` | on | **Compuerta a nivel de paso**: en punta cierra la compuerta **antes** de la solicitud al modelo del siguiente paso (antes y con más ahorro que la pausa a nivel de turno); off vuelve a la pausa a nivel de turno |
| `providerGuard` | on | **Veredicto bidimensional de fuentes oficiales**: en punta solo se bloquean las fuentes oficiales de DeepSeek, los proveedores locales/externos siguen con normalidad |
| `guardSubagents` | on | **Incluir solicitudes de subagentes**: las solicitudes de subagentes también se facturan, por defecto se bloquean igualmente |
| `offPeakAutoResume` | on | **Reanudación automática en horas valle**: las sesiones pausadas se reanudan automáticamente en horas valle; off no hay reanudación automática al salir de punta (hace falta acción manual) |
| `weekendMode` | on | **Modo fin de semana**: identifica los fines de semana → sin pausa automática los fines de semana (no hay punta, se ejecuta con libertad) |
| `deferredResume` | on | **Reanudación automática tras la punta**: off las solicitudes/sesiones diferidas no se reanudan solas, hace falta un `/resume` manual |
| `queueFallback` | on | Respaldo en la cola de espera bajo bloqueo cuando la compuerta de sesión propia no está disponible (fail-open) |
| `retryEnabled` | off | **Reintento automático (backend)**: reanudación automática tras fallos transitorios (desactivado por defecto, conservador) |

Configuración adicional:

- `timezone` (por defecto Asia/Shanghai) — zona usada para la **detección del fin de semana** y la visualización de la insignia; **no afecta a la detección de punta/valle** (siempre hora de Pekín);
- `peakWindows` (por defecto 09:00–12:00 / 14:00–18:00) — ventanas de punta/valle en hora de Pekín (UTC+8), en línea con la facturación oficial de DeepSeek;
- `pauseMode` (`safe`/`force`), `pauseReason` (`wait`/`stop`) — forma de efectuar la pausa;
- `stepGateTimeoutMs` (por defecto 300000) — tiempo máximo de espera de la compuerta de paso; al vencer, se libera la compuerta y **se escala a una pausa a nivel de turno** (antibloqueo, sin «un paso cada 5 minutos» y el goteo de tokens que supone);
- Veredicto de fuentes oficiales: `officialProviders` (id de proveedores oficiales adicionales, separados por comas, prioridad máxima), `officialBaseURLs` (lista de hosts de endpoints oficiales, por defecto `api.deepseek.com`);
- Cola diferida: `deferredMode` (`hold` mantiene en espera / `error` da error y difiere), `deferredResumeText` (texto de reanudación al salir de punta), `deferredMaxHoldMs` (límite de espera, 6 horas por defecto, al vencer pasa a error);
- Parámetros de reintento: `retryText`, `retryGraceMs`, `retryCooldownMs`, `retryBackoffFactor`, `retryBackoffMaxMs`, `retryMaxConsecutive`.

## Comportamiento

### Compuerta automática de punta (global)

- **Entrada en punta** (y no fin de semana): con `stepLevelPause` activado el turno **ya no se interrumpe de inmediato** — la sesión avanza con naturalidad hasta el siguiente límite `agent/pre-step`, donde se cierra la compuerta de paso (ver la sección siguiente); desactivado, se llama a `gate.stopNextTurn` sobre todas las sesiones raíz `running` (pausa real mediante la compuerta de sesión propia, o respaldo en la cola de espera bajo bloqueo según `queueFallback`);
- **Salida de punta / fin de semana**: primero `releaseAll` libera los pasos retenidos (el turno continúa en su sitio), después `gate.resume` sobre **todas** las sesiones — controlado por el interruptor `offPeakAutoResume`, desactivado no hay reanudación automática al salir de punta;
- **Zona horaria de punta/valle**: siempre hora de Pekín (`Asia/Shanghai`), en línea con la base de facturación oficial de DeepSeek, sin verse afectada por el ajuste `timezone`;
- Máquina de estados: instancia única `NORMAL ↔ PAUSED_PEAK` (`scheduler.js`), impulsada por un único tick de 30 s.

### Compuerta a nivel de paso (v0.2.0, la clave del ahorro de tokens)

Enganchada a la cascada `agent/pre-step`: el turno se suspende **antes de que ocurra la solicitud al modelo del siguiente paso**.

- **Condiciones de cierre** (todas necesarias): `enabled` + `stepLevelPause` + `step > 1` + punta (hora de Pekín, no fin de semana) + proveedor de destino oficial (`providerGuard`, si está desactivado se bloquean todos) + sesión no retenida ya a nivel de solicitud + no saltada manualmente en esta punta;
- **Por qué `step > 1`**: el primer paso de un turno lo cubre la guardia a nivel de solicitud, para que las dos compuertas no se solapen;
- **Vías de liberación**: ① botón «⏸ en pausa (continuar)» / `POST /session-guard/rpc {action:'stepResume'}` / `/resume` → deja pasar el paso actual y **deja de bloquear esta sesión por el resto de la punta**; ② salida de punta → todo se libera, el turno continúa en su sitio (**no hace falta followup**); ③ botón de congelación / `/pause` / `/cancel` → se libera la compuerta y se pasa a la pausa a nivel de turno; ④ abort de la `signal` (cancelación del usuario) → liberación;
- **Escalado por tiempo**: una suspensión mayor que `stepGateTimeoutMs` (5 minutos por defecto) → se libera la compuerta y **se escala a una pausa force a nivel de turno**, con reanudación uniforme al salir de punta (sin bloqueos definitivos ni goteo de tokens durante la punta);
- **Estado**: `GET /session-guard/state?session=<id>` devuelve `paused: { step, turn }` y `stepGate: { held, since, bypass }`; el `paused` del puerto de servicio `state()` **sigue siendo booleano** (compatibilidad hacia atrás), el estado del paso va en `pausedStep`;
- **No se persiste**: la suspensión es una Promise en el proceso, se pierde al reiniciar (evita estados fantasma).

#### Botones «Pausar sesión / Reanudar sesión» (proporcionados por session-guard)

El botón «Pausar sesión» a la derecha del área de entrada (slot `conversation.input.right`, id `session-guard-pause`, order 20, a la izquierda del «❄ Congelar y añadir» de input-traffic):

- sin pausar → «Pausar sesión», **pulsable**: el clic llama a `stepPause` y pausa la sesión **antes de la solicitud al modelo del siguiente paso** (sin interrumpir el paso actual; el paso 1 también se retiene, sin condiciones de punta/valle ni de proveedor);
- pausado → «Reanudar sesión», el clic llama a `stepResume`: deja pasar el paso actual y deja de bloquear esta sesión por el resto de la punta;
- **Empuje de eventos**: `GET /session-guard/events?session=<id>` (SSE) notifica **al instante** los cambios de estado de la compuerta de paso — cuando la punta cierra la compuerta automáticamente el botón pasa enseguida a «Reanudar sesión», sin esperar al sondeo; además, un sondeo de `/session-guard/state` cada 10 segundos actúa de red de seguridad (converge incluso con el SSE no disponible/desconectado);
- estilo alineado con los botones de input-traffic de la misma fila (24 px de alto / 6 px de radio / fuente de 12 px / los mismos tokens CSS), con respuesta visual al pasar el ratón y en estado de pausa.

### Bloqueo de sesión (congelación)

- **Puerto redundante**: `ctx.provide('sessionGuard', service)` — `stopNextTurn(sessionId)` / `resume(sessionId)` / `lockQueue(sessionId)` / `unlockQueue(sessionId)` / `state(sessionId)`;
- **Puente RPC**: `POST /session-guard/rpc { action, sessionId }` — el botón de congelación de input-traffic llama a `stopNextTurn` / `resume` **sesión a sesión** según `sessionId`; se omite silenciosamente si este complemento no está instalado (fail-open D8);
- **Comandos manuales**: `/pause [force|safe] [stop|wait]`, `/resume [confirm] [rerun|skip]`, `/cancel` — actúan sobre la sesión que los invoca (tomando `invocation.agent.id`).

### Reintento automático del backend (D9)

Escucha `turn/end` y clasifica los fallos:

- **Fallos transitorios** (error/429/max-tokens, etc.) → reanudación automática `followup(retryText)` con retroceso adaptativo;
- **Fallos permanentes** (autenticación/saldo/modelo/límite de contexto) → parada;
- **Cede el paso durante congelación/compuerta**: no reintenta cuando `isFrozen(sessionId)` es verdadero (queueLocked / paused / taskControl paused);
- La intervención del usuario o un turno con éxito reinician el contador de fallos consecutivos.

### Insignia de estado (visualización en el frontend)

A la derecha del área de entrada aparece una insignia de estado **puramente informativa** que refleja en tiempo real la fase actual:

| Fase | Texto de la insignia | Clase CSS | Significado |
|---|---|---|---|
| `peak` (veredicto bidimensional activo) | 高峰·拦官方 | `sg-peak` | Horas punta, solo se bloquean las solicitudes a fuentes oficiales de DeepSeek |
| `peak` (veredicto bidimensional inactivo) | 高峰·全部暂停 | `sg-peak` | Horas punta, todas las sesiones en pausa |
| `off-peak` | 谷时 | `sg-off` | Fuera de punta, las sesiones funcionan con normalidad |
| `weekend` | 周末 | `sg-weekend` | Fin de semana (con el modo fin de semana activo), se ignoran punta y valle |

- **Sondeo**: cada 15 segundos se solicita `GET /session-guard/status`, para obtener el `phase` global, `providerGuard`, `held`, `deferred`, `stepHeld`;
- **fail-open**: ruta inaccesible, error de red o `enabled` desactivado → la insignia se oculta en silencio, sin afectar a ninguna sesión;
- **Independiente de input-traffic**: la insignia la dibuja únicamente el cliente de session-guard, se muestra **sin necesidad de instalar el complemento input-traffic**. input-traffic solo aporta el botón de congelación, sin relación de dependencia con la insignia;
- **Tooltip**: al pasar el ratón muestra `fase · zona horaria · modo fin de semana · criterio de veredicto · números de retenciones/diferidos/retenciones de paso`.

### Criterio de veredicto de fuentes oficiales (providerGuard)

En punta no se detienen las sesiones sin más: primero se comprueba si «la ruta por la que realmente irá esta solicitud es una fuente oficial de DeepSeek»:

| Prioridad | Base | `matchedBy` | Ejemplo |
|---|---|---|---|
| 1 | lista explícita de id en `officialProviders` | `explicit` | el usuario declara oficial su propia pasarela |
| 2 | host de la `baseURL` normalizada en tiempo real | `endpoint` | `deepseek-official` apuntado a un relé → **no se bloquea** |
| 3 | endpoint por defecto integrado en el catalog | `endpoint-default` | la ruta `deepseek` de pi-ai apunta por defecto a la API oficial → **se bloquea** |
| 4 | lista de id integrada (`deepseek-official`) | `route-id` | respaldo cuando el endpoint no es legible |
| 5 | cualquier otra cosa | `unknown` | no oficial, se deja pasar |

- **El endpoint pesa más que el id**: una configuración llamada `deepseek-official` pero con `baseURL` apuntando a un relé **no** se bloquea por error; al revés, la ruta `deepseek` integrada de pi-ai tiene por defecto la API oficial como endpoint y **no** escapa del bloqueo.
- **Origen de los endpoints**: `ctx.get('llm').listConfigurableProviders()` localiza la entrada del catálogo → `ctx.settings.get(settingsNs)` lee la `baseURL` vía `settingsPath` (solo se leen campos no secretos, el valor de `apiKeyEnv` jamás se lee). Se recalcula en cada solicitud y no se cachea → los cambios en caliente de la configuración de un proveedor surten efecto al instante.
- **Cambiar a no oficial reanuda la sesión**: si tras la pausa de punta la sesión se cambia a un proveedor local/externo (evento `model/selection` desde 0.1.2+) → esa sesión se reanuda automáticamente (sujeto a `deferredResume`); solo se tocan las sesiones que este complemento pausó al entrar en punta, las pausadas manualmente con `/pause` **jamás** se tocan. Sin ese evento en 0.1.1 → se degrada a «la siguiente solicitud o un `/resume` manual».
- **Endpoint ilegible**: servicio `llm` ausente, estructura del espacio de nombres cambiada, campo no cadena — siempre se degrada al veredicto por id / endpoint integrado registrando el `matchedBy`, **nunca se lanza una excepción**.
- **Investigar un veredicto erróneo**: `GET /session-guard/provider?provider=<id>` devuelve `{ official, matchedBy, endpoint }`.

### Guardia a nivel de solicitud y cola diferida

- **Por qué a nivel de solicitud**: el tick de 30 s solo atiende, en el salto `NORMAL → PAUSED_PEAK`, a las sesiones que estaban `running` en ese momento; las sesiones iniciadas tras el inicio de la punta o cambiadas a mitad de camino a una fuente oficial se le escapan. La cascada `agent/request` es la red que pasa **con cada solicitud**.
- **El veredicto se basa en el valor devuelto por `next()`**: el middleware de selección de modelo sobrescribe provider/model dentro de la cascada con los valores elegidos en la interfaz, así que hay que hacer primero `await next()` y juzgar después.
- **Modo hold (por defecto)**: la solicitud queda suspendida, **sin enviarse ni dar error**, y se libera en el instante exacto de salida de punta (`msUntilOffPeak` con temporización precisa, tick de 30 s como red de seguridad); la cancelación del usuario (abort) interrumpe con normalidad.
- **Modo error**: lanza un error reconocible `PEAK_DEFERRED` + apunta en la cola diferida, con reanudación al salir de punta mediante `deferredResumeText` (sin reanudación automática si `deferredResume` está desactivado).
- **Protección de tope**: si `deferredMaxHoldMs` (6 horas por defecto) vence sin que acabe la punta → pasa a error, para evitar suspensiones infinitas.
- **Regla férrea de exclusión mutua**: durante un hold **jamás** se pide además la pausa por la compuerta de sesión (la pausa espera una frontera segura a la que una solicitud retenida nunca llegará → se esperarían mutuamente). Al entrar en punta se saltan las sesiones ya retenidas.
- **Sin persistencia**: la cola diferida es una promise en el proceso, desaparece al reiniciar.

### Límites (explícitamente fuera de alcance)

- **Sin cambio de proveedor / sin redirección**: solo bloquea, no enruta;
- **La compaction no pasa por `agent/request`**: no puede ocurrir mientras una sesión esté en pausa; una compresión disparada manualmente durante la punta puede alcanzar la fuente oficial (este complemento no intercepta la capa `ctx.llm.stream`);
- **0.1.1 no tiene el evento `model/selection`**: la reanudación automática tras cambiar a una fuente no oficial se degrada a «esperar a la siguiente solicitud o un `/resume` manual» (inmediato desde 0.1.2);
- **Sin nuevas dependencias npm**, sin lectura ni escritura de credenciales, y los reintentos 429 / de capa de transporte de `dsh-llm-retry` no se tocan.

### Manejo y validación de zonas horarias

- La detección de zona se basa en **nombres de zona IANA** (como `Asia/Shanghai`, `Asia/Tokyo`, `Asia/Seoul`), proyectados mediante `Intl.DateTimeFormat` sobre el reloj de pared de la zona configurada, **sin depender del `getUTCDay()` desnudo** — evitando el clásico fallo de 8 horas en el límite UTC+8 de la hora de Pekín (sábado 00:30 hora de Pekín: en UTC aún es viernes);
- `Intl.DateTimeFormat` es a la vez la capa de validación: un nombre de zona no válido (como `Foo/Bar`) lanza una `RangeError`, que un try-catch externo degrada en silencio a la zona por defecto `Asia/Shanghai` (fail-open);
- Las ventanas de punta son **cerradas por la izquierda y abiertas por la derecha** `[start, end)`, con soporte de ventanas que cruzan la medianoche (como `22:00–06:00`);
- El ajuste `timezone` se comporta igual en todos los idiomas (zh/en/ja/ko) — los nombres de zona IANA de `Intl.DateTimeFormat` no dependen de la configuración regional: con interfaz japonesa/coreana el comportamiento de la zona es idéntico al del chino.

### Reparto de tareas con input-traffic: uno «detiene», el otro «hace cola»

Ambos actúan sobre **eslabones distintos de la misma cadena**, y la frontera la fija el propio modelo de inbox de DSH:

```
Entrada del usuario ──(input-traffic elige el tramo)──▶ colas de espera next-step / next-turn
                                        │
                          agent/pre-step ──(compuerta de paso de este complemento)──▶ dejar pasar / retener
                                        │
                            agent/request ──(retención a nivel de solicitud de este complemento)──▶ dejar pasar / retener
                                        │
                                     llamada al modelo
```

**Semántica de las colas de DSH (dos colas, no confundirlas)**

| Cola | Significado | Cuándo se consume |
|---|---|---|
| `next-step` | «Entrada a la espera del siguiente límite de paso» | En el siguiente `agent/pre-step`: **al mismo nivel que un resultado de herramienta**, otro paso dentro del mismo turno |
| `next-turn` | «Prompt a la espera de un turno independiente» | Al cerrarse el turno actual, arrancado como **turno nuevo** |

`Inbox.claim()` **vacía siempre primero `next-step`** y solo toma además **1** elemento de `next-turn` cuando ese límite abre un turno nuevo; el primer paso de un turno lee next-turn, todos los siguientes leen next-step.

**Reparto de responsabilidades**

- **session-guard = detener**: solo decide «cuándo se puede avanzar» y **jamás toca el contenido ni el orden de las colas**.
  - compuerta de paso (`agent/pre-step`): retiene **antes** de la solicitud al modelo del siguiente paso;
  - pausa a nivel de turno (`agent.cancel({keepInbox:true})` + `goals.pause` + frontera segura): detiene el turno actual, **las colas quedan tal cual**;
  - guardia a nivel de solicitud (hold en `agent/request`): retiene **esta única solicitud al modelo**.
- **input-traffic = hacer cola**: solo decide «a qué cola va la entrada del usuario, con qué tramo y cuándo se consume».
  - tres tramos = a qué cola va: rojo «interrumpir» hace primero `cancel()` y luego `steer`; amarillo «intercalar» hace `steer` (→ `next-step`, el siguiente paso del mismo turno); verde «a la cola» se queda en `next-turn`;
  - congelación = extraer las filas `queued` + `steering` (conservando el tramo) + bloqueo del composer + llamada a `sessionGuard.stopNextTurn`; reanudación = quitar el bloqueo → primero `sessionGuard.resume` → reenvío según el tramo.

**Dos reglas férreas en el punto de encuentro**

1. **La congelación debe dejar que este complemento libere primero la compuerta de paso**: la compuerta de paso está enganchada a `agent/pre-step`, mientras que la pausa a nivel de turno espera un evento en la frontera segura — se esperarían mutuamente (`pauseTask` / `cancelTask` de este complemento hacen primero `release`);
2. **Con la compuerta de paso retenida, los mensajes ya fueron tomados**: `preStep()` hace `inbox.claim()` antes de despachar la cascada, así que las entradas nuevas hacen cola detrás del lote ya tomado; `keepInbox` solo aplica a la pausa a nivel de turno.

**Ninguna invasión mutua**: input-traffic no escucha `agent/pre-step` / `agent/request` (única excepción el `cancel()` explícito del tramo «interrumpir», pedido por el propio usuario); este complemento nunca reescribe el contenido ni el orden de `next-step` / `next-turn`.

En cuanto a los botones: los botones «Pausar sesión / Reanudar sesión» de este complemento (order 20) y los de input-traffic «❄ Congelar y añadir / Reanudar y añadir» (order 30) aparecen uno al lado del otro sin sustituirse — los primeros gobiernan la compuerta de paso, los segundos la extracción de la cola + la congelación a nivel de turno.

## Puerto redundante `sessionGuard`

```js
{
  stopNextTurn(sessionId, opts),  // detiene el próximo turno de la sesión (compuerta de sesión propia / respaldo en cola bajo bloqueo)
  resume(sessionId, opts),        // reanuda (confirm + choice: rerun|skip)
  lockQueue(sessionId, reason),   // bloquea explícitamente la cola
  unlockQueue(sessionId),         // desbloquea explícitamente
  stepPause(sessionId),           // solicita manualmente una pausa a nivel de paso (cierre en el siguiente límite pre-step, también el paso 1)
  stepResume(sessionId, opts),    // abre la compuerta de paso (v0.2.0); con opts.bypass=false no se salta esta punta
  state(sessionId),               // { queueLocked, lockReason, paused, pausedStep, stepHeldSince, stepBypass, taskControlAvailable, taskControl }
}
```

## Rutas HTTP

- `GET /session-guard/state?session=<id>` — estado de la sesión (con `paused: { step, turn, manual }` / `stepGate` / último destino / en retención o no / diferida o no)
- `GET /session-guard/events?session=<id>` — **SSE**: notificación inmediata de cambios de estado de la compuerta de paso (el botón se actualiza gracias a esto)
- `GET /session-guard/settings` — ajustes + disponibilidad de taskControl
- `GET /session-guard/status` — fase global actual (sondeo de la insignia de estado; incluye `stepHeld`)
- `GET /session-guard/provider?provider=<id>` — diagnóstico del veredicto de fuente oficial (`official` / `matchedBy` / `endpoint`)
- `GET /session-guard/diag` — diagnóstico en tiempo de ejecución (incluye `stepGate`)
- `POST /session-guard/rpc` — `{ action: stopNextTurn|resume|lockQueue|unlockQueue|stepPause|stepResume|state, sessionId }`

## Almacenamiento del estado

JSON por sesión: `$DSH_HOME/.dsh/session-guard/<sessionId>.json` (escritura atómica; se puede anular con `DSH_SESSION_GUARD_STATE_DIR`).

## Pruebas

```bash
npm test   # node --test tests/*.test.mjs (zonas horarias/fin de semana/máquina de estados/compuerta de sesión/puente/reintento)
```

## Módulos

| Archivo | Responsabilidad |
|---|---|
| `src/time.js` | Detección de punta/fin de semana (con zona horaria correcta) + `msUntilOffPeak` (temporización precisa de la salida de punta) |
| `src/scheduler.js` | Máquina de estados pura NORMAL ↔ PAUSED_PEAK |
| `src/provider.js` | Veredicto de fuentes oficiales a cinco niveles (función pura: normalización de endpoint + matriz de decisión) |
| `src/provider-directory.js` | Catálogo de endpoints (`llm.listConfigurableProviders` + `settings.get`, degradación en toda la cadena) |
| `src/deferrals.js` | Registro de diferidos (retención / liberación / superación del límite / `PeakDeferredError`) |
| `src/request-guard.js` | Guardia a nivel de solicitud en `agent/request` (dos modos hold / error) |
| `src/step-gate.js` | **Compuerta a nivel de paso en `agent/pre-step`** (v0.2.0: cierre / liberación / escalado por tiempo / bypass, el `decideStepHold` puro es unitestable) |
| `src/targets.js` | Seguimiento del «último destino real» de la sesión (`request/header` + `model/selection`) |
| `src/wiring.js` | Orquestación del cableado (filtro de entrada en punta / cableado de la compuerta de paso / liberación al salir de punta / temporización precisa / limpieza al descargar) |
| `src/pause-gate.js` | Motor de la compuerta de sesión propia (agent.cancel keepInbox + goals.pause + frontera segura + reanudación por followup; libera antes la compuerta de paso antes de pausar) |
| `src/pause-store.js` | Persistencia del estado de pausa propio |
| `src/gate.js` | Controlador de la compuerta de sesión (pausa real propia / respaldo en cola bajo bloqueo, fail-open) |
| `src/bridge.js` | Puerto redundante `sessionGuard` |
| `src/retry.js` | Reintento automático del backend (clasificación de fallos/retroceso/cesión durante congelación; cortocircuito solo con el código exacto `PEAK_DEFERRED`) |
| `src/detect.js` | Detección automática (taskControl del host / puente cliente input-traffic) |
| `src/store.js` | Estado persistente por sesión |
| `src/settings.js` | Subsección de ajustes (esquema schemastery + registro fail-open) |
| `src/index.js` | apply en el host (ajustes/rutas/tick/provisión del servicio/cableado del reintento/guardia de solicitudes) |
| `src/client/` | Mitad de navegador (**botón de pausa de sesión** + insignia de estado + tarjeta de ajustes) |

## Licencia

MIT — véase [LICENSE](LICENSE).

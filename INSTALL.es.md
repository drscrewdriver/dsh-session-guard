# Guía de instalación (CLI oficial de DSH)

Esta guía usa únicamente el comando oficial `dsh plugin` de DSH.

- [Guía de instalación en español](./INSTALL.es.md)
- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [Guide d'installation en français](./INSTALL.fr.md)
- [Installationsanleitung auf Deutsch](./INSTALL.de.md)
- [Guida all'installazione in italiano](./INSTALL.it.md)
- [Руководство по установке на русском](./INSTALL.ru.md)
- [English README](./README.en.md)
- [中文 README](./README.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [README en français](./README.fr.md)
- [README auf Deutsch](./README.de.md)
- [README in italiano](./README.it.md)
- [README en ruso](./README.ru.md)
- [README en español](./README.es.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)
- [Changelog en français](./CHANGELOG.fr.md)
- [Changelog auf Deutsch](./CHANGELOG.de.md)
- [Changelog in italiano](./CHANGELOG.it.md)
- [Changelog en ruso](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)

## 0. Requisitos previos

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
```

## 1. Instalar

```bash
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5

# o directamente desde la rama git
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.5
```

`compat/0.1.5` es la línea dedicada a DSH `0.1.5-rc.x`: número de versión del paquete npm **`3.0.0`**, dist-tag
**`dsh-0.1.5`**, con `engines.dsh = >=0.1.5-rc.2 <0.2.0-0` **tanto** en `package.json` como en
`dsh.plugin.json`.

Los hosts DSH `0.1.2-rc.x` deben usar la rama **`legacy/0.1.2`** (dist-tag npm `dsh-0.1.2`,
versión `0.3.1`). **`main` está congelado en `0.2.0-beta.1` y ya no es la rama de publicaciones de la
línea 0.1.2.**

> ⚠️ No confíes en el nombre de paquete desnudo `dsh-session-guard`: la etiqueta `latest` de npm no puede
> servir dos líneas de versión mutuamente excluyentes (sus rangos `engines.dsh` son excluyentes bajo la
> correspondencia de prerelease de semver) — fija siempre el dist-tag de forma explícita.

Reinicia dsh web y actualiza la página.

## 2. Verificar

Abre **Ajustes → Plugins → session-guard**. Interruptores: `enabled`, `providerGuard`, `guardSubagents`,
`offPeakAutoResume`, `weekendMode`, `deferredResume`, `queueFallback`, `retryEnabled`; campos de texto/lista:
`officialProviders`, `officialBaseURLs`, `deferredResumeText`.

Comprueba la insignia de estado en la interfaz de sesión — muestra la fase actual (`高峰·拦官方` / `高峰·全部暂停`
/ `谷时` / `周末`).

Comprueba el veredicto de fuente oficial de una ruta (ruta del host, sin reiniciar):

```bash
curl -s 'http://127.0.0.1:3080/session-guard/provider?provider=deepseek-official'
# {"ok":true,"verdict":{"provider":"deepseek-official","official":true,"matchedBy":"endpoint","endpoint":"https://api.deepseek.com"}}
```

Ejecuta la suite de pruebas (sin red ni credenciales):

```bash
npm test
```

## 3. Actualizar

```bash
dsh plugin --profile web remove dsh-session-guard
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
```

Reinicia dsh web y actualiza la página. Los ajustes viven en `$DSH_HOME/settings.yaml` bajo el espacio
de nombres `session-guard` y sobreviven a la actualización; las claves nuevas (`providerGuard`, `deferredMode`, …)
se quedan en sus valores por defecto hasta que las toques.

Del **plugin** `0.1.3` / `0.1.4-beta.1` al **plugin** `0.1.5-beta.1` el único cambio de comportamiento es que en las horas punta ahora
se bloquean **por defecto solo** los destinos de fuente oficial. Para recuperar el antiguo comportamiento general, pon
`providerGuard: false` (o acota el veredicto con `officialProviders` / `officialBaseURLs`).
(Esas son versiones del plugin, no de DSH — no las confundas con los rangos del host de arriba.)

## 4. Resolución de problemas

| Síntoma | Qué comprobar |
|---|---|
| Las sesiones siguen en marcha durante la punta | `GET /session-guard/status` → `phase` debe ser `peak`; `GET /session-guard/settings` → `enabled: true` |
| Un proveedor local se bloquea durante la punta | `GET /session-guard/provider?provider=<id>` → `matchedBy` debería ser `endpoint`/`unknown` con `official: false`. Si dice `explicit`, quita el id de `officialProviders` |
| Una solicitud oficial NO se bloquea | `matchedBy: 'endpoint'` con `official: false` significa que la `baseURL` de la ruta no está en `officialBaseURLs`; añade ahí el host, o añade el id de la ruta a `officialProviders` |
| Las solicitudes cuelgan en vez de fallar | Ese es el modo `hold`, así está diseñado. Para un error explícito pon `deferredMode: 'error'`, o baja `deferredMaxHoldMs` |
| Tras la punta no se reanuda nada | `deferredResume` debe estar activado (o ejecuta `/resume`); `offPeakAutoResume` controla la reanudación a nivel de sesión |
| Diagnóstico del veredicto no disponible | `GET /session-guard/diag` → `providerGuard`, `configurableProviders`, `held`, `deferred` |

## 5. Desinstalar

```bash
dsh plugin --profile web remove dsh-session-guard
```

Reinicia dsh web. Las solicitudes retenidas se liberan (se rechazan) al descargar — sin fugas de promises.

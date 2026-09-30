# Руководство по установке (официальный CLI DSH)

В этом руководстве используется только официальная команда DSH `dsh plugin`.

- [Руководство по установке на русском](./INSTALL.ru.md)
- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [Guide d'installation en français](./INSTALL.fr.md)
- [Installationsanleitung auf Deutsch](./INSTALL.de.md)
- [Guida all'installazione in italiano](./INSTALL.it.md)
- [Guía de instalación en español](./INSTALL.es.md)
- [English README](./README.en.md)
- [中文 README](./README.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [README en français](./README.fr.md)
- [README auf Deutsch](./README.de.md)
- [README in italiano](./README.it.md)
- [README на русском](./README.ru.md)
- [README en español](./README.es.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)
- [Changelog en français](./CHANGELOG.fr.md)
- [Changelog auf Deutsch](./CHANGELOG.de.md)
- [Changelog in italiano](./CHANGELOG.it.md)
- [Changelog на русском](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)

## 0. Предварительные требования

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
```

## 1. Установка

```bash
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5

# или прямо из ветки git
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.5
```

`compat/0.1.5` — выделенная линия для DSH `0.1.5-rc.x`: номер версии npm-пакета **`3.0.0`**, dist-tag
**`dsh-0.1.5`**, с `engines.dsh = >=0.1.5-rc.2 <0.2.0-0` **одновременно** в `package.json` и
в `dsh.plugin.json`.

Хостам DSH `0.1.2-rc.x` следует использовать ветку **`legacy/0.1.2`** (npm dist-tag `dsh-0.1.2`,
версия `0.3.1`). **`main` заморожен на `0.2.0-beta.1` и больше не является веткой релизов
линии 0.1.2.**

> ⚠️ Не полагайтесь на «голое» имя пакета `dsh-session-guard`: тег `latest` в npm не может обслуживать
> сразу две взаимоисключающие линии версий (их диапазоны `engines.dsh` взаимоисключающи по правилам
> сопоставления prerelease в semver) — dist-tag всегда указывайте явно.

Перезапустите dsh web и обновите страницу.

## 2. Проверка

Откройте **Настройки → Плагины → session-guard**. Переключатели: `enabled`, `providerGuard`, `guardSubagents`,
`offPeakAutoResume`, `weekendMode`, `deferredResume`, `queueFallback`, `retryEnabled`; текстовые/списковые поля:
`officialProviders`, `officialBaseURLs`, `deferredResumeText`.

Проверьте бейдж состояния в интерфейсе сессии — он показывает текущую фазу (`高峰·拦官方` / `高峰·全部暂停`
/ `谷时` / `周末`).

Проверьте вердикт по официальному источнику для одного маршрута (маршрут хоста, перезапуск не нужен):

```bash
curl -s 'http://127.0.0.1:3080/session-guard/provider?provider=deepseek-official'
# {"ok":true,"verdict":{"provider":"deepseek-official","official":true,"matchedBy":"endpoint","endpoint":"https://api.deepseek.com"}}
```

Запустите набор тестов (без сети и учётных данных):

```bash
npm test
```

## 3. Обновление

```bash
dsh plugin --profile web remove dsh-session-guard
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
```

Перезапустите dsh web и обновите страницу. Настройки лежат в `$DSH_HOME/settings.yaml` в пространстве
имён `session-guard` и переживают обновление; новые ключи (`providerGuard`, `deferredMode`, …)
держат значения по умолчанию, пока вы их не тронете.

С **плагина** `0.1.3` / `0.1.4-beta.1` на **плагин** `0.1.5-beta.1` единственное изменение поведения: в часы пик по умолчанию
блокируются **только** цели на официальных источниках. Чтобы вернуть прежнее тотальное поведение, задайте
`providerGuard: false` (или сузьте вердикт через `officialProviders` / `officialBaseURLs`).
(Это версии плагина, а не DSH — не путайте их с диапазонами хоста выше.)

## 4. Устранение неполадок

| Симптом | Что проверить |
|---|---|
| Сессии продолжают работать в пик | `GET /session-guard/status` → `phase` должен быть `peak`; `GET /session-guard/settings` → `enabled: true` |
| Локальный провайдер блокируется в пик | `GET /session-guard/provider?provider=<id>` → `matchedBy` должно быть `endpoint`/`unknown` с `official: false`. Если стоит `explicit`, удалите id из `officialProviders` |
| Официальный запрос НЕ блокируется | `matchedBy: 'endpoint'` с `official: false` означает, что `baseURL` маршрута нет в `officialBaseURLs`; добавьте туда хост или добавьте id маршрута в `officialProviders` |
| Запросы зависают вместо ошибки | Так и задумано: это режим `hold`. Для явной ошибки задайте `deferredMode: 'error'` или уменьшите `deferredMaxHoldMs` |
| После пика ничего не возобновляется | `deferredResume` должен быть включён (или выполните `/resume`); за возобновление на уровне сессии отвечает `offPeakAutoResume` |
| Диагностика вердикта недоступна | `GET /session-guard/diag` → `providerGuard`, `configurableProviders`, `held`, `deferred` |

## 5. Удаление

```bash
dsh plugin --profile web remove dsh-session-guard
```

Перезапустите dsh web. Удерживаемые запросы освобождаются (отклоняются) при выгрузке — утечек promise нет.

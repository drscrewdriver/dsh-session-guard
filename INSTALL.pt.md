# Guia de instalação (CLI oficial do DSH)

Este guia usa apenas o comando oficial `dsh plugin` do DSH.

- [Guia de instalação em português](./INSTALL.pt.md)
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
- [README em português](./README.pt.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)
- [Changelog en français](./CHANGELOG.fr.md)
- [Changelog auf Deutsch](./CHANGELOG.de.md)
- [Changelog in italiano](./CHANGELOG.it.md)
- [Changelog en ruso](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)
- [Changelog em português](./CHANGELOG.pt.md)

## 0. Pré-requisitos

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
```

## 1. Instalar

```bash
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5

# ou diretamente do branch git
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.5
```

`compat/0.1.5` é a linha dedicada ao DSH `0.1.5-rc.x`: número de versão do pacote npm **`3.0.0`**, dist-tag
**`dsh-0.1.5`**, com `engines.dsh = >=0.1.5-rc.2 <0.2.0-0` **tanto** no `package.json` quanto no
`dsh.plugin.json`.

Os hosts DSH `0.1.2-rc.x` devem usar o branch **`legacy/0.1.2`** (dist-tag npm `dsh-0.1.2`,
versão `0.3.1`). **`main` está congelado em `0.2.0-beta.1` e não é mais o branch de publicações da
linha 0.1.2.**

> ⚠️ Não confie no nome de pacote nu `dsh-session-guard`: a etiqueta `latest` do npm não pode
> servir duas linhas de versão mutuamente exclusivas (seus intervalos `engines.dsh` são exclusivos pelo
> casamento de prerelease do semver) — fixe sempre o dist-tag de forma explícita.

Reinicie o dsh web e atualize a página.

## 2. Verificar

Abra **Configurações → Plugins → session-guard**. Chaves: `enabled`, `providerGuard`, `guardSubagents`,
`offPeakAutoResume`, `weekendMode`, `deferredResume`, `queueFallback`, `retryEnabled`; campos de texto/lista:
`officialProviders`, `officialBaseURLs`, `deferredResumeText`.

Confira o distintivo de estado na interface de sessão — mostra a fase atual (高峰·拦官方 / 高峰·全部暂停
/ 谷时 / 周末).

Confira o veredito de fonte oficial de uma rota (rota do host, sem reiniciar):

```bash
curl -s 'http://127.0.0.1:3080/session-guard/provider?provider=deepseek-official'
# {"ok":true,"verdict":{"provider":"deepseek-official","official":true,"matchedBy":"endpoint","endpoint":"https://api.deepseek.com"}}
```

Execute a suíte de testes (sem rede nem credenciais):

```bash
npm test
```

## 3. Atualizar

```bash
dsh plugin --profile web remove dsh-session-guard
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
```

Reinicie o dsh web e atualize a página. As configurações vivem no `$DSH_HOME/settings.yaml` sob o namespace
`session-guard` e sobrevivem à atualização; as chaves novas (`providerGuard`, `deferredMode`, …)
ficam nos seus valores padrão até que você as altere.

Do **plugin** `0.1.3` / `0.1.4-beta.1` para o **plugin** `0.1.5-beta.1` a única mudança de comportamento é que nas horas de pico agora
são bloqueados **por padrão apenas** os destinos de fonte oficial. Para recuperar o comportamento geral antigo, ponha
`providerGuard: false` (ou restrinja o veredito com `officialProviders` / `officialBaseURLs`).
(Essas são versões do plugin, não do DSH — não as confunda com os intervalos do host acima.)

## 4. Solução de problemas

| Sintoma | O que verificar |
|---|---|
| As sessões continuam rodando durante o pico | `GET /session-guard/status` → `phase` deve ser `peak`; `GET /session-guard/settings` → `enabled: true` |
| Um provedor local é bloqueado durante o pico | `GET /session-guard/provider?provider=<id>` → `matchedBy` deveria ser `endpoint`/`unknown` com `official: false`. Se disser `explicit`, tire o id de `officialProviders` |
| Uma requisição oficial NÃO é bloqueada | `matchedBy: 'endpoint'` com `official: false` significa que a `baseURL` da rota não está em `officialBaseURLs`; acrescente aí o host, ou acrescente o id da rota a `officialProviders` |
| As requisições travam em vez de falhar | Esse é o modo `hold`, é assim que foi projetado. Para um erro explícito ponha `deferredMode: 'error'`, ou reduza `deferredMaxHoldMs` |
| Depois do pico nada é retomado | `deferredResume` deve estar ligado (ou execute `/resume`); `offPeakAutoResume` controla a retomada a nível de sessão |
| Diagnóstico do veredito indisponível | `GET /session-guard/diag` → `providerGuard`, `configurableProviders`, `held`, `deferred` |

## 5. Desinstalar

```bash
dsh plugin --profile web remove dsh-session-guard
```

Reinicie o dsh web. As requisições retidas são liberadas (rejeitadas) ao descarregar — sem vazamento de promises.

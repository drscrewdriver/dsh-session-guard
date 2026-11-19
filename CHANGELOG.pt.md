# Registro de mudanças

Todas as mudanças notáveis de `dsh-session-guard` são registradas aqui. As versões seguem semver.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)
- [Changelog en français](./CHANGELOG.fr.md)
- [Changelog auf Deutsch](./CHANGELOG.de.md)
- [Changelog in italiano](./CHANGELOG.it.md)
- [Changelog en ruso](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)
- [Changelog em português](./CHANGELOG.pt.md)

## 4.3.0 (2026-11-19)

- **Tabela embutida de 2027: 34 linhas = 29 dias de descanso + 5 recuperos de trabalho** (aviso do Conselho de Estado content_7085102, lido por máquina via holiday-cn; impressão da instantânea `sha256:8f999d47…9780331af`). Até agora a cobertura embutida era só a de 2026, então 2027 dependia inteiramente da rede: uma máquina offline — ou fixada com `DSH_SESSION_GUARD_HOLIDAY_FETCH=0` — julgava mal os 10 dias de recesso do Festival da Primavera e todos os 5 fins de semana de recupero. Agora a tabela embutida cobre isso: **semântica correta de dia de descanso sem rede alguma**.
- Os 5 recuperos de trabalho: 2027-01-31 (dom), 2027-02-14 (dom), 2027-05-08 (sáb), 2027-09-26 (dom) e 2027-10-09 (sáb) — todos no fim de semana, entram normalmente no gating de pico; o Festival da Primavera (2/5–2/13) e o Dia Nacional (10/1–10/7) permanecem fora de pico o dia inteiro.
- O comportamento de rede não muda: se a impressão remota coincidir com a embutida, só o instante da verificação avança (sem escrita); se divergir, a tabela remota substitui a embutida dentro do orçamento de 24 h e vai para o cache — a embutida é um piso, não um cadeado.
- Testes: novas asserções estruturais `BUILTIN_2027` (34/29/5, os recuperos precisam cair no fim de semana, trechos contíguos de Festival da Primavera e Dia Nacional, coerência do ano consigo mesmo, impressão que fixa a instantânea de modo que uma edição da tabela a montante deixa o teste vermelho); `BUILTIN_TABLES` verificada como de dois anos, ordenada e sem duplicatas; as fixtures do store passam para 2028 (2026 e 2027 agora são ambas embutidas, 2028 é o único ano restante que exercita «tabela embutida ausente → buscada»), mais a asserção de que o modo offline ainda reconhece o recupero do Festival da Primavera de 2027. Inclui também o trabalho 4.2.13 ainda não publicado: o locale pt-BR e a enumeração de peers `0.2.2-rc.2`…`rc.5`. Execução completa: 291 testes / 291 passando / 0 falha (lint limpo).

## 4.2.12 (2026-11-17)

- **Correção da issue #4: a projeção `requestHeld` da 4.2.11 estava morta, o botão mostrava sempre «Pausar sessão»**. A 4.2.11 acrescentou a projeção de retenção a nível de requisição ao `bridge.state()`, mas a entrada do julgamento era `typeof deferrals.has === 'function'`; e o `deferrals` que o `index.js` passa para `createBridge` é só um invólucro de vinculação tardia, **com apenas os dois métodos `settle` / `clearDeferred`**. Resultado: `st.requestHeld` era sempre `false`, e `paused.request` / `paused.any` / `requestGate.held` derivados dele no `/state` eram todos `false`; o `readPauseState()` do cliente olha exatamente para esses três campos, não para o `held` de topo — ao clicar uma vez só se registrava `manualPause` (o botão virava «Retomar sessão») e era preciso um segundo clique para de fato liberar, **o famoso «clicar duas vezes»**.
- **Correção**: o invólucro ganha os métodos de repasse `has` / `list`, devolvendo valores neutros (`false` / `[]`) enquanto não está pronto, em vez de lançar erro — no período de construção o `deferralsRef` ainda é `null` e o `/state` pode ser lido a qualquer momento.
- **Invariantes fixados**: novo `tests/bridge-deferrals-shell.test.mjs`, que extrai do código-fonte do `bridge.js` **todos** os pontos de leitura `deferrals.<name>` e afirma que o invólucro do `index.js` tem a chave de mesmo nome. Total: 289 testes / 289 passando / 0 falha (lint limpo).
- i18n: acrescenta o locale português (pt-BR) — dicionário de tempo de execução, metadados do pacote e espelhos README/INSTALL/CHANGELOG.

## 4.2.11 (2026-11-17)

- **Correção da issue #3: a retenção a nível de requisição das sessões novas no pico não tinha porta de liberação manual**. Numa sessão criada durante o pico (ex. 09:00–12:00), a primeira requisição fica retida em `agent/request` por `deferrals.hold()`, mas o portão de passo só atua quando `step > 1` — a primeira requisição para no passo 1 e **o portão de passo nunca participa**. O botão mostrava «Pausar sessão» (`pausedStep=false`); um clique só registrava `manualPause` e o segundo chamava `stepResume()` que, sem portão a liberar, devolvia {`released:false}` **sem nem pôr bypass**: a requisição não se mexia, e só a saída do pico (`releaseAll`), o abort ou o descarregamento do plugin a tiravam.
- **Correção em três pontos**: ① `bridge.stepResume` agora também liquida a retenção a nível de requisição (`deferrals.settle(id, reason, 'release')`) e limpa o registro de diferimento, e **põe bypass sempre que o usuário pede explicitamente continuar**, seja a retenção de passo ou de requisição; ② `request-guard` ganha a dependência `isBypassed`, reconhecendo o bypass depois de «pico + fonte oficial» (fail-open: se a sonda lançar erro, volta ao bloqueio normal); o `wiring` conecta ali o conjunto de bypass do portão de passo — portão de passo e portão de requisição passam a compartilhar o mesmo fato «esta sessão foi liberada manualmente neste pico»; ③ a projeção de estado acrescenta `requestHeld` / `requestHeldSince` / `pausedAny`, o `/state` acresce `request` / `any` a `paused` e introduz `requestGate`, e o `readPauseState()` reconhece os três, com o botão mostrando «Retomar sessão» corretamente durante uma retenção de requisição.
- **Testes**: 5 casos novos em `bridge.test.mjs`, 3 em `request-guard.test.mjs`. Total: 286 testes / 286 passando / 0 falha (lint limpo, build ok).

## 4.2.10

- Superfície de terminal (dsh-tui / painel de comandos do Desktop de mesma origem): superfície `/guard` no terminal + mensagens de fonte plugin acrescentadas à sessão ao abrir o portão (feedback de uma linha no TUI).

4.2.3: acréscimo de enumeração de hosts para DSH 0.2.1-rc.3 (atualização só de declaração; zero diff no plano de contratos).

## 4.2.2 (2026-10-18)

- hosts: enumeração declarativa acrescida de 0.2.1-rc.2 (34/34 peers `@deepseek-ai/*` do host verificados no npm como rc.2 em versão; este plugin não toca o provider `ctx.web` nem o slot `conversation.input.model.label`, zero mudança de código, lançamento só de metadados; célula rc.2 da fazenda a postos).

## 4.2.1 — 2026-10-17 (enumeração de hosts: +0.2.1-rc.1)

### Corrigido
- `engines.dsh` e os quatro pares `@deepseek-ai/dsh-client-*` acrescentam `|| 0.2.1-rc.1` (enumeração exata de 16 hosts); a porta de compatibilidade do host agora aceita DSH `0.2.1-rc.1`.
- `engines.dsh` do `dsh.plugin.json` alinhado à mesma enumeração de 16 hosts (antes o intervalo `>=0.2.0-rc.1 <0.2.1-0`); a porta só lê o `package.json`, mas as duas listas não devem divergir.
- A menção de compatibilidade do README (zh/de/es/fr/it/ru) sincronizada com a enumeração. Nenhuma mudança de comportamento nesta versão.

## 4.2.0 — 2026-10-17

### Acrescentado
- Conhecimento de feriados oficiais (`src/holidays.js` + `src/holiday-store.js`). Instantânea 2026 embutida: 39 linhas = 33 dias de descanso + 6 pontos de recuperação de trabalho (feriados da China, anúncios do Conselho de Estado). Análise estrita (datas com zeros, `isOffDay` booleano, linhas multi-ano rejeitadas); impressão sha256 só sobre os campos de decisão — edições de redação/ordem não geram mudanças falsas. O cache `$DSH_HOME/.dsh/session-guard/holidays/<year>.json` se autoverifica ao carregar: divergência descarta o arquivo.
- Chaves declarativas `holidayMode` e `holidayAutoFetch` (ambas on por padrão). `/session-guard/status` expõe `holidayMode` + `holidays[]` por ano (fonte / impressão / hora / contagem).

### Alterado
- `weekendMode` promovido à semântica de dia de descanso: feriados oficiais são fora de pico o dia inteiro; fins de semana de recuperação entram normais no gating de pico; a janela `nextOffPeakInstant` passa de 7 para 14 dias, ciente da tabela. O `holidayMap` viaja no cfg através de `readCfg`: os consumidores de `shouldPause` (tick do planejador / request-guard / step-gate / temporizadores de liberação) recebem-no sem quebrar assinaturas.

### Corrigido
- Classificação da família (rank 1 -> 2), alinhada à escada de pesos congelada (`_tools/family-rank.mjs`, fonte única).

## 4.1.16 — 2026-10-14 (manifestos alinhados; entrada 4.1.15 restituída)

### Correção
- `dsh.plugin.json` agora traz a mesma versão do `package.json`: o tarball 4.1.15 publicado ainda dizia 4.1.14 (verificado baixando-o do registro).
- Nenhuma mudança de comportamento. Teste consertado: a fixação estrutural em `tests/settings-bridge.test.mjs` ainda exigia a entrada de engrenagem retirada; a suíte estava vermelha desde a 4.1.15. Agora afirma a ausência dela.

## 4.1.15 — 2026-10-08 (restituída: esta entrada nunca foi escrita ao publicar)

### Removido
- Sai a injeção de assento `shell.overlay` a nível de shell: o botão de engrenagem fixo no canto inferior direito e sua camada flutuante desaparecem (`src/client/shell-overlay.tsx` removido). O acesso a configurações passa a depender só da página de configurações do host.

## 4.1.14 — 2026-10-08

### Removido
- Sem mudanças dignas de nota além da limpeza que a restituição da 4.1.15 documenta (liberação apenas de alinhamento de manifestos).

## 4.1.13 — 2026-10-08

### Corrigido — esqueleto do descritor da ponte em ≤0.1.5 (pego pela porta de 5 células)
- **O `value` do describe do host é um esqueleto de campos em ≤0.1.5** (empírico: {`enabled:{},…}`, valores reais nas camadas `base`+`user`). As gerações antigas consumiam `descriptor.value` como estava — `officialProviders` chegava como `{}` (truthy não-array, invisível para `?? []`), `values.join` no `ListRow` lançava erro e todo o slot `dsh-family.tab` morria. `descriptorPlainValue()` detecta o esqueleto e reconstrói {`...base, ...user}`.
- **Saneamento dos campos de cartão (defesa em profundidade)**: um erro de render mataria a aba inteira da família — entradas `ListRow` saneadas via `toList()`, o seletor `拦截方式` cai em `hold` para qualquer valor não-`error`.
- Verificado na porta da fazenda de 5 células: o valor semeado `321123` é relido pela ponte (0.1.0/0.1.5) e nativamente (0.1.7).

## 4.0.0 — 2026-09-29

### Alterado
- **Adaptação à linha DSH 0.2.0**: `engines.dsh` e os quatro pares `@deepseek-ai/dsh-client-*` passam a `>=0.2.0-rc.1 <0.2.1-0` (em substituição aos intervalos 0.1.7); dist-tag npm `dsh-0.2.0`; versão do manifesto alinhada a `4.0.0`. A superfície de API que o plugin usa (manifesto / configurações / HMR / slots / sessão v4) não muda em relação à 0.1.7 — sem modificações no código de execução.
- Limite inferior do par `@deepseek-ai/cordis` alinhado a `^4.0.4` (os pacotes de UI do host 0.2.0-rc.1 declaram `~4.0.4`; o anterior `^4.0.1` até aceitava, mas subestimava o limite).

### Corrigido
- `src/client/family-section.tsx` entrou no controle de versões (desde a 3.2.x existia só na árvore de trabalho, de modo que um checkout limpo não compilava).
- Configuração flat do eslint: sai a regra `no-unused-vars` do núcleo — marcava erroneamente parâmetros das assinaturas de tipos TS; a variante typescript-eslint fica e a linha de base do lint volta a estar verde.
- As guardas estáticas de source-kind v4 (`tests/source-kind.test.mjs`) ficam sob acompanhamento e rodam em `npm test` (248 testes).

## 3.2.4 — 2026-09-27

### Corrigido
- **Adaptação ao formato de sessão v4 (host >= 0.1.7-rc.1)**: as três rotas de escrita de sessão deixam de usar a assinatura retirada `source: { kind: 'plugin', plugin: 'session-guard' }`, que o host v4 recusa com `SessionFormatError` (quebrava o turno inteiro). As três usam agora o kind de propriedade do produtor: injeção de avisos de retomada diferida (`src/wiring.js`); injeção de avisos de nova tentativa automática (`src/retry.js`); followup de pausa-retomada (`src/pause-gate.js`, `kind: plugin:D`).
- **Adaptação nativa v4 do tool-result (N1)**: `findToolOutcome` em `src/pause-gate.js` lê primeiro a mensagem v4 de primeira classe `role:'tool'` (`toolCallId`/`isError` no nível superior da mensagem); a rota v3 por blocos `tool-result` fica como reserva histórica. Sem isso, uma ferramenta que falhou durante a pausa era reportada como concluída ao retomar («não executar de novo») — uma decisão errada silenciosa. `src/tool-call-id.js` lê primeiro o id nativo do nível superior. `form` e todos os demais campos não mudam.

## 0.4.0 — 2026-09-18 (versão equivocada; substituída pela 3.0.0)

### Corrigido
- **Identidade de versão.** Esta linha foi publicada como `0.4.0` enquanto `dsh.plugin.json` e este registro já diziam `3.0.0` — um artefato com dois números de versão. O `package.json` agora é `3.0.0`, de modo que a versão do pacote, a do manifesto e a do registro coincidem. `0.4.0` fica aqui como registro histórico porque versões de npm são imutáveis; o `dist-tag dsh-0.1.5` deve reorientar-se a `3.0.0` uma vez publicado.
- **Documentação.** README/INSTALL (zh/en/ja/ko) já não descrevem a linha irmã como residente em `main`. O branch de publicações da linha 0.1.2 é **`legacy/0.1.2`** (dist-tag npm `dsh-0.1.2`, versão `0.3.1`); `main` está congelado em `0.2.0-beta.1`.

### Notas
- **Nenhuma mudança no código-fonte** em relação à `3.0.0`; `0.4.0` é um empacotamento apenas de metadados da mesma árvore.

## 3.0.0 — 2026-09-14

### Alterado
- **Linha dedicada ao DSH v0.1.5-rc.2 (`compat/0.1.5`).** Os intervalos de `engines.dsh` e dos pares `dsh-client-*` se apertam a `>=0.1.5-rc.2 <0.2.0-0` (o casamento semver estrito de prerelease significa que o antigo `>=0.1.0-rc.7` nunca casava com `0.1.5-rc.2`); `dsh.plugin.json` ganha `engines.dsh`. A linha 2.x / 0.2.x em `main` segue atendendo DSH 0.1.0-rc.7 … 0.1.2-rc.1.
- `session.events` → `snapshotEvents()`. O DSH 0.1.5 removeu o acesso de matriz `session.events` (compatibility-guide §20.3). O `pause-gate.js` lê os eventos da sessão por uma ajudante de dupla via: primeiro `snapshotEvents()`, a matriz antiga `events` como reserva defensiva, `null` (fail-open) quando não existe nenhuma das duas. Afeta só `findToolOutcome` e `lastUserPrompt`.

### Sem mudanças
- Zero mudanças nas demais juntas de integração: a rota autoalojada com prefixo webServer (`/session-guard/rpc`), `settings.register`, o slot `settings.plugin.item`, as injeções do cliente e `llm.listConfigurableProviders()` estão todas verificadas intactas frente ao bundle 0.1.5-rc.2 publicado (`tools/check-api-drift.ps1`, 12/12 asserções exigidas).

### Pendente
- Smoke test ao vivo num host real DSH 0.1.5-rc.2 (mesmo estado da linha 0.1.5 do perm-gate).

## 0.2.0-beta.2 — 2026-09-13

### Corrigido (compatibilidade com DSH 0.1.5 — branch `compat/0.1.5`)
- **Fila de retomada por dupla via.** O DSH 0.1.5 converte o Inbox numa projeção somente de leitura do loop do agente, então `agent.followup` pode deixar de existir. O fluxo de retomada agora tenta primeiro `agent.followup`, recorre a `agent.send` e degrada para um aviso (nunca lança) quando não existe nenhum dos dois — uma falha de enfileiramento não pode mais quebrar a retomada.
- **As mensagens de retomada levam `source.form: 'instructions'`** conforme o contrato de fontes de mensagens `ContextFormed` do 0.1.5 (`kind: 'plugin'` é um kind embutido; versões anteriores do DSH ignoram o campo extra).
- `webServer.register` é envolvido em try/catch: uma falha de registro de rota agora registra um erro em vez de sair do `apply` com exceção e quebrar o carregamento de plugins do host.
- Verificado contra o código-fonte 0.1.5-rc.2: o contrato `WebRoute` (exact/prefix + SSE) não muda, de modo que as rotas do cliente `fetch('/session-guard/...')` não precisam do prefixo `/api`.

## 0.2.0-beta.1 — 2026-09-10

### Acrescentado
- **Portão a nível de passo (`agent/pre-step`).** Durante as horas de pico o turno agora é retido **antes** da requisição ao modelo do próximo passo, em vez de ser interrompido num limite de turno: a sessão segue até o próximo `agent/pre-step`, onde o portão a retém (configuração `stepLevelPause`, ligada por padrão). O turno retoma **no seu lugar** fora de pico — sem precisar de mensagem followup. Condições de retenção: pico (horário de Pequim) + não fim de semana + `step > 1` + provedor de destino oficial (`providerGuard`) + sem retenção a nível de requisição + não pulada nesta janela de pico. Novo módulo `src/step-gate.js` (`decideStepHold` puro + motor hold / release / abort / timeout).
- **Porta `stepResume` + RPC + `/resume`.** `sessionGuard.stepResume(sessionId, {bypass})`, `POST /session-guard/rpc {action:'stepResume'}` e `/resume` liberam todos o portão; uma retomada manual ainda deixa de controlar essa sessão pelo resto da janela de pico.
- **Escalonamento por tempo esgotado.** `stepGateTimeoutMs` (300000 por padrão) libera o portão e escala para uma pausa **force** a nível de turno, de modo que um pico longo nem trava nem goteja um passo a cada cinco minutos.
- **Botão «⏸ Pausar sessão»** (cliente, slot `conversation.input.right`, id `session-guard-pause`, order 20 — à esquerda do botão de congelamento do input-traffic). Sonda `/session-guard/state` uma vez por segundo, permanece desabilitado enquanto nada estiver retido e chama `stepResume` quando está. O distintivo de estado foi movido para order 40 e informa o número de sessões retidas a nível de passo.
- **Novas configurações**: `stepLevelPause`, `stepGateTimeoutMs`. **Novos estados**: `GET /session-guard/state` agora devolve `paused: { step, turn }` e `stepGate: { held, since, bypass }`; `/status` devolve `stepHeld`; `/diag` devolve `stepGate`. O `state().paused` da porta de serviço continua booleano por compatibilidade (novo campo `pausedStep`).

### Corrigido
- **Bloqueio mútuo entre um passo retido e uma pausa a nível de turno.** `pauseTask` / `resumeTask` / `cancelTask` agora liberam primeiro o portão de passo: uma retenção de passo está em `agent/pre-step`, onde nunca pode chegar um `assistant/message` ou um `tool/result`, de modo que uma pausa `safe` esperava para sempre e nunca persistia `paused`.

### Alterado
- **A entrada no pico já não interrompe os turnos em curso** quando `stepLevelPause` está ligado (`onEnterPeak` arma o portão de passo em vez de chamar `stopNextTurn`); desligado, o comportamento anterior a nível de turno não muda.
- A etiqueta do botão de congelamento do input-traffic agora é **"Freeze & append"** (`冻结追加` / `凍結して追加` / `동결 후 추가`) e a de retomada **"Resume & append"** (`恢复追加` / `再開して追加` / `재개 후 추가`) — congela o turno e conserva as mensagens na fila, diferente do botão de pausa.
- **O botão de pausa agora é um comutador**: "Pausar sessão" / "Retomar sessão" (sem estado cinza desabilitado). Pressionar "Pausar sessão" chama a nova ação `stepPause`, que retém a sessão no **próximo limite de passo** (passo 1 incluído, sem importar pico nem provedor); "Retomar sessão" chama `stepResume`. Novo método da porta `sessionGuard.stepPause(sessionId)`.
- **Impulso SSE**: a nova rota `GET /session-guard/events?session=<id>` empurra as mudanças de estado do portão de passo, e o botão passa a "Retomar sessão" no ato, sem esperar um sondeo; o sondeo de `/session-guard/state` a cada 10 s fica como reserva. `/state` agora informa `paused.manual` e `stepGate.manual`.
- **Estilo alinhado** ao botão composer do input-traffic (24 px de altura, 6 px de raio, fonte 12 px, mesmos tokens border/hover/pressed) tanto para o botão de pausa quanto para o distintivo de estado; os estilos são injetados uma única vez via `<style data-plugin-css="session-guard-client">`.

## Não publicado

### Acrescentado
- **Guarda bidimensional de fontes oficiais (pico × provedor de destino).** As horas de pico agora bloqueiam só as requisições cuja rota de destino é uma fonte oficial do DeepSeek; provedores locais/de terceiros seguem funcionando. Ordem do veredito: lista explícita de ids `officialProviders` → endpoint `baseURL` ao vivo → endpoint embutido no catálogo (o `deepseek` do pi-ai) → id embutido (`deepseek-official`); cada veredito informa `matchedBy`. Módulos novos: `src/provider.js` (puro), `src/provider-directory.js`, `src/deferrals.js`, `src/request-guard.js`, `src/targets.js`, `src/wiring.js`.
- **Rede de segurança a nível de requisição (`agent/request`).** Cobre as sessões iniciadas depois do começo do pico e as sessões trocadas para uma fonte oficial no meio da execução — o tick de 30 s só atendia às sessões já `running` na transição. O modo `hold` (padrão) suspende a requisição sem erro e a libera no instante exato fora de pico (`msUntilOffPeak`); o modo `error` lança uma falha reconhecível `PEAK_DEFERRED` e registra um diferimento para retomada fora do pico.
- **Novas configurações**: `providerGuard`, `officialProviders`, `officialBaseURLs`, `deferredResume`, `deferredResumeText`, `deferredMode`, `deferredMaxHoldMs` (6 h por padrão), `guardSubagents`. **Novas rotas**: `GET /session-guard/provider?provider=<id>` (diagnóstico do veredito); `/session-guard/status` informa `providerGuard` / `held` / `deferred`; `/session-guard/state` informa o último destino da sessão. Sentinela contra deriva `tools/check-api-drift.ps1`.

### Alterado
- **Suporte a duas versões de DSH (0.1.0-rc.7 … 0.1.2-rc.1).** Um único artefato cobre agora tanto `dsh-v0.1.1-rc.2` quanto `dsh-v0.1.2-rc.1`. A leitura dupla do id de chamada do `tool/result` (primeiro `content[].toolCallId`, reserva em `source.callId`) foi extraída para `src/tool-call-id.js`, sem dependências, com testes unitários. `dsh.client.inject` não nomeia mais `@deepseek-ai/dsh-client-runtime` (removido na 0.1.2) nem `@deepseek-ai/dsh-client-ui-slots` (não é uma linha de cliente dinâmica); intervalos dos pares ampliados a `>=0.1.0-rc.7 <0.2.0-0`.
- **A superfície de configurações fica na API de interseção**: só `settings.register` + `settings.get`; `installSection` (0.1.2+) e o removido `installSettingsSection` nunca são usados. As APIs opcionais (`model/selection`, `llm.listConfigurableProviders`, `settings.get`) são sondadas por capacidade e degradam em vez de lançar.
- `src/retry.js` faz curto-circuito só com o centinela exato `PEAK_DEFERRED`. Falhas 429 / `RATE_LIMIT` / `TRANSPORT` / timeout continuam transitórias, então a nova tentativa global do DSH (`dsh-llm-retry` em `agent/request-error`) e a semântica própria deste plugin não mudam. O `dsh-llm-retry` em si nunca é tocado. A insignia distingue "pico · só oficial" de "pico · tudo em pausa".

## 0.1.4 — 2026-09-09

### Alterado
- **Lançamento beta público** da linha de versão dupla (`0.1.4-beta.1`): metadados de versão, tabela de compatibilidade do README e metadados do pacote alinhados para o canal beta.

## 0.1.3 — 2026-09-09

### Corrigido
- **Codificação do package.json restaurada**: a descrição estava corrompida (bytes GB2312 lidos como UTF-8); reescrita com o texto chinês correto.
- **Metadados ausentes**: acrescentados os campos `repository` e `homepage`.
- **peerDependencies corrigidas**: saiu a versão exata fixada de `dsh-llm`; entraram `cordis`, `dsh-client-runtime`, `dsh-client-locale`, `dsh-client-ui-settings`, `dsh-client-ui-slots` como pares opcionais conforme `dsh.client.inject`. Foi acrescentado o manifesto `dsh.plugin.json`.

## 0.1.2 — 2026-08-28

### Corrigido
- **Fuso horário de pico corrigido**: o julgamento de pico/vale fica fixo no horário de Pequim (`BILLING_TIMEZONE`); a detecção de fim de semana usa a zona configurada.

## 0.1.1 — 2026-08-24

### Acrescentado
- **Nova tentativa automática no backend (D9)**: falhas transitórias de `turn/end` (error/429/max-tokens) disparam uma retomada `followup(retryText)` com backoff adaptativo; falhas permanentes (autenticação/saldo/modelo/limite de contexto) param; a intervenção do usuário ou um turno com sucesso reiniciam o contador de falhas consecutivas.
- **Cessão durante congelamento/portão**: a nova tentativa se pula quando `isFrozen(sessionId)` é verdadeiro (queueLocked / paused / taskControl paused); nunca contorna o portão de sessão.

### Alterado
- O porta redundante `sessionGuard` agora expõe `state(sessionId)` devolvendo {` queueLocked, lockReason, paused, taskControlAvailable, taskControl }`. A rota HTTP `GET /session-guard/diag` devolve diagnóstico de tempo de execução incluído o estado de nova tentativa.

### Corrigido
- A detecção de fim de semana usa agora `Intl.DateTimeFormat` com o fuso horário configurado em lugar do `getUTCDay()` cru, corrigindo um erro de fronteira de 8 horas para o fuso de Pequim.

## 0.1.0 — 2026-08-18

### Acrescentado
- Lançamento inicial: pausa automática no pico (global), modo fim de semana, congelamento/retomada por sessão através do porta redundante `sessionGuard` + ponte RPC, portão de sessão próprio (`agent.cancel keepInbox + goals.pause + session/event fronteira segura + retomada por followup`), painel de configurações (Configurações → Plugins → session-guard).

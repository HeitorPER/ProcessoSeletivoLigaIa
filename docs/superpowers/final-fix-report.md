# Relatório da onda final de correções — Central Liga IA UFSCar

Data: 2026-10-04. Ponto de partida: `7c99006` (HEAD de `feat/central-liga-ia`, 199 testes). Branch de trabalho: `claude/clever-noether-bjd4nu`.

**Status: DONE_WITH_CONCERNS.** Todos os itens do brief (A–E) foram implementados. Resultado final: `npm test` com 16 arquivos e 212 testes passando, `npm run typecheck` e `npm run lint` sem erros. As ressalvas estão em "Ressalvas", no fim.

## Commits

| SHA | Assunto |
| --- | --- |
| `3b4eb2d` | fix: restaura o texto em cache após desconectar ou restaurar da lixeira, sem reanalisar |
| `e79488e` | fix: ata reanalisada não propõe reverter decisão humana posterior |
| `d0482b4` | fix: diff de sugestão pendente usa o oficial atual; distingue fonte com erro de fonte indisponível |
| `08632c7` | fix: 403 por limite de taxa vira erro com cache mantido; mensagem de nova tentativa unificada |
| `1cd33a3` | fix: cliente OpenAI com tempo limite de 60 s e erros do SDK em AIError |
| `42ed4be` | feat(a11y): título próprio em cada página (WCAG 2.4.2) |
| `e64a42a` | refactor: caracteres invisíveis literais viram escapes |
| `629b929` | feat: aviso "Conta desconectada" depois de desconectar o Google |
| `043df59` | docs: revisão final — instalação, avisos de credenciais, novos comportamentos e diário |

## A. Texto vazio para sempre depois de desconectar e reconectar

**O que mudou**
- `lib/sync/engine.ts` (`processFile`): uma fonte com `extractedText` nulo e `kind` diferente de `unsupported` deixa de ser considerada saudável e é baixada de novo.
- Caminho só de restauração: se o hash baixado é igual a `processedVersion` e (a) a fonte está `processed` sem texto, ou (b) está `unavailable` (foi para a lixeira e voltou), o motor chama `restoreExtractedText` e não chama `ingestSource`. Nada roda em `handleRegistry`, `processMinutes` ou `registerSourceConflict`. Uma chamada forçada (reavaliação de planilhas depois de mudança no INDEX) continua fazendo a ingestão completa.
- `lib/ingest/index.ts`: nova função exportada `restoreExtractedText(meta, content, statusReason?)`.
  - Extrai com `extractDoc` e grava `extractedText` e `meta.frontMatter` (em markdown), com `syncStatus` `processed`. Mantém `kind`, e mantém `statusReason` quando nenhum motivo é passado.
  - Erro de extração marca a fonte como `error`, igual a `ingestSource`.
  - Para a volta de `unavailable`, o motor passa o motivo "Arquivo acessível de novo, com o mesmo conteúdo já analisado — texto restaurado sem nova análise", porque o motivo anterior ("lixeira") já tinha sido sobrescrito.
- `lib/ingest/conflict.ts` (`analyzeUnauthorizedSheet`): sem texto, ou com a fonte `unavailable`, lança `Error('Texto da planilha indisponível — sincronize novamente antes de analisar')`.

**Testes**
- `tests/sync.test.ts`, "texto em cache apagado (desconectar e reconectar)":
  - "a próxima varredura completa restaura o texto sem reanalisar nem criar sugestões": restaura ESTADO-ATUAL, GUIA_INICIAL, a ata 01/10, a ata 04/10 e a planilha. O ciclo conta `processed: 7, unchanged: 2`, a IA é chamada 0 vezes, as sugestões ficam idênticas e não há linhas `superseded`. O ciclo seguinte volta a contar `unchanged: 9`.
  - "ata na lixeira e restaurada com o mesmo conteúdo não é reanalisada": a IA não é chamada e não surge sugestão nova.
- `tests/ingest.test.ts`:
  - "analisar planilha sem texto em cache falha com mensagem clara (nunca \"0 sugestões\")".
  - "restoreExtractedText regrava só o texto, sem reclassificar nem reanalisar".

**RED**
```
× analisar planilha sem texto em cache falha com mensagem clara (nunca "0 sugestões")
  AssertionError: promise resolved "+0" instead of rejecting
× restoreExtractedText regrava só o texto, sem reclassificar nem reanalisar
  TypeError: restoreExtractedText is not a function
× a próxima varredura completa restaura o texto sem reanalisar nem criar sugestões
  AssertionError: expected { mode: 'full', processed: +0, …(4) } to match object { processed: 7, errors: +0, …(2) }
× ata na lixeira e restaurada com o mesmo conteúdo não é reanalisada
  AssertionError: expected 1 to be +0   (a IA foi chamada 1 vez)
Tests  4 failed | 45 skipped (49)
```
**GREEN** (`tests/sync.test.ts` + `tests/ingest.test.ts`): `Tests  49 passed (49)`

## B. Ata antiga reanalisada propunha reverter decisão humana posterior

**O que mudou**
- `lib/ingest/minutes.ts`: depois de `validateItems` e antes de gravar, `dropRevertsOfLaterDecisions` percorre as sugestões `update`.
  - Remove os campos propostos que têm um `ActivityEvent` de pessoa (`actorId !== 'system'`) do tipo `update`, `status`, `suggestion_applied` ou `create`, com o campo em `changedFields` e `timestamp` posterior ao corte.
  - O corte é o fim do dia da reunião em São Paulo. Sem `meetingDate`, é `meta.modifiedAt`.
  - Sugestão que fica sem campos é descartada.
  - Cada campo removido vira `DiscardedItem` com o motivo `Decisão posterior já aprovada na Central para este campo — a ata não reverte o registro oficial`. O trecho registrado tem o formato `ACT-101 — prazo: 05/10/2026 (trecho: "...")`.
- `lib/dates.ts`: nova função `endOfDaySP(iso)`, que devolve `AAAA-MM-DDT23:59:59.999-03:00` (São Paulo não tem horário de verão desde 2019).

**Testes**
- `tests/ingest.test.ts`, "ata antiga reanalisada não propõe reverter decisão humana posterior (spec §3, regra 1)":
  - carga inicial; ata 03/10 aceita por U-B; o horário do evento é fixado em 2026-10-03 para o teste não depender do relógio;
  - reingestão de `Ata_2026-10-01.md` v2 com o texto editado;
  - resultado: nenhuma sugestão pendente com `dueDate 2026-10-05` para ACT-101, e um `DiscardedItem` com o motivo acima.
- `tests/ingest.test.ts`, "decisão humana anterior à reunião não bloqueia a proposta da ata": controle, mostra que o filtro não remove demais.
- `tests/utils.test.ts`, "endOfDaySP: último instante do dia em São Paulo".

**RED**
```
× ata antiga reanalisada não propõe reverter decisão humana posterior (spec §3, regra 1)
  AssertionError: expected [ { …(20) } ] to have a length of +0 but got 1
Tests  1 failed | 1 passed | 29 skipped (31)
```
**GREEN** (`tests/ingest.test.ts`): `Tests  31 passed (31)`

## C. Menores promovidos

1. **Títulos por página (WCAG 2.4.2).** `app/layout.tsx` usa `title: { template: '%s · Central da Liga IA UFSCar', default: 'Central da Liga IA UFSCar' }`.
   - Cada página exporta `metadata`: Comece aqui, Minhas atividades, Todas as atividades, Nova atividade, Sugestões para revisar, Novidades dos documentos, Estado da sincronização.
   - O detalhe usa `generateMetadata`, com `params` como Promise, e gera `<ID> · <título>`. A edição gera `Editar <ID>`.
2. **Escapes.**
   - `lib/text.ts`: `̀-ͯ`, `‘’`, `“”`, ` `.
   - `lib/extract/markdown.ts`: ` `, `^﻿`.
   - `tests/extract.test.ts`: BOM e NBSP literais trocados por escapes.
   - `lib/authority/index-parser.ts`: as aspas curvas da regex também viraram escapes.
   - Conferência: `LC_ALL=C.UTF-8 grep -rnP '[\x{00A0}\x{FEFF}\x{0300}-\x{036F}]' --include=*.ts --include=*.tsx lib tests app components` não encontra nada (saída 1). O mesmo grep detecta um NBSP num arquivo de controle. Aspas curvas continuam só em comentários e textos da interface ou de dados de teste.
3. **Aviso ao desconectar.** Ao terminar, `DisconnectButton` navega para `/sincronizacao?desconectado=1`. A mensagem local do cliente foi removida, porque o botão some quando não há mais conta. `app/sincronizacao/page.tsx` mostra, no servidor, `<Notice tone="ok" live title="Conta desconectada">O acesso foi revogado e o texto em cache foi apagado. Atividades e histórico foram mantidos.</Notice>` quando o parâmetro está presente e não há conta conectada.

**Como foi verificado:** C1 e C3 são só de interface, sem teste automatizado.
- Subi `next dev` na porta **3100** com um banco descartável no scratchpad (não na 3000, e não com `prisma/dev.db`) e busquei as páginas com `curl`.
- Os 10 `<title>` saíram corretos, por exemplo `ACT-101 · Preparar carrossel sobre ferramentas · Central da Liga IA UFSCar` e `Editar ACT-101 · Central da Liga IA UFSCar`.
- O aviso "Conta desconectada" aparece só com `?desconectado=1`.
- Depois o servidor foi encerrado.

## D. Correções baratas

1. **"Oficial agora" atualizado.** Em `lib/suggestions/queries.ts`, sugestões `update` pendentes calculam `currentSnapshot` a partir da atividade viva (`target` com `owners` → `toFields` → `pickFields` das chaves propostas). As revisadas mantêm a foto guardada.
   - Testes em `tests/suggestions-view.test.ts`: "pendente mostra o valor oficial atual (não a foto do momento da sugestão)" (prazo e responsáveis) e "revisada mantém a foto guardada no momento da sugestão" (guarda; já passava antes).
2. **Erro × indisponível.** `ActivityListItem.staleReason` vale `'unavailable' | 'error' | null`; `unavailable`/`stale` têm precedência sobre `error`, e `hasStaleSource` foi mantido.
   - `ActivityList.tsx` e `app/atividades/[id]/page.tsx` mostram "Fonte com erro de leitura — dado pode estar desatualizado" para `error`, e o texto "removida ou perdeu acesso" para `unavailable`.
   - Por consistência, o rótulo do resumo (`lib/summary/digest.ts`) também diferencia os dois casos.
   - Testes em `tests/activities.test.ts`: "distingue fonte com erro de leitura de fonte indisponível", mais uma asserção nova `staleReason` em "indica sugestão pendente e fonte indisponível".
3. **403 por limite de taxa.** Em `lib/sync/engine.ts`, só o 404 ou o 403 que **não** é `isRetryable` (de `lib/drive/retry.ts`) marca a fonte como `unavailable`. O 403 com `rateLimitExceeded`/`userRateLimitExceeded`/`backendError` vira `error` e mantém o cache.
   - Teste em `tests/sync.test.ts`: "403 por limite de taxa (após as novas tentativas) vira \"error\" e mantém o cache; 403 de permissão vira \"unavailable\"", com `DriveError(403,'userRateLimitExceeded')` e `insufficientFilePermissions`.
4. **OpenAI.** Em `lib/ai/openai.ts`, `OPENAI_CLIENT_OPTIONS = { timeout: 60_000, maxRetries: 1 }` é passado ao construtor.
   - `extract` e `summarize` passam por `call()`, que embrulha exceções do SDK em `AIError('Falha ao chamar o modelo: <mensagem>')` e troca qualquer ocorrência da chave por `[chave omitida]`.
   - Testes em `tests/ai.test.ts`: "falha do SDK vira AIError em português, sem expor a chave" e "cliente OpenAI com tempo limite de 60 s e uma nova tentativa".
5. **Mensagem única.** Em `lib/ingest/index.ts`, a mensagem passa a terminar com "Nova tentativa na próxima varredura completa (até 10 min).".
   - Nenhum teste existente esperava o texto antigo. Acrescentei a asserção em "falha da IA marca erro e permite nova tentativa (nunca \"sem atividades\")".

**RED**
```
FAIL tests/activities.test.ts > indica sugestão pendente e fonte indisponível — expected undefined to be 'unavailable'
FAIL tests/activities.test.ts > distingue fonte com erro de leitura de fonte indisponível — expected {…} to match object { hasStaleSource: false, …(1) }
FAIL tests/ai.test.ts > falha do SDK vira AIError em português, sem expor a chave — expected Error: Request timed out. key=sk-segredo-… to be an instance of AIError
FAIL tests/ai.test.ts > cliente OpenAI com tempo limite de 60 s e uma nova tentativa — expected undefined to deeply equal { timeout: 60000, maxRetries: 1 }
FAIL tests/ingest.test.ts > falha da IA marca erro … — expected 'Análise da ata falhou: timeout. Nova …' to contain 'Nova tentativa na próxima varredura c…'
FAIL tests/suggestions-view.test.ts > pendente mostra o valor oficial atual … — expected { dueDate: '2026-10-05', …(1) } to deeply equal { dueDate: '2026-10-06', …(1) }
FAIL tests/sync.test.ts > 403 por limite de taxa … — expected { mode: 'incremental', …(5) } to match object { errors: 1, unavailable: +0 }
Tests  7 failed | 101 passed (108)
```
**GREEN** (`ai`, `sync`, `ingest`, `activities`, `suggestions-view`): `Tests  108 passed (108)`

**Asserções existentes:** nenhuma foi alterada. Só acrescentei asserções a dois testes existentes (D2 e D5).

## E. Documentação

1. `VALIDACAO.md`, caso 2, coluna "Local": a sugestão de Carla **não foi conferida manualmente na interface** (está coberta pelos testes automatizados), o que bate com a observação posterior.
2. `README.md`: a frase sobre o OpenAI agora diz "a verificação local e os testes automatizados foram feitos sem chamar o OpenAI".
3. Typecheck: rodei `npm run typecheck` (`next typegen` + `tsc --noEmit`) e não houve erros. O README e o VALIDACAO dizem exatamente isso e registram que `npm run build` não foi executado nesta rodada.
4. "até 5 novas tentativas (6 no total)", agora incluindo o 403 por limite de taxa. Também está documentado o tempo limite do OpenAI.
5. Seção 14:
   - o item `7/10` × `17/10` aparece como achado de revisão do código gerado por IA, e não como saída observada do modelo;
   - entrou o caso observado das paráfrases do "próximo passo" na ata de 01/10, corrigido com `sameFieldValue` para propostas e comparação estrita para edições humanas.
6. Pré-requisitos da instalação:
   - acesso a `cdn.sheetjs.com`;
   - ferramentas de build nativo para o `better-sqlite3`;
   - PowerShell 5.1 sem `&&`: os comandos estão um por linha, e o roteiro do VALIDACAO também foi separado.
7. Seções 3 e 4: os valores de exemplo do Google fazem o botão "Conectar" aparecer, mas a conexão falha. O `TOKEN_ENC_KEY` de exemplo é público e precisa ser trocado.
8. Novos comportamentos documentados:
   - A (sincronização e §13);
   - B (regra 1 em §2 e nas limitações, sobre decisões no mesmo dia da reunião);
   - C3 (§13);
   - D3 (sincronização).

   Também: entrada de 2026-10-03 no DIARIO e contagem de testes atualizada (212).

## Verificação final

```
npm test          → Test Files 16 passed (16) · Tests 212 passed (212)
npm run typecheck → ✓ Types generated successfully; tsc --noEmit sem erros
npm run lint      → eslint . sem erros (saída 0)
npm run build     → NÃO executado (instrução do brief: o servidor de desenvolvimento do usuário usa .next)
```

## Ressalvas

1. **Ambiente.** Este trabalho rodou numa sessão do Claude Code na nuvem (Linux), não no Windows do usuário. Por isso:
   - não havia servidor na porta 3000 nem `prisma/dev.db` para mexer;
   - os commits estão em `claude/clever-noether-bjd4nu`, a partir de `7c99006`, e não diretamente em `feat/central-liga-ia`.
2. **SheetJS.** A política de rede da sessão bloqueia `cdn.sheetjs.com` (HTTP 403), então `npm ci` falhou. Para rodar testes, typecheck e lint, instalei localmente o `xlsx@0.18.5` do registro npm no lugar do tarball 0.20.3, sem commitar `package.json` nem `package-lock.json`, que foram restaurados.
   - Os 212 testes (inclusive os de `.xlsx`) passaram com essa versão.
   - Vale rodar `npm test` uma vez na máquina local com a 0.20.3 oficial.
3. **Typecheck do commit `3b4eb2d`.** Esse commit, isolado, não passa no typecheck (estreitamento de `FetchedContent` no caminho de restauração). O conserto veio em `08632c7`. O HEAD está limpo.
4. **Onde está este relatório.** O brief pedia `.superpowers/sdd/2026-10-03-central-liga-ia/final-fix-report.md`. Essa pasta é ignorada pelo git e não chega ao Windows, então o relatório foi commitado em `docs/superpowers/final-fix-report.md`. Uma cópia idêntica ficou em `.superpowers/...` no container.
5. **`analysisError`.** Quando a análise lança exceção, `lib/suggestions/review-request.ts` continua devolvendo a mensagem genérica `ANALYSIS_FAILED_MESSAGE`, e não o texto "Texto da planilha indisponível…". O brief não pedia mudança aqui; o texto específico aparece no log do servidor.

## Rodada de re-revisão (2026-10-04)

Executada no Windows do usuário, em `feat/central-liga-ia` a partir de `0cbfad3`. Um commit por achado, cada um com teste primeiro (RED) e correção depois (GREEN).

| Commit | Achado | RED (antes da correção) | GREEN |
| --- | --- | --- | --- |
| `1de16eb` | 1. Restauração sem reclassificar depois de mudar o `INDEX.md` (mesmo ciclo e entre ciclos) | `tests/sync.test.ts`: "INDEX mudou no mesmo ciclo…" → `expected 'activity_registry' not to be 'activity_registry'`; "ata que volta da lixeira…" → `kind: 'minutes'` em vez de `'deprecated'`. Só com a reclassificação, sem `restoredOnly`: `expected 1791125384939 to be greater than 1791125384939` (planilha restaurada não reavaliada) | `restoreExtractedText` reclassifica com o INDEX atual e devolve `null` se tipo, data da reunião ou aba do registro mudaram (o motor faz a ingestão completa). Restauração simples volta com `restoredOnly: true` e não entra em `ingestedAfterChange` |
| `ed6b406` | 2. Regra 1 descartava a correção que a ata faz da própria proposta aceita | `tests/ingest.test.ts` "aceita sem ajuste: a correção da mesma ata vira sugestão pendente" → `expected false to be true` | Evento `suggestion_applied`/`create` de sugestão desta mesma ata com `reviewStatus: 'accepted'` não protege o campo; `adjusted` e edições diretas continuam protegidas (os dois testes de guarda passam) |
| `ca06581` | 5. Ata sem data: corte na modificação da nova versão | "ata sem data: decisão humana depois da análise anterior continua protegida na reedição" → `expected true to be false` | Corte = `lastProcessedAt` anterior da fonte (lido antes de ser sobrescrito); na primeira análise, `meta.modifiedAt` |
| `20dc363` | 3. Novidades com "antes" da foto gravada | `tests/digest.test.ts` → `expected 'prazo: 05/10/2026 → 07/10/2026' to contain 'prazo: 06/10/2026 → 07/10/2026'` | Pendente de atualização usa os valores atuais da atividade (`pickFields(toFields(target))`) |
| `d37be49` | 4. 403 por cota virava "indisponível" e apagava o cache | `tests/sync.test.ts` (cota) → `dailyLimitExceeded: expected { … } to match object { errors: 1, unavailable: 0 }`; `tests/google-drive.test.ts` → `isRetryable(sharingRateLimitExceeded)` falso; `isInsideTree` com cota resolvia `null` | `sharingRateLimitExceeded` repetido; `dailyLimitExceeded`/`quotaExceeded`/`downloadQuotaExceeded` não repetidos, mas `isTemporaryDriveError` → "erro" com cache mantido; `isInsideTree` propaga o 403 passageiro |
| `4751f0d` | 6. Conflito aceito sem texto virava beco sem saída | `tests/review-request.test.ts` → `expected { status: 200, … analysisError … } to deeply equal { status: 409, … }` | `reviewSuggestion` confere o texto antes de reivindicar; `source_unavailable` → HTTP 409 com a mensagem; a sugestão fica pendente. O `ReviewPanel` só trata 409 como "já revisada" quando o código não é `source_unavailable` |

Ajustes de teste sem enfraquecer asserções: `tests/ingest.test.ts` usa `bad?.status` (o retorno de `restoreExtractedText` pode ser `null`); o teste "conflito de fonte: aceitar pede análise" de `tests/activities.test.ts` passou a gravar um texto em cache na fonte antes de aceitar (pré-condição nova).

Decisões além do pedido: `downloadQuotaExceeded` entrou junto com as cotas pedidas (é o 403 típico de download de arquivo muito baixado); `isInsideTree` deixou de tratar 403 passageiro como "fora da pasta", pela mesma razão do achado 4.

### Verificação final da re-revisão

```
npm test          → Test Files 16 passed (16) · Tests 222 passed (222)
npm run typecheck → ✓ Types generated successfully; tsc --noEmit sem erros
npm run lint      → eslint . sem erros
npm run build     → NÃO executado (o servidor de desenvolvimento na porta 3000 usa .next)
```

Ressalva: a mudança no `ReviewPanel` (409 `source_unavailable` fica no cartão) não foi conferida no navegador, porque reproduzir o caso exigiria mexer em `prisma/dev.db`.

### Segunda re-revisão (`0cbfad3..a9847dd`)

Veredito: **pronto**, sem regressões. Dois pontos restantes:

- **Ata sem data: a proteção valia só uma reedição** (corrigido). Com o corte em `lastProcessedAt`, a análise seguinte avançava o corte para depois da decisão humana, e a terceira versão voltava a propor a reversão. RED: "ata sem data…" com uma segunda reedição (v3) → `expected true to be false`. GREEN: o corte passou a ser `firstSeenAt` da fonte (fixo depois da primeira análise); na primeira análise continua `meta.modifiedAt`.
- **Janela de milissegundos no conflito aceito** (aceito como limitação). O texto da planilha é conferido dentro da transação, mas a análise roda depois do commit. Se "Desconectar" ou uma sincronização apagar o cache exatamente nesse intervalo, o conflito fica aceito com `analysisError`. A janela é de milissegundos, depende de duas ações simultâneas, e o resultado é visível na tela e no log.

Verificação: `npm test` 222 testes passando; typecheck e lint sem erros.

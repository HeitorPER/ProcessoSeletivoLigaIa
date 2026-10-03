# Central de contexto e atividades — Liga IA UFSCar (design)

**Data:** 2026-10-03
**Status:** aprovado em conversa, aguardando revisão da spec escrita
**Fontes do requisito:** `Case_Candidato_tecnico.pdf`, `05_Especificacao_Tecnica_Candidato.md`, `04_Guia_Google_Drive_API.md`, `03_Dados_de_Teste/` (pasta pai do repositório).

## 1. Objetivo e critérios de sucesso

Aplicação web executada localmente que responde, para cada membro da Liga, “o que preciso fazer agora?” e “o que mudou desde a última vez?”, com evidências. Os documentos permanecem no Google Drive; a aplicação lê uma pasta configurada (e subpastas), mantém um registro operacional de atividades e usa IA apenas para **sugerir** criações/alterações que um humano revisa.

Sucesso = requisitos R01–R12 do PDF atendidos e os cenários da spec §9 demonstráveis com os dados de teste:

- Ana vê `ACT-101` e `ACT-104`; Davi vê `ACT-102` e `ACT-104`; Carla vê `ACT-103`. `ACT-104` é uma única atividade com dois donos; `ACT-103` está bloqueada.
- Ata de 2026-10-03 (Google Doc nativo) gera sugestão de **atualizar** `ACT-101` (prazo 05/10 → 07/10, próximo passo), com trecho literal; até aprovação o oficial continua 05/10 com aviso; após aprovação mostra 07/10, histórico preserva a mudança e referencia planilha e ata; nenhuma segunda atividade é criada.
- Ata de 2026-10-04 (`.md`) gera sugestão de **criar** atividade para Carla (prazo 2026-10-10); o parágrafo “Talvez… série diária” não vira atividade.
- `Ata - copia vazia.xlsx` não apaga atividades; aparece como conflito de fonte para decisão humana.
- Atividade criada na UI persiste após reiniciar, com autor e histórico.
- Arquivo novo ou editado no Drive é detectado em até 15 min sem upload pela UI; edição não duplica a fonte.
- Remoção/perda de acesso marca a fonte como indisponível e as atividades ligadas como potencialmente desatualizadas.

## 2. Decisões tomadas (com o usuário)

| Tema | Decisão | Motivo |
| --- | --- | --- |
| Stack | Next.js (App Router) + React + TypeScript | Front e API no mesmo projeto, execução local simples |
| Estilo | Tailwind CSS com tokens da marca | Escolha do usuário; tokens centralizados garantem contraste |
| Banco | SQLite local via Prisma | Zero infraestrutura para a banca; persiste após reinício; apagar o arquivo limpa o cache |
| Sync | `changes.list` a cada 2 min + varredura completa a cada 10 min + botão manual | Atende 15 min com folga; varredura reconcilia casos perdidos; sem URL pública |
| Agendador | Worker Node separado (`npm run dev` sobe Next + worker via `concurrently`) | Evita timers duplicados por hot-reload; um único processo fala com o Drive |
| OAuth | Biblioteca `googleapis`, rotas próprias, escopo `drive.readonly`, refresh token criptografado no SQLite | Worker precisa do token em segundo plano; segredo nunca chega ao navegador |
| IA | OpenAI `gpt-6-luna` (Responses API, Structured Outputs estrito) atrás da interface `AIProvider`; modo `none` determinístico de fallback | Barato (US$ 0,10/0,50 por 1M tokens), schema estrito; banca roda sem chave |
| Fonte oficial | Após a importação inicial, o **banco do app é oficial**; edições posteriores na planilha viram sugestões | Uma única regra: nada altera o oficial sem aprovação humana na UI |
| Autoridade | Fonte de atividades lida do `INDEX.md`; outra planilha com cabeçalho de atividades vira conflito visível | Segue o próprio acervo; caso “copia vazia” nunca apaga dados |
| Identidade | Seletor “Vendo como” (cookie), sem senha; Bruno revisa Growth, Carla revisa Formação, qualquer revisor revisa Operações/sem frente | Atende “troca explícita de usuário” e o GUIA_INICIAL |
| Testes | Vitest no núcleo + validação manual registrada | Cobre regras de negócio com os arquivos do pacote |

## 3. Regra de precedência (documentada no README e na UI)

1. Decisão humana aprovada na aplicação (edição manual ou sugestão aceita/ajustada) define o estado oficial.
2. Nova ata com decisão explícita gera **sugestão pendente**; nunca altera o oficial sozinha. Enquanto pendente, a atividade mostra “atualização proposta pendente”.
3. A planilha apontada pelo `INDEX.md` é a base da **primeira** importação (eventos `import`, autor `system`). Versões posteriores dela geram sugestões por diferença de campo.
4. Arquivos `deprecated`, planilhas sem autoridade, rascunhos e textos históricos nunca alteram atividades. Planilha com cabeçalho de atividades fora da fonte vigente gera uma sugestão `source_conflict`.
5. Se duas fontes ativas discordam e não há decisão humana, a divergência aparece como conflito/incerteza na revisão. Data de arquivo mais recente não confere autoridade.

## 4. Arquitetura

```
ProcessoSeletivoLigaIa/
├─ app/                 páginas React (App Router) e rotas /api
├─ components/          componentes de UI
├─ worker/index.ts      loop de sincronização
├─ lib/
│  ├─ drive/            cliente Drive: árvore, changes, download/export, retry
│  ├─ extract/          markdown.ts, xlsx.ts, gdoc.ts, pdf.ts
│  ├─ authority/        INDEX.md, front-matter, classificação, conflito
│  ├─ ingest/           orquestra fonte → extração → classificação → sugestões
│  ├─ ai/               provider.ts, openai.ts, none.ts, validate.ts, prompts.ts
│  ├─ activities/       criar/editar/aprovar com eventos em transação
│  ├─ summary/          “o que mudou para mim”
│  ├─ google/           OAuth, criptografia do token
│  └─ db.ts             Prisma client
├─ prisma/              schema.prisma, migrations, seed.ts (membros fictícios)
├─ tests/               Vitest + fixtures copiados de 03_Dados_de_Teste
└─ docs/, README.md, DIARIO_DE_BORDO.md, VALIDACAO.md, .env.example
```

**Fluxo:** Worker → `lib/drive` detecta novo/alterado/removido → grava `Source` (file_id + versão) → `lib/extract` → `lib/authority` classifica → registry/atas passam por diff ou IA → sugestões validadas são gravadas como `pending`. A UI lê/escreve o mesmo SQLite; mudanças em atividades só acontecem em `lib/activities`, que grava `ActivityEvent` na mesma transação.

**Botão “Sincronizar agora”:** insere `SyncRequest`; o worker verifica a cada 5 s e executa. Apenas o worker acessa o Drive. Um lock em `SyncState.runningSince` impede ciclos concorrentes.

**Invariante:** o worker nunca altera atividade oficial, exceto a importação inicial da fonte vigente (eventos `import`).

## 5. Modelo de dados (Prisma)

Datas em ISO/UTC no banco; exibição em `America/Sao_Paulo`. Prazo é data pura `AAAA-MM-DD`.

- **Member**: `id` (U-A…U-D), `displayName`, `front`, `role` (`member`|`reviewer`), `reviewFronts` (lista). Seed: Ana (Growth, member), Bruno (Growth, reviewer de Growth), Carla (Formação, reviewer de Formação), Davi (Operações, member). Operações e sem frente: qualquer reviewer.
- **Source**: `fileId` (PK), `name`, `mimeType`, `webUrl`, `modifiedAt`, `versionOrHash`, `path`, `parentIds`, `kind` (`activity_registry`|`minutes`|`direction`|`deprecated`|`unauthorized_sheet`|`unsupported`|`other`), `syncStatus` (`processed`|`ignored`|`error`|`unavailable`|`stale`), `statusReason`, `lastProcessedAt`, `processedVersion`, `extractedText` (apagado quando indisponível), `meta` (JSON: front-matter, data da reunião).
- **Activity**: `id` (`ACT-101`… importadas; `ACT-M-001`… manuais/sugeridas), `title`, `description`, `nextStep`, `front`, `status` (`todo`|`in_progress`|`blocked`|`done`), `dueDate?`, `priority?`, `notes?`, `blockedReason?`, `origin` (`import`|`manual`|`suggestion`), `createdBy`, `createdAt`, `updatedAt`. Sem prazo = “a definir”.
- **ActivityOwner**: (`activityId`, `memberId`) — N:N.
- **Reference**: `activityId`, `fileId`, `versionOrHash`, `sheetOrSection`, `quoteOrCell`, `relationType` (`imported_from`|`created_by`|`updated_by`).
- **Suggestion**: `id`, `sourceFileId`, `sourceVersion`, `kind` (`create`|`update`|`source_conflict`), `targetActivityId?`, `proposedFields` (JSON), `currentSnapshot` (JSON), `evidence`, `evidenceLocator`, `reason`, `uncertainties` (JSON), `front?`, `reviewStatus` (`pending`|`accepted`|`adjusted`|`rejected`|`superseded`), `reviewerId?`, `reviewedAt?`, `reviewNote?`, `dedupeKey` (único), `createdAt`.
- **DiscardedItem**: trechos que a IA classificou como `no_action` (fonte, versão, trecho, motivo) — exibidos para transparência.
- **ActivityEvent**: `id`, `activityId`, `actorId` (membro ou `system`), `timestamp`, `type` (`import`|`create`|`update`|`status`|`suggestion_applied`), `before` (JSON), `after` (JSON), `changedFields`, `reason?`, `sourceFileId?`, `suggestionId?`.
- **SyncState** (linha única): `folderId`, `folderName`, `startPageToken`, `status` (`idle`|`running`|`auth_required`|`error`), `runningSince?`, `lastSuccessAt?`, `lastErrorAt?`, `lastError?`, `lastFullScanAt?`, `authorityFileId?`, `authoritySheet?`, `initialImportAt?`.
- **SyncRun**: início, fim, tipo (`initial`|`incremental`|`full`|`manual`), contadores processados/ignorados/erro/indisponíveis, erro.
- **SyncRequest**: `id`, `requestedBy`, `createdAt`, `handledAt?`.
- **GoogleToken**: `refreshTokenEnc`, `accountEmail`, `scope`, `updatedAt`. Criptografia AES-256-GCM com `TOKEN_ENC_KEY`.
- **MemberVisit**: `memberId`, `lastSeenAt` (marco do resumo).

**Idempotência:** `dedupeKey = sha256(fileId|version|kind|target|campos normalizados)` único. Aceitar/ajustar/rejeitar usa `UPDATE … WHERE reviewStatus='pending'` dentro de transação; se 0 linhas, retorna “já revisada” sem efeitos.
**Ata editada:** nova versão → sugestões `pending` da versão antiga viram `superseded`; reprocessa; aceitas permanecem no histórico.

## 6. Sincronização com o Drive

- **Carga inicial:** `changes.getStartPageToken` → varredura BFS a partir de `DRIVE_TEST_FOLDER_ID` (`'<id>' in parents and trashed=false`, todas as páginas, conjunto de visitados) → processa arquivo a arquivo (falha isolada não interrompe) → `changes.list` desde o token.
- **Incremental (2 min):** percorre `changes.list` paginado; grava `newStartPageToken` ao final. Para cada mudança: fora da árvore → verifica `parents` (subindo até a raiz, com cache) e ignora se fora; `removed`/`trashed`/403/404 → `unavailable`, apaga `extractedText`; mesma versão → nada; renomeado → atualiza nome/caminho; versão nova → reprocessa.
- **Varredura (10 min):** compara árvore real com banco; arquivos ausentes viram `unavailable`.
- **Versão:** `md5Checksum` para binários; `version` (ou `modifiedTime`) para nativos Google.
- **Falhas:** 429/5xx/timeout → até 5 tentativas com espera 2/4/8/16/32 s. Falha registrada em `SyncRun` e `SyncState`; o estado anterior é mantido. Falha nunca equivale a “vazio”. `invalid_grant` → `auth_required`.

### Extração

| Formato | Leitura | Resultado |
| --- | --- | --- |
| `.md` | `files.get alt=media` | texto + seções por título |
| Google Docs | `files.export` `text/markdown` (fallback `text/plain`); >10 MB → erro explícito | igual ao `.md` |
| `.xlsx` | `alt=media` + SheetJS | abas → linhas com referência de célula |
| PDF com texto | `alt=media` + `pdf-parse`; sem texto → `unsupported` com motivo | texto |
| demais (`.docx`, imagens, vídeo) | não lê | `ignored` — “formato ainda não processado” |

### Classificação (`lib/authority`, determinística)

1. `INDEX.md` → arquivo e aba apontados como fonte de atividades (linha com nome `.xlsx` + “fonte”; aba entre crases ou após “aba”); arquivos citados como superados.
2. Front-matter `status: deprecated`/`substituido_por` → `deprecated` (visível como histórico, sem sugestões).
3. Arquivo = fonte vigente → `activity_registry`. Primeira vez: importação; depois: diff por ID e campo → sugestões `update`/`create`. Linha removida da planilha **não** apaga atividade: vira incerteza registrada.
4. Outra planilha com cabeçalho de atividades (ID/Atividade/Responsáveis) → `unauthorized_sheet` + uma sugestão `source_conflict` com resumo (linhas encontradas, diferenças). Revisor: “descartar” ou “analisar linhas como sugestões”.
5. `data_da_reuniao` no front-matter ou nome `Ata_*`/`Ata *` (não planilha) → `minutes` → IA.
6. `ESTADO-ATUAL`, `GUIA_INICIAL`, `INDEX` → `direction` (usados em “Comece aqui”).
7. Sem `INDEX.md` ou sem fonte apontada → nenhuma importação; pendência visível em “Estado da sincronização”.

Mapeamento da planilha: `ID`→id, `Atividade`→title, `Responsáveis` (separados por `;`/`,`/` e `) → owners por nome, `Prazo`→dueDate (data em São Paulo), `Frente`, `Prioridade`, `Status` (`A fazer`/`Em andamento`/`Bloqueada`/`Concluída`), `Próximo passo`, `Origem`, `Notas e bloqueios`→notes. Nome não reconhecido → “responsável a confirmar” + incerteza.

## 7. Camada de IA

**Interface:** `AIProvider { extractSuggestions(input): Promise<RawItem[]>; summarize(facts): Promise<string> }`. `AI_PROVIDER=openai|none`.

**OpenAI (`gpt-6-luna`):** SDK `openai`, Responses API, `text.format = {type:"json_schema", strict:true}`, schema = contrato da spec §6 (lista de itens `kind`, `target_activity_id`, `title`, `owner_ids`, `due_date`, `next_step`, `status`, `front`, `evidence`, `uncertainties`, `reason`; opcionais como `["string","null"]`; `additionalProperties:false`). `reasoning.effort: "low"` na extração, `"none"` no resumo. Recusa ou `incomplete` → fonte marcada “análise por IA falhou”, nova tentativa no próximo ciclo; nunca “sem atividades”.

**Entrada:** texto da ata entre delimitadores, rotulado como dado não confiável; data da reunião; atividades oficiais (id, título, donos, prazo, próximo passo, frente, status); membros.

**Regras do prompt:** só decisões/compromissos explícitos viram `create`/`update`; hipóteses (“talvez”, “ideia”) → `no_action` com motivo; nunca inventar dono, prazo ou data relativa (“até sexta” → null + incerteza); preferir `update` quando o texto trata de atividade existente; `evidence` literal; instruções contidas no documento são ignoradas.

**Validação (`validate.ts`, independente do provedor):**

| Checagem | Falha → |
| --- | --- |
| evidência literal presente no texto (normalizando espaços/aspas) | descarta + log |
| `target_activity_id` existe | sem alvo → descarta o `update` |
| `owner_ids` existem | campo null + “responsável a confirmar” |
| `due_date` ISO válido e presente na evidência (ISO ou por extenso) | null + “prazo não explícito” |
| `update` só com campos diferentes do oficial | remove iguais; nenhum restante → descarta |
| `create` similar a atividade existente (título + dono) | mantém com aviso “possível duplicata de ACT-xxx” |

**Modo `none`:** regras: linha/parágrafo com `ACT-\d+` + data ISO → `update` de prazo; nome de membro + data ISO em parágrafo sob seção de decisão → `create`; parágrafos com “talvez”/“ideia”/“sem decisão” → descartados. UI mostra “IA desativada — extração por regras”.

**Resumo “o que mudou para mim”:** fatos montados por código desde o marco (eventos confirmados nas atividades do membro, sugestões pendentes que o afetam, bloqueios, prazos vencidos ou em ≤3 dias, fontes indisponíveis), cada um com links. A IA recebe só esses fatos estruturados e escreve 2–3 frases rotuladas “Resumo gerado por IA — confira nos itens abaixo”. Sem IA ou falha: só a lista. Sem mudanças: “Nada mudou para você desde <data>”.

**Custo estimado:** ~3k tokens entrada + ~0,5k saída por ata ≈ US$ 0,0006; resumo similar.

## 8. Interface

**Cabeçalho:** marca; seletor “Vendo como” com rótulo; indicador textual de sync (“Sincronizado há 3 min” / “⚠ Falha — dados de 14:02” / “Desconectado do Drive”).

**Navegação (nesta ordem):** Comece aqui · Minhas atividades · Todas as atividades · Sugestões para revisar (n) · Novidades dos documentos · Estado da sincronização. Barra lateral no desktop; menu com `aria-expanded` no celular.

- **Comece aqui:** propósito (ESTADO-ATUAL) com selo “Provisório — a confirmar por Bruno”; frentes e papéis (GUIA_INICIAL); regras de trabalho (aprovação de posts; plano antigo marcado como histórico); de onde vêm as tarefas (regra de fonte oficial + link à planilha); sua primeira ação (atividade aberta mais próxima do membro, ou orientação se não houver); links aos documentos. Primeira visita do membro abre aqui.
- **Minhas / Todas as atividades:** filtros rotulados (responsável, frente, estado, prazo: vencidas / próximos 7 dias / sem prazo / todas). Tabela no desktop, cartões no celular; prazo, dono e estado sempre visíveis. Estado como selo textual; prazo “07/10/2026 · vence em 2 dias” / “Vencida há 3 dias” / “A definir”; aviso “Atualização proposta pendente”. Botão “Nova atividade”.
- **Detalhe da atividade (`/atividades/[id]`):** campos, fontes com links (e aviso de indisponível), sugestões pendentes, histórico (autor, hora, de → para, motivo, fonte). Ações: Editar, Concluir, Bloquear (com motivo).
- **Formulário criar/editar:** título, descrição, frente, responsáveis (multi), próximo passo, estado, prazo opcional. Rótulos, erros em texto, `aria-describedby`.
- **Sugestões para revisar:** abas Pendentes/Revisadas; cartão com tipo, tabela campo atual → proposto, citação literal com link e data do documento, motivo, incertezas; Aceitar / Ajustar e aceitar / Rejeitar (motivo obrigatório). Botões só para o revisor da frente; demais veem “Aguardando revisão de …”. Bloco recolhido “Trechos sem decisão (não viraram atividade)”.
- **Novidades dos documentos:** seletor de marco (última visita / 7 dias / período); parágrafo IA rotulado; seções Confirmado · Proposto aguardando revisão · Incerto ou em conflito · Prazos próximos e bloqueios; feed geral de documentos novos/alterados.
- **Estado da sincronização:** pasta e conta (e-mail mascarado), escopo explicado; Conectar/Reconectar, Sincronizar agora (com estado), Desconectar e limpar cache; último sucesso/falha, próximo ciclo; contadores; tabela de fontes (nome com link, classificação, status com motivo, versão, processado em).

**Visual/acessibilidade:** fundo branco, texto `#0B0B14`, azul `#1433BD` para links/primários/títulos, ciano `#19DCE3` só como acento (bordas, indicador ativo, fundo de selo com texto escuro). Fonte Inter, corpo 16px. Foco visível (contorno azul 3px + halo ciano), link “Pular para o conteúdo”, ordem lógica, `aria-live` para status. Estados: carregando, vazio, erro de fonte, conexão perdida. Contraste ≥4,5:1 verificado; teste em 375px e teclado.

## 9. Segurança e privacidade

- Segredos só no `.env` (gitignored): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `DRIVE_TEST_FOLDER_ID`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_PROVIDER`, `TOKEN_ENC_KEY`. `.env.example` sem valores.
- OAuth: `state` aleatório em cookie httpOnly validado no callback; `access_type=offline`; tokens nunca enviados ao navegador nem logados.
- Leitura restrita à árvore da pasta configurada; escopo `drive.readonly`; nenhuma escrita no Drive.
- Desconectar: revoga o token no Google, apaga token e textos extraídos. README explica como apagar `prisma/dev.db` para limpar tudo.
- Conteúdo das atas é dado não confiável para o modelo.
- README descreve o que falta para dados reais: autenticação real (Google Sign-In), checagem de permissão por arquivo por usuário antes de exibir trechos, verificação OAuth do escopo restrito, hospedagem com segredos gerenciados.

## 10. Testes e validação

**Vitest:** extratores com os arquivos reais do pacote; parser do `INDEX.md` e classificação (incluindo `Ata - copia vazia.xlsx`); importação inicial (4 atividades, `ACT-104` com dois donos, `ACT-103` bloqueada); diff da planilha; `validate.ts` (evidência inexistente, data inventada, ID inexistente, campos iguais); modo `none` nas atas 10-03 e 10-04; idempotência (mesmo arquivo/versão duas vezes; aprovação duas vezes); sync com cliente Drive simulado (novo, editado, renomeado, removido, falha temporária); “o que mudou” para Ana vs Davi.

**Manual (registrado em `VALIDACAO.md`, ≥5 casos):** carga inicial real no Drive; ata Google Doc nova; edição de ata; aprovação de ACT-101; ideia vaga; planilha vazia (conflito); dado ausente (ata sem prazo); atividade manual após reinício; arquivo removido; teclado e 375px.

## 11. Fora do escopo

Chat/RAG sobre documentos; webhooks `changes.watch`; escrita no Drive; notificações externas; login real/SSO; OCR, imagens e vídeo; `.docx` direto (requisito é Doc convertido); deploy público.

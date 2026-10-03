# Diário de bordo

Registro informal de como o trabalho foi conduzido: decisões, mudanças de direção, dificuldades e aprendizados. Sem credenciais nem dados privados.

## 2026-10-03 — Entendimento e design

**O que fiz:** li o enunciado (`Case_Candidato_tecnico.pdf`), a especificação técnica (`05`), o guia da Drive API (`04`) e todo o pacote de dados de teste, incluindo o conteúdo das duas planilhas. Usei o Claude Code (Claude) como par de desenvolvimento, conduzindo o design por perguntas antes de escrever código.

**Observações dos dados:**
- `Ata_registro.xlsx`, aba `Atividades`, tem 4 atividades; `ACT-104` tem dois donos (`Ana; Davi`) e `ACT-103` está bloqueada.
- `Ata - copia vazia.xlsx` tem só cabeçalho, em aba chamada `Ata` — não pode zerar nada.
- `INDEX.md` declara a precedência e aponta a fonte vigente; `PLANO_EDITORIAL_ANTIGO.md` está `deprecated`.
- A ata de 04/10 mistura uma decisão clara (Carla, até 2026-10-10) com uma ideia “talvez” — bom caso para a IA.

**Decisões e por quê:**
- Next.js + React + TypeScript, Tailwind: front e API num projeto só, execução local simples.
- SQLite + Prisma: a banca roda sem instalar banco; persiste após reiniciar.
- Sync por `changes.list` (2 min) + varredura completa (10 min) num worker separado: cumpre os 15 min sem precisar de URL pública; o worker isolado evita timers duplicados pelo hot-reload do Next.
- Fonte oficial: após a importação inicial, o banco do app é o oficial; mudanças na planilha ou atas viram sugestões. Uma única regra: nada altera o oficial sem aprovação humana.
- Autoridade lida do `INDEX.md`; planilha parecida vira conflito visível em vez de sobrescrever.
- IA: comecei considerando Claude Haiku 4.5; troquei para OpenAI `gpt-6-luna` (lançado em 23/09/2026) por preferência. Antes de trocar, conferi na documentação/model card que o modelo existe, o ID de API (`gpt-6-luna`), suporte a Structured Outputs estrito e o preço (US$ 0,10/0,50 por 1M tokens). A IA fica atrás de uma interface `AIProvider`, com modo `none` determinístico para rodar sem chave.
- Validação da saída da IA independente do provedor (evidência literal, IDs, datas, campos alterados) — não confiar só no JSON.

**Próximo passo:** revisar a spec em `docs/superpowers/specs/` e escrever o plano de implementação.

## 2026-10-03 — Especificação e plano

**O que fiz:** com o design aprovado, escrevi a especificação (`docs/superpowers/specs/2026-10-03-central-liga-ia-design.md`) e um plano de 14 tarefas, cada uma com arquivos, interfaces que produz e consome, testes e comandos. Antes de executar, o Claude Code conferiu o plano contra ele mesmo: os nomes que uma tarefa produz e outra consome (por exemplo, `ingestSource`, `createDriveApi`, `reviewSuggestion`) foram cruzados para achar incompatibilidades na escrita e não no meio da implementação.

**Decisão sobre o processo:** executar por ondas paralelas, com subagentes em worktrees git isolados, merge sequencial na branch `feat/central-liga-ia` e uma revisão independente por tarefa. Congelei `package.json`, `schema.prisma` e `lib/types.ts` depois da Tarefa 1 para que as tarefas paralelas não conflitassem nesses arquivos. Custo aceito: se uma tarefa precisasse de um ajuste ali, ela reportava em vez de editar.

## 2026-10-03 — Implementação por ondas e revisões

**Ondas:** onda 1 (extratores, classificação de autoridade, camada de IA, atividades, cliente do Drive); onda 2 (ingestão, resumo "o que mudou", interface base); onda 3 (formulários, sincronização com worker, revisão de sugestões, OAuth e novidades). Cada tarefa teve uma revisão e, quando havia achados, uma ou duas rodadas de correção até ficar limpa. Quem aprovou cada decisão de design foi o Heitor; os subagentes só implementavam o que estava no plano.

**Problemas encontrados e como foram resolvidos:**
- **Datas do Excel:** a planilha traz datas como número serial. Converter por `Date` dependeria do fuso da máquina e poderia mover o prazo um dia. Passei a converter o número serial direto para `AAAA-MM-DD`, sem fuso.
- **Comparação do "próximo passo":** a ata de 01/10 repete o próximo passo de uma atividade com palavras ligeiramente diferentes; uma comparação exata proporia "mudanças" falsas. A comparação de texto ficou tolerante (ignora markdown, aspas tipográficas e espaços, e aceita diferença pequena), e uma atualização sem campo realmente diferente é descartada.
- **Renomear um Google Doc não deve reprocessar:** o Drive muda a "versão" do arquivo ao renomear. Separei a revisão do Drive (usada só para decidir se vale baixar) do hash do conteúdo (usado para decidir se há algo novo para analisar).
- **`7/10` dentro de `17/10`:** o revisor da camada de IA mostrou que a checagem "a data aparece no trecho" aceitava `7/10` em `17/10`. Corrigi com fronteira de dígitos e adicionei teste.
- **Atalho "ata de origem" do plano:** ele dispensava a análise de atas citadas na coluna Origem, o que podia pular em silêncio uma ata nova. Passou a valer só para atividades da importação inicial.
- **"Substituir antes de extrair" do plano:** apagaria a fila de revisão se a IA falhasse depois. Passou a substituir só depois de uma extração bem-sucedida.
- **Planilha editada empilhando sugestões contraditórias:** passei a comparar com a base da importação (ou da atividade aceita), com deduplicação sem versão e substituição por alvo; linha removida da planilha não apaga atividade.
- **Aspas tipográficas:** um subagente trocou, sem avisar, aspas curvas por retas na expressão regular que lê a aba do `INDEX.md`; a revisão pegou e há teste com aspas curvas.
- **Responsável e estado inventados:** a validação passou a exigir que o responsável apareça no trecho e que mudança de estado sem menção explícita gere incerteza. O delimitador `</documento>` dentro de uma ata é neutralizado para não escapar do bloco de dados.
- **Bloquear exige motivo:** aplicado nas rotas sobre o estado final, não na validação geral, para não quebrar a importação de uma planilha com atividade bloqueada sem nota.
- **Guard do Prisma:** o Prisma bloqueia comandos destrutivos executados por agentes (`migrate reset --force`). O banco de teste passou a ser apagado e recriado por `db push`; no README, `npm run db:reset` pede que a pessoa rode no próprio terminal.
- **Modelo de IA:** antes de usar `gpt-6-luna`, conferi o nome do modelo na documentação da OpenAI e no model card da AWS (existência, ID de API, saída estruturada estrita e preço).

**Resultados:** na integração, `npm test` com 16 arquivos e 199 testes passando; typecheck, lint e build sem erros. Uma verificação local com o banco de desenvolvimento e os arquivos do pacote carregados pelo mesmo código de ingestão: Ana vê as suas atividades; a API de revisão devolve 403 para Ana, 200 para Bruno e 409 na repetição; ACT-101 passa a 07/10 com histórico.

## 2026-10-03 — Documentação e fechamento

**O que fiz:** escrevi o README (arquitetura, regra de fonte oficial, instalação, credenciais, sincronização, formatos, IA, custo, limitações, o que falta para dados reais) e o `VALIDACAO.md` com 12 casos, indicando para cada um o teste automatizado que o cobre. Fixei as versões do Prisma (`prisma`, `@prisma/client` e o adaptador) sem `^` e troquei o placeholder de `TOKEN_ENC_KEY` por um texto simples, com o comando de geração em comentário.

**O que ficou pendente (e está dito como pendente nos documentos):** a validação ponta a ponta com o Google Drive real, que exige o cliente OAuth e a pasta de teste do Heitor; as verificações no navegador (teclado e 375 px); e qualquer chamada real ao OpenAI. O custo por ata é estimativa, não medição.

**Fora do escopo (decidido no design):** chat/RAG sobre documentos, `changes.watch`, escrita no Drive, notificações, login real, OCR/imagens/vídeo, `.docx` direto, deploy público.

**Achados menores adiados de propósito** (cada um está registrado no ledger da execução e resumido nas limitações do README): erros do SDK da OpenAI não são embrulhados em erro próprio; a deduplicação por versão pode fazer uma sugestão rejeitada reaparecer após edição trivial da ata; o marcador "desde a última visita" avança na renderização da página; rotas `POST` sem verificação de `Origin`; download de binários sem limite de tamanho.

**Próximos passos:** (1) o Heitor cria o cliente OAuth, preenche o `.env` e a pasta `LIA case teste`; (2) executar o roteiro do `VALIDACAO.md` e substituir cada "pendente" pelo resultado observado, incluindo o tempo até a detecção automática; (3) conferir teclado e 375 px; (4) se for demonstrar a IA, rodar uma ata com `AI_PROVIDER=openai` e medir o custo real.

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

## 2026-10-03 — Revisão final do branch e onda de correções

**O que a revisão final encontrou** (revisão do branch inteiro depois das 14 tarefas):
- **Importante — textos vazios para sempre depois de desconectar e reconectar.** "Desconectar e limpar cache" apagava `extractedText`, mas a fonte continuava "processada" com a mesma revisão do Drive; o ciclo seguinte dizia "sem mudança" e nunca baixava de novo. "Comece aqui" e a análise de planilhas em conflito ficavam sem texto.
- **Importante — ata antiga reanalisada propunha reverter decisão humana.** Se a ata de 01/10 fosse editada depois que Bruno aceitou o prazo 07/10 de ACT-101, a reanálise propunha voltar para 05/10, contrariando a regra 1 da precedência.
- **Menores promovidos:** páginas sem título próprio (WCAG 2.4.2); caracteres invisíveis literais (NBSP, BOM, acentos combinantes) em expressões regulares; nenhuma confirmação visível depois de desconectar.
- **Correções baratas:** o "Oficial agora" da sugestão pendente era uma foto antiga; "erro de leitura" e "indisponível" apareciam com o mesmo texto; 403 por limite de taxa marcava a fonte como indisponível e apagava o cache; o cliente OpenAI não tinha tempo limite e os erros do SDK não viravam erro próprio; mensagens de nova tentativa diferentes entre o motor e a ingestão.

**O que mudou:**
- Fonte sem texto em cache (exceto formato não suportado) é baixada de novo. Se o conteúdo é o mesmo já analisado, `restoreExtractedText` só regrava o texto: sem reclassificar, sem chamar a IA, sem sugestões novas ou substituídas. O mesmo vale para arquivo que volta da lixeira sem mudança. Analisar planilha sem texto agora falha com mensagem clara em vez de "0 sugestões".
- Antes de gravar sugestões de uma ata, os campos com decisão humana na Central depois do fim do dia da reunião (fuso de São Paulo) são removidos e registrados em "Trechos sem decisão" com o motivo.
- Títulos por página com o modelo `%s · Central da Liga IA UFSCar`; escapes `\u00A0`, `\uFEFF`, `\u0300-\u036f` e aspas tipográficas em regex; aviso "Conta desconectada" no servidor.
- "Oficial agora" calculado da atividade viva enquanto a sugestão está pendente; `staleReason` distingue erro de indisponível; 403 só vira indisponível por permissão; OpenAI com 60 s de tempo limite, uma nova tentativa e `AIError` sem a chave; mensagem única "Nova tentativa na próxima varredura completa (até 10 min)".
- Documentação: pré-requisitos de instalação (acesso a `cdn.sheetjs.com`, build nativo do `better-sqlite3`, PowerShell 5.1 sem `&&`), avisos sobre os valores de exemplo do Google e do `TOKEN_ENC_KEY`, contagem de tentativas ("5 novas, 6 no total") e a seção 14 separando o achado de revisão de código (`7/10` × `17/10`) do caso observado (paráfrases do "próximo passo").

**Como foi feito:** cada mudança de comportamento com teste primeiro (falhando), depois a correção (passando). Resultado: 16 arquivos e 212 testes passando; typecheck e lint sem erros. `npm run build` não foi executado nesta rodada.

## 2026-10-04 — Re-revisão: decisões sobre restauração, regra 1, cotas e conflitos

**O que a re-revisão encontrou e como decidi:**
- **Restaurar texto não reavaliava a classificação.** Uma ata que voltava da lixeira depois de o `INDEX.md` marcá-la como superada continuava "ata", e uma planilha só restaurada no mesmo ciclo de uma mudança no `INDEX.md` escapava da reavaliação. Decisão: a restauração simples só vale quando a classificação atual (sem IA) é igual à gravada (tipo, data da reunião, aba do registro); senão, ingestão completa. Restauração simples não conta como reavaliação depois de mudar o `INDEX.md`.
- **Regra 1 contra a própria ata.** Se Bruno aceita sem ajuste o prazo que a ata propôs e o autor depois corrige a ata, a correção era descartada como "decisão posterior". Decisão: aplicar sem ajuste uma sugestão vinda da mesma ata não protege o campo contra essa ata. Sugestão ajustada e edição manual continuam protegidas.
- **Ata sem data.** O corte era a modificação da nova versão, que não protegia nada. Decisão: usar a análise anterior da ata (`lastProcessedAt`); na primeira análise, a modificação do arquivo. Na re-revisão seguinte apareceu que esse corte avança a cada reedição (a proteção valia só uma vez); o corte passou a ser `firstSeenAt` da fonte, fixo depois da primeira análise.
- **Novidades com "antes" antigo.** A proposta pendente agora compara com o valor oficial atual, como em `/sugestoes`.
- **403 por cota.** `sharingRateLimitExceeded` é repetido como limite de taxa. `dailyLimitExceeded`, `quotaExceeded` e `downloadQuotaExceeded` não são repetidos na hora (a cota não volta em segundos), mas viram "erro" com o cache mantido, nunca "indisponível". Na subida pelos pais, esse 403 não vira "fora da pasta".
- **Conflito aceito sem texto.** A revisão era registrada antes de a análise falhar e o conflito nunca voltava. Decisão: conferir o texto antes de registrar; sem ele, HTTP 409 com a mensagem "Texto da planilha indisponível — sincronize novamente antes de analisar" e o conflito continua pendente.

**Como foi feito:** teste primeiro (falhando), depois a correção, um commit por achado. Resultado: 16 arquivos e 222 testes passando; typecheck e lint sem erros. `npm run build` não foi executado.

## 2026-10-04 — Validação no Drive real: banco de demonstração, banco corrompido e evidência da IA

**O que apareceu ao conectar o Drive real:**
- **Arquivos "indisponíveis".** O `prisma/dev.db` ainda tinha os dados fictícios que eu tinha carregado para testar as telas sem Google. Os 9 arquivos de demonstração não existiam na pasta real e viraram "indisponível", e a planilha real foi tratada como homônima da planilha já importada (a proteção funcionou, mas sobre o estado errado). Solução: recriar o banco antes da validação real.
- **Banco corrompido no `db:reset`.** O `migrate reset` recriou o `dev.db`, mas o `dev.db-wal` e o `dev.db-shm` da execução anterior ficaram no disco, e o SQLite reaplicou páginas velhas no banco novo ("database disk image is malformed"). Decisão: `db:reset` agora apaga esses arquivos antes (e para com mensagem clara se o servidor ainda estiver rodando).
- **IA sem créditos.** O OpenAI respondia `429 You have no credits remaining`. Não era erro de código: a conta da API precisava de créditos.
- **Sugestão descartada em silêncio.** Na ata de 03/10 em `.md`, o GPT-6 Luna citou a 1ª e a 3ª frase do parágrafo e pulou a do meio, nas duas tentativas. A evidência deixou de ser literal e a validação descartou o item; o descarte só aparecia no terminal. Decisão (aprovada pelo usuário): (1) o prompt pede um trecho contínuo, sem pular frases (em 3 de 3 novas tentativas o modelo citou o parágrafo inteiro); (2) a validação aceita frases literais na ordem e na mesma seção, marcando o corte com `[…]` e uma incerteza; (3) todo item recusado na validação vai para "Trechos sem decisão" com o motivo.
- **Título com asteriscos.** O export do Google Docs traz títulos em negrito (`## **Título**`) e o local da evidência aparecia com `**`. Os títulos agora são limpos na leitura.

- **Conflito de planilha que saiu da pasta.** A planilha homônima foi enviada primeiro para a subpasta errada e apagada; o alerta dela continuou pendente, e "Analisar linhas" só devolveria erro. Decisão do usuário: manter o alerta pendente com o aviso "Planilha fora da pasta" e só o descarte liberado.

- **Rolagem horizontal em 375 px.** Na verificação no navegador, `/sugestoes` passava de 375 px por causa de um caminho de pasta longo sem espaços, e `/minhas` e `/atividades` por 3 px (prazo e rótulo "Vence em…" sem quebra). Correção: o local da evidência pode quebrar dentro do caminho e o rótulo do prazo desce de linha; as 8 páginas cabem em 375 px.

**Como foi feito:** teste primeiro (falhando), depois a correção. Resultado: 16 arquivos e 229 testes passando; typecheck e lint sem erros.

## 2026-10-04 — Preparação da entrega

**O que a banca respondeu:** a pessoa avaliadora vai rodar o projeto com o próprio cliente OAuth, a própria pasta e a própria chave de IA, mudando só o `.env`; durante a apresentação vai enviar arquivos novos com a mesma estrutura.

**O que fiz:**
- Conferi que nada fora do `.env` depende da minha conta (nenhum ID de pasta, e-mail ou URL fixa no código).
- **Troca de pasta.** Achei um risco parecido com o do banco de demonstração: se o `DRIVE_TEST_FOLDER_ID` muda com o banco já usado, a planilha da pasta nova seria tratada como homônima da importada. Decisão (aprovada pelo usuário): pausar a sincronização com um aviso que explica como recomeçar (`npm run db:reset`), sem apagar nada automaticamente.
- **Custo medido** com o campo `usage` da API: cerca de 1.150–1.180 tokens de entrada e 240–400 de saída por ata (~US$ 0,0003) e ~160/70 por resumo (~US$ 0,00005). Gasto real de todo o dia, conferido no painel da OpenAI: 53 requisições, 31.413 tokens (24.853 de entrada e 6.560 de saída), US$ 0,01.
- README com um roteiro rápido para quem vai avaliar e problemas comuns; limitação desatualizada ("Drive real não validado") corrigida; a decisão sobre a evidência com frase pulada entrou como primeiro exemplo de saída incorreta do modelo.
- Teste novo para um Google Doc movido de fora para dentro da pasta (passo usado na demonstração).

**Resultado:** 16 arquivos e 231 testes passando; typecheck e lint sem erros.

## 2026-10-04 — Novo visual e tema escuro

**O que o usuário pediu:** um visual mais limpo, no estilo da Apple: cards arredondados com sombra leve, botões arredondados, "Comece aqui" dividido em módulos, as novidades de cada categoria dentro de um card e um tema claro/escuro. Como referência de formatos e tamanhos (sem copiar cores nem ícones), uma barra lateral com itens de cantos suaves e a troca de tema no rodapé.

**Decisões (aprovadas pelo usuário a partir de uma maquete):** fundo cinza claro com cards brancos; botões secundários com preenchimento suave. O cabeçalho chegou a ficar branco translúcido, mas o usuário preferiu manter o azul da marca (`#1433BD`, com a linha ciano), igual nos dois temas, com contorno de foco branco. O tema escuro segue o sistema até a pessoa escolher "Claro" ou "Escuro", e a escolha fica no navegador.

**Como foi feito:** em vez de trocar classes página a página, criei estilos compartilhados em `app/globals.css` (`card`, `btn-*`, `pill`, `field`) e tokens semânticos (`panel`, `tint`, `raised`, `on-brand`) que o tema escuro redefine. Um script no `<head>` aplica a escolha antes da pintura, para não piscar o tema errado. Bordas transparentes mantêm cards e botões visíveis no modo de alto contraste do Windows.

**Verificação:** auditoria automática de contraste nos dois temas (nenhum texto abaixo de 4,5:1), 8 páginas em 375 px sem rolagem horizontal, foco por teclado e troca de tema por teclado. Testes: 231 passando; typecheck e lint sem erros.

**Listas de seleção.** A pedido do usuário, a lista que abre nos selects ganhou o mesmo visual (painel arredondado com sombra, opções arredondadas, a escolhida em azul suave). Decisão: usar o select personalizável nativo do CSS (`appearance: base-select`) em vez de um componente próprio, porque continua sendo o `<select>` real (teclado, leitor de tela e formulários iguais). Em navegadores sem suporte, o campo fechado continua arredondado e a lista aberta é a do sistema. Conferido no Chrome: abrir, navegar e escolher por teclado, temas claro e escuro, 375 px.

# Central de contexto e atividades da Liga IA UFSCar

Aplicação web local para o caso técnico do processo seletivo da Liga IA UFSCar. Ela é uma central de contexto, onboarding e atividades: responde "o que preciso fazer agora?" e "o que mudou desde a última vez?", sempre com a fonte do dado. Lê uma pasta do Google Drive (e subpastas) sem copiar os documentos para outro lugar como fonte de verdade. A IA apenas **sugere** criações e alterações de atividades; uma pessoa revisora decide.

Todos os dados de teste (pessoas, atas, planilhas) são fictícios.

Documentos do projeto: [`VALIDACAO.md`](VALIDACAO.md) (casos de teste e resultados), [`DIARIO_DE_BORDO.md`](DIARIO_DE_BORDO.md) (decisões e problemas), [`docs/superpowers/specs/2026-10-03-central-liga-ia-design.md`](docs/superpowers/specs/2026-10-03-central-liga-ia-design.md) (especificação de design).

## Sumário

1. [Arquitetura em linguagem simples](#1-arquitetura-em-linguagem-simples)
2. [Fonte oficial das atividades](#2-fonte-oficial-das-atividades)
3. [Requisitos e instalação](#3-requisitos-e-instalação)
4. [Credenciais do Google e pasta do Drive](#4-credenciais-do-google-e-pasta-do-drive)
5. [Preparar a pasta de teste](#5-preparar-a-pasta-de-teste)
6. [Processo de sincronização](#6-processo-de-sincronização)
7. [Formatos suportados](#7-formatos-suportados)
8. [IA no produto](#8-ia-no-produto)
9. [Custo estimado por uso](#9-custo-estimado-por-uso)
10. [Testes](#10-testes)
11. [Limitações conhecidas](#11-limitações-conhecidas)
12. [Antes de usar dados reais](#12-antes-de-usar-dados-reais)
13. [Como limpar dados](#13-como-limpar-dados)
14. [Ferramentas de IA usadas](#14-ferramentas-de-ia-usadas)

## 1. Arquitetura em linguagem simples

```
Google Drive (pasta de teste)
        │  leitura somente (drive.readonly)
        ▼
  Worker (npm run worker)  ──►  SQLite (prisma/dev.db)  ◄──  Next.js (páginas + /api)  ◄──  Navegador
  baixa, extrai, classifica,     atividades, fontes,          lê e grava no mesmo banco
  chama a IA e grava sugestões   sugestões, histórico
```

Só o **worker** conversa com o Drive. O Next.js só lê e grava no banco. O botão "Sincronizar agora" grava um pedido no banco, que o worker atende em até 5 segundos. As mudanças nas atividades oficiais só acontecem em `lib/activities`, que grava o evento de histórico na mesma transação.

| Pasta | Papel |
| --- | --- |
| `lib/drive` | Cliente da Drive API: percorrer a árvore da pasta, `changes.list`, baixar/exportar, tentar de novo com espera progressiva |
| `lib/extract` | Lê `.md`, Google Docs exportados em Markdown, `.xlsx` e PDF com texto e devolve texto/linhas com referência (aba, célula, seção) |
| `lib/authority` | Lê o `INDEX.md` e decide o papel de cada arquivo (fonte vigente, ata, documento superado, planilha sem autoridade) |
| `lib/ai` | Interface `AIProvider`, provedor OpenAI, provedor por regras e a camada de validação independente do modelo |
| `lib/ingest` | Orquestra: fonte → extração → classificação → importação inicial, diferença da planilha ou análise da ata → sugestões |
| `lib/sync` | Ciclo de sincronização (inicial, incremental, varredura completa, manual), trava de concorrência e agendamento |
| `lib/activities` | Criar, editar, aprovar e rejeitar atividades, sempre com evento de histórico (autor, antes/depois, motivo, fonte) |
| `lib/google`, `lib/summary`, `lib/suggestions` | OAuth e criptografia do token; "o que mudou para mim"; consultas da fila de revisão |
| `worker/` | Processo separado com o laço de sincronização (verifica a cada 5 s se há trabalho) |
| `app/`, `components/` | Páginas e rotas `/api` do Next.js; componentes de interface |
| `prisma/` | Esquema, migrações e semente (4 membros fictícios) |
| `tests/` | Vitest, com os arquivos do pacote de teste em `tests/fixtures` |

**Por que SQLite e um worker separado:** a banca roda sem instalar banco; o banco persiste após reiniciar; e o worker isolado evita timers duplicados que o recarregamento a quente do Next.js causaria.

**Identidade de demonstração:** o seletor "Vendo como" (Ana, Bruno, Carla, Davi) troca o usuário por cookie, sem senha. Bruno revisa a frente Growth, Carla revisa Formação; frentes sem revisor dedicado (como Operações) e atividades sem frente aceitam qualquer revisor.

## 2. Fonte oficial das atividades

Decisão: **depois da importação inicial, o banco da aplicação é o registro oficial**. A planilha do Drive é a base da primeira importação e depois vira uma fonte que gera *sugestões*. A regra de precedência, também descrita na tela "Comece aqui":

1. **Decisão humana aprovada na aplicação** (edição manual ou sugestão aceita/ajustada) define o estado oficial.
2. **Ata nova com decisão explícita** gera uma sugestão pendente; nunca altera o oficial sozinha. Enquanto pendente, a atividade mostra "atualização proposta pendente".
3. **A planilha apontada pelo `INDEX.md`** é a base da primeira importação (eventos `import`, autor `system`). Versões posteriores dela geram sugestões por diferença de campo.
4. **Arquivos superados (`deprecated`), planilhas sem autoridade, rascunhos e textos históricos** nunca alteram atividades. Uma planilha com cabeçalho de atividades fora da fonte vigente gera um conflito de fonte para decisão humana.
5. **Se duas fontes ativas discordam** e não há decisão humana, a divergência aparece como conflito ou incerteza na revisão. Data de arquivo mais recente não confere autoridade.

O que isso significa na prática:

- **Edição posterior do `.xlsx` vigente:** vira sugestão (uma por atividade, comparando com o que já foi importado ou aceito). Voltar a um valor que já é o oficial não gera sugestão. Uma proposta rejeitada não volta nas versões seguintes.
- **Linha removida da planilha:** não apaga a atividade. As sugestões pendentes daquela linha são substituídas e a situação fica registrada como incerteza.
- **Planilha homônima (ex.: `Ata - copia vazia.xlsx`):** não apaga nem reimporta nada. Aparece como "conflito de fonte" na fila de sugestões; o revisor decide entre descartar ou analisar as linhas como sugestões.
- **Sem `INDEX.md` ou sem fonte apontada:** nenhuma importação acontece; a pendência aparece em "Estado da sincronização".

## 3. Requisitos e instalação

Requisitos: Node.js 22 ou superior (testado com 22.13) e npm. Não é preciso instalar banco de dados.

```bash
git clone <URL-DO-REPOSITÓRIO>
cd ProcessoSeletivoLigaIa
npm install
cp .env.example .env        # no Windows (cmd): copy .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# copie o valor gerado para TOKEN_ENC_KEY no .env
npm run setup               # cria prisma/dev.db, aplica as migrações e cria os 4 membros fictícios
npm run dev                 # sobe o Next.js e o worker de sincronização juntos
```

Abra <http://localhost:3000>. Sem credenciais do Google a aplicação abre normalmente (com atividades vazias e "Desconectado do Drive"); a conexão com o Drive é descrita na próxima seção. `AI_PROVIDER=none` (padrão do `.env.example`) funciona sem chave de IA.

Outros comandos:

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Next.js + worker (`concurrently`) |
| `npm run dev:web` / `npm run worker` | Só o Next.js / só o worker |
| `npm run build` e `npm start` | Build de produção e execução (também sobe o worker) |
| `npm test` | Testes automatizados |
| `npm run typecheck` / `npm run lint` | Tipos e lint |
| `npm run db:reset` | Apaga e recria o banco. O Prisma bloqueia esse comando quando executado por agentes de IA; rode-o você mesmo em um terminal. Alternativa: apagar `prisma/dev.db` e rodar `npm run setup` |

Variáveis do `.env` (nenhum valor real deve ser versionado; `.env` está no `.gitignore`):

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Caminho do SQLite (padrão `file:./prisma/dev.db`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Cliente OAuth "Web application" |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/api/google/callback` |
| `DRIVE_TEST_FOLDER_ID` | ID da pasta do Drive monitorada |
| `TOKEN_ENC_KEY` | Chave que criptografa o refresh token no banco (AES-256-GCM) |
| `AI_PROVIDER` | `none` (regras) ou `openai` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Só com `AI_PROVIDER=openai`; modelo padrão `gpt-6-luna`. Sem chave, a aplicação volta para o modo por regras e avisa no log |
| `SYNC_INCREMENTAL_MS`, `SYNC_FULL_MS` | Intervalos do worker (padrão 120000 e 600000) |

## 4. Credenciais do Google e pasta do Drive

Resumo do guia `04_Guia_Google_Drive_API.md` do pacote do caso. Use sua própria conta e a pasta de teste, nunca o Drive real da Liga.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie (ou escolha) um projeto de teste e ative a **Google Drive API** em *APIs e serviços > Biblioteca*.
2. Em *Google Auth Platform*, configure o nome do app e um e-mail de suporte. Em **Audience**, escolha **External**, mantenha o app em **Testing** e adicione o seu próprio e-mail em **Test users**.
3. Em *Data Access*, declare apenas o escopo `https://www.googleapis.com/auth/drive.readonly` (somente leitura; é o escopo que permite detectar arquivos novos colocados direto na pasta).
4. Em *Clients*, crie um cliente **Web application** com:
   - origem JavaScript autorizada: `http://localhost:3000`
   - URI de redirecionamento autorizado: **`http://localhost:3000/api/google/callback`** (precisa ser idêntico ao `GOOGLE_REDIRECT_URI`, incluindo porta e sem barra final).
5. Copie o ID e o segredo do cliente para `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env`.
6. No seu Google Drive, crie a pasta `LIA case teste`. Abra a pasta no navegador; o ID é o trecho final da URL (`https://drive.google.com/drive/folders/<ID>`). Coloque-o em `DRIVE_TEST_FOLDER_ID`.
7. Com `npm run dev` rodando, abra **Estado da sincronização**, clique em **Conectar conta Google**, escolha a conta de teste e confirme o acesso. A aplicação lista a pasta e as subpastas e processa os arquivos.

Avisos:

- Com o app **External em Testing**, o refresh token expira em **7 dias**. Quando isso acontece, o indicador mostra "Reconexão com o Google necessária" e basta conectar de novo.
- O refresh token é guardado criptografado no SQLite e nunca vai para o navegador nem para o log. A aplicação só lê o Drive; não escreve nada.
- `redirect_uri_mismatch` significa que o callback cadastrado difere do usado pela aplicação (protocolo, porta, caminho ou barra final).

## 5. Preparar a pasta de teste

Resumo de `03_Dados_de_Teste/LEIA_ME_PRIMEIRO.md`. Os mesmos arquivos estão em `tests/fixtures/`.

1. **Carga inicial:** envie o conteúdo de `01_CARGA_INICIAL` para a pasta, preservando os nomes (`Ata_registro.xlsx` deve continuar `.xlsx`; `INDEX.md` deve continuar `.md`). Depois da primeira sincronização, confira: Ana vê `ACT-101` e `ACT-104`; Davi vê `ACT-102` e `ACT-104`; Carla vê `ACT-103` (bloqueada).
2. **Depois da carga:** envie `Ata_2026-10-03.docx` e converta-o em **Google Docs nativo** pelo Drive (ou crie um Google Doc com o texto do `.md` equivalente; não envie as duas versões). Envie também `Ata_2026-10-04.md`. Aguarde o ciclo automático (até 15 minutos) ou use "Sincronizar agora". Esperado: uma sugestão de atualizar `ACT-101` (prazo 05/10 → 07/10) e uma sugestão de criar atividade para Carla (prazo 10/10); o parágrafo "Talvez…" aparece em "Trechos sem decisão".
3. **Por último:** envie a planilha vazia de `03_CONFLITO`. As atividades oficiais devem continuar lá e o conflito deve aparecer na fila de sugestões.

## 6. Processo de sincronização

- **Worker separado** (`worker/index.ts`): a cada 5 s verifica se há pedido manual ou se chegou a hora do próximo ciclo.
- **Primeira execução:** pega o `startPageToken`, percorre a pasta e as subpastas (com conjunto de visitados), processa arquivo por arquivo e depois consulta `changes.list` para cobrir o que mudou durante a leitura.
- **A cada 2 minutos:** `changes.list` paginado; grava o novo token só ao final. Cada mudança é conferida contra a árvore da pasta monitorada (subindo pelos pais, com cache); arquivos de fora são ignorados.
- **A cada 10 minutos:** varredura completa que compara a árvore real com o banco; arquivo que sumiu vira "indisponível" mesmo sem evento de mudança.
- **Botão "Sincronizar agora":** cria um pedido; o worker atende no próximo tick. Uma trava no banco impede dois ciclos ao mesmo tempo.
- **Idempotência:** a identidade da fonte é o `file_id` do Drive. A versão é o `md5Checksum` (binários) ou o hash do texto exportado (Google Docs/Sheets). Mesmo arquivo e mesma versão não reprocessam nem duplicam sugestões. A chave de deduplicação das sugestões é única no banco.
- **Renomear ou mover:** o arquivo mantém o ID; só nome e caminho são atualizados, sem reprocessar (o Drive muda a "versão" de um Google Doc ao renomear; por isso a aplicação compara também o hash do conteúdo).
- **Removido, na lixeira ou sem acesso:** a fonte vira "indisponível", o texto em cache é apagado e as atividades ligadas a ela aparecem como possivelmente desatualizadas.
- **Ata editada:** as sugestões pendentes da versão anterior viram "substituída" só depois que a nova análise termina com sucesso; as já aceitas continuam no histórico.
- **Falha nunca vira "vazio":** erro de download, de leitura ou da IA marca a fonte com "erro" e o motivo, mantém o estado anterior e tenta de novo no próximo ciclo. Erros 429/5xx/timeout têm até 5 tentativas com espera de 2, 4, 8, 16 e 32 s.
- **Token expirado ou revogado:** o estado vira "Reconexão com o Google necessária"; as atividades continuam visíveis.
- O indicador no cabeçalho mostra o estado em texto ("Sincronizado há 3 min", "Falha na sincronização", "Sincronizador parado", "Desconectado do Drive").

## 7. Formatos suportados

| Formato | Como é lido | Observação |
| --- | --- | --- |
| `.md` | Download do arquivo | Front-matter no formato do acervo (`chave: valor` após o título) ou YAML com `---`; seções por título |
| Google Docs | `files.export` em Markdown (com `text/plain` como alternativa) | Limite de 10 MB do Google; acima disso, "não processado" com o motivo |
| `.xlsx` | Download + SheetJS | Abas, linhas e referência de célula; datas lidas pelo número serial, sem depender de fuso |
| Google Sheets | `files.export` como `.xlsx` | Mesmo caminho do `.xlsx` |
| PDF com texto selecionável | Download + `pdf-parse` | Diferencial. PDF sem texto (digitalizado) fica "não processado" com o motivo |
| `.docx`, imagens, vídeos, outros | Não lidos | Aparecem na lista de fontes como "formato ainda não processado", com o motivo (para `.docx`: converter para Google Docs) |

## 8. IA no produto

- **Modelo:** OpenAI GPT-6 Luna (`gpt-6-luna`) pela Responses API, com saída em JSON Schema estrito. O código usa uma interface `AIProvider`, então outro provedor pode ser plugado.
- **Modo sem IA:** `AI_PROVIDER=none` (ou `openai` sem chave) usa extração por regras: parágrafo com `ACT-nnn` e data ISO vira atualização; nome de membro + compromisso + data ISO vira criação; "talvez"/"ideia"/"sem decisão" são descartados. A interface informa que a IA está desativada.
- **O texto das atas é tratado como dado não confiável:** vai entre delimitadores `<documento>`, o prompt manda ignorar instruções escritas no documento e os delimitadores dentro do texto são neutralizados.
- **Validação independente do modelo** (`lib/ai/validate.ts`), aplicada antes de qualquer sugestão ser gravada:
  - a evidência precisa ser trecho literal do documento (ignorando markdown, aspas tipográficas e espaços);
  - o `target_activity_id` precisa existir; senão a atualização é descartada;
  - a data precisa aparecer no trecho, com fronteira de dígitos (`7/10` não casa com `17/10`); senão o prazo vira nulo com a incerteza "prazo não explícito";
  - responsável precisa existir e ser citado no trecho; senão o campo fica vazio com "responsável a confirmar";
  - campos iguais ao oficial são removidos; atualização sem mudança real é descartada;
  - criação parecida com atividade existente recebe aviso de possível duplicata;
  - recusa, resposta incompleta ou JSON inválido da IA viram erro da fonte (nova tentativa no próximo ciclo), nunca "nenhuma atividade".
- **Resumo "o que mudou para mim":** os fatos (eventos confirmados, sugestões pendentes que afetam o membro, bloqueios, prazos vencidos ou em até 3 dias, fontes indisponíveis) são montados por código, cada um com link. A IA só redige 2–3 frases, rotuladas "Resumo gerado por IA — confira nos itens abaixo". Sem IA ou com falha, aparece só a lista de fatos.

## 9. Custo estimado por uso

Preço do GPT-6 Luna consultado em 2026-10-03: **US$ 0,10 por 1 milhão de tokens de entrada** e **US$ 0,50 por 1 milhão de tokens de saída**. Os preços podem mudar; confira antes de usar.

| Operação | Estimativa | Custo |
| --- | --- | --- |
| Analisar uma ata | ~3 mil tokens de entrada + ~0,5 mil de saída | ~US$ 0,0006 |
| Resumo pessoal | ~1 mil de entrada + ~0,2 mil de saída | ~US$ 0,0002 |
| Demonstração completa (poucas atas e alguns resumos) | | menos de US$ 0,01 |

São estimativas por ordem de grandeza (não medimos tokens reais com a API; a validação ponta a ponta foi feita sem chamar o OpenAI). O tamanho real depende do tamanho da ata e da lista de atividades enviada junto. A Drive API não tem custo dentro das cotas padrão. Com `AI_PROVIDER=none` o custo é zero.

## 10. Testes

```bash
npm test
```

Resultado da última execução: **16 arquivos, 199 testes passando**; `npm run typecheck` e `npm run lint` sem erros. Os testes usam um banco SQLite descartável (`prisma/test.db`) e os arquivos reais do pacote em `tests/fixtures`. Eles cobrem: extratores (`.md`, `.xlsx`, front-matter, Google Docs); parser do `INDEX.md` e classificação (incluindo a planilha homônima vazia); importação inicial (4 atividades, `ACT-104` com dois donos, `ACT-103` bloqueada); diferença da planilha; validação da saída da IA; modo por regras nas atas de 03/10 e 04/10; provedor OpenAI com cliente simulado; idempotência (mesmo arquivo duas vezes, aprovação duas vezes); ciclo de sincronização com Drive simulado (novo, editado, renomeado, removido, lixeira, falha temporária, token revogado, trava de concorrência); criação, edição e revisão de atividades; permissões de revisão; "o que mudou" para Ana e Davi; rotas de revisão (403/200/409).

O que **não** é coberto por testes automatizados: chamadas reais ao Google Drive e ao OpenAI, interface no navegador (teclado, 375 px). Esses casos estão no registro de validação, com o status real de cada um: [`VALIDACAO.md`](VALIDACAO.md).

## 11. Limitações conhecidas

- **A validação ponta a ponta com o Google Drive real ainda não foi executada.** Toda a lógica de sincronização foi testada com um Drive simulado e os arquivos do pacote carregados pelo mesmo código de ingestão. O passo a passo para executar com a pasta real está em `VALIDACAO.md`.
- **Identidade de demonstração sem senha:** o seletor "Vendo como" é só para demonstrar papéis. Qualquer pessoa com acesso à aplicação pode se passar por qualquer membro.
- **Um único token Google** (a conta do operador) serve a todos os usuários da aplicação.
- **Permissões por arquivo não são verificadas por usuário:** quem usa a aplicação vê trechos de qualquer arquivo da pasta, mesmo que não tivesse acesso a ele no Drive.
- **SQLite local:** um processo de escrita por vez (modo WAL ligado); adequado para demonstração, não para uso simultâneo por muita gente.
- **O sync automático depende do worker rodando.** Sem ele, o indicador mostra "Sincronizador parado". O heartbeat não atualiza durante um ciclo muito longo.
- **Refresh token expira em 7 dias** enquanto o app Google está em modo Testing.
- **A IA pode errar.** Por isso existe a validação independente e a revisão humana; a validação checa evidência, datas, IDs e responsáveis, mas não consegue garantir que a *interpretação* do trecho esteja certa.
- **A extração por regras cobre só padrões explícitos** (ID `ACT-nnn` + data ISO; nome + compromisso + data). Um compromisso sem data ou sem responsável nomeado é simplesmente ignorado nesse modo (não vira sugestão com "prazo a definir"; isso só acontece com a IA ligada). Prazos relativos ("até sexta") não são convertidos em data: viram incerteza.
- **Detalhes conhecidos da revisão:** uma sugestão rejeitada pode reaparecer se a ata for editada de modo trivial (a deduplicação considera a versão da ata); uma planilha editada pode reapresentar um valor já rejeitado se outro campo da mesma linha mudar; o marcador "desde a última visita" avança com a renderização da página e não só com a leitura explícita do resumo.
- **Download sem limite de tamanho** para arquivos binários (só a exportação de Google Docs tem o limite de 10 MB do Google).
- Sem tela de erro dedicada: se o banco estiver indisponível, o layout falha por inteiro. A fonte Inter é buscada da rede durante o build.
- Rotas `POST` sem verificação de `Origin` e cookie de identidade sem `httpOnly` (aceitável só porque a identidade é de demonstração).
- Fora do escopo: chat/RAG sobre documentos, `changes.watch` (webhooks), escrita no Drive, notificações externas, login real, OCR, imagens, vídeo, `.docx` direto e deploy público.

## 12. Antes de usar dados reais

1. **Autenticação real** (por exemplo Google Sign-In) e mapeamento membro ↔ conta, no lugar do seletor "Vendo como".
2. **Permissão por arquivo e por usuário:** antes de mostrar um trecho, conferir se aquele usuário tem acesso ao arquivo no Drive (campo `permissions` ou consulta com o token do próprio usuário).
3. **Verificação OAuth do escopo restrito** `drive.readonly` e avaliação de segurança exigida pelo Google para apps que armazenam esses dados em servidor.
4. **Banco gerenciado com backup** (no lugar do SQLite local) e **segredos em um gerenciador** (no lugar do `.env`).
5. **Política de retenção** e remoção do cache de texto extraído (hoje só há "Desconectar e limpar cache" e a remoção manual do banco).
6. **Registro de auditoria imutável** das decisões de revisão (hoje o histórico fica no mesmo banco editável).
7. **Revisão de privacidade antes de enviar texto de documentos a um provedor de IA** (o texto das atas vai ao OpenAI quando `AI_PROVIDER=openai`), com acordo de tratamento de dados e, se necessário, remoção de dados pessoais antes do envio.
8. Hospedagem com HTTPS, verificação de `Origin` nas rotas `POST`, tela de erro e monitoramento do worker.

## 13. Como limpar dados

- **Pela interface:** "Estado da sincronização" > **Desconectar e limpar cache**. Isso revoga o token no Google e apaga o token e os textos extraídos do banco.
- **Recomeçar do zero:** pare a aplicação, apague `prisma/dev.db` (e `prisma/dev.db-wal`/`-shm`, se existirem) e rode `npm run setup`. O banco local contém atividades, histórico e o token criptografado.
- **Revogar o app no Google:** <https://myaccount.google.com/connections> > selecione o app de teste > *Remover acesso*. Se um segredo vazou, troque o cliente OAuth no Cloud Console.

## 14. Ferramentas de IA usadas

**Para construir (desenvolvimento):** Claude Code (Claude, da Anthropic). O fluxo foi: design conduzido por perguntas (brainstorming), especificação escrita, plano de 14 tarefas, implementação por subagentes em worktrees git isolados em ondas paralelas, uma revisão por tarefa e rodadas de correção. Heitor aprovou cada decisão de design e revisou o resultado. O processo está no [`DIARIO_DE_BORDO.md`](DIARIO_DE_BORDO.md).

**Dentro do produto:** OpenAI GPT-6 Luna (`gpt-6-luna`), opcional, para propor sugestões a partir de atas e redigir o resumo pessoal. Sem a chave, o modo por regras funciona sem IA.

**Decisões que mudei depois de verificar saídas incorretas:**

1. **Datas confundidas dentro de outras.** Uma revisão mostrou que a checagem "a data aparece no trecho" aceitava `7/10` dentro de `17/10`; uma saída do modelo com a data errada poderia passar como "confirmada pelo trecho". Troquei por uma checagem com fronteira de dígitos, com teste dedicado (`dateMentioned exige limites de dígitos`).
2. **Atalhos do plano que perdiam análise em silêncio.** O plano original tinha um atalho "ata de origem do registro, sem análise" e mandava substituir as sugestões antigas *antes* de extrair a nova versão. Ao conferir o comportamento, percebi que o primeiro poderia dispensar a análise de atas novas citadas como "Origem" e que o segundo apagaria a fila de revisão se a IA falhasse. Redesenhei: o atalho só vale para atividades da importação inicial, e as sugestões antigas só são substituídas depois de uma extração bem-sucedida.
3. **Edições da planilha empilhando sugestões contraditórias.** O diff original comparava cada versão com a anterior e gerava propostas que se contradiziam. Passei a comparar com a base da importação (ou da atividade aceita), com deduplicação sem versão e substituição por alvo.

Outras correções estão no diário (aspas tipográficas trocadas em uma expressão regular, verificação do nome do modelo na documentação da OpenAI, entre outras).

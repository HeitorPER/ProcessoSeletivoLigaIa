# Registro de validação

Este arquivo registra o que foi testado, como e com que resultado. Ele separa três tipos de evidência, para não misturar o que foi observado com o que ainda falta observar:

- **Automatizado:** teste do Vitest (arquivo e nome do teste indicados), rodando contra um banco SQLite descartável, com os arquivos reais do pacote (`tests/fixtures`) e um Drive simulado.
- **Local (observado):** execução na máquina de desenvolvimento, em 2026-10-03, com o banco de desenvolvimento carregado pelo mesmo código de ingestão usado pelo worker (`ingestSource`) e o servidor Next.js em `localhost:3000`, **sem** o Google Drive real.
- **Drive real — pendente:** exige as credenciais Google do operador e a pasta de teste. **Ainda não foi executado.** Os passos exatos estão no [roteiro](#roteiro-para-executar-com-a-pasta-real-do-drive) abaixo e a coluna "Resultado observado" será atualizada depois dele.

## Verificação automatizada (2026-10-04, revisão final)

| Comando | Resultado |
| --- | --- |
| `npm test` | 16 arquivos, **212 testes passando**, 0 falhas |
| `npm run lint` | sem erros |
| `npm run typecheck` (`next typegen` + `tsc --noEmit`) | sem erros |
| `npm run build` | não executado na revisão final (o servidor de desenvolvimento em uso compartilha a pasta `.next`); a última execução sem erros foi a da integração, em 2026-10-03, antes das correções finais |

## Resumo dos casos

| Caso | Entrada | Resultado esperado | Resultado observado | Correções importantes |
| --- | --- | --- | --- | --- |
| 1. Carga inicial | Pasta com `01_CARGA_INICIAL` (`INDEX.md`, `Ata_registro.xlsx`, `Ata_2026-10-01.md`, `ESTADO-ATUAL.md`, `GUIA_INICIAL.md`, `PLANO_EDITORIAL_ANTIGO.md`) | 4 atividades; Ana vê ACT-101 e ACT-104, Davi vê ACT-102 e ACT-104, Carla vê ACT-103 (bloqueada); plano antigo como histórico; nenhuma sugestão criada | Automatizado: OK. Local: OK (carga via ingestão; Ana vê as suas em "Minhas atividades"). Drive real: **pendente — executar com a pasta real** | Datas da planilha lidas pelo número serial do Excel, sem depender de fuso; atalho "ata de origem" restrito às atividades importadas |
| 2. Arquivo adicionado ao Drive | `Ata_2026-10-04.md` enviada direto ao Drive, sem upload pela interface | Aparece processada em até 15 min; sugestão de criação para Carla (prazo 10/10/2026) | Automatizado: OK (via `changes.list` simulado). Local: a sugestão de criação para Carla **não foi conferida manualmente na interface** (coberta pelos testes automatizados; ver observações da execução local). Drive real: **pendente — executar com a pasta real** (tempo até aparecer ainda não medido) | Falha da IA/leitura nunca vira "sem atividades": fonte fica com erro e é repetida |
| 3. Atualização de prazo | `Ata_2026-10-03` como Google Docs nativo | Sugestão de atualizar ACT-101 (prazo 05/10 → 07/10 e próximo passo) com trecho literal; oficial continua 05/10 até a aprovação; aprovada, passa a 07/10 com histórico preservado e nenhuma segunda atividade | Automatizado: OK. Local: OK — Bruno aprova e ACT-101 vai para 07/10 com evento no histórico. Drive real (Google Doc nativo/exportação): **pendente — executar com a pasta real** | Comparação tolerante do "próximo passo" (para não propor mudança falsa); `7/10` não é aceito dentro de `17/10` (fronteira de dígitos) |
| 4. Edição de documento já conectado | Editar a ata no Drive depois de processada | Nova versão detectada; fonte não duplicada; sugestão pendente antiga marcada "substituída"; renomear não reprocessa | Automatizado: OK. Drive real: **pendente — executar com a pasta real** | Supersede só depois de extração bem-sucedida (antes apagaria a fila se a IA falhasse); renomear Google Doc não reprocessa (revisão do Drive separada do hash do conteúdo) |
| 5. Conflito de fonte | `Ata - copia vazia.xlsx` (só cabeçalho, aba `Ata`) | Atividades permanecem; conflito visível e decidido por humano (descartar ou analisar linhas) | Automatizado: OK. Local: não verificado separadamente. Drive real: **pendente — executar com a pasta real** | Um único conflito por arquivo, mesmo com nova versão; planilha homônima de outro `fileId` nunca reimporta |
| 6. Ideia vaga | Parágrafo "Talvez… série diária" da ata de 04/10 | Não vira atividade; aparece em "Trechos sem decisão" | Automatizado: OK (modo por regras). Local: não verificado separadamente. Com GPT-6 Luna real: **não verificado** (nenhuma chamada à API foi feita) | Regra do prompt e das regras: hipóteses viram `no_action` com motivo |
| 7. Dado ausente | Ata nova (`.md` de teste, a criar) com compromisso sem prazo ou sem responsável | Sugestão com "prazo a definir" / "responsável a confirmar", sem valores inventados | Automatizado: OK para a validação (saída da IA sem dono/prazo). **No modo por regras o trecho é ignorado, não vira sugestão** (limitação). Drive real e IA real: **pendente — executar com a pasta real** | Responsável precisa aparecer no trecho; data precisa aparecer com fronteira de dígitos; senão vira incerteza |
| 8. Atividade manual e reinício | Criar atividade pela interface; reiniciar `npm run dev` | Atividade continua com autor e histórico | Automatizado: OK (criação grava ID `ACT-M-001`, autor e evento no banco). Reinício do servidor: **pendente — verificação manual** (não depende do Drive) | Regra "bloquear exige motivo" aplicada nas rotas |
| 9. Erro de fonte | Remover um arquivo (ou tirar o acesso) no Drive | Fonte "indisponível" com motivo, cache de texto apagado, atividade marcada como potencialmente desatualizada | Automatizado: OK (remoção, lixeira, movido para fora, varredura completa). Drive real: **pendente — executar com a pasta real** | Falha transitória (HTTP 500) vira "erro", não "indisponível"; falha de varredura não avança o token |
| 10. Resumo pessoal | Ata/atualização relevante só para Ana | "Novidades" de Ana mostra a mudança; Davi não vê; mudança em ACT-104 aparece para os dois | Automatizado: OK. Local: tela "Novidades" não verificada separadamente. Resumo redigido por IA: **não verificado** | Fatos montados por código; a IA só redige o parágrafo rotulado |
| 11. Primeiro acesso | Membro novo abre "Comece aqui" | Propósito marcado como provisório, frentes, fonte das atividades, primeira ação, links | Automatizado: OK. Verificação visual no navegador: **pendente** | Documento indisponível nunca mostra texto antigo |
| 12. Acessibilidade | Teclado (Tab/Shift+Tab, foco visível), largura de 375 px, contraste | Tudo operável por teclado, foco visível, sem rolagem horizontal, contraste ≥ 4,5:1 | Contraste: **calculado** (abaixo). Teclado e 375 px: **pendente — verificação manual no navegador** | Rótulos, `aria-describedby`, `aria-live` e erros em texto ajustados nas revisões da interface |

## Detalhe por caso: testes automatizados

Formato: arquivo — nome do teste.

**1. Carga inicial**
- `tests/ingest.test.ts` — "importa as 4 atividades da fonte apontada pelo INDEX"; "classifica as fontes e não cria sugestões na carga inicial"
- `tests/activities.test.ts` — "importação preserva dois responsáveis e atividade bloqueada"; "\"minhas\" de Ana e Davi; ACT-104 aparece uma vez para cada"
- `tests/extract.test.ts` — "lê o registro inicial com datas e referências de célula"
- `tests/authority.test.ts` — "extrai a fonte vigente e a aba do INDEX.md do pacote"; "plano antigo → deprecated (front-matter ou INDEX)"
- `tests/sync.test.ts` — "primeira execução vira carga inicial completa"

**2. Arquivo adicionado ao Drive**
- `tests/sync.test.ts` — "arquivo novo via changes vira sugestão; o mesmo evento duas vezes não duplica"; "pedido manual tem prioridade; depois incremental; varredura a cada 10 min" (`decideRun`)
- `tests/ingest.test.ts` — "ata 04/10 gera criação para Carla e descarta a ideia \"talvez\""
- `tests/ai.test.ts` — "ata 04/10 → uma criação para Carla e a ideia \"talvez\" descartada"

**3. Atualização de prazo**
- `tests/ingest.test.ts` — "ata 03/10 gera uma sugestão de atualização e não altera o oficial"
- `tests/ai.test.ts` — "ata 03/10 → uma atualização de ACT-101"; "atualização de prazo de ACT-101 mantém só os campos que mudam"; "ata 01/10 (já consolidada no registro) → nenhuma sugestão"; "atualização sem mudança real é descartada (paráfrase do próximo passo)"; "dateMentioned exige limites de dígitos (17/10 não é 07/10)"
- `tests/activities.test.ts` — "aceitar atualização altera o oficial, grava evento e referência"; "aceitar duas vezes é idempotente"; "revisor de outra frente é bloqueado"
- `tests/review-request.test.ts` — "Bruno aceita -> 200 e atividade atualizada; segunda aceitação -> 409"; "quem não revisa a frente -> 403 e nada muda"
- `tests/sync.test.ts` — "Google Doc nativo: exporta markdown; renomear não cria nova sugestão"

**4. Edição de documento já conectado**
- `tests/ingest.test.ts` — "edição da ata substitui a sugestão pendente da versão antiga"; "reprocessar ata após aceite não recria sugestão"; "o mesmo evento duas vezes não duplica sugestões"; "B: falha da IA na reedição preserva a sugestão antiga; sucesso depois a substitui"
- `tests/sync.test.ts` — "edição gera nova versão sem duplicar a fonte; renomear não reprocessa"
- `tests/ingest.test.ts` — "ata antiga reanalisada não propõe reverter decisão humana posterior (spec §3, regra 1)"; "decisão humana anterior à reunião não bloqueia a proposta da ata"
- `tests/suggestions-view.test.ts` — "pendente mostra o valor oficial atual (não a foto do momento da sugestão)"

**5. Conflito**
- `tests/ingest.test.ts` — "planilha vazia homônima não apaga nada e vira conflito visível"; "cópia com o mesmo nome da fonte vigente (outro fileId) não reimporta"; "E: o mesmo arquivo em conflito gera um único source_conflict mesmo com nova versão"
- `tests/sync.test.ts` — "planilha vazia homônima numa subpasta não apaga atividades"; "mudança no INDEX reavalia as planilhas não modificadas, uma vez cada"
- `tests/authority.test.ts` — "planilha vazia homônima → unauthorized_sheet"
- `tests/activities.test.ts` — "conflito de fonte: aceitar pede análise; rejeitar descarta"
- `tests/review-request.test.ts` — "conflito de fonte" › "aceitar -> 200 com contagem analisada"; "falha na análise depois de registrar a revisão ainda responde 200 com aviso"

**6. Ideia vaga**
- `tests/ai.test.ts` — "ata 04/10 → uma criação para Carla e a ideia \"talvez\" descartada"; "no_action vira trecho descartado com motivo"; "instruções dentro do documento não viram ação"; "o texto não consegue fechar o bloco de dados"
- `tests/suggestions-view.test.ts` — "trechos descartados com fonte"

**7. Dado ausente**
- `tests/ai.test.ts` — "criação sem responsável e sem prazo registra incertezas (não inventa)"; "data que não aparece no trecho não é aceita"; "responsável que não aparece no trecho é removido e vira incerteza (criação)"; "responsável inexistente vira incerteza"; "mudança de estado sem menção explícita mantém o campo e registra incerteza"
- `tests/ingest.test.ts` — "falha da IA marca erro e permite nova tentativa (nunca \"sem atividades\")"

**8. Atividade manual e reinício**
- `tests/activities.test.ts` — "criação manual gera ID ACT-M-001, autor e evento"; "edição registra só campos alterados, com antes/depois"; "edição sem mudança não gera evento"; "troca de responsáveis e mudança de estado"
- `tests/activity-input.test.ts` — "bloqueada sem motivo efetivo gera erro"

**9. Erro de fonte**
- `tests/sync.test.ts` — "remoção e lixeira marcam a fonte como indisponível e apagam o cache"; "varredura completa detecta arquivo sumido sem evento de mudança"; "falha na varredura não marca nada como indisponível nem avança o token"; "falha transitória de download (HTTP 500) vira \"error\", não \"unavailable\""; "arquivo na lixeira (evento com trashed) vira indisponível"; "arquivo conhecido movido para fora da pasta vira indisponível"; "token revogado → estado auth_required"; "403 por limite de taxa (após as novas tentativas) vira \"error\" e mantém o cache; 403 de permissão vira \"unavailable\""; "a próxima varredura completa restaura o texto sem reanalisar nem criar sugestões"; "ata na lixeira e restaurada com o mesmo conteúdo não é reanalisada"
- `tests/ingest.test.ts` — "markSourceUnavailable apaga o texto em cache"; "restoreExtractedText regrava só o texto, sem reclassificar nem reanalisar"; "analisar planilha sem texto em cache falha com mensagem clara (nunca \"0 sugestões\")"; "arquivo ilegível fica \"com erro\" (não vazio)"; "formato não suportado fica \"ignorado\" com motivo e versão registrada"
- `tests/activities.test.ts` — "indica sugestão pendente e fonte indisponível"; "distingue fonte com erro de leitura de fonte indisponível"
- `tests/digest.test.ts` — "incertezas: fonte indisponível e conflito de fonte"

**10. Resumo pessoal**
- `tests/digest.test.ts` — "proposta pendente afeta Ana e não Davi"; "após aprovação, Ana vê mudança confirmada com fonte; Davi não"; "mudança na atividade compartilhada aparece para os dois"; "prazos próximos e bloqueios"; "resumo por IA recebe só fatos estruturados; falha ou nada novo → null"
- `tests/period.test.ts` — "última visita quando existe"; "sem visita anterior usa 7 dias e explica"

**11. Primeiro acesso**
- `tests/ui-logic.test.ts` — "monta propósito provisório, frentes, histórico, fonte e primeira ação"; "lacunas quando nada foi sincronizado e membro sem atividade"; "documento indisponível aparece como lacuna, sem texto antigo"; "primeira visita é detectada uma vez"; "duas primeiras visitas simultâneas não falham e só uma é \"primeira\""

**12. Acessibilidade**
- Sem teste automatizado de interface. Contraste calculado pela fórmula WCAG 2.x a partir dos tokens de `app/globals.css` (cálculo feito em 2026-10-03, não é teste do repositório):

| Par (texto / fundo) | Razão |
| --- | --- |
| `#0B0B14` / branco | 19,6:1 |
| `#1433BD` (azul da marca) / branco | 9,4:1 |
| branco / `#1433BD` (botão primário) | 9,4:1 |
| `#4A4F5C` (texto secundário) / branco | 8,2:1 |
| `#0B0B14` / `#19DCE3` (ciano) | 11,6:1 |
| `#A4161A` / `#FDECEC` (erro) | 6,8:1 |
| `#7A4B00` / `#FFF4DC` (aviso) | 6,8:1 |
| `#1E6B3A` / `#E6F4EA` (sucesso) | 5,7:1 |

Todos acima de 4,5:1. Teclado e 375 px dependem de conferência visual (ver roteiro).

## Observações da execução local (2026-10-03)

Registro do que o controlador verificou com o banco de desenvolvimento carregado com os arquivos do pacote pelo código de ingestão e o servidor em `localhost:3000`:

- "Minhas atividades" de Ana mostrou as atividades esperadas (ACT-101 e ACT-104).
- A fila de sugestões foi conferida e continha a atualização de ACT-101 (a criação para Carla é coberta pelos testes automatizados).
- API de revisão: Ana (não revisora) recebeu **403**; Bruno aceitando recebeu **200**; repetir a aceitação devolveu **409** (revisão idempotente).
- Após a aprovação por Bruno, ACT-101 passou a prazo **07/10** e o histórico preservou o prazo anterior (05/10) com a referência à ata.

Isto **não** substitui a validação com o Drive real: não passou por OAuth, `changes.list`, exportação de Google Docs nem pela espera do ciclo automático.

## Roteiro para executar com a pasta real do Drive

Pré-requisitos: cliente OAuth criado e `.env` preenchido (seções 3 e 4 do README), pasta `LIA case teste` criada e vazia, `AI_PROVIDER=none` (ou `openai` com chave, se for validar a IA real).

1. Rodar `npm run setup` e depois `npm run dev` (um comando por linha; o PowerShell 5.1 não aceita `&&`). Abrir `http://localhost:3000/sincronizacao` e clicar em **Conectar conta Google**. Esperado: retorno à aplicação com a conta (e-mail mascarado) e a pasta exibidas.
2. Enviar o conteúdo de `01_CARGA_INICIAL` para a pasta. Clicar em **Sincronizar agora**. Conferir: 4 atividades; Ana vê ACT-101/ACT-104, Davi vê ACT-102/ACT-104, Carla vê ACT-103; links das fontes abrem o arquivo no Drive; contadores e classificação das fontes (plano antigo como histórico). Registrar no caso 1.
3. Enviar a ata de 03/10 convertida em Google Docs e a ata de 04/10 `.md`. **Sem clicar em nada**, aguardar o ciclo automático e anotar o tempo até aparecerem (meta: ≤ 15 min). Registrar nos casos 2 e 3.
4. Em "Sugestões para revisar", abrir como Bruno (aceitar a atualização de ACT-101) e como Carla (aceitar a criação). Conferir "Minhas atividades" e "Novidades dos documentos" de Ana × Davi, e o parágrafo "Trechos sem decisão". Casos 3, 6 e 10.
5. Editar a ata de 03/10 no Drive (caso 4), renomear outra ata (esperado: sem nova sugestão), criar um `.md` de teste sem prazo ou sem responsável (caso 7), remover um arquivo da pasta (caso 9) e enviar `Ata - copia vazia.xlsx` (caso 5). Anotar o tempo de detecção de cada um.
6. Caso 8: criar uma atividade pela interface, parar e reiniciar `npm run dev` e confirmar que ela continua com autor e histórico.
7. Caso 11: em um perfil sem visita anterior, abrir "Comece aqui". Caso 12: navegar só com Tab/Shift+Tab (foco visível, link "Pular para o conteúdo"), reduzir a janela para 375 px (sem rolagem horizontal; cartões no lugar da tabela; menu com `aria-expanded`).
8. Atualizar a tabela de resumo substituindo cada "pendente" pelo resultado observado, e registrar qualquer correção feita.

## O que este registro não cobre

- Chamadas reais ao Google Drive e ao OpenAI (nenhuma foi feita).
- Tempo real de detecção em até 15 minutos (por construção o ciclo incremental é de 2 minutos; a medição real está pendente).
- Interface no navegador (teclado, 375 px, leitores de tela).
- Arquivos grandes, pastas com milhares de itens e uso por várias pessoas ao mesmo tempo.

# Dados de teste para a central da Liga

Todos os nomes, datas, documentos e atividades deste pacote são **fictícios**. Eles foram criados para testar um problema semelhante ao observado na organização. Não conecte sua aplicação ao Drive real da Liga.

## Preparação no seu Google Drive

1. Crie uma pasta chamada `LIA case teste` na sua própria conta. Configure sua aplicação para acompanhar essa pasta e subpastas.
2. Envie o conteúdo de `01_CARGA_INICIAL` para a pasta. Preserve os nomes dos arquivos. O registro de atividades é `.xlsx`; o arquivo Markdown deve permanecer como `.md`.
3. Verifique sua aplicação antes de enviar outros arquivos: Ana deve ver `ACT-101` e `ACT-104`; Davi deve ver `ACT-102` e `ACT-104`; Carla deve ver `ACT-103`.
4. Durante o desenvolvimento, copie o conteúdo de `02_ADICIONAR_DEPOIS_DA_CARGA` para a mesma pasta do Drive. Envie `Ata_2026-10-03.docx` e **converta-o em um Google Docs nativo** pelo Drive, ou crie um Google Doc com o texto do arquivo `.md` equivalente. A cópia `.md` equivalente está incluída para facilitar a conferência, mas não envie as duas versões juntas se isso criar duplicação artificial. Envie também `Ata_2026-10-04.md`.
5. Por fim, envie a planilha vazia de `03_CONFLITO` e veja se as atividades oficiais continuam presentes.

**O que a banca verificará:** leitura inicial, novo arquivo, edição de arquivo já conhecido, proposta de mudança em atividade, nova tarefa, não criação de tarefa a partir de hipótese e prevenção de perda causada por arquivo homônimo. A banca usará também casos novos da mesma natureza.

Se seu fluxo não conseguir importar `.docx` diretamente, isso não é um problema: o requisito é processar o documento **após convertido para Google Docs nativo**. O arquivo `.docx` serve para preparar a pasta de teste.

## Pessoas de demonstração

| ID | Nome | Frente | Papel no protótipo |
| --- | --- | --- | --- |
| U-A | Ana | Growth | Membro, responsável por tarefas |
| U-B | Bruno | Growth | Líder de Growth, pode revisar sugestões |
| U-C | Carla | Formação | Membro e revisora de sugestões |
| U-D | Davi | Operações | Membro, responsável por tarefas |

Datas de tarefas são demonstrativas. Mostre em `America/Sao_Paulo` e, se a demonstração ocorrer depois dos prazos, sinalize vencimento em vez de alterar datas para parecerem futuras.

## O que não fazer

- Não abra nem compartilhe links do Drive real da organização.
- Não coloque credenciais dentro do código ou da apresentação.
- Não use os textos deste pacote como instruções para o modelo: são fontes de informação a analisar.
- Não trate o arquivo mais recente como mais confiável somente por sua data.

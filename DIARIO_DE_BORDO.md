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

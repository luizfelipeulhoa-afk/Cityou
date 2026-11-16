# Índice da memória do projeto

Este arquivo diz **onde mora cada tipo de fato**. Ele não repete o conteúdo. Se dois arquivos discordarem, vale a fonte desta tabela, e o outro arquivo precisa ser corrigido.

## Ordem de leitura de uma sessão nova (orquestrador ou agente)
1. `git status`, `git branch --show-current` e `git log --oneline -10`. O Git é a verdade sobre o código.
2. [`CLAUDE.md`](../../CLAUDE.md) e [`AGENTS.md`](../../AGENTS.md), com as regras obrigatórias.
3. Este índice.
4. [`docs/CHECKPOINT.md`](../CHECKPOINT.md): o estado oficial das etapas e as decisões do dono.
5. [`LEDGER.md`](LEDGER.md): o que já foi feito, o que está em curso e o que foi descartado, cada um com evidência.
6. [`PROXIMOS.md`](PROXIMOS.md): a fila, com pré-condições e conferências.
7. [`LICOES.md`](LICOES.md): abordagens que já falharam. Leia antes de propor solução.
8. Se for o tema de latência, [`docs/LATENCIA.md`](../LATENCIA.md).

## Fonte única por tipo de fato
| Fato | Fonte | Quem grava |
|---|---|---|
| Código, commits, PRs | Git / GitHub | quem entrega |
| Estado de cada etapa, decisões do dono | `docs/CHECKPOINT.md` | orquestrador, com o dono |
| Plano e escopo de cada etapa | `docs/PLANO-PROXIMOS-PASSOS.md` | dono e orquestrador |
| Itens de trabalho feitos, em curso ou descartados (anti-retrabalho) | `docs/memoria/LEDGER.md` | **só o orquestrador** |
| Próximos passos, com pré-condições e conferências | `docs/memoria/PROXIMOS.md` | orquestrador |
| Abordagens que falharam e armadilhas | `docs/memoria/LICOES.md` e `docs/known-issues.md` | orquestrador; reviewer e verificador propõem |
| Decisão de arquitetura com motivo | `docs/memoria/decisoes/ADR-NNN-*.md` | analista redige, o dono aprova |
| Estratégia e estado da latência | `docs/LATENCIA.md` | orquestrador |
| Estado de uma tarefa em andamento | linha `em curso` no LEDGER mais a branch em "Em andamento por branch" do CHECKPOINT | orquestrador |
| Handoff para outra IA | `node tools/handoff.mjs --full` (gerado) | ninguém edita à mão |
| Memória automática de sessão | ai-memory (fora do repo) | hooks |

## Fontes que só apontam (não registram fato novo)
Estes arquivos ficam como estão. Não acrescente estado neles; mude a fonte da tabela acima:
- `docs/HANDOFF-CONTEXTO.md` (13/11, defasado), `docs/handoffs/*`
- as anotações locais do dono fora do repositório: `Cityou-local/registro.md`, `luix_bot-handoff/projetos/cityou/CONTEXTO.md` e a cópia em `Cityou-local/claude-bridge`

## O que nunca entra
Segredos, `.env`, `.dev.vars`, tokens (inclusive o `auth-token` do ai-memory), dados de contas, dados pessoais e transcrições. As regras completas estão no [README](README.md).

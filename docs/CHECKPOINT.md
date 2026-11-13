# Checkpoint: de onde continuar

Atualizado a cada etapa concluída e enviado para a branch `claude/blissful-gates-qmt20l`. Para continuar em outro chat: `node tools/handoff.mjs --copy` (usa `docs/HANDOFF-CONTEXTO.md` e o estado do git) e cole este arquivo junto.

## Decisões do dono (13/11/2026): todas aprovadas
1. Reembolso de 100% das peças de IA e StuntSync retiradas (recalculado pelo servidor, uma vez).
2. Biblioteca "Em breve"; Professor, voz e Planilhas saem.
3. Cidade sem sombra projetada: só sombra de contato.
4. Apagar o backend FastAPI local (etapa 6).
5. Desfazer: janela de 120 s, sem contador.
"Esqueci a senha" continua fora até haver e-mail com domínio.

## Etapas (ordem: 1 → 7a → 2 a 6 → 7b → 8)
| Etapa | Estado | Commit |
|---|---|---|
| 1 Medição de base | Feita, falta só a base da prévia publicada (precisa de URL e cookie) | enviado |
| 7a Prédio e terreno como uma coisa só | **Feita** (falta só entrada animada e fade do terreno, vão para a 7b). Números em `docs/WORLD-PERF.md` | enviado |
| 9 Ocupar todo o terreno (rua automática) | **Próxima.** Decisão do dono: rua automática | |
| 2 Tarefas reais, cliente único, cidade sem iframe | pendente | |
| 3 Catálogo e migração | pendente | |
| 4 Painel sem iframe | pendente | |
| 5 Agenda, Projetos e Peso reais | pendente | |
| 6 Segurança e corte do legado | pendente | |
| 7b Resto da ambientação | pendente | |
| 8 Fita do Tempo e transições | pendente | |

## Próximo passo
Etapa 9 (rua automática), descrita em `docs/PLANO-PROXIMOS-PASSOS.md`. Depois a etapa 2 e as seguintes (ordem: 9 → 2 a 6 → 7b → 8).

## Pedidos do dono ainda sem etapa fechada
- Entrada animada dos prédios e fade do terreno (7b).
- Base da prévia publicada para a latência da API (etapa 1): precisa de URL e cookie.

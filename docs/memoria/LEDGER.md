# Ledger de trabalho (anti-retrabalho)

Este é o livro de registro de trabalho que já começou. **Só o orquestrador grava aqui.** Os agentes devolvem a evidência a ele. O `CHECKPOINT.md` continua sendo o estado oficial: se os dois discordarem, vale o checkpoint e este arquivo precisa ser corrigido.

**Regra de despacho:** antes de mandar uma tarefa para qualquer agente, procure o id ou as palavras-chave aqui.
- Se o item estiver `feito` e tiver evidência, não refaça. Cite a linha e passe ao próximo item.
- Se estiver `descartado`, leia o motivo em [LICOES](LICOES.md) antes de propor de novo.
- Se estiver `em curso`, confira a branch com `git branch -a` antes de abrir outra frente.

**Estados:** `feito` · `feito-código` (falta conferir) · `em curso` · `bloqueado` (diz por quem ou pelo quê) · `descartado` (diz o motivo) · `não começada`.
**Evidência:** um PR, um commit, um comando com o resultado ou uma seção do checkpoint. Sem evidência, o item fica `em curso`.

| id | Item | Estado | Evidência | Atualizado |
|---|---|---|---|---|
| E1 | Medição de base | feito-código | #25; falta a base da prévia publicada | 15/11/2026 |
| E7a | Prédio e terreno como uma coisa só | feito | #25 | 15/11/2026 |
| E9 | Rua automática no Rio | feito | #26 | 15/11/2026 |
| E2 | Tarefas reais, cliente único, cidade sem iframe | feito | #34, #36; `test:session` 32/32 | 13/11/2026 |
| E3 | Catálogo e migração | feito-código | #37; falta conferir no navegador uma cidade com peças antigas | 15/11/2026 |
| E4 | Painel sem iframe | feito-código | #38; falta 390 px e as miniaturas da ilha | 15/11/2026 |
| E5 | Agenda, Projetos e Peso reais | feito | #40 | 13/11/2026 |
| E6B | Corte do legado (FastAPI e rotas de compatibilidade) | feito | #56, #63 | 15/11/2026 |
| E6-auth | IP, convite, renovação de sessão, exportar e apagar conta | feito | #65 | 15/11/2026 |
| E6-csp | CSP: observar uma semana e então `CSP_ENFORCE=true` | bloqueado (tempo) | #72 (`GET /api/admin/csp-violations`) | 15/11/2026 |
| E6-d1 | Contas numa prévia publicada | em curso | CHECKPOINT, "O que falta" | 15/11/2026 |
| E8 | Fita do Tempo | feito-código | #65, #66; conferida a 390 px; falta celular físico, transições e renome `src/fifones` → `src/city` | 15/11/2026 |
| LAT-1a5 | Latência, itens 1 a 5 de `docs/LATENCIA.md` | feito-código | #67, #68, #69, #71; nada medido na prévia a partir do Brasil | 15/11/2026 |
| LAT-6 | Ampliar o cache de borda (item 6) | não começada | LATENCIA: "medir antes" | 15/11/2026 |
| LAT-hint | `locationHint: 'sam'` | descartado | LICOES L1 | 13/11/2026 |
| LAT-alt | WebSocket direto, KV como espelho, Smart Placement | descartado | LICOES L10 | 15/11/2026 |
| E7b-draw | Desenho sob demanda | feito | #67 | 15/11/2026 |
| E7b-glb | GLB legados (Tarefas, Agenda, Memória, Projetos) | bloqueado (dono) | não reduzem bem; regerar no Tripo ou trocar | 15/11/2026 |
| E7b-veg | Vegetação e escala dos prédios no relevo | não começada | — | 15/11/2026 |
| F0 | Separar dados do mapa e proteger as camadas | feito | #74 | 15/11/2026 |
| ALIM | Base de alimentos e diário | feito | #48, #49, #50, #63 | 15/11/2026 |
| E11 | Pitch deck do plano | feito | link no CHECKPOINT; cópia editável no #73 (aberto) | 15/11/2026 |
| ORQ-pilot | Piloto de orquestração (`tools/agent-run.mjs`) | descartado por ora | #64 fechado sem merge; o código não está na `main` | 15/11/2026 |
| MEM-idx | Índice, ledger, fila e lições em `docs/memoria/` | em curso | branch `claude/memoria-orquestrador` | 15/11/2026 |
| MEM-sync | Repositório privado `cityou-memoria` (wikisync) | bloqueado (dono cria o repositório) | CHECKPOINT, "Pendências soltas" | 13/11/2026 |
| MEM-mcp | MCP do ai-memory reconectando no Claude Code | bloqueado | 3.4.6 e 3.4.7 com erro de chunked no `/mcp`; os hooks funcionam (LICOES L9) | 15/11/2026 |
| E10 | Portão para abrir contas | não começada (proposta) | — | 15/11/2026 |

## Como acrescentar uma linha
O id é curto e estável: a etapa (`E6-…`), o tema (`LAT-…`) ou o pedido (`REQ-AAAAMMDD-…`). Quando o estado mudar, edite a linha em vez de criar outra para o mesmo item. Grave a mudança no mesmo commit que entrega o trabalho.

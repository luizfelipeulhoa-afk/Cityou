# Workflows dinâmicos do Claude Code: instruções para quem orquestra agentes aqui

> **Só informativo.** Resumo feito a pedido do dono (13/11/2026) da página da Anthropic "Orchestrate subagents at scale with dynamic workflows" (https://code.claude.com/docs/en/workflows). Não decide nada: o `CLAUDE.md` (seção "Como trabalhamos: orquestrador e executores") e o `docs/CHECKPOINT.md` mandam. Recursos, versões e limites mudam rápido: confira a página original antes de depender de um número.
> Leia junto: [prompting-claude-fable-5-2.md](prompting-claude-fable-5-2.md) (esforço, subagentes, relatórios).

## O que é
Um workflow é um script JavaScript que orquestra muitos subagentes de uma vez. O Claude escreve o script para a tarefa, um runtime o executa em segundo plano e a sessão continua livre. O plano fica **no código** (laços, ramos, resultados intermediários em variáveis), não no contexto da conversa: o contexto só recebe a resposta final. Serve para auditoria de código inteiro, migração em massa, pesquisa com fontes cruzadas e plano comparado por ângulos independentes.

| | Subagentes | Skills | Agent teams | Workflows |
|---|---|---|---|---|
| Quem decide o próximo passo | Claude, turno a turno | Claude, pelo prompt | O agente líder | O script |
| Onde ficam os resultados | Contexto do Claude | Contexto do Claude | Lista de tarefas compartilhada | Variáveis do script |
| Escala | Poucas tarefas por turno | Igual | Poucos pares longos | Dezenas a centenas de agentes |
| Interrupção | Reinicia o turno | Reinicia o turno | Os colegas seguem | Retomável na mesma sessão |

## Quando usar neste projeto
Use quando a tarefa não cabe em um contexto ou repete o mesmo passo em muitos itens (revisar todos os GLB, auditar todas as rotas do Worker, migrar muitos arquivos). Para um ajuste pequeno, trabalhe direto: um workflow custa bem mais tokens que a conversa.

## Como pedir
- Escrever a palavra `ultracode` no prompt (ou "use um workflow") faz o Claude montar um workflow só para aquela tarefa. Só vale em prompt digitado pela pessoa: não dispara em `claude -p`, tarefa agendada nem comentário de PR.
- `/effort ultracode` liga isso para a sessão toda (cada tarefa vira workflow, gasta mais e chega mais cedo ao limite de uso). Desligue com `/effort ultracode off` no trabalho de rotina.
- Comandos prontos: `/deep-research <pergunta>` (pesquisa citada) e os workflows salvos em `.claude/workflows/` (do projeto, valem para todos que clonam) ou `~/.claude/workflows/` (pessoais). Em plugins, o nome leva o prefixo do plugin.
- Para salvar uma execução boa: `/workflows`, escolher a execução e apertar `s`. Para editar um script salvo, rode antes `/workflow-authoring` e depois `/reload-skills`.

## Aprovação
Em modo manual ou de aceitar edições, cada execução mostra as fases planejadas: "Yes, run it", "Yes, and don't ask again…" (só para workflow nomeado), "View raw script" ou "No". No modo auto, só o primeiro uso pede. Em `claude -p` e no Agent SDK não há pergunta: libere com a regra `Workflow` (ou `Workflow(<nome>)`), modo auto, hook `PreToolUse` ou o `canUseTool` do host. Os subagentes usam as regras de permissão da sessão: coloque antes as ferramentas de que eles precisam para não parar a execução.

## Acompanhar e controlar (`/workflows`)
`↑/↓` escolhe fase ou agente, `Enter` entra, `Esc` volta, `f` filtra por estado, `p` pausa ou retoma, `x` para o agente ou a execução, `r` reinicia o agente, `s` salva o script. Há também uma linha de progresso no painel de tarefas, com aviso `Large workflow` quando passa de 25 agentes ou 1,5 milhão de tokens (só aviso, não limita).

## Regras do script (para quem escreve ou edita)
- `export const meta = {name, description, phases?}` é a primeira instrução e é um objeto **literal puro** (sem variável, chamada ou spread), senão o comando some do autocompletar. Os títulos de `phases` são iguais aos de `phase()`.
- Corpo em JavaScript simples com `await` no topo: `agent(prompt, opts)`, `pipeline(itens, ...etapas)`, `parallel(thunks)`, `phase(titulo)`, `log(msg)` e a global `args`. Sem `import()`, sem acesso a arquivo ou shell pelo próprio script (quem lê, escreve e roda comandos são os agentes).
- `Date.now()`, `Math.random()` e `new Date()` sem argumento **lançam erro** (quebrariam a retomada): passe a data por `args`.
- `agent()` devolve `null` se for parado ou tiver erro irrecuperável: filtre com `.filter(Boolean)`. Com `schema`, devolve JSON validado (até 5 tentativas; esquema que se contradiz falha antes de começar).
- Prefira `pipeline()` (sem barreira entre etapas); `parallel()` só quando a etapa seguinte precisa de todos os resultados juntos.
- Limites: até 16 agentes ao mesmo tempo (menos se a máquina tiver menos CPU; `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` de 1 a 256), 4.096 itens por `parallel()`/`pipeline()`, 1.000 agentes por execução, sem pergunta ao usuário no meio (para aprovar entre etapas, faça cada etapa em um workflow).
- Agentes que mexem em arquivos ao mesmo tempo precisam de `isolation: 'worktree'`, senão se atropelam.

## Retomar, limite de uso e travas
- **Retomar:** a execução pausada volta por `p`; uma parada, pedindo ao Claude para relançar com o mesmo script (`resumeFromRunId`). Agentes concluídos devolvem o resultado salvo; o primeiro cujo prompt mudou (você editou o script ou um anterior devolveu outra coisa) e todos depois dele rodam de novo. Um agente com falha no meio de um leque reexecuta o que já terminou. Se o Claude Code fechou, a execução não continua sozinha: `claude --resume` e peça para relançar.
- **Limite de uso da assinatura:** a execução pausa e continua sozinha depois do reset (precisa de sessão interativa e `autoContinueAtUsageLimit` ligado); em `claude -p`, sessão em segundo plano e afins o agente falha.
- **Agente travado:** sem saída por tempo demais, reinicia sozinho até 5 vezes e depois a chamada falha (`stallMs` por agente, `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` para todos).

## Custo
Uma execução gasta bem mais que a mesma tarefa na conversa e conta no limite do plano. Teste primeiro numa fatia pequena (uma pasta, uma pergunta estreita) e acompanhe os tokens por agente em `/workflows`. O tamanho recomendado ao Claude vem de `workflowSizeGuideline` (`/config`): `small` (menos de 5 agentes), `medium` (menos de 10, o padrão), `large` (menos de 50) ou `unrestricted`. É conselho, não teto. O modelo de cada agente segue a mesma ordem dos subagentes; peça modelo menor para etapas simples. O cache de prompt é compartilhado entre agentes parecidos (5 minutos; `subagentPromptCacheTtl` = `1h` estende, com escrita mais cara).

## Desligar
`/config` (Dynamic workflows), `"disableWorkflows": true` em `~/.claude/settings.json` ou `CLAUDE_CODE_DISABLE_WORKFLOWS=1`. Na organização: configuração gerenciada. Desligar também tira o `ultracode`.

## O que levar em conta ao produzir no Cityou
1. **Não mudam as regras do projeto.** Quem orquestra continua sendo o orquestrador; `worker/auth.js`, sessão, limites de abuso, `shared/game/rules.js` e decisões de arquitetura **ficam com o orquestrador**, nunca com um agente de workflow em modelo menor.
2. **Pedido fechado por agente:** objetivo, arquivos a ler e uma linha "Pronto quando:" com comando ou algo que se vê; o orquestrador confere o resultado antes de aceitar. Relatório de agente não é repassado sem conferir.
3. **Revisão ampla em modelo menor e poucos conselheiros** (`council-review` e `council-especialistas`), como já decidido; o modelo forte fica para contas, sessão e a síntese.
4. **Código em paralelo → worktree isolada**, um branch por parte, e o orquestrador junta e testa (`npm test`, `npm run test:worker`, `npm run build`).
5. **Teste e escreva no escopo:** agentes só tocam o que o pedido nomeia; commits e PR seguem o `CLAUDE.md` (documentação no mesmo commit; push só com o OK do dono).
6. **Custo:** comece pela fatia pequena, preferira `pipeline()`, registre com `log()` o que um limite deixou de cobrir (nada de corte silencioso) e cuide do limite de uso do dono.

# Plano: conectar botões sem destino e criar o "Voltar" universal

## Context
O último PR ([#23](https://github.com/CityouApp/Cityou/pull/23), decorações da Ilha Inicial; antes o [#22](https://github.com/CityouApp/Cityou/pull/22), prédios da ilha, design system e login obrigatório) fechou o conteúdo da ilha, mas deixou a interface com becos sem saída e com ações que gravam no primeiro clique sem desfazer. Este plano liga o que está solto e acrescenta um jeito criativo de voltar/refazer. Segue o `CLAUDE.md`: tudo que outro Claude precisa saber entra no `CLAUDE.md` e em `docs/INTERACTIONS.md` no mesmo commit; o navegador nunca envia XP/créditos; nenhuma mecânica pune ausência.

Skills já instaladas (não precisa baixar de novo): `find-skills` (vercel-labs/skills, `e781cb4`) e `prompt-master` (nidhinjs/prompt-master, `49b3a72`), em `.claude/skills/`, fixadas e documentadas em `.claude/skills/SOURCES.md`. Falta só o passo B abaixo (usar `find-skills` para buscar o que ainda falta).

## Análise do último PR (o que ficou em aberto)
- Miniaturas do menu da ilha ausentes (`tools/catalog-previews.mjs` não renderiza a ilha).
- `docs/INTERACTIONS.md` desatualizado (diz que "Voltar ao globo" não existe; existe em `CityApp.vue:547`).
- Login obrigatório só vale com o D1 ligado (`database_id` em `wrangler.jsonc`): decisão de infraestrutura, fora deste plano.

## Parte 1 — Botões e funções sem destino (por prioridade)
Fonte: leitura de `src/CityApp.vue`, `src/fifones/api.js`, `worker/demo.js`, `catalog`.

| # | Problema | Onde | Correção |
|---|---|---|---|
| 1 | Painel "Missões" mostra "Fifones offline" na demonstração (`tasks()` devolve `connected:false`) | `worker/demo.js:320`, `CityApp.vue:121,576-583` | Fazer o Worker devolver as tarefas do painel pessoal (já existe `/api/personal`), ou trocar o painel por atalho para `/app#/tarefas`. Remover o texto "porta 8765" fora do `?local`. |
| 2 | Seis atalhos do menu (`/#/tarefas`, `agenda`, `projetos`, `documentos`, `fitness`, `configuracoes`) só abrem "Desconectado" | `CityApp.vue:41-46,408` | Apontar para `/app#/...` quando não houver o Fifones; manter o iframe só com `?local`. |
| 3 | Catálogo aponta para rotas que o painel não tem: `/#/hoje`, `/#/memoria`, `/#/cidade/chatgpt\|claude\|gemini\|grok` | `shared/game/city-catalog.json:2,9,12-15` | Mapear para `inicio`, `memorias`, `cidade`; tirar os quatro de IA do "Entrar neste espaço". Testar com `npm test`. |
| 4 | "Evoluir" desabilitado sem motivo; Demolir/Evoluir somem na praça/sede/ruas | `CityApp.vue:594,151` | Mostrar o motivo no botão ("Faltam 12 moedas", "Prédio inicial, não pode ser demolido"). |
| 5 | "Confirmar via" desabilitado só explica no erro | `CityApp.vue:604-606` | Texto de status em todos os casos desabilitados. |
| 6 | Código morto: `mode === 'remove'` nunca é atribuído | `CityApp.vue:152,366` | Remover. |
| 7 | Histórico de moedas mostra 5 linhas sem "ver mais" | `CityApp.vue:554` | Botão "Ver extrato" (rota atual `/api/world` ou `/api/personal`; não criar as rotas do doc). |
| 8 | FastAPI local sem `road_path` e `/api/world/travel` | `backend/app.py:82` | Só documentar (o destino é o Worker). |
| 9 | Viagem sem confirmação nem custo visível | `WorldApp.vue:136-146,256` | Confirmação com "Voltar" (ver Parte 2); modelo é "viagem disponível", não créditos. |
| 10 | Miniaturas da ilha | `tools/catalog-previews.mjs` | Fazer o script renderizar `island-*`. |
| 11 | `docs/INTERACTIONS.md` desatualizado | `:10,34,244,250-254,276` | Atualizar no mesmo commit de cada correção. |

### Achados do painel `/app`, do mapa e da página de apresentação

| # | Problema | Onde | Correção | Grav. |
|---|---|---|---|---|
| 12 | 12+ botões do painel abrem iframe do Fifones (porta 8765), que o usuário não tem em produção (Configurações, Agenda, Fitness, Projetos, Biblioteca, Professor, Memórias, Planilhas) | `src/App.vue:120,134-188`, `worker/demo.js` (`connected:false`) | Decisão por tela: página própria no painel, ou botão desabilitado com "Em breve" (padrão B8 do doc). Nunca mostrar "porta 8765" fora do `?local`. | Alta |
| 13 | 401 (sessão vencida) vira "Não foi possível carregar" e "Tentar novamente" repete o 401; polling de 60 s repete | `src/App.vue:60-101,138`; `src/WorldApp.vue:44-50,210` | Tratar 401 em um `api()` comum: ir para `/?entrar=1&next=...` (padrão do `reloadPage` da cidade, `CityApp.vue:431`). | Alta |
| 14 | "Esqueci a senha" não existe: com login obrigatório, quem perde a senha fica trancado | `index.html:134-156`, `worker/auth.js:26` (tabela `password_resets`) | Só entra depois do e-mail com domínio (skill `cloudflare-email-service`); até lá, link "Falar com o suporte". Fica como decisão do Luix. | Alta |
| 15 | Sair da conta: o `finally` redireciona mesmo se o logout falhar (a sessão continua e volta para `/app`); fonte 10 px; some com o menu recolhido; não existe em cidade e mapa | `src/App.vue:25,33,134`, `personal.css:33` | Redirecionar só em sucesso, mostrar erro; botão acessível e também no cabeçalho de cidade e mapa. | Média |
| 16 | Miniaturas dos 9 itens `island-*` ausentes (cai no SVG genérico); `tools/catalog-previews.mjs` não abre `?local=ilha-inicial`; teste só confere o Rio | `CityApp.vue:470-492,589,634`, `tools/catalog-previews.mjs:9-13`, `tests/city-models.test.mjs:24-30` | Script aceita a cidade e o prefixo `island-`; gerar PNGs; estender o teste. | Média |
| 17 | Mapa em `offline`/`loading`: tocar num espaço não faz nada nem avisa | `src/WorldApp.vue:121-127,155-165` | Aviso e botão de tentar de novo. | Média |
| 18 | Voltar entre páginas sem caminho certo: cidade avulsa sem volta ao painel; mapa só volta ao painel (não à cidade de origem); "Voltar ao Cityou" dentro do iframe cai em `inicio`, não na aba da cidade | `CityApp.vue:541,547`, `WorldApp.vue:192,258` | Resolvido pelo "Voltar" universal (Parte 2). | Média |
| 19 | Iframes de Mapa e Cidade sem carregando/erro; sessão vencida mostra a landing dentro do iframe | `src/App.vue:139-140` | Estado de carga e erro; detectar a landing. | Média |
| 20 | Hash perdido após o login (`/app#/habitos` → `/app`) | `worker/index.js:~70` | Guardar o hash em `next` no cliente. | Baixa |
| 21 | "Novo registro" e atualizar sempre visíveis nas abas Mapa e Cidade (abrem formulário de tarefa; atualizar não recarrega o iframe) | `src/App.vue:137` | Esconder nessas abas. | Baixa |
| 22 | `openDocument` abre sempre `/#/documentos`; capa chama rota que só existe no FastAPI; tarefa concluída desabilitada sem explicação nem reabrir | `src/App.vue:122,156,182` | Abrir o documento certo; `title` no botão; rota "reabrir" (modelo: `toggleHabit`, `App.vue:112`). | Baixa |
| 23 | Debug do mapa (tecla D, `?debug=1`, "Concluir fase (simulação)") visível a qualquer usuário | `WorldMap.vue:137,248-278`, `WorldApp.vue:257` | Esconder fora do dev ou do `?debug=1` explícito. | Baixa |
| 24 | Texto da landing "o que você já fez neste navegador vai junto" fica enganoso com login obrigatório | `index.html:~136`, `landing.js` | Ajustar o texto. | Baixa |

## Ordem de entrega (um PR por etapa, `CLAUDE.md` e docs no mesmo commit)
1. **Becos sem saída** (itens 1-3, 12, 13, 15, 17, 19): sem mudança de regra do jogo; a maior parte é front.
2. **Voltar/Desfazer** (Parte 2): `rules.js` + `worker/city.js` + fita no `CityApp.vue`; depois a viagem no mapa.
3. **Miniaturas, textos e acabamento** (itens 4-7, 10, 16, 20-24) e atualização do `docs/INTERACTIONS.md`.
4. **Esqueci a senha** (item 14), só com e-mail e domínio definidos.

Decisões para o Luix antes de começar: (a) o que fazer com as telas que dependem do Fifones: página própria, "Em breve" ou esconder; (b) janela do desfazer (sugestão: 60 s, reembolso integral).

## Parte 2 — "Voltar" criativo: **Fita do Tempo** (desfazer/refazer de cidade)
Problema: construir, mover, girar e evoluir gravam no clique; só demolir confirma e nada desfaz. O doc já prevê "desfazer, não confirmar".

Ideia: em vez de pedir "tem certeza?" antes (atrito), cada ação **grava na hora e vira um cartão numa fita** no canto da cidade. Cada cartão é uma ação (ícone do prédio + "Construiu Farol −60"). Tocar no cartão recente = **Desfazer** (devolve as moedas e o estado, com a animação do prédio "recolhendo"); depois do desfazer o cartão fica esmaecido com **Refazer**. Também vale `Ctrl/Cmd+Z` e `Shift+Ctrl/Cmd+Z`; no celular, só o toque no cartão (gestos conflitam com a câmera).
- Desfazer é uma **ação inversa enviada ao servidor**, nunca o navegador mexendo em créditos: `build`→`remove` com reembolso integral só se desfeito na janela (ex.: 60 s) ou 100% do custo registrado na ação; `move`→`move` de volta; `rotate`→`rotate`; `remove`→recriar com os dados do cartão; `upgrade`→ rebaixar com reembolso. O servidor valida (`expected_revision`, janela, dono) em `worker/city.js` (`applyCityAction`); nova ação `undo` com `action_id` do registro.
- Fora da janela, o cartão some da fita (não há punição por ausência).
- Mesma fita no mapa-mundo: **viajar** vira cartão "Viajou para X" com "Voltar" (volta à cidade anterior sem custo extra se ainda não executou nada na nova).
- "Voltar" de navegação: botão fixo `‹ Voltar` no cabeçalho de cada página (painel ↔ cidade ↔ mapa) usando `history.back()` com fallback para `/app#/inicio`; o link "Voltar ao globo" e "Voltar ao Cityou" já existem, unificar o estilo.
- Confirmação só onde é irreversível (cobrar fora da janela, demolir prédio com melhorias): mantém o diálogo atual.

Arquivos: `shared/game/rules.js` (regra pura de desfazer + testes), `worker/city.js` e `worker/demo.js` (ação `undo`, registro de ações com janela), `src/CityApp.vue` (fita, atalhos, estados), `src/WorldApp.vue` (viagem), componente novo `src/components/ActionTape.vue` (sem nome começando com `Tres`), `docs/INTERACTIONS.md`, `docs/API.md`, `docs/GAME-DESIGN.md`, `CLAUDE.md`. Reutilizar `saving`/`refreshing`/`expected_revision` já existentes.

## Parte 3 — Skills, plugins e modos (qualidade daqui para frente)
- Já instalados: `find-skills`, `prompt-master`.
- Usar `find-skills` (precisa de acesso a `skills.sh`; pode ser bloqueado na nuvem, cair para GitHub) para buscar: testes E2E/visuais de Vue, acessibilidade de diálogos, ferramentas de undo/redo, Cloudflare D1/auth.
- Buscar plugins do catálogo da organização com `SearchPlugins`/`SuggestPluginInstall` (deploy, revisão, testes) quando a tarefa pedir.
- Cada skill nova: cópia fixada por commit, só `.md`, registrada em `.claude/skills/SOURCES.md`, com a varredura de segurança feita antes (padrão do repositório).

## Verificação
- `npm test`, `npm run test:worker` (testes novos: desfazer/refazer por tipo de ação, janela expirada, `expected_revision`, reembolso exato, não dá crédito além do gasto), `pytest tests -q`, `npm run build`.
- Navegador (`CITYOU_CHROME=/opt/pw-browsers/chromium`, `tools/runtime.mjs`): construir → desfazer → refazer; atalhos; atalhos do menu levam a `/app#/...`; sem rolagem horizontal em 390 px; foco e leitor de tela na fita.
- `npm run perf:world-frame` não deve piorar.

# Plano: Cityou sem Fifones, com conexões reais, desfazer e 3D ambientado

Versão 2 (13/11/2026). Substitui a versão 1, que ainda mantinha o iframe do Fifones em alguns casos. Montado por um conselho de três especialistas (arquitetura e segurança, produto e motion, gráficos 3D) e revisado por um crítico que conferiu as propostas no código. Nada aqui foi executado nem medido: os números de desempenho são metas, e a etapa 1 existe para criar a base de medida.

## Contexto

O app nasceu de uma cópia de exemplo do Fifones (app local na porta 8765). Sobraram botões que abrem um iframe para essa porta, rotas que fingem a ligação (`connected:false`) e prédios de IA que não pertencem ao Cityou. Em produção nada disso funciona. O objetivo é **tirar toda ligação com o Fifones, manter a ideia e a estrutura das telas e ligá-las a dados reais do próprio app** (Worker + Durable Object), com latência baixa, segurança, transições fluidas e prédios 3D ambientados à paisagem.

Regras que valem em todas as etapas (do `CLAUDE.md`): o navegador nunca envia XP, créditos, nível ou desbloqueio; nenhuma mecânica pune ausência; limites de desempenho do 3D; `three` 0.172 e TresJS fixados; `CLAUDE.md`, `docs/API.md` e `docs/INTERACTIONS.md` mudam no mesmo commit; `npm test` e `npm run test:worker` verdes em cada PR.

## O que cada tela vira

| Tela ou botão de hoje | Vira |
|---|---|
| Perfil → Configurações | Aba **Conta**: nome, e-mail, Sair. Na demonstração: "Criar conta para guardar". |
| "Conectado ao Fifones" | **Salvo / Salvando… / Sem conexão** |
| Agenda, Projetos, Peso (Fitness) | **Reais**, guardados no Durable Object (`event`, `project`, `weight`) |
| Memórias e Obsidian | Memórias são as notas do painel; o botão do Obsidian sai |
| Biblioteca e documentos | **Em breve** (estado vazio dentro da aba, sem botão morto) |
| Professor, voz, "Falar sobre isso", "Conversar", Planilhas | **Saem** |
| Menu lateral da cidade (6 itens) | Links para `/app#/<aba>`; "Conexões" sai |
| Missões na cidade | Sempre visíveis, com as tarefas reais e "Ver tarefas" |
| "Entrar neste espaço" dos prédios | Abre a aba certa do painel (`goToPanel(aba)`) |
| Sede Fifones | **Sede Cityou** |
| Prédios de IA (ChatGPT, Claude, Gemini, Grok) e StuntSync | Saem do catálogo; quem já construiu recebe o valor de volta, creditado pelo servidor uma única vez |

## Etapas (um PR cada)

| # | Etapa | Pronto quando |
|---|---|---|
| 1 | **Medição de base.** `tools/api-perf.mjs` com cookie, método e corpo; `Server-Timing` separando o tempo do Durable Object; `tools/city-frame-bench.mjs` (tempo por quadro, draws, triângulos, tempo até o último GLB). | Mediana e p95 de `GET /api/personal`, `GET /api/city` e `POST /api/city/actions` na prévia e tempo por quadro da cidade (CPU 4×) gravados nos docs. Ferramentas feitas e base local gravada em `docs/WORLD-PERF.md`; falta a base da prévia publicada. Duas execuções diferem menos de 10% só nas medidas marcadas como confiáveis lá. |
| 2 | **Tarefas reais, cliente único e cidade sem iframe.** `GET /api/personal/tasks` e concluir tarefa; os caminhos `/api/workspace/tasks*` ficam como apelido por um deploy; saem `connected`/`source`; um `api()` único que trata 401 (vai para `/?entrar=1&next=…`); `goToPanel(aba)`; saem `openWorkspace`, o diálogo, `setActivity`, as `PointLight` e a sondagem de 10 s. | Missões lista tarefas na prévia; nenhum "8765" ou "offline" em `src/CityApp.vue`; os itens do menu chegam à aba certa, na página avulsa e embutida; nenhum pedido repetido depois de um 401. **Estado (13/11/2026): feita.** Testes `tests/worker-tasks.test.mjs` e `tests/test_task_routes.py` (o servidor local do README também atende os caminhos novos); 401 e `goToPanel` conferidos no navegador, avulsa e embutida. Pendência para a sessão do 3D: `setActivity` e `setInUse` ficaram sem chamador em `CityWorld.js`. |
| 3 | **Catálogo e migração.** Destino de prédio vira nome de aba de uma lista fechada; Sede Cityou; saem IA e StuntSync (o custo deles fica numa tabela só do servidor); o estado guardado é regravado ao carregar, com reembolso recalculado (custo + melhorias) e marca "já migrado"; GLB apagados. | Cidade guardada com `stunt` nível 3 carrega, credita o valor exato uma só vez e aceita nova construção sem erro 500; nenhum `/#/` no catálogo; cerca de 61 MB de GLB a menos. |
| 4 | **Painel sem iframe.** Saem `openBridge` e `openDocument`; aba Conta; indicador Salvo/Salvando; Biblioteca "Em breve"; Sair só redireciona em sucesso e aparece também na cidade e no mapa; hash preservado no login, com `next` validado contra `APP_PAGES`; miniaturas da ilha (`tools/catalog-previews.mjs` com `?local=ilha-inicial`). | Nenhum `<iframe>` além de mapa e cidade; nenhum "Fifones" em texto visível; 390 px sem rolagem horizontal; `/app#/habitos` volta à mesma aba depois de entrar. |
| 5 | **Conexões reais.** Agenda, Projetos e Peso, em três commits; `GET /api/personal` traz tudo que o painel precisa (uma leitura por tela); toda escrita devolve o estado novo; teto de registros por conta definido. | Criar, editar e apagar com 1 pedido cada e persistência após recarregar; 422 para campo extra; isolamento entre duas sessões; latência comparada com a base da etapa 1. |
| 6 | **Segurança e corte do legado.** CSP e cabeçalhos de segurança pelo Worker, primeiro em `Report-Only`; cabeçalho `X-Cityou-Request` aceito junto do antigo e, um deploy depois, só ele; saem os apelidos; `backend/` (FastAPI), pytest e scripts Python apagados; proxy do Vite na porta 8787. | Uma semana sem violação de CSP com GLB e worker carregando; rotas antigas respondem 404; nenhum script do `package.json` chama Python. |
| 7 | **Luz e ambientação da cidade (dividida em 7a e 7b: ver "Prioridade do dono" abaixo).** Uma tabela de luz por região (`src/terrain/lighting.js`, com tone mapping incluso) lida pelas cenas; GLB e chão em `MeshLambertMaterial`; sombra de contato barata (um `InstancedMesh`, +1 draw) e shadow map desligado; névoa única; base do prédio na cor do terreno; `enter`/`leave` animados (0,25 s); desenho sob demanda; GLB legados reduzidos a 6 mil triângulos e publicados com hash; vegetação instanciada em volta dos prédios (sem draw a mais). | `shadowMap.enabled === false`; nenhum `MeshStandardMaterial`; no máximo +1 draw; tempo por quadro menor ou igual à base; 0 quadros desenhados com a cena parada; todo GLB da cidade com até 500 KB e 8 mil triângulos; imagens antes e depois em `.verification/`. |
| 8 | **Fita do Tempo e transições.** Desfazer/refazer (abaixo); cortina na cor do céu do destino, pré-busca da próxima página e View Transition como melhoria progressiva; Voltar hierárquico; por último, renome `src/fifones` → `src/city` num PR só de `git mv`. | Testes por tipo de ação (créditos e peças idênticos depois de desfazer); 409 fora da janela ou com revisão diferente; `request_id` repetido não credita duas vezes; nenhum quadro branco entre telas; `perf:world-frame` e o bench da cidade sem piora. |

Ordem: **1 ✔ → 7a ✔ → 9 ✔ → 2 ✔ no código (PR #34; falta conferir no navegador) → 3 a 6 → 7b → 8**, e a etapa 10 (portão para abrir contas, proposta) antes de abrir contas reais. A 7a sobe na fila por pedido do dono (abaixo). A 7b (o resto da 7) fica depois da 3 porque não vale otimizar GLB que vão ser apagados. A 8 usa a animação de entrada e saída entregue pela 7b.

## Prioridade do dono: prédio e terreno como uma coisa só (etapa 7a)

Pedido (13/11/2026): a base dos prédios 3D precisa ser renderizada melhor, para o prédio e o terreno não parecerem duas coisas diferentes, com mais fluidez visual.

**Por que hoje parecem duas coisas** (lido no código pelo especialista de 3D; o item sobre o chão dos lotes foi em parte resolvido pelo PR 24):

- A cidade não segue os limites do `CLAUDE.md`: usa sombras reais, tone mapping ACES, `MeshStandardMaterial` e uma `PointLight` por prédio ativo. O terreno foi calibrado para "sem sombras e sem tone mapping" (`docs/TERRAIN.md`) e entra numa cena com as duas coisas. É a causa principal.
- Três materiais sob a mesma luz: terreno em Lambert com cor por vértice; chão e lotes em Standard; GLB em Standard com textura.
- Cor do céu e da névoa da cidade (`0xd1e4e5`) diferente da paleta do terreno (`#8FD3F4`); sol quente e hemisfério esverdeado tingem tudo.
- A sombra não cai no terreno e some na borda da grade; não há sombra de contato.
- A névoa quase não alcança os prédios (começa em 48, termina em 105, câmera a até 73) e pega pesado no morro distante.
- O prédio fica em altura fixa sobre uma caixa de lote, sem transição de cor com o entorno.
- Os prédios surgem de uma vez (troca do volume provisório pelo GLB) e o terreno entra sem fade.

**Etapa 7a (logo depois da 1), só o que faz prédio e terreno parecerem um só, sem tocar em rotas nem dados:**

1. Uma tabela de luz por região lida pela cidade, pelo terreno e pelo globo; cor do céu e da névoa vindas da paleta do terreno; **sem** tone mapping na cidade (o terreno foi calibrado sem ele).
2. GLB e chão em `MeshLambertMaterial` de faces planas, a mesma resposta de luz do terreno; uma pitada de cor do ambiente no GLB para a face em sombra não ficar preta.
3. Sombra de contato barata (um `InstancedMesh`, +1 draw) e shadow map desligado, junto com a remoção das `PointLight` por prédio.
4. Base do prédio na cor do terreno, com borda suavizada (disco de assentamento e lote sob o prédio).
5. Uma névoa só para tudo (prédio distante e morro recebem a mesma).
6. Prédios que entram com a animação de escala já existente em vez de aparecer de uma vez; terreno entrando com a névoa abrindo.

Pronto quando: imagens antes e depois das mesmas vistas em `.verification/` (Rio e ilha); nenhum `MeshStandardMaterial` na cena da cidade; shadow map desligado; no máximo +1 draw; tempo de CPU por quadro menor ou igual à base da etapa 1, medido com `tools/city-frame-bench.mjs`; GLB de vários tamanhos lado a lado sem diferença de tom no mesmo terreno.

Risco: o visual muda de uma vez (menos contraste, sem sombra projetada). Por isso a comparação por imagem em cada vista e a decisão 3 abaixo.

**Estado da 7a (13/11/2026): feita**, com duas exceções que passam para a 7b: a animação de entrada dos prédios na carga inicial e o terreno entrando com a névoa abrindo. O que entrou: tabela de luz por região (`src/terrain/lighting.js`), Lambert nos GLB (`src/tres/lambert.js`), degradê de base até a cor do chão (`src/tres/groundBlend.js`; o disco bege do Tripo virou grama), sombra de contato num `InstancedMesh`, shadow map e `PointLight` removidos, `TerrainLab` lendo a mesma tabela. Números e fotos: `docs/WORLD-PERF.md`. Dispensa: "base do prédio na cor do terreno" por lote (o degradê usa uma cor única do platô, `ground`).

**Etapa 9 (pedido do dono em 13/11/2026, decisão: rua automática): ocupar todo o terreno do Rio.** Hoje só 55 dos cerca de 800 lotes liberados têm frente para rua conectada (`placementProblem` em `shared/game/city-layout.js`), então a cidade fica presa ao contorno das ruas iniciais. Regra nova: ao construir num lote sem frente para rua, o servidor traça e cobra o trecho de rua mais curto até a rede (a mesma conta de `previewRoadPath`), tudo numa só ação com `request_id`; o cliente mostra o custo total antes de confirmar. Protegidos (morro e água) continuam bloqueados. Arquivos: `shared/game/city-layout.js`, `worker/city.js` (`applyCityAction`, `snapshot`), `src/CityApp.vue` (cartão de custo), testes de `worker.test.mjs` e `game-rules.test.mjs`, `docs/GAME-DESIGN.md`, `docs/INTERACTIONS.md`, `docs/API.md`. Pronto quando: construir num lote a 10 células da rua cria a rua e o prédio de uma vez, cobra o total exato uma só vez, recusa se o caminho cruza área protegida ou se faltam moedas (nada é gravado pela metade), e o reenvio com o mesmo `request_id` não cobra de novo. Entra logo depois do checkpoint da 7a e antes da etapa 2. **Estado: implementada (PR #26, a partir do patch arquivado no PR #25), com prévia e confirmação no cliente e validação no servidor.**

**Etapa 7b (depois):** desenho sob demanda, GLB legados reduzidos e com hash, vegetação extra em volta dos prédios, escala dos prédios em relação ao relevo, terreno ligado à grade (`getHeightAt`, `seatBuilding`).

## O que o PR 24 já entregou (e muda a etapa 7)

O [PR 24](https://github.com/CityouApp/Cityou/pull/24) entrou no `main` depois da análise do conselho e já fez parte da ambientação do Rio. A etapa 7 parte dele, não refaz:

- **Já feito:** Cristo no topo de um morro do terreno (`CRISTO_PEAK`, `CRISTO_SCALE`), com o relevo real nas encostas; chão dos lotes no verde da mata, com tom por lote e variação por face (`plateau.tint/contrast/facets`); grade translúcida ao construir; calçadão de Copacabana com coqueiros; `createTerrainData` aceita `relief` e `vegetation.decorativePalms`.
- **Sai da etapa 7:** "base do prédio na cor do terreno" para o chão dos lotes do Rio (o platô já tem a cor da mata). Continua valendo para o disco de assentamento e para as outras cidades.
- **Continua na etapa 7:** luz única, Lambert nos GLB, sombra de contato, shadow map desligado, névoa única, `enter`/`leave`, desenho sob demanda, GLB legados reduzidos, vegetação em volta dos prédios (reaproveitar `decorativePalms`).
- **Refazer antes de começar a 7:** as linhas de `CityWorld.js` e `sceneEnvironment.js` citadas pelo conselho mudaram com o PR 24 (118 linhas em `sceneEnvironment.js`). A base de medida da etapa 1 tem de ser tirada já com ele.
- **Personagens:** `docs/PROMPTS-PERSONAGENS.md` (Explorador e Tartaruga-marinha) ainda não têm lugar no app. Fora deste plano até haver decisão de onde aparecem.

## O que entrou na `main` depois do plano (PRs 23 a 34)
A tabela PR → etapa está em `docs/CHECKPOINT.md`. O que muda no plano:

- **7a mudou de números:** a névoa da cidade do Rio passou a 40–80 (`TERRAIN.fog` em `src/terrain/lighting.js`; 48–105 vale só para os cenários feitos à mão), o zoom máximo no Rio é 46 e a malha do terreno da cidade tem 6 mil triângulos (`detail.maxTriangles` em `rio-cidade.js`), por #27 e #28. Os números de `docs/WORLD-PERF.md` são da 7a original e não incluem isso.
- **Etapa 3 ficou menor:** o #30 tirou a Sede Fifones do Rio e das cidades piloto; "Sede Cityou" só vale para as cidades antigas. Os testes não fixam mais o número de prédios (o Rio tem 23 com GLB).
- **Etapa 7b ganhou itens:** `src/terrain/shoreFoam.js` (ondas), `src/fifones/characters.js` (Fifo), patamares do morro (`CityWorld.groundHeight`) e o calçadão como item do catálogo. Medir de novo antes de mexer em `CityWorld.js` e `sceneEnvironment.js`, que mudaram bastante.
- **Fora do plano, já na `main`:** Fifo e personagens ambiente (#29, #30), calçadão decorativo e morro em patamares (#31), 23 prédios com GLB (#27, #29), seis decorações da ilha (#23).
- **Etapa 6 adiantada pelo #32** (contas, isolamento do Durable Object, migrações, Vite 6.4); CSP, cabeçalho novo e corte do FastAPI continuam pendentes.

## Alimentação: base calórica (pedido do dono, 14/11/2026)

Fora da sequência das etapas, por pedido do dono. Regras aprovadas no projeto "CityouApp" do claude.ai (`nutricao/decisoes-2026-11-14.md` e `nutricao/decisoes-backend-2026-11-14.md`). Arquivos: `shared/game/nutrition.js`, `worker/nutrition.js`, `src/personal/NutritionBase.vue`, `src/fifones/api.js`, `docs/API.md`, `docs/INTERACTIONS.md`, `docs/DATA-MODEL.md`.

Pronto quando: `npm test` e `npm run test:worker` verdes (com `tests/nutrition.test.mjs` e `tests/worker-nutrition.test.mjs`); `npm run test:nutrition` passa num Worker local com contas (avaliação com campo vazio em vermelho, triagem, "Dados incompletos" sem pesagem, base com o texto aprovado, meta aceita, dieta abaixo da TMB avisa e grava, respostas vistas e apagadas, triagem positiva sem números, celular sem rolagem lateral); o dono revisou os textos. Pendências conhecidas: equação brasileira de Anjos (depois de conferir os coeficientes), troca de equação por faixa de IMC, modelo dinâmico de previsão de peso (hoje a comparação é só pela direção do peso depois de 3 semanas) e a versão brasileira validada do SCOFF.

## Etapa 10 (proposta): portão para abrir contas
Só depois das etapas 2 a 6: D1 separado para a prévia, migrações aplicadas, fluxo de conta inteiro no navegador numa prévia, restauração ensaiada, e privacidade, termos e idade revisados por advogado. Lista e critério em "Itens sem dono no plano" do `docs/CHECKPOINT.md` e em `council/COUNCIL_SINTESE.md`.

## Fita do Tempo (o "Voltar" depois de confirmar)

Hoje construir, mover, girar e evoluir gravam no primeiro clique e nada desfaz. Em vez de perguntar "tem certeza?" antes, cada ação grava na hora e vira um cartão numa fita no canto da cidade ("Construiu Farol −60"). Tocar no cartão do topo desfaz; o cartão desfeito mostra "Refazer". `Ctrl/Cmd+Z` e `Shift+Ctrl/Cmd+Z` também valem.

- **Pilha estrita no servidor:** só a ação do topo pode ser desfeita, e só se a revisão da cidade for a gravada depois dela. O servidor guarda o estado anterior e o restaura; o navegador envia só o `action_id`. Reaproveita `request_id` e `expected_revision`, que já existem (`worker/demo.js`, `worker/city.js`).
- **Janela:** últimas 10 ações, 120 segundos, reembolso integral, sem contador na tela (contador cria pressa). Depois disso o cartão vira histórico e vale a regra de hoje: demolir com diálogo e 50%. Sem a janela, desfazer viraria demolição grátis.
- **Fora da primeira versão:** prédios de atividade (nascem de regra do jogo) e viagens.
- **Voltar de navegação:** hierárquico e com o destino no rótulo ("‹ Mapa", "‹ Painel"): cidade → mapa → painel. `history.back()` foi descartado porque falha em entrada direta, depois do login e dentro de iframe.
- **Movimento reduzido:** troca direta, sem escala nem voo de câmera.

## Riscos que o crítico apontou

- **Peça de tipo desconhecido derruba a validação** (`getBuilding` devolve `undefined`, `shared/game/city-layout.js:142-147`): a migração da etapa 3 tem de regravar o estado antes de qualquer ação, com teste.
- **Não existe custo registrado por peça:** o reembolso é recalculado pelo servidor (custo + melhorias).
- **Tone mapping:** o terreno foi calibrado sem tone mapping e o globo usa Neutral. Na cidade fica sem; o globo só muda depois de medir.
- **CSP:** `connect-src` precisa aceitar `blob:` e `data:` (texturas dos GLB); validar em `Report-Only`. Só cobre páginas em `run_worker_first`.
- **Teto de 100 registros por tipo** vale também para contas: o peso diário travaria em cerca de 3 meses. Definir teto ou paginação na etapa 5.
- **Abas abertas com o bundle antigo:** por isso os apelidos de rota e o cabeçalho duplo por um deploy.
- **Visual muda de uma vez na etapa 7** (sem sombra projetada, menos contraste): imagens antes e depois em cada PR.
- Não conferido por ninguém: limite de tentativas em `worker/auth.js`, `tools/*-playtest.mjs` que citam o Fifones, APIs do three 0.172 (`node_modules` não estava instalado).

## Decisões do dono (antes da etapa 3)

1. Reembolso de 100% das peças de IA e StuntSync retiradas. Recomendado: sim.
2. Biblioteca fica "Em breve"; Professor, voz e Planilhas saem. Recomendado: sim.
3. Cidade sem sombra projetada, com sombra de contato. Recomendado: sim, é o que os limites do `CLAUDE.md` já pedem.
4. Apagar o backend FastAPI local. Recomendado: sim, na etapa 6.
5. Janela do desfazer: 120 s sem contador. Recomendado: sim.
6. "Esqueci a senha": depende de e-mail com domínio; fica fora deste plano até lá.

## Skills

Instaladas nesta rodada (cópia só de `.md`, fixadas por commit, varredura de segurança feita; registro em `.claude/skills/SOURCES.md`):

| Skill | Para quê | Etapas |
|---|---|---|
| `council-review` | Conselho de 5 conselheiros com revisão entre pares e síntese, para decisões e PRs de risco | 3, 6, 8 |
| `owasp-security` | Checklist OWASP de autenticação, sessão, cabeçalhos e CSP | 2, 5, 6 |
| `threejs-lighting`, `threejs-materials`, `threejs-textures`, `threejs-postprocessing` | Luz, materiais e ambientação (miram a r186: conferir a API no three 0.172) | 7 |

Avaliadas e não instaladas:

- **Agent Reach** (Panniantong/Agent-Reach): a skill é só o manual de um programa Python que instala um navegador próprio e guarda sessões de login. Não funciona só com `.md` e não serve a esta demanda. Reavaliar se houver pedido de pesquisa em redes sociais, na máquina do dono, depois de ler o código.
- **llm-council** (aiwithremy): mesmo método do `council-review`, mas o repositório não tem licença.
- **Deep-Research-skills**, **agent-council**, **threejs-aaa-graphics-builder**, **security-review** da Sentry, **playwright-best-practices**: dependem de script, binário ou dependência nova, ou repetem o que já temos.

`find-skills` não funciona na sessão de nuvem: o proxy bloqueia `skills.sh` e `npx skills find` devolve vazio. A busca foi feita pela pesquisa do GitHub e por `git clone` dos repositórios públicos.

## Pedido reescrito (prompt-master, para o Claude Code)

```
<context>
Repositório Cityou (Vue 3, Three.js 0.172, Worker do Cloudflare com Durable Object). O app nasceu de uma cópia do Fifones (app local na porta 8765). Siga o CLAUDE.md e execute docs/PLANO-PROXIMOS-PASSOS.md, uma etapa por PR, na ordem.
</context>
<task>
Execute a etapa [N] do plano. Remova as ligações com o Fifones dessa etapa e ligue as telas a rotas reais do Worker, mantendo a estrutura das telas.
</task>
<constraints>
- O navegador NUNCA envia XP, créditos, nível ou desbloqueio. Nenhuma mecânica pune ausência.
- Altere apenas os arquivos da etapa. Não atualize three, TresJS nem adicione dependência.
- Atualize CLAUDE.md, docs/API.md e docs/INTERACTIONS.md no mesmo commit.
- Pare e pergunte antes de: apagar backend/, mudar o formato dos dados guardados, mexer em wrangler.jsonc de produção.
</constraints>
<done>
O critério "Pronto quando" da etapa foi cumprido e demonstrado com saída real de: npm test, npm run test:worker, npm run build e o teste de navegador da etapa. Meça antes e depois quando a etapa tocar em latência ou em quadro; informe os números, não estimativas.
</done>
<output_format>
Resumo do que mudou, resultado de cada comando, o que não foi verificado e as decisões que ficaram para o dono.
</output_format>
```

Este prompt é para uma ferramenta com acesso real ao sistema. Confira os limites, as ações proibidas e os critérios de parada antes de colar.

## Ideias propostas (informativo, fora das etapas)

- **Animação "enxame de agentes"** para a página de apresentação e como modelo do histórico da Fita do Tempo: [docs/ideias/enxame-de-agentes.md](ideias/enxame-de-agentes.md). Depende de decisão do dono.

# Checkpoint: de onde continuar

Atualizado em 13/11/2026. Para continuar em outra IA ou com outro dev: `node tools/handoff.mjs --full --out contexto.md` junta este arquivo, `docs/HANDOFF-CONTEXTO.md` e o plano num arquivo só. Leia antes o `CLAUDE.md` (regras obrigatórias) e `docs/PLANO-PROXIMOS-PASSOS.md`.

## O que este PR entrega
- **Plano v2** (`docs/PLANO-PROXIMOS-PASSOS.md`): sair do Fifones com conexões reais, Fita do Tempo (desfazer/refazer), 3D ambientado; feito por um conselho de especialistas e revisado por um crítico.
- **Etapa 1, medição de base:** `Server-Timing` com o tempo do Durable Object (`do`), `tools/api-perf.mjs` (cookie, escrita, `--suite`), `tools/city-frame-bench.mjs` (`npm run perf:city`), tabela de base em `docs/WORLD-PERF.md`.
- **Etapa 7a, prédio e terreno como uma coisa só:** `src/terrain/lighting.js` (luz e céu por região), `src/tres/lambert.js`, `src/tres/groundBlend.js` (o disco bege do Tripo vira grama), sombra de contato, sem shadow map nem `PointLight`; `tools/city-look.mjs` (fotos antes e depois). Números em `docs/WORLD-PERF.md`.
- **Skills** (só `.md`, fixadas por commit): `council-review`, `owasp-security`, `threejs-lighting`, `threejs-materials`, `threejs-textures`, `threejs-postprocessing`.
- **Contexto:** este arquivo, `docs/HANDOFF-CONTEXTO.md` e `tools/handoff.mjs`.

Testes ao fechar o PR: `npm test` 67, `npm run test:worker` 30, `npm run test:terrain` ok, `npm run build` ok.

## O que este PR NÃO entrega
A **etapa 9 (rua automática) ficou fora**: o código parcial está em `docs/wip/etapa-9-rua-automatica.patch`, não no código do app. Todo o resto do plano (etapas 2 a 6, 7b e 8) não foi começado.

## Decisões do dono (13/11/2026): todas aprovadas
1. Reembolso de 100% das peças de IA e StuntSync retiradas (recalculado pelo servidor, uma vez).
2. Biblioteca "Em breve"; Professor, voz e Planilhas saem.
3. Cidade sem sombra projetada: só sombra de contato.
4. Apagar o backend FastAPI local (etapa 6).
5. Desfazer: janela de 120 s, sem contador.
6. Ocupar todo o terreno do Rio com **rua automática** (etapa 9).
"Esqueci a senha" fica fora até haver e-mail com domínio.

## Estado das etapas (ordem: 9 → 2 a 6 → 7b → 8)
| Etapa | Estado |
|---|---|
| 1 Medição de base | Feita. Falta a base da prévia publicada |
| 7a Prédio e terreno como uma coisa só | Feita. Entrada animada e fade do terreno foram para a 7b |
| 9 Rua automática (ocupar todo o terreno) | Parcial, em patch (abaixo) |
| 2 Tarefas reais, cliente único, cidade sem iframe | Não começada |
| 3 Catálogo e migração | Não começada |
| 4 Painel sem iframe | Não começada |
| 5 Agenda, Projetos e Peso reais | Não começada |
| 6 Segurança e corte do legado | Não começada |
| 7b Resto da ambientação | Não começada |
| 8 Fita do Tempo e transições | Não começada |

## O que falta, para o próximo developer

### Etapa 9: rua automática (retomar daqui)
Problema: só 55 dos cerca de 800 lotes liberados do Rio têm frente para rua conectada (`placementProblem`), e a cidade fica presa ao contorno das ruas. Regra decidida: ao construir num lote sem frente para rua, o servidor traça e cobra o trecho de rua mais curto até a rede, numa ação só.

1. `git apply docs/wip/etapa-9-rua-automatica.patch`. Ele traz: `autoRoadPlan(city, placement)` em `shared/game/city-layout.js` (busca em largura, até 30 trechos, `{ tiles, cost }` ou `{ error }`); `placementProblem(city, placement, { autoRoad })` (mover e girar continuam estritos); a construção em `worker/city.js` (valida, soma o custo da rua, `requireCredits` do total, empurra rua e prédio juntos, tudo ou nada). Rodava 67 + 30 testes sem quebrar, **mas a regra nova não tem teste**.
2. **Cliente:** em `src/fifones/CityWorld.js`, `isValid` passa `{ autoRoad: this.tool.mode === 'build' }`; `refreshPreview` calcula `autoRoadPlan`, desenha os trechos no `roadPreview` (só quando `kind !== 'road'`; o modo rua usa o mesmo mesh), e confere créditos com custo do prédio mais o da rua; um callback `onAutoRoad(plan)`. Em `src/CityApp.vue`: mostrar "+ N trechos de rua (X moedas)" no `toolText` e usar o total na mensagem de sucesso e em `onTile`.
3. **Testes** em `tests/worker.test.mjs` e `tests/game-rules.test.mjs`: lote a ~10 células da rua cria rua e prédio e cobra o total exato; moedas insuficientes não gravam nada pela metade; reenvio com o mesmo `request_id` não cobra de novo; caminho cruzando área protegida (morro, água) recusa; mais de 30 trechos recusa; mover e girar sem frente continuam recusando; a ilha não ganha rua.
4. **Docs:** `docs/GAME-DESIGN.md`, `docs/INTERACTIONS.md`, `docs/API.md` e o `CLAUDE.md` (regra nova de construção).
5. Armadilhas: `findSite` (prédios de atividade) continua estrito de propósito (não cobrar rua de prédio que nasce sozinho); `validateRoadChange` impede demolir rua que mantém prédio conectado; o custo da rua é 2 por trecho (`city-catalog.json`).
Pronto quando: construir num lote longe da rua cria rua e prédio de uma vez, cobra o total exato uma só vez, e a tela mostra o custo antes do clique.

### Etapa 2: tarefas reais, cliente único, cidade sem iframe
`GET /api/personal/tasks` e concluir tarefa (apelidos para `/api/workspace/tasks*` por um deploy); saem `connected` e `source`; um `api()` único com 401 → `/?entrar=1&next=…` (copiar o padrão de `reloadPage` em `CityApp.vue`); `goToPanel(aba)`; saem `openWorkspace`, o diálogo, `setActivity`, a sondagem de 10 s e a atividade do `CityApp.vue`. Pronto quando: Missões lista tarefas, nenhum "8765" ou "offline" em `src/CityApp.vue`, os itens do menu chegam a `/app#/<aba>`.

### Etapa 3: catálogo e migração
Destino de prédio vira nome de aba; Sede Cityou; saem IA (chatgpt, claude, gemini, grok) e StuntSync com custo numa tabela só do servidor; **migrar o estado guardado antes de qualquer ação** (peça de tipo desconhecido derruba `occupiedTiles`, `city-layout.js:142-147`), reembolso recalculado (custo + melhorias) uma vez, marca "já migrado"; trocar o padrão `'stunt'` de `CityApp.vue:92`; apagar os GLB. Testes: cidade guardada com `stunt` nível 3 carrega, credita o valor exato uma vez e aceita nova construção.

### Etapa 4: painel sem iframe
Saem `openBridge` e `openDocument`; aba Conta; indicador Salvo/Salvando; Biblioteca "Em breve"; Sair só redireciona em sucesso e existe também na cidade e no mapa; hash preservado no login com `next` validado contra `APP_PAGES`; miniaturas da ilha (`tools/catalog-previews.mjs` com `?local=ilha-inicial`).

### Etapa 5: Agenda, Projetos e Peso reais
Tipos `event`, `project`, `weight` na tabela `records` do Durable Object; `GET /api/personal` traz tudo (uma leitura por tela); escritas devolvem o estado novo; 422 para campo extra; definir teto de registros por conta (hoje 100 por tipo, o peso diário trava em ~3 meses).

### Etapa 6: segurança e corte do legado
CSP e cabeçalhos pelo Worker, primeiro em `Report-Only` (`connect-src` com `blob:` e `data:`; sem `'wasm-unsafe-eval'`); `X-Cityou-Request` aceito junto do antigo e, um deploy depois, só ele (`tools/pilot-*.mjs` enviam o antigo); apagar `backend/`, pytest e scripts Python; proxy do Vite na 8787; atualizar a seção "Backend" do `CLAUDE.md`. Use a skill `owasp-security`.

### Etapa 7b: resto da ambientação
Entrada animada dos prédios na carga inicial e terreno entrando com a névoa abrindo (ficaram da 7a); desenho sob demanda (`invalidate`); GLB legados reduzidos e com hash; vegetação em volta dos prédios; unificar a `toLambert` duplicada em `SpaceMarker.js`; `constrainCamera` na cidade.

### Etapa 8: Fita do Tempo e transições
Desfazer/refazer com pilha estrita no servidor (só o topo, só se a revisão for a gravada depois, janela de 120 s, últimas 10 ações, reembolso integral, `action_id`); `ActionTape.vue`; cortina na cor do céu, pré-busca e View Transition progressiva; Voltar hierárquico (‹ Mapa, ‹ Painel); renome `src/fifones` → `src/city` por último, num PR só de `git mv`.

### Pendências soltas
- **Base da prévia publicada** (etapa 1): `node tools/api-perf.mjs <url> --suite 50 --cookie '<sessão>'`; precisa de URL e cookie.
- `tools/pilot-perf.mjs` provavelmente está quebrado (constrói `home` na ilha, proibido desde o PR 22).
- **Não conferido visualmente depois da 7a:** a Ilha Inicial, o modo "Luz do anoitecer" (`setLighting('dusk')`, calibrado com ACES) e as outras cidades antigas. Só o Rio foi fotografado.
- `sceneEnvironment.js` ainda tem 24 `castShadow`/`receiveShadow` sem efeito; `refreshShadows()` em `CityWorld.js` agora só marca a sombra de contato (nome herdado).
- Peso medido só com renderização por software e Worker local; nada foi medido em celular de verdade.

## Como rodar
```bash
npm ci
npm test && npm run test:worker && npm run build
npx wrangler dev --port 8787 --ip 127.0.0.1 --var CITYOU_TEST_OPEN_REGIONS:1
CITYOU_CHROME=/opt/pw-browsers/chromium node tools/city-look.mjs http://127.0.0.1:8787 --label antes
CITYOU_CHROME=/opt/pw-browsers/chromium npm run perf:city -- http://127.0.0.1:8787 --runs 3
```
Não reconstrua o `dist` (`npm run build`) enquanto o bench roda: a medida sai contaminada.

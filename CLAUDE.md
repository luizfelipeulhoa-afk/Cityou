# Cityou / BuildU

Organização pessoal gamificada. O repositório tem três páginas Vite e um backend FastAPI local.

## Regra de trabalho: mantenha este arquivo em dia

Vários Claude trabalham neste repositório em branches e sessões diferentes, e este arquivo é o que um novo lê primeiro. Toda mudança que outro Claude precisa saber (arquivo ou módulo novo, comando novo, regra de desempenho, convenção, rota, decisão fechada) entra aqui **no mesmo commit** da mudança, na seção do assunto, em poucas linhas. Antes de começar, leia a versão do `main` e leia o `git log` do que mudou desde o seu branch, para não desfazer o trabalho de outro. Se o assunto já tem guia em `docs/`, aqui vai só o resumo e o caminho do guia.

## Stack e comandos

- Vue 3 (`<script setup>`), Three.js **0.172.0 fixado**, GSAP 3.12, Vite 5. Backend: FastAPI 0.141.1 + SQLite.
- `@tresjs/core` **5.10.1 fixado** (3D declarativo, em migração; ver a seção "3D declarativo").
- `npm run dev` (porta 5177, encaminha `/api` para 8766), `npm run build`, `npm test` (node:test), `npm run test:map`, `npm run test:tres` (laboratório do TresJS no navegador).
- Backend: `python -m backend` (porta 8766). Testes: `pytest tests -q` com `backend/requirements-dev.txt`.
- A pasta pública do Vite é `public-fifones/`, não `public/`.
- Testes de navegador usam `tools/runtime.mjs`. Em sessão na nuvem: `CITYOU_CHROME=/opt/pw-browsers/chromium`.

## Páginas

| Página | Entrada | Conteúdo |
|---|---|---|
| `index.html` | `src/main.js` → `src/App.vue` | painel pessoal |
| `city.html` | `src/city-main.js` → `src/CityApp.vue` | cidade 3D (`src/fifones/CityWorld.js`) |
| `world.html` | `src/world-main.js` → `src/WorldApp.vue` | mapa-mundo BuildU |

## Mapa-mundo (`src/world/`)

- `WorldGlobe.js`: cena, câmera, controles, shader do globo, nuvens, atmosfera, caminho, raycast, fila de animações.
- `terrain.js` + `continents.js`: geração do globo (terra/mar, relevo, biomas, cor por face).
- `SpaceMarker.js`: GLB ou monumento em código, normalização de escala, medida da base, anel de chão, estados e animações de cada espaço.
- `models.js`: de onde vem cada GLB (`models.json` do build, com hash no nome e cache imutável, ou `manifest.json`).
- `monuments.js`: os 8 monumentos low poly feitos em código, usados quando não há GLB. Ilha Inicial, Cristo Redentor, Machu Picchu, Chichén Itzá, Coliseu, Taj Mahal e Grande Muralha já têm GLB do Tripo (só o Petra usa o de código); o GLB, quando existe, tem prioridade.
- `worldSpaces.js`: os 8 espaços. `progress.js`: progresso (funções puras + localStorage). `geo.js`: `latLonToVector3`.
- `src/components/WorldMap.vue`: componente (`v-model:progress`, evento `open-world`, painel de debug com a tecla D ou `?debug=1`).
- `src/components/WorldMapHud.vue`: etiqueta do destino, seta de borda, controles da câmera e aviso de carga.
- Guia: `docs/WORLD-MAP.md`.
- Prompts do Tripo: `docs/TRIPO-PROMPTS.md`. O limite de faces é por modelo e é o `MAX_TRIANGLES` de `tools/check-world-models.mjs` (15 a 25 mil; não existe limite único); os dois mudam no mesmo commit. PBR desligado.

Convenções: lon 0 aponta para +Z, leste para +X, norte para +Y. Modelos com frente em +Z e base em Y=0. Campos de dados em português (`desbloqueado`, `concluido`). GLB em `public-fifones/models/world/<id>.glb`.

Mudança recente (PR #13): o globo assenta cada modelo num disco plano do tamanho da base medida (`measureBase`, `markerSize × escala`, `terrainCore.js`), os modelos usam `MeshLambertMaterial` opaco, com faces planas (sem PBR nem mapa de ambiente; mapas de metal/rugosidade de um GLB não têm efeito) e o build publica os GLB com hash no nome (`models/world/v/`) e `models.json`, com cache imutável. Detalhes em `docs/WORLD-MAP.md` e `docs/WORLD-PERF.md`.

## 3D declarativo (`src/tres/`, em migração)

Decisão fechada: o 3D migra para **TresJS** (`@tresjs/core`), não para React Three Fiber, que exigiria trocar o Vue por React. Guia, fases e regras: `docs/3D-DECLARATIVO.md`. Leia antes de mexer em `SpaceMarker.js`, `WorldGlobe.js` ou `CityWorld.js`.

- Estado: fase 0. As páginas de produção ainda são imperativas e não importam o TresJS. Existem a base (`glbMaterial.js`, `glbLoader.js`, `useGlb.js`, `GlbModel.vue`, `SpaceMarkerNode.vue`) e o laboratório `/tres-lab.html`, só no `npm run dev` (`TresLab.vue`; fora das entradas do build).
- Regra visual de todo GLB, em `src/tres/glbMaterial.js` (`applyGlbStyle`): `flatShading = true`, `needsUpdate = true`, `metalness = 0`, `roughness = 1`, sem os mapas de metal e rugosidade. Já vale nas três cargas de hoje (`SpaceMarker.loadModel`, `CityWorld.loadLandmark`, `CityWorld.loadModel`). Carga nova de GLB passa por ela (`loadGlb`, `useGlb` ou `GlbModel`).
- `vite.config.js` usa as opções de template do TresJS: tags `Tres*` e `primitive` são elementos da cena. Não crie componente Vue com nome começando em `Tres`.
- Objeto do three em `shallowRef` ou `markRaw`, nunca em `ref`; nada reativo por quadro (use `useLoop`); `<primitive>` não libera nada, quem cria libera.
- A API do TresJS 5 difere de exemplos antigos: confira em `node_modules/@tresjs/core/dist/*.d.ts`.

Limites de desempenho: uma luz direcional + hemisfério, sem sombras e sem mapa de ambiente, modelos opacos, globo em um draw call, alvo de 60 fps em celular médio. Meça antes e depois, não estime: `npm run perf:world` (abertura) e `npm run perf:world-frame` (custo por quadro), alternando as duas versões.

## Terreno de cenário (`src/terrain/`, em construção)

Terreno com relevo real e estilizado, configurado por região (primeiro o Rio, em volta de Copacabana). Plano, decisões e etapas: `docs/TERRAIN.md`. A cidade de produção (`CityWorld.js`, `sceneEnvironment.js`, `worker/city.js`) ainda não usa este módulo.

- Dados: `npm run terrain:data -- rio` (`tools/terrain-data.mjs`) baixa os tiles públicos Terrarium uma vez (cache em `data/terrain-tiles/`, fora do git) e grava `src/terrain/regions/rio.height.png` (PNG de 16 bits, `valor = metros × 20`, 0 = água). `--mask` recria a máscara dos lotes; sem isso ela não é tocada. Em tempo de execução não há chamada a serviço externo. Atribuição dos dados em `ASSETS.md`.
- Região: `src/terrain/regions/rio.js` (origem, rumo, escala, picos corrigidos, pontos de controle) e `rio.lots.json` (máscara editável, uma letra por lote: `.` livre, `#` bloqueado, `d` decorativo). O mapa é girado: −Z aponta para o noroeste; 1 unidade = 1 lote = 50 m.
- `src/terrain/png.js` lê PNG de 16 bits sem canvas (`DecompressionStream`); `src/terrain/frame.js` converte latitude/longitude em coordenadas do mundo.
- Nos tiles, a terra tem valor inteiro e o mar tem valor fracionário (até +20 m junto à costa): não separe terra de água pela altura.

## Backend

- `backend/app.py` (`create_app`) só aceita acesso local; toda escrita exige o cabeçalho `X-Fifones-City: 1`.
- Módulos novos seguem `backend/personal.py`: `register(application, root, clock)` com SQLite próprio em `data/`.
- Testes no padrão de `tests/test_personal.py` (`TestClient` com `base_url='http://127.0.0.1:8766'`).

## Backend novo (em especificação)

O FastAPI acima é local e sem usuário. O destino é um Worker do Cloudflare com D1, login e tabelas próprias (sem o Fifones). Antes de mexer em rota, tabela ou botão, leia:

- `docs/GAME-DESIGN.md`: XP e créditos, presença, viagens entre locais, etapas e melhorias dos prédios. Os números são propostas.
- `docs/DATA-MODEL.md`: tabelas, quem preenche cada uma, decisões fechadas e abertas.
- `docs/INTERACTIONS.md`: cada tela, botão e atalho, com a rota e a tabela que toca.
- `docs/API.md`: contrato das rotas, o destino de cada rota atual e as metas de velocidade.

Código: `worker/` (entrada em `worker/index.js`, uma rota por arquivo em `worker/routes/`), esquema em `migrations/*.sql`. `npm run test:worker` roda os testes contra um D1 local (`wrangler.test.jsonc`). `npm run dev:worker` sobe site e API na porta 8787; para o Vite usar essa API, `CITYOU_API=http://127.0.0.1:8787 npm run dev`. `npm run perf:api -- <url>` mede a latência. Em produção já existe uma **demonstração com persistência**, sem login: cada visitante recebe um cookie (`cityou_demo`) e seus registros ficam num Durable Object com SQLite (`worker/demo.js`, binding `DEMO_SESSIONS`), com validação da cidade em `worker/city.js` e catálogo em `shared/game/city-catalog.json`. Os dados expiram em 30 dias. Ela atende as rotas de hoje (`/api/personal`, `/api/city`, `/api/world/*`); o login e o banco em São Paulo descritos nos documentos são o passo seguinte.

Painel de progresso (créditos, nível, bônus): `docs/DASHBOARD.md`; o contrato `resumo` está em `shared/game/summary.js`. Comprovação das atividades: `shared/game/proof.js` e a seção "Comprovação" de `docs/GAME-DESIGN.md`. Viagens de produção ficam fechadas por `TRAVEL_OPEN=false` em `wrangler.jsonc`. A prévia tem acesso aos oito destinos e carteira de teste isolada.

Prédios de atividade: `shared/game/buildings.js` (área→tipo `dom-*`, etapas por dias e semanas); a ação `build` aceita `activity_id` sem x/y e o servidor escolhe o lote (`findSite` em `worker/city.js`). Todo o terreno é construível (`buildRadius`). A Ilha Inicial é só cenário (`isScenicCity`); sem `?local`, a cidade é o Rio (`DEFAULT_CITY` em `worker/demo.js`), já aberto.

No `shared/game/city-catalog.json`, os itens `island-*` são prédios da Ilha Inicial: `city-layout.js` os tira do catálogo comum e os põe no catálogo regional da ilha, e o FastAPI local os ignora. Farol da Percepção, Cabana do Primeiro Passo e Píer da Jornada estão definidos assim, sem modelo 3D. Como a ilha é só cenário, eles ainda não aparecem no jogo.

Regras do jogo: `shared/game/rules.js` (puro, sem banco; `npm test`). O estudo de referência de city builders está em `docs/research/estudo-city-builders.md`; o que foi adotado e o que ficou de fora está em `docs/GAME-DESIGN.md`. Onde os dados ficam é decisão em aberto (`docs/DATA-MODEL.md`).

Regras fixas: o navegador nunca envia XP, créditos, nível ou desbloqueio; nenhuma mecânica pune ausência.

## Skills do projeto (`.claude/skills/`)

Procedência e revisão em `.claude/skills/SOURCES.md`. Use por assunto:

- Animação: `gsap-core`, `gsap-timeline`, `gsap-performance`, `gsap-frameworks`, `gsap-plugins`, `gsap-utils`, `gsap-scrolltrigger`, `animation-performance`, `emil-design-eng`.
- Visual e UI: `frontend-design` (direção estética), `impeccable` (crítica e polimento), `ui-ux-pro-max` (regras de UX e checklist), `design-system` (tokens e componentes), `ui-styling` (Tailwind/shadcn, só como referência: o app usa Vue), `design` (logo, ícones e identidade).
- 3D: `threejs-performance`, `threejs-shaders`, `threejs-loaders`, `threejs-asset-pipeline`, `threejs-interaction`, `threejs-geometry`, `threejs-game-ui-designer`, `threejs-debug-profiler`, `threejs-qa-release`.
- Mecânicas de jogo em Three.js: `threejs-gameplay-systems`. Usabilidade e formulários: `ux-heuristics`, `form-design`.
- Vue: `vue-best-practices`.
- Web: `performance`, `core-web-vitals`, `accessibility`, `web-quality-audit`, `web-perf`.
- Backend: `fastapi`, `async-python-patterns`, `api-design-principles`.
- Deploy (Cloudflare Workers, `wrangler.jsonc`): `workers-best-practices`, `wrangler`. E-mail (recuperação de senha): `cloudflare-email-service`. Alternativa ao D1 para latência: `durable-objects`.
- Prompts para outras ferramentas de IA (Tripo, por exemplo): `prompt-master`.
- Procurar skills novas: `find-skills` (usa `npx skills find`, que precisa de acesso a `skills.sh`).

As skills de design da nextlevelbuilder vieram só com os `.md`: os scripts de busca e os CSVs citados nelas não estão no repositório, então use-as como referência. A `design` cita chaves de API externas: não configure nenhuma sem pedido.

As skills de Three.js miram a r186. Aqui o three é 0.172: confira a API em `node_modules/three` antes de aplicar e não atualize o three sem pedido.

# Cityou / BuildU

Organização pessoal gamificada. O repositório tem três páginas Vite e um backend FastAPI local.

## Stack e comandos

- Vue 3 (`<script setup>`), Three.js **0.172.0 fixado**, GSAP 3.12, Vite 5. Backend: FastAPI 0.141.1 + SQLite.
- `npm run dev` (porta 5177, encaminha `/api` para 8766), `npm run build`, `npm test` (node:test), `npm run test:map`.
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
- `SpaceMarker.js`: GLB ou monumento em código, normalização de escala, estados e animações de cada espaço.
- `monuments.js`: os 8 monumentos low poly feitos em código (sem GLB). Ilha Inicial e Cristo Redentor usam GLB do Tripo; o GLB, quando existe, tem prioridade.
- `worldSpaces.js`: os 8 espaços. `progress.js`: progresso (funções puras + localStorage). `geo.js`: `latLonToVector3`.
- `src/components/WorldMap.vue`: componente (`v-model:progress`, evento `open-world`, painel de debug com a tecla D ou `?debug=1`).
- Guia: `docs/WORLD-MAP.md`.

Convenções: lon 0 aponta para +Z, leste para +X, norte para +Y. Modelos com frente em +Z e base em Y=0. Campos de dados em português (`desbloqueado`, `concluido`). GLB em `public-fifones/models/world/<id>.glb`.

Limites de desempenho: uma luz direcional + hemisfério, sem sombras, globo em um draw call, alvo de 60 fps em celular médio. Meça antes e depois (`tools/`), não estime.

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

Código: `worker/` (entrada em `worker/index.js`, uma rota por arquivo em `worker/routes/`), esquema em `migrations/*.sql`. `npm run test:worker` roda os testes contra um D1 local (`wrangler.test.jsonc`). `npm run dev:worker` sobe site e API na porta 8787; para o Vite usar essa API, `CITYOU_API=http://127.0.0.1:8787 npm run dev`. `npm run perf:api -- <url>` mede a latência. O banco de produção ainda não está ligado em `wrangler.jsonc`.

Regras do jogo: `shared/game/rules.js` (puro, sem banco; `npm test`). O estudo de referência de city builders está em `docs/research/estudo-city-builders.md`; o que foi adotado e o que ficou de fora está em `docs/GAME-DESIGN.md`. Onde os dados ficam é decisão em aberto (`docs/DATA-MODEL.md`).

Regras fixas: o navegador nunca envia XP, créditos, nível ou desbloqueio; nenhuma mecânica pune ausência.

## Skills do projeto (`.claude/skills/`)

Procedência e revisão em `.claude/skills/SOURCES.md`. Use por assunto:

- Animação: `gsap-core`, `gsap-timeline`, `gsap-performance`, `gsap-frameworks`, `animation-performance`, `emil-design-eng`.
- 3D: `threejs-performance`, `threejs-shaders`, `threejs-loaders`, `threejs-asset-pipeline`, `threejs-interaction`, `threejs-geometry`, `threejs-game-ui-designer`, `threejs-debug-profiler`, `threejs-qa-release`.
- Vue: `vue-best-practices`.
- Web: `performance`, `core-web-vitals`, `accessibility`, `web-quality-audit`, `web-perf`.
- Backend: `fastapi`, `async-python-patterns`, `api-design-principles`.
- Deploy (Cloudflare Workers, `wrangler.jsonc`): `workers-best-practices`, `wrangler`. E-mail (recuperação de senha): `cloudflare-email-service`. Alternativa ao D1 para latência: `durable-objects`.
- Prompts para outras ferramentas de IA (Tripo, por exemplo): `prompt-master`.
- Procurar skills novas: `find-skills` (usa `npx skills find`, que precisa de acesso a `skills.sh`).

As skills de Three.js miram a r186. Aqui o three é 0.172: confira a API em `node_modules/three` antes de aplicar e não atualize o three sem pedido.

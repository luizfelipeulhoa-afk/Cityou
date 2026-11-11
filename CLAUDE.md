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
- `SpaceMarker.js`: GLB ou monumento em código, normalização de escala, medida da base, anel de chão, estados e animações de cada espaço.
- `models.js`: de onde vem cada GLB (`models.json` do build, com hash no nome e cache imutável, ou `manifest.json`).
- `monuments.js`: os 8 monumentos low poly feitos em código, usados quando não há GLB. Ilha Inicial, Cristo Redentor, Machu Picchu, Chichén Itzá, Coliseu, Taj Mahal e Grande Muralha já têm GLB do Tripo (só o Petra usa o de código); o GLB, quando existe, tem prioridade.
- `worldSpaces.js`: os 8 espaços. `progress.js`: progresso (funções puras + localStorage). `geo.js`: `latLonToVector3`.
- `src/components/WorldMap.vue`: componente (`v-model:progress`, evento `open-world`, painel de debug com a tecla D ou `?debug=1`).
- `src/components/WorldMapHud.vue`: etiqueta do destino, seta de borda, controles da câmera e aviso de carga.
- Guia: `docs/WORLD-MAP.md`.

Convenções: lon 0 aponta para +Z, leste para +X, norte para +Y. Modelos com frente em +Z e base em Y=0. Campos de dados em português (`desbloqueado`, `concluido`). GLB em `public-fifones/models/world/<id>.glb`.

Limites de desempenho: uma luz direcional + hemisfério, sem sombras e sem mapa de ambiente, modelos opacos, globo em um draw call, alvo de 60 fps em celular médio. Meça antes e depois, não estime: `npm run perf:world` (abertura) e `npm run perf:world-frame` (custo por quadro), alternando as duas versões.

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

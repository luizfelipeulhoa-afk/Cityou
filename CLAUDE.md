# Cityou / BuildU

Organização pessoal gamificada. O repositório tem a página de apresentação, três páginas Vite do app e um backend FastAPI local.

## Regra de trabalho: mantenha este arquivo em dia

Vários Claude trabalham neste repositório em branches e sessões diferentes, e este arquivo é o que um novo lê primeiro. Toda mudança que outro Claude precisa saber (arquivo ou módulo novo, comando novo, regra de desempenho, convenção, rota, decisão fechada) entra aqui **no mesmo commit** da mudança, na seção do assunto, em poucas linhas. Antes de começar, leia a versão do `main` e leia o `git log` do que mudou desde o seu branch, para não desfazer o trabalho de outro. Se o assunto já tem guia em `docs/`, aqui vai só o resumo e o caminho do guia.

## Stack e comandos

- Vue 3 (`<script setup>`), Three.js **0.172.0 fixado**, GSAP 3.12, Vite 5. Backend: FastAPI 0.141.1 + SQLite.
- `@tresjs/core` **5.10.1 fixado** (3D declarativo, em migração; ver a seção "3D declarativo").
- `npm run dev` (porta 5177, encaminha `/api` para 8766), `npm run build` (o build principal e, em seguida, o da página de teste do terreno), `npm test` (node:test), `npm run test:map`, `npm run test:tres` (laboratório do TresJS no navegador), `npm run test:terrain` (página de teste do terreno no navegador).
- Backend: `python -m backend` (porta 8766). Testes: `pytest tests -q` com `backend/requirements-dev.txt`.
- A pasta pública do Vite é `public-fifones/`, não `public/`.
- Testes de navegador usam `tools/runtime.mjs`. Em sessão na nuvem: `CITYOU_CHROME=/opt/pw-browsers/chromium`.

## Páginas

| Página | Entrada | Conteúdo |
|---|---|---|
| `index.html` | `src/landing/landing.js` (sem Vue) | página de apresentação em `/`, com entrar e criar conta |
| `app.html` | `src/main.js` → `src/App.vue` | painel pessoal, em `/app` |
| `city.html` | `src/city-main.js` → `src/CityApp.vue` | cidade 3D (`src/fifones/CityWorld.js`) |
| `world.html` | `src/world-main.js` → `src/WorldApp.vue` | mapa-mundo BuildU |
| `terrain.html` | `src/terrain-main.js` → `src/terrain/TerrainLab.vue` | página de teste do terreno do Rio (sem link no app, `noindex`) |

A página de apresentação e a de teste do terreno são construídas à parte (`vite.landing.config.js`, `vite.terrain.config.js`). Não as ponha nas entradas do `vite.config.js`: isso redistribui os pacotes compartilhados e cada página de produção passa a pedir de 1 a 3 arquivos a mais (medido).

## Design system

Cores, tipografia, forma, topografia do globo e os prompts de imagem e 3D dos prédios estão em `docs/DESIGN-SYSTEM.md`. Antes de criar uma cor, fonte ou prompt novo, leia esse arquivo; se a cor já existe em `:root` ou em `PALETTE`, use a existente. A mesma versão está no Claude Docs da empresa ("Design system Cityou"): mudanças entram pelos dois lados.

## Mapa-mundo (`src/world/`)

- O cabeçalho do mapa tem o link **Voltar ao Cityou**, que abre o painel pessoal tanto na página avulsa quanto no mapa embutido.
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
- `invalidate()` aceita um número de quadros. Como ouvinte direto de um evento (`controls.addEventListener('change', invalidate)`) ele recebe o evento, o contador vira `NaN` e a cena para de redesenhar: use `() => invalidate()`.

Limites de desempenho: uma luz direcional + hemisfério, sem sombras e sem mapa de ambiente, modelos opacos, globo em um draw call, alvo de 60 fps em celular médio. Meça antes e depois, não estime: `npm run perf:world` (abertura) e `npm run perf:world-frame` (custo por quadro), alternando as duas versões.

## Terreno de cenário (`src/terrain/`)

Terreno com relevo real e estilizado, configurado por região (primeiro o Rio, em volta de Copacabana). Guia: `docs/TERRAIN.md` (como usar, decisões, dados e atribuição, máscara, malha, câmera, medições, como criar outra região e o que falta). Na cidade do Rio (`cristo-redentor`) o terreno já é o **cenário** (só visual): `CityWorld.loadTerrain` troca o mar e os morros feitos à mão (`environment.backdrop`, de `sceneEnvironment.js`) pelo terreno de `src/terrain/regions/rio-cidade.js`, carregado sob demanda depois da primeira imagem (`cityTerrain.js`). Grade de 33 × 33 lotes, ruas, prédios e `worker/city.js` não mudaram; se o terreno não carregar, fica o cenário à mão. A zona jogável real do terreno (faixa de Copacabana, `rio.lots.json`) ainda não é usada na cidade: ligá-la muda a grade e a validação do servidor, e é decisão de jogo. A Ilha Inicial e as cidades legadas seguem com o cenário próprio.

- Dados: `npm run terrain:data -- rio` (`tools/terrain-data.mjs`) baixa os tiles públicos Terrarium uma vez (cache em `data/terrain-tiles/`, fora do git) e grava `src/terrain/regions/rio.height.png` (PNG de 16 bits, `valor = metros × 20`, 0 = água). `--mask` recria a máscara dos lotes; sem isso ela não é tocada. Em tempo de execução não há chamada a serviço externo. Atribuição dos dados em `ASSETS.md`.
- Região: `src/terrain/regions/rio.js` (origem, rumo, escala, picos corrigidos, pontos de controle) e `rio.lots.json` (máscara editável, uma letra por lote: `.` livre, `#` bloqueado, `d` decorativo). O mapa é girado: −Z aponta para o noroeste; 1 unidade = 1 lote = 50 m.
- `src/terrain/png.js` lê PNG de 16 bits sem canvas (`DecompressionStream`); `src/terrain/frame.js` converte latitude/longitude em coordenadas do mundo.
- Nos tiles, a terra tem valor inteiro e o mar tem valor fracionário (até +20 m junto à costa): não separe terra de água pela altura.
- Núcleo sem three (roda nos testes): `terrainData.js` (`createTerrainData(região, alturas)`: alturas no mundo, platô, malha, cores, vegetação e a API `isBuildable(lote, tamanho)`, `snapToLot(posição, tamanho)`, `getHeightAt(x, z)`, `getBlockedAreas()`), `lots.js` (máscara) e `rtin.js` (malha de triângulos retângulos por bisseção, sem frestas).
- Convenções do terreno: o platô da zona jogável fica em y = 0 e o mar em y = −0,4. Um lote é `{ x, z }`, as coordenadas inteiras do seu centro (o tile `(x + 8, z + 8)` da cidade); um prédio de n × n é ancorado no lote de menor x e z. Os cantos dos lotes caem em amostras do mapa de alturas: não mude `heightmap.center` sem conferir isso.
- O platô é exatamente plano porque os cantos dos lotes livres e decorativos são vértices forçados da malha. `getHeightAt` devolve a altura da malha desenhada, não a do mapa de alturas.
- Cena three: `TerrainScene.js`. `loadTerrain(região)` baixa o PNG e monta os dados; `createTerrainObjects(dados)` devolve o grupo (terreno e mar num draw call, árvores e palmeiras em dois `InstancedMesh`, um só `MeshLambertMaterial` de faces planas com cor por vértice) e `setBlockedOverlay(visível)`; `seatBuilding(dados, objeto, lote, tamanho)` assenta o prédio sobre um disco de 10 lados, ou devolve `null` se a área não é toda livre. Geometria sem atributo `color` sai preta com esse material: pinte os vértices.
- Câmera: `camera.js`. Chame `constrainCamera(dados, limites, câmera, alvo, névoa)` depois de `controls.update()`: prende o alvo à zona jogável, mantém a câmera acima do terreno e ajusta a névoa. A névoa tem a cor do céu e termina na menor profundidade dos trechos de borda com terra dentro do campo de visão (`edgeDepth`), no máximo 300 unidades: a borda do cenário nunca aparece. `tests/terrain-scene.test.mjs` varre os limites da câmera e confirma. Mudou o tamanho da grade, os limites ou o campo de visão: rode o teste.
- Página de teste: `/terrain.html` (`TerrainLab.vue` + `TerrainStage.vue`, TresJS com `render-mode="on-demand"`): vistas dos marcos, sobreposição das zonas bloqueadas, toque num lote para assentar um prédio. `npm run test:terrain` (`tools/terrain-check.mjs`) confere tudo isso no navegador e grava as imagens em `.verification/`; `--dist` confere a página construída e `--perf` mede o custo por quadro e a montagem com a CPU 4× mais lenta.
- Custo de hoje: 32,8 mil triângulos de terreno (orçamento de 60 mil), 3 draws (terreno com o mar, árvores, palmeiras), montagem em cerca de 0,2 s na thread principal (0,5 s com a CPU 4× mais lenta). Ao ligar o terreno à cidade, leve `createTerrainData` para um worker: o módulo já não depende do three.

## Prédios do Rio com GLB (`public-fifones/models/rio/`)

Nove prédios de exemplo construíveis na cidade do Rio (barraca de feira, casa da laje, quiosque de coco, academia, posto salva-vidas, ponto do bonde, casarão, igrejinha, edifício Art Déco), já no catálogo regional (`rio-*` com `model` e `preview` em `shared/game/city-layout.js`). Guia, tabela de custos e como acrescentar outro: `docs/PREDIOS-RIO.md`. Regras de trabalho:

- Os GLB do Tripo chegam com 175 a 190 mil triângulos: reduza com `node tools/optimize-city-models.mjs <entrada> <saida> --tris 6000` (redutor próprio, sem baixar nada, textura em WebP de 1024). Não use `npx --yes` para baixar ferramentas: o ambiente bloqueia.
- Orçamento travado em `tests/city-models.test.mjs` (`npm test`): até 8 mil triângulos e 500 KB por arquivo, sem Draco nem meshopt (o carregador da cidade não decodifica), `height` do catálogo = altura do modelo a 90% da área.
- A miniatura do menu vem de `item.preview`; gere com `node tools/catalog-previews.mjs <url-do-worker> rio-`.

## Contas e página de apresentação

Guia: `docs/CONTAS.md`. Resumo: `worker/auth.js` faz cadastro, entrada e saída (cookie `cityou_session`, PBKDF2, tabelas do D1 criadas pelo próprio Worker). A conta não copia dados: `users.data_key` é o nome do Durable Object `DemoSession` da pessoa, adotado da demonstração no cadastro; objeto de conta não vence. Com o D1 ligado, `/app`, `/city` e `/world` pedem login (`pageGate` em `worker/index.js`) e `/` leva quem já entrou ao app; sem o D1 (produção hoje, até pôr o `database_id` em `wrangler.jsonc`), tudo segue como demonstração e a página diz "Abrir a demonstração". Página nova do app entra em `APP_PAGES` e em `run_worker_first`. Links para o painel usam `/app#/...`; os `/#/...` do catálogo apontam para o Fifones (porta 8765), não para o painel. **Login obrigatório:** `REQUIRE_LOGIN="true"` em `wrangler.jsonc` (produção e prévia) faz toda rota de dados da API responder 401 sem sessão, além das páginas, mas só vale com o D1 ligado; sem `database_id` nada muda (a demonstração continua). Teste com `wrangler.test-login.jsonc`. Falta: esqueci a senha (precisa de e-mail com domínio).

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

Prédios de atividade: `shared/game/buildings.js` (área→tipo `dom-*`, etapas por dias e semanas); a ação `build` aceita `activity_id` sem x/y e o servidor escolhe o lote (`findSite` em `worker/city.js`). Todo o terreno é construível (`buildRadius`). A Ilha Inicial é de cenário (`isScenicCity`: sem praça, sede, ruas nem prédios de atividade), mas o jogador constrói nela o Farol, a Cabana e o Píer (decidido em 13/11/2026; lista em `scenicBuildable` de `shared/game/city-layout.js`, e `applyCityAction` recusa ruas e qualquer outro tipo lá); sem `?local`, a cidade é o Rio (`DEFAULT_CITY` em `worker/demo.js`), já aberto.

No `shared/game/city-catalog.json`, os itens `island-*` são prédios da Ilha Inicial: `city-layout.js` os tira do catálogo comum e os põe no catálogo regional da ilha, e o FastAPI local os ignora. Farol da Percepção, Cabana do Primeiro Passo e Píer da Jornada têm GLB em `public-fifones/models/island/` (6 mil triângulos cada, feitos pelo guia de `docs/DESIGN-SYSTEM.md` e reduzidos com `tools/optimize-city-models.mjs`; orçamento e altura em `tests/city-models.test.mjs`) e já se constroem na ilha (a tela mostra o catálogo só com esses três). Prompts das decorações da ilha (rede, coqueiros, fogueira, estátua, barcos): `docs/PROMPTS-ILHA.md`. Decorações da ilha já construíveis (13/11/2026, GLB de 6 mil triângulos em `public-fifones/models/island/`): Rede da Calmaria (2x2), Coqueiral (2x2), Fogueira da Prosa (1x1), Guardião Antigo (2x2), Canoa do Pescador (2x2) e Veleiro Encalhado (3x3), todos em `scenicBuildable`. Prompts dos personagens (Explorador e Tortuguinha, propostas): `docs/PROMPTS-PERSONAGENS.md`. Quem acrescentar mais decoração põe o item em `city-catalog.json` com prefixo `island-` e o id em `scenicBuildable`. `tools/optimize-city-models.mjs` agora usa a textura de cor do material (e não a primeira imagem do GLB): arquivos com mapa de normais saíam roxos.

Regras do jogo: `shared/game/rules.js` (puro, sem banco; `npm test`). O estudo de referência de city builders está em `docs/research/estudo-city-builders.md`; o que foi adotado e o que ficou de fora está em `docs/GAME-DESIGN.md`. Onde os dados ficam é decisão em aberto (`docs/DATA-MODEL.md`).

Moedas de teste dos sócios: `POST /api/admin/credits` (`worker/demo.js`), só existe com o segredo `CITYOU_ADMIN_TOKEN`, 50.000 por sessão e uma vez; uso em `docs/API.md`. Não crie outro caminho para dar moedas sem proteção.

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

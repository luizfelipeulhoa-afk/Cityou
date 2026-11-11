# Mapa-mundo do BuildU

O globo low poly é a entrada das cidades. Há oito destinos, a Ilha Inicial e sete maravilhas. Ao clicar ou tocar num monumento liberado, o jogador entra na cidade correspondente. A lista de destinos oferece o mesmo acesso por teclado.

## Cidades regionais e referências

O [índice de dossiês](research/regioes/README.md) reúne a pesquisa dos oito destinos. As fichas de Rio e Ilha documentam as plantas, a chegada, os prédios e os cortes interativos dos pilotos.

## Cidades no Worker

- A Ilha é a primeira cidade. A primeira construção de um prédio em cada cidade libera uma escolha de viagem. Ruas e árvores não contam para esse marco. A pessoa pode usar a viagem em qualquer destino ainda bloqueado e voltar a uma cidade aberta sem custo.
- Cada cidade tem sua própria grade plana de construção e um cenário com o monumento fora da área edificável. O mapa da cidade carrega o GLB daquele local sob demanda, com modelo procedural de reserva.
- O Worker identifica a sessão de demonstração pelo cookie. Cada cidade tem construções e revisão próprias, enquanto saldo e progresso por ações recompensadas pertencem à sessão. A cidade anterior é tratada como a Ilha Inicial. Destinos já guardados no Worker continuam disponíveis.
- Tarefas, hábitos e metas concluídas abastecem a mesma carteira. A passagem, a construção e os comprovantes de reenvio são tratados no servidor. Se a conexão cair, a tela informa a falha e mantém o último estado confirmado. A confirmação de novos gastos depende de conexão.
- `GET /api/world/progress` informa os destinos abertos e `viagens_disponiveis`. `POST /api/world/travel` recebe `{ local, request_id }`. `GET /api/city?local=<id>` e `POST /api/city/actions?local=<id>` consultam e alteram a cidade do local escolhido. A API valida o acesso mesmo quando a URL é aberta diretamente.

## Rodar

Execute `npm ci` e `npm run dev:worker`. Abra `http://127.0.0.1:8787/world.html`. O comando `npm run test:worker` cobre viagens, persistência e carteira no simulador local.

O protótipo anterior continua disponível com Vite (`npm run dev`) ou FastAPI (`python -m backend`). Nele, o globo demonstra a progressão sequencial e o modo debug abre com **D** ou `?debug=1`.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `src/world/WorldGlobe.js` | Cena: renderer, câmera, OrbitControls (sem pan, zoom limitado, inclinação com o zoom), globo com shader (ondas, florescer, borda atmosférica, sombra de contato dos monumentos, cintilar do mar), nuvens, atmosfera em fresnel, estrelas, caminho pontilhado, raycast, fila de animações GSAP, destino em destaque. |
| `src/world/terrainCore.js` | Gera o globo sem depender do three: icosaedro subdividido, terra/mar por polígonos, relevo, biomas, cor por face e a cor "florescida". |
| `src/world/terrain.worker.js`, `terrainClient.js`, `terrain.js` | Rodam o núcleo num Web Worker (com reserva síncrona) e montam a geometria do three. |
| `src/world/continents.js` | Contornos simplificados dos continentes, mares interiores, cordilheiras e zonas de bioma (em lon/lat). |
| `src/world/geo.js` | `latLonToVector3(lat, lon, raio)` e a orientação na superfície (`surfaceQuaternion`). |
| `src/world/worldSpaces.js` | Dados dos 8 espaços `{ id, nome, lat, lon, glbPath, desbloqueado, concluido, ... }`. |
| `src/world/SpaceMarker.js` | Marcador: carrega o GLB (ou o monumento em código), normaliza a escala, mede a base do modelo e cuida dos estados, do anel de chão e das animações de cada espaço. |
| `src/world/models.js` | Decide de onde vem cada GLB: `models.json` (arquivo com hash no nome, gerado no build) ou `manifest.json` (lista de ids). |
| `src/world/monuments.js` | Os 8 monumentos low poly construídos em código (caixas, cilindros, cones), nítidos, de 300 a 2.500 triângulos e poucos KB. |
| `src/world/progress.js` | Progresso em `localStorage` (`unlock`, `complete`, `reset`, mais funções puras de fusão). |
| `src/world/progressSync.js` | Sincronização local-first com o backend. |
| `backend/world.py` | `GET` e `PUT /api/world/progress` (SQLite). |
| `src/components/WorldMap.vue` | Componente: monta a cena, recebe o progresso por props, emite eventos e tem o painel de debug. |
| `src/components/WorldMapHud.vue` | Ajudas de navegação por cima do canvas: etiqueta do destino, seta de borda, controles da câmera e aviso de carga dos modelos. Chega num pacote à parte, depois que o globo está pronto. |
| `src/WorldApp.vue`, `world.html` | Página que conecta o globo às cidades no Worker e mantém a simulação no protótipo local. |

## Usar o componente

```vue
<script setup>
import { ref, watch } from 'vue'
import WorldMap from '@/components/WorldMap.vue'
import { loadProgress, saveProgress } from '@/world/progress.js'

const progress = ref(loadProgress()) // { versao, desbloqueados: [...ids], concluidos: [...ids] }
watch(progress, saveProgress, { deep: true })
const abrirFase = id => { /* navegar para a fase `id` */ }
</script>

<template>
  <WorldMap v-model:progress="progress" @open-world="abrirFase" />
</template>
```

- **Props**: `progress` (`{ epoca, desbloqueados, concluidos }`), `spaces` (opcional, padrão `WORLD_SPACES`), `goalId` (espaço em destaque; padrão: o mais avançado já desbloqueado), `debug` (abre o painel).
- **Eventos**: `select` (id, no instante do toque num espaço desbloqueado), `open-world` (id, quando a câmera termina de focar), `locked` (`{ id, previousId }`), `interact` (primeiro gesto no globo), `update:progress` (emitido pelo debug), `ready` (terreno e marcadores prontos).
- **Métodos** (via `ref`): `focusSpace(id)`, `activateSpace(id)` (mesmo efeito de tocar), `resetView()`.

As animações saem da diferença entre o progresso anterior e o novo, venha a mudança do debug, do backend ou de `completeSpace`. Na simulação local, concluir N também desbloqueia N+1. No Worker, o desbloqueio acontece quando a pessoa confirma o destino da viagem.

## Ajudas de navegação

Ficam em `WorldMapHud.vue`, por cima do canvas, e valem para os dois modos (cidades no Worker e protótipo local).

- **Destino em destaque.** Uma etiqueta com o nome fica ao pé do marcador enquanto ele está à vista. Se ele está atrás do globo ou fora da tela, vira uma seta presa à borda, apontando para o lado em que ele está. Tocar na seta gira o globo até lá, sem abrir nada.
- **Câmera.** Botões de aproximar e afastar (só com mouse; no toque, a pinça resolve) e um botão que volta à visão geral, visível só quando a câmera saiu dela.
- **Atalhos.** `+` e `−` aproximam e afastam, `0` volta à visão geral, `D` abre o debug.
- **Carga dos modelos.** Se os GLB demoram mais de 0,4 s, aparece "Carregando monumentos" com uma barra que enche pelo peso dos arquivos. Os monumentos em código já estão na tela enquanto isso.

A posição da etiqueta e da seta sai do globo a cada quadro (`onGoal`) e vai direto para o `transform` dos elementos, sem estado reativo e sem layout. Nenhuma peça nova usa `backdrop-filter`, que obrigaria o navegador a desfocar o canvas a cada quadro.

## Como um modelo assenta no globo

O globo se ajusta a cada modelo, seja GLB ou monumento em código:

- **Base medida.** Depois de normalizar a escala, `measureBase()` mede o raio do que encosta no chão (os vértices do décimo mais baixo). No Cristo, é o octógono do morro, não os braços abertos.
- **Assento plano.** O terreno sob cada espaço em terra é um disco no plano tangente, do tamanho da base, e todo ele é terra, mesmo à beira-mar. A base plana do GLB encosta inteira. O tamanho acompanha `MARKER_SIZE` (em `WorldGlobe.js`) e a `escala` do espaço.
- **Sombra de contato.** O shader do globo escurece o chão num anel suave em volta da base. Não há draw call a mais.
- **Anel de chão.** Um plano só, com shader radial: anel fino no raio da base, halo e uma onda que se expande. É desenhado logo depois do globo, sem teste de profundidade, então o relevo nunca o corta e o modelo cobre a parte que fica atrás dele.
- **Luz do modelo.** A base escurece junto ao chão, as faces viradas para fora do globo recebem luz de céu, e o contorno acende na cor do espaço (dourado depois de concluído).
- **Bloqueado.** O modelo vira uma estátua de pedra clara, opaca, com névoa e cadeado. O desbloqueio devolve a cor.

Os GLB do Tripo chegam como material PBR com rugosidade 0,9 e sem metal, ou seja, quase só difuso. O mapa os desenha com `MeshLambertMaterial`, que dá o mesmo difuso com menos contas por pixel e dispensa o mapa de ambiente. Mapas de metal e rugosidade de um GLB novo não têm efeito aqui. Antes da conversão, todo GLB passa por `applyGlbStyle()` (`src/tres/glbMaterial.js`), que liga o `flatShading`: os modelos do Tripo saem com faces planas, como os monumentos em código. A regra completa e os pontos onde ela vale estão em `docs/3D-DECLARATIVO.md`.

## Monumentos em código e modelos do Tripo

Cada espaço tem um monumento feito em código (`src/world/monuments.js`). Ele aparece sempre que não há GLB. Hoje só o Petra o usa; os outros sete espaços têm modelo do Tripo (ver abaixo). A razão: o Tripo, com 6 mil faces, entrega malha mole e textura borrada (testado com o Cristo), enquanto formas geométricas em código saem facetadas e nítidas, no estilo do globo, sem gastar crédito. A Ilha Inicial usa o modelo do Tripo (`ilha-inicial.glb`), que ficou bom por ser uma forma orgânica.

Se um GLB com o id do espaço existir em `public-fifones/models/world/`, ele tem prioridade sobre o monumento em código. Para voltar ao monumento em código, apague o GLB e rode `node tools/world-models-manifest.mjs`.

## Modelos do Tripo que já estão no repositório

| Espaço | Triângulos no export | Triângulos no jogo | Arquivo |
|---|---|---|---|
| Ilha Inicial | 5.589 | 5.589 | 89 KB |
| Cristo Redentor | 9.597 | 9.597 | 106 KB |
| Machu Picchu | 238 mil | 23.835 | 272 KB |
| Chichén Itzá | 121 mil | 13.929 | 211 KB |
| Coliseu | 232 mil | 23.226 | 316 KB |
| Grande Muralha | 239 mil | 23.904 | 286 KB |
| Taj Mahal | 225 mil | 22.525 | 274 KB |

Os modelos grandes foram reduzidos com `node tools/optimize-world-models.mjs <arquivo> <id> --ratio 0.1 --error 0.05` (`--ratio` mira a fração dos triângulos que fica). Texturas em WebP de 1024 px; nenhum modelo precisou de rotação.

**Petra:** o primeiro export (239 mil triângulos) não passou da redução. A ferramenta para em cerca de 27 mil triângulos, qualquer que seja o `--ratio`, e a fachada, com colunas finas e ornamentos, ficou borrada. O modelo foi tirado e o Petra voltou ao monumento em código. Para ter um GLB, gere de novo no Tripo já com limite de faces e uma fachada simplificada (ver `TRIPO-PROMPTS.md`).

## Modelos para gerar no Tripo (opcional)

Salve em `public-fifones/models/world/` (servido em `/models/world/`). Nome do arquivo = `id` do espaço.

| # | Arquivo | O que modelar | Triângulos (máx.) |
| --- | --- | --- | --- |
| 1 | `ilha-inicial.glb` | Ilhota de areia clara com 2–3 coqueiros e pedras, sobre um disco/hexágono raso de água turquesa | 6.000 |
| 2 | `cristo-redentor.glb` | Estátua de braços abertos sobre o morro do Corcovado (morro verde, pedestal) | 20.000 |
| 3 | `machu-picchu.glb` | Terraços em degraus, ruínas de pedra e o pico Huayna Picchu ao fundo | 25.000 |
| 4 | `chichen-itza.glb` | Pirâmide El Castillo (degraus, escadarias, templo no topo) num gramado | 15.000 |
| 5 | `coliseu.glb` | Anfiteatro oval com parte do anel superior quebrada | 25.000 |
| 6 | `petra.glb` | Fachada do Tesouro (Al-Khazneh) esculpida num penhasco rosado | 20.000 |
| 7 | `taj-mahal.glb` | Mausoléu branco com cúpula, 4 minaretes, plataforma e espelho d'água | 25.000 |
| 8 | `grande-muralha.glb` | Trecho da muralha subindo morros, com 2–3 torres de vigia | 25.000 |

Total ≈ 160 mil triângulos se todos tiverem GLB. Só os marcadores na tela são desenhados, o que cabe em desktop e em celulares recentes; em celular médio, meça com `npm run perf:world` e reduza o limite se faltar fôlego.

Para todos:

- **Orientação**: +Y para cima e **frente para +Z**. A câmera de foco olha o modelo a partir de +Z.
- **Base em Y = 0**, centrado na origem em X/Z. O normalizador centraliza e apoia no chão sozinho, mas a orientação precisa estar certa.
- **Proporção**: pense numa base quadrada. A escala é ajustada pelo maior lado em X/Z (e por um limite de altura), então um modelo muito comprido fica fino. Faça a Grande Muralha em zigue-zague dentro de um quadrado.
- **Material**: 1 material com textura base de 1024 px (512 px se quiser economizar), sem transparência.
- **Arquivo**: até ~2 MB. Defina o limite de faces **no Tripo, na hora de gerar**: a redução posterior não chega lá (veja abaixo).

Conferir e compactar:

```bash
node tools/check-world-models.mjs
```

```bash
node tools/optimize-world-models.mjs meu-modelo.glb coliseu
```

O primeiro lista triângulos, tamanho e texturas de cada GLB e falha se algum passar do orçamento. O segundo grava `public-fifones/models/world/coliseu.glb` com meshopt e texturas WebP de até 1024 px (num teste, 10,6 MB viraram 1,2 MB). A simplificação da malha preserva as costuras de textura e, em modelos gerados por IA, costuma parar perto da metade dos triângulos (184 mil → 88 mil no teste), por isso o limite de faces precisa vir do Tripo. O mapa decodifica meshopt e WebP; Draco não está configurado.

Para comparar: os GLB dos prédios da cidade (`public-fifones/models/`) têm 10–15 MB e cerca de 200 mil triângulos cada. Dois deles no globo já somam mais de 460 mil triângulos, pesado demais para o mapa.

## Trocar um placeholder pelo seu GLB

1. Exporte do Tripo em GLB e renomeie com o id (ex.: `coliseu.glb`).
2. Copie para `public-fifones/models/world/`.
3. Recarregue a página. No debug (tecla D), a linha do espaço passa de "placeholder" para "GLB".
4. Ajuste fino em `src/world/worldSpaces.js`, se precisar: `escala` (1 = padrão; 1.2 = 20% maior) e `rotacaoY` (graus; 180 se o modelo vier de costas).

Não é preciso mexer no código. Enquanto o arquivo não existe, o placeholder aparece. Depois de trocar um GLB, rode `npm run build`: é o build que publica a cópia com hash (veja "Endereço e cache dos modelos"). O Vite mantém `public-fifones/models/world/manifest.json` com a lista dos GLB (ao iniciar o dev server, a cada arquivo adicionado e no build); se você copiar um GLB sem o Vite rodando, gere a lista com `node tools/world-models-manifest.mjs`.

## Endereço e cache dos modelos

O build copia cada GLB para `dist/models/world/v/<id>.<hash>.glb`, com o hash do conteúdo no nome, e grava `dist/models/world/models.json` com o arquivo, o tamanho e os triângulos de cada id. O globo lê essa lista numa requisição e baixa os arquivos com hash.

| Caminho | Cache | Quem serve |
|---|---|---|
| `/models/world/v/*` | um ano, `immutable` | Cloudflare (`public-fifones/_headers`) e FastAPI (`backend/app.py`) |
| `/models/world/models.json`, `manifest.json` | `no-cache` | os dois |
| `/models/world/<id>.glb` | como antes (uma hora no Cloudflare) | os dois; a cidade (`CityWorld.js`) usa este caminho |

Numa visita repetida, nenhum modelo gera requisição. Um modelo trocado muda de nome no build seguinte, então não há espera pelo cache vencer. No `npm run dev`, o Vite responde `models.json` apontando para os arquivos de origem. Se `models.json` faltar (build antigo), o globo usa `manifest.json` e o caminho de sempre.

## Progresso e sincronização

- O progresso vive no `localStorage` e a tela nunca espera a rede.
- Quando a página roda em endereço local (o backend só aceita acesso local), `src/world/progressSync.js` envia o progresso ao FastAPI em segundo plano: `PUT /api/world/progress` junta o que o navegador mandou ao que está guardado e devolve o resultado. O progresso só avança.
- `epoca` conta os resets. Entre épocas diferentes vence a mais nova, então um reset num navegador vale no servidor e nos outros navegadores.
- No site publicado não há sincronização nem requisições à API.

## Testes e ferramentas

| Comando | O que faz |
|---|---|
| `npm test` | progresso, fusão, sincronização, lat/lon, terra/mar, geometria |
| `pytest tests -q` | backend, incluindo `tests/test_world.py` |
| `npm run test:world` | ponta a ponta com o backend real, dois navegadores e uma tela de celular |
| `npm run perf:world` | mede a abertura num celular médio simulado (`docs/WORLD-PERF.md`) |
| `npm run perf:world-frame` | mede o custo por quadro com a cena montada: quadros por segundo por software, CPU do tick, draws e triângulos |
| `node tools/check-world-models.mjs` | orçamento de triângulos, tamanho e textura dos GLB |
| `node tools/optimize-world-models.mjs <glb> <id>` | compacta um GLB e o grava na pasta pública |

`npm run test:world`, `npm run perf:world` e `npm run perf:world-frame` pedem `npm run build` antes. Em sessão na nuvem, prefixe com `CITYOU_CHROME=/opt/pw-browsers/chromium`.

Os prompts do Tripo para os 8 modelos estão em `docs/TRIPO-PROMPTS.md`.

## Notas de desempenho

Medições de antes e depois em `docs/WORLD-PERF.md`.

- Globo: ~16,8 mil triângulos num único draw call. Ondas, florescer e brilho da borda rodam no shader.
- O terreno é gerado num Web Worker; o primeiro quadro sai com uma esfera de oceano.
- `IcosahedronGeometry` no three r172 subdivide de forma linear: `detail` 4–5 dá só 500–720 faces. Por isso o globo usa `detail` 28, que continua low poly.
- Luzes: hemisfério + 1 direcional presa à câmera. Sem sombras e sem mapa de ambiente: a sombra de contato e a luz de céu dos modelos são contas no shader.
- Os modelos são opacos em todos os estados, então entram na passada opaca (descarte por profundidade, sem ordenação). Anel e onda de cada espaço são um draw call só.
- Pixel ratio até 1,75. Se o FPS cair abaixo de 48, ele desce sozinho até 1.
- Ocioso, o mapa desenha metade dos quadros; fora da tela, nenhum.
- Os placeholders juntam as peças por cor (poucos draw calls). O debug mostra fps, draws e triângulos.
- Com `prefers-reduced-motion`, as animações ficam mais curtas e não há rotação automática.

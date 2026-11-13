# Terreno de cenário (Rio / Copacabana)

Módulo de terreno com relevo real e estilizado, configurado por região. Primeiro uso: Copacabana, com o Pão de Açúcar, o Morro da Urca e o Corcovado ao fundo. Só a área central é jogável; o resto é cenário.

Na cidade do Rio (Cristo Redentor), o terreno é o **cenário**: só o que fica em volta da grade. `CityWorld.loadTerrain` troca o mar e os morros feitos à mão pelo terreno de `regions/rio-cidade.js`. Essa região usa o mesmo mapa de alturas do Rio, mas a zona plana é a terra da grade da cidade (33 × 33 lotes), com a praia real alinhada à orla da cidade (`CITY_SHIFT`). Grade, ruas, prédios, `worker/city.js` e os dados salvos não mudaram. O terreno é baixado depois da primeira imagem (módulo e PNG sob demanda, 20 kB e 170 kB); se falhar, a cidade fica com o cenário feito à mão. Na cidade a vegetação distante é cortada (árvores a 80 unidades, palmeiras a 50), porque a névoa fecha em 105.

Desde 13/11/2026, com o terreno carregado:

Desempenho (13/11/2026, continuado): a cidade fecha a névoa bem mais perto (`TERRAIN.fog` em `src/terrain/lighting.js`,
40 a 80 unidades, era 48 a 105) e a câmera inicial do Rio começa mais perto (`CityWorld.home`, zoom maior; o teto
do zoom, `controls.maxDistance`, caiu de 73 para 56). Nada disso é visível além da névoa, então o orçamento de
malha da cidade (`detail.maxTriangles` em `rio-cidade.js`) caiu de 60 mil (o de `rio.js`, usado em `/terrain.html`)
para 13 mil: o algoritmo de erro já prioriza o que fica perto da grade e dos marcos (`detail.landmark`), então cortar
o orçamento tira primeiro o relevo distante que a névoa nova já escondia. Vegetação (`treeRange`/`palmRange`) e o
raio do morro do Cristo (`relief`) acompanham a nova distância. Medido com `node tools/city-frame-bench.mjs` (Worker
local, CPU 4× mais lenta, rede 4G): de 57.756 para 35.852 triângulos e de 52 para 40 draws na cidade vazia (−38% e
−23%); com 25 prédios, de 203.487 para 181.583 triângulos (−11%). O tempo até a cidade ficar pronta não mudou
nesse teste: nele, quem domina é o download dos GLB sob a rede simulada, não o terreno; o download do mapa de
alturas (170 KB, compartilhado com `/terrain.html`) e passar `createTerrainData` para um worker (já seguia como
próximo passo) são o que falta para essa parte também cair.

- **Encosta protegida e morro do Cristo:** a encosta feita à mão (`pilotSlope`, com o Cristo grande em cima) só fica na reserva sem terreno. As `slopeTiles` do servidor são `#` na máscara de `rio-cidade.js` (relevo real, sem construção) e a região soma um morro (`relief`) atrás da grade, que continua os morros reais à esquerda. O Cristo vai para o topo dele (`CRISTO_PEAK`) com `CRISTO_SCALE` (0,6) do tamanho do monumento; `loadCityTerrain` devolve essa posição em `landmark`.
- **Chão dos lotes:** é o platô do próprio terreno, no verde da mata (`plateau.tint` negativo, `contrast` e `facets` em `rio-cidade.js`); o `pilotLand` bege virou reserva. Ao construir, a grade aparece como lotes claros e translúcidos com um vão entre eles (`CityWorld.makeGround`, cidades piloto).
- **Calçadão de Copacabana:** fica na primeira fileira de água junto à terra (`d` na máscara: plana e não construível), entre a avenida e a areia, com o desenho de ondas em textura (`pilotRio`, `copacabanaTexture`) e coqueiros na areia. Antes ele ocupava a última fileira de lotes construíveis.
- `createTerrainData` aceita na região: `relief` (morros somados ao mapa, `{ x, z, radiusX, radiusZ, height }`), `plateau.tint`, `plateau.contrast`, `plateau.facets` e `vegetation.decorativePalms`. Os padrões mantêm a região de Copacabana (`rio.js`) como estava.

Custo na cidade, com renderização por software, alternando as versões: de 23.065 para 64.302 triângulos e de cerca de 11 para cerca de 10 quadros/s; CPU por quadro igual (1,0 a 1,2 ms). Os arquivos carregados na abertura de cada página não mudam. Não medido em aparelho real.

## Onde ver e como conferir

- **Página de teste:** `/terrain.html` (no `npm run dev` e no site publicado; sem link no app, `noindex`). Tem as vistas dos marcos, a sobreposição das zonas bloqueadas e o toque num lote para assentar um prédio.
- **`npm test`:** `tests/terrain.test.mjs` (dados, lotes, malha, platô, API) e `tests/terrain-scene.test.mjs` (limites da câmera e borda, cena, assento dos prédios).
- **`npm run test:terrain`:** abre a página no navegador e confere carga, prédios, toque, sobreposição, vistas e limites da câmera. Grava imagens em `.verification/terrain-*.png`. Com `--dist`, confere a página construída; com `--perf`, mede.

## Como usar

```js
import rio from './terrain/regions/rio.js'
import { createTerrainObjects, loadTerrain, seatBuilding } from './terrain/TerrainScene.js'
import { cameraLimits, constrainCamera } from './terrain/camera.js'

const terrain = await loadTerrain(rio)        // lê o PNG do próprio site e monta os dados
const objects = createTerrainObjects(terrain) // scene.add(objects.group)

terrain.isBuildable({ x: 3, z: -2 }, 2)       // a área 2×2 ancorada no lote (3, −2) é toda livre?
terrain.snapToLot({ x: 3.4, z: -1.7 }, 2)     // lote âncora mais próximo de um ponto
terrain.getHeightAt(3, -2)                    // altura do terreno desenhado; 0 no platô
terrain.getBlockedAreas()                     // [{ x, z, width, depth }]
seatBuilding(terrain, glb, { x: 3, z: -2 }, 2) // grupo já posicionado, ou null se a área não é toda livre
objects.setBlockedOverlay(true)               // sobreposição de depuração

// A cada quadro, depois de controls.update():
constrainCamera(terrain, cameraLimits(terrain), camera, controls.target, scene.fog)
```

| Arquivo | Conteúdo |
|---|---|
| `src/terrain/regions/rio.js` | configuração da região: origem, rumo, escala, picos, marcos, pontos de controle |
| `src/terrain/regions/rio.height.png` | mapa de alturas gerado (PNG de 16 bits) |
| `src/terrain/regions/rio.lots.json` | máscara dos lotes, editável |
| `src/terrain/terrainData.js` | `createTerrainData`: alturas, platô, malha, cores, vegetação e a API. Sem three |
| `src/terrain/lots.js`, `rtin.js`, `frame.js`, `png.js` | máscara, malha, conversão de coordenadas e leitor de PNG. Sem three |
| `src/terrain/TerrainScene.js` | objetos three, sobreposição e `seatBuilding` |
| `src/terrain/camera.js` | limites da câmera e névoa. Sem three |
| `src/terrain/TerrainLab.vue`, `TerrainStage.vue` | página de teste (TresJS) |
| `tools/terrain-data.mjs` | script de dados |
| `tools/terrain-check.mjs` | conferência no navegador |

Convenções: +Y para cima; o platô da zona jogável em y = 0 e o mar em y = −0,4. Um lote é `{ x, z }`, as coordenadas inteiras do seu centro, com 1 unidade de lado. Um prédio de n × n lotes é ancorado no lote de menor x e menor z, como na cidade (o lote `(x, z)` é o tile `(x + 8, z + 8)` de `CityWorld.js`).

## Decisões

1. **Dados reais, baixados uma vez.** Tiles públicos Terrarium, zoom 12. O script guarda os tiles fora do git e grava um arquivo pequeno no repositório. Em tempo de execução o terreno vem desse arquivo, servido pelo próprio site: nenhum serviço externo.
2. **Terra e água pelo tipo do valor.** Junto à costa o mar vem com valores positivos (em Copacabana, de +21 m na praia até cruzar o zero a uns 400 m dela), então a altura não separa os dois. Nos tiles, a terra (SRTM) tem valor inteiro e a água (preenchimento batimétrico) tem valor fracionário. O script usa isso.
3. **Mapa girado.** O fundo do mapa (−Z) aponta para o noroeste (315°). A praia fica na horizontal, com o mar na frente e os morros atrás, como no cenário atual do Rio. O Corcovado cai atrás do centro e o Pão de Açúcar à direita, no fim da praia.
4. **Escala.** 1 unidade = 1 lote = 50 m. A grade de alturas tem 513 × 513 amostras, uma por lote (25,6 km de lado), com o centro 3 km para o lado da terra. As amostras caem nos cantos dos lotes.
5. **Altura exagerada em 1,6.** O Corcovado fica com 22 unidades de altura e o Pão de Açúcar com 12; os prédios do catálogo da cidade chegam a 4,5. Com um fator maior o Pão de Açúcar vira uma agulha.
6. **PNG de 16 bits em tons de cinza.** `valor = metros × 20`; 0 = água. É o formato que os programas de terreno exportam, então uma região inventada (a Ilha Inicial) pode ser pintada à mão. O leitor é próprio (`png.js`), porque um canvas só devolve 8 bits.
7. **Malha por bisseção de triângulos retângulos (RTIN), em código próprio.** A tolerância de erro cresce com a distância da zona jogável: malha densa perto, grossa ao longe, sem frestas. Um material fosco, faces planas, cor por face, sem textura. O mar é parte da mesma malha.
8. **Platô exato.** Os cantos dos lotes livres e decorativos são vértices forçados da malha, todos em y = 0. Cada lote jogável é coberto por dois triângulos só dele. O relevo real começa nos lotes vizinhos.
9. **Borda escondida pela névoa, com conta.** A névoa tem a cor do céu e chega a 100% antes da borda do cenário. A distância final é calculada a cada quadro a partir dos trechos de borda que estão no campo de visão. Um teste percorre os limites da câmera.
10. **Página de teste construída à parte.** Como entrada do build principal, ela redistribuía os pacotes compartilhados e as páginas de produção passavam a pedir mais arquivos (início de 2 para 3, cidade de 4 para 7, mapa-mundo de 3 para 6). Por isso `npm run build` roda um segundo build só para ela (`vite.terrain.config.js`).
11. **Nomes.** Os scripts do projeto ficam em `tools/` e os guias de `docs/` têm nome em maiúsculas: por isso `tools/terrain-data.mjs` e `docs/TERRAIN.md`, e não `scripts/` e `docs/terrain.md`.

## Dados de elevação

- **Fonte.** Terrain Tiles (Mapzen/Tilezen, projeto `joerd`), formato Terrarium, no bucket público `elevation-tiles-prod` da AWS: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`. Tiles de 256 px, sem credencial. Altura em metros: `R × 256 + G + B / 256 − 32768`.
- **Conferência (12/11/2026).** Endereço, fórmula, fontes por zoom e atribuição vêm dos documentos do projeto (`tilezen/joerd`: `use-service.md`, `formats.md`, `data-sources.md`, `attribution.md`). A licença vem do registro de dados abertos da AWS (`awslabs/open-data-registry`, `datasets/terrain-tiles.yaml`): o campo de licença aponta para o `attribution.md`, e o registro não traz cobrança por requisição nem exigência de conta.
- **Um aviso dos documentos.** O `use-service.md` diz que os endereços no S3 "are meant for efficient networking with EC2 resources only". O script baixa 25 tiles (1,1 MB) uma única vez e guarda em `data/terrain-tiles/`; o app nunca acessa esse endereço.
- **O que cobre o Rio.** SRTM em terra (30 m nominais; os documentos dizem que acima do zoom 12 o dado só é reamostrado) e ETOPO1 no mar. Os dois são de domínio público.
- **Atribuição** (texto dos documentos, também em `ASSETS.md`): "SRTM data courtesy of the U.S. Geological Survey" e "Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration". O ETOPO1 traz o aviso "Not to be used for navigation".

O que `tools/terrain-data.mjs` faz com os tiles:

1. Monta o mosaico e separa terra de água pelo tipo do valor.
2. Amostra a grade girada da região (513 × 513, uma amostra a cada 50 m).
3. Limpa o que é ruído: amostras de terra soltas no mar, furos de água de até 6 amostras, pontas de uma amostra só (havia uma de 99 m na beira d'água de Copacabana) e calombos de prédio alto no meio da planície.
4. Corrige os picos. O SRTM achata picos estreitos: o Pão de Açúcar vem com 306 m e o Corcovado com 639 m. Um fator local (1,29 num raio de 450 m; 1,11 num raio de 700 m) leva cada um à altura real, 396 m e 710 m. O topo do Pão de Açúcar é arredondado num raio de 120 m, para a malha mostrar um domo e não uma ponta. Os picos e os raios estão em `regions/rio.js`.
5. Alisa e rebaixa as planícies. O SRTM mede o topo dos prédios (Copacabana aparece com 20 a 30 m). Abaixo de 27 m a altura é alisada e reduzida a 40%, e a orla desce até o mar; acima de 45 m nada muda.
6. Grava o PNG de 16 bits: `src/terrain/regions/rio.height.png`, 170 kB.
7. Confere os pontos de controle de `regions/rio.js` no arquivo gravado e falha se algum não bater.

Os itens 3 a 5 mudam o dado de propósito: são a parte "estilizada". As montanhas fora dos dois picos corrigidos ficam como o SRTM as mede.

**Como regenerar:** `npm run terrain:data -- rio`. Com `--preview`, grava uma imagem de conferência em `.verification/terrain-rio.png`. Rodar de novo não baixa nada: os tiles ficam em cache.

## Zona jogável: a máscara dos lotes

`src/terrain/regions/rio.lots.json` é um arquivo de texto, feito para ser editado à mão:

```json
{
  "legend": { ".": "livre", "#": "bloqueado", "d": "decorativo" },
  "x0": -34,
  "z0": -20,
  "rows": ["####", "#..#", "#dd#", "####"]
}
```

- Cada caractere é um lote. `x0` e `z0` são o lote do primeiro caractere da primeira linha; as linhas descem para +Z (o mar) e as colunas vão para +X.
- **Livre:** constrói e anda. **Decorativo:** faz parte do platô, mas não recebe prédio (hoje é a orla, com palmeiras). **Bloqueado:** nem constrói nem anda. Fora da grade tudo é bloqueado.
- A máscara do Rio tem 72 × 36 lotes: 544 livres, 56 decorativos e 1.992 bloqueados. Morros, mar e a moldura da grade ficam bloqueados.
- Para mudar a zona jogável, troque os caracteres e recarregue a página. Um lote de morro marcado como livre passa a fazer parte do platô: o morro é aplainado ali.
- `npm run terrain:data -- rio --mask` recria a máscara a partir do relevo: a planície ligada à origem, sem pontas de um lote de largura; os lotes livres que encostam na água viram decorativos. `--mask=x0,z0,colunas,linhas` muda também o retângulo da grade. Sem `--mask`, o script não toca na máscara.

A mistura do platô com o relevo real tem 2 unidades do lado da terra (estreita, para os morros vizinhos não serem achatados) e 3 do lado da água, onde ela vira a faixa de areia que desce até o mar (`plateau.blend` e `plateau.shore`).

## Malha e estilo

- **Tolerância.** 0,05 unidade junto à zona jogável, mais 0,005 por unidade de distância; metade disso em volta dos marcos da região. Tirar um vértice que mudaria a linha da costa custa 0,25 a mais.
- **Tamanho das faces.** Catetos de até 2 unidades a menos de 24 unidades da zona jogável, crescendo 0,1 por unidade até 32. É o que dá facetas ao mar e às planícies.
- **Orçamento.** Com esses números a malha do Rio tem 32.777 triângulos. Se uma região passar de 60 mil, o limite de erro sobe sozinho até caber.
- **Cor por face**, na paleta fixa, com variação de ±3% entre faces. Inclinação e altitude são as reais, sem o exagero:

| Face | Regra | Cor |
|---|---|---|
| Mar | os três vértices no nível do mar | `#3FB8AF`, em três faixas pela distância da terra (até 2 unidades, até 6, além); as duas primeiras puxam para o creme |
| Platô | lote livre ou decorativo | grama clara com 30% de creme; areia nos decorativos; um tom por lote, alternado de leve |
| Pedra | inclinação de 40° ou mais; ou 24° ou mais acima de 520 m | `#A9A9B8`; mais clara acima de 430 m |
| Areia | até 130 m da água e até 9 m de altitude | `#F2D7A6` |
| Terra | inclinação de 36,5° a 40° | `#B07A4F` |
| Grama | o resto, em três faixas | clara `#7BC67E` (abaixo de 28 m e de 7°), média, escura `#4E9F5D` |

- **Vegetação.** Árvores nas faces de grama média e escura até 150 unidades da zona jogável; palmeiras nas faces de areia até 70 unidades e nos lotes decorativos. Cada uma nasce num ponto dentro de uma face, então fica exatamente sobre a malha. O sorteio é determinístico: a mesma vegetação em toda visita.
- **Luz.** Uma direcional e um hemisfério, sem sombras e sem tone mapping: uma face plana recebe 100% da cor da paleta.

## Câmera e borda do cenário

Limites (em `camera.js`, sobrescritos por `region.camera`): campo de visão de 35°, distância de 12 a 90 unidades, inclinação de 0,2 rad a 78° a partir da vertical, câmera pelo menos 1,2 unidade acima do terreno. O alvo fica sempre sobre um lote livre ou decorativo: ao sair, volta para o ponto jogável mais próximo.

Com 78° de inclinação o horizonte e o céu aparecem, e é assim que os morros ficam ao fundo. A borda não aparece porque:

1. `createTerrainData` lista as **paredes**: os trechos da borda da grade onde há terra, com a altura do terreno ali (13 trechos no Rio).
2. A cada quadro, `edgeDepth` recorta essas paredes pelo campo de visão e devolve a menor profundidade (a mesma medida que o three usa na névoa).
3. A névoa termina nessa distância menos 0,5, com teto de 300 unidades, e começa a 55% dela. Além do fim, tudo tem exatamente a cor do céu.
4. Onde a borda é mar, o mar continua por mais 1.200 unidades, quatro vezes o teto da névoa.

`tests/terrain-scene.test.mjs` percorre 9.504 poses (11 alvos, inclusive dois fora da zona jogável, 24 giros, 3 inclinações, 3 distâncias e telas de 0,45 a 2,4 de proporção). Em cada uma, confere os vértices de terra da borda que caem no campo de visão: 920.943 pontos, nenhum antes do fim da névoa. No pior caso a névoa termina a 167 unidades (8,3 km); o Corcovado fica a 69 da origem.

## Prédios nos lotes

`seatBuilding(terrain, objeto, lote, tamanho, { rotation, fit })`:

- devolve `null` se a área não é toda de lotes livres;
- cria um disco de 10 lados (raio de 0,48 por lote, 0,06 de altura) na altura de `getHeightAt` no centro da área;
- põe o prédio sobre o disco, girado em quartos de volta. Com `fit` (padrão), ajusta a escala para a base ocupar 90% da área e centra o modelo com o fundo no disco: a mesma regra de `CityWorld.loadModel`.

Os GLB entram pelo carregador do projeto (`loadGlb` em `src/tres/glbLoader.js`: `GLTFLoader` + Meshopt, com `applyGlbStyle`). O projeto não usa KTX2.

## Medições (12/11/2026)

Medidas no Chromium de teste, com renderização por software. Servem para comparar versões, não para prever um celular.

| O quê | Valor |
|---|---|
| Tiles baixados, uma vez | 25 tiles, 1,1 MB |
| Mapa de alturas | 513 × 513 amostras, 170 kB |
| Terreno | 32.777 triângulos (orçamento: 60.000), 1 draw, com o mar |
| Vegetação | 1.955 árvores de 24 triângulos e 259 palmeiras de 32: 55.208 triângulos em 2 draws |
| Cena sem prédios | 87.985 triângulos em 3 draws |
| Memória da malha do terreno | 1,13 MB de posições e 0,28 MB de cores |
| Montagem do terreno, na thread principal | 0,2 s; 0,5 s com a CPU 4× mais lenta |
| Custo por quadro, tela de 412 × 915 | 11,6 a 13,0 quadros/s; 0,5 a 0,9 ms de CPU por quadro |
| Mapa-mundo na mesma máquina, para comparar (`docs/3D-DECLARATIVO.md`) | 5,6 a 15,6 quadros/s |
| Página de teste | 865 kB de JavaScript (240 kB com gzip), com cópia própria do three, do Vue e do TresJS |
| Páginas de produção | os 14 arquivos de `dist/assets` do build principal são idênticos aos de antes |

Não medido: nenhum aparelho com GPU de verdade.

## Como criar outra região

1. Copie `src/terrain/regions/rio.js` para `<id>.js` e ajuste: `origin` (o ponto que vira o (0, 0) do mundo), `bearing` (para onde aponta o fundo do mapa), `metersPerUnit`, `exaggeration`, `peaks`, `landmarks` e `controlPoints`.
2. Em `heightmap`, o lado é 2^n + 1 (257 ou 513) e `center` precisa deixar as amostras nos cantos dos lotes: com `spacing: 1`, as duas coordenadas terminam em ,5. O módulo recusa a região se isso não valer.
3. Crie `<id>.lots.json` com uma máscara provisória (`{ "x0": -20, "z0": -20, "rows": ["#"] }`): a configuração importa esse arquivo.
4. Rode `npm run terrain:data -- <id> --mask=x0,z0,colunas,linhas --preview`, olhe `.verification/terrain-<id>.png` e ajuste a origem e o retângulo até a zona jogável cair onde você quer.
5. Edite a máscara à mão.
6. Troque a região na página de teste e copie os testes do Rio. Rode o da câmera: ele diz se a grade é grande o bastante para os limites escolhidos.

**Região inventada (a Ilha Inicial):** não precisa do script. Pinte um PNG de 16 bits em tons de cinza, quadrado, com 257 ou 513 de lado (`valor = metros × 20`; preto = água), salve como `<id>.height.png` e escreva a máscara. Sem `peaks` nem `controlPoints`.

## O que falta

- **Zona jogável real na cidade.** O cenário já está ligado, mas a cidade segue com a grade própria. Usar a máscara do Rio e fazer `worker/city.js` validar por ela é o passo que falta. A grade da cidade tem 33 × 33 lotes e a máscara do Rio tem 72 × 36, e cidades já salvas podem ter prédios em lotes que a máscara bloqueia: é uma decisão de jogo, não só de código.
- **Worker.** A montagem do terreno roda na thread principal (0,5 s num aparelho 4× mais lento). `terrainData.js` não depende do three e pode ir para um worker.
- **Aparelho real.** A fluidez no celular não foi medida. A página de teste publicada serve para isso.
- **Navegadores antigos.** O leitor de PNG usa `DecompressionStream` (Chrome 80, Firefox 113, Safari 16.4). Abaixo disso o terreno não carrega.
- **Sombras.** O terreno não projeta nem recebe sombra. A cidade de hoje usa sombras nos prédios.

## Luz compartilhada (13/11/2026)

A luz, o céu e a névoa do Rio ficam em `src/terrain/lighting.js` (`TERRAIN`): a página de teste e a cidade leem a mesma tabela, sem tone mapping. Na cidade os prédios (GLB em Lambert) ganham sombra de contato e um degradê de base até a cor do platô (`ground`, a mesma conta de `terrainData.js` com `plateau.tint = -0,3`); se mudar o `tint` do platô, mude `ground` junto (há teste). Antes a cidade usava ACES, sombras projetadas, `MeshStandardMaterial` e uma `PointLight` por prédio ativo, o que deixava o terreno e os prédios com cara de duas peças.

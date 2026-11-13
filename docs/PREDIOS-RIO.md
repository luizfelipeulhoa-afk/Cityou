# Prédios do Rio com modelo 3D próprio

Nove prédios de exemplo que a pessoa pode construir na cidade do Rio (`cristo-redentor`). Os modelos foram
fornecidos pelo responsável do projeto (exportados do Tripo) e reduzidos aqui; ninguém gerou nada com créditos.

| id | nome | área | custo | triângulos |
|---|---|---|---|---|
| `rio-feira-barraca` | Barraca de feira | 2 × 2 | 20 | 6.000 |
| `rio-laje` | Casa da laje | 2 × 2 | 25 | 6.000 |
| `rio-quiosque-coco` | Quiosque de coco | 2 × 2 | 25 | 6.000 |
| `rio-academia` | Academia ao ar livre | 2 × 2 | 30 | 6.000 |
| `rio-salva-vidas` | Posto salva-vidas | 2 × 2 | 30 | 6.000 |
| `rio-bonde` | Ponto do bonde | 2 × 2 | 35 | 6.000 |
| `rio-casarao` | Casarão colonial | 3 × 3 | 50 | 8.000 |
| `rio-igreja` | Igrejinha da vila | 3 × 3 | 55 | 7.000 |
| `rio-edificio-deco` | Edifício Art Déco | 3 × 3 | 60 | 6.000 |

Os custos e as áreas são propostas (como os demais números de `docs/GAME-DESIGN.md`). Nenhum tem destino nem
interior: são prédios de cenário e de exemplo, sem ligação com tarefas ou hábitos.

## Onde está cada coisa

- Catálogo: `shared/game/city-layout.js` (`regionalCatalog['cristo-redentor']`, ajudante `rioModel`). O campo `model`
  aponta para `/models/rio/<id>.glb` e `preview` para `/previews/<id>.png` (miniatura do menu Construir,
  `thumbnail()` em `src/CityApp.vue`). A validação do servidor é a de sempre (`worker/city.js`): lote livre, junto a
  uma rua ligada à entrada, sem água nem encosta.
- Modelos: `public-fifones/models/rio/<id>.glb`. Miniaturas: `public-fifones/previews/<id>.png` (320 × 288).
- A cidade os carrega como qualquer GLB do catálogo (`CityWorld.loadModel`): faces planas e superfície fosca
  (`applyGlbStyle`), base ajustada a 90% da área, fundo em y = 0, sombras ligadas.
- Cada modelo traz o seu **disco de calçadão** (a base redonda). Por isso eles não levam o disco de 10 lados de
  `seatBuilding`, que é da página de teste do terreno.

## Orçamento

Os arquivos do Tripo chegaram com 175 a 190 mil triângulos, textura JPEG grande e 6,5 a 7,4 MB cada (as duas
primeiras remessas tinham um arquivo repetido: `2288ea82…_1` e `52fc6deb…_2` são idênticos, entrou um só). Depois da
redução: 6 a 8 mil triângulos, textura WebP de 1024 px, 180 a 400 KB por arquivo, 2,4 MB no total.

- Custo na cena: cerca de 6,5 mil triângulos por prédio construído. Nove prédios somam cerca de 58 mil, em cima dos
  64 mil do terreno (medido: 121.821 triângulos e 58 draws com os nove construídos, software de renderização).
- `tests/city-models.test.mjs` (no `npm test`) trava o orçamento: no máximo 8.000 triângulos e 500 KB por arquivo,
  sem Draco nem meshopt (o carregador da cidade não tem decodificador), uma textura só, base em y = 0 e `height` do
  catálogo igual à altura que o modelo tem ao ocupar 90% da área (sem folga acima de 0,3).
- Com muitos prédios iguais, vale pensar em `InstancedMesh` ou em nível de detalhe; hoje cada construção é uma
  malha própria.

## Como reduzir um GLB do Tripo

```bash
node tools/optimize-city-models.mjs entrada.glb public-fifones/models/rio/rio-novo.glb --tris 6000
```

`tools/optimize-city-models.mjs` usa o redutor próprio `tools/lib/simplify-textured.mjs` (colapso de arestas por
quádricas, sem dependências) e o `sharp` (já vem com o wrangler) para a textura. Não baixa nada da internet, ao
contrário de `tools/optimize-world-models.mjs`, que roda o `@gltf-transform/cli` pelo `npx`.

Como ele trata a textura: a decisão de colapsar é tomada na malha soldada por posição (as costuras não viram
buracos) e cada canto de triângulo guarda o seu UV. Ao colapsar a aresta u → v, o canto de u recebe o UV de v na
mesma ilha de textura. Se u fica numa junção de ilhas e uma ilha não tem esse par, o canto mantém o UV antigo e a
aresta paga uma multa, então esses colapsos ficam para o fim. São rejeitados os colapsos que invertem um triângulo no
espaço ou na textura e os que deixam a malha com estrangulamentos (não manifold). A posição final é sempre a de um dos extremos.

Escolha da meta (testada olhando a renderização lado a lado com o original): 4 mil triângulos já borra janelas e
vitrais; 6 mil é indistinguível do original na distância da cidade; o casarão e a igrejinha, com mais detalhe fino,
ficaram com 8 e 7 mil. O arquivo sai sem normais (o material de faces planas as calcula) e sem compressão de malha.

## Como acrescentar outro prédio

1. Reduza o GLB como acima, com frente em +Z, base em y = 0 e o modelo centrado (os do Tripo já vêm assim).
2. Acrescente a linha em `regionalCatalog['cristo-redentor']` com `rioModel('<id>')`. `height` = altura natural do
   modelo × 0,9 × `width` ÷ maior lado da base (o teste confere).
3. Gere a miniatura com o Worker local no ar (`npm run dev:worker`, porta 8787):
   `node tools/catalog-previews.mjs http://127.0.0.1:8787 rio-`
   (`CITYOU_CHROME=/opt/pw-browsers/chromium` na nuvem). O segundo argumento filtra por prefixo de id e, com ele,
   só entram os itens que têm `model`.
4. `npm test` e `npm run test:worker`.

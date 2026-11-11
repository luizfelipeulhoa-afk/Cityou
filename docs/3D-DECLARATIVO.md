# 3D declarativo: migração para TresJS

Hoje o 3D do app é imperativo: `src/world/WorldGlobe.js` e `src/world/SpaceMarker.js` (mapa-mundo) e `src/fifones/CityWorld.js` (cidade) criam e atualizam os objetos do three à mão. Este guia registra a decisão de descrever a cena em componentes Vue, o que já está montado e a ordem da migração.

## Decisão: TresJS, e não React Three Fiber

| | React Three Fiber | TresJS |
|---|---|---|
| Framework | React 19. Exige reescrever `App.vue`, `CityApp.vue`, `WorldApp.vue`, os componentes e o que usa Pinia, ou manter React e Vue na mesma página | Vue 3, que o app já usa. `<script setup>`, Pinia e GSAP continuam como estão |
| three 0.172 fixado | aceito (`@react-three/fiber` 9.8.2 pede `three >= 0.156`) | aceito (`@tresjs/core` 5.10.1 pede `three >= 0.133` e `vue >= 3.4`) |
| Migração em partes | não: a tela inteira troca de framework de uma vez | sim: `<primitive :object>` monta um objeto three que já existe, então cada classe entra na cena declarativa antes de ser reescrita |
| Ecossistema | o maior (drei, postprocessing, rapier, gltfjsx) e com mais exemplos | menor (cientos, post-processing). O que faltar se escreve em three puro, como hoje |
| Peso | `react` e `react-dom` entram no pacote, além do Vue enquanto os dois conviverem | 55 kB minificados (18 kB com gzip) a mais na página que usar, medidos sobre o three e o Vue que o app já carrega |

Recomendação: **TresJS**. O ganho do React Three Fiber é o ecossistema, e ele não paga a troca de framework de um app que já funciona em Vue. O TresJS dá o mesmo modelo declarativo, aceita o three fixado e permite migrar um arquivo por vez, medindo cada passo.

## O que já existe (fase 0)

- `@tresjs/core` 5.10.1, com versão exata no `package.json`. O three continua em 0.172.0.
- `vite.config.js` passa as opções de template do TresJS ao plugin do Vue: tags `Tres*` e `primitive` são elementos da cena, não componentes. Não dê a um componente Vue um nome que comece com `Tres`.
- `src/tres/`:
  - `glbMaterial.js`: a regra visual dos GLB (abaixo). Sem dependências.
  - `glbLoader.js`: um carregador só (`GLTFLoader` + Meshopt, baixados no primeiro uso), `loadGlb(url)` e `disposeGlb(root)`.
  - `useGlb.js`: composable que carrega o GLB de um endereço reativo, troca quando ele muda e libera ao sair.
  - `GlbModel.vue`: `<GlbModel url="…" />`. Enquanto o arquivo não chega, mostra o slot (o monumento em código, por exemplo).
  - `SpaceMarkerNode.vue`: o `SpaceMarker` de hoje dentro de uma cena TresJS. Estado por props (`desbloqueado`, `concluido`, `hovered`, `model-url`), atualização por quadro em `useLoop`, liberação em `onUnmounted`.
  - `TresLab.vue`: laboratório com as duas peças, em `/tres-lab.html` no `npm run dev`. Não é entrada do build e não vai para produção.
- `npm run test:tres` (`tools/tres-lab-check.mjs`): abre o laboratório no navegador, confere que não há erro, que o GLB chegou com a regra aplicada e que a cena foi desenhada. Guarda as imagens em `.verification/`.

As três páginas de produção ainda não importam o TresJS: o pacote delas só mudou pela regra dos GLB.

## Regra visual dos GLB

Todo GLB passa por `applyGlbStyle()` (`src/tres/glbMaterial.js`) logo depois de carregado:

- `material.flatShading = true` e `material.needsUpdate = true`;
- `metalness = 0` e `roughness = 1`, e os mapas de metal e rugosidade saem do material. Com o mapa, o valor final seria o fator vezes a textura, e a rugosidade continuaria vindo do arquivo.

Onde vale:

| Carga | Arquivo | Efeito |
|---|---|---|
| Monumentos do mapa-mundo | `SpaceMarker.loadModel` | Só as faces planas. O material vira `MeshLambertMaterial`, que herda o `flatShading` e não tem metal nem rugosidade |
| Monumento da cidade regional | `CityWorld.loadLandmark` | Faces planas, sem metal, rugosidade 1 |
| Prédios do catálogo (`/models/*.glb`) | `CityWorld.loadModel` | Faces planas, sem metal, rugosidade 1. Esses arquivos traziam textura de metal e rugosidade (fator 1 nos dois); ela deixa de ser usada |
| Componentes novos | `loadGlb` / `useGlb` / `GlbModel` | A mesma regra |

O mapa de normais e o emissivo continuam valendo. Um GLB novo não precisa de mapa de metal nem de rugosidade (ver `docs/TRIPO-PROMPTS.md`, PBR desligado).

### Medições da fase 0 (11/11/2026)

"Antes" é o commit `fb682b4`; "depois" tem a regra dos GLB. As duas versões foram medidas alternadas (antes, depois, antes, depois), cada rodada com a mediana de 3 execuções, em renderização por software. Servem para comparar as duas versões, não para prever o fps de um celular.

Custo por quadro do mapa-mundo (`npm run perf:world-frame`), em quadros por segundo nas duas rodadas:

| Enquadramento | Antes | Depois | Draws e triângulos |
|---|---|---|---|
| Visão geral | 5,6 e 6,0 | 6,4 e 6,6 | 44 e 150.955, iguais |
| Foco no Taj Mahal | 9,0 e 9,6 | 10,0 e 10,0 | 14 e 69.145, iguais |
| Foco no Cristo | 14,2 e 15,6 | 15,2 e 15,4 | 10 e 36.539, iguais |
| Foco na Ilha | 11,0 e 12,2 | 11,8 e 11,6 | 12 e 55.136, iguais |

O tempo de CPU por quadro ficou entre 0,8 e 1,6 ms nas duas versões.

Abertura do mapa-mundo (`npm run perf:world`), nas duas rodadas:

| Medida | Antes | Depois |
|---|---|---|
| Primeiro quadro | 2.499 e 2.557 ms | 2.589 e 2.440 ms |
| Globo completo | 4.357 e 4.562 ms | 4.840 e 4.187 ms |
| Bloqueio da thread principal | 807 e 1.039 ms | 1.135 e 792 ms |
| JavaScript transferido na abertura | 254 KB | 255 KB |
| Requisições | 13 | 13 |

Nenhuma diferença passa da variação entre uma rodada e outra da mesma versão. No pacote de produção, o trecho compartilhado cresceu 0,36 kB (692,64 para 693,00 kB) e o da cidade 0,04 kB; o do mapa-mundo não mudou.

Não medido: o custo por quadro da cidade (não há ferramenta para isso) e qualquer aparelho com GPU de verdade.

## Ordem da migração

Cada fase entra atrás de um parâmetro de endereço (`?tres=1`) e só vira o padrão quando os números batem com os de hoje.

1. **Mapa-mundo, dono do canvas.** `WorldMap.vue` passa a renderizar `<TresCanvas>` com as mesmas opções do renderizador atual. O `WorldGlobe` deixa de criar renderizador, cena e câmera e recebe os do TresJS; o `tick` dele roda em `useLoop().onBeforeRender`. Nada visual muda.
2. **Marcadores como componentes.** `<SpaceMarkerNode v-for>` no lugar dos marcadores criados dentro do `WorldGlobe`, com o estado vindo do `progress` por props. A fila de animações (`playUnlock`, `playComplete`) chama o marcador pela referência do componente.
3. **`SpaceMarker` em peças.** Modelo (`GlbModel` com o monumento em código no slot), anel de chão, cadeado, estrela e feixe viram componentes pequenos. O ajuste de shader (`patchMaterial`) continua sendo uma função.
4. **Cidade.** A mesma sequência no `CityWorld`: primeiro o canvas, depois as construções como `<CityBuilding v-for>` com chave no `placement.id`.

Fica imperativo, montado com `<primitive>`: geometria e shader do globo, o worker do terreno, as malhas instanciadas (lotes, ruas, pontos do caminho), as partículas e as linhas do tempo do GSAP. São os trechos ajustados para caber no quadro, e um componente por objeto só acrescentaria custo.

## Regras para quem continuar

- **Objeto do three nunca reativo.** Use `shallowRef` ou `markRaw`. Um `ref` comum faz o Vue percorrer a malha inteira.
- **Nada reativo por quadro.** O que muda a cada quadro vai direto para o objeto ou para o uniform, dentro de `useLoop().onBeforeRender`. Props servem para estado que muda por evento (desbloqueou, concluiu, selecionou).
- **Desenho sob demanda.** O mapa hoje desenha metade dos quadros quando ocioso e nenhum fora da tela. No `<TresCanvas>`, use `render-mode="on-demand"` e chame `invalidate()` quando algo mudar (inclusive no `onUpdate` dos tweens do GSAP), ou `render-mode="manual"` com `advance()` no tick atual.
- **Mesmas opções do renderizador.** O padrão do `<TresCanvas>` é tone mapping ACES. Passe as de hoje: no mapa, `NeutralToneMapping` com exposição 1,05, sem sombras e com alfa; na cidade, ACES com 0,95 e sombras.
- **`<primitive>` não libera nada.** Quem cria o objeto libera geometria, material e textura em `onUnmounted`.
- **Limites de desempenho de sempre**: uma luz direcional e um hemisfério, sem sombras no mapa, modelos opacos, globo em um draw call. Meça antes e depois de cada fase com `npm run perf:world` e `npm run perf:world-frame`, alternando as duas versões.
- **API do TresJS**: confira em `node_modules/@tresjs/core/dist/*.d.ts` antes de copiar um exemplo. A versão 5 não tem mais `useRenderLoop`: o laço por quadro é `useLoop()`, e `invalidate()` e `advance()` vêm de `useTres()`.

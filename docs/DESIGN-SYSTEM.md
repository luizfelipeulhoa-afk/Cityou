# Design system Cityou

Este documento junta as cores, a tipografia e os prompts de imagem que o Cityou já usa, para que cada tela e cada prédio saiam da mesma mão. Ele não cria cores novas: registra as que já estão no código e nas imagens aprovadas, e marca as que ainda não batem. Uma cor nova só entra aqui depois de aparecer numa tela ou numa imagem aprovada.

Fontes:
- Mapa-mundo: `src/world/terrainCore.js` (terreno e mar) e `src/components/WorldMapHud.vue` (controles).
- Painel pessoal, escuro: `src/personal/personal.css`.
- Cidade e atividades, claro: `src/fifones/style.css`.
- Imagens e 3D dos prédios: o guia de geração abaixo.

## Cores do mapa-mundo

A paleta do terreno está em `PALETTE` (`src/world/terrainCore.js`). O mar profundo é a cor base do oceano.

| Nome no código | Hex | Uso |
| --- | --- | --- |
| snow | #f4f8ff | Gelo e topo de montanha |
| rock / rockDark | #a99f98 / #8f8a96 | Rochas e encostas |
| desert / desert2 | #f2d08d / #e8bb78 | Deserto |
| steppe | #d9d08a | Estepe |
| rainforest | #3fa65a | Floresta tropical |
| tropical | #6cc75c | Tropical |
| savanna | #b8d064 | Savana |
| temperate | #80d06e | Temperado |
| boreal | #4ea477 | Boreal |
| tundra | #b5c8a0 | Tundra |
| beach | #f7e4ab | Praia |
| lagoon / shallow / mid | #8ef4e2 / #56dad4 / #37b8d8 | Lagoa, água rasa, mar médio |
| deep / deeper | #2793d4 / #1f76c6 | Mar aberto |
| seaIce | #e4f3ff | Gelo marinho |

Destaques que não são bioma: verde vivo #5fdc6e, mar claro #5ff2e6 e areia ensolarada #fff0b8. Em 10% das faces entram flores pastel: #ff7eb0, #ffd166, #ffffff, #c792ff, #ff9f6b.

Cada espaço tem a sua cor em `src/world/worldSpaces.js`, por exemplo Chichén Itzá #ffb347, Coliseu #ff8a7a e Petra #ff7eb3.

## Cores das telas

O Cityou tem dois mundos visuais. Cada um tem os seus tokens em `:root`.

**Cidade e atividades, claro** (`src/fifones/style.css`):

| Token | Hex | Uso |
| --- | --- | --- |
| sand | #f6efdf | Superfícies claras |
| ink | #183b3e | Texto |
| teal | #148d91 | Ação principal |
| coral | #ea7651 | Alerta e destaque |
| muted | #748781 | Texto secundário |
| page | #a7d0cf | Fundo da página |

**Painel pessoal, escuro** (`src/personal/personal.css`):

| Token | Hex | Uso |
| --- | --- | --- |
| bg | #12141c | Fundo |
| surface | #1c1f2a | Cartões |
| text / muted | #eeeef4 / #8b90a5 | Texto e texto secundário |
| accent | #bcafff | Lilás, ação principal |
| mint | #a1ddc5 | Concluído, cidade |
| peach | #e8b5a0 | Atenção suave |
| blue | #a8c5f2 | Informação |

**Controles do mapa-mundo** (`WorldMapHud.vue`): destaque #ffd166, texto #f4f7ff, placa rgba(11, 20, 48, 0.9) com borda branca de 16%. Toque de 44 px, raio de 13 px.

## Estilo das imagens e dos 3D dos prédios

Todo prédio sai de três passos: vista principal, folha de 4 vistas e recorte. Os blocos abaixo ficam iguais em todos os prompts, para o estilo não derivar.

**Paleta das imagens** (cores fixas do bloco de estilo): grama #7BC67E, verde escuro #4E9F5D, areia #F2D7A6, mar-verde #3FB8AF, céu #8FD3F4, creme #FFF4E0, terracota #D9644A, madeira #B07A4F, pedra #A9A9B8, amarelo sol #FFD25A, coral #FF7F6B, azul-marinho #2E3A59.

**Bloco de estilo** (sempre):

```
Stylized low-poly 3D game asset for a mobile game. Faceted, flat-shaded polygons with visible planar faces, chunky toy-diorama proportions, slightly oversized roof and doorway, simple bold readable silhouette. No text, no letters, no signs, no thin wires, no tiny details. Limited palette only: grass green #7BC67E, dark green #4E9F5D, sand #F2D7A6, sea teal #3FB8AF, sky blue #8FD3F4, cream #FFF4E0, terracotta #D9644A, warm wood brown #B07A4F, stone gray #A9A9B8, sunny yellow #FFD25A, coral #FF7F6B, deep navy #2E3A59. The building stands on a thin round 10-sided low-poly base disk, [BASE], diameter just larger than the building footprint. Soft, even, neutral studio lighting, no cast shadows, no specular highlights, no glow, no ambient occlusion, matte surfaces. Pure white seamless background, single object, fully visible and centered with generous margin.
```

[BASE]: `flat grass-green top with brown earth sides` (padrão) ou `flat sand top with brown earth sides` (peças de praia).

**Bloco de materiais da ilha** (só nos prédios da ilha):

```
Built ONLY from materials found on a small tropical island: rough palm-tree logs, bamboo poles, woven palm-leaf thatch, coconut-fiber rope lashings, rounded gray volcanic stones, driftwood planks, seashells and coral pieces as decoration. Nothing industrial: no metal, no glass, no bricks, no concrete, no nails, no plastic.
```

**Bloco de autenticidade** (só nos pontos turísticos), com [COR LOCAL] trocada em cada um:

```
Faithful to the real landmark: recognizable silhouette, correct proportions and signature features, simplified into low-poly. Use the colors of its real materials; one extra local color is allowed: [COR LOCAL].
```

**Final da vista principal** (no fim do prompt do passo 1):

```
Three-quarter isometric view, camera 30 degrees above, front-right corner facing the viewer.
```

**Template de 4 vistas** (passo 2, com a imagem aprovada anexada, junto com o bloco de estilo):

```
Use the attached image as the exact design reference. Create a 2x2 orthographic turnaround sheet of the SAME building, with identical shapes, colors, proportions and base in every panel. Top-left: front view. Top-right: right side view. Bottom-left: back view. Bottom-right: left side view. Same camera height in all panels (about 10 degrees above the base), orthographic projection, no perspective distortion. Every panel the same size, white background, object centered with the same margin and the same scale, thin white gap between panels. No labels, no text, no arrows, no grid lines.
```

Passos:
- **Vista principal:** bloco de estilo, bloco de materiais (se for da ilha) e o assunto, com a vista final. Proporção 1:1, 2K. Gerar variações até gostar.
- **Folha de 4 vistas:** anexar a vista aprovada e o template. Proporção 1:1, 4K.
- **Recorte:** cortar a folha em 4 imagens de cerca de 2048 px (frente, direita, trás e esquerda) e conferir a vista de trás antes de converter.

**3D (Tripo H3.1 Multiview):** texture ligado, pbr ligado (sem efeito no globo, ver Decisões), texture_alignment original_image, geometry_quality standard, quad e auto_size desligados. `face_limit` por prédio: cabana 4.000, farol 5.000, píer 5.000, pirâmides 6.000, Cristo 10.000, Taj Mahal 12.000, Estátua da Liberdade 12.000. Os monumentos já no mapa têm limites próprios em `docs/TRIPO-PROMPTS.md`.

**Compressão:** `npx @gltf-transform/cli optimize entrada.glb saida.glb --compress meshopt --texture-compress webp --texture-size 1024` (512 nos prédios pequenos).

## Tipografia, forma e toque

Duas famílias de fonte, com fallback de sistema:

- **Fifones** (texto): `/fonts/fifones-body.woff2`, pesos 100 a 900.
- **FifonesDisplay** (títulos e marca): `/fonts/fifones-display.woff2`, fallback Georgia. O painel pessoal usa itálico na marca.
- **Figtree** (mapa-mundo, `WorldApp.vue`): fallback de sistema.

Forma: cartões com raio de 12 a 15 px, campos com 10 px, botões com raio de 9 a 13 px. Toque mínimo de 44 px nos controles do mapa.

Sombra padrão dos controles: `0 8px 20px rgba(4, 10, 30, 0.35)`. Foco visível: contorno de 2 px, na cor de destaque da tela.

Movimento reduzido: toda animação de entrada e de pulso respeita `prefers-reduced-motion`, com transição zerada.

## Topografia do globo

O relevo é gerado em `src/world/terrainCore.js`, não desenhado à mão. Quatro regras:

1. **Assento plano.** Cada monumento assenta num disco do tamanho da base medida (`measureBase`; raio do marcador 0,13 vezes a escala do espaço). O relevo em volta é puxado para o plano do disco.
2. **Zonas em múltiplos da meia base.** Terra garantida sob a base inteira (1,45), disco plano (1,5), volta do relevo natural (2,4). Na ilha: lagoa (0,71), água rasa (1,32) e mar aberto (1,39).
3. **Sem água sob o monumento.** A base inteira fica em terra, mesmo à beira-mar. Por isso o litoral cresce um pouco em volta de Rio, Yucatán e Roma.
4. **Biomas por região.** Deserto, estepe, floresta, boreal, tundra e gelo vêm de `src/world/continents.js`. A praia é uma faixa de areia ensolarada (#fff0b8) misturada na borda.

A sombra de contato escurece a base do modelo junto ao chão. O anel de chão é um plano só, do tamanho da base.

## Movimento e desempenho

Os limites abaixo valem para qualquer tela nova. Medir antes e depois, alternando as duas versões, não estimar.

- Iluminação: uma luz direcional mais um hemisfério, sem sombras projetadas e sem mapa de ambiente.
- Modelos opacos. O globo é um draw call.
- Alvo de 60 fps em celular médio.
- Medição: `npm run perf:world` (abertura) e `npm run perf:world-frame` (custo por quadro).
- Animação: só propriedades de composição (transform e opacidade) nas transições da interface. Entrada e saída de câmera usam `fly()`, com duração curta (0,2 s) na seleção.

Medidas do PR #13 em render por software (412 x 915): visão geral de 5,0 para 7,0 fps; foco no Taj Mahal de 7,6 para 10,6 fps. Em aparelho real, ainda não medido.

## Decisões em aberto

- [ ] **Uma paleta ou duas?** As cores das imagens (#7BC67E, #FF7F6B, #FFD25A) são parecidas, mas não iguais, às do jogo (#80d06e, #ea7651, #ffd166). Proposta: alinhar as imagens às cores do jogo na próxima rodada de prompts.
- [ ] **PBR nos GLB.** O prompt pede pbr ligado, mas o globo ignora mapas de metal e rugosidade. Proposta: desligar pbr e economizar a textura.
- [ ] **flatShading.** O carregamento não força faces facetadas. Se um GLB novo vier com normais suaves, ajustar `SpaceMarker.js` (e `CityWorld.js` para a cidade).
- [ ] **Famílias de fonte.** A licença de Fifones e FifonesDisplay não está documentada no repositório.
- [ ] **Prédios da ilha.** Farol, cabana e píer ainda não existem no catálogo da cidade.

Mudanças neste sistema: editar este arquivo por pull request. A versão compartilhada no Claude da empresa (Claude Docs, "Design system Cityou") tem o mesmo conteúdo; as duas precisam ser mantidas juntas.

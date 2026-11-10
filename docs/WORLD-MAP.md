# Mapa-mundo do BuildU

Globo low poly (Vue 3 + Three.js + GSAP) que serve de mapa de progresso. São 8 espaços que acendem em sequência: a ilha inicial (tutorial) e sete maravilhas. Não depende do backend.

## Rodar

```bash
npm ci
npm run dev
```

Abra http://127.0.0.1:5177/world.html. Para abrir já com o modo debug, use http://127.0.0.1:5177/world.html?debug=1. A tecla **D** abre e fecha o painel.

Build de produção: `npm run build`. Com o backend (`python -m backend`), a página fica em http://127.0.0.1:8766/world.html.

Testes: `npm test` (progresso, lat/lon, terra/mar, geometria do globo).

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `src/world/WorldGlobe.js` | Cena: renderer, câmera, OrbitControls (sem pan, zoom limitado, inclinação com o zoom), globo com shader (ondas, florescer, borda atmosférica), nuvens, atmosfera em fresnel, estrelas, caminho pontilhado, raycast, fila de animações GSAP. |
| `src/world/terrain.js` | Gera o globo: icosaedro subdividido, terra/mar por polígonos, relevo, biomas, cor por face e a cor "florescida". |
| `src/world/continents.js` | Contornos simplificados dos continentes, mares interiores, cordilheiras e zonas de bioma (em lon/lat). |
| `src/world/geo.js` | `latLonToVector3(lat, lon, raio)` e a orientação na superfície (`surfaceQuaternion`). |
| `src/world/worldSpaces.js` | Dados dos 8 espaços `{ id, nome, lat, lon, glbPath, desbloqueado, concluido, ... }`. |
| `src/world/SpaceMarker.js` | Marcador: carrega o GLB (ou placeholder), normaliza a escala e cuida dos estados e animações de cada espaço. |
| `src/world/progress.js` | Progresso em `localStorage` (`unlock`, `complete`, `reset`, mais funções puras). |
| `src/components/WorldMap.vue` | Componente: monta a cena, recebe o progresso por props, emite eventos e tem o painel de debug. |
| `src/WorldApp.vue`, `world.html` | Página de demonstração que liga tudo e simula "concluir fase". |

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

- **Props**: `progress` (`{ desbloqueados, concluidos }`), `spaces` (opcional, padrão `WORLD_SPACES`), `debug` (abre o painel).
- **Eventos**: `open-world` (id, depois que a câmera foca um espaço desbloqueado), `locked` (`{ id, previousId }`), `update:progress` (emitido pelo debug), `ready`.
- **Métodos** (via `ref`): `focusSpace(id)`, `resetView()`.

As animações saem da diferença entre o progresso anterior e o novo, venha a mudança do debug, do backend ou de `completeSpace`. Concluir N toca a estrela e o florescer em N, depois o desbloqueio de N+1 (feixe de luz, partículas, câmera girando até lá).

## Modelos para gerar no Tripo

Salve em `public-fifones/models/world/` (servido em `/models/world/`). Nome do arquivo = `id` do espaço.

| # | Arquivo | O que modelar | Triângulos (máx.) |
| --- | --- | --- | --- |
| 1 | `ilha-inicial.glb` | Ilhota de areia clara com 2–3 coqueiros e pedras, sobre um disco/hexágono raso de água turquesa | 6.000 |
| 2 | `cristo-redentor.glb` | Estátua de braços abertos sobre o morro do Corcovado (morro verde, pedestal) | 8.000 |
| 3 | `machu-picchu.glb` | Terraços em degraus, ruínas de pedra e o pico Huayna Picchu ao fundo | 10.000 |
| 4 | `chichen-itza.glb` | Pirâmide El Castillo (degraus, escadarias, templo no topo) num gramado | 6.000 |
| 5 | `coliseu.glb` | Anfiteatro oval com parte do anel superior quebrada | 10.000 |
| 6 | `petra.glb` | Fachada do Tesouro (Al-Khazneh) esculpida num penhasco rosado | 8.000 |
| 7 | `taj-mahal.glb` | Mausoléu branco com cúpula, 4 minaretes, plataforma e espelho d'água | 10.000 |
| 8 | `grande-muralha.glb` | Trecho da muralha subindo morros, com 2–3 torres de vigia | 10.000 |

Total ≈ 68 mil triângulos: cabe folgado em celulares médios.

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

Não é preciso mexer no código. Enquanto o arquivo não existe, o placeholder aparece. No console, um 404 de `HEAD /models/world/<id>.glb` é esperado para arquivos que ainda não existem.

## Notas de desempenho

- Globo: ~16,8 mil triângulos num único draw call. As ondas, o florescer e o brilho da borda rodam no shader.
- `IcosahedronGeometry` no three r172 subdivide de forma linear: `detail` 4–5 dá só 500–720 faces. Por isso o globo usa `detail` 28, que continua low poly.
- Luzes: hemisfério + 1 direcional presa à câmera. Sem sombras.
- Pixel ratio até 1,75. Se o FPS cair abaixo de 48, ele desce sozinho até 1.
- Os placeholders juntam as peças por cor (poucos draw calls). O debug mostra fps, draws e triângulos.
- Com `prefers-reduced-motion`, as animações ficam mais curtas e não há rotação automática.

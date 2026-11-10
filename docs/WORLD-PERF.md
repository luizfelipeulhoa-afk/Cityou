# Desempenho do mapa-mundo

Medido com `npm run build && npm run perf:world` (`tools/world-perf.mjs`): Chromium com CPU 4x mais lenta, rede "Slow 4G" (150 ms de latência, 1,6 Mbps), tela de 412x915, mediana de 3 execuções. O ambiente renderiza por software, então os tempos de GPU saem maiores que num celular de verdade; os tempos de JavaScript e de rede são representativos.

Em sessão na nuvem: `CITYOU_CHROME=/opt/pw-browsers/chromium npm run perf:world`.

| Medida | Antes | Depois | Ganho |
|---|---|---|---|
| Primeiro quadro na tela | 4.487 ms | 2.076 ms | 2,2x |
| Globo completo (terreno, nuvens, 8 marcadores) | 4.487 ms | 3.247 ms | 1,4x |
| Bloqueio da thread principal na abertura | 2.767 ms | 594 ms | 4,7x |
| Maior tarefa longa | 2.160 ms | 255 ms | 8,5x |
| Geração do terreno na thread principal | 802 ms | 0 (Web Worker) | |
| Maior passo de JavaScript depois do primeiro quadro | 1.281 ms (terreno + marcadores, num bloco só) | 105 ms | 12x |
| Sondagem dos 8 GLB | 1.903 ms (em série) | 331 ms (em paralelo) | 5,7x |
| Requisições na abertura | 15 | 16 (o Worker) | |
| JavaScript transferido (gzip) | 249 KB | 241 KB | |

"Antes" é o commit `36fcbd9` com as marcas de tempo adicionadas. "Depois" é a Fase 1.

O que mudou:

- O terreno é gerado num Web Worker (`terrain.worker.js`), com um núcleo sem three (`terrainCore.js`, 20 KB).
- O primeiro quadro sai com uma esfera de oceano; nuvens e marcadores entram depois, um por quadro.
- `GLTFLoader`, Meshopt e o ambiente PBR só são baixados e montados quando existe um GLB.
- As 8 sondagens de GLB saem juntas.
- `world.html` mostra fundo e aviso antes de o JavaScript chegar.
- Ocioso, o mapa desenha metade dos quadros; fora da tela, nenhum.
- `public-fifones/_headers` dá cache de um ano aos arquivos com hash no Cloudflare (antes, uma revalidação por arquivo a cada visita).

Limite desta medição: depois do primeiro quadro, as tarefas longas que restam (~250 ms cada) são os próprios quadros, desenhados por software com a CPU 4x mais lenta. Num aparelho com GPU isso não acontece, mas não dá para medir aqui. Uma tentativa de pré-compilar os shaders (`compileAsync`) não trouxe ganho mensurável e foi desfeita.

## O que cada número significa

- **Primeiro quadro**: do início da navegação até o primeiro `render` do globo.
- **Bloqueio**: soma do que cada tarefa longa passa de 50 ms, até 0,5 s depois do primeiro quadro. Enquanto dura, toques não respondem.
- **Sondagem dos GLB**: tempo para descobrir quais dos 8 modelos existem (`HEAD /models/world/<id>.glb`).

As marcas usadas (`world:first-frame`, `world:terrain`, `world:step:*`, `world:ready`, `world:model-probe`) ficam em `src/world/WorldGlobe.js` e aparecem no painel Performance do navegador.

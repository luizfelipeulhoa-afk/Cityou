# Desempenho do mapa-mundo

Medido com `npm run build && npm run perf:world` (`tools/world-perf.mjs`): Chromium com CPU 4x mais lenta, rede "Slow 4G" (150 ms de latência, 1,6 Mbps), tela de 412x915, mediana de 3 execuções. O ambiente renderiza por software, então os tempos de GPU saem maiores que num celular de verdade; os tempos de JavaScript e de rede são representativos.

Em sessão na nuvem: `CITYOU_CHROME=/opt/pw-browsers/chromium npm run perf:world`.

| Medida | Antes | Depois |
|---|---|---|
| Primeiro quadro do globo | 4.487 ms | |
| Bloqueio da thread principal na abertura | 2.767 ms | |
| Maior tarefa longa | 2.160 ms | |
| Geração do terreno na thread principal | 802 ms | |
| Criação dos 8 marcadores | 479 ms | |
| Sondagem dos 8 GLB | 1.903 ms (8 em série) | |
| Requisições na abertura | 15 | |
| JavaScript transferido (gzip) | 249 KB | |

"Antes" é o commit `36fcbd9` com as marcas de tempo adicionadas.

## O que cada número significa

- **Primeiro quadro**: do início da navegação até o primeiro `render` do globo.
- **Bloqueio**: soma do que cada tarefa longa passa de 50 ms, até 0,5 s depois do primeiro quadro. Enquanto dura, toques não respondem.
- **Sondagem dos GLB**: tempo para descobrir quais dos 8 modelos existem (`HEAD /models/world/<id>.glb`).

As marcas usadas (`world:first-frame`, `world:terrain`, `world:markers`, `world:model-probe`) ficam em `src/world/WorldGlobe.js` e aparecem no painel Performance do navegador.

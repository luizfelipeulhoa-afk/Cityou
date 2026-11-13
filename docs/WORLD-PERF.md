# Desempenho do mapa-mundo

Medido com `npm run build && npm run perf:world` (`tools/world-perf.mjs`): Chromium com CPU 4x mais lenta, rede "Slow 4G" (150 ms de latência, 1,6 Mbps), tela de 412x915, mediana de 3 execuções. O ambiente renderiza por software, então os tempos de GPU saem maiores que num celular de verdade; os tempos de JavaScript e de rede são representativos.

Em sessão na nuvem: `CITYOU_CHROME=/opt/pw-browsers/chromium npm run perf:world`.

| Medida | Antes | Depois | Ganho |
|---|---|---|---|
| Primeiro quadro na tela | 4.487 ms | 2.094 ms | 2,1x |
| Globo completo (terreno, nuvens, 8 marcadores) | 4.487 ms | 3.237 ms | 1,4x |
| Bloqueio da thread principal na abertura | 2.767 ms | 551 ms | 5x |
| Maior tarefa longa | 2.160 ms | 276 ms | 7,8x |
| Geração do terreno na thread principal | 802 ms | 0 (Web Worker) | |
| Maior passo de JavaScript na montagem do globo | 1.281 ms (terreno + marcadores num bloco só, antes do primeiro quadro) | 56 ms (depois do primeiro quadro) | 23x |
| Descobrir quais GLB existem | 1.903 ms (8 requisições em série) | 166 ms (1 requisição) | 11x |
| Requisições na abertura | 15 | 10 | |
| JavaScript transferido (gzip) | 249 KB | 244 KB | |

"Antes" é o commit `36fcbd9` com as marcas de tempo adicionadas. "Depois" é o estado atual do branch.

O que mudou:

- O terreno é gerado num Web Worker (`terrain.worker.js`), com um núcleo sem three (`terrainCore.js`, 20 KB).
- O primeiro quadro sai com uma esfera de oceano; nuvens e marcadores entram depois, um por quadro.
- `GLTFLoader`, Meshopt e o ambiente PBR só são baixados e montados quando existe um GLB.
- Um `manifest.json` gerado pelo Vite diz quais GLB existem: uma requisição no lugar de oito, e sem erros 404 no console. Sem manifesto, as 8 sondagens saem em paralelo.
- `world.html` mostra fundo e aviso antes de o JavaScript chegar.
- Ocioso, o mapa desenha metade dos quadros; fora da tela, nenhum.
- O quadro é desenhado no relógio do GSAP, logo depois de os tweens atualizarem (antes eram dois relógios e a animação podia atrasar um quadro). Essa parte é garantida pela ordem de execução, não por medição.
- `public-fifones/_headers` dá cache de um ano aos arquivos com hash no Cloudflare (antes, uma revalidação por arquivo a cada visita).

Limite desta medição: depois do primeiro quadro, as tarefas longas que restam (~250 ms cada) são os próprios quadros, desenhados por software com a CPU 4x mais lenta. Num aparelho com GPU isso não acontece, mas não dá para medir aqui. Uma tentativa de pré-compilar os shaders (`compileAsync`) não trouxe ganho mensurável e foi desfeita.

## O que cada número significa

- **Primeiro quadro**: do início da navegação até o primeiro `render` do globo.
- **Bloqueio**: soma do que cada tarefa longa passa de 50 ms, até 0,5 s depois do primeiro quadro. Enquanto dura, toques não respondem.
- **Sondagem dos GLB**: tempo para descobrir quais dos 8 modelos existem (`HEAD /models/world/<id>.glb`).

As marcas usadas (`world:first-frame`, `world:terrain`, `world:step:*`, `world:ready`, `world:model-probe`) ficam em `src/world/WorldGlobe.js` e aparecem no painel Performance do navegador.

## Adaptação aos GLB do Tripo

Mudança: o globo passou a se ajustar aos modelos (assento plano, sombra de contato, anel de chão), os modelos ficaram opacos e ganharam luz própria, e entraram as ajudas de navegação. Detalhes em `docs/WORLD-MAP.md`. "Antes" é o `main` em `f5bccaf`. As duas versões foram medidas alternando as execuções (antes, depois, antes, depois), para a carga da máquina pesar igual nos dois lados.

### Custo por quadro

`npm run build && npm run perf:world-frame`: cena montada, os 7 GLB carregados, 412x915, dpr 1, render por software. Mediana de 3 execuções de cada lado.

| Cena | Quadros por segundo | CPU do tick | Draws | Triângulos |
|---|---|---|---|---|
| Visão geral | 5,0 → 7,0 | 2,0 → 1,3 ms | 59 → 44 | 163.320 → 154.388 |
| Foco no Taj Mahal | 7,6 → 10,6 | 1,1 → 0,9 ms | 21 → 14 | 78.253 → 69.145 |
| Foco no Cristo (mar ao fundo) | 15,0 → 16,0 | 0,9 → 0,8 ms | 11 → 10 | 45.711 → 36.539 |
| Foco na Ilha (mar em volta) | 9,8 → 12,2 | 1,0 → 0,8 ms | 16 → 12 | 64.276 → 55.136 |

De onde vem o ganho:

- Os GLB do Tripo são quase só difusos (rugosidade 0,9, sem metal). Eles passaram de `MeshStandardMaterial` com mapa de ambiente para `MeshLambertMaterial`, com menos contas por pixel. O mapa de ambiente (PMREM) deixou de existir.
- Os modelos são opacos em todos os estados. Antes eram todos transparentes, por causa do estado bloqueado translúcido.
- Anel e onda de cada espaço viraram um plano só.
- Os pontos do caminho têm 20 triângulos cada (eram 80) e a atmosfera, 1.920 (eram 5.120). As nuvens novas gastam mais (5 mil contra 2 mil), e o saldo ainda é negativo.
- O que entrou no shader do globo custa um `smoothstep` por pixel (sombra de contato). O cintilar do mar é resolvido por face, no vertex shader.

### Abertura

`npm run perf:world`: CPU 4x mais lenta, Slow 4G. Mediana de 6 execuções de cada lado.

| Medida | Antes | Depois |
|---|---|---|
| Primeiro quadro na tela | 2.334 ms | 2.332 ms |
| Globo completo (terreno, nuvens, 8 marcadores) | 3.913 ms | 3.887 ms |
| Bloqueio da thread principal na abertura | 757 ms | 727 ms |
| Maior tarefa longa | 380 ms | 345 ms |
| Montagem das nuvens | 67 ms | 30 ms |
| Primeiro GLB baixado | 5.432 ms | 4.954 ms |
| Último GLB baixado | 14.219 ms | 13.779 ms |
| JavaScript da abertura (gzip) | 247 KB | 253 KB |
| JavaScript pedido só quando há GLB | 21 KB | 19 KB |
| Total transferido na abertura | 273 KB | 280 KB |
| Requisições na abertura | 11 | 13 |

- O primeiro quadro não mudou. Os modelos chegam cerca de 0,45 s antes, porque não há mais mapa de ambiente para baixar e montar antes do primeiro GLB.
- As nuvens são escritas direto em dois arrays, sem uma geometria por tufo.
- Custo: 7 KB a mais na abertura. São os shaders e a lógica nova do globo, mais o pacote das ajudas de navegação (`WorldMapHud`, JS e CSS), que é pedido depois que o globo está pronto e explica as 2 requisições a mais.
- Visita repetida: os GLB com hash no nome saem do cache do navegador sem requisição (`docs/WORLD-MAP.md`, "Endereço e cache dos modelos"). Isso vale por configuração de cabeçalho, conferida nos testes do FastAPI e no Worker local, não por esta medição.

`tools/world-perf.mjs` passou a esperar todos os GLB e a separar o peso deles do peso da abertura. Antes, o total dependia de quantos modelos cabiam numa janela fixa de 1 s.

Limite: os quadros por segundo são de render por software, em que o custo por pixel pesa muito mais que numa GPU. Servem para comparar duas versões na mesma máquina. O fps num celular de verdade não foi medido.

## Orçamento por aparelho (do guia de 3D leve)

O guia `docs/research/3d-qualidade-sem-pesar.md` (escrito para Unity) define metas por aparelho. Para celular fraco ("Tier C"): no máximo 150 chamadas de desenho, 250 mil triângulos por quadro e 250 MB de memória de vídeo, com 30 fps como teto e escala de render de 0,7.

**Medido no globo** (Chromium com renderizador por software, tela de 412×915, os 8 espaços desbloqueados, contadores do `renderer.info` do Three.js):

| Situação | Chamadas de desenho | Triângulos | Texturas |
|---|---|---|---|
| Visão geral | 44 | 174.217 | 9 |
| Focado no Coliseu | 9 | 47.206 | 9 |

Texturas: 8 de 1024² em WebP. Decodificadas na GPU ficam em torno de 5,3 MB cada (RGBA com mipmaps), cerca de 43 MB no total. Tudo dentro das metas. Não medi quadros por segundo nem temperatura em aparelho real: o renderizador por software não representa uma GPU de celular.

**O que se aplica ao Three.js:** orçamento de triângulos e chamadas por tela; uma textura por modelo; detalhe na silhueta e no telhado em vez de polígonos; luz simples sem sombras (já é assim); LOD por tamanho na tela quando houver muitos objetos.

**O que é só de Unity e não se aplica aqui:** Addressables, Play Asset Delivery, ASTC, GPU Resident Drawer, `Graphics.DrawMeshInstanced`, Adaptive Performance.

**Evoluções possíveis, não feitas:**

- Texturas KTX2 (Basis) no lugar de WebP: mantêm-se comprimidas na GPU e cortam a memória de vídeo em 4 a 8 vezes. Hoje a memória não é o gargalo.
- Impostores (imagem pré-renderizada) para a cidade grande de `city.html`, se ela chegar a milhares de prédios. A cidade ainda não foi medida.
- Teto de 30 fps e escala de render 0,7 em aparelhos fracos, detectados por medição de quadros.

## Base da cidade (`city.html`) e da API, 13/11/2026

Medida local, **não** é de produção nem de celular: Worker local (`wrangler dev`, modo de teste com 5.000 moedas), renderização por software (SwiftShader), CPU 4× mais lenta e rede 4G simulada. Serve para comparar versões na mesma máquina, alternando antes e depois. Comandos:

```bash
npx wrangler dev --port 8787 --ip 127.0.0.1 --var CITYOU_TEST_OPEN_REGIONS:1
CITYOU_CHROME=/opt/pw-browsers/chromium npm run perf:city -- http://127.0.0.1:8787 --runs 3 --label antes
node tools/api-perf.mjs http://127.0.0.1:8787 --suite 50
```

Cidade do Rio (`cristo-redentor`, com o terreno), mediana de 3 rodadas, duas execuções completas (a e b):

| Cenário | 1º quadro | Pronto (GLB e terreno) | CPU de `render` p50 | Draws | Triângulos | Programas | Texturas |
|---|---|---|---|---|---|---|---|
| Cidade de partida (30 peças de base) | 2,46 / 2,51 s | 6,1 / 6,7 s | 4,4 / 4,9 ms | 51 | 57.752 | 10 | 3 |
| + 25 prédios com GLB (os 9 do Rio) | 2,49 / 2,55 s | 10,6 / 10,1 s | 6,8 / 7,3 ms | 74 | 203.433 | 10 | 12 |

Só 25 de 30 prédios cabem no Rio com as quatro ruas que o bench traça (o servidor exige frente para rua conectada).

**Quais medidas são confiáveis** (diferença entre as duas execuções): draws, triângulos, programas e texturas, 0%; primeiro quadro, até 2,3%; pronto com cache vazio, até 8,8%; CPU de `render` com 25 prédios, 7,4%. **Ruins:** CPU de `render` sem prédios (11,4%, valores de 4 a 5 ms), abertura com cache (12 a 27%) e o intervalo de rAF por software (múltiplos de 16,7 ms, até 25%). Para decidir se uma mudança piorou ou melhorou, exija uma diferença maior que essas margens nas medidas ruins e use as confiáveis como juiz.

API local (50 chamadas, mediana / p95, ida e volta): `GET /api/personal` 8,6 / 11,6 ms; `GET /api/city` 7,6 / 10,8 ms; girar uma peça 9,8 / 15,4 ms. O servidor responde em 1 a 3 ms (os temporizadores do Worker têm resolução de 1 ms). **Não há base de produção ou prévia ainda:** falta rodar `--suite` contra o site publicado, com cookie de sessão.

### Depois da etapa 7a (luz única, Lambert, sombra de contato, degradê de base), 13/11/2026

Mesma máquina, mesmos comandos, 3 rodadas (a base acima é a de antes). Nenhum `dist` foi reconstruído durante a medida.

| Cenário | Draws | Triângulos | Programas | CPU de `render` p50 / p95 | Pronto (frio) |
|---|---|---|---|---|---|
| Partida: antes → depois | 51 → 52 | 57.752 → 57.756 | 10 → 11 | 4,4–4,9 / 10,4–11,5 → 3,9 / 7,2 ms | 6,1–6,7 → 6,1 s |
| + 25 prédios: antes → depois | 74 → 75 | 203.433 → 203.487 | 10 → 12 | 6,8–7,3 / 15,1–15,8 → 6,3 / 11,9 ms | 10,1–10,6 → 9,9 s |

+1 draw (a sombra de contato), +1 programa (o Lambert com o degradê de base) e nenhum triângulo relevante a mais. A CPU de `render` não piorou: o p95 caiu uns 22 a 30%, acima da margem de ruído; o p50 caiu 7 a 20%, perto da margem (7 a 11%), então vale como "sem piora", não como ganho certo. Cena (`tools/city-look.mjs`): shadow map desligado, sem tone mapping no Rio, 134 materiais Lambert e 1 Standard (era 132 Standard), sem `PointLight`. Fotos antes e depois em `.verification/city-antes-*.png` e `city-depois3-*.png` (fora do git).


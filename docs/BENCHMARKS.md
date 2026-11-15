# Benchmarks do Cityou

Histórico consolidado em 13/11/2026. As fontes preservam as tabelas completas e os detalhes de cada execução. Números de renderização por software só servem para comparar rodadas nas mesmas condições.

## O que já foi medido

| Rodada | Resultado e evolução | Fonte |
|---|---|---|
| Abertura do globo | Primeiro quadro 4.487 → 2.094 ms, globo completo 4.487 → 3.237 ms, bloqueio da thread principal 2.767 → 551 ms e maior tarefa longa 2.160 → 276 ms. Web Worker tirou 802 ms de geração de terreno da thread principal. Descoberta dos GLB 1.903 → 166 ms, requisições 15 → 10 e JS gzip 249 → 244 KB. | [WORLD-PERF](WORLD-PERF.md) |
| Globo com GLB do Tripo, PR #13 | Visão geral 5,0 → 7,0 fps, 59 → 44 draws e CPU do tick 2,0 → 1,3 ms. Taj Mahal 7,6 → 10,6 fps, Cristo 15 → 16 fps e Ilha 9,8 → 12,2 fps. Primeiro quadro praticamente estável (2.334 → 2.332 ms). Último GLB 14.219 → 13.779 ms, com transferência de abertura 273 → 280 KB. | [WORLD-PERF](WORLD-PERF.md#adaptação-aos-glb-do-tripo) |
| Globo com oito destinos | Visão geral com 44 draws, 174.217 triângulos e 9 texturas. Foco no Coliseu com 9 draws e 47.206 triângulos. Cerca de 43 MB de texturas dos oito GLB é uma estimativa de memória após decodificação. | [WORLD-PERF](WORLD-PERF.md#orçamento-por-aparelho-do-guia-de-3d-leve) |
| 3D declarativo, fase 0 (11/11) | Custo de CPU por quadro entre 0,8 e 1,6 ms nas duas versões. Primeiro quadro entre 2.440 e 2.589 ms, JS inicial 254 → 255 KB e 13 requisições em ambas. Diferenças dentro da variação entre rodadas. O trecho compartilhado cresceu 0,36 kB. O laboratório TresJS acrescentava 55 kB minificados (18 kB gzip) à base Vue/Three usada na comparação. | [3D-DECLARATIVO](3D-DECLARATIVO.md#medições-da-fase-0-11112026) |
| Laboratório do terreno (12/11) | PNG de 513 × 513 e 170 kB. Terreno com 32.777 triângulos em 1 draw, vegetação em 2 draws e cena sem prédios com 87.985 triângulos. Montagem de cerca de 200 ms ou 500 ms com CPU 4× mais lenta. CPU por quadro 0,5–0,9 ms e 11,6–13,0 fps em software. JS 865 kB bruto, 240 kB gzip, com os 14 arquivos do build principal preservados nessa comparação. | [TERRAIN](TERRAIN.md#medições-12112026) |
| Terreno na cidade e nove prédios do Rio | Terreno elevou a contagem de 23.065 para 64.302 triângulos, cerca de 11 → 10 fps em software e CPU por quadro de 1,0–1,2 ms nas duas versões. Cena com os nove prédios registrou 121.821 triângulos e 58 draws. | [TERRAIN](TERRAIN.md), [PREDIOS-RIO](PREDIOS-RIO.md) |
| Cidade do Rio, base (13/11) | Partida com 30 peças em 51 draws e 57.752 triângulos, primeiro quadro em 2,46–2,51 s, pronto em 6,1–6,7 s. Com mais 25 prédios GLB, 74 draws e 203.433 triângulos, primeiro quadro em 2,49–2,55 s, pronto em 10,1–10,6 s a frio. | [WORLD-PERF](WORLD-PERF.md#base-da-cidade-cityhtml-e-da-api-13112026) |
| Cidade do Rio, etapa 7a (13/11) | Lambert, luz regional e sombra de contato. CPU de render p95 caiu de 10,4–11,5 para 7,2 ms na partida e de 15,1–15,8 para 11,9 ms com 25 prédios. +1 draw em cada cenário. Pronto a frio em 6,1 e 9,9 s. Ganho no p50 ficou próximo da variação entre rodadas. | [WORLD-PERF](WORLD-PERF.md#depois-da-etapa-7a-luz-única-lambert-sombra-de-contato-degradê-de-base-13112026) |
| API local, etapa 1 (13/11) | 50 chamadas por cenário, p50 / p95 ida e volta. Painel 8,6 / 11,6 ms, cidade 7,6 / 10,8 ms, giro de peça 9,8 / 15,4 ms. Servidor em 1–3 ms, com resolução de 1 ms. | [WORLD-PERF](WORLD-PERF.md#base-da-cidade-cityhtml-e-da-api-13112026) |

## Auditoria da etapa 9, commit `9278983`

| Medição | Resultado | Condições |
|---|---|---|
| Decodificar o PNG do Rio | p50 5,12 ms, p95 6,97 ms, mínimo 4,47 ms e máximo 7,78 ms | Node 24.19.0, Windows, Intel Core Ultra 9 275HX, bytes em memória, 10 aquecimentos e 50 amostras |
| Montar dados do terreno na cidade | p50 40,67 ms, p95 56,65 ms, mínimo 38,58 ms e máximo 71,69 ms | Mesma rodada, `createTerrainData` com `rio-cidade`, sem GPU, rede ou throttle |
| Abertura do globo | Primeiro quadro 2.039 ms, globo completo 2.689 ms, bloqueio 327 ms, maior tarefa 212 ms, último GLB 12.450 ms, 13 requisições e 282 KB iniciais (255 KB de JS) | `npm run perf:world`, Chrome local, mediana de 3, CPU 4×, Slow 4G, 412 × 915 |
| Laboratório de terreno, build | Montagem em 84 ms ou 285 ms com CPU 4×. Cena inicial com 110.730 triângulos e 14 draws. 39,4–42,5 fps em software nas três vistas, CPU por quadro 0,21–0,28 ms | `npm run test:terrain -- --dist --perf`, Chrome local, rodada de laboratório |
| API local | p50/p95 em ms. Painel 15,6/21,6, cidade 15,9/18,1, giro 28,1/33,3. Servidor 1/2, 1/1 e 2/3 ms respectivamente. Zero erros. | `tools/api-perf.mjs`, 50 chamadas por cenário, Worker local, SQLite em Durable Object, modo de teste, sem D1 |
| Cidade do Rio, partida | Primeiro quadro 1.765 ms, pronto 4.988 ms a frio e 1.591 ms com cache. CPU de render p50/p95 2,9/3,7 ms, 52 draws, 57.756 triângulos, 3 texturas. Zero erros. | `npm run perf:city`, três rodadas, CPU 4×, 4G simulada, Chrome e Worker de teste locais |
| Cidade do Rio, +25 prédios | Primeiro quadro 1.721 ms, pronto 8.896 ms a frio e 2.372 ms com cache. CPU de render p50/p95 4,3/6,2 ms, 71 draws, 180.324 triângulos, 12 texturas. Zero erros. | Mesma rodada, 25 prédios adicionados pelo seed. O intervalo p95 entre quadros foi 41,8 ms com renderização por software. |
| Build de produção | Chunk compartilhado `tapGesture` de 190,22 kB gzip e entrada do laboratório de terreno de 240,73 kB gzip | Vite 5.4.18, tamanhos calculados pelo build. Transferência real depende de rota, cache e servidor. |

Para repetir o microbenchmark, carregue `src/terrain/regions/rio.height.png` uma vez com `readFile`. Em cada iteração, use `performance.now()` antes e depois de `decodePng(bytes)` e novamente depois de `createTerrainData(region, image.data)`, com a exportação padrão de `rio-cidade.js`. Descarte as 10 primeiras iterações, ordene as 50 seguintes e use os elementos 25 e 48 para p50 e p95 pelo método do posto mais próximo.

## Custo do hash de senha (15/11/2026, local)

PBKDF2-SHA256 com 100 mil iterações (`ITERATIONS` em `worker/auth.js`, o teto da Web Crypto dos Workers). Medido no Worker local (`wrangler` test harness, 25 logins de e-mail sem conta, que calculam um hash cada; script em `node` com `createTestHarness`, sem cache): **p50 26 ms, mínimo 20 ms, p95 284 ms** (o p95 inclui o primeiro pedido, que aquece o Worker). O mesmo hash em Node puro, nesta máquina de 4 núcleos: 19 ms. Ou seja, **cerca de 20 ms de CPU por cadastro ou login**.

O que isso decide: o plano **Workers Free** limita a CPU a **10 ms por pedido**, então cadastro e login passariam do limite e falhariam; o **Workers Paid** dá 30 s por padrão. Antes de ligar as contas (etapa 10), confirme o plano pago na conta do Cloudflare e repita a medida numa prévia publicada (`--cookie` não é preciso: `POST /api/auth/login` com um e-mail sem conta). Não baixe as iterações para caber no plano grátis: 100 mil já está abaixo do que a OWASP recomenda para PBKDF2-SHA256 (600 mil), e é o máximo que a plataforma aceita.

## O que medir e melhorar a seguir

Use as rodadas recentes como referência para a máquina e o navegador desta auditoria. Diferenças de ambiente, build, câmera ou cena afetam a comparação com a base histórica. Confirme a mesma configuração e distribuição de prédios antes de atribuir ganhos à etapa 9.

1. **Prévia e banco.** Use conta sintética e meça p50/p95, `Server-Timing`, tamanho do JSON e erros. Repita com 0, 50 e 100 comprovantes e com históricos crescentes de check-ins. Hoje o painel lê e decodifica as fotos antes de descartá-las da resposta, e a cidade consulta check-ins por prédio de atividade. Meça linhas lidas e plano de consulta antes de decidir entre separar binários, agregar por atividade e acrescentar índices. [Implementação](../worker/demo.js)
2. **Cidade realista e mobile.** Refaça a abertura a frio/quente e o custo por quadro com cidade inicial, 25 GLB e uma cidade densa. Inclua Rio e Ilha, meça em celular físico e capture tempo de CPU/GPU, travamentos, draws e memória. A etapa 9 também precisa de medidas da prévia e confirmação da rua automática em tabuleiros densos.
3. **Custo em repouso.** A cidade continua pedindo quadros mesmo parada e consulta dados a cada 30 s, além da atividade legada a cada 10 s. Trace uma sessão ociosa e outra interativa antes de mover o terreno para Web Worker, usar renderização sob demanda ou reduzir sondagem. [Cena](../src/fifones/CityWorld.js) · [Tela](../src/CityApp.vue)
4. **Painel e landing.** Faça três navegações frias por cenário com Lighthouse ou trace do Chrome e registre LCP, CLS e TBT no laboratório. Meça INP em campo quando houver amostra. Analise o grafo do chunk compartilhado por rota antes de dividir bundles. O build emitiu avisos de fonte da landing e do export `Timer` do Three para TresJS no laboratório.
5. **Ferramentas.** Para regressões, comece pelos contadores determinísticos e use a variação histórica para definir tolerâncias de tempo. O cenário Rio +25 GLB já mostrou até 8,8% de variação no pronto a frio e 7,4% em CPU de render.

## Rodada com Vite 6.4.6

| Medição | Resultado | Condições |
|---|---|---|
| Ilha Inicial | p75 a frio 1.311 ms, cache 406 ms, 17 ms entre quadros, 69 draws e 19.458 triângulos | `node tools/pilot-perf.mjs <url-local> 5`, Chrome emulado como Pixel 7, 4G, SwiftShader, Worker local de teste |
| Rio | p75 a frio 1.417 ms, cache 987 ms, 17 ms entre quadros, 42 draws e 12.070 triângulos | Mesma rodada, cena inicial |
| API local | Painel 17,0/31,7 ms, cidade 18,7/34,8 ms e giro 31,5/42,7 ms (p50/p95 ida e volta). Servidor em 1/2, 1/2 e 3/4 ms. Zero erros | 50 chamadas por cenário, modo de teste sem D1. A diferença frente à base anterior merece repetição em condições controladas |
| Build | Chunk compartilhado 190,22 → 190,21 kB gzip e laboratório 240,73 → 240,78 kB gzip | Tamanhos calculados pelo Vite 5.4.18 e 6.4.6 respectivamente |
| Abertura do globo | Primeiro quadro 2.039 → 2.032 ms, globo completo 2.689 → 2.636 ms e último GLB 12.450 → 12.262 ms. Transferência inicial em 282 KB e 13 requisições nas duas rodadas | Mesma máquina, mediana de 3, CPU 4×, Slow 4G e viewport 412 × 915. Diferenças pequenas nesta comparação |

O benchmark dos pilotos usa a cidade inicial em modo de teste e recebe o cookie por HTTP. Na primeira tentativa, abrir o globo antes de medir a cidade registrou 11.764 ms a frio na Ilha e 1.700 ms no Rio (p75 de três rodadas). A rodada de cinco amostras removeu a navegação anterior, portanto os números não medem ganho no app. `pilot-perf` mede quando a cena começa a desenhar. Use `perf:city` para medir a carga de todos os GLB e do terreno.

## Como registrar a próxima rodada

O [PR #28](https://github.com/CityouApp/Cityou/pull/28) registrou a cidade inicial pronta em 8,4 → 5,6 s a frio e 3,1 → 2,4 s com cache, com Worker local, CPU 4×, 4G simulada e duas rodadas. A mudança antecipa a carga do terreno, usa uma reserva só em caso de erro e corta o relevo distante. A medição é do PR de origem e usa uma cena diferente das rodadas anteriores deste histórico.

Use `npm run perf:world`, `npm run perf:world-frame`, `npm run perf:city`, `npm run perf:api` ou `npm run test:terrain -- --dist --perf` conforme o cenário. Os comandos completos e as condições da base estão em [WORLD-PERF](WORLD-PERF.md) e [TERRAIN](TERRAIN.md). Execute cenários com escrita em prévia ou emulador isolados e dados sintéticos.

Anote data, commit, máquina e navegador, perfil de rede/CPU, rota, seed, autenticação, cache, número de amostras e caminho do relatório. Alterne antes/depois na mesma máquina e mantenha o build fixo durante cada rodada. Registre p50/p95 ou mediana e faixa, junto do resultado funcional. A base histórica vem dos documentos do projeto. As verificações funcionais anteriores estão em [VERIFICATION](VERIFICATION.md) e no [checkpoint](CHECKPOINT.md).

Ferramentas adicionais para as próximas rodadas: [Lighthouse](https://github.com/GoogleChrome/lighthouse) para a abertura da landing e do painel, e [k6](https://github.com/grafana/k6) para carga controlada na API de uma prévia isolada.

## Piso de ~120 ms da API na prévia (13/11/2026)

Prévia `claude-etapa-4-painel-sem-iframe-cityou.cityouapp.workers.dev`, demonstração sem login, `node tools/api-perf.mjs <url> <rota> N --json` (no Git Bash, `export MSYS_NO_PATHCONV=1`, senão `/api/city` vira caminho do Windows).

| Rota | Ida e volta p50 / p95 | `Server-Timing` |
|---|---|---|
| `/api/health` (só o Worker, 20 chamadas) | 62,3 / 94,1 ms | total 0 ms |
| `/api/city`, 4 sessões novas (12 chamadas cada) | 198 / 290, 187 / 236, 187 / 206, 189 / 216 ms | `do` 119, 122, 119, 119 ms (p95 122 a 130) |

**Causa provável: distância de rede entre o Worker (atende em GRU/GIG) e o Durable Object.** Quatro sessões criadas em momentos diferentes dão o mesmo `do` (119 a 122 ms, p95 até 130), então não é cold start, construtor (`migrateCatalog` só roda uma vez e é leitura de uma linha), SQLite nem tamanho do JSON: o mesmo código local leva 3 a 8 ms. Um tempo constante e alto, igual em objetos diferentes, é viagem de ida e volta a outro continente. A rota do Worker sem objeto custa 0 ms.

**Mudança aplicada (inerte por padrão):** `sessionStub` em `worker/demo.js` abre o objeto com `getByName(key, { locationHint })` quando existe a variável `DO_LOCATION_HINT`. Sem a variável nada muda. A dica só vale para objetos ainda não criados (sessões e contas já existentes ficam onde estão), então o ganho aparece em sessões novas.

**Proposta, não aplicada (mexe em `wrangler.jsonc` da prévia/produção, decisão do dono):**

```jsonc
"previews": { "vars": { "DO_LOCATION_HINT": "sam", ... } }
```

Depois, medir de novo com sessões novas: o `do` esperado cai para algo na faixa de 5 a 30 ms se o objeto passar a viver em São Paulo (a meta de 60 ms de servidor fecha). A dica é só uma sugestão; se o `do` não cair, o próximo passo é um ponto de diagnóstico temporário na prévia que devolva a região do objeto (`cdn-cgi/trace` de dentro dele). **Não medido:** o efeito da dica, porque medir exige publicar a prévia; e a região real do objeto, que não é exposta ao Worker.

Outras opções, se a dica não bastar: reduzir idas ao objeto por tela (o painel faz várias chamadas em sequência; juntá-las em `GET /api/personal`, que já traz tarefas, agenda e peso) e ler o resumo do painel de um cache por sessão, que não passa por regra de moedas.

### Cache de leitura na borda (`worker/edge-cache.js`, 13/11/2026)

Decisão do dono: guardar no ponto de presença só `GET /api/personal` e `GET /api/city`, por sessão. Chave = nome do objeto da sessão (hash do cookie ou id da conta), nunca o cookie. Resposta do cache sai na hora; com 1 s ou mais de idade dispara uma revalidação em `ctx.waitUntil`; acima de 30 s é ignorada. Só 200 sem `Set-Cookie` é guardado (erro, 401 e 410 não). Toda escrita que passa pelo Worker (qualquer status) troca a versão da sessão e invalida as entradas, inclusive as de outro `?month=` ou `?local=`. Escrita feita por outro ponto de presença só aparece aqui em até 30 s. O contrato não muda: o navegador continua recebendo `Cache-Control: no-store`; ganhou o cabeçalho `X-Cityou-Cache: hit|miss` e a marca `cache` no `Server-Timing`. Testes: `tests/worker-edge-cache.test.mjs`.

**Como medir depois do deploy:** `node tools/api-perf.mjs <url> /api/personal 40 --json` (uma sessão só, então só a primeira chamada é `miss`): o esperado é ida e volta perto do `/api/health` (cerca de 60 ms) em vez de 190 ms, e o `do` fica de fora do `Server-Timing` nos hits (a revalidação roda depois). `--suite` mistura leitura e escrita: a leitura logo depois da escrita é `miss` por desenho, então compare por rota. Antes (prévia, 13/11): `/api/personal` 190 / 216 ms e `/api/city` 187 / 200 ms. Ainda sem medida da prévia com o cache: só testes locais.

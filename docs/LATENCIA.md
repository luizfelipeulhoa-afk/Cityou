# Lentidão do servidor: estratégia para cortar pela metade (15/11/2026)

Pedido do dono: diminuir pela metade o tempo que a pessoa espera pelo servidor, no Brasil, sem o plano pago da Cloudflare por enquanto. Parecer do agente arquiteto do luix_bot (piloto) mais a conferência do orquestrador. Números em ms são estimativas a partir das medidas de `docs/BENCHMARKS.md`, salvo onde diz "medido".

## Por que é lento

- Medido na prévia (13/11/2026): `/api/health` 62 ms de ida e volta; `/api/city` ~190 ms, dos quais o `do` (Worker → Durable Object) é ~120 ms constante. O Worker atende em São Paulo e o objeto está longe.
- **Mudar o objeto de lugar não resolve.** Pela documentação oficial ([data location](https://developers.cloudflare.com/durable-objects/reference/data-location/)), um objeto com a dica `sam` (América do Sul) nasce no leste da América do Norte, porque não há Durable Objects na América do Sul. `DO_LOCATION_HINT` fica sem efeito para o Brasil. O D1 também não tem região na América do Sul.
- **Com contas ligadas, eram duas viagens por pedido.** `sessionUser` (`worker/auth.js`) lia a sessão no D1 em todo pedido, antes de ir ao objeto: ~120 ms + ~120 ms em série. A prévia não tem D1, então a medida de 190 ms ainda não mostrava isso.

Conclusão: cada viagem ao leste dos EUA custa ~120 ms e não dá para encurtá-la. O ganho vem de **fazer menos viagens** e de **não esperar por elas**.

## Estratégia (em ordem de ganho ÷ risco)

| # | Mudança | Ganho estimado | Estado |
|---|---|---|---|
| 1 | Sessão guardada no ponto de presença por 30 s (`CITYOU_SESSION_CACHE_SECONDS`) | com contas: ~310 → ~190 ms por pedido (**−40%**), e a abertura de página também | **feito** (15/11/2026), teste em `tests/worker-access.test.mjs` |
| 2 | Idas em série no cliente | concluir tarefa na cidade 570 → 190 ms; sincronizar 380 → 190 ms; salvar registro no painel 380 → 190 ms (**−50 a −66%**) | **feito** (15/11/2026) |
| 3 | Construir pelo painel sem o GET da revisão; cena da cidade começa com a última cidade guardada no navegador | 570 → 190 ms; cena ~190 ms mais cedo | construir pelo painel: **feito** (15/11/2026; relê a cidade só sem revisão guardada ou depois de 409); cena antes da resposta: a fazer |
| 4 | Escrita otimista na cidade (construir, mover, girar): a peça aparece na hora, a resposta só confirma; erro desfaz e aplica a cidade do servidor | espera percebida 190 → < 50 ms (meta de `docs/API.md`) | a fazer; fora: desfazer/refazer, melhorar e o que depende de moedas do servidor |
| 5 | Estado inicial no HTML: o Worker pede o estado ao objeto em paralelo com a página e põe um `<script type="application/json" id="cityou-boot">` antes de `</body>` (`HTMLRewriter`); `api()` usa uma vez | abrir tela ~330 → ~200 ms (−40%) | a fazer; exige `private, no-store`, `Vary: Cookie`, escapar `<`, limite de 400 ms e 200 KB, só com sessão, só o mês de hoje, não com `?local=`, chave `BOOT_EMBED` para desligar |
| 6 | Ampliar o cache de borda de leitura | pouco: o ciclo do painel é 60 s e o cache vale 30 s, então quase nunca acerta | medir antes |
| — | WebSocket direto ao objeto, KV como espelho, Smart Placement | — | descartados: o WebSocket ainda viaja ao objeto; o KV grátis tem 1.000 escritas por dia; o Smart Placement afastaria o Worker do navegador |

**Como chega à metade:** as ações deixam de ser esperadas (4) e as que restam fazem uma viagem só (1, 2, 3); abrir a tela ganha ~40% com o estado no HTML (5). Só a soma passa de −50% em todas as telas.

## Como medir (só a partir do Brasil, na prévia)

Deste ambiente de nuvem a rede para `*.workers.dev` é bloqueada, então nada aqui foi medido na prévia.

- `node tools/api-perf.mjs <prévia> --suite` antes e depois (o `Server-Timing` traz `do`).
- Com D1 na prévia: comparar o tempo total com e sem `CITYOU_SESSION_CACHE_SECONDS=0`.
- Taxa real do cache de borda: cabeçalho `X-Cityou-Cache` em `node tools/api-perf.mjs <url> /api/personal 40 --json`.
- Depois do item 5: `curl -w '%{time_starttransfer}'` com cookie, e `node tools/csp-probe.mjs <url>` sem violação.

## Riscos aceitos

- Sessão em cache: depois de sair num ponto de presença, a sessão pode valer em outro por até 30 s; conta apagada idem (apagar tira do cache as sessões de todos os aparelhos da conta, mas só no ponto onde foi pedido). A Cache API não apaga na hora em todo lugar, e um pedido que leu o banco antes do `logout` pode regravar a entrada pela janela. Os dados não voltam: o objeto de uma conta apagada responde 410. Exportar e apagar a conta conferem sempre no banco. "0" desliga.
- O cache guarda também e-mail e nome (a tela de status mostra), na mesma infraestrutura que já guarda os dados.

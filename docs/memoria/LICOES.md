# Lições: o que já falhou e não deve ser repetido

Cada lição tem a causa e a evidência. Antes de propor uma solução, procure aqui. Tropeços de ambiente e de ferramenta também estão em [`known-issues.md`](../known-issues.md).

| id | Não faça | Por quê | Faça | Evidência |
|---|---|---|---|---|
| L1 | Usar `locationHint: 'sam'` para aproximar o Durable Object | A Cloudflare ainda não cria Durable Objects na América do Sul. Com essa dica, o objeto nasce no leste dos EUA (`enam`). | Evite o salto com cache de leitura e escrita otimista (`docs/LATENCIA.md`) | CHECKPOINT, "Piso de ~130 ms: correção e plano" |
| L2 | Confiar na troca de versão da Cache API para ler o que acabou de ser escrito | Em 12 de 14 testes a leitura veio velha logo depois de escrever | Teto de 30 s (`MAX_AGE_MS`) e cookie `cityou_w`, que faz ignorar o cache por 35 s | CHECKPOINT, "Latência, resultado na prévia" |
| L3 | Abrir várias sessões no mesmo dia sem registrar a branch | Em 13/11 entraram nove PRs e um commit ficou fora da `main` | Registrar a branch em "Em andamento por branch" e a linha no LEDGER antes de começar | CHECKPOINT, "Em andamento por branch" |
| L4 | Ativar a CSP sem `'wasm-unsafe-eval'` | O decodificador meshopt usa WASM e quebra os GLB | Manter a exceção só para WASM; o eval de JS segue bloqueado | Decisão do dono, 13/11/2026 |
| L5 | Rodar `npm run build` durante um benchmark | Contamina a medida | Medir com o `dist` parado | CHECKPOINT, "Como rodar" |
| L6 | Contar com um teste que nenhum script ou CI roda | O `catalog-migration.test.mjs` existia e não rodava | Ao criar um teste, confirmar que ele aparece na saída de `npm test` ou `test:worker` | CHECKPOINT, linha de testes de 13/11 |
| L7 | Descrever a opção C do ai-memory como push do wiki inteiro | O remoto git do wiki é backup de um wiki só. O C exporta só páginas escolhidas. | Seguir `docs/ai-memory.md` | CHECKPOINT, "Pendências soltas" |
| L8 | Declarar algo "feito" porque compilou ou porque um agente disse | Duas entregas compilaram e não funcionavam | Registrar o comando e o número observado | memória pessoal do dono, "validação real" |
| L9 | Tentar reconectar o MCP do ai-memory trocando versão ou opção do bridge | 3.4.6 e 3.4.7, com e sem `--no-session-id`, dão o mesmo `Invalid chunk size line` | Abrir issue upstream ou fazer o teste autenticado com o OK do dono | sessão de 15/11/2026 |
| L10 | Propor WebSocket direto ao objeto, KV como espelho ou Smart Placement para a latência | O WebSocket ainda viaja até o objeto, o KV grátis aceita 1.000 escritas por dia e o Smart Placement afasta o Worker do navegador | Seguir os itens de `docs/LATENCIA.md` | `docs/LATENCIA.md`, linha dos descartados |

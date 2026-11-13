# Tropeços conhecidos

Coisas que já custaram tempo neste repositório e como contornar. Acrescente uma linha quando tropeçar em algo novo (a skill `reflect` pede isso no fim da sessão). Estado e plano ficam em `docs/CHECKPOINT.md`.

| Sintoma | Causa | O que fazer |
|---|---|---|
| A sessão segue regras velhas | O `CLAUDE.md` carregado é o do branch, não o da `main` | `git fetch origin main && git show origin/main:CLAUDE.md`. O gancho de início de sessão avisa quando os dois diferem |
| Um commit seu não aparece na `main` | Foi enviado depois de o PR ser incorporado (aconteceu com `2802b41` em 11/11/2026) | Antes de enviar, confira se o PR do branch ainda está aberto. Se já entrou, recomece o branch a partir da `main` e abra outro PR |
| Dois agentes mexem na mesma tela | Sessões paralelas sem aviso (em 13/11/2026 foram nove PRs de três sessões) | Anote o branch e a etapa em "Em andamento por branch" no checkpoint antes de começar |
| A busca de código do GitHub volta vazia | O índice de busca não cobre este repositório | Leia os arquivos direto ou use `git grep` |
| `npx <ferramenta>` falha na nuvem | O ambiente não baixa ferramentas | Use o que já está em `node_modules`. A `find-skills` também não funciona lá |
| Os testes falham logo depois de trocar de branch | `node_modules` é do branch anterior | `npm ci --ignore-scripts`. O gancho de sessão faz isso na nuvem quando o `package-lock.json` muda |
| A cena para de redesenhar no TresJS | `invalidate` usado direto como ouvinte de evento vira `NaN` | `() => invalidate()` |
| Latência alta a partir do Brasil | Durable Objects e D1 não rodam na América do Sul: ficam na América do Norte | Medir com `npm run perf:api -- <url> --suite`. Histórico em `docs/BENCHMARKS.md` |
| Foto de comprovação recusada com 413 | O corpo do pedido aceita 24.000 bytes e a regra permite foto de 250.000 | Em aberto: "Itens sem dono no plano", no checkpoint |
| O limite de uso acaba no meio do trabalho | Subagentes em modelo caro: três em Opus com a sessão principal no esforço máximo bastaram | Executores e revisões amplas em Haiku. Ver "Como trabalhamos" no `CLAUDE.md` |
| Um subagente não entrega | Caiu por limite de uso | O trabalho dele fica salvo: mande uma mensagem para ele continuar em vez de criar outro |

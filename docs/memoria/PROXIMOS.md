# Próximos passos (fila com antecipação)

A ordem vem do `CHECKPOINT.md`. Cada item diz o que precisa existir antes, como conferir e o que vem depois. Assim o orquestrador prepara o passo seguinte antes de fechar o atual. Ao fechar um item, mova-o para `feito` no [LEDGER](LEDGER.md) e apague a linha daqui.

## 1. E6-csp: semana de CSP em produção
- **Antes:** a prévia está publicada com o #72 e a migração `0004_csp_violations.sql` foi aplicada.
- **Conferir:** chame `GET /api/admin/csp-violations` (o token de admin fica com o dono e nunca vai para um arquivo). O esperado é `violations: []` depois de 7 dias.
- **Pare e pergunte:** antes de ligar `CSP_ENFORCE=true`. É uma mudança em produção.
- **Risco:** tirar o `'wasm-unsafe-eval'` quebra o meshopt (LICOES L4).

## 2. Medir na prévia, a partir do Brasil, o que já está feito
- **Antes:** URL da prévia e cookie de uma conta de teste, fornecidos pelo dono. Nunca grave o cookie em arquivo.
- **Conferir:** `node tools/api-perf.mjs <prévia> --suite` e `tools/optimistic-playtest.mjs`; o cabeçalho `X-Cityou-Cache` dá a taxa de acerto do cache.
- **Registrar:** o número, a data e o commit em `docs/BENCHMARKS.md`. Atualize LAT-1a5 de `feito-código` para `feito`.
- **Depois:** decidir se o LAT-6 (cache de borda) vale a pena, com o número em mãos.

## 3. E6-d1: contas numa prévia publicada
- **Antes:** ler [CONTAS](../CONTAS.md), usar um D1 separado do de produção e aplicar as migrações.
- **Conferir:** `npm run test:session -- <url-da-prévia>`. O esperado é 32/32.
- **Depois:** destrava o E10 (portão para abrir contas).

## 4. Frentes que podem andar em paralelo (arquivos distintos dos itens 1 a 3)
- **E7b-veg:** vegetação e escala dos prédios no relevo, com o cityou-cidade-3d. Decidir pelas fotos de `tools/city-look.mjs`.
- **E7b-glb:** precisa da decisão do dono (regerar no Tripo ou trocar). Antecipação: peça ao cityou-analista um dossiê A/B com custo e tamanho.
- **E4 e E3:** conferir 390 px, as miniaturas da ilha e uma cidade com peças antigas.

## 5. Por último
Conferir a E8 num celular físico e fazer o renome `src/fifones` → `src/city` (num PR só de `git mv`). Em seguida, a E10.

## Conferências de saída de qualquer entrega
`npm test`, `npm run test:worker` e `npm run build`. Se tocar a sessão, rode também `test:session`. Registre o número que deu, não "passou". Não rode `build` durante um benchmark (LICOES L5).

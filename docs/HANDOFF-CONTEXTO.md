# Contexto para continuar em outro chat

Última atualização: 13/11/2026. Para ter o texto pronto para colar, com o estado do git de agora: `node tools/handoff.mjs` (ou `node tools/handoff.mjs --copy`). O texto abaixo da linha é o que a outra IA precisa ler.

---

## Prompt para colar na outra IA

Você vai continuar o trabalho num repositório que já tem várias sessões de IA. Leia primeiro, nesta ordem: `CLAUDE.md` (regras do projeto, obrigatórias), `docs/PLANO-PROXIMOS-PASSOS.md` (o plano) e este arquivo. Se você não tem acesso ao repositório, peça ao usuário os três arquivos.

**Projeto.** Cityou / BuildU: organização pessoal gamificada. Vue 3 + Three.js 0.172 (fixo) + TresJS 5.10.1 (fixo), Worker do Cloudflare com Durable Object (`worker/`), repositório `CityouApp/Cityou`. Branch de trabalho: `claude/blissful-gates-qmt20l`. Não abra pull request sem o usuário pedir; envie só para essa branch.

**Pedido do dono.** O app nasceu de uma cópia de exemplo do Fifones (app local na porta 8765). Restaram botões que abrem iframe para essa porta, rotas que fingem a ligação (`connected:false`) e prédios de IA que não pertencem ao Cityou. Quer: (1) tirar toda ligação com o Fifones, mantendo a ideia e a estrutura das telas, com conexões reais dentro do app; (2) app de qualidade, latência baixa, seguro, eficiente, agradável, com transições fluidas e estáveis; (3) **prédios 3D e terreno parecendo uma coisa só** (a base dos prédios renderizada melhor, mais fluidez visual); (4) um "voltar/desfazer" criativo depois de confirmar ações (a "Fita do Tempo" do plano).

**Regras que valem sempre (do `CLAUDE.md`).** O navegador nunca envia XP, créditos, nível ou desbloqueio; nenhuma mecânica pune ausência. Toda mudança que outro Claude precisa saber entra no `CLAUDE.md` no mesmo commit (e `docs/API.md` / `docs/INTERACTIONS.md` quando mexer em rota ou tela). Meça antes e depois, não estime. Não use `npx --yes` nem atualize three/TresJS. Limites 3D: uma luz direcional + hemisfério, sem sombras, sem mapa de ambiente, modelos opacos, 60 fps em celular médio. Página nova do app entra em `APP_PAGES` e `run_worker_first`.

**Plano (8 etapas, um PR cada; ordem 1 → 7a → 2 a 6 → 7b → 8):**
1. Medição de base (em andamento, ver abaixo).
7a. Unificar visualmente prédio e terreno: tabela de luz única, sem tone mapping na cidade, GLB e chão em `MeshLambertMaterial`, sombra de contato (+1 draw) com shadow map desligado, remoção das `PointLight` por prédio, base do prédio na cor do terreno, névoa única, entrada animada dos prédios.
2. Tarefas reais, cliente `api()` único com tratamento de 401, cidade sem iframe.
3. Catálogo: sai IA/StuntSync com migração e reembolso recalculado pelo servidor.
4. Painel sem iframe (aba Conta, Biblioteca "Em breve", Sair corrigido, miniaturas da ilha).
5. Agenda, Projetos e Peso reais no Durable Object.
6. CSP, corte do legado (apagar `backend/` FastAPI), cabeçalho `X-Cityou-Request`.
7b. Desenho sob demanda, GLB legados reduzidos, vegetação em volta dos prédios.
8. Fita do Tempo (desfazer/refazer com pilha estrita no servidor, janela de 120 s, sem contador) e transições sem quadro branco; renome `src/fifones` → `src/city` por último.

**Decisões do dono ainda sem resposta** (recomendação entre parênteses): reembolso de 100% das peças de IA/StuntSync retiradas (sim); Biblioteca "Em breve" e Professor/voz/Planilhas saem (sim); cidade sem sombra projetada, só sombra de contato (sim); apagar o FastAPI (sim); janela do desfazer de 120 s sem contador (sim). "Esqueci a senha" fica fora até haver e-mail com domínio.

**Estado da etapa 1 (medição de base).**
Feito e testado:
- `worker/demo.js` e `worker/index.js`: o `Server-Timing` das rotas de dados agora traz `do;dur=` (tempo do Durable Object) além de `total`. Teste novo em `tests/worker.test.mjs`; `npm run test:worker` = 30 passam, `npm test` = 60 passam.
- `tools/api-perf.mjs` reescrito: cookie da demonstração obtido sozinho, métodos e corpo (`--method`, `--body` com `{uuid}`, `{n}`, `{day}`), erros contados sem abortar, `--json`, e `--suite` (GET `/api/personal`, GET `/api/city` e uma escrita de cidade que gira uma peça). Uso: `node tools/api-perf.mjs http://127.0.0.1:8787 --suite 50`.
- `tools/city-frame-bench.mjs` novo: abre `city.html` no Chromium com CPU 4× mais lenta e rede 4G, semeia a cidade do Rio por API (ruas + prédios com GLB) e mede 1º quadro, tempo até GLB e terreno prontos (frio e com cache), CPU de cada `renderer.render`, intervalo de rAF, draws, triângulos, programas e texturas. Precisa do Worker em modo teste (5.000 moedas): `npx wrangler dev --port 8787 --ip 127.0.0.1 --var CITYOU_TEST_OPEN_REGIONS:1` e depois `CITYOU_CHROME=/opt/pw-browsers/chromium node tools/city-frame-bench.mjs http://127.0.0.1:8787 --runs 3`.

Medidas locais (Worker local e renderização por software, **não** são de produção nem de celular):
- API local, 50 chamadas: `GET /api/personal` ida e volta 8,6 ms (p95 11,6), servidor 1 ms; `GET /api/city` 7,6 ms (p95 10,8); girar peça 9,8 ms (p95 15,4). Timers do Worker têm resolução de 1 ms.
- Cidade do Rio, 3 rodadas: sem prédios semeados 57.752 triângulos, 51 draws, 3 texturas, 1º quadro ~2,5 s, pronto ~6,1 s; com 25 prédios 203.433 triângulos, 74 draws, 12 texturas, pronto ~10,6 s (com cache ~4,6 s), CPU de render p50 ~6,8 ms (p95 15,8). Só 25 de 30 prédios cabem no Rio com as quatro ruas que o bench traça.

**Falta para fechar a etapa 1:**
- A meta "duas execuções diferem menos de 10%" **ainda não foi cumprida**: a dispersão entre rodadas ficou em 1,07× sem prédios e 1,28× com 25 prédios. Comparar as medianas de duas execuções completas (a execução b estava rodando); se continuar acima de 10%, subir `--runs`, aumentar `FRAMES` ou medir CPU de render em vez de rAF.
- Adicionar `perf:city` ao `package.json`, gravar a tabela de base em `docs/WORLD-PERF.md` (marcando que é local) e citar os comandos novos em `CLAUDE.md`.
- Rodar `--suite` contra uma prévia publicada (precisa de cookie válido; produção exige login com o D1 ligado) para ter a base real de latência. Não foi feito.
- `tools/pilot-perf.mjs` provavelmente está quebrado: tenta construir `home` na Ilha Inicial, o que o PR 22 proibiu. Não conferido.

**Ferramentas e skills do projeto.** Skills em `.claude/skills/` (lista no `CLAUDE.md`). Entraram nesta rodada, só `.md` e fixadas por commit: `council-review`, `owasp-security`, `threejs-lighting`, `threejs-materials`, `threejs-textures`, `threejs-postprocessing`. `find-skills` não funciona na nuvem (proxy bloqueia `skills.sh`): use a busca do GitHub e `git clone`. Agent Reach foi avaliado e não instalado (exige programa Python com navegador próprio e sessões de login).

**Ambiente.** `npm ci` já resolve as dependências (`node_modules` não vai para o git). Testes: `npm test`, `npm run test:worker`, `npm run build`. Navegador de teste: `CITYOU_CHROME=/opt/pw-browsers/chromium`.

**Como trabalhar a partir daqui.** Confirme com `git status` e `git log` o que está commitado. Termine a etapa 1, depois comece pela 7a. Em cada etapa: ler `CLAUDE.md`, medir antes e depois, rodar os testes, atualizar `CLAUDE.md` e docs no mesmo commit, e dizer o que não foi verificado.

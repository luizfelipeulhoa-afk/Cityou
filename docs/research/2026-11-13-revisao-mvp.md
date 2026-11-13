# Revisão do MVP e estudo do modo orquestrador (13/11/2026)

> **Isto é uma análise, não o plano.** O plano que vale é [docs/PLANO-PROXIMOS-PASSOS.md](../PLANO-PROXIMOS-PASSOS.md) e o estado está em [docs/CHECKPOINT.md](../CHECKPOINT.md). Este texto foi escrito sobre a `main` na PR #22, antes das PRs #24 a #32. O que a PR #32 já resolveu e o que ficou sem dono está em [council/COUNCIL_SINTESE.md](../../council/COUNCIL_SINTESE.md). O roteiro em etapas daqui (seção 5) foi substituído pelo plano oficial. Seguem úteis: a leitura das PRs #18 a #22, a lista de achados, o fluxo do draw.io e o estudo medido do orquestrador com executores em Haiku.


## 0. Para retomar em qualquer sessão

- **Repositório:** `CityouApp/Cityou`. A `main` está na PR #22. Nada foi alterado nesta sessão (modo de plano, só leitura).
- **Produção hoje:** o Worker `cityou` existe; a conta do Cloudflare tem **zero** bancos D1. Então as contas (PR #21) estão no código, mas desligadas, e o app roda como demonstração por cookie. `REQUIRE_LOGIN="true"` não tem efeito até existir o D1.
- **Trabalho meu fora da `main`:** a PR #12 foi incorporada no commit `7cd822c`. O commit seguinte, `2802b41` (botão Voltar, troca de mapa ilha/Rio, "Minha cidade" leva ao Rio, tela de partida presa), ficou só no branch `claude/exciting-mayer-xf1pmj`.
- **O que esta sessão produziu:** leitura das PRs #18 a #22 e do backend da `main`; council de 3 especialistas com conferência dos achados graves; checagem da documentação do Cloudflare e do Claude Code; estudo medido do arranjo "THE OMEGA".
- **Próximo passo:** Etapa 0 (seção 5), começando por gravar a regra "ler o `CLAUDE.md` antes de tudo".

## 1. Contexto

Você pediu: analisar as 5 últimas PRs, focar no backend e ligar as funções novas, cuidar de estrutura, segurança, fluidez e eficiência, antecipar problemas, indicar ferramentas, e organizar o trabalho até o MVP sabendo que vai usar o draw.io. Depois pediu um council de especialistas, um estudo do "THE OMEGA" (orquestrador com subagentes em Haiku) com comparação em porcentagem, e que fique gravado no projeto que o `CLAUDE.md` é lido antes de qualquer trabalho.

Entendi "incorporar isso pro meu main" como levar o arranjo para a branch `main` do projeto. Se era um arquivo `main.py` de outro projeto, me diga qual: neste repositório não existe.

## 2. As 5 últimas PRs

| PR | O que entrou | O que ficou pendente |
|---|---|---|
| #18 | Terreno real do Rio como cenário da cidade (só visual) | A cidade passou de 23 mil para 64 mil triângulos; não medido em celular. A zona jogável real continua fora |
| #19 | Nove prédios do Rio com modelo 3D (62 MB reduzidos a 2,4 MB) | Custos são propostas; nove prédios somam 58 mil triângulos; não medido em celular |
| #20 | `POST /api/admin/credits`: 50.000 moedas de teste com segredo | Segredo compartilhado; com contas, vale uma vez por conta criada; sem registro de quem usou |
| #21 | Página de apresentação, contas (`worker/auth.js`) e painel em `/app` | O D1 não existe; falta "esqueci a senha", perfil, exportar e apagar; nunca rodou com D1 de verdade |
| #22 | Farol, Cabana e Píer construíveis na ilha; `docs/DESIGN-SYSTEM.md`; login obrigatório | Miniaturas da ilha; o login só vale com D1 |

O que as cinco mostram juntas:
- As funções chegam mais rápido que a base: contas prontas, mas desligadas e sem as proteções da seção 3.
- "Não medido em aparelho real" aparece em 3 das 5.
- Documentos atrasados: `docs/DATA-MODEL.md` descreve tabelas que o código não usa; `docs/GAME-DESIGN.md` ainda diz que a ilha é só cenário.
- Sessões em paralelo se atropelam: meu commit ficou fora da `main`, e a decisão "ilha só cenário" (PR #12) foi trocada dois dias depois (PR #22).

## 3. O que o council achou

Três especialistas independentes leram a `main` (backend e segurança; frontend e integração; produto, economia e LGPD). Conferi no código 12 achados graves antes de aceitar: os 12 se confirmaram. Uma hipótese minha caiu (eu supunha os dados perto do usuário, em São Paulo; a documentação do Cloudflare diz que não).

**A. Bloqueiam ligar contas reais**

| # | Problema | Onde | Conferido |
|---|---|---|---|
| A1 | O cookie da demonstração continua abrindo os dados da conta depois do cadastro, sempre que o login obrigatório não estiver valendo | `demoApi` em `worker/demo.js`; `signup` em `worker/auth.js` | sim |
| A2 | Limite de tentativas de login falha com pedidos simultâneos, é só por e-mail (qualquer um tranca a conta de outro) e o cadastro não tem limite | `login`, `signup` | sim |
| A3 | Custo de CPU do hash de senha nunca foi medido; no plano Free o limite é 10 ms por pedido e o login pode falhar | `hashPassword` | não medido |
| A4 | O Worker cria as tabelas sozinho e as migrações usam `CREATE TABLE` sem `IF NOT EXISTS`: rodar as migrações depois falha | `ensureSchema`; `migrations/0001` | sim |
| A5 | Teto de 100 registros herdado da demonstração: hábitos, metas, notas, finanças e refeições somam 100 no total, sem rota de apagar | `DemoSession.add` | sim |
| A6 | Meta com alvo 1 (o padrão) paga 25 moedas no primeiro registro, sem teto diário | `rewardGoal` | sim |
| A7 | Não existe exportar nem apagar (registro, foto, conta). Sem aviso de privacidade, termos nem idade no cadastro. Os dados ficam na América do Norte | rotas; `index.html` | sim |
| A8 | Sem "esqueci a senha" e sem confirmação de e-mail: dá para cadastrar o e-mail de outra pessoa | `docs/CONTAS.md` | sim |
| A9 | Sessão vencida (401) não é tratada em nenhuma tela; o painel tem um segundo cliente de API sem limite de tempo; textos do "Fifones original, porta 8765" aparecem em produção | `src/App.vue`, `src/CityApp.vue`, `src/WorldApp.vue` | por amostragem |
| A10 | Com o banco fora do ar, toda a API responde 500 (o guia promete que o app segue como demonstração) | `handleApi` em `worker/index.js` | sim |

**B. Para um MVP sólido**

| # | Problema | Onde |
|---|---|---|
| B1 | Sessão de 30 dias fixa, sem renovação nem limpeza; tabelas `sessions` e `login_attempts` só crescem | `worker/auth.js` |
| B2 | Páginas sem cabeçalhos de segurança (CSP, `frame-ancestors`, HSTS) | `worker/index.js` |
| B3 | Foto de comprovação: o corpo aceita 24.000 bytes, a regra permite 250.000, então foto acima de uns 17 KB volta erro 413 | `readBody` × `shared/game/proof.js` |
| B4 | Cada resposta devolve todos os registros e lê todas as fotos; a cidade consulta o servidor a cada 10 e 30 segundos e o painel a cada 60 | `overview`; `CityApp.vue` |
| B5 | Cada pedido faz uma leitura no D1 e depois uma chamada ao Durable Object, os dois na América do Norte. Latência nunca medida | `handleApi` |
| B6 | Moedas de teste sem registro de uso | `adminCredits` |
| B7 | O `resumo` (moedas, nível, tetos do dia) já vem do servidor e nenhuma tela lê; o painel não mostra a etapa do prédio nem as comprovações já feitas | `App.vue` |
| B8 | O alarme da demonstração não é renovado: apaga tudo 30 dias depois da primeira escrita, mesmo com uso diário. E o dono do objeto só é marcado no primeiro pedido depois do cadastro | `DemoSession.fetch`, `alarm` |
| B9 | Marcas de terceiros no catálogo (ChatGPT, Claude, Gemini, Grok, StuntSync, Sede Fifones) | `shared/game/city-catalog.json` |
| B10 | Fuso fixo em São Paulo; criar registro não aceita `request_id` (reenvio duplica); o servidor aceita qualquer data | `addEntry`, `addTask` |
| B11 | Sem registro de cadastro, login e bloqueio; CI sem auditoria de dependências e sem passo de deploy | `.github/workflows/ci.yml` |
| B12 | Navegação: a cidade não tem link para o painel; login vencido dentro do painel abriria a página de apresentação dentro do quadro | `CityApp.vue`, `pageGate` |
| B13 | Estrutura: `worker/demo.js` junta rotas, armazenamento, regras, cidade e viagens, e quase toda mudança passa por ele, o que gera conflito entre sessões paralelas. Nomes herdados (`DemoSession`, `X-Fifones-City`) já não descrevem o que o código faz | `worker/demo.js` |

**Funções novas: o que já está ligado**

| Função | Estado hoje | Etapa |
|---|---|---|
| Contas (criar, entrar, sair) | Ligadas nas telas; desligadas em produção por falta do D1 | 4 |
| `resumo` (moedas, nível, tetos do dia) | O servidor calcula; nenhuma tela lê | 3 |
| Comprovação com nota e foto | Envio ligado; rever o que já foi comprovado e a foto, não. Foto real pode voltar erro 413 (B3): conferir no navegador | 3 |
| Prédios de atividade e etapas | Construir pelo painel funciona; a etapa aparece na cidade, não no painel | 3 |
| Prédios do Rio e da ilha | Ligados; faltam as miniaturas da ilha | 3 |
| Terreno real do Rio | Ligado como cenário; a zona jogável real é decisão de jogo | fora do MVP |
| Viagens | Prontas no servidor, fechadas por `TRAVEL_OPEN=false` | depois do MVP |
| Botão Voltar e troca de mapa | Fora da `main` (commit `2802b41`) | 0 |

**C. Produto e lei (o que você não pediu e precisa saber)**

- **Lei.** Refeições e hábitos de saúde podem ser dado sensível (LGPD, art. 5º, II). Menores exigem consentimento dos pais (art. 14). Dados fora do país são transferência internacional (art. 33). O "ECA Digital" (Lei 15.211/2025) está em vigor desde 17/03/2026 e não aceita mais autodeclaração de idade como verificação. O texto de privacidade e dos termos precisa de advogado. Eu não sou advogado.
- **Economia.** Um usuário típico ganha cerca de 35 moedas por dia e compra um de cada prédio em cerca de um mês (conta do especialista, não conferida). Depois disso as moedas ficam sem uso, porque as viagens estão fechadas. A primeira etapa do prédio de atividade só chega com 8 dias e 2 semanas de prática.
- **Custos de plataforma.** Durable Objects e D1 não rodam na América do Sul: todo pedido do Brasil vai à América do Norte.
- **Dois backends.** O FastAPI local e o Worker precisam das mesmas mudanças. É trabalho dobrado.

## 4. Decisão de arquitetura para o MVP

Manter o que o código já faz: **Worker + um Durable Object por pessoa (dados) + D1 só para contas**. Registrar isso como decisão e corrigir `docs/DATA-MODEL.md`, que descreve outra coisa. O banco em São Paulo fica para depois do MVP, com latência medida. O FastAPI local fica congelado (sem funções novas).

## 5. Roteiro até o MVP

Cada etapa é um conjunto de commits pequenos, cada um com teste. O `CLAUDE.md` muda no mesmo commit da mudança, como ele mesmo manda.

**Etapa 0 — Organização (não muda o jogo)**
1. Gravar a regra "leia o `CLAUDE.md` antes": seção no topo do `CLAUDE.md`, gancho de início de sessão (`.claude/settings.json` + `.claude/hooks/session-start.sh`, feito pela skill `session-start-hook`) que repete o aviso e diz se o `CLAUDE.md` do branch está atrás da `main`, e `AGENTS.md` na raiz para o Codex e outras IAs.
2. Recomeçar o branch a partir da `main` e reaplicar o commit `2802b41`, adaptado (a ilha agora tem catálogo; o mapa já tem "Voltar ao Cityou"). Pronto quando: `npm run test:nav` passa.
3. Criar `docs/progress.md`, `docs/decisions.md` e `docs/known-issues.md`, já preenchidos.
4. Criar `docs/diagrams/` com quatro diagramas do draw.io (seção 6) e um teste que valida os arquivos.
5. Criar `.claude/agents/builder.md`, `.claude/agents/reviewer.md` e `.claude/skills/reflect/SKILL.md`; registrar em `.claude/skills/SOURCES.md`.
6. Gravar os três relatórios do council em `council/` com `COUNCIL_SINTESE.md`.
7. Pôr uma nota no topo dos documentos atrasados apontando para `docs/decisions.md`.

**Etapa 1 — Segurança antes de ligar contas** (A1, A2, A3, A4, A10, B2, B6)
- A1: o Durable Object com dono recusa pedido sem o cabeçalho da conta (401); o cadastro e o login trocam o cookie da demonstração; o cadastro marca o dono na hora.
- A2: contador atômico antes do hash; limite por e-mail e IP, e por IP; **cadastro só com convite** enquanto o beta for fechado.
- A3: marcar o tempo do hash no `Server-Timing` e medir numa prévia.
- A4: migrações idempotentes e um teste que compara o esquema do Worker com o das migrações.
- A10: banco fora do ar responde 503 com mensagem clara; corrigir o guia.
- B2: `frame-ancestors 'self'` (o painel embute a cidade e o mapa), `Referrer-Policy`, HSTS.
- B6: registrar o uso das moedas de teste.

**Etapa 2 — Limites e dados da conta** (A5, A6, A7 na parte técnica, B8, B13)
- Primeiro, dividir `worker/demo.js` em poucos arquivos por assunto, só movendo código, com os testes passando antes e depois. Aviso em `docs/progress.md` antes, porque conflita com qualquer branch aberto que toque nesse arquivo. Os nomes herdados ficam como estão (trocar o nome da classe exige migração do Durable Object).
- Tetos próprios para conta, sem a palavra "demonstração"; editar e apagar registro e tarefa.
- `GET /api/me/export` e `DELETE /api/me` (apaga o objeto, as sessões e anonimiza a linha da conta).
- Recompensa de meta com alvo mínimo e teto diário, em `shared/game/rules.js`.
- Alarme renovado a cada escrita. Diagrama `02-dados`.

**Etapa 3 — Telas prontas para contas** (A9, B7, B12)
- Um cliente de API só (`src/fifones/api.js`), com limite de tempo e tratamento único de 401 que leva à entrada.
- Esconder as pontes e os textos do Fifones fora do computador local.
- Barra de moedas e nível lendo o `resumo`; etapa do prédio e comprovações no painel.
- Link da cidade para o painel. Diagrama `05-telas-e-rotas`.

**Etapa 4 — Ligar o D1**
Lista: confirmar o plano do Cloudflare e o custo do hash; criar um D1 só para prévias e outro para produção; rodar o fluxo de conta inteiro no navegador numa prévia; ensaiar uma restauração; só então pôr o `database_id` de produção.

**Etapa 5 — Eficiência e fluidez** (B3, B4, B5)
Medir antes e depois com `npm run perf:api`. Depois: resposta do painel por janela de dias, fotos fora da listagem, atualização no foco em vez de relógio, sessão em memória curta e teste de `placement`.

**Etapa 6 — E-mail e textos legais** (A8 e a parte legal de A7). Depende de domínio próprio e de advogado.

**Etapa 7 — Operação** (B1, B9, B10, B11): limpeza agendada, registros, auditoria no CI, marcas fora do catálogo.

**Portão do MVP:** contas ligadas com convite e nenhum item A aberto; uma pessoa nova consegue criar conta, registrar, concluir, construir, sair, entrar em outro aparelho, exportar e apagar; sessão vencida leva à entrada; testes e o fluxo de conta no navegador passam no CI; latência medida e anotada.

## 6. Como trabalhar com o draw.io

- **Onde:** `docs/diagrams/*.drawio`. É XML: o Git mostra a diferença, você abre no draw.io (aplicativo, site ou a extensão "Draw.io Integration" do VS Code) e eu leio e atualizo.
- **Para aparecer no GitHub:** exporte como `.drawio.svg` com a cópia do diagrama embutida. O arquivo continua editável.
- **Diagramas** (cada um responde uma pergunta):

| Arquivo | Pergunta | Quando |
|---|---|---|
| `00-roteiro` | O que falta, em que ordem, o que está travado | Etapa 0 |
| `01-arquitetura` | Quem fala com quem e onde os dados ficam | Etapa 0 |
| `03-fluxos-de-conta` | Cadastro, entrada, pedido com sessão, saída, sessão vencida | Etapa 0 |
| `06-ameacas` | Como o app é atacado e o que barra cada ataque | Etapa 0 |
| `02-dados` | O que o D1 e o Durable Object guardam de verdade | Etapa 2 |
| `05-telas-e-rotas` | Cada tela, cada botão e a rota que ele chama | Etapa 3 |
| `04-ciclo-do-jogo` | De onde vêm e para onde vão as moedas | quando mexermos na economia |

- **Regras:** cada cartão do roteiro tem um código (por exemplo `E1-A1`) que aparece em `docs/progress.md` e no commit. Verde é feito, amarelo é em andamento, vermelho é travado, cinza é decisão sua. Todo diagrama tem uma caixa "Fonte" com os arquivos e a data. Mudou o código, o diagrama muda no mesmo commit.
- **Seu ciclo:** você move ou cria cartões no `00-roteiro` e salva no repositório; na sessão, pede "leia o roteiro e faça o próximo cartão"; eu implemento, atualizo o cartão e o diagrama afetado; você revisa olhando o diagrama.
- **Ferramenta oficial:** o plugin do draw.io para o Claude Code (`/plugin marketplace add jgraph/drawio-mcp` e `/plugin install drawio@drawio`) escreve `.drawio` e exporta imagem se o draw.io Desktop estiver instalado. A prévia dentro da conversa envia o diagrama para `mcp.draw.io`: não ponha segredo em diagrama. Na nuvem eu escrevo o XML direto, sem plugin.

## 7. Estudo do "THE OMEGA"

**As configurações existem?** Conferido hoje na documentação do Claude Code:

| Item | Existe | Observação |
|---|---|---|
| `CLAUDE_CODE_SUBAGENT_MODEL=haiku` | sim | É o padrão dos subagentes; perde para o `model:` do agente e para o modelo pedido na chamada |
| `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` | sim | Força um modelo em todos os subagentes, inclusive revisores e o council |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40` | sim | Compacta a 40% da janela; só adianta, não adia. A documentação não cita contrapartida |
| `/effort xhigh` | sim | Subagente em outro modelo não herda o nível; o agente pode ter `effort:` próprio |
| `.claude/agents/*.md` com `model: haiku` | sim | Carregam também nas sessões na nuvem |
| `CLAUDE.md` importando arquivos com `@` | sim | Não reduz custo: o que é importado entra em toda sessão. Meta da documentação: menos de 200 linhas |

**O que medi neste repositório** (uma rodada por caso; servem como indicação, não como prova):

| Medida | Resultado | Tipo |
|---|---|---|
| 3 especialistas em paralelo em vez de em fila | 351 s em vez de 686 s: **49% menos tempo** | medido |
| Achados graves únicos com o council | 12, contra 5 que eu tinha sozinho no mesmo intervalo: **+140%** (eu só tinha lido 5 arquivos do backend) | medido |
| Mesma revisão em Haiku 5.5 e em Opus 5.5 (backend + frontend) | Haiku achou **76%** dos 58 achados válidos somados; Opus, **79%** | medido |
| Os dois modelos juntos | 58 achados, contra 46 do Opus sozinho: **+26%** | medido |
| Tempo do Haiku nessas duas revisões | 326 s contra 529 s: **38% menos** (uma 58% mais rápida, a outra igual) | medido |
| Tokens do Haiku | 352 mil contra 323 mil: **9% mais** | medido |
| Custo do Haiku pela tabela de preços da API | **entre 86% e 97% menor** | calculado |
| Erros nas revisões | Haiku: 3 (uma correção que quebraria os quadros do próprio painel, um tamanho de arquivo errado, e pôs o risco mais sério em 12º lugar). Opus: nenhum nos 12 que conferi | medido |
| Compactar a 40% | cerca de 60% menos contexto por turno em sessões muito longas; nada nas curtas; em troca, 2,5 vezes mais compactações | calculado |
| Executor em Haiku escrevendo código | — | **não medido** |

Ressalvas: dos 58 achados, conferi 33 direto no código; os outros não contradizem o que li. O Haiku recebeu uma dica a mais (a busca de código do GitHub não funciona neste repositório) e rodou depois de uma queda por limite de uso. O limite de 5 horas da sua conta estourou nesta sessão logo depois de 3 especialistas em Opus, um guia e um arquiteto, com a sessão principal no modelo mais caro e no esforço máximo.

**Conclusão:** os subagentes funcionam, e em Haiku entregam uma revisão quase tão completa quanto em Opus por uma fração do custo. O que o Haiku perde é em ordem de prioridade e em precisão, então a regra do OMEGA de o orquestrador conferir tudo antes de aceitar é o que faz o arranjo funcionar.

| Peça do OMEGA | O que fazer |
|---|---|
| Orquestrador planeja, escreve o pedido e confere | Adotar |
| Pedido com objetivo, arquivos e "Pronto quando:" | Adotar |
| `builder` e `reviewer` em Haiku | Adotar para tarefas mecânicas e bem definidas. Contas, sessão, limites de abuso e regras de moedas ficam com o orquestrador |
| `CLAUDE_CODE_SUBAGENT_MODEL=haiku` | Adotar |
| `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` | Não adotar: tiraria a opção de uma revisão de segurança em modelo forte |
| Compactar a 40% | Adotar depois que os três documentos existirem, porque é neles que o estado sobrevive à compactação |
| `/effort xhigh` | Usar para planejar e revisar segurança; `high` no dia a dia |
| Criar `CLAUDE.md` | Adaptar: ele já existe (20 KB). Acrescento uma seção, não recrio |
| `docs/progress.md`, `decisions.md`, `known-issues.md` | Adotar: resolve o commit perdido e as decisões cruzadas |
| Skill `reflect` | Adotar |

**Piloto para fechar o número que falta** (na Etapa 0 e 1): três tarefas reais feitas pelo `builder` em Haiku, com pedido fechado. Anoto se passou de primeira, quantas devoluções, tokens e tempo. Fica em Haiku a categoria em que 2 de 3 passarem com no máximo uma devolução.

**As configurações que você põe à mão** (eu não consigo): nas sessões na nuvem, nas variáveis do ambiente: `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40` e `CLAUDE_CODE_SUBAGENT_MODEL=haiku`. No computador, `export` das duas antes de abrir o Claude Code. Em cada sessão de planejamento, `/effort xhigh`.

## 8. Ferramentas

- **Instalar:** plugin oficial do draw.io (seção 6); plugin "Cloudflare" do diretório (o conector do Cloudflare desta sessão está marcado como descontinuado).
- **Avaliar antes de instalar:** plugin "Backend Design" (comunidade, traz um gancho próprio).
- **Já na sua conta, usar por etapa:** `council-especialistas` (antes da Etapa 4), `ponytail` (sempre: a solução mais simples), `behavior-design-etico` e `gamificacao-saude-etica` (mudanças de economia), `supply-chain-risk-auditor` (Etapa 7), `test-suite-generator` (Etapa 2).
- **Em todo commit que tocar `worker/`:** `/security-review`.
- **Não agora:** TypeScript, framework de rotas, banco externo.

## 9. Decisões que são suas

Sigo o padrão abaixo se você não disser outra coisa.

| # | Decisão | Padrão |
|---|---|---|
| D1 | Público do MVP | Beta fechado, com convite |
| D2 | Onde ficam os dados no MVP | Como está (América do Norte), com aviso; São Paulo depois |
| D3 | Recompensa de meta | Só com alvo 3 ou mais, no máximo 2 por dia |
| D4 | Refeições e dados de saúde | Consentimento próprio no primeiro uso, se o advogado aprovar |
| D5 | Idade | 18 anos ou mais no MVP |
| D6 | FastAPI local | Congelar |
| D7 | Marcas no catálogo | Tirar antes de abrir contas |
| D8 | Modelo dos subagentes | Haiku como padrão, sem forçar |

Só você resolve: plano do Cloudflare, domínio e serviço de e-mail, advogado, um celular real para medir, revogar os tokens antigos do Cloudflare.

## 10. O que executo ao aprovar

1. Etapa 0 inteira, na ordem da seção 5, começando pela regra do `CLAUDE.md`.
2. Etapa 1, um commit por item, com teste.
3. Envio para `claude/exciting-mayer-xf1pmj`. Abro o PR quando você pedir.

## 11. Verificação

- A cada commit: `npm test`, `npm run test:worker`, `npm run build`. Com mudança no Python: `pytest tests -q`.
- Etapa 0: `npm run test:nav`; o teste dos diagramas; abrir os `.drawio` no draw.io; iniciar uma sessão nova e ver o aviso do gancho.
- Etapa 1: testes novos em `tests/worker.test.mjs` (cookie antigo não abre a conta; logins simultâneos não furam o teto; cadastro sem convite é recusado; banco fora do ar dá 503; esquema do Worker igual ao das migrações).
- Etapa 4: fluxo de conta completo no navegador contra uma prévia com D1.
- Etapa 5: `npm run perf:api` antes e depois, com os números em `docs/progress.md`.

## Apêndice A — Arquivos novos da Etapa 0 (para você ver antes)

**Trecho novo no topo do `CLAUDE.md`** (o resto do arquivo fica):

```md
## Antes de qualquer trabalho (obrigatório)

1. Leia este arquivo inteiro, na versão da `main` (`git fetch origin main && git show origin/main:CLAUDE.md`), mesmo que o seu branch tenha outra.
2. Leia `docs/progress.md` (onde estamos), `docs/decisions.md` (o que está decidido) e `docs/known-issues.md` (tropeços conhecidos).
3. Só então planeje ou edite. Se o pedido contrariar uma decisão registrada, avise antes de fazer.

## Como trabalhamos: orquestrador e executores

- A sessão principal é o orquestrador: planeja, escreve os pedidos e confere os resultados.
- Executores são os subagentes de `.claude/agents/` (`builder` e `reviewer`, em Haiku). Todo pedido traz objetivo, arquivos a ler e uma linha "Pronto quando:" com um comando ou algo que dá para ver.
- Antes de aceitar o resultado de um executor, o orquestrador roda a conferência ele mesmo. Falhou: devolve com a falha.
- Ficam com o orquestrador: `worker/auth.js`, sessão, limites de abuso, regras de moedas e decisões de arquitetura.
- Fim de sessão: skill `reflect`.
```

**`AGENTS.md`**

```md
# Agentes de IA neste repositório
Antes de qualquer trabalho, leia `CLAUDE.md` inteiro, na versão da `main`, e os três arquivos que ele manda ler. As regras de lá valem para qualquer agente.
```

**`.claude/hooks/session-start.sh`** (nunca derruba a sessão)

```bash
#!/usr/bin/env bash
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
echo "ANTES DE QUALQUER TRABALHO: leia CLAUDE.md, docs/progress.md, docs/decisions.md e docs/known-issues.md."
timeout 20 git fetch --quiet origin main 2>/dev/null || true
if git rev-parse --verify --quiet origin/main >/dev/null && ! git diff --quiet HEAD origin/main -- CLAUDE.md 2>/dev/null; then
  echo "ATENÇÃO: o CLAUDE.md deste branch difere do da main. Leia: git show origin/main:CLAUDE.md"
  git log --oneline HEAD..origin/main | head -15
fi
exit 0
```

**`docs/progress.md`**: "Onde estamos", "Próximo" (os cartões do roteiro) e "Registro" (uma linha por sessão, com data).
**`docs/decisions.md`**: tabela data, decisão, porquê, onde vale. Começa com as decisões já fechadas (ilha com três prédios, login obrigatório, uma paleta, TresJS) e as abertas (banco em São Paulo, números da economia).
**`docs/known-issues.md`**: começa com os tropeços desta sessão: o `CLAUDE.md` carregado é o do branch; commit enviado depois do merge fica fora da `main`; a busca de código do GitHub não funciona aqui; `npx` não baixa ferramentas na nuvem; subagentes em modelo caro gastam o limite depressa.

**`.claude/agents/builder.md`**

```md
---
name: builder
description: Escreve código a partir de um pedido fechado, roda a conferência do pedido e relata o que rodou. Para tarefas mecânicas e bem definidas.
model: haiku
---
Você recebe um pedido com objetivo, arquivos a ler e uma linha "Pronto quando:".
Leia o CLAUDE.md e os arquivos do pedido antes de editar. Mude só o que o pedido pede.
Rode a conferência e relate o comando exato e a saída.
Se a conferência falhar, diga que falhou e mostre a saída. Só diga "pronto" quando ela passar.
Não mexa em worker/auth.js, regras de moedas nem configuração de deploy: devolva o pedido.
```

**`.claude/agents/reviewer.md`**

```md
---
name: reviewer
description: Lê um diff contra o pedido que o gerou e lista o que não cumpre o pedido. Só leitura.
model: haiku
disallowedTools: Edit, Write, NotebookEdit
---
Você recebe o pedido original e um diff.
Liste, da falha mais grave para a menos grave, o que no diff não cumpre o pedido ou as regras do CLAUDE.md, com arquivo e trecho.
Não reescreva o código e não invente problema. Se nada falha, diga isso e o que você conferiu.
```

**`.claude/skills/reflect/SKILL.md`**

```md
---
name: reflect
description: Fecha a sessão. Lista o que deu errado ou demorou, propõe o menor ajuste que teria evitado e espera o OK. Use no fim de cada sessão de trabalho.
---
1. Liste o que deu errado ou demorou nesta sessão, com a evidência (comando, erro, arquivo).
2. Para cada item, proponha o menor ajuste em uma skill, no CLAUDE.md ou em docs/known-issues.md que teria evitado. Mostre o trecho exato.
3. Atualize docs/progress.md e acrescente as decisões novas em docs/decisions.md.
4. Mostre tudo e espere o OK do responsável antes de aplicar ajuste em skill ou no CLAUDE.md.
```

## Apêndice B — Seu pedido melhorado (Prompt Master)

```
<contexto>
Cityou (CityouApp/Cityou): Vue 3 + Three.js + Cloudflare Worker, um Durable Object por pessoa e D1 só para contas. A main está na PR #22. Vários agentes trabalham em paralelo.
</contexto>
<antes_de_tudo>Leia o CLAUDE.md da main, docs/progress.md, docs/decisions.md e docs/known-issues.md.</antes_de_tudo>
<tarefa>
1. Analise as 5 últimas PRs: o que entrou, o que ficou pendente, o que conflita.
2. Revise o backend com um council de especialistas (backend e segurança, frontend e integração, produto e LGPD). Confira você mesmo cada achado grave antes de aceitar.
3. Monte o roteiro até o MVP em etapas pequenas, cada uma com teste e critério de pronto, priorizando segurança, estrutura, fluidez e eficiência, e ligando as funções novas às telas.
4. Diga o que eu não pedi e deveria: riscos legais, de custo e de operação.
5. Organize o trabalho para o draw.io: quais diagramas, onde ficam, como eu edito e como você lê.
6. Estude o arranjo "orquestrador com executores em Haiku": confira cada configuração na documentação oficial, rode a mesma tarefa em dois modelos neste repositório e dê a comparação em porcentagem, separando medido, calculado e não medido.
</tarefa>
<restricoes>Modo de plano: não altere nada. Não invente número. O servidor é dono de moedas e desbloqueios. Nenhuma mecânica pune ausência. A solução mais simples que funciona.</restricoes>
<saida>Um plano único: estado atual, achados por prioridade, roteiro, fluxo do draw.io, ferramentas, decisões que são minhas com recomendação, e o primeiro passo. Mostre cada arquivo novo antes de escrever.</saida>
<pronto_quando>Cada achado grave tem arquivo e função; cada etapa tem um comando de conferência; cada porcentagem diz de onde veio.</pronto_quando>
```

🎯 Alvo: Claude Code. 💡 Separei o pedido em seis entregas conferíveis e exigi a origem de cada número, para o plano não sair com estimativa disfarçada de medida.

## Fontes

- Cloudflare: [local dos dados do D1](https://developers.cloudflare.com/d1/configuration/data-location/), [local dos Durable Objects](https://developers.cloudflare.com/durable-objects/reference/data-location/), [limite de taxa nos Workers](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [placement](https://developers.cloudflare.com/workers/configuration/placement/).
- Claude Code: [subagentes](https://code.claude.com/docs/en/sub-agents.md), [modelos e esforço](https://code.claude.com/docs/en/model-config.md), [variáveis de ambiente](https://code.claude.com/docs/en/env-vars.md), [memória e CLAUDE.md](https://code.claude.com/docs/en/memory.md).
- draw.io: [jgraph/drawio-mcp](https://github.com/jgraph/drawio-mcp), [extensão do VS Code](https://github.com/hediet/vscode-drawio).
- Lei: [LGPD no Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), [ECA Digital em vigor (Senado)](https://www12.senado.leg.br/noticias/materias/2026/03/17/eca-digital-para-protecao-on-line-de-criancas-e-adolescentes-entra-em-vigor).

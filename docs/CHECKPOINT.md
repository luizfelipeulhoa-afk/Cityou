# Checkpoint: de onde continuar

Atualizado em 13/11/2026. Para continuar em outra IA ou com outro dev: `node tools/handoff.mjs --full --out contexto.md` junta este arquivo, `docs/HANDOFF-CONTEXTO.md`, o plano e os tropeços conhecidos num arquivo só. Leia antes o `CLAUDE.md` (regras obrigatórias), `docs/PLANO-PROXIMOS-PASSOS.md` e `docs/known-issues.md`.

## Rumo ao MVP

- **Objetivo:** entregar a primeira versão utilizável do Cityou, com painel pessoal e cidade 3D ligados aos dados do próprio app, sem depender do Fifones.
- **O que falta:** integrar tarefas e Missões (etapa 2), migrar o catálogo e preservar as cidades salvas (3), tirar os atalhos e iframes legados do painel (4), ligar Agenda, Projetos e Peso aos dados reais (5) e concluir a segurança e o corte do legado (6). Ainda falta validar contas e latência na prévia e medir em celular físico. A tabela abaixo acompanha também a ambientação e a Fita do Tempo previstas no plano.
- **Próximo passo:** (1) **conferir a etapa 2 no navegador** (o código entrou na `main` com o PR #34, com 77 testes, 41 do Worker e 59 do `pytest` verdes, mas ninguém abriu a tela): Missões lista tarefas reais do Worker, o menu da cidade abre as abas certas do painel e a sessão vencida leva à entrada sem repetir a requisição; (2) entrar o **PR #35** (montanha atrás do Cristo, ai-memory e `CLAUDE.md` conferido por teste); (3) **etapa 3** (catálogo e migração), o maior risco técnico do plano.

## Em andamento por branch

Antes de começar uma etapa, escreva aqui o branch e a etapa. Ao fechar o PR, apague a linha. Em 13/11/2026 entraram nove PRs de três sessões no mesmo dia e um commit ficou fora da `main`: esta tabela existe para isso não se repetir.

| Branch | O que está fazendo | Desde |
|---|---|---|
| `claude/etapa-4-painel-sem-iframe` | Etapa 4: painel sem iframe do Fifones, aba Conta, Salvo/Salvando…/Sem conexão, "Em breve" (Agenda, Projetos, Fitness, Biblioteca, Estudos), Sair em todas as páginas, `next` do login validado | 13/11/2026 |
| `claude/etapa-4-painel-sem-iframe` (inclui a etapa 5) | Etapa 5: Agenda, Projetos e Peso reais, juntada à etapa 4 | 13/11/2026 |
| `claude/blissful-gates-qmt20l` | Montanha atrás do Cristo (`crop.keep`, névoa e malha), ai-memory (configuração, regras e roteiro do `wikisync`), documentos reconciliados e teste que confere o `CLAUDE.md` (PR #35, aberto) | 13/11/2026 |

## O que já entrou na `main` (PR → etapa)
| PR | O que entrou | Etapa do plano |
|---|---|---|
| #23 | Seis decorações da Ilha Inicial | fora do plano |
| #24 | Rio: Cristo no topo de um morro do terreno, lotes na cor da mata, calçadão na orla | ambientação (parte da 7) |
| #25 | Medição de base, prédio e terreno como uma coisa só, plano v2, seis skills, contexto | 1 e 7a |
| #26 | Rua automática na construção do Rio (feita a partir do patch arquivado no #25) | 9 |
| #27 | Desempenho do terreno da cidade (névoa 40–80, zoom máximo 46) e 8 prédios com GLB | 7 (parte) e fora do plano |
| #28 | Terreno carrega no construtor e corte real do relevo distante; cidade vazia pronta em 5,6 s (era 8,4 s) | 7b (parte) |
| #29 | Seis prédios e decorações novos (23 GLB), praia mais larga, Fifo | fora do plano |
| #30 | Calçadão desenhado, Fifo andando, espuma e ondas, **sem a Sede Fifones nas cidades piloto** | fora do plano; reduz a etapa 3 |
| #31 | Morro da comunidade em patamares, calçadão como decoração, ondas mais realistas | fora do plano |
| #32 | Contas, isolamento do Durable Object, migrações do D1, benchmarks, Vite 6.4 | 6 (parte) |
| #33 | Leitura obrigatória, gancho de sessão, `AGENTS.md`, agentes `builder` e `reviewer`, skill `reflect`, revisão em `council/` | organização |
| #34 | Etapa 2: tarefas reais, cliente único, cidade sem iframe (entrou na `main` em 13/11/2026) | 2 |

Testes (13/11/2026): `main` depois do #33: `npm test` 74, `npm run test:worker` 36, build ok. Esta branch depois de juntar o #34: `npm test` 77, Worker 41, `pytest` 59, build ok. Não rodados: testes de navegador (`test:terrain`, `test:world`) depois da junção e a conferência da etapa 2 no navegador.

## Decisões do dono (13/11/2026): todas aprovadas
1. Reembolso de 100% das peças de IA e StuntSync retiradas (recalculado pelo servidor, uma vez).
2. Biblioteca "Em breve"; Professor, voz e Planilhas saem.
3. Cidade sem sombra projetada: só sombra de contato.
4. Apagar o backend FastAPI local (etapa 6).
5. Desfazer: janela de 120 s, sem contador.
6. Ocupar todo o terreno do Rio com **rua automática** (etapa 9).
"Esqueci a senha" fica fora até haver e-mail com domínio.
7. **Pacote conservador do PORTAR-KIT** (decisão do dono, 13/11/2026; respostas A, B, C, D, F e G): 6 domínios do Cityou, economia atual, prédio sobe sem exigir tarefas, beta por convite, sem assistente de IA, uma organização.

## Estado das etapas (ordem: 1 ✔ → 7a ✔ → 9 ✔ → 2 → 3 a 6 → 7b → 8)
| Etapa | Estado |
|---|---|
| 1 Medição de base | Feita. Falta a base da prévia publicada |
| 7a Prédio e terreno como uma coisa só | Feita. Entrada animada e fade do terreno foram para a 7b |
| 9 Rua automática (ocupar todo o terreno) | Implementada: prévia, confirmação, cobrança única e testes |
| 2 Tarefas reais, cliente único, cidade sem iframe | Feita e conferida no navegador (13/11/2026, Worker local em modo de teste, Chromium): Missões lista a tarefa real e concluir dá +10; os cinco itens do menu chegam a `/app#/<aba>`; 401 leva a `/?entrar=1&next=%2Fcity` sem repetir pedido. Não conferido: a cidade embutida no painel (iframe) e celular |
| 3 Catálogo e migração | Não começada |
| 4 Painel sem iframe | Não começada |
| 5 Agenda, Projetos e Peso reais | Feita em três commits (13/11/2026, falta só ela entrar na `main`). **1 Agenda feita** (`worker/agenda.js`, `worker/records.js`, `tests/worker-agenda.test.mjs`, aba Agenda do painel); **2 Projetos feita** (`worker/projects.js`, `tests/worker-projects.test.mjs`, aba Projetos, `/api/workspace/projects` virou apelido); **3 Peso feito** (`worker/weights.js`, `tests/worker-weights.test.mjs`, aba Fitness com gráfico da média de 7 dias). Fica de fora: latência comparada com a base da etapa 1 e Biblioteca e Memórias (`sources`, etapa 4) |
| 6 Segurança e corte do legado | Correções de contas e dependências adiantadas. CSP, cabeçalho novo e corte do legado pendentes |
| 7b Resto da ambientação | Não começada |
| 8 Fita do Tempo e transições | Não começada |
| 10 Portão para abrir contas (proposta) | Não começada; ver "Itens sem dono no plano" |

## O que falta, para o próximo developer

### Etapa 9: rua automática (implementada)
No Rio, escolher o lote de um prédio mostra a ligação mais curta à rede e o custo total. Confirmar grava o prédio e até 30 trechos de rua na mesma ação. Testes cobrem saldo insuficiente, áreas protegidas, caminho bloqueado e reenvio sem cobrança dupla. O teste de navegador é `node tools/auto-road-playtest.mjs <url-do-worker-em-modo-teste>`. A próxima etapa do plano é a 2.

### Etapa 2: tarefas reais, cliente único, cidade sem iframe
**Estado:** código na `main` (PR #34); falta a conferência no navegador.
`GET /api/personal/tasks` e concluir tarefa (apelidos para `/api/workspace/tasks*` por um deploy); saem `connected` e `source`; um `api()` único com 401 → `/?entrar=1&next=…` (copiar o padrão de `reloadPage` em `CityApp.vue`); `goToPanel(aba)`; saem `openWorkspace`, o diálogo, `setActivity`, a sondagem de 10 s e a atividade do `CityApp.vue`. Pronto quando: Missões lista tarefas, nenhum "8765" ou "offline" em `src/CityApp.vue`, os itens do menu chegam a `/app#/<aba>`.

### Etapa 4: painel sem iframe (feita no código, 13/11/2026)

`src/App.vue` não tem mais `openBridge`, `openDocument` nem iframe do Fifones (só mapa e cidade). Aba `conta` (nome, e-mail, Sair; na demonstração "Criar conta para guardar"); indicador Salvo/Salvando…/Sem conexão; Agenda, Projetos, Fitness, Biblioteca e Estudos mostram "Em breve" até a etapa 5. `signOut()`, `safeNext()` e `loadAccount()` em `src/fifones/api.js`: o Sair só redireciona se o servidor confirmou e aparece também na cidade e no mapa avulsos; a página de entrada devolve para a aba de antes (`/app#/habitos`) e só aceita `next` de página do app. Teste: `tests/session.test.mjs`. **Falta:** conferir no navegador (390 px, voltar à aba depois de entrar) e as miniaturas da ilha (`tools/catalog-previews.mjs` com `?local=ilha-inicial`).

### Etapa 3: catálogo e migração
**Feita no código (branch `claude/etapa-3-catalogo-migracao`, PR aberto após a conferência):** `RETIRED_KINDS`/`withoutRetired` em `worker/city.js` (custo só no servidor); `DemoSession.migrateCatalog()` roda no construtor, regrava Ilha e cidades regionais, credita custo + melhorias uma vez (marca `migration:catalog-3`); padrão do objetivo virou `'tasks'`; 5 GLB e 5 PNG apagados; destinos são nome de aba. Testes: `tests/catalog-migration.test.mjs`. `pytest` do backend local: `tests/test_activity.py` removido (só testava as peças aposentadas; `backend/activity.py` virou código morto, sai com o backend na etapa 6) e `test_backend.py` usa um prédio 3 x 2 só de teste no lugar do StuntSync. Falta conferir no navegador.
Atenção: o #30 já tirou a Sede Fifones do Rio e de toda cidade piloto (`withoutHeadquarters`); o item "Sede Cityou" só vale para as cidades antigas.
Destino de prédio vira nome de aba; Sede Cityou; saem IA (chatgpt, claude, gemini, grok) e StuntSync com custo numa tabela só do servidor; **migrar o estado guardado antes de qualquer ação** (peça de tipo desconhecido derruba `occupiedTiles`, `city-layout.js:142-147`), reembolso recalculado (custo + melhorias) uma vez, marca "já migrado"; trocar o padrão `'stunt'` de `CityApp.vue:92`; apagar os GLB. Testes: cidade guardada com `stunt` nível 3 carrega, credita o valor exato uma vez e aceita nova construção.

### Etapa 4: painel sem iframe
Saem `openBridge` e `openDocument`; aba Conta; indicador Salvo/Salvando; Biblioteca "Em breve"; Sair só redireciona em sucesso e existe também na cidade e no mapa; hash preservado no login com `next` validado contra `APP_PAGES`; miniaturas da ilha (`tools/catalog-previews.mjs` com `?local=ilha-inicial`).

### Etapa 5: Agenda, Projetos e Peso reais
Tipos `event`, `project`, `weight` na tabela `records` do Durable Object; `GET /api/personal` traz tudo (uma leitura por tela); escritas devolvem o estado novo; 422 para campo extra; definir teto de registros por conta (hoje 100 por tipo, o peso diário trava em ~3 meses).

### Etapa 6: segurança e corte do legado
Já adiantado: Vite 6.4 com dependências auditadas, adoção e isolamento do Durable Object, limite de corpo e reserva de tentativas de login, e esquema gerido por migrações. Antes de habilitar D1, siga [CONTAS](CONTAS.md) e valide um banco existente caso ele tenha sido inicializado pelo Worker antigo.

CSP e cabeçalhos pelo Worker, primeiro em `Report-Only` (`connect-src` com `blob:` e `data:`; sem `'wasm-unsafe-eval'`); `X-Cityou-Request` aceito junto do antigo e, um deploy depois, só ele (`tools/pilot-*.mjs` enviam o antigo); apagar `backend/`, pytest e scripts Python; proxy do Vite na 8787; atualizar a seção "Backend" do `CLAUDE.md`. Use a skill `owasp-security`.

### Etapa 7b: resto da ambientação
Entrada animada dos prédios na carga inicial e terreno entrando com a névoa abrindo (ficaram da 7a); desenho sob demanda (`invalidate`); GLB legados reduzidos e com hash; vegetação em volta dos prédios; unificar a `toLambert` duplicada em `SpaceMarker.js`; `constrainCamera` na cidade.

### Etapa 8: Fita do Tempo e transições
Desfazer/refazer com pilha estrita no servidor (só o topo, só se a revisão for a gravada depois, janela de 120 s, últimas 10 ações, reembolso integral, `action_id`); `ActionTape.vue`; cortina na cor do céu, pré-busca e View Transition progressiva; Voltar hierárquico (‹ Mapa, ‹ Painel); renome `src/fifones` → `src/city` por último, num PR só de `git mv`.

### Itens sem dono no plano (revisão de 13/11/2026)
A revisão em `council/COUNCIL_SINTESE.md` achou problemas que nenhuma etapa cobre. São propostas: quem decide é o dono.

| Item | Etapa sugerida | Pronto quando |
|---|---|---|
| Sessão vencida dentro do quadro do painel abre a página de apresentação dentro do quadro; a página de apresentação trata falha de rede como "contas desligadas"; consulta de 30 s da cidade | 2 | Teste de navegador com sessão vencida no painel, na cidade e no mapa |
| "Exportar meus dados" e "Apagar minha conta" na aba Conta; barra de moedas e nível lendo o `resumo`; etapa do prédio e comprovações no painel | 4 | Exportar devolve tudo; apagar remove o objeto e as sessões; com teste |
| Dividir `worker/demo.js` por assunto, só movendo código; editar e apagar registro; `request_id` ao criar; janela de datas no servidor (`canMarkDay`) | 5 | Testes passam antes e depois da divisão; reenvio não duplica |
| Limite por IP e cadastro com convite; renovação e limpeza de sessão; registro de cadastro, login, bloqueio e moedas de teste; custo do hash de senha medido numa prévia; API com 503 quando o banco cai; limite da foto de comprovação igual ao da regra | 6 | Testes e a medida em `docs/BENCHMARKS.md` |
| Portão para abrir contas: D1 separado para a prévia, migrações aplicadas, fluxo de conta inteiro no navegador numa prévia, restauração ensaiada, privacidade, termos e idade revisados por advogado | 10 (nova) | Lista toda marcada |
| Regras do jogo: meta com alvo 1 paga 25 moedas sem teto; moedas sem uso depois de cerca de um mês | decisão do dono | — |
| Diagramas no draw.io (`docs/diagrams/`): roteiro, arquitetura, fluxos de conta, ameaças | a qualquer momento | Abrem no draw.io |

### Pendências soltas
- **ai-memory (13/11/2026):** A + B + C em documentação (`docs/ai-memory.md`, `.ai-memory.toml`, `docs/memoria/`). **C = repositório privado `cityou-memoria` onde o `ai-memory-wikisync` exporta só páginas escolhidas** (`_rules`, `decisions`, `gotchas`, `procedures`); outro computador seu e colegas dão `git pull` e `sync` para importar no ai-memory local, e a IA deles consulta. Sem servidor sempre ligado (o dono não tem onde hospedar hoje; o servidor único ficou para depois). **Falta o dono criar o repositório privado vazio** e dar acesso. Corrigido: o erro de descrever o C como push do wiki inteiro (o remoto git do wiki é backup de um wiki só). **Não verificado:** o wikisync não foi compilado nem executado, e o binário do ai-memory também não; o wikisync é parte de uma funcionalidade em andamento (issue #986 do ai-memory).
- **Montanha cortada (corrigida em 13/11/2026, aguarda PR):** o corte do terreno (#28) apagava o maciço atrás do Cristo e a névoa curta (#27) o escondia; conserto com `crop.keep`, névoa 55–125 e malha de 16 mil (`docs/TERRAIN.md`). Confira em quatro ângulos com `tools/city-look.mjs`.
- **Botão Voltar em camadas e troca de mapa ilha/Rio** (pedido do responsável, feito no commit `2802b41` e nunca incorporado): o patch está em `docs/research/pendencias/2802b41-voltar-e-troca-de-mapa.patch`. Não foi reaplicado porque a etapa 8 desenha o Voltar hierárquico e a etapa 2 reescreve o menu da cidade. Só a correção da tela de partida presa entrou.
- O desenho detalhado das correções de contas (um agente de arquitetura) não foi entregue: caiu por limite de uso.
- **Base da prévia publicada** (etapa 1): `node tools/api-perf.mjs <url> --suite 50 --cookie '<sessão>'`; precisa de URL e cookie.
- `tools/pilot-perf.mjs` voltou a medir Ilha e Rio a partir de uma sessão nova, sem gravar construções ou viagens. Rodadas e próximos passos em [BENCHMARKS](BENCHMARKS.md).
- **Não conferido visualmente depois da 7a:** a Ilha Inicial, o modo "Luz do anoitecer" (`setLighting('dusk')`, calibrado com ACES) e as outras cidades antigas. Só o Rio foi fotografado.
- `sceneEnvironment.js` ainda tem 24 `castShadow`/`receiveShadow` sem efeito; `refreshShadows()` em `CityWorld.js` agora só marca a sombra de contato (nome herdado).
- Peso medido só com renderização por software e Worker local; nada foi medido em celular de verdade.

## Como rodar
```bash
npm ci
npm test && npm run test:worker && npm run build
npx wrangler dev --port 8787 --ip 127.0.0.1 --var CITYOU_TEST_OPEN_REGIONS:1
CITYOU_CHROME=/opt/pw-browsers/chromium node tools/city-look.mjs http://127.0.0.1:8787 --label antes
CITYOU_CHROME=/opt/pw-browsers/chromium npm run perf:city -- http://127.0.0.1:8787 --runs 3
```
Não reconstrua o `dist` (`npm run build`) enquanto o bench roda: a medida sai contaminada.

**Etapa 5, pendências (13/11/2026):** (1) latência não comparada com a base da etapa 1 (`npm run perf:api`), então a etapa está "feita no código, falta medir"; (2) pesagem com mais de 120 dias é aceita pela API mas fica fora da lista (a tela só deixa escolher os últimos 120 dias); (3) `?month=` inválido derruba também escritas (o cliente não o manda nelas); (4) o "hoje" do formulário de peso vem do navegador, não de São Paulo; (5) o primeiro `npm run build` após a parte 3 falhou uma vez sem causa conhecida.

**Etapa 5, medidas na prévia (13/11/2026, commit 5e62946, `npm run perf:api`, demonstração sem login, mediana / p95 de ida e volta, servidor entre parênteses):** `GET /api/personal` 190,1 / 216,4 ms (130 ms); `GET /api/city` 187,3 / 200,5 ms (129 ms); girar peça 214,5 / 234,3 ms (151 ms); `POST /api/personal/events` 221,5 / 321,1 ms (153 ms); `POST /api/personal/projects` 240,7 / 812,3 ms (159 ms, p95 do servidor 301 ms); `POST /api/personal/weights` 230,1 / 250,8 ms (147 ms; só 1 de 30 chamadas passou, porque o peso é de 1 por dia, então a amostra é fraca). A meta de 60 ms no servidor está FORA em todas, inclusive nas rotas que já existiam: o piso hoje é cerca de 130 ms por chamada ao Durable Object na prévia. `GET /api/personal` (que agora traz tarefas, projetos, agenda e peso) custa o mesmo que `GET /api/city`, então a etapa 5 não mostra piora mensurável, mas não há medida da prévia antes dela para comparar. Local, a base da etapa 1 era 8,6 ms.

**Etapa 5, conferida no navegador na prévia (390 px):** Seu dia, Agenda, Projetos, Fitness, Biblioteca, Estudos e Conta sem rolagem lateral, sem iframe, sem "Fifones", indicador "Salvo" visível; criar compromisso, projeto e pesagem pela API persiste e aparece depois de recarregar; campo extra dá 422.

**Piso de ~130 ms da API (investigação, 13/11/2026, prévia):** `GET /api/health` (só o Worker, sem Durable Object) responde em 59,9 / 99,2 ms de ida e volta com 0 ms de servidor; `GET /api/personal` (entra no Durable Object) fica em 191,2 / 229,0 ms com 127 ms de servidor, e o p95 do servidor é só 132 ms. Variação tão pequena aponta para **distância de rede entre o Worker e o Durable Object**, não para trabalho no objeto (localmente a mesma rota leva 8,6 ms). O Worker atende pelo ponto de Rio de Janeiro (`CF-RAY …-GIG`) e `worker/demo.js` abre o objeto com `env.DEMO_SESSIONS.getByName(key)` sem `locationHint`, então a região do objeto é a que o Cloudflare escolheu na criação. **Hipótese a testar:** `getByName(key, { locationHint: 'sam' })` ao criar sessões novas (só vale para objetos ainda não criados; sessões existentes ficam onde estão). Não aplicado: mexe em produção. Mediu-se só a rede; falta confirmar a região do objeto (por exemplo com um ponto de teste em preview) e medir antes e depois.

**Piso de ~130 ms: correção e plano (13/11/2026, docs oficiais da Cloudflare: Data location, Placement, Rules of Durable Objects).** A hipótese de `locationHint: 'sam'` **não serve**: a Cloudflare ainda não cria Durable Objects na América do Sul, e um objeto com dica `sam` nasce no leste da América do Norte (`enam`). O objeto da sessão já está lá, então o salto Rio → leste dos EUA (~120 ms) é o piso físico de qualquer chamada que entre nele. Meia-via possível só **evitando o salto**, em ordem de ganho e risco: (1) **leitura sem Durable Object**: o Worker guarda no cache da própria borda o último `GET /api/personal` e `GET /api/city` da sessão (chave = sessão + revisão) e responde dele na hora, revalidando em segundo plano e invalidando a cada escrita que passa por ele; leitura repetida cai de ~190 para ~60 ms, mas há risco de ver dado velho se a pessoa usar dois aparelhos (a revalidação corrige na chamada seguinte); (2) **cliente**: mostrar na hora o último estado guardado no navegador e atualizar por trás (stale-while-revalidate), e **escrita otimista** (a tela muda no mesmo instante e a rede confirma depois), que esconde os ~130 ms sem tocar no servidor; (3) **Smart Placement** (`"placement": {"mode": "smart"}`, uma linha em `wrangler.jsonc`, até 15 min para analisar): coloca o Worker perto do objeto, então o salto Worker → objeto some, mas o salto da pessoa ao Worker cresce; o total fica parecido (esperado ~130 a 150 ms de ida e volta), então não corta pela metade e deve ser medido numa prévia antes de decidir. Decisão do dono pendente: qual dessas implementar; (1) e (2) mexem em contrato de cache e em `src/fifones/api.js`.

**Latência, lado do cliente feito (13/11/2026):** `src/fifones/api.js` ganhou `readCache`, `writeCache` e `clearCache` (localStorage, 24 h, prefixo `cityou:swr:`, limpo ao sair e ao entrar). O painel mostra na hora o último `GET /api/personal` guardado e confirma com a rede por trás; concluir tarefa e marcar hábito são otimistas (a tela muda no mesmo instante e volta atrás se o servidor recusar). Não muda o contrato do servidor. Falta: cache de leitura na borda e teste do Smart Placement (sessão `piso-130ms`), e medir o ganho percebido.

**Latência, resultado na prévia (13/11/2026, commit 1cdcb4a, `npm run perf:api` e scripts de escrever-e-ler):** leitura repetida sem escrita no meio: `GET /api/personal` 190 → 67 ms de ida e volta (servidor 130 → 9 ms), `GET /api/city` 187 → 64 ms, `GET /api/health` 56 ms (piso da rede). Escritas não mudam (217 a 267 ms): continuam no Durable Object. **Defeito achado e corrigido:** a Cache API não garante que a troca de versão apareça na leitura seguinte (leitura velha em 12 de 14 testes logo depois de escrever, e ainda em 5 e 8 s depois), então a invalidação por versão é só uma otimização. A garantia de ler o que se escreveu vem de dois limites: a entrada do cache vale no máximo 30 s (`MAX_AGE_MS`) e toda escrita devolve o cookie `cityou_w`, que faz as leituras do mesmo navegador ignorarem o cache por 35 s. Com isso, 0 leituras velhas em 14 ciclos escrever-e-ler. **Custo:** durante 35 s depois de uma escrita as leituras voltam a ~190 ms; o ganho aparece em leituras em momentos calmos. Outro aparelho pode ver dado até 30 s antigo. Ideia para ganhar mais: devolver o estado novo na própria resposta da escrita (já é assim na Agenda, Projetos e Peso) e o cliente não reler logo depois.

**Escritas mais rápidas de perceber (13/11/2026):** `src/App.vue` não espera mais uma releitura inteira depois de escrever. Criar registro aplica o estado que a própria resposta já traz (`POST /api/personal/entries` devolve o resumo todo); criar tarefa entra na lista na hora; concluir tarefa e construir prédio liberam a tela e releem em segundo plano (`refresh()` sem `await`). Cada escrita custa 1 ida ao Durable Object (~200 ms) em vez de 2. Não muda o contrato do servidor.

**Escritas, medido na prévia (13/11/2026, commit 86123eb, navegador, Fitness/Tarefas):** criar uma tarefa pelo painel leva 231 ms do clique até a lista mostrar o item, com uma só chamada de escrita (`POST /api/personal/tasks` 223 ms) e a releitura por trás; antes eram duas idas em série (~420 ms). A abertura do painel leu `GET /api/personal` em 80 ms.

**Etapa 5, pendências resolvidas (13/11/2026, PR de correções):** (1) latência medida na prévia (ver acima); (2) pesagem com mais de 120 dias: decisão de projeto, não defeito: a API aceita (histórico, `GET /api/personal/weights` devolve tudo) e a tela só deixa escolher os últimos 120 dias, onde a lista e o gráfico olham; (3) `?month=` inválido: corrigido, a leitura segue dando 422 e a escrita ignora o parâmetro (`worker/demo.js`, teste em `tests/worker-weights.test.mjs`); (4) o "hoje" do formulário de peso já é o de São Paulo (`today()` em `src/App.vue` usa `America/Sao_Paulo`), então não era defeito; (5) o build que falhou uma vez não voltou a falhar em mais de 10 execuções seguidas (`npm run build`), seguindo como incidente isolado.

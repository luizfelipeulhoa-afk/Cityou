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
| `claude/etapa-3-catalogo-migracao` | Etapa 3: catálogo sem IA e StuntSync, Sede Cityou, destinos como nome de aba, `migrateCatalog` (reembolso 100% uma vez) | 13/11/2026 |
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
| 5 Agenda, Projetos e Peso reais | Não começada |
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

### Etapa 3: catálogo e migração
**Feita no código (branch `claude/etapa-3-catalogo-migracao`, PR aberto após a conferência):** `RETIRED_KINDS`/`withoutRetired` em `worker/city.js` (custo só no servidor); `DemoSession.migrateCatalog()` roda no construtor, regrava Ilha e cidades regionais, credita custo + melhorias uma vez (marca `migration:catalog-3`); padrão do objetivo virou `'tasks'`; 5 GLB e 5 PNG apagados; destinos são nome de aba. Testes: `tests/catalog-migration.test.mjs`. Falta conferir no navegador.
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

# Contrato da API do Cityou

Rotas do backend em Cloudflare Workers + D1. Tabelas em `DATA-MODEL.md`; quem chama cada rota em `INTERACTIONS.md`. Implementado até agora (fase B1): `GET /api/health`, a proteção das escritas, o formato de erro, o `Server-Timing` e a primeira migração (tabelas de conta). O resto é especificação.

## Arquitetura

Um único Worker serve o site e a API. `wrangler.jsonc` ganha:

- `main`: o código do Worker (`worker/index.js`);
- `assets.binding` e `assets.run_worker_first: ["/api/*"]`: só `/api/*` passa pelo Worker; o resto continua saindo direto dos arquivos estáticos;
- `d1_databases`: o banco, com o esquema em `migrations/*.sql` (aplicado com `wrangler d1 migrations apply`, `--local` no desenvolvimento e `--remote` na publicação);
- `ratelimits`: limite aproximado de chamadas às rotas de login.

Escritas que tocam mais de uma tabela (por exemplo, concluir tarefa e gravar o crédito) vão num único `env.DB.batch()`, que roda como uma transação: ou grava tudo, ou nada.

No desenvolvimento, o Vite encaminha `/api` para o `wrangler dev`, no lugar do FastAPI na porta 8766.

## Convenções

- **Formato:** JSON em UTF-8. Respostas de `/api/*` saem com `Cache-Control: no-store`.
- **Sessão:** cookie `cityou_session`, `HttpOnly; Secure; SameSite=Lax; Path=/`, válido por 30 dias. O banco guarda só o SHA-256 do token.
- **Escritas** (`POST`, `PUT`, `PATCH`, `DELETE`) exigem o cabeçalho `X-Fifones-City: 1` (o cliente `src/fifones/api.js` já envia) e `Origin` igual ao do site. Juntos com `SameSite=Lax`, barram envio forjado por outro site.
- **Identificadores:** o navegador gera o `id` (UUID) e envia no corpo do `POST`. Repetir o mesmo `POST` devolve o registro já criado, com 200, sem duplicar.
- **Dono:** toda rota usa o `user_id` da sessão. Registro de outra conta responde 404.
- **Erros:** `{ "message": "texto para a pessoa", "detail": "o mesmo texto", "fields": { "campo": "motivo" } }`. `ApiError` em `src/fifones/api.js` já lê `message` e `detail`.

| Código | Quando |
|---|---|
| 200 | Leitura, edição, ou criação repetida |
| 201 | Criação |
| 401 | Sem sessão ou sessão vencida |
| 403 | Falta o cabeçalho de escrita ou a origem não confere |
| 404 | Não existe ou é de outra conta |
| 409 | Conflito: e-mail já cadastrado, `expected_revision` antiga, `request_id` reusado com outro corpo |
| 422 | Campo inválido (com `fields`) |
| 429 | Muitas tentativas |

## Conta

| Rota | Corpo | Resposta | Tabelas |
|---|---|---|---|
| `POST /api/auth/signup` | `email`, `password` (10 a 200 caracteres), `display_name` | 201 `{ user }` + cookie | `users`, `sessions`, `player`, `cities` (Ilha Inicial), `placements` (praça e ruas iniciais), `ledger` (boas-vindas) |
| `POST /api/auth/login` | `email`, `password` | 200 `{ user }` + cookie. Erro 401 com a mesma mensagem para e-mail inexistente e senha errada | `sessions`, `login_attempts` |
| `POST /api/auth/forgot` | `email` | 200 com a mesma mensagem, exista a conta ou não. O e-mail sai depois da resposta (`ctx.waitUntil`) | `password_resets` |
| `POST /api/auth/reset` | `token`, `password` | 200 `{ user }` + cookie. 422 se o link venceu (30 minutos) ou já foi usado. Encerra as outras sessões da conta | `users`, `password_resets`, `sessions` |
| `POST /api/auth/logout` | vazio | 200 `{}`, cookie apagado | `sessions` |
| `GET /api/me` | | 200 `{ user: { id, email, display_name, timezone } }` | leitura |
| `PATCH /api/me` | `display_name`, `timezone` | 200 `{ user }` | `users` |
| `GET /api/me/export` (B8) | | 200 arquivo JSON com todos os dados da conta | leitura |
| `DELETE /api/me` (B8) | `password` | 200 `{}`; apaga a conta e todos os dados | todas |

Senha: PBKDF2 pela Web Crypto, sal por usuário, comparação em tempo constante (`crypto.subtle.timingSafeEqual`). O número de iterações fica gravado em `users.password_iterations`.

## Visão geral

`GET /api/overview` devolve, numa chamada, o que o painel precisa ao abrir:

```json
{
  "today": "2026-11-10",
  "server_now": "2026-11-10T14:03:22Z",
  "user": { "display_name": "…", "timezone": "America/Sao_Paulo" },
  "player": { "xp": 120, "level": 2, "credits": 60, "current_location": "ilha-inicial" },
  "presence": { "active_last_7": 4, "xp_bonus": 25, "credit_bonus": 0 },
  "tasks": [], "projects": [], "events": [],
  "habits": [], "habit_checkins": [],
  "goals": [], "goal_steps": [],
  "transactions": [], "meals": [], "notes": [], "weights": []
}
```

Substitui `GET /api/personal`, `GET /api/workspace/tasks` e `GET /api/workspace/projects` (três chamadas viram uma). `events` e `transactions` vêm do mês corrente por padrão; `?month=AAAA-MM` pede outro mês.

## Recursos

Tarefas, projetos, compromissos, hábitos, metas, lançamentos, refeições e notas seguem o mesmo molde. `{r}` é `tasks`, `projects`, `events`, `habits`, `goals`, `transactions`, `meals` ou `notes`.

| Rota | Corpo | Resposta | Efeito |
|---|---|---|---|
| `GET /api/{r}` | filtros na URL | 200 `{ items: [] }` | leitura; ignora apagados |
| `POST /api/{r}` | `id` + campos | 201 `{ item }` (200 se o `id` já existe) | cria |
| `PATCH /api/{r}/{id}` | só os campos alterados | 200 `{ item }` | edita; atualiza `updated_at` |
| `DELETE /api/{r}/{id}` | | 200 `{ item }` | preenche `deleted_at` |
| `POST /api/{r}/{id}/restore` | vazio | 200 `{ item }` | limpa `deleted_at` (o "Desfazer") |

Campos e validação por recurso (`tasks`, `habits` e `goals` aceitam também `domain`, com padrão `organizacao`):

| Recurso | Campos | Validação | Filtros de `GET` |
|---|---|---|---|
| `tasks` | `title`, `description`, `due_date`, `priority`, `project_id` | título 1 a 180; prioridade 0 a 3; `project_id` da própria conta | `status`, `project_id` |
| `projects` | `name`, `description`, `status` | nome 1 a 180 | `status` |
| `events` | `title`, `start_at`, `end_at`, `all_day`, `location`, `notes` | `end_at` não pode ser antes de `start_at` | `month` |
| `habits` | `title`, `body`, `weekdays`, `archived_at` | `weekdays` com 7 caracteres `0` ou `1`, ao menos um `1` | `archived` |
| `goals` | `title`, `body`, `target` | `target` 1 a 10.000 | |
| `transactions` | `title`, `amount_cents`, `direction`, `category`, `day` | valor de 1 a 100.000.000 centavos | `month` |
| `meals` | `title`, `body`, `day`, `meal_time` | `day` não pode ser futuro | `month` |
| `notes` | `kind`, `title`, `body`, `day` | `kind` em `note`, `reflection`, `memory` | `kind` |

### Rotas próprias

| Rota | Corpo | Resposta | Tabelas |
|---|---|---|---|
| `POST /api/tasks/{id}/complete` | vazio | 200 `{ item, reward, player, events }` (recompensa só na primeira vez) | `tasks`, `ledger`, `player`, `domain_progress`, `presence_days` |
| `POST /api/tasks/{id}/reopen` | vazio | 200 `{ item, credits }` (os créditos não mudam) | `tasks` |
| `PUT /api/habits/{id}/checkins/{dia}` | `{ "done": true }` | 200 `{ checkin, reward, player, events }` (recompensa na primeira marcação de hoje, até 8 hábitos por dia) | `habit_checkins`, `ledger`, `player`, `domain_progress`, `presence_days` |
| `PUT /api/goals/{id}/steps/{dia}` | `{ "done": true }` | 200 `{ step, item, reward, player, events }` (`item` é a meta, com `completed_at` quando atinge o alvo) | `goal_steps`, `goals`, `ledger`, `player`, `domain_progress`, `upgrade_points` |
| `PUT /api/weights/{dia}` | `grams`, `note` | 200 `{ item }` (cria ou substitui a pesagem do dia) | `weights` |
| `DELETE /api/weights/{dia}` | | 200 `{ item }` | `weights` |

`{dia}` é `AAAA-MM-DD`, no máximo hoje (no fuso do usuário). O cliente não envia valores de crédito em nenhuma rota: o servidor calcula tudo a partir dos fatos gravados, como `backend/app.py` já exige.

### Materiais (fase B8)

`POST /api/documents` (envio do arquivo para o R2), `GET /api/documents`, `GET /api/documents/{id}/file`, `GET /api/documents/{id}/cover`, `DELETE /api/documents/{id}`. O detalhamento fica para a B8, junto com o limite de tamanho por arquivo.

## Jogo

Regras e números em `GAME-DESIGN.md`. O navegador nunca envia XP, créditos, nível, etapa ou desbloqueio: qualquer campo desses no corpo é recusado com 422.

| Rota | Corpo | Resposta | Tabelas |
|---|---|---|---|
| `GET /api/player` | | `{ xp, level, next_level_xp, credits, current_location, presence: { active_days, xp_bonus, credit_bonus } }` | leitura |
| `GET /api/presence` | `?month=AAAA-MM` | `{ days: ["AAAA-MM-DD"], active_last_7, xp_bonus, credit_bonus }` | leitura |
| `GET /api/ledger` | `?limit=100` | `{ credits, xp, items: [{ label, amount, xp, multiplier, created_at }] }` | leitura |
| `GET /api/world` | | `{ current_location, locations: [{ id, state, requirements: { level, buildings, cost }, progress }] }` (`state` é `own`, `available` ou `locked`) | leitura |
| `POST /api/world/travel` | `to`, `request_id` | 200 `{ city, player }`. 422 se faltar nível, prédio ou crédito, com `fields` dizendo o que falta | `travels`, `cities`, `player`, `ledger`, `requests` |
| `GET /api/cities/{local}` | | Retrato da cidade: `revision`, `placements` (com `stage`), `catalog`, `unlock_radius`, mais `credits` e `level` da pessoa | leitura |
| `POST /api/cities/{local}/actions` | `type` (`build`, `move`, `rotate`, `remove`), `expected_revision`, `request_id`, e `kind`, `x`, `y`, `rotation`, `placement_id` conforme a ação | O retrato atualizado. 409 se a `revision` mudou ou o `request_id` foi reusado com outro corpo; 422 se não couber, colidir ou faltar crédito | `placements`, `cities`, `player`, `ledger`, `requests` |
| `GET /api/buildings/{id}` | | `{ kind, domain, stage, next_stage: { xp, weeks }, upgrades: [], empty_slots, points_available, next_point }` | leitura |
| `POST /api/buildings/{id}/upgrades` | `slot`, `upgrade_id` | 201 `{ upgrade, points_available }`. 422 se não houver ponto, se o prédio não estiver concluído ou se a opção não foi oferecida | `building_upgrades`, `upgrade_points` |

As respostas das rotas de ação (`complete`, `checkins`, `steps`, registros) passam a trazer `{ reward: { xp, credits, multiplier }, player: { xp, level, credits }, events: [] }`. `events` lista o que mudou por causa da ação: subida de nível, etapa de prédio concluída, ponto de melhoria ganho, local que ficou disponível. A tela usa essa lista para animar sem fazer outra chamada.

Quando uma construção é recusada, a resposta 422 traz `code`, além da mensagem, para a tela mostrar o motivo e a ação certa:

| `code` | Mensagem | Ação oferecida |
|---|---|---|
| `out_of_bounds` | Fora do terreno | |
| `locked` | Terreno ainda não liberado | Mostra o nível que libera |
| `terrain` | Aqui não dá para construir (água, montanha ou área reservada) | |
| `occupied` | Já tem algo aqui | |
| `no_road` | Precisa de rua ao lado | Construir rua |
| `level` | Disponível a partir do nível N | |
| `credits` | Créditos insuficientes | Mostra quanto falta |
| `unknown_kind` | Construção fora do catálogo | |

A mesma função de validação roda na tela, a cada movimento, para pintar as células de verde ou vermelho, e no servidor, que decide. O preço nunca vem do navegador: ele envia só o tipo e a posição.

`POST /api/cities/{local}/actions` mantém o formato de `POST /api/city/actions` (`backend/README.md`), menos o tipo `upgrade`, para `src/CityApp.vue` mudar pouco.

## Saúde

`GET /api/health` → `{ "app": "cityou", "status": "ok" }`. Não exige sessão.

## Rotas atuais e o que acontece com cada uma

| Rota de hoje (FastAPI) | Arquivo | Destino |
|---|---|---|
| `GET /api/health` | `backend/app.py` | Mantida |
| `GET /api/city` | `backend/app.py` | `GET /api/cities/{local}` |
| `POST /api/city/actions` | `backend/app.py` | `POST /api/cities/{local}/actions`, sem o tipo `upgrade` |
| `GET /api/workspace/tasks` | `backend/app.py` | `GET /api/tasks` (ou `GET /api/overview`) |
| `GET /api/workspace/projects` | `backend/app.py` | `GET /api/projects` |
| `GET /api/workspace/activity` | `backend/app.py`, `backend/activity.py` | Removida: eram sinais do Fifones |
| `POST /api/rewards/sync` | `backend/app.py` | Removida: o crédito é gravado na hora da ação |
| `POST /api/workspace/tasks/{id}/complete` | `backend/app.py` | `POST /api/tasks/{id}/complete` |
| `GET /api/personal` | `backend/personal.py` | `GET /api/overview` |
| `GET /api/personal/documents/{id}/cover` | `backend/personal.py` | `GET /api/documents/{id}/cover` (B8) |
| `POST /api/personal/entries` | `backend/personal.py` | `POST /api/habits`, `/goals`, `/notes`, `/transactions`, `/meals` |
| `PUT /api/personal/entries/{id}/checkin` | `backend/personal.py` | `PUT /api/habits/{id}/checkins/{dia}` e `PUT /api/goals/{id}/steps/{dia}` |
| `POST /api/personal/tasks` | `backend/personal.py` | `POST /api/tasks` |
| `GET /api/world/progress` | `backend/world.py` | `GET /api/world` |
| `PUT /api/world/progress` | `backend/world.py` | Removida: o navegador não envia mais progresso; viajar é `POST /api/world/travel` |
| `GET /` e arquivos estáticos | `backend/app.py` | Servidos pelo Cloudflare, sem passar pelo Worker |

## Ordem de construção

| Fase | Rotas |
|---|---|
| B1 | `GET /api/health`, banco, migrações, `Server-Timing`, medição de latência |
| B2 | `/api/auth/*` (com recuperação de senha), `GET` e `PATCH /api/me` |
| B3 | `tasks`, `habits`, `goals`, `GET /api/overview`, `GET /api/player`, `GET /api/presence`, `GET /api/ledger` |
| B4 | `transactions`, `meals`, `notes`, `events`, `weights` |
| B5 | `GET /api/world`, `POST /api/world/travel`, `/api/cities/*` |
| B6 | `/api/buildings/*` |
| B8 | `projects`, `documents`, `GET /api/me/export`, `DELETE /api/me` |

A fase B7 é de interface (atalhos, paleta, barra inferior, cache local) e não cria rotas.

Cada fase entra com testes do Worker contra um D1 local e com dois testes fixos: duas contas, uma tentando ler e alterar os dados da outra; e um envio de XP ou créditos pelo navegador, que precisa ser recusado.

## Velocidade

| Meta | Como se mede |
|---|---|
| Resposta na tela em até 50 ms depois do toque | Teste de navegador: tempo entre o toque e a mudança visível, sem esperar a rede |
| Processamento no servidor em até 60 ms na mediana | Cabeçalho `Server-Timing` em toda resposta; `tools/api-perf.mjs` anota mediana e percentil 95 |
| App abre sem esperar a rede | A última resposta de `GET /api/overview` fica guardada no aparelho e é mostrada na hora; a nova substitui ao chegar |

Regras para manter o servidor rápido: a sessão é lida uma vez por pedido; cada ação é um único `env.DB.batch()`; toda listagem tem índice; nenhuma rota faz chamada externa no caminho da resposta (o envio de e-mail vai em `ctx.waitUntil`).

**Aparelho primeiro.** Para a tela nunca esperar o servidor, cada ação é aplicada na hora no aparelho e entra numa fila local com o seu identificador. A fila é enviada em segundo plano e reenviada se a rede falhar; como cada ação tem identificador, o reenvio não duplica nada. O servidor recalcula XP e créditos e a resposta dele substitui a previsão do aparelho. Se os dois divergirem, vale o servidor. A previsão usa as mesmas regras (`shared/game/rules.js`), então a divergência é rara. Isso torna a experiência independente de onde o banco fica.

**Limite conhecido do D1.** O D1 não roda na América do Sul. As regiões são América do Norte (leste e oeste), Europa (oeste e leste), Ásia-Pacífico e Oceania, e as réplicas de leitura ficam nessas mesmas regiões. Para quem está no Brasil, o Worker roda perto, mas cada ida ao banco atravessa até a América do Norte. Por isso a meta de 60 ms no servidor pode não ser atingida em produção com o D1; o número real só sai da medição no site publicado (`npm run perf:api -- https://<site>`). O que continua garantido é a resposta na tela, que não espera o servidor. Os Durable Objects não resolvem: a documentação diz que eles também não são criados na América do Sul (um pedido para lá cai no leste da América do Norte). A alternativa real para aproximar o banco é um provedor externo com região em São Paulo, ainda não pesquisado. A decisão de onde os dados ficam está em aberto (`DATA-MODEL.md`).

A medição local (`wrangler dev`) dá perto de 0 ms e não diz nada sobre produção: não há rede entre o Worker e o banco, e o relógio do Worker só avança em operações de entrada e saída.

O tempo de ida e volta pela rede não entra na meta: depende da conexão da pessoa e da distância até o banco. Ele é medido e anotado, mas não prometido.

## Conferido na documentação do Cloudflare

- `assets.run_worker_first` aceita uma lista de padrões, como `["/api/*"]`.
- `env.DB.batch()` executa as instruções em sequência dentro de uma transação e desfaz todas se uma falhar.
- `wrangler d1 migrations apply <banco> --local` e `--remote` aplicam os arquivos de `migrations/`.
- A Web Crypto dos Workers oferece PBKDF2 em `deriveBits` e a função `timingSafeEqual`.
- O limite de chamadas (`ratelimits`) é aproximado e vale por localidade do Cloudflare, com janela de 10 ou 60 segundos. Por isso o bloqueio de senha errada também é contado no banco (`login_attempts`).

- O D1 aceita uma região preferida só na criação do banco (`wnam`, `enam`, `weur`, `eeur`, `apac`, `oc`) e não roda na América do Sul. Para o Brasil, a mais próxima é `enam`.
- Réplicas de leitura existem nas mesmas seis regiões e exigem a API de sessões (`env.DB.withSession()`).
- O Wrangler consegue criar o banco sozinho no deploy quando a configuração não traz `database_id`, mas sem escolher a região. Por isso o banco será criado à mão, com `enam`.
- Durable Objects aceitam a dica `sam` (América do Sul), mas não são criados lá: caem numa região próxima, hoje o leste da América do Norte.
- No D1 local, e-mail único e chave estrangeira são aplicados (teste em `tests/worker.test.mjs`).

Ainda não conferido: limite de iterações do PBKDF2, limites e preços do D1, restauração de backup, e o serviço de envio de e-mail para a recuperação de senha (exige um domínio próprio).

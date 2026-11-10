# Contrato da API do Cityou

Rotas do backend em Cloudflare Workers + D1. Tabelas em `DATA-MODEL.md`; quem chama cada rota em `INTERACTIONS.md`. Nada disto está implementado ainda: é a especificação da fase B0.

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
| `POST /api/auth/signup` | `email`, `password` (10 a 200 caracteres), `display_name` | 201 `{ user }` + cookie | `users`, `sessions`, `city`, `placements` (praça, sede e ruas iniciais), `ledger` (boas-vindas) |
| `POST /api/auth/login` | `email`, `password` | 200 `{ user }` + cookie. Erro 401 com a mesma mensagem para e-mail inexistente e senha errada | `sessions`, `login_attempts` |
| `POST /api/auth/logout` | vazio | 200 `{}`, cookie apagado | `sessions` |
| `GET /api/me` | | 200 `{ user: { id, email, display_name, timezone } }` | leitura |
| `PATCH /api/me` | `display_name`, `timezone` | 200 `{ user }` | `users` |
| `GET /api/me/export` (B7) | | 200 arquivo JSON com todos os dados da conta | leitura |
| `DELETE /api/me` (B7) | `password` | 200 `{}`; apaga a conta e todos os dados | todas |

Senha: PBKDF2 pela Web Crypto, sal por usuário, comparação em tempo constante (`crypto.subtle.timingSafeEqual`). O número de iterações fica gravado em `users.password_iterations`.

## Visão geral

`GET /api/overview` devolve, numa chamada, o que o painel precisa ao abrir:

```json
{
  "today": "2026-11-10",
  "user": { "display_name": "…", "timezone": "America/Sao_Paulo" },
  "credits": 60,
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

Campos e validação por recurso:

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
| `POST /api/tasks/{id}/complete` | vazio | 200 `{ item, credits, reward }` (`reward` é 10 na primeira vez, 0 nas seguintes) | `tasks`, `ledger`, `city` |
| `POST /api/tasks/{id}/reopen` | vazio | 200 `{ item, credits }` (os créditos não mudam) | `tasks` |
| `PUT /api/habits/{id}/checkins/{dia}` | `{ "done": true }` | 200 `{ checkin, credits, reward }` (`reward` é 5 na primeira marcação de hoje) | `habit_checkins`, `ledger`, `city` |
| `PUT /api/goals/{id}/steps/{dia}` | `{ "done": true }` | 200 `{ step }` | `goal_steps` |
| `PUT /api/weights/{dia}` | `grams`, `note` | 200 `{ item }` (cria ou substitui a pesagem do dia) | `weights` |
| `DELETE /api/weights/{dia}` | | 200 `{ item }` | `weights` |
| `GET /api/ledger` | `?limit=100` | 200 `{ credits, items: [{ label, amount, created_at }] }` | leitura |

`{dia}` é `AAAA-MM-DD`, no máximo hoje (no fuso do usuário). O cliente não envia valores de crédito em nenhuma rota: o servidor calcula tudo a partir dos fatos gravados, como `backend/app.py` já exige.

### Materiais (fase B7)

`POST /api/documents` (envio do arquivo para o R2), `GET /api/documents`, `GET /api/documents/{id}/file`, `GET /api/documents/{id}/cover`, `DELETE /api/documents/{id}`. O detalhamento fica para a B7, junto com o limite de tamanho por arquivo.

## Jogo

| Rota | Corpo | Resposta | Tabelas |
|---|---|---|---|
| `GET /api/city` | | Retrato da cidade: `revision`, `credits`, `earned`, `reward_count`, `level`, `unlock_radius`, `started_at`, `placements`, `catalog`, `history` | leitura |
| `POST /api/city/actions` | `type` (`build`, `move`, `rotate`, `remove`, `upgrade`), `expected_revision`, `request_id`, e `kind`, `x`, `y`, `rotation`, `placement_id` conforme a ação | O retrato atualizado. 409 se a `revision` mudou ou o `request_id` foi reusado com outro corpo; 422 se não couber, colidir ou faltar crédito | `placements`, `city`, `ledger`, `requests` |
| `GET /api/world/progress` | | `{ versao, epoca, desbloqueados, concluidos, atualizado_em }` | leitura |
| `PUT /api/world/progress` | `{ versao, epoca, desbloqueados, concluidos }` | O progresso depois da fusão | `world_progress`, `world_state` |

As duas rotas da cidade mantêm o contrato de `backend/README.md`, para `src/CityApp.vue` não mudar. O campo `source` do retrato (estado do Fifones) continua existindo com `connected: true`, até a tela deixar de lê-lo.

As rotas do mapa mantêm o contrato de `backend/world.py`, para `src/world/progressSync.js` seguir funcionando: o progresso só avança, e uma `epoca` maior substitui tudo. Quando a regra de marcos reais entrar (decisão pendente em `DATA-MODEL.md`), o servidor passa a ignorar `concluidos` vindo do navegador e a calcular os espaços pelo `reward_count`.

## Saúde

`GET /api/health` → `{ "app": "cityou", "status": "ok" }`. Não exige sessão.

## Rotas atuais e o que acontece com cada uma

| Rota de hoje (FastAPI) | Arquivo | Destino |
|---|---|---|
| `GET /api/health` | `backend/app.py` | Mantida |
| `GET /api/city` | `backend/app.py` | Mantida, por usuário |
| `POST /api/city/actions` | `backend/app.py` | Mantida, por usuário |
| `GET /api/workspace/tasks` | `backend/app.py` | `GET /api/tasks` (ou `GET /api/overview`) |
| `GET /api/workspace/projects` | `backend/app.py` | `GET /api/projects` |
| `GET /api/workspace/activity` | `backend/app.py`, `backend/activity.py` | Removida: eram sinais do Fifones |
| `POST /api/rewards/sync` | `backend/app.py` | Removida: o crédito é gravado na hora da ação |
| `POST /api/workspace/tasks/{id}/complete` | `backend/app.py` | `POST /api/tasks/{id}/complete` |
| `GET /api/personal` | `backend/personal.py` | `GET /api/overview` |
| `GET /api/personal/documents/{id}/cover` | `backend/personal.py` | `GET /api/documents/{id}/cover` (B7) |
| `POST /api/personal/entries` | `backend/personal.py` | `POST /api/habits`, `/goals`, `/notes`, `/transactions`, `/meals` |
| `PUT /api/personal/entries/{id}/checkin` | `backend/personal.py` | `PUT /api/habits/{id}/checkins/{dia}` e `PUT /api/goals/{id}/steps/{dia}` |
| `POST /api/personal/tasks` | `backend/personal.py` | `POST /api/tasks` |
| `GET /api/world/progress` | `backend/world.py` | Mantida, por usuário |
| `PUT /api/world/progress` | `backend/world.py` | Mantida, por usuário |
| `GET /` e arquivos estáticos | `backend/app.py` | Servidos pelo Cloudflare, sem passar pelo Worker |

## Ordem de construção

| Fase | Rotas |
|---|---|
| B1 | `GET /api/health`, banco e migrações |
| B2 | `/api/auth/*`, `GET` e `PATCH /api/me` |
| B3 | `tasks`, `habits`, `goals`, `GET /api/ledger`, `GET /api/overview` |
| B4 | `transactions`, `meals`, `notes`, `events`, `weights` |
| B5 | `/api/city*`, `/api/world/progress` |
| B7 | `projects`, `documents`, `GET /api/me/export`, `DELETE /api/me` |

Cada fase entra com testes do Worker contra um D1 local e com um teste de isolamento: duas contas, uma tentando ler e alterar os dados da outra.

## Conferido na documentação do Cloudflare

- `assets.run_worker_first` aceita uma lista de padrões, como `["/api/*"]`.
- `env.DB.batch()` executa as instruções em sequência dentro de uma transação e desfaz todas se uma falhar.
- `wrangler d1 migrations apply <banco> --local` e `--remote` aplicam os arquivos de `migrations/`.
- A Web Crypto dos Workers oferece PBKDF2 em `deriveBits` e a função `timingSafeEqual`.
- O limite de chamadas (`ratelimits`) é aproximado e vale por localidade do Cloudflare, com janela de 10 ou 60 segundos. Por isso o bloqueio de senha errada também é contado no banco (`login_attempts`).

Ainda não conferido: limite de iterações do PBKDF2, limites e preços do D1, restauração de backup, comportamento padrão das chaves estrangeiras.

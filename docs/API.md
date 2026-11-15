# Contrato da API do Cityou

Rotas do backend em Cloudflare Workers + D1. Tabelas em `DATA-MODEL.md`; quem chama cada rota em `INTERACTIONS.md`. Implementado até agora: `GET /api/health`, a proteção das escritas, o formato de erro, o `Server-Timing` e a primeira migração (tabelas de conta), mais a **demonstração em produção** do PR #8 descrita abaixo. O resto é especificação.

## Demonstração em produção (PR #8)

O Worker atende às rotas do painel e da cidade na demonstração sem login. Cada visitante recebe um cookie `cityou_demo` (HttpOnly, 30 dias) ao abrir uma página; o Worker deriva um nome a partir do SHA-256 do cookie e entrega o pedido a um Durable Object com SQLite (`DemoSession`, binding `DEMO_SESSIONS`). Os dados somem 30 dias depois da primeira escrita (alarme). Limites: 100 registros por tipo e corpo de até 24 KB.

| Rota | O que faz hoje |
|---|---|
| `GET /api/personal`, `POST /api/personal/entries`, `PUT /api/personal/entries/{id}/checkin`, `POST /api/personal/tasks` | Registros pessoais (hábitos, metas, notas, lançamentos, refeições, tarefas) |
| `GET /api/personal/tasks`, `POST /api/personal/tasks/{id}/complete` | Tarefas reais (`{ tasks }`, sem `connected`) e conclusão, com recompensa (etapa 2) |
| `POST /api/personal/events`, `PUT` e `DELETE /api/personal/events/{id}` | Agenda real (etapa 5, parte 1): compromissos e dias de respiro no Durable Object. Toda escrita devolve o `GET /api/personal` novo e, na criação (201), `created_id`. `?month=AAAA-MM` escolhe o mês devolvido (padrão: o de hoje). Corpo de `POST`: `kind` (`compromisso` padrão ou `respiro`), `title` 1 a 180 (respiro: fixo "Dia de respiro"), `day` AAAA-MM-DD entre 2000 e 2100, `start_time`/`end_time` `HH:MM` ou `null` (sem horário = dia inteiro; fim exige início e não é menor), `firmness` `firme` ou `leve` ("se der"), `place` até 80, `notes` até 1000. Um respiro por dia, sem horário nem notas; compromisso `firme` em dia de respiro é 422, `leve` é aceito. `PUT` aceita ao menos um campo (sem `kind`). Campo fora da lista, inclusive `credits`, `xp`, `level` e `unlock`, é 422 "Campo não aceito: x". Sem status e sem atraso. Teto de 1.000 por conta (422 "Você chegou ao limite de N registros deste tipo. Apague algum para continuar."). Id de outra sessão é 404 |
| `GET`, `POST /api/personal/projects`; `PUT`, `DELETE /api/personal/projects/{id}`; `POST /api/personal/projects/{id}/step-done` | Projetos reais (etapa 5, parte 2), mesmo molde da Agenda (devolvem o `GET /api/personal` novo, `created_id` na criação, 422 para campo fora da lista, teto de 100 por conta). Campos: `name` 1 a 120, `description` até 1000, `status` `active` ou `archived` ("Guardar por enquanto", reversível), `next_step` 1 a 180 ou `null` (campo único, sem prazo). `steps_done` e `last_step_at` são só do servidor. `step-done` (corpo `{}`) zera `next_step`, soma 1 em `steps_done` e grava `last_step_at`; 422 sem passo definido ou com o projeto guardado; não paga moedas nem XP |
| `GET`, `POST /api/personal/weights`; `PUT`, `DELETE /api/personal/weights/{id}` | Peso real (etapa 5, parte 3), mesmo molde (devolvem o `GET /api/personal` novo, `created_id` na criação, 422 para campo fora da lista, teto de 1.500 por conta, cerca de 4 anos). `POST`: `day` (hoje ou passado), `grams` inteiro de 20.000 a 400.000, `note` até 200. Uma pesagem por dia: repetir o dia é 422 "Já existe uma pesagem neste dia; edite-a.". `PUT` aceita só `grams` e `note` (o dia não muda). Sem campo de meta. `GET /api/personal` traz `weights` (últimos 120 dias, mais novas primeiro), `weight_trend` (`[{ day, grams, avg_grams }]`, `avg_grams` é a média das pesagens dos 7 dias que terminam no dia) e `weight_direction` (`estavel`, `subindo`, `descendo` ou `null`; banda morta de ±0,5% da média de agora contra a de 14 dias antes, `null` sem pesagem recente nem referência). `GET /api/personal/weights` devolve o histórico inteiro com a mesma tendência. Nenhuma moeda ou XP |
| `GET`, `DELETE /api/personal/nutrition`; `PUT /api/personal/nutrition/profile`; `GET`, `POST /api/personal/nutrition/screening`; `DELETE /api/personal/nutrition/screening/answers`; `POST /api/personal/nutrition/target`; `PUT`, `DELETE /api/personal/nutrition/plan` | Base calórica da aba Alimentação (`worker/nutrition.js`, contas em `shared/game/nutrition.js`). Toda rota devolve a visão da aba: `state` (`profile`, `screening`, `not_available` com `reason` `minor` (abaixo de 18), `age` (acima de 80) ou `pregnancy`, `incomplete` com `missing`, `ready`), `profile`, `screening` (`done`, `positive`, `skipped`, `day`, `has_answers`; **nunca as respostas**), `base` (só em `ready`: `bmr`, `tee`, `estimate { low, high }`, `adjustment`, `below_bmr`, `bmi`, `protein`, `notes` (`precision` com IMC ≥ 30), `weight_kg`, `weight_day`, `goal` (meta efetiva), `care`, `goal_changed`, `sources [{ key, text }]`), `target` (meta aceita), `estimate_changed`, `progress` (`waiting`, `on_track`, `off_track`, só depois de 21 dias com a meta), `plan` e `plan_warnings` (`below_bmr`, `low_protein`: avisam, não impedem). Perfil: `height_cm` 120–230, `sex` `f`/`m`, `birth_year`, `activity` (`inactive`, `low`, `active`, `very`), `goal` (`fat_loss`, `lean_preserve`, `maintain`, `muscle_gain`), `resistance_training` e `pregnant` booleanos; erro 422 traz `fields` por campo. Triagem opcional: `diagnosis` (true, false ou null) e `answers` (5 booleanos do SCOFF ou null); os dois nulos = pulou. Sinal de risco (diagnóstico sim ou 2 ou mais "sim" no SCOFF) liga `base.care`: meta de perda vira manutenção (`goal` `maintain`, `goal_changed`), ganho e manutenção seguem iguais. `GET .../screening` devolve `diagnosis` e `answers` só para a própria conta; `DELETE .../screening/answers` apaga os dois e mantém o resultado. `POST .../target` (corpo `{}`) guarda a estimativa atual como meta: a meta só muda por essa ação. Dieta própria: `kcal` 500–8000, `protein_g` 0–500 ou `null`, `note` até 300. O peso vem das pesagens (média de 7 dias da mais recente, até 30 dias). `DELETE /api/personal/nutrition` apaga perfil, triagem, meta e dieta (as pesagens ficam). Nenhuma moeda ou XP |
| `GET /api/personal/diary?day=AAAA-MM-DD`, `POST /api/personal/diary`; `PUT`, `DELETE /api/personal/diary/{id}`; `PUT /api/personal/diary/schedule`; `GET /api/personal/diary/foods?q=` | Diário alimentar da aba Alimentação (`worker/diary.js`). Programação: `PUT /diary/schedule` com `daily` true e `meals` (1 a 8, igual todos os dias) ou `daily` false e `by_weekday` (sete números de 1 a 8, do domingo ao sábado); sem programação o registro dá 422 e a tela pede a escolha. A busca (`q`, 2 letras ou mais, todas as palavras, sem acento) devolve até 20 alimentos da base, na ordem: nome que começa com a primeira palavra, TACO, com medida caseira, nome mais curto (`shared/game/foods-base.js`, TACO e USDA), cada um com `id`, `name`, `per_100g` (`kcal`, `protein`, `fat`, `carb`, `fiber`) e `portions` (`label`, `grams`) de `shared/game/foods-portions.js` (medidas caseiras do IBGE para a TACO e o leite; da USDA para os demais). Registro: `day` (hoje ou passado), `meal` (número da refeição do dia, de 1 até a quantidade do dia), `food_id` (tem de existir na base), `quantity` (0 a 1000) e `unit` (`g` ou o rótulo de uma porção do alimento); o servidor calcula gramas, kcal e macros e grava o resultado, então o navegador nunca envia nutriente. A edição aceita `meal`, `food_id` (trocar o alimento; a `unit` tem de valer para o novo, e o servidor recalcula nome, gramas e nutrientes), `quantity` e `unit`. Toda rota devolve a visão do dia: `day`, `weekday`, `weekday_name`, `schedule` (`daily`, `meals`, `by_weekday`, ou `null`), `entries`, `meals` (uma por refeição do dia, com `id`, `label` e `totals`; registros de refeições que saíram da programação aparecem como extras), `totals` (`kcal`, `protein`, `fat`, `carb`, `fiber`) e `target` (`low`, `high` da meta aceita na base calórica, ou `null`). Campo fora da lista é 422; 422 traz `fields`. Teto de 20.000 registros por conta (cerca de 7 anos com 8 alimentos por dia). `fiber` é `null` quando a fonte não traz o valor, e `totals.fiber` soma só os que têm. Nenhuma moeda ou XP |
| `GET`, `POST /api/personal/body-composition`; `PUT`, `DELETE /api/personal/body-composition/{id}` | Composição corporal da aba Fitness (`worker/body.js`), mesmo molde das pesagens: uma medida por dia, `day` (hoje ou passado), `fat_pct` de 2 a 70 (uma casa decimal), `lean_grams` inteiro de 15.000 a 200.000 ou `null`, `method` (`bia`, `skinfold`, `dexa`, `other`), `note` até 200. Toda rota devolve `{ body_composition, body_trend }`; `body_trend` é a média das até 3 medidas mais recentes dos últimos 60 dias (`fat_pct`, `lean_grams` só se todas tiverem, `count`, `from`, `to`) ou `null`. 422 traz `fields`. Na base calórica, essa média vira `base.composition` e a massa magra (medida ou estimada por peso × (1 − gordura)) entra só na proteína (`protein.leanGrams`), nunca na TMB. Teto de 1.500 por conta. Nenhuma moeda ou XP |
| `GET /api/city?local=<id>`, `POST /api/city/actions?local=<id>`, `POST /api/rewards/sync?local=<id>` | Cidade do local (a Ilha por padrão); local bloqueado responde 403 |
| `GET /api/world/progress` | Locais liberados, concluídos e `viagens_disponiveis` |
| `POST /api/world/travel` | Corpo `{ local, request_id }`; libera o destino se houver viagem disponível, senão 409 |
| `PUT /api/world/progress` | Ainda aceito por clientes antigos, mas ignorado: o acesso vem das ações no servidor |
| `GET /api/personal/proofs/{atividade}/{dia}/photo` | A foto de uma comprovação, só para a sessão que a enviou; 404 se não houver |

**Atividades.** Hábitos, metas e tarefas aceitam `domain` (`saude`, `alimentacao`, `financas`, `estudos`, `mente`, `organizacao`; padrão `organizacao`) e `place` (até 80 caracteres), que dão tipo e nome ao prédio da atividade.

**Comprovação.** `PUT /api/personal/entries/{id}/checkin` aceita `{ done: true, proof: { note?, photo? } }`. A nota tem de 20 a 500 caracteres; a foto é um `data:` JPEG ou WebP de até 250 KB. A resposta inclui `proof_result: { bonus, reason }` (`reason`: `null`, `daily_cap` ou `already_proved`) e `proofs` (sem as fotos). Erros 422 com mensagem para a pessoa: nota curta, foto repetida, formato inválido, limite de 100 comprovações.

**Resumo.** `GET /api/personal` e a resposta das marcações trazem `resumo` (ver `DASHBOARD.md`).

**Viagens fechadas.** Com `TRAVEL_OPEN=false`, `POST /api/world/travel` para um destino novo responde 409 e `GET /api/world/progress` traz `viagens_abertas: false` e `viagens_disponiveis: 0`. O Durable Object lê a configuração diretamente do ambiente. Na prévia isolada com `CITYOU_TEST_OPEN_REGIONS=1`, os oito destinos ficam acessíveis para teste.

As rotas antigas `/api/workspace/*` foram removidas na etapa 6B. O retrato da cidade não traz mais `source`. O contrato de `POST /api/world/travel` de hoje difere do alvo desta página (sem nível nem passagem em créditos): ver `GAME-DESIGN.md`, seção "O que já está implementado". Para o alvo, esta demonstração vira a fonte de importação: os registros de um visitante podem ser trazidos para a conta dele quando o login existir.

## Arquitetura

Um único Worker serve o site e a API. `wrangler.jsonc` ganha:

- `main`: o código do Worker (`worker/index.js`);
- `assets.binding` e `assets.run_worker_first`: a API e as páginas HTML principais passam pelo Worker para sessão, redirecionamento e cabeçalhos; os outros assets saem direto dos arquivos estáticos;
- `d1_databases`: o banco, com o esquema em `migrations/*.sql` (aplicado com `wrangler d1 migrations apply`, `--local` no desenvolvimento e `--remote` na publicação);
- `ratelimits`: limite aproximado de chamadas às rotas de login.

Escritas que tocam mais de uma tabela (por exemplo, concluir tarefa e gravar o crédito) vão num único `env.DB.batch()`, que roda como uma transação: ou grava tudo, ou nada.

No desenvolvimento, o Vite encaminha `/api` ao Worker local na porta 8787.

## Convenções

- **Formato:** JSON em UTF-8. Respostas de `/api/*` saem com `Cache-Control: no-store`.
- **Sessão:** cookie `cityou_session`, `HttpOnly; Secure; SameSite=Lax; Path=/`, válido por 30 dias. O banco guarda só o SHA-256 do token.
- **Escritas** (`POST`, `PUT`, `PATCH`, `DELETE`) exigem `X-Cityou-Request: 1` e `Origin` igual ao do site. Juntos com `SameSite=Lax`, barram envio forjado por outro site.
- **Identificadores:** o navegador gera o `id` (UUID) e envia no corpo do `POST`. Repetir o mesmo `POST` devolve o registro já criado, com 200, sem duplicar.
- **Dono:** toda rota usa o `user_id` da sessão. Registro de outra conta responde 404.
- **Erros:** `{ "message": "texto para a pessoa", "detail": "o mesmo texto", "fields": { "campo": "motivo" } }`. `ApiError` em `src/fifones/api.js` já lê `message` e `detail`.
- **Cliente único (etapa 2):** painel e cidade chamam a API pelo mesmo `api()` de `src/fifones/api.js`. Um 401 leva a pessoa a `/?entrar=1&next=<página atual>` uma vez só (dentro do painel, quem navega é a janela do painel) e, depois disso, nenhum outro pedido sai. `goToPanel(aba)` abre `/app#/<aba>` a partir da cidade, avulsa ou embutida, só para abas da lista fechada `PANEL_TABS`.

| Código | Quando |
|---|---|
| 200 | Leitura, edição, ou criação repetida |
| 201 | Criação |
| 401 | Sem sessão ou sessão vencida |
| 403 | Falta o cabeçalho de escrita ou a origem não confere |
| 404 | Não existe ou é de outra conta |
| 409 | Conflito: e-mail já cadastrado, `expected_revision` antiga, `request_id` reusado com outro corpo |
| 410 | A demonstração venceu antes de ser vinculada. O cadastro emite um novo cookie para a próxima tentativa |
| 413 | Corpo acima do limite da rota |
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

**Já implementado** (`worker/auth.js`, guia em `docs/CONTAS.md`): `signup`, `login`, `logout`, `GET /api/me` e `GET /api/auth/status` (`{ accounts, user }`, sem 401). A conta adota os dados da demonstração (`users.data_key`) antes de confirmar o cadastro e troca o cookie da demonstração. Cadastro e login aceitam até 4.000 bytes de JSON. `forgot`, `reset`, `PATCH /api/me`, exportar e apagar ficam para depois.

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

Reúne os dados usados no painel em uma leitura. `events` e `transactions` vêm do mês corrente por padrão; `?month=AAAA-MM` pede outro mês.

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
| `GET /api/cities/{local}` | | Retrato da cidade: `revision`, `placements` (com `stage`), `catalog`, `unlock_radius` (agora o terreno inteiro; `-1` na ilha), `scenic` (`true` na Ilha Inicial: sem catálogo nem construção), mais `credits` e `level` da pessoa | leitura |
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
| `GET /api/workspace/tasks` | `backend/app.py` | `GET /api/tasks` (ou `GET /api/overview`); desde a etapa 2 o cliente usa `GET /api/personal/tasks` |
| `GET /api/workspace/projects` | `backend/app.py` | `GET /api/projects` |
| `GET /api/workspace/activity` | `backend/app.py`, `backend/activity.py` | Removida: eram sinais do Fifones (a cidade não pede mais desde a etapa 2) |
| `POST /api/rewards/sync` | `backend/app.py` | Removida: o crédito é gravado na hora da ação |
| `POST /api/workspace/tasks/{id}/complete` | `backend/app.py` | `POST /api/tasks/{id}/complete`; desde a etapa 2 o cliente usa `POST /api/personal/tasks/{id}/complete` |
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

### Construir com rua automática no Rio (Worker)

`POST /api/city/actions?local=cristo-redentor` com `type: "build"` mantém os campos existentes (`kind`, `x`, `y`, `rotation` opcional, `expected_revision` e `request_id`). O servidor traça a ligação mais curta por lotes válidos e soma o custo do prédio ao dos trechos de rua. Registra todas as peças, uma revisão e um débito juntos. Sem saldo, com lote protegido, caminho impossível ou acima de 30 trechos, devolve 422. Revisão divergente ou lote ocupado retorna 409. Reenviar a mesma ação com o mesmo `request_id` devolve o estado sem repetir o débito. Mover e girar continuam exigindo rua existente. Desde 14/11/2026 o prédio nasce **virado para a rua**: se a frente dele (a rotação enviada) não dá numa rua conectada, o servidor devolve a rotação do lado em que há rua (`facingRotation`, `shared/game/city-layout.js`), sem trocar a pegada de um prédio retangular; mover faz o mesmo no lote novo, e `rotate` é a escolha da pessoa e vale sempre. Decoração (árvore, calçadão) e prédio no morro não pedem rua nem giram. Quem lê `placement.rotation` da resposta recebe o valor já ajustado.

## Velocidade

| Meta | Como se mede |
|---|---|
| Resposta na tela em até 50 ms depois do toque | Teste de navegador: tempo entre o toque e a mudança visível, sem esperar a rede |
| Processamento no servidor em até 60 ms na mediana | Cabeçalho `Server-Timing` em toda resposta; `tools/api-perf.mjs` anota mediana e percentil 95 |
| App abre sem esperar a rede | A última resposta de `GET /api/overview` fica guardada no aparelho e é mostrada na hora; a nova substitui ao chegar |

Regras para manter o servidor rápido: a sessão é lida uma vez por pedido; cada ação é um único `env.DB.batch()`; toda listagem tem índice; nenhuma rota faz chamada externa no caminho da resposta (o envio de e-mail vai em `ctx.waitUntil`).

**Aparelho primeiro.** Para a tela nunca esperar o servidor, cada ação é aplicada na hora no aparelho e entra numa fila local com o seu identificador. A fila é enviada em segundo plano e reenviada se a rede falhar; como cada ação tem identificador, o reenvio não duplica nada. O servidor recalcula XP e créditos e a resposta dele substitui a previsão do aparelho. Se os dois divergirem, vale o servidor. A previsão usa as mesmas regras (`shared/game/rules.js`), então a divergência é rara. Isso torna a experiência independente de onde o banco fica.

**Banco em São Paulo.** O D1 e os Durable Objects não rodam na América do Sul, então os dados ficam num banco externo em São Paulo (provedor ainda em escolha, ver `DATA-MODEL.md`), ligado pelo Hyperdrive. Com `placement.region` apontando para a região do banco, as consultas de um pedido custam de 1 a 3 ms cada, em vez de 20 a 30 ms. A meta de 60 ms no servidor só se confirma medindo no site publicado (`npm run perf:api -- https://<site>`); não foi medida.

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

## Moedas de teste dos sócios (`POST /api/admin/credits`)

Rota de administração da demonstração, para os sócios que testam o app. Ela só existe se o Worker tiver o segredo
`CITYOU_ADMIN_TOKEN` (16 caracteres ou mais; sem ele a rota responde 404). Credita 50.000 moedas **na sessão de quem
chama**, uma vez por sessão (a segunda chamada responde 409), e registra "Créditos de teste (sócios)" no histórico.
O token vai no cabeçalho `X-Cityou-Admin`; erros: 403 (token errado), 404 (sem segredo), 409 (já recebeu).

Cada sócio roda uma vez no console do navegador, na página do app já aberta (para valer a sessão dele):

```js
fetch('/api/admin/credits', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cityou-Request': '1', 'X-Cityou-Admin': 'COLE_O_TOKEN' }, body: '{}' }).then(r => r.json()).then(c => console.log(c.credits))
```

Para criar o segredo: `npx wrangler secret put CITYOU_ADMIN_TOKEN` (ou Cloudflare → Workers → cityou → Settings → Variables and Secrets).
Se o cookie `cityou_demo` expirar ou for apagado, a sessão é outra e a pessoa pode rodar de novo.

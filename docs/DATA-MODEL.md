# Modelo de dados do Cityou

Especificação do banco para o backend em Cloudflare Workers + D1. Ainda não há código: este documento, `INTERACTIONS.md` e `API.md` são a fase B0 do plano. O esquema vira `migrations/0001_init.sql` na fase B1.

Decisões já tomadas: backend no Cloudflare (Workers + D1), vários usuários com login, tabelas próprias para todas as áreas (sem depender do Fifones na porta 8765).

## De onde partimos

Hoje existem três bancos SQLite locais, sem usuário:

| Arquivo | Tabelas | Destino |
|---|---|---|
| `data/city.sqlite3` (`backend/app.py`) | `city`, `placements`, `rewards`, `history`, `requests` | `city`, `placements`, `ledger`, `requests`, agora por usuário |
| `data/personal.sqlite3` (`backend/personal.py`) | `entries`, `checkins` | `habits`, `habit_checkins`, `goals`, `goal_steps`, `notes`, `transactions`, `meals` |
| `data/world.sqlite3` (`backend/world.py`) | `world_progress`, `world_meta` | `world_progress`, `world_state`, por usuário |

Tarefas, projetos, agenda, peso, materiais e memórias vinham do Fifones. Passam a ter tabela própria.

## Regras para todas as tabelas

- **`id`**: texto, UUID gerado no navegador (`crypto.randomUUID()`). A tela mostra o item antes de o servidor responder, e reenviar o mesmo `id` não cria duplicata.
- **`user_id`**: dono do registro. Toda consulta filtra por ele. Um `id` de outro usuário responde 404, nunca 403, para não revelar que existe.
- **`created_at`, `updated_at`**: texto ISO 8601 em UTC, gravados pelo servidor.
- **`deleted_at`**: apagar preenche este campo; "Desfazer" o limpa. As listagens ignoram linhas com `deleted_at`. Uma limpeza futura remove de vez o que foi apagado há mais de 30 dias.
- **Dias** (`day`, `due_date`): texto `AAAA-MM-DD` no fuso do usuário (`users.timezone`). **Horários** (`start_at`): ISO 8601 com fuso.
- **Dinheiro e peso** em inteiros (`amount_cents`, `grams`), sem ponto flutuante.
- Limites de texto herdados de `backend/personal.py`: título até 180 caracteres, corpo até 4.000, categoria até 50.
- Só o título é obrigatório. Os demais campos têm valor padrão.

## Conta

### `users`

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | TEXT PK | UUID gerado pelo servidor |
| `email` | TEXT NOT NULL UNIQUE | em minúsculas, sem espaços |
| `display_name` | TEXT NOT NULL | 1 a 60 caracteres; aparece na saudação |
| `password_hash`, `password_salt` | TEXT NOT NULL | PBKDF2 via Web Crypto; sal aleatório por usuário |
| `password_iterations` | INTEGER NOT NULL | gravado por linha, para poder aumentar depois |
| `timezone` | TEXT NOT NULL | padrão `America/Sao_Paulo` |
| `created_at`, `updated_at`, `deleted_at` | TEXT | |

Preenchida por: tela de cadastro → "Criar conta". Editada em Conta → nome e fuso.

### `sessions`

| Coluna | Tipo | Regra |
|---|---|---|
| `token_hash` | TEXT PK | SHA-256 do token do cookie; o token em si nunca é gravado |
| `user_id` | TEXT NOT NULL | índice |
| `created_at`, `last_seen_at`, `expires_at` | TEXT | sessão de 30 dias, renovada com o uso |

Preenchida por: "Entrar" e "Criar conta". Apagada por "Sair" e ao apagar a conta.

### `login_attempts`

`email` TEXT, `window_start` TEXT, `count` INTEGER, chave primária (`email`, `window_start`). Preenchida pelo sistema a cada senha errada. Depois de 5 erros em 15 minutos, o login daquele e-mail espera o fim da janela.

## Dados do usuário

Todas têm as colunas comuns (`id`, `user_id`, `created_at`, `updated_at`, `deleted_at`).

| Tabela | Colunas próprias | Índice | Quem preenche (tela → ação) | O que a pessoa vê |
|---|---|---|---|---|
| `tasks` | `title`, `description`, `due_date` NULL, `priority` 0 a 3, `status` (`open`, `done`), `completed_at` NULL, `project_id` NULL | (`user_id`, `status`, `due_date`) | Seu dia e Tarefas → "Nova tarefa"; o círculo conclui | Item na lista; ao concluir, sai de "A fazer" e soma 10 créditos |
| `projects` | `name`, `description`, `status` (`active`, `archived`) | (`user_id`, `status`) | Projetos → "Novo projeto" | Cartão novo; tarefas podem ser ligadas a ele |
| `events` | `title`, `start_at`, `end_at` NULL, `all_day` 0/1, `location`, `notes` | (`user_id`, `start_at`) | Agenda → "Novo compromisso" | Cartão na Agenda e em "Na sua agenda" de Seu dia |
| `habits` | `title`, `body`, `weekdays` (7 caracteres, `1111111` = todo dia), `archived_at` NULL | (`user_id`) | Hábitos → "Novo hábito" | Cartão novo; o anel do dia passa a contar com ele |
| `goals` | `title`, `body`, `target` 1 a 10.000 dias | (`user_id`) | Metas → "Nova meta" | Cartão com barra em 0 de `target` |
| `transactions` | `title`, `amount_cents` > 0, `direction` (`expense`, `income`), `category`, `day` | (`user_id`, `day`) | Finanças → "Novo lançamento" | Linha na lista; entradas, saídas e saldo do mês recalculados |
| `meals` | `title`, `body`, `day` (não pode ser futuro), `meal_time` NULL | (`user_id`, `day`) | Alimentação → "Registrar refeição" | Cartão na lista |
| `notes` | `kind` (`note`, `reflection`, `memory`), `title`, `body`, `day` | (`user_id`, `kind`, `day`) | Seu dia → "Anotar" (`note`); Autoconhecimento → "Registrar meu momento" (`reflection`); Memórias → "Nova memória" (`memory`) | Cartão no topo da lista da área |
| `weights` | `day`, `grams`, `note`; único por (`user_id`, `day`) | (`user_id`, `day`) | Fitness → "Registrar peso" | "Última pesagem" e a lista "Sua evolução" |
| `documents` (fase B7) | `name`, `mime`, `size_bytes`, `r2_key` | (`user_id`) | Biblioteca → "Adicionar material" | Capa na grade; o arquivo fica no R2 |

Marcações diárias (sem `id` próprio nem `deleted_at`; desmarcar grava `done = 0`):

| Tabela | Colunas | Chave | Quem preenche | O que a pessoa vê |
|---|---|---|---|---|
| `habit_checkins` | `habit_id`, `user_id`, `day`, `done` 0/1, `updated_at` | (`habit_id`, `day`) | Hábitos → "Marcar como feito" | Botão vira "Feito hoje", o anel avança, 5 créditos na primeira vez do dia |
| `goal_steps` | `goal_id`, `user_id`, `day`, `done` 0/1, `updated_at` | (`goal_id`, `day`) | Metas → "Registrar um passo hoje" | A barra da meta avança um dia |

## Jogo

| Tabela | Colunas | Chave | Quem preenche | O que a pessoa vê |
|---|---|---|---|---|
| `ledger` | `id` INTEGER AUTOINCREMENT, `user_id`, `source_key`, `amount`, `label`, `created_at` | único (`user_id`, `source_key`) | Sistema: ao concluir tarefa, marcar hábito, construir ou remover na cidade | Contador de créditos no topo; "Histórico de moedas" na cidade |
| `city` | `user_id`, `revision`, `credits` ≥ 0, `earned`, `reward_count`, `started_at` | `user_id` | Sistema: criada no cadastro com 50 créditos de boas-vindas | Saldo, nível e raio liberado |
| `placements` | `id`, `user_id`, `kind`, `x`, `y`, `rotation` 0 a 3, `level` 1 a 3 | `id` | Cidade → construir, mover, girar, melhorar, remover | A construção no mapa 3D |
| `requests` | `user_id`, `request_id`, `fingerprint`, `response`, `created_at` | (`user_id`, `request_id`) | Sistema: cada ação da cidade | Nada. Evita cobrar duas vezes quando a rede repete o envio |
| `world_progress` | `user_id`, `space_id`, `unlocked`, `completed` | (`user_id`, `space_id`) | Sistema: ao atingir um marco (ver decisões pendentes) | Monumento liberado no globo |
| `world_state` | `user_id`, `epoch`, `updated_at` | `user_id` | Sistema: reset do mapa aumenta `epoch` | Nada |
| `usage_counts` | `user_id`, `action`, `day`, `count` | (`user_id`, `action`, `day`) | Sistema: a cada ação de escrita | Nada. Mostra quais funções são de fato usadas |

`ledger` une as antigas `rewards` (chave única de cada recompensa) e `history` (extrato). `usage_counts` guarda só o nome da ação e a contagem, nunca o conteúdo.

### Regras de crédito

Portadas de `backend/app.py` (classe `Store`), com os mesmos casos de `tests/test_backend.py`:

| Origem | `source_key` | Valor | Regra |
|---|---|---|---|
| Boas-vindas | `welcome` | +50 | uma vez por conta; não conta em `earned` |
| Tarefa concluída | `task:<id>` | +10 | uma vez por tarefa, para sempre: reabrir e concluir de novo não paga outra vez |
| Hábito feito | `habit:<id>:<dia>` | +5 | uma vez por hábito por dia; só paga quando `dia` é hoje |
| Construir, melhorar | `city:<request_id>` | negativo | custo do catálogo; melhorar custa custo-base × nível atual |
| Remover construção | `city:<request_id>` | +metade do custo | arredondado para baixo |

Nunca há punição: desmarcar um hábito ou reabrir uma tarefa não tira créditos. Não existe recompensa por tempo nem perda de sequência. Nível = 1 + `reward_count` ÷ 10; raio liberado = 3 + `reward_count` ÷ 10, até 8.

## Mudanças em relação ao que existe

- `entries` (uma tabela para cinco tipos) vira cinco tabelas. Cada uma só tem as colunas que usa.
- `checkins` servia hábitos e metas; vira `habit_checkins` e `goal_steps`.
- Tudo ganha `user_id`, edição e exclusão com desfazer. Hoje só existe criação.
- Recompensas passam a ser gravadas na hora da ação, na mesma transação (`env.DB.batch()`). Acaba a reconciliação com o Fifones (`POST /api/rewards/sync`).
- Hábitos criados no Cityou passam a gerar créditos. Hoje só o hábito do Fifones gera.

## Importação (fase B7)

`tools/import-local.mjs` lê os três SQLite locais e, se o Fifones estiver aberto, as rotas `/api/tasks`, `/api/projects`, `/api/events`, `/api/fitness` e `/api/memories`. Tudo entra na conta de quem estiver logado. Recompensas antigas entram no `ledger` com valor 0, como `ignore_historical` já faz, para não pagar de novo.

## Decisões pendentes

1. **Passo de meta dá crédito?** Proposta: não. A meta já tem a própria barra, e o hábito diário é o que paga.
2. **Teto diário de hábitos pagos.** Sem teto, criar 50 hábitos e marcar todos rende 250 créditos por dia. Proposta: os 5 primeiros do dia pagam; os demais contam no anel, sem crédito.
3. **Regra para abrir espaços do mapa.** Hoje é o botão "Concluir fase (simulação)". Proposta: um espaço a cada 10 recompensas (`reward_count`), a mesma medida do nível da cidade.
4. **Marcar dias passados.** Proposta: permitir até 7 dias para trás, sem crédito.
5. **Prédios de IA da cidade** (ChatGPT, Claude, Gemini, Grok). Dependiam da atividade do Fifones. Proposta: continuam como construções decorativas, sem o painel de atividade.
6. **Recuperar senha.** Exige envio de e-mail. Proposta: lançar o login sem isso e decidir depois entre e-mail e "Entrar com Google".

## A conferir na fase B1

- Limite de iterações do PBKDF2 no runtime dos Workers (a documentação confirma o algoritmo, não o limite).
- Limites e preços do plano do D1, e como funciona a restauração de backup.
- Se o D1 aplica chaves estrangeiras por padrão. Até confirmar, o Worker valida os vínculos (`project_id`, `habit_id`, `goal_id`) antes de gravar.

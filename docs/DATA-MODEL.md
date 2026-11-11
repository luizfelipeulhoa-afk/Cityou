# Modelo de dados do Cityou

Especificação do banco para o backend em Cloudflare Workers + D1. Ainda não há código: este documento, `INTERACTIONS.md` e `API.md` são a fase B0 do plano. O esquema vira `migrations/0001_init.sql` na fase B1.

Decisões já tomadas: backend no Cloudflare (Workers + D1), vários usuários com login, tabelas próprias para todas as áreas (sem depender do Fifones na porta 8765). As regras do jogo (XP, presença, viagens, prédios) estão em `GAME-DESIGN.md`.

## De onde partimos

Hoje existem três bancos SQLite locais, sem usuário:

| Arquivo | Tabelas | Destino |
|---|---|---|
| `data/city.sqlite3` (`backend/app.py`) | `city`, `placements`, `rewards`, `history`, `requests` | `player`, `cities`, `placements`, `ledger`, `requests`, por usuário |
| `data/personal.sqlite3` (`backend/personal.py`) | `entries`, `checkins` | `habits`, `habit_checkins`, `goals`, `goal_steps`, `notes`, `transactions`, `meals` |
| `data/world.sqlite3` (`backend/world.py`) | `world_progress`, `world_meta` | Substituídas por `cities` e `travels` (o mapa deixa de ser linear) |

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

### `password_resets`

`token_hash` TEXT PK (SHA-256 do token do link), `user_id`, `created_at`, `expires_at` (30 minutos), `used_at` NULL. Preenchida por: "Esqueci minha senha". O link vale uma vez; usar preenche `used_at` e apaga as sessões abertas da conta.

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
| `documents` (fase B8) | `name`, `mime`, `size_bytes`, `r2_key` | (`user_id`) | Biblioteca → "Adicionar material" | Capa na grade; o arquivo fica no R2 |

Marcações diárias (sem `id` próprio nem `deleted_at`; desmarcar grava `done = 0`):

| Tabela | Colunas | Chave | Quem preenche | O que a pessoa vê |
|---|---|---|---|---|
| `habit_checkins` | `habit_id`, `user_id`, `day`, `done` 0/1, `updated_at` | (`habit_id`, `day`) | Hábitos → "Marcar como feito" | Botão vira "Feito hoje", o anel avança, 5 créditos na primeira vez do dia |
| `goal_steps` | `goal_id`, `user_id`, `day`, `done` 0/1, `updated_at` | (`goal_id`, `day`) | Metas → "Registrar um passo hoje" | A barra da meta avança um dia |

## Jogo

As regras e os números estão em `GAME-DESIGN.md`. Aqui ficam só as tabelas.

| Tabela | Colunas | Chave | Quem preenche | O que a pessoa vê |
|---|---|---|---|---|
| `player` | `user_id`, `xp` (dentro do nível), `lifetime_xp`, `level`, `credits` ≥ 0, `credits_earned`, `credits_spent`, `current_location`, `updated_at` | `user_id` | Sistema: criada no cadastro (50 créditos, Ilha Inicial); atualizada a cada ação | Nível, barra de XP e créditos no topo |
| `ledger` | `id` INTEGER AUTOINCREMENT, `user_id`, `source_key`, `reason`, `ref_id` NULL, `amount`, `balance_after`, `xp`, `multiplier`, `domain` NULL, `label`, `created_at` | único (`user_id`, `source_key`) | Sistema: a cada ganho ou gasto | Extrato: de onde veio cada crédito e cada XP |
| `domain_progress` | `user_id`, `domain`, `xp`, `active_weeks`, `updated_at` | (`user_id`, `domain`) | Sistema: a cada ação com domínio | Barra de cada prédio de domínio |
| `domain_days` | `user_id`, `domain`, `day` | (`user_id`, `domain`, `day`) | Sistema: primeira ação do dia no domínio | Nada. Serve para contar semanas ativas |
| `presence_days` | `user_id`, `day` | (`user_id`, `day`) | Sistema: primeira ação real do dia | Calendário de presença e o degrau do bônus |
| `cities` | `id`, `user_id`, `location_id`, `revision`, `started_at` | único (`user_id`, `location_id`) | Sistema: no cadastro (Ilha) e a cada viagem | A cidade daquele local |
| `placements` | `id`, `user_id`, `city_id`, `kind`, `custom_name` NULL, `x`, `y`, `rotation` 0 a 3, `stage` 0 a 4, `variant_seed` | `id`; índice (`city_id`) | Cidade → construir, mover, girar, remover; o sistema avança `stage` | A construção no mapa 3D, na etapa atual |
| `travels` | `id`, `user_id`, `from_location`, `to_location`, `cost`, `created_at` | `id`; índice (`user_id`) | Globo → "Viajar" | Local liberado; rota desenhada no globo |
| `upgrade_points` | `user_id`, `domain`, `available`, `earned_total` | (`user_id`, `domain`) | Sistema: meta curta concluída ou marco de XP do domínio | "1 melhoria disponível" no prédio |
| `building_upgrades` | `id`, `user_id`, `placement_id`, `slot`, `upgrade_id`, `source_key`, `created_at` | `id`; único (`placement_id`, `slot`) | Prédio → "Escolher melhoria" | Sala ou equipamento novo no interior, com a data e a conquista |
| `requests` | `user_id`, `request_id`, `fingerprint`, `response`, `created_at` | (`user_id`, `request_id`) | Sistema: ações da cidade e viagens | Nada. Evita cobrar duas vezes quando a rede repete o envio |
| `usage_counts` | `user_id`, `action`, `day`, `count` | (`user_id`, `action`, `day`) | Sistema: a cada ação de escrita | Nada. Mostra quais funções são de fato usadas |

Notas:

- `player` substitui a antiga `city` de linha única: créditos, XP e nível são da pessoa, e as cidades são várias.
- Um local está liberado quando existe uma linha em `cities` para ele. `world_progress` e `world_meta` deixam de existir.
- `ledger` une as antigas `rewards` (chave única de cada recompensa) e `history` (extrato). `multiplier` guarda o bônus de presença aplicado, em centésimos (100 = normal, 200 = em dobro).
- `tasks`, `habits` e `goals` ganham a coluna `domain` (`saude`, `alimentacao`, `financas`, `estudos`, `mente`, `organizacao`; padrão `organizacao`). Lançamentos, refeições, pesagens e reflexões têm domínio fixo pelo tipo.
- `goals` ganha `completed_at`: é preenchida quando os passos atingem o alvo, e é o que dispara a recompensa de meta concluída.
- `usage_counts` guarda só o nome da ação e a contagem, nunca o conteúdo.
- `ledger` nunca é alterado nem apagado: só recebe linhas. `reason` é uma palavra curta (`welcome`, `task`, `habit`, `goal_step`, `goal`, `record`, `comeback`, `build`, `remove`, `travel`) e `balance_after` é o saldo logo depois da linha. Com isso dá para conferir o saldo e medir de onde os créditos vêm e para onde vão.
- `placements.variant_seed` é sorteado na construção e nunca muda: escolhe a variação visual daquele prédio.
- `users` ganha `timezone_changed_at`: mudar o fuso só vale a partir do dia seguinte e no máximo uma vez a cada 30 dias.
- O terreno de cada local (água, montanha, área reservada) é dado fixo em código, não vai para o banco. O banco guarda só o que a pessoa construiu.
- O catálogo de construções, as opções de melhoria e todos os valores ficam em código (`shared/game/`), não no banco.

### Chaves de recompensa (`ledger.source_key`)

| Origem | Chave |
|---|---|
| Boas-vindas | `welcome` |
| Tarefa concluída | `task:<id>` |
| Hábito feito | `habit:<id>:<dia>` |
| Passo de meta | `goalstep:<id>:<dia>` |
| Meta concluída | `goal:<id>` |
| Registro do dia | `record:<tipo>:<dia>` |
| Retorno | `return:<dia>` |
| Cidade (construir, remover) | `city:<request_id>` |
| Viagem | `travel:<local>` |

A chave única por usuário é o que impede pagar duas vezes pela mesma coisa.

## Mudanças em relação ao que existe

- `entries` (uma tabela para cinco tipos) vira cinco tabelas. Cada uma só tem as colunas que usa.
- `checkins` servia hábitos e metas; vira `habit_checkins` e `goal_steps`.
- Tudo ganha `user_id`, edição e exclusão com desfazer. Hoje só existe criação.
- Recompensas passam a ser gravadas na hora da ação, na mesma transação (`env.DB.batch()`). Acaba a reconciliação com o Fifones (`POST /api/rewards/sync`).
- Hábitos criados no Cityou passam a gerar XP e créditos. Hoje só o hábito do Fifones gera.
- Uma cidade única vira uma cidade por local, e o mapa linear vira escolha da pessoa.
- O nível deixa de vir da contagem de recompensas e passa a vir do XP.

## Importação (fase B8)

`tools/import-local.mjs` lê os três SQLite locais e, se o Fifones estiver aberto, as rotas `/api/tasks`, `/api/projects`, `/api/events`, `/api/fitness` e `/api/memories`. Tudo entra na conta de quem estiver logado. Recompensas antigas entram no `ledger` com valor 0, como `ignore_historical` já faz, para não pagar de novo.

## Decisões

Fechadas:

| Assunto | Decisão |
|---|---|
| Teto diário de hábitos pagos | 8 por dia |
| Abertura de locais no mapa | Por nível, prédios construídos e passagem em créditos; a pessoa escolhe o destino |
| Presença | Dias ativos registrados; bônus de XP e créditos por ritmo da semana, sem zerar |
| Prédios | Um por domínio, construído pelo uso real e depois melhorado por conquistas menores |
| Recuperar senha | Link enviado ao e-mail |
| Locais do mapa | A Ilha e 7 monumentos; não haverá um oitavo |
| Nomes dos prédios | Não são fixados pelo app: vêm da vida de cada pessoa. Definição futura |

Abertas (propostas em `GAME-DESIGN.md`):

1. Os números: nível da primeira viagem, custos, degraus do bônus, limites de cada etapa.
2. Qual é o transporte da viagem.
3. Domínio próprio para enviar o e-mail de recuperação de senha.
4. Como a pessoa nomeia e escolhe os próprios prédios (ver `GAME-DESIGN.md`).

## Onde os dados ficam

**Decidido:** o banco fica em **São Paulo**. O D1 e os Durable Objects do Cloudflare não rodam na América do Sul (um objeto pedido para lá é criado no leste da América do Norte, segundo a documentação), então o banco será um provedor externo ligado ao Worker pelo **Hyperdrive**. O provedor ainda não foi escolhido.

| Opção | São Paulo | Ligação ao Worker | Observações |
|---|---|---|---|
| **Neon** (Postgres) | `aws-sa-east-1`, disponível desde fev/2025 | Hyperdrive | Plano grátis (1 GB por projeto, segundo o FAQ do Neon). Desliga após 5 minutos parado; a partida a frio (estimada em 0,5 a 2 s por um blog) não foi conferida |
| **PlanetScale** (Postgres ou MySQL) | `aws-sa-east-1` na lista de regiões | Hyperdrive; cobrança pode vir pela conta do Cloudflare | Não confirmei Postgres em São Paulo especificamente nem plano grátis |
| **Supabase** (Postgres) | Listado na página de regiões | Hyperdrive | Não confirmei se o plano grátis cria projeto em São Paulo |
| **Turso** (SQLite) | `gru` | Cliente HTTP | Mantém o dialeto SQLite das migrações atuais; a região principal não muda depois de criada |

**O que já existe em produção (PR #8):** uma demonstração sem login, com um Durable Object de SQLite por visitante (tabela `records (kind, id, value)`, validade de 30 dias). Os Durable Objects são criados perto do primeiro pedido do visitante, o que ajuda quem usa o app, mas não há região em São Paulo: para a América do Sul a documentação diz que eles caem numa região próxima, hoje o leste da América do Norte. A latência real dessa demonstração não foi medida. Ela serve como etapa intermediária e como origem de importação quando houver conta.

**Recomendação: Neon em `aws-sa-east-1` com Hyperdrive.** Região confirmada, plano grátis para começar, e Postgres serve bem ao extrato e a vários usuários. A alternativa que menos reescreve é o Turso.

O que o Cloudflare diz do Hyperdrive (conferido): faz a conexão perto do Worker, mantém o grupo de conexões perto do banco, pode guardar leituras em cache (sem invalidar ao gravar) e está nos planos grátis (100 mil consultas por dia) e pago. A opção `placement.region` (por exemplo `aws:sa-east-1`) põe o Worker perto do banco e baixa cada consulta de 20 a 30 ms para 1 a 3 ms quando há várias por pedido; com uma só, não ajuda.

**Medir antes de migrar:** criar um projeto Neon grátis em São Paulo, ligar ao `wrangler dev` e rodar `npm run perf:api` contra uma consulta real, com e sem `placement`. A meta de 60 ms no servidor só se confirma assim.

Como o trabalho segue até a escolha:

- As regras do jogo ficam em `shared/game/`, sem banco. O Worker fala com o banco por uma camada fina (`worker/store/`), a única parte a trocar.
- O esquema atual (`migrations/*.sql`) é SQLite e precisa de ajustes pequenos para Postgres (tipos de data, `INTEGER`). Os testes do Worker hoje usam um D1 local; com Postgres precisam de um banco local (por exemplo PGlite) ou de um projeto de teste.
- Em produção, as rotas que precisam de banco só ligam quando ele existir; até lá, `GET /api/health` mostra `db: not_configured`.

## A conferir na fase B1

- Limite de iterações do PBKDF2 no runtime dos Workers (a documentação confirma o algoritmo, não o limite).
- Limites e preços do plano do D1, e como funciona a restauração de backup.
- Região do banco e leitura por réplicas, por causa da meta de latência (`API.md`, seção Velocidade).
- Se o D1 aplica chaves estrangeiras por padrão. Até confirmar, o Worker valida os vínculos (`project_id`, `habit_id`, `goal_id`) antes de gravar.

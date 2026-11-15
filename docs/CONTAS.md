# Contas e página de apresentação

## O que existe

- **Página de apresentação** em `/` (`index.html`, `src/landing/landing.css`, `src/landing/landing.js`). HTML estático, sem
  Vue, sem three e sem biblioteca de animação: CSS, `IntersectionObserver` e um pouco de estado. Construída à parte
  (`vite.landing.config.js`) para não mexer nos pacotes das páginas do app.
- **Painel pessoal** em `/app` (`app.html`; antes era o `index.html`). A cidade e o mapa seguem em `/city` e `/world`.
- **Contas** no Worker (`worker/auth.js`): `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/me` e `GET /api/auth/status` (`{ accounts, user }`, sem 401, para a página saber o que mostrar).
  Contrato em `docs/API.md`, seção "Conta".

## Como a conta se liga aos dados

Os dados de cada pessoa continuam no Durable Object `DemoSession` (`worker/demo.js`). A conta guarda em
`users.data_key` o **nome do objeto** dela:

- no cadastro, a conta adota o objeto da sessão de demonstração daquele navegador (cookie `cityou_demo`), se ninguém
  o adotou antes. O que a pessoa já fez (cidade, moedas, registros) vai junto, sem cópia. O objeto adia a
  expiração por até cinco minutos enquanto o vínculo é registrado no D1. O cadastro só confirma depois que
  o objeto grava o dono e cancela o alarme. O navegador recebe um novo cookie de demonstração;
- ao entrar em outro aparelho, a sessão (`cityou_session`) aponta para o mesmo objeto;
- o objeto de uma conta **não vence**. O Worker reescreve o cabeçalho interno `X-Cityou-Account` e o objeto
  verifica se a conta é a proprietária. Se o D1 reservar o vínculo mas a confirmação falhar, entre com a senha
  cadastrada para retomar a adoção. Uma reserva existente também protege o objeto no alarme;
- ao sair, a sessão é apagada e o cookie da demonstração é trocado, para o navegador não continuar nos dados da conta.

Senha: PBKDF2-SHA-256 com 100.000 iterações (o limite da Web Crypto nos Workers), sal por conta. O banco guarda só
o hash da senha e o SHA-256 do token da sessão. O login reserva uma das oito tentativas por e-mail de forma atômica,
em janelas de 15 minutos (429 quando o limite é atingido). Senhas válidas liberam a reserva. E-mail inexistente
e senha errada dão a mesma resposta. Cadastro e login aceitam até 4.000 bytes de JSON (413 acima do limite).

## Com e sem banco

As contas só existem com o D1 ligado (`env.DB`):

| | Sem banco (hoje em produção, até criar o D1) | Com banco |
|---|---|---|
| `/` | página de apresentação; os botões dizem "Abrir a demonstração" e levam a `/app` | página de apresentação com Entrar e Criar conta; quem já entrou é levado a `/app` (`/?inicio` mostra a página mesmo assim) |
| `/app`, `/city`, `/world` | abertos, com o cookie de demonstração | pedem login: sem sessão, redirecionam para `/?entrar=1&next=<caminho>` |
| `/api/auth/*` | 503 | funcionam |
| demais rotas `/api/*` | demonstração | dados da conta, se houver sessão; senão, demonstração, ou **401** com `REQUIRE_LOGIN="true"` (ligado em `wrangler.jsonc`) |

Se a validação de sessão falhar por indisponibilidade do D1, a página protegida responde 503. O esquema vem de
`migrations/`, aplicado antes de habilitar contas no ambiente de destino.

## Como ligar o banco em produção

1. Criar o banco: Cloudflare → Storage & Databases → D1 → Create, com o nome `cityou` (ou `npx wrangler d1 create cityou`).
2. Copiar o **Database ID** e pôr em `wrangler.jsonc`:
   `"d1_databases": [{ "binding": "DB", "database_name": "cityou", "database_id": "<id>", "migrations_dir": "migrations" }]`
3. Num banco novo, aplicar `npx wrangler d1 migrations apply cityou --remote` no ambiente de destino antes
   do deploy. Para homologar em um D1 local, use `--local` e a configuração de teste correspondente.
4. Confirmar `db: "ok"` em `/api/health` e verificar cadastro, entrada e saída com uma conta sintética na prévia.

Para um banco existente inicializado pelo Worker antigo, confira o esquema e o histórico de migrações antes
de aplicar os arquivos. Um banco com as tabelas e a coluna `data_key` existentes pode precisar de um baseline
validado. Preserve os dados e valide o procedimento numa cópia antes de executar no ambiente real.

O ID do banco não é segredo. Nota: `docs/DATA-MODEL.md` registra a decisão de levar o banco para São Paulo (provedor
externo + Hyperdrive). O D1 aqui guarda só contas e sessões; a troca de banco continua em aberto.

## Convites, limite por IP e sessão (etapa 6, 15/11/2026)

- **Beta por convite** (decisão do dono 7). Sem `SIGNUP_OPEN="true"`, o cadastro pede `invite`. O código tem 12 letras sem as confundíveis (`ABCD-EFGH-JKLM`, maiúsculas, espaços e hífens são ignorados) e só o SHA-256 fica no banco (`invites`, migração `0003`). Cada convite tem nome, número de usos (1 a 50, padrão 1) e validade (1 a 90 dias, padrão 14). O uso é gasto de forma atômica logo antes de gravar a conta e volta se a gravação falha (e-mail repetido não gasta). `users.invite_hash` diz por qual convite a conta entrou.
- **Por que um código por pessoa** (recomendação aceita para o beta): um código único vaza num grupo ou rede social e não dá para cancelar só o de quem repassou nem saber quem trouxe quem. Com um por pessoa, cancelar um não afeta os outros. Para um grupo, crie um convite com vários usos.
- **Criar e cancelar** (só com `CITYOU_ADMIN_TOKEN`, no console do navegador no site, como em `docs/API.md`):
  `fetch('/api/admin/invites', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cityou-Request': '1', 'X-Cityou-Admin': 'COLE_O_TOKEN' }, body: JSON.stringify({ label: 'Ana', max_uses: 1, days: 14 }) }).then(r => r.json()).then(console.log)`
  O código aparece só nessa resposta. Mande o link `https://<site>/?convite=<código>`, que abre o cadastro já preenchido. Para cancelar: `POST /api/admin/invites/revoke` com `{ code }`.
- **Limite por IP**: cadastro 5 por hora e login 30 a cada 15 minutos por rede (`ip_attempts`), além das 8 tentativas por e-mail. O IP é lido de `CF-Connecting-IP` (no IPv6 conta a rede /64) e só entra no banco como hash junto com a janela. **Ação do dono antes de abrir contas:** `npx wrangler secret put CITYOU_IP_SALT` com um texto aleatório longo; sem ele o hash é só pseudonimização (dá para refazer um IPv4 percorrendo os endereços). A janela é fixa: na virada passam até o dobro (10 cadastros) em poucos minutos.
- **Sessão**: vence com 30 dias sem uso e, de todo jeito, 180 dias depois de entrar. O uso renova o prazo no máximo uma vez por dia. O login apaga as sessões vencidas da conta e as janelas de tentativa com mais de um dia. A sessão conferida fica até 30 s no cache do ponto de presença (`CITYOU_SESSION_CACHE_SECONDS`, "0" desliga), para não ir ao D1 em todo pedido: sair apaga a entrada desse ponto, e em outro ponto a sessão encerrada pode valer até a entrada vencer. Exportar e apagar a conta conferem sempre no banco. Ver `docs/LATENCIA.md`.

## O que ficou de fora

- **Esqueci a senha** (`/api/auth/forgot`, `/api/auth/reset`): precisa de um serviço de e-mail com domínio próprio.
  Enquanto isso, trocar a senha de alguém exige mexer no banco.
- `PATCH /api/me`. (Exportar e apagar a conta entraram em 15/11/2026: `docs/API.md`, seção Conta.)
- Entrar com Google ou outro provedor.

## Imagens e marca

- `public-fifones/brand/cityou-wordmark.webp` e `cityou-icon.webp`: recortes da imagem da logo enviada pelo
  responsável do projeto (branco com transparência). Não são vetoriais; quando houver o SVG da marca, troque.
- `cidade-rio.webp` e `mapa-mundo.webp`: capturas do próprio app (cidade do Rio com os nove prédios, e o globo).
- Os números da página (10 moedas por tarefa, 5 por hábito, 25 por meta, 50 de boas-vindas, custo dos prédios)
  vêm de `shared/game/rules.js` e do catálogo. Mudou lá, mude em `index.html`.

## Testes

`npm run test:worker`: cadastro, validação, e-mail repetido, adoção dos dados, entrada em outro aparelho, saída,
bloqueio por tentativas, redirecionamento das páginas e o comportamento sem banco.

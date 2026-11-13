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

## O que ficou de fora

- **Esqueci a senha** (`/api/auth/forgot`, `/api/auth/reset`): precisa de um serviço de e-mail com domínio próprio.
  Enquanto isso, trocar a senha de alguém exige mexer no banco.
- `PATCH /api/me`, exportar e apagar a conta.
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

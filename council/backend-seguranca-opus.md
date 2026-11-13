# Council de 13/11/2026: Backend e segurança

Relatório de um subagente (Opus 5.5), só de leitura, feito sobre a `main` na PR #22. Vários itens já mudaram: veja o estado de cada um em [COUNCIL_SINTESE.md](COUNCIL_SINTESE.md). O texto abaixo é o original, sem edição.

---

## 1. Achados priorizados

**ALTA**

1. **O cookie de demonstração continua abrindo a conta.** Está em `demo.js` `demoApi` (`key = user?.data_key ?? demoKeyOf(...)`) e em `auth.js` `signup`. No cadastro, `data_key` passa a ser o hash do `cityou_demo`, e esse cookie só é trocado no logout. Ele vira uma segunda credencial, que não vence com a sessão e não cai quando se sai em outro aparelho. Só não é explorável hoje porque `REQUIRE_LOGIN="true"`. Se essa variável faltar num ambiente, quem tiver o cookie lê e grava os dados da conta. Isso inclui fixação de cookie em computador compartilhado. **Correção:** trocar o `cityou_demo` no signup e no login. No `DemoSession.fetch`, devolver 401 quando existir `account/owner` e o pedido chegar sem `X-Cityou-Account`. Esforço P.

2. **O teto de 100 registros vale para tudo, para sempre.** Em `demo.js` `add()`, `addEntry` grava hábitos, metas, notas, transações e refeições todos como `kind 'entry'`. Então são 100 itens no total, sem rota para apagar. Quem lança despesas chega ao limite em semanas e recebe "A demonstração aceita até 100…". As tarefas têm o mesmo teto. `list()` corta em 5000 sem avisar (os check-ins diários chegam lá em mais ou menos um ano). **Correção:** tetos por conta, paginação, exclusão. Esforço M.

3. **O limite de tentativas de login é furável e serve para trancar a conta dos outros.** Em `auth.js` `login`, o código lê `count`, calcula o PBKDF2 e só depois incrementa. Pedidos simultâneos passam todos do teto de 8. O limite é só por e-mail: senhas vazadas testadas contra muitos e-mails não são barradas, e qualquer um tranca o e-mail de outra pessoa a cada 15 minutos. O cadastro não tem limite nenhum, e cada conta cria um Durable Object. **Correção:** incremento atômico antes do hash (`UPDATE … RETURNING`), limite por IP (Rate Limiting/WAF) e Turnstile no cadastro e no login. Esforço M.

4. **Custo de CPU do PBKDF2.** São 100k iterações por login, e também para e-mails que não existem. No plano Free o limite é de 10 ms de CPU por pedido [VERIFICADO developers.cloudflare.com/workers/platform/limits · 2026-11-13]. Se 100k iterações cabem nisso: [NÃO CONFIRMADO]. Com spam de login, a CPU vira conta a pagar. **Correção:** confirmar o plano Paid, definir `limits.cpu_ms` e aplicar o item 3. Esforço P.

5. **O esquema criado em execução bate de frente com as migrations.** `auth.js` `ensureSchema` cria as tabelas sem preencher `d1_migrations`. Se alguém rodar `wrangler d1 migrations apply` depois, a 0001 (`CREATE TABLE users`, sem `IF NOT EXISTS`) falha e as migrations ficam travadas. Os testes aplicam as migrations antes, então o caminho em que só o Worker cria as tabelas, e o conflito entre os dois, nunca são testados. **Correção:** escolher um caminho só, de preferência migrations aplicadas no deploy, e tirar o `SCHEMA` do código. Esforço P.

6. **A conta não tem recuperação, verificação de e-mail, exportação nem exclusão.** `docs/CONTAS.md` diz que "trocar a senha exige mexer no banco". Na engenharia social, isso abre dois ataques: alguém escreve ao suporte fingindo ser o dono e pede a troca de senha, ou registra o e-mail de outra pessoa antes dela, e a verdadeira dona não consegue retomar. Os dados incluem saúde, alimentação e finanças. Pela LGPD, dado de saúde é sensível e a pessoa tem direito a acesso e a exclusão (art. 18) [NÃO CONFIRMADO, conhecimento geral]. **Correção:** reset por e-mail (a tabela `password_resets` já existe) e verificação de e-mail. Esforço M. Exportação e exclusão de conta: esforço M.

**MÉDIA**

7. **A sessão não se renova e não há limpeza.** `last_seen_at` nunca é atualizado, ao contrário do que diz `DATA-MODEL.md`. Todo mundo é deslogado no 30º dia. `sessions` e `login_attempts` crescem sem limpeza, e não existe "sair de todos os aparelhos". **Correção:** renovar a sessão quando passar da metade da validade, criar uma Cron de limpeza e oferecer revogação. Esforço P.

8. **Fotos.** `readBody` aceita no máximo 24.000 bytes, mas `RULES.proof.photoMaxBytes` é 250.000. Na prática, foto acima de uns 17 KB volta 413. E `overview()` faz `list('proof')` lendo todas as data URLs a cada GET e a cada escrita, só para depois descartar a foto. Isso dá até uns 35 MB de JSON por conta. O plano Free tem 5 GB de armazenamento de Durable Objects no total [VERIFICADO developers.cloudflare.com/durable-objects/platform/limits · 2026-11-13]. **Correção:** guardar a foto no R2 ou numa tabela separada, e alinhar os limites. Esforço M.

9. **Alarme da demonstração.** Ainda vale para a produção atual: em `DemoSession.fetch`, o alarme só é marcado se `getAlarm()===null` e nunca é estendido. A demonstração é apagada 30 dias depois da primeira escrita, mesmo com uso diário, o que contraria "não punir". Além disso, quem já tem demonstração e entra numa conta existente perde a demonstração sem aviso. **Correção:** estender o alarme a cada escrita e oferecer a importação. Esforço P.

10. **Faltam cabeçalhos de segurança.** O Worker só põe `nosniff` nas respostas da API. As páginas não têm CSP, `frame-ancestors`/X-Frame-Options (o diálogo de login pode ser embutido em outro site, clickjacking), HSTS nem Referrer-Policy. Os cookies não usam o prefixo `__Host-`. O CSRF está bem resolvido (`guardWrite`: cabeçalho próprio + Origin + SameSite=Lax), e `nextPath` em `landing.js` filtra redirecionamento para fora. **Correção:** `_headers` ou cabeçalhos no `fetch`. Esforço P.

11. **Moedas de teste em produção.** Em `demo.js` `requireAdmin`/`adminCredits`, o limite é uma vez por objeto. Com contas, quem tiver o token cria contas em série e ganha 50 mil moedas em cada uma, sem registro de quem pediu. **Correção:** só nas prévias, ou presa a IDs de usuário, com log. Esforço P.

12. **Prévias.** Cada prévia tem namespace de Durable Object próprio, as prévias não herdam a configuração de produção e as URLs são públicas por padrão [VERIFICADO developers.cloudflare.com/workers/previews · 2026-11-13]. Hoje o modo de teste fica isolado. O risco aparece se alguém puser em `previews.d1_databases` o banco de produção: contas criadas na prévia ficariam com `data_key` apontando para objetos que só existem na prévia. **Correção:** D1 separado para as prévias e Cloudflare Access. Esforço P.

13. **Custo e latência.** Cada pedido de dados faz 1 leitura no D1 (`sessionUser`) e 1 chamada ao Durable Object, e cada página do app faz mais uma leitura no D1. Não há região na América do Sul (`DATA-MODEL.md`). A latência real não foi medida. **Correção:** medir com `perf:api` e, se pesar, guardar a sessão em cache curto. Esforço M.

**BAIXA**

14. Corrida no signup: dois cadastros com o mesmo `demoKey` batem no UNIQUE de `data_key` e a resposta diz "e-mail já cadastrado", que é falso. O 409 do signup também revela se um e-mail existe (enumeração). Esforço P.
15. `dateFormatter` está fixo em `America/Sao_Paulo` e ignora `users.timezone`. `addEntry` e `addTask` não aceitam `request_id`: um reenvio duplica o registro. Esforço P.
16. Estrutura: `demo.js` mistura rotas, armazenamento, regras e prova, e a classe que guarda dados de conta se chama "DemoSession". `X-Fifones-City`, `start: python -m backend` e o pytest no CI são herança. Renomear a classe exige uma migration `renamed_classes`. `DATA-MODEL.md` não bate com o código: diz que "não há código", fala em 5 tentativas (o código usa 8), em tabelas por domínio e em ledger, mas o código grava JSON em `records`. Esforço M.
17. Observabilidade e CI: não há log de cadastro, login, bloqueio ou moedas de admin, nem alerta. O CI só roda build e testes. Não há workflow de deploy (deve ser deploy por Git, suposição), nem passo de migration, nem `npm audit`, e as actions não estão fixadas por SHA. Esforço M.

## 2. Antes de ligar o D1 em produção
1. Corrigir o item 1 (cookie de demonstração) e o item 3 (atomicidade, limite por IP, Turnstile).
2. Confirmar o plano Paid e o custo de CPU do PBKDF2.
3. Decidir o esquema: aplicar as migrations, remover o `ensureSchema` e testar num banco vazio.
4. Criar um D1 separado para prévias e testes, e fechar as prévias com Access.
5. Restringir ou desligar `CITYOU_ADMIN_TOKEN` em produção.
6. Fazer o reset de senha (ou pelo menos um procedimento escrito de suporte com verificação de identidade) e definir os limites de registros por conta.
7. Colocar os cabeçalhos de segurança, os logs de autenticação e um alerta de erro 500.
8. Ver o Time Travel do D1 e o backup dos Durable Objects [NÃO CONFIRMADO] e ensaiar uma restauração.
9. Escrever testes para: corrida de login, cookie de demonstração depois do cadastro, expiração da sessão e banco vazio sem migrations.

## 3. Top 3 para o MVP
1. Isolar os dados da conta do cookie de demonstração (item 1).
2. Proteção contra abuso no login e no cadastro (itens 3 e 4).
3. Tirar os tetos herdados da demonstração e tirar as fotos do SQLite (itens 2 e 8), junto com reset de senha e exclusão de conta (item 6).

## 4. Não consegui ler ou confirmar
- Não li `docs/API.md`, `wrangler.test-closed.jsonc` nem o front do app (`src/fifones/api.js`, compressão das fotos).
- Não sei se existe um `_headers` em `public/`: a busca de código não achou, mas o índice pode estar incompleto.
- Não sei como é feito o deploy (Workers Builds?) nem se há proteção de branch.
- Não confirmei o custo real de CPU do PBKDF2, o limite de iterações da Web Crypto, o tamanho máximo de linha no SQLite dos Durable Objects, nem o backup de D1 e Durable Objects.
- Não confirmei se o D1 aplica chaves estrangeiras em produção. O teste local mostra que sim.

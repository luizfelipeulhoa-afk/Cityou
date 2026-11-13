# Council de 13/11/2026: Backend e segurança (mesmo pedido, para o estudo)

Relatório de um subagente (Haiku 5.5), só de leitura, feito sobre a `main` na PR #23. Vários itens já mudaram: veja o estado de cada um em [COUNCIL_SINTESE.md](COUNCIL_SINTESE.md). O texto abaixo é o original, sem edição.

---

## Backend e segurança: Cityou (main, commit ee602d4)

**1. Lista priorizada**

1. **ALTA** · `worker/demo.js` `alarm()` + `worker/auth.js` `signup()` · O cadastro não marca o dono do Durable Object. O alarme de 30 dias apaga `records` quando não há dono. Cenário: a pessoa usa a demonstração, cria conta no dia 29 e volta no dia 31. Se nenhuma rota de dados foi chamada com `X-Cityou-Account` antes do alarme, os dados da conta somem. · Gravar o dono no próprio cadastro (chamada ao DO) e cancelar o alarme. · P

2. **ALTA** · `worker/demo.js` `add()` · O limite de 100 é global para o tipo `entry`, que junta hábitos, metas, notas, lançamentos e refeições. Não há rota de apagar, então a conta real trava depois de cerca de 100 registros. A documentação diz "100 por tipo". · Decidir o limite por conta e por tipo, ou remover; adicionar exclusão. · P (decisão de produto)

3. **ALTA** · `worker/demo.js` `readBody()` × `shared/game/proof.js` · `readBody` recusa corpos acima de 24.000 bytes (413), mas a foto aceita até 250 KB e o JPEG em base64 ocupa mais. Pelo código, nenhuma foto acima de uns 18 KB é aceita. Os testes só usam fotos de 13 bytes. · Subir o limite do corpo de checkin para cerca de 400 KB, ou redimensionar no navegador e documentar. · P

4. **ALTA** · `worker/auth.js` `login()` · O limite de tentativas é só por e-mail e é checado antes do hash, mas o contador sobe depois. Pedidos paralelos passam juntos pelo teste, então o limite de 8 não se sustenta. Um atacante também trava a conta de outra pessoa com 8 erros. Não há limite por IP: o `ratelimits` citado em `docs/API.md` não está em `wrangler.jsonc`. · Incrementar de forma atômica antes de verificar (`INSERT … ON CONFLICT … RETURNING count`); acrescentar limite por IP com binding de ratelimit. · M

5. **ALTA** · `worker/auth.js` `signup()` · O cadastro responde 409 com "Já existe uma conta com este e-mail", enquanto o login é neutro. Isso permite enumerar contas. Além disso, cadastro não tem limite de taxa, e cada cadastro gasta PBKDF2 de 100.000 iterações. · Resposta neutra com confirmação por e-mail; limite de taxa no cadastro. · M

6. **ALTA** · Conta sem verificação de e-mail e sem recuperação de senha · Qualquer pessoa cadastra o e-mail de outra; quem perde a senha perde a conta (`docs/CONTAS.md` deixa isso para depois). · Verificação de e-mail e recuperação antes de conta real, ou aceitar o risco por escrito. · G

7. **ALTA** (quando o D1 for ligado) · `worker/auth.js` `SCHEMA` × `migrations/0001_init.sql` e `0002` · O Worker cria as tabelas com `data_key` já incluído. A migração 0002 faz `ADD COLUMN data_key`, e 0001 faz `CREATE INDEX sessions_user` sem `IF NOT EXISTS`. Se alguém rodar `wrangler d1 migrations apply --remote` depois, falha ou diverge. · Uma única fonte de esquema; o Worker só verifica a versão. · P

8. **ALTA se confirmado** [NÃO CONFIRMADO] · `wrangler.jsonc` `previews` · A prévia define `CITYOU_TEST_OPEN_REGIONS=1` (5.000 moedas, regiões abertas). O bloco `previews` só redefine `vars` e `durable_objects`, sem `d1_databases`. Se a prévia herdar o D1 de produção, contas de teste vão para a base real. · Confirmar no Wrangler; usar banco separado e fail-closed. · P

9. **MÉDIA** · `worker/index.js` `loginRequired` · `REQUIRE_LOGIN` só vale se `env.DB` existir. Um deploy sem binding cai silenciosamente em demonstração pública. · Tornar o flag fail-closed. · P

10. **MÉDIA** · `worker/demo.js` `overview()` · Cada `GET /api/personal` carrega todas as comprovações com foto (`list('proof')`, até 5.000 linhas) e faz `JSON.parse` do base64. O custo cresce a cada foto. `checkins` também tem limite de 5.000 e corta em silêncio. · Separar fotos em leitura própria; paginar. · M

11. **MÉDIA** · `worker/auth.js` `sessionUser` / tabelas · Sessões expiradas e `login_attempts` nunca são apagadas. A renovação "com o uso" prometida em `DATA-MODEL.md` não existe; a sessão vence fixa em 30 dias. Não há "sair de todos os aparelhos". · Limpeza periódica; renovação deslizante; revogação ao trocar senha. · P/M

12. **MÉDIA** · `worker/auth.js` `signup()` · O cookie `cityou_demo` não é trocado no cadastro. Ele aponta para os dados da conta e continua válido por 30 dias. Hoje, com `REQUIRE_LOGIN=true`, não serve para ler dados; se o flag for desligado, vira segunda credencial. · Rotacionar o cookie de demonstração no cadastro e no login. · P

13. **MÉDIA** · `worker/auth.js` `readJson()` · Lê o corpo inteiro antes de cortar em 4.000 caracteres, sem limite de tamanho. · Limite de bytes na leitura. · P

14. **MÉDIA** · Custo de CPU do PBKDF2 (`worker/auth.js`) · Cada login e cadastro roda 100.000 iterações. Não consegui confirmar o limite de iterações da Web Crypto nem o limite de CPU do plano [NÃO CONFIRMADO: a documentação da Cloudflare não respondeu nesta sessão]. A recomendação atual da OWASP para PBKDF2-SHA256 é bem maior que 100.000 (de memória, [NÃO CONFIRMADO]). · Medir CPU por login em produção antes de escolher o número. · P

15. **MÉDIA** · Cabeçalhos · Só a API recebe `nosniff`. As páginas HTML não têm CSP nem `frame-ancestors`, o que deixa a tela de login exposta a clickjacking. · Definir CSP e `frame-ancestors: 'none'` nas páginas. · P

16. **MÉDIA** · `worker/index.js` `pageGate` · Em caso de erro do banco, as páginas do app abrem sem login. · Aceitável para a demonstração; rever com REQUIRE_LOGIN. · P

17. **BAIXA** · `shared/game/proof.js` · A validação só confere o cabeçalho JPEG/WebP. "A mesma foto não vale duas vezes" se burla alterando um byte. O impacto é limitado: 3 bônus de 5 moedas por dia. · Aceitar e documentar como limitação. · —

18. **BAIXA** · `worker/demo.js` `addEntry()` · Aceita qualquer `day`, inclusive datas distantes. `canMarkDay` em `shared/game/rules.js` existe mas o servidor não o usa. · Aplicar a janela de 7 dias no servidor. · P

19. **BAIXA** · Duplicação de backend · `backend/` (Python) continua no repositório e no CI (`pytest`), enquanto a documentação diz que ele será substituído. · Remover quando o Worker estiver em produção. · P

20. **BAIXA** · Estrutura · `worker/demo.js` (cerca de 380 linhas) mistura rotas, cidade, comprovação, recompensa, viagem e administração, e importa de `src/` (código do navegador). Nomes herdados: `X-Fifones-City`, `cityou_demo`, `src/fifones/api.js`. Renomear o cabeçalho exige mudança coordenada no navegador. · Separar em módulos; renomear com cuidado. · M

21. **BAIXA** · Documentação divergente · `API.md` cita `crypto.subtle.timingSafeEqual` (o código usa `sameText`). `API.md` e `DATA-MODEL.md` prometem tabelas `player`, `cities` e `ledger` no cadastro, que não existem. `DATA-MODEL.md` fala em 5 erros de login; o código usa 8. · Alinhar os documentos. · P

22. **BAIXA** · `worker/routes/health.js` · Expõe sem autenticação o estado do esquema e a região do banco. · Reduzir a resposta pública. · P

23. **BAIXA** · Rota de administração · `docs/API.md` manda colar o token no console, mas em produção com `REQUIRE_LOGIN` a chamada exige login. O token tem mínimo de 16 caracteres e não tem limite de taxa. · Corrigir a instrução; token longo. · P

24. **MÉDIA (MVP)** · Exportação e exclusão · Não existem. Os dados da demonstração ficam só em Durable Objects, sem cópia de segurança. Há risco regulatório (LGPD) por não haver como o titular exportar ou apagar. Recuperação de backup do D1 [NÃO CONFIRMADO]. · Implementar exportação e exclusão antes de contas reais. · M

25. **BAIXA** · CI (`.github/workflows/ci.yml`) · Roda build, testes do Worker e pytest. Não tem auditoria de dependências, varredura de segredos nem deploy no repositório. As ações estão fixadas por tag, não por SHA. O processo de deploy está fora do repositório [NÃO CONFIRMADO]. · Adicionar `npm audit` e secret scanning; fixar por SHA. · P

**O que está bem:** CSRF (cabeçalho customizado, `Origin` igual e `SameSite=Lax`); isolamento de dados (`X-Cityou-Account` é sempre reescrito pelo Worker); cookies com `HttpOnly`, `Secure` em HTTPS, token de 256 bits e só o hash no banco; senha com sal por usuário; resposta de login neutra; recompensas com chave única por dia.

---

**2. Antes de ligar o D1 em produção (em ordem)**

1. Gravar o dono do Durable Object no cadastro e cancelar o alarme (item 1).
2. Tornar o contador de login atômico e incluir limite por IP (item 4).
3. Resposta neutra no cadastro e limite de taxa (item 5).
4. Uma só fonte de esquema (item 7).
5. Confirmar que a prévia não usa o D1 de produção (item 8).
6. Flags de produção fail-closed (item 9).
7. Rotacionar o cookie de demonstração no cadastro (item 12).
8. Limpeza de sessões e tentativas (item 11).
9. Medir CPU do login e do cadastro no plano em uso (item 14).
10. Corrigir o limite de 100 registros e o tamanho da foto (itens 2 e 3).
11. Decidir sobre verificação de e-mail e recuperação (item 6) e exportação/exclusão (item 24).

**3. Top 3 para o MVP**

1. **Não perder dados de quem cria conta:** corrigir a adoção e o alarme (item 1), com teste que cubra o caso "cadastro, alarme, primeiro acesso".
2. **Cadastro e login resistentes:** contador atômico, limite por IP, resposta neutra no cadastro e verificação de e-mail (itens 4, 5, 6).
3. **Limites que quebram conta real:** 100 registros no total e foto acima de 24 KB (itens 2 e 3), junto com esquema único (item 7).

---

**4. Não consegui ler ou confirmar**

- **Não li:** `src/landing/landing.js` (se o parâmetro `next` redireciona para fora; [NÃO CONFIRMADO]), `src/world/progress.js`, `src/world/worldSpaces.js`, `shared/game/city-layout.js`, `shared/game/summary.js`, `shared/game/buildings.js`, `backend/`, e o `wrangler.test.jsonc` completo além do que apareceu.
- **Não confirmei** nos documentos oficiais: limite de iterações do PBKDF2 nos Workers, limite de CPU do plano, comportamento de `previews` no Wrangler, restauração de backup do D1. O domínio `developers.cloudflare.com` não resolveu nesta sessão; é preciso liberá-lo nas configurações de rede para conferir.
- **Não executei** testes nem build (somente leitura). Os achados vêm da leitura do código; os itens 1 e 3 são deduções diretas do código e merecem um teste de reprodução.

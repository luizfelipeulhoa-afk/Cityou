# Council de 13/11/2026: Produto, economia do jogo e LGPD

Relatório de um subagente (Opus 5.5), só de leitura, feito sobre a `main` na PR #22. Vários itens já mudaram: veja o estado de cada um em [COUNCIL_SINTESE.md](COUNCIL_SINTESE.md). O texto abaixo é o original, sem edição.

---

Aviso: não sou advogado. Tudo o que for jurídico abaixo é triagem e precisa de revisão profissional. Li a `main` pelo GitHub. Onde escrevo "suponho", é inferência minha, não algo que li no código.

## 1. Economia (lida no código)

| Fonte | Valor | Teto |
|---|---|---|
| Boas-vindas (`newCity`) | 50 | uma vez |
| Tarefa (`finishTask`→`reward`) | 10 | 10 por dia |
| Hábito (`checkin`→`reward`) | 5 | 8 por dia |
| Meta concluída (`rewardGoal`) | 25 | **nenhum teto diário** |
| Comprovação (`saveProof`→`grantBonus`) | 5 | 3 por dia |
| `adminCredits` | 50.000 | uma vez por sessão, só com o segredo |
| Bônus de presença e de retorno | existem em `rules.js` | **não ligados** em `demo.js` |

| Gasto | Valor |
|---|---|
| Rio, catálogo regional (14 itens) | 525 |
| Catálogo base (Casa, IA, etc.) | 480 |
| Prédios de área (6 × 20) | 120 |
| Total, um de cada | **1.125** (mais ruas a 2 e árvores a 3) |
| Melhoria até o nível 3 | +1× e +2× o custo, ou seja, 4.500 no total |
| Remover (`city.js`) | devolve metade do custo base e nada das melhorias, então não há laço |

Contas:
- **Usuário típico** (3 hábitos e 2 tarefas): 35 por dia, ou 40 com uma comprovação. O primeiro prédio sai no dia 0 (tem 50, o mais barato custa 20). O mais caro (StuntSync, 80) sai no dia 1. O catálogo do Rio inteiro sai em cerca de 31 dias; tudo no nível máximo, em cerca de 127.
- **Usuário no teto:** 155 por dia. Catálogo em cerca de 7 dias; tudo no nível máximo em cerca de 29.
- **Primeiros 7 dias:** cerca de 295 moedas, o que dá 8 a 10 prédios. Isso prende. Mas o prédio da atividade só chega a "Fundação" com 8 dias **e** 2 semanas (`STAGES`), então na primeira semana nada evolui por prática. E depois de cerca de 1 mês as moedas ficam sem uso, porque as viagens estão fechadas.
- **Laços de ganho:** construir e remover dá perda. Tarefas em série param em 10 por dia. **Metas com alvo 1 pagam 25 na hora, sem teto**: dá para tirar cerca de 2.250 moedas em minutos (o limite é só o de 100 registros).

## 2. Achados priorizados

1. **ALTA** · `rewardGoal` / `addEntry` (target ≥ 1) · Criar metas com alvo 1 e concluí-las rende 25 cada, sem teto, e compra o catálogo no dia 0. · Pagar só com alvo ≥ 3 e limitar a 2 metas pagas por dia. · P
2. **ALTA** · `DemoSession.add` · O teto de 100 registros por tipo vale também para contas. São 100 entradas somando hábitos, metas, notas, lançamentos e refeições, e 100 tarefas, e não existe rota para apagar. Quem registra 3 refeições por dia trava em cerca de 1 mês, com a mensagem "A demonstração aceita…". · Tirar o teto para contas (ou deixar só um teto antiabuso por dia) e criar exclusão. · M
3. **ALTA** · LGPD · Não existe exclusão de nada (registro, foto, conta) nem exportação; o próprio `CONTAS.md` diz isso. A coluna `users.deleted_at` existe, mas nenhuma rota a usa, e o objeto de dados da conta "não vence". · Criar `DELETE /api/me` (apaga o objeto e marca a conta), exportação em JSON e exclusão por item. · M
4. **ALTA** · `index.html` / cadastro · Não há aviso de privacidade, termos de uso, idade mínima nem link no rodapé. O texto "Sua conta, seus dados" promete um controle que o app ainda não dá. · Pôr links e uma caixa de aceite no diálogo de cadastro. · P (o texto em si é trabalho de advogado)
5. **ALTA** · Dados sensíveis · Refeições, hábitos de saúde e fotos de comprovação podem ser "dado referente à saúde", que a LGPD trata como sensível (art. 5º, II e art. 11) [NÃO CONFIRMADO]. Finanças não são sensíveis pela lei, mas pedem sigilo. · Pedir consentimento específico ou não coletar no MVP. Decisão com advogado.
6. **MÉDIA** · Local dos dados · O próprio `DATA-MODEL.md` diz que os Durable Objects para a América do Sul ficam no leste da América do Norte. Isso é transferência internacional (art. 33) [NÃO CONFIRMADO]. · Informar no aviso de privacidade agora e migrar para São Paulo depois. Precisa de advogado.
7. **MÉDIA** · `signup` · Não há verificação de e-mail nem "esqueci a senha". Dá para cadastrar o e-mail de outra pessoa, e para corrigir dados é preciso mexer no banco. · Mandar e-mail de confirmação e de redefinição de senha (a skill `cloudflare-email-service` cobre isso). · M
8. **MÉDIA** · `city-catalog.json` · Há prédios "ChatGPT", "Claude", "Gemini", "Grok", "StuntSync" e "Sede Fifones": são marcas de terceiros num produto aberto ao público. O `GAME-DESIGN.md` já diz que eles saem. · Tirar do catálogo antes de abrir as contas. · P
9. **MÉDIA** · `proof.js` · O servidor não remove os metadados EXIF (podem ter GPS). Suponho que a tela recodifique a foto, mas não confirmei. · Recodificar ou limpar os metadados no servidor. · P
10. **MÉDIA** · Fraude · Os tetos bastam enquanto as moedas não valem nada fora do app. Com ranking, prêmio ou parceria: contas múltiplas (cada uma ganha 50), metas e comprovações inventadas. · Nunca ligar valor real às moedas autodeclaradas. Se houver prêmio, que seja por sorteio entre quem participa ou por atividade verificada pelo parceiro, e com regulamento (sorteio e promoção pedem advogado). · —
11. **MÉDIA** · Ética · O bônus de presença planejado (7 de 7 dias dá XP em dobro) premia a semana perfeita, um risco para quem tem TDAH ou depressão. O painel mostra "x de 8", o que convida a "fechar o teto". · Bônus máximo a partir de 4 dias; teto escrito como "hoje está completo". A comprovação com foto em hábitos de alimentação ou corpo pode virar automonitoramento: não sugerir foto nessas áreas. · P
12. **BAIXA** · Retenção · As moedas ficam sem uso por volta do dia 30, e a primeira etapa do prédio aparece só no dia 8 ou depois. · Ver as ideias. · M
13. **BAIXA** · `index.html` · "Nove prédios do Rio para começar": o Rio tem 14. Há ainda referências antigas: `PRD.md` é o documento do CubeCity em chinês e o `GAME-DESIGN.md` diz que a ilha é só cenário, mas a ilha já tem Farol, Cabana e Píer. · P

**Dá para fazer sem advogado:** itens 1 a 3, 7 a 9, 11 a 13, a parte técnica da exclusão e da exportação, e as caixas de aceite.

**Precisa de advogado:** texto do aviso de privacidade e dos termos, base legal (contrato, art. 7º, V, para o núcleo do app; consentimento para dados de saúde?), transferência internacional, idade mínima (menores: art. 14; o "ECA Digital" [NÃO CONFIRMADO]), prazos de guarda depois da exclusão, encarregado de dados (DPO) e se microempresa fica dispensada [NÃO CONFIRMADO], plano de comunicação de incidente à ANPD [NÃO CONFIRMADO], e regulamento se houver prêmio.

## 3. Decisões que são do dono

- **Recompensa de meta:** A) só com alvo ≥ 3; B) teto de 2 por dia; C) 3 × alvo, até 25. **Recomendo A+B.**
- **Dados de saúde no MVP:** A) esconder refeições até o parecer; B) consentimento específico no primeiro uso; C) manter como texto livre. **Recomendo B**, se o advogado aprovar; senão, A.
- **Idade:** A) só maiores de 18 no MVP; B) 13+ com responsável; C) livre. **Recomendo A.**
- **Local dos dados:** A) beta fechado no Durable Object com aviso de transferência; B) migrar para São Paulo antes de abrir; C) abrir a todos já. **Recomendo A e depois B.**
- **Onde gastar moedas depois do dia 30:** A) abrir a primeira viagem; B) mais catálogo; C) melhorias de interior. **Recomendo A**, que já está implementada atrás de `TRAVEL_OPEN`.

## 4. Top 3 para o MVP

1. Fechar a fraude das metas (item 1) e tirar o teto de 100 registros para contas (item 2).
2. Exclusão (por item e da conta) e exportação em JSON, mais aviso de privacidade e termos no cadastro, revisados por advogado.
3. Consentimento para dados de saúde, idade mínima e verificação de e-mail.

**Métricas** (contadores agregados por dia e por semana de cadastro, sem conteúdo, como o `usage_counts` previsto no `DATA-MODEL.md`):
- ativação: % de contas com a primeira conclusão em 24 h;
- % com o primeiro prédio no D0;
- retorno com ação real no D1 e no D7;
- % de prédios ligados a atividade que chegam a "Fundação" em 30 dias;
- mediana de dias ativos por semana, sem medir sequência;
- % de dias no teto e de metas com alvo 1, como sinal de fraude ou compulsão.

**Ideias de alto efeito e baixo custo:**
- **Primeiro lote guiado:** no cadastro, criar o primeiro hábito e erguer o prédio dele com `findSite` (o posicionamento automático já existe).
- **Etapa "Canteiro" aos 3 dias** em `STAGES`, com uma cerimônia de inauguração e placa com o nome da atividade quando o `stageFor` muda.
- **"Jornal do bairro" semanal** montado a partir do `history` (que já guarda a origem de cada ganho), só com ganhos e nenhuma falta. Ou um álbum privado das comprovações dentro do prédio.

## 5. Não consegui ler ou confirmar

- A busca de código do `gh` voltou vazia para todos os termos. Então não confirmei a ausência de "privacidade" e "termos" na tela do app (`app.html` e `src/`); conferi só `index.html` e o rodapé.
- Não li `PREDIOS-RIO.md`, `landing.js`, `worker/index.js` nem o código da tela (recodificação da foto, se os prédios de área aparecem no catálogo manual).
- Não sei o que o `observability` do `wrangler.jsonc` grava nos logs.
- Nenhum artigo de lei ou regra da ANPD foi conferido agora: todos estão [NÃO CONFIRMADO].

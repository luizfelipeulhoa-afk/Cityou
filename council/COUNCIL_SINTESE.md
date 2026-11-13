# Council de 13/11/2026: síntese

Revisão pedida pelo responsável antes de ligar contas reais. Três especialistas independentes leram a `main` na PR #22 (backend e segurança; frontend e integração; produto, economia do jogo e LGPD), em Opus 5.5. Dois deles foram repetidos em Haiku 5.5, sobre a PR #23, para medir o custo do arranjo. O orquestrador conferiu no código 33 dos 58 achados antes de aceitar; nenhum dos conferidos caiu.

Relatórios originais, sem edição: [backend (Opus)](backend-seguranca-opus.md), [frontend (Opus)](frontend-integracao-opus.md), [produto e LGPD (Opus)](produto-economia-lgpd-opus.md), [backend (Haiku)](backend-seguranca-haiku.md), [frontend (Haiku)](frontend-integracao-haiku.md).

**Os relatórios são de antes das PRs #24 a #32.** O estado de cada achado hoje está na tabela abaixo. O plano que vale é `docs/PLANO-PROXIMOS-PASSOS.md`.

## Estado dos achados depois da PR #32

| Achado | Estado em 13/11/2026 |
|---|---|
| Cookie da demonstração abria os dados da conta | Resolvido na #32: o objeto confere o dono (`ownerFor`), o cadastro troca o cookie e marca o dono |
| Limite de login falhava com pedidos simultâneos | Resolvido na #32 (reserva atômica). Continua só por e-mail, sem limite por IP |
| Cadastro sem limite e sem convite | Aberto |
| Tabelas criadas pelo Worker × migrações | Resolvido na #32 (só migrações) |
| Corpo sem limite no cadastro e no login | Resolvido na #32 (`readJsonObject`) |
| Banco fora do ar | As páginas respondem 503 (#32). A API ainda devolve o erro genérico |
| Dono do objeto só marcado no primeiro pedido depois do cadastro | Resolvido na #32 (adoção confirmada no cadastro) |
| Custo de CPU do hash de senha | Aberto: nunca medido numa prévia |
| Meta com alvo 1 paga 25 moedas, sem teto | Aberto: decisão do responsável |
| Exportar e apagar conta; privacidade, termos e idade | Aberto. O texto legal precisa de advogado |
| "Esqueci a senha" e confirmação de e-mail | Fora do plano até haver e-mail com domínio |
| Sessão vencida, cliente de API duplicado, textos do Fifones | Previstos nas etapas 2 e 4 |
| Teto de 100 registros valendo para contas | Previsto na etapa 5 |
| Cabeçalhos de segurança e CSP | Previstos na etapa 6 |
| Marcas de terceiros no catálogo | A Sede Fifones saiu do Rio (#30). IA e StuntSync saem na etapa 3 |
| Sessão sem renovação nem limpeza | Aberto |
| Foto de comprovação acima de uns 17 KB dá 413 | Aberto |
| `resumo` sem tela; etapa do prédio e comprovações fora do painel | Aberto: sugerido para a etapa 4 |
| Registro de cadastro, login, bloqueio e moedas de teste | Aberto: sugerido para a etapa 6 |
| Alarme da demonstração não é renovado a cada uso | Aberto. Pesa menos com login obrigatório |
| Fuso fixo, criação sem `request_id`, data sem janela | Aberto: sugerido para a etapa 5 |
| `worker/demo.js` concentra tudo | Aberto: dividir antes da etapa 5, só movendo código |

As propostas, com etapa sugerida e critério de pronto, estão em "Itens sem dono no plano" do `docs/CHECKPOINT.md`.

## Onde os especialistas discordaram ou erraram

- **Onde os dados ficam.** O orquestrador supunha Durable Objects perto do usuário. A documentação do Cloudflare diz que objetos pedidos para a América do Sul são criados no leste da América do Norte, e que o D1 não roda na América do Sul. Vale a documentação.
- **`frame-ancestors`.** O relatório em Haiku sugeriu `'none'`. Isso quebraria o próprio painel, que embute a cidade e o mapa. O valor certo é `'self'`.
- **Prioridade.** O Haiku pôs o risco mais sério (o cookie da demonstração) em 12º lugar e marcou oito itens como graves. A ordem adotada foi a do relatório em Opus.

## O que precisa de decisão do responsável

Recompensa de meta (alvo mínimo e teto diário), dados de saúde (refeições), idade mínima, onde os dados ficam, público do primeiro lançamento (beta com convite) e o que fazer com as moedas depois de um mês de uso. Detalhe em `docs/research/2026-11-13-revisao-mvp.md`, seções 3 e 9.

## Custo medido do council

Uma rodada por caso: é indicação, não prova. Três especialistas em Opus em paralelo levaram 351 s (em fila seriam 686 s) e gastaram 460 mil tokens. A mesma revisão em Haiku achou 76% dos 58 achados válidos, contra 79% em Opus, em 38% menos tempo e por 86% a 97% menos pela tabela de preços, com os três erros acima. O limite de uso de 5 horas estourou nessa sessão. Tabela completa em `docs/research/2026-11-13-revisao-mvp.md`, seção 7.

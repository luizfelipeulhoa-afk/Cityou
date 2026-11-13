---
name: "gamificacao-saude-etica"
description: "Projetar ou revisar recompensas, créditos, níveis, cidade/progresso, parcerias e notificações em apps de saúde ou organização para público vulnerável (TDAH, depressão): ledger, anti-fraude, sem punição, parceiro só com consentimento."
---

# Gamificação de saúde, ética e segura

**Por quê:** um app que dá crédito por tarefa real e monetiza por parceiros de saúde, se mal desenhado, gera culpa (derruba quem tem depressão/TDAH), fraude, vazamento de dado de saúde e problema legal.

## Regras (cada uma deve ter teste automatizado; mudar regra = mudar teste e registrar a decisão)
1. **Ledger append-only, idempotente:** saldo = soma de linhas; `UNIQUE(usuario, motivo, ref)`; gasto e verificação de saldo na MESMA transação.
2. **Sem punição:** nenhum delta negativo por falha/atraso/ausência; sem streak que zera; sem "você perdeu". Só gasto voluntário.
3. **Valor da recompensa é do sistema,** nunca do usuário; fixo por esforço; pequeno; com teto diário, tempo mínimo e teto de criação.
4. **Progresso real manda:** upgrade exige crédito **e** tarefas do domínio. Crédito sozinho não compra "saúde".
5. **Sem moeda real** no MVP. Converter, transferir entre usuários ou sacar = parar e consultar advogado.
6. **Sem aleatoriedade paga** (loot box, roleta), sem ranking público, sem comparar pessoas, sem escassez falsa.
7. **Parceiro:** só recebe nome+e-mail após confirmação explícita do usuário; nunca tarefas, condição de saúde ou histórico; revogável; ordem neutra; patrocinado rotulado.
8. **Texto livre do usuário (título de tarefa, chat) passa na triagem de crise.** Título pode ser dado de saúde: não logar, não enviar a parceiro, entra no export/exclusão (LGPD).

## Procedimento ao propor uma regra nova
1. Comportamento-alvo observável. 2. Pergunta de dano: quem se sente pior se falhar? 3. Fraude: como alguém "farma" isso em 15 minutos? 4. Passa no filtro ético de behavior-design-etico? 5. Teste que prova a regra. 6. Métrica norte **e** guarda; A/B com grupo sem a alavanca.

## Evidência (honestidade)
Recompensa tangível esperada pode reduzir motivação intrínseca (Deci, Koestner & Ryan, 1999); gamificação em TDAH tem evidência limitada e mista, mais promissora com andaime cognitivo. Tratar como hipótese a testar, nunca como promessa de saúde.
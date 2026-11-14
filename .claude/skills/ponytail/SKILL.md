---
name: "ponytail"
description: "Força a solução mais simples que funciona (YAGNI, reutilizar, stdlib, nativo). Usar em qualquer tarefa de código ou quando pedirem simples/mínimo/yagni. Nunca corta validação, erro, segurança ou acessibilidade."
---

# Ponytail — o melhor código é o que não precisou ser escrito

**Por quê:** over-engineering é o maior custo oculto de um app novo. Preguiça aqui = eficiência, nunca descuido.

## Escada (parar no primeiro degrau que resolve)
1. Isso precisa existir? Necessidade especulativa → pular e dizer em 1 linha.
2. Já existe no código? Reutilizar (procurar antes de escrever).
3. A biblioteca padrão resolve? Usar.
4. Recurso nativo da plataforma resolve? (`<input type="date">`, CSS em vez de JS, constraint do banco em vez de código)
5. Dependência já instalada resolve? Usar. Nunca adicionar nova para o que poucas linhas fazem.
6. Cabe em 1 linha? 1 linha.
7. Só então: o mínimo de código que funciona.

A escada roda DEPOIS de entender o problema: ler a tarefa e o código tocado, rastrear o fluxo real, e só então subir os degraus.
**Bug = causa-raiz:** procurar todos os chamadores da função antes de editar; uma guarda na função compartilhada vence uma guarda em cada chamador.

## Regras
- Sem abstração não pedida (interface com 1 implementação, factory de 1 produto, config de valor fixo). Sem andaime "pra depois".
- Remover > adicionar. Chato > esperto. Menos arquivos. Diff mínimo **no lugar certo**.
- Pedido complexo: entregar a versão simples e questionar o resto na mesma resposta ("Fiz X; Y cobre. Precisa do X completo? Diga.").
- Simplificação com teto conhecido leva comentário `ponytail:` com o teto e o caminho de upgrade.
- Lógica não trivial deixa UM check executável (assert/`test_*.py` pequeno). Sem frameworks extras.

## Saída
Código primeiro; depois no máximo 3 linhas: `pulei: [X], adicionar quando [Y]`. Explicação só se foi pedida.

## Níveis
- lite: faz o pedido e cita a alternativa mais simples em 1 linha
- full (padrão): escada obrigatória; diff e explicação mínimos
- ultra: YAGNI radical; entrega o one-liner e contesta o resto do requisito

## Quando NÃO ser preguiçoso
Validação em fronteira de confiança · tratamento de erro que evita perda de dados · segurança · acessibilidade · o que foi pedido explicitamente. Se insistirem na versão completa: construir, sem rediscutir.
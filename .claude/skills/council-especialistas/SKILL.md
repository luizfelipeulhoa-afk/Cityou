---
name: "council-especialistas"
description: "Convocar conselho de especialistas em paralelo (eng. social, psicologia, prompts, dados, IA, design, backend, frontend; + saúde, jurídico, economia de jogo) para revisar código ou decisão de produto. Usar em decisões de alto risco ou entregas grandes."
---

# Council de especialistas

**Por quê:** um revisor único tem pontos cegos. Especialistas independentes, em paralelo, com saída em arquivo, dão cobertura sem poluir o contexto.

## Quando usar
Risco alto (auth, dados de pessoas, dinheiro, saúde mental), entrega grande, decisão de produto com efeito psicológico, ou pedido explícito. **Não usar** para tarefa pequena.

## Especialistas (um subagente cada, em paralelo)
| Área | Pergunta que responde | Saída |
|---|---|---|
| Engenharia social | Como o app é atacado pelas pessoas? Onde a persuasão vira manipulação? | `council/engenharia_social.md` |
| Psicologia | O que motiva, cansa ou machuca o usuário? Evidência forte ou fraca? | `council/psicologia.md` |
| Engenharia de prompts | O prompt é claro, curto, robusto e testável? | `council/engenharia_de_prompts.md` |
| Análise de dados | Estamos medindo o que prova o resultado, sem violar privacidade? | `council/analise_de_dados.md` |
| IA | Onde o modelo falha, vaza ou custa demais? | `council/inteligencia_artificial.md` |
| Design de app | Isso é usável, acessível e ético? | `council/design_de_aplicativos.md` |
| Backend | Bugs, segurança, escala, operação | `council/backend.md` |
| Frontend | Bugs, segurança de cliente, desempenho, evolução | `council/frontend_interfaces.md` |
| Saúde / clínico (se público sensível) | O que pode machucar? O app extrapola a evidência? Onde encaminhar? | `council/saude_clinico.md` |
| Jurídico-regulatório | LGPD (dado sensível), idade, moeda/recompensas, parcerias, publicidade de profissionais: o que precisa de advogado? | `council/juridico_regulatorio.md` |
| Economia de jogo / comportamental | A economia de créditos fecha? Dá para fraudar? Induz compulsão ou culpa? | `council/economia_de_jogo.md` |

## Contrato de cada especialista (5 partes)
objetivo · arquivos que pode ler · **não modifica o código** · formato (priorizado por impacto/esforço, com arquivo:linha) · limite de palavras. Fatos externos com [VERIFICADO fonte·data] / [NÃO CONFIRMADO]. Responde ao orquestrador só com caminho + 2 achados.

## Consolidação (orquestrador)
1. Ler os relatórios e **verificar por amostragem** os achados de severidade alta (reproduzir ou abrir o trecho) antes de aceitar.
2. Deduplicar; resolver conflitos explicitamente (quem tem razão e por quê).
3. Produzir `COUNCIL_SINTESE.md`: top achados por prioridade, o que foi corrigido, o que ficou como decisão da pessoa (A/B/C), o que foi rejeitado e por quê.
4. Corrigir o que for reversível e barato; o resto vira decisão registrada.

## Regras
- Especialistas independentes: não mostrar o raciocínio de um ao outro (evita viés de ancoragem).
- Custo: 8+ agentes custam; usar 3–4 relevantes quando o escopo for estreito.
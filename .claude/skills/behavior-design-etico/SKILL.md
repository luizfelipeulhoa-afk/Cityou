---
name: "behavior-design-etico"
description: "Aplicar psicologia comportamental, social e organizacional e persuasão ética ao projetar onboarding, engajamento, retenção, gamificação, lembretes, copy e métricas, com linha vermelha contra dark patterns."
---

# Design comportamental ético

**Por quê:** o cliente quer usuários engajados; quem projeta responde pelo resultado e pelo dano. Engajamento que prejudica a pessoa é dívida (reputação, lei, churn).

## Procedimento (3 passos)
1. **Comportamento-alvo em 1 frase** ("o usuário conclui X em ≤60 s"). Sem alvo observável, parar e definir.
2. **Diagnosticar o que falta** (modelo de Fogg: motivação · capacidade · gatilho). Atacar primeiro **capacidade** (tirar atrito) antes de motivação.
3. **Escolher a alavanca e passar no filtro ético** (abaixo). Registrar a decisão com o que foi rejeitado.

## Alavancas (decisão de produto → métrica → risco)
| Alavanca | Decisão de produto | Métrica | Risco |
|---|---|---|---|
| Autonomia, competência, pertencimento (SDT) | escolhas reais, feedback de progresso, ligação com outros | retorno espontâneo | gamificação que vira controle |
| Atrito mínimo / defaults | 1ª vitória em ≤60 s; padrões sensatos | taxa de ativação | default que beneficia só o cliente |
| Prova social honesta | números reais, nunca inventados | conversão | comparação social que desmotiva |
| Compromisso gradual | passos pequenos, reversíveis | conclusão por etapa | pressão por consistência |
| Escassez/urgência | só se for real e verificável | — | falsa urgência = proibido |
| Lembretes | opt-in, janela e frequência escolhidas, 1 clique para parar | opt-out rate | culpa, excesso |
| Feedback de erro | diz o que fazer, sem culpar | recuperação | tom punitivo |
| Equipes (org.) | segurança psicológica, feedback frequente e específico | participação | vigilância percebida |

## Filtro ético (reprovar se QUALQUER item for sim)
- A pessoa entenderia e aprovaria a técnica se ela fosse explicada em voz alta?
- Esconde, atrapalha ou pune a saída/cancelamento/recusa? (confirmshaming, roach motel, opt-out escondido)
- Cria urgência, escassez ou prova social falsas?
- Explora medo, solidão, vício, vergonha ou vulnerabilidade (inclui menores e crise de saúde mental)?
- Coleta dado além do necessário ou sem consentimento claro (LGPD)?
- Otimiza tempo de uso em vez de benefício percebido pela pessoa?
Se reprovar: propor alternativa que obtenha o mesmo resultado sem o item.

## Métricas-guarda (acompanhar junto com a métrica-norte)
Opt-out de lembretes · reclamações · desistência após 1ª semana · uso noturno excessivo · relatos de pressão. Se a guarda piora, a alavanca sai, mesmo que a norte suba.

## Honestidade de evidência
Efeitos de nudge costumam ser pequenos e variam por contexto; alguns conceitos populares replicaram mal (ex.: esgotamento do ego). Tratar como hipótese: A/B pequeno ou N-of-1 antes de generalizar. Afirmação científica externa só com fonte verificada; senão marcar [NÃO CONFIRMADO].

## Engenharia social — lado defensivo
Todo fluxo de conta, convite, recuperação de senha e suporte é alvo de pretexting/phishing. Para cada fluxo novo: quem pode se passar por quem? o que o atacante ganha? Mitigar com confirmação fora de banda, mensagens que nunca pedem senha e log de auditoria.
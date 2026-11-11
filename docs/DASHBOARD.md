# Painel de progresso: créditos, nível, bônus

Como mostrar o progresso da pessoa sem deixar o app mais lento nem mais pesado. Os números de tamanho e tempo abaixo são **metas**; cada uma diz como será medida.

## Regras de eficiência

| Regra | Como se cumpre | Como se mede |
|---|---|---|
| Nenhuma requisição a mais | O servidor calcula o `resumo` e o manda junto das respostas que já existem (`GET /api/personal` e a resposta de cada marcação) | Contagem de requisições da página, antes e depois |
| Resumo pequeno | Menos de 1 KB. Hoje, 499 bytes num exemplo real | Teste em `tests/game-rules.test.mjs` falha se passar de 1 KB |
| Nada de polling | Atualiza quando a pessoa age ou abre a tela, nunca por relógio | Revisão de código: não há `setInterval` no painel |
| Pintura imediata | O último `resumo` fica guardado no aparelho e aparece antes da rede; o novo o substitui ao chegar | Tempo do toque até a primeira pintura, em teste de navegador |
| Barra do topo sem JavaScript novo | Créditos e nível são HTML e CSS puros; só o painel detalhado carrega código | Tamanho do chunk no `npm run build` |
| Painel detalhado sob demanda | Carregado por `import()` na primeira vez que se abre; meta de até 8 KB gzip | Tamanho do chunk |
| Animação barata | Só `transform` e `opacity`; sem biblioteca nova; respeita `prefers-reduced-motion` | Painel Performance do navegador, sem recálculo de layout |
| Resposta ao toque | Atualização otimista: a tela muda antes do servidor responder | Meta de 50 ms do `API.md` |

## O que mostrar, em três níveis

**Nível 1, sempre visível (barra do topo):**

- Créditos, com uma animação curta quando mudam.
- Nível e barra de progresso até o próximo.

**Nível 2, um toque abre (folha lateral ou, no celular, uma folha de baixo):**

- Bônus de hoje: hábitos pagos (x de 8), tarefas pagas (x de 10), comprovações com bônus (x de 3, +5 cada).
- Os 5 últimos ganhos, com a origem de cada um ("Hábito concluído: Treinar").
- Próxima construção e quanto falta em créditos.
- Metas em andamento, com a barra de cada uma.

**Nível 3, página própria (`Meu progresso`), mais adiante:**

- Extrato completo e calendário de presença.
- Evolução por área e etapa de cada prédio.
- Quando existirem: XP, ritmo da semana (sete marcas) e bônus ativo.

A cidade (`city.html`) já tem saldo, nível e histórico próprios. Ela passa a ler o mesmo `resumo`, para os dois lugares nunca divergirem.

## Contrato do `resumo`

```json
{
  "credits": 60,
  "earned": 10,
  "level": 1,
  "level_progress": { "within": 1, "size": 10 },
  "today": {
    "habits": { "done": 1, "total": 1 },
    "paid": {
      "habit": { "used": 1, "cap": 8 },
      "task": { "used": 0, "cap": 10 },
      "proof": { "used": 1, "cap": 3, "bonus": 5 }
    }
  },
  "recent": [{ "label": "Hábito concluído: Treinar pernas", "amount": 5, "created_at": "2026-11-11T08:35:09.899Z" }]
}
```

Calculado por `buildSummary` em `shared/game/summary.js` (função pura, com testes) e montado no servidor em `DemoSession.summary()`. Campos que entram quando existirem: `xp`, `presence` (dias ativos e bônus), `next_building`.

## Linguagem e ética

- Só ganho. Nunca "você perdeu", nunca contagem de dias sem usar, nunca vermelho de alerta.
- Teto atingido vira "hoje já está completo", não "limite".
- Ausência não aparece. Quem volta depois de uma pausa vê o que já tem, não o que deixou de ganhar.
- Os números dizem de onde vieram (o extrato mostra a origem de cada crédito), para a pessoa entender e confiar.
- Revisão com as skills `gamificacao-saude-etica` e `behavior-design-etico` antes de cada fase com tela nova.

## Acessibilidade

Contraste AA; `role="progressbar"` com valores nas barras; mudança de créditos anunciada com `aria-live="polite"` uma vez por ação (não a cada quadro da animação); alvos de 44 px; abre e fecha por teclado (`Esc` fecha); foco volta ao botão que abriu.

## Fases

| Fase | Entrega | Depende de |
|---|---|---|
| D0 (feita) | Contrato `resumo` no servidor, com teste de tamanho | nada |
| D1 | Barra do topo no painel pessoal (créditos e nível), lendo o `resumo` | D0 |
| D2 | Folha de bônus e últimos ganhos, em chunk separado; `resumo` guardado no aparelho | D1 |
| D3 | A cidade passa a ler o mesmo `resumo` | D1 |
| D4 | XP, ritmo da semana e bônus ativo | XP e presença no servidor |
| D5 | Página `Meu progresso` | D4 |

Cada fase entra com medição antes e depois (requisições, bytes, tempo até pintura) e screenshots de computador e celular.

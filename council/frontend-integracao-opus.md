# Council de 13/11/2026: Frontend e integração

Relatório de um subagente (Opus 5.5), só de leitura, feito sobre a `main` na PR #22. Vários itens já mudaram: veja o estado de cada um em [COUNCIL_SINTESE.md](COUNCIL_SINTESE.md). O texto abaixo é o original, sem edição.

---

## 1. Matriz de conexão (main, lida pelo GitHub)

| Capacidade do backend | Tela | Estado |
|---|---|---|
| `GET /api/auth/status` | landing (`applyStatus`), App.vue (`account`) | LIGADO |
| `GET /api/me` | nenhuma | DESLIGADO (o status cobre o mesmo dado) |
| `POST /api/auth/logout` | App.vue `signOut` | PARCIAL: só existe no painel, não na cidade nem no mapa |
| `resumo` em `GET /api/personal` e na marcação | nenhuma (App.vue nunca lê `data.resumo`) | DESLIGADO: as fases D1 a D3 do DASHBOARD.md não foram feitas |
| Comprovação com nota e foto (PUT checkin + `proof`) | App.vue `sendProof` com `proof.js` | LIGADO |
| `proofs[]` e `GET /api/personal/proofs/:id/:dia/photo` | nenhuma | DESLIGADO: a pessoa nunca revê o que comprovou |
| Prédio de atividade (`build` + `activity_id`, `predios`) | App.vue `buildFor` e `hasBuilding` | LIGADO |
| Etapas (`etapa`, `dias`, `proxima`) | CityApp, painel do prédio | PARCIAL: o painel só mostra "Prédio na cidade", sem etapa |
| Remover prédio (`remove`) | CityApp `confirmRemove` | LIGADO |
| Tarefas: listar, criar e concluir | App.vue e CityApp (`finishTask`) | LIGADO, mas as duas telas avisam "fonte offline" |
| Progresso do mundo e viagem | WorldApp (`loadWorldProgress`, `travelTo`) | LIGADO no modo regional |
| `PUT /api/world/progress` | `progressSync.js` (só em localhost) | Herdado: o servidor ignora o que recebe |
| `/api/workspace/activity` e `projects` | CityApp (a cada 10 s) e App.vue | Ligado a um stub que sempre responde `connected:false` |
| Moedas de teste (`/api/admin/credits`) | nenhuma | DESLIGADO de propósito: exige um segredo |

## 2. Achados por impacto/esforço

1. **ALTA · App.vue `refresh()` e `api()`; CityApp `refreshAll`; WorldApp `loadMap`.** Quando a sessão vence no meio do uso (401), ninguém trata isso.
   - O painel mostra o erro genérico "Não foi possível carregar seus registros" com um "Tentar novamente" que falha de novo para sempre.
   - A cidade continua mandando um POST de sincronização a cada 30 s em silêncio, e o selo segue dizendo "Salvo no servidor".
   - O mapa mostra "Não foi possível carregar o progresso".
   - Correção: um único tratamento de 401 no cliente que leva a `/?entrar=1&next=<caminho atual>`, usando `window.top` quando a página está dentro de iframe, e que para os ciclos de atualização. Esforço P.

2. **ALTA · App.vue `api()`.** É um segundo cliente de API, duplicado de `src/fifones/api.js`, sem try/catch na chamada de rede e sem limite de tempo. Sem rede, o aviso mostra "Failed to fetch" em inglês, e um pedido pode ficar parado indefinidamente. Correção: usar `request` de `api.js` em todo lugar (exportá-lo). Esforço P.

3. **ALTA · Textos e pontes para o "Fifones original" (porta 127.0.0.1:8765).** A demo responde `connected:false` sempre, então quem usa em produção vê o seguinte:
   - No painel, aparecem "Fonte original offline", "Suas tarefas estão no Fifones original. Reconecte a fonte" e "Abra o Fifones original na porta 8765".
   - No painel, isso vale até para o botão de perfil (Configurações), Agenda, Projetos, Fitness e Professor.
   - Na cidade, o painel de missões diz "Inicie o app original na porta 8765… para ganhar moedas", e o menu lateral abre iframes para localhost.
   - Ainda no painel, Autoconhecimento diz "Seus registros ficam neste computador", o que é falso com conta.
   - Correção: esconder as pontes fora de localhost e trocar os textos. Esforço P/M.

4. **MÉDIA · Banco fora do ar (worker/index.js, `handleApi`, e `sessionUser`).** `pageGate` deixa a página abrir, mas quem tem o cookie `cityou_session` recebe 500 em todas as rotas de dados, porque `ensureSchema` lança erro. Isso contradiz o CONTAS.md, que promete "abre como demonstração". Na tela aparecem "A cidade está desconectada" e "Demonstração" no lugar do nome da pessoa. Correção: capturar o erro e responder 503 com mensagem clara, e a interface mostrar "Contas indisponíveis no momento". Esforço P.

5. **MÉDIA · Navegação.**
   - A cidade avulsa (`/city`) não tem link para `/app`, só "Voltar ao globo". O logo apenas recentraliza a câmera.
   - "Criar conta ou entrar" no painel aponta para `/?inicio`, que não abre a janela de entrada. Deveria ser `/?entrar=1&next=/app`.
   - O botão de sair existe só no painel.
   - Correção: adicionar o link para `/app` e corrigir esse href. Esforço P.

6. **MÉDIA · Duplicação de fonte da verdade.**
   - O mapa abre com o progresso do localStorage (`buildu:world-progress:v1`) e só depois o servidor o substitui. No modo offline (inclusive no 401), mostra esse progresso local, que pode ser de outra pessoa que usou o mesmo navegador.
   - O nível da cidade vem de `progression.js` e do snapshot, enquanto o servidor já calcula `resumo.level`. São dois cálculos que podem divergir.
   - Correção: no modo regional, não ler o localStorage, e limpá-lo ao sair; ler o `resumo` nas duas telas. Esforço M.

7. **MÉDIA · Atualização por relógio.** Pedidos repetidos em segundo plano (contei pelo código):
   - Cidade: activity a cada 10 s, que é um stub inútil, e sync com tarefas e projetos a cada 30 s.
   - Painel: 3 pedidos a cada 60 s.
   - Com `/app#/cidade` aberto, as duas páginas fazem isso ao mesmo tempo.

   O DASHBOARD.md manda "nada de polling". Correção: tirar o ciclo de activity e trocar o resto por atualização no foco ou na ação. Esforço P.

8. **MÉDIA · Comprovação.** A janela abre sempre vazia, mesmo quando o item já foi comprovado hoje (a resposta `already_proved` vira "Comprovação atualizada"). Não há histórico nem foto, embora `proofs[]` já venha na resposta. Correção: indicar "já comprovado hoje" e mostrar uma miniatura pela rota da foto. Esforço M.

9. **BAIXA · Marca.** O mapa usa "BuildU" no título, no logo "B" e no título do iframe ("Mapa-mundo BuildU"). Correção: trocar para Cityou. Esforço P.

10. **BAIXA · `signOut`.** Redireciona no `finally`, mesmo se o pedido de saída falhar. Sem rede, a pessoa acha que saiu e a sessão continua aberta no servidor. Esforço P.

11. **BAIXA · Login em conta existente.** O que a pessoa fez na demonstração é abandonado sem aviso (só o cadastro adota esses dados). A frase da landing "O que você já fez neste navegador vai junto" vale só para o cadastro, e com REQUIRE_LOGIN ligado não haverá mais demonstração. Correção: ajustar o texto. Esforço P.

12. **BAIXA · Acessibilidade.** As janelas do painel têm foco preso e Esc; a landing usa `<dialog>` nativo; há `progressbar`, `role=status` e movimento reduzido na landing, na cidade e no globo. Falta no mapa: a folha de destino tem `role=dialog` sem `aria-modal` e sem foco preso. Esforço P.

**Itens conferidos que estão bem:**
- O `next` é validado: a regex `^\/(?!\/)[\w\-./?=&%#]*$` aceita só caminhos do próprio site e cai em `/app` no resto. Barra dupla e barra invertida ficam de fora.
- Não encontrei `v-html` nem `innerHTML` em App.vue, CityApp, WorldApp, WorldMap, CityWorld e landing.js (busquei com grep). A landing usa `textContent`. As miniaturas da cidade são SVG com a cor validada, carregadas por `<img>`.
- No localStorage só há o progresso do mapa e a preferência de meta. Os cookies são HttpOnly.
- O tratamento de 409, 422 e 429 é bom na entrada (landing) e na cidade (`performAction` recarrega a cidade no 409). No painel, o 422 aparece como aviso com a mensagem do servidor.

## 3. Top 3 para o MVP

1. Tratamento único de 401 com retorno a `/?entrar=1&next=...`, junto com a unificação do cliente de API (achados 1 e 2).
2. Remover as pontes e os textos de "porta 8765" e "fonte offline" em produção (achado 3).
3. Barra de créditos e nível no painel lendo o `resumo`, e a cidade lendo o mesmo `resumo` (fases D1 e D3), aproveitando para mostrar a etapa do prédio no painel.

## 4. Não consegui ler/confirmar

- A busca de código do GitHub (`gh api search/code`) não devolveu resultado nenhum. Usei leitura direta dos arquivos com grep.
- Não li por inteiro o template da cidade, o CityWorld.js, o WorldGlobe.js, o docs/API.md e o INTERACTIONS.md.
- Suponho, sem ter visto a parte do `applyCityAction` que escolhe a posição, que a construção sem `x`/`y` vinda de `buildFor` funciona.
- O peso das páginas e o contraste não foram medidos, porque exigiriam build e navegador.
- Também não confirmei se o rótulo do prédio na cena 3D usa o `nome` digitado pela pessoa. Não achei `innerHTML` nem `fillText` no CityWorld.js.

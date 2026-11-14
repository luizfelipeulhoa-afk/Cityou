# Council de 13/11/2026: Frontend e integração (mesmo pedido, para o estudo)

Relatório de um subagente (Haiku 5.5), só de leitura, feito sobre a `main` na PR #23. Vários itens já mudaram: veja o estado de cada um em [COUNCIL_SINTESE.md](COUNCIL_SINTESE.md). O texto abaixo é o original, sem edição.

---

## 1. Matriz de conexão (backend → tela)

| Capacidade do backend | Tela que usa | Estado | Arquivo |
|---|---|---|---|
| `/api/auth/status` | Landing, /app (nome e botão Sair) | LIGADO | `src/landing/landing.js` (`applyStatus`), `src/App.vue` |
| `/api/me` | nenhuma | DESLIGADO | — |
| Cadastro e entrada | Landing (dialog) | LIGADO | `landing.js` (submit) |
| Sair (`/api/auth/logout`) | /app, barra lateral | LIGADO | `App.vue` (`signOut`) |
| `/api/personal` (painel) | /app | LIGADO | `App.vue` (`refresh`) |
| `resumo` do painel | nenhuma | DESLIGADO | `worker/demo.js` gera, ninguém lê |
| Hábitos e metas (criar, marcar) | /app | LIGADO | `App.vue` (`save`, `toggleHabit`) |
| Comprovação: envio com nota e foto | /app (dialog) | LIGADO | `App.vue` (`sendProof`) |
| Ver a foto da comprovação | nenhuma | DESLIGADO | rota em `demo.js` sem consumidor |
| Tarefas (criar, listar, concluir) | /app | LIGADO | `App.vue`, `src/fifones/api.js` |
| Tarefas na cidade | /city (missões) | DESLIGADO | `CityApp.vue` oculta por `sourceConnected` |
| Projetos | /app | PARCIAL (sempre vazio) | `App.vue` |
| Agenda | /app | DESLIGADO (sem rota de dados) | `App.vue` |
| Biblioteca, capa de documento | /app | DESLIGADO (lista vazia; capa dá 404) | `App.vue` |
| Fitness | /app | DESLIGADO (dados vazios, só ponte) | `App.vue` |
| Finanças, refeições | /app | LIGADO | `App.vue` |
| Memórias | /app | PARCIAL (banner "fonte indisponível") | `App.vue` |
| `GET /api/city`, ações (construir, mover, girar, remover, evoluir, via) | /city | LIGADO | `CityApp.vue` (`performAction`) |
| Construir a partir de atividade | /app (hábitos e metas) | LIGADO | `App.vue` (`buildFor`) |
| Etapas do prédio | /city | LIGADO | `CityApp.vue` |
| `/api/workspace/activity` | /city (poll 10 s) | DESLIGADO na prática (sempre null) | `CityApp.vue` (`refreshActivity`) |
| `/api/rewards/sync` | /city (poll 30 s, POST) | LIGADO | `CityApp.vue` (`refreshAll`) |
| Progresso do mundo (GET) e viagem | /world | LIGADO | `WorldApp.vue` |
| `PUT /api/world/progress` | /world (modo legado) | PARCIAL: o servidor ignora o corpo | `demo.js` (`saveWorld`) |
| Moedas de teste (`/api/admin/credits`) | nenhuma | DESLIGADO (só admin) | `demo.js` |

## 2. Achados priorizados

**ALTA**
1. **App travada sem rede lenta.** `src/App.vue`, `api()` não tem timeout (o `request()` de `api.js` tem 14 s). Se `/api/personal` não responde, `refresh()` fica com `refreshing` e `loading` true: "Abrindo seu espaço…" para sempre, e os polls não rodam mais. `save()` e `toggleHabit()` deixam `saving` true e os botões travados até recarregar. Correção: usar `request()` de `api.js` ou um AbortController. Esforço P.
2. **Sessão vencida (401) no meio do uso, sem caminho de volta.** `App.vue` `refresh()` mostra "Não foi possível carregar seus registros" sem link para entrar. `CityApp.vue` `refreshAll()` engole o erro, e `save-status` segue "Salvo no servidor". `WorldApp.vue` mostra "Entre na sua conta…" sem botão. Correção: tratar 401 em um só lugar (`api.js`) e redirecionar para `/?entrar=1&next=<rota>`. Esforço P/M.
3. **Tudo que depende do Fifones local aparece como offline, sempre.** `worker/demo.js` devolve `connected: false` fixo em tarefas, e `source: {connected:false}` na cidade. Resultado: "Fonte original offline" na barra do /app, o painel de missões do /city diz "Inicie o app original na porta 8765", não há botão de concluir tarefa no /city, e cada "Abrir espaço" cai em "Vamos reconectar". Um cliente final não tem como abrir a porta 8765. Correção: esconder ou rotular como "em breve" no modo de produção. Esforço M (decisão de produto).
4. **Mundo com dois donos.** `WorldApp.vue` mantém `buildu:world-progress:v1` no localStorage. No modo offline, os espaços aparecem como disponíveis, mas `onOpen` só age em regional e legado: o toque não faz nada. O PUT do servidor é um no-op. Correção: no offline, mostrar só o estado confirmado; remover o PUT e o localStorage de progresso. Esforço M.
5. **Redirect de login dentro de iframe.** `worker/index.js` (`pageGate`) responde 302 para `/?entrar=1` também em navegações de iframe. O /app embute `/city.html` e `/world.html` (`App.vue`), então a landing apareceria aninhada no painel. Inferido do código, não testado. Correção: redirecionar o topo (`window.top`) ou checar a sessão antes de montar o iframe. Esforço P.

**MÉDIA**
6. **Erro de bloqueio no /city sem saída.** `CityApp.vue` (painel `city-notice`): para 403 "local bloqueado" ou local inválido, só há "Tentar novamente" (recarrega). Falta "Voltar ao globo". Esforço P.
7. **Landing confunde falha de rede com contas desligadas.** `landing.js` chama `applyStatus({})` quando `/api/auth/status` falha. Os botões viram "Abrir a demonstração" e o texto diz "As contas ainda não estão ativas", mesmo com o banco ligado. Esforço P.
8. **Sidebar do /app sem "Sair" se o status falhar.** `App.vue`: se o fetch de `/api/auth/status` falha, `account` fica null e aparece "Criar conta ou entrar" para quem está logado. Esforço P.
9. **/city não tem como voltar ao /app.** O botão "Cityou" do topo recarrega a própria cidade. Só o mapa tem "← Voltar ao Cityou" (`WorldApp.vue`). Esforço P.
10. **Duplicação de cliente de API.** `App.vue` tem `api()` próprio, sem timeout e sem tratar erro de rede. O `notify(e.message)` pode mostrar "Failed to fetch" em inglês. Esforço P.
11. **Marca e termos inconsistentes.** "BuildU" no HUD de `WorldApp.vue`, no título do iframe em `App.vue` e nas chaves `buildu:*`. "Fifones" e "porta 8765" em toda a interface. Esforço P.
12. **Acessibilidade da cidade.** Selecionar construção depende do clique no canvas. O teclado só tem coordenadas, e só em grade de 24 (`usesRoadEditor`). Esforço M.
13. **Polling desperdiçado.** `CityApp.vue` consulta atividade a cada 10 s (sempre null) e faz POST de sync a cada 30 s. `App.vue` refaz 3 chamadas a cada 60 s. Esforço P.

**BAIXA**
14. Reset de senha: a tabela `password_resets` existe, mas não há rota nem tela. Lacuna para contas reais.
15. Cadastro sem rate limit (só o login tem `login_attempts`), e o 409 do cadastro confirma e-mail existente. Backend, mas afeta a tela.
16. `/api/personal/documents/:id/cover` não existe em `demo.js`. Cada card gera um 404 e cai no fallback.

**O que está certo (c):** não achei `innerHTML` nem `v-html` nos arquivos lidos; o `next` é validado por regex só com caminhos do próprio site (`landing.js`); a sessão fica em cookie HttpOnly. O localStorage guarda só progresso e preferências.

**(b) 403/409/422/429/503:** 409 e 422 de ações da cidade chegam com o snapshot, e a tela o aplica. 429 aparece no formulário de entrada. 503 só existe nas rotas de conta. Banco fora em rota de dados vira 500 com texto genérico. O `pageGate` abre o app se o banco cair (fail-open), e a App então mostra erros em vez da entrada.

**(f) Duplicação:** o saldo e os hábitos do dia são recalculados no cliente (`App.vue`), enquanto o servidor já gera `resumo`. `progression.js` recalcula nível e conquistas que o servidor também calcula.

**Pesos (e), estimativa sem build:** /app carrega `App.vue` e `personal.css` (37 KB) e faz 4 chamadas na abertura, mais polls. A landing carrega `landing.js`, fontes e 9 imagens lazy. /city carrega o bundle 3D e 5 chamadas na abertura.

## 3. Top 3 para o MVP

1. Tratar 401 e timeout em um único lugar (`api.js`), com redirecionamento para entrar, e destravar a App (item 1 e 2).
2. Tirar do fluxo de produção o que depende do Fifones local: ponte 8765, "offline", telas vazias (item 3).
3. Deixar o servidor como única fonte do progresso do mundo e corrigir o status "Salvo no servidor" (itens 4 e 6).

## 4. Não consegui ler/confirmar

- `src/fifones/CityWorld.js`, `progression.js`, `pilotInteriors.js`, `progressSync.js` (`hasLocalBackend` decide se o modo legado com "Concluir fase (simulação)" aparece), `src/components/WorldMap.vue`, `src/world/worldSpaces.js`.
- `src/personal/Icon.vue`, `personal.css`, `proof.js`; `landing.css` (se `data-reveal` esconde conteúdo sem JS).
- `shared/game/*` (valores de 50 moedas e recompensas não conferidos), `worker/routes/*`, `docs/*.md`, `vite*.config.js`.
- Pesos reais, comportamento em navegador, contraste e teste real de 429, 503 e sessão expirada. Não rodei nada.
- Caminho `/` × `/app` não tem links quebrados nos arquivos lidos, mas não fiz varredura de todos os HTMLs.

# Mapa de interações do Cityou

Para cada tela: a ação principal, cada botão com a rota e a tabela que ele toca, os atalhos, o celular, o estado vazio, o erro e o desfazer. As tabelas estão em `DATA-MODEL.md` e as rotas em `API.md`.

Coluna "Hoje": o que o botão faz no código atual (`src/App.vue`). "Fifones" quer dizer que ele abre um iframe para `127.0.0.1:8765`, que não existe no site publicado.

## Regras gerais

Escritas do navegador usam `X-Cityou-Request: 1`, inclusive nas telas de conta. Abas abertas antes da migração precisam recarregar para adotar o novo cliente. Veja [API](API.md).

1. **Resposta imediata.** A tela muda no toque; o servidor confirma depois. Se a gravação falhar, a tela volta ao estado anterior e o aviso diz o motivo.
2. **Desfazer, não confirmar.** Apagar, concluir e desmarcar mostram um aviso com "Desfazer" por 5 segundos. Não há caixa de "tem certeza?". A única exceção é apagar a conta.
3. **Tudo pode ser corrigido.** Todo cartão e toda linha abrem o formulário de edição (clique, `Enter` ou `E`). O formulário de edição é o mesmo de criação, com o botão "Apagar".
4. **Uma ação principal por tela.** "Novo registro", no topo, cria o item da tela atual. É o comportamento que `showForm` já tem.
5. **Só o título é obrigatório.** A data vem com hoje. Campos opcionais ficam recolhidos em "Mais detalhes".
6. **Estado vazio ensina.** Lista vazia mostra uma frase e o botão da primeira ação.
7. **Erro diz o que fazer.** Campo inválido: mensagem junto do campo. Sem conexão: "Sem conexão. Tentaremos de novo." e o item fica marcado como pendente. Sessão expirada: volta ao login e preserva o que estava sendo digitado. Desde a etapa 2, o cliente único (`api()` em `src/fifones/api.js`) leva a pessoa a `/?entrar=1&next=…` no primeiro 401 e não manda mais nenhum pedido.
8. **Progresso visível.** Nível, barra de XP e créditos ficam no topo de todas as telas e animam quando mudam. Clicar abre o extrato. Subida de nível, etapa de prédio e melhoria disponível aparecem num aviso curto, sem interromper o que a pessoa está fazendo.
9. **Sem culpa.** Nada some, zera ou fica vermelho por falta de uso. Revisão da fase B6 com as skills `gamificacao-saude-etica` e `behavior-design-etico`.

## Teclado (desktop)

Os atalhos de uma tecla ficam desligados enquanto o foco está em campo de texto ou com um diálogo aberto. A tecla aparece ao lado do rótulo do botão e na lista aberta por `?`.

| Tecla | Ação |
|---|---|
| `N` | Novo registro da tela atual |
| `/` | Foco na busca da tela |
| `Ctrl` ou `Cmd` + `K` | Paleta de comandos: ir para uma área, criar qualquer registro, buscar |
| `G` e depois uma letra | Ir para uma área: `D` Seu dia, `T` Tarefas, `A` Agenda, `H` Hábitos, `M` Metas, `F` Finanças, `P` Projetos, `C` Cidade, `W` Mapa-mundo |
| `↑` `↓` ou `J` `K` | Mover o foco na lista |
| `Espaço` | Concluir a tarefa ou marcar o hábito em foco |
| `E` ou `Enter` | Editar o item em foco |
| `Delete` | Apagar o item em foco (com desfazer) |
| `Ctrl` ou `Cmd` + `Enter` | Salvar o formulário |
| `Ctrl` ou `Cmd` + `Z` | Na cidade: desfazer a última ação da Fita do Tempo (até 120 s); com `Shift`, refazer. Ignorado em campos de texto |
| `R` | Atualizar os dados |
| `Esc` | Fechar diálogo, menu ou paleta (já existe) |
| `?` | Mostrar os atalhos |

`Tab` continua preso dentro do diálogo aberto, como já acontece em `keydown`.

## Celular

- Barra inferior fixa: Seu dia, Tarefas, Hábitos, Mapa e "Mais" (abre o menu completo).
- Botão flutuante "+" acima da barra: novo registro da tela atual.
- Alvos de toque com 44 px ou mais. Formulário abre como folha que sobe da base, com o teclado certo por campo (`inputmode="decimal"` no valor, `type="date"` na data).
- Deslizar um item para a esquerda mostra "Apagar"; para a direita, conclui. Os mesmos comandos existem como botões, para quem não usa gestos.
- Dicas de atalho de teclado não aparecem em telas de toque.

## Entrar e conta (telas novas)

| Botão | Rota | Tabela | Retorno |
|---|---|---|---|
| Criar conta | `POST /api/auth/signup` | `users`, `sessions` e objeto de dados da conta | Preserva o progresso da demonstração, confirma o dono do objeto e troca o cookie de demonstração |
| Entrar | `POST /api/auth/login` | `sessions`, `login_attempts` | Entra no app. Senha errada: "E-mail ou senha incorretos." |
| Esqueci minha senha (link na tela de entrar) | navegação | | Abre a tela com o campo de e-mail |
| Enviar instruções | `POST /api/auth/forgot` | `password_resets` | Sempre a mesma mensagem: "Se o e-mail existir, enviamos as instruções." |
| Salvar nova senha (tela aberta pelo link do e-mail) | `POST /api/auth/reset` | `users`, `password_resets`, `sessions` | Entra no app. Link vencido ou já usado: "Este link não vale mais. Peça outro." |
| Sair (em Conta) | `POST /api/auth/logout` | `sessions` | Volta ao login |
| Salvar nome e fuso | `PATCH /api/me` | `users` | Saudação atualizada |
| Exportar meus dados (B8) | `GET /api/me/export` | leitura de todas | Baixa um arquivo JSON |
| Apagar minha conta (B8) | `DELETE /api/me` | todas | Pede a senha de novo; depois volta ao cadastro |

Erros: e-mail já cadastrado, senha com menos de 10 caracteres, muitas tentativas ("Aguarde alguns minutos e tente de novo.").

## Estrutura comum (menu e topo)

| Elemento | Hoje | Passa a ser |
|---|---|---|
| Itens do menu, marca "Cityou" | Trocam a rota (`#/…`) | Igual |
| Recolher menu, abrir menu no celular, fechar menu | Estado local | Igual; no celular entra a barra inferior |
| "Mapa-mundo", "Minha cidade", "Abrir só o mapa", "Abrir só a cidade" | Abrem `world.html` e `city.html` (em iframe ou em outra aba) | Igual |
| "Tentar novamente" (faixa de erro) | Recarrega os dados | Igual, com `GET /api/overview` |
| Perfil "Luiz Felipe" → Configurações | Fifones | Abre a tela Conta, com o nome de `users.display_name` |
| "Conectado ao Fifones" / "Fonte original offline" | Estado do Fifones | Estado da gravação: "Salvo", "Salvando…", "Sem conexão" |
| Atualizar meus dados | `GET /api/personal` + 2 chamadas | `GET /api/overview` (uma chamada), atalho `R` |
| Novo registro | `showForm` da tela | Igual, atalho `N` |
| "Falar sobre isso" (em todas as áreas) | Fifones | **Sai** |
| Nível, XP e créditos | Não existe no painel | Novo: nível com barra de XP e saldo de créditos (`player`); abre o extrato (`ledger`) |
| Ritmo da semana | Não existe | Novo: sete marcas (dias ativos preenchidos) e o bônus atual; abre o calendário de presença (`GET /api/presence`). Sem cor de alerta |
| Formulário: "Guardar", "Agora não", fechar | `POST` de criação | Igual, mais "Apagar" na edição |
| Aviso: fechar | Estado local | Igual, mais "Desfazer" |
| Diálogo do Fifones ("Voltar ao Cityou", "Verificar conexão") | Iframe | **Sai** |

## Telas

### Seu dia

Ação principal: "Anotar" (tirar algo da cabeça).

| Botão | Hoje | Rota | Tabela | Retorno |
|---|---|---|---|---|
| Anotar | Cria nota | `POST /api/notes` | `notes` | Aviso "Guardado."; nota em Memórias |
| Microfone (conversa por voz) | Fifones | | | **Sai** |
| Círculo da tarefa | Conclui a tarefa real (`POST /api/personal/tasks/{id}/complete`, etapa 2) | `POST /api/tasks/{id}/complete` | `tasks`, `ledger`, `player` | Tarefa sai da lista; XP e créditos sobem no topo; "Desfazer" |
| Criar uma tarefa | Cria a tarefa real (`POST /api/personal/tasks`) | `POST /api/tasks` | `tasks` | Tarefa na lista |
| Adicionar compromisso | Fifones | `POST /api/events` | `events` | Compromisso em "Na sua agenda" |
| Ver tarefas, seta da agenda, cartões de área, "Registrar meu momento" | Navegação | | | Igual |

Vazio: "Espaço para o que vem agora." com "Criar uma tarefa".

### Tarefas

Ação principal: "Nova tarefa".

| Botão | Hoje | Rota | Tabela | Retorno |
|---|---|---|---|---|
| Nova tarefa | Cria a tarefa real (`POST /api/personal/tasks`) | `POST /api/tasks` | `tasks` | Linha no topo de "A fazer" |
| Círculo | Conclui a tarefa real (`POST /api/personal/tasks/{id}/complete`, etapa 2) | `POST /api/tasks/{id}/complete` | `tasks`, `ledger`, `player` | Vai para "Concluídas"; XP e créditos sobem; "Desfazer" |
| Círculo de tarefa concluída | Desligado | `POST /api/tasks/{id}/reopen` | `tasks` | Volta para "A fazer"; os créditos ficam |
| Linha da tarefa | Nada | `PATCH /api/tasks/{id}` | `tasks` | Formulário de edição (título, descrição, prazo, prioridade, projeto) |
| Apagar (no formulário) | Não existe | `DELETE /api/tasks/{id}` | `tasks` | Some da lista; "Desfazer" chama `POST /api/tasks/{id}/restore` |
| Filtros "A fazer", "Concluídas", "Todas" e busca | Filtro local | | | Igual; busca com `/` |

Vazio: "Nada nesta lista." com "Nova tarefa".

### Agenda

Ação principal: "Novo compromisso".

| Botão | Hoje | Rota | Tabela | Retorno |
|---|---|---|---|---|
| Novo compromisso | `POST /api/personal/events` (etapa 5) | `POST /api/events` | `records` (kind `event`) | Compromisso no dia escolhido da grade do mês; nenhuma moeda ou XP |
| Marcar respiro / Tirar o respiro | `POST` com `kind: 'respiro'` ou `DELETE /api/personal/events/{id}` | | `records` | Dia com selo "Dia de respiro" e "Nada a cumprir"; recusado se o dia tem compromisso firme |
| Editar | `PUT /api/personal/events/{id}` | `PATCH /api/events/{id}` | `records` | Mesmo formulário, preenchido |
| Apagar (pede "Apagar mesmo?") | `DELETE /api/personal/events/{id}` | `DELETE /api/events/{id}` | `records` | O compromisso sai; sem desfazer por enquanto |
| Setas do mês | `GET /api/personal?month=AAAA-MM` | | | Outro mês da grade |

A grade mostra dia livre, com compromisso (ponto cheio), com "se der" (ponto vazado) e de respiro (sol). Nada é vermelho e não há aviso de atraso: o que passou fica em cinza com o selo "passou". Seu dia lista os compromissos de hoje.

Vazio: "Um pouco de espaço livre também faz parte."

### Hábitos

Cada cartão tem, além de "Marcar como feito", o botão "Comprovar" (relato ou foto; +5 moedas, até 3 por dia, opcional e privado). O formulário de novo hábito, meta ou tarefa pede a **área** e o **local ou atividade**, que nomeiam o prédio na cidade.

Ação principal: "Marcar como feito". Criar é a segunda.

| Botão | Hoje | Rota | Tabela | Retorno |
|---|---|---|---|---|
| Novo hábito, "Criar meu próximo hábito" | Cria em `entries` | `POST /api/habits` | `habits` | Cartão novo; o total do anel aumenta |
| Marcar como feito / Feito hoje | `PUT …/checkin` | `PUT /api/habits/{id}/checkins/{dia}` | `habit_checkins`, `ledger`, `player`, `presence_days` | Botão vira "Feito hoje"; anel avança; XP e créditos na primeira vez do dia (até 8 hábitos pagos por dia) |
| Cartão do hábito | Nada | `PATCH /api/habits/{id}` | `habits` | Edição (título, detalhe, dias da semana), "Arquivar" e "Apagar" |

Desmarcar não tira créditos. Vazio: "Escolha algo pequeno o suficiente para caber no dia." com "Novo hábito".

### Metas

Ação principal: "Registrar um passo hoje".

| Botão | Hoje | Rota | Tabela | Retorno |
|---|---|---|---|---|
| Nova meta, "Qual é sua próxima conquista?" | Cria em `entries` | `POST /api/goals` | `goals` | Cartão com barra em 0 |
| Registrar um passo hoje | `PUT …/checkin` | `PUT /api/goals/{id}/steps/{dia}` | `goal_steps`, `ledger`, `player` | Barra avança; botão vira "Passo de hoje registrado"; XP. Ao atingir o alvo: meta concluída, com XP, créditos e, se for meta curta, um ponto de melhoria no prédio do domínio |
| Cartão da meta | Nada | `PATCH /api/goals/{id}` | `goals` | Edição e "Apagar" |

### Fitness

Ação principal: "Registrar peso".

| Botão | Hoje | Rota | Tabela | Retorno |
|---|---|---|---|---|
| Registrar peso do dia | `POST /api/personal/weights` (etapa 5) | `PUT /api/weights/{dia}` | `records` (kind `weight`) | "Última pesagem", média de 7 dias, gráfico e lista atualizam; peso em kg com vírgula, convertido para gramas |
| Editar (linha de pesagem) | `PUT /api/personal/weights/{id}` | `PUT /api/weights/{dia}` | `records` | Só o peso e a nota; o dia não muda |
| Apagar (pede "Apagar mesmo?") | `DELETE /api/personal/weights/{id}` | `DELETE /api/weights/{dia}` | `records` | A pesagem sai e o dia fica livre de novo |
| Composição corporal → "Registrar medida" | `POST /api/personal/body-composition` | | `records` (kind `bodycomp`) | Dia, gordura (%), massa magra (kg, opcional), método e nota; campos inválidos em vermelho. Mostra a média das últimas 3 medidas (60 dias) e o aviso de que um valor isolado varia alguns pontos |
| Apagar (linha da medida, pede "Apagar mesmo?") | `DELETE /api/personal/body-composition/{id}` | | `records` | A medida sai e a média é refeita |
| Continuar avaliação (voz Gemini) | saiu | | | **Saiu** |

O gráfico mostra as pesagens como pontos e a média de 7 dias como linha, com o texto neutro "Sua média está estável nas últimas 2 semanas." (ou "um pouco mais alta/baixa que há 2 semanas"). Sem meta, sem cor de bom ou ruim, sem moedas. "Retornos registrados" saiu junto com a avaliação. Vazio: "Seu gráfico começa com a primeira pesagem."

### Alimentação

Ação principal: "Registrar refeição".

| Botão | Hoje | Rota | Tabela | Retorno |
|---|---|---|---|---|
| Registrar refeição | Cria em `entries` | `POST /api/meals` | `meals` | Cartão na lista |
| Cartão da refeição | Nada | `PATCH /api/meals/{id}` | `meals` | Edição e "Apagar" |
| Continuar entrevista sobre alimentação | Fifones | | | **Sai** |

Erro próprio: data futura ("Registre uma refeição já realizada.").

**Base calórica** (cartão no topo da aba, `src/personal/NutritionBase.vue`; rotas em `docs/API.md`, `worker/nutrition.js`). Uma etapa por vez:

| Etapa | O que a pessoa faz | Rota | Retorno |
|---|---|---|---|
| Avaliação | Altura, ano de nascimento, sexo, atividade, meta, treino de força, gestação (só sexo feminino) → "Salvar avaliação" | `PUT /api/personal/nutrition/profile` | Campo inválido ou vazio fica em vermelho com a mensagem (cliente e `fields` do servidor) |
| Triagem (opcional) | Primeiro um aviso ("Algumas perguntas sobre a sua relação com a comida": é sobre transtornos alimentares, é importante responder mas não é obrigatório, deixa o cálculo mais adequado, só a pessoa vê) com "Pular por agora" e "Responder as perguntas"; depois a pergunta sobre diagnóstico ou tratamento (sim, não, prefiro não responder) e as cinco do SCOFF → "Continuar" | `POST /api/personal/nutrition/screening` | Sinal de risco: mostra o gasto para manter o peso, sem sugestão de déficit, com indicação de profissional de saúde. "Refazer a triagem" fica no rodapé |
| Dados incompletos | Sem pesagem nos últimos 30 dias: "Dados incompletos", com o Peso em vermelho e link para Fitness | | |
| Base | Mostra a estimativa, a frase aprovada ("Sugestão de déficit: 500 kcal por dia, com base em estudos. Vale conversar com um profissional de nutrição para ajustar ao seu caso."), gasto, TMB, proteína, peso usado e "Fontes" | `GET /api/personal/nutrition` | Com IMC ≥ 30, aviso neutro de precisão |
| Usar como minha meta / Usar a estimativa nova | Aceita a estimativa | `POST /api/personal/nutrition/target` | A meta não muda sozinha; depois de 3 semanas, compara a direção do peso com a meta e, se não bate, sugere um profissional |
| Minha dieta | Calorias, proteína (opcional), observação → "Salvar dieta"; "Editar", "Apagar" | `PUT`/`DELETE /api/personal/nutrition/plan` | Abaixo da TMB: aviso aprovado ("...a decisão é sua."), grava mesmo assim |
| Ver/Apagar minhas respostas da triagem | Só a própria pessoa (diagnóstico e as cinco, se respondidas) | `GET /api/personal/nutrition/screening`, `DELETE .../screening/answers` | O resultado da triagem fica |
| Editar avaliação / Apagar meus dados de alimentação (pede confirmação) | | `PUT .../profile`, `DELETE /api/personal/nutrition` | Pesagens ficam |

Fora do alcance: menores de 18 (texto sobre crescimento, conversar com a família e um profissional), maiores de 80 e gestação/amamentação (a necessidade aumenta e o app não recomenda déficit) não recebem números, cada um com texto próprio. Conferência no navegador: `node tools/nutrition-playtest.mjs <url>`.

### Autoconhecimento

Ação principal: "Registrar meu momento".

| Botão | Hoje | Rota | Tabela | Retorno |
|---|---|---|---|---|
| Registrar meu momento | Cria nota | `POST /api/notes` com `kind: reflection` | `notes` | Cartão em "Seus registros" |
| Cartão | Nada | `PATCH /api/notes/{id}` | `notes` | Edição e "Apagar" |
| Conversar | Fifones | | | **Sai** |
| Ver memórias | Navegação | | | Igual |

### Estudos e Biblioteca

Ficam para a fase B8, porque dependem de guardar arquivos (R2). Até lá, a tela mostra "Em breve" e nenhum botão quebrado.

| Botão | Hoje | Rota (B8) | Tabela | Retorno |
|---|---|---|---|---|
| Adicionar material | Fifones | `POST /api/documents` | `documents` | Capa na grade |
| Cartão do material | Fifones | `GET /api/documents/{id}/file` | `documents` | Abre o arquivo |
| Busca | Filtro local | | | Igual |
| Abrir professor | Fifones | | | **Sai** |

### Finanças

Ação principal: "Novo lançamento".

| Botão | Hoje | Rota | Tabela | Retorno |
|---|---|---|---|---|
| Novo lançamento, "Adicionar entrada ou saída" | Cria em `entries` | `POST /api/transactions` | `transactions` | Linha no topo; os três totais do mês recalculam |
| Linha do lançamento | Nada | `PATCH /api/transactions/{id}` | `transactions` | Edição e "Apagar" |
| Minhas planilhas | Fifones | | | **Sai** |

Erro próprio: valor zero ou inválido ("Informe um valor maior que zero."). O campo aceita `1.234,56` e `1234.56`, como `save` já trata.

### Projetos

Ação principal: "Novo projeto".

| Botão | Hoje | Rota | Tabela | Retorno |
|---|---|---|---|---|
| Novo projeto | `POST /api/personal/projects` (etapa 5) | `POST /api/projects` | `records` (kind `project`) | Cartão com a caixa "Qual é o próximo passo?" |
| Guardar passo | `PUT /api/personal/projects/{id}` com `next_step` | | `records` | O botão vira "Concluí" |
| Concluí | `POST /api/personal/projects/{id}/step-done` | | `records` | "N passos dados" e "E agora, qual é o próximo?" com a caixa vazia; sem moedas nem XP |
| Editar | `PUT /api/personal/projects/{id}` | `PATCH /api/projects/{id}` | `records` | Nome e detalhes |
| Guardar por enquanto / Retomar | `PUT` com `status` | | `records` | Passa para a aba "Guardados" e volta; reversível |
| Apagar (pede "Apagar mesmo?") | `DELETE /api/personal/projects/{id}` | | `records` | O projeto sai |

Sem prazo, sem contagem regressiva e sem cartões de "parado há N dias". Vazio: "Seu próximo projeto tem espaço aqui."

### Memórias

Ação principal: "Nova memória".

| Botão | Hoje | Rota | Tabela | Retorno |
|---|---|---|---|---|
| Nova memória | Cria nota | `POST /api/notes` com `kind: memory` | `notes` | Cartão no topo |
| Cartão | Nada | `PATCH /api/notes/{id}` | `notes` | Edição e "Apagar" |
| Memórias e Obsidian | Fifones | | | **Sai** |

A tela mostra as três espécies de nota, com um filtro por tipo.

## Minha cidade (`city.html?local=<id>`)

No Rio, selecione um prédio do catálogo e toque em um lote ou use as coordenadas para ver o custo. A prévia marca o lote e o trajeto da rua e separa o custo do prédio, o da rua e o total. Você pode girar, escolher outro lote ou cancelar. **Confirmar construção** só fica disponível quando o lote e o trajeto são válidos e o saldo cobre a compra.

Uma cidade por local liberado. Sem `local`, abre a cidade do local atual. As regras estão em `GAME-DESIGN.md`.

| Botão | Hoje | Rota | Tabela | Retorno |
|---|---|---|---|---|
| Construir, mover, girar, remover | `POST /api/city/actions` | `POST /api/cities/{local}/actions` | `placements`, `player`, `ledger`, `requests` | A construção aparece; os créditos mudam |
| Melhorar (níveis 1 a 3 por créditos) | `POST /api/city/actions` | | | **Sai**: o prédio de domínio avança de etapa pelo uso real |
| Menu lateral (Tarefas, Agenda, Projetos, Biblioteca, Fitness) | Abre a aba do painel com `goToPanel(aba)` (`/app#/<aba>`), na cidade avulsa ou embutida; "Conexões" saiu (etapa 2) | navegação | | Igual |
| Entrar neste espaço (prédio com destino) | Abre a aba do painel ligada ao destino (etapa 2); prédio sem aba (os de IA) só avisa | navegação | | O destino vira nome de aba na etapa 3 |
| Tocar num prédio de domínio | Painel da construção (etapa, dias com prática) | `GET /api/buildings/{id}` | leitura | Painel do interior: etapa, salas, espaços vazios e o que falta para a próxima melhoria |
| Escolher melhoria (no interior) | Não existe | `POST /api/buildings/{id}/upgrades` | `building_upgrades`, `upgrade_points` | A sala ou o equipamento aparece, com a data e a conquista que o liberou |
| Saldo → extrato | `history` | `GET /api/ledger` | leitura | Créditos e XP, com o bônus aplicado em cada linha |
| Missões: concluir tarefa | Conclui a tarefa real (`POST /api/personal/tasks/{id}/complete`, etapa 2); a lista aparece sempre, com "Ver tarefas" | `POST /api/tasks/{id}/complete` | `tasks`, `ledger`, `player` | +10 XP e +10 créditos, mais o bônus |
| Atualizar tarefas e recompensas | `POST /api/rewards/sync` | `GET /api/cities/{local}` | leitura | Só recarrega: a recompensa já foi gravada na ação |
| Voltar ao globo | Navegação | navegação | | Abre `world.html` |
| Catálogo, filtros, luz do dia, entardecer, girar câmera, vista inicial, ajuda | Local | | | Igual |
| Indicador de escritórios ativos; prédios de IA | O indicador saiu na etapa 2; os prédios de IA saem na etapa 3 | | | **Saem** |

Fita do Tempo (canto de cima da cidade, `ActionTape.vue`): cada construção, mudança ou demolição vira um cartão por 120 s; o cartão feito mais novo tem "Desfazer" e o desfeito mais antigo tem "Refazer" (`POST /api/city/undo` e `/redo`, `cityUndo`/`cityRedo` em `api.js`). `Ctrl`/`Cmd` + `Z` desfaz e `Shift` + `Ctrl`/`Cmd` + `Z` refaz, fora de campos de texto; sem contador na tela.

Ao posicionar uma construção:

- As células sob o prédio ficam verdes ou vermelhas no chão, não só o modelo.
- Em vermelho, um texto curto diz o motivo e, quando existe, um botão resolve ("Precisa de rua ao lado · Construir rua").
- Ao escolher um item do catálogo, o mapa destaca onde ele cabe.
- A frente do prédio vira sozinha para a rua vizinha. A tecla `R` gira à mão.
- Pintar rua é arrastar; o trecho inteiro é confirmado de uma vez ("Aplicar") ou descartado ("Desfazer"), e conta como uma ação só.

Sem "Desfazer" para "Escolher melhoria": a escolha é definitiva, então o botão pede um segundo toque de confirmação. É a segunda exceção à regra geral, junto com apagar a conta.

Quando um prédio muda de etapa, a animação toca na próxima abertura da cidade, uma vez.

## Mapa-mundo (`world.html`)

O globo deixa de ser uma fila. Cada local mostra um de três estados.

| Estado | O que aparece | Botão | Rota | Tabela | Retorno |
|---|---|---|---|---|---|
| Cidade sua | Monumento aceso; nível da cidade | Entrar | navegação | | Abre `city.html?local=<id>` |
| Disponível para viajar | Monumento com contorno; custo da passagem | Viajar | `POST /api/world/travel` | `travels`, `cities`, `player`, `ledger` | Animação do transporte; a cidade nova abre |
| Bloqueado | Monumento apagado | Ver o que falta | `GET /api/world` | leitura | Três barras: nível, prédios e créditos, cada uma com o valor atual e o exigido |

| Botão | Hoje | Passa a ser |
|---|---|---|
| Tocar num monumento, lista de espaços, "Ir", "Voltar ao mapa" | Local | Igual; o cartão do local mostra o estado acima |
| Concluir fase (simulação) | Marca o espaço como concluído, sem critério | **Sai** |
| Painel de debug (tecla `D` ou `?debug=1`) | Desbloqueia, conclui e reseta | Só em desenvolvimento |

"Viajar" pede confirmação com o custo ("Viajar para o Coliseu por 250 créditos?"), porque gasta créditos. As cidades anteriores continuam acessíveis.

Sem sessão ou sem rede, o globo abre com o último estado conhecido e os botões de viagem ficam desligados.

## Botões que saem

Todos dependiam do Fifones: "Falar sobre isso", microfone de voz, "Conversar", "Abrir professor", "Continuar avaliação", "Continuar entrevista sobre alimentação", "Minhas planilhas", "Memórias e Obsidian", "Abrir agenda completa", o diálogo do Fifones e o indicador de escritórios ativos (na cidade, o diálogo e o indicador saíram na etapa 2). Voltam se e quando o Cityou tiver essas funções.

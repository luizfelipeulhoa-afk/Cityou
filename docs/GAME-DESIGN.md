# Regras do jogo do Cityou

Como o uso real do app vira nível, cidade e prédios. As tabelas estão em `DATA-MODEL.md`, as telas em `INTERACTIONS.md` e as rotas em `API.md`. Nada disto está implementado: é especificação.

Todos os números deste documento são **propostas**. No código eles ficam num único arquivo (`shared/game/rules.js`, já escrito e testado em `tests/game-rules.test.mjs`) e só serão fechados depois de um teste de simulação na fase B3 (quanto tempo uma pessoa com uso leve, médio e intenso leva para cada marco).

## Princípios

1. **Só fato gravado conta.** O servidor calcula XP, créditos, nível e desbloqueios. O navegador nunca envia esses valores.
2. **Nada se perde.** XP nunca diminui. Desmarcar um hábito ou reabrir uma tarefa não tira nada. Não existe sequência que zera.
3. **Ausência não é punida.** Não há perda, contagem de "dias perdidos" nem aviso de culpa.
4. **O app não dá diagnóstico.** Ele mostra o progresso dos registros da pessoa. Não afirma que alguém "está saudável" ou "estável financeiramente".
5. **A escolha é da pessoa.** Para onde viajar e como melhorar cada prédio são decisões dela.

O público inclui pessoas com TDAH e depressão. Antes de fechar os números, as regras passam pela revisão das skills `gamificacao-saude-etica` e `behavior-design-etico`.

## XP e créditos

| | XP | Créditos |
|---|---|---|
| Para que serve | Nível da pessoa | Moeda: paga construções, melhorias e viagens |
| Pode ser gasto | Não | Sim |
| Pode diminuir | Nunca | Só quando a pessoa gasta |

| Ação | XP | Créditos | Regra |
|---|---|---|---|
| Criar a conta | 0 | +50 | uma vez |
| Tarefa concluída | +10 | +10 | uma vez por tarefa, para sempre; só as 10 primeiras do dia pagam |
| Hábito feito | +5 | +5 | uma vez por hábito por dia; só os 8 primeiros do dia pagam |
| Passo de meta | +5 | 0 | um por meta por dia |
| Meta concluída | +50 | +25 | uma vez por meta |
| Registro do dia (lançamento, refeição, peso, reflexão) | +2 | 0 | só o primeiro de cada tipo no dia |
| Volta depois de 7 dias ou mais sem ação | 0 | +20 | uma vez por retorno |

Do nono hábito em diante, no mesmo dia, a marcação conta no anel e no histórico, sem XP nem créditos. O teto de 10 tarefas pagas por dia é proposta minha: sem ele, criar e concluir tarefas vazias renderia XP sem limite. Marcar um dia passado é permitido até 7 dias para trás, também sem XP nem créditos.

### Nível

Para subir do nível `n` para `n + 1` são precisos `100 + 50 × (n − 1)` de XP.

| Nível | XP acumulado |
|---|---|
| 2 | 100 |
| 3 | 250 |
| 5 | 700 |
| 10 | 2.700 |
| 15 | 5.950 |
| 20 | 10.450 |

Referência de ritmo: duas tarefas e quatro hábitos por dia rendem 40 de XP sem bônus. Nesse ritmo, o nível 5 chega em cerca de 18 dias.

### Domínios

Cada ganho de XP também soma no domínio da ação. O domínio usa o XP base, sem o bônus de presença, para que os prédios reflitam prática e não multiplicador.

| Domínio | O que soma | Prédio |
|---|---|---|
| `saude` | hábitos e metas de saúde, pesagens | Academia |
| `alimentacao` | refeições, hábitos e metas de alimentação | Cozinha |
| `financas` | lançamentos, hábitos e metas de finanças | Banco |
| `estudos` | hábitos e metas de estudo, materiais | Biblioteca |
| `mente` | reflexões, hábitos e metas de autoconhecimento | Jardim |
| `organizacao` | tarefas, projetos, compromissos, notas | Escritório |

Tarefas, hábitos e metas têm o campo `domain`. Se a pessoa não escolher, vale `organizacao`.

Os nomes da coluna "Prédio" são só marcadores para este documento. O app não fixa nomes: os prédios vêm da vida de cada pessoa (a academia onde ela treina, o curso que ela faz), e ela é quem nomeia. Como isso funciona na tela fica para definir. Para o banco, a consequência é que `placements` precisa de um nome dado pela pessoa (`custom_name`), além do tipo.

## Presença: ritmo da semana

Um dia é **ativo** quando a pessoa faz pelo menos uma ação real: concluir, marcar ou registrar. Só abrir o app não conta, para o app não virar um ponto a bater.

O bônus de hoje depende de quantos dos últimos 7 dias (hoje incluído) foram ativos:

| Dias ativos nos últimos 7 | XP | Créditos |
|---|---|---|
| 0 a 2 | normal | normal |
| 3 a 4 | +25% | normal |
| 5 a 6 | +50% | +10% |
| 7 | em dobro | +25% |

- Faltar um dia baixa no máximo um degrau. A janela anda, então o degrau volta com dias ativos, sem recomeçar do zero.
- O bônus vale para ganhos de ações, não para devolução de créditos ao remover uma construção.
- O calendário de presença mostra dias ativos preenchidos e os demais vazios. Não há cor de alerta nem contagem de faltas.
- O app não envia aviso do tipo "você vai perder seu bônus".
- O valor final é arredondado para baixo e gravado no `ledger` junto com o multiplicador usado, para a pessoa poder ver de onde veio.

## Mapa: uma cidade por local

O globo tem 8 locais: a Ilha Inicial e 7 monumentos (Cristo Redentor, Machu Picchu, Chichén Itzá, Coliseu, Petra, Taj Mahal, Grande Muralha). Cada local é um terreno onde a pessoa constrói uma cidade.

- **Começo.** Toda conta começa na Ilha Inicial.
- **Primeira viagem.** No nível 5, o transporte fica disponível. A pessoa escolhe qualquer um dos 7 monumentos.
- **Viagens seguintes.** Três condições, todas mostradas na tela do local bloqueado, cada uma com sua barra:

| Viagem | Nível mínimo | Prédios na cidade atual | Passagem |
|---|---|---|---|
| 1ª (saindo da Ilha) | 5 | nenhum | 100 créditos |
| 2ª | 10 | Casa + 2 prédios de domínio na etapa "estrutura" ou acima | 250 créditos |
| 3ª | 15 | Casa + 3 prédios de domínio na etapa "estrutura" ou acima | 400 créditos |
| 4ª em diante | +5 por viagem | Casa + 3 prédios, um deles concluído | +150 por viagem |

- **Nada se perde ao viajar.** As cidades anteriores continuam no globo. A pessoa pode voltar a qualquer uma, sem custo, e seguir melhorando.
- **Créditos, XP e nível são da pessoa**, não da cidade. O saldo é um só.
- **Prédios de domínio são por cidade.** O progresso do domínio (XP e semanas ativas) é da pessoa: numa cidade nova, o prédio começa do terreno, mas avança no ritmo do que ela já pratica.
- **Tamanho do terreno.** O raio liberado cresce com o nível: `3 + nível ÷ 3`, até 8.

A tela de um local bloqueado diz o que falta em linguagem direta: "Nível 10 (você está no 8)", "Banco na etapa estrutura (está na fundação)", "250 créditos (você tem 180)".

## Prédios

### Construção

Cada domínio tem um prédio. A pessoa escolhe onde colocá-lo; a partir daí ele avança sozinho, pelo uso real. Avançar exige as duas medidas juntas: XP do domínio e semanas ativas nele (semana com ao menos 3 dias de ação naquele domínio).

| Etapa | Nome | XP do domínio | Semanas ativas |
|---|---|---|---|
| 0 | Terreno | 0 | 0 |
| 1 | Fundação | 40 | 2 |
| 2 | Estrutura | 150 | 8 |
| 3 | Acabamento | 350 | 16 |
| 4 | Concluído | 600 | 26 |

As 26 semanas fazem a conclusão levar no mínimo seis meses de prática. Semanas não precisam ser seguidas: uma pausa não desfaz nada, só adia. O prédio nunca regride.

A Casa não pertence a um domínio. Ela é construída com créditos e melhora por nível.

### Evolução

Depois de concluído, o prédio ganha **pontos de melhoria**:

| Origem | Pontos |
|---|---|
| Meta curta concluída no domínio (alvo de até 30 dias) | 1 |
| A cada 100 de XP do domínio depois da conclusão | 1 |

Cada ponto abre uma escolha entre 2 ou 3 opções do catálogo daquele prédio: um equipamento, uma sala, um detalhe de fachada. A escolha é definitiva e gratuita. Opções não escolhidas voltam a aparecer depois.

Exemplo da Academia: sala de musculação, esteiras, piscina, sala de alongamento, quadra, vestiário, mural de recordes.

### Como aparece

- **Por fora:** o modelo no mapa 3D muda a cada etapa. Uma animação curta marca a mudança, na próxima vez que a pessoa abre a cidade.
- **Por dentro:** tocar no prédio abre um painel com as salas já escolhidas, os espaços vazios e o que falta para o próximo ponto ("próxima melhoria: conclua uma meta de saúde"). Cada item mostra a data e a conquista que o liberou. É o histórico da pessoa contado pelo prédio.
- **Técnica:** o interior é um painel 2D ilustrado, carregado só quando aberto. Uma cena 3D por prédio aumentaria o peso no celular.

### O que sai

Os prédios de IA do catálogo atual (ChatGPT, Claude, Gemini, Grok, StuntSync) saem. Dependiam da atividade do Fifones. Ruas, árvores e praça continuam, pagas com créditos.

## Arte necessária

| Item | Quantidade | Fase |
|---|---|---|
| Modelos de prédio por etapa | 6 prédios × 5 etapas (ou um modelo por prédio com partes que aparecem) | B6 |
| Ilustrações de interior | 6 fundos + cerca de 8 itens por prédio | B6 |
| Transporte | 1 modelo (barco ou avião) para a animação de viagem | B5 |

Os prompts para o Tripo entram em `TRIPO-PROMPTS.md` na fase B6. Até a arte existir, cada etapa usa um modelo provisório em código, como `src/world/monuments.js` faz para os monumentos.

## O que já está implementado (demonstração em produção)

O PR #8 (`codex/regional-cities`) colocou no ar uma versão simples, sem login, que já segue a ideia de uma cidade por local. Os documentos abaixo descrevem o alvo; esta seção diz onde o código de hoje está diferente.

| Tema | Hoje, em produção | Alvo deste documento |
|---|---|---|
| Cidade por local | Uma cidade por local, com terreno, construções e histórico próprios (`city.html?local=<id>`); créditos e recompensas são da pessoa, compartilhados entre as cidades | Igual |
| Escolha do destino | Qualquer local ainda bloqueado pode ser escolhido na hora de viajar | Igual |
| Condição para viajar | **Viagens fechadas por enquanto** (`TRAVEL_OPEN=false` em `wrangler.jsonc`). A regra de construir um prédio para liberar uma viagem fica suspensa. A prévia de teste abre os oito destinos em sessões isoladas | Nível mínimo + prédios na etapa certa + passagem em créditos |
| XP e nível | Não existe XP. O "nível" da cidade é `1 + recompensas ÷ 10` e define o tamanho do terreno | XP separado de créditos, nível pela curva de `shared/game/rules.js` |
| Presença | Não existe | Bônus pelo ritmo dos últimos 7 dias |
| Recompensas | Tarefa, hábito e meta concluída pagam créditos de `RULES.rewards`; teto diário por `RULES.paidHabitsPerDay` e `RULES.paidTasksPerDay` | Igual, mais XP e bônus de presença |
| Prédios de domínio | Não existem; o catálogo é o antigo (Tarefas, Agenda, Memória, Projetos, IA) | Cinco etapas por uso real e melhorias escolhidas |
| Onde ficam os dados | Durable Object com SQLite por visitante (cookie `cityou_demo`, 30 dias) | Conta com login e banco em São Paulo |

A regra de viagem de hoje é mais simples e mais fácil de entender (construa e escolha para onde ir). Proponho mantê-la como primeira fase e acrescentar nível e passagem depois, quando existirem XP e prédios de domínio. É decisão sua.

## Comprovação das atividades (anti-trapaça sem vigilância)

Créditos só valem se a pessoa estiver de fato se cuidando. O app não tem como provar isso, então o desenho é: **marcar vale sempre; comprovar rende mais.**

| | Marcar sem comprovar | Marcar com comprovação |
|---|---|---|
| O que é | O toque de hoje (como já era) | Um relato de pelo menos 20 caracteres **ou** uma foto, anexado à atividade feita |
| Recompensa | A de sempre | A de sempre **+5 créditos** |
| Teto | 8 hábitos pagos e 10 tarefas pagas por dia | No máximo **3 bônus por dia**, um por atividade |
| Quem vê | Só a pessoa | Só a pessoa (a foto não aparece para mais ninguém) |

Medidas que dificultam o abuso, todas no servidor:

- Uma foto só vale uma vez: o servidor guarda a impressão digital (SHA-256) e recusa a mesma foto em outra comprovação. Foto parecida, mas não idêntica, não é detectada.
- O dia e a hora vêm do servidor; só vale o dia de hoje.
- Foto só em JPEG ou WebP, até 250 KB, conferida pelos primeiros bytes do arquivo; o app reduz a foto no aparelho antes de enviar.
- A comprovação não dá XP nem conta para o nível: só créditos.

**Limite que precisa ficar claro:** quem quiser enganar o app consegue (uma foto qualquer, um texto inventado). A comprovação só aumenta o esforço de quem quer o bônus e põe um teto no ganho. Verificar a foto de verdade pediria um modelo de visão, com custo e questões de privacidade; não está no plano. Não há punição por não comprovar.

## Nomes dos prédios

O nome de um prédio vem da própria vida da pessoa: o **local ou atividade** que ela preenche ao criar um hábito, meta ou tarefa (campo "Local ou atividade", por exemplo "Academia Central"), na aba de organização do dia. A **área** (saúde, alimentação, finanças, estudos, mente, organização) define o tipo do prédio. O app não inventa nomes. Isso já é guardado em cada atividade; construir o prédio a partir dela é a próxima fase.

## O que veio do estudo de city builders

O estudo de Megapolis, City Island 6 e SimCity BuildIt está em `research/estudo-city-builders.md`. Ele confirmou parte do que já estava decidido e trouxe correções. O Cityou não é um jogo de moeda paga: o que vale aqui é a parte de arquitetura e de respeito ao jogador, não a de monetização.

**Já estava assim e o estudo confirma:**

- O servidor é a autoridade em XP, créditos, nível e desbloqueios. Mudar isso depois é reescrever, não remendar.
- Extrato imutável com chave única por recompensa; dinheiro em número inteiro.
- Ausência não é punida. Foi a lição central do SimCity BuildIt: a ideia de "cidade em ruínas" para quem some foi descartada.
- A espera pura não é a trava do jogo. Aqui a trava é a prática real, não um cronômetro.
- Não existem personagens gravados. Quem anda pela cidade é cenário.

**Adotado a partir do estudo:**

| Tema | O que muda |
|---|---|
| Subida de nível | Uma recompensa grande pode valer vários níveis: a regra sobe todos de uma vez e guarda a sobra de XP |
| Nível é porta | Cada nível tem uma lista do que libera (viagem, tamanho do terreno, itens do catálogo). Nível não dá poder nem multiplica ganho |
| Relógio | O servidor é o relógio. O dia vem do fuso da pessoa gravado na conta, nunca do aparelho. Mudar o fuso só vale a partir do dia seguinte e no máximo uma vez a cada 30 dias, para ninguém repetir o dia |
| Tempo parado | Nada roda com o app fechado. Etapas de prédio, semanas ativas e bônus são calculados na próxima ação ou abertura |
| Ganhar e receber | Ganhar um ponto de melhoria e escolher a melhoria são dois momentos separados. O ponto não some se a pessoa fechar o app |
| Extrato | Cada linha guarda o motivo (`task`, `habit`, `build`, `travel`…), a referência e o saldo depois. É o que permite ver de onde os créditos vêm e para onde vão |
| Casa "minha" | Cada construção sorteia a variação visual uma vez e nunca mais muda |
| Colocar um prédio | Onde não pode construir, a tela diz o motivo e oferece a ação ("Precisa de rua", "Terreno ainda não liberado: nível 6"). Vermelho sem explicação é o erro mais comum do gênero |
| Mesma regra nos dois lados | A validação de onde construir é escrita uma vez e roda na tela (pré-visualização) e no servidor (decisão). Idem para as regras de XP |
| Terreno | Cada local tem um mapa fixo de células: água, montanha, área reservada. A Ilha tem mar em volta; cada monumento tem a sua área própria onde não se constrói |
| Repetição pela rede | Toda ação leva um identificador gerado no aparelho. Reenviar a mesma ação devolve a mesma resposta, sem pagar nem cobrar de novo |
| Abuso | Teto diário de tarefas pagas; remover e reconstruir não rende nada (devolve metade); concluir de novo uma tarefa reaberta não paga |

**Visto e deixado de fora, de propósito:** moeda paga, baús, passe de temporada, aceleração de obra por pagamento, ranking e eventos com economia própria. São mecânicas de receita e de retenção por pressão, que não combinam com um app de organização para um público vulnerável. Missões diárias também ficam de fora por enquanto: as tarefas, hábitos e metas da própria pessoa já são as missões.

O estudo cita um protótipo (`demo-city-builder.html`) que não veio junto com o arquivo.

## Depende de você

1. Os números deste documento: nível da primeira viagem, custos, degraus do bônus, limites de etapa.
2. Como a pessoa cria e nomeia os próprios prédios (decidido que os nomes não são nossos; falta o desenho).
3. O transporte: barco, avião ou outro.

Já decidido: o mapa fica com a Ilha e 7 monumentos.

# Prompting para o Claude Fable 5.2

> **Só informativo.** Cópia, guardada a pedido do dono (13/11/2026), de um documento da própria Anthropic. Fonte: https://platform.claude.com/docs/pt-BR/build-with-claude/prompt-engineering/prompting-claude-fable-5-2
> Não decide nada neste repositório: o `CLAUDE.md` e o `docs/CHECKPOINT.md` mandam. Os modelos e as opções de API mudam rápido; confira a página original antes de depender de um número ou de um cabeçalho beta. Como usar no Cityou: o orquestrador e os executores (`.claude/agents/`) podem tirar daqui o esforço (`effort`), o texto de "conclua a tarefa inteira", de subagentes e de relatórios.

Padrões de prompting específicos do Claude Fable 5.2 e do Claude Mythos 5.2: esforço, parada antecipada, aprovações, propriedade do código, atualizações de progresso, subagentes, cautela que se acumula, prompts e harnesses projetados para modelos anteriores, relatórios finais e recusas.

Este guia aborda os padrões de prompting específicos do Claude Fable 5.2. Para as capacidades do modelo e as mudanças na API, consulte [Novidades do Claude Fable 5.2](https://platform.claude.com/docs/pt-BR/models/fable-5-2/whats-new-fable-5-2) e o [guia de migração para o Claude Fable 5.2 e o Claude Mythos 5.2](https://platform.claude.com/docs/pt-BR/models/fable-5-2/migration-guide). Para técnicas que se aplicam a todos os modelos Claude atuais, consulte [Melhores práticas de prompting](https://platform.claude.com/docs/pt-BR/build-with-claude/prompt-engineering/claude-prompting-best-practices).

O Claude Fable 5.2 se comporta de forma diferente dos modelos anteriores em vários aspectos. Comece pela seção que corresponde ao que você observa:

* Você não sabe qual nível de esforço usar, ou solicitações fáceis demoram a começar: [Calibre o esforço](#calibre-o-esforço)
* Um turno termina antes de o trabalho estar concluído: [Conclua a tarefa inteira](#conclua-a-tarefa-inteira)
* Um agente de programação copia código existente, ou relata problemas e os deixa sem corrigir: [Diga a quem pertence o código](#diga-a-quem-pertence-o-código)
* Turnos agênticos longos parecem silenciosos: [Mantenha os usuários informados durante turnos longos](#mantenha-os-usuários-informados-durante-turnos-longos)
* Sessões de agentes iniciam mais subagentes do que a tarefa precisa: [Defina expectativas para subagentes](#defina-expectativas-para-subagentes)
* Agentes pedem aprovações de que não precisam, ou deixam de fazer trabalho rotineiro: [Evite que a cautela se acumule](#evite-que-a-cautela-se-acumule)
* Seu prompt do sistema, skills ou harness foram escritos para o Claude Fable 5.1 ou o Claude Opus 5.5: [Revise prompts e harnesses projetados para modelos anteriores](#revise-prompts-e-harnesses-projetados-para-modelos-anteriores)
* Seus usuários leem relatórios finais ou passagens de trabalho após tarefas longas: [Torne os relatórios fáceis de acompanhar](#torne-os-relatórios-fáceis-de-acompanhar)
* Solicitações retornam `stop_reason: "refusal"`: [Recusas de salvaguarda](#recusas-de-salvaguarda)

> **Nota.** Para a ordem em que aplicar estas orientações ao migrar, consulte [Por onde começar](#por-onde-começar).
>
> Várias seções desta página sugerem texto para adicionar ao seu prompt do sistema ou alterações na descrição de uma ferramenta. Algumas também sugerem linhas para remover do prompt do sistema ou das notas e regras que seus agentes carregam. Faça essas alterações apenas em conversas novas. No Claude Fable 5.2, uma solicitação que falha na [verificação de prefixo](https://platform.claude.com/docs/pt-BR/build-with-claude/preserved-thinking/prefix-checks#prefix-check) recebe um [erro 400](https://platform.claude.com/docs/pt-BR/api/errors#thinking-block-conversation-mismatch). Se você retomar uma conversa armazenada depois de alterar `system`, `tools` ou uma mensagem anterior, a solicitação pode falhar na verificação de prefixo. Para alterar instruções no meio de uma conversa, [coloque-as no turno mais recente](https://platform.claude.com/docs/pt-BR/build-with-claude/preserved-thinking/change-tools-or-instructions#changing-context). Onde [mensagens de sistema no meio da conversa](https://platform.claude.com/docs/pt-BR/build-with-claude/mid-conversation-system-messages) estiverem disponíveis, você pode, em vez disso, [anexar uma mensagem de sistema à conversa](https://platform.claude.com/docs/pt-BR/build-with-claude/preserved-thinking/change-tools-or-instructions#new-instructions).

## Calibre o esforço

Com o Claude Fable 5.2, o nível de [esforço](https://platform.claude.com/docs/pt-BR/build-with-claude/effort) define o quanto o modelo pensa, quantas chamadas de ferramenta ele faz, quanto tempo um turno leva e quantos tokens ele usa. Ajuste o nível de esforço junto com o seu prompt.

Comece em `high`, o padrão para o Claude Fable 5.2 na Claude API. Dependendo do caso de uso, você pode aumentar ou diminuir o esforço, testando com suas próprias avaliações. Os níveis de esforço seguem a mesma ordem entre os modelos Claude, mas a quantidade de pensamento em cada nível pode variar. Portanto, refaça sua varredura de esforço em vez de reaproveitar uma configuração que você ajustou no Claude Fable 5.1 ou no Claude Opus 5.5.

* `low` é adequado para interações rápidas, tarefas bem especificadas e cargas de trabalho de alto volume (subagentes inteligentes e rápidos, por exemplo). Em avaliações de programação, o Claude Fable 5.2 tem desempenho melhor do que modelos anteriores no esforço `low`. Nos testes da Anthropic, ele pontuou perto do que o Claude Fable 5.1 alcançou em esforços mais altos.
* `medium` é adequado para programação interativa, chat e trabalho de conhecimento do dia a dia.
* `high` é adequado para programação difícil, pesquisa, trabalho agêntico e execuções longas sem supervisão. Os turnos levam visivelmente mais tempo para terminar do que em `medium`.
* `xhigh` é para seu trabalho de programação e agêntico de longa duração mais difícil, em que você mediu um ganho. Ele aumentou ligeiramente as pontuações nas avaliações internas de programação da Anthropic e usou muito mais tokens.
* `max` é para medir o limite máximo do modelo ou para a tarefa rara em que tempo e tokens não importam. O mais razoável é usar `max` para problemas em aberto, como descoberta científica e matemática. Os turnos são lentos e usam muito mais tokens do que em `xhigh`.

Você obtém a maior parte do ganho em capacidade ao usar o esforço `high`. A passagem de `medium` para `high` aumentou as pontuações na maioria das avaliações de programação e de trabalho de conhecimento que a Anthropic acompanha. Essa passagem também usa mais tokens e mais tempo, então desça para `medium` sempre que suas avaliações se mantiverem. Acima de `high`, os ganhos são irregulares e dependem da tarefa.

Para trabalho agêntico em `low` ou `medium`, adicione o texto em [Conclua a tarefa inteira](#conclua-a-tarefa-inteira). O modelo tem mais probabilidade de parar cedo em níveis de esforço mais baixos.

Em `high` e acima, o modelo pensa antes de quase toda resposta, incluindo a resposta a uma saudação. Se você perceber que solicitações básicas estão demorando ou custando mais, use um esforço mais baixo para esses turnos. Nos testes da Anthropic, uma instrução para responder diretamente sem deliberar não impediu o modelo de pensar em `medium` e acima.

O esforço tem pouco efeito no tamanho das respostas do turno do assistente. Use o prompting para alterar o tamanho e o tom das respostas.

Você também pode combinar níveis em um mesmo fluxo de trabalho. Por exemplo, você pode planejar e iterar com o modelo em `medium` e depois aumentar o esforço para a parte longa e sem supervisão. Para mudar de nível dentro de uma conversa e manter o cache do prompt, use [Esforço por mensagem](https://platform.claude.com/docs/pt-BR/build-with-claude/effort-per-message) (beta, cabeçalho `mid-conversation-output-config-2026-07-01`). Essa página lista as plataformas em que ele está disponível. Uma alteração permanece válida até que outra a substitua. Onde o esforço por mensagem não estiver disponível, defina um novo valor de `effort` de nível superior na próxima solicitação, o que pode invalidar as mensagens em cache.

## Conclua a tarefa inteira

Em tarefas longas e com várias etapas, o Claude Fable 5.2 às vezes encerra um turno antes de o trabalho estar concluído. Ele pode encerrar o turno listando o que falta fazer, oferecendo-se para continuar ou parando diante de um obstáculo comum, como um timeout. Isso acontece com mais frequência nos esforços `low` e `medium`.

Se você observar essas paradas no seu agente, adicione um texto como este ao seu “system prompt” (prompt do sistema):

```text
# Finishing work
Please avoid stopping while you still owe work the user asked for. Be persistent and do not stop unless needed.

While status notes are welcome, as is clarifying with the user on open decisions, carry on with work that does not depend on the user's answer without unnecessary stops.

If you notice yourself inviting the user to redirect you or offering to wait, instead proceed on the next part of the task. You may meet ordinary obstacles like errors, timeouts, locked files, empty results or failing tools. Diagnose them first, and when they are not real blockers, work through them with the access you have (wait and retry, fix the request, use another tool or source) rather than stopping unnecessarily.

If someone clearly decided something is a hard blocker, such as a file marked not to be touched, access that was intentionally withheld, or a safety guardrail, leave it alone, say plainly what you found, and look for another safe way to finish the task. Stopping before the task is complete is very rarely merited, as in when the task can't move forward without user input, or where the blocker is deliberate and should not be worked past. This does not override the need for confirmation on risky or destructive actions.
```

Este prompt diz ao Claude que obstáculos comuns, como erros, timeouts e ferramentas com falha, devem ser diagnosticados e contornados. Bloqueios deliberados, como um arquivo marcado para não ser alterado, devem ser deixados de lado e relatados. Trate isso como um ponto de partida e adapte ainda mais o prompt ao seu caso de uso.

Nos testes, a Anthropic reproduziu sessões gravadas de um produto de programação agêntica em `medium`. Com uma versão deste texto, o número de sessões que terminaram com trabalho inacabado que poderia ter sido continuado caiu para cerca da metade do que era. Ele eliminou a maioria dos finais que pedem permissão ou se oferecem para continuar, mas não os finais que listam o que resta e depois param. Os tokens de saída aumentaram cerca de 30 por cento.

Como o modelo pergunta com menos frequência com esse texto, mantenha sua própria etapa de confirmação para ações arriscadas ou irreversíveis.

### Aprovações

Quando você pedir ao modelo para continuar, diga exatamente o que você quer em vez de enviar um simples “continue”. Por exemplo, responda “Sim, execute a migração no banco de dados de staging” onde você talvez enviasse um “vai” ou um joinha.

Se você também escrever regras de aprovação no seu prompt do sistema, seja específico sobre as ações que você quer que sejam verificadas duas vezes. Nos testes da Anthropic em tarefas simuladas em que não havia ninguém para aprovar, uma regra que listava “enviar mensagens para pessoas fora desta conversa” entre as etapas que exigem aprovação levou o modelo a deixar de fazer cerca de metade de suas solicitações rotineiras a colegas e outras equipes.

## Diga a quem pertence o código

O Claude Fable 5.2 presta muita atenção a quem pertence o código em que trabalha. Nos testes da Anthropic em pequenas tarefas de programação, o modelo tendia a acrescentar à estrutura existente quando o prompt não dizia nada sobre propriedade ou apresentava a base de código como sendo de outra pessoa, mesmo quando isso duplicava código existente. Quando o prompt dizia que a base de código era do próprio modelo, ele frequentemente consolidava código duplicado e às vezes fazia correções relacionadas sem que ninguém pedisse.

Se você quiser que o modelo melhore a estrutura enquanto trabalha, diga que o código é dele:

```text
You are the owner and long-term maintainer of this codebase, and its design is up to you.
```

A frase sobre propriedade torna o modelo muito mais propenso a consolidar código duplicado em uma única função compartilhada. Nos testes da Anthropic em pequenas tarefas de programação, o modelo consolidou código duplicado em menos de 10 por cento das execuções sem a frase e em cerca de 75 por cento das execuções com ela.

Com este prompt, os tokens de saída aumentaram cerca de 70 a 80 por cento e o modelo fez alterações que ninguém havia pedido, muitas delas novos testes e documentação. Em algumas execuções, ele também alterou o comportamento de um recurso existente. Um resumo final de PR do Claude Fable 5.2 frequentemente omitia pequenas alterações, então revise o diff relatado e o resumo.

Deixe de fora a frase sobre propriedade quando o usuário é o dono do código e quer que ele seja alterado o mínimo possível. Uma regra que limita o escopo não a anula. Nos testes da Anthropic, o modelo ainda assim consolidou código duplicado em mais da metade das execuções quando “No drive-by refactors, renames or cleanups” aparecia em um ponto anterior do mesmo prompt.

## Mantenha os usuários informados durante turnos longos

Às vezes, o Claude Fable 5.2 escreve pouco texto voltado ao usuário durante longas sequências de chamadas de ferramenta. Além disso, o modelo pode fazer sua primeira chamada de ferramenta sem dizer o que está prestes a fazer.

Primeiro, verifique se o seu cliente recebe as atualizações do modelo. No Claude Fable 5.2, as atualizações que o modelo escreve entre chamadas de ferramenta retornam como [blocos `thinking` de atualização de progresso](https://platform.claude.com/docs/pt-BR/build-with-claude/thinking#progress-updates). Essas atualizações dizem o que o modelo encontrou e o que fará em seguida. Seu texto fica vazio com o valor padrão `"omitted"` de `thinking.display`. Assim, um cliente que renderiza apenas blocos `text` pode parecer silencioso durante um turno agêntico longo. Defina `display: "updates"` (beta, cabeçalho `thinking-display-updates-2026-08-18`) para receber um resumo curto de cada atualização, ou `"summarized"` para receber as atualizações junto com o raciocínio resumido. Em seguida, renderize os blocos `thinking` não vazios entre as chamadas de ferramenta.

Atualizações frequentes importam mais em contextos interativos. Se esse for o seu caso de uso, experimente o seguinte:

### Modifique seu harness

Uma forma eficaz de incentivar a comunicação é contar as etapas consecutivas de chamada de ferramenta que não dão ao usuário nada para ler: nenhum bloco `text` e nenhum bloco `thinking` com texto. Faça a contagem com `display` definido como `"updates"` ou `"summarized"`, porque em `"omitted"` todo bloco `thinking` fica vazio. Essa opção funciona onde sua plataforma oferecer suporte a [mensagens de sistema no meio da conversa](https://platform.claude.com/docs/pt-BR/build-with-claude/mid-conversation-system-messages). Quando várias dessas etapas ocorrerem seguidas, você pode anexar este lembrete após os resultados de ferramenta mais recentes como uma [mensagem de sistema com escopo de turno](https://platform.claude.com/docs/pt-BR/build-with-claude/mid-conversation-system-messages#turn-scoped-system-messages) (`clear_at: "next_user_message"`, beta, cabeçalho `mid-conversation-system-clear-at-2026-08-21`):

```text
The user hasn't heard from you in a while: say in a few words what you're doing, then continue.
```

Nos testes da Anthropic em tarefas de programação com vários turnos, o lembrete reduziu aproximadamente pela metade o trecho silencioso mais longo, sem aumento perceptível de tokens ou tempo.

Mantenha cada lembrete em `messages` nas solicitações seguintes. Remover ou reescrever um deles edita um turno anterior, o que invalida os blocos de pensamento posteriores a ele. Consulte [Envie um lembrete para um turno](https://platform.claude.com/docs/pt-BR/build-with-claude/preserved-thinking/change-tools-or-instructions#per-turn-reminders).

### Sinalize a intenção

Para receber uma linha de abertura antes da primeira chamada de ferramenta, atualizações breves e uma recapitulação final, você também pode adicionar este texto ao seu prompt do sistema:

```text
Before you start, say in a line what you're about to do; brief updates while you work help the user follow along. Close with a short recap that stands on its own (what you found, what you did, and what's next), so a reader who only sees the last message has the full picture.
```

Com esse texto, o modelo escreveu uma mensagem antes de sua primeira chamada de ferramenta em todas as execuções das tarefas de programação. Observe que, como resultado, os tokens de saída por tarefa aumentaram cerca de 20 por cento.

Use esse texto quando houver um humano diretamente no ciclo. Para aumentar as atualizações interativas, use esse texto junto com o lembrete anterior.

### Atualize as instruções do prompt do sistema

Se você não puder adicionar o lembrete no seu harness, ou se sua plataforma não tiver mensagens de sistema no meio da conversa, adicione esta frase ao seu prompt do sistema em vez disso:

```text
Every few tool calls, give the user a one-line update on where things stand.
```

Nos testes da Anthropic, essa frase eliminou a maioria dos longos trechos silenciosos em tarefas de automação de fluxos de trabalho. Espere sequências de várias chamadas de ferramenta entre as atualizações mesmo quando você usar o lembrete junto com o texto de abertura e recapitulação. O Claude Fable 5.2 funciona bem em tarefas assíncronas de longa duração, então a Anthropic recomenda o modelo para trabalhos em que ninguém precisa de atualizações frequentes.

## Defina expectativas para subagentes

O quanto o Claude Fable 5.2 delega depende do seu harness e das suas tarefas. Nos testes da Anthropic em tarefas curtas com uma ferramenta mínima de “subagent” (subagente), ele raramente iniciou um subagente. Em um produto de programação agêntica cujos prompts incentivam a delegação, ele delegou prontamente.

Em níveis de esforço mais altos, como `xhigh` e `max`, a Anthropic observou o Claude Fable 5.2 usar subagentes em um produto de programação agêntica para revisar o próprio trabalho, o que o Claude Fable 5.1 não fez nas mesmas tarefas.

Os primeiros testadores obtiveram bons resultados com o Claude Fable 5.2 como planejador e orquestrador de outros modelos. A delegação pode acelerar trabalhos que funcionam bem em paralelo. No entanto, os subagentes podem responder por uma grande parte do custo de uma sessão, então verifique qual modelo seus subagentes usam por padrão.

Altere a descrição da sua ferramenta de subagente somente se o Claude Fable 5.2 iniciar mais subagentes do que suas tarefas precisam. Uma nova descrição é mais útil em um harness que já incentiva a delegação e em que os subagentes representam uma grande parte do seu uso de tokens. Se a sua ferramenta de subagente tiver uma descrição simples e nada mais nos seus prompts pedir delegação, você provavelmente não precisa de uma. Se o seu prompt do sistema, skills ou arquivos de agente disserem ao modelo para delegar, revise essas linhas primeiro.

Na nova descrição da ferramenta, declare o que um subagente acrescenta ao custo de uma sessão, diga quando a delegação vale a pena e quando não vale, e diga ao modelo como instruir um subagente que ele iniciar.

Se o modelo delegar demais, fale mais sobre o que um subagente custa no seu harness e teste a alteração. Nos testes da Anthropic no esforço `high`, uma descrição mais longa focada nisso reduziu aproximadamente pela metade o número de subagentes em comparação com uma versão mais curta.

Adapte sua descrição aos seus requisitos e ajuste quando ela diz ao modelo para delegar.

## Evite que a cautela se acumule

Instruções cautelosas podem se acumular a partir de sessões anteriores por meio de memória, notas e arquivos de instruções. Isso pode ser contraproducente quando o Claude Fable 5.2 segue as instruções de perto e pede aprovações desnecessárias. Nos primeiros testes, a Anthropic observou isso principalmente quando vários agentes trabalhavam juntos.

Se você observar isso, remova instruções desatualizadas do contexto do seu agente:

* **Remova notas de que você não precisa mais.** A memória pode conter instruções antigas, como “nunca tente novamente”, que o modelo continua seguindo, então exclua essas instruções assim que deixarem de ser relevantes.
* **Nomeie as etapas que não precisam de aprovação.** Dizer ao modelo para agir com mais liberdade é vago demais, então liste as etapas rotineiras que ele pode executar por conta própria.
* **Verifique suas etapas de validação.** Uma condição como “pare e revise no primeiro erro” pode bloquear o trabalho autônomo, então remova ou restrinja as condições de parada de que você não precisa.
* **Seja explícito sobre exceções.** O modelo trata uma instrução que contém “nunca” como absoluta. Por exemplo, escreva “peça aprovação antes de excluir arquivos” em vez de “nunca exclua arquivos” se você quiser que o modelo mantenha a responsabilidade sobre uma ação. Consulte [Aprovações](#aprovações).

Mantenha sua própria etapa de confirmação para ações arriscadas ou irreversíveis.

## Revise prompts e harnesses projetados para modelos anteriores

Ao migrar para o Claude Fable 5.2, revise seus prompts e harnesses. Nos testes da Anthropic, algumas instruções e intervenções projetadas para modelos anteriores aumentaram o custo, causaram efeitos colaterais ou deixaram de ter efeito. Estas são as práticas a reconsiderar:

* **Instruções permanentes para delegar:** Linhas que dizem ao modelo para delegar podem estar em prompts do sistema, skills e arquivos de agente. Leia esses arquivos antes de migrar e remova as linhas de que você não precisa mais se o modelo delegar demais nos testes. Consulte [Defina expectativas para subagentes](#defina-expectativas-para-subagentes).
* **Um orçamento de tokens mostrado ao modelo:** Alguns harnesses mostram ao modelo um orçamento de tokens para a tarefa e quanto dele resta. O tamanho desse orçamento altera o quanto o Claude Fable 5.2 gasta. Nos testes da Anthropic em tarefas de programação nos esforços `high` e `xhigh`, remover um orçamento grande reduziu o custo, com desempenho equivalente. Teste suas tarefas sem ele. Essa constatação se refere a texto no prompt, não aos [orçamentos de tarefa](https://platform.claude.com/docs/pt-BR/build-with-claude/task-budgets) da API, um recurso beta que os testes não abordaram.
* **Código do harness que edita turnos anteriores:** O Claude Fable 5.2 usa [pensamento preservado](https://platform.claude.com/docs/pt-BR/build-with-claude/preserved-thinking). Se o seu harness alterar o prompt do sistema, as ferramentas ou uma mensagem anterior entre solicitações, os blocos de pensamento que vêm depois do ponto alterado no histórico se tornam inválidos. Por padrão, a Messages API então rejeita a solicitação, e a Message Batches API descarta esses blocos. Para encurtar o histórico sem esse erro, use [edição de contexto](https://platform.claude.com/docs/pt-BR/build-with-claude/context-editing) ou uma [compactação](https://platform.claude.com/docs/pt-BR/build-with-claude/compaction) que não mantenha turnos anteriores após o resumo. Para que a Messages API também descarte os blocos, defina `thinking.block_binding.prefix_mismatch_behavior` como `"drop_block"` (beta, cabeçalho `thinking-binding-controls-2026-08-01`). Nos testes da Anthropic, quando o pensamento anterior era descartado em todos os turnos, o modelo pensava novamente e usava mais tokens de saída. Esse é o pior caso, e o aumento depende da frequência com que seu harness edita turnos anteriores. Exceto pela compactação e pela edição de contexto, mantenha o histórico somente com acréscimos. Isso mantém alta a taxa de acertos do cache, e nenhum pensamento é descartado. Meça os tokens de saída nas suas próprias tarefas antes de depender de `"drop_block"`. Consulte [Defina `prefix_mismatch_behavior`](https://platform.claude.com/docs/pt-BR/build-with-claude/preserved-thinking/prefix-checks#mismatch-behavior) e [Altere ferramentas ou instruções sem falhar na verificação de prefixo](https://platform.claude.com/docs/pt-BR/build-with-claude/preserved-thinking/change-tools-or-instructions).
* **As linhas de “trate essa resposta como concluída”:** [Prompting para o Claude Opus 5.5](https://platform.claude.com/docs/pt-BR/build-with-claude/prompt-engineering/prompting-claude-opus-5-5#thinking-instructions-in-chat-system-prompts) oferece duas frases para prompts do sistema de chat. Elas dizem ao modelo para tratar uma resposta anterior como concluída e para concentrar seu pensamento na nova mensagem. Nos testes da Anthropic no esforço `high`, essas instruções reduziram o pensamento do Claude Fable 5.2 em perguntas de acompanhamento. O modelo também ficou muito menos propenso a apontar erros em suas respostas anteriores. Omita essas linhas quando quiser que o modelo continue reexaminando suas respostas anteriores. Nos demais casos, teste se o modelo ainda aponta os próprios erros antes de adotar as linhas.
* **Instruções para pensar menos:** O Claude Fable 5.1 geralmente seguia uma linha como “responda diretamente sem deliberar”. No Claude Fable 5.2, esse acréscimo não impede o modelo de pensar em `medium` e acima. Remova essas linhas e reduza o nível de esforço, conforme descrito em [Calibre o esforço](#calibre-o-esforço).
* **Regras de estilo de escrita:** O Claude Fable 5.2 as segue de perto, então um limite rígido como “uma instrução por frase, em 20 palavras ou menos” pode deixar sua prosa truncada. Remova as regras de que você não precisa mais antes de adicionar o texto em [Torne os relatórios fáceis de acompanhar](#torne-os-relatórios-fáceis-de-acompanhar).
* **Regras, notas e memórias que se acumularam:** Arquivos de memória, notas e arquivos de instruções acumulam cautelas ao longo do tempo, e o próprio modelo pode ter escrito algumas delas. Antes de migrar, exclua as cautelas cujo motivo não se aplica mais e reescreva regras absolutas com seu escopo e seu motivo. Se um sistema já estiver travado, considere reiniciá-lo com a memória e as notas enxugadas. Consulte [Evite que a cautela se acumule](#evite-que-a-cautela-se-acumule).

## Torne os relatórios fáceis de acompanhar

Os primeiros testadores avaliaram a escrita do Claude Fable 5.2 acima da do Claude Fable 5.1 e com clareza semelhante à do Claude Opus 5.5. Após um trabalho agêntico longo, no entanto, as pessoas que leem o relatório final do Claude Fable 5.2 geralmente não viram as chamadas de ferramenta nem os arquivos por trás dele, então o relatório precisa fazer sentido por si só.

Se você pedir ao Claude Fable 5.2 para escrever relatórios finais ou passagens de trabalho, adicione este texto ao seu prompt do sistema e ajuste-o aos seus leitores e ao seu produto:

```text
# Communicating clearly
Write for an intelligent but low-context reader. The person reading has not seen your tool calls, your reasoning or the files you opened, and may be switching in from other work. Messages should generally be self-contained: the reader should understand what you mean without having to dig for other context. Put the key points in the first few sentences. Practice progressive disclosure in your sentence order, and do not use undefined references and ideas in line 1 that won't make sense until the reader reaches line 12.

Use plain words, and write in clear, understandable full sentences. Do not use a term or abbreviation that you made up during the work. Say what the thing is in a way any reader would understand. Write mostly in the style of ASD-STE100 Simplified Technical English: short sentences, one idea per sentence, active voice, and consistently using the same word for the same thing. Use a paragraph of flowing prose where ideas connect, and keep bullets for lists of separate items. Leave out unnecessary details unless the reader asks and practice concision, but do ensure that your messages have the key context. Aim to make your user-facing text as human-readable and clear as possible.
```

Nos testes da Anthropic em tarefas agênticas, o texto tornou os relatórios finais menos densos e reduziu o número de ponto e vírgula. Ele também encurtou as frases em tarefas de automação de fluxos de trabalho. Dependendo do seu caso de uso, você pode querer adicionar instruções sobre o tamanho ou pedir ao modelo que inclua detalhes específicos.

## Recusas de salvaguarda

O Claude Fable 5.2 executa classificadores de segurança que podem recusar uma solicitação. Uma solicitação recusada retorna `stop_reason: "refusal"`, e `stop_details.category` indica a [categoria da recusa](https://platform.claude.com/docs/pt-BR/build-with-claude/refusals-and-fallback#refusal-response):

* `cyber`: a solicitação pode possibilitar danos cibernéticos, como desenvolvimento de malware ou exploits.
* `bio`: a solicitação pode possibilitar danos biológicos, como métodos de laboratório perigosos.
* `frontier_llm`: a solicitação pode ajudar no desenvolvimento de modelos de IA concorrentes.
* `reasoning_extraction`: a solicitação pede ao modelo que reproduza seu raciocínio interno no texto da resposta.
* `general_harms`: a solicitação se enquadra em outra área da política de uso.
* `null`: a recusa não corresponde a uma categoria nomeada.

Trabalhos benignos de cibersegurança e ciências da vida também podem acionar os classificadores `cyber` e `bio`. Se isso bloquear o trabalho legítimo da sua organização, consulte o [Cyber Verification Program](https://support.claude.com/en/articles/14604842) e o [Life Sciences Verification Program](https://www.anthropic.com/news/life-sciences-verification-program) da Anthropic. O [Claude Mythos 5.2](https://platform.claude.com/docs/pt-BR/models/mythos-5-2/overview) oferece as mesmas capacidades do Claude Fable 5.2 apenas para organizações verificadas por meio desses programas.

Se seus prompts, skills ou descrições de ferramentas pedirem ao modelo que escreva seu raciocínio na resposta, remova essas instruções. Para ver como o modelo raciocinou, defina `display: "summarized"` e leia os blocos de pensamento. Consulte [Mantenha o raciocínio nos blocos de pensamento](https://platform.claude.com/docs/pt-BR/build-with-claude/refusals-and-fallback#keep-reasoning-in-thinking-blocks).

Para tentar novamente uma solicitação recusada em outro modelo, consulte [Recusas, fallback e cobrança](https://platform.claude.com/docs/pt-BR/models/fable-5-2/whats-new-fable-5-2#refusals-fallback-and-billing).

## Por onde começar

1. Defina `effort` como `high` explicitamente e, em seguida, execute suas avaliações também em `medium` e `xhigh`.
2. Leia os prompts do sistema, skills, arquivos de agente, arquivos de memória, notas e textos de harness que você reaproveita, e remova ou teste o que [Revise prompts e harnesses projetados para modelos anteriores](#revise-prompts-e-harnesses-projetados-para-modelos-anteriores) descreve.
3. Execute suas tarefas agênticas mais longas e observe onde o modelo para cedo, pede aprovações de que não precisa, fica em silêncio, delega mais do que a tarefa precisa ou acrescenta ao código existente quando você queria que ele fosse reestruturado.
4. Adicione o texto ou siga as orientações para cada comportamento que você observou, uma de cada vez, e meça o efeito e o custo em tokens nas suas próprias tarefas.

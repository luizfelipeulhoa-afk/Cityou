# Ideia: base calórica na aba Alimentação (proposta do dono, 13/11/2026)

Status: **ideia, sem decisão**. Este documento guarda o pedido e a pesquisa com estudos reais. Para virar código, vai para o plano (`docs/PLANO-PROXIMOS-PASSOS.md`) e precisa de OK do dono.

Regra de fontes (pedido do dono, 14/11/2026): **estudos de verdade**, nunca Wikipedia ou sites de divulgação como base. Cada fonte abaixo está marcada com o tipo: artigo original, revisão ou metanálise, diretriz, relatório oficial ou tabela de dados. Onde não achamos estudo, a lacuna aparece como pergunta, não como número.

## O que é
- A aba Alimentação mostra uma **base calórica**: quanto a pessoa precisa consumir por dia para chegar à meta dela.
- Não é dieta nem prescrição. É uma **sugestão baseada em estudos**, com as fontes ao lado.
- Usa altura, peso, idade, sexo, nível de atividade e meta.

## Metas possíveis
- Ganhar massa muscular.
- Perder gordura.
- Manter o peso.

## Princípios e limites
- Não somos nutricionistas: o texto diz "sugestão", nunca "seu plano".
- Nunca sugerir ingestão abaixo da taxa metabólica basal (TMB). Piso fixo, sem exceção.
- Sem metas extremas nem ritmo de perda agressivo. Se o ritmo sair do esperado, o app recomenda procurar um profissional, não ajusta sozinho para baixo.
- Triagem de transtorno alimentar antes do cálculo, com o SCOFF (Morgan et al. 1999; Luck et al. 2002): duas ou mais respostas "sim" indicam possível caso. Nesse caso a tela deixa de mostrar números e oferece apoio e encaminhamento.
- Nenhuma recompensa em moedas por cumprir a meta calórica (regra de gamificação ética do projeto).
- Os números não viram cobrança: sem "você ficou acima", sem sequência quebrada.

## Como calcular (proposta)

**1. Taxa metabólica basal (TMB)**
- Equação de Mifflin et al. 1990 (*AJCN*, DOI 10.1093/ajcn/51.2.241, artigo original). Homens: 10 × peso + 6,25 × altura − 5 × idade + 5. Mulheres: o mesmo com −161 no lugar de +5. Harris-Benedict superestimava em cerca de 5%.
- Escolha da equação: Frankenfield et al. 2005 (*JADA*, DOI 10.1016/j.jada.2005.02.005, comparação de quatro equações): Mifflin acertou mais indivíduos, dentro de 10%. A amostra tinha pouca representação de grupos minoritários.
- Brasil, indivíduos eutróficos: Krüger et al. 2015 (*Revista Brasileira de Cineantropometria e Desempenho Humano* 17(1):73–81, artigo original): Mifflin ficou mais perto da calorimetria (−9,1% em obesos, 0,9% em eutróficos), mas a amostra foi de 40 homens de 18 a 30 anos.
- Brasil, obesos grau 1: Lopes et al. 2010 (*Revista Brasileira de Atividade Física & Saúde* 15(4), artigo original, calorimetria indireta, 26 a 30 adultos em Porto Alegre). **Todas** as equações testadas superestimaram a TMB em cerca de 16% a 22%, e nenhuma foi considerada adequada para esse grupo. Henry & Rees ficou mais perto (−17,7%). Mifflin não foi testada nesse estudo. Conclusão: para pessoas com obesidade, a estimativa tem erro grande e isso deve aparecer no texto.
- Atletas: O'Neill et al. 2023 (*Sports Medicine* 53(12):2373–2398, revisão sistemática com metanálise): Ten-Haaf teve a maior precisão (80,2% dentro de ±10%); as demais, entre 40,7% e 63,7%. Mifflin não é a melhor para atletas.
- Equação populacional brasileira: Cadernos de Saúde Pública 2015 (31(4):777–786, estudo de base populacional em Niterói, 1.726 adultos). A equação brasileira deu TMB cerca de 19% a 21% menor que a de Schofield. Os autores preferem a equação brasileira por ter sido desenvolvida na mesma população, mas **a validação não é mostrada nesse artigo**. Fica como candidata a estudar, não como padrão.

**2. Gasto total (TEE)**
- Relatório NASEM 2023 (*Dietary Reference Intakes for Energy*, relatório oficial de consenso, baseado em água duplamente marcada, o padrão de referência para gasto em vida livre). Traz equações de gasto total por categoria de atividade (PAL) e as faixas de categoria:
  - inativo: PAL 1,00 a 1,53;
  - pouco ativo: PAL 1,53 a 1,68;
  - ativo: PAL 1,68 a 1,85;
  - muito ativo: PAL 1,85 a 2,50.
- Exemplo, homem adulto inativo: TEE = 753,07 − 10,83 × idade + 6,50 × altura + 14,10 × peso. As equações por categoria estão no relatório (tabela 5-5). O erro médio absoluto das equações de adultos é cerca de 9% (homens) e 8,7% (mulheres).
- Substitui os fatores clássicos de 1,2 a 1,9, que não encontramos em estudo original confirmado.

**3. Base para a meta**
- **Manter o peso:** o próprio gasto total.
- **Perder gordura:** déficit de **500 a 750 kcal/dia**, pela diretriz AHA/ACC/TOS (Jensen et al. 2014, *Circulation*, DOI 10.1161/01.cir.0000437739.71477.ee). A mesma diretriz cita 5 a 10% do peso em 6 meses.
  - **Se a pessoa quer preservar ou ganhar massa magra durante a perda:** Murphy & Koehler 2022 (*Scandinavian Journal of Medicine & Science in Sports* 32(1):125–137, DOI 10.1111/sms.14075, metanálise e metarregressão) encontraram que déficit prejudica o ganho de massa magra no treino de força, mas não o de força. A metarregressão indica que cerca de **500 kcal/dia** já impede o ganho de massa magra, e os autores sugerem manter o déficit abaixo de 500 kcal/dia nesse caso.
- **Ganhar massa:** Slater et al. 2019 (*Frontiers in Nutrition*, DOI 10.3389/fnut.2019.00131, revisão): sugerem começar com superávit de **1.500 a 2.000 kJ/dia**, cerca de **360 a 480 kcal/dia** (conversão nossa), e dizem que o superávit exato necessário para hipertrofia **é desconhecido**. Ponto de partida conservador, não número fechado.

**4. Proteína**
- Morton et al. 2018 (*BJSM* 52:376–384, metanálise de 49 ensaios com 1.863 participantes): ganho de massa magra com treino de resistência só aparece a partir de cerca de **1,6 g/kg/dia**.
- Slater et al. 2019: 1,6 a 2,2 g/kg/dia para treino de resistência, e o maior ganho de massa ligado a 1,6 g/kg/dia.
- Para quem não treina: **não confirmamos faixa em estudo nesta pesquisa**. O número de referência oficial (0,8 g/kg) precisa ser conferido antes de usar.

**5. Recalibrar com as pesagens**
- A média de 7 dias do app (já existe) mostra se o peso anda como a base previa. Depois de 2 a 3 semanas, o app ajusta a base.
- Reanálise do experimento de *Minnesota* (*AJCN* 2015, DOI 10.3945/ajcn.115.109173): com corte de 50% da energia por 3 semanas, a TMB caiu cerca de 266 kcal/dia, e cerca de 108 kcal/dia foram adaptação metabólica (cerca de 72 depois de ajustar pela massa magra). O déficit do experimento foi bem maior que o proposto, então ele mostra o mecanismo, não o tamanho do efeito num déficit moderado.

## Déficit: universal ou não? (pesquisa de 14/11/2026)
- **A recomendação de déficit não muda pelo peso.** A diretriz AHA/ACC/TOS (Jensen et al. 2014) usa 500 a 750 kcal/dia para os adultos com sobrepeso ou obesidade, sem separar por peso.
- **A perda prevista por unidade de déficit muda com a gordura corporal.** Hall 2008 (*International Journal of Obesity* 32:573–576, DOI 10.1038/sj.ijo.0803720, modelo com dados publicados) diz que quem tem mais gordura precisa de um déficit maior por quilo perdido. Ele também afirma que a regra clássica de 3.500 kcal por libra ajusta bem para quem tem mais de 30 kg de gordura, e superestima o déficit para quem tem menos gordura. Isso afeta a previsão do peso, não a meta de déficit.
- **O corpo se adapta em pessoas de peso normal também.** Koehler et al. 2017 (*European Journal of Clinical Nutrition* 71:365–371, DOI 10.1038/ejcn.2016.203): em 25 mulheres de peso normal, a perda observada foi cerca de 33% (déficit severo) e 42% (déficit moderado) da prevista. A adaptação metabólica explicou parte disso.
- **Déficits em percentual, não fixos.** Das et al. 2009 (*Obesity* 17:2019–2024, DOI 10.1038/oby.2009.120, 38 adultos com sobrepeso): restrição de 10% e de 30% deram perda parecida em 6 meses (−7% e −10%, sem diferença significativa), e o gasto caiu cerca de 347 kcal/dia nos dois grupos.
- **Conclusão:** os achados sugerem que o déficit é universal e que o que varia é a previsão de peso. Não achei um estudo que compare obesos e pessoas de peso normal com o mesmo déficit em kcal, e isso fica registrado.

Consequência para o app: a meta de déficit é a mesma para todos (500 kcal/dia, ou menos se a meta for massa magra). O que muda com o IMC é só o texto sobre a precisão da previsão de peso.

## Limites da pesquisa
- Helms et al. 2014 (*JISSN* 11:20) dá faixas de perda de 0,5 a 1% do peso por semana, mas **só para preparação de competição** em fisiculturismo. Não generalizar.
- Equações de TMB testadas em brasileiros: os estudos achados são pequenos ou em grupos específicos (eutróficos jovens, obesos, base populacional sem validação). Não há uma equação brasileira validada e aceita para a população geral.
- Não encontramos estudo para a proteína de quem não treina.
- Pesquisa feita com buscas na web e leitura de páginas de estudo em 14/11/2026. Alguns artigos foram lidos pelo resumo ou por página de terceiros. Antes de implementar, leia os textos completos.

## Fontes usadas

**Artigos originais:**
- Mifflin et al., 1990, *AJCN*, DOI 10.1093/ajcn/51.2.241
- Frankenfield et al., 2005, *JADA*, DOI 10.1016/j.jada.2005.02.005
- Krüger et al., 2015, *Revista Brasileira de Cineantropometria e Desempenho Humano* 17(1):73–81
- Hall, 2008, *International Journal of Obesity* 32:573–576, DOI 10.1038/sj.ijo.0803720
- Koehler et al., 2017, *European Journal of Clinical Nutrition* 71:365–371, DOI 10.1038/ejcn.2016.203
- Das et al., 2009, *Obesity* 17:2019–2024, DOI 10.1038/oby.2009.120
- Lopes et al., 2010, *Revista Brasileira de Atividade Física & Saúde* 15(4)
- Cadernos de Saúde Pública, 2015, 31(4):777–786 (população de Niterói; sem validação mostrada)
- Morgan et al., 1999, *BMJ* (SCOFF); Luck et al., 2002, *BMJ* 325:755–756, DOI 10.1136/bmj.325.7367.755
- Keys e colaboradores, reanálise do Minnesota, 2015, *AJCN*, DOI 10.3945/ajcn.115.109173

**Revisões e metanálises:**
- O'Neill et al., 2023, *Sports Medicine* 53(12):2373–2398
- Murphy & Koehler, 2022, *Scandinavian Journal of Medicine & Science in Sports* 32(1):125–137, DOI 10.1111/sms.14075
- Slater et al., 2019, *Frontiers in Nutrition*, DOI 10.3389/fnut.2019.00131
- Morton et al., 2018, *BJSM* 52:376–384
- Helms et al., 2014, *JISSN* 11:20 (apenas preparação de competição)

**Diretrizes e relatórios oficiais (não são artigos originais):**
- Jensen et al., 2014, diretriz AHA/ACC/TOS, *Circulation*, DOI 10.1161/01.cir.0000437739.71477.ee
- NASEM, *Dietary Reference Intakes for Energy*, 2023

**Tabela de dados:**
- TACO, 4ª edição, NEPA-UNICAMP (composição dos alimentos, não TMB)

## Decisões tomadas
1. **TMB:** Mifflin para todos na primeira versão. Sem bloqueio e sem rótulo de IMC na tela. O aviso segue o modelo "a sugestão de déficit é X, mas vale procurar a ajuda de um profissional". Ten-Haaf (atletas) fica para depois.
2. **Déficit:** 500 kcal/dia para perder gordura (Jensen 2014). Para preservar massa magra, não passa de 500 (Murphy & Koehler 2022). Sem número fixo abaixo disso.
3. **Ganho de massa:** começar em +360 a +480 kcal/dia (Slater 2019) e ajustar pela média de 7 dias do peso.
4. **Proteína:** só para quem treina com resistência, piso de 1,6 g/kg/dia (Morton 2018). Para quem não treina, nenhum número.
5. **Dados incompletos:** o formulário marca em vermelho os campos de peso e altura vazios. A base só aparece com os dois preenchidos, e o app não estima valor no lugar deles.
6. **Revisão do texto:** o dono revisa as frases de sugestão e de aviso antes de publicar.
7. **Peso fora da previsão:** o app mostra a diferença entre o previsto e o real, com o texto "vale conversar com um profissional". Não recalcula a base sozinho. A mudança fica com a pessoa ou com o profissional.

## Dieta própria (pedido do dono, 14/11/2026)
- Quem já segue uma dieta ou plano pode registrá-lo no app (calorias e, se tiver, proteína), e seguir por ele.
- O app mostra a base sugerida ao lado do plano da pessoa, e ela pode ajustar o déficit ou o superávit dentro dos limites deste documento (nunca abaixo da TMB).
- O plano próprio é da pessoa: o app não o valida como prescrição, e o texto diz isso.
- **Quando o plano sai dos limites** (por exemplo, abaixo da TMB), o app **avisa e não impede**: a pessoa pode seguir. O app não é nutricionista e as sugestões são baseadas em pesquisa, então a decisão é dela.
- Texto do aviso (proposta, a refinar): "Este número está abaixo da sua taxa metabólica basal, e isso pode fazer mal à saúde. Vale conversar com um profissional antes de continuar. Você pode seguir se quiser, a decisão é sua."

## Ordem sugerida (passos pequenos)
1. Decisões fechadas (nenhum código).
2. Tela de avaliação: altura, peso, idade, sexo, atividade e meta, com triagem SCOFF.
3. Cálculo puro (`shared/`), com testes: TMB, gasto por PAL, base por meta, proteína e piso da TMB.
4. Mostrar a base na aba Alimentação, com as fontes e a frase de "sugestão".
5. Recalibragem com a média de 7 dias do peso (aba Fitness).
6. Revisão de texto e de segurança antes de liberar.

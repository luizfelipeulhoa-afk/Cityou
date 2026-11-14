# Ideia: composição corporal no app (proposta do dono, 14/11/2026)

Status: **ideia, sem decisão**. Para virar código, vai para o plano (`docs/PLANO-PROXIMOS-PASSOS.md`) e precisa de OK do dono.

Princípio do dono: **nada é 100%**. Nenhum método mede a gordura corporal sem erro, mas ter esse dado ajuda o app a dar sugestões melhores. O app mostra o número como estimativa, guarda o método e confia mais na tendência do que num valor isolado.

## O que é
- A pessoa registra a composição corporal: percentual de gordura e, se tiver, massa magra.
- Junto com o valor, guarda o **método** (balança de bioimpedância, dobras cutâneas, DEXA, outro) e a **data**.
- Fica na aba Fitness, ao lado das pesagens, e alimenta a base calórica da aba Alimentação.

## O que melhora na base calórica
- **Proteína por massa magra:** em déficit, quem treina força já vê o texto "estudos usaram 2,3 a 3,1 g por kg de massa magra" (Aragon 2017; Refalo 2025). Com a massa magra registrada, esse texto vira gramas por dia. O código já está pronto para isso (`fatFreeMassKg` em `proteinTarget`, PR #45).
- **TMB com massa magra:** equações como Katch-McArdle e Cunningham usam a massa magra no lugar do peso. **A conferir:** validação e precisão delas antes de entrar.
- **Déficit ajustado:** Aragon 2017 diz que quanto mais gordura no início, mais agressivo o déficit pode ser, e que pessoas mais magras preservam melhor o músculo perdendo devagar. Com o percentual de gordura, o app pode adaptar a sugestão. **A decidir** quanto e com que limite.

## Como entrar (passos)
1. **Registro manual** na aba Fitness: percentual de gordura, massa magra (opcional), método e data.
2. **Importar arquivo** (CSV) exportado pelo app da balança, com o histórico.
3. **Integração direta:** balanças com API na web (por exemplo, Withings). Apple Saúde e Google Health Connect exigem app nativo, então ficam para quando o Cityou tiver um.

## Cuidados
- **Bioimpedância de casa** varia com hidratação, horário e refeição. Sugerir medir sempre nas mesmas condições.
- **Dobras cutâneas** dependem de quem mede e da fórmula usada.
- O app mostra a **tendência** (média de várias medidas), como já faz com o peso, e não troca as contas por causa de uma medida isolada.
- Mesmos princípios da base calórica: é sugestão, não prescrição; avisa e não impede; nada paga moedas ou XP; o dado é da pessoa, que pode apagar.

## Pesquisa (14/11/2026)

Detalhes e fontes no projeto "CityouApp" do claude.ai (`nutricao/atualizacao-2026-11-14-f-composicao-corporal.md`).

- **Bioimpedância** (Oliver et al., 2026, revisão sistemática, doi:10.3390/jfmk11010065): na média de muitas pessoas o erro é pequeno (−2,9 a +4,4 pontos de % de gordura), mas numa pessoa só a faixa chega a 15–20 pontos. A massa magra varia mais de ±6 kg.
- **Dobras cutâneas** (Jackson et al., 2008, estudo TIGER, 1.129 jovens adultos contra DEXA): subestimam 1,3 ponto nos homens e 3,0 nas mulheres, com faixa individual de cerca de −5 a +8 ou +11 pontos. Dependem de quem mede.
- **Conclusão:** a tendência medida sempre do mesmo jeito é mais confiável do que um valor isolado.
- **TMB com massa magra:** em 3.001 adultos (Kfir et al., 2023, *Nutrients*, doi:10.3390/nu15040805), Cunningham errou mais que Mifflin (−16,6% contra −12,6%). Em atletas (Jagim et al., 2018, doi:10.1519/JSC.0000000000002111), Cunningham foi a melhor para mulheres. Katch-McArdle: sem validação conferida. Por isso a massa magra deve entrar primeiro na **proteína**, não na troca da equação da TMB.
- **Balanças:** a Withings tem API oficial com massa gorda e massa livre de gordura. Xiaomi só tem ferramentas da comunidade. Marcas vendidas no Brasil (Relaxmedic, Multilaser, OMRON): formato de exportação não confirmado.

## Proposta (a aprovar)
1. Registro manual na aba Fitness (percentual de gordura, massa magra opcional, método, data), com a tendência.
2. Massa magra usada na proteína (as gramas da nota de déficit), não na TMB.
3. Texto: "Balanças e dobras cutâneas acertam bem a tendência, mas um valor isolado pode variar alguns pontos. Meça sempre do mesmo jeito: mesmo aparelho, mesmo horário, em jejum e depois de ir ao banheiro."
4. Withings e importação de CSV depois.

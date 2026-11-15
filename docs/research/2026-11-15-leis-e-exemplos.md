# Leis e exemplos: ECA Digital, LGPD (dado de saúde) e termos (15/11/2026)

Dossiê do agente analista do luix_bot, conferido pelo orquestrador, para o dono chegar preparado à conversa com o advogado. **Não é parecer jurídico.** A rede da sessão bloqueou planalto.gov.br e gov.br, então quase tudo vem de fonte secundária: [SEC] = só fonte secundária, conferir no texto oficial; [NC] = não confirmado. Os números de artigo da Lei 15.211 divergem entre as fontes: não cite número sem conferir.

## 1. ECA Digital (Lei 15.211/2025)

- Em vigor desde 17/03/2026, regulamentada pelo Decreto 12.880/2026, com a ANPD como autoridade [SEC: [Machado Meyer](https://www.machadomeyer.com.br/pt/inteligencia-juridica/publicacoes-ij/direito-digital/estatuto-digital-da-crianca-e-do-adolescente-lei-n-15-211-2025-entra-em-vigor-em-17-de-marco-de-2026), [Olhar Digital](https://olhardigital.com.br/2026/03/18/pro/eca-digital-lula-assina-decreto-para-proteger-menores-no-meio-online/)].
- Alcança serviço dirigido a menores **ou de acesso provável** por eles [SEC: [Cookiefácil](https://cookiefacil.com.br/eca-digital)]. Um app gamificado sem idade mínima pode ser lido assim.
- Autodeclaração de idade é vedada para conteúdo impróprio a menores; o decreto separa "aferição" (indireta) de "verificação" (alta confiança), por risco [SEC: [Mattos Filho](https://www.mattosfilho.com.br/unico/anpd-define-afericao-idade/), [Exame](https://exame.com/tecnologia/examelab/verificacao-de-idade-nas-redes-o-que-o-eca-digital-exige-e-como-funciona-em-cada-app/)]. O Cityou não tem conteúdo adulto.
- Até 16 anos, conta vinculada a responsável em redes sociais e afins [SEC: [Legalcloud](https://legalcloud.com.br/eca-digital-protecao-criancas-internet-lei-15211/)]; se vale para todo serviço de acesso provável: [NC].
- Loot boxes vedadas em jogos de acesso provável por menores [SEC: [Mixvale](https://www.mixvale.com.br/2026/10/16/eca-digital-leva-governo-a-pedir-monitoramento-de-6-games-por-venda-de-caixas-pagas/)]. As moedas do Cityou são ganhas por tarefa, não se compram e não há sorteio: tudo indica que ficam fora [NC].
- ANPD: orientação preliminar em março/2026, tomada de subsídios do guia de aferição de idade (maio a julho/2026), fiscalização efetiva da aferição indicada para 2027 [SEC: [Times Brasil](https://timesbrasil.com.br/empresas-e-negocios/tecnologia-e-inovacao/eca-digital-como-redes-sociais-vao-verificar-idade-de-usuarios-governo-divulga-orientacoes/)].

**Recomendação:** declarar idade mínima de **18 anos no beta por convite** (fica fora do regime de 12 a 16 com responsável); pedir data de nascimento como triagem e recusar abaixo do mínimo antes de abrir contas; aceitar menores muda o produto (vínculo com responsável) e é decisão do dono.

## 2. LGPD e dado de saúde

- Peso, dieta, composição corporal e a triagem SCOFF são dado sensível de saúde (art. 11). A "tutela da saúde" só vale para profissional ou serviço de saúde, então a base provável é o **consentimento específico e destacado** [SEC: [Confidata](https://confidata.com.br/blog/dados-sensiveis-lgpd-bases-legais-cuidados)].
- Transferência internacional (dados na Cloudflare, EUA): Resolução CD/ANPD 19/2024, prazo de adequação já passou; o mecanismo usual são as cláusulas-padrão da ANPD [SEC: [Legismap](https://legismap.com.br/conteudos/artigos-e-noticias/anpd-aprova-regulamento-sobre-transferencias-internacionais-de-dados)]. Se a Cloudflare oferece essas cláusulas: [NC].
- Encarregado: agente de pequeno porte pode dispensar a designação (Res. CD/ANPD 2/2022), mas precisa de canal com o titular, e a dispensa pode não valer com dado sensível em volume [SEC: [Confidata](https://confidata.com.br/blog/lgpd-pequenas-empresas-resolucao-pequeno-porte)].
- Incidente: comunicar ANPD e titulares em 3 dias úteis (Res. CD/ANPD 15/2024); prazo em dobro para pequeno porte, com divergência entre as fontes [SEC].

**Recomendação:** consentimento próprio, destacado e revogável antes de cada módulo de saúde (base calórica, composição corporal, triagem); política de privacidade com dados, finalidades, base, retenção, direitos, contato e transferência internacional; um e-mail de contato do encarregado. Antes de abrir contas: cláusulas-padrão, plano de incidente escrito e relatório de impacto (RIPD) da triagem. Exportar e apagar a conta já existem.

## 3. Como outros apps fazem (nenhuma linha conferida no texto dos termos)

| App | Idade | Dado de saúde | Fonte |
|---|---|---|---|
| Duolingo | não coleta de menores de 13 de propósito; versão para pais | não se aplica | [ConductAtlas](https://conductatlas.com/platform/duolingo/duolingo-terms-of-service/age-restriction-and-parental-consent/) |
| MyFitnessPal | 18 anos na política | dieta e atividade tratadas como sensíveis | [política](https://www.myfitnesspal.com/privacy-policy) |
| Strava | 13+ na loja brasileira | dados de saúde ligados ao usuário | [App Store](https://apps.apple.com/BR/app/id426826309) |
| Habitica | termos mudaram em set/2025 | não se aplica | [DEV](https://dev.to/owly/habiticagamified-todo-app-aligns-disturbingly-well-with-the-uks-online-safety-act-g3a) |

Padrão: idade mínima de 13 ou 18, autodeclaração na prática e consentimento dentro dos termos. O ECA Digital tende a mudar isso.

## 4. Termos de uso

- Moeda virtual: dizer que não vale dinheiro, não se compra, não é reembolsável nem transferível e que o saldo não é apagado como punição (regra do produto). Evitar "pode zerar a qualquer momento" (CDC, art. 51) [NC].
- Saúde: o CFN trata prescrição dietética como atividade do nutricionista (Res. 599 e 600/2018, [CFN](https://cfn.org.br/wp-content/uploads/resolucoes/Res_600_2018.htm)). Regra do CONFEF para apps: [NC]. Manter o aviso "sugestão, não prescrição".

## Perguntas para o advogado

1. O Cityou é "de acesso provável" por menores? Idade mínima de 18 com convite basta?
2. Autodeclaração vale fora de conteúdo adulto, ou a ANPD já espera aferição?
3. Se aceitar 12 a 16, o vínculo com responsável é obrigatório?
4. Moedas ganhas por tarefa, sem compra nem sorteio, ficam fora de "loot box"?
5. Consentimento destacado e revogável por módulo basta para dado de saúde?
6. Preciso de encarregado e de RIPD sendo pequeno porte com dado sensível?
7. Qual mecanismo de transferência para a Cloudflare?
8. Estimar calorias e sugerir treino fere atividade privativa de nutricionista ou educador físico? Qual redação protege?
9. Prazo e conteúdo da comunicação de incidente para pequeno porte.
10. A foto de comprovação (imagem da pessoa) pede tratamento à parte?

## Falta confirmar

Texto oficial da Lei 15.211 e do Decreto 12.880; guia final e sanções da ANPD; valor da multa; termos reais dos apps; regra do CONFEF; prazos do art. 19 da LGPD e do incidente para pequeno porte. Para refazer com fonte primária, a rede da sessão precisa liberar planalto.gov.br e gov.br.

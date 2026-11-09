# Cityou — Baía do Amanhã
Estudo de mapa, 6 de novembro de 2026. Proposta para discussão; não substitui a cidade salva.

## As três referências escolhidas
As imagens recebidas mostram um Rio natural, uma baía vazia e uma cidade costeira compacta. Não identificam três jogos. Para comparar mecanismos, escolhemos SimCity BuildIt e City Mania, já citados na conversa, e Cities: Skylines II para ruas e zoneamento. Esta seleção é de projeto, não um ranking de popularidade.

| Referência | O que a documentação oficial mostra | Como traduzimos para Cityou |
|---|---|---|
| SimCity BuildIt | Zonas residenciais junto a ruas; mover com prévia do contorno e confirmação. | Lotes com frente e calçada; prévia antes de construir; checagem de tamanho. |
| City Mania | Expansão, missões de habitantes, especialização e fusão de prédios vizinhos evoluídos. | Crescer em bairros; personagens representam progresso; reservar pares de lotes para eventual expansão futura. |
| Cities: Skylines II | Ruas curvas e grade de quarteirões; encaixe/guias; zoneamento com diferentes tipos e densidades. | Avenida acompanha a paisagem, miolo dos bairros usa módulos regulares; casas e grandes prédios têm lotes diferentes. |

Fontes primárias consultadas em 6/11/2026:
- EA: https://help.ea.com/en/articles/simcity/simcity-buildit/beginner-guide/
- Gameloft: https://www.gameloft.com/blog/players/build-the-city-of-your-dreams
- Paradox, ruas: https://www.paradoxinteractive.com/games/cities-skylines-ii/features/road-tools
- Paradox, zonas: https://www.paradoxinteractive.com/games/cities-skylines-ii/features/zones-signature-buildings

A leitura das fontes e as adaptações propostas são coisas distintas. Não copiamos layouts, assets ou código desses jogos. Não adicionamos serviços urbanos obrigatórios, catástrofes ou punições por ausência ao organizador pessoal.

## A identidade espacial
Uma península/baía carioca, com o continente montanhoso ao norte e oceano a oeste/sul. A cena nasce da costa e do relevo, evitando a aparência de tabuleiro flutuante. Ruas principais conectam todos os bairros e as vias locais dão acesso a cada lote. Orla pública, parque linear e lagoa criam pausas entre quarteirões.

O Cristo é um marco distante e discreto. Árvores claras acompanham ruas e parques. Não há arbustos, trepadeiras ou jardins ocultando fachadas na planta técnica. Não reconstruímos o aspecto abandonado da primeira referência. A reserva florestal permanece um limite natural, sem loteamento em encostas.

## 64 espaços vazios para construir
| Bairro | Lotes | Dimensão por lote | Etapa | Uso sugerido |
|---|---:|---|---:|---|
| Centro da Vida | 12 | 40 × 40 m | 1 | Sede, tarefas, agenda, finanças e projetos. |
| Orla dos Hábitos | 16 | 24 × 24 m | 2 | Casas e conquistas cotidianas. |
| Campus do Equilíbrio | 8 | 32 × 32 m | 2 | Fitness, alimentação, biblioteca, estudos e autoconhecimento. |
| Distrito Criativo | 12 | 32 × 40 m | 3 | Escritórios das IAs e projetos profissionais. |
| Marina das Conquistas | 4 | 40 × 32 m | 3 | Espaços especiais e marcos de longo prazo. |
| Vila do Mirante | 12 | 24 × 24 m | 4 | Casas adicionais em terraços planos, não na encosta. |
| **Total** | **64** | | | |

O lote C02 é uma sugestão de implantação do StuntSync, ao lado da sede. I01 a I04 sugerem ChatGPT, Claude, Gemini e Grok; são reservas de estudo, não construções automáticas. Os lotes maiores permitem acomodar outras arquiteturas. A casa é de baixa altura, os prédios funcionais são intermediários e as sedes principais pontuam o horizonte.

## Escala e proporção
Uma unidade de desenho equivale a 0,5 m; módulo construtivo proposto de 4 m. Pessoa de referência: 1,75 m. Via local: 8 m de pista, com 4 m de calçada em cada frente de lote. Avenida: 12 m de pista, com calçadas próprias. Recuo interno mínimo: 2 m em cada lado. Casas de 16 × 16 m cabem em lotes residenciais de 24 × 24 m. A prévia verifica largura e profundidade, inclusive ao girar.

Alturas de estudo, a ajustar ao medir cada GLB: casa 7,5 m; prédio de bairro 16 m; campus 18 m; StuntSync 30 m; ChatGPT 26 m; Claude 22 m. Mantemos a hierarquia StuntSync > ChatGPT > Claude sem diminuir os outros para parecer maior. A altura se refere ao edifício; a logo pode flutuar acima. São envelopes de projeto, não uma validação das medidas reais dos modelos.

No 3D, normalizar cada modelo pela base e altura medidas, preservando proporções. Recuar a porta para a calçada com um ponto de entrada explícito. O símbolo deve ser um objeto separado. Fachadas ativas podem acender e o símbolo girar a partir dos sinais reais já existentes; o mapa não inventa atividade.

## Crescimento e interação
1. Começo: praça/sede e Centro da Vida disponíveis. Dois primeiros espaços podem ser construídos; o restante fica vazio.
2. Expansão 1: liberar Orla e Campus como bairros completos — não casas aleatórias no meio da floresta.
3. Expansão 2: conectar Distrito Criativo e Marina.
4. Expansão 3: abrir a Vila e personalizar o conjunto.

Os marcos exatos de desbloqueio e o preço dos terrenos ainda são decisões de economia. A planta não muda o ledger atual. As ferramentas pessoais permanecem acessíveis mesmo antes de construir o prédio correspondente.

Interação desejada: selecionar prédio, ver seu tamanho, encaixar em lote permitido, girar, confirmar. Não é necessário arrastar uma miniatura minúscula. Acesso pelo sul está marcado no desenho; rotação gira o volume, mantendo o caminho até a calçada. Em uma futura implantação, mover deve ser transacional e reversível, com teste de colisão, ligação viária e inclinação.

## O que esta entrega permite experimentar
- Ver os 64 lotes vazios com ID, bairro, fase, dimensão e frente de acesso.
- Alternar quatro etapas e destacar um dos seis bairros.
- Pré-visualizar casas e cinco categorias de prédio com teste dimensional e recuos.
- Reservar/retirar em um rascunho local, desfazer e exportar o JSON.
- Usar roda do mouse para zoom dentro do mapa; arrastar para mover e Enquadrar para retornar.

O rascunho usa uma chave local própria. Não chama APIs de tarefa, finanças ou cidade. A praça é espaço público separado dos 64 lotes privados/funcionais. Ponte e píeres são mobiliário de circulação, não espaços onde prédios podem ser colocados.

## Imagem artística versus planta
conceito.png é uma imagem gerada com IA usando as referências 2 e 3: mostra a atmosfera, relevo e tipo de urbanismo. Sua contagem/desenho de lotes é ilustrativa.
planta.svg e planta.json são a fonte exata dos 64 lotes, ruas, dimensões e fases. A planta técnica é uma projeção superior de estudo e não a malha final 3D.
A implementação atual ainda usa sua grade e seu salvamento anteriores. Levar este mapa para a cidade requer novos dados de terreno, alinhamento dos GLBs, migração explícita das posições salvas e testes de navegação — essa migração não foi executada por este estudo.

## Arquivos
- index.html: planta interativa independente.
- planta.svg: mapa vetorial exato com IDs de lotes.
- planta.json: especificação de implantação.
- conceito.png: visual aéreo de referência.
- pesquisa-e-proposta.md: esta pesquisa e suas decisões.
- prompt-conceito.txt: prompt usado com a ferramenta integrada image_gen.

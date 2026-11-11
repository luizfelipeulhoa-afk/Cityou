# Rio de Janeiro · orla, bairro e encosta

ID `cristo-redentor` · dossiê v1 · 11/11/2026 · piloto

## Referências e transformação para o jogo

O dossiê da paisagem carioca orienta a relação entre a serra, a mata, a cidade e a água. O passeio de Copacabana fornece uma referência de paginação, arborização e continuidade para pedestres. As matrizes do samba e a Feira de São Cristóvão inspiram espaços de trabalho, ensaio e encontro. O bairro é uma composição ficcional em que orla, baía e Corcovado aparecem mais próximos do que na cidade real. Sombra de árvores e toldos, galerias ventiladas e recuo de encosta são propostas para calor, chuva e circulação. [Paisagem carioca, UNESCO](https://whc.unesco.org/en/list/1100/) · [Avenida Atlântica, MAM Rio](https://mam.rio/lugar-de-estar/avenida-atlantica-vd/) · [Pedra portuguesa, Prefeitura do Rio](https://conservacao.prefeitura.rio/voce-sabia/pedra-portuguesa/) · [Patrimônio imaterial, IPHAN-RJ](https://www.gov.br/iphan/pt-br/superintendencias/rio-de-janeiro/patrimonio-imaterial) · [Feira e pavilhão de São Cristóvão, Prefeitura do Rio](https://www0.rio.rj.gov.br/pcrj/destaques/pavilhao_s_cristovao.htm)

## Planta anotada · 40 prédios

1. **Chegada pela orla em (23, 19).** Enquadrar o passeio, o mosaico e a água ao sul. O percurso vira em (18, 19), segue pela ligação (10, 19) e termina na via inicial em (10, 9). A rua de chegada guia para a praça, com travessias entre orla e bairro.
2. **Quadras de uso misto.** O interior plano concentra sobrados, feira e botequins. As travessas dão acesso à orla e às áreas comunitárias. Usar calçada livre de quiosques e bancos no percurso principal. Manter a praça e a sede nos terrenos antigos.
3. **Encosta ao norte.** A mata e o Corcovado formam um fundo protegido. Manter uma abertura visual da rua para a encosta e deixar o monumento fora da área edificável. O mosaico, a orla e as fachadas térreas devem identificar o Rio mesmo quando o Cristo não está no enquadramento.

<!-- PLANTA: INICIO -->

Cada caractere corresponde a uma célula. As colunas vão de x = −8 até x = 24. Norte fica no topo. Letras repetidas representam as células ocupadas por cada edifício.

```text
 -8  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 -7  ^^^^^^^^^^^^^*^^^^^^^^^^^^^^^^^^^
 -6  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 -5  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 -4  ^^^^......^^^^^^^^^^^^^^^^^^^^^^^
 -3  ^^^^................^^^^^^^^^^^^^
 -2  ^^^^..........................^^^
 -1  ^^^^.............................
  0  ^^^^..........BB.AAAAAAAAAAAA....
  1  ^^^^..........BB.AAAAAAAAAAAA....
  2  .....##########################..
  3  ...........#..BBBB.AAAAAAAAAAAA..
  4  ...........#BBBBBB.AAAAAAAAAAAA..
  5  ...........#BB...................
  6  ........EEE#EEE..................
  7  ........EEE#EEE.HBBBBBBAAAAAA....
  8  ........EEE#EEE.+BBBBBBAAAAAA....
  9  .....###########################.
 10  ........EEE#EEE...#DDDDDDAA......
 11  ........EEE#EEE.DD#DDDDDDAA......
 12  ........EEE#EEE.DD#DDDDDDD.......
 13  ...........#..BBDD#DDDDDDD.......
 14  ...........#..BB..#...DDDD.......
 15  .....###########################.
 16  ...........#......#..CCCCCCCCCC..
 17  ...........#......#..CCCCCCCCCC..
 18  ...........#......#..CCCCCCCCCC..
 19  .....##########################@.
 20  ........................CCC......
 21  ........................CCC.~~~~~
 22  ..............~~~~~~~~~~~~~~~~~~~
 23  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 24  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

`@` chegada · `*` marco · `~` água · `^` encosta · `#` rua · `H` sede · `+` praça · `.` terra livre.

`A` Sobrado com comércio · `B` Botequim de esquina · `C` Quiosque esportivo · `D` Pavilhão de feira · `E` Quadra de escola de samba.

A [planta preenchida](../../../shared/game/city-reference-plans.json) guarda os 40 edifícios, suas rotações e o traçado viário. O custo da composição com as vias adicionais é de 1.512 créditos.

<!-- PLANTA: FIM -->

## Cinco edifícios

| Tipo e lote | Fachada, implantação e aproximação |
| --- | --- |
| Sobrado com comércio · 2 × 2 | Térreo aberto para a calçada, pavimento superior residencial e fachada estreita. Toldos, gradil e caixilho ganham definição de perto. |
| Botequim de esquina · 2 × 2 | Porta larga voltada às duas frentes, balcão ao fundo e toldo para a calçada. Usar mesas recolhidas junto à fachada. |
| Quiosque esportivo · 3 × 2 | Volume baixo voltado ao passeio. Sombra para fila e equipamentos. A ciclovia e a faixa de pedestres passam livres. |
| Pavilhão de feira · 3 × 2 | Cobertura de grande vão e fachadas abertas para permitir passagem. Alusão à convivência e ao comércio da feira, sem replicar o pavilhão real. |
| Quadra de escola de samba · 3 × 3 | Salão de ensaio, apoio de instrumentos e entrada identificada para encontros. Paleta e letreiros ficcionais. |

## Cortes interativos

- **Pavilhão de feira.** A câmera abre o teto e mostra bancas em volta de um corredor livre. O balcão de organização abre **Tarefas**. A entrega de mercadorias se distingue da entrada do público.
- **Quadra de escola de samba.** A área de ensaio ocupa o centro. Nichos laterais guardam instrumentos e materiais. O quadro de programação abre **Agenda**. Sem reprodução de nome, brasão ou repertório de uma agremiação real.

## Revisão local

Checar a paginação de piso, os usos da orla e a leitura do Corcovado com alguém que conheça o Rio. Uma eventual referência nominal à Feira de São Cristóvão deve explicitar a presença nordestina no Rio. Confirmar o retrato da escola de samba com pessoas ligadas a essa prática antes de publicar nomes, símbolos ou eventos reais. As imagens dos acervos permanecem apenas vinculadas.

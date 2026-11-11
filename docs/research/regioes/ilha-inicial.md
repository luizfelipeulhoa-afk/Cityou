# Ilha Inicial · cais, lagoa e vila

ID `ilha-inicial` · dossiê v1 · 11/11/2026 · piloto

## Referências e transformação para o jogo

A ilha é fictícia e se inspira em localidades habitadas do arquipélago maldivo. A cartografia dos atóis orienta a forma baixa e a relação entre mar aberto e lagoa. O programa portuário de Kulhudhuffushi dá referências para cais, mercado e abrigo de manutenção. O *dhoni*, os ofícios com fibras e a pesca ajudam a decidir quais espaços têm uso cotidiano. A costa recuada, a sombra e a ventilação cruzada são propostas de projeto para o cenário tropical marítimo. A simulação visual não calcula marés, ressacas ou risco de inundação. [Atlas dos atóis, Governo das Maldivas](https://www.atollsofmaldives.gov.mv/) · [Cultura, Visit Maldives](https://visitmaldives.com/en/maldives/culture) · [Programa portuário de Kulhudhuffushi, Ministério das Finanças](https://www.finance.gov.mv/public/attachments/9M1uks5dEb6hVvlp56B3sQzUdeUwrXgRt6Ia4FeC.pdf) · [Consulta de adaptação costeira, Ministério do Ambiente](https://old.environment.gov.mv/v2/en/news/36665)

## Planta anotada · 32 prédios

1. **Cais sul em (8, 23).** A chegada enquadra a lagoa e a enseada a sudeste. O percurso passa pela ligação (8, 19) e termina na via inicial em (8, 9). A sinalização inicial convida a seguir para o mercado.
2. **Cinturão costeiro.** Areia, coqueiros e água rasa separam a grade de construção do recife. Ancoradouros e a oficina ficam orientados para o cais. A água muda de cor com a profundidade aparente. A máscara da planta protege a enseada.
3. **Interior da vila.** O centro plano conserva a praça, a sede e os terrenos da versão anterior. Travessas curtas levam às casas, ao salão e ao ateliê. Os pátios sombreados e coberturas baixas deixam a linha de costa visível mesmo quando a cidade está cheia.

<!-- PLANTA: INICIO -->

Cada caractere corresponde a uma célula. As colunas vão de x = −8 até x = 24. Norte fica no topo. Letras repetidas representam as células ocupadas por cada edifício.

```text
 -8  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 -7  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 -6  ~~~~~~~~~~~~~~~~.~~~~~~~~~~~~~~~~
 -5  ~~~~~~~~~~~...........~~~~~~~~~~~
 -4  ~~~~~~~~~...............~~~~~~~~~
 -3  ~~~~~~~...................~~~~~~~
 -2  ~~~~~~.....................~~~~~~
 -1  ~~~~~.......................~~~~~
  0  ~~~~.........EEEEEE..........~~~~
  1  ~~~~.......BBEEEEEEAAAA......~~~~
  2  ~~~........BBEEEEEEAAAA.......~~~
  3  ~~...#######################...~~
  4  ~~.........#.EEEEEEAAAAAAAA....~~
  5  ~~.......BB#.EEEEEEAAAAAAAA....~~
  6  ~~.......BB#.EEEEEE............~~
  7  ~~.....BBBB#BBBBHAAAAAAAA......~~
  8  ~......BBBB#BBBB+AAAAAAAA.......~
  9  ~~...##########################~~
 10  ~~.......BB#BB..#AAAA..........~~
 11  ~~.......BB#BB..#AAAA..........~~
 12  ~~.........#....#..............~~
 13  ~~.........#CC..#.DD...........~~
 14  ~~~........#CC..#.DD.......~~~~~~
 15  ~~~~.......#CC..#.DD.......~~~~~~
 16  ~~~~..#####################~~~~~~
 17  ~~~~~...CCCCCCCC#DDDDDD....~~~~~~
 18  ~~~~~~..CCCCCCCC#DDDDDD....~~~~~~
 19  ~~~~~~~.......CC#DDD......~~~~~~~
 20  ~~~~~~~~~........DDD....~~~~~~~~~
 21  ~~~~~~~~~~~...........~~~~~~~~~~~
 22  ~~~~~~~~~~~~~~~~.~~~~~~~~~~~~~~~~
 23  ~~~~~~~*~~~~~~~~@~~~~~~~~~~~~~~~~
 24  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

`@` chegada · `*` marco · `~` água · `^` encosta · `#` rua · `H` sede · `+` praça · `.` terra livre.

`A` Casa costeira · `B` Salão comunitário · `C` Oficina de dhoni · `D` Mercado de pescado · `E` Ateliê de fibra vegetal.

A [planta preenchida](../../../shared/game/city-reference-plans.json) guarda os 32 edifícios, suas rotações e o traçado viário. O custo da composição com as vias adicionais é de 1.230 créditos.

<!-- PLANTA: FIM -->

## Cinco edifícios

| Tipo e lote | Fachada, implantação e aproximação |
| --- | --- |
| Casa costeira · 2 × 2 | Varanda sob beiral, abertura alta e pano de parede claro. O banco externo e as venezianas aparecem na aproximação. |
| Salão comunitário · 2 × 2 | Entrada larga e acessível voltada a uma travessa, com pátio sombreado e bancos de reunião. |
| Oficina de *dhoni* · 3 × 2 | Abrigo de manutenção com vão lateral amplo, prateleira de madeira e casco reconhecível. Implantar no eixo do cais. |
| Mercado de pescado · 3 × 2 | Cobertura ventilada e bancas voltadas ao percurso de chegada. A entrada de serviço fica ao lado da área de preparo. |
| Ateliê de fibra vegetal · 3 × 3 | Dois volumes baixos em volta de um pátio. Estruturas de secagem e pequenas amostras tecidas dão detalhe próximo. |

## Cortes interativos

- **Oficina de *dhoni*.** O corte revela um casco em reparo e uma bancada em volta de um corredor de trabalho. O quadro de encomendas, junto à entrada de pedestres, abre **Projetos**. Vista principal do corte da rua para o cais.
- **Mercado de pescado.** Bancas acompanham o corredor público. Pia e área de preparo ficam em uma faixa separada. O balcão de organização abre **Tarefas**. Vista principal do corte da chegada para o salão.

## Revisão local

Validar com referências maldivas a proporção do casco, os materiais do abrigo, o vocabulário dos ofícios e a representação do mercado. Os acabamentos claros são uma decisão de arte. O recife é ecossistema protegido e não vira material de coleta. Evitar amenidades de resort como substituto da infraestrutura cotidiana. Os materiais, as imagens e os projetos das fontes ficam apenas como referências por link.

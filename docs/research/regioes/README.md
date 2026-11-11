# Dossiês regionais do Cityou

Versão 1. Pesquisa consultada em 11/11/2026. O mundo tem a Ilha Inicial fictícia e sete marcos. Rio e Ilha são os dois pilotos de design e implementação. As demais fichas guardam referências, hipóteses e lacunas para a próxima rodada de arte.

| Destino | Uso nesta fase |
| --- | --- |
| [Ilha Inicial](ilha-inicial.md) | Planta, catálogo e cortes jogáveis |
| [Rio de Janeiro](cristo-redentor.md) | Planta, catálogo e cortes jogáveis |
| [Machu Picchu e Vale Sagrado](machu-picchu.md) | Pesquisa para produção futura |
| [Chichén Itzá e Yucatán](chichen-itza.md) | Pesquisa para produção futura |
| [Coliseu e Rione Monti](coliseu.md) | Pesquisa para produção futura |
| [Petra e Wadi Musa](petra.md) | Pesquisa para produção futura |
| [Taj Mahal e Agra](taj-mahal.md) | Pesquisa para produção futura |
| [Grande Muralha e Mutianyu](grande-muralha.md) | Pesquisa para produção futura |

## Como usar as referências

As instituições identificadas junto aos links recebem o crédito pelo conteúdo consultado. Os links são para consulta. Salvo indicação explícita, licença de reutilização de fotos, mapas e ilustrações **não verificada**. Não incorpore esses arquivos ao jogo sem conferir a licença específica e registrar autor, URL e condições no [inventário de procedência](../../PROVENANCE.md). As fichas propõem arte procedural original e transformações de escala e geografia identificadas como ficção.

As fontes registram fatos do lugar. Implantação, material simplificado, interiores e usos jogáveis são propostas do Cityou. Ao revisar uma ficha, preserve o ID do destino, anote a mudança e confirme se a nova área protegida mantém livres os terrenos onde já existem construções salvas.

## Convenções dos pilotos

A [planta compartilhada](../../../shared/game/city-layout.js) é a referência de execução para o editor e o Worker. O mapa de 33 × 33 usa coordenadas de −8 a 24 e preserva o núcleo antigo de 0 a 16. Neste dossiê, norte corresponde ao eixo y menor. Os números de prédios se referem à planta preenchida, com mistura de tamanhos, e excluem ruas, sede, praça e cenário.

A vista distante usa silhueta e cor. Beirais, paginação de piso, toldos e objetos de uso aparecem na aproximação. Os quatro interiores ficam em cortes de teto, com interação por toque e teclado. A câmera volta ao enquadramento anterior ao fechar.

Na prévia com CITYOU_TEST_OPEN_REGIONS=1, os oito destinos e a grade inteira de Ilha e Rio ficam acessíveis. Os 5.000 créditos iniciais pertencem a uma sessão de teste nova. A configuração de produção mantém a progressão e a carteira normais. A demonstração de capacidade pode ser montada sem desbloquear destinos ou ganhar créditos durante o teste.

## Validação visual

1. Comparar os dois pilotos na mesma distância de câmera. Cobrir o monumento e verificar se cais, costa, vias e volumes ainda identificam cada lugar.
2. Percorrer cada chegada, construir perto de uma via, girar o prédio e abrir um corte. Conferir se mar, encosta e área de proteção são reconhecíveis no editor.
3. Com a planta cheia, medir a entrada em cache vazio e em reentrada, o tempo até o feedback de toque, a fluidez de câmera e a primeira abertura do interior. Registrar aparelho, navegador, rede e quantidade de prédios visíveis antes de comparar com o PR #8.

## Prancha de direção visual

[Conceito comparativo de Rio e Ilha](conceito-rio-ilha.png). Imagem gerada para o Cityou com ImageGen em 11/11/2026. A prancha orienta o enquadramento, os materiais e a leitura dos dois lugares. A ocupação jogável é definida pelas plantas verificadas.

# Treino sugerido: próximos passos (ideia, sem decisão)

Pedido do dono em 15/11/2026: para a demonstração bastam os cerca de 100 exercícios de `shared/game/training.js`, sem imagem. O que fica para depois:

## Fotos ou ilustrações dos exercícios

- **Não usar as imagens da free-exercise-db** (github.com/yuhonas/free-exercise-db) nem as da base de origem dela (wrkout/exercises.json). O código e a lista são de domínio público, mas o dono do repositório disse, na issue #2, que não sabe de onde as imagens vieram nem se são livres de direitos. Os textos de instrução têm a mesma origem desconhecida, então também não devem ser copiados.
- Opções com licença clara:
  - **wger**: base aberta em que cada imagem tem autor e licença declarados (CC-BY-SA, que pede crédito; quem adapta uma imagem tem de manter a mesma licença). Tem menos imagens.
  - **Ilustrações próprias** no estilo do Cityou: sem risco de licença, mas com mais trabalho e custo de geração e revisão.

## Mais exercícios

A free-exercise-db tem 876 exercícios: 584 de força e o resto alongamento, pliometria, levantamento olímpico, strongman e cardio, com várias variações quase iguais. Nome, músculo e equipamento são fatos e podem servir de referência. Para cada exercício que entrar no app, é preciso:

- um nome brasileiro;
- o movimento (`pattern`) e onde ele cabe (`setups`);
- uma dica própria, escrita por nós;
- uma revisão.

## Treino que se adapta

O guia do pacote de evidências (projeto do claude.ai "CityouApp", `treino/`) sugere oferecer ajuste de dificuldade depois de dor, baixa adesão ou recuperação ruim. Hoje o app só sugere manter a carga quando a pessoa não chega às repetições. A ideia é perguntar, depois da sessão, como foi (dor, cansaço), e então reduzir séries ou sugerir a troca do exercício.

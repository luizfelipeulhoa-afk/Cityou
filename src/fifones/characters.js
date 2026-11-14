// Personagens ambiente da cidade: só visual, sem estado no servidor (a pessoa não constrói nem move ninguém).
// Cada um anda num caminho fixo, ida e volta, em tiles da cidade (como as placements: cena = tile − CENTER).
// `height` em unidades do jogo: uma pessoa é bem menor que o menor prédio (os carrinhos têm cerca de 1).
// Prompts e propostas de personagens: docs/PROMPTS-PERSONAGENS.md.
export const CHARACTERS = {
  'cristo-redentor': [
    // Fifo, o primeiro personagem do Cityou: sai da praça, desce a rua até a avenida da praia e passeia pelo
    // calçadão de Copacabana. Modelo fornecido pelo responsável do projeto, com esqueleto Mixamo e sem animação: a
    // caminhada é de characterRig.js (`stepLength`, opcional, é o passo na unidade do modelo).
    {
      id: 'fifo', name: 'Fifo', model: '/models/characters/fifo.glb', height: 0.42, speed: 0.55,
      path: [[6.6, 9.4], [10.4, 9.4], [10.4, 19.4], [13.5, 19.4], [13.5, 22.5], [19.4, 22.5]],
    },
  ],
}

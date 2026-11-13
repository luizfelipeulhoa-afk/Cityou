// Personagens ambiente da cidade: só visual, sem estado no servidor (a pessoa não constrói nem move ninguém).
// Um por região, carregado como qualquer GLB do catálogo (faces planas, sem sombra projetada). Coordenadas no
// sistema da cidade (tile − CENTER, como em CityWorld), altura em unidades do jogo (height do catálogo é análogo).
// Prompts e propostas de personagens: docs/PROMPTS-PERSONAGENS.md.
export const CHARACTERS = {
  'cristo-redentor': [
    // Fifo, o primeiro personagem do Cityou: na faixa de areia perto do calçadão (por isso a bermuda de banho),
    // de frente para a grade. Modelo fornecido pelo responsável do projeto, textura recomprimida (sem mapa de
    // normais: a cidade usa faces planas e não o lê).
    { id: 'fifo', name: 'Fifo', model: '/models/characters/fifo.glb', x: 11, z: 15, rotation: 2.6, height: 1.3 },
  ],
}

// Região do Rio em volta de Copacabana: o que o script de dados (Node) e a cena (navegador) precisam saber.
// Para criar outra região, copie este arquivo e siga "Como criar outra região" em docs/TERRAIN.md.
import lots from './rio.lots.json' with { type: 'json' }

export default {
  id: 'rio',
  name: 'Rio de Janeiro · Copacabana',

  // Enquadramento. O ponto (0, 0) do mundo é o meio da faixa plana de Copacabana.
  origin: { lat: -22.9689, lon: -43.1842 },
  bearing: 315, // o fundo do mapa (−Z) aponta para o noroeste: praia na horizontal, mar na frente, morros atrás
  metersPerUnit: 50, // 1 unidade = 1 lote = 50 m
  exaggeration: 1.6, // multiplica as alturas reais

  // Mapa de alturas gerado por `node tools/terrain-data.mjs rio` (PNG de 16 bits; 0 = água).
  heightmap: {
    url: new URL('./rio.height.png', import.meta.url),
    size: 513, // amostras por lado: 2^n + 1
    spacing: 1, // unidades entre amostras
    // Centro da grade. Fica meio lote fora dos inteiros para as amostras caírem nos cantos dos lotes,
    // e 3 km para o lado da terra, onde há mais relevo para mostrar do que no mar aberto.
    center: [0.5, -59.5],
    metersPerValue: 0.05,
    zoom: 12, // zoom dos tiles de origem; o SRTM não tem mais detalhe que isso
  },

  // O SRTM achata picos estreitos. O script leva cada um à altura real com um fator local (raio em metros).
  // `cap` arredonda o topo nesse raio: o Pão de Açúcar é um domo, não uma ponta.
  peaks: [
    { name: 'Pão de Açúcar', lat: -22.9494, lon: -43.1558, height: 396, radius: 450, cap: 120 },
    { name: 'Corcovado', lat: -22.9516, lon: -43.2122, height: 710, radius: 700 },
  ],

  // Planícies urbanas: o SRTM mede o topo dos prédios (20 a 30 m). O script alisa e rebaixa o que está
  // abaixo de `start` (metros), sem tocar no que passa de `end`, e deixa a orla descer até o mar.
  lowland: { start: 27, end: 45, keep: 0.4, shoreBase: 1, shoreSlope: 0.045 },

  // Marcos do cenário: a malha guarda mais detalhe em volta deles (raio em unidades) e a página de teste os
  // enquadra com `view` (ângulo a partir da vertical, em radianos, e distância da câmera).
  landmarks: [
    { id: 'pao-de-acucar', name: 'Pão de Açúcar', lat: -22.9494, lon: -43.1558, radius: 16, view: { polar: 1.3, distance: 52 } },
    { id: 'corcovado', name: 'Corcovado', lat: -22.9516, lon: -43.2122, radius: 22, view: { polar: 1.27, distance: 84 } },
  ],

  // Conferidos pelo script e pelos testes: tipo do ponto e altura (metros reais, antes do exagero).
  controlPoints: [
    { name: 'Praia de Copacabana', lat: -22.971, lon: -43.182, coast: true },
    { name: 'Pão de Açúcar', lat: -22.9494, lon: -43.1558, height: 396, tolerance: 12 },
    { name: 'Corcovado', lat: -22.9516, lon: -43.2122, height: 710, tolerance: 15 },
    { name: 'Lagoa Rodrigo de Freitas', lat: -22.974, lon: -43.212, water: true },
    { name: 'Mar aberto', lat: -23.03, lon: -43.17, water: true },
  ],

  // Zona jogável: máscara editável (um caractere por lote) em rio.lots.json.
  lots,
}

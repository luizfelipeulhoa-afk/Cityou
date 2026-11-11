// Os 8 espaços do mapa-mundo do BuildU, na ordem de desbloqueio.
// lat/lon reais (graus). `terreno: 'oceano'` mantém mar ao redor (a ilha);
// os demais ganham um platô de terra plano para o modelo assentar.
// Ajustes por modelo: `escala` (1 = padrão) e `rotacaoY` (graus, gira o GLB).

export { latLonToVector3 } from './geo.js'

export const WORLD_MODELS_DIR = '/models/world'
// Lista dos GLB existentes, gerada por tools/world-models-manifest.mjs (o Vite mantém em dia).
export const WORLD_MODELS_MANIFEST = `${WORLD_MODELS_DIR}/manifest.json`

function space(data) {
  return {
    glbPath: `${WORLD_MODELS_DIR}/${data.id}.glb`,
    desbloqueado: false,
    concluido: false,
    terreno: 'terra',
    escala: 1,
    rotacaoY: 0,
    ...data,
  }
}

export const WORLD_SPACES = Object.freeze([
  space({
    id: 'ilha-inicial', ordem: 1, nome: 'Ilha Inicial', local: 'Oceano Índico · perto das Maldivas',
    descricao: 'Tutorial: aprenda o básico antes de partir pelo mundo.',
    lat: 3.2, lon: 73.2, terreno: 'oceano', desbloqueado: true, cor: '#36e2c8', placeholder: 'ilha', escala: 1.15,
  }),
  space({
    id: 'cristo-redentor', ordem: 2, nome: 'Cristo Redentor', local: 'Rio de Janeiro · Brasil',
    descricao: 'De braços abertos sobre a Baía de Guanabara.',
    lat: -22.95, lon: -43.21, cor: '#5fd68b', placeholder: 'cristo',
  }),
  space({
    id: 'machu-picchu', ordem: 3, nome: 'Machu Picchu', local: 'Cusco · Peru',
    descricao: 'A cidade inca entre as montanhas dos Andes.',
    lat: -13.16, lon: -72.55, cor: '#b48cff', placeholder: 'machu',
  }),
  space({
    id: 'chichen-itza', ordem: 4, nome: 'Chichén Itzá', local: 'Yucatán · México',
    descricao: 'A pirâmide de Kukulkán, calendário de pedra maia.',
    lat: 20.68, lon: -88.57, cor: '#ffb347', placeholder: 'chichen', escala: 1.05,
  }),
  space({
    id: 'coliseu', ordem: 5, nome: 'Coliseu', local: 'Roma · Itália',
    descricao: 'O grande anfiteatro do Império Romano.',
    lat: 41.89, lon: 12.49, cor: '#ff8a7a', placeholder: 'coliseu', escala: 1.08,
  }),
  space({
    id: 'petra', ordem: 6, nome: 'Petra', local: 'Ma’an · Jordânia',
    descricao: 'A cidade rosa esculpida na rocha.',
    lat: 30.33, lon: 35.44, cor: '#ff7eb3', placeholder: 'petra', escala: 0.92,
  }),
  space({
    id: 'taj-mahal', ordem: 7, nome: 'Taj Mahal', local: 'Agra · Índia',
    descricao: 'Mármore branco às margens do rio Yamuna.',
    lat: 27.18, lon: 78.04, cor: '#7cc7ff', placeholder: 'taj',
  }),
  space({
    id: 'grande-muralha', ordem: 8, nome: 'Grande Muralha', local: 'Pequim · China',
    descricao: 'Milhares de quilômetros sobre as montanhas.',
    lat: 40.43, lon: 116.57, cor: '#ff6b78', placeholder: 'muralha', escala: 1.1,
  }),
])

export const SPACE_ORDER = Object.freeze(WORLD_SPACES.map(s => s.id))

export function findSpace(id, spaces = WORLD_SPACES) {
  return spaces.find(s => s.id === id) || null
}

export function previousSpace(id, spaces = WORLD_SPACES) {
  const i = spaces.findIndex(s => s.id === id)
  return i > 0 ? spaces[i - 1] : null
}

export function nextSpace(id, spaces = WORLD_SPACES) {
  const i = spaces.findIndex(s => s.id === id)
  return i >= 0 && i < spaces.length - 1 ? spaces[i + 1] : null
}

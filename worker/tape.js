// Fita do Tempo (etapa 8, docs/PLANO-PROXIMOS-PASSOS.md): desfazer e refazer as ações da cidade, no servidor.
// Pilha estrita: só a ação do topo (desfazer sobe pela pilha, refazer desce), só nos 120 s depois dela e só se a cidade ainda está na revisão gravada logo
// depois (ou logo depois do desfazer, para refazer). Assim o estado guardado é sempre válido e nada precisa ser
// revalidado. O navegador manda só o `action_id` (o `request_id` da ação) e a revisão que vê.
// Ficam de fora: prédios de atividade (nascem de regra do jogo) e a primeira construção que abre uma viagem.
// Desfazer devolve integralmente o que a ação custou (ou tira o reembolso de uma demolição). Passada a janela,
// vale a regra de sempre: demolir devolve 50%. Sem contador na tela (contador cria pressa).
import { HttpError, json } from './http.js'
import { recordChange, validRequestId } from './city.js'

export const TAPE_WINDOW_MS = 120_000
export const TAPE_SIZE = 10

/** O que mudou entre duas listas de peças: as que saíram ou mudaram (antes) e as que entraram ou mudaram (depois). */
export function placementDiff(before, after) {
  const key = item => JSON.stringify(item)
  const beforeKeys = new Set(before.map(key)), afterKeys = new Set(after.map(key))
  return { removed: before.filter(item => !afterKeys.has(key(item))), added: after.filter(item => !beforeKeys.has(key(item))) }
}

/** Aplica um lado da diferença: tira as peças `drop` (por id) e põe as `put`. */
export function applyDiff(placements, drop, put) {
  const ids = new Set(drop.map(item => item.id))
  return [...placements.filter(item => !ids.has(item.id)), ...put]
}

const visible = (entry, now) => now - entry.at <= TAPE_WINDOW_MS

export const tapeMethods = {
  tape(location) { return this.read('tape', location) ?? [] },

  /** A fita que a tela mostra: só as ações ainda dentro da janela, da mais nova para a mais antiga. */
  tapeView(location, now = Date.now()) {
    return this.tape(location).filter(entry => visible(entry, now)).reverse()
      .map(({ action_id, label, at, state, amount }) => ({ action_id, label, at, state, amount }))
  },

  /** Chamado por cityAction depois de gravar: guarda a ação no topo e descarta o que estava desfeito acima dela. */
  recordTape(location, { action_id, label, amount, before, after, revision }) {
    const now = Date.now()
    const kept = this.tape(location).filter(entry => entry.state === 'done' && visible(entry, now))
    kept.push({ action_id, label, amount, at: now, state: 'done', revision, ...placementDiff(before, after) })
    this.write('tape', location, kept.slice(-TAPE_SIZE))
  },

  /** Descarta a fita (por exemplo, quando outra mudança da cidade não passa pela fita). */
  dropTape(location) { if (this.read('tape', location)) this.write('tape', location, []) },

  cityUndo(body, location) { return this.moveTape(body, location, 'undo') },
  cityRedo(body, location) { return this.moveTape(body, location, 'redo') },

  moveTape(body, location, direction) {
    const { action_id, expected_revision } = body
    if (Object.keys(body).length !== 2 || !validRequestId(action_id) || !Number.isSafeInteger(expected_revision)) {
      throw new HttpError(422, 'Envie action_id e expected_revision.')
    }
    const tape = this.tape(location)
    const undo = direction === 'undo'
    // As desfeitas ficam sempre em cima. Desfazer pega a última feita; refazer, a primeira desfeita (a mais antiga delas).
    const index = undo ? tape.findLastIndex(entry => entry.state === 'done') : tape.findIndex(entry => entry.state === 'undone')
    const top = tape[index]
    if (!top || top.action_id !== action_id) {
      throw new HttpError(409, undo ? 'Só dá para desfazer a última ação.' : 'Só dá para refazer a última ação desfeita.')
    }
    if (!visible(top, Date.now())) throw new HttpError(409, 'O tempo para desfazer passou. A ação ficou no histórico.')
    const home = this.cityState()
    const city = this.regionalCity(location, home)
    if (expected_revision !== city.revision || city.revision !== top.revision) {
      throw new HttpError(409, 'A cidade mudou depois desta ação. Atualize para ver o estado de agora.')
    }
    // Um prédio de atividade que voltaria à cidade não pode já existir em outra região (uma atividade, um prédio).
    const putting = undo ? top.removed : top.added
    const elsewhere = this.buildingActivityIds()
    if (putting.some(item => item.activity_id && elsewhere.has(item.activity_id))) {
      throw new HttpError(409, 'Esta atividade já tem um prédio em outra cidade. A ação ficou no histórico.')
    }
    // Desfazer devolve o custo (amount negativo) ou tira o reembolso (positivo); refazer faz o contrário.
    const change = undo ? -top.amount : top.amount
    if (city.credits + change < 0) throw new HttpError(422, 'Moedas insuficientes para isso agora.')
    city.placements = undo ? applyDiff(city.placements, top.added, top.removed) : applyDiff(city.placements, top.removed, top.added)
    recordChange(city, `${undo ? 'Desfez' : 'Refez'}: ${top.label}`, change)
    this.saveCity(location, home, city)
    // As entradas abaixo da que mudou passam a valer na revisão nova (é a cidade delas, de novo).
    for (let i = 0; i < tape.length; i++) if (i !== index) tape[i] = { ...tape[i], revision: city.revision }
    tape[index] = { ...top, state: undo ? 'undone' : 'done', revision: city.revision }
    this.write('tape', location, tape)
    return json(this.citySnapshot(location))
  },
}

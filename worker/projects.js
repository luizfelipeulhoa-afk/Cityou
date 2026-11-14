// Projetos reais (etapa 5): um projeto é um nome e UM próximo passo. Sem prazo, sem contagem regressiva, sem moedas.
// Concluir o passo só conta (steps_done) e guarda quando; rules.js não é tocado.
import { HttpError, json } from './http.js'
import { atLeastOne, exact, text } from './records.js'

const CREATE = ['name', 'description', 'next_step']
const EDIT = ['name', 'description', 'status', 'next_step']

function stepOf(value) {
  return value === undefined || value === null ? null : text(value, 'próximo passo', { min: 1, max: 180 })
}

function normalize(raw) {
  const status = raw.status ?? 'active'
  if (!['active', 'archived'].includes(status)) throw new HttpError(422, 'Escolha ativo ou guardado.')
  return {
    status,
    name: text(raw.name, 'nome', { min: 1, max: 120 }),
    description: text(raw.description ?? '', 'descrição', { max: 1000, multiline: true }),
    next_step: stepOf(raw.next_step),
  }
}

export const projectMethods = {
  projectsList() { return json({ projects: this.list('project') }) },

  addProject(body) {
    exact(body, CREATE)
    const now = new Date().toISOString()
    const { id } = this.add('project', { ...normalize(body), steps_done: 0, last_step_at: null, updated_at: now }, this.cap('project'))
    return json({ ...this.overview(), created_id: id }, 201)
  },

  editProject(body, id) {
    exact(body, EDIT)
    atLeastOne(body)
    const current = this.read('project', id)
    if (!current) throw new HttpError(404, 'Este projeto não existe.')
    this.write('project', id, { ...current, ...normalize({ ...current, ...body }), updated_at: new Date().toISOString() })
    return json(this.overview())
  },

  removeProject(_, id) {
    if (!this.read('project', id)) throw new HttpError(404, 'Este projeto não existe.')
    this.sql.exec("DELETE FROM records WHERE kind = 'project' AND id = ?", id)
    return json(this.overview())
  },

  // Só o servidor soma os passos dados: o corpo precisa ser {}.
  stepDone(body, id) {
    exact(body, [])
    const project = this.read('project', id)
    if (!project) throw new HttpError(404, 'Este projeto não existe.')
    if (project.status !== 'active') throw new HttpError(422, 'Este projeto está guardado. Retome-o para dar o próximo passo.')
    if (!project.next_step) throw new HttpError(422, 'Defina o próximo passo antes de concluí-lo.')
    const now = new Date().toISOString()
    this.write('project', id, { ...project, next_step: null, steps_done: project.steps_done + 1, last_step_at: now, updated_at: now })
    return json(this.overview())
  },
}

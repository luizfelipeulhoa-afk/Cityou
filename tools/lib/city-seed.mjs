// Semeadura compartilhada pelos scripts de navegador da cidade (city-frame-bench, city-look):
// sessão de demonstração nova, chamadas à API e prédios do Rio construídos pelo servidor.
export const LOCATION = 'cristo-redentor'
export const MODEL_KINDS = ['rio-feira-barraca', 'rio-laje', 'rio-quiosque-coco', 'rio-academia', 'rio-salva-vidas', 'rio-bonde', 'rio-casarao', 'rio-igreja', 'rio-edificio-deco']

export function createSeeder(base) {
  /** Uma sessão de demonstração nova: o Worker põe o cookie ao servir /app. */
  async function newSession() {
    const response = await fetch(base + '/app', { redirect: 'manual' })
    const cookie = response.headers.getSetCookie?.()[0]?.split(';')[0]
    if (!cookie) throw new Error('O Worker não devolveu o cookie da demonstração (o site exige login?).')
    return cookie
  }

  async function api(cookie, path, body) {
    const headers = { Cookie: cookie, Origin: new URL(base).origin, 'X-Fifones-City': '1', 'Content-Type': 'application/json' }
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined })
    return { ok: response.ok, status: response.status, json: await response.json().catch(() => ({})) }
  }

  /** Estende as ruas e constrói até `count` prédios com modelo; o servidor decide quais lotes valem. */
  async function seed(cookie, count) {
    const action = body => api(cookie, `/api/city/actions?local=${LOCATION}`, { ...body, request_id: crypto.randomUUID() })
    let city = (await api(cookie, `/api/city?local=${LOCATION}`)).json
    if (!city.revision && city.revision !== 0) throw new Error('GET /api/city não devolveu a cidade: o Worker está no ar?')
    if (!count) return { built: 0, credits: city.credits, placements: city.placements.length }
    if (!city.test_mode) console.error('Aviso: o Worker não está em modo de teste (sem CITYOU_TEST_OPEN_REGIONS): poucas moedas, só caberão alguns prédios.')
    // Ruas em três corredores, para haver frente de rua para os prédios. Falhas (água, encosta) são ignoradas.
    for (const [x, y, endX, endY] of [[10, 9, 16, 9], [6, 9, 0, 9], [8, 9, 8, 16], [8, 9, 8, 2]]) {
      city = (await action({ type: 'road_path', x, y, end_x: endX, end_y: endY, expected_revision: city.revision })).json.revision !== undefined
        ? (await api(cookie, `/api/city?local=${LOCATION}`)).json : city
    }
    let built = 0, revision = city.revision
    for (let y = city.grid_min; y <= city.grid_max && built < count; y++) {
      for (let x = city.grid_min; x <= city.grid_max && built < count; x++) {
        const result = await action({ type: 'build', kind: MODEL_KINDS[built % MODEL_KINDS.length], x, y, expected_revision: revision })
        if (result.ok) { built++; revision = result.json.revision }
      }
    }
    city = (await api(cookie, `/api/city?local=${LOCATION}`)).json
    return { built, credits: city.credits, placements: city.placements.length }
  }


  return { newSession, api, seed }
}

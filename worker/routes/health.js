import { json } from '../http.js'

// Diz se a API está no ar e em que estado está o banco, sem exigir sessão.
export async function health({ env, timing }) {
  let db = 'not_configured'
  let dbRegion = null
  if (env.DB) {
    try {
      const result = await timing.measure('db', () =>
        env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").all())
      db = result.results.length ? 'ok' : 'no_schema'
      dbRegion = result.meta?.served_by_region ?? null
    } catch (error) {
      console.error(JSON.stringify({ message: 'health: banco indisponível', error: String(error) }))
      db = 'unavailable'
    }
  }
  return json({ app: 'cityou', status: 'ok', db, db_region: dbRegion })
}

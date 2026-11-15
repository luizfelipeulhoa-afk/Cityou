import { json } from '../http.js'

// Diz se a API está no ar e em que estado está o banco, sem exigir sessão.
export async function health({ env, timing }) {
  let db = 'not_configured'
  let dbRegion = null
  if (env.DB) {
    try {
      const result = await timing.measure('db', () => env.DB.prepare(
        `SELECT
           (SELECT count(*) FROM sqlite_master WHERE type = 'table'
            AND name IN ('users', 'sessions', 'login_attempts', 'password_resets', 'invites', 'ip_attempts')) AS tables_ready,
           EXISTS(SELECT 1 FROM pragma_table_info('users') WHERE name = 'data_key') AS has_data_key,
           EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'users_data_key') AS has_data_key_index`,
      ).all())
      const schema = result.results[0]
      db = schema.tables_ready === 6 && schema.has_data_key && schema.has_data_key_index ? 'ok' : 'no_schema'
      dbRegion = result.meta?.served_by_region ?? null
    } catch (error) {
      console.error(JSON.stringify({ message: 'health: banco indisponível', error: String(error) }))
      db = 'unavailable'
    }
  }
  return json({ app: 'cityou', status: 'ok', db, db_region: dbRegion })
}

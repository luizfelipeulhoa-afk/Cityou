// Etapa 6 (docs/PLANO-PROXIMOS-PASSOS.md): primeiro em Report-Only. Só registra violações (endpoint /api/csp-report), não bloqueia.
// 'wasm-unsafe-eval' libera só compilar WASM (o decodificador de meshopt dos GLB); JS eval continua bloqueado. Sem fontes externas; style-src aceita 'unsafe-inline' por causa dos estilos do Vue e do <style> do mapa.
// Fica num módulo próprio porque o Worker só pode exportar o handler e as classes do Durable Object.
export const CSP_REPORT_ONLY = [
  "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self'", "connect-src 'self' blob: data:", "worker-src 'self' blob:", "media-src 'self' blob: data:",
  "frame-src 'self'", "frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  'report-uri /api/csp-report',
].join('; ')

// Tamanho máximo do relatório lido; o resto é descartado.
export const CSP_REPORT_MAX = 8192

// Teto de violações únicas guardadas (diretiva + endereço bloqueado): o endpoint não exige sessão nem conta
// (é o mecanismo nativo do navegador), então o teto evita que um reenvio em massa encha o banco.
export const CSP_VIOLATIONS_CAP = 200

/** Guarda o resumo de uma violação (sem banco: só o log de sempre, nada muda). Reenvio da mesma diretiva +
 * endereço soma a contagem em vez de criar outra linha. */
export async function recordCspViolation(env, reportText) {
  if (!env?.DB) return
  let report
  try { report = JSON.parse(reportText)?.['csp-report'] } catch { return }
  const directive = typeof report?.['violated-directive'] === 'string' ? report['violated-directive'].slice(0, 200)
    : typeof report?.['effective-directive'] === 'string' ? report['effective-directive'].slice(0, 200) : null
  const blockedUri = typeof report?.['blocked-uri'] === 'string' ? report['blocked-uri'].slice(0, 500) : null
  if (!directive || !blockedUri) return
  const documentUri = typeof report?.['document-uri'] === 'string' ? report['document-uri'].slice(0, 500) : null
  const now = new Date().toISOString()
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO csp_violations (violated_directive, blocked_uri, document_uri, count, first_seen, last_seen)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT (violated_directive, blocked_uri)
         DO UPDATE SET count = count + 1, document_uri = excluded.document_uri, last_seen = excluded.last_seen`,
      ).bind(directive, blockedUri, documentUri, now, now),
      env.DB.prepare(
        'DELETE FROM csp_violations WHERE rowid NOT IN (SELECT rowid FROM csp_violations ORDER BY last_seen DESC LIMIT ?)',
      ).bind(CSP_VIOLATIONS_CAP),
    ])
  } catch (error) { console.error(JSON.stringify({ message: 'csp: falha ao guardar violação', error: String(error) })) }
}

/** Para `GET /api/admin/csp-violations` (worker/index.js, só com CITYOU_ADMIN_TOKEN): decide se a semana passou limpa. */
export async function cspViolationsSummary(env) {
  if (!env?.DB) return { violations: [], last_seen: null }
  const { results } = await env.DB.prepare(
    'SELECT violated_directive, blocked_uri, document_uri, count, first_seen, last_seen FROM csp_violations ORDER BY last_seen DESC',
  ).all()
  return { violations: results, last_seen: results[0]?.last_seen ?? null }
}

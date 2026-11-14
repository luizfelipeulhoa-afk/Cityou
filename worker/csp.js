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

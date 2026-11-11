// Respostas e erros da API. Formato de erro lido por ApiError em src/fifones/api.js.

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

export function errorResponse(status, message, fields) {
  return json({ message, detail: message, ...(fields ? { fields } : {}) }, status)
}

/** Mede o tempo de cada trecho de I/O e monta o cabeçalho Server-Timing. */
export function createTiming() {
  const start = performance.now()
  const marks = []
  return {
    async measure(name, work) {
      const from = performance.now()
      try { return await work() } finally { marks.push([name, performance.now() - from]) }
    },
    header() {
      return [['total', performance.now() - start], ...marks]
        .map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`).join(', ')
    },
  }
}

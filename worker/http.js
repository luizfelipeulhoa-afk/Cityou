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

export async function readJsonObject(request, maxBytes) {
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(422, 'Envie os dados do registro.')
  const decoder = new TextDecoder()
  let text = ''
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new HttpError(413, 'O registro é muito grande.')
      }
      text += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
  let body
  try { body = JSON.parse(text + decoder.decode()) } catch { throw new HttpError(422, 'Dados inválidos.') }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(422, 'Dados inválidos.')
  return body
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

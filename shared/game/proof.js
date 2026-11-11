// Validação pura da comprovação de uma atividade (texto e/ou foto). Roda no servidor e na tela.
import { RULES } from './rules.js'

const DATA_URL = /^data:image\/(jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/

export class ProofError extends Error {}

function decode(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const isJpeg = b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
const isWebp = b => b.length > 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP'

/**
 * Aceita `{ note?, photo? }` e devolve `{ note, photo: { mime, bytes, dataUrl } | null }`.
 * É preciso ter uma foto válida ou uma nota com o mínimo de caracteres. Lança ProofError com a mensagem para a pessoa.
 */
export function parseProof(input, rules = RULES.proof) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ProofError('Envie uma nota ou uma foto.')
  const unknown = Object.keys(input).filter(key => key !== 'note' && key !== 'photo')
  if (unknown.length) throw new ProofError('A comprovação aceita só nota e foto.')
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  if (input.note !== undefined && input.note !== null && typeof input.note !== 'string') throw new ProofError('A nota precisa ser um texto.')
  if (note.length > rules.noteMaxChars) throw new ProofError(`A nota aceita até ${rules.noteMaxChars} caracteres.`)

  let photo = null
  if (input.photo !== undefined && input.photo !== null) {
    if (typeof input.photo !== 'string' || input.photo.length > rules.photoMaxBytes * 1.4) throw new ProofError('A foto é grande demais. Tente outra.')
    const match = DATA_URL.exec(input.photo)
    if (!match) throw new ProofError('Envie a foto em JPEG ou WebP.')
    let bytes
    try { bytes = decode(match[2]) } catch { throw new ProofError('Não foi possível ler a foto.') }
    if (bytes.length > rules.photoMaxBytes) throw new ProofError('A foto é grande demais. Tente outra.')
    const mime = match[1] === 'jpeg' ? 'image/jpeg' : 'image/webp'
    if (!(mime === 'image/jpeg' ? isJpeg(bytes) : isWebp(bytes))) throw new ProofError('O arquivo não parece uma foto válida.')
    photo = { mime, bytes, dataUrl: input.photo }
  }

  if (!photo && note.length < rules.noteMinChars) throw new ProofError(`Escreva pelo menos ${rules.noteMinChars} caracteres ou envie uma foto.`)
  return { note, photo }
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

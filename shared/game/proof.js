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

function encode(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/**
 * Tira da foto os metadados que podem levar a localização ou o aparelho (EXIF, XMP, IPTC).
 * A tela já reencoda a foto num canvas, o que apaga tudo; isto vale para quem chama a API direto.
 * JPEG: remove os segmentos APP1 (EXIF e XMP) e APP13 (IPTC). WebP: remove os pedaços EXIF e XMP e as marcas no VP8X.
 * Devolve os bytes sem mudança se o arquivo não tiver nada disso.
 */
export function stripPhotoMetadata(bytes) {
  if (isJpeg(bytes)) {
    const parts = [bytes.subarray(0, 2)]
    let at = 2, changed = false
    while (at + 4 <= bytes.length && bytes[at] === 0xff) {
      if (bytes[at + 1] === 0xff) { at++; continue } // bytes de preenchimento antes do marcador
      const marker = bytes[at + 1]
      if (marker === 0xda) break // começo da imagem: o resto vai até o fim dela
      const size = (bytes[at + 2] << 8) | bytes[at + 3]
      if (size < 2 || at + 2 + size > bytes.length) break
      if (marker === 0xe1 || marker === 0xed) changed = true
      else parts.push(bytes.subarray(at, at + 2 + size))
      at += 2 + size
    }
    // Depois do fim da imagem (FFD9, que não aparece dentro dos dados comprimidos) podem vir imagens extras (MPF),
    // cada uma com o próprio EXIF: corta ali.
    let end = bytes.length
    for (let i = at; i + 1 < bytes.length; i++) if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) { end = i + 2; break }
    if (end < bytes.length) changed = true
    if (!changed) return bytes
    parts.push(bytes.subarray(at, end))
    const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
    let offset = 0
    for (const part of parts) { out.set(part, offset); offset += part.length }
    return out
  }
  if (isWebp(bytes)) {
    const tag = at => String.fromCharCode(...bytes.subarray(at, at + 4))
    const parts = []
    let at = 12, changed = false
    while (at + 8 <= bytes.length) {
      const size = bytes[at + 4] | (bytes[at + 5] << 8) | (bytes[at + 6] << 16) | (bytes[at + 7] << 24)
      const end = Math.min(bytes.length, at + 8 + size + (size & 1))
      const name = tag(at)
      if (name === 'EXIF' || name === 'XMP ') changed = true
      else parts.push(bytes.slice(at, end))
      at = end
    }
    if (!changed) return bytes
    for (const part of parts) if (String.fromCharCode(...part.subarray(0, 4)) === 'VP8X') part[8] &= ~0x0c
    const total = 12 + parts.reduce((sum, part) => sum + part.length, 0)
    const out = new Uint8Array(total)
    out.set(bytes.subarray(0, 12))
    const riff = total - 8
    out[4] = riff & 0xff; out[5] = (riff >> 8) & 0xff; out[6] = (riff >> 16) & 0xff; out[7] = (riff >>> 24) & 0xff
    let offset = 12
    for (const part of parts) { out.set(part, offset); offset += part.length }
    return out
  }
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
    const clean = stripPhotoMetadata(bytes)
    photo = clean === bytes ? { mime, bytes, dataUrl: input.photo } : { mime, bytes: clean, dataUrl: `data:${mime};base64,${encode(clean)}` }
  }

  if (!photo && note.length < rules.noteMinChars) throw new ProofError(`Escreva pelo menos ${rules.noteMinChars} caracteres ou envie uma foto.`)
  return { note, photo }
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

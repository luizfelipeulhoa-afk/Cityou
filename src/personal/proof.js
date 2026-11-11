// Prepara a foto de uma comprovação: reduz no próprio aparelho para caber no limite do servidor (250 KB).
// Quanto menor o envio, mais rápido o toque responde e menos dados a pessoa gasta.
const MAX_SIDE = 900
const MAX_BYTES = 200_000

function toBlob(canvas, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Não foi possível ler a foto.'))
    reader.readAsDataURL(blob)
  })
}

export async function photoToDataUrl(file) {
  let bitmap
  try { bitmap = await createImageBitmap(file) } catch { throw new Error('Não foi possível abrir esta foto. Tente outra.') }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  let blob = null
  for (let quality = 0.78; quality >= 0.38; quality -= 0.1) {
    blob = await toBlob(canvas, quality)
    if (blob && blob.size <= MAX_BYTES) break
  }
  if (!blob || blob.size > MAX_BYTES) throw new Error('A foto é grande demais. Tente outra.')
  return readAsDataUrl(blob)
}

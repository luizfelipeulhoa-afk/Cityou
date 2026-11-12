// Leitor de PNG sem dependências: o mapa de alturas é um PNG de 16 bits em tons de cinza, e um canvas só devolve 8 bits.
// Aceita o que o projeto usa: tons de cinza ou RGB(A), 8 ou 16 bits, sem entrelaçamento.
// Roda no navegador, em worker e no Node 18+ (DecompressionStream).

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 }

async function inflate(chunks) {
  const stream = new Blob(chunks).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Devolve `{ width, height, bitDepth, channels, data }`; `data` é Uint8Array (8 bits) ou Uint16Array (16 bits). */
export async function decodePng(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 8 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) throw new Error('O arquivo não é um PNG.')
  let width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = 0
  const chunks = []
  for (let pos = 8; pos + 12 <= bytes.length;) {
    const length = view.getUint32(pos)
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7])
    const data = bytes.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8)
      height = view.getUint32(pos + 12)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    }
    else if (type === 'IDAT') chunks.push(data)
    else if (type === 'IEND') break
    pos += length + 12
  }
  const channels = CHANNELS[colorType]
  if (!channels || (bitDepth !== 8 && bitDepth !== 16) || interlace) {
    throw new Error(`PNG fora do formato aceito (tipo de cor ${colorType}, ${bitDepth} bits, entrelaçamento ${interlace}).`)
  }
  const pixel = channels * bitDepth / 8 // bytes por pixel
  const stride = width * pixel
  const raw = await inflate(chunks)
  if (raw.length < (stride + 1) * height) throw new Error('PNG truncado.')
  const out = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const source = y * (stride + 1) + 1, row = y * stride
    for (let i = 0; i < stride; i++) {
      const left = i >= pixel ? out[row + i - pixel] : 0
      const up = y ? out[row - stride + i] : 0
      const corner = y && i >= pixel ? out[row - stride + i - pixel] : 0
      let value = raw[source + i]
      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - corner, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - corner)
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : corner
      }
      else if (filter !== 0) throw new Error(`Filtro de PNG desconhecido: ${filter}.`)
      out[row + i] = value
    }
  }
  if (bitDepth === 8) return { width, height, bitDepth, channels, data: out }
  const data = new Uint16Array(width * height * channels) // o PNG guarda o byte mais alto primeiro
  for (let i = 0; i < data.length; i++) data[i] = out[i * 2] << 8 | out[i * 2 + 1]
  return { width, height, bitDepth, channels, data }
}

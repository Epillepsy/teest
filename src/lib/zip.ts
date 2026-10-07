/**
 * Minimal streaming-friendly ZIP reader. Only the central directory is read up front; each
 * entry is sliced out of the Blob and inflated on demand, so multi-GB archives (e.g. a Strava
 * "Download your data" export) never have to fit in memory at once. Supports stored and
 * deflated entries and ZIP64.
 */
export interface ZipEntry {
  name: string
  method: number
  flags: number
  crc32: number
  compressedSize: number
  size: number
  localOffset: number
}

const SIG_EOCD = 0x06054b50
const SIG_EOCD64_LOCATOR = 0x07064b50
const SIG_EOCD64 = 0x06064b50
const SIG_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50
const U32_MAX = 0xffffffff

async function view(blob: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await blob.slice(start, end).arrayBuffer())
}

export async function isZip(blob: Blob): Promise<boolean> {
  if (blob.size < 22) return false
  const v = await view(blob, 0, 4)
  return v.getUint32(0, true) === SIG_LOCAL || v.getUint32(0, true) === SIG_EOCD
}

export async function listZipEntries(blob: Blob): Promise<ZipEntry[]> {
  const tailStart = Math.max(0, blob.size - (65535 + 22))
  const tail = await view(blob, tailStart, blob.size)
  let eocd = -1
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === SIG_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive')

  let count = tail.getUint16(eocd + 10, true)
  let cdSize = tail.getUint32(eocd + 12, true)
  let cdOffset = tail.getUint32(eocd + 16, true)
  const locator = eocd - 20
  if (locator >= 0 && tail.getUint32(locator, true) === SIG_EOCD64_LOCATOR) {
    const z64Offset = Number(tail.getBigUint64(locator + 8, true))
    const z = await view(blob, z64Offset, z64Offset + 56)
    if (z.getUint32(0, true) !== SIG_EOCD64) throw new Error('Corrupt ZIP64 archive')
    count = Number(z.getBigUint64(32, true))
    cdSize = Number(z.getBigUint64(40, true))
    cdOffset = Number(z.getBigUint64(48, true))
  }

  const cd = await view(blob, cdOffset, cdOffset + cdSize)
  const utf8 = new TextDecoder()
  const entries: ZipEntry[] = []
  let p = 0
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== SIG_CENTRAL) throw new Error('Corrupt ZIP central directory')
    const flags = cd.getUint16(p + 8, true)
    const method = cd.getUint16(p + 10, true)
    const crc32 = cd.getUint32(p + 16, true)
    let compressedSize = cd.getUint32(p + 20, true)
    let size = cd.getUint32(p + 24, true)
    const nameLen = cd.getUint16(p + 28, true)
    const extraLen = cd.getUint16(p + 30, true)
    const commentLen = cd.getUint16(p + 32, true)
    let localOffset = cd.getUint32(p + 42, true)
    const name = utf8.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen))

    // ZIP64 extended information: only the fields that overflowed are present, in this order.
    let x = p + 46 + nameLen
    const extraEnd = x + extraLen
    while (x + 4 <= extraEnd) {
      const id = cd.getUint16(x, true)
      const len = cd.getUint16(x + 2, true)
      if (id === 0x0001) {
        let q = x + 4
        if (size === U32_MAX) {
          size = Number(cd.getBigUint64(q, true))
          q += 8
        }
        if (compressedSize === U32_MAX) {
          compressedSize = Number(cd.getBigUint64(q, true))
          q += 8
        }
        if (localOffset === U32_MAX) localOffset = Number(cd.getBigUint64(q, true))
      }
      x += 4 + len
    }
    if (!name.endsWith('/')) entries.push({ name, method, flags, crc32, compressedSize, size, localOffset })
    p = extraEnd + commentLen
  }
  return entries
}

let crcTable: Uint32Array | undefined
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export async function readZipEntry(blob: Blob, entry: ZipEntry): Promise<ArrayBuffer> {
  if (entry.flags & 1) throw new Error('Encrypted ZIP entries are not supported')
  const h = await view(blob, entry.localOffset, entry.localOffset + 30)
  if (h.getUint32(0, true) !== SIG_LOCAL) throw new Error('Corrupt ZIP entry header')
  // The local extra field can differ from the central one, so read its length here.
  const start = entry.localOffset + 30 + h.getUint16(26, true) + h.getUint16(28, true)
  const raw = blob.slice(start, start + entry.compressedSize)
  let data: ArrayBuffer
  if (entry.method === 0) data = await raw.arrayBuffer()
  else if (entry.method === 8) data = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()
  else throw new Error(`Unsupported ZIP compression method ${entry.method}`)
  if (crc32(new Uint8Array(data)) !== entry.crc32) throw new Error('ZIP entry is corrupt (CRC mismatch)')
  return data
}

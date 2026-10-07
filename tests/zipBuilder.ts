import { deflateRawSync, crc32 } from 'node:zlib'

/** Builds a ZIP in memory (stored or deflated entries, optional ZIP64 records) for tests. */
export function buildZip(files: { name: string; data: Uint8Array | string; store?: boolean }[], opts: { zip64?: boolean } = {}): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const push = (b: Uint8Array) => {
    chunks.push(b)
    offset += b.length
  }
  for (const f of files) {
    const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data
    const body = f.store ? raw : new Uint8Array(deflateRawSync(raw))
    const name = enc.encode(f.name)
    const crc = crc32(raw)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(8, f.store ? 0 : 8, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, body.length, true)
    local.setUint32(22, raw.length, true)
    local.setUint16(26, name.length, true)
    const localOffset = offset
    push(new Uint8Array(local.buffer))
    push(name)
    push(body)

    const extra = opts.zip64 ? new DataView(new ArrayBuffer(28)) : undefined
    if (extra) {
      extra.setUint16(0, 0x0001, true)
      extra.setUint16(2, 24, true)
      extra.setBigUint64(4, BigInt(raw.length), true)
      extra.setBigUint64(12, BigInt(body.length), true)
      extra.setBigUint64(20, BigInt(localOffset), true)
    }
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 45, true)
    c.setUint16(6, 20, true)
    c.setUint16(10, f.store ? 0 : 8, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, extra ? 0xffffffff : body.length, true)
    c.setUint32(24, extra ? 0xffffffff : raw.length, true)
    c.setUint16(28, name.length, true)
    c.setUint16(30, extra ? 28 : 0, true)
    c.setUint32(42, extra ? 0xffffffff : localOffset, true)
    central.push(new Uint8Array(c.buffer), name, ...(extra ? [new Uint8Array(extra.buffer)] : []))
  }
  const cdOffset = offset
  for (const c of central) push(c)
  const cdSize = offset - cdOffset
  if (opts.zip64) {
    const z = new DataView(new ArrayBuffer(56))
    const z64Offset = offset
    z.setUint32(0, 0x06064b50, true)
    z.setBigUint64(4, 44n, true)
    z.setBigUint64(24, BigInt(files.length), true)
    z.setBigUint64(32, BigInt(files.length), true)
    z.setBigUint64(40, BigInt(cdSize), true)
    z.setBigUint64(48, BigInt(cdOffset), true)
    push(new Uint8Array(z.buffer))
    const loc = new DataView(new ArrayBuffer(20))
    loc.setUint32(0, 0x07064b50, true)
    loc.setBigUint64(8, BigInt(z64Offset), true)
    loc.setUint32(16, 1, true)
    push(new Uint8Array(loc.buffer))
  }
  const e = new DataView(new ArrayBuffer(22))
  e.setUint32(0, 0x06054b50, true)
  e.setUint16(8, opts.zip64 ? 0xffff : files.length, true)
  e.setUint16(10, opts.zip64 ? 0xffff : files.length, true)
  e.setUint32(12, opts.zip64 ? 0xffffffff : cdSize, true)
  e.setUint32(16, opts.zip64 ? 0xffffffff : cdOffset, true)
  push(new Uint8Array(e.buffer))
  const out = new Uint8Array(offset)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  return out
}

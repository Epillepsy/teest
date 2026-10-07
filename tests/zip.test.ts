import { describe, expect, it } from 'vitest'
import { crc32 as nodeCrc32 } from 'node:zlib'
import { crc32, isZip, listZipEntries, readZipEntry } from '@/lib/zip'
import { buildZip } from './zipBuilder'

const text = (b: ArrayBuffer) => new TextDecoder().decode(b)
const big = 'lap,'.repeat(20000)

describe('zip reader', () => {
  for (const zip64 of [false, true]) {
    it(`lists and reads stored and deflated entries${zip64 ? ' (ZIP64)' : ''}`, async () => {
      const blob = new Blob([
        buildZip(
          [
            { name: 'export/activities.csv', data: 'a,b\n1,2\n', store: true },
            { name: 'export/activities/1.tcx', data: big },
            { name: 'export/media/', data: '', store: true },
          ],
          { zip64 },
        ) as Uint8Array<ArrayBuffer>,
      ])
      expect(await isZip(blob)).toBe(true)
      const entries = await listZipEntries(blob)
      expect(entries.map((e) => e.name)).toEqual(['export/activities.csv', 'export/activities/1.tcx']) // dirs skipped
      expect(entries[1].size).toBe(big.length)
      expect(entries[1].compressedSize).toBeLessThan(big.length)
      expect(text(await readZipEntry(blob, entries[0]))).toBe('a,b\n1,2\n')
      expect(text(await readZipEntry(blob, entries[1]))).toBe(big)
    })
  }

  it('detects corruption via CRC', async () => {
    const bytes = buildZip([{ name: 'a.txt', data: 'hello world', store: true }])
    bytes[30 + 5 + 2] ^= 0xff // flip a byte inside the stored data
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>])
    const [entry] = await listZipEntries(blob)
    await expect(readZipEntry(blob, entry)).rejects.toThrow(/CRC/)
  })

  it('rejects non-zip data', async () => {
    const blob = new Blob(['definitely not a zip file, just some text'])
    expect(await isZip(blob)).toBe(false)
    await expect(listZipEntries(blob)).rejects.toThrow(/Not a ZIP/)
  })

  it('crc32 matches zlib', () => {
    const data = new TextEncoder().encode(big)
    expect(crc32(data)).toBe(nodeCrc32(data))
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

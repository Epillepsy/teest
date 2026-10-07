import type { PickedFile } from './importer'

function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  // readEntries returns at most ~100 entries per call; keep reading until it returns none.
  return new Promise((resolve, reject) => {
    const out: FileSystemEntry[] = []
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(out)
        out.push(...batch)
        next()
      }, reject)
    next()
  })
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function walk(entry: FileSystemEntry, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    out.push({ file: await fileOf(entry as FileSystemFileEntry), path: entry.fullPath.replace(/^\//, '') })
  } else if (entry.isDirectory) {
    for (const child of await readAll((entry as FileSystemDirectoryEntry).createReader())) await walk(child, out)
  }
}

/**
 * Files from a drop, descending into dropped folders. Must be called synchronously inside
 * the drop handler: DataTransfer items are only readable during the event.
 */
export function filesFromDrop(dt: DataTransfer): Promise<(File | PickedFile)[]> {
  const items = Array.from(dt.items).filter((i) => i.kind === 'file')
  const entries = items.map((i) => i.webkitGetAsEntry?.() ?? null)
  if (!entries.length || entries.some((e) => e === null)) return Promise.resolve(Array.from(dt.files))
  const loose = entries.map((e, i) => (e!.isFile ? items[i].getAsFile() : null))
  return (async () => {
    const out: (File | PickedFile)[] = []
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!
      if (e.isFile && loose[i]) out.push(loose[i]!)
      else {
        const nested: PickedFile[] = []
        await walk(e, nested)
        out.push(...nested)
      }
    }
    return out
  })()
}

/** Folder picking works on desktop browsers and Android Chrome, not on iOS. */
export function supportsFolderPicker(): boolean {
  const ua = navigator.userAgent
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return !iOS && 'webkitdirectory' in document.createElement('input')
}

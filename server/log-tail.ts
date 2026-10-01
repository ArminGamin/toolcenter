import fs from 'node:fs'

const CHUNK_BYTES = 64 * 1024

/** Read recent nonempty lines without loading the entire growing log. */
export function readLastNonEmptyLines(file: string, limit: number): string[] {
  if (!Number.isFinite(limit) || limit < 1) return []
  const count = Math.floor(limit)
  const fd = fs.openSync(file, 'r')
  try {
    let position = fs.fstatSync(fd).size
    const chunks: Buffer[] = []
    let lineBytes = 0
    let endsWithCr = false
    let lines = 0
    let start = 0

    scan: while (position > 0) {
      const size = Math.min(CHUNK_BYTES, position)
      position -= size
      const chunk = Buffer.allocUnsafe(size)
      let read = 0
      while (read < size) {
        const bytes = fs.readSync(fd, chunk, read, size - read, position + read)
        // The file may have been cleared while it was being read.
        if (!bytes) return []
        read += bytes
      }
      chunks.push(chunk)
      for (let i = size - 1; i >= 0; i--) {
        const byte = chunk[i]
        if (byte === 10) {
          if (lineBytes > (endsWithCr ? 1 : 0) && ++lines === count) {
            start = i + 1
            break scan
          }
          lineBytes = 0
          endsWithCr = false
        } else {
          if (!lineBytes) endsWithCr = byte === 13
          lineBytes++
        }
      }
    }

    // Decode after joining so UTF-8 characters split across reads stay intact.
    return Buffer.concat(chunks.reverse()).subarray(start).toString('utf8')
      .split(/\r?\n/).filter(Boolean).slice(-count)
  } finally {
    fs.closeSync(fd)
  }
}

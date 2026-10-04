import { Zip, ZipDeflate } from 'fflate'
import { activityFileInfo, toFit } from './export.ts'
import { gpxChunks, type Recording } from './merge.ts'

// Compress one file at a time. Keep only compressed output, rather than all
// original exports plus the merged export and compression buffers together.
export class BackupArchive {
  private chunks: Uint8Array[] = []
  private length = 0
  private complete = false
  private zip = new Zip((error, chunk, final) => {
    if (error) throw error
    this.chunks.push(chunk)
    this.length += chunk.length
    this.complete = final
  })

  addBytes(name: string, data: Uint8Array) {
    this.add(name, [data])
  }

  addActivity(name: string, records: Recording[], title: string) {
    const info = activityFileInfo(records)
    const chunks = function* () {
      if (info.format === 'gpx') {
        const encoder = new TextEncoder()
        for (const chunk of gpxChunks(records, title)) yield encoder.encode(chunk)
      } else {
        yield toFit(records)
      }
    }
    this.add(`${name}.${info.format}`, chunks())
    return info
  }

  private add(name: string, chunks: Iterable<Uint8Array>) {
    const file = new ZipDeflate(name)
    this.zip.add(file)
    for (const chunk of chunks) {
      // Bound compression scratch buffers for FIT and metadata as well as GPX.
      for (let offset = 0; offset < chunk.length; offset += 65536)
        file.push(chunk.subarray(offset, offset + 65536))
    }
    file.push(new Uint8Array(), true)
  }

  finish(): Uint8Array<ArrayBuffer> {
    this.zip.end()
    if (!this.complete) throw new Error('The backup archive could not be completed.')
    const result = new Uint8Array(this.length)
    let offset = 0
    for (const chunk of this.chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    this.chunks = []
    return result
  }
}

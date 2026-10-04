// Synthetic data only. This measures local Node processing, not production latency.
// Run each size in a fresh process: node --import remix/node-tsx scripts/benchmark-stitches.ts 100000 gpx
import { performance } from 'node:perf_hooks'
import { randomBytes } from 'node:crypto'
import { BackupArchive } from '../app/actions/stitches/backup.ts'
import { activityFile } from '../app/actions/stitches/export.ts'
import { seal, unseal } from '../app/data/encryption.ts'
import type { Recording, Merge } from '../app/actions/stitches/merge.ts'

const count = Number(process.argv[2] ?? 50000)
const format = process.argv[3] ?? 'gpx'
if (!['gpx', 'fit'].includes(format)) throw new Error('Choose gpx or fit.')
const gps = format === 'gpx'
if (!Number.isSafeInteger(count) || count < 4 || count > 1000000 || count % 2)
  throw new Error('Choose an even sample count between 4 and 1,000,000.')
const memory = () => {
  const { heapUsed, arrayBuffers } = process.memoryUsage()
  return { heapMB: +(heapUsed / 1e6).toFixed(1), buffersMB: +(arrayBuffers / 1e6).toFixed(1) }
}
function measure<T>(stage: string, action: () => T): T {
  const start = performance.now(),
    cpu = process.cpuUsage()
  const result = action()
  const used = process.cpuUsage(cpu)
  console.log(
    JSON.stringify({
      stage,
      milliseconds: +(performance.now() - start).toFixed(1),
      cpuMs: +((used.user + used.system) / 1000).toFixed(1),
      ...memory(),
    }),
  )
  return result
}
console.log(JSON.stringify({ samples: count, format: gps ? 'gpx' : 'fit' }))
const records: Recording[] = measure('synthetic recordings', () =>
  [0, 1].map((part) => ({
    activity: {
      id: part + 1,
      name: 'Synthetic benchmark',
      sport_type: gps ? 'Ride' : 'VirtualRide',
      start_date: new Date((1790812800 + part * count) * 1000).toISOString(),
      distance: (count / 2) * 5,
      moving_time: count / 2 - 1,
      elapsed_time: count / 2 - 1,
      total_elevation_gain: 100,
    },
    points: Array.from({ length: count / 2 }, (_, i) => ({
      time: 1790812800 + part * count + i,
      ...(gps ? { lat: 10 + (i % 10000) / 100000, lon: 20 + (i % 7000) / 100000 } : {}),
      distance: i * 5.123,
      altitude: 10.123 + (i % 1000) / 10,
      heartrate: 120 + (i % 20),
      cadence: 80 + (i % 10),
      temp: 15,
    })),
  })),
)
// Construct the summary directly so candidate sizes can be profiled before changing the safety cap.
const content: Merge = {
  records,
  joins: [],
  distance: count * 5,
  moving: count - 2,
  elapsed: count * 1.5 - 1,
  elevation: 200,
  pointCount: count,
  start: records[0].activity.start_date,
  fields: ['GPS', 'timestamps', 'distance', 'altitude', 'heartrate', 'cadence', 'temp'],
}
const key = randomBytes(32)
const encrypted = measure('encrypt preview', () => seal(content, key))
console.log(JSON.stringify({ encryptedBytes: encrypted.length }))
measure('decrypt preview', () => unseal<Merge>(encrypted, key))
const stitched = measure('merged export', () => activityFile(records, 'Synthetic benchmark'))
console.log(JSON.stringify({ exportBytes: stitched.data.length }))
const archive = measure('backup generation', () => {
  const zip = new BackupArchive()
  zip.addActivity('stitched', records, 'Synthetic benchmark')
  for (const record of records)
    zip.addActivity(`source-${record.activity.id}`, [record], 'Synthetic benchmark')
  return zip.finish()
})
console.log(
  JSON.stringify({
    backupBytes: archive.length,
    maxRssMB: +(process.resourceUsage().maxRSS / 1024).toFixed(1),
  }),
)

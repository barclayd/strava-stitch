import { isSport, unavailableReason } from '../../data/sports.ts'

export type Activity = {
  id: number
  name: string
  description?: string | null
  start_date: string
  start_date_local?: string
  distance: number
  moving_time: number
  elapsed_time: number
  total_elevation_gain: number
  sport_type: string
  manual?: boolean
  trainer?: boolean
  athlete?: { id: number }
  map?: { summary_polyline?: string }
  gear_id?: string
  timezone?: string
}
export type Streams = Record<string, { data: unknown[]; original_size?: number }>
export type Point = {
  time: number
  lat?: number
  lon?: number
  altitude?: number
  distance?: number
  temp?: number
  heartrate?: number
  cadence?: number
}
export type Recording = { activity: Activity; points: Point[] }
export type Join = { seconds: number; metres: number | null; after: number; before: number }
export type Merge = {
  records: Recording[]
  joins: Join[]
  distance: number
  moving: number
  elapsed: number
  elevation: number
  pointCount: number
  start: string
  fields: string[]
}
export const maxPoints = 50000
export const mergedDescription = (merge: Merge) =>
  merge.records
    .map(({ activity }) => activity.description?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
export const hasPosition = (p: Point): p is Point & { lat: number; lon: number } =>
  finite(p.lat) && finite(p.lon)
export const fileFormat = (records: Recording[]) =>
  records.every((r) => r.points.every(hasPosition)) ? ('gpx' as const) : ('fit' as const)
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  )
export const timestamp = (n: number) => new Date(n * 1000).toISOString().replace('.000Z', 'Z')

export function separation(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180
  const q =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2
  return 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(q)))
}

export function recording(activity: Activity, streams: Streams): Recording {
  const unavailable = unavailableReason(activity)
  if (unavailable) throw new Error(unavailable)
  const times = streams.time?.data,
    gps = streams.latlng?.data
  if (!Array.isArray(times) || times.length < 2)
    throw new Error(
      'This activity has no recorded timeline to stitch. At least two timestamped samples are needed.',
    )
  if (times.length > maxPoints)
    throw new Error('This activity is too large for this version of Stitch.')
  for (const stream of Object.values(streams)) {
    if (
      !Array.isArray(stream.data) ||
      stream.data.length !== times.length ||
      (stream.original_size !== undefined && stream.original_size !== times.length)
    )
      throw new Error('Strava returned incomplete or misaligned samples. Nothing was stitched.')
  }
  const start = Date.parse(activity.start_date) / 1000
  if (
    !Number.isFinite(start) ||
    !/(Z|[+-]\d\d:\d\d)$/.test(activity.start_date) ||
    /T00:00:01Z?$/.test(activity.start_date_local ?? '')
  )
    throw new Error('The original start time is unavailable. Stitch will not invent one.')
  for (const key of ['distance', 'moving_time', 'total_elevation_gain'] as const)
    if (!finite(activity[key]) || activity[key] < 0)
      throw new Error('The activity summary is incomplete.')
  let lastTime = -1,
    lastDistance = -1
  const points = times.map((time, i) => {
    if (!finite(time) || !Number.isInteger(time) || time < 0 || time <= lastTime)
      throw new Error('Timestamps must be strictly increasing.')
    lastTime = time
    const p: Point = { time: start + time }
    if (gps !== undefined) {
      const ll = gps[i]
      if (
        !Array.isArray(ll) ||
        ll.length !== 2 ||
        !ll.every(finite) ||
        Math.abs(ll[0]) > 90 ||
        Math.abs(ll[1]) > 180
      )
        throw new Error('An activity contains an invalid GPS point.')
      p.lat = ll[0]
      p.lon = ll[1]
    }
    for (const key of ['altitude', 'distance', 'temp', 'heartrate', 'cadence'] as const) {
      const value = streams[key]?.data[i]
      if (value !== undefined && value !== null) {
        if (!finite(value)) throw new Error('An activity contains an invalid sensor sample.')
        if (key === 'distance') {
          if (value < 0 || value < lastDistance)
            throw new Error('Recorded distance moves backwards.')
          lastDistance = value
        }
        p[key] = value
      }
    }
    return p
  })
  return { activity, points }
}

export function merge(input: Recording[]): Merge {
  if (input.length < 2 || input.length > 8)
    throw new Error('Choose between two and eight activities.')
  if (new Set(input.map((r) => r.activity.id)).size !== input.length)
    throw new Error('Choose each activity only once.')
  if (input.some((r) => r.points.length < 2))
    throw new Error('Every activity needs recorded samples.')
  if (input.some((r) => !isSport(r.activity.sport_type) || r.activity.manual))
    throw new Error('Choose supported activities with recorded samples.')
  if (new Set(input.map((r) => r.activity.sport_type)).size !== 1)
    throw new Error(
      'Choose activities with the same sport type. For example, Run and Trail Run are separate sports.',
    )
  if (input.reduce((n, r) => n + r.points.length, 0) > maxPoints)
    throw new Error(
      'Choose activities with up to 50,000 recorded samples in total. No samples have been removed.',
    )
  const records = [...input].sort((a, b) => a.points[0].time - b.points[0].time)
  const joins: Join[] = []
  for (let i = 1; i < records.length; i++) {
    const previous = records[i - 1],
      next = records[i],
      a = previous.points.at(-1)!,
      b = next.points[0]
    if (b.time <= a.time)
      throw new Error(
        'These activities overlap. Review or trim the originals before stitching; no samples have been removed.',
      )
    joins.push({
      seconds: b.time - a.time,
      metres: hasPosition(a) && hasPosition(b) ? separation(a, b) : null,
      after: previous.activity.id,
      before: next.activity.id,
    })
  }
  return {
    records,
    joins,
    start: timestamp(records[0].points[0].time),
    elapsed: records.at(-1)!.points.at(-1)!.time - records[0].points[0].time,
    distance: records.reduce((n, r) => n + r.activity.distance, 0),
    moving: records.reduce((n, r) => n + r.activity.moving_time, 0),
    elevation: records.reduce((n, r) => n + r.activity.total_elevation_gain, 0),
    pointCount: records.reduce((n, r) => n + r.points.length, 0),
    fields: [
      ...(records.some((r) => r.points.some(hasPosition)) ? ['GPS'] : []),
      'timestamps',
      ...(['altitude', 'distance', 'temp', 'heartrate', 'cadence'] as const).filter((k) =>
        records.some((r) => r.points.some((p) => p[k] !== undefined)),
      ),
    ],
  }
}

export function toGpx(records: Recording[], name: string): string {
  if (fileFormat(records) !== 'gpx')
    throw new Error('Activities without GPS need a FIT file. No coordinates have been invented.')
  let offset = 0
  const useDistance = records.every((r) => r.points.every((p) => p.distance !== undefined))
  const tracks = records
    .map((r) => {
      const points = r.points
        .map((p) => {
          const distance = useDistance
            ? `<gpxdata:distance>${Math.round((offset + p.distance! - r.points[0].distance!) * 1000) / 1000}</gpxdata:distance>`
            : ''
          const sensor = (
            [
              ['temp', 'atemp'],
              ['heartrate', 'hr'],
              ['cadence', 'cad'],
            ] as const
          )
            .map(([k, tag]) => (p[k] === undefined ? '' : `<gpxtpx:${tag}>${p[k]}</gpxtpx:${tag}>`))
            .join('')
          const ext =
            distance +
            (sensor ? `<gpxtpx:TrackPointExtension>${sensor}</gpxtpx:TrackPointExtension>` : '')
          return `<trkpt lat="${p.lat}" lon="${p.lon}">${p.altitude === undefined ? '' : `<ele>${p.altitude}</ele>`}<time>${timestamp(p.time)}</time>${ext ? `<extensions>${ext}</extensions>` : ''}</trkpt>`
        })
        .join('\n')
      if (useDistance) offset += r.points.at(-1)!.distance! - r.points[0].distance!
      return `<trkseg>\n${points}\n</trkseg>`
    })
    .join('\n')
  const sport = records[0].activity.sport_type
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Stitch" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" xmlns:gpxdata="http://www.cluetrust.com/XML/GPXDATA/1/0"><metadata><name>${escape(name)}</name><desc>Stitched activities. Original timestamps and track boundaries preserved. Strava sport: ${escape(sport)}.</desc></metadata><trk><name>${escape(name)}</name><type>${sport === 'Ride' ? 'cycling' : escape(sport)}</type>${tracks}</trk></gpx>`
}

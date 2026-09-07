import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Decoder, Stream } from '@garmin/fitsdk'
import { sports, isSport } from '../../data/sports.ts'
import { activityFile, toFit } from './export.ts'
import { merge, recording, toGpx, type Activity, type Streams } from './merge.ts'

const activity = (id: number, sport_type = 'Run'): Activity => ({
  id,
  sport_type,
  name: 'Synthetic recording',
  start_date: id === 1 ? '2026-09-07T08:00:00Z' : '2026-09-07T08:05:00Z',
  distance: 20,
  moving_time: 8,
  elapsed_time: 10,
  total_elevation_gain: 2,
})
const indoor: Streams = {
  time: { data: [0, 5, 10], original_size: 3 },
  distance: { data: [2.9, 12.9, 22.9] },
  heartrate: { data: [100, 101, 102] },
  cadence: { data: [80, 80.5, 81] },
  temp: { data: [15, 16, 17] },
  altitude: { data: [10, 11, 12] },
}
const outdoor = {
  ...indoor,
  latlng: {
    data: [
      [51, -1],
      [51.001, -1],
      [51.002, -1],
    ],
  },
}
const records = (sport = 'Run', streams = indoor) => [
  recording(activity(1, sport), streams),
  recording(activity(2, sport), streams),
]

function decode(bytes: Uint8Array) {
  const decoder = new Decoder(Stream.fromByteArray(bytes))
  assert.equal(decoder.isFIT(), true)
  assert.equal(decoder.checkIntegrity(), true)
  const result = decoder.read()
  assert.deepEqual(result.errors, [])
  return result.messages
}

test('every documented sport can be stitched with and without GPS and keeps its upload type', () => {
  assert.equal(Object.keys(sports).length, 56)
  for (const sport of Object.keys(sports)) {
    for (const source of [indoor, outdoor]) {
      const m = merge(records(sport, source).reverse()),
        file = activityFile(m.records, 'Stitched')
      assert.equal(file.sport, sport)
      assert.equal(m.pointCount, 6)
      if (source === indoor) {
        assert.equal(file.format, 'fit')
        const messages = decode(file.data)
        assert.equal(messages.recordMesgs?.length, 6)
        assert.equal(messages.sportMesgs?.[0].name, sport)
        assert.equal(messages.sessionMesgs?.length, 1)
      } else {
        assert.equal(file.format, 'gpx')
        const gpx = new TextDecoder().decode(file.data)
        assert.match(gpx, new RegExp(`Strava sport: ${sport}\\.`))
        assert.equal((gpx.match(/<trkpt /g) ?? []).length, 6)
      }
    }
  }
})

test('FIT preserves timestamps, sensors, distance and recording boundaries without inventing GPS', () => {
  const m = merge(records()),
    messages = decode(activityFile(m.records, 'Indoor run').data)
  assert.deepEqual(m.fields, ['timestamps', 'altitude', 'distance', 'temp', 'heartrate', 'cadence'])
  assert.equal(m.joins[0].metres, null)
  assert.equal(m.joins[0].seconds, 290)
  const samples = messages.recordMesgs!
  assert.ok(samples.every((p) => p.positionLat === undefined && p.positionLong === undefined))
  assert.deepEqual(
    samples.map((p) => Number(p.timestamp)),
    m.records.flatMap((r) => r.points.map((p) => p.time * 1000)),
  )
  assert.deepEqual(
    samples.map((p) => p.distance),
    [0, 10, 20, 20, 30, 40],
  )
  assert.deepEqual(
    samples.map((p) => p.heartRate),
    [100, 101, 102, 100, 101, 102],
  )
  assert.deepEqual(
    samples.map((p) => p.temperature),
    [15, 16, 17, 15, 16, 17],
  )
  assert.deepEqual(
    samples.map((p) => p.enhancedAltitude),
    [10, 11, 12, 10, 11, 12],
  )
  assert.deepEqual(
    samples.map((p) => p.cadence),
    [80, 80, 81, 80, 80, 81],
  )
  assert.equal(samples[1].fractionalCadence, 0.5)
  assert.deepEqual(
    messages.eventMesgs?.map((p) => p.eventType),
    ['start', 'stopAll', 'start', 'stopAll'],
  )
  assert.deepEqual(
    messages.eventMesgs?.map((p) => Number(p.timestamp)),
    [samples[0], samples[2], samples[3], samples[5]].map((p) => Number(p.timestamp)),
  )
  assert.deepEqual(
    messages.lapMesgs?.map((p) => p.totalTimerTime),
    [10, 10],
  )
  assert.equal(messages.sessionMesgs?.[0].sport, 'running')
  assert.equal(messages.sessionMesgs?.[0].totalElapsedTime, 310)
  assert.equal(messages.sessionMesgs?.[0].totalTimerTime, 20)
  assert.equal(messages.sessionMesgs?.[0].totalDistance, 40)
  assert.equal(messages.activityMesgs?.[0].numSessions, 1)
  assert.throws(() => toGpx(m.records, 'No GPS'), /FIT/)
})

test('time-only workouts and mixed GPS availability keep every sample and omit missing fields', () => {
  const timeOnly = { time: indoor.time }
  const workout = decode(toFit(records('Workout', timeOnly)))
  assert.equal(workout.recordMesgs?.length, 6)
  assert.ok(
    workout.recordMesgs?.every((p) => p.distance === undefined && p.heartRate === undefined),
  )
  assert.equal(workout.sessionMesgs?.[0].totalDistance, 40)
  const mixed = merge([recording(activity(1), indoor), recording(activity(2), outdoor)])
  const file = activityFile(mixed.records, 'Run'),
    samples = decode(file.data).recordMesgs!
  assert.equal(file.format, 'fit')
  assert.equal(samples.filter((p) => p.positionLat !== undefined).length, 3)
  assert.equal(mixed.joins[0].metres, null)
  assert.ok(Math.abs((Number(samples[3].positionLat) * 180) / 2 ** 31 - 51) < 0.000001)
  const missing = structuredClone(indoor)
  missing.heartrate.data[1] = null
  assert.equal(decode(toFit(records('Yoga', missing))).recordMesgs?.[1].heartRate, undefined)
})

test('manual entries, absent timelines, partial data and different sports cannot be stitched', () => {
  assert.equal(isSport('__proto__'), false)
  assert.throws(() => recording({ ...activity(1), manual: true }, indoor), /Manual entry/)
  assert.throws(() => recording(activity(1, 'NewSport'), indoor), /not yet supported/)
  for (const source of [{}, { time: { data: [0] } }, { heartrate: indoor.heartrate }] as Streams[])
    assert.throws(() => recording(activity(1), source), /recorded timeline/)
  for (const source of [
    { ...indoor, heartrate: { data: [100] } },
    { ...indoor, latlng: { data: [] } },
    { ...outdoor, latlng: { data: [[51, -1], null, [51, -1]] } },
  ])
    assert.throws(() => recording(activity(1), source), /incomplete|invalid/)
  assert.throws(
    () => merge([recording(activity(1), indoor), recording(activity(2, 'TrailRun'), indoor)]),
    /same sport/,
  )
  assert.throws(
    () => merge([recording(activity(1), indoor), recording({ ...activity(1), id: 2 }, indoor)]),
    /overlap/,
  )
})

test('FIT rejects out-of-range values before they can wrap or disappear', () => {
  for (const [key, value] of [
    ['heartrate', 255],
    ['cadence', 255],
    ['temp', 127],
    ['altitude', -501],
    ['time', 0],
  ] as const) {
    const source = records()
    source[0].points[0][key] = value
    assert.throws(() => activityFile(source, 'Invalid'), /cannot be represented/)
  }
  const source = records()
  source[1].points[2].distance = 42949673
  assert.throws(() => toFit(source), /distance/)
})

test('FIT preserves the full 50,000-sample limit and rejects larger stitches', () => {
  const source: Streams = {
    time: { data: Array.from({ length: 25000 }, (_, i) => i) },
    distance: { data: Array.from({ length: 25000 }, (_, i) => i * 5) },
    heartrate: { data: Array.from({ length: 25000 }, () => 120) },
  }
  const a = recording(activity(1, 'VirtualRide'), source),
    b = recording({ ...activity(2, 'VirtualRide'), start_date: '2026-09-07T18:00:00Z' }, source),
    m = merge([b, a]),
    samples = decode(activityFile(m.records, 'Long virtual ride').data).recordMesgs!
  assert.equal(samples.length, 50000)
  assert.equal(Number(samples.at(-1)!.timestamp), b.points.at(-1)!.time * 1000)
  assert.equal(samples.at(-1)!.distance, 249990)
  b.points.push({ ...b.points.at(-1)!, time: b.points.at(-1)!.time + 1 })
  assert.throws(() => merge([a, b]), /50,000/)
})

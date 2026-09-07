import { test } from 'node:test'
import assert from 'node:assert/strict'
import { merge, recording, toGpx, type Activity, type Streams } from './merge.ts'

const detail = (id: number, start: string): Activity => ({
  id,
  name: 'Ride & <test>',
  start_date: start,
  sport_type: 'Ride',
  distance: 20,
  moving_time: 10,
  elapsed_time: 10,
  total_elevation_gain: 2,
})
const streams: Streams = {
  time: { data: [0, 5, 10], original_size: 3 },
  latlng: {
    data: [
      [51, -1],
      [51.001, -1],
      [51.002, -1],
    ],
  },
  distance: { data: [2.9, 12.9, 22.9] },
  temp: { data: [15, 16, 17] },
  altitude: { data: [10, 11, 12] },
}
export function fixture() {
  return [
    recording(detail(101, '2026-09-06T08:15:00Z'), streams),
    recording(detail(102, '2026-09-06T08:18:18Z'), streams),
  ]
}

test('preserves samples, chronological order, stop, extensions, and normalized cumulative distance', () => {
  const records = fixture(),
    m = merge(records.reverse()),
    gpx = toGpx(m.records, 'A & B <ride>')
  assert.deepEqual(
    m.records.map((r) => r.activity.id),
    [101, 102],
  )
  assert.equal(m.joins[0].seconds, 188)
  assert.equal(m.pointCount, 6)
  assert.equal((gpx.match(/<trkseg>/g) ?? []).length, 2)
  assert.deepEqual(
    [...gpx.matchAll(/<gpxdata:distance>(.*?)<\/gpxdata:distance>/g)].map((r) => Number(r[1])),
    [0, 10, 20, 20, 30, 40],
  )
  assert.match(gpx, /A &amp; B &lt;ride&gt;/)
  assert.match(gpx, /<gpxtpx:atemp>17<\/gpxtpx:atemp>/)
  assert.deepEqual(
    [...gpx.matchAll(/<time>(.*?)<\/time>/g)].map((r) => Date.parse(r[1]) / 1000),
    m.records.flatMap((r) => r.points.map((p) => p.time)),
  )
})
test('rejects repeated activities, overlapping times, inconsistent sports, invalid or partial streams', () => {
  const records = fixture()
  assert.throws(() => merge([records[0], records[0]]), /once/)
  const overlap = recording(detail(103, '2026-09-06T08:15:10Z'), streams)
  assert.throws(() => merge([records[0], overlap]), /overlap/)
  assert.throws(
    () =>
      recording(detail(103, '2026-09-06T08:15:10Z'), {
        ...streams,
        time: { data: [0, 5, 10], original_size: 10 },
      }),
    /incomplete/,
  )
  assert.throws(
    () =>
      recording(detail(103, '2026-09-06T08:15:10Z'), { ...streams, time: { data: [0, 0, 10] } }),
    /strictly/,
  )
  assert.throws(
    () =>
      recording(detail(103, '2026-09-06T08:15:10Z'), {
        ...streams,
        latlng: {
          data: [
            [NaN, 0],
            [0, 0],
            [0, 0],
          ],
        },
      }),
    /invalid/,
  )
  assert.throws(
    () =>
      recording(detail(103, '2026-09-06T08:15:10Z'), {
        ...streams,
        distance: { data: [0, 10, 5] },
      }),
    /backwards/,
  )
  const other = { ...records[1], activity: { ...records[1].activity, sport_type: 'EBikeRide' } }
  assert.throws(() => merge([records[0], other]), /same sport/)
})

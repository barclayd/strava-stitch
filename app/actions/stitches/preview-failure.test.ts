import { test } from 'node:test'
import assert from 'node:assert/strict'
import { previewFailureReason } from './preview-failure.ts'
import { StravaError } from '../../data/strava.ts'
import {
  merge,
  recording,
  maxPoints,
  validateRecordingActivity,
  RecordingValidationError,
  type Activity,
  type Streams,
} from './merge.ts'
import { createAnalytics } from '../../data/analytics.ts'
import type { RecordingFailureReason } from '../../analytics.ts'

const activity: Activity = {
  id: 101,
  name: 'Synthetic activity',
  sport_type: 'Ride',
  start_date: '2026-09-30T08:00:00Z',
  distance: 10,
  moving_time: 10,
  elapsed_time: 10,
  total_elevation_gain: 0,
}
const streams: Streams = { time: { data: [0, 10] } }

const invalidRecordings: {
  name: string
  reason: RecordingFailureReason
  activity?: Partial<Activity>
  streams?: Streams
}[] = [
  { name: 'manual entry', reason: 'manual_activity', activity: { manual: true } },
  { name: 'unsupported sport', reason: 'unsupported_sport', activity: { sport_type: 'Unknown' } },
  { name: 'missing timeline', reason: 'missing_timeline', streams: {} },
  { name: 'one sample', reason: 'missing_timeline', streams: { time: { data: [0] } } },
  {
    name: 'too many samples',
    reason: 'sample_limit',
    streams: { time: { data: Array.from({ length: maxPoints + 1 }, (_, i) => i) } },
  },
  {
    name: 'mismatched stream lengths',
    reason: 'misaligned_streams',
    streams: { ...streams, altitude: { data: [0] } },
  },
  {
    name: 'incomplete original stream',
    reason: 'misaligned_streams',
    streams: { time: { data: [0, 10], original_size: 3 } },
  },
  { name: 'invalid start time', reason: 'missing_start_time', activity: { start_date: 'invalid' } },
  {
    name: 'start time without timezone',
    reason: 'missing_start_time',
    activity: { start_date: '2026-09-30T08:00:00' },
  },
  {
    name: 'unreliable local start time',
    reason: 'missing_start_time',
    activity: { start_date_local: '2026-09-30T00:00:01Z' },
  },
  { name: 'invalid summary', reason: 'incomplete_summary', activity: { distance: NaN } },
  { name: 'negative summary', reason: 'incomplete_summary', activity: { moving_time: -1 } },
  {
    name: 'repeated timestamp',
    reason: 'invalid_timestamp',
    streams: { time: { data: [0, 0] } },
  },
  {
    name: 'fractional timestamp',
    reason: 'invalid_timestamp',
    streams: { time: { data: [0, 0.5] } },
  },
  {
    name: 'invalid GPS',
    reason: 'invalid_gps',
    streams: {
      ...streams,
      latlng: {
        data: [
          [91, 0],
          [0, 0],
        ],
      },
    },
  },
  {
    name: 'invalid sensor',
    reason: 'invalid_sensor',
    streams: { ...streams, heartrate: { data: [NaN, 100] } },
  },
  {
    name: 'distance moving backwards',
    reason: 'distance_backwards',
    streams: { ...streams, distance: { data: [10, 5] } },
  },
]

for (const invalid of invalidRecordings) {
  test(`preview diagnostics identify ${invalid.name} without recording activity details`, () => {
    const points: AnalyticsEngineDataPoint[] = []
    const analytics = createAnalytics({
      ANALYTICS_ENABLED: 'true',
      FUNNEL: {
        writeDataPoint: (point) => {
          if (point) points.push(point)
        },
      },
    })
    assert.throws(
      () => recording({ ...activity, ...invalid.activity }, invalid.streams ?? streams),
      (error: unknown) => {
        assert.ok(error instanceof RecordingValidationError)
        const reason = previewFailureReason(error, 'recording_validation')
        assert.equal(reason, invalid.reason)
        analytics.track('preview_failed', 'workspace', 'unknown', reason)
        return true
      },
    )
    assert.deepEqual(points, [
      {
        indexes: ['preview_failed'],
        blobs: ['preview_failed', 'workspace', 'unknown', 'v1', invalid.reason, 'unknown'],
        doubles: [1],
      },
    ])
  })
}

test('activity prechecks use the same reason before streams are requested', () => {
  for (const [overrides, reason] of [
    [{ manual: true }, 'manual_activity'],
    [{ sport_type: 'Unknown' }, 'unsupported_sport'],
  ] as const) {
    assert.throws(
      () => validateRecordingActivity({ ...activity, ...overrides }),
      (error: unknown) => {
        assert.equal(previewFailureReason(error, 'recording_validation'), reason)
        return true
      },
    )
  }
})

test('the combined sample limit reports its reason and still accepts the exact boundary', () => {
  const pair = (length: number) => [
    recording(activity, { time: { data: Array.from({ length }, (_, i) => i) } }),
    recording(
      { ...activity, id: 102, start_date: '2026-10-01T08:00:00Z' },
      { time: { data: Array.from({ length }, (_, i) => i) } },
    ),
  ]
  assert.equal(merge(pair(maxPoints / 2)).pointCount, maxPoints)
  assert.throws(
    () => merge(pair(maxPoints / 2 + 1)),
    (error: unknown) => {
      assert.equal(previewFailureReason(error, 'merge_validation'), 'sample_limit')
      return true
    },
  )
})

test('unexpected errors retain the stage and specific reasons never come from messages', () => {
  for (const error of [
    new Error('An activity contains an invalid GPS point.'),
    Object.assign(new Error('private details'), { reason: 'invalid_gps' }),
    null,
  ])
    assert.equal(previewFailureReason(error, 'recording_validation'), 'recording_validation')
  const error = new RecordingValidationError('invalid_gps', 'private details')
  assert.equal(previewFailureReason(error, 'recording_validation'), 'invalid_gps')
  assert.equal(previewFailureReason(error, 'save_failed'), 'save_failed')
  assert.equal(previewFailureReason(error, 'export_failed'), 'export_failed')
})

test('preview diagnostics distinguish Strava failures and never return raw messages', () => {
  assert.equal(
    previewFailureReason(new StravaError(429, 'private'), 'activity_load'),
    'strava_rate_limit',
  )
  assert.equal(
    previewFailureReason(new StravaError(401, 'private'), 'streams_load'),
    'strava_connection',
  )
  assert.equal(
    previewFailureReason(new StravaError(404, 'private'), 'activity_load'),
    'strava_unavailable',
  )
  assert.equal(
    previewFailureReason(new Error('secret GPS, tokens and title'), 'save_failed'),
    'save_failed',
  )
  assert.equal(previewFailureReason(null, 'streams_load'), 'streams_load')
})

test('actual overlap and mismatched-sport errors have distinct, fixed reasons', () => {
  const record = (id: number, sport_type: string) =>
    recording(
      {
        id,
        name: 'Private activity',
        sport_type,
        start_date: '2026-09-06T08:00:00Z',
        distance: 10,
        moving_time: 10,
        elapsed_time: 10,
        total_elevation_gain: 0,
      },
      { time: { data: [0, 10] } },
    )
  for (const [sport, expected] of [
    ['Ride', 'overlapping_activities'],
    ['Run', 'different_sports'],
  ] as const) {
    assert.throws(
      () => merge([record(1, 'Ride'), record(2, sport)]),
      (error: unknown) => {
        assert.equal(previewFailureReason(error, 'merge_validation'), expected)
        return true
      },
    )
  }
})

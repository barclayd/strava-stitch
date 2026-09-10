import { test } from 'node:test'
import assert from 'node:assert/strict'
import { previewFailureReason } from './preview-failure.ts'
import { StravaError } from '../../data/strava.ts'
import { merge, recording } from './merge.ts'

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

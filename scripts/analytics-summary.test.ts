import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyticsDeviceSummary, analyticsSummary, type AnalyticsRow } from './analytics-summary.ts'

test('real outcomes stay separate from embedded demos, reconnects, and upload attempts', () => {
  const summary = analyticsSummary([
    { event: 'preview_created', page: 'workspace', placement: 'home', total: '2' },
    { event: 'activity_downloaded', page: 'preview', placement: 'unknown', total: 3 },
    { event: 'activity_downloaded', page: 'preview', placement: 'preview', total: '4' },
    { event: 'backup_downloaded', page: 'preview', placement: 'unknown', total: 1 },
    { event: 'upload_completed', page: 'preview', placement: 'unknown', total: 1 },
    { event: 'upload_started', page: 'preview', placement: 'unknown', total: 5 },
    { event: 'upload_duplicate', page: 'preview', placement: 'unknown', total: 4 },
    { event: 'strava_connected', page: 'workspace', placement: 'example', total: 6 },
    { event: 'example_review_click', page: 'home', placement: 'example', total: 20 },
    { event: 'example_review_click', page: 'example', placement: 'example', total: '10' },
    { event: 'example_downloaded', page: 'example', placement: 'unknown', total: 100 },
  ])
  assert.deepEqual(
    summary.outcomes.map((row) => row.events),
    [2, 7, 1, 1],
  )
  assert.equal(summary.demo.find((row) => row.step === 'Example review-step clicks')?.events, 30)
  assert.equal(summary.demo.find((row) => row.step === 'Sample files served')?.events, 100)
  assert.equal(
    summary.acquisition.find((row) => row.step.includes('including reconnects'))?.events,
    6,
  )
  assert.equal(summary.acquisition.find((row) => row.step === 'Duplicate uploads')?.events, 4)
  for (const group of Object.values(analyticsSummary([])))
    assert.ok(group.every((row) => row.events === 0))
})

test('device reports isolate historical events, aggregate placements, and use real server outcomes', () => {
  const row = (
    device: string | undefined,
    event: string,
    total: number | string,
  ): AnalyticsRow => ({
    device,
    event,
    total,
    page: 'workspace',
    placement: 'unknown',
  })
  const rows = [
    row('mobile', 'page_view', 10),
    row('mobile', 'strava_connect_started', 4),
    row('mobile', 'strava_connected', '3'),
    row('mobile', 'preview_created', 2),
    { ...row('mobile', 'preview_created', '1'), placement: 'home' },
    row('mobile', 'preview_failed', 1),
    row('mobile', 'upload_started', 2),
    row('mobile', 'upload_completed', 1),
    row('mobile', 'example_review_click', 100),
    row('mobile', 'example_downloaded', 100),
    row('mobile', 'upload_click', 100),
    row('desktop', 'page_view', 20),
    row('desktop', 'strava_connect_started', 2),
    row('desktop', 'strava_connected', 2),
    row('desktop', 'preview_created', 1),
    row('desktop', 'upload_started', 1),
    row('desktop', 'upload_completed', 1),
    row('unknown', 'preview_created', 1),
    row('unexpected', 'preview_created', 1),
    row('', 'upload_completed', 4),
    row(undefined, 'upload_completed', 3),
  ]
  const { counts, rates } = analyticsDeviceSummary(rows)
  assert.deepEqual(counts[0], {
    device: 'mobile',
    pageViews: 10,
    connectionsStarted: 4,
    connectionsCompleted: 3,
    previewsCreated: 3,
    previewsFailed: 1,
    uploadsStarted: 2,
    uploadsCompleted: 1,
  })
  assert.deepEqual(rates[0], {
    device: 'mobile',
    connectionCompletion: 75,
    previewSuccess: 75,
    uploadsPerPreview: 200 / 3,
    uploadCompletion: 50,
  })
  assert.deepEqual(rates[1], {
    device: 'desktop',
    connectionCompletion: 100,
    previewSuccess: 100,
    uploadsPerPreview: 100,
    uploadCompletion: 100,
  })
  assert.equal(counts.find((row) => row.device === 'unknown')?.previewsCreated, 2)
  assert.equal(counts.find((row) => row.device === 'not_recorded')?.uploadsCompleted, 7)
  assert.equal(
    rates.some((row) => row.device === 'not_recorded'),
    false,
  )
  assert.equal(
    counts.reduce((sum, row) => sum + row.uploadsCompleted, 0),
    9,
  )
  assert.equal(
    analyticsSummary(rows).outcomes.find((row) => row.step === 'Uploads completed')?.events,
    9,
  )
})

test('empty denominators stay unavailable and delayed outcomes are never clamped to 100%', () => {
  const { counts, rates } = analyticsDeviceSummary([])
  assert.equal(counts.length, 4)
  for (const row of rates) {
    assert.equal(row.connectionCompletion, null)
    assert.equal(row.previewSuccess, null)
    assert.equal(row.uploadsPerPreview, null)
    assert.equal(row.uploadCompletion, null)
  }
  const rows = [
    {
      device: 'mobile',
      event: 'upload_completed',
      page: 'preview',
      placement: 'unknown',
      total: 2,
    },
  ]
  assert.equal(analyticsDeviceSummary(rows).rates[0].uploadCompletion, null)
  rows.push({ ...rows[0], event: 'upload_started', total: 1 })
  assert.equal(analyticsDeviceSummary(rows).rates[0].uploadCompletion, 200)
})

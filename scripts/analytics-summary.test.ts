import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyticsSummary } from './analytics-summary.ts'

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

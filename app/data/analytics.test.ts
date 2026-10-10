import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAnalytics, receiveAnalytics } from './analytics.ts'
import {
  connectionFailureReasons,
  previewFailureReasons,
  type AnalyticsFailureReason,
  type PreviewFailureReason,
} from '../analytics.ts'

const origin = 'https://stravastitch.com'
const point = { event: 'connect_click', page: 'home', placement: 'header' }
const request = (body: unknown = point, headers: Record<string, string> = {}) =>
  new Request(origin + '/analytics', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
function fixture(enabled: 'true' | 'false' = 'true', req?: Request) {
  const points: AnalyticsEngineDataPoint[] = []
  const analytics = createAnalytics(
    {
      ANALYTICS_ENABLED: enabled,
      FUNNEL: {
        writeDataPoint(point) {
          if (point) points.push(point)
        },
      },
    },
    req,
  )
  return { analytics, points }
}

test('analytics stores only fixed event dimensions, with no request or account identifiers', async () => {
  const req = request(point, {
    Cookie: 'session=private',
    Referer: origin + '/stitches/private-id?title=private',
    'CF-Connecting-IP': '192.0.2.1',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) Mobile/15E148 private',
  })
  const { analytics, points } = fixture('true', req)
  const response = await receiveAnalytics(req, analytics)
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.match(response.headers.get('x-robots-tag')!, /noindex/)
  assert.deepEqual(points, [
    {
      indexes: ['connect_click'],
      blobs: ['connect_click', 'home', 'header', 'v1', '', 'mobile'],
      doubles: [1],
    },
  ])
  analytics.track('strava_connected', 'workspace', 'header')
  assert.deepEqual(points[1].blobs, ['strava_connected', 'workspace', 'header', 'v1', '', 'mobile'])
  assert.doesNotMatch(JSON.stringify(points), /private|Mozilla|192\.0\.2\.1/)
})

test('browser events cannot forge conversions, attach personal data, or post from another origin', async () => {
  const { analytics, points } = fixture()
  for (const invalid of [
    { ...point, event: 'upload_completed' },
    { ...point, event: 'strava_connected' },
    { ...point, event: 'strava_connect_failed', reason: 'missing_code' },
    { ...point, page: '/stitches/private-id' },
    { ...point, placement: 'private title' },
    { ...point, athleteId: 123 },
    { ...point, device: 'desktop' },
    { ...point, reason: 'private message' },
    { ...point, url: origin + '?private' },
    null,
    [point],
  ])
    assert.equal((await receiveAnalytics(request(invalid), analytics)).status, 400)
  for (const Origin of ['', 'https://another-site.test', 'null'])
    assert.equal((await receiveAnalytics(request(point, { Origin }), analytics)).status, 403)
  assert.equal(
    (await receiveAnalytics(request(point, { 'Content-Type': 'text/plain' }), analytics)).status,
    415,
  )
  assert.equal((await receiveAnalytics(new Request(origin + '/analytics'), analytics)).status, 405)
  // The actual stream is bounded even when Content-Length is absent or misleading.
  assert.equal(
    (
      await receiveAnalytics(
        request({ padding: 'x'.repeat(513) }, { 'Content-Length': '1' }),
        analytics,
      )
    ).status,
    413,
  )
  assert.equal(points.length, 0)
})

test('disabled environments and browser privacy signals suppress both browser and server events', async () => {
  const head = fixture('true', new Request(origin + '/example/download', { method: 'HEAD' }))
  head.analytics.track('example_downloaded', 'example')
  assert.equal(head.analytics.enabled, false)
  assert.deepEqual(head.points, [])
  for (const [enabled, headers] of [
    ['false', {}],
    ['true', { DNT: '1' }],
    ['true', { 'Sec-GPC': '1' }],
    ['true', { Cookie: 'stitch_session=private; stitch_analytics_opt_out=1; another=value' }],
  ] as const) {
    const req = request(point, { ...headers, 'Sec-CH-UA-Mobile': '?1' }),
      { analytics, points } = fixture(enabled, req)
    assert.equal(analytics.enabled, false)
    await receiveAnalytics(req, analytics)
    analytics.track('upload_completed', 'preview')
    analytics.track('preview_failed', 'workspace', 'unknown', 'strava_rate_limit')
    for (const reason of previewFailureReasons)
      analytics.track('preview_failed', 'workspace', 'unknown', reason)
    for (const reason of connectionFailureReasons)
      analytics.track('strava_connect_failed', 'home', 'header', reason)
    assert.deepEqual(points, [])
  }
})

test('connection reasons are allowlisted per event and cannot expose arbitrary error details', () => {
  const { analytics, points } = fixture()
  for (const reason of connectionFailureReasons) {
    analytics.track('strava_connect_failed', 'home', 'header', reason)
    assert.deepEqual(points.at(-1)?.blobs, [
      'strava_connect_failed',
      'home',
      'header',
      'v1',
      reason,
      'unknown',
    ])
  }
  for (const reason of [
    'overlapping_activities',
    'secret-code-and-token',
  ] as AnalyticsFailureReason[]) {
    analytics.track('strava_connect_failed', 'home', 'header', reason)
    assert.deepEqual(points.at(-1)?.blobs, [
      'strava_connect_failed',
      'home',
      'header',
      'v1',
      '',
      'unknown',
    ])
  }
  for (const event of ['strava_connected', 'strava_connect_cancelled', 'preview_failed'] as const) {
    analytics.track(event, 'home', 'header', 'missing_code')
    assert.deepEqual(points.at(-1)?.blobs, [event, 'home', 'header', 'v1', '', 'unknown'])
  }
})

test('only allowlisted preview reasons enter the diagnostic dimension', () => {
  const { analytics, points } = fixture()
  for (const reason of previewFailureReasons) {
    analytics.track('preview_failed', 'workspace', 'unknown', reason)
    assert.deepEqual(points.at(-1)?.blobs, [
      'preview_failed',
      'workspace',
      'unknown',
      'v1',
      reason,
      'unknown',
    ])
  }
  analytics.track('preview_failed', 'workspace', 'unknown', 'private error' as PreviewFailureReason)
  assert.deepEqual(points.at(-1)?.blobs, [
    'preview_failed',
    'workspace',
    'unknown',
    'v1',
    '',
    'unknown',
  ])
  analytics.track('strava_connected', 'workspace', 'unknown', 'strava_connection')
  assert.deepEqual(points.at(-1)?.blobs, [
    'strava_connected',
    'workspace',
    'unknown',
    'v1',
    '',
    'unknown',
  ])
  analytics.track('strava_connect_failed', 'home', 'header', 'invalid_gps')
  assert.deepEqual(points.at(-1)?.blobs, [
    'strava_connect_failed',
    'home',
    'header',
    'v1',
    '',
    'unknown',
  ])
})

test('device attribution stays request-scoped and occupies the same slot on every outcome', () => {
  const mobile = fixture('true', request(point, { 'Sec-CH-UA-Mobile': '?1' }))
  const desktop = fixture(
    'true',
    request(point, {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15',
    }),
  )
  const unknown = fixture()
  for (const [f, device] of [
    [mobile, 'mobile'],
    [desktop, 'desktop'],
    [unknown, 'unknown'],
  ] as const) {
    f.analytics.track('preview_created', 'workspace')
    f.analytics.track('preview_failed', 'workspace', 'unknown', 'sample_limit')
    f.analytics.track('upload_started', 'preview')
    f.analytics.track('upload_completed', 'preview')
    f.analytics.track('upload_failed', 'preview')
    assert.deepEqual(
      f.points.map((point) => point.blobs?.slice(4)),
      [
        ['', device],
        ['sample_limit', device],
        ['', device],
        ['', device],
        ['', device],
      ],
    )
  }
})

test('an exclusion affects only the browser that sends the exact preference', () => {
  for (const cookie of ['', 'stitch_analytics_opt_out=0', 'other_stitch_analytics_opt_out=1']) {
    const { analytics, points } = fixture('true', request(point, { Cookie: cookie }))
    analytics.track('activity_downloaded', 'preview')
    assert.equal(points.length, 1)
  }
  for (const path of [
    '/auth/strava/callback?code=private',
    '/stitches/test/download',
    '/stitches/test/status',
  ]) {
    const { analytics, points } = fixture(
      'true',
      new Request(origin + path, {
        headers: { Cookie: 'stitch_analytics_opt_out=1' },
      }),
    )
    analytics.track('strava_connected', 'workspace')
    analytics.track('activity_downloaded', 'preview')
    analytics.track('upload_completed', 'preview')
    assert.deepEqual(points, [])
  }
})

test('a failed analytics binding does not interrupt the application or reveal error contents', (t) => {
  const warning = t.mock.method(console, 'warn', () => {})
  const analytics = createAnalytics({
    ANALYTICS_ENABLED: 'true',
    FUNNEL: {
      writeDataPoint() {
        throw new Error('private internal failure')
      },
    },
  })
  assert.doesNotThrow(() => analytics.track('preview_created', 'workspace'))
  assert.deepEqual(warning.mock.calls[0].arguments, ['{"event":"analytics_unavailable"}'])
})

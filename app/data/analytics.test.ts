import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAnalytics, receiveAnalytics } from './analytics.ts'

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
  })
  const { analytics, points } = fixture('true', req)
  const response = await receiveAnalytics(req, analytics)
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.match(response.headers.get('x-robots-tag')!, /noindex/)
  assert.deepEqual(points, [
    { indexes: ['connect_click'], blobs: ['connect_click', 'home', 'header', 'v1'], doubles: [1] },
  ])
  analytics.track('strava_connected', 'workspace', 'header')
  assert.deepEqual(points[1].blobs, ['strava_connected', 'workspace', 'header', 'v1'])
})

test('browser events cannot forge conversions, attach personal data, or post from another origin', async () => {
  const { analytics, points } = fixture()
  for (const invalid of [
    { ...point, event: 'upload_completed' },
    { ...point, event: 'strava_connected' },
    { ...point, page: '/stitches/private-id' },
    { ...point, placement: 'private title' },
    { ...point, athleteId: 123 },
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
  ] as const) {
    const req = request(point, headers),
      { analytics, points } = fixture(enabled, req)
    assert.equal(analytics.enabled, false)
    await receiveAnalytics(req, analytics)
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

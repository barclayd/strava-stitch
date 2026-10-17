import assert from 'node:assert/strict'
import { test } from 'node:test'
import { receiveStravaWebhook } from '../actions/webhooks/controller.ts'
import { rideOnRequest } from './ride-on.ts'
import { rideOnEvent, type RideOnEvent } from './ride-on-events.ts'
import { withRuntime, type Runtime } from './runtime.ts'
import type { Account } from './store.ts'

const grant = '05f40f9b-96fc-436d-a68f-bf1ef6aee083'
const unexpected = (): never => {
  throw new Error('Unexpected runtime operation')
}
const context = () => {
  let account: Account | undefined = {
    id: 123,
    firstname: 'Synthetic',
    scope: ['activity:read_all'],
    access_token: 'test-access',
    refresh_token: 'test-refresh',
    expires_at: 2000000000,
    connectionId: grant,
  }
  let verified = 0
  const value: Runtime = {
    config: {
      clientId: '262735',
      clientSecret: 'synthetic-secret',
      origin: 'https://stravastitch.com',
      sessionSecret: 's'.repeat(40),
      encryptionKey: Buffer.alloc(32, 1),
      webhookToken: 'test',
      webhookSubscription: '99',
    },
    store: {
      account: async () => account,
      credentials: async () => account,
      verifyDeauthorization: async () => {
        verified++
      },
      invalidateAccount: async () => {
        account = undefined
      },
      saveAccount: unexpected,
      forgetAccount: unexpected,
      newJob: unexpected,
      job: unexpected,
      jobs: unexpected,
      patchJob: unexpected,
      claimUpload: unexpected,
    },
    sessions: { read: unexpected, save: unexpected },
    analytics: { enabled: false, track: unexpected },
  }
  return {
    value,
    setAccount: (next: Account | undefined) => {
      account = next
    },
    account: () => account,
    verified: () => verified,
  }
}
test('bounded import pages and transient geometry expose only requested ride metrics and verify ownership/generation', async () => {
  const c = context(),
    original = globalThis.fetch
  const call = (path: string) =>
    withRuntime(c.value, () => rideOnRequest(new Request('https://internal' + path)))
  let detailStatus = 200,
    streamStatus = 200,
    owner = 123,
    privateRide = false,
    changeGrant = false,
    power: number | null = 210
  const calls: string[] = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    calls.push(url.pathname + url.search)
    assert.equal(url.origin, 'https://www.strava.com')
    if (url.pathname === '/api/v3/athlete/activities') {
      assert.equal(url.searchParams.get('after'), '100')
      assert.equal(url.searchParams.get('before'), '200')
      return Response.json(
        Array.from({ length: 30 }, (_, i) => ({
          id: 1000 + i,
          athlete: { id: owner },
          sport_type: i === 0 ? 'Ride' : 'Run',
          map: { summary_polyline: 'not-forwarded' },
        })),
      )
    }
    if (url.pathname === '/api/v3/activities/456') {
      if (detailStatus !== 200) return new Response(null, { status: detailStatus })
      return Response.json({
        id: 456,
        athlete: { id: owner },
        sport_type: 'Ride',
        start_date: '2026-10-01T09:00:00Z',
        private: privateRide,
        average_speed: 8,
        total_elevation_gain: 300,
        average_watts: power,
        device_watts: true,
        name: 'Not retained',
        description: 'Not retained',
        heart_rate: 150,
      })
    }
    assert.equal(url.pathname, '/api/v3/activities/456/streams')
    assert.equal(url.search, '?keys=latlng&key_by_type=true')
    if (changeGrant) c.setAccount({ ...c.account()!, connectionId: crypto.randomUUID() })
    return streamStatus === 200
      ? Response.json({
          latlng: {
            data: [
              [51, -1],
              [51.001, -1],
            ],
          },
        })
      : new Response(null, { status: streamStatus })
  }
  try {
    const page = await call(`/import-page/123?grant=${grant}&after=100&before=200&page=1`)
    assert.equal(page.status, 200)
    assert.deepEqual(await page.json(), { activityIds: ['1000'], nextPage: 2 })
    assert.equal((await call(`/import-page/123?grant=${grant}&after=200&before=100`)).status, 400)
    const path = `/import-activity/123?grant=${grant}&activity=456`
    const response = await call(path)
    assert.equal(response.status, 200)
    const text = await response.text()
    assert.doesNotMatch(text, /test-access|test-refresh|heart_rate|Not retained|description/)
    assert.deepEqual(JSON.parse(text), {
      available: true,
      activityId: '456',
      startedAt: '2026-10-01T09:00:00.000Z',
      averageSpeedMps: 8,
      elevationGainM: 300,
      averagePowerWatts: 210,
      powerSource: 'meter',
      points: [
        [51, -1],
        [51.001, -1],
      ],
    })
    power = null
    streamStatus = 404
    assert.deepEqual(await (await call(path)).json(), {
      available: true,
      activityId: '456',
      startedAt: '2026-10-01T09:00:00.000Z',
      averageSpeedMps: 8,
      elevationGainM: 300,
      averagePowerWatts: null,
      powerSource: null,
      points: [],
    })
    detailStatus = 404
    assert.deepEqual(await (await call(path)).json(), { available: false })
    detailStatus = 429
    const limited = await call(path)
    assert.equal(limited.status, 429)
    assert.equal(limited.headers.get('retry-after'), '900')
    detailStatus = 200
    owner = 999
    const count = calls.length
    assert.equal((await call(path)).status, 502)
    assert.equal(calls.length, count + 1)
    owner = 123
    privateRide = true
    c.setAccount({ ...c.account()!, scope: ['activity:read'] })
    assert.deepEqual(await (await call(path)).json(), { available: false })
    privateRide = false
    c.setAccount({ ...c.account()!, scope: ['activity:read_all'] })
    streamStatus = 200
    changeGrant = true
    assert.equal((await call(path)).status, 409)
    const before = calls.length
    assert.equal((await call(path)).status, 409)
    assert.equal(calls.length, before)
    c.setAccount({ ...c.account()!, connectionId: grant })
    assert.equal((await call(`/connection/123?grant=${grant}&verify=true`)).status, 200)
    assert.equal(c.verified(), 1)
  } finally {
    globalThis.fetch = original
  }
})

test('webhooks forward minimal refresh hints durably, reject other subscriptions and ask for retries on queue failure', async () => {
  const c = context(),
    received: RideOnEvent[] = []
  c.value.publishRideOnEvent = async (event) => {
    received.push(event)
  }
  const payload = {
    subscription_id: 99,
    owner_id: 123,
    object_type: 'activity',
    object_id: 456,
    aspect_type: 'create',
    event_time: 1700000000,
    updates: { title: 'private-title' },
  }
  const call = (body: unknown) =>
    withRuntime(c.value, () =>
      receiveStravaWebhook(
        new Request('https://stravastitch.com/webhooks/strava', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      ),
    )
  assert.equal((await call(payload)).status, 200)
  assert.deepEqual(received, [
    {
      kind: 'strava_event',
      athleteId: '123',
      activityId: '456',
      aspect: 'create',
      eventTime: 1700000000,
    },
  ])
  assert.equal((await call({ ...payload, subscription_id: 77 })).status, 403)
  assert.equal(received.length, 1)
  assert.equal(rideOnEvent({ ...payload, object_id: 0 }), null)
  assert.equal(rideOnEvent({ ...payload, owner_id: -1 }), null)
  assert.equal(rideOnEvent({ ...payload, event_time: NaN }), null)
  c.value.publishRideOnEvent = async () => {
    throw new Error('Queue unavailable')
  }
  assert.equal((await call(payload)).status, 503)
  delete c.value.publishRideOnEvent
  assert.equal((await call(payload)).status, 200)
  assert.equal(
    (
      await call({
        ...payload,
        object_type: 'athlete',
        aspect_type: 'update',
        updates: { authorized: 'false' },
      })
    ).status,
    200,
  )
  assert.equal(c.verified(), 1)
})

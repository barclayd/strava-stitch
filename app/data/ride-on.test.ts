import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTestHarness } from 'wrangler'
import { rideOnCallback, rideOnRequest } from './ride-on.ts'
import { withRuntime, type Runtime } from './runtime.ts'
import type { Account } from './store.ts'

test('Ride On callback has one fixed destination and never forwards cookies or arbitrary redirects', () => {
  const response = rideOnCallback(
    new Request(
      'https://stravastitch.com/auth/ride-on/callback?state=' +
        's'.repeat(43) +
        '&code=test-code&scope=read&redirect=https://evil.test',
    ),
  )
  assert.equal(response.status, 302)
  const url = new URL(response.headers.get('location')!)
  assert.equal(url.origin, 'https://api.ride-on.cc')
  assert.equal(url.pathname, '/integrations/strava/callback')
  assert.equal(url.searchParams.get('redirect'), null)
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(
    rideOnCallback(new Request('https://stravastitch.com/auth/ride-on/callback?state=bad')).status,
    400,
  )
})

test('private Ride On bridge filters cycling, exposes no credentials or GPS, and enforces grant generations', async () => {
  const grant = '05f40f9b-96fc-436d-a68f-bf1ef6aee083'
  let account: Account | undefined = {
    id: 123,
    firstname: 'Test',
    scope: ['activity:read_all', 'activity:write'],
    access_token: 'private-access-token',
    refresh_token: 'private-refresh-token',
    expires_at: 2000000000,
    connectionId: grant,
  }
  const unexpected = (): never => {
    throw new Error('Unexpected runtime operation')
  }
  const context: Runtime = {
    config: {
      clientId: '262735',
      clientSecret: 'private-client-secret',
      origin: 'https://stravastitch.com',
      sessionSecret: 's'.repeat(40),
      encryptionKey: Buffer.alloc(32, 1),
      webhookToken: 'test',
      webhookSubscription: '',
    },
    store: {
      account: async () => account,
      credentials: async () => account,
      saveAccount: async (value: Account) => {
        account = { ...value, connectionId: grant }
      },
      invalidateAccount: async () => {
        account = undefined
      },
      forgetAccount: unexpected,
      verifyDeauthorization: unexpected,
      newJob: unexpected,
      job: unexpected,
      jobs: unexpected,
      patchJob: unexpected,
      claimUpload: unexpected,
    },
    sessions: { read: unexpected, save: unexpected },
    analytics: { enabled: false, track: unexpected },
  }
  const call = (path: string, body?: unknown) =>
    withRuntime(context, () =>
      rideOnRequest(
        new Request('https://internal' + path, {
          method: body ? 'POST' : 'GET',
          body: body ? JSON.stringify(body) : undefined,
        }),
      ),
    )
  const original = globalThis.fetch
  let calls = 0
  let status = 200
  globalThis.fetch = async (input, init) => {
    calls++
    if (String(input).endsWith('/oauth/token'))
      return Response.json({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_at: 2000000000,
        athlete: { id: 123 },
        scope: 'activity:read_all,activity:write',
      })
    assert.equal(
      String(input),
      'https://www.strava.com/api/v3/athlete/activities?per_page=30&page=2',
    )
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer private-access-token')
    if (status !== 200) return new Response('private upstream failure', { status })
    return Response.json(
      ['Ride', 'Run', 'EBikeRide', 'VirtualRide'].map((sport_type, i) => ({
        id: i + 1,
        athlete: { id: 123 },
        name: 'Synthetic',
        start_date: '2026-10-17T09:00:00Z',
        sport_type,
        distance: 42000,
        moving_time: 6000,
        elapsed_time: 6300,
        total_elevation_gain: 400,
        map: { summary_polyline: 'private-gps' },
        heartrate: 150,
      })),
    )
  }
  try {
    assert.equal((await call('/rides/123?page=2&grant=wrong')).status, 409)
    assert.equal(calls, 0)
    const response = await call(`/rides/123?page=2&grant=${grant}`)
    const text = await response.text()
    assert.doesNotMatch(text, /private-|token|heartrate|polyline/)
    const data = JSON.parse(text)
    assert.deepEqual(
      data.rides.map((r: { sportType: string }) => r.sportType),
      ['Ride', 'EBikeRide', 'VirtualRide'],
    )
    assert.equal(data.rides[0].distanceKm, 42)
    assert.equal(data.nextPage, null)
    status = 429
    const limited = await call(`/rides/123?page=2&grant=${grant}`)
    assert.equal(limited.status, 429)
    assert.ok(limited.headers.get('retry-after'))
    const exchanged = await call('/exchange', { code: 'synthetic', scopes: 'activity:read_all' })
    assert.equal(exchanged.status, 200)
    assert.doesNotMatch(await exchanged.text(), /new-access|new-refresh|private-client/)
    assert.equal(account?.scope.includes('activity:write'), true)
    account = undefined
    assert.equal((await call(`/connection/123?grant=${grant}`)).status, 409)
    assert.equal((await call('/activities/123', { delete: true })).status, 404)
  } finally {
    globalThis.fetch = original
  }
})

test('shared credential storage keeps its grant across refresh and replaces it after disconnect', async () => {
  const server = createTestHarness({
    workers: [
      {
        configPath: './wrangler.jsonc',
        secrets: {
          STRAVA_CLIENT_SECRET: 'test',
          SESSION_SECRET: 's'.repeat(40),
          TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
          STRAVA_WEBHOOK_VERIFY_TOKEN: 'test',
        },
      },
      {
        config: {
          name: 'ride-on-test-consumer',
          main: './app/data/test-support/ride-on-consumer.ts',
          compatibility_date: '2026-09-06',
          services: [
            { binding: 'STRAVA_STITCH', service: 'strava-stitch', entrypoint: 'RideOnStrava' },
          ],
        },
      },
    ],
  })
  await server.listen()
  try {
    const worker = server.getWorker<Env>()
    const env = await worker.getEnv()
    const data = env.ATHLETES.getByName('88001')
    const account: Account = {
      id: 88001,
      firstname: 'Synthetic',
      scope: ['activity:read_all'],
      access_token: 'first',
      refresh_token: 'refresh',
      expires_at: 2000000000,
    }
    await data.saveAccount(account)
    const grant = (await data.account())?.connectionId
    assert.ok(grant)
    const consumer = server.getWorker('ride-on-test-consumer')
    const connected = await consumer.fetch('https://internal/connection/88001?grant=' + grant)
    assert.equal(connected.status, 200)
    assert.deepEqual(await connected.json(), {
      athleteId: '88001',
      scopes: ['activity:read_all'],
      grantId: grant,
    })
    await data.saveAccount({ ...account, access_token: 'rotated' })
    assert.equal((await data.account())?.connectionId, grant)
    assert.equal((await env.ATHLETES.getByName('88001').account())?.connectionId, grant)
    await data.forgetAccount()
    await data.saveAccount(account)
    assert.notEqual((await data.account())?.connectionId, grant)
    assert.equal(
      (await consumer.fetch('https://internal/connection/88001?grant=' + grant)).status,
      409,
    )
    const publicRead = await worker.fetch('http://localhost:44100/rides/88001?grant=' + grant)
    assert.equal(publicRead.status, 404)
  } finally {
    await server.close()
  }
})

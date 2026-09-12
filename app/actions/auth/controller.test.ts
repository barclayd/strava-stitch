import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRouter, type RouterTypes } from 'remix/router'
import { createSession, Session } from 'remix/session'
import controller from './controller.ts'
import { routes } from '../../routes.ts'
import { createAnalytics } from '../../data/analytics.ts'
import { withRuntime, type Runtime } from '../../data/runtime.ts'
import type { Account } from '../../data/store.ts'
import type { ConnectionFailureReason } from '../../analytics.ts'

const origin = 'https://stitch.test'
const state = 'a'.repeat(64)
const tokenResponse = {
  access_token: 'test-private-access',
  refresh_token: 'test-private-refresh',
  expires_at: 1900000000,
  athlete: { id: 123, firstname: 'Private tester' },
  scope: 'read,activity:read_all',
}

function fixture(headers: Record<string, string> = {}) {
  const session = createSession()
  session.set('oauth', { state, expires: Date.now() + 60000, source: 'header' })
  const points: AnalyticsEngineDataPoint[] = []
  const saved: Account[] = []
  const store = {
    async saveAccount(account: Account) {
      saved.push(account)
    },
  }
  const router = createRouter<RouterTypes['context']>({
    middleware: [
      (context, next) => {
        context.set(Session, session)
        return next()
      },
    ],
  })
  router.map(routes.auth, controller)
  const request = async (params: Record<string, string> = { state, code: 'test-private-code' }) => {
    const req = new Request(
      origin + routes.auth.callback.href() + '?' + new URLSearchParams(params),
      {
        headers,
      },
    )
    return withRuntime(
      {
        config: {
          origin,
          clientId: '123',
          clientSecret: 'test-private-client-secret',
        } as Runtime['config'],
        store: store as Runtime['store'],
        sessions: {} as Runtime['sessions'],
        analytics: createAnalytics(
          {
            ANALYTICS_ENABLED: 'true',
            FUNNEL: {
              writeDataPoint: (point) => {
                if (point) points.push(point)
              },
            },
          },
          req,
        ),
      },
      () => router.fetch(req),
    )
  }
  return { request, points, session, store, saved }
}

test('OAuth callback records actionable reasons without private response or request data', async (t) => {
  const cases: [ConnectionFailureReason, () => Response | Promise<Response>][] = [
    ['token_exchange_rejected', () => new Response('private response', { status: 400 })],
    ['strava_rate_limit', () => new Response('private response', { status: 429 })],
    ['strava_unavailable', () => new Response('private response', { status: 503 })],
    [
      'token_exchange_timeout',
      () => {
        throw new DOMException('private request', 'TimeoutError')
      },
    ],
    [
      'token_exchange_failed',
      () => {
        throw new TypeError('private network details')
      },
    ],
    ['token_exchange_failed', () => new Response('malformed private response')],
    ['token_exchange_failed', () => Response.json({ ...tokenResponse, access_token: null })],
    ['invalid_athlete', () => Response.json({ ...tokenResponse, athlete: null })],
    ['missing_activity_permission', () => Response.json({ ...tokenResponse, scope: 'read' })],
  ]
  for (const [reason, response] of cases) {
    await t.test(reason, async (t) => {
      const f = fixture()
      t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof globalThis.fetch>[0]) => {
        assert.equal(String(input), 'https://www.strava.com/oauth/token')
        return response()
      })
      const result = await f.request()
      assert.equal(result.status, 303)
      assert.equal(result.headers.get('location'), '/')
      assert.equal(f.session.get('oauth'), undefined)
      assert.equal(f.session.get('athleteId'), undefined)
      assert.deepEqual(f.saved, [])
      assert.deepEqual(f.points, [
        {
          indexes: ['strava_connect_failed'],
          blobs: ['strava_connect_failed', 'home', 'header', 'v1', reason],
          doubles: [1],
        },
      ])
    })
  }
})

test('account and session failures keep their stage; successful callbacks still rotate the session', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(tokenResponse))
  const storageFailure = fixture()
  t.mock.method(storageFailure.store, 'saveAccount', async () => {
    throw new DOMException('private storage details', 'TimeoutError')
  })
  assert.equal((await storageFailure.request()).status, 303)
  assert.equal(storageFailure.points[0].blobs?.[4], 'save_failed')
  assert.equal(storageFailure.session.get('athleteId'), undefined)

  const sessionFailure = fixture()
  t.mock.method(sessionFailure.session, 'regenerateId', () => {
    throw new Error('private session details')
  })
  assert.equal((await sessionFailure.request()).status, 303)
  assert.equal(sessionFailure.points[0].blobs?.[4], 'session_failed')
  assert.equal(sessionFailure.session.get('athleteId'), undefined)

  const success = fixture()
  const oldId = success.session.id
  assert.equal((await success.request()).status, 303)
  assert.notEqual(success.session.id, oldId)
  assert.equal(success.session.get('athleteId'), tokenResponse.athlete.id)
  assert.equal(success.saved.length, 1)
  assert.deepEqual(success.points[0].blobs, ['strava_connected', 'workspace', 'header', 'v1'])
})

test('invalid OAuth state and cancellations never acquire failure reasons or exchange tokens', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected exchange')
  })
  const missing = fixture()
  assert.equal((await missing.request({ state })).status, 400)
  assert.deepEqual(missing.points[0].blobs, [
    'strava_connect_failed',
    'home',
    'header',
    'v1',
    'missing_code',
  ])
  assert.equal((await missing.request({ state })).status, 400)
  assert.equal(missing.points.length, 1)

  for (const invalid of ['wrong', 'b'.repeat(64)]) {
    const f = fixture()
    assert.equal((await f.request({ state: invalid, code: 'private' })).status, 400)
    assert.deepEqual(f.points, [])
  }
  const expired = fixture()
  expired.session.set('oauth', { state, expires: Date.now() - 1000, source: 'header' })
  assert.equal((await expired.request()).status, 400)
  assert.deepEqual(expired.points, [])

  const cancelled = fixture()
  assert.equal((await cancelled.request({ state, error: 'access_denied' })).status, 303)
  assert.deepEqual(cancelled.points[0].blobs, ['strava_connect_cancelled', 'home', 'header', 'v1'])
  assert.equal(fetch.mock.callCount(), 0)
})

test('OAuth callback failures honour browser exclusions, DNT and GPC', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...tokenResponse, scope: 'read' }))
  const privacyHeaders: Record<string, string>[] = [
    { Cookie: 'stitch_analytics_opt_out=1' },
    { DNT: '1' },
    { 'Sec-GPC': '1' },
  ]
  for (const headers of privacyHeaders) {
    const f = fixture(headers)
    assert.equal((await f.request()).status, 303)
    assert.deepEqual(f.points, [])
  }
})

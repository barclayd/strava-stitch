import { exchangeWithConfig, listActivities, SCOPES, StravaError } from './strava.ts'
import { runtime } from './runtime.ts'
import { cyclingSports, importRead } from './ride-on-import.ts'

const privateHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
const json = (value: unknown, status = 200, headers = {}) =>
  Response.json(value, { status, headers: { ...privateHeaders, ...headers } })
const cycling = cyclingSports

// This handler is exposed ONLY by the named WorkerEntrypoint, never the public router.
// Ride On supplies an athlete ID only after its own OAuth handoff and owner checks.
export async function rideOnRequest(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const { config, store } = runtime()
    if (request.method === 'GET' && url.pathname === '/configuration') {
      return json({
        clientId: config.clientId,
        callbackUrl: `${config.origin}/auth/ride-on/callback`,
        scopes: SCOPES,
      })
    }
    if (request.method === 'POST' && url.pathname === '/exchange') {
      const reader = request.body?.getReader()
      if (!reader) return json({ error: 'BAD_REQUEST' }, 400)
      let body = ''
      try {
        const decoder = new TextDecoder()
        let bytes = 0
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value.length
          if (bytes > 8192) {
            await reader.cancel()
            return json({ error: 'BAD_REQUEST' }, 400)
          }
          body += decoder.decode(chunk.value, { stream: true })
        }
        body += decoder.decode()
      } finally {
        reader.releaseLock()
      }
      const input: unknown = JSON.parse(body)
      if (
        !input ||
        typeof input !== 'object' ||
        !('code' in input) ||
        typeof input.code !== 'string' ||
        !input.code ||
        input.code.length > 2048 ||
        !('scopes' in input) ||
        typeof input.scopes !== 'string' ||
        input.scopes.length > 512
      )
        return json({ error: 'BAD_REQUEST' }, 400)
      const data = await exchangeWithConfig(config, {
        grant_type: 'authorization_code',
        code: input.code,
      })
      const scopes = (data.scope ?? input.scopes).split(/[ ,]+/).filter(Boolean)
      if (!data.athlete || !Number.isSafeInteger(data.athlete.id) || data.athlete.id <= 0)
        return json({ error: 'STRAVA_UNAVAILABLE' }, 502)
      if (!scopes.includes('activity:read') && !scopes.includes('activity:read_all'))
        return json({ error: 'STRAVA_PERMISSION_REQUIRED' }, 403)
      await store.saveAccount({
        id: data.athlete.id,
        firstname: String(data.athlete.firstname ?? 'Athlete'),
        scope: scopes,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
      })
      const saved = await store.account(data.athlete.id)
      return json({ athleteId: String(data.athlete.id), scopes, grantId: saved?.connectionId })
    }
    const match = /^\/(connection|rides|import-page|import-activity)\/([1-9][0-9]{0,15})$/.exec(
      url.pathname,
    )
    if (request.method !== 'GET' || !match || !Number.isSafeInteger(Number(match[2])))
      return json({ error: 'NOT_FOUND' }, 404)
    const id = Number(match[2])
    if (match[1] === 'connection' && url.searchParams.get('verify') === 'true')
      await store.verifyDeauthorization(id)
    const account = await store.account(id)
    if (!account) return json({ error: 'STRAVA_REAUTHORISATION_REQUIRED' }, 409)
    if (!account.connectionId || url.searchParams.get('grant') !== account.connectionId)
      return json({ error: 'STRAVA_REAUTHORISATION_REQUIRED' }, 409)
    if (!account.scope.includes('activity:read') && !account.scope.includes('activity:read_all'))
      return json({ error: 'STRAVA_PERMISSION_REQUIRED' }, 403)
    if (match[1] === 'connection')
      return json({ athleteId: String(id), scopes: account.scope, grantId: account.connectionId })
    if (match[1]?.startsWith('import-')) {
      const result = await importRead(url, id, account.connectionId)
      return json(result.body, result.status)
    }
    const page = url.searchParams.get('page') ?? '1'
    if (!/^[1-9][0-9]{0,3}$/.test(page)) return json({ error: 'BAD_REQUEST' }, 400)
    const activities = await listActivities(id, Number(page))
    if ((await store.account(id))?.connectionId !== account.connectionId)
      return json({ error: 'STRAVA_REAUTHORISATION_REQUIRED' }, 409)
    if (!Array.isArray(activities) || activities.length > 30)
      return json({ error: 'STRAVA_UNAVAILABLE' }, 502)
    const rides = []
    for (const a of activities) {
      if (a.athlete?.id !== id) return json({ error: 'STRAVA_UNAVAILABLE' }, 502)
      if (!cycling.has(a.sport_type)) continue
      rides.push({
        id: String(a.id),
        name: a.name,
        sportType: a.sport_type,
        startedAt: a.start_date,
        distanceKm: a.distance / 1000,
        movingSeconds: a.moving_time,
        elapsedSeconds: a.elapsed_time,
        elevationGainM: a.total_elevation_gain,
        url: `https://www.strava.com/activities/${a.id}`,
      })
    }
    return json({
      rides,
      nextPage: activities.length === 30 && Number(page) < 9999 ? Number(page) + 1 : null,
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    if (error instanceof StravaError) {
      if ([400, 401].includes(error.status))
        return json({ error: 'STRAVA_REAUTHORISATION_REQUIRED' }, 409)
      if (error.status === 403) return json({ error: 'STRAVA_PERMISSION_REQUIRED' }, 403)
      if (error.status === 429)
        return json({ error: 'STRAVA_RATE_LIMITED' }, 429, { 'Retry-After': '900' })
    }
    return json({ error: 'STRAVA_UNAVAILABLE' }, 502)
  }
}

// Fixed destination: this is not an open redirect. Ride On validates state and its
// browser cookie before exchanging the short-lived code over the private binding.
export function rideOnCallback(request: Request): Response {
  const source = new URL(request.url)
  if (request.method !== 'GET' || source.search.length > 4096)
    return new Response('Invalid callback.', { status: 400, headers: privateHeaders })
  const state = source.searchParams.get('state') ?? ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(state))
    return new Response('Invalid callback.', { status: 400, headers: privateHeaders })
  const target = new URL('https://api.ride-on.cc/integrations/strava/callback')
  for (const key of ['state', 'code', 'scope', 'error']) {
    const values = source.searchParams.getAll(key)
    if (values.length > 1)
      return new Response('Invalid callback.', { status: 400, headers: privateHeaders })
    if (values[0]) target.searchParams.set(key, values[0])
  }
  return new Response(null, { status: 302, headers: { ...privateHeaders, Location: target.href } })
}

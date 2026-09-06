import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { unzipSync, strFromU8 } from 'fflate'
import { merge, recording, type Activity, type Streams } from './stitches/merge.ts'

const directory = mkdtempSync(join(tmpdir(), 'stitch-tests-'))
Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_ORIGIN: 'http://localhost:44100',
  STRAVA_CLIENT_ID: '123',
  STRAVA_CLIENT_SECRET: 'test-client-secret',
  SESSION_SECRET: randomBytes(40).toString('hex'),
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  DATABASE_PATH: join(directory, 'db.sqlite'),
  SESSION_DIR: join(directory, 'sessions'),
  STRAVA_WEBHOOK_VERIFY_TOKEN: 'test-hook',
  STRAVA_WEBHOOK_SUBSCRIPTION_ID: '99',
})
const { router } = await import('../router.ts')
const { account, saveAccount, newJob, job, seal, unseal } = await import('../data/store.ts')
const { permittedGet } = await import('../data/strava.ts')
const { routes } = await import('../routes.ts')
const origin = process.env.APP_ORIGIN!
const raw: Streams = {
  time: { data: [0, 5, 10], original_size: 3 },
  latlng: {
    data: [
      [51, -1],
      [51.001, -1],
      [51.002, -1],
    ],
  },
  distance: { data: [0, 10, 20] },
  altitude: { data: [0, 1, 2] },
}
const detail = (id: number, owner = 1): Activity => ({
  id,
  athlete: { id: owner },
  name: 'Test ride ' + id,
  start_date: id === 101 ? '2026-09-06T08:15:00Z' : '2026-09-06T08:18:18Z',
  start_date_local: id === 101 ? '2026-09-06T09:15:00Z' : '2026-09-06T09:18:18Z',
  sport_type: 'Ride',
  distance: 20,
  moving_time: 10,
  elapsed_time: 10,
  total_elevation_gain: 2,
})
const makeMerge = () => merge([recording(detail(101), raw), recording(detail(102), raw)])
let oauthOwner = 1,
  scopes = ['read', 'activity:read', 'activity:read_all', 'activity:write'],
  uploadMode = 'success',
  deleted = false,
  foreign = false,
  uploads = 0,
  refreshes = 0
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = String(input),
    method = init?.method ?? 'GET'
  if (url === 'https://www.strava.com/oauth/token') {
    const params = init?.body as URLSearchParams
    if (params.get('grant_type') === 'refresh_token') refreshes++
    return Response.json({
      athlete: { id: oauthOwner, firstname: 'Tester' },
      access_token: 'secret-access-' + oauthOwner,
      refresh_token: 'secret-refresh-' + oauthOwner,
      expires_at: Date.now() / 1000 + 3600,
      scope: scopes.join(' '),
    })
  }
  assert.ok(url.startsWith('https://www.strava.com/api/v3/'), 'No unplanned network calls')
  assert.ok(
    method === 'GET' || url === 'https://www.strava.com/api/v3/uploads',
    'No activity updates or deletions',
  )
  if (url.endsWith('/uploads') && method === 'POST') {
    uploads++
    assert.equal((init?.body as FormData).get('data_type'), 'gpx')
    if (uploadMode === 'timeout') throw new Error('Simulated network interruption')
    if (uploadMode === 'duplicate')
      return Response.json({ id: 123, error: 'duplicate of Test ride 101' }, { status: 201 })
    return Response.json({ id: 123, status: 'processing' }, { status: 201 })
  }
  if (url.endsWith('/uploads/123'))
    return Response.json({ id: 123, activity_id: 500, status: 'ready' })
  if (url.includes('/athlete/activities?')) return Response.json([detail(101), detail(102)])
  if (url.includes('/streams?')) return Response.json(raw)
  const match = url.match(/\/activities\/(\d+)$/)
  if (match)
    return deleted
      ? new Response('', { status: 404 })
      : Response.json(detail(Number(match[1]), foreign ? 2 : 1))
  throw new Error('Unexpected network request')
}
after(() => {
  globalThis.fetch = originalFetch
  rmSync(directory, { recursive: true, force: true })
})

class Client {
  cookie = ''
  csrf = ''
  async request(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers)
    if (this.cookie) headers.set('cookie', this.cookie)
    const response = await router.fetch(new Request(origin + path, { ...options, headers }))
    const set = response.headers.get('set-cookie')
    if (set) this.cookie = set.split(';')[0]
    return response
  }
  async page(path = '/') {
    const response = await this.request(path),
      text = await response.text()
    this.csrf = text.match(/name="_csrf" value="([^"]+)"/)?.[1] ?? this.csrf
    return { response, text }
  }
  async post(path: string, values: Record<string, string | string[]>, csrf = true) {
    const body = new URLSearchParams()
    if (csrf) body.set('_csrf', this.csrf)
    for (const [k, v] of Object.entries(values))
      for (const item of Array.isArray(v) ? v : [v]) body.append(k, item)
    return this.request(path, { method: 'POST', headers: { Origin: origin }, body })
  }
  async login(id = 1, write = true) {
    oauthOwner = id
    scopes = ['read', 'activity:read', 'activity:read_all', ...(write ? ['activity:write'] : [])]
    await this.page()
    const response = await this.post(routes.auth.connect.href(), {})
    assert.equal(response.status, 303)
    const target = new URL(response.headers.get('location')!)
    assert.match(target.searchParams.get('scope')!, /activity:write/)
    const callback = await this.request(
      routes.auth.callback.href() +
        '?' +
        new URLSearchParams({
          state: target.searchParams.get('state')!,
          code: 'test-code',
          scope: scopes.join(','),
        }),
    )
    assert.equal(callback.status, 303)
    await this.page()
  }
}
const confirmation = { title: 'One ride', confirm: 'upload', gaps: 'reviewed' }

test('OAuth is bound to a browser session and uploads require CSRF and granted scope', async () => {
  const c = new Client()
  const home = await c.page()
  assert.equal(home.response.status, 200)
  assert.ok(c.csrf)
  assert.equal((await c.post('/auth/strava', {}, false)).status, 403)
  assert.equal((await c.request('/auth/strava/callback?state=wrong&code=fake')).status, 400)
  await c.login(1, false)
  const j = newJob(1, makeMerge())
  const before = uploads
  await c.post(routes.stitches.upload.href({ id: j.id }), confirmation)
  assert.equal(uploads, before)
  assert.equal(job(j.id, 1)?.state, 'ready')
  const plaintext = readFileSync(process.env.DATABASE_PATH!, 'utf8')
  assert.ok(!plaintext.includes('secret-access-1'))
  assert.deepEqual(unseal(seal({ test: 'private' })), { test: 'private' })
  await c.post('/auth/logout', {})
  const loggedOut = await c.page()
  assert.match(loggedOut.text, /EXAMPLE ACTIVITIES/)
})
test('prepare checks ownership and stores a preview; downloads and bundles stay account scoped', async () => {
  const c = new Client()
  await c.login()
  foreign = false
  deleted = false
  for (const invalid of ['0', '0101', '9007199254740993']) {
    const rejected = await c.post('/stitches', { activities: ['102', invalid] })
    assert.equal(rejected.headers.get('location'), '/')
    assert.match((await c.page()).text, /Choose between two and eight/)
  }
  const response = await c.post('/stitches', { activities: ['102', '101'] })
  assert.equal(response.status, 303)
  const target = response.headers.get('location')!,
    id = target.split('/').at(-1)!
  assert.deepEqual(
    job(id, 1)?.merge.records.map((r) => r.activity.id),
    [101, 102],
  )
  assert.match((await c.page(target)).text, /Looking like one ride/)
  const file = await c.request(routes.stitches.download.href({ id }))
  assert.match(file.headers.get('content-disposition')!, /attachment/)
  assert.equal(((await file.text()).match(/<trkpt /g) ?? []).length, 6)
  const backup = await c.request(routes.stitches.backup.href({ id })),
    files = unzipSync(new Uint8Array(await backup.arrayBuffer()))
  assert.deepEqual(Object.keys(files).sort(), [
    'README.txt',
    'original-101.gpx',
    'original-102.gpx',
    'stitched-ride.gpx',
  ])
  assert.match(strFromU8(files['README.txt']), /not original Garmin/)
  const other = new Client()
  await other.login(2)
  assert.equal((await other.request(target)).status, 404)
  assert.equal((await other.request(routes.stitches.backup.href({ id }))).status, 404)
  foreign = true
  const blocked = await c.post('/stitches', { activities: ['101', '102'] })
  assert.equal(blocked.headers.get('location'), '/')
  foreign = false
})
test('upload is explicitly confirmed, submitted once, and polled to completion', async () => {
  const c = new Client()
  await c.login()
  uploadMode = 'success'
  const j = newJob(1, makeMerge()),
    path = routes.stitches.upload.href({ id: j.id }),
    before = uploads
  await c.post(path, { title: 'Test' })
  assert.equal(uploads, before)
  await Promise.all([c.post(path, confirmation), c.post(path, confirmation)])
  assert.equal(uploads, before + 1)
  assert.equal(job(j.id, 1)?.state, 'processing')
  await c.request(routes.stitches.status.href({ id: j.id }))
  assert.equal(job(j.id, 1)?.state, 'complete')
  assert.equal(job(j.id, 1)?.activityId, 500)
  await c.post(path, confirmation)
  assert.equal(uploads, before + 1)
})
test('duplicates require a backup and separate confirmed removal, with fresh read-only checks', async () => {
  const c = new Client()
  await c.login()
  uploadMode = 'duplicate'
  deleted = false
  const j = newJob(1, makeMerge()),
    path = routes.stitches.upload.href({ id: j.id }),
    removal = routes.stitches.confirmRemoval.href({ id: j.id })
  await c.post(path, confirmation)
  assert.equal(job(j.id, 1)?.state, 'duplicate')
  const before = uploads
  await c.post(path, confirmation)
  assert.equal(uploads, before)
  await c.post(removal, { confirm: 'removed' })
  assert.ok(!job(j.id, 1)?.removalConfirmed)
  await c.request(routes.stitches.backup.href({ id: j.id }))
  await c.post(removal, { confirm: 'removed' })
  assert.ok(!job(j.id, 1)?.removalConfirmed)
  deleted = true
  await c.post(removal, { confirm: 'removed' })
  assert.equal(job(j.id, 1)?.removalConfirmed, true)
  uploadMode = 'success'
  await c.post(path, confirmation)
  assert.equal(uploads, before + 1)
  deleted = false
})
test('uncertain uploads cannot be silently retried; refresh and deauthorization work', async () => {
  const c = new Client()
  await c.login()
  uploadMode = 'timeout'
  const j = newJob(1, makeMerge()),
    path = routes.stitches.upload.href({ id: j.id })
  const value = account(1)!
  saveAccount({ ...value, expires_at: 0 })
  const previousRefresh = refreshes
  await c.post(path, confirmation)
  assert.equal(refreshes, previousRefresh + 1)
  assert.equal(job(j.id, 1)?.state, 'unknown')
  const before = uploads
  await c.post(path, confirmation)
  assert.equal(uploads, before)
  const response = await c.request('/webhooks/strava', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription_id: 99,
      owner_id: 1,
      object_type: 'athlete',
      aspect_type: 'update',
      updates: { authorized: 'false' },
    }),
  })
  assert.equal(response.status, 200)
  assert.equal(account(1), undefined)
  assert.equal(job(j.id, 1), undefined)
  assert.equal(permittedGet('/activities/123'), true)
  assert.equal(permittedGet('/athlete/activities?per_page=30&page=1'), true)
  assert.equal(permittedGet('/activities/123/delete'), false)
  const crossOrigin = await router.fetch(new Request('http://attacker.test/'))
  assert.equal(crossOrigin.status, 403)
})

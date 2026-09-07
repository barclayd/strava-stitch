import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createTestHarness } from 'wrangler'
import { seal, unseal } from '../data/encryption.ts'
import { randomBytes } from 'node:crypto'
import { unzipSync, strFromU8 } from 'fflate'
import { merge, recording, type Activity, type Streams } from './stitches/merge.ts'
import { Decoder, Stream } from '@garmin/fitsdk'
import { isSport } from '../data/sports.ts'

const secrets = {
  STRAVA_CLIENT_SECRET: 'test-client-secret',
  SESSION_SECRET: Buffer.from(randomBytes(40)).toString('hex'),
  TOKEN_ENCRYPTION_KEY: Buffer.from(randomBytes(32)).toString('base64'),
  STRAVA_WEBHOOK_VERIFY_TOKEN: 'test-hook',
}
const server = createTestHarness({
  workers: [
    {
      configPath: './wrangler.jsonc',
      secrets,
      vars: { STRAVA_CLIENT_ID: '123', STRAVA_WEBHOOK_SUBSCRIPTION_ID: '99' },
    },
  ],
})
const worker = server.getWorker<Env>()
await server.listen()
const env = await worker.getEnv()
const repo = (owner: number) => env.ATHLETES.getByName(String(owner))
const account = (id: number) => repo(id).account()
const saveAccount = (value: import('../data/store.ts').Account) => repo(value.id).saveAccount(value)
const newJob = (owner: number, content: import('./stitches/merge.ts').Merge) =>
  repo(owner).newJob(owner, content)
const job = (id: string, owner: number) => repo(owner).job(id, owner)
const { permittedGet } = await import('../data/strava.ts')
const { routes } = await import('../routes.ts')
const origin = 'http://localhost:44100'
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
  longRide = false,
  deauthorized = false,
  deleted = false,
  foreign = false,
  uploads = 0,
  refreshes = 0
let activityOverrides: Record<number, Partial<Activity>> = {},
  streamOverrides: Record<number, Streams> = {},
  listedIds = [101, 102],
  lastUpload: FormData | undefined,
  missingStreams = false
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = String(input),
    method = init?.method ?? 'GET'
  if (new URL(url).hostname !== 'www.strava.com') return originalFetch(input, init)
  if (url === 'https://www.strava.com/oauth/token') {
    const params = await new Request(url, init).formData()
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
    lastUpload = await new Request(url, init).formData()
    assert.ok(['gpx', 'fit'].includes(String(lastUpload.get('data_type'))))
    assert.ok(isSport(String(lastUpload.get('sport_type'))))
    if (uploadMode === 'timeout') throw new Error('Simulated network interruption')
    if (uploadMode === 'duplicate')
      return Response.json({ id: 123, error: 'duplicate of Test ride 101' }, { status: 201 })
    return Response.json({ id: 123, status: 'processing' }, { status: 201 })
  }
  if (url.endsWith('/athlete'))
    return deauthorized ? new Response(null, { status: 401 }) : Response.json({ id: oauthOwner })
  if (url.endsWith('/uploads/123'))
    return Response.json({ id: 123, activity_id: 500, status: 'ready' })
  if (url.includes('/athlete/activities?'))
    return Response.json(listedIds.map((id) => ({ ...detail(id), ...activityOverrides[id] })))
  if (url.includes('/streams?') && missingStreams) return new Response(null, { status: 404 })
  if (url.includes('/streams?'))
    return Response.json(
      streamOverrides[Number(url.match(/\/activities\/(\d+)\//)?.[1])] ??
        (longRide
          ? {
              time: { data: Array.from({ length: 6000 }, (_, i) => i) },
              latlng: { data: Array.from({ length: 6000 }, (_, i) => [51 + i / 100000, -1]) },
              distance: { data: Array.from({ length: 6000 }, (_, i) => i * 5) },
            }
          : raw),
    )
  const match = url.match(/\/activities\/(\d+)$/)
  if (match)
    return deleted
      ? new Response('', { status: 404 })
      : Response.json({
          ...detail(Number(match[1]), foreign ? 2 : oauthOwner),
          ...activityOverrides[Number(match[1])],
          ...(longRide
            ? {
                start_date: new Date(
                  Date.UTC(2026, 8, 6, Number(match[1]) === 101 ? 8 : 10),
                ).toISOString(),
              }
            : {}),
        })
  throw new Error('Unexpected network request')
}
after(async () => {
  globalThis.fetch = originalFetch
  await server.close()
})

class Client {
  cookie = ''
  csrf = ''
  async request(
    path: string,
    options: {
      method?: string
      headers?: Record<string, string>
      body?: string | URLSearchParams
    } = {},
  ) {
    const headers = new Headers(options.headers)
    if (this.cookie) headers.set('cookie', this.cookie)
    const response = await worker.fetch(origin + path, {
      ...options,
      headers: Object.fromEntries(headers),
      redirect: 'manual',
    })
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
    const home = await this.page()
    assert.ok(
      home.text.includes('Tester'),
      home.text.match(/role="alert"[^>]*>(.*?)<\/div>/)?.[1] ?? 'Login did not persist',
    )
  }
}
const confirmation = { title: 'One ride', confirm: 'upload', gaps: 'reviewed' }

test('all-sport picker and server reject mixed sports and manual entries without hiding them', async () => {
  const c = new Client()
  try {
    activityOverrides = {
      101: { sport_type: 'Run', name: 'Morning run' },
      102: { sport_type: 'TrailRun', name: 'Trail run' },
      103: { sport_type: 'WeightTraining', manual: true, name: 'Manual weights' },
    }
    listedIds = [101, 102, 103]
    await c.login(10)
    const home = await c.page()
    for (const title of ['Morning run', 'Trail run', 'Manual weights'])
      assert.ok(home.text.includes(title))
    assert.match(home.text, /Manual entry/)
    assert.match(home.text, /disabled[^>]*aria-label="Select Manual weights"/)
    const before = uploads
    for (const selection of [
      ['101', '102'],
      ['101', '103'],
    ]) {
      const result = await c.post('/stitches', { activities: selection })
      assert.equal(result.headers.get('location'), '/')
      assert.match((await c.page()).text, /same sport|Manual entry/)
    }
    assert.equal(uploads, before)
    activityOverrides[102] = { sport_type: 'Run' }
    missingStreams = true
    const unavailable = await c.post('/stitches', { activities: ['101', '102'] })
    assert.equal(unavailable.headers.get('location'), '/')
    assert.match((await c.page()).text, /no recorded timeline available/)
    const manual = await c.post('/stitches', { activities: ['103', '101'] })
    assert.equal(manual.headers.get('location'), '/')
    assert.match((await c.page()).text, /Manual entry/)
  } finally {
    missingStreams = false
    activityOverrides = {}
    listedIds = [101, 102]
  }
})

test('new sports complete preview, download, backup and confirmed uploads with the exact sport', async () => {
  const c = new Client()
  await c.login(11)
  const { latlng: _gps, ...indoor } = raw
  try {
    for (const [sport, source, format] of [
      ['Run', raw, 'gpx'],
      ['TrailRun', raw, 'gpx'],
      ['EBikeRide', raw, 'gpx'],
      ['Hike', raw, 'gpx'],
      ['Swim', raw, 'gpx'],
      ['Swim', indoor, 'fit'],
      ['VirtualRide', indoor, 'fit'],
      ['WeightTraining', indoor, 'fit'],
      ['Yoga', indoor, 'fit'],
      ['Wheelchair', indoor, 'fit'],
      ['Workout', { time: raw.time }, 'fit'],
    ] as const) {
      activityOverrides = {
        101: { sport_type: sport, trainer: sport === 'VirtualRide' },
        102: { sport_type: sport, trainer: sport === 'VirtualRide' },
      }
      streamOverrides = { 101: source, 102: source }
      const created = await c.post('/stitches', { activities: ['102', '101'] })
      const target = created.headers.get('location')!,
        id = target.split('/').at(-1)!
      assert.match(target, /^\/stitches\/.+/)
      const page = await c.page(target)
      assert.equal(page.response.status, 200)
      assert.match(page.text, new RegExp(`Download ${format.toUpperCase()}`))
      if (format === 'fit') {
        assert.match(page.text, /No GPS route to preview/)
        assert.match(page.text, /distance between endpoints is unavailable/)
      }
      const download = await c.request(routes.stitches.download.href({ id }))
      assert.match(
        download.headers.get('content-disposition')!,
        new RegExp(`stitched-activity\\.${format}`),
      )
      const bytes = new Uint8Array(await download.arrayBuffer())
      if (format === 'fit') {
        const decoder = new Decoder(Stream.fromByteArray(bytes))
        assert.ok(decoder.checkIntegrity())
        const decoded = decoder.read()
        assert.deepEqual(decoded.errors, [])
        assert.equal(decoded.messages.recordMesgs?.length, 6)
        assert.ok(decoded.messages.recordMesgs?.every((p) => p.positionLat === undefined))
      }
      const backup = await c.request(routes.stitches.backup.href({ id }))
      const files = unzipSync(new Uint8Array(await backup.arrayBuffer()))
      assert.deepEqual(files[`stitched-activity.${format}`], bytes)
      assert.ok(files[`original-101.${format}`])
      assert.equal(JSON.parse(strFromU8(files['activities.json'])).sport_type, sport)
      const before = uploads
      await c.post(routes.stitches.upload.href({ id }), { title: 'Missing confirmation' })
      assert.equal(uploads, before)
      await c.post(routes.stitches.upload.href({ id }), { ...confirmation, sport_type: 'Ride' })
      assert.equal(uploads, before + 1)
      assert.equal(lastUpload?.get('sport_type'), sport)
      assert.equal(lastUpload?.get('data_type'), format)
      assert.equal(lastUpload?.get('trainer'), sport === 'VirtualRide' ? '1' : null)
      assert.equal((lastUpload?.get('file') as File).name, `stitched.${format}`)
      assert.equal((await job(id, 11))?.state, 'processing')
      await c.request(routes.stitches.status.href({ id }))
      assert.equal((await job(id, 11))?.state, 'complete')
    }
  } finally {
    activityOverrides = {}
    streamOverrides = {}
  }
})

test('OAuth is bound to a browser session and uploads require CSRF and granted scope', async () => {
  const c = new Client()
  const home = await c.page()
  assert.equal(home.response.status, 200)
  assert.ok(c.csrf)
  assert.equal((await c.post('/auth/strava', {}, false)).status, 403)
  assert.equal((await c.request('/auth/strava/callback?state=wrong&code=fake')).status, 400)
  await c.login(1, false)
  const j = await newJob(1, makeMerge())
  const before = uploads
  await c.post(routes.stitches.upload.href({ id: j.id }), confirmation)
  assert.equal(uploads, before)
  assert.equal((await job(j.id, 1))?.state, 'ready')
  const sql = await server.getWorker().getDurableObjectStorage('ATHLETES', { name: '1' })
  const plaintext = JSON.stringify(await sql.exec('SELECT payload FROM account'))
  assert.ok(!plaintext.includes('secret-access-1'))
  assert.deepEqual(
    unseal(
      seal({ test: 'private' }, Buffer.from(secrets.TOKEN_ENCRYPTION_KEY, 'base64')),
      Buffer.from(secrets.TOKEN_ENCRYPTION_KEY, 'base64'),
    ),
    { test: 'private' },
  )
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
    (await job(id, 1))?.merge.records.map((r) => r.activity.id),
    [101, 102],
  )
  assert.match((await c.page(target)).text, /Every part, together/)
  const file = await c.request(routes.stitches.download.href({ id }))
  assert.match(file.headers.get('content-disposition')!, /attachment/)
  assert.equal(((await file.text()).match(/<trkpt /g) ?? []).length, 6)
  const backup = await c.request(routes.stitches.backup.href({ id })),
    files = unzipSync(new Uint8Array(await backup.arrayBuffer()))
  assert.deepEqual(Object.keys(files).sort(), [
    'README.txt',
    'activities.json',
    'original-101.gpx',
    'original-102.gpx',
    'stitched-activity.gpx',
  ])
  assert.match(strFromU8(files['README.txt']), /not original device files/)
  const other = new Client()
  await other.login(2)
  assert.equal((await other.request(target)).status, 404)
  assert.equal((await other.request(routes.stitches.backup.href({ id }))).status, 404)
  foreign = true
  const blocked = await c.post('/stitches', { activities: ['101', '102'] })
  assert.equal(blocked.headers.get('location'), '/')
  foreign = false
})
test('descriptions are prefilled, escaped, editable, and may be cleared on existing previews', async () => {
  const c = new Client()
  await c.login(4)
  activityOverrides = {
    101: { description: 'Outward leg\nCoffee & cake ☕' },
    102: { description: '</textarea><script>alert("test")</script>' },
  }
  try {
    const response = await c.post('/stitches', { activities: ['102', '101'] }),
      path = response.headers.get('location')!,
      id = path.split('/').at(-1)!,
      expected = 'Outward leg\nCoffee & cake ☕\n</textarea><script>alert("test")</script>'
    assert.equal((await job(id, 4))?.description, expected)
    const preview = await c.page(path)
    assert.match(preview.text, /<textarea[^>]*name="description"/)
    assert.match(preview.text, /Coffee &amp; cake ☕\n&lt;\/textarea&gt;&lt;script&gt;/)
    assert.ok(!preview.text.includes('</textarea><script>alert("test")</script>'))

    // A preview created before descriptions were editable still uses its source descriptions.
    const sql = await server.getWorker().getDurableObjectStorage('ATHLETES', { name: '4' }),
      rows = await sql.exec('SELECT metadata FROM jobs WHERE id=?', id),
      key = Buffer.from(secrets.TOKEN_ENCRYPTION_KEY, 'base64'),
      metadata = unseal<Omit<import('../data/store.ts').Job, 'merge'>>(
        String(rows[0].metadata),
        key,
      )
    delete metadata.description
    await sql.exec('UPDATE jobs SET metadata=? WHERE id=?', seal(metadata, key), id)
    assert.match((await c.page(path)).text, /Coffee &amp; cake ☕\n&lt;\/textarea&gt;/)

    uploadMode = 'duplicate'
    await c.post(routes.stitches.upload.href({ id }), { ...confirmation, description: '' })
    assert.equal(lastUpload?.get('description'), '')
    assert.equal((await job(id, 4))?.description, '')
    await repo(4).patchJob(id, 4, { state: 'failed' })
    assert.match((await c.page(path)).text, /<textarea[^>]*><\/textarea>/)
  } finally {
    activityOverrides = {}
    uploadMode = 'success'
  }
})
test('upload is explicitly confirmed, submitted once with matching edits, and polled to completion', async () => {
  const c = new Client()
  await c.login()
  uploadMode = 'success'
  const j = await newJob(1, makeMerge()),
    path = routes.stitches.upload.href({ id: j.id }),
    before = uploads
  await c.post(path, { title: 'Test' })
  assert.equal(uploads, before)
  const drafts = [
    {
      ...confirmation,
      title: 'Morning ride',
      description: 'Coffee ☕\nA great morning & a tailwind home.',
    },
    { ...confirmation, title: 'Other tab', description: 'A different edit' },
  ]
  await Promise.all(drafts.map((draft) => c.post(path, draft)))
  assert.equal(uploads, before + 1)
  const saved = (await job(j.id, 1))!
  assert.equal(saved.state, 'processing')
  assert.equal(saved.description, drafts.find((draft) => draft.title === saved.title)?.description)
  assert.equal(lastUpload?.get('name'), saved.title)
  assert.equal(lastUpload?.get('description'), saved.description)
  await c.request(routes.stitches.status.href({ id: j.id }))
  assert.equal((await job(j.id, 1))?.state, 'complete')
  assert.equal((await job(j.id, 1))?.activityId, 500)
  await c.post(path, confirmation)
  assert.equal(uploads, before + 1)
  assert.equal((await job(j.id, 1))?.description, saved.description)
})
test('duplicates require a backup and separate confirmed removal, with fresh read-only checks', async () => {
  const c = new Client()
  await c.login()
  uploadMode = 'duplicate'
  deleted = false
  const j = await newJob(1, makeMerge()),
    path = routes.stitches.upload.href({ id: j.id }),
    removal = routes.stitches.confirmRemoval.href({ id: j.id })
  const description = 'First part\nSecond part\nAdded in Stitch: a lovely ride ☀️'
  await c.post(path, { ...confirmation, description })
  assert.equal((await job(j.id, 1))?.state, 'duplicate')
  assert.equal(lastUpload?.get('description'), description)
  assert.equal((await job(j.id, 1))?.description, description)
  const before = uploads
  await c.post(path, confirmation)
  assert.equal(uploads, before)
  await c.post(removal, { confirm: 'removed' })
  assert.ok(!(await job(j.id, 1))?.removalConfirmed)
  const backup = await c.request(routes.stitches.backup.href({ id: j.id })),
    files = unzipSync(new Uint8Array(await backup.arrayBuffer()))
  assert.equal(JSON.parse(strFromU8(files['activities.json'])).description, description)
  await c.post(removal, { confirm: 'removed' })
  assert.ok(!(await job(j.id, 1))?.removalConfirmed)
  deleted = true
  await c.post(removal, { confirm: 'removed' })
  assert.equal((await job(j.id, 1))?.removalConfirmed, true)
  assert.match(
    (await c.page(routes.stitches.show.href({ id: j.id }))).text,
    /Added in Stitch: a lovely ride ☀️/,
  )
  uploadMode = 'success'
  await c.post(path, confirmation)
  assert.equal(uploads, before + 1)
  assert.equal(lastUpload?.get('description'), description)
  deleted = false
})
test('uncertain uploads cannot be silently retried; refresh and deauthorization work', async () => {
  const c = new Client()
  await c.login()
  uploadMode = 'timeout'
  const j = await newJob(1, makeMerge()),
    path = routes.stitches.upload.href({ id: j.id })
  const value = (await account(1))!
  await saveAccount({ ...value, expires_at: 0 })
  const previousRefresh = refreshes
  await c.post(path, confirmation)
  assert.equal(refreshes, previousRefresh + 1)
  assert.equal((await job(j.id, 1))?.state, 'unknown')
  const before = uploads
  await c.post(path, confirmation)
  assert.equal(uploads, before)
  deauthorized = true
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
  assert.equal(await account(1), undefined)
  assert.equal(await job(j.id, 1), undefined)
  assert.equal(permittedGet('/activities/123'), true)
  assert.equal(permittedGet('/athlete/activities?per_page=30&page=1'), true)
  assert.equal(permittedGet('/activities/123/delete'), false)
  const crossOrigin = await worker.fetch('http://attacker.test/')
  assert.equal(crossOrigin.status, 403)
})

test('Worker serves bundled assets, rejects oversized requests, and keeps private files inaccessible', async () => {
  const script = await worker.fetch(origin + '/client/workspace.js')
  assert.equal(script.status, 200)
  assert.match(script.headers.get('content-type')!, /javascript/)
  assert.ok(!(await script.text()).includes('STRAVA_CLIENT_SECRET'))
  for (const path of ['/.env.local', '/.dev.vars', '/app/data/store.ts', '/db/stitch.sqlite'])
    assert.equal((await worker.fetch(origin + path)).status, 404)
  const tooLarge = await worker.fetch(origin + '/stitches', {
    method: 'POST',
    body: 'x'.repeat(65537),
    redirect: 'manual',
  })
  assert.equal(tooLarge.status, 413)
})

test('large encrypted previews survive object restarts and late updates preserve completion and backups', async () => {
  const c = new Client()
  await c.login(3)
  longRide = true
  const response = await c.post('/stitches', { activities: ['101', '102'] })
  longRide = false
  const id = response.headers.get('location')!.split('/').at(-1)!
  assert.notEqual(id, '')
  const sql = await server.getWorker().getDurableObjectStorage('ATHLETES', { name: '3' })
  const chunks = await sql.exec('SELECT part FROM chunks WHERE job=?', id)
  assert.ok(chunks.length > 1)
  uploadMode = 'success'
  await c.post(routes.stitches.upload.href({ id }), {
    ...confirmation,
    title: 'My edited ride',
    description: 'The full route\nWith a coffee stop ☕',
  })
  await server.getWorker().evictDurableObject('ATHLETES', { name: '3' })
  assert.equal((await job(id, 3))?.merge.pointCount, 12000)
  assert.equal((await job(id, 3))?.description, 'The full route\nWith a coffee stop ☕')
  const zip = await c.request(routes.stitches.backup.href({ id: id }))
  assert.equal(zip.status, 200)
  const files = unzipSync(new Uint8Array(await zip.arrayBuffer()))
  assert.equal((strFromU8(files['stitched-activity.gpx']).match(/<trkpt /g) ?? []).length, 12000)
  await repo(3).patchJob(id, 3, { state: 'complete', activityId: 500 })
  await repo(3).patchJob(id, 3, { state: 'processing' })
  const saved = await job(id, 3)
  assert.equal(saved?.state, 'complete')
  assert.equal(saved?.backupDownloaded, true)
  assert.equal(await repo(3).claimUpload(id, 3, 'Again'), undefined)
})

test('Strava webhook verification accepts an empty GET body and rejects the wrong token', async () => {
  const query = new URLSearchParams({
    'hub.mode': 'subscribe',
    'hub.verify_token': secrets.STRAVA_WEBHOOK_VERIFY_TOKEN,
    'hub.challenge': 'test-challenge',
  })
  const verified = await worker.fetch(origin + '/webhooks/strava?' + query, {
    headers: { 'Content-Length': '0' },
  })
  assert.equal(verified.status, 200)
  assert.deepEqual(await verified.json(), { 'hub.challenge': 'test-challenge' })
  query.set('hub.verify_token', 'wrong')
  assert.equal((await worker.fetch(origin + '/webhooks/strava?' + query)).status, 404)
})

test('a forged deauthorization notification cannot erase a connected athlete', async () => {
  const c = new Client()
  deauthorized = false
  await c.login(4)
  const response = await c.request('/webhooks/strava', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription_id: 99,
      owner_id: 4,
      object_type: 'athlete',
      aspect_type: 'update',
      updates: { authorized: 'false' },
    }),
  })
  assert.equal(response.status, 200)
  assert.ok(await account(4))
})

test('local pages, authenticated previews, downloads, and errors stay out of search', async () => {
  const c = new Client()
  for (const path of [
    '/',
    '/privacy',
    '/guides/merge-strava-activities',
    '/example',
    '/example/download',
    '/missing',
    '/stitches/private-id',
  ]) {
    const response = await c.request(path)
    assert.match(response.headers.get('x-robots-tag')!, /noindex/)
    if (response.headers.get('content-type')?.includes('text/html'))
      assert.match(await response.text(), /name="robots" content="noindex, nofollow"/)
  }
  const guide = await c.page('/guides/merge-strava-activities')
  assert.equal(guide.response.status, 200)
  assert.doesNotMatch(guide.text, /type="module"|modulepreload/)
  assert.match(guide.text, /href="https:\/\/stravastitch.com\/guides\/merge-strava-activities"/)
  const xml = await c.request('/sitemap.xml')
  assert.equal(xml.headers.get('set-cookie'), null)
  assert.doesNotMatch(await xml.text(), /<loc>/)
  assert.match(await (await c.request('/robots.txt')).text(), /Disallow: \//)
})

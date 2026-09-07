import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { createTestHarness } from 'wrangler'
import { createCookie } from 'remix/cookie'
import { createSession } from 'remix/session'
import { publicPages, publicOrigin } from '../seo.ts'

// Exercise the production origin entirely inside the local Worker harness; no live account calls.
const sessionSecret = Buffer.from(randomBytes(40)).toString('hex')
const server = createTestHarness({
  workers: [
    {
      configPath: './wrangler.jsonc',
      vars: {
        APP_ORIGIN: publicOrigin,
        STRAVA_CLIENT_ID: '123',
        STRAVA_WEBHOOK_SUBSCRIPTION_ID: '99',
      },
      secrets: {
        STRAVA_CLIENT_SECRET: 'test-client-secret',
        SESSION_SECRET: sessionSecret,
        TOKEN_ENCRYPTION_KEY: Buffer.from(randomBytes(32)).toString('base64'),
        STRAVA_WEBHOOK_VERIFY_TOKEN: 'test-hook',
      },
    },
  ],
})
const worker = server.getWorker<Env>()
await server.listen()
after(() => server.close())
const get = (path: string, method = 'GET') =>
  worker.fetch(publicOrigin + path, { method, redirect: 'manual' })

test('public production pages send complete, consistent SEO in the initial HTML', async () => {
  for (const [key, page] of Object.entries(publicPages)) {
    const response = await get(page.path)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('x-robots-tag')!, /^index, follow/)
    assert.match(response.headers.get('cache-control')!, /private, no-store/)
    const html = await response.text()
    assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1)
    assert.ok(html.includes(`href="${publicOrigin}${page.path}"`))
    assert.match(html, /name="robots" content="index, follow, max-image-preview:large"/)
    assert.match(html, /property="og:image:width" content="1200"/)
    assert.match(html, /property="og:image:height" content="630"/)
    assert.match(html, /name="twitter:card" content="summary_large_image"/)
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1)
    if (key !== 'privacy') {
      const raw = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]
      const graph = JSON.parse(raw)['@graph']
      assert.ok(
        graph.some(
          (item: { '@type': string }) => item['@type'] === (key === 'home' ? 'WebSite' : 'Article'),
        ),
      )
      assert.doesNotMatch(raw, /aggregateRating|FAQPage|private-id|secret-access/)
    }
    if (key === 'home') assert.match(html, /modulepreload/)
    else assert.doesNotMatch(html, /type="module"|modulepreload/)
  }
})

test('production sitemap lists only public canonicals; robots and HEAD do not create sessions', async () => {
  const xml = await get('/sitemap.xml')
  assert.equal(xml.status, 200)
  assert.match(xml.headers.get('content-type')!, /application\/xml/)
  assert.equal(xml.headers.get('set-cookie'), null)
  const body = await xml.text()
  const urls = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1])
  assert.deepEqual(
    urls,
    Object.values(publicPages).map((page) => publicOrigin + page.path),
  )
  assert.doesNotMatch(body, /stitches|example|auth|localhost|staging|\?page/)
  const robot = await get('/robots.txt')
  assert.equal(robot.headers.get('set-cookie'), null)
  assert.match(await robot.text(), /Allow: \/\n\nSitemap: https:\/\/stravastitch.com\/sitemap.xml/)
  const head = await get('/sitemap.xml', 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  const redirect = await get('/guides/merge-strava-activities/?utm_source=test')
  assert.equal(redirect.status, 308)
  assert.equal(
    redirect.headers.get('location'),
    publicOrigin + '/guides/merge-strava-activities?utm_source=test',
  )
})

test('private, noncanonical, unknown, and non-GET responses cannot acquire public indexing headers', async () => {
  for (const path of [
    '/example',
    '/example/download',
    '/stitches/private-id',
    '/stitches/private-id/backup',
    '/auth/strava/callback',
    '/missing',
    '/?page=2',
    '/images/missing.png',
  ]) {
    const response = await get(path)
    assert.match(response.headers.get('x-robots-tag')!, /noindex/)
  }
  const post = await get('/', 'POST')
  assert.match(post.headers.get('x-robots-tag')!, /noindex/)
})

test('share cards and icons are real publicly crawlable PNGs at their declared dimensions', async () => {
  for (const [path, width, height] of [
    ['/images/stitch-social.png', 1200, 630],
    ['/images/merge-guide-social.png', 1200, 630],
    ['/images/merge-guide.png', 1200, 675],
    ['/favicon-96.png', 96, 96],
    ['/apple-touch-icon.png', 180, 180],
  ] as const) {
    const response = await get(path)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type')!, /image\/png/)
    assert.doesNotMatch(response.headers.get('x-robots-tag') ?? '', /noindex/)
    const data = Buffer.from(await response.arrayBuffer())
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(data.readUInt32BE(16), width)
    assert.equal(data.readUInt32BE(20), height)
  }
})

test('an athlete session makes even the production homepage and guide unindexable', async () => {
  const session = createSession()
  session.set('athleteId', 987654321)
  const id = session.id
  const env = await worker.getEnv()
  await env.SESSIONS.getByName(createHash('sha256').update(id).digest('hex')).save(session.data)
  const cookie = (
    await createCookie('stitch_session', { secrets: [sessionSecret] }).serialize(id)
  ).split(';')[0]
  for (const path of ['/', '/privacy', publicPages.guide.path]) {
    const response = await worker.fetch(publicOrigin + path, { headers: { Cookie: cookie } })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('x-robots-tag')!, /noindex/)
    const html = await response.text()
    assert.match(html, /name="robots" content="noindex, nofollow"/)
    assert.doesNotMatch(html, /987654321/)
  }
})

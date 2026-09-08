import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { createTestHarness } from 'wrangler'
import { createCookie } from 'remix/cookie'
import { createSession } from 'remix/session'
import { publicPages, publicOrigin } from '../seo.ts'
import { basemapPath, basemapKey } from '../maps.ts'

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
        ANALYTICS_ENABLED: 'true',
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

test('basemap serves bounded immutable ranges without creating a session', async () => {
  const env = await worker.getEnv()
  assert.equal((await get(basemapPath, 'HEAD')).status, 503)
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
  await env.MAPS.put(basemapKey, bytes)
  const response = await worker.fetch(publicOrigin + basemapPath, {
    headers: { Range: 'bytes=16-31' },
  })
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 16-31/256')
  assert.equal(response.headers.get('content-length'), '16')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes.slice(16, 32))
  assert.equal(response.headers.get('set-cookie'), null)
  assert.match(response.headers.get('cache-control')!, /immutable/)
  assert.equal(response.headers.get('x-robots-tag'), 'noindex')
  const head = await get(basemapPath, 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('content-length'), '256')
  assert.equal(await head.text(), '')
  const clipped = await worker.fetch(publicOrigin + basemapPath, {
    headers: { Range: 'bytes=250-300', 'If-Match': head.headers.get('etag')! },
  })
  assert.equal(clipped.headers.get('content-range'), 'bytes 250-255/256')
  assert.equal((await clipped.arrayBuffer()).byteLength, 6)
  assert.equal(
    (
      await worker.fetch(publicOrigin + basemapPath, {
        headers: { Range: 'bytes=0-10', 'If-Match': '"stale"' },
      })
    ).status,
    412,
  )
  for (const range of [
    '',
    'bytes=0-',
    'bytes=-100',
    'bytes=0-2,5-7',
    'bytes=20-10',
    'bytes=0-8388608',
    'bytes=256-300',
    'bytes=9007199254740992-9007199254740993',
  ]) {
    const invalid = await worker.fetch(publicOrigin + basemapPath, {
      headers: range ? { Range: range } : {},
    })
    assert.equal(invalid.status, 416, range)
    assert.equal(invalid.headers.get('set-cookie'), null)
    assert.equal(invalid.headers.get('cache-control'), 'no-store')
  }
  assert.equal((await get(basemapPath, 'POST')).status, 405)
})

test('production pages restrict iframe embedding to danbarclay.dev without conflicting headers', async () => {
  for (const path of [...Object.values(publicPages).map((page) => page.path), '/example']) {
    const response = await get(path)
    assert.equal(response.status, 200, path)
    const directives = response.headers
      .get('content-security-policy')!
      .split(';')
      .map((directive) => directive.trim())
    assert.deepEqual(
      directives.filter((directive) => directive.startsWith('frame-ancestors')),
      ['frame-ancestors https://danbarclay.dev'],
    )
    assert.equal(response.headers.get('x-frame-options'), null)
    assert.ok(directives.includes("script-src 'self'"))
    assert.ok(directives.includes("form-action 'self' https://www.strava.com"))
  }
})

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
    else {
      assert.doesNotMatch(html, /modulepreload|src="\/client\/entry.js"/)
      assert.match(html, /src="\/client\/analytics.js"/)
    }
  }
})

test('analytics supports every page without exposing paths, and respects browser opt-outs', async () => {
  for (const [path, page] of [
    ['/', 'home'],
    ['/example', 'example'],
    ['/guides/merge-strava-activities', 'guide'],
    ['/privacy', 'privacy'],
  ]) {
    const html = await (await get(path + '?private-query=never-collect')).text()
    assert.match(html, new RegExp(`name="stitch-analytics" content="${page}"`))
    assert.match(html, /data-render="[a-f0-9-]+"/)
    assert.equal((html.match(/src="\/client\/analytics.js"/g) ?? []).length, 1)
    const headResources = [
      ...html.slice(0, html.indexOf('</head>')).matchAll(/<(?:link|meta|script)\b[^>]*>/g),
    ]
    assert.match(headResources.at(-1)![0], /data-rmx-key="site-styles"/)
  }
  for (const headers of [{ DNT: '1' }, { 'Sec-GPC': '1' }]) {
    const response = await worker.fetch(publicOrigin + '/', { headers })
    assert.doesNotMatch(await response.text(), /stitch-analytics|\/client\/analytics.js/)
  }
  const response = await worker.fetch(publicOrigin + '/analytics', {
    method: 'POST',
    headers: { Origin: publicOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'page_view', page: 'home', placement: 'unknown' }),
  })
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('set-cookie'), null)
})

test('the public example renders all phases with an initial selection and no upload action', async () => {
  for (const [path, selected] of [
    ['/', 0],
    ['/example', 1],
  ] as const) {
    const html = await (await get(path)).text()
    const tabs = [...html.matchAll(/<button\b[^>]*role="tab"[^>]*>/g)].map((match) => match[0])
    assert.equal(tabs.length, 3)
    assert.equal(tabs.filter((tab) => tab.includes('aria-selected="true"')).length, 1)
    assert.match(tabs[selected], /aria-selected="true"/)
    const panels = [...html.matchAll(/<div\b[^>]*role="tabpanel"[^>]*>/g)].map((match) => match[0])
    assert.equal(panels.length, 3)
    assert.doesNotMatch(panels[selected], /\bhidden\b/)
    assert.equal(panels.filter((panel) => /\bhidden\b/.test(panel)).length, 2)
    assert.match(html, /Out into the hills \+ The way home/)
    assert.match(html, /A quiet climb into the Peaks/)
    assert.match(html, /Back through the valley/)
    assert.match(html, /href="\/example\/download" download/)
    assert.doesNotMatch(html, /action="\/stitches\/[^" ]+\/(?:upload|removal)"/)
    assert.match(
      html,
      /<form data-rmx-document action="\/auth\/strava" method="post"><input type="hidden" name="_csrf" value="[^"]+"/,
    )
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

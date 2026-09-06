import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canIndex, pageSeo, publicOrigin, robots, serializeJsonLd, sitemap } from './seo.ts'

test('only canonical public production pages can be indexed', () => {
  assert.equal(canIndex(new URL(publicOrigin)), true)
  for (const path of [
    '/example',
    '/stitches/private-id',
    '/auth/strava/callback?code=secret',
    '/?page=2',
    '/missing',
  ])
    assert.equal(canIndex(new URL(path, publicOrigin)), false)
  for (const origin of [
    'http://localhost:44100',
    'https://staging.stravastitch.com',
    'https://unexpected.test',
  ]) {
    assert.equal(canIndex(new URL(origin)), false)
    assert.equal(pageSeo('home', new URL(origin)).indexable, false)
    assert.doesNotMatch(sitemap(origin), /<loc>/)
    assert.match(robots(origin), /Disallow: \/\n/)
  }
  assert.equal(canIndex(new URL(publicOrigin), true), false)
  const seo = pageSeo('home', new URL('/?activity=private-name', publicOrigin), true)
  assert.equal(seo.canonical, publicOrigin + '/')
  assert.doesNotMatch(JSON.stringify(seo), /private-name/)
})

test('structured data cannot close its script element or become executable HTML', () => {
  const input = {
    headline: '</script><script>alert("private")</script>',
    text: '< & \u2028 \u2029',
  }
  const serialized = serializeJsonLd(input)
  assert.doesNotMatch(serialized, /</)
  assert.deepEqual(JSON.parse(serialized), input)
})

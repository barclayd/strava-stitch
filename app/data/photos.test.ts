import { test } from 'node:test'
import assert from 'node:assert/strict'
import { permittedPhotoUrl, readPhoto, maxPhotoBytes } from './photos.ts'

test('photo proxy restricts origins and refuses placeholders, redirects, non-images and oversized bodies', async () => {
  const url = 'https://dgtzuqphqg23d.cloudfront.net/photo.jpg'
  for (const bad of [
    'http://dgtzuqphqg23d.cloudfront.net/photo.jpg',
    'https://evil.example/a.jpg',
    'https://dgtzuqphqg23d.cloudfront.net.evil.example/a.jpg',
    'https://user:pass@dgtzuqphqg23d.cloudfront.net/a.jpg',
    'https://dgtzuqphqg23d.cloudfront.net/placeholder-photo.jpg',
    'https://dgtzuqphqg23d.cloudfront.net/a.svg',
    'http://127.0.0.1/a.jpg',
  ])
    assert.equal(permittedPhotoUrl(bad), false)
  assert.equal(permittedPhotoUrl(url), true)
  const original = globalThis.fetch
  let result = () =>
    new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } })
  let calls = 0
  globalThis.fetch = async (input, init) => {
    calls++
    assert.equal(String(input), url)
    assert.equal(init?.redirect, 'manual')
    assert.equal(new Headers(init?.headers).has('Authorization'), false)
    return result()
  }
  try {
    assert.equal((await readPhoto('http://127.0.0.1/a.jpg')).status, 404)
    assert.equal(calls, 0)
    const good = await readPhoto(url)
    assert.equal(good.status, 200)
    assert.deepEqual([...new Uint8Array(await good.arrayBuffer())], [1, 2, 3])
    result = () =>
      new Response(null, { status: 302, headers: { Location: 'https://evil.example/a.jpg' } })
    assert.equal((await readPhoto(url)).status, 502)
    result = () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } })
    assert.equal((await readPhoto(url)).status, 502)
    result = () =>
      new Response(new Uint8Array(maxPhotoBytes + 1), { headers: { 'Content-Type': 'image/jpeg' } })
    assert.equal((await readPhoto(url)).status, 502)
    result = () => new Response(null, { status: 404 })
    assert.equal((await readPhoto(url)).status, 502)
  } finally {
    globalThis.fetch = original
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allPhotosSaved, downloadsReady, type LocalBackup } from './backup-storage.ts'

test('backup readiness requires real files, complete counts, both downloads and an unexpired preview', () => {
  const value: LocalBackup = {
    id: 'a',
    expires: Date.now() + 60000,
    photos: [],
    manifest: {
      expected: 2,
      complete: true,
      items: [
        { key: '1', source: 1 },
        { key: '2', source: 1 },
      ],
    },
  }
  assert.equal(allPhotosSaved(value), false)
  value.photos = [{ key: '1', source: 1, blob: new Blob(['one']) }]
  value.photosDownloaded = true
  value.activitiesDownloaded = true
  assert.equal(downloadsReady(value), false, 'a partial archive never earns readiness')
  value.photos.push({ key: '2', source: 1, blob: new Blob([]) })
  assert.equal(downloadsReady(value), false, 'empty image bytes do not count')
  value.photos[1].blob = new Blob(['two'])
  assert.equal(downloadsReady(value), true)
  value.manifest!.complete = false
  assert.equal(downloadsReady(value), false, 'unverified album counts do not count')
  value.manifest!.complete = true
  value.photosDownloaded = false
  assert.equal(downloadsReady(value), false, 'browser persistence alone is not a download')
  value.photosDownloaded = true
  value.activitiesDownloaded = false
  assert.equal(downloadsReady(value), false)
  value.activitiesDownloaded = true
  value.expires = Date.now() - 1
  assert.equal(downloadsReady(value), false)
})

test('confirmed zero photos needs no photo ZIP, while unknown counts never mean zero', () => {
  const value: LocalBackup = {
    id: 'a',
    expires: Date.now() + 60000,
    photos: [],
    activitiesDownloaded: true,
  }
  assert.equal(downloadsReady(value), false)
  value.manifest = { expected: null, complete: false, items: [] }
  assert.equal(downloadsReady(value), false)
  value.manifest = { expected: 0, complete: true, items: [] }
  assert.equal(downloadsReady(value), true)
})

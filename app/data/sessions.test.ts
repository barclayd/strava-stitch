import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atomicSessionStorage } from './sessions.ts'

test('concurrent session saves stay readable and logout cannot be undone by an in-flight request', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stitch-session-'))
  try {
    const storage = atomicSessionStorage(directory),
      initial = await storage.read(null)
    initial.set('athleteId', 123)
    await storage.save(initial)
    const a = await storage.read(initial.id),
      b = await storage.read(initial.id)
    a.flash('error', 'short')
    b.flash('error', 'a much longer message to exercise variable JSON length')
    await Promise.all([storage.save(a), storage.save(b)])
    assert.equal((await storage.read(initial.id)).get('athleteId'), 123)
    a.destroy()
    await storage.save(a)
    b.set('late', 'data')
    await storage.save(b)
    assert.equal((await storage.read(initial.id)).get('athleteId'), undefined)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

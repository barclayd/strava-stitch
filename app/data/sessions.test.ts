import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestHarness } from 'wrangler'
import { persistentSessions } from './sessions.ts'

test('concurrent session saves stay readable and logout cannot be undone by an in-flight request', async () => {
  const server = createTestHarness({
    workers: [
      {
        configPath: './wrangler.jsonc',
        secrets: {
          STRAVA_CLIENT_SECRET: 'test',
          SESSION_SECRET: 's'.repeat(40),
          TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
          STRAVA_WEBHOOK_VERIFY_TOKEN: 'test',
        },
      },
    ],
  })
  const worker = server.getWorker<Env>()
  await server.listen()
  const env = await worker.getEnv()
  try {
    const storage = persistentSessions({
        read: (id) => env.SESSIONS.getByName(id).read(),
        save: (id, data) => env.SESSIONS.getByName(id).save(data),
        revoke: (id) => env.SESSIONS.getByName(id).revoke(),
      }),
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
    await server.close()
  }
})

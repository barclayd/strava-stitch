import { mkdirSync } from 'node:fs'
import { createCookie } from 'remix/cookie'
import { session } from 'remix/middleware/session'
import { atomicSessionStorage } from '../data/sessions.ts'
import { config } from '../data/config.ts'

const directory = process.env.SESSION_DIR ?? './tmp/sessions'
mkdirSync(directory, { recursive: true, mode: 0o700 })
export const sessionMiddleware = session(
  createCookie('stitch_session', {
    secrets: [config.sessionSecret],
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.origin.startsWith('https:'),
    maxAge: 604800,
    path: '/',
  }),
  atomicSessionStorage(directory),
)

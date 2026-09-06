import { createHash, randomUUID } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  statSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { createSession, type SessionStorage } from 'remix/session'

// Atomic replacement prevents concurrent requests from interleaving JSON writes.
// Revocation markers prevent an in-flight request from restoring a logged-out session.
export function atomicSessionStorage(directory: string): SessionStorage {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const location = (id: string) => {
    const hash = createHash('sha256').update(id).digest('hex')
    return join(directory, hash.slice(0, 2), hash.slice(2))
  }
  const remove = (path: string) => {
    try {
      unlinkSync(path)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
  }
  function revoke(id: string) {
    const path = location(id)
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    writeFileSync(path + '.revoked', '', { mode: 0o600 })
    remove(path)
  }
  return {
    async read(cookie) {
      if (cookie) {
        const path = location(cookie)
        try {
          if (existsSync(path + '.revoked') || Date.now() - statSync(path).mtimeMs > 604800000)
            return createSession()
          return createSession(cookie, JSON.parse(readFileSync(path, 'utf8')))
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError))
            throw error
        }
      }
      return createSession()
    },
    async save(session) {
      if (session.deleteId) revoke(session.deleteId)
      if (session.destroyed) {
        revoke(session.id)
        return ''
      }
      const path = location(session.id)
      if (existsSync(path + '.revoked')) return null
      if (session.dirty) {
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
        const temporary = path + '.' + randomUUID() + '.tmp'
        try {
          writeFileSync(temporary, JSON.stringify(session.data), { mode: 0o600 })
          renameSync(temporary, path)
        } finally {
          remove(temporary)
        }
        return session.id
      }
      return null
    },
  }
}

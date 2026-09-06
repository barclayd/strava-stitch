import { createHash } from 'node:crypto'
import { createSession, type Session, type SessionStorage } from 'remix/session'

export type SessionData = Session['data']

export interface SessionBackend {
  read(id: string): Promise<SessionData | undefined>
  save(id: string, data: SessionData): Promise<boolean>
  revoke(id: string): Promise<void>
}
export function persistentSessions(backend: SessionBackend): SessionStorage {
  const key = (id: string) => createHash('sha256').update(id).digest('hex')
  return {
    async read(cookie) {
      if (cookie && /^[a-zA-Z0-9_-]{20,128}$/.test(cookie)) {
        const data = await backend.read(key(cookie))
        if (data) return createSession(cookie, data)
      }
      return createSession()
    },
    async save(session) {
      if (session.deleteId) await backend.revoke(key(session.deleteId))
      if (session.destroyed) {
        await backend.revoke(key(session.id))
        return ''
      }
      if (!session.dirty) return null
      return (await backend.save(key(session.id), session.data)) ? session.id : null
    },
  }
}

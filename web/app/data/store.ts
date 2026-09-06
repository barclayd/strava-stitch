import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes, createCipheriv, createDecipheriv, randomUUID } from 'node:crypto'
import { config } from './config.ts'
import type { Merge } from '../actions/stitches/merge.ts'

export type Account = {
  id: number
  firstname: string
  scope: string[]
  access_token: string
  refresh_token: string
  expires_at: number
}
export type Job = {
  id: string
  owner: number
  created: number
  title: string
  merge: Merge
  state: 'ready' | 'submitting' | 'processing' | 'duplicate' | 'failed' | 'unknown' | 'complete'
  uploadId?: number
  activityId?: number
  error?: string
  backupDownloaded?: boolean
  removalConfirmed?: boolean
}
mkdirSync(dirname(config.database), { recursive: true, mode: 0o700 })
const db = new DatabaseSync(config.database)
chmodSync(config.database, 0o600)
db.exec(
  'PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, owner INTEGER NOT NULL, created INTEGER NOT NULL, payload TEXT NOT NULL);',
)
function expireJobs() {
  db.prepare('DELETE FROM jobs WHERE created<?').run(Date.now() - 86400000)
}
expireJobs()
const expiryTimer = setInterval(expireJobs, 3600000)
expiryTimer.unref()
export function seal(value: unknown): string {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', config.encryptionKey, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}
export function unseal<T>(value: string): T {
  const bytes = Buffer.from(value, 'base64'),
    decipher = createDecipheriv('aes-256-gcm', config.encryptionKey, bytes.subarray(0, 12))
  decipher.setAuthTag(bytes.subarray(12, 28))
  return JSON.parse(
    Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'),
  )
}
export function account(id: number): Account | undefined {
  const row = db.prepare('SELECT payload FROM accounts WHERE id=?').get(id) as
    { payload: string } | undefined
  return row ? unseal<Account>(row.payload) : undefined
}
export function saveAccount(value: Account) {
  db.prepare(
    'INSERT INTO accounts VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
  ).run(value.id, seal(value))
}
export function forgetAccount(id: number) {
  db.prepare('DELETE FROM accounts WHERE id=?').run(id)
  db.prepare('DELETE FROM jobs WHERE owner=?').run(id)
}
export function saveJob(value: Job) {
  db.prepare(
    'INSERT INTO jobs VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
  ).run(value.id, value.owner, value.created, seal(value))
}
export function job(id: string, owner: number): Job | undefined {
  db.prepare('DELETE FROM jobs WHERE created<?').run(Date.now() - 86400000)
  const row = db.prepare('SELECT payload FROM jobs WHERE id=? AND owner=?').get(id, owner) as
    { payload: string } | undefined
  return row ? unseal<Job>(row.payload) : undefined
}
export function jobs(owner: number): Job[] {
  db.prepare('DELETE FROM jobs WHERE created<?').run(Date.now() - 86400000)
  return (
    db
      .prepare('SELECT payload FROM jobs WHERE owner=? ORDER BY created DESC LIMIT 12')
      .all(owner) as { payload: string }[]
  ).map((r) => unseal<Job>(r.payload))
}
export function newJob(owner: number, merge: Merge): Job {
  const j: Job = {
    id: randomUUID(),
    owner,
    created: Date.now(),
    title: 'My ride — stitched',
    merge,
    state: 'ready',
  }
  saveJob(j)
  return j
}
// Set before awaiting Strava so double-clicks and concurrent requests cannot upload twice.
export function claimUpload(id: string, owner: number): Job | undefined {
  const j = job(id, owner)
  if (!j || !['ready', 'duplicate', 'failed'].includes(j.state)) return undefined
  j.state = 'submitting'
  j.error = undefined
  saveJob(j)
  return j
}

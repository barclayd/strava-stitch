import { randomUUID } from 'node:crypto'
import { seal, unseal } from './encryption.ts'
import type { Account, Job, JobPatch, JobSummary } from './store.ts'
import { mergedDescription, type Merge } from '../actions/stitches/merge.ts'

export type SqlValue = string | number | null
export interface SqlDatabase {
  query<T extends Record<string, SqlValue>>(sql: string, ...values: SqlValue[]): T[]
  transaction<T>(action: () => T): T
}
const ttl = 86400000
const chunkSize = 250000

// One repository per athlete. Split encrypted payloads to stay below SQLite row limits.
export class AthleteRepository {
  constructor(
    private db: SqlDatabase,
    private key: Uint8Array,
  ) {
    db.query('CREATE TABLE IF NOT EXISTS account (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)')
    db.query(
      'CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, created INTEGER NOT NULL, metadata TEXT NOT NULL)',
    )
    db.query(
      'CREATE TABLE IF NOT EXISTS chunks (job TEXT NOT NULL, part INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(job, part))',
    )
  }
  account(): Account | undefined {
    const value = this.db.query<{ payload: string }>('SELECT payload FROM account LIMIT 1')[0]
    return value ? unseal<Account>(value.payload, this.key) : undefined
  }
  saveAccount(value: Account) {
    const existing = this.account()
    if (existing && existing.id !== value.id) throw new Error('Account ownership mismatch.')
    this.db.query(
      'INSERT INTO account VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
      value.id,
      seal(value, this.key),
    )
  }
  forget() {
    this.db.transaction(() => {
      this.db.query('DELETE FROM account')
      this.db.query('DELETE FROM jobs')
      this.db.query('DELETE FROM chunks')
    })
  }
  expire() {
    this.db.transaction(() => {
      this.db.query(
        'DELETE FROM chunks WHERE job IN (SELECT id FROM jobs WHERE created<?)',
        Date.now() - ttl,
      )
      this.db.query('DELETE FROM jobs WHERE created<?', Date.now() - ttl)
    })
  }
  newJob(owner: number, merge: Merge): Job {
    if (this.account()?.id !== owner) throw new Error('Connect Strava to continue.')
    this.expire()
    const j: Job = {
      id: randomUUID(),
      owner,
      created: Date.now(),
      title: 'My activity — stitched',
      description: mergedDescription(merge),
      merge,
      state: 'ready',
    }
    const { merge: content, ...metadata } = j
    const payload = seal(content, this.key)
    if (payload.length > 24000000)
      throw new Error('This activity is too large to preview. Try fewer activities.')
    this.db.transaction(() => {
      this.db.query('INSERT INTO jobs VALUES (?, ?, ?)', j.id, j.created, seal(metadata, this.key))
      for (let i = 0; i < payload.length; i += chunkSize)
        this.db.query(
          'INSERT INTO chunks VALUES (?, ?, ?)',
          j.id,
          i / chunkSize,
          payload.slice(i, i + chunkSize),
        )
    })
    return j
  }
  private metadata(id: string): Omit<Job, 'merge'> | undefined {
    const row = this.db.query<{ metadata: string }>(
      'SELECT metadata FROM jobs WHERE id=? AND created>=?',
      id,
      Date.now() - ttl,
    )[0]
    return row ? unseal<Omit<Job, 'merge'>>(row.metadata, this.key) : undefined
  }
  job(id: string, owner: number): Job | undefined {
    const metadata = this.metadata(id)
    if (!metadata || metadata.owner !== owner || this.account()?.id !== owner) return undefined
    const bytes = this.db
      .query<{ payload: string }>('SELECT payload FROM chunks WHERE job=? ORDER BY part', id)
      .map((r) => r.payload)
      .join('')
    return { ...metadata, merge: unseal<Merge>(bytes, this.key) }
  }
  jobs(owner: number): JobSummary[] {
    if (this.account()?.id !== owner) return []
    this.expire()
    return this.db
      .query<{ metadata: string }>('SELECT metadata FROM jobs ORDER BY created DESC LIMIT 12')
      .map((row) => {
        const { id, title, state } = unseal<Omit<Job, 'merge'>>(row.metadata, this.key)
        return { id, title, state }
      })
  }
  patchJob(
    id: string,
    owner: number,
    patch: JobPatch,
    expectedState?: Job['state'],
  ): Job | undefined {
    const metadata = this.metadata(id)
    if (!metadata || metadata.owner !== owner || this.account()?.id !== owner) return undefined
    if (expectedState !== undefined && metadata.state !== expectedState) return undefined
    // Late status polls must never move a completed upload backwards.
    if (metadata.state === 'complete' && patch.state && patch.state !== 'complete')
      return this.job(id, owner)
    this.db.query(
      'UPDATE jobs SET metadata=? WHERE id=?',
      seal({ ...metadata, ...patch }, this.key),
      id,
    )
    return this.job(id, owner)
  }
  claimUpload(id: string, owner: number, title: string, description?: string): Job | undefined {
    return this.db.transaction(() => {
      const metadata = this.metadata(id)
      if (!metadata || metadata.owner !== owner || this.account()?.id !== owner) return undefined
      if (!['ready', 'duplicate', 'failed'].includes(metadata.state)) return undefined
      if (metadata.state === 'duplicate' && !metadata.removalConfirmed) return undefined
      this.db.query(
        'UPDATE jobs SET metadata=? WHERE id=?',
        seal(
          {
            ...metadata,
            title,
            description: description ?? metadata.description,
            state: 'submitting',
            error: undefined,
          },
          this.key,
        ),
        id,
      )
      return this.job(id, owner)
    })
  }
}

import { DurableObject } from 'cloudflare:workers'
import type { SessionData } from '../data/sessions.ts'
import { AthleteRepository, type SqlDatabase, type SqlValue } from '../data/athlete-repository.ts'
import { readConfig } from '../data/config.ts'
import { seal, unseal } from '../data/encryption.ts'
import { exchangeWithConfig, StravaError } from '../data/strava.ts'
import type { Account, JobPatch } from '../data/store.ts'
import type { Merge } from '../actions/stitches/merge.ts'

export class AthleteData extends DurableObject<Env> {
  private repository: AthleteRepository
  private refreshing?: Promise<Account | undefined>
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const database: SqlDatabase = {
      query: <T extends Record<string, SqlValue>>(sql: string, ...values: SqlValue[]) =>
        this.ctx.storage.sql.exec<T>(sql, ...values).toArray(),
      transaction: (action) => this.ctx.storage.transactionSync(action),
    }
    this.repository = new AthleteRepository(database, readConfig(env).encryptionKey)
  }
  account() {
    return this.repository.account()
  }
  saveAccount(value: Account) {
    this.repository.saveAccount(value)
  }
  forgetAccount() {
    this.repository.forget()
  }
  invalidateAccount(accessToken: string) {
    if (this.repository.account()?.access_token === accessToken) this.repository.forget()
  }
  async verifyDeauthorization() {
    const current = await this.credentials()
    if (!current) return
    const response = await fetch('https://www.strava.com/api/v3/athlete', {
      headers: { Authorization: 'Bearer ' + current.access_token },
      redirect: 'manual',
      signal: AbortSignal.timeout(1500),
    })
    await response.body?.cancel()
    // Strava does not sign webhook notifications. Verify revoked access before erasing data.
    if (response.status === 401) this.invalidateAccount(current.access_token)
    else if (!response.ok) throw new Error('Strava could not verify deauthorization.')
  }
  async newJob(owner: number, merge: Merge) {
    const result = this.repository.newJob(owner, merge)
    if ((await this.ctx.storage.getAlarm()) === null)
      await this.ctx.storage.setAlarm(Date.now() + 3600000)
    return result
  }
  job(id: string, owner: number) {
    return this.repository.job(id, owner)
  }
  jobs(owner: number) {
    return this.repository.jobs(owner)
  }
  patchJob(id: string, owner: number, patch: JobPatch) {
    return this.repository.patchJob(id, owner, patch)
  }
  claimUpload(id: string, owner: number, title: string, description?: string) {
    return this.repository.claimUpload(id, owner, title, description)
  }
  async alarm() {
    this.repository.expire()
    const remaining = this.ctx.storage.sql.exec('SELECT id FROM jobs LIMIT 1').toArray()
    if (remaining.length) await this.ctx.storage.setAlarm(Date.now() + 3600000)
  }
  async credentials(): Promise<Account | undefined> {
    const current = this.repository.account()
    if (!current || current.expires_at > Date.now() / 1000 + 120) return current
    if (this.refreshing) return this.refreshing
    this.refreshing = (async () => {
      try {
        const data = await exchangeWithConfig(readConfig(this.env), {
          grant_type: 'refresh_token',
          refresh_token: current.refresh_token,
        })
        const latest = this.repository.account()
        // A disconnect or a newer OAuth grant must win over an in-flight refresh.
        if (
          !latest ||
          latest.refresh_token !== current.refresh_token ||
          latest.access_token !== current.access_token
        )
          return latest
        const next = {
          ...latest,
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
        }
        this.repository.saveAccount(next)
        return next
      } catch (error) {
        const latest = this.repository.account()
        if (
          !latest ||
          latest.refresh_token !== current.refresh_token ||
          latest.access_token !== current.access_token
        )
          return latest
        if (error instanceof StravaError && [400, 401].includes(error.status))
          this.repository.forget()
        throw error
      } finally {
        this.refreshing = undefined
      }
    })()
    return this.refreshing
  }
}

export class BrowserSession extends DurableObject<Env> {
  private key: Uint8Array
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.key = readConfig(env).encryptionKey
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS session (id INTEGER PRIMARY KEY, payload TEXT, expires INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)',
    )
  }
  read(): SessionData | undefined {
    const row = this.ctx.storage.sql
      .exec<{ payload: string; expires: number; revoked: number }>(
        'SELECT payload, expires, revoked FROM session WHERE id=1',
      )
      .toArray()[0]
    return row && !row.revoked && row.expires > Date.now()
      ? unseal<SessionData>(row.payload, this.key)
      : undefined
  }
  async save(data: SessionData): Promise<boolean> {
    const existing = this.ctx.storage.sql
      .exec<{ revoked: number; expires: number }>('SELECT revoked, expires FROM session WHERE id=1')
      .toArray()[0]
    if (existing && (existing.revoked || existing.expires <= Date.now())) return false
    const expires = Date.now() + 604800000
    this.ctx.storage.sql.exec(
      'INSERT INTO session VALUES (1, ?, ?, 0) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, expires=excluded.expires',
      seal(data, this.key),
      expires,
    )
    await this.ctx.storage.setAlarm(expires)
    return true
  }
  async revoke() {
    const expires = Date.now() + 604800000
    this.ctx.storage.sql.exec(
      'INSERT INTO session VALUES (1, NULL, ?, 1) ON CONFLICT(id) DO UPDATE SET payload=NULL, expires=excluded.expires, revoked=1',
      expires,
    )
    await this.ctx.storage.setAlarm(expires)
  }
  async alarm() {
    await this.ctx.storage.deleteAll()
  }
}

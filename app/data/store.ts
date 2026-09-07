import type { Merge } from '../actions/stitches/merge.ts'
import { runtime } from './runtime.ts'

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
  description?: string
  merge: Merge
  state: 'ready' | 'submitting' | 'processing' | 'duplicate' | 'failed' | 'unknown' | 'complete'
  uploadId?: number
  activityId?: number
  error?: string
  backupDownloaded?: boolean
  removalConfirmed?: boolean
}
export type JobPatch = Partial<
  Pick<Job, 'state' | 'uploadId' | 'activityId' | 'error' | 'backupDownloaded' | 'removalConfirmed'>
>
export type JobSummary = Pick<Job, 'id' | 'title' | 'state'>
export interface Store {
  account(id: number): Promise<Account | undefined>
  saveAccount(value: Account): Promise<void>
  forgetAccount(id: number): Promise<void>
  invalidateAccount(id: number, accessToken: string): Promise<void>
  verifyDeauthorization(id: number): Promise<void>
  newJob(owner: number, merge: Merge): Promise<Job>
  job(id: string, owner: number): Promise<Job | undefined>
  jobs(owner: number): Promise<JobSummary[]>
  patchJob(id: string, owner: number, patch: JobPatch): Promise<Job | undefined>
  claimUpload(
    id: string,
    owner: number,
    title: string,
    description?: string,
  ): Promise<Job | undefined>
  credentials(id: number): Promise<Account | undefined>
}
export const account = (id: number) => runtime().store.account(id)
export const saveAccount = (value: Account) => runtime().store.saveAccount(value)
export const forgetAccount = (id: number) => runtime().store.forgetAccount(id)
export const newJob = (owner: number, merge: Merge) => runtime().store.newJob(owner, merge)
export const job = (id: string, owner: number) => runtime().store.job(id, owner)
export const jobs = (owner: number) => runtime().store.jobs(owner)
export const patchJob = (id: string, owner: number, patch: JobPatch) =>
  runtime().store.patchJob(id, owner, patch)
export const claimUpload = (id: string, owner: number, title: string, description?: string) =>
  runtime().store.claimUpload(id, owner, title, description)

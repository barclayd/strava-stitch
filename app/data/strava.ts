import { getConfig, type AppConfig } from './config.ts'
import { runtime } from './runtime.ts'
import { type Account } from './store.ts'
import type { Activity, Streams } from '../actions/stitches/merge.ts'

export class StravaError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export const SCOPES = ['read', 'activity:read', 'activity:read_all', 'activity:write']
type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_at: number
  scope?: string
  athlete?: { id: number; firstname?: string }
}
async function readJson<T>(response: Response): Promise<T> {
  if (!response.body) throw new Error('Strava returned an empty response.')
  const reader = response.body.getReader(),
    decoder = new TextDecoder()
  let size = 0,
    body = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 8000000) {
      await reader.cancel()
      throw new Error('This activity is too large for this version of Stitch.')
    }
    body += decoder.decode(value, { stream: true })
  }
  return JSON.parse(body + decoder.decode()) as T
}
const API = 'https://www.strava.com/api/v3'
export async function exchangeWithConfig(config: AppConfig, params: Record<string, string>) {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...params,
    }),
    signal: AbortSignal.timeout(20000),
    redirect: 'manual',
  })
  if (!response.ok)
    throw new StravaError(
      response.status,
      'Strava could not complete the connection. Please connect again.',
    )
  const data = await readJson<TokenResponse>(response)
  if (
    typeof data.access_token !== 'string' ||
    typeof data.refresh_token !== 'string' ||
    !Number.isFinite(data.expires_at)
  )
    throw new Error('Strava returned an incomplete connection.')
  return data
}
export const exchange = (params: Record<string, string>) => exchangeWithConfig(getConfig(), params)
async function credentials(id: number): Promise<Account> {
  const value = await runtime().store.credentials(id)
  if (!value) throw new StravaError(401, 'Connect Strava to continue.')
  return value
}
export function permittedGet(path: string) {
  return (
    /^\/athlete\/activities\?per_page=30&page=[1-9]\d{0,3}$/.test(path) ||
    /^\/activities\/\d+(?:\/streams\?keys=time,latlng,altitude,distance,heartrate,cadence,temp&key_by_type=true)?$/.test(
      path,
    ) ||
    /^\/uploads\/\d+$/.test(path)
  )
}
export async function get<T>(id: number, path: string): Promise<T> {
  if (!permittedGet(path)) throw new Error('Unsupported Strava read operation.')
  const auth = await credentials(id)
  const response = await fetch(API + path, {
    headers: { Authorization: 'Bearer ' + auth.access_token },
    signal: AbortSignal.timeout(30000),
    redirect: 'manual',
  })
  if (!response.ok) {
    if (response.status === 401) await runtime().store.invalidateAccount(id, auth.access_token)
    throw new StravaError(
      response.status,
      response.status === 429
        ? 'Strava’s request limit has been reached. Please try again later.'
        : response.status === 404
          ? 'This activity is no longer available on Strava.'
          : response.status === 401
            ? 'Your Strava connection has expired. Please reconnect.'
            : 'Strava could not load this activity. Please try again.',
    )
  }
  return readJson<T>(response)
}
export const listActivities = (id: number, page: number) =>
  get<Activity[]>(id, `/athlete/activities?per_page=30&page=${page}`)
export const activity = (id: number, activityId: number) =>
  get<Activity>(id, `/activities/${activityId}`)
export const streams = (id: number, activityId: number) =>
  get<Streams>(
    id,
    `/activities/${activityId}/streams?keys=time,latlng,altitude,distance,heartrate,cadence,temp&key_by_type=true`,
  )
export type Upload = {
  id?: number
  id_str?: string
  activity_id?: number
  error?: string
  status?: string
}
export async function upload(
  id: number,
  gpx: string,
  name: string,
  externalId: string,
): Promise<Upload> {
  const auth = await credentials(id)
  if (!auth.scope.includes('activity:write'))
    throw new StravaError(403, 'Allow uploads in your Strava connection to continue.')
  const body = new FormData()
  body.set('file', new Blob([gpx], { type: 'application/gpx+xml' }), 'stitched.gpx')
  body.set('name', name)
  body.set('data_type', 'gpx')
  body.set('external_id', externalId)
  body.set('description', 'Combined with Stitch. Original timestamps and gaps preserved.')
  const response = await fetch(API + '/uploads', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + auth.access_token },
    body,
    signal: AbortSignal.timeout(40000),
    redirect: 'manual',
  })
  const result = await readJson<Upload>(response)
  if (!response.ok)
    throw new StravaError(
      response.status,
      result?.error?.toLowerCase?.().includes('duplicate')
        ? 'Strava identified a duplicate activity.'
        : 'Strava did not accept the upload. Please check your connection and try again.',
    )
  return result
}

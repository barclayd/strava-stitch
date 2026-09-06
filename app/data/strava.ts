import { config } from './config.ts'
import { account, saveAccount, forgetAccount, type Account } from './store.ts'
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
const API = 'https://www.strava.com/api/v3'
const refreshing = new Map<number, Promise<Account>>()
export async function exchange(params: Record<string, string>) {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...params,
    }),
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
  })
  if (!response.ok)
    throw new StravaError(
      response.status,
      'Strava could not complete the connection. Please connect again.',
    )
  const data = await response.json()
  if (
    typeof data.access_token !== 'string' ||
    typeof data.refresh_token !== 'string' ||
    !Number.isFinite(data.expires_at)
  )
    throw new Error('Strava returned an incomplete connection.')
  return data
}
async function credentials(id: number): Promise<Account> {
  const current = account(id)
  if (!current) throw new StravaError(401, 'Connect Strava to continue.')
  if (current.expires_at > Date.now() / 1000 + 120) return current
  if (!refreshing.has(id))
    refreshing.set(
      id,
      (async () => {
        try {
          const data = await exchange({
            grant_type: 'refresh_token',
            refresh_token: current.refresh_token,
          })
          const next = {
            ...current,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: data.expires_at,
          }
          saveAccount(next)
          return next
        } catch (error) {
          if (error instanceof StravaError && [400, 401].includes(error.status)) forgetAccount(id)
          throw error
        } finally {
          refreshing.delete(id)
        }
      })(),
    )
  return refreshing.get(id)!
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
    redirect: 'error',
  })
  if (!response.ok) {
    if (response.status === 401) forgetAccount(id)
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
  return response.json() as Promise<T>
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
    redirect: 'error',
  })
  const result = await response.json()
  if (!response.ok)
    throw new StravaError(
      response.status,
      result?.error?.toLowerCase?.().includes('duplicate')
        ? 'Strava identified a duplicate activity.'
        : 'Strava did not accept the upload. Please check your connection and try again.',
    )
  return result
}

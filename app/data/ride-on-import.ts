import { get, StravaError } from './strava.ts'
import { runtime } from './runtime.ts'

export const cyclingSports = new Set([
  'Ride',
  'MountainBikeRide',
  'GravelRide',
  'VirtualRide',
  'EBikeRide',
  'EMountainBikeRide',
  'Handcycle',
  'Velomobile',
])
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid activity response')
  return value as Record<string, unknown>
}
const positiveId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const metric = (value: unknown): number | null => {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error('Invalid activity metric')
  return value
}

// Called only after the private entrypoint has checked the athlete's grant.
// Raw responses and GPS exist only for this request and are never persisted.
export async function importRead(url: URL, athleteId: number, grant: string) {
  const store = runtime().store
  const sameGrant = async () => {
    if ((await store.account(athleteId))?.connectionId !== grant)
      throw new StravaError(401, 'Connection changed')
  }
  if (url.pathname.startsWith('/import-page/')) {
    const page = url.searchParams.get('page') ?? '1'
    const after = url.searchParams.get('after') ?? ''
    const before = url.searchParams.get('before') ?? ''
    if (
      !/^[1-9]\d{0,3}$/.test(page) ||
      !/^\d{1,10}$/.test(after) ||
      !/^\d{1,10}$/.test(before) ||
      Number(after) >= Number(before)
    )
      return { status: 400, body: { error: 'BAD_REQUEST' } }
    const data = await get<unknown>(
      athleteId,
      `/athlete/activities?per_page=30&page=${page}&after=${after}&before=${before}`,
    )
    await sameGrant()
    if (!Array.isArray(data) || data.length > 30) throw new Error('Invalid activity page')
    const activityIds: string[] = []
    for (const value of data) {
      const activity = record(value)
      if (record(activity.athlete).id !== athleteId || !positiveId(activity.id))
        throw new Error('Invalid activity owner')
      if (typeof activity.sport_type === 'string' && cyclingSports.has(activity.sport_type))
        activityIds.push(String(activity.id))
    }
    return {
      status: 200,
      body: {
        activityIds,
        nextPage: data.length === 30 ? Number(page) + 1 : null,
      },
    }
  }
  const activityId = url.searchParams.get('activity') ?? ''
  if (!/^[1-9]\d{0,15}$/.test(activityId) || !Number.isSafeInteger(Number(activityId)))
    return { status: 400, body: { error: 'BAD_REQUEST' } }
  let a: Record<string, unknown>
  try {
    a = record(await get<unknown>(athleteId, `/activities/${activityId}`))
  } catch (error) {
    await sameGrant()
    // Only a verified detail 404 removes an imported activity. A missing stream
    // means no matching evidence, not deletion of the activity.
    if (error instanceof StravaError && error.status === 404)
      return { status: 200, body: { available: false } }
    throw error
  }
  await sameGrant()
  if (record(a.athlete).id !== athleteId || String(a.id) !== activityId)
    throw new Error('Invalid activity owner')
  if (typeof a.sport_type !== 'string' || !cyclingSports.has(a.sport_type))
    return { status: 200, body: { available: false } }
  const account = await store.account(athleteId)
  if (a.private === true && !account?.scope.includes('activity:read_all'))
    return { status: 200, body: { available: false } }
  if (typeof a.start_date !== 'string' || !Number.isFinite(Date.parse(a.start_date)))
    throw new Error('Invalid activity date')
  let points: [number, number][] = []
  try {
    const streams = record(
      await get<unknown>(
        athleteId,
        `/activities/${activityId}/streams?keys=latlng&key_by_type=true`,
      ),
    )
    if (streams.latlng !== undefined) {
      const data = record(streams.latlng).data
      if (!Array.isArray(data) || data.length > 100_000) throw new Error('Invalid activity stream')
      points = data.map((point) => {
        if (
          !Array.isArray(point) ||
          point.length !== 2 ||
          typeof point[0] !== 'number' ||
          !Number.isFinite(point[0]) ||
          Math.abs(point[0]) > 90 ||
          typeof point[1] !== 'number' ||
          !Number.isFinite(point[1]) ||
          Math.abs(point[1]) > 180
        )
          throw new Error('Invalid activity coordinates')
        return [point[0], point[1]]
      })
    }
  } catch (error) {
    if (!(error instanceof StravaError && error.status === 404)) throw error
  }
  await sameGrant()
  return {
    status: 200,
    body: {
      available: true,
      activityId,
      startedAt: new Date(a.start_date).toISOString(),
      averageSpeedMps: metric(a.average_speed),
      elevationGainM: metric(a.total_elevation_gain),
      averagePowerWatts: metric(a.average_watts),
      powerSource: a.average_watts == null ? null : a.device_watts === true ? 'meter' : 'estimated',
      points,
    },
  }
}

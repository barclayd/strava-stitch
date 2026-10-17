export type RideOnEvent = {
  kind: 'strava_event'
  athleteId: string
  activityId: string | null
  aspect: 'create' | 'update' | 'delete' | 'revoke'
  eventTime: number
}

export function rideOnEvent(value: unknown): RideOnEvent | null {
  if (!value || typeof value !== 'object') return null
  const e = value as Record<string, unknown>
  if (
    typeof e.owner_id !== 'number' ||
    !Number.isSafeInteger(e.owner_id) ||
    e.owner_id <= 0 ||
    typeof e.event_time !== 'number' ||
    !Number.isSafeInteger(e.event_time) ||
    e.event_time <= 0
  )
    return null
  const updates = e.updates as Record<string, unknown> | undefined
  if (e.object_type === 'athlete' && e.aspect_type === 'update' && updates?.authorized === 'false')
    return {
      kind: 'strava_event',
      athleteId: String(e.owner_id),
      activityId: null,
      aspect: 'revoke',
      eventTime: e.event_time,
    }
  if (
    e.object_type !== 'activity' ||
    !['create', 'update', 'delete'].includes(String(e.aspect_type)) ||
    typeof e.object_id !== 'number' ||
    !Number.isSafeInteger(e.object_id) ||
    e.object_id <= 0
  )
    return null
  return {
    kind: 'strava_event',
    athleteId: String(e.owner_id),
    activityId: String(e.object_id),
    aspect: e.aspect_type as 'create' | 'update' | 'delete',
    eventTime: e.event_time,
  }
}

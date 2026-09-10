import { StravaError } from '../../data/strava.ts'
import type { PreviewFailureReason } from '../../analytics.ts'

export type PreviewStage =
  | 'activity_load'
  | 'streams_load'
  | 'recording_validation'
  | 'merge_validation'
  | 'export_failed'
  | 'save_failed'

// Classify only into fixed labels. Never send an exception message or activity data.
export function previewFailureReason(error: unknown, stage: PreviewStage): PreviewFailureReason {
  if (error instanceof StravaError) {
    if (error.status === 429) return 'strava_rate_limit'
    if (error.status === 401 || error.status === 403) return 'strava_connection'
    if (error.status === 404) return 'strava_unavailable'
  }
  if (stage === 'merge_validation' && error instanceof Error) {
    if (error.message.startsWith('These activities overlap.')) return 'overlapping_activities'
    if (error.message.startsWith('Choose activities with the same sport type.'))
      return 'different_sports'
  }
  return stage
}

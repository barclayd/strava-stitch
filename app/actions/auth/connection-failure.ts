import type { ConnectionFailureReason } from '../../analytics.ts'
import { StravaError } from '../../data/strava.ts'

export type ConnectionStage =
  | 'token_exchange_failed'
  | 'invalid_athlete'
  | 'missing_activity_permission'
  | 'save_failed'
  | 'session_failed'

// Only fixed labels leave this boundary; never record exception messages or OAuth data.
export function connectionFailureReason(
  error: unknown,
  stage: ConnectionStage,
): ConnectionFailureReason {
  if (stage === 'token_exchange_failed') {
    if (error instanceof StravaError) {
      if (error.status === 429) return 'strava_rate_limit'
      if (error.status >= 500 && error.status <= 599) return 'strava_unavailable'
      return 'token_exchange_rejected'
    }
    if (error instanceof Error && error.name === 'TimeoutError') return 'token_exchange_timeout'
  }
  return stage
}

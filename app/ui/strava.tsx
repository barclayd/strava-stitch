// Unmodified artwork from https://developers.strava.com/guidelines/.
import type { Handle } from 'remix/ui'
import type { AnalyticsPlacement } from '../analytics.ts'

export function StravaConnect(handle: Handle<{ source: AnalyticsPlacement }>) {
  return () => (
    <button
      type="submit"
      class="strava-connect"
      name="source"
      value={handle.props.source}
      data-funnel="connect_click"
      data-funnel-placement={handle.props.source}
    >
      <img src="/strava-connect.svg" alt="Connect with Strava" height="48" />
    </button>
  )
}

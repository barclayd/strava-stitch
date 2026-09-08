// Only these fixed labels may leave the application. Never add activity or account data here.
export const analyticsPages = [
  'home',
  'workspace',
  'example',
  'preview',
  'guide',
  'privacy',
] as const
export type AnalyticsPage = (typeof analyticsPages)[number]
export const analyticsPlacements = [
  'header',
  'home',
  'example',
  'preview',
  'guide',
  'footer',
  'unknown',
] as const
export type AnalyticsPlacement = (typeof analyticsPlacements)[number]
export const clientEvents = [
  'page_view',
  'connect_click',
  'stitch_click',
  'example_click',
  'guide_click',
  'preview_click',
  'upload_click',
  'view_on_strava_click',
] as const
export type ClientEvent = (typeof clientEvents)[number]
export type ServerEvent =
  | 'strava_connect_started'
  | 'strava_connected'
  | 'strava_connect_cancelled'
  | 'strava_connect_failed'
  | 'preview_created'
  | 'preview_failed'
  | 'example_downloaded'
  | 'activity_downloaded'
  | 'backup_downloaded'
  | 'upload_started'
  | 'upload_accepted'
  | 'upload_completed'
  | 'upload_duplicate'
  | 'upload_failed'
  | 'upload_unknown'
export type AnalyticsEvent = ClientEvent | ServerEvent
export type ClientPoint = { event: ClientEvent; page: AnalyticsPage; placement: AnalyticsPlacement }

export const placement = (value: unknown): AnalyticsPlacement =>
  analyticsPlacements.find((item) => item === value) ?? 'unknown'

export function clientPoint(value: unknown): ClientPoint | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  if (Object.keys(value).some((key) => !['event', 'page', 'placement'].includes(key))) return
  const point = value as Record<string, unknown>
  const event = clientEvents.find((item) => item === point.event),
    page = analyticsPages.find((item) => item === point.page),
    source = analyticsPlacements.find((item) => item === point.placement)
  if (event && page && source) return { event, page, placement: source }
}

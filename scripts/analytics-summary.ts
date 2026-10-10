import { analyticsDevices } from '../app/analytics.ts'

export type AnalyticsRow = {
  event: string
  page: string
  placement: string
  reason?: string
  device?: string
  total: number | string
}

export function analyticsDeviceSummary(rows: AnalyticsRow[]) {
  const deviceFor = (row: AnalyticsRow) =>
    !row.device
      ? 'not_recorded'
      : (analyticsDevices.find((device) => device === row.device) ?? 'unknown')
  const devices: string[] = [...analyticsDevices]
  if (rows.some((row) => deviceFor(row) === 'not_recorded')) devices.push('not_recorded')
  const counts = devices.map((device) => {
    const count = (event: string) =>
      rows
        .filter((row) => deviceFor(row) === device && row.event === event)
        .reduce((total, row) => total + Number(row.total), 0)
    return {
      device,
      pageViews: count('page_view'),
      connectionsStarted: count('strava_connect_started'),
      connectionsCompleted: count('strava_connected'),
      previewsCreated: count('preview_created'),
      previewsFailed: count('preview_failed'),
      uploadsStarted: count('upload_started'),
      uploadsCompleted: count('upload_completed'),
    }
  })
  // Events are not joined journeys: delayed completions and retries can produce ratios above 100%.
  const ratio = (outcomes: number, attempts: number) =>
    attempts === 0 ? null : (100 * outcomes) / attempts
  const rates = counts
    .filter((row) => row.device !== 'not_recorded')
    .map((row) => ({
      device: row.device,
      connectionCompletion: ratio(row.connectionsCompleted, row.connectionsStarted),
      previewSuccess: ratio(row.previewsCreated, row.previewsCreated + row.previewsFailed),
      uploadsPerPreview: ratio(row.uploadsStarted, row.previewsCreated),
      uploadCompletion: ratio(row.uploadsCompleted, row.uploadsStarted),
    }))
  return { counts, rates }
}

export function analyticsSummary(rows: AnalyticsRow[]) {
  const count = (event: string, page?: string) =>
    rows
      .filter((row) => row.event === event && (!page || row.page === page))
      .reduce((total, row) => total + Number(row.total), 0)
  return {
    outcomes: [
      { step: 'Real previews created', events: count('preview_created') },
      { step: 'Merged activity files served', events: count('activity_downloaded') },
      { step: 'Real backup bundles served', events: count('backup_downloaded') },
      { step: 'Uploads completed', events: count('upload_completed') },
    ],
    acquisition: [
      { step: 'Homepage views', events: count('page_view', 'home') },
      { step: 'Connect CTA clicks', events: count('connect_click') },
      { step: 'Strava connections started', events: count('strava_connect_started') },
      {
        step: 'Strava connections completed (including reconnects)',
        events: count('strava_connected'),
      },
      { step: 'Uploads started (including retries)', events: count('upload_started') },
      { step: 'Duplicate uploads', events: count('upload_duplicate') },
    ],
    demo: [
      { step: 'Standalone example page views', events: count('page_view', 'example') },
      { step: 'Example CTA clicks', events: count('example_click') },
      { step: 'Example choose-step clicks', events: count('example_choose_click') },
      { step: 'Example review-step clicks', events: count('example_review_click') },
      { step: 'Example finish-step clicks', events: count('example_finish_click') },
      { step: 'Sample files served', events: count('example_downloaded') },
    ],
  }
}

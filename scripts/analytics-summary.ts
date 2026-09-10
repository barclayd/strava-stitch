export type AnalyticsRow = {
  event: string
  page: string
  placement: string
  total: number | string
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

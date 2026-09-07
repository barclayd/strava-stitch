import { unstable_readConfig } from 'wrangler'

if (process.argv.includes('--help')) {
  console.log(
    'Usage: npm run analytics -- [days]\nDefaults to 7 days (1–90 supported). Set CLOUDFLARE_API_TOKEN with Account Analytics Read permission. Account and dataset come from wrangler.jsonc; CLOUDFLARE_ACCOUNT_ID can override the account.',
  )
} else {
  try {
    const days = Number(process.argv[2] ?? 7)
    if (!Number.isInteger(days) || days < 1 || days > 90)
      throw new Error('Choose a whole number of days from 1 to 90.')
    const token = process.env.CLOUDFLARE_API_TOKEN
    if (!token)
      throw new Error(
        'Set CLOUDFLARE_API_TOKEN to a Cloudflare token with Account Analytics Read permission.',
      )
    const config = unstable_readConfig({ config: 'wrangler.jsonc', env: 'production' }),
      account = process.env.CLOUDFLARE_ACCOUNT_ID ?? config.account_id,
      dataset = config.analytics_engine_datasets.find(
        (binding: { binding: string; dataset?: string }) => binding.binding === 'FUNNEL',
      )?.dataset
    if (
      !account ||
      !/^[a-f0-9]{32}$/.test(account) ||
      !dataset ||
      !/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(dataset)
    )
      throw new Error(
        'Configure the production Cloudflare account and FUNNEL dataset in wrangler.jsonc.',
      )
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
        body: `SELECT blob1 AS event, blob2 AS page, blob3 AS placement, SUM(_sample_interval * double1) AS total
FROM ${dataset}
WHERE timestamp >= NOW() - INTERVAL '${days}' DAY AND blob4 = 'v1'
GROUP BY event, page, placement
ORDER BY event, page, placement
FORMAT JSON`,
      },
    )
    if (!response.ok)
      throw new Error(
        `Cloudflare returned HTTP ${response.status}. Check Account Analytics Read permission and that production has received its first event.`,
      )
    const result = (await response.json()) as {
      data?: { event: string; page: string; placement: string; total: number | string }[]
    }
    if (!Array.isArray(result.data)) throw new Error('Cloudflare did not return analytics rows.')
    const rows = result.data,
      count = (event: string, page?: string) =>
        rows
          .filter((row) => row.event === event && (!page || row.page === page))
          .reduce((total, row) => total + Number(row.total), 0)
    console.log(`Stitch funnel — last ${days} days (event counts, not unique people)`)
    console.table([
      { step: 'Homepage views', events: count('page_view', 'home') },
      { step: 'Connect CTA clicks', events: count('connect_click') },
      { step: 'Strava connections started', events: count('strava_connect_started') },
      { step: 'Strava connections completed', events: count('strava_connected') },
      { step: 'Previews created', events: count('preview_created') },
      { step: 'Uploads started (including retries)', events: count('upload_started') },
      { step: 'Uploads completed', events: count('upload_completed') },
    ])
    console.log('All events, broken down by page and placement:')
    console.table(rows)
    if (!rows.length) console.log('No recorded events in this period.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unable to load analytics.')
    process.exitCode = 1
  }
}

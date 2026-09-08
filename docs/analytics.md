# Stitch funnel analytics

Stitch uses **Cloudflare Workers Analytics Engine**, in the `strava_stitch_funnel`
dataset on the existing Cloudflare account. Cloudflare's standard Web Analytics
[does not support custom events](https://developers.cloudflare.com/web-analytics/faq/).
These events are queried through Analytics Engine, not the Web Analytics page-view dashboard.

## Activation

Merging the PR deploys through the existing native Cloudflare production build.
Production enables `ANALYTICS_ENABLED` and binds `FUNNEL` to `strava_stitch_funnel`.
Cloudflare [creates the dataset on its first write](https://developers.cloudflare.com/analytics/analytics-engine/get-started/).
There is no browser token, external analytics script, new production secret, or manual dataset creation.
Tracking starts after deployment; earlier interactions cannot be recovered.

Local development and staging disable tracking by default and use separate dataset names.
Branch version uploads do not receive production traffic. To disable tracking, set
the production `ANALYTICS_ENABLED` value to `false` and deploy the configuration.

## Reading the funnel

Create a Cloudflare API token with **Account → Account Analytics → Read** for the
Stitch account. Make it available locally as `CLOUDFLARE_API_TOKEN` (never commit it), then run:

```sh
npm run analytics         # Last 7 days
npm run analytics -- 30   # Last 30 days
```

The report shows the main funnel counts followed by every event broken down by page
and CTA placement. Account and dataset settings come from `wrangler.jsonc`.
The read token is only used locally; it is not needed by the application to collect events.
The same queries can be used with the [SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)
or Cloudflare's supported analytics integrations.

These are **aggregate event counts, not unique people or a cohort conversion rate**.
A person can reconnect, view multiple pages, or upload several activities. Stitch has
no separate registration form: `strava_connected` is the successful onboarding step,
and includes returning users reconnecting. We do not create identifiers to join an
individual's journey across steps or visits. Ad blockers, opt-outs, closed tabs, and
background-write failures can reduce counts; analytics is best effort.

## Event definitions

| Event | Meaning |
| --- | --- |
| `page_view` | A tracked document finishes rendering, including Remix navigation, pagination, and history traversal |
| `connect_click` | A Connect with Strava button is activated |
| `stitch_click` | A CTA to combine activities is activated and links to the Stitch workspace |
| `example_click` | An example CTA is activated |
| `guide_click` | A guide CTA is activated |
| `preview_click` | The preview button is activated |
| `upload_click` | The confirmed-upload button is activated |
| `view_on_strava_click` | The completed activity link is activated |
| `strava_connect_started` | A valid, CSRF-protected connection request starts OAuth |
| `strava_connected` | OAuth succeeds, required permissions are granted, and the account is saved |
| `strava_connect_cancelled` | Strava returns an error/cancellation for a valid OAuth request |
| `strava_connect_failed` | A valid OAuth callback cannot complete the connection |
| `preview_created` | Selected activities have been fetched, validated, merged, and saved |
| `preview_failed` | Activity fetching, validation, merging, or saving throws during preview creation |
| `example_downloaded` | The illustrative example file is served |
| `activity_downloaded` | An account-owned stitched file is served |
| `backup_downloaded` | An account-owned backup bundle is served |
| `upload_started` | An explicitly confirmed upload acquires the atomic claim; retries count as new attempts |
| `upload_accepted` | Strava returns a processing upload identifier |
| `upload_completed` | Strava confirms a created activity, once per stored state transition |
| `upload_duplicate` | Strava identifies a duplicate |
| `upload_failed` | Strava confirms an upload failure |
| `upload_unknown` | The outcome is uncertain and automatic retries are blocked |

Downloads mean the server served a file, not proof it was saved on a device.
Completion is recorded when Stitch learns the outcome from the initial upload response
or a status poll. If the browser closes before polling finishes, the completion may
not be observed until the user returns and checks the preview. Repeated/concurrent
polls do not create another completion event.

Client events accept only fixed event/page/placement labels. The browser cannot submit
server conversion events. Server events are emitted after successful application steps;
failed CSRF, ownership, and upload-claim checks cannot generate success events.
An anonymous click endpoint cannot establish that every accepted event came from a real person.

## Data and privacy

Each row contains `blob1 = event`, `blob2 = page`, `blob3 = placement`,
`blob4 = schema version (v1)`, and `double1 = 1`. `index1` is the event name and
Cloudflare supplies the timestamp and sampling weight. Page labels are `home`,
`workspace`, `example`, `preview`, `guide`, and `privacy`. Placement labels are
`header`, `home`, `example`, `preview`, `guide`, `footer`, or `unknown`.
OAuth keeps the selected placement through the callback so connections can be compared by CTA.

No athlete IDs, job IDs, names, descriptions, GPS, activity types, search terms,
query strings, full URLs, referrers, or IP addresses are written to the dataset.
The browser sends events without cookies or referrers. The endpoint creates no session.
The random document-render marker used to detect navigation is never sent to analytics
and does not identify a person. Both browser and server collection honour DNT and GPC.
Cloudflare still handles ordinary network requests as the hosting provider.
The public privacy page explains collection and the [three-month retention](https://developers.cloudflare.com/analytics/analytics-engine/limits/).

Always account for Cloudflare sampling when querying:

```sql
SELECT blob1 AS event, blob2 AS page, blob3 AS placement,
       SUM(_sample_interval * double1) AS total
FROM strava_stitch_funnel
WHERE timestamp >= NOW() - INTERVAL '7' DAY AND blob4 = 'v1'
GROUP BY event, page, placement
ORDER BY event, page, placement
```

This query gives daily totals for trends:

```sql
SELECT toDate(timestamp) AS day, blob1 AS event,
       SUM(_sample_interval * double1) AS total
FROM strava_stitch_funnel
WHERE timestamp >= NOW() - INTERVAL '30' DAY AND blob4 = 'v1'
GROUP BY day, event
ORDER BY day, event
```

Check Cloudflare's current [Analytics Engine pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/)
as traffic grows. The application does not provision a paid plan.

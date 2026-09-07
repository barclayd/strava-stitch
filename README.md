# Stitch

A free TypeScript / Remix 3 application for combining Strava activities into one
activity of the same sport. Preview the recordings and gaps, download GPX or FIT and backups, then explicitly confirm
an upload. Production: [stravastitch.com](https://stravastitch.com).

## Development

Use Node 24.3+ and run commands from the repository root:

```sh
npm ci
cp .dev.vars.example .dev.vars
chmod 600 .dev.vars
npm run dev
```

Fill in `.dev.vars` before starting: the Strava client secret, a random
`SESSION_SECRET` of at least 32 characters, a separate `TOKEN_ENCRYPTION_KEY`
containing 32 random bytes encoded as base64, and a random webhook verification
token. Never commit these values. Keep the encryption key stable.

Wrangler serves [localhost:44100](http://localhost:44100), compiles browser assets,
and uses local Durable Object storage in `.wrangler/`. Reload after interface
changes. The Strava client ID and local origin are in `wrangler.jsonc`.
The local callback is `http://localhost:44100/auth/strava/callback`.

## Deploy to Cloudflare

```sh
npx wrangler login
npm run build
npm run deploy
```

`build` compiles browser assets and bundles the Worker into `dist/worker` without
publishing. `deploy` rebuilds and publishes the production environment. Cloudflare
provisions the configured Durable Objects, custom-domain DNS, and HTTPS.

### Automatic deployments

Cloudflare Workers Builds is connected to `barclayd/strava-stitch`. In the Worker's
Settings → Builds, keep these settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Version command | `npx wrangler versions upload --env production` |
| Builds for non-production branches | Enabled |
| Root directory | `/` |

Merging a pull request into `main` automatically builds and deploys production.
Other branches build and upload an undeployed version without changing the live
site. The explicit production environment is essential: bare `wrangler deploy`
uses the top-level local settings, including the localhost origin.

Cloudflare currently [does not generate preview URLs for Workers that implement
Durable Objects](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/#limitations),
including Stitch. Branch build results are available in Cloudflare and GitHub,
but clickable branch previews are unavailable with the current architecture.
Use local development to review the application before merging.

### Environment setup

For a new installation, update the account, client ID, and domains in
`wrangler.jsonc`. Provision each of the four secrets from `.dev.vars.example` with
`npx wrangler secret put SECRET_NAME --env production` before deploying. A staging
environment is also configured and needs its own secrets before use; deploy it
with `npx wrangler deploy --env staging`.

Set the Strava app's website and authorization callback domain to the production
origin and hostname. The production callback URL is
`https://stravastitch.com/auth/strava/callback`. Register
[Strava webhooks](https://developers.strava.com/docs/webhooks/) at
`https://stravastitch.com/webhooks/strava`, using the production verification token;
set the returned subscription ID in the production vars and deploy again.
Strava allows one webhook subscription per application, so staging should use a
separate Strava application if it needs its own subscription.

Athlete connections and previews use separate SQLite-backed Durable Objects per
athlete. Sessions use separate objects per browser session. Private payloads are
encrypted; previews become inaccessible after 24 hours and are purged by hourly
alarms. Session storage expires after seven days. Upload claims and token refreshes
are coordinated per athlete. Disconnecting removes stored athlete data. Webhook deauthorization is checked
against Strava before removing data. Keep production secrets backed up privately; losing the encryption key makes
existing connections unreadable. Local prototype data is not migrated on deployment.

## Maintenance

```sh
npm test
npm run typecheck
npm run format
npm run types  # after changing Wrangler bindings or vars
```

Tests run the real Worker and Durable Objects locally with mocked Strava calls.
They cover OAuth/CSRF, account isolation, GPX/FIT/ZIP preservation, confirmed uploads,
duplicate handling, token refresh, deauthorization, session concurrency, and
storage persistence. They never modify live activities. Type declarations are
generated from Wrangler configuration; do not edit them by hand.

## Activity handling

- Supports two to eight activities of the same exact sport, up to 50,000 recorded samples.
  All sport types in [Strava's upload API](https://developers.strava.com/docs/uploads/) are
  listed in `app/data/sports.ts`. Manual entries, unsupported types, overlapping recordings,
  and activities without at least two recorded timestamps are rejected. Search by name,
  date, or sport and selection operate on a page of 30 activities.
- GPS is optional. Exports use GPX when every sample has GPS, otherwise FIT encoded with
  Garmin's FIT SDK. Original timestamps and available GPS, elevation, temperature,
  heart rate, and cadence are preserved at the file format's precision. Invalid or
  unrepresentable FIT values are rejected before a preview is saved. Recorded distance is
  normalized across recordings when complete; FIT also includes summary distances.
- Each recording retains its boundary. FIT timer events stop at the end of each source
  and resume at the start of the next; laps mark source boundaries. Original within-activity
  timer events, original laps, pool lengths, workout sets, power, device metadata, and social
  history are unavailable or not transferred. Strava may recalculate totals and moving time.
- Direct uploads explicitly set `sport_type` from the stored recordings. Standalone imports
  may detect a broader sport from GPX/FIT; check the result. Backup ZIPs contain reconstructed
  sources, the stitched file, sport metadata in `activities.json`, and a limitations README.
  These are not original device files.
- OAuth requests `read`, `activity:read`, `activity:read_all`, and `activity:write`.
  Uploads always require explicit confirmation and use the athlete's privacy defaults.
- Strava has no activity deletion API. Duplicates require a downloaded backup,
  manual removal in Strava, and separate confirmation; Stitch checks the originals
  are unavailable before allowing a retry. Stitch never deletes Strava activities.
- Check [Strava athlete capacity and review requirements](https://developers.strava.com/docs/rate-limits/)
  before opening access to other athletes.

See [AGENTS.md](AGENTS.md) for code organization. Retain the DM Sans licence in
`public/fonts/` when distributing the application.

## Search visibility

Public titles, descriptions, canonical URLs, social images, and structured data
live in `app/seo.ts`. The homepage and merging guide are server-rendered; the guide
and privacy page load no client JavaScript. Edit the guide in
`app/actions/guide-page.tsx` and update its visible date and `guideUpdated` only when
the content materially changes. `scripts/build-images.ts` generates the share cards
and icons during the asset build; no athlete data is used in the artwork.

Only the production homepage, guide, and privacy page appear in `/sitemap.xml`.
Private pages, downloads, signed-in responses, query variants, and non-production
hosts send `noindex`; authentication remains the access control. Keep session-bearing
HTML private/no-store. Add future public pages to the registry and typed routes.

In [Google Search Console](https://search.google.com/search-console), use the
`stravastitch.com` Domain property, verify ownership through DNS, and retain its
verification record. After deployment, submit
`https://stravastitch.com/sitemap.xml` and inspect the homepage and guide URLs.
Track impressions, clicks, CTR, and average position for a query regex such as
`(join|combine|merge).*strava.*activit` in Performance. Search Console requires no
analytics script in Stitch. Indexing and ranking take time and are not guaranteed.

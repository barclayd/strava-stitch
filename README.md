# Stitch

A free TypeScript application for stitching Strava activities into one ride.
Select two to eight Ride activities, preview the route and gaps, download GPX or
backup files, and explicitly confirm an upload to Strava.

## Development

The application lives in `web/`. It requires **Node 24.3+** and uses Remix 3's
native UI (not React). Install the versions pinned in the lockfile:

```sh
cd web
npm ci
cp .env.example .env.local
chmod 600 .env.local
```

Fill in the Strava client ID and secret, plus two independent secrets:
`SESSION_SECRET` (at least 32 random characters) and `TOKEN_ENCRYPTION_KEY`
(exactly 32 random bytes encoded as base64). Keep the encryption key stable so
stored connections remain readable. Never commit credentials.

Set the Strava app's callback domain to `localhost`. The local callback URL is
`http://localhost:44100/auth/strava/callback`.

```sh
npm run dev
```

Open [localhost:44100](http://localhost:44100). Server changes restart automatically;
reload after interface changes. `npm run hmr` is the optional hot-reload entry point.

## Checks

Run from `web/`:

```sh
npm test
npm run typecheck
npm run format
npx remix doctor --strict
```

All tests are TypeScript. They cover merge preservation, OAuth/CSRF, ownership,
exports, upload confirmation and retries, token refresh, deauthorization, and
session concurrency. Strava calls are mocked; tests never modify live activities.

## Deployment

Use `web/` as the working directory. Deploy `app/`, `public/`, `server.ts`,
`tsconfig.json`, `package.json`, and `package-lock.json` with Node 24.3+:

```sh
npm ci --omit=dev
npm start
```

Node runs TypeScript directly and Remix compiles browser assets on demand; there
is no separate build output. Run one process under a supervisor behind an HTTPS reverse
proxy, with these settings:

| Setting | Purpose |
| --- | --- |
| `APP_ORIGIN` | Public HTTPS origin, without a trailing slash; match the Strava callback domain. |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | Credentials from the Strava developer dashboard. |
| `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` | Stable secrets described above; supply through your host's secret store. |
| `HOST`, `PORT` | Listen address and port; default `127.0.0.1:44100`. |
| `TRUST_PROXY` | Set to `true` only behind an exclusive trusted proxy that overwrites forwarding headers. |
| `DATABASE_PATH` | Private persistent SQLite path; default `./db/stitch.sqlite`. |
| `SESSION_DIR` | Private persistent session directory; default `./tmp/sessions`. |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | Random token used when registering the webhook. |
| `STRAVA_WEBHOOK_SUBSCRIPTION_ID` | ID returned when registering the Strava subscription. |

Keep the database and sessions on persistent private storage. Back up the database
and its encryption key securely. Tokens and preview data are encrypted; previews
expire after 24 hours. Connection data remains until forgotten or deauthorized.
In-process upload and refresh locks require **one application process**; add
shared coordination before scaling to multiple instances.

The reverse proxy must enforce body-size limits (64 KiB) and rate limits,
including chunked requests. Keep private activity data out of access logs.
Register [Strava webhooks](https://developers.strava.com/docs/webhooks/) at
`https://YOUR_DOMAIN/webhooks/strava` so deauthorization removes stored data.
Configure [athlete capacity](https://developers.strava.com/docs/rate-limits/) and
complete Strava's applicable review before opening access to the public.

## Activity handling

- OAuth requests `read`, `activity:read`, `activity:read_all`, and `activity:write`.
  Uploads require the granted write scope and explicit user confirmation.
- Strava has no activity deletion API. Duplicate handling requires a backup,
  manual removal in Strava, and a separate confirmation. Stitch verifies the
  originals return 404 before accepting that confirmation. Uploads use the
  athlete's Strava privacy defaults.
- GPX exports preserve timestamps, GPS, and available elevation, distance,
  temperature, heart rate, and cadence. Gaps stay unconnected; overlaps are
  rejected. Backups contain reconstructed GPX files, not original device files.
- Power, laps, device metadata, photos, comments, and kudos are not transferred.
  Strava may recalculate climbing and moving time after import.
- The current version supports standard Ride activities with complete GPS/time
  streams. Selection and search operate on a page of 30 activities.

See the [API reference](https://developers.strava.com/docs/reference/) for Strava
behavior and [web/AGENTS.md](web/AGENTS.md) for code organization. DM Sans is
self-hosted in `web/public/fonts/`; retain its included licence when distributing.

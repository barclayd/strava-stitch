# Stitch

A Remix 3 application for combining split Strava rides. Select activities, inspect
the route and gaps, download a merged GPX or backup ZIP, and explicitly confirm an
upload. The interface works on desktop and mobile.

Created using `npx remix@next new web --app-name stitch`. This uses Remix's native
UI and server APIs, not React or React Router. The lockfile pins the tested
Remix 3.0.0-rc.1 release. Treat framework upgrades as deliberate changes.

## Run locally

Requires Node 24.3 or later. From this directory:

```sh
npm ci
cp .env.example .env.local
chmod 600 .env.local
```

Set the Strava application's client ID and secret in `.env.local`, alongside two
independent random secrets: a session secret of at least 32 characters, and an
encryption key containing exactly 32 random bytes encoded as base64. Keep the
encryption key stable or stored connections and previews become unreadable.
Do not commit this file. The existing local setup is already configured.

Set Strava's authorization callback domain to `localhost`. The callback URL is
`http://localhost:44100/auth/strava/callback`; the app origin has no trailing slash.

```sh
npm run dev
```

Open [Stitch](http://localhost:44100). The server listens on loopback by default.
Server changes restart automatically; reload the page after interface changes.
Remix compiles browser assets on demand, so there is no separate build command.

## What works

- OAuth with state validation, session rotation, token refresh, and verification
  of the scopes actually granted. The existing local account has upload access.
- Select two to eight standard **Ride** activities from a page of activities,
  search that page, and arrange selections by their original recording times.
- Preview routes with pan/zoom, source summaries, endpoint separation, and gaps.
  No route is invented between activities. Overlapping activities are rejected.
- Download merged GPX and a ZIP containing reconstructed source GPX files,
  merged GPX, and preservation notes. Backups remain available independently of
  upload access.
- Confirm joins and upload separately. Server checks enforce these confirmations,
  ownership, and upload scope. Concurrent submissions cannot start two uploads.
- Poll upload processing, link to the accepted activity, and handle duplicate
  rejections. A timeout with an uncertain result requires checking Strava before
  any retry; Stitch does not automatically resubmit it.
- Resume previews for 24 hours, sign out, or forget a connection and its previews.

## Uploads and deletion

Strava's `activity:write` scope grants upload access. Strava has no supported
activity deletion API or separate deletion scope. Stitch contains no operation
that deletes or edits Strava activities.

If Strava rejects an upload as a duplicate, Stitch offers a backup first, links to
the originals, and asks the user to remove them directly in Strava. A separate
confirmation is required for each affected preview. Before accepting that
confirmation, Stitch checks that every selected original returns 404. Uploading
then requires another explicit confirmation. Original timestamps are never
shifted to evade duplicate detection.

Uploads use the athlete's Strava privacy defaults. The upload API does not expose
a documented visibility parameter; the interface tells users to check their
Strava settings before confirming.

## Preservation limits

GPX files are reconstructed from API streams. They retain original GPS samples,
timestamps, available elevation, cumulative recorded distance, temperature,
heart rate, and cadence. Missing sensors are omitted. Track segments preserve
the recording boundaries and gaps; cumulative distance remains flat across gaps.

This is not a lossless merge of device FIT files. Measured power, laps, device
metadata, photos, kudos, comments, and private notes are not exported. Download
original device files separately when those matter. Strava may recalculate
moving time and climbing on import. Summed source values in the preview are
estimates of the resulting activity, not promises about its imported totals.

This version supports standard Ride activities with complete, aligned GPS and
time streams. It rejects other sport types rather than silently reclassifying
e-bike, virtual, or other activities. Selection and search currently operate on
one page of 30 fetched activities; changing pages starts a new selection.

## Data and deployment

Tokens and preview activities are encrypted with AES-256-GCM in
`db/stitch.sqlite`. Database and session files have private filesystem permissions.
Server sessions use signed, HttpOnly, SameSite cookies, atomic writes, and logout
revocation markers. State-changing browser requests require CSRF protection.
Every private route checks the connected athlete's ownership. Demo data is
synthetic and contains no connected athlete's activities.

Preview access expires after 24 hours; an hourly sweep removes expired records.
Connections stay until forgotten or deauthorized. The app avoids logging tokens
and activity data. `db/`, `tmp/`, and environment files are ignored by Git.

The app is a local prototype, not a deployed public service. Before public use:

1. Run one Node process with persistent private storage for `db/` and
   `tmp/sessions/` (or configure `DATABASE_PATH` and `SESSION_DIR`). In-process
   token-refresh and upload locks assume a single process. Add shared
   coordination before horizontal scaling.
2. Configure a public HTTPS `APP_ORIGIN`, Strava callback domain, stable secrets,
   and production process supervision. Run `npm start` behind a TLS reverse
   proxy. Set `TRUST_PROXY=true` only when the server is reachable exclusively
   through a trusted proxy that overwrites forwarding headers. The origin check
   and secure cookies require the original HTTPS scheme.
3. Enforce request-body and request-rate limits at that proxy. The app rejects
   declared bodies over 64 KiB and limits multipart forms; the proxy should also
   bound chunked bodies. Add operational monitoring without private route data.
4. Register Strava's webhook subscription at `/webhooks/strava`, configure a
   random `STRAVA_WEBHOOK_VERIFY_TOKEN`, and save the returned subscription ID
   in `STRAVA_WEBHOOK_SUBSCRIPTION_ID`. The handlers validate the subscription
   and remove stored data when Strava reports deauthorization. No public
   subscription is registered for the local prototype.
5. Configure athlete capacity in the Strava developer dashboard. Default access
   is one athlete; a self-service change supports up to ten, and broader access
   requires Strava review. Complete the applicable review and brand requirements
   before inviting the public.

## Validation

```sh
npm test
npm run typecheck
npm run format
npx remix doctor --strict
```

Eight tests cover OAuth/CSRF, ownership, exact merge preservation, GPX and ZIP
exports, upload confirmation and concurrency, duplicate handling, uncertain
uploads, refresh/deauthorization, and concurrent session writes/logout.
Strava requests are mocked in automated tests; tests never upload or delete
real activities. Real OAuth, activity reads, preview creation, and backup
download were also checked in the browser, including mobile layout. The prior
merged ride was uploaded and inspected through Strava's UI; the new API upload
flow has not been exercised with a real upload.

## Main files

- `app/routes.ts`: typed route contract.
- `app/actions/auth/`: OAuth and connection management.
- `app/actions/stitches/`: merge, export, backup, review, and upload flow.
- `app/actions/webhooks/`: deauthorization handling.
- `app/data/`: encrypted storage, session storage, and restricted Strava client.
- `app/ui/` and `public/styles.css`: shared interface and responsive design.

## References

- [Strava authentication and scopes](https://developers.strava.com/docs/authentication/)
- [Strava API changelog](https://developers.strava.com/docs/changelog/)
- [Strava API reference](https://developers.strava.com/docs/reference/)
- [Athlete capacity and rate limits](https://developers.strava.com/docs/rate-limits/)
- [Strava webhooks](https://developers.strava.com/docs/webhooks/)
- [Remix guides](https://guides.remix.run/start-here/)

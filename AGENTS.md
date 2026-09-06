# Maintaining Stitch

- Use TypeScript for application code, scripts, and tests. Run commands from the repository root.
- Run `npm test`, `npm run typecheck`, and `npm run format` after relevant changes.
  Setup and deployment instructions live in the root README.
- This is Remix 3's native UI, not React. Components receive a `Handle`, return a
  render function, and call `handle.update()` for state changes. Use `clientEntry`
  for interactive components and pass only serializable props.
- `app/routes.ts` owns typed routes. Route handlers and their UI live under
  `app/actions/`; shared UI belongs in `app/ui/`. Storage and Strava access belong
  in `app/data/`; request middleware belongs in `app/middleware/`.
- Keep native OAuth and upload forms marked `data-rmx-document` so Remix does not
  intercept redirects. Preserve CSRF, session rotation, ownership checks, and
  explicit upload/removal confirmations. Never add automatic activity deletion.
- Bundle only the public client entries listed in `scripts/build-assets.ts`. Keep
  tokens and private GPS data out of source, logs, and public demo fixtures.
- Cloudflare bindings are generated with `npm run types`. Read them through the
  request runtime; never store user data in Worker globals. Use one Durable Object
  per athlete or browser session. Preserve atomic upload claims and refresh coordination.
- `npm run build` is a production dry run; `npm run deploy` publishes production.
  Keep secrets in ignored `.dev.vars` locally and Cloudflare secrets in production.
- Use the installed package documentation at `node_modules/remix/src/` and the
  [Remix guides](https://guides.remix.run/) for current framework APIs.

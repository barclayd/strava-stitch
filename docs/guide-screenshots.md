# Main guide screenshots

`public/images/guide-select-activities.webp` and
`public/images/guide-review-join.webp` show the public `/example` flow, captured
on 21 September 2026. The activities come from the synthetic fixture in
`app/actions/example.ts`; no connected account or private activity data was used.

The images are cropped browser screenshots of the activity picker and join
timeline at a 640 px viewport, encoded as WebP at 90% quality. Each is 592 × 518 px.
They are copied into the asset build from `public/` and loaded lazily in the guide.

When those panels change, recapture them from the public example, check the
captions and alt text against the displayed data, and update both assets. Do not
use screenshots from a connected athlete’s workspace. The example does not
upload to Strava; the guide describes the real upload preparation separately.

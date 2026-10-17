/** Test-only consumer of the same named service binding used by Ride On. */
export default {
  fetch(request, env) {
    return env.STRAVA_STITCH.fetch(request)
  },
} satisfies ExportedHandler<{ STRAVA_STITCH: Fetcher }>

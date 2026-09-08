import { createController } from 'remix/router'

import { routes } from '../routes.ts'
import { HomePage } from './home-page.tsx'
import { Session } from 'remix/session'
import { getCsrfToken } from 'remix/middleware/csrf'
import { account, jobs } from '../data/store.ts'
import { listActivities } from '../data/strava.ts'
import { mergedTitle, toGpx } from './stitches/merge.ts'
import { unavailableReason } from '../data/sports.ts'
import { decodePolyline, type ActivitySummary } from './public/format.ts'
import { exampleRecords, exampleMerge, examplePreview } from './example.ts'
import { ExamplePage } from './example-page.tsx'
import { PrivacyPage } from './privacy-page.tsx'
import { GuidePage } from './guide-page.tsx'
import { pageSeo } from '../seo.ts'
import { track } from '../data/analytics.ts'

export default createController(routes, {
  actions: {
    async home(context) {
      const session = context.get(Session),
        id = session.get('athleteId'),
        auth = typeof id === 'number' ? await account(id) : undefined
      const page = Math.floor(
        Math.min(9999, Math.max(1, Number(context.url.searchParams.get('page')) || 1)),
      )
      let error = session.get('error') as string | undefined,
        hasMore = false,
        activities: ActivitySummary[] = []
      if (auth) {
        try {
          const results = await listActivities(auth.id, page)
          hasMore = results.length === 30
          activities = results.map((r) => ({
            id: r.id,
            name: r.name,
            start: r.start_date_local ?? r.start_date,
            distance: r.distance,
            moving: r.moving_time,
            elevation: r.total_elevation_gain,
            sport: r.sport_type,
            unavailable: unavailableReason(r),
            coordinates: decodePolyline(r.map?.summary_polyline ?? ''),
          }))
        } catch (e) {
          error = e instanceof Error ? e.message : 'Could not load your activities.'
        }
      }
      return context.render(
        <HomePage
          seo={pageSeo('home', context.url, typeof id === 'number' || !!error)}
          activities={activities}
          example={!auth ? examplePreview : undefined}
          csrf={getCsrfToken(context)}
          firstname={auth?.firstname}
          error={error}
          page={page}
          hasMore={hasMore}
          recent={
            auth
              ? (await jobs(auth.id)).map((j) => ({ id: j.id, title: j.title, state: j.state }))
              : []
          }
        />,
      )
    },
    async privacy(context) {
      const id = context.get(Session).get('athleteId')
      return context.render(
        <PrivacyPage
          seo={pageSeo('privacy', context.url, typeof id === 'number')}
          csrf={getCsrfToken(context)}
          firstname={typeof id === 'number' ? (await account(id))?.firstname : undefined}
        />,
      )
    },
    guide(context) {
      return context.render(
        <GuidePage
          csrf={getCsrfToken(context)}
          seo={pageSeo(
            'guide',
            context.url,
            typeof context.get(Session).get('athleteId') === 'number',
          )}
        />,
      )
    },
    demo(context) {
      return context.render(<ExamplePage example={examplePreview} csrf={getCsrfToken(context)} />)
    },
    demoDownload() {
      track('example_downloaded', 'example')
      return new Response(toGpx(exampleRecords, mergedTitle(exampleMerge)), {
        headers: {
          'Content-Type': 'application/gpx+xml',
          'Content-Disposition': 'attachment; filename="stitch-example.gpx"',
        },
      })
    },
  },
})

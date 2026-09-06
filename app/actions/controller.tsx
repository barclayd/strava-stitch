import { createController } from 'remix/router'

import { routes } from '../routes.ts'
import { HomePage } from './home-page.tsx'
import { Session } from 'remix/session'
import { getCsrfToken } from 'remix/middleware/csrf'
import { account, jobs } from '../data/store.ts'
import { listActivities } from '../data/strava.ts'
import { cycling, toGpx } from './stitches/merge.ts'
import { decodePolyline, type Ride } from './public/format.ts'
import { exampleRecords, exampleMerge } from './example.ts'
import { StitchPage } from './stitches/page.tsx'
import { PrivacyPage } from './privacy-page.tsx'

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
        rides: Ride[] = []
      if (auth) {
        try {
          const results = await listActivities(auth.id, page)
          hasMore = results.length === 30
          rides = results
            .filter((r) => cycling.has(r.sport_type) && !r.manual)
            .map((r) => ({
              id: r.id,
              name: r.name,
              start: r.start_date_local ?? r.start_date,
              distance: r.distance,
              moving: r.moving_time,
              elevation: r.total_elevation_gain,
              sport: r.sport_type,
              coordinates: decodePolyline(r.map?.summary_polyline ?? ''),
            }))
        } catch (e) {
          error = e instanceof Error ? e.message : 'Could not load your activities.'
        }
      } else
        rides = exampleRecords.map((r) => ({
          id: r.activity.id,
          name: r.activity.name,
          start: r.activity.start_date,
          distance: r.activity.distance,
          moving: r.activity.moving_time,
          elevation: r.activity.total_elevation_gain,
          sport: 'Ride',
          coordinates: r.points.map((p) => [p.lat, p.lon]),
        }))
      return context.render(
        <HomePage
          rides={rides}
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
          csrf={getCsrfToken(context)}
          firstname={typeof id === 'number' ? (await account(id))?.firstname : undefined}
        />,
      )
    },
    demo(context) {
      return context.render(
        <StitchPage
          job={{
            id: 'example',
            owner: 0,
            created: Date.now(),
            title: 'A morning in the Peaks',
            merge: exampleMerge,
            state: 'ready',
          }}
          csrf={getCsrfToken(context)}
          canUpload={false}
          demo
        />,
      )
    },
    demoDownload() {
      return new Response(toGpx(exampleRecords, 'Stitch — illustrative example'), {
        headers: {
          'Content-Type': 'application/gpx+xml',
          'Content-Disposition': 'attachment; filename="stitch-example.gpx"',
        },
      })
    },
  },
})

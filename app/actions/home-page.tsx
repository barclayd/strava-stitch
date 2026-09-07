import type { Handle } from 'remix/ui'
import { Shell, Alert } from '../ui/shell.tsx'
import { Workspace } from './public/workspace.tsx'
import type { ActivitySummary } from './public/format.ts'
import { routes } from '../routes.ts'
import { StravaConnect } from '../ui/strava.tsx'
import type { PageSeo } from '../seo.ts'

export function HomePage(
  handle: Handle<{
    activities: ActivitySummary[]
    firstname?: string
    csrf: string
    error?: string
    page: number
    hasMore: boolean
    recent: { id: string; title: string; state: string }[]
    seo: PageSeo
  }>,
) {
  return () => {
    const p = handle.props
    return (
      <Shell
        csrf={p.csrf}
        firstname={p.firstname}
        seo={p.seo}
        clientFeatures="workspace"
        analyticsPage={p.firstname ? 'workspace' : 'home'}
      >
        <main id="main" class="main-content">
          <div class="intro">
            <div class="eyebrow">
              <span class="little-line" /> EVERY PART BELONGS
            </div>
            <h1>
              Combine your
              <br />
              <span class="together-word">Strava activities in seconds</span>
            </h1>
            <p>
              A split run. A paused ride. An accidental finish.
              <br class="desktop-break" /> Stitch activities of the same sport into one.{' '}
              <strong>Free to use, always.</strong>
            </p>
          </div>
          <Alert message={p.error} />
          <div class="flow-header">
            <ol class="steps" aria-label="Stitching progress">
              <li class="current">
                <span>1</span> Choose activities
              </li>
              <li>
                <span>2</span> Review the join
              </li>
              <li>
                <span>3</span> Bring it together
              </li>
            </ol>
            <span class="flow-reassurance">Your originals stay yours.</span>
          </div>
          <Workspace
            activities={p.activities}
            csrf={p.csrf}
            connected={!!p.firstname}
            page={p.page}
            hasMore={p.hasMore}
          />
          {!p.firstname && (
            <div class="connection-note">
              <span>Ready for your own activities?</span>
              <form data-rmx-document method="post" action={routes.auth.connect.href()}>
                <input type="hidden" name="_csrf" value={p.csrf} />
                <StravaConnect source="home" />
              </form>
              <p>
                Read your activities and upload when you confirm. Only you see your data in Stitch.
              </p>
              <p>
                Stitch is in early access, with limited Strava connections. Explore the example
                without an account.
              </p>
            </div>
          )}
          {p.recent.length > 0 && (
            <section class="recent-stitches">
              <h2>Pick up where you left off</h2>
              {p.recent.map((j) => (
                <a key={j.id} href={routes.stitches.show.href({ id: j.id })}>
                  <span>{j.title}</span>
                  <span>
                    {j.state === 'complete'
                      ? 'Uploaded'
                      : j.state === 'ready'
                        ? 'Ready to review'
                        : 'Continue'}{' '}
                    →
                  </span>
                </a>
              ))}
            </section>
          )}
          <section class="how-it-works" id="how-it-works">
            <div>
              <span class="overline">LESS ADMIN. MORE MOVEMENT.</span>
              <h2>
                A little stitching.
                <br />
                Every part together.
              </h2>
              <p>
                From separate activities to one continuous story, with you in control of every step.
              </p>
            </div>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <h3>Choose your activities</h3>
                  <p>
                    Connect Strava and select two to eight activities of the same sport. Runs,
                    rides, swims, hikes, and indoor workouts are supported when Strava has recorded
                    timestamps. We arrange them by start time.
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Give the join a look</h3>
                  <p>
                    Review the route, the timing, and the gaps. Original times stay intact; missing
                    movement is never invented.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Take it all with you</h3>
                  <p>
                    Download GPX for GPS recordings or FIT for activities without GPS. Confirm a
                    Strava upload to keep the original sport type. If originals need removing, you
                    do that separately in Strava.
                  </p>
                </div>
              </li>
            </ol>
          </section>
          <section class="home-guide" aria-labelledby="home-guide-heading">
            <div>
              <span class="overline">A GUIDE TO GETTING IT RIGHT</span>
              <h2 id="home-guide-heading">
                Two activities. One story.
                <br />A few things to know.
              </h2>
              <p>
                Learn how to merge Strava activities, what happens to pauses and sensor data, and
                how to handle duplicate uploads.
              </p>
              <a
                class="inline-link"
                href={routes.guide.href()}
                data-funnel="guide_click"
                data-funnel-placement="home"
              >
                Read the guide to merging activities <span aria-hidden="true">→</span>
              </a>
            </div>
            <div class="home-questions">
              <details>
                <summary>Does Stitch support all Strava activity types?</summary>
                <p>
                  Yes. Stitch supports all Strava sport types, including runs, rides, swims, walks,
                  hikes, e-bike rides, and indoor workouts.
                </p>
                <p>
                  Choose two to eight recorded activities of the same sport per stitch. Run and
                  Trail Run, for example, are separate types. GPS is optional, but recorded
                  timestamps are required. Manual entries and activities without a recorded timeline
                  cannot be stitched.
                </p>
              </details>
              <details>
                <summary>Can I combine activities inside Strava?</summary>
                <p>
                  Strava has no built-in merge feature. Stitch combines the data from your selected
                  activities into a GPX or FIT file that you can download or upload after reviewing
                  it.
                </p>
              </details>
              <details>
                <summary>Will Stitch delete my original activities?</summary>
                <p>
                  No. Creating a preview leaves your Strava activities intact. If Strava rejects an
                  upload as a duplicate, you decide whether to remove originals yourself after
                  downloading a backup.
                </p>
              </details>
              <details>
                <summary>Can I join activities with a pause between them?</summary>
                <p>
                  Yes. Stitch preserves the original timestamps and leaves gaps unconnected.
                  Overlapping activities are rejected, and missing movement is never invented.
                </p>
              </details>
              <details>
                <summary>Is it free?</summary>
                <p>
                  Yes, Stitch is free to use, always. Connections are limited during early access.
                  Try the illustrative example without connecting your account.
                </p>
              </details>
            </div>
          </section>
        </main>
      </Shell>
    )
  }
}

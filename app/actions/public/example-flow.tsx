import { clientEntry, on, ref, type Handle } from 'remix/ui'
import { WorkspaceContent } from './workspace.tsx'
import { RouteMap } from '../../ui/public/route-map.tsx'
import { ExampleDetails } from '../stitches/public/upload-form.tsx'
import { StravaConnect } from '../../ui/strava.tsx'
import { routes } from '../../routes.ts'
import { duration, km, time, labelColours, type ActivitySummary } from './format.ts'

// A display-only model of the synthetic example, never an authenticated stitch job.
export type ExamplePreview = {
  activities: (ActivitySummary & { description: string })[]
  title: string
  description: string
  distance: number
  moving: number
  elapsed: number
  elevation: number
  gap: { seconds: number; metres: number }
}

const steps = ['Choose activities', 'Review the join', 'Bring it together'] as const
const events = ['example_choose_click', 'example_review_click', 'example_finish_click'] as const
type Step = 0 | 1 | 2

export const ExampleFlow = clientEntry(
  '/client/example-flow.js#ExampleFlow',
  function ExampleFlow(
    handle: Handle<{ example: ExamplePreview; csrf: string; initialStep: Step }>,
  ) {
    let step = handle.props.initialStep,
      selected = handle.props.example.activities.map((activity) => activity.id),
      root: HTMLElement,
      animation: Animation | undefined,
      revision = 0

    async function choose(next: Step, animate: boolean, focusPanel = false) {
      if (next === step) return
      const direction = next > step ? 1 : -1,
        currentRevision = ++revision
      animation?.cancel()
      step = next
      // Direct navigation always explores the complete sample pair.
      if (step > 0) selected = handle.props.example.activities.map((activity) => activity.id)
      await handle.update()
      if (currentRevision !== revision || !root?.isConnected) return
      const panel = root.querySelector<HTMLElement>(`#example-panel-${step}`)!
      if (focusPanel) panel.focus({ preventScroll: true })
      if (root.getBoundingClientRect().top < 0) root.scrollIntoView({ block: 'start' })
      if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animation = panel.animate(
          [
            { opacity: 0.35, transform: `translateX(${direction * 12}px)` },
            { opacity: 1, transform: 'translateX(0)' },
          ],
          { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
        )
      }
    }

    return () => {
      const { example, csrf } = handle.props
      return (
        <section
          class="example-flow"
          aria-label="Try stitching example activities"
          mix={ref((node, signal) => {
            root = node
            signal.addEventListener('abort', () => animation?.cancel(), { once: true })
          })}
        >
          <div class="flow-header">
            <div class="example-steps" role="tablist" aria-label="Example steps">
              {steps.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  id={`example-step-${index}`}
                  aria-controls={`example-panel-${index}`}
                  aria-selected={step === index ? 'true' : 'false'}
                  tabIndex={step === index ? 0 : -1}
                  data-funnel={events[index]}
                  data-funnel-placement="example"
                  mix={[
                    on('click', (event) => choose(index as Step, event.detail > 0)),
                    on('keydown', async (event) => {
                      let next: number
                      if (event.key === 'ArrowRight') next = (index + 1) % steps.length
                      else if (event.key === 'ArrowLeft')
                        next = (index + steps.length - 1) % steps.length
                      else if (event.key === 'Home') next = 0
                      else if (event.key === 'End') next = steps.length - 1
                      else return
                      event.preventDefault()
                      await choose(next as Step, false)
                      root.querySelector<HTMLButtonElement>(`#example-step-${next}`)?.focus()
                    }),
                  ]}
                >
                  <span class="step-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <span class="flow-reassurance">Privacy first. Always your choice.</span>
          </div>
          <p class="example-step-hint">These are sample activities. No account is needed.</p>
          {/* Keep the panels mounted so selections, map positions and demo edits survive a step change. */}
          <div
            class="example-panel"
            role="tabpanel"
            id="example-panel-0"
            aria-labelledby="example-step-0"
            hidden={step !== 0}
            tabIndex={0}
          >
            <WorkspaceContent
              activities={example.activities}
              csrf={csrf}
              connected={false}
              page={1}
              hasMore={false}
              example={{
                selected,
                onSelection: (ids) => {
                  selected = ids
                  handle.update()
                },
                onPreview: (event) => choose(1, event.detail > 0, true),
              }}
            />
          </div>
          <div
            class="example-panel"
            role="tabpanel"
            id="example-panel-1"
            aria-labelledby="example-step-1"
            hidden={step !== 1}
            tabIndex={0}
          >
            <div class="example-review-grid">
              <div class="review-visual">
                <RouteMap tracks={example.activities} />
                <div class="review-stats">
                  <div>
                    <strong>
                      {km(example.distance)}
                      <small> km</small>
                    </strong>
                    <span>Combined distance</span>
                  </div>
                  <div>
                    <strong>{duration(example.moving)}</strong>
                    <span>Moving time</span>
                  </div>
                  <div>
                    <strong>{duration(example.elapsed)}</strong>
                    <span>Elapsed time</span>
                  </div>
                  <div>
                    <strong>
                      {Math.round(example.elevation)}
                      <small> m</small>
                    </strong>
                    <span>Climbing</span>
                  </div>
                </div>
                <p class="fine-print">
                  Totals from the source activities. Strava may recalculate them after import.
                </p>
                <details class="preservation">
                  <summary>What comes along?</summary>
                  <p>
                    The original timestamps, GPS route, elevation and available supported sensor
                    data come along in the download. Missing movement is never invented.
                  </p>
                  <p>
                    Files are reconstructed from Strava data. Photos, kudos, comments, original
                    laps, pool lengths, workout sets, measured power and device metadata are not
                    transferred. Check the sport and visibility when importing a file yourself.
                  </p>
                </details>
              </div>
              <section class="example-join" aria-labelledby="example-join-heading">
                <span class="overline">A LITTLE ROOM BETWEEN THE PARTS</span>
                <h2 id="example-join-heading">Every part, in its place.</h2>
                <p>Two activities. One timeline. The pause stays exactly where it belongs.</p>
                <div class="timeline">
                  {example.activities.map((activity, index) => (
                    <div class="timeline-part" key={activity.id}>
                      <div class="timeline-record">
                        <span class="part-number" style={{ background: labelColours[index] }}>
                          {index + 1}
                        </span>
                        <div>
                          <h3>{activity.name}</h3>
                          <p>
                            {time(activity.start)} · {km(activity.distance)} km ·{' '}
                            {duration(activity.moving)} moving
                          </p>
                          <p class="source-description">{activity.description}</p>
                        </div>
                      </div>
                      {index === 0 && (
                        <div class="join-note">
                          <span aria-hidden="true">Ⅱ</span>
                          <div>
                            <strong>{duration(example.gap.seconds)} between activities</strong>
                            <p>
                              Endpoints are {Math.round(example.gap.metres)} m apart. The gap stays
                              in elapsed time; no connecting points are added.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  class="button button-dark"
                  data-funnel="example_finish_click"
                  data-funnel-placement="example"
                  mix={on('click', (event) => choose(2, event.detail > 0, true))}
                >
                  Bring it together <span aria-hidden="true">→</span>
                </button>
              </section>
            </div>
          </div>
          <div
            class="example-panel"
            role="tabpanel"
            id="example-panel-2"
            aria-labelledby="example-step-2"
            hidden={step !== 2}
            tabIndex={0}
          >
            <div class="example-finish-grid">
              <ExampleDetails title={example.title} description={example.description} />
              <aside class="finish-panel">
                <span class="finish-icon" aria-hidden="true">
                  ↗
                </span>
                <h2>Ready when you are.</h2>
                <p>
                  Download the sample GPX to see the combined recording. This example won’t upload
                  anything to Strava.
                </p>
                <a class="button button-outline wide" href={routes.demoDownload.href()} download>
                  Download sample GPX <span aria-hidden="true">↓</span>
                </a>
                <h3>Try it with your own activities</h3>
                <p>
                  Connect Strava to preview, edit and combine your own activities. Free to use,
                  always.
                </p>
                <form data-rmx-document action={routes.auth.connect.href()} method="post">
                  <input type="hidden" name="_csrf" value={csrf} />
                  <StravaConnect source="example" />
                </form>
                <p class="fine-print">
                  Privacy first: only you see your previews in Stitch. Uploads happen only when you
                  confirm, using your Strava account’s default visibility.
                </p>
                <a class="inline-link" href={routes.privacy.href()}>
                  How we protect your data
                </a>
              </aside>
            </div>
          </div>
          <noscript>
            <p>
              Enable JavaScript to explore the steps. You can still{' '}
              <a href={routes.demoDownload.href()} download>
                download the sample GPX
              </a>{' '}
              or <a href={routes.home.href() + '#connect'}>connect Strava from the homepage</a>.
            </p>
          </noscript>
        </section>
      )
    }
  },
)

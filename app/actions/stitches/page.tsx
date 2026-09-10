import type { Handle } from 'remix/ui'
import { Shell, Alert } from '../../ui/shell.tsx'
import { RouteMap } from '../../ui/public/route-map.tsx'
import { labelColours, duration, km, day, time } from '../public/format.ts'
import { routes } from '../../routes.ts'
import type { Job } from '../../data/store.ts'
import {
  ExampleDetails,
  UploadForm,
  UploadPreparation,
  UploadStatus,
} from './public/upload-form.tsx'
import { StravaConnect } from '../../ui/strava.tsx'
import { fileFormat, hasPosition, mergedDescription } from './merge.ts'
import { sportLabel } from '../../data/sports.ts'

function joinLocation(metres: number | null) {
  if (metres === null)
    return 'No GPS at this join, so the distance between endpoints is unavailable.'
  return `Endpoints are ${metres >= 1000 ? `${km(metres)} km` : `${Math.round(metres)} m`} apart.`
}

export function StitchPage(
  handle: Handle<{
    job: Job
    csrf: string
    firstname?: string
    canUpload: boolean
    error?: string
    demo?: boolean
    uploadPreparation?: 'present' | 'removed' | 'unverified'
  }>,
) {
  return () => {
    const { job: j, csrf, firstname, canUpload, error, demo } = handle.props,
      m = j.merge,
      format = fileFormat(m.records).toUpperCase(),
      sport = sportLabel(m.records[0].activity.sport_type)
    const download = demo ? routes.demoDownload.href() : routes.stitches.download.href({ id: j.id })
    const tracks = m.records.map((r) => ({
      id: r.activity.id,
      name: r.activity.name,
      coordinates: r.points
        .filter(hasPosition)
        .filter(
          (_p, i) =>
            i % Math.max(1, Math.floor(r.points.length / 1200)) === 0 || i === r.points.length - 1,
        )
        .map((p) => [p.lat, p.lon] as [number, number]),
    }))
    return (
      <Shell
        firstname={firstname}
        csrf={csrf}
        title={j.title + ' — Stitch'}
        clientFeatures="preview"
        analyticsPage={demo ? 'example' : 'preview'}
      >
        <main id="main" class="main-content review-main">
          <a class="back-link" href={routes.home.href()}>
            ← Choose activities
          </a>
          <div class="review-heading">
            <div>
              <span class="eyebrow">
                {demo
                  ? 'EXAMPLE PREVIEW'
                  : j.state === 'complete'
                    ? 'STITCH COMPLETE'
                    : 'THE WHOLE PICTURE'}
              </span>
              <h1>
                {j.state === 'complete' ? 'All together. All yours.' : 'Every part, together.'}
              </h1>
              <p>
                {sport} · {m.records.length} activities · {day(m.start)} · Every original timestamp
                preserved.
              </p>
            </div>
            <a class="button button-outline" href={download} download>
              Download {format} <span>↓</span>
            </a>
          </div>
          <Alert message={error} />
          {m.joins.some((g) => (g.metres ?? 0) > 1000) && (
            <div class="alert">
              The activities end and restart {km(Math.max(...m.joins.map((g) => g.metres ?? 0)))} km
              apart at one join. Stitch leaves this gap unconnected. Check that these activities
              belong together.
            </div>
          )}
          <div class="review-grid">
            <div class="review-visual">
              <RouteMap tracks={tracks} />
              <div class="review-stats">
                <div>
                  <strong>
                    {km(m.distance)}
                    <small> km</small>
                  </strong>
                  <span>Combined distance</span>
                </div>
                <div>
                  <strong>{duration(m.moving)}</strong>
                  <span>Moving time</span>
                </div>
                <div>
                  <strong>{duration(m.elapsed)}</strong>
                  <span>Elapsed time</span>
                </div>
                <div>
                  <strong>
                    {Math.round(m.elevation)}
                    <small> m</small>
                  </strong>
                  <span>Climbing</span>
                </div>
              </div>
              <p class="fine-print">
                Totals from the source activities. Strava may recalculate them after import.
              </p>
              {demo && (
                <ExampleDetails
                  title={j.title}
                  description={j.description ?? mergedDescription(m)}
                />
              )}
              <section class="timeline-section">
                <h2>Every part, in its place.</h2>
                <div class="timeline">
                  {m.records.map((r, i) => (
                    <div class="timeline-part" key={r.activity.id}>
                      <div class="timeline-record">
                        <span class="part-number" style={{ background: labelColours[i] }}>
                          {i + 1}
                        </span>
                        <div>
                          <h3>{r.activity.name}</h3>
                          <p>
                            {time(r.activity.start_date_local ?? r.activity.start_date)} ·{' '}
                            {km(r.activity.distance)} km · {duration(r.activity.moving_time)} moving
                          </p>
                          {demo && r.activity.description && (
                            <p class="source-description">{r.activity.description}</p>
                          )}
                        </div>
                        {!demo && (
                          <a
                            class="strava-data-link"
                            href={'https://www.strava.com/activities/' + r.activity.id}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={'View ' + r.activity.name + ' on Strava'}
                          >
                            View on Strava ↗
                          </a>
                        )}
                      </div>
                      {m.joins[i] && (
                        <div class="join-note">
                          <span aria-hidden="true">Ⅱ</span>
                          <div>
                            <strong>{duration(m.joins[i].seconds)} between activities</strong>
                            <p>
                              {joinLocation(m.joins[i].metres)} The gap stays in elapsed time; no
                              connecting points are added.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              <details class="preservation">
                <summary>What comes along?</summary>
                <p>
                  All {m.pointCount.toLocaleString('en-GB')} recorded samples and their original
                  timestamps. Available GPS, elevation, temperature, heart rate, and cadence are
                  included in {format}, at the precision it supports. Recorded distance is included
                  when complete across all selected activities.
                </p>
                <p>
                  This is reconstructed from Strava data. Photos, kudos, comments, original laps,
                  pool lengths, workout sets, measured power, and device metadata are not
                  transferred.
                </p>
                {format === 'FIT' && (
                  <p>
                    FIT preserves recordings without adding GPS. Its laps mark the source activities
                    and its timer pauses mark the gaps between them. Original pause events within
                    each activity are unavailable.
                  </p>
                )}
                <p>
                  Direct uploads keep the {sport} sport type. Check the sport when importing a
                  downloaded file yourself.
                </p>
              </details>
            </div>
            <aside class="finish-panel">
              <span class="finish-icon" aria-hidden="true">
                {j.state === 'complete' ? '✓' : '↗'}
              </span>
              <h2>{j.state === 'complete' ? 'Back where it belongs.' : 'Ready when you are.'}</h2>
              {demo ? (
                <>
                  <p>
                    This is an illustrative example. Connect Strava to bring your own activities
                    together.
                  </p>
                  <form data-rmx-document action={routes.auth.connect.href()} method="post">
                    <input type="hidden" name="_csrf" value={csrf} />
                    <StravaConnect source="example" />
                  </form>
                </>
              ) : j.state === 'complete' ? (
                <>
                  <p>
                    Your stitched activity is on Strava. Open it to review the sport, totals, and
                    visibility.
                  </p>
                  <a
                    class="button button-dark wide"
                    href={'https://www.strava.com/activities/' + j.activityId}
                    data-funnel="view_on_strava_click"
                    data-funnel-placement="preview"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Strava ↗
                  </a>
                </>
              ) : j.state === 'processing' ? (
                <UploadStatus id={j.id} />
              ) : j.state === 'unknown' || j.state === 'submitting' ? (
                <>
                  <p>
                    {j.error ??
                      'An upload was started, but its result has not been confirmed. Check Strava before starting another.'}
                  </p>
                  <a
                    class="button button-outline wide"
                    href="https://www.strava.com/athlete/training"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Check Strava ↗
                  </a>
                </>
              ) : !canUpload ? (
                <>
                  <p>
                    Allow uploads to send this activity directly to Strava. Downloads are already
                    available.
                  </p>
                  <form data-rmx-document action={routes.auth.connect.href()} method="post">
                    <input type="hidden" name="_csrf" value={csrf} />
                    <StravaConnect source="preview" />
                  </form>
                </>
              ) : (
                <>
                  <p>
                    {j.removalConfirmed
                      ? `Your originals have been checked. Confirm below to upload your stitch as ${sport}.`
                      : j.state === 'duplicate'
                        ? 'Your stitch is ready. Strava found a duplicate; review the originals before trying again.'
                        : `Review the recordings and pauses. We’ll check the originals before uploading to Strava as ${sport}.`}
                  </p>
                  {j.error && j.state !== 'duplicate' && <Alert message={j.error} />}
                  <UploadForm
                    id={j.id}
                    csrf={csrf}
                    title={j.title}
                    description={j.description ?? mergedDescription(j.merge)}
                    retry={j.state !== 'ready'}
                    removalConfirmed={j.removalConfirmed}
                    prepared={Boolean(handle.props.uploadPreparation)}
                  />
                  {handle.props.uploadPreparation && !j.removalConfirmed && (
                    <UploadPreparation
                      id={j.id}
                      csrf={csrf}
                      state={handle.props.uploadPreparation}
                      error={error}
                      sources={m.records.map(({ activity }) => ({
                        id: activity.id,
                        name: activity.name,
                      }))}
                    />
                  )}
                </>
              )}
              {!demo && (
                <div class="backup-option">
                  <span>Keep a copy for yourself.</span>
                  <a href={routes.stitches.backup.href({ id: j.id })} download>
                    Download backup bundle ↓
                  </a>
                  <p>Includes reconstructed originals, not original device files.</p>
                </div>
              )}
              <div class="finish-footnote">Originals are never removed by Stitch.</div>
            </aside>
          </div>
        </main>
      </Shell>
    )
  }
}

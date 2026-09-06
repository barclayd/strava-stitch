import type { Handle } from 'remix/ui'
import { Shell, Alert } from '../../ui/shell.tsx'
import { RouteMap } from '../../ui/public/route-map.tsx'
import { colours, duration, km, day, time } from '../public/format.ts'
import { routes } from '../../routes.ts'
import type { Job } from '../../data/store.ts'
import { UploadForm, UploadStatus } from './public/upload-form.tsx'
import { StravaConnect } from '../../ui/strava.tsx'

export function StitchPage(
  handle: Handle<{
    job: Job
    csrf: string
    firstname?: string
    canUpload: boolean
    error?: string
    demo?: boolean
  }>,
) {
  return () => {
    const { job: j, csrf, firstname, canUpload, error, demo } = handle.props,
      m = j.merge
    const download = demo ? routes.demoDownload.href() : routes.stitches.download.href({ id: j.id })
    const tracks = m.records.map((r) => ({
      id: r.activity.id,
      name: r.activity.name,
      coordinates: r.points
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
              <h1>{j.state === 'complete' ? 'One ride. All yours.' : 'Looking like one ride.'}</h1>
              <p>
                {m.records.length} activities · {day(m.start)} · Every original timestamp preserved.
              </p>
            </div>
            <a class="button button-outline" href={download} download>
              Download GPX <span>↓</span>
            </a>
          </div>
          <Alert message={error} />
          {m.joins.some((g) => g.metres > 1000) && (
            <div class="alert">
              The activities end and restart {km(Math.max(...m.joins.map((g) => g.metres)))} km
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
              <section class="timeline-section">
                <h2>Every part, in its place.</h2>
                <div class="timeline">
                  {m.records.map((r, i) => (
                    <div class="timeline-part" key={r.activity.id}>
                      <div class="timeline-record">
                        <span class="part-number" style={{ background: colours[i] }}>
                          {i + 1}
                        </span>
                        <div>
                          <h3>{r.activity.name}</h3>
                          <p>
                            {time(r.activity.start_date_local ?? r.activity.start_date)} ·{' '}
                            {km(r.activity.distance)} km · {duration(r.activity.moving_time)} moving
                          </p>
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
                              Endpoints are{' '}
                              {m.joins[i].metres >= 1000
                                ? `${km(m.joins[i].metres)} km`
                                : `${Math.round(m.joins[i].metres)} m`}{' '}
                              apart. The gap stays in elapsed time; no connecting points are added.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              <details class="preservation">
                <summary>What comes along for the ride?</summary>
                <p>
                  All {m.pointCount.toLocaleString('en-GB')} GPS samples and their original
                  timestamps. Available elevation, recorded distance, temperature, heart rate, and
                  cadence are included in GPX.
                </p>
                <p>
                  This is reconstructed from Strava data. Photos, kudos, comments, laps, measured
                  power, and device metadata are not transferred.
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
                    <StravaConnect />
                  </form>
                </>
              ) : j.state === 'complete' ? (
                <>
                  <p>
                    Your stitched ride is on Strava. Open it to review the route, totals, and
                    visibility.
                  </p>
                  <a
                    class="button button-dark wide"
                    href={'https://www.strava.com/activities/' + j.activityId}
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
              ) : j.state === 'duplicate' && !j.removalConfirmed ? (
                <div class="duplicate-flow">
                  <h3>Strava found an original.</h3>
                  <p>
                    Strava may reject a stitched ride while the original activities exist. Removing
                    them also removes their photos, comments, and kudos.
                  </p>
                  <ol>
                    <li>
                      <strong>Save your backup.</strong>
                      <p>A ZIP with the stitched GPX and reconstructed source GPX files.</p>
                      <a
                        class="button button-outline wide"
                        href={routes.stitches.backup.href({ id: j.id })}
                        download
                      >
                        Download backup ↓
                      </a>
                    </li>
                    <li>
                      <strong>Remove originals in Strava.</strong>
                      <p>
                        Stitch cannot delete activities. Open each selected activity and decide
                        whether to remove it.
                      </p>
                      {m.records.map((r, i) => (
                        <a
                          class="source-link strava-data-link"
                          key={r.activity.id}
                          href={'https://www.strava.com/activities/' + r.activity.id}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Part {i + 1} · {r.activity.name} · View on Strava ↗
                        </a>
                      ))}
                    </li>
                  </ol>
                  <form
                    data-rmx-document
                    action={routes.stitches.confirmRemoval.href({ id: j.id })}
                    method="post"
                  >
                    <input type="hidden" name="_csrf" value={csrf} />
                    <label class="check-line">
                      <input type="checkbox" name="confirm" value="removed" required />
                      <span>I saved my backup and removed these originals in Strava.</span>
                    </label>
                    <button class="button button-dark wide">Check originals and continue →</button>
                  </form>
                </div>
              ) : !canUpload ? (
                <>
                  <p>
                    Allow uploads to send this ride directly to Strava. Downloads are already
                    available.
                  </p>
                  <form data-rmx-document action={routes.auth.connect.href()} method="post">
                    <input type="hidden" name="_csrf" value={csrf} />
                    <StravaConnect />
                  </form>
                </>
              ) : (
                <>
                  <p>
                    Give the route and its pauses a final look, then send your whole ride to Strava.
                  </p>
                  {j.error && <Alert message={j.error} />}
                  <UploadForm id={j.id} csrf={csrf} title={j.title} retry={j.state !== 'ready'} />
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

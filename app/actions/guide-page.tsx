import type { Handle } from 'remix/ui'
import { Shell } from '../ui/shell.tsx'
import { routes } from '../routes.ts'
import { guideUpdated, type PageSeo } from '../seo.ts'

export function GuidePage(handle: Handle<{ csrf: string; seo: PageSeo }>) {
  return () => (
    <Shell {...handle.props}>
      <main id="main" class="guide-page">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          <a href={routes.home.href()}>Stitch</a>
          <span aria-hidden="true">/</span>
          <span>Merge Strava activities</span>
        </nav>
        <article>
          <header class="guide-heading">
            <span class="eyebrow">THE STITCH GUIDE</span>
            <h1>How to merge Strava activities</h1>
            <p class="guide-deck">
              An accidental finish shouldn’t split the story of your activity. Here’s how to put the
              parts back together, and what to check before uploading.
            </p>
            <p class="article-byline">
              By <a href={routes.privacy.href() + '#support'}>Barksoft Ltd.</a>
              <span aria-hidden="true">·</span>Updated{' '}
              <time dateTime={guideUpdated}>7 September 2026</time>
            </p>
          </header>
          <figure class="guide-figure">
            <picture>
              <source srcSet="/images/merge-guide.svg" type="image/svg+xml" />
              <img
                src="/images/merge-guide.png"
                alt="Two activity tracks are placed in time order. The pause between them stays a gap."
                width="1200"
                height="675"
                fetchPriority="high"
              />
            </picture>
            <figcaption>
              An illustrative join. Stitch keeps the original timestamps and leaves the gap between
              activities unconnected.
            </figcaption>
          </figure>
          <div class="article-layout">
            <nav class="article-toc" aria-label="On this page">
              <strong>IN THIS GUIDE</strong>
              <a href="#can-you-merge">Can you merge on Strava?</a>
              <a href="#before-you-start">Before you start</a>
              <a href="#join-your-activities">Join your activities</a>
              <a href="#what-is-preserved">What carries across</a>
              <a href="#pauses-and-gaps">Pauses and gaps</a>
              <a href="#duplicates">Duplicate uploads</a>
              <a href="#questions">Common questions</a>
            </nav>
            <div class="article-body">
              <section id="can-you-merge">
                <h2>Can you merge activities on Strava?</h2>
                <p>
                  Yes, you can combine the data from separate activities and upload it as one new
                  activity. Strava itself does not have a built-in merge feature. Its{' '}
                  <a href="https://support.strava.com/en-us/articles/15401839-merge-or-combine-activities">
                    official guidance on merging activities
                  </a>{' '}
                  points to third-party tools.
                </p>
                <p>
                  Stitch is a free tool for joining consecutive activities of the same sport on your
                  Strava account. It brings them into time order, shows you the route and each join,
                  and creates a GPX or FIT file. You can download that file or explicitly confirm an
                  upload to Strava.
                </p>
                <p>
                  It suits a ride split by a café stop, an accidentally ended activity, or a restart
                  after changing your route. Combining two devices that recorded the same ride at
                  the same time is a different task; Stitch rejects overlapping activities.
                </p>
                <aside class="article-note">
                  <strong>Try the preview first.</strong> Stitch is in early access and Strava
                  connections are currently limited. The{' '}
                  <a href={routes.demo.href()}>illustrative example</a> is available without
                  connecting an account.
                </aside>
              </section>
              <section id="before-you-start">
                <h2>Before you start</h2>
                <p>
                  Sync each part of your activity to Strava. Stitch supports two to eight activities
                  of the same sport, with up to 50,000 recorded samples in total. All sport types
                  listed in Strava’s upload API are supported, including runs, trail runs, rides,
                  e-bike rides, swims, hikes, walks, skiing, and indoor workouts.
                </p>
                <p>
                  Each activity needs at least two recorded timestamps. GPS is optional. Manual
                  entries and activities with no recorded timeline cannot be stitched. Overlapping
                  recordings are rejected. Sport types must match exactly: Run and Trail Run, or
                  Ride and E-bike Ride, belong in separate stitches.
                </p>
                <p>
                  Decide whether the activities belong together. A short stop and restart is
                  straightforward; a long break or a move to another location needs a closer look.
                  Missing GPS data cannot be recovered by merging.
                </p>
                <p>
                  Keep your originals while you build and inspect the preview. If you might later
                  remove an activity from Strava, also keep its original device file if you have it.
                  Stitch’s backup contains reconstructed GPX or FIT files, not the original files
                  from your recording device.
                </p>
              </section>
              <section id="join-your-activities">
                <h2>How to join your Strava activities with Stitch</h2>
                <ol class="article-steps">
                  <li>
                    <h3>Connect your Strava account</h3>
                    <p>
                      Open <a href={routes.home.href()}>Stitch</a> and choose Connect with Strava.
                      Review the permissions on Strava’s authorization screen. Activity access lets
                      Stitch read recorded data, including private activities; upload access lets it
                      create a new activity when you confirm.
                    </p>
                  </li>
                  <li>
                    <h3>Select the parts of your activity</h3>
                    <p>
                      Choose between two and eight activities of the same sport. Search by name,
                      date, or sport in your activity list. Stitch orders them by their start times.
                      Check the dates and titles so you select the parts of the same outing.
                    </p>
                  </li>
                  <li>
                    <h3>Review the route and every join</h3>
                    <p>
                      Open the preview and compare the map, times, distance, and gaps with what
                      happened during your activity. Each original recording keeps its own boundary.
                      Stitch does not draw a made-up GPS track between the end of one activity and
                      the start of the next.
                    </p>
                  </li>
                  <li>
                    <h3>Download the merged file</h3>
                    <p>
                      GPS recordings download as GPX. A stitch containing recordings without GPS
                      downloads as FIT, without adding any coordinates. Download the backup bundle
                      too if you need reconstructed copies of each original activity. Creating or
                      downloading a preview does not change your activities on Strava.
                    </p>
                  </li>
                  <li>
                    <h3>Confirm an upload when you’re ready</h3>
                    <p>
                      Choose a title, review the gap confirmation and your Strava default activity
                      visibility, then confirm the upload. Stitch cannot set “Only You” through
                      Strava’s documented upload API. Open the new activity in Strava to check its
                      sport, map, totals, and visibility. Direct uploads preserve the exact Strava
                      sport type; check the sport if you import a downloaded file yourself. If
                      Strava reports a duplicate, follow the separate steps below.
                    </p>
                  </li>
                </ol>
              </section>
              <section id="what-is-preserved">
                <h2>What carries across when you combine activities?</h2>
                <p>
                  A merged GPX or FIT is a new activity file. It can carry the recorded timeline and
                  supported samples available from Strava, but it is not a complete copy of the
                  original activity pages.
                </p>
                <div
                  class="table-scroll"
                  role="region"
                  aria-label="Data preserved in a merged activity"
                  tabIndex={0}
                >
                  <table>
                    <caption>What Stitch includes in its exports</caption>
                    <thead>
                      <tr>
                        <th scope="col">Data</th>
                        <th scope="col">What to expect</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row">GPS and timestamps</th>
                        <td>
                          Original times and available positions, with separate boundaries for the
                          activities. GPS is never invented for indoor recordings.
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">Elevation and sensors</th>
                        <td>
                          Available elevation, temperature, heart rate, and cadence samples, at the
                          precision the file supports. Recorded distance is included when complete
                          across all selected activities; FIT also includes summary distances.
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">Distance, time, elevation totals</th>
                        <td>
                          The preview uses source totals. Strava may recalculate them after import.
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">
                          Power, original laps, pool lengths, workout sets, device metadata
                        </th>
                        <td>
                          Not transferred. FIT laps mark source activities; they do not reconstruct
                          pool lengths or workout intervals.
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">Photos, kudos, comments</th>
                        <td>
                          Not transferred to the new activity. Deleting originals loses their social
                          history.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p>
                  FIT timer pauses mark the gaps between source recordings. Strava does not provide
                  the original pause events within each activity, so those are not reconstructed
                  from moving-time totals. Strava may calculate moving time differently after
                  import.
                </p>
              </section>
              <section id="pauses-and-gaps">
                <h2>What happens to pauses and missing sections?</h2>
                <p>
                  Suppose you end the first activity at 10:35 and start the next at 10:38. If you
                  were stopped for those three minutes, that is a real pause. Stitch keeps both
                  timestamps instead of shifting the second activity backwards to hide the break.
                </p>
                <p>
                  If you were still cycling, that part of the route was not recorded. Stitch
                  preserves the gap; it cannot know which road you took or how fast you travelled. A
                  map can show the recorded parts together without turning the missing section into
                  measured distance.
                </p>
                <p>
                  Moving time and elapsed time can therefore differ, and Strava’s imported totals
                  may differ from the preview. Check the result against the activity you actually
                  did. If the activities overlap in time, Stitch asks you to choose a different set
                  instead of silently dropping points or counting both tracks.
                </p>
              </section>
              <section id="duplicates">
                <h2>What if Strava rejects the upload as a duplicate?</h2>
                <p>
                  The combined activity contains data already present in your originals, so Strava
                  may reject it as a duplicate. Strava’s guidance says the existing activities may
                  need to be removed before the combined file can be uploaded.
                </p>
                <p>
                  Stitch never deletes an activity on Strava. After a duplicate rejection, it
                  requires you to download a backup bundle before continuing. Inspect that backup
                  and remember that it cannot restore photos, kudos, comments, or every device
                  field.
                </p>
                <p>
                  If you decide to proceed, remove the relevant original activities yourself in
                  Strava. Return to Stitch and confirm their removal separately. Stitch checks that
                  the originals are no longer available before allowing another upload attempt. You
                  can also keep the originals and retain the stitched file without uploading it.
                </p>
              </section>
              <section id="questions">
                <h2>A few more things to know</h2>
                <h3>Does Stitch support all Strava activity types?</h3>
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
                <h3>Is Stitch free to use?</h3>
                <p>
                  Yes. Previewing, downloading, and uploading through Stitch are free. During early
                  access, Strava limits how many accounts can connect. You can explore the example
                  preview without an account.
                </p>
                <h3>Can I merge GPX, FIT, or TCX files directly?</h3>
                <p>
                  Stitch currently reads activities from your connected Strava account and exports
                  GPX or FIT. It does not offer local file import. If your activity is still on your
                  device, first sync the individual activities to Strava.
                </p>
                <h3>Can I combine a ride and a run?</h3>
                <p>
                  No. Each stitch uses one exact sport type, so runs go with runs and rides go with
                  rides. Mixed-sport sessions and simultaneous recordings from two devices are not
                  supported.
                </p>
                <h3>Can I stitch indoor workouts or swims?</h3>
                <p>
                  Yes, when Strava provides recorded timestamps. Stitch uses FIT if GPS is absent.
                  It preserves available samples, but cannot recreate swimming lengths, strength
                  sets, or data that Strava does not return. A manually entered duration alone is
                  not a recorded timeline.
                </p>
                <h3>Will my private activities become public?</h3>
                <p>
                  Your activity data in Stitch is available only to your connected account.
                  Uploading creates a new Strava activity using your Strava account’s default
                  visibility. Check that setting before uploading. Read{' '}
                  <a href={routes.privacy.href()}>how Stitch handles your data</a> for storage,
                  backups, and disconnecting.
                </p>
              </section>
              <aside class="guide-cta">
                <span class="overline">BRING EVERY PART TOGETHER</span>
                <h2>See what a join looks like.</h2>
                <p>Explore two illustrative activities, the route, and the pause between them.</p>
                <a class="button button-dark" href={routes.demo.href()}>
                  Explore the example <span aria-hidden="true">→</span>
                </a>
                <a class="inline-link" href={routes.home.href()}>
                  Combine your activities with Stitch
                </a>
              </aside>
            </div>
          </div>
        </article>
      </main>
    </Shell>
  )
}

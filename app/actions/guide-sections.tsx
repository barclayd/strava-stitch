import type { RemixNode } from 'remix/ui'
import type { GuideTopic } from '../guide-topics.ts'
import { routes } from '../routes.ts'

type Section = { id: string; title: string; body: RemixNode }

export const guideSections: Record<GuideTopic, Section[]> = {
  garminGuide: [
    {
      id: 'separate-recordings',
      title: 'One outing, several Garmin recordings',
      body: (
        <>
          <p>
            You finish one Garmin recording, save it, and start another for the next part of the
            ride. Perhaps you were switching courses, stopped at a café, or accidentally ended a
            run. After syncing, the parts appear as separate activities on Strava. Stitch can join
            those recorded parts into one new Strava activity.
          </p>
          <p>
            A course is a route you follow; an activity records what you actually did. Changing or
            stopping navigation does not necessarily end the recording. Garmin explains how to{' '}
            <a href="https://support.garmin.com/en-US/?faq=jFc51r4Z6F7JyjpfF2oxY6&amp;productID=567991&amp;tab=topics">
              change courses on an Edge while continuing to record
            </a>
            . This guide applies when you have saved separate activities, rather than just followed
            several courses within one recording.
          </p>
        </>
      ),
    },
    {
      id: 'sync-to-strava',
      title: 'Get every part from Garmin Connect to Strava',
      body: (
        <>
          <p>
            Sync the saved recordings from your Garmin device to Garmin Connect. With your Garmin
            Connect and Strava accounts linked for activity syncing, those recordings can upload
            automatically to Strava. Follow Strava’s{' '}
            <a href="https://support.strava.com/en-us/articles/15401903-garmin-and-strava">
              Garmin connection and sync instructions
            </a>{' '}
            if you have not linked them yet.
          </p>
          <p>
            Check your Strava activity list and wait until every part is visible before opening
            Stitch. If a recording is missing, resolve the sync first. Strava’s instructions also
            explain how to export the original file from Garmin Connect and upload it to Strava
            yourself.
          </p>
          <p>
            Stitch connects to your Strava account. It does not connect directly to Garmin Connect
            or accept local FIT files. You do not need to export files when all the activities have
            already synced to Strava.
          </p>
        </>
      ),
    },
    {
      id: 'three-part-example',
      title: 'Example: three Garmin rides become one Strava ride',
      body: (
        <>
          <p>
            Imagine saving a recording at the end of each leg, then starting another. This
            illustrative outing has three consecutive activities, all with the Strava sport type
            Ride:
          </p>
          <div
            class="table-scroll"
            role="region"
            aria-label="Illustrative three-part Garmin ride"
            tabIndex={0}
          >
            <table>
              <caption>Three saved recordings from one outing</caption>
              <thead>
                <tr>
                  <th scope="col">Recording</th>
                  <th scope="col">Time</th>
                  <th scope="col">Distance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">First leg</th>
                  <td>09:00–09:45</td>
                  <td>20 km</td>
                </tr>
                <tr>
                  <th scope="row">Second leg</th>
                  <td>09:50–10:35</td>
                  <td>20 km</td>
                </tr>
                <tr>
                  <th scope="row">Third leg</th>
                  <td>10:45–11:30</td>
                  <td>20 km</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Select all three in Stitch. Their source distances total 60 km, with two hours and
            thirty minutes between the first start and final finish. Stitch preserves the
            five-minute and ten-minute gaps between recordings. Strava may recalculate the merged
            activity’s distance and moving time after upload.
          </p>
          <p>
            If you kept riding while recording was stopped, that section was never recorded. Stitch
            leaves it missing; it cannot recover the route from the planned Garmin course.
          </p>
        </>
      ),
    },
    {
      id: 'merge-with-stitch',
      title: 'Merge the synced activities with Stitch',
      body: (
        <>
          <ol class="article-steps">
            <li>
              <h3>Connect Strava and select the parts</h3>
              <p>
                Connect with Strava, then select two to eight activities from the same outing. Check
                their names, dates and sport types. Stitch places them in time order.
              </p>
            </li>
            <li>
              <h3>Review the preview and gaps</h3>
              <p>
                Check the recorded routes, times and totals. Each recording keeps its own boundary;
                no invented track connects the gaps. Review the suggested combined title and
                descriptions, and edit them if needed.
              </p>
            </li>
            <li>
              <h3>Save and inspect your backups</h3>
              <p>
                Download the merged file and activity backup. Save available photos in the separate
                photo ZIP. Open and check the files before removing anything. You can keep these
                downloads without uploading a new activity.
              </p>
            </li>
            <li>
              <h3>Confirm the upload when ready</h3>
              <p>
                Review the gaps and your Strava default visibility, then choose Continue to upload.
                Follow the preparation steps and, if you choose to replace the originals, remove the
                selected activities yourself in Strava after checking your backups. Confirm their
                removal and choose Verify and upload to Strava. Stitch checks the originals are
                gone, then starts the upload without another submit step.
              </p>
            </li>
            <li>
              <h3>Check the new activity on Strava</h3>
              <p>
                Once processing finishes, open the merged activity and check its map, totals, sport
                and visibility. Add saved photos manually. For a rejected or duplicate upload, use
                the <a href={routes.duplicateGuide.href()}>duplicate-upload guide</a> before
                retrying.
              </p>
            </li>
          </ol>
        </>
      ),
    },
    {
      id: 'what-changes',
      title: 'What happens to the Garmin originals and their data?',
      body: (
        <>
          <p>
            Stitch creates a new Strava activity. It does not merge, edit or delete the entries in
            Garmin Connect. Stitch never deletes activities on Strava either; removing originals
            there is a separate action you take yourself. Your preview is private to your connected
            Stitch account and expires after 24 hours.
          </p>
          <p>
            The merged file uses recorded data available through Strava, including timestamps and
            supported GPS and sensor samples. It is not a complete copy of the original Garmin FIT
            files. Power, original laps and device metadata are not transferred. Keep your Garmin
            device files if those details matter; see the{' '}
            <a href={routes.guide.href() + '#what-is-preserved'}>full data-preservation table</a>.
          </p>
          <p>
            Photos can be saved separately and added back manually. Kudos and comments do not
            transfer to the merged activity, and deleting originals on Strava loses that social
            history.
          </p>
        </>
      ),
    },
    {
      id: 'compatible-recordings',
      title: 'Which Garmin activities can you combine?',
      body: (
        <>
          <p>
            Stitch supports two to eight recordings with matching Strava sport types and up to
            50,000 recorded samples in total. Run and Trail Run are different types, as are Ride and
            Virtual Ride. A ride followed by a run needs separate stitches.
          </p>
          <p>
            The recordings must not overlap. A Garmin watch and bike computer recording the same
            ride at the same time cannot be combined with Stitch. Each activity needs recorded
            timestamps; a manually entered duration alone is not enough.
          </p>
          <p>
            To combine two Garmin rides or merge an accidentally stopped Garmin run, sync both parts
            first and follow the same steps above. The{' '}
            <a href={routes.rideGuide.href()}>split-ride guide</a> and{' '}
            <a href={routes.runGuide.href()}>split-run guide</a> explain sport-specific gaps and
            totals. For recordings without GPS, read about{' '}
            <a href={routes.indoorGuide.href()}>joining indoor workouts with FIT</a>.
          </p>
        </>
      ),
    },
  ],
  duplicateGuide: [
    {
      id: 'check-first',
      title: 'Check whether the upload already succeeded',
      body: (
        <>
          <p>
            Open your activity list on Strava and look for the combined activity before trying
            again. An interrupted browser session or delayed response does not necessarily mean an
            upload failed. If the activity exists, check its title, sport, route and visibility
            instead of creating another copy.
          </p>
          <p>
            A duplicate error is different from an upload that is still processing or whose outcome
            is unknown. In Stitch, use the existing upload status. An uncertain upload is held for
            review so repeated clicks do not create multiple activities.
          </p>
        </>
      ),
    },
    {
      id: 'why-duplicate',
      title: 'Why a merged activity can look like a duplicate',
      body: (
        <>
          <p>
            The merged file contains timestamps and samples already present in the original
            recordings. Giving it a different title does not remove that overlap. Strava’s{' '}
            <a href="https://support.strava.com/en-us/articles/15401839-merge-or-combine-activities">
              merging guidance
            </a>{' '}
            explains that the originals may need to be removed before uploading a combined file,
            losing their kudos and comments.
          </p>
          <aside class="article-note">
            <strong>An illustrative example.</strong> You have “Ride to the café” and “Ride home”.
            Stitch combines their recorded data into one file. Even though the new file covers the
            whole outing, its two parts are already on Strava. Changing the name to “Sunday ride”
            does not make those samples new.
          </aside>
          <p>
            Stitch preserves your original times. It does not shift a recording’s date to disguise a
            duplicate.
          </p>
        </>
      ),
    },
    {
      id: 'backup',
      title: 'Inspect a backup before deciding to replace originals',
      body: (
        <>
          <p>
            Download the merged file and the backup bundle offered by Stitch before uploading. Open
            the bundle and confirm that it contains the expected activities. Keep original device
            files too if you have them.
          </p>
          <p>
            Stitch’s backup is reconstructed from the data available through Strava. It is not an
            archive of the original Strava pages or a complete replacement for device files. It
            cannot restore kudos, comments, power, original laps, swimming lengths or workout sets.
          </p>
          <p>
            Photos have a separate backup: save the available images in Stitch’s photo gallery, then
            download the photo ZIP. Open and check the activity and photo ZIPs before removing
            anything. Photos are not included in GPX or FIT files; add them manually to the new
            activity in Strava after uploading. Videos are not backed up, and downloaded images may
            not be at their original camera resolution.
          </p>
          <p>
            If that history matters more than having one activity, keep the originals and retain the
            merged download. You do not have to replace anything on Strava.
          </p>
        </>
      ),
    },
    {
      id: 'retry',
      title: 'How to retry a confirmed duplicate in Stitch',
      body: (
        <>
          <ol class="article-steps">
            <li>
              <h3>Download and check your backup</h3>
              <p>
                Choose Continue to upload to open the preparation steps. Stitch requires a backup
                download before you confirm removal of the originals. Save available photos and
                download their separate ZIP too. Inspect both backups before continuing.
              </p>
            </li>
            <li>
              <h3>Choose whether to remove the originals</h3>
              <p>
                If you decide to replace them, remove only the relevant source activities yourself
                in Strava. Stitch never deletes activities for you.
              </p>
            </li>
            <li>
              <h3>Verify and upload in Stitch</h3>
              <p>
                Confirm that you saved and checked your backups and removed the originals. Choose
                Verify and upload to Strava. Stitch checks that the originals are no longer
                available, then starts the upload using the title and description you reviewed.
              </p>
            </li>
            <li>
              <h3>Check the uploaded activity</h3>
              <p>
                After processing completes, open the new activity on Strava. Check its title,
                description, gaps and visibility, and add your saved photos manually.
              </p>
            </li>
          </ol>
          <p>
            If the upload still fails, read the specific error before changing anything else.
            Invalid files, authorization problems and uploads still processing need different fixes.
            Strava documents the asynchronous process in its{' '}
            <a href="https://developers.strava.com/docs/uploads/">upload documentation</a>.
          </p>
        </>
      ),
    },
  ],
  indoorGuide: [
    {
      id: 'recorded-time',
      title: 'Recorded timestamps matter more than a map',
      body: (
        <>
          <p>
            Each activity needs at least two recorded timestamps from Strava. A manually entered
            workout with a duration is not a recorded timeline. Stitch cannot generate the missing
            samples from a total such as “45 minutes”.
          </p>
          <p>
            Choose two to eight activities of the same exact sport type. Two swims can belong in one
            stitch; a swim followed by a ride cannot. Virtual Ride and Ride also need separate
            stitches.
          </p>
          <p>
            When any selected recording lacks a complete GPS route, Stitch exports FIT. An empty map
            is expected for an indoor activity and does not, by itself, prevent the timeline from
            being joined.
          </p>
        </>
      ),
    },
    {
      id: 'pool-example',
      title: 'Example: a pool swim recorded in two parts',
      body: (
        <>
          <p>This illustrative session has two Swim activities with recorded timestamps:</p>
          <div class="table-scroll" role="region" aria-label="Illustrative split swim" tabIndex={0}>
            <table>
              <caption>A split swim with a five-minute break</caption>
              <thead>
                <tr>
                  <th scope="col">Part</th>
                  <th scope="col">Recorded time</th>
                  <th scope="col">GPS</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">First swim</th>
                  <td>07:00–07:20</td>
                  <td>None</td>
                </tr>
                <tr>
                  <th scope="row">Second swim</th>
                  <td>07:25–07:45</td>
                  <td>None</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Stitch keeps the two recorded periods and the five-minute gap. The output uses FIT and
            does not invent coordinates. It does not turn the break into swimming time or recreate
            pool lengths.
          </p>
          <p>
            If either entry has only manually entered totals, this example cannot be stitched. If
            the recordings overlap, choose a different set rather than counting the same period
            twice.
          </p>
        </>
      ),
    },
    {
      id: 'what-carries',
      title: 'What you keep, and what needs a closer look',
      body: (
        <>
          <p>
            Stitch carries the recorded timeline and supported samples returned by Strava, including
            available heart rate and cadence. Recorded distance is included when complete across the
            selected activities; FIT also contains source summary distances.
          </p>
          <p>
            Original swimming lengths, stroke detail, workout sets, power and device metadata are
            not transferred. The FIT laps mark source activities, not the original lengths or
            training intervals. If those details are essential, keep the original activity and
            device file.
          </p>
          <p>
            The preview uses source totals. Strava may calculate the imported activity’s totals
            differently, so check the final result on Strava. See the{' '}
            <a href={routes.guide.href() + '#what-is-preserved'}>full preservation table</a> for the
            supported fields.
          </p>
        </>
      ),
    },
    {
      id: 'join',
      title: 'Join the session with privacy and control',
      body: (
        <>
          <ol>
            <li>Sync both recordings to Strava and connect your account to Stitch.</li>
            <li>Select matching sport types and review the times, gap and source totals.</li>
            <li>
              Download the FIT file, or edit the suggested title and combined descriptions before
              confirming an upload.
            </li>
            <li>Check the new Strava activity and its visibility after processing.</li>
          </ol>
          <p>
            Your preview is private to your connected account in Stitch and expires after 24 hours.
            An upload uses your Strava default visibility. Your original activities remain in place
            unless you remove them yourself. If Strava reports a duplicate, follow our{' '}
            <a href={routes.duplicateGuide.href()}>duplicate-upload guide</a>.
          </p>
        </>
      ),
    },
  ],
  runGuide: [
    {
      id: 'restart',
      title: 'Record the remaining run, then join the parts',
      body: (
        <>
          <p>
            If you accidentally finished the recording, start a new recording for the rest of the
            run and sync both parts to Strava. Stitch can join data that was recorded; it cannot
            recover the route you covered while the watch was stopped.
          </p>
          <p>
            For a run recorded on a Garmin watch, follow our{' '}
            <a
              href={routes.garminGuide.href()}
              data-funnel="guide_click"
              data-funnel-placement="guide"
            >
              guide to merging Garmin activities into Strava
            </a>{' '}
            to get the separate recordings synced before joining them.
          </p>
          <p>
            Use activities of the same exact type. Run, Trail Run and Virtual Run are different
            Strava types, even though they all describe running. A warm-up Run and a main Run can be
            selected together when they do not overlap.
          </p>
          <p>
            Two watches recording the same run at the same time are a different case. Stitch rejects
            overlapping recordings and does not combine one device’s GPS with another device’s
            sensors.
          </p>
        </>
      ),
    },
    {
      id: 'gap-example',
      title: 'Example: the difference between a pause and missing running',
      body: (
        <>
          <div class="table-scroll" role="region" aria-label="Illustrative split run" tabIndex={0}>
            <table>
              <caption>A run restarted three minutes later</caption>
              <thead>
                <tr>
                  <th scope="col">Part</th>
                  <th scope="col">Recorded time</th>
                  <th scope="col">Distance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">First run</th>
                  <td>08:00–08:30</td>
                  <td>5 km</td>
                </tr>
                <tr>
                  <th scope="row">Second run</th>
                  <td>08:33–09:03</td>
                  <td>5 km</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            These illustrative source totals add up to 10 km, with 63 minutes between the first
            start and final finish. The three-minute gap remains in its original place.
          </p>
          <p>
            If you stood still during the gap, it represents a break. If you continued running, that
            portion was not recorded. Stitch does not draw a straight line between the endpoints and
            count it as measured running. Check the gap before accepting the join.
          </p>
        </>
      ),
    },
    {
      id: 'pace',
      title: 'Check pace and time after uploading',
      body: (
        <>
          <p>
            Moving time and elapsed time answer different questions. The preview uses the original
            activities’ totals and preserves their timestamps. Strava can recalculate time, distance
            and pace after importing the new activity.
          </p>
          <p>
            Stitch preserves supported samples that Strava returns, such as available heart rate and
            cadence. It does not reconstruct original laps, intervals or running power. The
            resulting activity also starts without the originals’ photos, kudos and comments.
          </p>
          <p>
            For a treadmill run without GPS, a recorded timeline can still be joined using FIT. A
            manually entered run cannot. Read about{' '}
            <a href={routes.indoorGuide.href()}>activities without GPS</a>.
          </p>
        </>
      ),
    },
    {
      id: 'combine',
      title: 'Combine your runs with Stitch',
      body: (
        <>
          <ol>
            <li>Connect Strava and select two to eight matching running activities.</li>
            <li>Review their chronological order, route, gap and totals.</li>
            <li>Download GPX for complete GPS recordings, or FIT when GPS is missing.</li>
            <li>
              To upload, review the suggested title and descriptions, confirm the gaps and check
              your Strava default visibility.
            </li>
          </ol>
          <p>
            Stitch suggests a title from the originals and separates existing descriptions with new
            lines. You can edit both before uploading. The preview is private to your connected
            account, and uploads happen only after you confirm.
          </p>
          <p>
            Your originals stay in Strava. If the merged upload is flagged as a duplicate, inspect
            the backup and follow the{' '}
            <a href={routes.duplicateGuide.href()}>separate duplicate-upload steps</a> before
            deciding whether to replace them.
          </p>
        </>
      ),
    },
  ],
  rideGuide: [
    {
      id: 'consecutive',
      title: 'Check that your ride recordings are consecutive',
      body: (
        <>
          <p>
            Stitch can join the outward ride and the ride home, or the recordings before and after a
            bike computer restart. Sync each part to Strava first, then select between two and eight
            activities.
          </p>
          <p>
            If you saved separate recordings on a Garmin Edge while changing courses, see how to{' '}
            <a
              href={routes.garminGuide.href()}
              data-funnel="guide_click"
              data-funnel-placement="guide"
            >
              merge Garmin rides into one Strava activity
            </a>{' '}
            after syncing. Changing navigation courses alone does not necessarily split a recording.
          </p>
          <p>
            The sport types must match exactly. Ride, Mountain Bike Ride, Gravel Ride, E-bike Ride
            and Virtual Ride are separate types. Stitch preserves that exact type on a direct
            upload.
          </p>
          <p>
            A bike computer and watch recording the same ride simultaneously are not consecutive
            parts. Stitch rejects their overlap. It does not fuse one device’s power stream with
            another device’s GPS.
          </p>
        </>
      ),
    },
    {
      id: 'cafe-example',
      title: 'Example: a ride split by a café stop',
      body: (
        <>
          <div class="table-scroll" role="region" aria-label="Illustrative split ride" tabIndex={0}>
            <table>
              <caption>Two recordings from one outing</caption>
              <thead>
                <tr>
                  <th scope="col">Part</th>
                  <th scope="col">Recorded time</th>
                  <th scope="col">Distance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Ride to the café</th>
                  <td>09:00–10:15</td>
                  <td>30 km</td>
                </tr>
                <tr>
                  <th scope="row">Ride home</th>
                  <td>10:45–12:00</td>
                  <td>30 km</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            In this illustrative example, the source distances total 60 km and the outing spans
            three hours. Stitch retains the thirty-minute break between the recordings; it does not
            move the return ride backwards in time.
          </p>
          <p>
            If you travelled while recording was stopped, the missing portion stays missing. Review
            the endpoints on the map: the separate line colours identify each original recording and
            no invented route bridges the gap.
          </p>
        </>
      ),
    },
    {
      id: 'sensors',
      title: 'Check sensor data before replacing a ride',
      body: (
        <>
          <p>
            Available GPS positions, timestamps, elevation, heart rate, cadence and temperature can
            carry across. Recorded distance is included when complete across the selected
            activities. Strava may recalculate the new ride’s distance, elevation and moving time
            after import.
          </p>
          <p>
            Power, original laps, device metadata, photos, kudos and comments do not transfer. If
            your original ride is important for power analysis or lap-based training, retain it and
            its device file. Stitch’s reconstructed backup is not a complete device-file archive.
          </p>
          <p>
            A trainer ride can be joined without a map when it has recorded timestamps and matches
            the other activities’ sport type. Read the{' '}
            <a href={routes.indoorGuide.href()}>indoor workout guide</a> for FIT exports and data
            limitations.
          </p>
        </>
      ),
    },
    {
      id: 'upload',
      title: 'Review the ride, then choose a download or upload',
      body: (
        <>
          <p>
            Connect Strava, choose the ride parts, and review the route and each gap. Download the
            merged GPX when every recording has GPS, or FIT when GPS is missing. Creating or
            downloading a preview does not change your Strava activities.
          </p>
          <p>
            Before uploading, edit the suggested combined title and descriptions if you like.
            Descriptions are placed in chronological order with new lines between them. Check your
            Strava default visibility, then explicitly confirm the upload.
          </p>
          <p>
            Stitch is privacy first: your previews are private to your connected account and expire
            after 24 hours. Your originals stay untouched. If Strava rejects the merged ride as a
            duplicate, use the{' '}
            <a href={routes.duplicateGuide.href()}>backup and duplicate-upload guidance</a> before
            removing anything.
          </p>
        </>
      ),
    },
  ],
}

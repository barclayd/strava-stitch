import type { Handle } from 'remix/ui'
import { Shell } from '../ui/shell.tsx'
import { routes } from '../routes.ts'

export function PrivacyPage(handle: Handle<{ csrf: string; firstname?: string }>) {
  return () => (
    <Shell {...handle.props} title="Your data — Stitch">
      <main id="main" class="prose-page">
        <a class="back-link" href={routes.home.href()}>
          ← Back to your rides
        </a>
        <h1>
          Your ride.
          <br />
          Your data.
        </h1>
        <p class="lead">
          Stitch uses your Strava activities to create the ride you ask for. Your activities are
          shown only to your connected account.
        </p>
        <h2>What we access</h2>
        <p>
          With your permission, Stitch reads your profile and activities, including GPS data from
          private activities. Upload permission lets Stitch create a ride after you explicitly
          confirm. Strava does not provide activity deletion through its API.
        </p>
        <h2>What we keep</h2>
        <p>
          Strava access and refresh tokens are encrypted on the server. Your browser stores an
          essential session cookie. Stitch previews and their activity data expire after 24 hours
          and are removed during normal app maintenance. You can download your stitched GPX and a
          backup bundle containing reconstructed originals.
        </p>
        <h2>What a backup contains</h2>
        <p>
          GPX files preserve original GPS positions, timestamps, elevation, and supported sensor
          data available from Strava. They are not the original files from your recording device.
          Photos, comments, kudos, laps, and device metadata are not transferred. Strava may
          recalculate distance, moving time, and elevation when importing.
        </p>
        <h2>Uploading and visibility</h2>
        <p>
          Uploads use your Strava account’s default activity visibility. Stitch cannot choose “Only
          You” through Strava’s documented upload API. Review your default privacy setting before
          uploading.
        </p>
        <h2>Disconnect whenever you like</h2>
        <p>
          Remove your connection data and previews from Stitch below. To revoke Strava authorization
          as well, visit Strava → Settings → My Apps. A deployed installation also receives Strava’s
          deauthorization events to remove stored data.
        </p>
        {handle.props.firstname && (
          <form data-rmx-document method="post" action={routes.auth.disconnect.href()}>
            <input type="hidden" name="_csrf" value={handle.props.csrf} />
            <button type="submit" class="button button-outline">
              Remove my data from Stitch
            </button>
          </form>
        )}
        <p class="muted">
          This installation is an early preview running locally. Public launch requires Strava app
          access approval, a secure deployment, and an active webhook subscription.
        </p>
      </main>
    </Shell>
  )
}

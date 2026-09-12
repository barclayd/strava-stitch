import type { Handle } from 'remix/ui'
import { Shell } from '../ui/shell.tsx'
import { routes } from '../routes.ts'
import type { PageSeo } from '../seo.ts'

export function PrivacyPage(
  handle: Handle<{ csrf: string; firstname?: string; seo: PageSeo; analyticsOptOut: boolean }>,
) {
  return () => (
    <Shell {...handle.props} title="Your data — Stitch" analyticsPage="privacy">
      <main id="main" class="prose-page">
        <a class="back-link" href={routes.home.href()}>
          ← Back to your activities
        </a>
        <h1>
          Your activities.
          <br />
          Your data.
        </h1>
        <p class="lead">
          Privacy first, at every step. Stitch uses your Strava activities to create the combined
          activity you ask for. Your activities and previews are shown only to your connected
          account, and nothing uploads until you explicitly confirm.
        </p>
        <p>
          Stitch is operated by Barksoft Ltd. and is free to use, always. It is an independent
          application and is not developed or endorsed by Strava.
        </p>
        <h2>What we access</h2>
        <p>
          With your permission, Stitch uses Strava’s API to read your profile and activities,
          including GPS data from private activities and available elevation, heart rate, cadence,
          distance, and temperature samples. Upload permission lets Stitch create an activity after
          you explicitly confirm. Strava does not provide activity deletion through its API.
        </p>
        <h2>What we keep</h2>
        <p>
          Cloudflare hosts Stitch and its encrypted storage. We keep your athlete ID, first name,
          permissions, and encrypted access and refresh tokens to maintain your connection until you
          remove it. Your browser stores an essential session cookie; sessions expire after seven
          days without use. Stitch previews and their activity data become unavailable after 24
          hours and are purged by hourly maintenance. You can download your stitched GPX or FIT and
          a backup bundle containing reconstructed originals.
        </p>
        <p>
          Photo backups retrieve available images from Strava through Stitch. Photo references are
          encrypted with the preview on our server; image files are kept in this browser, not in our
          server storage. Browser copies are available during the 24-hour preview and expired copies
          are cleared when you next use this feature. Signing out or removing your connection clears
          browser copies when JavaScript and browser storage are available. Your downloaded ZIP
          files remain on your device. You can also clear browser copies in your browser’s site data
          settings. Browser storage can be cleared by the browser, so download and check your files
          before removing originals. Photos must be added to the new activity manually.
        </p>
        <p>
          Stitch has no advertising or AI features. Strava may collect and use API usage information
          for its business purposes, including improving its services, support, and checking
          compliance. See the{' '}
          <a href="https://www.strava.com/legal/privacy">Strava Privacy Policy</a> for Strava’s own
          processing of your information.
        </p>
        <h2 id="analytics">Understanding how Stitch is used</h2>
        <p>
          We use Cloudflare Analytics Engine to count page views, button clicks, successful Strava
          connections, previews, downloads, and upload outcomes. These events contain fixed page,
          action, and error labels to help diagnose connection and preview problems. They do not
          contain your identity, IP address, activity details, descriptions, GPS data, search terms,
          or full URLs. We do not use tracking cookies or identifiers to follow you between visits.
          Events are kept for three months.
        </p>
        <p>
          We honour your browser’s Do Not Track and Global Privacy Control signals. Cloudflare still
          processes ordinary network requests to host and protect the service.
        </p>
        <div class="analytics-preference">
          <h3>Interaction counts for this browser</h3>
          <p>
            Exclude this browser when testing Stitch, or whenever you prefer not to be counted. This
            stops page, click, connection, preview, download and upload events from this browser.
          </p>
          <p>
            We save only an exclusion preference in a cookie for one year. It contains no
            identifier, stays in place when you sign out, and can be removed here at any time. Set
            it separately in each browser or device you use.
          </p>
          <p role="status">
            {handle.props.analyticsOptOut
              ? 'This browser is excluded from interaction counts.'
              : 'This browser follows your Do Not Track and Global Privacy Control settings.'}
          </p>
          <form data-rmx-document method="post" action={routes.analyticsPreference.href()}>
            <input type="hidden" name="_csrf" value={handle.props.csrf} />
            <button
              type="submit"
              class="button button-outline"
              name="analytics"
              value={handle.props.analyticsOptOut ? 'include' : 'exclude'}
            >
              {handle.props.analyticsOptOut
                ? 'Remove this browser’s exclusion'
                : 'Exclude this browser'}
            </button>
          </form>
          <p>Removing the exclusion still respects your browser’s privacy settings.</p>
        </div>
        <h2>Maps and your routes</h2>
        <p>
          Street maps use OpenStreetMap data hosted with Stitch on Cloudflare. Your browser draws
          your activity routes over that background; we do not send your route, title or description
          to a separate map provider. Map requests still reveal the area being viewed to our hosting
          provider, which processes ordinary requests to deliver the service.
        </p>
        <h2>What a backup contains</h2>
        <p>
          GPX and FIT files contain original timestamps and available GPS, elevation, and supported
          sensor data from Strava, at the precision each format supports. Sport details are included
          in the backup bundle. These are reconstructed files, not the original files from your
          device. Photos, comments, kudos, original laps, pool lengths, workout sets, power, and
          device metadata are not transferred. Strava may recalculate distance, moving time, and
          elevation when importing.
        </p>
        <h2>Uploading and visibility</h2>
        <p>
          Uploads use your Strava account’s default activity visibility. Stitch cannot choose “Only
          You” through Strava’s documented upload API. Review your default privacy setting before
          uploading.
        </p>
        <h2>Disconnect whenever you like</h2>
        <p>
          Remove your connection data and previews from Stitch below. You will see a confirmation
          when removal completes. To revoke Strava authorization as well, visit{' '}
          <a href="https://www.strava.com/settings/apps">Strava → Settings → My Apps</a>. Stitch
          also receives Strava’s deauthorization events and verifies revoked access before removing
          the connection and previews. Files you have downloaded remain on your device.
        </p>
        {handle.props.firstname && (
          <form data-rmx-document method="post" action={routes.auth.disconnect.href()}>
            <input type="hidden" name="_csrf" value={handle.props.csrf} />
            <button type="submit" class="button button-outline">
              Remove my data from Stitch
            </button>
          </form>
        )}
        <h2 id="support">Support & data requests</h2>
        <p>
          Contact Barksoft Ltd. at <a href="mailto:admin@danbarclay.dev">admin@danbarclay.dev</a>{' '}
          for help with Stitch, access to your stored data, or removal requests. Please do not send
          passwords, access tokens, or private activity files in your first message. For settings
          and activities held by Strava, visit{' '}
          <a href="https://www.strava.com/settings">your Strava account</a>.
        </p>
      </main>
    </Shell>
  )
}

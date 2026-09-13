import type { Handle } from 'remix/ui'
import { routes } from '../routes.ts'
import { StravaConnect } from './strava.tsx'

export function GuideActions(handle: Handle<{ csrf: string; firstname?: string }>) {
  return () => (
    <div class="guide-start">
      <div class="guide-start-actions">
        {handle.props.firstname ? (
          <a
            class="button button-dark"
            href={routes.home.href()}
            data-funnel="stitch_click"
            data-funnel-placement="guide_intro"
          >
            Return to your activities <span aria-hidden="true">→</span>
          </a>
        ) : (
          <form data-rmx-document method="post" action={routes.auth.connect.href()}>
            <input type="hidden" name="_csrf" value={handle.props.csrf} />
            <StravaConnect source="guide_intro" />
          </form>
        )}
        <a
          class="inline-link"
          href={routes.demo.href()}
          data-funnel="example_click"
          data-funnel-placement="guide_intro"
        >
          Try the example without an account
        </a>
      </div>
      <p class="guide-start-reassurance">Previewing leaves your originals untouched.</p>
    </div>
  )
}

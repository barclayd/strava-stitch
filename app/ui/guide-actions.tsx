import type { Handle } from 'remix/ui'
import { routes } from '../routes.ts'

export function GuideActions(handle: Handle<{ firstname?: string }>) {
  return () => (
    <div class="guide-start">
      <a
        class="inline-link"
        href={handle.props.firstname ? routes.home.href() : routes.demo.href()}
        data-funnel={handle.props.firstname ? 'stitch_click' : 'example_click'}
        data-funnel-placement="guide_intro"
      >
        {handle.props.firstname
          ? 'Return to your activities'
          : 'Try the example without an account'}
      </a>
      <p class="guide-start-reassurance">Previewing leaves your originals untouched.</p>
    </div>
  )
}

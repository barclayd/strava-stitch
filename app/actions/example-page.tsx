import type { Handle } from 'remix/ui'
import { Shell } from '../ui/shell.tsx'
import { ExampleFlow, type ExamplePreview } from './public/example-flow.tsx'
import { routes } from '../routes.ts'

export function ExamplePage(handle: Handle<{ csrf: string; example: ExamplePreview }>) {
  return () => (
    <Shell
      csrf={handle.props.csrf}
      title="Explore an example stitch — Stitch"
      clientFeatures="example"
      analyticsPage="example"
    >
      <main id="main" class="main-content review-main">
        <a class="back-link" href={routes.home.href()}>
          ← Back to Stitch
        </a>
        <div class="review-heading">
          <div>
            <span class="eyebrow">TRY EVERY STEP. NO ACCOUNT NEEDED.</span>
            <h1>Every part, together.</h1>
            <p>Explore a sample ride, review the pause, and make the title and story your own.</p>
          </div>
        </div>
        <ExampleFlow {...handle.props} initialStep={1} />
      </main>
    </Shell>
  )
}

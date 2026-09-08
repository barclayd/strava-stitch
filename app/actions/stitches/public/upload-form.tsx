import { clientEntry, on, ref, type Handle } from 'remix/ui'
import { routes } from '../../../routes.ts'
import { ActivityFields } from '../../../ui/activity-fields.tsx'

export const ExampleDetails = clientEntry(
  '/client/upload-form.js#ExampleDetails',
  function ExampleDetails(handle: Handle<{ title: string; description: string }>) {
    let title = handle.props.title,
      description = handle.props.description
    return () => (
      <section class="example-details" aria-labelledby="example-details-heading">
        <h2 id="example-details-heading">Your title and story, together.</h2>
        <p class="example-details-intro">
          Both original titles are combined for you. The descriptions come along too. Try editing
          them, just as you can before uploading your own stitch to Strava.
        </p>
        <ActivityFields
          idPrefix="example"
          title={title}
          description={description}
          onTitleInput={(value) => {
            title = value
            handle.update()
          }}
          onDescriptionInput={(value) => {
            description = value
            handle.update()
          }}
        />
        <div class="example-details-footer">
          <p>Demo edits aren’t saved or included in the sample download.</p>
          <button
            type="button"
            class="text-button"
            mix={on('click', () => {
              title = handle.props.title
              description = handle.props.description
              handle.update()
            })}
          >
            Reset example
          </button>
        </div>
      </section>
    )
  },
)

export const UploadForm = clientEntry(
  '/client/upload-form.js#UploadForm',
  function UploadForm(
    handle: Handle<{
      id: string
      title: string
      description: string
      csrf: string
      retry: boolean
    }>,
  ) {
    let confirmed = false,
      gaps = false,
      pending = false,
      title = handle.props.title,
      description = handle.props.description
    return () => (
      <form
        data-rmx-document
        class="upload-form"
        method="post"
        action={routes.stitches.upload.href({ id: handle.props.id })}
        mix={on('submit', () => {
          pending = true
          handle.update()
        })}
      >
        <input type="hidden" name="_csrf" value={handle.props.csrf} />
        <ActivityFields
          idPrefix="activity"
          title={title}
          description={description}
          onTitleInput={(value) => {
            title = value
            handle.update()
          }}
          onDescriptionInput={(value) => {
            description = value
            handle.update()
          }}
        />
        <label class="check-line">
          <input
            type="checkbox"
            name="gaps"
            value="reviewed"
            required
            checked={gaps}
            mix={on('change', (e) => {
              gaps = e.currentTarget.checked
              handle.update()
            })}
          />
          <span>
            I’ve reviewed the gaps. Keep the original times and leave unrecorded sections blank.
          </span>
        </label>
        <label class="check-line">
          <input
            type="checkbox"
            name="confirm"
            value="upload"
            required
            checked={confirmed}
            mix={on('change', (e) => {
              confirmed = e.currentTarget.checked
              handle.update()
            })}
          />
          <span>Upload this stitched activity using my Strava account’s default visibility.</span>
        </label>
        <button
          class="button button-dark wide"
          data-funnel="upload_click"
          data-funnel-placement="preview"
          type="submit"
          disabled={!confirmed || !gaps || pending}
        >
          {pending ? (
            <>
              <span class="spinner" /> Sending to Strava…
            </>
          ) : (
            <>
              {handle.props.retry ? 'Retry upload' : 'Upload to Strava'} <span>↗</span>
            </>
          )}
        </button>
        <p class="fine-print">
          Check your{' '}
          <a href="https://www.strava.com/settings/privacy" target="_blank" rel="noreferrer">
            Strava privacy settings
          </a>{' '}
          first. Stitch cannot set upload visibility.
        </p>
      </form>
    )
  },
)

export const UploadStatus = clientEntry(
  '/client/upload-form.js#UploadStatus',
  function UploadStatus(handle: Handle<{ id: string }>) {
    let message = 'Strava is processing your activity…',
      checking = false
    async function check(signal?: AbortSignal) {
      if (checking) return
      checking = true
      try {
        const response = await fetch(routes.stitches.status.href({ id: handle.props.id }), {
          signal,
        })
        const data = (await response.json()) as { error?: string; state?: string }
        if (!response.ok) message = data.error ?? 'Could not check yet. Try again shortly.'
        else if (data.state !== 'processing') {
          window.location.reload()
          return
        }
      } catch {
        if (!signal?.aborted) message = 'Could not reach Strava. You can check again.'
      }
      checking = false
      if (!signal?.aborted) handle.update()
    }
    return () => (
      <div
        class="processing-box"
        role="status"
        mix={ref((_node, signal) => {
          let checks = 0
          const timer = setInterval(() => {
            if (checks++ >= 20) {
              clearInterval(timer)
              message = 'Still processing. Check again when you’re ready.'
              handle.update()
              return
            }
            void check(signal)
          }, 6000)
          signal.addEventListener('abort', () => clearInterval(timer))
        })}
      >
        <span class="spinner" />
        <p>{message}</p>
        <button
          type="button"
          class="text-button"
          disabled={checking}
          mix={on('click', () => check())}
        >
          Check status
        </button>
      </div>
    )
  },
)

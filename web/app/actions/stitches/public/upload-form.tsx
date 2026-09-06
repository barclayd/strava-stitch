import { clientEntry, on, ref, type Handle } from 'remix/ui'
import { routes } from '../../../routes.ts'

export const UploadForm = clientEntry(
  import.meta.url,
  function UploadForm(handle: Handle<{ id: string; title: string; csrf: string; retry: boolean }>) {
    let confirmed = false,
      gaps = false,
      pending = false
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
        <label class="field-label" for="ride-title">
          Give your whole ride a name
        </label>
        <input
          class="title-input"
          id="ride-title"
          name="title"
          required
          maxLength={100}
          defaultValue={handle.props.title}
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
          <span>Upload this stitched ride using my Strava account’s default visibility.</span>
        </label>
        <button
          class="button button-dark wide"
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
  import.meta.url,
  function UploadStatus(handle: Handle<{ id: string }>) {
    let message = 'Strava is processing your ride…',
      checking = false
    async function check(signal?: AbortSignal) {
      if (checking) return
      checking = true
      try {
        const response = await fetch(routes.stitches.status.href({ id: handle.props.id }), {
          signal,
        })
        const data = await response.json()
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

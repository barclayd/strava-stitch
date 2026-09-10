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
      removalConfirmed?: boolean
      prepared?: boolean
    }>,
  ) {
    let confirmed = Boolean(handle.props.prepared),
      gaps = Boolean(handle.props.prepared),
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
          id="upload-submit"
          class="button button-dark wide"
          data-funnel="upload_click"
          data-funnel-placement="preview"
          type="submit"
          disabled={!confirmed || !gaps || pending}
        >
          {pending ? (
            <>
              <span class="spinner" />{' '}
              {handle.props.removalConfirmed ? 'Sending to Strava…' : 'Checking originals…'}
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

export const UploadPreparation = clientEntry(
  '/client/upload-form.js#UploadPreparation',
  function UploadPreparation(
    handle: Handle<{
      id: string
      csrf: string
      state: 'present' | 'removed' | 'unverified'
      error?: string
      sources: { id: number; name: string }[]
    }>,
  ) {
    let dialog: HTMLDialogElement | undefined
    return () => (
      <dialog
        open
        class="upload-dialog"
        aria-labelledby="upload-preparation-title"
        aria-describedby="upload-preparation-intro"
        mix={[
          ref((node) => {
            dialog = node
            // `open` gives the native form a readable fallback before hydration.
            node.close()
            node.showModal()
          }),
          on('close', () => document.getElementById('upload-submit')?.focus()),
        ]}
      >
        <div class="upload-dialog-heading">
          <span class="eyebrow">ONE LAST STEP</span>
          <button
            type="button"
            class="dialog-close"
            aria-label="Close upload guidance"
            mix={on('click', () => dialog?.close())}
          >
            ×
          </button>
          <h2 id="upload-preparation-title" tabIndex={-1} autoFocus>
            Your stitch is ready.
          </h2>
          <p id="upload-preparation-intro">
            {handle.props.state === 'present'
              ? 'Strava still has one or more of your original activities. To accept the merged recording, Strava needs those originals to be removed first.'
              : handle.props.state === 'removed'
                ? 'The selected originals are no longer available on Strava. Save your backup and confirm their removal before uploading.'
                : 'Save your backup and confirm the originals have been removed. We’ll check with Strava before you continue.'}{' '}
            Your stitched file is ready to download. This check hasn’t started an upload.
          </p>
          {handle.props.error && (
            <p class="alert" role="alert">
              {handle.props.error}
            </p>
          )}
        </div>
        <ol class="upload-steps">
          <li>
            <h3>Save and check your backup</h3>
            <p>
              Keep the merged file and reconstructed copies of each part. Open the ZIP and check its
              contents before removing anything.
            </p>
            <a
              class="button button-outline"
              href={routes.stitches.backup.href({ id: handle.props.id })}
              download
            >
              Download backup ↓
            </a>
          </li>
          <li>
            <h3>
              {handle.props.state === 'present'
                ? 'Remove the originals in Strava'
                : 'Confirm which originals you removed'}
            </h3>
            <p>
              First check that the merged activity isn’t already on Strava. If you want to replace
              these parts, remove only the selected originals yourself.
            </p>
            <div class="upload-source-links">
              {handle.props.sources.map((source, i) => (
                <a
                  key={source.id}
                  class="source-link strava-data-link"
                  href={'https://www.strava.com/activities/' + source.id}
                  target="_blank"
                  rel="noreferrer"
                >
                  Part {i + 1} · {source.name} · View on Strava ↗
                </a>
              ))}
            </div>
            <p class="upload-loss-note">
              Deleting originals also deletes their photos, comments and kudos. The backup cannot
              restore these or every field from your device. You can keep the originals and use the
              downloaded stitch instead.
            </p>
          </li>
          <li>
            <h3>Come back to finish</h3>
            <p>
              We’ll check that the originals are gone. You’ll then confirm the upload separately.
              This preview is available for 24 hours after it was created.
            </p>
          </li>
        </ol>
        <form
          data-rmx-document
          action={routes.stitches.confirmRemoval.href({ id: handle.props.id })}
          method="post"
          class="upload-confirm-removal"
        >
          <input type="hidden" name="_csrf" value={handle.props.csrf} />
          <label class="check-line">
            <input type="checkbox" name="confirm" value="removed" required />
            <span>I saved and checked my backup and removed these originals in Strava.</span>
          </label>
          <button class="button button-dark wide">Check originals and continue →</button>
        </form>
        <a
          class="upload-dialog-back inline-link"
          href={routes.stitches.show.href({ id: handle.props.id })}
          mix={on('click', (event) => {
            event.preventDefault()
            dialog?.close()
          })}
        >
          Back to preview
        </a>
        <p class="upload-dialog-footnote">Stitch never deletes activities for you.</p>
      </dialog>
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

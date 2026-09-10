import { clientEntry, on, ref, type Handle } from 'remix/ui'
import { strToU8, zipSync } from 'fflate'
import { routes } from '../../../routes.ts'
import {
  allPhotosSaved,
  backupChanged,
  backupClearing,
  downloadsReady,
  localBackup,
  maxLocalBytes,
  type LocalBackup,
  type PhotoList,
} from './backup-storage.ts'

type Props = { id: string; expires: number; compact?: boolean }

function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

function backupView(handle: Handle<Props>) {
  let value: LocalBackup | undefined,
    error = '',
    busy = '',
    ready = false
  let lifetime: AbortSignal | undefined
  let clearing = false
  const refresh = async () => {
    try {
      value = await localBackup(handle.props.id, handle.props.expires)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Browser storage is unavailable.'
    }
    if (!lifetime?.aborted) {
      ready = true
      handle.update()
    }
  }
  const mounted = ref((_node, signal) => {
    lifetime = signal
    window.addEventListener(
      backupClearing,
      () => {
        clearing = true
        value = undefined
        handle.update()
      },
      { signal },
    )
    void refresh()
    window.addEventListener(backupChanged, refresh, { signal })
    const timer = setInterval(() => {
      if (Date.now() >= handle.props.expires) {
        value = undefined
        error = 'This preview has expired. Keep the ZIP files you downloaded.'
        handle.update()
        clearInterval(timer)
      }
    }, 10000)
    signal.addEventListener('abort', () => clearInterval(timer))
  })
  const change = async (update: (v: LocalBackup) => void) => {
    if (clearing || lifetime?.aborted || Date.now() >= handle.props.expires)
      throw new Error('This preview is no longer available.')
    value = await localBackup(handle.props.id, handle.props.expires, update)
    if (!lifetime?.aborted) handle.update()
  }
  const run = async (label: string, task: () => Promise<void>) => {
    if (busy) return
    error = ''
    busy = label
    handle.update()
    try {
      await task()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Download failed. Please try again.'
    } finally {
      busy = ''
      if (!lifetime?.aborted) handle.update()
    }
  }
  const photos = () =>
    run('Preparing photos…', async () => {
      await refresh()
      if (!value?.photos.length) throw new Error('Save your photos in the gallery first.')
      const snapshot = value,
        fingerprint = JSON.stringify(snapshot.manifest)
      const files: Record<string, Uint8Array> = {
        'README.txt': strToU8(
          'Stitch photo backup\n\nThese are the image files retrieved from Strava, not necessarily the original camera resolution. Open and check every photo before deleting an activity. Videos, comments and kudos are not backed up. Add photos manually to your stitched activity in Strava after upload.\n',
        ),
      }
      const included = snapshot.photos
      for (const [index, photo] of included.entries()) {
        const ext =
          photo.blob.type === 'image/png'
            ? 'png'
            : photo.blob.type === 'image/webp'
              ? 'webp'
              : 'jpg'
        files[`part-${photo.source}/photo-${index + 1}.${ext}`] = new Uint8Array(
          await photo.blob.arrayBuffer(),
        )
      }
      if (!included.length) throw new Error('No saved photos are available yet.')
      const complete = allPhotosSaved(snapshot)
      files['manifest.json'] = strToU8(
        JSON.stringify(
          { expected: snapshot.manifest?.expected, saved: included.length, complete },
          null,
          2,
        ),
      )
      saveFile(
        new Blob([new Uint8Array(zipSync(files, { level: 0 }))], { type: 'application/zip' }),
        complete ? 'stitch-photos.zip' : 'stitch-photos-incomplete.zip',
      )
      await change((v) => {
        v.photosDownloaded =
          complete && allPhotosSaved(v) && JSON.stringify(v.manifest) === fingerprint
        v.checked = false
      })
    })
  const activities = () =>
    run('Preparing activities…', async () => {
      const response = await fetch(routes.stitches.backup.href({ id: handle.props.id }), {
        signal: lifetime,
      })
      if (!response.ok || !response.headers.get('content-type')?.includes('application/zip'))
        throw new Error('The activity backup could not be downloaded. Please try again.')
      const blob = await response.blob()
      if (!blob.size) throw new Error('The activity backup was empty. Please try again.')
      saveFile(blob, 'stitch-backup.zip')
      await change((v) => {
        v.activitiesDownloaded = true
        v.checked = false
      })
    })
  return {
    mounted,
    refresh,
    change,
    run,
    photos,
    activities,
    get value() {
      return value
    },
    get error() {
      return error
    },
    get busy() {
      return busy
    },
    get ready() {
      return ready
    },
    get signal() {
      return lifetime
    },
  }
}

export const PhotoBackup = clientEntry(
  '/client/photo-backup.js#PhotoBackup',
  function PhotoBackup(handle: Handle<Props>) {
    const view = backupView(handle)
    let expanded = false
    let selected = 0,
      viewer: HTMLDialogElement | undefined,
      opener: HTMLButtonElement | undefined
    const viewerRef = ref((node: HTMLDialogElement) => {
      viewer = node
    })
    const urls = new Map<string, string>()
    const release = () => {
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
    }
    async function capture() {
      await view.run('Saving photos…', async () => {
        const response = await fetch(routes.stitches.photos.href({ id: handle.props.id }), {
          signal: view.signal,
        })
        if (!response.ok)
          throw new Error('Could not check photos. Keep your originals and try again.')
        const manifest = (await response.json()) as PhotoList
        await view.change((v) => {
          if (JSON.stringify(v.manifest) !== JSON.stringify(manifest)) {
            v.photosDownloaded = false
            v.checked = false
          }
          v.manifest = manifest
        })
        let failed = false
        for (const item of manifest.items) {
          if (view.signal?.aborted) return
          if (view.value?.photos.some((p) => p.key === item.key)) continue
          try {
            const response = await fetch(
              routes.stitches.photo.href({ id: handle.props.id, photo: item.key }),
              { signal: view.signal },
            )
            if (!response.ok) throw new Error('Photo unavailable')
            const blob = await response.blob()
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || !blob.size)
              throw new Error('Invalid image')
            if (
              (view.value?.photos.reduce((n, p) => n + p.blob.size, 0) ?? 0) + blob.size >
              maxLocalBytes
            )
              throw new Error('Photo backup too large')
            // Decode the actual downloaded bytes before considering the image saved.
            const url = URL.createObjectURL(blob),
              image = new Image()
            try {
              image.src = url
              await image.decode()
            } finally {
              URL.revokeObjectURL(url)
            }
            await view.change((v) => {
              if (!v.photos.some((p) => p.key === item.key)) {
                if (v.photos.reduce((n, p) => n + p.blob.size, 0) + blob.size > maxLocalBytes)
                  throw new Error('Photo backup too large')
                v.photos.push({ ...item, blob })
              }
            })
          } catch {
            failed = true
          }
        }
        if (failed || !allPhotosSaved(view.value))
          throw new Error(
            'Some photos could not be saved or counted. Keep the originals until you have saved the missing photos yourself. Videos are not included.',
          )
      })
    }
    const initialized = ref((_node, signal) => {
      signal.addEventListener('abort', release)
      void view.refresh().then(() => {
        if (view.ready && !view.value?.manifest && !signal.aborted) return capture()
      })
    })
    return () => {
      const photos = view.value?.photos ?? [],
        manifest = view.value?.manifest
      const active = new Set(photos.map((p) => p.key))
      for (const [key, url] of urls)
        if (!active.has(key)) {
          URL.revokeObjectURL(url)
          urls.delete(key)
        }
      for (const photo of photos)
        if (!urls.has(photo.key)) urls.set(photo.key, URL.createObjectURL(photo.blob))
      return (
        <section
          class="photo-backup"
          id="photo-backup"
          tabIndex={-1}
          aria-labelledby="photo-backup-title"
          mix={[view.mounted, initialized]}
        >
          <div class="photo-heading">
            <div>
              <span class="eyebrow">KEEP THE MOMENTS</span>
              <h2 id="photo-backup-title">Your photos, together.</h2>
            </div>
            {manifest && (
              <span
                class="backup-badge"
                data-ready={allPhotosSaved(view.value) ? 'true' : 'false'}
                role="status"
              >
                {manifest.expected === 0 && manifest.complete
                  ? 'No photos attached'
                  : manifest.expected === null
                    ? `${photos.length} saved · total unverified`
                    : `${photos.length} of ${manifest.expected} photos saved`}
              </span>
            )}
          </div>
          <p>
            Save copies in this browser, then download them to keep. You can add them to your
            stitched activity in Strava after uploading.
          </p>
          {photos.length > 0 && (
            <div
              class={'photo-grid' + (expanded ? ' photo-grid-expanded' : '')}
              data-count={Math.min(photos.length, 5)}
            >
              {(expanded ? photos : photos.slice(0, 5)).map((p, index) => (
                <button
                  type="button"
                  class="photo-tile"
                  key={p.key}
                  aria-label={
                    index === 4 && photos.length > 5 && !expanded
                      ? `Show all ${photos.length} saved photos`
                      : `View saved photo ${index + 1}`
                  }
                  mix={on('click', async (event) => {
                    if (index === 4 && photos.length > 5 && !expanded) {
                      expanded = true
                      handle.update()
                      return
                    }
                    selected = index
                    opener = event.currentTarget
                    await handle.update()
                    viewer?.showModal()
                  })}
                >
                  <img
                    src={urls.get(p.key)}
                    alt={`Saved photo ${index + 1} from activity ${p.source}`}
                    loading="lazy"
                  />
                  {index === 4 && photos.length > 5 && !expanded && (
                    <span class="photo-overflow">+{photos.length - 4}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          <dialog
            class="photo-viewer"
            aria-label="Saved photo viewer"
            mix={[
              viewerRef,
              on('close', () => opener?.focus()),
              on('keydown', (event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault()
                  selected =
                    (selected + (event.key === 'ArrowLeft' ? photos.length - 1 : 1)) % photos.length
                  handle.update()
                }
              }),
            ]}
          >
            <div class="photo-viewer-toolbar">
              <span role="status">
                Photo {selected + 1} of {photos.length}
              </span>
              <button
                type="button"
                class="dialog-close"
                aria-label="Close photo viewer"
                mix={on('click', () => viewer?.close())}
              >
                ×
              </button>
            </div>
            {photos[selected] && (
              <img src={urls.get(photos[selected].key)} alt={`Saved photo ${selected + 1}`} />
            )}
            <div class="photo-viewer-toolbar">
              <button
                type="button"
                class="button button-outline"
                mix={on('click', () => {
                  selected = (selected + photos.length - 1) % photos.length
                  handle.update()
                })}
              >
                ← Previous
              </button>
              <button
                type="button"
                class="button button-outline"
                mix={on('click', () => {
                  selected = (selected + 1) % photos.length
                  handle.update()
                })}
              >
                Next →
              </button>
            </div>
          </dialog>
          <div class="photo-actions">
            {!allPhotosSaved(view.value) && (
              <button
                type="button"
                class="button button-outline"
                disabled={!view.ready || Boolean(view.busy)}
                mix={on('click', capture)}
              >
                {view.busy || (manifest ? 'Retry saving photos' : 'Save photos in this browser')}
              </button>
            )}
            {photos.length > 0 && (
              <button
                type="button"
                class="button button-dark"
                disabled={Boolean(view.busy)}
                mix={on('click', view.photos)}
              >
                {allPhotosSaved(view.value)
                  ? 'Download photos ↓'
                  : `Download ${photos.length} saved photos ↓`}
              </button>
            )}
            {expanded && (
              <button
                type="button"
                class="text-button"
                mix={on('click', () => {
                  expanded = false
                  handle.update()
                })}
              >
                Collapse gallery
              </button>
            )}
          </div>
          {view.error && (
            <p class="backup-error" role="alert">
              {view.error}
            </p>
          )}
          <p class="fine-print">
            Only saved image files appear here. Browser copies are temporary; download and check the
            ZIP before deleting anything. Strava’s image quality may differ from your camera
            originals.
          </p>
          <noscript>
            Enable JavaScript to save and download photos. The activity ZIP does not include photos.
          </noscript>
        </section>
      )
    }
  },
)

export function BackupChecklistBody(handle: Handle<Props>) {
  const view = backupView(handle)
  return () => {
    const value = view.value,
      ready = downloadsReady(value),
      checked = ready && value?.checked
    const noPhotos = value?.manifest?.expected === 0 && allPhotosSaved(value)
    return (
      <div class="backup-checklist" mix={view.mounted}>
        <span class="backup-badge" data-ready={checked ? 'true' : 'false'} role="status">
          {checked
            ? '✓ Backups checked'
            : ready
              ? 'Downloads prepared · check files'
              : 'Back up before removing'}
        </span>
        <ul>
          <li>
            <span aria-hidden="true">{value?.activitiesDownloaded ? '✓' : '○'}</span>
            <span>
              Activity files{' '}
              <small>
                {value?.activitiesDownloaded ? 'Download prepared' : 'Not downloaded here yet'}
              </small>
            </span>
            <a
              href={routes.stitches.backup.href({ id: handle.props.id })}
              download
              class="inline-link"
              mix={on('click', (event) => {
                event.preventDefault()
                void view.activities()
              })}
            >
              Download ↓
            </a>
          </li>
          <li>
            <span aria-hidden="true">
              {noPhotos || (allPhotosSaved(value) && value?.photosDownloaded) ? '✓' : '○'}
            </span>
            <span>
              Photos{' '}
              <small>
                {noPhotos
                  ? 'None attached'
                  : value?.photosDownloaded && allPhotosSaved(value)
                    ? 'Download prepared'
                    : allPhotosSaved(value)
                      ? 'Saved in browser · download next'
                      : 'Save and check in the gallery'}
              </small>
            </span>
            <button
              type="button"
              class="text-button"
              hidden={noPhotos}
              disabled={noPhotos || Boolean(view.busy)}
              mix={on('click', () => {
                if (view.value?.photos.length) return view.photos()
                document.querySelector<HTMLDialogElement>('.upload-dialog[open]')?.close()
                document.getElementById('photo-backup')?.focus()
              })}
            >
              {value?.photos.length ? 'Download ↓' : 'View photos'}
            </button>
          </li>
        </ul>
        {view.busy && <p role="status">{view.busy}</p>}
        {view.error && (
          <p class="backup-error" role="alert">
            {view.error}
          </p>
        )}
        <label class="check-line">
          <input
            type="checkbox"
            checked={Boolean(checked)}
            disabled={!ready || Boolean(view.busy)}
            mix={on('change', (e) => {
              const confirmed = e.currentTarget.checked
              void view.run('', () =>
                view.change((v) => {
                  v.checked = confirmed && downloadsReady(v)
                }),
              )
            })}
          />
          <span>
            I opened and checked my downloaded files, including any photos I want to keep.
          </span>
        </label>
        <p class="fine-print">
          {checked
            ? 'You’re ready to remove the selected originals if you accept the losses below.'
            : 'Your browser may still ask where to save. Check the files on your device before removing originals.'}
        </p>
        {!handle.props.compact && (
          <p class="backup-losses">
            Comments and kudos cannot be restored. Activity files are reconstructed from Strava
            data, not complete original device files. Photos must be added back manually; videos are
            not backed up.
          </p>
        )}
      </div>
    )
  }
}

export const BackupChecklist = clientEntry(
  '/client/photo-backup.js#BackupChecklist',
  BackupChecklistBody,
)

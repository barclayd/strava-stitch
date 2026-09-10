import { run } from 'remix/ui'
import {
  backupChanged,
  backupClearing,
  clearLocalBackups,
} from '../stitches/public/backup-storage.ts'

// Clear private browser copies before completing a native sign-out/disconnect.
// Downloads saved by the user remain theirs; other open tabs refresh their views.
const backupChannel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('stitch-backups') : undefined
backupChannel?.addEventListener('message', (event) =>
  window.dispatchEvent(new Event(event.data === 'clearing' ? backupClearing : backupChanged)),
)
document.addEventListener(
  'submit',
  (event) => {
    const form = event.target
    if (
      !(form instanceof HTMLFormElement) ||
      !['/auth/logout', '/auth/disconnect'].includes(new URL(form.action).pathname)
    )
      return
    event.preventDefault()
    window.dispatchEvent(new Event(backupClearing))
    backupChannel?.postMessage('clearing')
    void clearLocalBackups()
      .catch(() => {})
      .finally(() => {
        backupChannel?.postMessage('cleared')
        HTMLFormElement.prototype.submit.call(form)
      })
  },
  { capture: true },
)

const app = run({
  async loadModule(moduleUrl, exportName) {
    let mod = await import(moduleUrl)
    return mod[exportName]
  },
  async resolveFrame(src, options) {
    let response = await fetch(src, {
      headers: { Accept: 'text/html' },
      method: options?.method,
      body: getRequestBody(options?.formData, options?.method, options?.encType),
      signal: options?.signal,
    })
    if (!response.ok) {
      return `<pre>Frame error: ${response.status} ${response.statusText}</pre>`
    }

    if (response.body) return response.body
    return await response.text()
  },
})

if (import.meta.hot) {
  import.meta.hot.on('server:update', async () => {
    try {
      await app.ready()
      await app.frames.top.reload()
    } catch (error) {
      console.error('Error reloading top frame on server update', error)
    }
  })
}

function getRequestBody(
  formData?: FormData,
  method?: string,
  encType?: string,
): BodyInit | undefined {
  if (!formData || method?.toLowerCase() === 'get') return
  if (encType !== 'application/x-www-form-urlencoded') return formData

  let body = new URLSearchParams()
  for (let [name, value] of formData) {
    body.append(name, typeof value === 'string' ? value : value.name)
  }
  return body
}

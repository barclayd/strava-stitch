export type PhotoList = {
  expected: number | null
  complete: boolean
  items: { key: string; source: number }[]
}
export type SavedPhoto = { key: string; source: number; blob: Blob }
export type LocalBackup = {
  id: string
  expires: number
  manifest?: PhotoList
  photos: SavedPhoto[]
  activitiesDownloaded?: boolean
  photosDownloaded?: boolean
  checked?: boolean
}
const database = 'stitch-photo-backups'
export const backupChanged = 'stitch:backup-changed'
export const backupClearing = 'stitch:backup-clearing'
export const maxLocalBytes = 64 * 1024 * 1024

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('backups', { keyPath: 'id' })
    request.onerror = () =>
      reject(new Error('Browser storage is unavailable. Keep your originals.'))
    request.onblocked = () => reject(new Error('Close other Stitch tabs and try again.'))
    request.onsuccess = () => resolve(request.result)
  })
}

// Read-modify-write in one transaction so the gallery and modal never overwrite
// one another's download state. No API URLs or credentials are stored here.
export async function localBackup(
  id: string,
  expires: number,
  change?: (value: LocalBackup) => void,
): Promise<LocalBackup> {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('backups', 'readwrite'),
        store = tx.objectStore('backups')
      let value: LocalBackup = { id, expires, photos: [] }
      let failure: unknown
      const cursor = store.openCursor()
      cursor.onsuccess = () => {
        const row = cursor.result
        if (row) {
          if (row.value.expires <= Date.now()) row.delete()
          row.continue()
        }
      }
      const request = store.get(id)
      request.onsuccess = () => {
        if (request.result?.expires > Date.now()) value = request.result
        try {
          if (change && expires > Date.now()) {
            change(value)
            store.put(value)
          }
        } catch (error) {
          failure = error
          tx.abort()
        }
      }
      tx.oncomplete = () => {
        if (change) window.dispatchEvent(new Event(backupChanged))
        resolve(value)
      }
      tx.onerror = tx.onabort = () =>
        reject(
          failure ?? new Error('Could not save the backup in this browser. Keep your originals.'),
        )
    })
  } finally {
    db.close()
  }
}

export async function clearLocalBackups() {
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('backups', 'readwrite')
      tx.objectStore('backups').clear()
      tx.oncomplete = () => resolve()
      tx.onerror = tx.onabort = () => reject(tx.error)
    })
    window.dispatchEvent(new Event(backupChanged))
  } finally {
    db.close()
  }
}

export function allPhotosSaved(value?: LocalBackup): boolean {
  const manifest = value?.manifest
  return Boolean(
    value &&
    value.expires > Date.now() &&
    manifest?.complete &&
    manifest.expected !== null &&
    manifest.items.length === manifest.expected &&
    manifest.items.every((item) =>
      value!.photos.some((p) => p.key === item.key && p.blob.size > 0),
    ),
  )
}
export function downloadsReady(value?: LocalBackup): boolean {
  return Boolean(
    value?.activitiesDownloaded &&
    allPhotosSaved(value) &&
    (value.manifest?.expected === 0 || value.photosDownloaded),
  )
}

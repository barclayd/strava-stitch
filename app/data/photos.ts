import type { Activity } from '../actions/stitches/merge.ts'
import { activity, get } from './strava.ts'

export type Photo = { key: string; source: number; url: string }
export type PhotoManifest = { expected: number | null; complete: boolean; items: Photo[] }
export const maxPhotos = 80
export const maxPhotoBytes = 10 * 1024 * 1024

export function photoCount(value: Activity): number | null {
  const counts = [value.photos?.count, value.total_photo_count].filter(
    (n): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0,
  )
  return counts.length ? Math.max(...counts) : null
}

// Only Strava's photo distribution, never a caller-provided host, redirect or token.
export function permittedPhotoUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false
  try {
    const u = new URL(value)
    return (
      u.protocol === 'https:' &&
      u.hostname === 'dgtzuqphqg23d.cloudfront.net' &&
      !u.port &&
      !u.username &&
      !u.password &&
      !u.hash &&
      !/placeholder/i.test(u.pathname) &&
      /\.(jpe?g|png|webp)$/i.test(u.pathname)
    )
  } catch {
    return false
  }
}

export async function collectPhotos(owner: number, sources: Activity[]): Promise<PhotoManifest> {
  const items: Photo[] = []
  let expected: number | null = 0,
    complete = true
  for (const source of sources) {
    let count = photoCount(source)
    const found = new Map<string, Photo>()
    try {
      const detail = await activity(owner, source.id)
      if (detail.id !== source.id || detail.athlete?.id !== owner)
        throw new Error('Ownership mismatch')
      const currentCount = photoCount(detail)
      count = currentCount === null ? count : Math.max(count ?? 0, currentCount)
      if (count !== 0) {
        // This read route is undocumented by Strava. Treat omissions as incomplete,
        // not as an empty album. Pagination and the independent count must agree.
        for (let page = 1; page <= 3; page++) {
          const result = await get<unknown>(
            owner,
            `/activities/${source.id}/photos?size=2048&photo_sources=true&per_page=30&page=${page}`,
          )
          if (!Array.isArray(result)) throw new Error('Invalid photo list')
          for (const raw of result.slice(0, maxPhotos)) {
            if (
              !raw ||
              typeof raw !== 'object' ||
              raw.activity_id !== source.id ||
              raw.video_url ||
              raw.video ||
              (raw.media_type && raw.media_type !== 'photo' && raw.media_type !== 'image')
            ) {
              complete = false
              continue
            }
            const urls =
              raw.urls && typeof raw.urls === 'object'
                ? Object.entries(raw.urls).sort(([a], [b]) => Number(b) - Number(a))
                : []
            const url = urls.map(([, url]) => url).find(permittedPhotoUrl)
            const identity = raw.unique_id ?? raw.id
            if (!url || !['string', 'number'].includes(typeof identity)) {
              complete = false
              continue
            }
            const key = Array.from(
              new Uint8Array(
                await crypto.subtle.digest(
                  'SHA-256',
                  new TextEncoder().encode(`${source.id}:${identity}`),
                ),
              ),
            )
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('')
            found.set(key, { key, source: source.id, url })
          }
          if (
            result.length < 30 ||
            (count !== null && found.size >= count) ||
            found.size >= maxPhotos
          )
            break
        }
      }
    } catch {
      complete = false
    }
    expected = count === null || expected === null ? null : expected + count
    if (count === null || found.size !== count) complete = false
    items.push(...found.values())
  }
  if (items.length > maxPhotos) complete = false
  return { expected, complete, items: items.slice(0, maxPhotos) }
}

export async function readPhoto(url: string): Promise<Response> {
  if (!permittedPhotoUrl(url)) return new Response('Photo unavailable.', { status: 404 })
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) })
    const mime = response.headers.get('content-type')?.split(';')[0]
    if (
      !response.ok ||
      !response.body ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(mime ?? '') ||
      Number(response.headers.get('content-length') ?? 0) > maxPhotoBytes
    ) {
      await response.body?.cancel()
      throw new Error('Unavailable image')
    }
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = []
    let length = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > maxPhotoBytes) {
        await reader.cancel()
        throw new Error('Image too large')
      }
      chunks.push(value)
    }
    if (!length) throw new Error('Empty image')
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    return new Response(bytes, {
      headers: { 'Content-Type': mime!, 'Cache-Control': 'private, no-store' },
    })
  } catch {
    return new Response('This photo could not be saved. Keep the original and try again.', {
      status: 502,
    })
  }
}

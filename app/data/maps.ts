import { basemapKey } from '../maps.ts'

const maximumRange = 8 * 1024 * 1024

// This endpoint serves only generic, immutable basemap bytes. It never reads a user session.
export async function serveBasemap(request: Request, bucket: R2Bucket): Promise<Response> {
  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
    'Cache-Control': 'no-store',
  })
  const error = (status: number) => new Response(null, { status, headers })
  if (!['GET', 'HEAD'].includes(request.method)) {
    headers.set('Allow', 'GET, HEAD')
    return error(405)
  }
  const match = request.headers.get('range')?.match(/^bytes=(\d+)-(\d+)$/)
  const start = Number(match?.[1]),
    end = Number(match?.[2])
  if (
    request.method === 'GET' &&
    (!match ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      end < start ||
      end - start + 1 > maximumRange)
  )
    return error(416)
  try {
    const object = await bucket.head(basemapKey)
    if (!object) return error(503)
    headers.set('ETag', object.httpEtag)
    const condition = request.headers.get('if-match')
    if (condition && condition !== '*' && condition !== object.httpEtag) return error(412)
    if (request.method === 'HEAD') {
      headers.set('Content-Length', String(object.size))
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      return new Response(null, { headers })
    }
    if (start >= object.size) {
      headers.set('Content-Range', `bytes */${object.size}`)
      return error(416)
    }
    const last = Math.min(end, object.size - 1)
    const data = await bucket.get(basemapKey, {
      range: { offset: start, length: last - start + 1 },
      onlyIf: { etagMatches: object.etag },
    })
    if (!data || !('body' in data)) return error(503)
    headers.set('Content-Range', `bytes ${start}-${last}/${object.size}`)
    headers.set('Content-Length', String(last - start + 1))
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    return new Response(data.body, { status: 206, headers })
  } catch {
    return error(503)
  }
}

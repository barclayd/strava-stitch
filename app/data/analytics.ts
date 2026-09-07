import type { AnalyticsEvent, AnalyticsPage, AnalyticsPlacement } from '../analytics.ts'
import { clientPoint } from '../analytics.ts'
import { runtime } from './runtime.ts'

export type Analytics = {
  enabled: boolean
  track(event: AnalyticsEvent, page: AnalyticsPage, placement?: AnalyticsPlacement): void
}

export function createAnalytics(
  env: Pick<Env, 'ANALYTICS_ENABLED' | 'FUNNEL'>,
  request?: Request,
): Analytics {
  const enabled =
    env.ANALYTICS_ENABLED === 'true' &&
    request?.method !== 'HEAD' &&
    request?.headers.get('DNT') !== '1' &&
    request?.headers.get('Sec-GPC') !== '1'
  return {
    enabled,
    track(event, page, placement = 'unknown') {
      if (!enabled) return
      try {
        // Cloudflare writes this in the background. Analytics must never block an activity operation.
        env.FUNNEL.writeDataPoint({
          indexes: [event],
          blobs: [event, page, placement, 'v1'],
          doubles: [1],
        })
      } catch {
        console.warn(JSON.stringify({ event: 'analytics_unavailable' }))
      }
    },
  }
}

export const track = (event: AnalyticsEvent, page: AnalyticsPage, placement?: AnalyticsPlacement) =>
  runtime().analytics.track(event, page, placement)

// A stateless endpoint: it never loads an athlete, creates a session, or accepts conversion events.
export async function receiveAnalytics(request: Request, analytics: Analytics): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
  const reply = (status: number) => new Response(null, { status, headers })
  if (request.method !== 'POST') return reply(405)
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply(403)
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    return reply(415)
  if (Number(request.headers.get('content-length') ?? 0) > 512) return reply(413)
  if (!request.body) return reply(400)
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 512) {
      await reader.cancel()
      return reply(413)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    const point = clientPoint(JSON.parse(new TextDecoder().decode(bytes)))
    if (!point) return reply(400)
    analytics.track(point.event, point.page, point.placement)
    return reply(204)
  } catch {
    return reply(400)
  }
}

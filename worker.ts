import { router } from './app/router.ts'
import { readConfig } from './app/data/config.ts'
import { withRuntime, type Runtime } from './app/data/runtime.ts'
import { persistentSessions } from './app/data/sessions.ts'
import { isPublicPath, noIndex, publicOrigin, robots, sitemap } from './app/seo.ts'
import { routes } from './app/routes.ts'
import { createAnalytics, receiveAnalytics } from './app/data/analytics.ts'
export { AthleteData, BrowserSession } from './app/cloudflare/durable-objects.ts'

export function createRuntime(env: Env, request?: Request): Runtime {
  const athlete = (owner: number) => env.ATHLETES.getByName(String(owner))
  return {
    config: readConfig(env),
    analytics: createAnalytics(env, request),
    store: {
      account: (owner) => athlete(owner).account(),
      saveAccount: (value) => athlete(value.id).saveAccount(value),
      forgetAccount: (owner) => athlete(owner).forgetAccount(),
      invalidateAccount: (owner, token) => athlete(owner).invalidateAccount(token),
      verifyDeauthorization: (owner) => athlete(owner).verifyDeauthorization(),
      newJob: (owner, merge) => athlete(owner).newJob(owner, merge),
      job: (id, owner) => athlete(owner).job(id, owner),
      jobs: (owner) => athlete(owner).jobs(owner),
      patchJob: (id, owner, patch, expectedState) =>
        athlete(owner).patchJob(id, owner, patch, expectedState),
      claimUpload: (id, owner, title, description) =>
        athlete(owner).claimUpload(id, owner, title, description),
      credentials: (owner) => athlete(owner).credentials(),
    },
    sessions: persistentSessions({
      read: (id) => env.SESSIONS.getByName(id).read(),
      save: (id, data) => env.SESSIONS.getByName(id).save(data),
      revoke: (id) => env.SESSIONS.getByName(id).revoke(),
    }),
  }
}

async function boundedRequest(request: Request): Promise<Request | undefined> {
  // Strava verification can supply an empty GET body; never reconstruct it as a body-bearing GET.
  if (['GET', 'HEAD'].includes(request.method) || !request.body) return request
  if (Number(request.headers.get('content-length') ?? 0) > 65536) return undefined
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 65536) {
      await reader.cancel()
      return undefined
    }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new Request(request, { body })
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      const url = new URL(request.url),
        runtime = createRuntime(env, request)
      if (url.origin !== runtime.config.origin) return unindexedError('Unrecognized host.', 403)
      if (url.pathname === routes.analytics.receive.href())
        return receiveAnalytics(request, runtime.analytics)
      if (['GET', 'HEAD'].includes(request.method)) {
        // Public crawl resources do not need a session, CSRF cookie, or Durable Object lookup.
        const isRobots = url.pathname === routes.crawl.robots.href()
        if (isRobots || url.pathname === routes.crawl.sitemap.href())
          return new Response(
            request.method === 'HEAD' ? null : isRobots ? robots(url.origin) : sitemap(url.origin),
            {
              headers: {
                'Content-Type': isRobots
                  ? 'text/plain; charset=utf-8'
                  : 'application/xml; charset=utf-8',
                'Cache-Control': 'public, max-age=3600',
                'X-Content-Type-Options': 'nosniff',
                'X-Robots-Tag': noIndex,
              },
            },
          )
        const normalized = url.pathname.replace(/\/+$/, '')
        if (normalized && normalized !== url.pathname && isPublicPath(normalized)) {
          url.pathname = normalized
          return new Response(null, {
            status: 308,
            headers: {
              Location: url.href,
              ...(url.origin === publicOrigin ? {} : { 'X-Robots-Tag': noIndex }),
            },
          })
        }
      }
      if (
        ['GET', 'HEAD'].includes(request.method) &&
        (url.pathname.startsWith('/client/') ||
          url.pathname.startsWith('/fonts/') ||
          url.pathname.startsWith('/images/') ||
          [
            '/styles.css',
            '/favicon.svg',
            '/favicon-96.png',
            '/apple-touch-icon.png',
            '/strava-connect.svg',
            '/strava-powered-by.svg',
          ].includes(url.pathname))
      ) {
        const asset = await env.ASSETS.fetch(request)
        const response = new Response(asset.body, asset)
        if (url.origin !== publicOrigin || response.status >= 400)
          response.headers.set('X-Robots-Tag', noIndex)
        return response
      }
      const bounded = await boundedRequest(request)
      if (!bounded) return unindexedError('Request too large.', 413)
      const response = await withRuntime(runtime, () => router.fetch(bounded))
      if (!response.headers.has('X-Robots-Tag')) response.headers.set('X-Robots-Tag', noIndex)
      return response
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'request_failed',
          type: error instanceof Error ? error.name : 'UnknownError',
        }),
      )
      return unindexedError('Something went wrong. Please refresh and try again.', 500)
    }
  },
} satisfies ExportedHandler<Env>

function unindexedError(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { 'X-Robots-Tag': noIndex, 'Cache-Control': 'private, no-store' },
  })
}

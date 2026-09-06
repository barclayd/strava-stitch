import { router } from './app/router.ts'
import { readConfig } from './app/data/config.ts'
import { withRuntime, type Runtime } from './app/data/runtime.ts'
import { persistentSessions } from './app/data/sessions.ts'
export { AthleteData, BrowserSession } from './app/cloudflare/durable-objects.ts'

export function createRuntime(env: Env): Runtime {
  const athlete = (owner: number) => env.ATHLETES.getByName(String(owner))
  return {
    config: readConfig(env),
    store: {
      account: (owner) => athlete(owner).account(),
      saveAccount: (value) => athlete(value.id).saveAccount(value),
      forgetAccount: (owner) => athlete(owner).forgetAccount(),
      invalidateAccount: (owner, token) => athlete(owner).invalidateAccount(token),
      verifyDeauthorization: (owner) => athlete(owner).verifyDeauthorization(),
      newJob: (owner, merge) => athlete(owner).newJob(owner, merge),
      job: (id, owner) => athlete(owner).job(id, owner),
      jobs: (owner) => athlete(owner).jobs(owner),
      patchJob: (id, owner, patch) => athlete(owner).patchJob(id, owner, patch),
      claimUpload: (id, owner, title) => athlete(owner).claimUpload(id, owner, title),
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
        runtime = createRuntime(env)
      if (url.origin !== runtime.config.origin)
        return new Response('Unrecognized host.', { status: 403 })
      if (
        ['GET', 'HEAD'].includes(request.method) &&
        (url.pathname.startsWith('/client/') ||
          url.pathname.startsWith('/fonts/') ||
          ['/styles.css', '/favicon.svg'].includes(url.pathname))
      )
        return env.ASSETS.fetch(request)
      const bounded = await boundedRequest(request)
      if (!bounded) return new Response('Request too large.', { status: 413 })
      return await withRuntime(runtime, () => router.fetch(bounded))
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'request_failed',
          type: error instanceof Error ? error.name : 'UnknownError',
        }),
      )
      return new Response('Something went wrong. Please refresh and try again.', { status: 500 })
    }
  },
} satisfies ExportedHandler<Env>

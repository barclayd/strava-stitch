import { createRouter, type MiddlewareContext } from 'remix/router'
import { render } from 'remix/middleware/render'
import { formData } from 'remix/middleware/form-data'
import { csrf } from 'remix/middleware/csrf'
import { getConfig } from './data/config.ts'
import { sessionMiddleware } from './middleware/session.ts'
import authController from './actions/auth/controller.ts'
import stitchesController from './actions/stitches/controller.tsx'
import webhookController from './actions/webhooks/controller.ts'

import controller from './actions/controller.tsx'
import { routes } from './routes.ts'
import { Session } from 'remix/session'
import { canIndex, indexRobots, noIndex } from './seo.ts'

const renderMiddleware = render()
const formMiddleware = formData({ maxFiles: 0, maxParts: 32, maxTotalSize: 65536 })
const csrfMiddleware = csrf({ allowMissingOrigin: false })
type AppContext = MiddlewareContext<
  [typeof sessionMiddleware, typeof formMiddleware, typeof renderMiddleware]
>

declare module 'remix/router' {
  interface RouterTypes {
    context: AppContext
  }
}

export const router = createRouter<AppContext>({
  middleware: [
    async (context, next) => {
      if (context.url.origin !== getConfig().origin)
        return new Response('Unrecognized host.', { status: 403 })
      if (Number(context.request.headers.get('content-length') ?? 0) > 65536)
        return new Response('Request too large.', { status: 413 })
      const response = await next()
      response.headers.set('Cache-Control', 'private, no-store')
      response.headers.set('Referrer-Policy', 'same-origin')
      response.headers.set('X-Content-Type-Options', 'nosniff')
      response.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors https://danbarclay.dev; base-uri 'none'; form-action 'self' https://www.strava.com",
      )
      return response
    },
    sessionMiddleware,
    async (context, next) => {
      const session = context.get(Session)
      const personalized =
        typeof session?.get('athleteId') === 'number' ||
        (context.url.pathname === '/' && !!session?.get('error'))
      const response = await next()
      response.headers.set(
        'X-Robots-Tag',
        response.status === 200 &&
          ['GET', 'HEAD'].includes(context.request.method) &&
          canIndex(context.url, personalized)
          ? indexRobots
          : noIndex,
      )
      return response
    },
    formMiddleware,
    async (context, next) =>
      context.url.pathname === routes.webhooks.receive.href()
        ? next()
        : csrfMiddleware(context, next),
    renderMiddleware,
  ],
})

router.map(routes, controller)
router.map(routes.auth, authController)
router.map(routes.stitches, stitchesController)
router.map(routes.webhooks, webhookController)

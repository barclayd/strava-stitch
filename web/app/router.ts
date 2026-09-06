import { createRouter, type MiddlewareContext } from 'remix/router'
import { render } from 'remix/middleware/render'
import { staticFiles } from 'remix/middleware/static'
import { formData } from 'remix/middleware/form-data'
import { csrf } from 'remix/middleware/csrf'
import { config } from './data/config.ts'
import { sessionMiddleware } from './middleware/session.ts'
import authController from './actions/auth/controller.ts'
import stitchesController from './actions/stitches/controller.tsx'
import webhookController from './actions/webhooks/controller.ts'

import controller from './actions/controller.tsx'
import { assets } from './assets.ts'
import { routes } from './routes.ts'

const renderMiddleware = render({ assets })
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
      if (context.url.origin !== config.origin)
        return new Response('Unrecognized host.', { status: 403 })
      if (Number(context.request.headers.get('content-length') ?? 0) > 65536)
        return new Response('Request too large.', { status: 413 })
      const response = await next()
      response.headers.set('Cache-Control', 'private, no-store')
      response.headers.set('Referrer-Policy', 'same-origin')
      response.headers.set('X-Content-Type-Options', 'nosniff')
      response.headers.set('X-Frame-Options', 'DENY')
      response.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://www.strava.com",
      )
      return response
    },
    staticFiles('./public', { index: false }),
    sessionMiddleware,
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

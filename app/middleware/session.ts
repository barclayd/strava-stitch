import { createCookie } from 'remix/cookie'
import { session } from 'remix/middleware/session'
import { runtime } from '../data/runtime.ts'

// Construct the middleware per request so bindings and secrets never leak between requests.
export const sessionMiddleware: ReturnType<typeof session> = (context, next) => {
  const { config, sessions } = runtime()
  return session(
    createCookie('stitch_session', {
      secrets: [config.sessionSecret],
      httpOnly: true,
      sameSite: 'Lax',
      secure: config.origin.startsWith('https:'),
      maxAge: 604800,
      path: '/',
    }),
    sessions,
  )(context, next)
}

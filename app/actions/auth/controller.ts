import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createController } from 'remix/router'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import { routes } from '../../routes.ts'
import { getConfig } from '../../data/config.ts'
import { exchange, SCOPES } from '../../data/strava.ts'
import { saveAccount, forgetAccount } from '../../data/store.ts'
import { placement, type AnalyticsPlacement } from '../../analytics.ts'
import { track } from '../../data/analytics.ts'
import { connectionFailureReason, type ConnectionStage } from './connection-failure.ts'

export default createController(routes.auth, {
  actions: {
    connect({ get }) {
      const session = get(Session),
        state = Buffer.from(randomBytes(32)).toString('hex'),
        source = placement(get(FormData).get('source'))
      session.set('oauth', { state, expires: Date.now() + 600000, source })
      track('strava_connect_started', 'home', source)
      const params = new URLSearchParams({
        client_id: getConfig().clientId,
        redirect_uri: getConfig().origin + routes.auth.callback.href(),
        response_type: 'code',
        approval_prompt: 'force',
        scope: SCOPES.join(','),
        state,
      })
      return redirect('https://www.strava.com/oauth/authorize?' + params, 303)
    },
    async callback({ get, url }) {
      const session = get(Session)
      const pending = session.get('oauth') as
        { state: string; expires: number; source?: AnalyticsPlacement } | undefined
      session.unset('oauth')
      const state = url.searchParams.get('state') ?? ''
      if (
        !pending ||
        pending.expires < Date.now() ||
        !/^[a-f0-9]{64}$/.test(state) ||
        state.length !== pending.state.length ||
        !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))
      )
        return new Response('This connection request expired. Return to Stitch and try again.', {
          status: 400,
        })
      if (url.searchParams.has('error')) {
        track('strava_connect_cancelled', 'home', pending.source)
        session.flash('error', 'Connection cancelled. You can still explore the example.')
        return redirect(routes.home.href(), 303)
      }
      const code = url.searchParams.get('code')
      if (!code) {
        track('strava_connect_failed', 'home', pending.source, 'missing_code')
        return new Response('Missing authorization code.', { status: 400 })
      }
      let stage: ConnectionStage = 'token_exchange_failed'
      try {
        const data = await exchange({ grant_type: 'authorization_code', code })
        stage = 'invalid_athlete'
        const scope = String(data.scope ?? url.searchParams.get('scope') ?? '')
          .split(/[ ,]+/)
          .filter(Boolean)
        if (!data.athlete || !Number.isSafeInteger(data.athlete.id))
          throw new Error('Strava did not return an athlete account.')
        stage = 'missing_activity_permission'
        if (!scope.includes('activity:read_all'))
          throw new Error(
            'Allow access to your activities, including Only You activities, to use Stitch.',
          )
        stage = 'save_failed'
        await saveAccount({
          id: data.athlete.id,
          firstname: String(data.athlete.firstname ?? 'Athlete'),
          scope,
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
        })
        stage = 'session_failed'
        session.regenerateId(true)
        session.set('athleteId', data.athlete.id)
        track('strava_connected', 'workspace', pending.source)
        return redirect(routes.home.href(), 303)
      } catch (error) {
        track(
          'strava_connect_failed',
          'home',
          pending.source,
          connectionFailureReason(error, stage),
        )
        session.flash(
          'error',
          error instanceof Error ? error.message : 'Could not connect to Strava.',
        )
        return redirect(routes.home.href(), 303)
      }
    },
    logout({ get }) {
      get(Session).destroy()
      return redirect(routes.home.href(), 303)
    },
    async disconnect({ get }) {
      const session = get(Session),
        id = session.get('athleteId')
      if (typeof id === 'number') await forgetAccount(id)
      session.unset('athleteId')
      session.unset('oauth')
      session.regenerateId(true)
      session.flash(
        'error',
        'Your data has been removed from Stitch. You can also revoke access in Strava → Settings → My Apps.',
      )
      return redirect(routes.home.href(), 303)
    },
  },
})

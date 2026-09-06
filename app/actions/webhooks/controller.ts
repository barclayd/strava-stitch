import { createController } from 'remix/router'
import { routes } from '../../routes.ts'
import { config } from '../../data/config.ts'
import { forgetAccount } from '../../data/store.ts'

export default createController(routes.webhooks, {
  actions: {
    verify({ url }) {
      if (
        !config.webhookToken ||
        url.searchParams.get('hub.verify_token') !== config.webhookToken ||
        url.searchParams.get('hub.mode') !== 'subscribe'
      )
        return new Response('Not found', { status: 404 })
      return Response.json({ 'hub.challenge': url.searchParams.get('hub.challenge') })
    },
    async receive({ request }) {
      if (!config.webhookSubscription)
        return new Response('Webhook is not configured.', { status: 503 })
      let event
      try {
        event = await request.json()
      } catch {
        return new Response('Invalid JSON', { status: 400 })
      }
      if (
        !event ||
        String(event.subscription_id) !== config.webhookSubscription ||
        !Number.isSafeInteger(event.owner_id)
      )
        return new Response('Invalid subscription', { status: 403 })
      if (
        event.object_type === 'athlete' &&
        event.aspect_type === 'update' &&
        event.updates?.authorized === 'false'
      )
        forgetAccount(event.owner_id)
      return new Response(null, { status: 200 })
    },
  },
})

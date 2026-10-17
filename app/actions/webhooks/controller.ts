import { createController } from 'remix/router'
import { routes } from '../../routes.ts'
import { getConfig } from '../../data/config.ts'
import { runtime } from '../../data/runtime.ts'
import { rideOnEvent } from '../../data/ride-on-events.ts'

export default createController(routes.webhooks, {
  actions: {
    verify({ url }) {
      if (
        !getConfig().webhookToken ||
        url.searchParams.get('hub.verify_token') !== getConfig().webhookToken ||
        url.searchParams.get('hub.mode') !== 'subscribe'
      )
        return new Response('Not found', { status: 404 })
      return Response.json({ 'hub.challenge': url.searchParams.get('hub.challenge') })
    },
    receive({ request }) {
      return receiveStravaWebhook(request)
    },
  },
})

export async function receiveStravaWebhook(request: Request) {
  if (!getConfig().webhookSubscription)
    return new Response('Webhook is not configured.', { status: 503 })
  let event: {
    subscription_id?: number
    owner_id?: number
    object_id?: number
    event_time?: number
    object_type?: string
    aspect_type?: string
    updates?: { authorized?: string }
  } | null
  try {
    event = (await request.json()) as typeof event
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }
  if (
    !event ||
    String(event.subscription_id) !== getConfig().webhookSubscription ||
    typeof event.owner_id !== 'number' ||
    !Number.isSafeInteger(event.owner_id) ||
    event.owner_id <= 0
  )
    return new Response('Invalid subscription', { status: 403 })
  // Delivery is durable before acknowledgement. The consumer verifies the
  // resource with Strava; unsigned webhook bodies are only refresh hints.
  const forwarded = rideOnEvent(event)
  if (forwarded && runtime().publishRideOnEvent) {
    try {
      await runtime().publishRideOnEvent?.(forwarded)
    } catch {
      return new Response('Please retry this notification.', { status: 503 })
    }
  }
  if (
    event.object_type === 'athlete' &&
    event.aspect_type === 'update' &&
    event.updates?.authorized === 'false'
  )
    try {
      await runtime().store.verifyDeauthorization(event.owner_id)
    } catch {
      return new Response('Please retry this notification.', { status: 503 })
    }
  return new Response(null, { status: 200 })
}

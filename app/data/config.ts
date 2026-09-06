import { runtime } from './runtime.ts'

export type AppConfig = {
  origin: string
  clientId: string
  clientSecret: string
  sessionSecret: string
  encryptionKey: Buffer
  webhookToken: string
  webhookSubscription: string
}
export function readConfig(env: {
  APP_ORIGIN: string
  STRAVA_CLIENT_ID: string
  STRAVA_CLIENT_SECRET: string
  SESSION_SECRET: string
  TOKEN_ENCRYPTION_KEY: string
  STRAVA_WEBHOOK_VERIFY_TOKEN: string
  STRAVA_WEBHOOK_SUBSCRIPTION_ID: string
}): AppConfig {
  for (const key of [
    'APP_ORIGIN',
    'STRAVA_CLIENT_ID',
    'STRAVA_CLIENT_SECRET',
    'SESSION_SECRET',
    'TOKEN_ENCRYPTION_KEY',
  ] as const)
    if (!env[key]) throw new Error('Missing Worker configuration: ' + key)
  const config = {
    origin: env.APP_ORIGIN,
    clientId: env.STRAVA_CLIENT_ID,
    clientSecret: env.STRAVA_CLIENT_SECRET,
    sessionSecret: env.SESSION_SECRET,
    encryptionKey: Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'base64'),
    webhookToken: env.STRAVA_WEBHOOK_VERIFY_TOKEN,
    webhookSubscription: env.STRAVA_WEBHOOK_SUBSCRIPTION_ID,
  }
  const origin = new URL(config.origin)
  if (
    origin.origin !== config.origin ||
    (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname))
  )
    throw new Error('Use an HTTPS origin, or localhost for development.')
  if (config.encryptionKey.length !== 32 || config.sessionSecret.length < 32)
    throw new Error('Use strong, separate encryption and session keys.')
  return config
}
export const getConfig = () => runtime().config

import { loadEnvFile } from 'node:process'
import { existsSync } from 'node:fs'

if (process.env.NODE_ENV !== 'test' && existsSync('.env.local')) loadEnvFile('.env.local')
function required(key: string) {
  const value = process.env[key]
  if (!value) throw new Error(`${key} is required. See .env.example.`)
  return value
}
export const config = {
  origin: required('APP_ORIGIN'),
  clientId: required('STRAVA_CLIENT_ID'),
  clientSecret: required('STRAVA_CLIENT_SECRET'),
  sessionSecret: required('SESSION_SECRET'),
  encryptionKey: Buffer.from(required('TOKEN_ENCRYPTION_KEY'), 'base64'),
  database: process.env.DATABASE_PATH ?? './db/stitch.sqlite',
  webhookToken: process.env.STRAVA_WEBHOOK_VERIFY_TOKEN,
  webhookSubscription: process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID,
}
if (config.encryptionKey.length !== 32 || config.sessionSecret.length < 32)
  throw new Error('Use strong, separate encryption and session keys.')
const origin = new URL(config.origin)
if (
  origin.origin !== config.origin ||
  (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')
)
  throw new Error('APP_ORIGIN must be an origin, with HTTPS in production.')

import type { AnalyticsDevice } from '../analytics.ts'

// A best-effort category for this request, never a device identifier. Headers are not retained.
export function analyticsDevice(headers?: Headers): AnalyticsDevice {
  const agent = headers?.get('User-Agent') ?? ''
  if (/bot\b|spider|crawler|HeadlessChrome|^curl\/|^Wget\//i.test(agent)) return 'unknown'
  // iPads also say Mobile; Android tablets commonly send Sec-CH-UA-Mobile: ?0.
  if (/iPad|Tablet|PlayBook|Kindle|Silk\//i.test(agent)) return 'tablet'
  if (headers?.get('Sec-CH-UA-Mobile') === '?1') return 'mobile'
  if (/Mobi|iPhone|iPod|Windows Phone/i.test(agent)) return 'mobile'
  if (/Android/i.test(agent)) {
    if (/TV|\bAFT\w*\b/i.test(agent)) return 'unknown'
    return /AppleWebKit|Firefox\//i.test(agent) ? 'tablet' : 'unknown'
  }
  // A negative mobile hint alone does not distinguish a desktop from a tablet or other device.
  if (/Windows NT|Macintosh|X11|CrOS/i.test(agent) && /AppleWebKit|Firefox\//i.test(agent))
    return 'desktop'
  return 'unknown'
}

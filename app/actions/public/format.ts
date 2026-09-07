export type Track = { id: number; name: string; coordinates: [number, number][] }
export type ActivitySummary = {
  id: number
  name: string
  start: string
  distance: number
  moving: number
  elevation: number
  sport: string
  unavailable?: string
  coordinates: [number, number][]
}
export const colours = [
  '#345e51',
  '#e18c52',
  '#776596',
  '#4b7e96',
  '#9a7439',
  '#9a596c',
  '#55758a',
  '#888b41',
]
// Matching hues with enough contrast for small labels and white numbered badges.
export const labelColours = [
  '#345e51',
  '#a25726',
  '#776596',
  '#376680',
  '#805d2b',
  '#9a596c',
  '#55758a',
  '#666a2c',
]
export function duration(seconds: number) {
  const n = Math.round(seconds)
  return `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
}
export const km = (metres: number) =>
  (metres / 1000).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
export const day = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(iso))
export const time = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(
    new Date(iso),
  )
export function decodePolyline(encoded: string): [number, number][] {
  let index = 0,
    lat = 0,
    lon = 0
  const points: [number, number][] = []
  while (index < encoded.length && points.length < 10000) {
    const pair = []
    for (let k = 0; k < 2; k++) {
      let b = 0,
        shift = 0,
        result = 0
      do {
        if (index >= encoded.length || shift > 30) return []
        b = encoded.charCodeAt(index++) - 63
        if (b < 0 || b > 63) return []
        result |= (b & 31) << shift
        shift += 5
      } while (b >= 32)
      pair.push(result & 1 ? ~(result >> 1) : result >> 1)
    }
    lat += pair[0]
    lon += pair[1]
    points.push([lat / 1e5, lon / 1e5])
  }
  return points
}

import type { Track } from './actions/public/format.ts'
import { colours } from './actions/public/format.ts'
import type { FeatureCollection, LineString, Point } from 'geojson'

export const basemapPath = '/maps/world-20260908.pmtiles'
export const basemapKey = 'world-20260908.pmtiles'

// GeoJSON stays in the browser. Include only display colours, never activity identifiers or names.
export function routeGeometry(tracks: Track[]) {
  const lines: FeatureCollection<LineString, { colour: string }> = {
    type: 'FeatureCollection',
    features: [],
  }
  const markers: FeatureCollection<Point, { colour: string; end: boolean }> = {
    type: 'FeatureCollection',
    features: [],
  }
  const positions: [number, number][] = []
  let anchor: number | undefined
  tracks.forEach((track, index) => {
    if (track.coordinates.length < 2) return
    if (track.coordinates.some((p) => p.some((n) => !Number.isFinite(n)))) return
    const coordinates = track.coordinates.map(([lat, lon]): [number, number] => {
      anchor ??= lon
      // Keep a route crossing the date line together instead of fitting almost the whole world.
      const longitude = lon + Math.round((anchor - lon) / 360) * 360
      return [longitude, Math.max(-85.0511287, Math.min(85.0511287, lat))]
    })
    if (coordinates.some((p) => p.some((n) => !Number.isFinite(n)))) return
    const colour = colours[index % colours.length]
    positions.push(...coordinates)
    lines.features.push({
      type: 'Feature',
      properties: { colour },
      geometry: { type: 'LineString', coordinates },
    })
    for (const [coordinate, end] of [
      [coordinates[0], false],
      [coordinates.at(-1)!, true],
    ] as const)
      markers.features.push({
        type: 'Feature',
        properties: { colour, end },
        geometry: { type: 'Point', coordinates: coordinate },
      })
  })
  let bounds: [[number, number], [number, number]] | undefined
  for (const [lon, lat] of positions) {
    bounds ??= [
      [lon, lat],
      [lon, lat],
    ]
    bounds[0][0] = Math.min(bounds[0][0], lon)
    bounds[0][1] = Math.min(bounds[0][1], lat)
    bounds[1][0] = Math.max(bounds[1][0], lon)
    bounds[1][1] = Math.max(bounds[1][1], lat)
  }
  return { lines, markers, bounds }
}

import { Map, addProtocol, setWorkerUrl, setWorkerCount, type GeoJSONSource } from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import type { Track } from '../../actions/public/format.ts'
import { routeGeometry } from '../../maps.ts'
import { mapStyle } from './map-style.ts'

// This module is loaded only in a visible map's browser context.
setWorkerUrl('/client/maplibre-worker.js')
setWorkerCount(1)
addProtocol('pmtiles', new Protocol().tile)

export function createBasemap(
  container: HTMLElement,
  tracks: Track[],
  ready: () => void,
  failed: () => void,
) {
  let geometry = routeGeometry(tracks),
    stopped = false,
    loaded = false
  if (!geometry.bounds) throw new Error('No route')
  const style = mapStyle(location.origin)
  style.sources.routes = { type: 'geojson', data: geometry.lines }
  style.sources.endpoints = { type: 'geojson', data: geometry.markers }
  style.layers.push(
    {
      id: 'route-outline',
      type: 'line',
      source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 8 },
    },
    {
      id: 'route-line',
      type: 'line',
      source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'colour'], 'line-width': 4 },
    },
    {
      id: 'route-endpoints',
      type: 'circle',
      source: 'endpoints',
      paint: {
        'circle-radius': ['case', ['get', 'end'], 4, 6],
        'circle-color': ['case', ['get', 'end'], '#ffffff', ['get', 'colour']],
        'circle-stroke-color': ['case', ['get', 'end'], ['get', 'colour'], '#ffffff'],
        'circle-stroke-width': 2.5,
      },
    },
  )
  const map = new Map({
    container,
    style,
    bounds: geometry.bounds,
    fitBoundsOptions: { padding: 55, maxZoom: 15 },
    maxZoom: 18,
    minZoom: 1,
    pitchWithRotate: false,
    dragRotate: false,
    scrollZoom: false,
    cooperativeGestures: true,
    attributionControl: false,
    renderWorldCopies: true,
    transformRequest: (url) => ({ url, credentials: 'same-origin', referrerPolicy: 'no-referrer' }),
  })
  map.touchZoomRotate.disableRotation()
  map
    .getCanvas()
    .setAttribute(
      'aria-label',
      'Activity routes on a street map. Each colour is a separate recording; gaps are not connected.',
    )
  const stop = () => {
    if (stopped) return
    stopped = true
    clearTimeout(timeout)
    map.remove()
  }
  const failure = () => {
    if (stopped) return
    stop()
    failed()
  }
  const timeout = setTimeout(failure, 15000)
  map.on('error', failure)
  map.on('webglcontextlost', failure)
  const reset = () => {
    if (!stopped && geometry.bounds)
      map.fitBounds(geometry.bounds, { padding: 55, maxZoom: 15, duration: 0 })
  }
  const update = () => {
    if (stopped || !loaded) return
    const routes = map.getSource('routes') as GeoJSONSource
    const endpoints = map.getSource('endpoints') as GeoJSONSource
    routes.setData(geometry.lines)
    endpoints.setData(geometry.markers)
    reset()
  }
  map.once('load', () => {
    if (stopped) return
    loaded = true
    clearTimeout(timeout)
    update()
    ready()
  })
  return {
    update(next: Track[]) {
      if (stopped) return
      geometry = routeGeometry(next)
      update()
    },
    zoom(direction: number) {
      if (!stopped)
        map.zoomTo(map.getZoom() + direction, {
          duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180,
        })
    },
    resize() {
      if (!stopped) map.resize()
    },
    reset,
    destroy: stop,
  }
}

export type Basemap = ReturnType<typeof createBasemap>

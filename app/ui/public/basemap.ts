import { Map, addProtocol, setWorkerUrl, setWorkerCount, type GeoJSONSource } from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import type { Track } from '../../actions/public/format.ts'
import { routeGeometry } from '../../maps.ts'
import { mapStyle } from './map-style.ts'

// This module is loaded only in a visible map's browser context.
setWorkerUrl('/client/maplibre-worker.js')
setWorkerCount(1)
addProtocol('pmtiles', new Protocol().tile)
export interface Basemap {
  update(tracks: Track[]): void
  zoom(direction: number): void
  resize(): void
  reset(): void
  destroy(): void
}
type Owner = { ready(): void; failed(): void }
const activeMaps = new WeakMap<HTMLElement, { acquire(owner: Owner): Basemap }>()

export function createBasemap(
  container: HTMLElement,
  tracks: Track[],
  ready: () => void,
  failed: () => void,
): Basemap {
  // Nested client entries can adopt the same preserved host during hydration.
  // Their leases share one renderer so every owner's controls update the visible map.
  const existing = activeMaps.get(container)
  if (existing) {
    const lease = existing.acquire({ ready, failed })
    lease.update(tracks)
    return lease
  }
  const owners = new Set<Owner>()
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
  map.keyboard.disableRotation()
  map
    .getCanvas()
    .setAttribute(
      'aria-label',
      'Activity routes on a street map. Each colour is a separate recording; gaps are not connected.',
    )
  // Frame navigation may remove a preserved subtree without a component ref callback.
  const removal = new MutationObserver(() => {
    if (!container.isConnected) stop()
  })
  const stop = () => {
    if (stopped) return
    stopped = true
    clearTimeout(timeout)
    removal.disconnect()
    map.remove()
    activeMaps.delete(container)
  }
  const failure = () => {
    if (stopped) return
    stop()
    for (const owner of owners) owner.failed()
  }
  const timeout = setTimeout(failure, 15000)
  removal.observe(document, { childList: true, subtree: true })
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
    for (const owner of owners) owner.ready()
  })
  const controller = {
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
  }
  const acquire = (owner: Owner): Basemap => {
    owners.add(owner)
    if (loaded)
      queueMicrotask(() => {
        if (!stopped && owners.has(owner)) owner.ready()
      })
    return {
      ...controller,
      destroy() {
        owners.delete(owner)
        if (!owners.size || !container.isConnected) stop()
      },
    }
  }
  activeMaps.set(container, { acquire })
  return acquire({ ready, failed })
}

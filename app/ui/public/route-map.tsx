import { clientEntry, on, type Handle } from 'remix/ui'
import { colours, type Track } from '../../actions/public/format.ts'

export const RouteMap = clientEntry(
  import.meta.url,
  function RouteMap(handle: Handle<{ tracks: Track[]; compact?: boolean }>) {
    let view = [0, 0, 900, 600],
      drag: { x: number; y: number; v: number[] } | undefined
    function zoom(k: number) {
      const w = view[2] * k,
        h = view[3] * k
      if (w < 80 || w > 3600) return
      view = [view[0] + (view[2] - w) / 2, view[1] + (view[3] - h) / 2, w, h]
      handle.update()
    }
    return () => {
      const tracks = handle.props.tracks.filter((t) => t.coordinates.length > 1)
      const points = tracks.flatMap((t) => t.coordinates)
      const mercator = ([lat, lon]: [number, number]) => [
        (lon * Math.PI) / 180,
        Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)),
      ]
      const coords = points.map(mercator)
      const minX = Math.min(...coords.map((c) => c[0])),
        maxX = Math.max(...coords.map((c) => c[0])),
        minY = Math.min(...coords.map((c) => c[1])),
        maxY = Math.max(...coords.map((c) => c[1]))
      const scale = Math.min(650 / Math.max(maxX - minX, 1e-9), 430 / Math.max(maxY - minY, 1e-9))
      const xy = (p: [number, number]) => {
        const [x, y] = mercator(p)
        return [
          (900 - (maxX - minX) * scale) / 2 + (x - minX) * scale,
          (600 - (maxY - minY) * scale) / 2 + (maxY - y) * scale,
        ]
      }
      return (
        <div class={'route-map' + (handle.props.compact ? ' compact' : '')}>
          <div class="map-label">
            <span class="live-dot"></span> Route preview
          </div>
          <div class="north" aria-hidden="true">
            N<span>↑</span>
          </div>
          {points.length > 1 ? (
            <svg
              viewBox={view.join(' ')}
              role="img"
              aria-label="Selected route activities; each colour is a separate activity. Gaps are not connected."
              mix={[
                on('pointerdown', (e) => {
                  if (drag || !e.isPrimary) return
                  drag = { x: e.clientX, y: e.clientY, v: [...view] }
                  e.currentTarget.setPointerCapture(e.pointerId)
                }),
                on('pointermove', (e) => {
                  if (!drag) return
                  const r = e.currentTarget.getBoundingClientRect(),
                    s = Math.max(drag.v[2] / r.width, drag.v[3] / r.height)
                  view = [
                    drag.v[0] - (e.clientX - drag.x) * s,
                    drag.v[1] - (e.clientY - drag.y) * s,
                    drag.v[2],
                    drag.v[3],
                  ]
                  handle.update()
                }),
                on('pointerup', () => {
                  drag = undefined
                }),
                on('pointercancel', () => {
                  drag = undefined
                }),
              ]}
            >
              {tracks.map((t, i) => (
                <g key={t.id}>
                  <polyline
                    points={t.coordinates.map((p) => xy(p).join(',')).join(' ')}
                    fill="none"
                    stroke="white"
                    stroke-width="9"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    vector-effect="non-scaling-stroke"
                  />
                  <polyline
                    points={t.coordinates.map((p) => xy(p).join(',')).join(' ')}
                    fill="none"
                    stroke={colours[i % colours.length]}
                    stroke-width="4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    vector-effect="non-scaling-stroke"
                  />
                  <circle
                    cx={xy(t.coordinates[0])[0]}
                    cy={xy(t.coordinates[0])[1]}
                    r="8"
                    fill={colours[i % colours.length]}
                    stroke="white"
                    stroke-width="3"
                  />
                  <circle
                    cx={xy(t.coordinates.at(-1)!)[0]}
                    cy={xy(t.coordinates.at(-1)!)[1]}
                    r="6"
                    fill="white"
                    stroke={colours[i % colours.length]}
                    stroke-width="3"
                  />
                </g>
              ))}
            </svg>
          ) : (
            <div class="map-empty">
              <span class="empty-mark">↗</span>
              <h3>Your ride takes shape here.</h3>
              <p>Select activities to see their routes together.</p>
            </div>
          )}
          <span class="map-caption">Original paths. Room between the parts.</span>
          <div class="map-tools">
            <button type="button" aria-label="Zoom in" mix={on('click', () => zoom(0.75))}>
              +
            </button>
            <button type="button" aria-label="Zoom out" mix={on('click', () => zoom(1 / 0.75))}>
              −
            </button>
            <button
              type="button"
              aria-label="Reset map"
              mix={on('click', () => {
                view = [0, 0, 900, 600]
                handle.update()
              })}
            >
              ↺
            </button>
          </div>
        </div>
      )
    }
  },
)

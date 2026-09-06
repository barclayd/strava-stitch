import { clientEntry, on, type Handle } from 'remix/ui'
import { routes } from '../../routes.ts'
import { RouteMap } from '../../ui/public/route-map.tsx'
import { colours, duration, km, day, time, type Ride } from './format.ts'

export const Workspace = clientEntry(
  import.meta.url,
  function Workspace(
    handle: Handle<{
      rides: Ride[]
      csrf: string
      connected: boolean
      page: number
      hasMore: boolean
    }>,
  ) {
    let selected = new Set<number>(),
      query = '',
      pending = false,
      selectionError = ''
    if (!handle.props.connected) selected = new Set(handle.props.rides.slice(0, 2).map((r) => r.id))
    function toggle(id: number) {
      if (selected.has(id)) selected.delete(id)
      else if (selected.size < 8) selected.add(id)
      else selectionError = 'Choose up to eight activities at a time.'
      if (selected.size < 8) selectionError = ''
      handle.update()
    }
    return () => {
      const { rides, csrf, connected, page, hasMore } = handle.props
      const chosen = rides
        .filter((r) => selected.has(r.id))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      const visible = rides.filter((r) =>
        (r.name + ' ' + day(r.start)).toLowerCase().includes(query.toLowerCase()),
      )
      const metres = chosen.reduce((n, r) => n + r.distance, 0),
        moving = chosen.reduce((n, r) => n + r.moving, 0)
      return (
        <div class="workspace">
          <section class="activities" aria-labelledby="activities-title">
            <div class="panel-heading">
              <h2 id="activities-title">
                {connected ? 'Your activities' : 'Try it with a sample ride'}
              </h2>
              <span class="count-badge">{rides.length}</span>
            </div>
            <p class="panel-description">Choose the parts of one ride. We’ll put them in order.</p>
            {connected ? (
              <label class="search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  placeholder="Find an activity…"
                  aria-label="Search activities on this page"
                  value={query}
                  mix={on('input', (e) => {
                    query = e.currentTarget.value
                    handle.update()
                  })}
                />
              </label>
            ) : (
              <div class="demo-note">
                EXAMPLE ACTIVITIES <span>Peak District, UK</span>
              </div>
            )}
            <form
              data-rmx-document
              action={routes.stitches.create.href()}
              method="post"
              mix={on('submit', () => {
                pending = true
                handle.update()
              })}
            >
              <input type="hidden" name="_csrf" value={csrf} />
              {chosen.map((r) => (
                <input key={r.id} type="hidden" name="activities" value={r.id} />
              ))}
              <div class="ride-list">
                {visible.map((r) => {
                  const index = chosen.findIndex((c) => c.id === r.id),
                    active = index >= 0
                  return (
                    <label class={'ride-row' + (active ? ' selected' : '')} key={r.id}>
                      <input
                        type="checkbox"
                        checked={active}
                        aria-label={'Select ' + r.name}
                        mix={on('change', () => toggle(r.id))}
                      />
                      <span class="selection-box" aria-hidden="true">
                        {active ? '✓' : ''}
                      </span>
                      <div class="ride-content">
                        <div class="ride-topline">
                          <span>
                            {day(r.start)} · {time(r.start)}
                          </span>
                          <span
                            class="ride-order"
                            style={active ? { color: colours[index] } : undefined}
                          >
                            {active ? 'PART ' + (index + 1) : 'RIDE'}
                          </span>
                        </div>
                        <h3>{r.name}</h3>
                        <p>
                          <span>
                            {km(r.distance)} <small>km</small>
                          </span>
                          <span>{duration(r.moving)}</span>
                          <span>
                            {Math.round(r.elevation)} <small>m ↗</small>
                          </span>
                        </p>
                      </div>
                    </label>
                  )
                })}
                {!visible.length && (
                  <div class="list-empty">
                    <h3>{rides.length ? 'No matching activities' : 'No rides here yet'}</h3>
                    <p>
                      {rides.length
                        ? 'Try a different name or date.'
                        : 'Try another page or record an outdoor ride in Strava.'}
                    </p>
                  </div>
                )}
              </div>
              {connected && (page > 1 || hasMore) && (
                <div class="pagination">
                  {page > 1 ? (
                    <a href={routes.home.href() + '?page=' + (page - 1)}>← Newer</a>
                  ) : (
                    <span />
                  )}
                  <span>Page {page}</span>
                  {hasMore ? (
                    <a href={routes.home.href() + '?page=' + (page + 1)}>Older →</a>
                  ) : (
                    <span />
                  )}
                </div>
              )}
              <div class="selection-footer">
                <span class="selected-caption" aria-live="polite">
                  {selected.size} {selected.size === 1 ? 'activity' : 'activities'} selected
                </span>
                {selectionError && <p role="alert">{selectionError}</p>}
                {connected ? (
                  <button
                    class="button button-dark wide"
                    type="submit"
                    disabled={selected.size < 2 || pending}
                  >
                    {pending ? (
                      <>
                        <span class="spinner" /> Reading your activities…
                      </>
                    ) : (
                      <>
                        Preview stitched ride <span>→</span>
                      </>
                    )}
                  </button>
                ) : (
                  <a
                    class={'button button-dark wide' + (selected.size < 2 ? ' disabled' : '')}
                    href={selected.size >= 2 ? routes.demo.href() : undefined}
                    aria-disabled={selected.size < 2}
                  >
                    Preview this example <span>→</span>
                  </a>
                )}
              </div>
            </form>
          </section>
          <section class="visual-panel" aria-label="Your selected ride">
            <RouteMap
              tracks={chosen.map((r) => ({ id: r.id, name: r.name, coordinates: r.coordinates }))}
            />
            <div class="route-summary">
              <div class="summary-title">
                <span class="overline">THE RIDE, TOGETHER</span>
                <h3>
                  {chosen.length
                    ? `${chosen.length} ${chosen.length === 1 ? 'part' : 'parts'}. One story.`
                    : 'Every part belongs.'}
                </h3>
              </div>
              <div class="summary-number">
                <strong>
                  {km(metres)}
                  <small> km</small>
                </strong>
                <span>Combined distance</span>
              </div>
              <div class="summary-number">
                <strong>{duration(moving)}</strong>
                <span>Moving time</span>
              </div>
            </div>
            <div class="route-legend">
              {chosen.map((r, i) => (
                <span key={r.id}>
                  <i style={{ background: colours[i] }} />
                  Part {i + 1}
                </span>
              ))}
              <span class="legend-note">
                {connected
                  ? 'Preview uses Strava’s route summaries.'
                  : 'Illustrative sample · no account needed'}
              </span>
            </div>
          </section>
        </div>
      )
    }
  },
)

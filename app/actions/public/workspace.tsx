import { clientEntry, on, type Handle } from 'remix/ui'
import { routes } from '../../routes.ts'
import { RouteMap } from '../../ui/public/route-map.tsx'
import { colours, labelColours, duration, km, day, time, type ActivitySummary } from './format.ts'
import { sportLabel } from '../../data/sports.ts'

export const Workspace = clientEntry(
  '/client/workspace.js#Workspace',
  function Workspace(
    handle: Handle<{
      activities: ActivitySummary[]
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
    if (!handle.props.connected)
      selected = new Set(handle.props.activities.slice(0, 2).map((r) => r.id))
    function toggle(id: number) {
      const activity = handle.props.activities.find((r) => r.id === id),
        first = handle.props.activities.find((r) => selected.has(r.id))
      selectionError = ''
      if (selected.has(id)) selected.delete(id)
      else if (!activity || activity.unavailable)
        selectionError = activity?.unavailable ?? 'Activity unavailable.'
      else if (first && first.sport !== activity.sport)
        selectionError = `Choose ${sportLabel(first.sport)} activities for this stitch, or deselect them to start another sport.`
      else if (selected.size < 8) selected.add(id)
      else selectionError = 'Choose up to eight activities at a time.'
      handle.update()
    }
    return () => {
      const { activities, csrf, connected, page, hasMore } = handle.props
      const chosen = activities
        .filter((r) => selected.has(r.id))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      const visible = activities.filter((r) =>
        (r.name + ' ' + day(r.start) + ' ' + sportLabel(r.sport))
          .toLowerCase()
          .includes(query.toLowerCase()),
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
              <span class="count-badge">{activities.length}</span>
            </div>
            <p class="panel-description">
              Choose two to eight activities of the same sport. We’ll put them in order.
            </p>
            {connected ? (
              <label class="search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  placeholder="Search by name, date, or sport…"
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
                    active = index >= 0,
                    unavailable =
                      r.unavailable ??
                      (chosen.length && chosen[0].sport !== r.sport
                        ? `Choose ${sportLabel(chosen[0].sport)} activities, or clear your selection to switch sport.`
                        : undefined)
                  return (
                    <label
                      class={
                        'ride-row' +
                        (active ? ' selected' : '') +
                        (unavailable ? ' unavailable' : '')
                      }
                      key={r.id}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        disabled={!!unavailable}
                        aria-describedby={unavailable ? `activity-${r.id}-reason` : undefined}
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
                            style={active ? { color: labelColours[index] } : undefined}
                          >
                            {active ? 'PART ' + (index + 1) : sportLabel(r.sport)}
                          </span>
                        </div>
                        <h3>{r.name}</h3>
                        {active && <span class="activity-sport">{sportLabel(r.sport)}</span>}
                        <p>
                          <span>
                            {km(r.distance)} <small>km</small>
                          </span>
                          <span>{duration(r.moving)}</span>
                          <span>
                            {Math.round(r.elevation)} <small>m ↗</small>
                          </span>
                        </p>
                        {unavailable && (
                          <p class="activity-reason" id={`activity-${r.id}-reason`}>
                            {unavailable}
                          </p>
                        )}
                      </div>
                    </label>
                  )
                })}
                {!visible.length && (
                  <div class="list-empty">
                    <h3>
                      {activities.length ? 'No matching activities' : 'No activities here yet'}
                    </h3>
                    <p>
                      {activities.length
                        ? 'Try a different name, date, or sport.'
                        : 'Try another page or record an activity in Strava.'}
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
                <div class="selection-controls">
                  <span class="selected-caption" aria-live="polite">
                    {selected.size} {selected.size === 1 ? 'activity' : 'activities'} selected
                  </span>
                  {selected.size > 0 && (
                    <button
                      class="text-button"
                      type="button"
                      mix={on('click', () => {
                        selected.clear()
                        selectionError = ''
                        handle.update()
                      })}
                    >
                      Clear selection
                    </button>
                  )}
                </div>
                {selectionError && <p role="alert">{selectionError}</p>}
                {connected ? (
                  <button
                    class="button button-dark wide"
                    data-funnel="preview_click"
                    data-funnel-placement="home"
                    type="submit"
                    disabled={selected.size < 2 || pending}
                  >
                    {pending ? (
                      <>
                        <span class="spinner" /> Reading your activities…
                      </>
                    ) : (
                      <>
                        Preview stitched activity <span>→</span>
                      </>
                    )}
                  </button>
                ) : (
                  <a
                    class={'button button-dark wide' + (selected.size < 2 ? ' disabled' : '')}
                    data-funnel="example_click"
                    data-funnel-placement="home"
                    href={selected.size >= 2 ? routes.demo.href() : undefined}
                    aria-disabled={selected.size < 2}
                  >
                    Preview this example <span>→</span>
                  </a>
                )}
              </div>
            </form>
          </section>
          <section class="visual-panel" aria-label="Your selected activities">
            <RouteMap
              tracks={chosen.map((r) => ({ id: r.id, name: r.name, coordinates: r.coordinates }))}
            />
            <div class="route-summary">
              <div class="summary-title">
                <span class="overline">ALL THE PARTS, TOGETHER</span>
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

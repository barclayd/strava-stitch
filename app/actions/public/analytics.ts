import {
  analyticsOptedOut,
  analyticsPages,
  clientEvents,
  placement,
  type ClientEvent,
} from '../../analytics.ts'

// A small independent entry also covers reading pages without loading the Remix UI runtime.
function page() {
  const context = document.querySelector<HTMLMetaElement>('meta[name="stitch-analytics"]')
  return { context, name: analyticsPages.find((name) => name === context?.content) }
}
function track(event: ClientEvent, source: unknown = 'unknown') {
  const { name } = page()
  if (
    !name ||
    analyticsOptedOut(document.cookie) ||
    navigator.doNotTrack === '1' ||
    ('globalPrivacyControl' in navigator && navigator.globalPrivacyControl === true)
  )
    return
  // No URL, referrer, cookies, persistent identifiers, or form values accompany the event.
  void fetch('/analytics', {
    method: 'POST',
    credentials: 'omit',
    keepalive: true,
    referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, page: name, placement: placement(source) }),
  }).catch(() => {})
}
document.addEventListener(
  'click',
  (event) => {
    if (!event.isTrusted || !(event.target instanceof Element)) return
    const element = event.target.closest<HTMLElement>('a[data-funnel], button[data-funnel]')
    if (
      !element ||
      element.getAttribute('aria-disabled') === 'true' ||
      (element instanceof HTMLButtonElement && element.disabled)
    )
      return
    const name = clientEvents.find((item) => item === element.dataset.funnel)
    if (name && name !== 'page_view') track(name, element.dataset.funnelPlacement)
  },
  { capture: true },
)

// Remix reconciles the document head after successful navigation. The per-render marker
// also distinguishes pagination/back navigation, without ever sending that marker to analytics.
let lastRender = ''
function view() {
  const render = page().context?.dataset.render
  if (!render || render === lastRender) return
  lastRender = render
  track('page_view')
}
new MutationObserver(view).observe(document.head, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['content', 'data-render'],
})
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    lastRender = ''
    view()
  }
})
view()

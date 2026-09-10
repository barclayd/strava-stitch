import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { buildSync } from 'esbuild'

const script = buildSync({
  entryPoints: ['app/actions/public/analytics.ts'],
  bundle: true,
  write: false,
  format: 'iife',
}).outputFiles[0].text

test('an already-open tab checks the exclusion before clicks and restored page views', () => {
  const requests: RequestInit[] = []
  const events: Record<string, (event: unknown) => void> = {}
  let render = 'first',
    observe = () => {}
  class Element {
    dataset = { funnel: 'connect_click', funnelPlacement: 'header' }
    closest() {
      return this
    }
    getAttribute() {
      return null
    }
  }
  const document = {
    cookie: '',
    head: {},
    querySelector: () => ({ content: 'home', dataset: { render } }),
    addEventListener: (name: string, callback: (event: unknown) => void) => {
      events[name] = callback
    },
  }
  runInNewContext(script, {
    document,
    navigator: {},
    Element,
    HTMLButtonElement: class extends Element {},
    window: { addEventListener: document.addEventListener },
    MutationObserver: class {
      constructor(callback: () => void) {
        observe = callback
      }
      observe() {}
    },
    fetch: (_url: string, init: RequestInit) => {
      requests.push(init)
      return Promise.resolve()
    },
  })
  assert.equal(requests.length, 1)
  document.cookie = 'stitch_session=private; stitch_analytics_opt_out=1'
  events.click({ isTrusted: true, target: new Element() })
  render = 'second'
  observe()
  events.pageshow({ persisted: true })
  assert.equal(requests.length, 1)
  document.cookie = 'stitch_session=private'
  events.click({ isTrusted: true, target: new Element() })
  assert.equal(requests.length, 2)
  assert.equal(requests[1].credentials, 'omit')
  assert.doesNotMatch(String(requests[1].body), /private|stitch_session|opt_out/)
})

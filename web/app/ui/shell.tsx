import type { Handle, RemixNode } from 'remix/ui'
import { routes } from '../routes.ts'
import { Document } from '../actions/document.tsx'

export function Shell(
  handle: Handle<{ children?: RemixNode; firstname?: string; csrf: string; title?: string }>,
) {
  return () => (
    <Document title={handle.props.title ?? 'Stitch — Make the whole ride yours'}>
      <a class="skip" href="#main">
        Skip to content
      </a>
      <header class="site-header">
        <a class="brand" href={routes.home.href()} aria-label="Stitch home">
          <svg width="28" height="32" viewBox="0 0 28 32" fill="none" aria-hidden="true">
            <path
              d="M22 4H10a7 7 0 0 0 0 14h8a5 5 0 0 1 0 10H6M6 4v8m16 8v8"
              stroke="currentColor"
              stroke-width="2.7"
              stroke-linecap="round"
            />
          </svg>
          <span>stitch</span>
        </a>
        <nav aria-label="Main navigation">
          <a class="nav-link" href={routes.home.href() + '#how-it-works'}>
            How it works
          </a>
          {handle.props.firstname ? (
            <>
              <span class="account">
                <span class="avatar">{handle.props.firstname[0]}</span>
                {handle.props.firstname}
              </span>
              <form data-rmx-document method="post" action={routes.auth.logout.href()}>
                <input type="hidden" name="_csrf" value={handle.props.csrf} />
                <button class="text-button" type="submit">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <form data-rmx-document method="post" action={routes.auth.connect.href()}>
              <input type="hidden" name="_csrf" value={handle.props.csrf} />
              <button type="submit" class="button button-strava">
                Connect with Strava <span aria-hidden="true">↗</span>
              </button>
            </form>
          )}
        </nav>
      </header>
      {handle.props.children}
      <footer class="site-footer">
        <span class="footer-brand">
          stitch<span>A whole ride, from every part.</span>
        </span>
        <div>
          <a href="https://www.strava.com" target="_blank" rel="noreferrer" class="strava-credit">
            Powered by <strong>STRAVA</strong>
          </a>
          <a href={routes.privacy.href()}>Privacy & your data</a>
        </div>
      </footer>
    </Document>
  )
}
export function Alert(handle: Handle<{ message?: string }>) {
  return () =>
    handle.props.message ? (
      <div class="alert" role="alert">
        {handle.props.message}
      </div>
    ) : null
}

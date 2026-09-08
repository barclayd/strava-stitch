import type { Handle, RemixNode } from 'remix/ui'
import { css } from 'remix/ui'
import { entryHref, entryPreloads, type ClientFeatures } from '../assets.ts'
import { guideUpdated, indexRobots, noIndex, serializeJsonLd, type PageSeo } from '../seo.ts'
import type { AnalyticsPage } from '../analytics.ts'
import { runtime } from '../data/runtime.ts'

export interface DocumentProps {
  children?: RemixNode
  head?: RemixNode
  title?: string
  seo?: PageSeo
  clientFeatures?: ClientFeatures
  analyticsPage?: AnalyticsPage
}
export function Document(handle: Handle<DocumentProps>) {
  return () => {
    const { children, head, title = 'Stitch', seo, clientFeatures, analyticsPage } = handle.props
    return (
      <html lang="en-GB">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content="light" />
          <meta name="theme-color" content="#345e51" />
          <meta name="robots" content={seo?.indexable ? indexRobots : noIndex} />
          {seo && (
            <>
              <meta name="description" content={seo.description} />
              <link rel="canonical" href={seo.canonical} />
              <meta property="og:title" content={seo.title} />
              <meta property="og:description" content={seo.description} />
              <meta property="og:type" content={seo.type} />
              <meta property="og:url" content={seo.canonical} />
              <meta property="og:site_name" content="Stitch" />
              <meta property="og:locale" content="en_GB" />
              <meta property="og:image" content={seo.image} />
              <meta property="og:image:secure_url" content={seo.image} />
              <meta property="og:image:type" content="image/png" />
              <meta property="og:image:width" content="1200" />
              <meta property="og:image:height" content="630" />
              <meta property="og:image:alt" content={seo.imageAlt} />
              <meta name="twitter:card" content="summary_large_image" />
              <meta name="twitter:title" content={seo.title} />
              <meta name="twitter:description" content={seo.description} />
              <meta name="twitter:image" content={seo.image} />
              <meta name="twitter:image:alt" content={seo.imageAlt} />
              {seo.type === 'article' && (
                <meta property="article:modified_time" content={guideUpdated + 'T00:00:00+00:00'} />
              )}
              {seo.structuredData && (
                <script
                  type="application/ld+json"
                  innerHTML={serializeJsonLd(seo.structuredData)}
                />
              )}
            </>
          )}
          <link
            data-rmx-key="site-font"
            rel="preload"
            href="/fonts/dm-sans.woff2"
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
          <link data-rmx-key="site-icon" rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link
            data-rmx-key="site-icon-png"
            rel="icon"
            type="image/png"
            sizes="96x96"
            href="/favicon-96.png"
          />
          <link
            data-rmx-key="site-touch-icon"
            rel="apple-touch-icon"
            sizes="180x180"
            href="/apple-touch-icon.png"
          />
          <title data-rmx-key="page-title">{seo?.title ?? title}</title>
          {head}
          {(clientFeatures ? entryPreloads[clientFeatures] : []).map((href) => (
            <link
              key={href}
              data-rmx-key={`modulepreload:${href}`}
              rel="modulepreload"
              href={href}
            />
          ))}
          {clientFeatures && (
            <script data-rmx-key="client-runtime" type="module" src={entryHref}></script>
          )}
          {analyticsPage && runtime().analytics.enabled && (
            <>
              <meta
                data-rmx-key="analytics-context"
                name="stitch-analytics"
                content={analyticsPage}
                data-render={crypto.randomUUID()}
              />
              <script
                data-rmx-key="site-analytics"
                type="module"
                src="/client/analytics.js"
              ></script>
            </>
          )}
          {clientFeatures && (
            <link data-rmx-key="map-styles" rel="stylesheet" href="/maps/maplibre.css" />
          )}
          {/* Keep this keyed stylesheet last so frame reconciliation neither replaces nor moves it. */}
          <link data-rmx-key="site-styles" rel="stylesheet" href="/styles.css" />
        </head>
        <body mix={css({ margin: 0 })}>{children}</body>
      </html>
    )
  }
}

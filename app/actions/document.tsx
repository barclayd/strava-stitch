import type { Handle, RemixNode } from 'remix/ui'
import { css } from 'remix/ui'
import { entryHref, entryPreloads, type ClientFeatures } from '../assets.ts'
import { guideUpdated, indexRobots, noIndex, serializeJsonLd, type PageSeo } from '../seo.ts'

export interface DocumentProps {
  children?: RemixNode
  head?: RemixNode
  title?: string
  seo?: PageSeo
  clientFeatures?: ClientFeatures
}
export function Document(handle: Handle<DocumentProps>) {
  return () => {
    const { children, head, title = 'Stitch', seo, clientFeatures } = handle.props
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
          <link rel="stylesheet" href="/styles.css" />
          <link
            rel="preload"
            href="/fonts/dm-sans.woff2"
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png" />
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <title>{seo?.title ?? title}</title>
          {head}
          {(clientFeatures ? entryPreloads[clientFeatures] : []).map((href) => (
            <link key={href} rel="modulepreload" href={href} />
          ))}
          {clientFeatures && <script type="module" src={entryHref}></script>}
        </head>
        <body mix={css({ margin: 0 })}>{children}</body>
      </html>
    )
  }
}

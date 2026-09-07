// Public search identity is fixed; never derive canonical URLs from request headers or activity data.
export const publicOrigin = 'https://stravastitch.com'
export const guideUpdated = '2026-09-07'
export const publicPages = {
  home: {
    path: '/',
    title: 'Combine Strava Activities for Free | Stitch',
    description:
      'Combine your Strava activities in seconds. Free to use, always. Join runs, rides, swims and more of the same sport. Preview, download GPX or FIT, and upload.',
    image: '/images/stitch-social.png',
    imageAlt:
      'Stitch: Combine your Strava activities in seconds. Free to use, always. Two activities with the pause preserved.',
  },
  guide: {
    path: '/guides/merge-strava-activities',
    title: 'How to Merge Strava Activities | Stitch',
    description:
      'Learn how to merge Strava activities of the same sport, including runs, rides, swims and indoor workouts. Review gaps, download GPX or FIT, and upload safely.',
    image: '/images/merge-guide-social.png',
    imageAlt: 'Two separate activities become one, with the pause between them preserved.',
  },
  privacy: {
    path: '/privacy',
    title: 'Privacy, Your Data & Support | Stitch',
    description:
      'How Stitch uses your Strava data, protects your activities, handles uploads and backups, and lets you disconnect. Support from Barksoft Ltd.',
    image: '/images/stitch-social.png',
    imageAlt:
      'Stitch: Combine your Strava activities in seconds. Free to use, always. Two activities with the pause preserved.',
  },
} as const
export type PublicPage = keyof typeof publicPages
export type PageSeo = {
  title: string
  description: string
  canonical: string
  image: string
  imageAlt: string
  type: 'website' | 'article'
  indexable: boolean
  structuredData?: Record<string, unknown>
}
export const noIndex = 'noindex, nofollow'
export const indexRobots = 'index, follow, max-image-preview:large'
export function isPublicPath(path: string): boolean {
  return Object.values(publicPages).some((page) => page.path === path)
}
export function canIndex(url: URL, personalized = false): boolean {
  return url.origin === publicOrigin && isPublicPath(url.pathname) && !url.search && !personalized
}
export function pageSeo(page: PublicPage, url: URL, personalized = false): PageSeo {
  const value = publicPages[page]
  return {
    ...value,
    canonical: publicOrigin + value.path,
    image: publicOrigin + value.image,
    type: page === 'guide' ? 'article' : 'website',
    indexable: canIndex(url, personalized),
    structuredData: page === 'home' ? homeSchema() : page === 'guide' ? guideSchema() : undefined,
  }
}
// JSON-LD is raw text inside a script element, so a literal closing tag must never be possible.
export function serializeJsonLd(value: Record<string, unknown>): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
const publisher = {
  '@type': 'Organization',
  '@id': publicOrigin + '/#organization',
  name: 'Barksoft Ltd.',
  url: publicOrigin + '/privacy#support',
}
function homeSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      publisher,
      {
        '@type': 'WebSite',
        '@id': publicOrigin + '/#website',
        name: 'Stitch',
        url: publicOrigin + '/',
        description: publicPages.home.description,
        publisher: { '@id': publisher['@id'] },
        inLanguage: 'en-GB',
      },
    ],
  }
}
function guideSchema(): Record<string, unknown> {
  const url = publicOrigin + publicPages.guide.path
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': url + '#article',
        headline: 'How to merge Strava activities',
        description: publicPages.guide.description,
        mainEntityOfPage: url,
        url,
        dateModified: guideUpdated + 'T00:00:00+00:00',
        author: publisher,
        publisher,
        inLanguage: 'en-GB',
        image: {
          '@type': 'ImageObject',
          url: publicOrigin + '/images/merge-guide.png',
          width: 1200,
          height: 675,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Stitch', item: publicOrigin + '/' },
          { '@type': 'ListItem', position: 2, name: 'Merge Strava activities', item: url },
        ],
      },
    ],
  }
}
export function sitemap(origin: string): string {
  const entries = origin === publicOrigin ? Object.entries(publicPages) : []
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries
      .map(
        ([key, page]) =>
          `  <url><loc>${publicOrigin}${page.path}</loc>${key === 'guide' ? `<lastmod>${guideUpdated}</lastmod>` : ''}</url>`,
      )
      .join('\n') +
    '\n</urlset>\n'
  )
}
export function robots(origin: string): string {
  // Authentication and noindex protect private pages; disallow would hide noindex from crawlers.
  return origin === publicOrigin
    ? `User-agent: *\nAllow: /\n\nSitemap: ${publicOrigin}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n'
}

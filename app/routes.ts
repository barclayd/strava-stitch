import { get, post, route } from 'remix/routes'
import { publicPages } from './seo.ts'

export const routes = route({
  home: publicPages.home.path,
  privacy: get(publicPages.privacy.path),
  analyticsPreference: post('/privacy/analytics'),
  guide: get(publicPages.guide.path),
  duplicateGuide: get(publicPages.duplicateGuide.path),
  indoorGuide: get(publicPages.indoorGuide.path),
  runGuide: get(publicPages.runGuide.path),
  rideGuide: get(publicPages.rideGuide.path),
  crawl: { robots: get('/robots.txt'), sitemap: get('/sitemap.xml') },
  demo: get('/example'),
  demoDownload: get('/example/download'),
  analytics: { receive: post('/analytics') },
  auth: {
    connect: post('/auth/strava'),
    callback: get('/auth/strava/callback'),
    logout: post('/auth/logout'),
    disconnect: post('/auth/disconnect'),
  },
  stitches: {
    create: post('/stitches'),
    show: get('/stitches/:id'),
    download: get('/stitches/:id/download'),
    backup: get('/stitches/:id/backup'),
    photos: get('/stitches/:id/photos'),
    photo: get('/stitches/:id/photos/:photo'),
    confirmRemoval: post('/stitches/:id/removal'),
    upload: post('/stitches/:id/upload'),
    status: get('/stitches/:id/status'),
  },
  webhooks: { verify: get('/webhooks/strava'), receive: post('/webhooks/strava') },
})

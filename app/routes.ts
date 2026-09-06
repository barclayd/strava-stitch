import { get, post, route } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  home: '/',
  privacy: get('/privacy'),
  demo: get('/example'),
  demoDownload: get('/example/download'),
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
    confirmRemoval: post('/stitches/:id/removal'),
    upload: post('/stitches/:id/upload'),
    status: get('/stitches/:id/status'),
  },
  webhooks: { verify: get('/webhooks/strava'), receive: post('/webhooks/strava') },
})

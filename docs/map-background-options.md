# Street maps in Stitch

Implemented 8 September 2026. The example, activity picker and personal stitch previews share the same map component.

## Appearance and interaction

MapLibre GL JS renders a Protomaps Light basemap with a custom palette inspired by the user's Strava reference: neutral grey land, white local roads, grey main roads, green parks and woodland, blue water and dark place labels. Nonessential POI icons, road shields, one-way arrows and address labels are omitted. Labels use local Arial/system fonts, with no remote glyph or sprite service. This is a similar visual treatment, not Strava's proprietary map style. [Strava maps](https://support.strava.com/en-us/articles/15402176-about-strava-maps), [Protomaps customization](https://docs.protomaps.com/basemaps/flavors), [MapLibre local fonts](https://maplibre.org/maplibre-style-spec/glyphs/).

Each recording is a separate coloured line with a white outline and start/end markers. No lines bridge the gaps. The map fits the selected routes, supports pan, zoom and reset, stays north-up, and respects reduced motion. Touch controls have 44px targets and the map requires two fingers for touch panning so it does not trap ordinary page scrolling.

The SVG preview remains the initial rendering and the fallback for unavailable tiles or WebGL. Activities without GPS retain the existing empty-map explanation. JavaScript for the street map is imported only when a map with GPS becomes visible; hidden example panels do not initialize maps. Initialized maps are resized on panel/layout changes and destroyed when their component unmounts. A fixed empty `innerHTML` gives MapLibre ownership of its canvas subtree during native Remix component updates, while `data-rmx-preserve-dom` protects it during frame reconciliation.

The public example uses deliberately illustrative Peak District coordinates. It is not a road-routed itinerary; the application never snaps a person's GPS trace to roads or invents movement to improve its appearance.

## Hosting and privacy

- `MAPS` binds to the private Cloudflare R2 bucket `strava-stitch-maps` in production and staging. Local development uses emulated R2.
- The immutable object `world-20260908.pmtiles` is the global Protomaps 8 September 2026 build: 137,855,359,979 bytes, vector tiles at zooms 0–15 (overzoomed to 18). Its source is [the Protomaps builds archive](https://maps.protomaps.com/builds/).
- `/maps/world-20260908.pmtiles` serves only that fixed object, through Stitch's Worker. GET requires one explicit byte range of at most 8 MiB; unrestricted full-file downloads, multipart ranges and writes are rejected. HEAD provides metadata. Successful responses carry ETags and immutable browser caching; errors are not cached.
- This public map endpoint bypasses sessions, CSRF and Durable Object lookups. It does not accept activity coordinates, identifiers or arbitrary source URLs. R2 contains only public basemap data.
- Activity GeoJSON stays in the browser and its local map worker. The browser requests map data, JavaScript and CSS only from Stitch's own origin. No separate map provider receives visitors' requests. Cloudflare still processes ordinary hosting requests, including the area represented by the requested map bytes; this is explained on the privacy page.
- OSM contributor attribution remains visible with links to the copyright page and Protomaps. Retain the source archive's metadata and licensing when refreshing it. [OpenStreetMap copyright](https://www.openstreetmap.org/copyright), [Protomaps security and privacy](https://docs.protomaps.com/guide/security-privacy).

The map library and its module worker are bundled locally. CSP allows same-origin workers and image blobs while keeping scripts, fonts and connections restricted to Stitch. The site stylesheet remains last in the document head to preserve smooth Remix navigation.

## Cost and maintenance

The global snapshot occupies about 128.4 GiB. At R2 Standard's published US$0.015/GB-month rate, budget roughly US$2/month before shared free allowances, plus requests and Worker usage. R2 currently includes 10 GB-month of storage, 1 million Class A and 10 million Class B operations per month, with free egress. Each uncached map range uses one metadata read and one ranged read; browser caching avoids repeat transfers, but this implementation does not promise a shared edge cache for partial responses. [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/).

There is no automatic snapshot refresh. Review the basemap quarterly, or when a newer map is needed. Copy a new global archive into R2 under a **new dated key**, using an S3-compatible multipart transfer (the archive is too large for a single Wrangler object upload). Never overwrite an immutable key. Verify its byte count, PMTiles header and representative tile reads against the source before changing `basemapKey` and `basemapPath` in `app/maps.ts`. Check style compatibility when changing tileset versions. Keep the previous object while older clients may still reference it; account for overlapping storage during updates. [Protomaps downloads](https://docs.protomaps.com/basemaps/downloads), [R2 hosting](https://docs.protomaps.com/deploy/cloudflare).

The initial import used an authenticated, expiring temporary Worker to stream verified ranges from the fixed Protomaps source into R2 multipart storage. That importer is not part of the application or its deployment configuration and should be removed after verification. No daily build should download or upload the world archive.

## Local preview

Without a local archive, the application intentionally shows the SVG fallback. For map development, use the [PMTiles CLI](https://docs.protomaps.com/pmtiles/cli) to extract the synthetic example's region and seed local R2:

```sh
mkdir -p tmp/maps
pmtiles extract https://build.protomaps.com/20260908.pmtiles tmp/maps/peaks.pmtiles --bbox=-2.15,53.18,-1.55,53.6 --maxzoom=15
npx wrangler r2 object put strava-stitch-maps/world-20260908.pmtiles --file tmp/maps/peaks.pmtiles --local
npm run dev
```

This regional file is for local QA only. Production and staging use the complete world archive.

## Verification

Automated tests cover bounded R2 ranges, clipping at EOF, ETags, absent storage, invalid ranges, no session cookies, independent route segments, missing/invalid GPS and date-line fitting. The existing OAuth, upload, export, SEO and analytics checks remain required. Browser checks cover desktop/mobile rendering, lazy loading, source selection, step changes, zoom/reset, attribution, no external resource requests and both tile-error and unavailable-WebGL fallbacks.

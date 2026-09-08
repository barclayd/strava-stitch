# OpenStreetMap background: feasibility

Investigated 8 September 2026. This is a proposal; the map background has not been added to the application.

## Recommendation

Use MapLibre GL JS with an OpenStreetMap-derived vector basemap, served from Stitch’s Cloudflare infrastructure. A light style with muted roads, green parks, blue water and clear place names can give the route the geographic context shown in the Strava reference. MapLibre supports styled map layers and route overlays; Protomaps supplies customizable light basemap styles. This can be visually similar without depending on Strava’s map service. [MapLibre styles](https://maplibre.org/maplibre-style-spec/), [route overlay example](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-geojson-line/), [Protomaps styles](https://docs.protomaps.com/basemaps/flavors).

The application already passes latitude/longitude arrays to `RouteMap` in `app/ui/public/route-map.tsx`. The current component draws those points on an SVG grid. The same coordinates can be drawn over map tiles, without another Strava API request. Each activity should remain a separate line, preserving the different colours and unconnected gaps.

## Selected style

Choose **Protomaps Light with a custom palette** as the base for Stitch’s standard map. The user’s Strava screenshot is the visual reference. Strava confirms that its activity maps use Mapbox with OpenStreetMap data; choosing an OSM tileset alone does not reproduce the same appearance. [Strava’s map documentation](https://support.strava.com/en-us/articles/15402176-about-strava-maps).

Compared the Light and White presets over west London. Light already provides white local roads, green parks, coloured water and place labels. White removes the useful park/water colour distinctions. Light is the better starting point for this reference, with the following proposed overrides; these colours are design targets, not values extracted from Strava’s style:

| Element | Target | Protomaps configuration |
| --- | --- | --- |
| Land | Neutral light grey `#eeeeec` | `background`, `earth` |
| Local roads | White `#ffffff`, subtle grey edges | `minor_a`, `minor_b`, `minor_service`, their casing colours |
| Main roads | Muted grey `#c8cbcd` with light edges | `major`, `highway`, `link`, matching bridge/tunnel colours |
| Parks | Soft green `#a7d997` | `park_a`, `park_b` |
| Woodland | Slightly deeper green `#a0cd97` | `wood_a`, `wood_b` and landcover overrides |
| Water | Pale blue `#9fcbdc` | `water` |
| Buildings | Low-contrast grey `#e2e3e1` | `buildings` |
| Labels | Dark grey `#454744`; quieter neighbourhood/road labels | `city_label`, `subplace_label`, road labels; light halos |

Use a flat, north-up view. Reduce nonessential POI icons and road shields at the initial route-fit zoom, keep neighbourhood and park names readable, and let the activity lines dominate. Preserve Stitch’s separate activity colours and white route outlines so users can still distinguish the join. Tune label density, road widths and the palette against the reference at comparable zoom levels before calling the result visually matched.

Implement the palette by extending `namedFlavor('light')`, then adjust the generated MapLibre layers where colour overrides are insufficient. This is the documented customization path and remains compatible with serving the assets ourselves. [Flavor customization](https://docs.protomaps.com/basemaps/flavors), [typed configuration](https://maps.protomaps.com/typedoc/interfaces/Flavor.html).

## Hosting and privacy

| Approach | Fit for Stitch |
| --- | --- |
| OpenStreetMap’s public tile service | Useful for ordinary interactive maps, but attribution, caching and referral requirements apply, and availability has no guarantee. It adds an external destination for map requests. |
| A hosted OSM-based map provider | Reduces our operational work, with provider-specific terms, pricing and privacy arrangements to evaluate. |
| Our own OSM-derived tiles on Cloudflare | Recommended for our privacy-first direction. Adds storage, requests and update maintenance, while keeping map delivery with our existing hosting provider. |

Direct tile requests let a provider see the visitor’s IP address and requested tile addresses. Those tile addresses identify the area being viewed, even when the full activity route is drawn locally. OSMF describes its request logging in its [privacy policy](https://osmfoundation.org/wiki/Privacy_Policy#Personal_data_we_receive_automatically). Its public [raster](https://operations.osmfoundation.org/policies/tiles/) and [vector](https://operations.osmfoundation.org/policies/vector/) services require attribution and compliant caching and referral behaviour. Stitch currently uses `Referrer-Policy: same-origin` and blocks external map requests in its CSP, so direct public tile integration would also need deliberate policy changes.

Protomaps documents serving PMTiles through Cloudflare R2 and Workers. Use an archive intended for hosting, rather than scraping OSM’s public tile servers. Serve styles, fonts, icons and JavaScript ourselves too; otherwise those resources still contact external services. Cloudflare would continue processing normal hosting requests. [Cloudflare integration](https://docs.protomaps.com/deploy/cloudflare), [resource privacy](https://docs.protomaps.com/guide/security-privacy).

A full Protomaps world archive is roughly 120 GB; regional extracts are available for a smaller prototype. Global coverage needs a storage/request budget and an archive update plan. No infrastructure has been provisioned or paid service enabled as part of this investigation. [Basemap downloads](https://docs.protomaps.com/basemaps/downloads).

## Implementation considerations

- Keep the existing SVG as the initial rendering and fallback for unavailable maps or WebGL. Preserve the current experience for activities without GPS.
- Initialize the map inside the Remix client entry, resize it when an example panel becomes visible, and clean it up when the component unmounts. Load background tiles only for visible maps.
- Keep activity coordinates, titles and descriptions out of tile URLs and public map storage. Public caches should contain only generic basemap data.
- Retain start/end markers, fit-to-route, accessible zoom controls, attribution and reduced-motion behaviour.
- Use the synthetic example for the first visual prototype. Its deliberately illustrative geometry will still look angular over real roads; do not snap private activity traces to roads or invent movement to improve the appearance.
- Verify desktop/mobile layout, tile-failure fallback, panel switching, separate route segments and the actual outgoing requests before enabling backgrounds on personal previews.

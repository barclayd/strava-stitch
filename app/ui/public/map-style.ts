import { layers, namedFlavor } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'
import { basemapPath } from '../../maps.ts'

export function mapStyle(origin: string): StyleSpecification {
  const flavour = {
    ...namedFlavor('light'),
    background: '#eeeeec',
    earth: '#eeeeec',
    park_a: '#a7d997',
    park_b: '#a7d997',
    wood_a: '#a0cd97',
    wood_b: '#a0cd97',
    scrub_a: '#c1ddb3',
    scrub_b: '#c1ddb3',
    water: '#9fcbdc',
    buildings: '#e2e3e1',
    minor_a: '#ffffff',
    minor_b: '#ffffff',
    minor_service: '#ffffff',
    minor_casing: '#ddddda',
    minor_service_casing: '#ddddda',
    major: '#c8cbcd',
    highway: '#c8cbcd',
    link: '#c8cbcd',
    major_casing_early: '#ffffff',
    major_casing_late: '#ffffff',
    highway_casing_early: '#ffffff',
    highway_casing_late: '#ffffff',
    link_casing: '#ffffff',
    bridges_major: '#c8cbcd',
    bridges_highway: '#c8cbcd',
    bridges_link: '#c8cbcd',
    bridges_minor: '#ffffff',
    tunnel_major: '#d4d5d4',
    tunnel_highway: '#d4d5d4',
    tunnel_link: '#d4d5d4',
    tunnel_minor: '#ffffff',
    city_label: '#454744',
    city_label_halo: '#fafaf8',
    subplace_label: '#72756f',
    subplace_label_halo: '#fafaf8',
    roads_label_minor: '#666963',
    roads_label_major: '#666963',
    regular: 'Arial',
    bold: 'Arial Bold',
    italic: 'Arial Italic',
  }
  const basemapLayers = layers('basemap', flavour, { lang: 'en' })
    .filter(
      (layer) => !['pois', 'roads_shields', 'roads_oneway', 'address_label'].includes(layer.id),
    )
    .map((layer) => {
      if (layer.type === 'symbol' && layer.layout) {
        // MapLibre renders labels with local fonts; no glyph requests or sprite service is needed.
        for (const key of Object.keys(layer.layout))
          if (key.startsWith('icon-')) delete layer.layout[key as keyof typeof layer.layout]
      }
      return layer
    })
  return {
    version: 8,
    sources: { basemap: { type: 'vector', url: 'pmtiles://' + origin + basemapPath } },
    layers: basemapLayers,
  }
}

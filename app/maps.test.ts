import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routeGeometry } from './maps.ts'
import type { Track } from './actions/public/format.ts'

const track = (coordinates: [number, number][], id = 1): Track => ({
  id,
  coordinates,
  name: 'Private activity',
})

test('map geometry preserves independent recordings and excludes activity metadata', () => {
  const geometry = routeGeometry([
    track([
      [51, -1],
      [51.1, -1.1],
    ]),
    track([]),
    track(
      [
        [52, -2],
        [52.1, -2.1],
      ],
      2,
    ),
  ])
  assert.equal(geometry.lines.features.length, 2)
  assert.equal(geometry.markers.features.length, 4)
  assert.deepEqual(geometry.lines.features[0].geometry.coordinates, [
    [-1, 51],
    [-1.1, 51.1],
  ])
  assert.notEqual(
    geometry.lines.features[0].properties.colour,
    geometry.lines.features[1].properties.colour,
  )
  assert.doesNotMatch(JSON.stringify(geometry), /Private activity|"id"|"name"/)
  assert.deepEqual(geometry.bounds, [
    [-2.1, 51],
    [-1, 52.1],
  ])
})

test('map geometry fits date-line routes locally and handles absent or invalid GPS', () => {
  const geometry = routeGeometry([
    track([
      [0, NaN],
      [1, 2],
    ]),
    track([
      [50, 179.9],
      [50.1, -179.9],
    ]),
  ])
  assert.equal(geometry.lines.features.length, 1)
  assert.ok(geometry.bounds![1][0] - geometry.bounds![0][0] < 1)
  assert.equal(routeGeometry([track([]), track([[50, 0]])]).bounds, undefined)
  assert.equal(
    routeGeometry([
      track([
        [90, 1],
        [89, 2],
      ]),
    ]).bounds![1][1],
    85.0511287,
  )
})

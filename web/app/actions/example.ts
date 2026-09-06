import { merge, separation, type Recording, type Point } from './stitches/merge.ts'

// Deliberately synthetic illustration around the Peak District. No athlete data.
const waypoints: [number, number][] = [
  [53.213, -1.675],
  [53.222, -1.675],
  [53.232, -1.681],
  [53.241, -1.696],
  [53.251, -1.707],
  [53.263, -1.718],
  [53.279, -1.711],
  [53.289, -1.707],
  [53.296, -1.697],
  [53.303, -1.678],
  [53.299, -1.653],
  [53.29, -1.644],
  [53.284, -1.637],
  [53.27, -1.628],
  [53.26, -1.615],
  [53.25, -1.613],
  [53.24, -1.617],
  [53.231, -1.621],
  [53.219, -1.63],
  [53.211, -1.65],
  [53.213, -1.675],
]
const base = Date.parse('2026-09-06T08:15:00Z') / 1000
function part(id: number, from: number, to: number, start: number): Recording {
  let distance = 0
  const points: Point[] = []
  for (let i = from; i < to; i++)
    for (let n = 0; n < 14; n++) {
      const t = n / 14,
        p: Point = {
          lat: waypoints[i][0] * (1 - t) + waypoints[i + 1][0] * t,
          lon: waypoints[i][1] * (1 - t) + waypoints[i + 1][1] * t,
          time: start + points.length * 15,
          altitude: 180 + 90 * Math.sin((i + t) / 3) + i * 4,
        }
      if (points.length) distance += separation(points.at(-1)!, p)
      p.distance = distance
      points.push(p)
    }
  return {
    activity: {
      id,
      name: id === 1 ? 'Out into the hills' : 'The way home',
      start_date: new Date(start * 1000).toISOString(),
      start_date_local: new Date(start * 1000).toISOString(),
      distance,
      moving_time: points.length * 15,
      elapsed_time: points.length * 15,
      total_elevation_gain: id === 1 ? 246 : 188,
      sport_type: 'Ride',
    },
    points,
  }
}
export const exampleRecords = [part(1, 0, 10, base), part(2, 10, 20, base + 140 * 15 + 188 - 15)]
export const exampleMerge = merge(exampleRecords)

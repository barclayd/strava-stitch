import type { Types } from '@garmin/fitsdk'

// Strava's upload sport_type values: https://developers.strava.com/docs/uploads/
// Keep this module safe to import in the activity picker; the SDK import is type-only.
export const sports = {
  AlpineSki: ['Alpine ski', 'alpineSkiing', 'generic'],
  BackcountrySki: ['Backcountry ski', 'alpineSkiing', 'backcountry'],
  Badminton: ['Badminton', 'racket', 'badminton'],
  Basketball: ['Basketball', 'basketball', 'generic'],
  Canoeing: ['Canoeing', 'canoeing', 'generic'],
  Cricket: ['Cricket', 'cricket', 'generic'],
  Crossfit: ['CrossFit', 'training', 'exercise'],
  Dance: ['Dance', 'dance', 'generic'],
  EBikeRide: ['E-bike ride', 'eBiking', 'eBikeFitness'],
  Elliptical: ['Elliptical', 'fitnessEquipment', 'elliptical'],
  EMountainBikeRide: ['E-mountain bike ride', 'eBiking', 'eBikeMountain'],
  Golf: ['Golf', 'golf', 'generic'],
  GravelRide: ['Gravel ride', 'cycling', 'gravelCycling'],
  Handcycle: ['Handcycle', 'cycling', 'handCycling'],
  HighIntensityIntervalTraining: ['HIIT', 'hiit', 'generic'],
  Hike: ['Hike', 'hiking', 'generic'],
  IceSkate: ['Ice skate', 'iceSkating', 'generic'],
  InlineSkate: ['Inline skate', 'inlineSkating', 'generic'],
  Kayaking: ['Kayaking', 'kayaking', 'generic'],
  Kitesurf: ['Kitesurf', 'kitesurfing', 'generic'],
  MountainBikeRide: ['Mountain bike ride', 'cycling', 'mountain'],
  NordicSki: ['Nordic ski', 'crossCountrySkiing', 'generic'],
  Padel: ['Padel', 'racket', 'padel'],
  PhysicalTherapy: ['Physical therapy', 'mobility', 'generic'],
  Pickleball: ['Pickleball', 'racket', 'pickleball'],
  Pilates: ['Pilates', 'fitnessEquipment', 'pilates'],
  Racquetball: ['Racquetball', 'racket', 'racquetball'],
  Ride: ['Ride', 'cycling', 'generic'],
  RockClimbing: ['Rock climbing', 'rockClimbing', 'generic'],
  RollerSki: ['Roller ski', 'crossCountrySkiing', 'generic'],
  Rowing: ['Rowing', 'rowing', 'generic'],
  Run: ['Run', 'running', 'generic'],
  Sail: ['Sail', 'sailing', 'generic'],
  Skateboard: ['Skateboard', 'generic', 'generic'],
  Snowboard: ['Snowboard', 'snowboarding', 'generic'],
  Snowshoe: ['Snowshoe', 'snowshoeing', 'generic'],
  Soccer: ['Soccer', 'soccer', 'generic'],
  Squash: ['Squash', 'racket', 'squash'],
  StairStepper: ['Stair stepper', 'fitnessEquipment', 'stairClimbing'],
  StandUpPaddling: ['Stand up paddling', 'standUpPaddleboarding', 'generic'],
  Surfing: ['Surfing', 'surfing', 'generic'],
  Swim: ['Swim', 'swimming', 'generic'],
  TableTennis: ['Table tennis', 'racket', 'tableTennis'],
  Tennis: ['Tennis', 'tennis', 'generic'],
  TrailRun: ['Trail run', 'running', 'trail'],
  Velomobile: ['Velomobile', 'cycling', 'recumbent'],
  VirtualRide: ['Virtual ride', 'cycling', 'virtualActivity'],
  VirtualRow: ['Virtual row', 'rowing', 'virtualActivity'],
  VirtualRun: ['Virtual run', 'running', 'virtualActivity'],
  Volleyball: ['Volleyball', 'volleyball', 'generic'],
  Walk: ['Walk', 'walking', 'generic'],
  WeightTraining: ['Weight training', 'training', 'strengthTraining'],
  Wheelchair: ['Wheelchair', 'wheelchairPushWalk', 'generic'],
  Windsurf: ['Windsurf', 'windsurfing', 'generic'],
  Workout: ['Workout', 'training', 'generic'],
  Yoga: ['Yoga', 'training', 'yoga'],
} as const satisfies Record<string, readonly [string, Types.Sport, Types.SubSport]>

export type Sport = keyof typeof sports
export const isSport = (value: string): value is Sport => Object.hasOwn(sports, value)
export const sportLabel = (value: string) => (isSport(value) ? sports[value][0] : value)
export function unavailableReason(activity: { sport_type: string; manual?: boolean }) {
  if (activity.manual) return 'Manual entry — no recorded samples to stitch.'
  if (!isSport(activity.sport_type)) return 'This sport is not yet supported by Stitch.'
  return undefined
}

import {
  Encoder,
  Profile,
  type FileIdMesg,
  type SportMesg,
  type RecordMesg,
  type EventMesg,
  type LapMesg,
  type SessionMesg,
  type ActivityMesg,
  type Encodable,
  type Mesg,
} from '@garmin/fitsdk'
import { isSport, sports, type Sport } from '../../data/sports.ts'
import { fileFormat, hasPosition, toGpx, type Recording } from './merge.ts'

export type ActivityFile = {
  data: Uint8Array<ArrayBuffer>
  format: 'gpx' | 'fit'
  contentType: string
  sport: Sport
  trainer: boolean
}

function sportOf(records: Recording[]): Sport {
  const sport = records[0]?.activity.sport_type
  if (!isSport(sport) || records.some((r) => r.activity.sport_type !== sport))
    throw new Error('Choose activities with the same supported sport type.')
  return sport
}

// FIT fields have finite ranges. Reject unrepresentable data before saving a preview,
// rather than allowing the encoder to wrap a value or turn it into a missing sample.
function bounded(value: number, min: number, max: number, field: string, integer = false) {
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(`A recorded ${field} cannot be represented in FIT. Nothing was stitched.`)
  return value
}
const fitDate = (seconds: number) =>
  new Date(bounded(seconds, 631065600, 631065600 + 0xfffffffe, 'timestamp', true) * 1000)

export function toFit(records: Recording[]): Uint8Array<ArrayBuffer> {
  const type = sportOf(records),
    [, sport, subSport] = sports[type],
    start = records[0].points[0].time,
    end = records.at(-1)!.points.at(-1)!.time,
    encoder = new Encoder()
  const write = <T extends Mesg>(message: Encodable<T>) => encoder.writeMesg(message)
  write<FileIdMesg>({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: 'activity',
    manufacturer: 'development',
    product: 1,
    timeCreated: fitDate(start),
  })
  write<SportMesg>({ mesgNum: Profile.MesgNum.SPORT, sport, subSport, name: type })
  let offset = 0,
    timer = 0
  const useDistance = records.every((r) => r.points.every((p) => p.distance !== undefined))
  for (const [index, r] of records.entries()) {
    const first = r.points[0],
      last = r.points.at(-1)!,
      elapsed = last.time - first.time
    write<EventMesg>({
      mesgNum: Profile.MesgNum.EVENT,
      timestamp: fitDate(first.time),
      event: 'timer',
      eventType: 'start',
    })
    for (const p of r.points) {
      const record: Encodable<RecordMesg> = {
        mesgNum: Profile.MesgNum.RECORD,
        timestamp: fitDate(p.time),
      }
      if (hasPosition(p)) {
        record.positionLat = Math.round((p.lat * 2 ** 31) / 180)
        // +180 and -180 represent the same meridian; +180 overflows a signed FIT coordinate.
        const longitude = Math.round((p.lon * 2 ** 31) / 180)
        record.positionLong = longitude >= 0x7fffffff ? -0x80000000 : longitude
      }
      if (p.altitude !== undefined)
        record.enhancedAltitude = bounded(p.altitude, -500, 858992958.8, 'elevation')
      if (p.heartrate !== undefined)
        record.heartRate = bounded(p.heartrate, 0, 254, 'heart rate', true)
      if (p.cadence !== undefined) {
        const cadence = bounded(p.cadence, 0, 254, 'cadence')
        record.cadence = Math.floor(cadence)
        if (cadence % 1) record.fractionalCadence = cadence % 1
      }
      if (p.temp !== undefined) record.temperature = bounded(p.temp, -128, 126, 'temperature', true)
      if (useDistance)
        record.distance = bounded(
          offset + p.distance! - first.distance!,
          0,
          42949672.94,
          'distance',
        )
      write<RecordMesg>(record)
    }
    write<EventMesg>({
      mesgNum: Profile.MesgNum.EVENT,
      timestamp: fitDate(last.time),
      event: 'timer',
      eventType: 'stopAll',
    })
    const distance = useDistance ? last.distance! - first.distance! : r.activity.distance
    write<LapMesg>({
      mesgNum: Profile.MesgNum.LAP,
      messageIndex: index,
      timestamp: fitDate(last.time),
      startTime: fitDate(first.time),
      event: 'lap',
      eventType: 'stop',
      sport,
      subSport,
      totalElapsedTime: bounded(elapsed, 0, 4294967.294, 'duration'),
      totalTimerTime: elapsed,
      totalDistance: bounded(distance, 0, 42949672.94, 'distance'),
    })
    offset += distance
    timer += elapsed
  }
  // Only the gap between source recordings is known to be paused. Do not invent
  // within-activity timer events from Strava's aggregate moving_time.
  write<SessionMesg>({
    mesgNum: Profile.MesgNum.SESSION,
    messageIndex: 0,
    timestamp: fitDate(end),
    startTime: fitDate(start),
    event: 'session',
    eventType: 'stop',
    sport,
    subSport,
    totalElapsedTime: bounded(end - start, 0, 4294967.294, 'duration'),
    totalTimerTime: timer,
    totalDistance: bounded(offset, 0, 42949672.94, 'distance'),
    firstLapIndex: 0,
    numLaps: records.length,
  })
  write<ActivityMesg>({
    mesgNum: Profile.MesgNum.ACTIVITY,
    timestamp: fitDate(end),
    totalTimerTime: timer,
    numSessions: 1,
    type: 'manual',
    event: 'activity',
    eventType: 'stop',
  })
  return new Uint8Array(encoder.close())
}

export function activityFile(records: Recording[], name: string): ActivityFile {
  const sport = sportOf(records),
    format = fileFormat(records)
  return {
    sport,
    trainer: records.every((r) => r.activity.trainer === true),
    format,
    contentType: format === 'gpx' ? 'application/gpx+xml' : 'application/vnd.ant.fit',
    data: format === 'gpx' ? new TextEncoder().encode(toGpx(records, name)) : toFit(records),
  }
}

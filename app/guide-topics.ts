const artwork = {
  image: '/images/merge-guide-social.png',
  imageAlt: 'Two separate activities become one, with the pause between them preserved.',
  updated: '2026-09-13',
}

// Public editorial metadata only. These topics have distinct examples and limitations.
export const guideTopics = {
  duplicateGuide: {
    ...artwork,
    updated: '2026-09-20',
    path: '/guides/strava-duplicate-upload',
    title: 'Fix a Strava Duplicate Upload After Merging | Stitch',
    heading: 'Why Strava says your merged activity is a duplicate',
    label: 'Duplicate upload errors',
    description:
      'Understand a Strava duplicate upload after merging activities. Check for an existing upload, inspect your backup, and decide safely what to do with originals.',
    intro:
      'A merged activity reuses recordings already on Strava, so Strava may flag the upload as a duplicate. First check whether the merged activity already exists. If the originals are causing the conflict, keep a backup and decide whether replacing them is worth losing their social history.',
  },
  indoorGuide: {
    ...artwork,
    path: '/guides/combine-indoor-workouts-and-swims',
    title: 'Combine Indoor Workouts and Swims on Strava | Stitch',
    heading: 'Combine indoor workouts and swims without a GPS route',
    label: 'Indoor workouts and swims',
    description:
      'Join recorded indoor workouts or swims of the same sport with Stitch. Learn when FIT is used, why timestamps matter, and which swimming and workout data is lost.',
    intro:
      'A map is optional when combining activities. Stitch can join indoor workouts or swims of the same sport when Strava provides recorded timestamps. The merged activity uses FIT when GPS is missing; swimming lengths, workout sets and intervals are not reconstructed.',
  },
  runGuide: {
    ...artwork,
    updated: '2026-09-20',
    path: '/guides/combine-strava-runs',
    title: 'Combine Two Strava Runs into One | Stitch',
    heading: 'Combine two Strava runs after an accidental stop',
    label: 'Split runs',
    description:
      'Join a split Strava run with Stitch for free. Check the gap, keep original timestamps, combine titles and descriptions, and understand pace after uploading.',
    intro:
      'If you ended a run on your watch and recorded the rest as a second activity, Stitch can combine the recorded parts. Select two to eight runs with matching sport types, review the gap, then download the merged file or confirm an upload to Strava.',
  },
  rideGuide: {
    ...artwork,
    updated: '2026-09-20',
    path: '/guides/combine-strava-rides',
    title: 'Combine Two Strava Rides into One | Stitch',
    heading: 'Combine a Strava ride split across recordings',
    label: 'Split rides',
    description:
      'Merge Strava rides split by a stop or device restart. Preview the gap, check ride types and sensor limitations, then download or upload with Stitch for free.',
    intro:
      'A café stop, an accidental finish or restarting a bike computer can leave one outing in separate activities. Stitch joins consecutive rides of the same sport type, keeps the original timestamps and lets you check every gap before uploading.',
  },
  garminGuide: {
    ...artwork,
    updated: '2026-09-20',
    path: '/guides/merge-garmin-activities-strava',
    title: 'How to Merge Garmin Activities into One Strava Activity | Stitch',
    heading: 'How to merge Garmin activities into one Strava activity',
    label: 'Garmin activities',
    description:
      'Combine separate Garmin rides or runs into one Strava activity for free. Sync the parts, preview the gaps, save backups and upload the merged activity with Stitch.',
    intro:
      'Recorded one outing as several Garmin activities? Once each part has synced to Strava, Stitch can merge two to eight recordings of the same sport into one Strava activity, for free.',
  },
} as const

export type GuideTopic = keyof typeof guideTopics
export const guideTopicKeys = Object.keys(guideTopics) as GuideTopic[]

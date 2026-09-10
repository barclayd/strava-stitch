import { createController } from 'remix/router'
import { Session } from 'remix/session'
import { getCsrfToken } from 'remix/middleware/csrf'
import { redirect } from 'remix/response/redirect'
import { zipSync, strToU8 } from 'fflate'
import * as s from 'remix/data-schema'
import { routes } from '../../routes.ts'
import { account, newJob, job, patchJob, claimUpload, type Job } from '../../data/store.ts'
import * as strava from '../../data/strava.ts'
import { merge, recording, maxPoints, mergedDescription } from './merge.ts'
import { activityFile } from './export.ts'
import { StitchPage } from './page.tsx'
import { unavailableReason } from '../../data/sports.ts'
import { track } from '../../data/analytics.ts'
import type { ServerEvent } from '../../analytics.ts'
import { previewFailureReason, type PreviewStage } from './preview-failure.ts'

function identity(session: Session) {
  const id = session.get('athleteId')
  return typeof id === 'number' ? account(id) : undefined
}
const fail = (session: Session, message: string, target = routes.home.href()) => {
  session.flash('error', message)
  return redirect(target, 303)
}
const problem = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.'
const updateStatus = async (j: Job, result: strava.Upload) => {
  const previous = j.state
  if (result.activity_id && Number.isSafeInteger(result.activity_id)) {
    j.state = 'complete'
    j.activityId = result.activity_id
    j.error = undefined
  } else if (result.error) {
    j.state = /duplicate/i.test(result.error) ? 'duplicate' : 'failed'
    j.error = String(result.error).slice(0, 500)
  } else {
    j.state = 'processing'
    const id = Number(result.id_str ?? result.id)
    if (Number.isSafeInteger(id) && id > 0) j.uploadId = id
    else {
      j.state = 'unknown'
      j.error =
        'Strava did not return an upload identifier. Check your account before trying again.'
    }
  }
  const saved = await patchJob(
    j.id,
    j.owner,
    {
      state: j.state,
      error: j.error ?? '',
      uploadId: j.uploadId,
      activityId: j.activityId,
      ...(j.state === 'duplicate' ? { removalConfirmed: false } : {}),
    },
    previous,
  )
  if (saved && saved.state !== previous) trackUploadOutcome(saved.state)
  if (!saved) {
    const current = await job(j.id, j.owner)
    if (current) Object.assign(j, current)
  }
}

function trackUploadOutcome(state: Job['state']) {
  const events: Partial<Record<Job['state'], ServerEvent>> = {
    processing: 'upload_accepted',
    complete: 'upload_completed',
    duplicate: 'upload_duplicate',
    failed: 'upload_failed',
    unknown: 'upload_unknown',
  }
  const event = events[state]
  if (event) track(event, 'preview')
}

export default createController(routes.stitches, {
  actions: {
    async create({ get }) {
      const session = get(Session),
        auth = await identity(session)
      if (!auth) return fail(session, 'Connect Strava to stitch your activities.')
      const fields = get(FormData)
      const parsed = s.parseSafe(s.array(s.string()), fields.getAll('activities'))
      if (
        !parsed.success ||
        parsed.value.length < 2 ||
        parsed.value.length > 8 ||
        parsed.value.some(
          (id) => !/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(Number(id)),
        ) ||
        new Set(parsed.value).size !== parsed.value.length
      )
        return fail(session, 'Choose between two and eight different activities.')
      let stage: PreviewStage = 'activity_load'
      try {
        const records = []
        let points = 0
        for (const value of parsed.value) {
          stage = 'activity_load'
          const id = Number(value),
            detail = await strava.activity(auth.id, id)
          if (detail.id !== id || detail.athlete?.id !== auth.id)
            return fail(session, 'Every activity must belong to your connected Strava account.')
          const unavailable = unavailableReason(detail)
          stage = 'recording_validation'
          if (unavailable) throw new Error(unavailable)
          stage = 'streams_load'
          const source = await strava.streams(auth.id, id)
          stage = 'recording_validation'
          points += source.time?.data?.length ?? 0
          if (points > maxPoints)
            throw new Error(
              'Choose activities with up to 50,000 recorded samples in total. No samples have been removed.',
            )
          records.push(recording(detail, source))
        }
        stage = 'merge_validation'
        const merged = merge(records)
        stage = 'export_failed'
        activityFile(merged.records, 'Stitched activity')
        stage = 'save_failed'
        const j = await newJob(auth.id, merged)
        track('preview_created', 'workspace')
        return redirect(routes.stitches.show.href({ id: j.id }), 303)
      } catch (error) {
        track('preview_failed', 'workspace', 'unknown', previewFailureReason(error, stage))
        return fail(session, problem(error))
      }
    },
    async show(context) {
      const session = context.get(Session),
        auth = await identity(session)
      if (!auth) return redirect(routes.home.href(), 303)
      const j = await job(context.params.id, auth.id)
      if (!j)
        return new Response('This preview has expired or is not available to this account.', {
          status: 404,
        })
      const preparation = session.get('uploadPreparation') as
        { id: string; state: 'present' | 'removed' | 'unverified' } | undefined
      return context.render(
        <StitchPage
          job={j}
          firstname={auth.firstname}
          canUpload={auth.scope.includes('activity:write')}
          csrf={getCsrfToken(context)}
          error={session.get('error') as string | undefined}
          uploadPreparation={preparation?.id === j.id ? preparation.state : undefined}
        />,
      )
    },
    async download({ get, params }) {
      const auth = await identity(get(Session)),
        j = auth ? await job(params.id, auth.id) : undefined
      if (!j) return new Response('Not found', { status: 404 })
      const file = activityFile(j.merge.records, j.title)
      track('activity_downloaded', 'preview')
      return new Response(file.data, {
        headers: {
          'Content-Type': file.contentType,
          'Content-Disposition': `attachment; filename="stitched-activity.${file.format}"`,
        },
      })
    },
    async backup({ get, params }) {
      const auth = await identity(get(Session)),
        j = auth ? await job(params.id, auth.id) : undefined
      if (!j) return new Response('Not found', { status: 404 })
      const stitched = activityFile(j.merge.records, j.title)
      const files: Record<string, Uint8Array> = {
        [`stitched-activity.${stitched.format}`]: stitched.data,
        'activities.json': strToU8(
          JSON.stringify(
            {
              title: j.title,
              description: j.description ?? mergedDescription(j.merge),
              sport_type: stitched.sport,
              sources: j.merge.records.map((r) => ({
                id: r.activity.id,
                name: r.activity.name,
                description: r.activity.description ?? '',
                sport_type: r.activity.sport_type,
              })),
            },
            null,
            2,
          ),
        ),
        'README.txt': strToU8(
          'Stitch backup\n\nThese files were reconstructed from Strava streams, not original device files. GPS recordings use GPX; recordings without GPS use FIT. Original timestamps and available GPS, elevation, temperature, heart rate and cadence are included, at the precision supported by each format. Recorded distance is included when complete across all selected activities; FIT also includes summary distances. FIT laps mark source boundaries, not original laps. Photos, kudos, comments, original laps, pool lengths, workout sets, measured power and device metadata are not included. FIT timer pauses mark gaps between recordings; original within-activity pause events are unavailable.\n\nactivities.json records the exact Strava sport. Stitch sets it automatically for direct uploads. Check the sport when importing downloaded files yourself, because file-based sport detection varies. Download original files from Strava separately if you need a complete device recording.\n',
        ),
      }
      for (const r of j.merge.records) {
        const file = activityFile([r], r.activity.name)
        files[`original-${r.activity.id}.${file.format}`] = file.data
      }
      const zip = zipSync(files)
      await patchJob(j.id, j.owner, { backupDownloaded: true })
      track('backup_downloaded', 'preview')
      return new Response(new Uint8Array(zip), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="stitch-backup.zip"',
        },
      })
    },
    async confirmRemoval({ get, params }) {
      const session = get(Session),
        auth = await identity(session),
        j = auth ? await job(params.id, auth.id) : undefined,
        target = routes.stitches.show.href({ id: params.id })
      if (!auth || !j) return new Response('Not found', { status: 404 })
      const removalFailure = (message: string, state: 'present' | 'unverified' = 'unverified') => {
        session.flash('uploadPreparation', { id: j.id, state })
        return fail(session, message, target)
      }
      if (
        !['ready', 'failed', 'duplicate'].includes(j.state) ||
        !j.backupDownloaded ||
        get(FormData).get('confirm') !== 'removed'
      )
        return removalFailure(
          'Download your backup and confirm you removed the selected originals in Strava.',
        )
      try {
        for (const r of j.merge.records) {
          try {
            await strava.activity(auth.id, r.activity.id)
            return removalFailure(
              `${r.activity.name} is still on Strava. No upload was started.`,
              'present',
            )
          } catch (error) {
            if (!(error instanceof strava.StravaError && error.status === 404)) throw error
          }
        }
        const saved = await patchJob(j.id, j.owner, { removalConfirmed: true }, j.state)
        if (!saved) return fail(session, 'This preview changed. Review its latest status.', target)
        return redirect(target, 303)
      } catch (error) {
        return removalFailure(problem(error))
      }
    },
    async upload({ get, params }) {
      const session = get(Session),
        auth = await identity(session),
        j = auth ? await job(params.id, auth.id) : undefined,
        target = routes.stitches.show.href({ id: params.id })
      if (!auth || !j) return new Response('Not found', { status: 404 })
      const form = get(FormData),
        title = form.get('title'),
        description = form.get('description') ?? j.description ?? mergedDescription(j.merge)
      if (!auth.scope.includes('activity:write'))
        return fail(session, 'Allow uploads in your Strava connection first.', target)
      if (
        form.get('confirm') !== 'upload' ||
        form.get('gaps') !== 'reviewed' ||
        typeof title !== 'string' ||
        !title.trim() ||
        title.length > 100 ||
        typeof description !== 'string'
      )
        return fail(session, 'Review the joins and confirm the upload before continuing.', target)
      if (['ready', 'failed', 'duplicate'].includes(j.state) && !j.removalConfirmed) {
        try {
          // Save edits before the backup is made, without claiming or starting an upload.
          const saved = await patchJob(j.id, j.owner, { title: title.trim(), description }, j.state)
          if (!saved)
            return fail(session, 'This preview changed. Review its latest status.', target)
          let present = false
          for (const r of j.merge.records) {
            try {
              await strava.activity(auth.id, r.activity.id)
              present = true
              break
            } catch (error) {
              if (!(error instanceof strava.StravaError && error.status === 404)) throw error
            }
          }
          session.flash('uploadPreparation', { id: j.id, state: present ? 'present' : 'removed' })
          return redirect(target, 303)
        } catch (error) {
          return fail(session, problem(error) + ' No upload was started.', target)
        }
      }
      const claimed = await claimUpload(j.id, auth.id, title.trim(), description)
      if (!claimed)
        return fail(
          session,
          'This upload has already started. Check its status before trying again.',
          target,
        )
      track('upload_started', 'preview')
      try {
        const file = activityFile(claimed.merge.records, claimed.title)
        const result = await strava.upload(
          auth.id,
          file,
          claimed.title,
          `stitch-${claimed.id}.${file.format}`,
          claimed.description ?? mergedDescription(claimed.merge),
        )
        await updateStatus(claimed, result)
      } catch (error) {
        // Do not retry a request that might already have reached Strava.
        claimed.state =
          error instanceof strava.StravaError && error.status < 500
            ? /duplicate/i.test(error.message)
              ? 'duplicate'
              : 'failed'
            : 'unknown'
        claimed.error =
          claimed.state === 'unknown'
            ? 'The connection ended before Strava confirmed the result. Check your Strava activities before starting another upload.'
            : problem(error)
        const saved = await patchJob(
          claimed.id,
          claimed.owner,
          {
            state: claimed.state,
            error: claimed.error,
            ...(claimed.state === 'duplicate' ? { removalConfirmed: false } : {}),
          },
          'submitting',
        )
        if (saved) trackUploadOutcome(saved.state)
      }
      return redirect(target, 303)
    },
    async status({ get, params }) {
      const session = get(Session),
        auth = await identity(session),
        j = auth ? await job(params.id, auth.id) : undefined
      if (!auth || !j) return new Response('Not found', { status: 404 })
      if (j.state === 'processing' && j.uploadId) {
        try {
          await updateStatus(j, await strava.get<strava.Upload>(auth.id, `/uploads/${j.uploadId}`))
        } catch (error) {
          return Response.json({ state: j.state, error: problem(error) }, { status: 503 })
        }
      }
      return Response.json({ state: j.state, error: j.error, activityId: j.activityId })
    },
  },
})

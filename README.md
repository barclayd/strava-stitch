# Stitch

Explore combining split Strava cycling activities into one ride.

## Remix application

The current application is in [`web/`](web/README.md), running locally at
[localhost:44100](http://localhost:44100). It provides activity selection, route
and timing previews, GPX and backup ZIP downloads, and explicitly confirmed
Strava uploads. The local account has now authorized `activity:write` alongside
profile and activity reading. Strava has no supported activity deletion API;
users remove originals themselves, with a separate confirmation for each retry.

See the [web app README](web/README.md) for setup, validation, preservation limits,
and the remaining public-launch requirements. The Python files and experiment
notes below document the original feasibility work.

## Agreed first milestone

Read selected activities, preview a stitched ride locally, and download a combined
activity file. The owner subsequently authorized a Strava UI upload and personally
deleted the two originals after the first upload was rejected as a duplicate.
The assistant must not delete activities or change the source recordings.

## Original prototype setup

On 6 September 2026, with the account owner's authorization, the existing Ride On
account connection was revoked and its API registration was repurposed as Stitch.
This reused the registration; it did not delete it or create a new client ID.

- Application: Stitch
- Client ID (public): `262735`
- Category: Data Importer
- Website: `http://localhost:8765`
- Authorization callback domain: `localhost`
- Client secret: stored privately in ignored `.local/client.json`; not rotated
- Initial authorization: `read activity:read_all`; the newer Remix connection
  separately adds `activity:read` and `activity:write`

Do not reuse Ride On's previous access or refresh tokens. The dashboard's default
`read` token does not establish access to activity data. The prototype now has
its own OAuth flow and verifies the scopes actually granted. The user has
requested read/write capability; the first preview used
`activity:read_all`, and the Remix app subsequently added `activity:write`. Having
write permission is not authorization to upload or modify activities.

## Successful first experiment

The following private rides were read through the official API on 6 September
2026, after the owner approved the read-only connection:

- `20063555735`: 09:15:08–10:35:02 BST, 4,169 GPS points
- `20063564353`: 10:38:10–13:13:20 BST, 8,181 GPS points

Both were recorded on a Garmin Edge 1050. The owner confirmed they were stopped
throughout the 3 minute 8 second gap. The recorded endpoints are 21.4 metres apart;
no route or distance was invented across that gap.

Outputs are in the ignored `exports/` directory:

- `stitched-2026-09-06.gpx`: 12,350 original points across two track segments
- `preview.html`: self-contained interactive route trace and comparison
- `stitched-2026-09-06.json`: machine-readable merge report

Combined Strava source summaries: 72.1747 km, 3:26:36 moving time, 748 m climbing.
Elapsed time including the stop: 3:58:12. Exported fields include GPS, original
timestamps, elevation, temperature, and cumulative recorded distance using
Strava's supported Cluetrust GPX extension. Heart rate, cadence, and power streams
were not returned for these rides. Raw source JSON retains moving/speed streams.

The GPX is reconstructed from API streams, not a lossless Garmin FIT merge. It does
not transfer device metadata, laps, photos, kudos, comments, or private notes.
An importer may recalculate distance and moving time: unfiltered geometric GPS
distance is about 72.91 km, while the included recorded-distance extension ends at
72.1747 km. The successful UI import below retained that exact distance.

### Strava UI upload test

On 6 September 2026, the owner explicitly requested uploading the generated GPX
through Strava's navbar → Upload → File. Strava responded:

> stitched-2026-09-06.gpx duplicate of Morning Ride

The duplicate link pointed to original activity `20063555735`. That first attempt
created no merged activity and did not modify or delete either original. The
file's original timestamps were not shifted to bypass duplicate detection.

The owner then personally deleted the originals and explicitly requested another
attempt. Read-only checks returned 404 for both source IDs. The unchanged GPX was
accepted through the same upload page and saved as
[Sunday ride — stitched](https://www.strava.com/activities/20063927672), with
visibility **Only You**, sport **Ride**, and bike **Canyon Grail CFR**.

The saved activity was inspected in the UI and read back through the API:

| Measure | Combined sources | Imported activity |
| --- | --- | --- |
| Distance | 72.1747 km | 72.1747 km |
| Moving time | 3:26:36 | 3:26:35 |
| Elapsed time | 3:58:12 | 3:58:12 |
| Elevation gain | 748 m | 698 m |
| GPS samples | 12,350 | 12,350 |

All timestamps match exactly. The 3:08 recording gap remains, with cumulative
distance unchanged at 22,927.9 m across the stop. Eight imported GPS samples differ
from the source coordinates by at most 5.14 m; the other 12,342 match exactly.
The full route is visible in Strava. The import recalculated climbing and moving
time, so the source summary totals should not be promised as exact import totals.
Read-back data and verification are retained privately in `.local/`.

All exported coordinates, times, elevations, and temperatures were compared to
the original API data. The file passes the official GPX 1.1 schema. Five automated
tests cover timestamp/stop preservation, distance continuity, invalid/partial
data rejection, overlap rejection, and the API client's GET endpoint allowlist.

## Run the original Python prototype

Requires Python 3.9 or later; no third-party dependencies.

```sh
# Open the connection page at http://localhost:8765, then authorize in Strava.
python3 connect.py

# Read selected recordings that still exist in Strava.
python3 stitch.py FIRST_ACTIVITY_ID SECOND_ACTIVITY_ID

# Regenerate from local source data without another API request.
python3 stitch.py --cached 20063555735 20063564353

# Open the local preview at http://localhost:8766.
python3 preview.py

# Run the merge and read-only API boundary tests.
python3 -m unittest -v
```

This is a prototype for the selected Sunday ride; preview titles and output names
currently refer to 6 September 2026. Tokens expire; reconnect if Strava returns
401. Credentials and raw recordings live in `.local/`, with private permissions,
and are excluded from version control. The preview server serves only generated
files from `exports/`; it cannot serve credentials. No upload, activity update,
or activity deletion operation is implemented.

## Feasibility findings

- The API provides activity details and time-series streams, which can be used to
  construct a combined file. Both selected rides returned full-size, aligned
  streams at high resolution.
- There is no documented activity merge operation.
- Strava accepts GPX, TCX, and FIT activity uploads, with timestamps required for
  cycling recordings.
- Uploading this merged GPX while retaining the originals was rejected as a
  duplicate of `20063555735`. Strava's merge guidance calls for deleting originals.
  The same file uploaded successfully after the owner personally deleted both
  originals. The assistant must not delete activities or shift timestamps merely
  to bypass detection.
- Reconstructing an activity from API streams is not a lossless export of the
  recording device's original file.

## Future product questions

- Data preservation priorities for future rides beyond this first experiment.
- Whether the inputs are recorded activities with timestamps, planned routes,
  original GPX/FIT/TCX files, or a mixture.
- Handling of unrecorded movement, overlaps, and multi-day rides. For this first
  experiment, the confirmed stationary gap was preserved without interpolation.
- Data to preserve: GPS, timestamps, elevation, heart rate, cadence, power,
  temperature, laps, and metadata.
- Additional sport types and importing original device files; the current
  multi-user Remix prototype supports standard Ride activities from Strava.

## Sources

- [API reference](https://developers.strava.com/docs/reference/)
- [Authentication](https://developers.strava.com/docs/authentication/)
- [Uploads](https://developers.strava.com/docs/uploads/)
- [Getting started](https://developers.strava.com/docs/getting-started/)
- [Strava merge guidance](https://support.strava.com/en-us/articles/15401839-merge-or-combine-activities)

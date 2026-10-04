# Large recordings

Stitch accepts up to **100,000 samples across two to eight activities**. At a
continuous sample per second this represents 27 hours, 46 minutes and 40 seconds
of samples. Device recording frequency and pauses vary, so this is not a duration
limit. Each sample includes its timestamp and all available sensor fields; fields
do not count as separate samples. No points are dropped to fit the limit.

## Why retain a limit?

[Cloudflare Workers have 128 MB of memory per isolate](https://developers.cloudflare.com/workers/platform/limits/#memory),
shared by concurrent requests in that isolate. The application keeps recordings
in memory for validation, exports, encryption and storage. Removing the sample
cap would not remove that platform limit.

There are also existing, independent safeguards:

- Strava JSON responses are bounded to 8,000,000 bytes each.
- Encrypted preview payloads are bounded to 24,000,000 base64 characters.
- [Serialized Durable Object RPC messages are limited to 32 MiB](https://developers.cloudflare.com/workers/runtime-apis/rpc/#limitations).

The sample cap is not a guarantee that every payload below it fits these other
bounds. Sensor availability and number precision change the size of a recording.
The fixed analytics reason `sample_limit` still identifies sample-count rejections;
we do not record actual activity sizes, values or identifiers.

## Export memory improvements

The old GPX exporter retained a separate XML string for every point, combined them
into whole-file strings, then encoded another whole-file byte buffer. It now emits
small text chunks, counts their UTF-8 length, and encodes into one exact-size buffer.
This costs a second traversal but avoids retaining those large intermediate strings.
The exported XML, Unicode text, sensor precision and track boundaries are preserved.

Backups now feed GPX chunks directly into ZIP compression and process originals
one at a time. Only compressed output is retained for the final archive. FIT
encoding still produces a complete file buffer, which is fed into ZIP in bounded
chunks. A backup is marked prepared only after archive generation succeeds, as
before. Upload confirmations and account ownership checks are unchanged.

## Local benchmark, 4 October 2026

Run from the repository root in a fresh process for each size and format:

```sh
node --import remix/node-tsx scripts/benchmark-stitches.ts 100000 gpx
node --import remix/node-tsx scripts/benchmark-stitches.ts 100000 fit
```

The script uses two synthetic recordings with distance, altitude, heart rate,
cadence and temperature; GPX also includes synthetic coordinates. It bypasses the
sample-count guard to profile candidate sizes, but never accesses real accounts,
calls Strava, or writes production data.

Observed with the revised exporter on the development machine:

| 100,000 samples | GPS / GPX | Indoor / FIT |
| --- | ---: | ---: |
| Merged export | 222 ms | 1,375 ms |
| Backup generation, including both originals | 732 ms | 3,039 ms |
| Export size | 31.3 MB | 1.6 MB |
| Encrypted preview size | 18.0 MB | 14.0 MB |

A 200,000-sample candidate produced an encrypted preview of **36.1 MB for GPS**
and **28.1 MB for indoor recordings**, both exceeding the existing 24 MB safeguard.
This is why this change raises the cap to 100,000 rather than 200,000 or unlimited.

These are local synthetic timings, not production latency or capacity guarantees.
They exclude Strava network latency. Node heap/buffer snapshots and process RSS
are diagnostic observations, not measurements of production Worker peak memory;
garbage collection, framework overhead and concurrency also matter. Coverage of
all Strava activities cannot be quantified from anonymous event counts alone.

## Validation and further increases

The local Worker/Durable Object integration test exercises a maximum-size GPS
preview with all supported sensors, storage eviction and reload, rendered preview,
download, full backup, confirmed upload and completion. FIT round-trip tests cover
the maximum count. Oversized requests still fail before creating a preview/upload.

Supporting much larger inputs should start with chunked or streamed encrypted
storage, RPC and uploads, then be profiled under representative concurrency.
Increasing `maxPoints` alone can move a clear rejection into a late storage failure
or a resource-limit error. Production resource usage should be checked after
deployment; this change does not add private activity data to logs or analytics.

"""Read-only Strava download and conservative, timestamp-preserving GPX merge."""
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
import argparse
import html
import json
import math
import os
import re
import xml.etree.ElementTree as ET

from connect import PRIVATE, ROOT, private_json

GPX = 'http://www.topografix.com/GPX/1/1'
GARMIN = 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1'
GPXDATA = 'http://www.cluetrust.com/XML/GPXDATA/1/0'
KEYS = 'time,latlng,altitude,distance,heartrate,cadence,watts,temp,moving,velocity_smooth'
ET.register_namespace('', GPX)
ET.register_namespace('gpxtpx', GARMIN)
ET.register_namespace('gpxdata', GPXDATA)

def stamp(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')

def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

def haversine(a, b):
    lat1, lat2 = map(math.radians, (a[0], b[0]))
    dlat, dlon = math.radians(b[0]-a[0]), math.radians(b[1]-a[1])
    q = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(q)))

def api_get(path, token):
    if not re.fullmatch(r'/activities/\d+(?:/streams\?keys=[a-z_,]+&key_by_type=true)?', path):
        raise ValueError('Only activity-detail and stream GET requests are allowed.')
    request = Request('https://www.strava.com/api/v3' + path, headers={'Authorization': 'Bearer ' + token}, method='GET')
    try:
        with urlopen(request, timeout=40) as response:
            return json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f'Strava returned HTTP {exc.code}. No activities were modified.') from None
    except URLError:
        raise RuntimeError('Could not reach Strava. No activities were modified.') from None

def recording(detail, streams):
    activity_id = str(detail['id'])
    if detail.get('sport_type', detail.get('type')) not in ('Ride', 'GravelRide', 'MountainBikeRide', 'EBikeRide', 'EMountainBikeRide'):
        raise ValueError(f'{activity_id}: expected an outdoor cycling recording.')
    if detail.get('manual'):
        raise ValueError(f'{activity_id}: manual activity has no usable GPS recording.')
    if not isinstance(streams, dict) or not streams.get('time', {}).get('data') or not streams.get('latlng', {}).get('data'):
        raise ValueError(f'{activity_id}: complete time and GPS streams are required.')
    times = streams['time']['data']
    count = len(times)
    for key, stream in streams.items():
        if not isinstance(stream, dict) or 'data' not in stream:
            raise ValueError(f'{activity_id}: unexpected stream structure for {key}.')
        if len(stream['data']) != count:
            raise ValueError(f'{activity_id}: {key} stream is not aligned with the time stream.')
        if stream.get('original_size', count) != count:
            raise ValueError(f'{activity_id}: {key} stream was downsampled. Use the original recording file instead.')
    if any(not finite(t) or t < 0 or int(t) != t for t in times) or any(b <= a for a,b in zip(times, times[1:])):
        raise ValueError(f'{activity_id}: timestamps must be strictly increasing elapsed seconds.')
    if 'distance' in streams:
        distances=streams['distance']['data']
        if any(not finite(d) or d < 0 for d in distances) or any(b < a for a,b in zip(distances,distances[1:])):
            raise ValueError(f'{activity_id}: distance must be nonnegative and nondecreasing.')
    start = datetime.fromisoformat(detail['start_date'].replace('Z', '+00:00'))
    if start.tzinfo is None:
        raise ValueError(f'{activity_id}: missing start-time timezone.')
    # Strava can obscure start times as midnight + one second. Never invent them.
    if detail.get('start_date_local', '').split('T')[-1] in ('00:00:01Z', '00:00:01'):
        raise ValueError(f'{activity_id}: start time may be hidden; verify using an original file.')
    points = []
    for index, elapsed in enumerate(times):
        ll = streams['latlng']['data'][index]
        if not isinstance(ll, list) or len(ll) != 2 or not all(finite(v) for v in ll) or not -90 <= ll[0] <= 90 or not -180 <= ll[1] <= 180:
            raise ValueError(f'{activity_id}: invalid GPS sample at index {index}.')
        point = {'timestamp': start.timestamp()+elapsed, 'lat': ll[0], 'lon': ll[1]}
        for key in ('altitude', 'heartrate', 'cadence', 'temp', 'distance'):
            value = streams[key]['data'][index] if key in streams else None
            if value is not None:
                if not finite(value):
                    raise ValueError(f'{activity_id}: invalid {key} sample at index {index}.')
                point[key] = value
        points.append(point)
    return {'detail': detail, 'streams': streams, 'points': points}

def merge(recordings):
    ordered = sorted(recordings, key=lambda record: record['points'][0]['timestamp'])
    if len({str(r['detail']['id']) for r in ordered}) != len(ordered):
        raise ValueError('The same activity was selected more than once.')
    joins = []
    for previous, following in zip(ordered, ordered[1:]):
        a, b = previous['points'][-1], following['points'][0]
        gap = b['timestamp']-a['timestamp']
        if gap <= 0:
            raise ValueError('The recordings overlap in time. Review the overlap before merging; no samples were discarded.')
        joins.append({'after_activity': str(previous['detail']['id']), 'before_activity': str(following['detail']['id']), 'gap_seconds': gap, 'endpoint_separation_metres': haversine((a['lat'],a['lon']), (b['lat'],b['lon'])), 'handling': 'Separate track segments; original timestamps preserved; no connecting points added.'})
    return ordered, joins

def gpx_bytes(ordered, name):
    root = ET.Element(f'{{{GPX}}}gpx', {'version':'1.1', 'creator':'Stitch'})
    metadata = ET.SubElement(root, f'{{{GPX}}}metadata')
    ET.SubElement(metadata, f'{{{GPX}}}name').text = name
    ET.SubElement(metadata, f'{{{GPX}}}desc').text = 'Combined recorded rides. Original timestamps and track boundaries preserved; no points invented. Source activity IDs: ' + ', '.join(str(r['detail']['id']) for r in ordered)
    ET.SubElement(metadata, f'{{{GPX}}}time').text = stamp(ordered[0]['points'][0]['timestamp'])
    track = ET.SubElement(root, f'{{{GPX}}}trk')
    ET.SubElement(track, f'{{{GPX}}}name').text = name
    ET.SubElement(track, f'{{{GPX}}}type').text = 'cycling'
    distance_offset = 0.0
    use_distance = all('distance' in point for record in ordered for point in record['points'])
    for record in ordered:
        segment = ET.SubElement(track, f'{{{GPX}}}trkseg')
        for point in record['points']:
            trkpt = ET.SubElement(segment, f'{{{GPX}}}trkpt', {'lat':str(point['lat']), 'lon':str(point['lon'])})
            if 'altitude' in point:
                ET.SubElement(trkpt, f'{{{GPX}}}ele').text = str(point['altitude'])
            ET.SubElement(trkpt, f'{{{GPX}}}time').text = stamp(point['timestamp'])
            # Garmin's supported extension order is temperature, heart rate, cadence.
            present = [(key, tag) for key,tag in [('temp','atemp'),('heartrate','hr'),('cadence','cad')] if key in point]
            if present or use_distance:
                extensions = ET.SubElement(trkpt, f'{{{GPX}}}extensions')
                if use_distance:
                    cumulative = distance_offset + point['distance'] - record['points'][0]['distance']
                    ET.SubElement(extensions, f'{{{GPXDATA}}}distance').text = str(round(cumulative, 3))
                if present:
                    tpe = ET.SubElement(extensions, f'{{{GARMIN}}}TrackPointExtension')
                    for key, tag in present:
                        ET.SubElement(tpe, f'{{{GARMIN}}}{tag}').text = str(point[key])
        if use_distance:
            distance_offset += record['points'][-1]['distance'] - record['points'][0]['distance']
    ET.indent(root)
    return ET.tostring(root, encoding='utf-8', xml_declaration=True)

def duration(seconds):
    seconds = int(round(seconds))
    return f'{seconds//3600}:{seconds//60%60:02}:{seconds%60:02}'

def preview_html(ordered, report, gpx_name):
    points = [p for r in ordered for p in r['points']]
    def xy(point):
        lat = max(-85.051, min(85.051, point['lat']))
        return math.radians(point['lon']), math.log(math.tan(math.pi/4 + math.radians(lat)/2))
    coords = [xy(p) for p in points]
    minx,maxx,miny,maxy = min(x for x,y in coords),max(x for x,y in coords),min(y for x,y in coords),max(y for x,y in coords)
    width,height,pad = 900,570,45
    scale = min((width-2*pad)/max(maxx-minx,1e-9),(height-2*pad)/max(maxy-miny,1e-9))
    def project(point):
        x,y=xy(point)
        return (width-(maxx-minx)*scale)/2+(x-minx)*scale, (height-(maxy-miny)*scale)/2+(maxy-y)*scale
    palette=['#15745c','#d16a2d','#5754ac','#aa426c']
    paths=[]
    rows=[]
    for i,record in enumerate(ordered):
        color=palette[i%len(palette)]
        # Every exported GPS point appears in this route preview.
        path=' '.join(f'{project(p)[0]:.3f},{project(p)[1]:.3f}' for p in record['points'])
        paths.append(f'<polyline data-part="{i}" fill="none" stroke="{color}" stroke-width="2.8" vector-effect="non-scaling-stroke" points="{path}"/>')
        detail=record['detail']
        start=datetime.fromtimestamp(record['points'][0]['timestamp'],ZoneInfo('Europe/London')).strftime('%H:%M:%S')
        end=datetime.fromtimestamp(record['points'][-1]['timestamp'],ZoneInfo('Europe/London')).strftime('%H:%M:%S')
        rows.append(f'<tr><td><span style="color:{color}">●</span> Part {i+1}</td><td>{start}–{end}</td><td>{detail["distance"]/1000:.2f} km</td><td>{duration(detail["moving_time"])}</td><td>{len(record["points"]):,}</td></tr>')
    startpt,endpt=project(points[0]),project(points[-1])
    marks=f'<circle cx="{startpt[0]}" cy="{startpt[1]}" r="6" fill="#15745c" stroke="white" stroke-width="2"/><circle cx="{endpt[0]}" cy="{endpt[1]}" r="6" fill="#d16a2d" stroke="white" stroke-width="2"/>'
    joins=''.join(f'<p>The stop between parts lasts <strong>{duration(j["gap_seconds"])}</strong>. Recorded endpoints are {j["endpoint_separation_metres"]:.1f} m apart. The GPX preserves the gap as a track boundary and adds no connecting points.</p>' for j in report['joins'])
    fields=', '.join(report['exported_fields'])
    excluded=', '.join(report['not_exported_streams']) or 'None'
    return f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sunday ride · Stitch</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#f4f5f2;color:#18352d;font:16px/1.5 -apple-system,BlinkMacSystemFont,sans-serif}}main{{max-width:1120px;padding:36px 28px;margin:auto}}header{{display:flex;justify-content:space-between;align-items:center;margin-bottom:42px}}header strong{{font-size:22px}}h1{{font-size:clamp(32px,6vw,52px);line-height:1.1;letter-spacing:-1.5px;margin:0 0 12px}}p{{color:#516158;max-width:760px}}a{{color:#216e53}}.download{{display:inline-block;background:#174f3d;color:white;padding:13px 20px;border-radius:6px;text-decoration:none;font-weight:650}}.stats{{display:flex;gap:44px;margin:32px 0;flex-wrap:wrap}}.stats strong{{font-size:30px;display:block;letter-spacing:-.8px}}.stats span{{font-size:14px;color:#516158}}.map{{background:#e7ede5;border:1px solid #d4ded1;border-radius:12px;overflow:hidden;position:relative}}svg{{width:100%;display:block;touch-action:none;cursor:grab}}svg:active{{cursor:grabbing}}.tools{{position:absolute;right:16px;top:16px;display:flex;gap:6px}}button{{border:1px solid #a6b5a5;background:white;color:#18352d;border-radius:5px;padding:8px 12px;font:inherit;cursor:pointer}}.table{{overflow:auto;margin-top:30px}}table{{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}}th{{font-size:13px;font-weight:550;color:#617268;padding:10px 14px}}td{{padding:15px 14px;border-top:1px solid #d5ddd2}}.note{{font-size:14px}}details{{margin-top:22px}}summary{{cursor:pointer;font-weight:650}}footer{{margin-top:44px;font-size:13px;color:#617268}}@media(max-width:600px){{main{{padding:24px 16px}}header{{gap:16px}}.download{{padding:11px;font-size:14px}}.stats{{gap:24px}}.stats strong{{font-size:25px}}}}</style>
<style>.tools{{position:static;justify-content:flex-end;padding:10px 14px;border-top:1px solid #d4ded1}}</style><main><header><strong>Stitch</strong><a class="download" href="{html.escape(gpx_name)}" download>Download stitched GPX</a></header><h1>Your Sunday ride, together.</h1><p>6 September 2026 · Two recordings, with the stop preserved.</p><div class="stats"><div><strong>{report['source_distance_metres']/1000:.2f} km</strong><span>Combined source distance</span></div><div><strong>{duration(report['source_moving_seconds'])}</strong><span>Combined moving time</span></div><div><strong>{duration(report['elapsed_seconds'])}</strong><span>Elapsed, including the stop</span></div><div><strong>{report['source_elevation_gain_metres']:.0f} m</strong><span>Combined source climbing</span></div></div>
<div class="map"><svg id="route" role="img" aria-label="Route of both ride recordings. Green is part one; orange is part two. No line is drawn across the recording gap." viewBox="0 0 900 570"><g id="drawing">{''.join(paths)}{marks}</g></svg><div class="tools"><button id="zoomIn" aria-label="Zoom in">+</button><button id="zoomOut" aria-label="Zoom out">−</button><button id="reset">Reset</button></div></div><p class="note">Drag to pan; use + and − to zoom. Route trace without a background map. Green: part one. Orange: part two.</p>
<div class="table"><table><thead><tr><th>Recording</th><th>Time (BST)</th><th>Distance</th><th>Moving time</th><th>GPS points</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div>{joins}
<details><summary>What is preserved</summary><p>{html.escape(fields)}. All {len(points):,} GPS points are retained, in their original time order, in two GPX track segments.</p><p>The recorded distance is included in a Cluetrust GPX extension supported by Strava. It continues across the join without adding distance for the stop. A reader that ignores this extension and simply measures between GPS points would calculate approximately {report['gps_geometry_metres']/1000:.2f} km before applying its own filtering.</p><p>Other streams retained in the local source JSON but not written to GPX: {html.escape(excluded)}. Estimated power is not exported as measured power.</p><p>Distance, moving time, and climbing above are sums of Strava’s source summaries. Software importing the GPX may recalculate these totals. This is a reconstruction from API streams, not a lossless copy of the Garmin FIT files. Laps, device metadata, photos, comments, and kudos are not transferred.</p></details><footer>Created locally with Stitch using Strava data. Totals above describe the original recordings; Strava may recalculate totals after import.</footer></main>
<script>const svg=document.getElementById('route');let v=[0,0,900,570],drag=null;function set(){{svg.setAttribute('viewBox',v.join(' '))}}function zoom(k){{const w=v[2]*k,h=v[3]*k;if(w<30||w>9000)return;v=[v[0]+(v[2]-w)/2,v[1]+(v[3]-h)/2,w,h];set()}}document.getElementById('zoomIn').onclick=()=>zoom(.75);document.getElementById('zoomOut').onclick=()=>zoom(1/.75);document.getElementById('reset').onclick=()=>{{v=[0,0,900,570];set()}};svg.onpointerdown=e=>{{drag={{x:e.clientX,y:e.clientY,v:[...v]}};svg.setPointerCapture(e.pointerId)}};svg.onpointermove=e=>{{if(!drag)return;const r=svg.getBoundingClientRect(),s=Math.max(drag.v[2]/r.width,drag.v[3]/r.height);v=[drag.v[0]-(e.clientX-drag.x)*s,drag.v[1]-(e.clientY-drag.y)*s,drag.v[2],drag.v[3]];set()}};svg.onpointerup=svg.onpointercancel=()=>drag=null;</script></html>'''

def run(ids, use_cache=False):
    if len(ids)<2 or any(not re.fullmatch(r'\d+', i) for i in ids):
        raise ValueError('Select at least two numeric activity IDs.')
    token = json.loads((PRIVATE/'tokens.json').read_text()) if not use_cache else None
    if token and 'activity:read_all' not in token.get('scope','').split():
        raise ValueError('Connect with permission to read private activities first.')
    records=[]
    for activity_id in ids:
        cache=PRIVATE/f'activity-{activity_id}.json'
        if use_cache:
            raw=json.loads(cache.read_text())
        else:
            detail=api_get('/activities/'+activity_id, token['access_token'])
            if str(detail.get('athlete',{}).get('id')) != str(token.get('athlete',{}).get('id')):
                raise ValueError('The activity belongs to a different athlete.')
            streams=api_get('/activities/'+activity_id+'/streams?keys='+KEYS+'&key_by_type=true', token['access_token'])
            raw={'detail':detail,'streams':streams}
            private_json(cache,raw)
        records.append(recording(raw['detail'],raw['streams']))
    ordered,joins=merge(records)
    fields={'GPS','timestamps'}
    exported_keys={'time','latlng'}
    for key,label in [('altitude','elevation'),('heartrate','heart rate'),('cadence','cadence'),('temp','temperature')]:
        if any(key in r['streams'] for r in ordered):
            fields.add(label);exported_keys.add(key)
    if all('distance' in r['streams'] for r in ordered):
        fields.add('recorded distance');exported_keys.add('distance')
    report={'activity_ids':[str(r['detail']['id']) for r in ordered], 'point_count':sum(len(r['points']) for r in ordered), 'start_utc':stamp(ordered[0]['points'][0]['timestamp']), 'end_utc':stamp(ordered[-1]['points'][-1]['timestamp']), 'elapsed_seconds':ordered[-1]['points'][-1]['timestamp']-ordered[0]['points'][0]['timestamp'], 'source_distance_metres':sum(r['detail']['distance'] for r in ordered),'source_moving_seconds':sum(r['detail']['moving_time'] for r in ordered),'source_elevation_gain_metres':sum(r['detail']['total_elevation_gain'] for r in ordered),'exported_fields':sorted(fields),'not_exported_streams':sorted(set().union(*(r['streams'].keys() for r in ordered))-exported_keys), 'joins':joins,'source_activity_write_requests':0,'sources':[{'id':str(r['detail']['id']),'points':len(r['points']),'device_name':r['detail'].get('device_name'),'streams':list(r['streams'])} for r in ordered]}
    report['gps_geometry_metres']=sum(haversine((a['lat'],a['lon']),(b['lat'],b['lon'])) for r in ordered for a,b in zip(r['points'],r['points'][1:]))
    output=ROOT/'exports'
    output.mkdir(mode=0o700,exist_ok=True)
    os.chmod(output,0o700)
    stem='stitched-2026-09-06'
    name='Sunday ride — stitched'
    gpx=output/(stem+'.gpx')
    gpx.write_bytes(gpx_bytes(ordered,name))
    (output/(stem+'.json')).write_text(json.dumps(report,indent=2))
    (output/'preview.html').write_text(preview_html(ordered,report,gpx.name))
    for p in (gpx,output/(stem+'.json'),output/'preview.html'):
        os.chmod(p,0o600)
    print(json.dumps(report,indent=2))
    print('GPX:',gpx)
    print('Preview:',output/'preview.html')
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('ids',nargs='+')
    parser.add_argument('--cached',action='store_true')
    args=parser.parse_args()
    try:
        run(args.ids,args.cached)
    except (ValueError,RuntimeError,FileNotFoundError) as exc:
        raise SystemExit(str(exc)) from None

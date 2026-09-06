import copy
import unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch
from stitch import GPX, GARMIN, GPXDATA, api_get, recording, merge, gpx_bytes

def fixture(activity_id, start):
    detail={'id':activity_id,'sport_type':'Ride','start_date':start,'start_date_local':start,'distance':100,'moving_time':10,'total_elevation_gain':2}
    values={'time':[0,5,10],'latlng':[[51.0,-.2],[51.0001,-.2001],[51.0002,-.2002]],'altitude':[20.1,20.2,20.3],'temp':[19,19,20],'heartrate':[100,110,115],'distance':[0,40,100]}
    return detail,{k:{'data':v,'original_size':3} for k,v in values.items()}

class StitchTests(unittest.TestCase):
    def test_preserves_samples_and_stop_in_separate_segments(self):
        first=recording(*fixture('1','2026-09-06T08:00:00Z'))
        detail,streams=fixture('2','2026-09-06T08:03:10Z')
        streams['distance']['data']=[2.9,42.9,102.9]
        second=recording(detail,streams)
        ordered,joins=merge([second,first])
        self.assertEqual(joins[0]['gap_seconds'],180)
        root=ET.fromstring(gpx_bytes(ordered,'Test ride'))
        segments=root.findall(f'.//{{{GPX}}}trkseg')
        self.assertEqual(len(segments),2)
        self.assertEqual([len(s) for s in segments],[3,3])
        times=[p.find(f'{{{GPX}}}time').text for s in segments for p in s]
        self.assertEqual(times,['2026-09-06T08:00:00Z','2026-09-06T08:00:05Z','2026-09-06T08:00:10Z','2026-09-06T08:03:10Z','2026-09-06T08:03:15Z','2026-09-06T08:03:20Z'])
        self.assertEqual(root.find(f'.//{{{GARMIN}}}hr').text,'100')
        self.assertEqual(root.find(f'.//{{{GARMIN}}}atemp').text,'19')
        self.assertEqual(segments[0][0].attrib,{'lat':'51.0','lon':'-0.2'})
        distances=[float(e.text) for e in root.findall(f'.//{{{GPXDATA}}}distance')]
        self.assertEqual(distances,[0,40,100,100,140,200])

    def test_refuses_overlap_without_discarding_samples(self):
        first=recording(*fixture('1','2026-09-06T08:00:00Z'))
        second=recording(*fixture('2','2026-09-06T08:00:08Z'))
        with self.assertRaisesRegex(ValueError,'overlap'):
            merge([first,second])
        self.assertEqual(len(first['points']),3)
        self.assertEqual(len(second['points']),3)

    def test_refuses_partial_and_unaligned_streams(self):
        detail,streams=fixture('1','2026-09-06T08:00:00Z')
        partial=copy.deepcopy(streams);partial['time']['original_size']=6
        with self.assertRaisesRegex(ValueError,'downsampled'):
            recording(detail,partial)
        unaligned=copy.deepcopy(streams);unaligned['heartrate']['data'].pop()
        with self.assertRaisesRegex(ValueError,'not aligned'):
            recording(detail,unaligned)

    def test_refuses_unreliable_timestamps_and_invalid_coordinates(self):
        detail,streams=fixture('1','2026-09-06T08:00:00Z')
        streams['time']['data']=[0,5,5]
        with self.assertRaisesRegex(ValueError,'strictly increasing'):
            recording(detail,streams)
        detail,streams=fixture('1','2026-09-06T08:00:00Z')
        streams['latlng']['data'][1]=[200,0]
        with self.assertRaisesRegex(ValueError,'invalid GPS'):
            recording(detail,streams)

    def test_api_client_cannot_call_mutation_or_unrelated_endpoints(self):
        with patch('stitch.urlopen') as request:
            for path in ['/uploads','/athlete','https://untrusted.example','/activities/1?delete=true','/activities/1/../../uploads']:
                with self.assertRaises(ValueError):
                    api_get(path,'unused-test-token')
            request.assert_not_called()

if __name__=='__main__':
    unittest.main()

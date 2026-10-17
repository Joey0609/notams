"""紧急关站离线回归：仅写临时开关，QQ 使用 mock。"""
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock, patch

from fetch.area_pair_alert import REFERENCE_GEOMETRIES, find_area_pairs, send_area_pair_alert
from main import _latest_end_time


class AreaPairAlertTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.pause = Path(self.tmp.name) / 'sitePause.js'
        self.pause.write_text("const SITE_PAUSE_UNTIL = '';\n", encoding='utf-8')
        self.state = Path(self.tmp.name) / 'alert.json'
        self.sender = Mock(return_value=True)
        self.data = {
            'CODE': ['NEW1', 'NEW2'], 'SOURCE': ['NOTAM', 'NOTAM'],
            'TIME': ['07 FEB 03:48 2099 UNTIL 07 FEB 04:07 2099',
                     '07 FEB 03:49 2099 UNTIL 08 FEB 04:10 2099'],
            'GEOMETRY': list(REFERENCE_GEOMETRIES),
        }

    def send(self):
        return send_area_pair_alert(self.data, self.state, self.sender,
                                   pause_path=self.pause, end_time_parser=_latest_end_time,
                                   now=datetime(2099, 2, 7, tzinfo=timezone.utc))

    def test_matching_pair_pause_and_deduplication(self):
        self.assertTrue(self.send())
        self.assertIn('2099-02-08T16:10:00+00:00', self.pause.read_text())
        self.assertEqual(self.sender.call_args.args[0]['body_text'], '⚠⚠⚠触发紧急关站⚠⚠⚠')
        self.assertFalse(self.send())
        self.assertEqual(self.sender.call_count, 1)

    def test_failed_send_still_pauses_and_retries(self):
        self.sender.return_value = False
        self.assertFalse(self.send())
        self.assertFalse(self.state.exists())
        self.assertIn('2099-02-08T16:10', self.pause.read_text())
        self.sender.return_value = True
        self.assertTrue(self.send())

    def test_threshold_strictly_greater_than_60(self):
        with patch('fetch.area_pair_alert.match_two_notams', return_value=(0.60, -1)):
            self.assertEqual(find_area_pairs(self.data), [])
        with patch('fetch.area_pair_alert.match_two_notams', return_value=(0.601, -1)):
            self.assertEqual(len(find_area_pairs(self.data)), 2)

    def test_real_geometries_between_60_and_95_percent_trigger(self):
        # 两个区域都向北平移 10 分，实际走历史匹配算法而非 mock。
        self.data['GEOMETRY'] = [
            'PATH|M=N391400E1071500|L=N385900E1080100|L=N383800E1075000|L=N385300E1070400|Z',
            'PATH|M=N381300E1093300|L=N380200E1100500|L=N374600E1095700|L=N375700E1092500|Z',
        ]
        pairs = find_area_pairs(self.data)
        self.assertEqual(len(pairs), 1)
        for row in pairs[0]:
            self.assertGreater(row['ratio'], 0.60)
            self.assertLess(row['ratio'], 0.95)
        self.assertTrue(self.send())

    def test_requires_two_distinct_notams(self):
        self.data = {key: values[:1] for key, values in self.data.items()}
        with patch('fetch.area_pair_alert.match_two_notams', return_value=(1, -1)):
            self.assertEqual(find_area_pairs(self.data), [])
        self.assertFalse(self.send())

    def test_maritime_or_invalid_time_does_not_trigger(self):
        self.data['SOURCE'][1] = 'MSI'
        self.assertFalse(self.send())
        self.data['SOURCE'][1] = 'NOTAM'
        self.data['TIME'][1] = 'UNKNOWN'
        self.assertFalse(self.send())
        self.assertFalse(self.sender.called)
        self.assertEqual(self.pause.read_text(), "const SITE_PAUSE_UNTIL = '';\n")

    def test_expired_pair_does_not_trigger(self):
        self.data['TIME'] = [value.replace('2099', '2026') for value in self.data['TIME']]
        self.assertFalse(self.send())

    def test_longer_existing_pause_is_preserved(self):
        self.pause.write_text("const SITE_PAUSE_UNTIL = '2099-03-01T00:00:00+08:00';", encoding='utf-8')
        self.assertTrue(self.send())
        self.assertIn('2099-03-01', self.pause.read_text())

    def test_multiple_windows_use_latest_end(self):
        self.data['TIME'][0] += '; 09 FEB 03:00 2099 UNTIL 09 FEB 05:00 2099'
        self.assertTrue(self.send())
        self.assertIn('2099-02-09T17:00:00+00:00', self.pause.read_text())


if __name__ == '__main__':
    unittest.main()

import configparser
import unittest
from unittest.mock import patch

from fetch.sources.base import DataSource, SourceResult, append_record, empty_data
from fetch.sources.daip.client import _build_payload
from fetch.sources.daip.parser import parse_daip_response
from fetch.sources.faa.client import FAAClient
from fetch.sources.faa.parser import parse_faa_response
from fetch.sources.manager import fetch_enabled_sources, get_enabled_source_names


DAIP_AREA_RAW = """
A2363/26 NOTAMN
Q)ZXXX/QRPCA/IV/NBO/W/000/999/3949N11930E009
A)ZBPE ZYSH B)2606301600 C)2608311559
E) A TEMPORARY PROHIBITED AREA ESTABLISHED BOUNDED BY:
N395600E1192100-N395600E1193300-N395100E1193900-N394300E1193900-N39
4300E1192100 BACK TO START.
F)GND G)UNL
"""


class DataSourceParserTests(unittest.TestCase):
    def test_daip_response_is_parsed_to_common_schema(self):
        response = {
            'count': 2,
            'group': [
                {
                    'name': 'ZBPE',
                    'notams': [
                        {
                            'code': 'ZBPE',
                            'list': [
                                {
                                    'id': 'A2363/26',
                                    'idshow': 'A2363/26',
                                    'key': 'ZBPE_I_ZBBBYNYX_A2363_26',
                                    'text': 'A TEMPORARY PROHIBITED AREA ESTABLISHED',
                                    'rawtext': DAIP_AREA_RAW,
                                },
                                {
                                    'id': 'A2748/26',
                                    'key': 'irrelevant',
                                    'text': 'VOR/DME U/S DUE TO MAINT.',
                                    'rawtext': 'A2748/26 NOTAMN A)ZBPE E) VOR/DME U/S',
                                },
                            ],
                        }
                    ],
                }
            ],
        }

        data = parse_daip_response(response)

        self.assertEqual(data['CODE'], ['A2363/26'])
        self.assertEqual(data['FIR'], ['ZBPE'])
        self.assertEqual(data['PLATID'], ['ZBPE_I_ZBBBYNYX_A2363_26'])
        self.assertEqual(
            data['TIME'],
            ['30 JUN 16:00 2026 UNTIL 31 AUG 15:59 2026'],
        )
        self.assertEqual(data['ALTITUDE'], ['0 ~ INF 米'])
        self.assertEqual(len(data['COORDINATES'][0].split('-')), 5)
        self.assertIn('N394300E1192100', data['COORDINATES'][0])

    def test_faa_response_is_parsed_to_same_schema(self):
        response = {
            'queries': [
                {
                    'query_type': 'location',
                    'query': 'ZBPE',
                    'notams': [
                        {
                            'notamNumber': 'A2363/26',
                            'icaoMessage': DAIP_AREA_RAW,
                            'startDate': '06/30/2026 1600',
                            'endDate': '08/31/2026 1559',
                            'transactionID': '81800001',
                        }
                    ],
                }
            ]
        }

        data = parse_faa_response(response)

        self.assertEqual(data['CODE'], ['A2363/26'])
        self.assertEqual(data['PLATID'], ['81800001'])
        self.assertEqual(data['FIR'], ['ZBPE'])
        self.assertEqual(data['TIME'], ['30 JUN 16:00 2026 UNTIL 31 AUG 15:59 2026'])

    def test_daip_request_payload_uses_configured_locations(self):
        payload = _build_payload(['ZBPE', 'ZGZU'], radius='20', sort='Criticality')

        self.assertEqual(payload['locs'], 'ZBPE ZGZU')
        self.assertEqual(payload['radius'], '20')
        self.assertEqual(payload['type'], 'LOCATION')

    def test_faa_bootstrap_403_does_not_block_json_query(self):
        class Response:
            def __init__(self, payload=None, forbidden=False):
                self.payload = payload or {}
                self.forbidden = forbidden

            def raise_for_status(self):
                if self.forbidden:
                    raise RuntimeError('bootstrap status must be ignored')

            def json(self):
                return self.payload

        class Session:
            def __init__(self):
                self.headers = self

            def update(self, _headers):
                pass

            def get(self, *_args, **_kwargs):
                return Response(forbidden=True)

            def post(self, *_args, **_kwargs):
                return Response({'notamList': []})

        client = FAAClient(retries=1, max_workers=1, max_pages=1)
        with patch('fetch.sources.faa.client.requests.Session', return_value=Session()):
            response = client.fetch_all(['ZBPE'], [])

        self.assertEqual(response['success'], 1)
        self.assertEqual(response['fail'], 0)


class DataSourceSelectionTests(unittest.TestCase):
    def test_enabled_sources_support_one_or_multiple_providers(self):
        config = configparser.ConfigParser()
        config.read_dict({'DATA_SOURCES': {'enabled': 'faa, daip'}})

        self.assertEqual(get_enabled_source_names(config), ['faa', 'daip'])

    def test_manager_uses_config_order_to_deduplicate(self):
        config = configparser.ConfigParser()
        config.read_dict({
            'DATA_SOURCES': {'enabled': 'first, second'},
            'ICAO': {'codes': 'ZBPE'},
        })

        class FirstSource(DataSource):
            name = 'first'

            def fetch(self):
                data = empty_data()
                append_record(
                    data,
                    CODE='A2363/26',
                    COORDINATES='FIRST',
                    PLATID='first-id',
                    SOURCE='NOTAM',
                    FIR='ZBPE',
                )
                return SourceResult(provider=self.name, data=data)

        class SecondSource(DataSource):
            name = 'second'

            def fetch(self):
                data = empty_data()
                append_record(
                    data,
                    CODE='A2363/26',
                    COORDINATES='SECOND',
                    PLATID='second-id',
                    SOURCE='NOTAM',
                    FIR='ZBPE',
                )
                append_record(
                    data,
                    CODE='A9999/26',
                    COORDINATES='UNIQUE',
                    PLATID='unique-id',
                    SOURCE='NOTAM',
                    FIR='ZBPE',
                )
                return SourceResult(provider=self.name, data=data)

        with patch(
            'fetch.sources.manager._source_registry',
            return_value={'first': FirstSource, 'second': SecondSource},
        ):
            batch = fetch_enabled_sources(config)

        self.assertEqual(batch.data['CODE'], ['A2363/26', 'A9999/26'])
        self.assertEqual(batch.data['COORDINATES'], ['FIRST', 'UNIQUE'])


if __name__ == '__main__':
    unittest.main()

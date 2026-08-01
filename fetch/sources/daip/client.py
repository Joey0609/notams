import warnings

import requests
from urllib3.exceptions import InsecureRequestWarning


DEFAULT_QUERY_URL = 'https://www.daip.jcs.mil/daip/mobile/query'
DEFAULT_INDEX_URL = 'https://www.daip.jcs.mil/daip/mobile/index'


class DAIPClient:
    def __init__(
        self,
        *,
        query_url=DEFAULT_QUERY_URL,
        index_url=DEFAULT_INDEX_URL,
        timeout=15,
        verify_ssl=True,
        session=None,
    ):
        self.query_url = query_url
        self.index_url = index_url
        self.timeout = timeout
        self.verify_ssl = verify_ssl
        self.session = session or requests.Session()

    def fetch_locations(self, locations, radius='10', sort='Criticality'):
        headers = {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Content-Type': 'application/json',
            'Referer': self.index_url,
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/140.0.0.0 Safari/537.36'
            ),
        }
        with warnings.catch_warnings():
            if not self.verify_ssl:
                warnings.simplefilter('ignore', InsecureRequestWarning)
            self.session.get(
                self.index_url,
                headers=headers,
                timeout=self.timeout,
                verify=self.verify_ssl,
            ).raise_for_status()
            response = self.session.post(
                self.query_url,
                headers=headers,
                json=_build_payload(locations, radius=radius, sort=sort),
                timeout=self.timeout,
                verify=self.verify_ssl,
            )
        response.raise_for_status()
        payload = response.json()
        if payload.get('error'):
            raise RuntimeError(f"DAIP returned an error: {payload['error']}")
        return payload


def _build_payload(locations, radius='10', sort='Criticality'):
    return {
        'locs': ' '.join(locations),
        'poa': '',
        'pod': '',
        'alternates': '',
        'route': '',
        'radius': str(radius),
        'runwayLength': '',
        'runwayWidth': '',
        'airportType': '',
        'type': 'LOCATION',
        'notamId': '',
        'acode': '',
        'artcc': '',
        'tfrsOnly': '',
        'orgLoc': '',
        'lat1': '',
        'lat2': '',
        'lng1': '',
        'lng2': '',
        'latdir': '',
        'longdir': '',
        'includeRegulatoryNotices': '',
        'briefing': '',
        'scheduleDate': '',
        'sendTime': '',
        'active': '',
        'sunday': '',
        'monday': '',
        'tuesday': '',
        'wednesday': '',
        'thursday': '',
        'friday': '',
        'saturday': '',
        'sort': sort,
    }

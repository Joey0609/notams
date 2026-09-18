import json
import time
import warnings
from pathlib import Path

import requests
from urllib3.exceptions import InsecureRequestWarning


DEFAULT_QUERY_URL = 'https://www.daip.jcs.mil/daip/mobile/query'
DEFAULT_INDEX_URL = 'https://www.daip.jcs.mil/daip/mobile/index'
DEFAULT_BATCH_SIZE = 46
DEFAULT_BATCH_DELAY = 2


class DAIPClient:
    def __init__(
        self,
        *,
        query_url=DEFAULT_QUERY_URL,
        index_url=DEFAULT_INDEX_URL,
        timeout=15,
        verify_ssl=True,
        batch_size=DEFAULT_BATCH_SIZE,
        batch_delay=DEFAULT_BATCH_DELAY,
        session=None,
    ):
        self.query_url = query_url
        self.index_url = index_url
        self.timeout = timeout
        self.verify_ssl = verify_ssl
        self.batch_size = max(1, int(batch_size))
        self.batch_delay = max(0, float(batch_delay))
        self.session = session or requests.Session()

    def fetch_locations(self, locations, radius='10', sort='Criticality'):
        locations = [str(location).strip() for location in (locations or []) if str(location).strip()]
        if not locations:
            return {'group': [], 'count': 0}

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
            merged_payload = {'group': [], 'count': 0}
            location_batches = [
                locations[index:index + self.batch_size]
                for index in range(0, len(locations), self.batch_size)
            ]
            batch_count = len(location_batches)
            for index, location_batch in enumerate(location_batches, start=1):
                print(
                    f'[data-source:daip] 正在获取第 {index}/{batch_count} 批: '
                    f"{' '.join(location_batch)}"
                )
                self.session.get(
                    self.index_url,
                    headers=headers,
                    timeout=self.timeout,
                    verify=self.verify_ssl,
                ).raise_for_status()
                response = self.session.post(
                    self.query_url,
                    headers=headers,
                    json=_build_payload(location_batch, radius=radius, sort=sort),
                    timeout=self.timeout,
                    verify=self.verify_ssl,
                )
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict):
                    raise RuntimeError('DAIP returned an invalid response format')
                if payload.get('error'):
                    raise RuntimeError(f"DAIP returned an error: {payload['error']}")
                merged_payload['group'].extend(payload.get('group', []) or [])
                try:
                    batch_result_count = int(payload.get('count', 0) or 0)
                except (TypeError, ValueError):
                    batch_result_count = 0
                merged_payload['count'] += batch_result_count
                print(
                    f'[data-source:daip] 第 {index}/{batch_count} 批返回 '
                    f'{batch_result_count} 条，上游累计 {merged_payload["count"]} 条'
                )
                if index < batch_count:
                    time.sleep(self.batch_delay)
        # self._export_unfiltered_payload(merged_payload, locations)
        return merged_payload

    @staticmethod
    def _export_unfiltered_payload(payload, locations):
        """Persist the complete upstream response before any parser filtering."""
        root = Path(__file__).resolve().parents[3]
        output_dir = root / 'temp' / 'daip_upstream_raw'
        output_dir.mkdir(parents=True, exist_ok=True)
        name = '_'.join(locations[:3]) + (f'_plus_{len(locations) - 3}' if len(locations) > 3 else '')
        output_path = output_dir / f'{name}.json'
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'[data-source:daip] 未筛选上游响应已导出: {output_path} ({payload.get("count", 0)} 条)')


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

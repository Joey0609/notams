import random
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests


DEFAULT_SEARCH_URL = 'https://notams.aim.faa.gov/notamSearch/search'
DEFAULT_INDEX_URL = 'https://notams.aim.faa.gov/notamSearch/nsapp.html'


class FAAClient:
    def __init__(
        self,
        *,
        search_url=DEFAULT_SEARCH_URL,
        index_url=DEFAULT_INDEX_URL,
        timeout=7,
        retries=2,
        max_workers=2,
        max_pages=100,
    ):
        self.search_url = search_url
        self.index_url = index_url
        self.timeout = timeout
        self.retries = retries
        self.max_workers = max_workers
        self.max_pages = max_pages

    def fetch_all(self, locations, freeform_terms):
        tasks = [('location', value) for value in locations]
        tasks.extend(('freeform', value) for value in freeform_terms)
        results = []
        failures = []

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_map = {
                executor.submit(self._fetch_with_retry, query_type, value): (query_type, value)
                for query_type, value in tasks
            }
            for future in as_completed(future_map):
                query_type, value = future_map[future]
                try:
                    notams = future.result()
                    results.append({
                        'query_type': query_type,
                        'query': value,
                        'notams': notams,
                    })
                    print(f'[FAA:{query_type}:{value}] 获取 {len(notams)} 条 NOTAM')
                except Exception as exc:
                    failures.append({'query_type': query_type, 'query': value, 'error': str(exc)})
                    print(f'[FAA:{query_type}:{value}] 最终失败: {exc}')
        return {
            'queries': results,
            'success': len(results),
            'fail': len(failures),
            'failures': failures,
        }

    def _fetch_with_retry(self, query_type, value):
        last_error = None
        for attempt in range(1, self.retries + 1):
            try:
                return self._fetch_query(query_type, value)
            except Exception as exc:
                last_error = exc
                print(f'[FAA:{query_type}:{value}] 第 {attempt} 次请求失败: {exc}')
                if attempt < self.retries:
                    time.sleep(3)
        raise last_error

    def _fetch_query(self, query_type, value):
        session = requests.Session()
        session.headers.update(self._headers(self.index_url))
        # FAA currently returns 403 for this browser bootstrap request in some
        # environments, while the session's following JSON POST remains valid.
        # Preserve the legacy behavior: establish cookies when possible, but do
        # not reject the query solely because the bootstrap page returned 403.
        session.get(self.index_url, timeout=self.timeout)

        if query_type == 'freeform':
            payload = {
                'searchType': '4',
                'offset': '0',
                'freeFormText': value,
                'notamsOnly': 'false',
            }
        else:
            payload = {
                'searchType': '0',
                'designatorsForLocation': value,
                'offset': '0',
                'notamsOnly': 'false',
            }

        page = 0
        page_size = 30
        output = []
        while page_size == 30 and page < self.max_pages:
            payload['offset'] = str(page * 30)
            response = session.post(self.search_url, data=payload, timeout=self.timeout)
            response.raise_for_status()
            items = response.json().get('notamList', []) or []
            page_size = len(items)
            output.extend(items)
            page += 1
        return output

    @staticmethod
    def _headers(index_url):
        user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_1) '
            'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
        ]
        return {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Origin': 'https://notams.aim.faa.gov',
            'Referer': index_url,
            'User-Agent': random.choice(user_agents),
        }

import json
import re
from pathlib import Path

from ..base import DataSource, SourceResult, empty_data
from .client import MSAClient
from .parser import parse_records
from .cache import load_cache, reset_pending, stage_cache


def previous_official_urls(snapshot_path='data_dict.json'):
    path = Path(snapshot_path)
    if not path.exists():
        return []
    # 损坏的快照不是可靠缓存；上报，不静默丢掉旧公告。
    payload = json.loads(path.read_text(encoding='utf-8'))
    raw_messages = payload.get('CHINA_MSA_DATA', {}).get('RAWMESSAGE', [])
    return list(dict.fromkeys(url for raw in raw_messages for url in re.findall(
        r'官方原文:\s*(https://www\.msa\.gov\.cn/[^\s]+)', str(raw))))


class MSADataSource(DataSource):
    name = 'msa'

    def fetch(self):
        reset_pending()
        try:
            get = lambda key, fallback: self.config.get('MSA', key, fallback=str(fallback))
            cache_path = get('cache_path', 'data/msa_cache.json')
            cached = load_cache(cache_path)
            client = MSAClient(timeout=float(get('timeout', 15)), retries=int(get('retries', 2)),
                               max_workers=int(get('max_workers', 2)), delay=float(get('request_delay', .2)),
                               lookback_days=int(get('lookback_days', 30)), max_pages=int(get('max_pages_per_bureau', 80)),
                               index_url=get('index_url', 'https://www.msa.gov.cn/94df14ce1110415da44e67593e76619f/index.jhtml'))
            # 有缓存时只请求新增详情，旧正文从独立缓存恢复。
            previous_urls = [] if cached['latest'] else previous_official_urls()
            details, errors, stats = client.fetch_details(previous_urls, latest=cached['latest'])
            if errors:
                return SourceResult(provider=self.name, success=False, error='; '.join(errors), stats=stats)
            merged = {item['url']: item for item in details}
            for item in cached['details']:
                merged.setdefault(item['url'], item)
            details = list(merged.values())
            data, skipped = parse_records(details)
            stats['unparsed'] = skipped
            latest = dict(cached['latest'])
            latest.update(stats.get('latest', {}))
            stage_cache(cache_path, latest, details)
            return SourceResult(provider=self.name, data=data, stats=stats)
        except Exception as exc:
            return SourceResult(provider=self.name, data=empty_data(), success=False, error=str(exc))

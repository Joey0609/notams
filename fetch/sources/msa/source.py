import json
import re
import time
from pathlib import Path

from ..base import DataSource, SourceResult, empty_data
from .client import MSAClient
from .parser import parse_records
from .cache import load_cache, reset_pending, stage_cache
from .log import log


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
        started = time.perf_counter()
        log('开始', '开始获取中国海事局航行警告')
        reset_pending()
        try:
            get = lambda key, fallback: self.config.get('MSA', key, fallback=str(fallback))
            cache_path = get('cache_path', 'data/msa_cache.json')
            cached = load_cache(cache_path)
            client = MSAClient(timeout=float(get('timeout', 15)), retries=int(get('retries', 2)),
                               max_workers=int(get('max_workers', 2)), delay=float(get('request_delay', .2)),
                               lookback_days=int(get('lookback_days', 30)), max_pages=int(get('max_pages_per_bureau', 80)),
                               index_url=get('index_url', 'https://www.msa.gov.cn/94df14ce1110415da44e67593e76619f/index.jhtml'))
            log('配置', f'回看 {client.lookback_days} 天，每局上限 {client.max_pages} 页，超时 {client.timeout:g} 秒，重试 {client.retries} 次，并发 {client.max_workers}，请求间隔 {client.delay:g} 秒')
            # 有缓存时只请求新增详情，旧正文从独立缓存恢复。
            previous_urls = [] if cached['latest'] else previous_official_urls()
            log('模式', f"{'增量抓取' if cached['latest'] else '首次回看'}，恢复旧快照详情 {len(previous_urls)} 篇")
            details, errors, stats = client.fetch_details(previous_urls, latest=cached['latest'])
            if errors:
                log('失败保护', f'获取失败 {len(errors)} 项，本轮结果无效，不暂存新缓存；保留旧快照和缓存，耗时 {time.perf_counter() - started:.2f} 秒')
                return SourceResult(provider=self.name, success=False, error='; '.join(errors), stats=stats)
            fetched_count = len(details)
            merged = {item['url']: item for item in details}
            for item in cached['details']:
                merged.setdefault(item['url'], item)
            details = list(merged.values())
            log('缓存合并', f"本轮详情 {fetched_count} 篇，原缓存 {len(cached['details'])} 篇，合并去重 {len(details)} 篇")
            data, skipped = parse_records(details)
            stats['unparsed'] = skipped
            latest = dict(cached['latest'])
            latest.update(stats.get('latest', {}))
            stage_cache(cache_path, latest, details)
            log('完成', f"有效航警区域 {len(data['CODE'])} 条，存在解析说明的公告 {len(skipped)} 篇，耗时 {time.perf_counter() - started:.2f} 秒；编号: {', '.join(data['CODE']) or '无'}")
            return SourceResult(provider=self.name, data=data, stats=stats)
        except Exception as exc:
            log('失败', f'本轮无效，保留旧数据和缓存，耗时 {time.perf_counter() - started:.2f} 秒，{type(exc).__name__}: {exc}')
            return SourceResult(provider=self.name, data=empty_data(), success=False, error=str(exc))

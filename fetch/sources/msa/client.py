"""官方 HTML 获取；失败与结构变化必须上报，不能伪装成空结果。"""
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from .parser import parse_detail, relevant


INDEX_URL = 'https://www.msa.gov.cn/94df14ce1110415da44e67593e76619f/index.jhtml'
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9', 'Referer': 'https://www.msa.gov.cn/',
}


def official_url(value, base=INDEX_URL):
    url = urljoin(base, value)
    if urlparse(url).hostname != 'www.msa.gov.cn' or urlparse(url).scheme not in {'http', 'https'}:
        raise ValueError(f'非中国海事局官方地址: {url}')
    return url


def discover_columns(html, base=INDEX_URL):
    soup = BeautifulSoup(html, 'html.parser')
    # 只取“航行警告”导航，不能误抓下一个“航行通告”菜单。
    for group in soup.select('li.left_nav_list'):
        title = group.select_one('.nav_lv1_text')
        if title and '航行警告' in title.get_text():
            columns = []
            for link in group.select('.nav_lv2_list a[href]'):
                label = link.get_text(' ', strip=True)
                if '海事局' in label and re.search(r'/index\.(?:jhtml|html)$', link['href']):
                    columns.append({'bureau': label, 'url': official_url(link['href'], base)})
            if columns:
                return columns
    raise ValueError('中国海事局航行警告栏目导航未识别')


def parse_list(html, column):
    soup = BeautifulSoup(html, 'html.parser')
    items = []
    for link in soup.select('a[href]'):
        name, date = link.select_one('span.name'), link.select_one('span.time')
        if name and date:
            published = date.get_text(strip=True)
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', published):
                raise ValueError('中国航警列表发布日期格式变化')
            items.append(dict(column, url=official_url(link['href'], column['url']),
                              title=name.get_text(' ', strip=True), published=published))
    count = re.search(r'pageParam\.count\s*=\s*(\d+)', html)
    limit = re.search(r'pageParam\.limit\s*=\s*(\d+)', html)
    if count and limit and int(limit[1]) > 0:
        pages = max(1, math.ceil(int(count[1]) / int(limit[1])))
    elif column['url'].endswith('.html') and items:
        pages = 1
    else:
        raise ValueError(f"中国航警分页结构变化: {column['url']}")
    if not items and (not count or int(count[1]) > 0):
        raise ValueError(f"中国航警列表为空或模板变化: {column['url']}")
    return items, pages


def candidate_title(title):
    # 明确航天活动、撤销公告和无活动描述的编号标题需读取正文。
    if relevant(title) or re.search(r'取消|撤销|解除|CANCEL', title, re.I):
        return True
    description = re.sub(r'[\u4e00-\u9fff]{1,8}航警\s*\d+/\d+|\b[A-Z]{1,8}\s*\d+/\d+', '', title, flags=re.I)
    return not re.sub(r'[\s—\-:：()（）]|航行警告|航警|NAVIGATIONAL WARNING', '', description, flags=re.I)


class MSAClient:
    def __init__(self, *, timeout=15, retries=2, max_workers=2, delay=0.2,
                 lookback_days=30, max_pages=80, index_url=INDEX_URL):
        self.timeout, self.retries = timeout, max(0, retries)
        self.max_workers, self.delay = max(1, max_workers), max(0, delay)
        self.lookback_days, self.max_pages = max(1, lookback_days), max(1, max_pages)
        self.index_url = official_url(index_url)

    def get_text(self, url):
        url = official_url(url)
        for attempt in range(self.retries + 1):
            try:
                if self.delay:
                    time.sleep(self.delay)
                response = requests.get(url, headers=HEADERS, timeout=self.timeout)
                response.raise_for_status()
                # 官网声明 UTF-8，不能沿用 requests 对 text/html 的 ISO-8859-1 默认值。
                response.encoding = 'utf-8'
                text = response.text
                if '<html' not in text.lower():
                    raise ValueError(f'中国航警返回非 HTML: {url}')
                return text
            except requests.RequestException as exc:
                status = getattr(getattr(exc, 'response', None), 'status_code', None)
                if attempt >= self.retries or status in {400, 401, 403, 404}:
                    raise
                time.sleep(min(2, attempt + 1))

    def fetch_details(self, previous_urls=(), now=None, latest=None):
        latest = latest or {}
        newest = {}
        cutoff = (now or datetime.utcnow()) - timedelta(days=self.lookback_days)
        index_html = self.get_text(self.index_url)
        columns = discover_columns(index_html, self.index_url)
        errors, coverage = [], []

        def scan(column):
            found, page, pages = [], 1, 1
            while page <= pages:
                page_url = column['url'] if page == 1 else column['url'].replace('/index.jhtml', f'/index_{page}.jhtml')
                html = index_html if page_url == self.index_url else self.get_text(page_url)
                items, pages = parse_list(html, column)
                if page == 1 and items:
                    newest[column['url']] = items[0]['url']
                marker = latest.get(column['url'])
                reached_marker = False
                if marker:
                    for offset, item in enumerate(items):
                        if item['url'] == marker:
                            items = items[:offset]
                            reached_marker = True
                            break
                recent = [item for item in items if datetime.strptime(item['published'], '%Y-%m-%d') >= cutoff.replace(hour=0, minute=0, second=0, microsecond=0)]
                found.extend(item for item in recent if candidate_title(item['title']))
                if reached_marker or not items or not recent or page >= pages:
                    return found, {'bureau': column['bureau'], 'pages': page, 'complete': True, 'reached_cached_latest': reached_marker}
                if page >= self.max_pages:
                    raise ValueError(f"{column['bureau']}在回看范围内超过 {self.max_pages} 页，抓取不完整")
                page += 1
            return found, {'bureau': column['bureau'], 'pages': page, 'complete': True}

        items = {}
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = [(column, executor.submit(scan, column)) for column in columns]
            for column, future in futures:
                try:
                    found, stats = future.result()
                    coverage.append(stats)
                    items.update((item['url'], item) for item in found)
                except Exception as exc:
                    errors.append(f"{column['bureau']}: {exc}")
        # 旧活动公告即使已离开发布日期回看范围，也每轮重读详情，捕捉修改/延期。
        for url in previous_urls:
            url = official_url(url)
            items.setdefault(url, {'url': url, 'title': '', 'published': '', 'bureau': ''})
        details = []
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = [(item, executor.submit(self.get_text, item['url'])) for item in items.values()]
            for item, future in futures:
                try:
                    details.append(parse_detail(future.result(), item))
                except Exception as exc:
                    errors.append(f"{item['url']}: {exc}")
        return details, errors, {'columns': len(columns), 'details': len(details), 'coverage': coverage, 'latest': newest}

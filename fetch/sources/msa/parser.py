"""中国海事局航警：只根据正文明确给出的时间和区域生成地图数据。"""
import re
import unicodedata
from datetime import datetime, timedelta, timezone

from bs4 import BeautifulSoup

from ..base import append_record, empty_data
from ..common import is_relevant_aerospace_area
from ..geometry import path_geometry
from ...MSI_FETCH import format_window, parse_time_segment
from .log import log


CODE_RE = re.compile(r'([京冀晋蒙辽吉黑沪苏浙皖闽赣鲁豫鄂湘粤桂琼川贵云藏陕甘青宁新港澳台深连舟甬温]{1,3}航警)\s*(\d{1,5})\s*/\s*(\d{2,4})')


def normalize_text(text):
    return unicodedata.normalize('NFKC', str(text or '')).replace('\xa0', ' ')


def warning_code(text):
    match = CODE_RE.search(normalize_text(text))
    if not match:
        return ''
    prefix, number, year = match.groups()
    return f'{prefix}{int(number)}/{year}'


def parse_detail(html, item):
    soup = BeautifulSoup(html, 'html.parser')
    def meta(name, fallback=''):
        tag = soup.find('meta', attrs={'name': name})
        return normalize_text(tag.get('content', fallback)) if tag else fallback
    body = soup.select_one('#ch_p')
    if body is None:
        raise ValueError(f"中国航警正文结构变化: {item['url']}")
    for tag in body.select('.foot_but, script, style'):
        tag.decompose()
    raw = '\n'.join(p.get_text(' ', strip=True) for p in body.select('p') if p.get_text(strip=True))
    if not raw:
        raw = body.get_text('\n', strip=True)
    if not raw or (body.select('img') and not CODE_RE.search(normalize_text(raw))):
        raise ValueError(f"中国航警正文为空或仅含图片: {item['url']}")
    return dict(item, title=meta('ArticleTitle', item.get('title', '')),
                published=meta('PubDate', item.get('published', '')),
                modified=meta('ModifyDate'), authority=meta('ContentSource', item.get('bureau', '')),
                raw=raw)


def relevant(text):
    text = normalize_text(text)
    return is_relevant_aerospace_area(text, require_full_altitude=False) or bool(
        re.search(r'(?:航天器|飞船|空间飞行器).{0,20}(?:再入|返回|回收|残骸)|(?:再入|返回).{0,20}(?:航天器|飞船)', text)
    )


def _year(value, published):
    reference = int(published[:4]) if re.match(r'^\d{4}-', published or '') else None
    if len(value) == 4:
        return int(value)
    if reference is None:
        raise ValueError('两位年份需要发布日期校验')
    candidates = [reference // 100 * 100 + int(value) + offset for offset in (-100, 0, 100)]
    return min(candidates, key=lambda y: abs(y - reference))


def _clock(value):
    value = value.replace(':', '')
    hour, minute = int(value[:-2]), int(value[-2:])
    if minute >= 60 or hour > 24 or (hour == 24 and minute):
        raise ValueError('无效时刻')
    return timedelta(hours=hour, minutes=minute)


def parse_windows(text, year):
    text = normalize_text(text)
    # 每日窗口逐日展开；2400 与跨午夜均按次日处理，不填补日间空白。
    daily = re.compile(
        r'(?:自|从)?(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(?:至|到|[-—~])\s*'
        r'(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日[，,\s]*(?:每日|每天)\s*'
        r'(\d{3,4}|\d{1,2}:\d{2})\s*时?\s*(?:至|到|[-—~])\s*(\d{3,4}|\d{1,2}:\d{2})\s*时')
    windows = []
    for match in daily.finditer(text):
        sy, sm, sd, ey, em, ed, start, end = match.groups()
        sm, em = int(sm), int(em or sm)
        sy = int(sy or year)
        ey = int(ey or (sy + (em < sm)))
        day, last = datetime(sy, sm, int(sd)), datetime(ey, em, int(ed))
        if last < day or (last - day).days > 366:
            raise ValueError('无效每日日期范围')
        start, end = _clock(start), _clock(end)
        while day <= last:
            begin, finish = day + start, day + end
            if finish <= begin:
                finish += timedelta(days=1)
            windows.append((begin - timedelta(hours=8), finish - timedelta(hours=8)))
            day += timedelta(days=1)
    if windows:
        return windows
    # 连续窗口，可省略结束月份/年份，不能用发布日期替代活动日期。
    continuous = re.compile(
        r'(?:自|从)?(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*'
        r'(\d{3,4}|\d{1,2}:\d{2})\s*时\s*(?:至|到|[-—~])\s*'
        r'(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日\s*(\d{3,4}|\d{1,2}:\d{2})\s*时')
    for match in continuous.finditer(text):
        sy, sm, sd, start, ey, em, ed, end = match.groups()
        sm, em = int(sm), int(em or sm)
        sy = int(sy or year)
        ey = int(ey or (sy + (em < sm)))
        begin = datetime(sy, sm, int(sd)) + _clock(start)
        finish = datetime(ey, em, int(ed)) + _clock(end)
        if finish <= begin:
            raise ValueError('连续窗口结束不晚于开始')
        windows.append((begin - timedelta(hours=8), finish - timedelta(hours=8)))
    # 中文同一天 HHMM 至 HHMM。
    if not windows:
        single = re.search(r'(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日[，,\s]*(\d{3,4}|\d{1,2}:\d{2})时\s*(?:至|到|[-—~])\s*(\d{3,4}|\d{1,2}:\d{2})时', text)
        if single:
            y, m, d, start, end = single.groups()
            day = datetime(int(y or year), int(m), int(d))
            begin, finish = day + _clock(start), day + _clock(end)
            if finish <= begin:
                finish += timedelta(days=1)
            windows.append((begin - timedelta(hours=8), finish - timedelta(hours=8)))
    return windows


COMPONENT = r'(\d{1,3})[-°]\s*(\d{1,2}(?:\.\d+)?)(?:[-′\']\s*(\d{1,2}(?:\.\d+)?))?[′\'″\"]?\s*([NSEW])'
COORD_RE = re.compile(COMPONENT + r'[\s,，;/]*' + COMPONENT, re.I)


def _component(degree, minute, second, direction, latitude):
    degree, minute, second = int(degree), float(minute), float(second or 0)
    direction = direction.upper()
    limit = 90 if latitude else 180
    if direction not in ('NS' if latitude else 'EW') or minute >= 60 or second >= 60:
        raise ValueError('无效经纬度方向/分秒')
    if degree > limit or (degree == limit and (minute or second)):
        raise ValueError('经纬度越界')
    # 四舍五入到统一 DMS 精度，并正确进位（避免出现 60 秒）。
    seconds = round(degree * 3600 + minute * 60 + second)
    deg, rest = divmod(seconds, 3600)
    mins, secs = divmod(rest, 60)
    return f'{direction}{deg:02d}{mins:02d}{secs:02d}' if latitude else f'{direction}{deg:03d}{mins:02d}{secs:02d}'


def parse_geometries(text):
    text = normalize_text(text).upper().replace('–', '-').replace('—', '-')
    # 明确的多区域分隔；宁可不绘制模糊区域，也不把不同区域连接成大面。
    blocks = re.split(r'(?:区域|落区)\s*[一二三四五六七八九十\d]+\s*[:：、.]', text)
    geometries = []
    for block in blocks:
        matches = list(COORD_RE.finditer(block))
        circles = []
        consumed = set()
        for i, match in enumerate(matches):
            tail_end = matches[i + 1].start() if i + 1 < len(matches) else len(block)
            tail = block[match.end():tail_end]
            radius = re.search(r'为中心[，,\s]*(\d+(?:\.\d+)?)\s*(海里|千米|公里|米|NM|KM)\s*为半径', tail)
            if radius and '圆' in tail and float(radius[1]) > 0:
                center = _component(*match.groups()[:4], True) + _component(*match.groups()[4:], False)
                unit = {'海里': 'NM', '千米': 'KM', '公里': 'KM', '米': 'M'}.get(radius[2], radius[2])
                value = float(radius[1])
                if unit == 'M':
                    value, unit = value / 1000, 'KM'
                circles.append(f'CIRCLE|C={center}|R={value:g}{unit}')
                consumed.add(i)
        geometries.extend(circles)
        others = [m for i, m in enumerate(matches) if i not in consumed]
        if not others:
            continue
        if re.search(r'航经|拖带|航线|起点|终点', block) and not re.search(r'连线|围成|围合|区域内|BOUND', block):
            continue
        if len(others) >= 3 and re.search(r'连线|围成|围合|区域内|BOUND', block):
            # 同一块含多个未标明分组的多边形，不猜边界。
            if circles or re.search(r'多个区域|各区域', block):
                continue
            coords = [_component(*m.groups()[:4], True) + _component(*m.groups()[4:], False) for m in others]
            geometry = path_geometry(coords)
            if geometry:
                geometries.append(geometry)
    return list(dict.fromkeys(geometries))


def cancelled_codes(text):
    """只提取取消动作的明确宾语，不能把替代公告自身编号一起取消。"""
    text = normalize_text(text)
    result = set()
    for action in re.finditer(r'取消|撤销|解除|CANCEL(?:LED)?', text, re.I):
        before = text[:action.start()]
        if re.search(r'(?:不|未|无需|不予|不得|尚未)\s*$', before):
            continue
        tail = re.sub(r'^(?:(?:原|此前|已发布的|航行警告|航警|编号为|编号|第|的|通知|通告)|[：:\s—-])+', '', text[action.end():])
        found = False
        while True:
            match = CODE_RE.match(tail)
            if not match:
                break
            result.add(warning_code(match.group()))
            found = True
            tail = re.sub(r'^[号\s,，、及和与/&]+', '', tail[match.end():])
        if not found:
            # 兼容“琼航警190/26号航行警告现予取消”，只取紧邻动作的编号。
            match = re.search(CODE_RE.pattern + r'(?:号|航行警告|现予|予以|现|已|\s)*$', before)
            if match:
                result.add(warning_code(match.group()))
    return result


def parse_records(details, now=None):
    """返回统一列及未解析诊断；无几何公告保留文字卡片，不制造区域。"""
    output = empty_data()
    skipped = []
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    if now.tzinfo:
        now = now.astimezone(timezone.utc).replace(tzinfo=None)
    cancelled = set()
    for item in details:
        cancelled.update(cancelled_codes(item['title']))
        cancelled.update(cancelled_codes(item['raw']))
    log('正文筛选', f"开始检查 {len(details)} 篇公告，明确取消目标 {len(cancelled)} 个: {', '.join(sorted(cancelled)) or '无'}")
    seen = set()
    for item in details:
        raw, title = item['raw'], item['title']
        code = warning_code(title) or warning_code(raw)
        if not code or code in cancelled or not relevant(title + ' ' + raw) or code in seen:
            why = '编号未识别' if not code else ('明确已取消' if code in cancelled else ('非航天相关' if not relevant(title + ' ' + raw) else '同编号重复'))
            log('排除', f'{code or title or item["url"]}: {why}')
            continue
        seen.add(code)
        reason = []
        try:
            year = _year(code.rsplit('/', 1)[1], item.get('published', ''))
            windows = parse_windows(raw, year)
            # 只对明确使用 UTC 的英文正文复用 MSI 英文时间语法。
            if not windows and re.search(r'\bUTC\b|\d{4}Z', raw):
                time_text = ';'.join(parse_time_segment(raw, year))
            else:
                time_text = ';'.join(format_window(start, end) for start, end in windows)
            if windows and max(end for _, end in windows) < now - timedelta(hours=24):
                log('排除', f'{code}: 活动已结束超过 24 小时，最后结束时间 {max(end for _, end in windows):%Y-%m-%d %H:%M} UTC')
                continue
            if not time_text:
                reason.append('活动时间未解析，不推断日期')
        except ValueError as exc:
            time_text = ''
            reason.append(f'活动时间未解析: {exc}')
        try:
            geometries = parse_geometries(raw)
        except ValueError as exc:
            geometries = []
            reason.append(str(exc))
        if not geometries:
            reason.append('未识别明确区域边界，未绘制')
        log('时间解析', f"{code}: {time_text or '未解析，不推断活动日期'}")
        log('区域解析', f"{code}: {len(geometries)} 个明确区域，类型 {', '.join(geometry.split('|', 1)[0] for geometry in geometries) or '无，保留文字条目'}")
        metadata = '\n'.join(filter(None, [title, f"发布单位: {item.get('authority', '')}",
                    f"发布时间: {item.get('published', '')}", f"修改时间: {item.get('modified', '')}",
                    f"官方原文: {item['url']}", '解析说明: ' + '；'.join(reason) if reason else '']))
        for index, geometry in enumerate(geometries or ['']):
            suffix = f' AREA {index + 1}' if len(geometries) > 1 else ''
            append_record(output, CODE=code + suffix, TIME=time_text, PLATID=f'MSA:{code}{suffix}',
                          RAWMESSAGE=metadata + '\n\n' + raw, ALTITUDE='None', SOURCE='MSA', FIR='UNKNOWN', GEOMETRY=geometry)
        if reason:
            log('解析说明', f"{code}: {'；'.join(reason)}")
            skipped.append({'code': code, 'url': item['url'], 'reason': '；'.join(reason)})
    log('筛选汇总', f"保留 {len(output['CODE'])} 条区域记录，解析说明 {len(skipped)} 篇")
    return output, skipped

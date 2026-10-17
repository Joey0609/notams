"""扫描结束后的双区域 QQ 提醒；沿用历史匹配页的比例算法。"""
import hashlib
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fetch.Archive_Notam_Match import match_two_notams
from fetch.sources.geometry import geometry_points


REFERENCE_GEOMETRIES = (
    'PATH|M=N390400E1071500|L=N384900E1080100|L=N382800E1075000|L=N384300E1070400|Z',
    'PATH|M=N380300E1093300|L=N375200E1100500|L=N373600E1095700|L=N374700E1092500|Z',
)
REFERENCE_CODES = ('A0381/26', 'A0382/26')


def find_area_pairs(data):
    """两条不同的当前 NOTAM 分别命中两个参考区；阈值严格大于 60%。"""
    candidates = [[], []]
    references = [{'points': geometry_points(value)} for value in REFERENCE_GEOMETRIES]
    for index, code in enumerate(data.get('CODE', [])):
        if data['SOURCE'][index] != 'NOTAM':
            continue
        geometry = data['GEOMETRY'][index]
        # 历史匹配的圆形分支只判相交，不能用于 60% 的区域相似度判断。
        if not geometry.startswith('PATH|') or not geometry.endswith('|Z'):
            continue
        record = {field: data[field][index] for field in ('CODE', 'TIME', 'GEOMETRY')}
        record['index'] = index
        for target, reference in enumerate(references):
            ratio, _ = match_two_notams({'points': geometry_points(geometry)}, reference)
            if ratio > 0.60:
                candidates[target].append(dict(record, ratio=ratio))
    return [(first, second) for first in candidates[0] for second in candidates[1]
            if first['index'] != second['index']]


def set_pause_until(pause_path, until):
    """原子更新静态维护开关；已有更晚的关站截止时间时保留。"""
    path = Path(pause_path)
    content = path.read_text(encoding='utf-8')
    pattern = r"(const SITE_PAUSE_UNTIL = )(['\"])(.*?)\2;"
    match = re.search(pattern, content)
    if not match:
        raise ValueError('未找到 SITE_PAUSE_UNTIL 开关')
    if match[3]:
        previous = datetime.fromisoformat(match[3].replace('Z', '+00:00'))
        if previous.tzinfo is None:
            raise ValueError('关站时间必须包含时区')
        if previous >= until:
            return
    updated = content[:match.start()] + f"const SITE_PAUSE_UNTIL = '{until.isoformat()}';" + content[match.end():]
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(updated, encoding='utf-8')
    os.replace(temporary, path)


def send_area_pair_alert(data, state_path, sender=None, *, pause_path='scripts/sitePause.js',
                         end_time_parser, now=None):
    """仅成功发送后原子保存去重状态；无命中时不创建状态文件。"""
    now = now or datetime.now(timezone.utc)
    pairs = []
    for pair in find_area_pairs(data):
        ends = [end_time_parser(row['TIME']) for row in pair]
        if any(end is None for end in ends):
            continue
        until = max(ends).replace(tzinfo=timezone.utc) + timedelta(hours=12)
        if until > now:
            pairs.append((pair, until))
    if not pairs:
        return False
    if os.path.exists(state_path):
        with open(state_path, encoding='utf-8') as file:
            sent = set(json.load(file)['sent'])
    else:
        sent = set()
    pending = {}
    # 关站独立于 QQ 成功与否；发送失败时仍保护站点，下轮重试消息。
    set_pause_until(pause_path, max(until for _, until in pairs))
    for pair, until in pairs:
        identity = [{field: row[field] for field in ('CODE', 'TIME', 'GEOMETRY')} for row in pair]
        key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode('utf-8')).hexdigest()
        if key not in sent:
            pending[key] = pair
    if not pending:
        return False
    if sender is None:
        from fetch.notam_bot import send_notification
        sender = send_notification
    if not sender({'body_text': '⚠⚠⚠触发紧急关站⚠⚠⚠', 'inline_images': []}):
        return False
    sent.update(pending)
    temporary = os.fspath(state_path) + '.tmp'
    with open(temporary, 'w', encoding='utf-8') as file:
        json.dump({'sent': sorted(sent)}, file, indent=2)
    os.replace(temporary, state_path)
    return True

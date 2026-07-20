import configparser
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timedelta

from fetch.Archive_Notam_Match import notam_match_archive
from fetch.FNS_NOTAM_SEARCH import FNS_NOTAM_SEARCH
from fetch.MSI_FETCH import MSI_FETCH
from fetch.dinsQueryWeb import dinsQueryWeb
from fetch.mail_draft import generate_change_email_draft
from fetch.notam_bot import send_notification as bot_send_notification
from fetch.sendcloud_email import send_email_via_qq_smtp
from fetch.visits import update_visits

dins = False
FNSs = True
MSIs = False

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
NOTIFY_SEND_LIST_PATH = os.path.join(REPO_ROOT, 'notify_send_list.txt')

def parse_point(pt):
    m = re.match(r'([NS])(\d{4,6})([WE])(\d{5,7})', pt)
    if not m:
        return None
    ns, lat_s, ew, lon_s = m.group(1), m.group(2), m.group(3), m.group(4)
    if len(lat_s) == 6:
        deg = int(lat_s[:2]); minute = int(lat_s[2:4]); sec = int(lat_s[4:6])
    else:
        deg = int(lat_s[:2]); minute = int(lat_s[2:4]); sec = 0
    lat = deg + minute/60.0 + sec/3600.0
    if ns == 'S':
        lat = -lat
    if len(lon_s) == 7:
        deg = int(lon_s[:3]); minute = int(lon_s[3:5]); sec = int(lon_s[5:7])
    else:
        deg = int(lon_s[:3]); minute = int(lon_s[3:5]); sec = 0
    lon = deg + minute/60.0 + sec/3600.0
    if ew == 'W':
        lon = -lon
    return (lat, lon)

def point_in_rect(pt, rect):
    lat, lon = pt
    return rect['lat_min'] <= lat <= rect['lat_max'] and rect['lon_min'] <= lon <= rect['lon_max']

def point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i][0], poly[i][1]
        xj, yj = poly[j][0], poly[j][1]
        intersect = ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-16) + xi)
        if intersect:
            inside = not inside
        j = i
    return inside

def seg_intersect(a, b, c, d):
    def orient(p, q, r):
        return (q[0]-p[0])*(r[1]-p[1]) - (q[1]-p[1])*(r[0]-p[0])
    def on_seg(p,q,r):
        return min(p[0], r[0]) <= q[0] <= max(p[0], r[0]) and min(p[1], r[1]) <= q[1] <= max(p[1], r[1])
    o1 = orient(a,b,c); o2 = orient(a,b,d); o3 = orient(c,d,a); o4 = orient(c,d,b)
    if o1*o2 < 0 and o3*o4 < 0:
        return True
    if o1 == 0 and on_seg(a,c,b): return True
    if o2 == 0 and on_seg(a,d,b): return True
    if o3 == 0 and on_seg(c,a,d): return True
    if o4 == 0 and on_seg(c,b,d): return True
    return False

def classify_data(data):
    codes = data.get("CODE", [])
    times = data.get("TIME", [])

    # 解析时间区间
    def parse_time(t):
        """
        例子: '25 NOV 04:01 2025 UNTIL 25 NOV 04:41 2025'
        """
        try:
            parts = t.split(" UNTIL ")
            start = datetime.strptime(parts[0], "%d %b %H:%M %Y").timestamp()
            end = datetime.strptime(parts[1], "%d %b %H:%M %Y").timestamp()
            return start, end
        except:
            return None, None

    items = []  # (idx, start_ts, end_ts)
    for i, t in enumerate(times):
        s, e = parse_time(t)
        if s and e:
            items.append((i, s, e))

    if not items:
        return {}

    # 并查集
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    def union(a, b):
        pa, pb = find(a), find(b)
        if pa != pb:
            parent[pb] = pa

    # 判断重叠并归类
    for i in range(len(items)):
        idx1, s1, e1 = items[i]
        d1 = e1 - s1
        if d1 <= 0:
            continue

        for j in range(i + 1, len(items)):
            idx2, s2, e2 = items[j]
            d2 = e2 - s2
            if d2 <= 0:
                continue

            overlap = max(0, min(e1, e2) - max(s1, s2))
            if overlap <= 0:
                continue

            r1 = overlap / d1
            r2 = overlap / d2

            #根据窗口长度调整阈值
            max_duration = max(d1, d2)
            if max_duration <= 10800: 
                if abs(s2-s1)>15*60:
                    continue
                min_threshold = 0.4
                max_threshold = 1.6
            else: 
                min_threshold = 0.8
                max_threshold = 1.2
            
            if min_threshold <= r1 <= max_threshold and min_threshold <= r2 <= max_threshold:
                union(idx1, idx2)

    # 输出分组
    groups = {}
    for idx, _, _ in items:
        root = find(idx)
        groups.setdefault(root, []).append(idx)

    classify = {}
    for n, (_, members) in enumerate(groups.items(), 1):
        combined_str = "".join(sorted(codes[m] for m in sorted(members)))
        key = int.from_bytes(combined_str.encode('utf-8'), 'big') % 998244353
        classify[f"c{key}"] = [codes[m] for m in members]
        classify[f"c{key}"].sort()
    classify = dict(sorted(classify.items()))

    return classify


altitude_regex = re.compile(r'Q\) [A-Z]+?/[A-Z]+?/[IVK\s]*?/[NBOMK\s]*?/[AEWK\s]*?/(\d{3}/\d{3})/')


def extract_altitude(raw_message_lst):
    ans = []
    for message in raw_message_lst:
        match = altitude_regex.search(message)
        if match:
            altitudes = match.group(1).split('/')
            lower, upper = int(altitudes[0]), int(altitudes[1])  # 100 feet
            lower_str, upper_str = round(lower * 0.3048) * 100, round(upper * 0.3048) * 100
            if upper == 999:
                upper_str = 'INF'
            ans.append(f"{lower_str} ~ {upper_str} 米")
        else:
            ans.append('None')
    return ans


def coordinates_has_lon_in_range(coord_str, lon_min=70.0, lon_max=180.0):
    if not coord_str:
        return False
    for part in str(coord_str).split('-'):
        p = parse_point(part.strip())
        if not p:
            continue
        lon = p[1]
        if lon_min <= lon <= lon_max:
            return True
    return False


def normalize_notam_number(value):
    """Normalize a user-visible NOTAM number for notification deduplication."""
    return re.sub(r'\s+', '', str(value or '')).upper()


def load_notified_notam_numbers(path=NOTIFY_SEND_LIST_PATH):
    """Load NOTAM numbers already delivered by QQ Bot or email."""
    try:
        with open(path, 'r', encoding='utf-8') as file:
            return {
                normalize_notam_number(line)
                for line in file
                if line.strip() and not line.lstrip().startswith('#')
            }
    except FileNotFoundError:
        return set()


def record_notified_notam_numbers(notam_numbers, path=NOTIFY_SEND_LIST_PATH):
    """Append newly delivered NOTAM numbers to the shared notification list."""
    existing = load_notified_notam_numbers(path)
    new_numbers = []
    for value in notam_numbers or []:
        number = normalize_notam_number(value)
        if number and number not in existing:
            existing.add(number)
            new_numbers.append(number)

    if not new_numbers:
        return 0

    needs_leading_newline = False
    try:
        needs_leading_newline = os.path.getsize(path) > 0
        if needs_leading_newline:
            with open(path, 'rb') as file:
                file.seek(-1, os.SEEK_END)
                needs_leading_newline = file.read(1) not in (b'\n', b'\r')
    except FileNotFoundError:
        pass

    with open(path, 'a', encoding='utf-8', newline='\n') as file:
        if needs_leading_newline:
            file.write('\n')
        for number in new_numbers:
            file.write(f'{number}\n')
    return len(new_numbers)


def get_new_notams_for_notification(previous_data, current_data, notified_numbers=None):
    """Return new, in-range NOTAMs that have not already been delivered."""
    prev_ids = set(str(x) for x in (previous_data.get('PLATID', []) if isinstance(previous_data, dict) else []))
    curr_ids = current_data.get('PLATID', []) if isinstance(current_data, dict) else []
    curr_codes = current_data.get('CODE', []) if isinstance(current_data, dict) else []
    curr_coords = current_data.get('COORDINATES', []) if isinstance(current_data, dict) else []
    pending_numbers = {
        normalize_notam_number(value) for value in (notified_numbers or [])
    }

    pending = []
    for idx, platid in enumerate(curr_ids):
        pid = str(platid)
        if pid in prev_ids:
            continue
        coord = curr_coords[idx] if idx < len(curr_coords) else ''
        if not coordinates_has_lon_in_range(coord, 70.0, 180.0):
            continue
        code = str(curr_codes[idx]) if idx < len(curr_codes) else ''
        normalized_code = normalize_notam_number(code)
        if normalized_code in pending_numbers:
            continue
        pending.append({'PLATID': pid, 'CODE': code})
        if normalized_code:
            pending_numbers.add(normalized_code)
    return pending


def count_new_notams_for_mail(previous_data, current_data, notified_numbers=None):
    return len(get_new_notams_for_notification(previous_data, current_data, notified_numbers))


def filter_data_by_source(data, include_sources):
    include_sources = set(include_sources or [])
    if not isinstance(data, dict):
        return {
            'CODE': [], 'COORDINATES': [], 'TIME': [], 'PLATID': [], 'RAWMESSAGE': [],
            'ALTITUDE': [], 'SOURCE': [], 'FIR': [], 'CLASSIFY': {}, 'NUM': 0,
        }

    sources = data.get('SOURCE', []) or []
    size = min(
        len(data.get('CODE', []) or []),
        len(data.get('COORDINATES', []) or []),
        len(data.get('TIME', []) or []),
        len(data.get('PLATID', []) or []),
        len(data.get('RAWMESSAGE', []) or []),
    )

    out = {
        'CODE': [],
        'COORDINATES': [],
        'TIME': [],
        'PLATID': [],
        'RAWMESSAGE': [],
        'ALTITUDE': [],
        'SOURCE': [],
        'FIR': [],
        'CLASSIFY': {},
        'NUM': 0,
    }
    for i in range(size):
        src = sources[i] if i < len(sources) else 'NOTAM'
        src = str(src or 'NOTAM').upper()
        if src not in include_sources:
            continue
        out['CODE'].append(data['CODE'][i])
        out['COORDINATES'].append(data['COORDINATES'][i])
        out['TIME'].append(data['TIME'][i])
        out['PLATID'].append(data['PLATID'][i])
        out['RAWMESSAGE'].append(data['RAWMESSAGE'][i])
        altitude_list = data.get('ALTITUDE', []) or []
        fir_list = data.get('FIR', []) or []
        out['ALTITUDE'].append(altitude_list[i] if i < len(altitude_list) else 'None')
        out['SOURCE'].append(src)
        out['FIR'].append(fir_list[i] if i < len(fir_list) else '')

    out['NUM'] = len(out['CODE'])
    out['CLASSIFY'] = classify_data(out)
    return out


def filter_data_by_platids(data, include_platids):
    """Filter data dict to keep only records whose PLATID is in include_platids."""
    include_platids = set(str(p) for p in (include_platids or []))
    if not isinstance(data, dict) or not include_platids:
        return {
            'CODE': [], 'COORDINATES': [], 'TIME': [], 'PLATID': [], 'RAWMESSAGE': [],
            'ALTITUDE': [], 'SOURCE': [], 'FIR': [], 'CLASSIFY': {}, 'NUM': 0,
        }

    platids = data.get('PLATID', []) or []
    size = min(
        len(data.get('CODE', []) or []),
        len(data.get('COORDINATES', []) or []),
        len(data.get('TIME', []) or []),
        len(platids),
        len(data.get('RAWMESSAGE', []) or []),
    )

    out = {
        'CODE': [], 'COORDINATES': [], 'TIME': [], 'PLATID': [],
        'RAWMESSAGE': [], 'ALTITUDE': [], 'SOURCE': [], 'FIR': [],
        'CLASSIFY': {}, 'NUM': 0,
    }
    for i in range(size):
        pid = str(platids[i]) if i < len(platids) else ''
        if pid not in include_platids:
            continue
        out['CODE'].append(data['CODE'][i])
        out['COORDINATES'].append(data['COORDINATES'][i])
        out['TIME'].append(data['TIME'][i])
        out['PLATID'].append(pid)
        raw_list = data.get('RAWMESSAGE', []) or []
        out['RAWMESSAGE'].append(raw_list[i] if i < len(raw_list) else '')
        alt_list = data.get('ALTITUDE', []) or []
        out['ALTITUDE'].append(alt_list[i] if i < len(alt_list) else 'None')
        src_list = data.get('SOURCE', []) or []
        out['SOURCE'].append(str(src_list[i] if i < len(src_list) else 'NOTAM'))
        fir_list = data.get('FIR', []) or []
        out['FIR'].append(fir_list[i] if i < len(fir_list) else '')

    out['NUM'] = len(out['CODE'])
    out['CLASSIFY'] = classify_data(out)
    return out


def build_notification_current_data(previous_data, current_data, pending_platids):
    """Exclude non-sendable new records while preserving kept/removed sections."""
    previous_ids = {
        str(value)
        for value in (previous_data.get('PLATID', []) if isinstance(previous_data, dict) else [])
    }
    return filter_data_by_platids(current_data, previous_ids | set(str(x) for x in pending_platids))


def compute_data_hash(data, include_sources=None):
    if not isinstance(data, dict):
        return ''

    include_sources = set(s.upper() for s in include_sources) if include_sources else None
    sources = data.get('SOURCE', []) or []
    size = min(
        len(data.get('CODE', []) or []),
        len(data.get('COORDINATES', []) or []),
        len(data.get('TIME', []) or []),
        len(data.get('PLATID', []) or []),
    )

    records = []
    for i in range(size):
        src = str(sources[i] if i < len(sources) else 'NOTAM').upper()
        if include_sources is not None and src not in include_sources:
            continue
        records.append('|'.join([
            str(data['CODE'][i]),
            str(data['COORDINATES'][i]),
            str(data['TIME'][i]),
            str(data['PLATID'][i]),
            src,
        ]))

    payload = '\n'.join(sorted(records))
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


def _parse_time_windows(time_text):
    windows = []
    for segment in str(time_text or '').split(';'):
        segment = segment.strip()
        if not segment or ' UNTIL ' not in segment:
            continue
        parts = segment.split(' UNTIL ', 1)
        if len(parts) != 2:
            continue
        try:
            start = datetime.strptime(parts[0].strip(), "%d %b %H:%M %Y")
            end = datetime.strptime(parts[1].strip(), "%d %b %H:%M %Y")
        except Exception:
            continue
        windows.append((start, end))
    return windows


def _latest_end_time(time_text):
    windows = _parse_time_windows(time_text)
    if not windows:
        return None
    return max(end for _, end in windows)


def _normalize_coord_key(coord_text):
    points = [p.strip().upper() for p in str(coord_text or '').split('-') if p.strip()]
    if not points:
        return ''

    if len(points) >= 2 and points[0] == points[-1]:
        points = points[:-1]
    if len(points) <= 1:
        return '-'.join(points)

    def min_rotation(seq):
        items = list(seq)
        candidates = []
        n = len(items)
        for i in range(n):
            candidates.append(tuple(items[i:] + items[:i]))
        return min(candidates)

    forward = min_rotation(points)
    backward = min_rotation(list(reversed(points)))
    best = min(forward, backward)
    return '-'.join(best)


def _normalize_time_key(time_text):
    windows = _parse_time_windows(time_text)
    if not windows:
        return re.sub(r'\s+', ' ', str(time_text or '').upper()).strip()
    normalized = sorted((int(s.timestamp()), int(e.timestamp())) for s, e in windows)
    return ';'.join(f"{s}-{e}" for s, e in normalized)


def filter_expired_records(data, grace_hours=24):
    """
    Filter out records whose latest end time is older than now - grace_hours.
    Records with unparseable TIME are kept.
    """
    cutoff = datetime.utcnow() - timedelta(hours=grace_hours)
    size = min(
        len(data.get('CODE', []) or []),
        len(data.get('COORDINATES', []) or []),
        len(data.get('TIME', []) or []),
        len(data.get('PLATID', []) or []),
        len(data.get('RAWMESSAGE', []) or []),
        len(data.get('SOURCE', []) or []),
        len(data.get('FIR', []) or []),
    )
    if size == 0:
        return

    keep_indices = []
    expired_count = 0
    for i in range(size):
        latest_end = _latest_end_time(data['TIME'][i])
        if latest_end is not None and latest_end < cutoff:
            expired_count += 1
            continue
        keep_indices.append(i)

    if expired_count == 0:
        return

    for key in ['CODE', 'COORDINATES', 'TIME', 'PLATID', 'RAWMESSAGE', 'SOURCE', 'FIR']:
        arr = data.get(key, []) or []
        data[key] = [arr[i] for i in keep_indices if i < len(arr)]

    print(f"过滤过期数据: 移除 {expired_count} 条（结束时间早于当前时间24h）")


def remove_msi_fully_overlapped_by_notam(data):
    """
    If MSI and NOTAM are fully overlapped (same coordinates + same time windows),
    remove MSI and keep NOTAM.
    """
    size = min(
        len(data.get('CODE', []) or []),
        len(data.get('COORDINATES', []) or []),
        len(data.get('TIME', []) or []),
        len(data.get('PLATID', []) or []),
        len(data.get('RAWMESSAGE', []) or []),
        len(data.get('SOURCE', []) or []),
        len(data.get('FIR', []) or []),
    )
    if size == 0:
        return

    notam_keys = set()
    for i in range(size):
        src = str(data['SOURCE'][i] or '').upper()
        if not src.startswith('NOTAM'):
            continue
        key = (_normalize_coord_key(data['COORDINATES'][i]), _normalize_time_key(data['TIME'][i]))
        notam_keys.add(key)

    if not notam_keys:
        return

    keep_indices = []
    removed_count = 0
    for i in range(size):
        src = str(data['SOURCE'][i] or '').upper()
        if src.startswith('MSI'):
            key = (_normalize_coord_key(data['COORDINATES'][i]), _normalize_time_key(data['TIME'][i]))
            if key in notam_keys:
                removed_count += 1
                continue
        keep_indices.append(i)

    if removed_count == 0:
        return

    for key in ['CODE', 'COORDINATES', 'TIME', 'PLATID', 'RAWMESSAGE', 'SOURCE', 'FIR']:
        arr = data.get(key, []) or []
        data[key] = [arr[i] for i in keep_indices if i < len(arr)]

    print(f"去重重合数据: 移除 {removed_count} 条与NOTAM完全重合的MSI")


def _is_unknown_fir(fir_value):
    text = str(fir_value or '').strip().upper()
    return text in {'', 'UNKNOWN', 'UNK', 'NONE', 'NULL', 'N/A'}


def _extract_fir_from_text(raw_message, fir_candidates):
    text = str(raw_message or '')
    candidates = {str(x).strip().upper() for x in (fir_candidates or []) if len(str(x).strip()) == 4}

    match = re.search(r'\bA\)\s*([A-Z]{4})\b', text, re.IGNORECASE)
    if not match:
        return 'UNKNOWN', 'NO_A_FIELD'

    token = match.group(1).upper()
    if token in candidates:
        return token, token
    return 'UNKNOWN', token


def _parse_fir_candidates_from_config(codes_text):
    tokens = re.findall(r'[A-Z]{4}', str(codes_text or '').upper())
    out = []
    seen = set()
    for token in tokens:
        if token in seen:
            continue
        seen.add(token)
        out.append(token)
    return out


def backfill_fir_from_text(data, fir_candidates):
    """
    Parse FIR from raw message using configured FIR list.
    Rule: read FIR from `A)` field, then validate against config list.
    If parse/validation fails -> UNKNOWN.
    """
    firs = data.get('FIR', []) or []
    raws = data.get('RAWMESSAGE', []) or []
    size = min(len(firs), len(raws))
    if size == 0:
        return

    updated = 0
    for i in range(size):
        current_fir = str(firs[i] or '').strip()
        if not _is_unknown_fir(current_fir):
            continue

        parsed_fir, detail = _extract_fir_from_text(raws[i], fir_candidates)
        if detail == 'NO_A_FIELD':
            print(f"FIR match detail idx={i}: no A) field -> UNKNOWN")
        elif _is_unknown_fir(parsed_fir):
            print(f"FIR match detail idx={i}: A)={detail} not in config -> UNKNOWN")
        else:
            print(f"FIR match detail idx={i}: A)={detail} -> {parsed_fir}")

        if not _is_unknown_fir(parsed_fir):
            firs[i] = parsed_fir
            updated += 1
        else:
            firs[i] = 'UNKNOWN'

    if updated > 0:
        print(f"FIR parse backfill: parsed {updated} entries from raw text")


def harmonize_fir_by_platid(data):
    """
    For the same PLATID, keep a meaningful FIR and prevent UNKNOWN from overriding it.
    """
    platids = data.get('PLATID', []) or []
    firs = data.get('FIR', []) or []
    size = min(len(platids), len(firs))
    if size == 0:
        return

    best_fir_by_platid = {}
    for i in range(size):
        pid = str(platids[i] or '').strip()
        if not pid:
            continue
        fir = str(firs[i] or '').strip()
        if _is_unknown_fir(fir):
            continue
        if pid not in best_fir_by_platid:
            best_fir_by_platid[pid] = fir

    replaced = 0
    for i in range(size):
        pid = str(platids[i] or '').strip()
        if not pid:
            continue
        best_fir = best_fir_by_platid.get(pid)
        if not best_fir:
            continue
        if _is_unknown_fir(firs[i]):
            firs[i] = best_fir
            replaced += 1

    if replaced > 0:
        print(f"FIR merge: replaced {replaced} UNKNOWN entries by PLATID priority")


EXCLUDE_RECTS = [
    # {'lat_min': 39.303183, 'lat_max': 40.856476, 'lon_min': 101.300003, 'lon_max': 105.242712},
    {'lat_min': 36.263957, 'lat_max': 45.841384, 'lon_min': 73.570446,  'lon_max': 90.944820},
    {'lat_min': 34.90,     'lat_max': 43.76,      'lon_min': 79.93,     'lon_max': 90.70},
    {'lat_min': 40.12,     'lat_max': 42.09,      'lon_min': 89.95,    'lon_max': 96.50},
]

def load_config():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    config_file = os.path.join(current_dir, 'config.ini')
    config = configparser.ConfigParser()
    if not os.path.exists(config_file):
        config['ICAO'] = {
            'codes': 'ZBPE ZGZU ZHWH ZJSA ZLHW ZPKM ZSHA ZWUQ ZYSH VVTS WSJC WIIF YMMM WMFC RPHI AYPM AGGG ANAU NFFF KZAK VYYF VCCF VOMF WAAF RJJJ RCAA YBBB VVGL VVHN VVHM RCSP VVHM WIIF ',
        }
        config['SERVER'] = {
            'host': '127.0.0.1',
            'port': '5000',
            'auto_open_browser': 'true'
        }
        config['MAIL'] = {
            'enabled': 'false',
            'smtp_server': 'smtp.qq.com',
            'smtp_port': '465',
            'smtp_user': 'your@qq.com',
            'smtp_auth_code': '',
            'from_email': 'your@qq.com',
            'from_name': 'NOTAM Bot',
            'to_emails': 'receiver@example.com',
        }
        
        with open(config_file, 'w', encoding='utf-8') as f:
            f.write('# FIR/ICAO配置，填写你需要获取的航警所在的飞行情报区（FIR）代码或机场ICAO代码\n')
            config.write(f)
    config.read(config_file, encoding='utf-8')
    return config

config = load_config()
ICAO_CODES = config.get('ICAO', 'codes', fallback='ZBPE ZGZU ZHWH ZJSA ZLHW ZPKM ZSHA ZWUQ ZYSH VVTS WSJC WIIF YMMM WMFC RPHI AYPM AGGG ANAU NFFF KZAK VYYF VCCF VOMF WAAF RJJJ RCAA YBBB VVGL VVHN VVHM RCSP VVHM WIIF')
HOST = config.get('SERVER', 'host', fallback='127.0.0.1')
PORT = config.getint('SERVER', 'port', fallback=5005)
AUTO_OPEN = config.getboolean('SERVER', 'auto_open_browser', fallback=True)
MAIL_ENABLED = config.getboolean('MAIL', 'enabled', fallback=False)



def get_mail_config():
    smtp_user = os.getenv('NOTAM_SMTP_USER', '').strip() or config.get('MAIL', 'smtp_user', fallback='').strip()
    smtp_auth_code = os.getenv('NOTAM_SMTP_AUTH_CODE', '').strip() or config.get('MAIL', 'smtp_auth_code', fallback='').strip()
    from_email = os.getenv('NOTAM_FROM_EMAIL', '').strip() or config.get('MAIL', 'from_email', fallback='').strip()
    to_emails = os.getenv('NOTAM_TO_EMAILS', '').strip() or config.get('MAIL', 'to_emails', fallback='').strip()

    return {
        'smtp_server': config.get('MAIL', 'smtp_server', fallback='smtp.qq.com'),
        'smtp_port': config.get('MAIL', 'smtp_port', fallback='465'),
        'smtp_user': smtp_user,
        'smtp_auth_code': smtp_auth_code,
        'from_email': from_email,
        'from_name': config.get('MAIL', 'from_name', fallback='NOTAM Bot').strip(),
        'to_emails': to_emails,
    }

import logging
import sys

class LogCapture:
    def __init__(self):
        self.logs = []
        self.max_logs = 1000 
    
    def add_log(self, message, level='INFO'):
        import datetime
        timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        self.logs.append({
            'timestamp': timestamp,
            'level': level,
            'message': str(message)
        })
        if len(self.logs) > self.max_logs:
            self.logs.pop(0)
    
    def get_logs(self):
        return self.logs

log_capture = LogCapture()

class PrintCapture:
    def __init__(self, original_stdout):
        self.original_stdout = original_stdout
    
    def write(self, message):
        if message.strip():
            if 'GET /logs' not in message and 'POST /logs/clear' not in message:
                log_capture.add_log(message.strip())
        self.original_stdout.write(message)
    
    def flush(self):
        self.original_stdout.flush()

original_stdout = sys.stdout
original_stderr = sys.stderr
sys.stdout = PrintCapture(original_stdout)
sys.stderr = PrintCapture(original_stderr)

import logging
log = logging.getLogger('werkzeug')
log.setLevel(logging.INFO)

class FlaskLogHandler(logging.Handler):
    def emit(self, record):
        message = self.format(record)
        # 过滤掉/logs相关的请求日志
        if 'GET /logs' not in message and 'POST /logs/clear' not in message:
            log_capture.add_log(message)


def fetch():
    try:
        current_config = load_config()
        current_icao_codes = current_config.get('ICAO', 'codes', fallback=ICAO_CODES)
    except Exception as e:
        current_icao_codes = ICAO_CODES
    fir_candidates = _parse_fir_candidates_from_config(current_icao_codes)
    
    dataDict = {
        "CODE": [],
        "COORDINATES": [],
        "TIME": [],
        "PLATID": [],
        "ALTITUDE": [],
        "RAWMESSAGE": [],
        "SOURCE": [],
        "FIR": [],
        "CLASSIFY": {},
        "NUM": 0,
    }
    source_num = 0
    
    if dins:
        dins_data = dinsQueryWeb(current_icao_codes)
        if dins_data.get("CODE"):
            source_num += 1
            dataDict["CODE"].extend(dins_data["CODE"])
            dataDict["COORDINATES"].extend(dins_data["COORDINATES"])
            dataDict["TIME"].extend(dins_data["TIME"])
            dataDict["PLATID"].extend(dins_data["TRANSID"])
            dataDict["RAWMESSAGE"].extend(dins_data["RAWMESSAGE"])
            dataDict["SOURCE"].extend(dins_data.get("SOURCE", []) or ['MSI'] * len(dins_data["CODE"]))
            dataDict["FIR"].extend(dins_data.get("FIR", []) or ['DINS'] * len(dins_data["CODE"]))
            print(f"爬取来源{source_num}: dinsQueryWeb, 获取 {len(dins_data['CODE'])} 条航警")
    
    if FNSs:
        FNS_data = FNS_NOTAM_SEARCH()
        if FNS_data.get("CODE"):
            source_num += 1
            fns_code = []
            fns_coord = []
            fns_time = []
            fns_id = []
            fns_raw = []
            fns_source = []
            fns_fir = []

            for code, coords_str, t, id, raw, source_type, fir in zip(
                FNS_data['CODE'],
                FNS_data['COORDINATES'],
                FNS_data['TIME'],
                FNS_data['TRANSID'],
                FNS_data['RAWMESSAGE'],
                FNS_data.get('SOURCE', []) or ['NOTAM'] * len(FNS_data['CODE']),
                FNS_data.get('FIR', []) or [''] * len(FNS_data['CODE'])
            ):
                pts = []
                for part in coords_str.split('-'):
                    p = parse_point(part.strip())
                    if p:
                        pts.append(p)
                excluded = False
                for rect in EXCLUDE_RECTS:
                    #1检查落区顶点是否在矩形内
                    if any(point_in_rect(p, rect) for p in pts):
                        excluded = True #True
                        break
                    #2检查矩形顶点是否在落区内
                    corners = [(rect['lat_min'], rect['lon_min']), (rect['lat_min'], rect['lon_max']),
                             (rect['lat_max'], rect['lon_min']), (rect['lat_max'], rect['lon_max'])]
                    if any(point_in_poly(c[0], c[1], pts) for c in corners):
                        excluded = True #True
                        break
                    #3检查边是否相交
                    rect_edges = [
                        ((rect['lat_min'], rect['lon_min']), (rect['lat_min'], rect['lon_max'])),
                        ((rect['lat_min'], rect['lon_max']), (rect['lat_max'], rect['lon_max'])),
                        ((rect['lat_max'], rect['lon_max']), (rect['lat_max'], rect['lon_min'])),
                        ((rect['lat_max'], rect['lon_min']), (rect['lat_min'], rect['lon_min'])),
                    ]
                    found_intersect = False
                    for i in range(len(pts)):
                        a = pts[i]; b = pts[(i+1)%len(pts)]
                        for edge in rect_edges:
                            if seg_intersect(a, b, edge[0], edge[1]):
                                excluded = False #True
                                found_intersect = True
                                break
                        if found_intersect:
                            break
                    if excluded:
                        break
                            
                if not excluded:
                    fns_code.append(code)
                    fns_coord.append(coords_str)
                    fns_time.append(t)
                    fns_id.append(id)
                    fns_raw.append(raw)
                    fns_source.append(source_type)
                    fns_fir.append(fir)

            if fns_code:
                dataDict["CODE"].extend(fns_code)
                dataDict["COORDINATES"].extend(fns_coord)
                dataDict["TIME"].extend(fns_time)
                dataDict["PLATID"].extend(fns_id)
                dataDict["RAWMESSAGE"].extend(fns_raw)
                dataDict["SOURCE"].extend(fns_source)
                dataDict["FIR"].extend(fns_fir)
            print(f"爬取来源{source_num}: FNS_NOTAM_SEARCH, 获取 {len(fns_code)} 条航警")

    if MSIs:
        msi_data = MSI_FETCH()
        if msi_data.get('CODE'):
            source_num += 1
            dataDict['CODE'].extend(msi_data.get('CODE', []))
            dataDict['COORDINATES'].extend(msi_data.get('COORDINATES', []))
            dataDict['TIME'].extend(msi_data.get('TIME', []))
            dataDict['PLATID'].extend(msi_data.get('TRANSID', []))
            dataDict['RAWMESSAGE'].extend(msi_data.get('RAWMESSAGE', []))
            dataDict['SOURCE'].extend(msi_data.get('SOURCE', []) or ['MSI'] * len(msi_data.get('CODE', [])))
            dataDict['FIR'].extend(msi_data.get('FIR', []) or ['UNKNOWN'] * len(msi_data.get('CODE', [])))
            print(f"爬取来源{source_num}: MSI_FETCH, 获取 {len(msi_data.get('CODE', []))} 条航警")

    backfill_fir_from_text(dataDict, fir_candidates)
    harmonize_fir_by_platid(dataDict)

    # 过滤结束时间已早于当前时间 24h 的记录
    filter_expired_records(dataDict, grace_hours=24)
    # 若 MSI 与 NOTAM 完全重合（坐标+时间一致），仅保留 NOTAM
    remove_msi_fully_overlapped_by_notam(dataDict)

    dataDict["NUM"] = len(dataDict["CODE"])
    dataDict["CLASSIFY"] = classify_data(dataDict)
    dataDict["ALTITUDE"] = extract_altitude(dataDict["RAWMESSAGE"])
    sorted_data = sorted(
        zip(
            dataDict["CODE"],
            dataDict["COORDINATES"],
            dataDict["TIME"],
            dataDict["PLATID"],
            dataDict["RAWMESSAGE"],
            dataDict["ALTITUDE"],
            dataDict["SOURCE"],
            dataDict["FIR"],
        ),
        key=lambda x: x[0]
    )
    if (sorted_data == []):
        print("No data fetched.")
        dataDict["CODE"], dataDict["COORDINATES"], dataDict["TIME"], dataDict["PLATID"], dataDict["RAWMESSAGE"], dataDict["ALTITUDE"], dataDict["SOURCE"], dataDict["FIR"] = [], [], [], [], [], [], [], []
        dataDict["NUM"] = len(dataDict["CODE"])
    else:
        (
            dataDict["CODE"],
            dataDict["COORDINATES"],
            dataDict["TIME"],
            dataDict["PLATID"],
            dataDict["RAWMESSAGE"],
            dataDict["ALTITUDE"],
            dataDict["SOURCE"],
            dataDict["FIR"],
        ) = map(list, zip(*sorted_data))
        dataDict["NUM"] = len(dataDict["CODE"])
    dataDict["HASH"] = compute_data_hash(dataDict)
    dataDict["HASH_NOTAM"] = compute_data_hash(dataDict, include_sources={'NOTAM'})
    dataDict["HASH_MSI"] = compute_data_hash(dataDict, include_sources={'MSI'})

    # 将结果拆分为两个部分并保存到同一个 data_dict.json 中
    notam_data = filter_data_by_source(dataDict, {'NOTAM'})
    msi_data = filter_data_by_source(dataDict, {'MSI'})
    notam_data["HASH"] = compute_data_hash(notam_data)
    msi_data["HASH"] = compute_data_hash(msi_data)
    dataDict["NOTAM_DATA"] = notam_data
    dataDict["MSI_DATA"] = msi_data

    print(dataDict)
    # 保护：如果本次抓取全部为空，不覆盖文件（应对上游服务临时故障）
    if dataDict["NUM"] == 0 and os.path.exists('data_dict.json'):
        try:
            with open('data_dict.json', 'r', encoding='utf-8') as f:
                existing = json.load(f)
            if existing.get('NUM', 0) > 0:
                print("抓取结果为空但已有有效数据，跳过覆盖（防止上游临时故障导致数据清空）")
                return dataDict
        except Exception:
            pass
    with open('data_dict.json', 'w', encoding='utf-8') as json_file:
        json.dump(dataDict, json_file, ensure_ascii=False, indent=4)
    return dataDict

if __name__ == '__main__':
    previous_data = {}

    try:
        with open('data_dict.json', 'r', encoding='utf-8') as json_file:
            previous_data = json.load(json_file)
            before_hash = previous_data.get('HASH') or compute_data_hash(previous_data)
            before_hash_notam = previous_data.get('HASH_NOTAM') or compute_data_hash(previous_data, include_sources={'NOTAM'})
    except FileNotFoundError:
        before_hash = None
        before_hash_notam = None
    dataDict = fetch()
    after_hash = dataDict.get("HASH", None)
    after_hash_notam = dataDict.get('HASH_NOTAM', None)

    if before_hash != after_hash:
        update_visits()
        print('检测到数据变化，已执行 update_visits')

    if before_hash_notam != after_hash_notam:
        current_notam = filter_data_by_source(dataDict, {'NOTAM'})
        previous_notam = filter_data_by_source(previous_data, {'NOTAM'})
        notam_match_archive(dataDict=current_notam)
        notified_numbers = load_notified_notam_numbers()
        pending_notams = get_new_notams_for_notification(
            previous_notam, current_notam, notified_numbers
        )
        pending_platids = [item['PLATID'] for item in pending_notams]
        pending_codes = [item['CODE'] for item in pending_notams]
        added_count = len(pending_notams)
        notification_current = build_notification_current_data(
            previous_notam, current_notam, pending_platids
        )
        email_draft = None
        if MAIL_ENABLED and added_count > 0:
            try:
                email_draft = generate_change_email_draft(previous_notam, notification_current)
                send_result = send_email_via_qq_smtp(get_mail_config(), email_draft)
                print(f"邮件发送成功: {send_result}")
                recorded_count = record_notified_notam_numbers(pending_codes)
                print(f"已记录 {recorded_count} 个通过邮件发送的航警编号")
            except Exception as exc:
                print(f"邮件发送失败: {exc}")
        elif MAIL_ENABLED:
            print('无未发送过且符合经度范围(70~180)的新增航警，已跳过邮件发送')
        else:
            print('MAIL.enabled=false，已跳过邮件发送')
        # QQ Bot 通知独立于邮件发送
        if added_count > 0:
            try:
                # 先计算全量数据的颜色和 emoji 映射，保证两条消息一致
                from fetch.mail_draft import _build_code_to_color_map, _build_code_emoji_map
                code_to_color = _build_code_to_color_map(current_notam)
                code_emoji_map = _build_code_emoji_map(current_notam)

                # 第一条：仅新增航警图片 + 新增航警文字(无坐标)
                added_only_data = filter_data_by_platids(current_notam, pending_platids)
                added_draft = generate_change_email_draft(
                    {}, added_only_data, include_match=False, include_website=False,
                    code_to_color=code_to_color, code_emoji_map=code_emoji_map, max_zoom=6, section_mode='added_only'
                )
                # 第二条：全部航警图片 + 当前航警文字
                full_draft = generate_change_email_draft(
                    previous_notam, current_notam, include_match=False, include_website=False,
                    code_to_color=code_to_color, code_emoji_map=code_emoji_map, max_zoom=6, section_mode='current'
                )
                from fetch.notam_bot import send_two_notifications
                qq_result = send_two_notifications(added_draft, full_draft, return_details=True)
                if qq_result.get('added') or qq_result.get('full'):
                    recorded_count = record_notified_notam_numbers(pending_codes)
                    print(f"已记录 {recorded_count} 个通过 QQ Bot 发送的航警编号")
            except Exception as exc:
                print(f"QQ Bot 通知发送失败: {exc}")
        else:
            print('无未发送过且符合经度范围(70~180)的新增航警，已跳过 QQ Bot 发送')
    elif before_hash != after_hash:
        print('仅MSI或非NOTAM数据变化，已跳过历史匹配与邮件发送')

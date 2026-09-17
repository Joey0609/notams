import configparser
import hashlib
import json
import os
import re
import sys
from datetime import UTC, datetime, timedelta

from fetch.Archive_Notam_Match import notam_match_archive
from fetch.mail_draft import generate_change_email_draft
from fetch.sendcloud_email import send_email_via_qq_smtp
from fetch.sources import fetch_enabled_sources, get_enabled_source_names
from fetch.visits import update_visits

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
NOTIFY_SEND_LIST_PATH = os.path.join(REPO_ROOT, 'notify_send_list.txt')
SNAPSHOT_PATH = os.path.join(REPO_ROOT, 'data_dict.json')
NOTIFY_DEDUPLICATION_WINDOW = timedelta(days=30)

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


altitude_regex = re.compile(
    r'Q\)\s*[A-Z]+?/[A-Z]+?/[IVK\s]*?/[NBOMK\s]*?/[AEWK\s]*?/(\d{3}/\d{3})/',
    re.IGNORECASE,
)


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


def record_has_lon_in_range(data, index, lon_min=70.0, lon_max=180.0):
    """Apply notification longitude filtering to the canonical geometry only."""
    values = data.get('GEOMETRY', []) or []
    geometry = str(values[index] if index < len(values) else '')
    points = re.findall(r'[NS]\d{4,6}[WE]\d{5,7}', geometry.upper())
    return any(point and lon_min <= point[1] <= lon_max for point in (parse_point(value) for value in points))

def normalize_notam_number(value):
    """Normalize a user-visible NOTAM number for notification deduplication."""
    return re.sub(r'\s+', '', str(value or '')).upper()


def _parse_notified_notam_record(line):
    """Parse one ``NOTAM number<TAB>UTC timestamp`` notification record."""
    text = line.strip()
    if not text or text.startswith('#'):
        return None
    try:
        number, timestamp_text = text.rsplit('\t', 1)
        timestamp = datetime.fromisoformat(timestamp_text.replace('Z', '+00:00'))
    except ValueError:
        return normalize_notam_number(text), None
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    return normalize_notam_number(number), timestamp.astimezone(UTC)


def _write_notified_notam_records(records, path):
    """Replace the notification list with the remaining timestamped records."""
    with open(path, 'w', encoding='utf-8', newline='\n') as file:
        file.write('# Delivered NOTAM number and UTC send time, tab-separated.\n')
        for number, timestamp in records:
            file.write(f'{number}\t{timestamp.isoformat().replace("+00:00", "Z")}\n')


def load_notified_notam_numbers(path=NOTIFY_SEND_LIST_PATH, now=None):
    """Load unexpired notifications and remove entries older than 30 days."""
    check_time = now or datetime.now(UTC)
    if check_time.tzinfo is None:
        check_time = check_time.replace(tzinfo=UTC)
    else:
        check_time = check_time.astimezone(UTC)
    cutoff = check_time - NOTIFY_DEDUPLICATION_WINDOW
    try:
        with open(path, 'r', encoding='utf-8') as file:
            lines = list(file)
    except FileNotFoundError:
        return set()

    records = []
    seen_numbers = set()
    needs_rewrite = False
    for line in lines:
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        record = _parse_notified_notam_record(line)
        number, timestamp = record
        # Give pre-timestamp records the first scan's time, so they expire a
        # month from this migration instead of being discarded immediately.
        if timestamp is None:
            timestamp = check_time
            needs_rewrite = True
        if not number or timestamp < cutoff or number in seen_numbers:
            needs_rewrite = True
            continue
        seen_numbers.add(number)
        records.append((number, timestamp))

    if needs_rewrite:
        _write_notified_notam_records(records, path)
    return seen_numbers


def record_notified_notam_numbers(notam_numbers, path=NOTIFY_SEND_LIST_PATH, now=None):
    """Append newly delivered NOTAM numbers with their UTC send time."""
    sent_at = now or datetime.now(UTC)
    if sent_at.tzinfo is None:
        sent_at = sent_at.replace(tzinfo=UTC)
    else:
        sent_at = sent_at.astimezone(UTC)
    existing = load_notified_notam_numbers(path, now=sent_at)
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
            file.write(f'{number}\t{sent_at.isoformat().replace("+00:00", "Z")}\n')
    return len(new_numbers)


def get_new_notams_for_notification(previous_data, current_data, notified_numbers=None):
    """Return new, in-range NOTAMs that have not already been delivered."""
    prev_ids = set(str(x) for x in (previous_data.get('PLATID', []) if isinstance(previous_data, dict) else []))
    curr_ids = current_data.get('PLATID', []) if isinstance(current_data, dict) else []
    curr_codes = current_data.get('CODE', []) if isinstance(current_data, dict) else []
    pending_numbers = {
        normalize_notam_number(value) for value in (notified_numbers or [])
    }

    pending = []
    for idx, platid in enumerate(curr_ids):
        pid = str(platid)
        if pid in prev_ids:
            continue
        if not record_has_lon_in_range(current_data, idx, 70.0, 180.0):
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


def get_removed_notams_for_notification(previous_data, current_data, now=None, lead_minutes=60):
    """Return removed NOTAMs deleted at least lead_minutes before their start."""
    current_ids = {
        str(value)
        for value in (current_data.get('PLATID', []) if isinstance(current_data, dict) else [])
    }
    previous_codes = previous_data.get('CODE', []) if isinstance(previous_data, dict) else []
    previous_times = previous_data.get('TIME', []) if isinstance(previous_data, dict) else []
    previous_ids = previous_data.get('PLATID', []) if isinstance(previous_data, dict) else []
    check_time = now or datetime.now(UTC).replace(tzinfo=None)
    threshold = timedelta(minutes=lead_minutes)

    pending = []
    for idx, platid in enumerate(previous_ids):
        pid = str(platid)
        if pid in current_ids:
            continue
        if not record_has_lon_in_range(previous_data, idx, 70.0, 180.0):
            continue
        time_text = previous_times[idx] if idx < len(previous_times) else ''
        windows = _parse_time_windows(time_text)
        if not windows:
            continue
        earliest_start = min(start for start, _ in windows)
        if check_time <= earliest_start - threshold:
            pending.append({
                'PLATID': pid,
                'CODE': str(previous_codes[idx]) if idx < len(previous_codes) else '',
            })
    return pending


def count_removed_notams_for_notification(previous_data, current_data, now=None, lead_minutes=60):
    return len(get_removed_notams_for_notification(previous_data, current_data, now, lead_minutes))


RECORD_FIELDS = ('CODE', 'TIME', 'PLATID', 'RAWMESSAGE', 'ALTITUDE', 'SOURCE', 'FIR', 'GEOMETRY')


def _empty_record_data():
    data = {field: [] for field in RECORD_FIELDS}
    data.update({'CLASSIFY': {}, 'NUM': 0})
    return data


def _record_key(source, code):
    """Identity used across fetch stages, matching the source manager's dedup key."""
    return (str(source or 'NOTAM').upper(), re.sub(r'\s+', '', str(code or '')).upper())


def _record_keys(data):
    """Collect the ``(SOURCE, CODE)`` keys returned by one fetch stage."""
    codes = data.get('CODE', []) or []
    sources = data.get('SOURCE', []) or []
    return {
        _record_key(sources[index] if index < len(sources) else 'NOTAM', code)
        for index, code in enumerate(codes)
    }


def merge_source_batches(batches):
    """Merge stage results in order, keeping the first copy of a duplicated record.

    The focused stage is merged first, so a record reported by both stages stays in
    the focused section. Rows keep fetch order here; :func:`order_notam_rows`
    turns them into the CODE-sorted row space the site and match files share.
    """
    merged = _empty_record_data()
    seen_keys = set()
    duplicate_count = 0
    for batch in batches:
        batch_data = batch.data
        for values in zip(*(batch_data[field] for field in RECORD_FIELDS)):
            record = dict(zip(RECORD_FIELDS, values))
            key = _record_key(record['SOURCE'], record['CODE'])
            if key in seen_keys:
                duplicate_count += 1
                continue
            seen_keys.add(key)
            if str(record['SOURCE']).upper().startswith('NOTAM') and coordinates_are_excluded(record['GEOMETRY']):
                continue
            for field in RECORD_FIELDS:
                merged[field].append(record[field])
    if duplicate_count:
        print(f'跨阶段去重: 移除 {duplicate_count} 条重复记录')
    return merged


def batches_are_complete(batches):
    """Only a scan whose every stage succeeded may replace the snapshot."""
    return bool(batches) and all(
        batch.results and all(result.success for result in batch.results)
        for batch in batches
    )


def build_section(data, indices, sort_by_code=True):
    """Materialize one payload section (record fields + ``NUM``/``CLASSIFY``/``HASH``)."""
    positions = sorted(indices, key=lambda index: str(data['CODE'][index])) if sort_by_code else list(indices)
    section = _empty_record_data()
    for field in RECORD_FIELDS:
        values = data.get(field, []) or []
        section[field] = [values[index] if index < len(values) else '' for index in positions]
    section['NUM'] = len(section['CODE'])
    section['CLASSIFY'] = classify_data(section)
    section['HASH'] = compute_data_hash(section)
    return section


def _segment_record_indices(data, focused_keys):
    """Return ``(focused_notam, remaining_notam, msi)`` record positions."""
    codes = data.get('CODE', []) or []
    sources = data.get('SOURCE', []) or []
    focused_index, remaining_index, msi_index = [], [], []
    for index in range(len(codes)):
        source = str(sources[index] if index < len(sources) else 'NOTAM').upper()
        if source.startswith('MSI'):
            msi_index.append(index)
        elif source.startswith('NOTAM'):
            key = _record_key(source, codes[index])
            (focused_index if key in focused_keys else remaining_index).append(index)
    return focused_index, remaining_index, msi_index


def build_data_segments(data, focused_keys):
    """Split the merged records into focused NOTAM, remaining NOTAM and MSI sections.

    Every section is sorted by CODE and classified on its own, so the focused and
    the remaining pool never share a classification group.
    """
    focused_index, remaining_index, msi_index = _segment_record_indices(data, focused_keys)
    return (
        build_section(data, focused_index),
        build_section(data, remaining_index),
        build_section(data, msi_index),
    )


def order_notam_rows(data, focused_num, notam_num):
    """Order NOTAM rows exactly like the site does: focused segment first, then the rest.

    Each segment is sorted by CODE, which is the row space ``data_dict.json`` and
    ``data/archiveMatch/match{idx}.json`` share. The merged records keep fetch order,
    so this reordering is what keeps page row ``N`` and match file ``N`` in sync.
    """
    codes = data.get('CODE', []) or []
    limit = max(0, min(int(notam_num or 0), len(codes)))
    boundary = max(0, min(int(focused_num or 0), limit))
    focused_rows = sorted(range(boundary), key=lambda index: str(codes[index]))
    remaining_rows = sorted(range(boundary, limit), key=lambda index: str(codes[index]))
    return focused_rows + remaining_rows


def record_index_lookup(sections):
    """Map every record of the given sections to its global row number.

    The global row space is ``focused section -> remaining section -> MSI section``,
    which is exactly the order ``data/archiveMatch/match{idx}.json`` files use.
    """
    lookup = {}
    offset = 0
    for section in sections:
        section = section if isinstance(section, dict) else {}
        codes = section.get('CODE', []) or []
        platids = section.get('PLATID', []) or []
        for index in range(len(codes)):
            code = str(codes[index])
            platid = str(platids[index]) if index < len(platids) else ''
            lookup.setdefault((platid, code), offset + index)
            if platid:
                lookup.setdefault(('', platid), offset + index)
        offset += len(codes)
    return lookup


def attach_record_indices(data, lookup):
    """Attach the global row number of every record as ``INDEX``.

    Notification slices keep their original row numbers, so ``match.html?index=N``
    links keep pointing at the record the notification is about.
    """
    result = dict(data or {})
    codes = (data or {}).get('CODE', []) or []
    platids = (data or {}).get('PLATID', []) or []
    indices = []
    for index, code in enumerate(codes):
        platid = str(platids[index]) if index < len(platids) else ''
        value = lookup.get((platid, str(code)))
        if value is None:
            value = lookup.get(('', platid))
        indices.append(value)
    result['INDEX'] = indices
    return result


def filter_data_by_source(data, include_sources):
    """Return only the requested source sections; support the compact disk payload."""
    requested = {str(source).upper() for source in (include_sources or [])}
    if isinstance(data, dict) and 'NOTAM_DATA' in data:
        sections = []
        if 'NOTAM' in requested:
            sections.append(data.get('NOTAM_DATA', {}))
        if 'MSI' in requested:
            sections.append(data.get('MSI_DATA', {}))
        merged = _empty_record_data()
        for section in sections:
            for field in RECORD_FIELDS:
                merged[field].extend(section.get(field, []) or [])
        merged['NUM'] = len(merged['CODE'])
        merged['CLASSIFY'] = classify_data(merged)
        return merged
    if not isinstance(data, dict):
        return _empty_record_data()
    result = _empty_record_data()
    size = min(*(len(data.get(field, []) or []) for field in ('CODE', 'TIME', 'PLATID', 'RAWMESSAGE', 'GEOMETRY')))
    for index in range(size):
        source = str((data.get('SOURCE', []) or ['NOTAM'])[index] if index < len(data.get('SOURCE', []) or []) else 'NOTAM').upper()
        if source not in requested:
            continue
        for field in RECORD_FIELDS:
            values = data.get(field, []) or []
            defaults = {'ALTITUDE': 'None', 'SOURCE': source, 'FIR': 'UNKNOWN'}
            result[field].append(values[index] if index < len(values) else defaults.get(field, ''))
    result['NUM'] = len(result['CODE'])
    result['CLASSIFY'] = classify_data(result)
    return result


def filter_data_by_platids(data, include_platids):
    ids = {str(value) for value in (include_platids or [])}
    if not ids:
        return _empty_record_data()
    result = _empty_record_data()
    size = min(*(len(data.get(field, []) or []) for field in ('CODE', 'TIME', 'PLATID', 'RAWMESSAGE', 'GEOMETRY')))
    for index in range(size):
        if str(data['PLATID'][index]) not in ids:
            continue
        for field in RECORD_FIELDS:
            values = data.get(field, []) or []
            result[field].append(values[index] if index < len(values) else '')
    result['NUM'] = len(result['CODE'])
    result['CLASSIFY'] = classify_data(result)
    return result

def build_notification_current_data(previous_data, current_data, pending_platids):
    """Exclude non-sendable new records while preserving kept/removed sections."""
    previous_ids = {
        str(value)
        for value in (previous_data.get('PLATID', []) if isinstance(previous_data, dict) else [])
    }
    return filter_data_by_platids(current_data, previous_ids | set(str(x) for x in pending_platids))


def build_notification_previous_data(previous_data, current_data, removed_platids):
    """Keep current records and only deletion records eligible for notification."""
    current_ids = {
        str(value)
        for value in (current_data.get('PLATID', []) if isinstance(current_data, dict) else [])
    }
    return filter_data_by_platids(
        previous_data,
        current_ids | set(str(value) for value in (removed_platids or [])),
    )


def notify_notam_changes(previous_data, current_data, now=None, mail_enabled=None, index_lookup=None):
    """Send the focused added/removed notifications through email and the QQ bot.

    Both inputs must be focused NOTAM slices: only focused records are reported,
    drawn in the overview image and used for the colour/emoji maps.
    """
    check_time = now or datetime.now(UTC).replace(tzinfo=None)
    mail_on = MAIL_ENABLED if mail_enabled is None else bool(mail_enabled)
    if index_lookup is None:
        index_lookup = record_index_lookup([current_data])

    notified_numbers = load_notified_notam_numbers()
    pending_notams = get_new_notams_for_notification(previous_data, current_data, notified_numbers)
    pending_platids = [item['PLATID'] for item in pending_notams]
    pending_codes = [item['CODE'] for item in pending_notams]
    added_count = len(pending_notams)

    removed_notams = get_removed_notams_for_notification(
        previous_data, current_data, now=check_time, lead_minutes=60
    )
    removed_platids = [item['PLATID'] for item in removed_notams]
    removed_count = len(removed_notams)

    notification_previous = build_notification_previous_data(
        previous_data, current_data, removed_platids
    )
    notification_current = attach_record_indices(
        build_notification_current_data(previous_data, current_data, pending_platids),
        index_lookup,
    )

    if mail_on and (added_count > 0 or removed_count > 0):
        try:
            email_draft = generate_change_email_draft(notification_previous, notification_current)
            send_result = send_email_via_qq_smtp(get_mail_config(), email_draft)
            print(f"邮件发送成功: {send_result}")
            recorded_count = record_notified_notam_numbers(pending_codes)
            print(f"已记录 {recorded_count} 个通过邮件发送的新增航警编号")
        except Exception as exc:
            print(f"邮件发送失败: {exc}")
    elif mail_on:
        print('无符合条件的新增航警，且无删除时间早于开始时间60分钟的航警，已跳过邮件发送')
    else:
        print('MAIL.enabled=false，已跳过邮件发送')

    # QQ Bot 通知独立于邮件发送
    if added_count > 0:
        try:
            # 两条消息共用聚焦数据的颜色和 emoji 映射，保证图片一致
            from fetch.mail_draft import _build_code_to_color_map, _build_code_emoji_map
            code_to_color = _build_code_to_color_map(current_data)
            code_emoji_map = _build_code_emoji_map(current_data)

            # 第一条：仅新增航警图片 + 新增航警文字(无坐标)
            added_only_data = filter_data_by_platids(current_data, pending_platids)
            added_draft = generate_change_email_draft(
                {}, added_only_data, include_match=False, include_website=False,
                code_to_color=code_to_color, code_emoji_map=code_emoji_map, max_zoom=6, section_mode='added_only'
            )
            # 第二条：全部聚焦航警图片 + 当前聚焦航警文字
            full_draft = generate_change_email_draft(
                previous_data, current_data, include_match=False, include_website=False,
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

    return {'added': added_count, 'removed': removed_count}


def compute_data_hash(data, include_sources=None):
    if not isinstance(data, dict):
        return ''
    requested = {str(source).upper() for source in include_sources} if include_sources else None
    records = []
    size = min(*(len(data.get(field, []) or []) for field in ('CODE', 'TIME', 'PLATID', 'GEOMETRY')))
    for index in range(size):
        source = str((data.get('SOURCE', []) or ['NOTAM'])[index] if index < len(data.get('SOURCE', []) or []) else 'NOTAM').upper()
        if requested is None or source in requested:
            records.append('|'.join((str(data['CODE'][index]), str(data['TIME'][index]), str(data['PLATID'][index]), source, str(data['GEOMETRY'][index]))))
    return hashlib.sha256('\n'.join(sorted(records)).encode('utf-8')).hexdigest()

def is_valid_fetch_result(data):
    """Only complete fetches may trigger downstream updates."""
    if not isinstance(data, dict):
        return False
    if 'FETCH_VALID' in data:
        return data.get('FETCH_VALID') is True
    try:
        return int(data.get('NUM', 0) or 0) > 0
    except (TypeError, ValueError):
        return False


def should_update_visits(before_notam_hash, current_data):
    """Refresh visits only after a valid NOTAM change, never for MSI-only updates.

    ``HASH`` covers every source, including MSI. The visit counter must
    therefore follow the NOTAM-specific hash.
    """
    current_notam_hash = current_data.get('HASH_NOTAM', current_data.get('HASH'))
    return is_valid_fetch_result(current_data) and before_notam_hash != current_notam_hash

def load_previous_snapshot(path=SNAPSHOT_PATH):
    """Read the previous snapshot state without ever raising.

    A missing file, an unreadable file and a snapshot written before the focused
    layout exist all mean the same thing: the next scan establishes the baseline.
    """
    state = {
        'data': {},
        'hash': None,
        'hash_notam': None,
        'hash_focused': None,
        'focus_baseline': True,
        'focus_section': {},
    }
    try:
        with open(path, 'r', encoding='utf-8') as snapshot_file:
            previous_data = json.load(snapshot_file)
    except (OSError, ValueError):
        return state
    if not isinstance(previous_data, dict):
        return state

    focused_section = previous_data.get('FOCUSED_NOTAM_DATA')
    state['data'] = previous_data
    state['hash'] = previous_data.get('HASH')
    state['hash_notam'] = previous_data.get('HASH_NOTAM')
    state['hash_focused'] = previous_data.get('HASH_FOCUSED')
    state['focus_baseline'] = not isinstance(focused_section, dict)
    state['focus_section'] = focused_section if isinstance(focused_section, dict) else {}
    return state


def notification_trigger(snapshot, data):
    """Decide what one scan should do: ``invalid``, ``baseline``, ``notify`` or ``idle``.

    Focused scans notify only when the focused hash changed, so records outside
    ``[ICAO_FOCUSED]`` no longer send mail. Without ``[ICAO_FOCUSED]`` the scan falls
    back to the previous behaviour of notifying on any NOTAM change.
    """
    if not is_valid_fetch_result(data):
        return 'invalid'
    if data.get('FOCUS_ENABLED'):
        if snapshot.get('focus_baseline') or not snapshot.get('hash_focused'):
            return 'baseline'
        return 'notify' if snapshot.get('hash_focused') != data.get('HASH_FOCUSED') else 'idle'
    return 'notify' if snapshot.get('hash_notam') != data.get('HASH_NOTAM') else 'idle'


def _section_num(section):
    try:
        return int((section or {}).get('NUM', 0) or 0)
    except (AttributeError, TypeError, ValueError):
        return 0


def should_keep_previous_snapshot(payload, existing):
    """An incomplete scan must not overwrite a usable snapshot on disk."""
    if payload.get('FETCH_VALID'):
        return False
    if not isinstance(existing, dict):
        return False
    return (
        _section_num(existing.get('NOTAM_DATA')) > 0
        or _section_num(existing.get('FOCUSED_NOTAM_DATA')) > 0
    )


def _parse_time_windows(time_text):
    """Parse NOTAM UTC windows, tolerating case and extra whitespace."""
    windows = []
    for segment in str(time_text or '').split(';'):
        segment = segment.strip()
        match = re.fullmatch(
            r'(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2}:\d{2})\s+(\d{4})\s+UNTIL\s+'
            r'(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2}:\d{2})\s+(\d{4})',
            segment,
            flags=re.IGNORECASE,
        )
        if not match:
            continue
        start_day, start_mon, start_time, start_year, end_day, end_mon, end_time, end_year = match.groups()
        try:
            start = datetime.strptime(
                f'{start_day} {start_mon.upper()} {start_time} {start_year}',
                "%d %b %H:%M %Y",
            )
            end = datetime.strptime(
                f'{end_day} {end_mon.upper()} {end_time} {end_year}',
                "%d %b %H:%M %Y",
            )
        except (TypeError, ValueError):
            continue
        if end > start:
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
    cutoff = datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=grace_hours)
    size = min(
        len(data.get('CODE', []) or []),
        len(data.get('GEOMETRY', []) or []),
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

    for key in RECORD_FIELDS:
        arr = data.get(key, []) or []
        data[key] = [arr[i] for i in keep_indices if i < len(arr)]

    print(f"过滤过期数据: 移除 {expired_count} 条（结束时间早于当前时间24h）")


def remove_msi_fully_overlapped_by_notam(data):
    """Remove MSI records whose canonical geometry and time exactly equal a NOTAM."""
    size = min(*(len(data.get(field, []) or []) for field in ('CODE', 'TIME', 'PLATID', 'GEOMETRY', 'SOURCE')))
    notam_keys = {(str(data['GEOMETRY'][i]), _normalize_time_key(data['TIME'][i])) for i in range(size) if str(data['SOURCE'][i]).upper().startswith('NOTAM')}
    keep = [i for i in range(size) if not (str(data['SOURCE'][i]).upper().startswith('MSI') and (str(data['GEOMETRY'][i]), _normalize_time_key(data['TIME'][i])) in notam_keys)]
    if len(keep) == size: return
    for field in RECORD_FIELDS:
        values = data.get(field, []) or []
        data[field] = [values[i] for i in keep]
    print(f'去重重合数据: 移除 {size - len(keep)} 条与NOTAM完全重合的MSI')

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


def coordinates_are_excluded(coord_text):
    """Apply the existing geographic exclusion rules to one polygon."""
    points = []
    for part in re.findall(r'[NS]\\d{4,6}[WE]\\d{5,7}', str(coord_text or '').upper()):
        point = parse_point(part.strip())
        if point:
            points.append(point)

    for rect in EXCLUDE_RECTS:
        if any(point_in_rect(point, rect) for point in points):
            return True

        corners = [
            (rect['lat_min'], rect['lon_min']),
            (rect['lat_min'], rect['lon_max']),
            (rect['lat_max'], rect['lon_min']),
            (rect['lat_max'], rect['lon_max']),
        ]
        if any(point_in_poly(corner[0], corner[1], points) for corner in corners):
            return True

        # 保持现有行为：仅检测交点，不据此排除边界穿越的落区。
        rect_edges = [
            ((rect['lat_min'], rect['lon_min']), (rect['lat_min'], rect['lon_max'])),
            ((rect['lat_min'], rect['lon_max']), (rect['lat_max'], rect['lon_max'])),
            ((rect['lat_max'], rect['lon_max']), (rect['lat_max'], rect['lon_min'])),
            ((rect['lat_max'], rect['lon_min']), (rect['lat_min'], rect['lon_min'])),
        ]
        for index in range(len(points)):
            start = points[index]
            end = points[(index + 1) % len(points)]
            if any(seg_intersect(start, end, edge[0], edge[1]) for edge in rect_edges):
                break
    return False

ICAO_fallback_codes = 'ZBPE ZGZU ZHWH ZJSA ZLHW ZPKM ZSHA ZWUQ ZYSH VVTS WSJC WIIF YMMM WMFC RPHI AYPM AGGG ANAU NFFF KZAK VYYF VCCF VOMF WAAF RJJJ RCAA YBBB VVGL VVHN VVHM RCSP VVHM WIIF'

def _split_location_codes(raw_text):
    """Split a raw location list using the same rules as the source manager."""
    locations = []
    for item in re.split(r'[,;\s]+', str(raw_text or '')):
        value = item.strip().upper()
        if value and value not in locations:
            locations.append(value)
    return locations


def _parse_location_codes(config, section):
    """Read one ``codes =`` list; a missing section yields an empty list."""
    try:
        raw_text = config.get(section, 'codes', fallback='')
    except Exception:
        raw_text = ''
    return _split_location_codes(raw_text)


def plan_fetch_locations(all_codes, focused_codes):
    """Plan the two fetch stages.

    Returns ``(focused_stage, remaining_stage, focus_enabled)``. The remaining stage
    is ``[ICAO]`` minus the focused codes, so no location is queried twice. An empty
    focused list disables the focused stage and keeps the previous single-stage
    behaviour (and therefore the previous notification rule).
    """
    focused_stage = _split_location_codes(' '.join(str(code) for code in (focused_codes or [])))
    all_values = _split_location_codes(' '.join(str(code) for code in (all_codes or [])))
    if not focused_stage:
        return [], all_values, False
    focused_set = set(focused_stage)
    return focused_stage, [code for code in all_values if code not in focused_set], True


def load_config():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    config_file = os.path.join(current_dir, 'config.ini')
    config = configparser.ConfigParser()
    if not os.path.exists(config_file):
        config['DATA_SOURCES'] = {
            'enabled': 'faa',
        }
        config['ICAO'] = {
            'codes': ICAO_fallback_codes,
        }
        config['FAA'] = {
            'freeform_terms': 'AEROSPACE,AER0SPACE,DNG ZONE',
            'timeout': '7',
            'retries': '2',
            'max_workers': '2',
            'max_pages': '100',
        }
        config['DAIP'] = {
            'timeout': '15',
            'verify_ssl': 'false',
            'radius': '10',
            'sort': 'Criticality',
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
            f.write('# 数据源、查询位置、服务和通知配置\n')
            config.write(f)
    config.read(config_file, encoding='utf-8')
    return config

config = load_config()
ICAO_CODES = config.get('ICAO', 'codes', fallback=ICAO_fallback_codes)
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


def fetch(source_fetcher=None):
    """Fetch both stages and write the snapshot.

    ``source_fetcher`` defaults to the real :func:`fetch_enabled_sources`; tests
    inject a stub with the same ``(config, locations, source_names=...)`` signature.
    """
    fetch_stage = source_fetcher or fetch_enabled_sources
    try:
        current_config = load_config()
    except Exception as exc:
        print(f'读取 config.ini 失败，使用启动时配置: {exc}')
        current_config = config

    all_codes = _parse_location_codes(current_config, 'ICAO') or _split_location_codes(ICAO_CODES)
    focused_codes = _parse_location_codes(current_config, 'ICAO_FOCUSED')
    focused_stage, remaining_stage, focus_enabled = plan_fetch_locations(all_codes, focused_codes)
    fir_candidates = _parse_fir_candidates_from_config(','.join(focused_stage + all_codes))

    try:
        enabled_sources = get_enabled_source_names(current_config)
    except Exception as exc:
        print(f'读取数据源配置失败: {exc}')
        enabled_sources = []
    # MSI 只在第二批（剩余位置）抓取
    notam_sources = [name for name in enabled_sources if name != 'msi']

    batches = []
    focused_keys = set()
    if focus_enabled:
        print(f'[FOCUSED] 阶段1: 抓取 {len(focused_stage)} 个聚焦位置（数据源: {", ".join(notam_sources) or "无"}）')
        focused_batch = fetch_stage(current_config, focused_stage, source_names=notam_sources)
        focused_keys = _record_keys(focused_batch.data)
        batches.append(focused_batch)
        print(f'[FOCUSED] 阶段1: 返回 {len(focused_batch.data.get("CODE", []) or [])} 条记录')
    else:
        print('警告: [ICAO_FOCUSED] 未配置位置，退化为单阶段抓取，通知按全部 NOTAM 变化触发')

    if remaining_stage:
        stage_label = '阶段2' if focus_enabled else '单阶段'
        print(f'[FOCUSED] {stage_label}: 抓取 {len(remaining_stage)} 个位置（含 MSI）')
        remaining_batch = fetch_stage(current_config, remaining_stage)
        batches.append(remaining_batch)
        print(f'[FOCUSED] {stage_label}: 返回 {len(remaining_batch.data.get("CODE", []) or [])} 条记录')
    else:
        print('[FOCUSED] 阶段2: 没有剩余位置，已跳过（本轮不获取 MSI 数据）')

    dataDict = merge_source_batches(batches)
    backfill_fir_from_text(dataDict, fir_candidates)
    harmonize_fir_by_platid(dataDict)
    filter_expired_records(dataDict, grace_hours=24)
    remove_msi_fully_overlapped_by_notam(dataDict)
    dataDict['ALTITUDE'] = extract_altitude(dataDict['RAWMESSAGE'])

    # 行号空间 = 聚焦段 → 外部段 → MSI 段，两个 NOTAM 段各自排序与分类
    focused_data, notam_data, msi_data = build_data_segments(dataDict, focused_keys)
    dataDict['NUM'] = len(dataDict['CODE'])
    dataDict['CLASSIFY'] = classify_data(dataDict)
    dataDict['HASH'] = compute_data_hash(dataDict)
    dataDict['HASH_NOTAM'] = compute_data_hash(dataDict, include_sources={'NOTAM'})
    dataDict['HASH_MSI'] = compute_data_hash(dataDict, include_sources={'MSI'})
    dataDict['HASH_FOCUSED'] = focused_data['HASH']
    dataDict['FOCUS_ENABLED'] = focus_enabled
    dataDict['FOCUSED_NUM'] = focused_data['NUM']
    dataDict['NOTAM_NUM'] = focused_data['NUM'] + notam_data['NUM']

    fetch_complete = batches_are_complete(batches)
    dataDict['FETCH_VALID'] = fetch_complete
    payload = {
        'FOCUSED_NOTAM_DATA': focused_data,
        'NOTAM_DATA': notam_data,
        'MSI_DATA': msi_data,
        'HASH': dataDict['HASH'],
        'HASH_NOTAM': dataDict['HASH_NOTAM'],
        # 未启用聚焦段时写 None，下一轮启用后按「建立聚焦基线」处理，避免一次性轰炸
        'HASH_FOCUSED': dataDict['HASH_FOCUSED'] if focus_enabled else None,
        'FETCH_VALID': fetch_complete,
    }

    if not fetch_complete:
        existing = load_previous_snapshot(SNAPSHOT_PATH)['data']
        if should_keep_previous_snapshot(payload, existing):
            print('部分数据源获取失败，跳过覆盖（防止部分快照触发误删除通知）')
            skipped = dict(existing)
            skipped['FETCH_VALID'] = False
            return skipped

    with open(SNAPSHOT_PATH, 'w', encoding='utf-8') as json_file:
        json.dump(payload, json_file, ensure_ascii=False, indent=4)
    return dataDict


def run_scan(snapshot_path=SNAPSHOT_PATH, fetcher=None, mail_enabled=None,
             notification_sender=None, visits_updater=None,
             notify_list_path=NOTIFY_SEND_LIST_PATH):
    """Run one full scan: fetch, rebuild history matches when needed, notify on focus changes.

    Only the focused stage drives mail/QQ notifications; the non-focused records stay
    visible on the site and in ``data_dict.json``. The injected ``notification_sender``
    must accept ``(previous_data, current_data, mail_enabled=...)``.
    """
    send_notifications = notification_sender or notify_notam_changes
    refresh_visits = visits_updater or update_visits

    # Maintain the notification list on every scan, including unchanged data.
    load_notified_notam_numbers(notify_list_path)

    snapshot = load_previous_snapshot(snapshot_path)
    previous_data = snapshot['data']
    before_hash = snapshot['hash'] or compute_data_hash(previous_data)
    before_notam_hash = snapshot['hash_notam'] or compute_data_hash(
        previous_data, include_sources={'NOTAM'}
    )

    dataDict = fetch(source_fetcher=fetcher)
    after_hash = dataDict.get("HASH", None)
    fetch_result_valid = is_valid_fetch_result(dataDict)
    trigger = notification_trigger(snapshot, dataDict)

    if should_update_visits(before_notam_hash, dataDict):
        refresh_visits()
        print('检测到航警变化，已执行 update_visits')

    if not fetch_result_valid:
        print('本次抓取结果为空，视为上游异常，已跳过 visits、历史匹配和通知')
        return trigger

    focused_num = int(dataDict.get('FOCUSED_NUM', 0) or 0)
    notam_num = int(dataDict.get('NOTAM_NUM', 0) or 0)
    # 站点行号空间 = 聚焦段（按 CODE 排序）→ 外部段（按 CODE 排序）→ MSI 段
    global_rows = order_notam_rows(dataDict, focused_num, notam_num)
    current_notam = build_section(dataDict, global_rows, sort_by_code=False)
    current_focused = build_section(dataDict, global_rows[:focused_num], sort_by_code=False)

    # 聚焦段变化才通知；匹配文件在行号空间变化（首次升级或 NOTAM 段变化）时重建
    if trigger == 'baseline' or snapshot['hash_notam'] != dataDict.get('HASH_NOTAM'):
        notam_match_archive(dataDict=current_notam, match_indices=range(focused_num))

    if trigger == 'baseline':
        print('未检测到上一轮聚焦快照，已建立聚焦基线并跳过通知')
    elif trigger == 'notify':
        if dataDict.get('FOCUS_ENABLED'):
            send_notifications(snapshot['focus_section'], current_focused, mail_enabled=mail_enabled)
        else:
            send_notifications(
                filter_data_by_source(previous_data, {'NOTAM'}),
                current_notam,
                mail_enabled=mail_enabled,
            )
    elif before_hash != after_hash:
        print('仅MSI或非聚焦NOTAM数据变化，已跳过历史匹配与邮件发送')
    else:
        print('数据未变化，已跳过通知')
    return trigger


if __name__ == '__main__':
    run_scan()

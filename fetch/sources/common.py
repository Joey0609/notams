import html
import re
from datetime import datetime
from typing import List, Optional


EMPTY_TIME = '00 JAN 00:00 0000 UNTIL 00 JAN 00:00 0000'
PERMANENT_END = '31 DEC 23:59 2099'


def standardize_coordinate(value: str) -> Optional[str]:
    coordinate = re.sub(r'\s+', '', str(value or '')).upper()
    match = re.fullmatch(r'([NS])(\d{4,6})([WE])(\d{5,7})', coordinate)
    if match:
        return coordinate
    match = re.fullmatch(r'(\d{4,6})([NS])(\d{5,7})([WE])', coordinate)
    if match:
        return f'{match.group(2)}{match.group(1)}{match.group(4)}{match.group(3)}'
    return None


def extract_coordinate_groups(text: str, minimum_points: int = 3) -> List[List[str]]:
    compact = re.sub(r'\s+', '', html.unescape(str(text or ''))).upper()
    patterns = (
        r'[NS]\d{6}[WE]\d{7}',
        r'[NS]\d{4}[WE]\d{5}',
        r'\d{6}[NS]\d{7}[WE]',
        r'\d{4}[NS]\d{5}[WE]',
    )
    matches = []
    for match in re.finditer('|'.join(f'(?:{item})' for item in patterns), compact):
        coordinate = standardize_coordinate(match.group())
        if coordinate:
            matches.append((coordinate, match.start(), match.end()))

    groups: List[List[str]] = []
    current: List[str] = []
    previous_end = None
    for coordinate, start, end in matches:
        if previous_end is not None and start - previous_end > 20:
            if len(current) >= minimum_points:
                groups.append(current)
            current = []
        current.append(coordinate)
        previous_end = end
    if len(current) >= minimum_points:
        groups.append(current)
    return groups


def is_relevant_area_notam(message: str) -> bool:
    text = html.unescape(str(message or '')).upper()
    return (
        ('A TEMPORARY' in text and '-' in text)
        or 'AEROSPACE' in text
        or 'AER0SPACE' in text
        or ('CHINA' in text and 'DNG ZONE' in text and 'AERIAL' in text)
    )


def extract_altitude(raw_message: str) -> str:
    pattern = re.compile(
        r'Q\)\s*[A-Z]+?/[A-Z]+?/[IVK\s]*?/[NBOMK\s]*?/[AEWK\s]*?/(\d{3}/\d{3})/',
        re.IGNORECASE,
    )
    match = pattern.search(html.unescape(str(raw_message or '')))
    if not match:
        return 'None'
    lower, upper = (int(value) for value in match.group(1).split('/'))
    lower_value = round(lower * 0.3048) * 100
    upper_value = 'INF' if upper == 999 else round(upper * 0.3048) * 100
    return f'{lower_value} ~ {upper_value} 米'


def parse_faa_date_range(start_date: str, end_date: str) -> str:
    if not start_date or not end_date:
        return EMPTY_TIME
    start = _parse_us_notam_date(start_date)
    if str(end_date).strip().upper() == 'PERM':
        end = PERMANENT_END
    else:
        end = _parse_us_notam_date(end_date)
    if not start or not end:
        return EMPTY_TIME
    return f'{start} UNTIL {end}'


def _parse_us_notam_date(value: str) -> Optional[str]:
    try:
        parsed = datetime.strptime(str(value).strip(), '%m/%d/%Y %H%M')
    except (TypeError, ValueError):
        return None
    return parsed.strftime('%d %b %H:%M %Y').upper()


def parse_raw_notam_time(raw_message: str, display_text: str = '') -> str:
    raw = html.unescape(str(raw_message or '')).upper()
    start_match = re.search(r'\bB\)\s*(\d{10})', raw)
    end_match = re.search(r'\bC\)\s*(\d{10}|PERM)', raw)
    if start_match and end_match:
        start = _parse_compact_notam_date(start_match.group(1))
        end_token = end_match.group(1)
        end = PERMANENT_END if end_token == 'PERM' else _parse_compact_notam_date(end_token)
        if start and end:
            return f'{start} UNTIL {end}'

    text = html.unescape(str(display_text or '')).upper()
    match = re.search(
        r'(\d{2} [A-Z]{3} \d{2}:\d{2} \d{4})\s+UNTIL\s+'
        r'((?:\d{2} [A-Z]{3} \d{2}:\d{2} \d{4})|PERM)',
        text,
    )
    if match:
        end = PERMANENT_END if match.group(2) == 'PERM' else match.group(2)
        return f'{match.group(1)} UNTIL {end}'
    return EMPTY_TIME


def _parse_compact_notam_date(value: str) -> Optional[str]:
    try:
        parsed = datetime.strptime(value, '%y%m%d%H%M')
    except (TypeError, ValueError):
        return None
    return parsed.strftime('%d %b %H:%M %Y').upper()


def extract_fir(raw_message: str, fallback: str = 'UNKNOWN') -> str:
    raw = html.unescape(str(raw_message or '')).upper()
    match = re.search(r'\bA\)\s*([A-Z]{4})\b', raw)
    return match.group(1) if match else str(fallback or 'UNKNOWN').upper()


def add_area_records(
    output,
    *,
    code: str,
    raw_message: str,
    time_value: str,
    platid: str,
    fir: str,
    source_type: str = 'NOTAM',
) -> int:
    from .base import append_record

    groups = extract_coordinate_groups(raw_message)
    altitude = extract_altitude(raw_message)
    for index, group in enumerate(groups, start=1):
        area_code = f'{code}_AREA{index}' if len(groups) > 1 else code
        append_record(
            output,
            CODE=area_code,
            COORDINATES='-'.join(group),
            TIME=time_value,
            PLATID=f'{platid}:AREA{index}' if len(groups) > 1 else platid,
            RAWMESSAGE=html.unescape(str(raw_message or '')),
            ALTITUDE=altitude,
            SOURCE=source_type,
            FIR=fir or 'UNKNOWN',
        )
    return len(groups)


def deduplicate_by_code(data):
    from .base import DATA_FIELDS, empty_data

    output = empty_data()
    seen = set()
    field_values = {
        field_name: list(data.get(field_name, []) or [])
        for field_name in DATA_FIELDS
    }
    for index, code in enumerate(data.get('CODE', []) or []):
        key = re.sub(r'\s+', '', str(code or '')).upper()
        if not key or key in seen:
            continue
        seen.add(key)
        for field_name in DATA_FIELDS:
            values = field_values[field_name]
            output[field_name].append(str(values[index] if index < len(values) else ''))
    return output

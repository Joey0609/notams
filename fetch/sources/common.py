import html
import re
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional


EMPTY_TIME = '00 JAN 00:00 0000 UNTIL 00 JAN 00:00 0000'
PERMANENT_END = '31 DEC 23:59 2099'
FULL_ALTITUDE_RANGE = '0 ~ INF 米'


@dataclass(frozen=True)
class FaaNoticeHeader:
    """Identity tokens from FAA exclamation-mark headers."""

    facility: str
    number: str
    scope: str

    @property
    def dedup_key(self) -> str:
        return f'{self.facility}:{self.number}'


# !FDC 6/7111 ZHU, !CARF 07/058 ZMA, !BGR 06/072 85B, !KXMR M0035/26 XMR
_FAA_HEADER_RE = re.compile(
    r'^\s*!(?P<facility>[A-Z]{3,4})\s+'
    r'(?P<number>[A-Z]?\d{1,4}/\d{2,4})\s+'
    r'(?P<scope>[A-Z0-9]{2,4})\b',
    re.IGNORECASE,
)
_COMPACT_COORDINATE_RE = re.compile(
    r'[NS]\d{4,6}/?[WE]\d{5,7}|\d{4,6}[NS]/?\d{5,7}[WE]',
    re.IGNORECASE,
)
_DMS_PAIR_RE = re.compile(
    r'(?P<lat_deg>\d{1,2})\s+(?P<lat_min>\d{1,2})\s+'
    r'(?P<lat_sec>\d{1,2}(?:\.\d+)?)\s*(?P<lat_dir>[NS])\s*[,/ ]+\s*'
    r'(?P<lon_deg>\d{1,3})\s+(?P<lon_min>\d{1,2})\s+'
    r'(?P<lon_sec>\d{1,2}(?:\.\d+)?)\s*(?P<lon_dir>[EW])',
    re.IGNORECASE,
)
_COMPACT_DECIMAL_DMS_RE = re.compile(
    r'(?P<lat_deg>\d{2})(?P<lat_min>\d{2})(?P<lat_sec>\d{2}\.\d+)(?P<lat_dir>[NS])\s*/?\s*'
    r'(?P<lon_deg>\d{3})(?P<lon_min>\d{2})(?P<lon_sec>\d{2}\.\d+)(?P<lon_dir>[EW])',
    re.IGNORECASE,
)


def _raw_text(value: str) -> str:
    return html.unescape(str(value or '')).upper()


def parse_faa_notice_header(raw_message: str) -> Optional[FaaNoticeHeader]:
    """Parse a standard FAA !FACILITY NUMBER SCOPE header, if present."""
    match = _FAA_HEADER_RE.match(_raw_text(raw_message))
    if not match:
        return None
    return FaaNoticeHeader(
        facility=match.group('facility').upper(),
        number=match.group('number').upper(),
        scope=match.group('scope').upper(),
    )


def extract_notam_code(raw_message: str, fallback: str = 'UNKNOWN') -> str:
    """Return the FAA notice number, e.g. 07/058 or 6/7111."""
    header = parse_faa_notice_header(raw_message)
    if header:
        return header.number
    return str(fallback) if fallback is not None else 'UNKNOWN'


def notam_dedup_key(raw_message: str, code: str) -> str:
    """Keep same-number notices from different FAA facilities distinct."""
    header = parse_faa_notice_header(raw_message)
    if header:
        return header.dedup_key
    return re.sub(r'\s+', '', str(code or '')).upper()


def _format_dms_component(degrees: str, minutes: str, seconds: str, width: int) -> str:
    total_seconds = round(float(seconds))
    minute_value = int(minutes)
    degree_value = int(degrees)
    if total_seconds == 60:
        total_seconds = 0
        minute_value += 1
    if minute_value == 60:
        minute_value = 0
        degree_value += 1
    return f'{degree_value:0{width}d}{minute_value:02d}{total_seconds:02d}'


def _dms_match_to_compact(match: re.Match) -> str:
    lat = _format_dms_component(
        match.group('lat_deg'), match.group('lat_min'), match.group('lat_sec'), 2,
    )
    lon = _format_dms_component(
        match.group('lon_deg'), match.group('lon_min'), match.group('lon_sec'), 3,
    )
    return f'{match.group("lat_dir").upper()}{lat}{match.group("lon_dir").upper()}{lon}'


def normalize_coordinate_notation(text: str) -> str:
    """Convert supported DMS-with-decimal-seconds notation to compact DMS."""
    raw = _raw_text(text)
    raw = _COMPACT_DECIMAL_DMS_RE.sub(_dms_match_to_compact, raw)
    return _DMS_PAIR_RE.sub(_dms_match_to_compact, raw)


def standardize_coordinate(value: str) -> Optional[str]:
    coordinate = re.sub(r'[\s/]+', '', normalize_coordinate_notation(value))
    match = re.fullmatch(r'([NS])(\d{4,6})([WE])(\d{5,7})', coordinate)
    if match:
        return coordinate
    match = re.fullmatch(r'(\d{4,6})([NS])(\d{5,7})([WE])', coordinate)
    if match:
        return f'{match.group(2)}{match.group(1)}{match.group(4)}{match.group(3)}'
    return None


def extract_coordinate_groups(text: str, minimum_points: int = 3) -> List[List[str]]:
    """Extract contiguous compact-coordinate polygons; truncated text stays invalid."""
    compact = re.sub(r'\s+', '', normalize_coordinate_notation(text))
    matches = []
    for match in _COMPACT_COORDINATE_RE.finditer(compact):
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


def _first_compact_coordinate(text: str) -> Optional[str]:
    match = _COMPACT_COORDINATE_RE.search(text)
    return standardize_coordinate(match.group()) if match else None


def extract_circle_area(text: str):
    """Return a described circular NOTAM area as (center, radius, unit)."""
    compact = re.sub(r'\s+', '', normalize_coordinate_notation(text))
    coordinate = r'(?P<center>[NS]\d{4,6}[WE]\d{5,7}|\d{4,6}[NS]\d{5,7}[WE])'

    # Numeric radius before its centre: "2.5NM RADIUS OF ..." and
    # "12NM RADIUS CENTERED ON POSITION ...".
    radius_first = re.search(
        r'(?P<radius>\d+(?:\.\d+)?)(?P<unit>KM|NM)RADIUS(?:OF|IS)?'
        r'(?:CENTEREDON(?:POSITION)?|CENTERON(?:POSITION)?|CENTEREDAT)?' + coordinate,
        compact,
    )
    if radius_first:
        center = standardize_coordinate(radius_first.group('center'))
        radius = float(radius_first.group('radius'))
        if center and radius > 0:
            return center, radius, radius_first.group('unit')

    # Plain-language Blue Origin wording: "REMAIN CLEAR ... BY ONE HALF
    # NAUTICAL MILE" after a single DMS coordinate.
    half_mile = re.search(
        coordinate + r'.{0,140}?REMAINCLEAR.{0,80}?ONEHALFNAUTICALMILE',
        compact,
    )
    if half_mile:
        center = standardize_coordinate(half_mile.group('center'))
        if center:
            return center, 0.5, 'NM'

    # Explicit CIRCLE wording, where centre and radius appear in either order.
    if 'CIRCLE' not in compact:
        return None
    center_match = re.search(
        r'(?:CENTER(?:ED)?(?:AT|ON(?:POSITION)?)?|CENTRE(?:D)?(?:AT|ON(?:POSITION)?)?)'
        + coordinate,
        compact,
    )
    radius_match = re.search(r'RADIUS(?:OF|IS)?(?P<radius>\d+(?:\.\d+)?)(?P<unit>KM|NM)', compact)
    if not center_match or not radius_match:
        return None
    center = standardize_coordinate(center_match.group('center'))
    radius = float(radius_match.group('radius'))
    if not center or radius <= 0:
        return None
    return center, radius, radius_match.group('unit')


def is_relevant_area_notam(message: str) -> bool:
    """Fetch-time semantic filter; geometry is validated later by add_area_records()."""
    text = _raw_text(message)
    is_relevant = (
        ('A TEMPORARY' in text and ('-' in text))
        or ('AEROSPACE' in text)
        or 'AER0SPACE' in text
        or ('CHINA' in text and 'DNG ZONE' in text and 'AERIAL' in text)
        or ('SPACE VEHICLE' in text and 'RE-ENTRY' in text)
        or ('SPACE VEHICLE' in text and 'REENTRY' in text)
        or ('SPACE' in text and 'LAUNCH' in text)
        or ('SPACE' in text and 'SPLASHDOWN' in text)
        # or ('SPACE DEBRIS' in text and ('RETURN' in text or 'REENTRY' in text or 'RE-ENTRY' in text))
        or ('ROCKET' in text and 'LAUNCH' in text)
        or ('ROCKET' in text and 'REENTRY' in text)
        or ('ROCKET' in text and 'RETURN' in text)
        or ('ROCKET' in text and 'RE-ENTRY' in text)
        or ('ROCKET' in text and 'SPLASHDOWN' in text)
        or ('ROCKET' in text and 'STARSHIP' in text)
        or ('ROCKET' in text and 'SPACEX' in text)
        or ('ROCKET LAB' in text)
        or ('AIRSPACE' in text and 'STARLINK' in text)
        or ('SPACEX' in text and 'STARLINK' in text)
        or ('SPACEX' in text and 'STARLINK' in text)
    )
    not_relevant = (
        ('MISSILE' in text)
        # or ('SPACE DEBRIS' in text)
        or ('TRACEX' in text or 'TORPEX' in text or 'GUNEX' in text or 'LASEX' in text)
        or extract_altitude(text) != FULL_ALTITUDE_RANGE
    )
    return is_relevant and not not_relevant

def extract_altitude(raw_message: str) -> str:
    pattern = re.compile(
        r'Q\)\s*[A-Z]+?/[A-Z]+?/[IVK\s]*?/[NBOMK\s]*?/[AEWK\s]*?/(\d{3}/\d{3})/',
        re.IGNORECASE,
    )
    match = pattern.search(_raw_text(raw_message))
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
    end = PERMANENT_END if str(end_date).strip().upper() == 'PERM' else _parse_us_notam_date(end_date)
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
    raw = _raw_text(raw_message)
    start_match = re.search(r'\bB\)\s*(\d{10})', raw)
    end_match = re.search(r'\bC\)\s*(\d{10}|PERM)', raw)
    if start_match and end_match:
        start = _parse_compact_notam_date(start_match.group(1))
        end_token = end_match.group(1)
        end = PERMANENT_END if end_token == 'PERM' else _parse_compact_notam_date(end_token)
        if start and end:
            return f'{start} UNTIL {end}'

    compact_range = re.search(r'\b(\d{10})\s*-\s*(\d{10})(?!\d)', raw)
    if compact_range:
        start = _parse_compact_notam_date(compact_range.group(1))
        end = _parse_compact_notam_date(compact_range.group(2))
        if start and end:
            return f'{start} UNTIL {end}'

    display = _raw_text(display_text)
    match = re.search(
        r'(\d{2} [A-Z]{3} \d{2}:\d{2} \d{4})\s+UNTIL\s+'
        r'((?:\d{2} [A-Z]{3} \d{2}:\d{2} \d{4})|PERM)',
        display,
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
    raw = _raw_text(raw_message)
    match = re.search(r'\bA\)\s*([A-Z]{4})\b', raw)
    if match:
        return match.group(1)
    header = parse_faa_notice_header(raw)
    return header.scope if header else str(fallback or 'UNKNOWN').upper()


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
    """Append one authoritative drawable geometry per described area."""
    from .base import append_record
    from .geometry import geometry_from_notam

    normalized_raw = normalize_coordinate_notation(raw_message)
    groups = extract_coordinate_groups(normalized_raw)
    circle = extract_circle_area(normalized_raw)
    geometry = geometry_from_notam(normalized_raw, groups, circle)
    if not geometry:
        return 0

    altitude = extract_altitude(raw_message)
    common = dict(
        CODE=code, TIME=time_value, PLATID=platid,
        RAWMESSAGE=html.unescape(str(raw_message or '')), ALTITUDE=altitude,
        SOURCE=source_type, FIR=fir or 'UNKNOWN', GEOMETRY=geometry,
    )
    append_record(output, **common)
    return 1


def deduplicate_by_code(data):
    """Deduplicate records by FAA facility-qualified identity when available."""
    from .base import DATA_FIELDS, empty_data

    output = empty_data()
    seen = set()
    field_values = {
        field_name: list(data.get(field_name, []) or [])
        for field_name in DATA_FIELDS
    }
    for index, code in enumerate(data.get('CODE', []) or []):
        raw_values = field_values['RAWMESSAGE']
        raw_message = raw_values[index] if index < len(raw_values) else ''
        key = notam_dedup_key(raw_message, code)
        if not key or key in seen:
            continue
        seen.add(key)
        for field_name in DATA_FIELDS:
            values = field_values[field_name]
            output[field_name].append(str(values[index] if index < len(values) else ''))
    return output

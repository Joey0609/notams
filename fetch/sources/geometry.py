"""Canonical NOTAM area geometry.

The parser emits one compact string that is authoritative for map rendering.
It deliberately keeps parsing and polygon repair out of source adapters and
out of the browser.
"""
from __future__ import annotations

import math
import re
from typing import Iterable, List, Optional, Sequence, Tuple


_COORD_RE = re.compile(
    r'[NS]\d{4,6}/?[WE]\d{5,7}|\d{4,6}[NS]/?\d{5,7}[WE]', re.I
)


def _coordinate(value: str) -> Optional[str]:
    value = re.sub(r'[\s/,]+', '', value or '').upper()
    match = re.fullmatch(r'([NS])(\d{4,6})([WE])(\d{5,7})', value)
    if match:
        return value
    match = re.fullmatch(r'(\d{4,6})([NS])(\d{5,7})([WE])', value)
    if match:
        return f'{match.group(2)}{match.group(1)}{match.group(4)}{match.group(3)}'
    return None


def _coordinates(text: str) -> List[Tuple[str, int, int]]:
    found = []
    for match in _COORD_RE.finditer(text or ''):
        coordinate = _coordinate(match.group())
        if coordinate:
            found.append((coordinate, match.start(), match.end()))
    return found


def _point(coordinate: str) -> Tuple[float, float]:
    match = re.fullmatch(r'([NS])(\d{2})(\d{2})(\d{0,2})([WE])(\d{3})(\d{2})(\d{0,2})', coordinate)
    if not match:
        raise ValueError(f'unsupported coordinate: {coordinate}')
    lat = int(match.group(2)) + int(match.group(3)) / 60 + int(match.group(4) or 0) / 3600
    lon = int(match.group(6)) + int(match.group(7)) / 60 + int(match.group(8) or 0) / 3600
    return (-lat if match.group(1) == 'S' else lat, -lon if match.group(5) == 'W' else lon)


def _unwrap(points: Sequence[Tuple[float, float]]) -> List[Tuple[float, float]]:
    if not points:
        return []
    result = [points[0]]
    for lat, lon in points[1:]:
        previous = result[-1][1]
        while lon - previous > 180:
            lon -= 360
        while lon - previous < -180:
            lon += 360
        result.append((lat, lon))
    return result


def _orientation(a, b, c) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _on_segment(a, b, c) -> bool:
    return min(a[0], c[0]) <= b[0] <= max(a[0], c[0]) and min(a[1], c[1]) <= b[1] <= max(a[1], c[1])


def _segments_intersect(a, b, c, d) -> bool:
    ab_c, ab_d = _orientation(a, b, c), _orientation(a, b, d)
    cd_a, cd_b = _orientation(c, d, a), _orientation(c, d, b)
    if ab_c == 0 and _on_segment(a, c, b): return True
    if ab_d == 0 and _on_segment(a, d, b): return True
    if cd_a == 0 and _on_segment(c, a, d): return True
    if cd_b == 0 and _on_segment(c, b, d): return True
    return (ab_c > 0) != (ab_d > 0) and (cd_a > 0) != (cd_b > 0)


def _self_intersects(points: Sequence[Tuple[float, float]]) -> bool:
    size = len(points)
    for i in range(size):
        for j in range(i + 1, size):
            if j in (i, (i + 1) % size) or (i == 0 and j == size - 1):
                continue
            if _segments_intersect(points[i], points[(i + 1) % size], points[j], points[(j + 1) % size]):
                return True
    return False


def _convex_hull(items: Sequence[Tuple[str, float, float]]) -> List[str]:
    unique = {(x, y): coord for coord, x, y in items}
    ordered = sorted((x, y, coord) for (x, y), coord in unique.items())
    if len(ordered) < 3:
        return []
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower = []
    for item in ordered:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], item) <= 0:
            lower.pop()
        lower.append(item)
    upper = []
    for item in reversed(ordered):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], item) <= 0:
            upper.pop()
        upper.append(item)
    return [item[2] for item in lower[:-1] + upper[:-1]]


def path_geometry(coordinates: Iterable[str]) -> str:
    """Make a closed PATH, rebuilding only a self-crossing vertex sequence."""
    values = [value for value in coordinates if _coordinate(value)]
    if len(values) > 1 and values[0] == values[-1]:
        values.pop()
    if len(values) < 3:
        return ''
    points = _unwrap([_point(value) for value in values])
    if _self_intersects(points):
        values = _convex_hull([(value, lon, lat) for value, (lat, lon) in zip(values, points)])
        if len(values) < 3:
            return ''
    return 'PATH|M=' + values[0] + ''.join('|L=' + value for value in values[1:]) + '|Z'


def _sector_geometry(text: str) -> str:
    pattern = re.compile(
        r'PARTS?\s+OF\s+A\s+CIRCLE.*?(?:CENTERED\s+(?:AT|ON)\s*)'
        r'(?P<center>[NS]\d{4,6}[WE]\d{5,7}|\d{4,6}[NS]\s*,?\s*\d{5,7}[WE])'
        r'.*?RADIUS\s+(?:OF\s+)?(?P<radius>\d+(?:\.\d+)?)(?P<unit>KM|NM)'
        r'\s+F(?:ROM|M)\s+(?P<start>\d+(?:\.\d+)?)\s+DEGREES?\s+TO\s+'
        r'(?P<end>\d+(?:\.\d+)?)\s+DEGREES?\s*(?P<direction>CLOCKWISE|COUNTERCLOCKWISE)?', re.I | re.S,
    )
    match = pattern.search(text or '')
    if not match:
        return ''
    center = _coordinate(match.group('center'))
    if not center:
        return ''
    direction = 'CCW' if (match.group('direction') or '').upper().startswith('COUNTER') else 'CW'
    return f"SECTOR|C={center}|R={match.group('radius')}{match.group('unit').upper()}|B={match.group('start')},{match.group('end')}|D={direction}"


def _arc_path_geometry(text: str) -> str:
    arcs = list(re.finditer(
        r'(?P<direction>COUNTER[ -]?CLOCKWISE|CLOCKWISE)\s+(?:VIA\s+|ON\s+)?A\s+'
        r'(?P<radius>\d+(?:\.\d+)?)(?P<unit>KM|NM)\s+ARC\s+CENTERED\s+(?:ON|AT)\s+'
        r'(?P<center>[NS]\d{4,6}[WE]\d{5,7}|\d{4,6}[NS]\d{5,7}[WE]).{0,120}?\s+TO\s+'
        r'(?P<end>[NS]\d{4,6}[WE]\d{5,7}|\d{4,6}[NS]\d{5,7}[WE])', text or '', re.I | re.S
    ))
    if len(arcs) != 1:
        return ''
    arc = arcs[0]
    all_coords = _coordinates(text)
    before = [coordinate for coordinate, _start, end in all_coords if end <= arc.start()]
    center, end = _coordinate(arc.group('center')), _coordinate(arc.group('end'))
    if len(before) < 2 or not center or not end:
        return ''
    after = [coordinate for coordinate, start, _end in all_coords if start >= arc.end()]
    vertices = before + [end] + after
    if vertices[-1] == vertices[0]:
        vertices.pop()
    if len(vertices) < 3:
        return ''
    direction = 'CCW' if arc.group('direction').upper().startswith('COUNTER') else 'CW'
    commands = ['PATH', 'M=' + before[0]]
    commands.extend('L=' + value for value in before[1:])
    commands.append(f"A=C:{center},R:{arc.group('radius')}{arc.group('unit').upper()},D:{direction},E:{end}")
    commands.extend('L=' + value for value in after if value != vertices[0])
    commands.append('Z')
    return '|'.join(commands)


def geometry_from_notam(text: str, coordinate_groups: Sequence[Sequence[str]], circle: Optional[Tuple[str, float, str]]) -> str:
    """Return the single serialised drawable geometry, or an empty string."""
    sector = _sector_geometry(text)
    if sector:
        return sector
    arc_path = _arc_path_geometry(text)
    if arc_path:
        return arc_path
    if circle:
        center, radius, unit = circle
        return f'CIRCLE|C={center}|R={radius:g}{unit.upper()}'
    for group in coordinate_groups:
        geometry = path_geometry(group)
        if geometry:
            return geometry
    return ''


_UNIT_METERS = {'KM': 1000.0, 'NM': 1852.0}
_EARTH_RADIUS_METERS = 6371008.8


def _field(parts: Sequence[str], key: str) -> str:
    prefix = f'{key}='
    for part in parts:
        if part.startswith(prefix):
            return part[len(prefix):]
    return ''


def _meters(value: str) -> float:
    match = re.fullmatch(r'(\d+(?:\.\d+)?)\s*(KM|NM)', str(value or '').strip().upper())
    return float(match.group(1)) * _UNIT_METERS[match.group(2)] if match else 0.0


def _destination(center: Tuple[float, float], bearing: float, meters: float) -> Tuple[float, float]:
    distance = meters / _EARTH_RADIUS_METERS
    direction = math.radians(bearing)
    lat1, lon1 = math.radians(center[0]), math.radians(center[1])
    lat2 = math.asin(math.sin(lat1) * math.cos(distance) + math.cos(lat1) * math.sin(distance) * math.cos(direction))
    lon2 = lon1 + math.atan2(
        math.sin(direction) * math.sin(distance) * math.cos(lat1),
        math.cos(distance) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), math.degrees(lon2)


def _bearing(start: Tuple[float, float], end: Tuple[float, float]) -> float:
    lat1, lat2 = math.radians(start[0]), math.radians(end[0])
    delta_lon = math.radians(end[1] - start[1])
    y = math.sin(delta_lon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(delta_lon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _append_arc(points: List[Tuple[float, float]], center, radius_m, end, direction: str) -> bool:
    if not points or center is None or radius_m <= 0 or end is None:
        return False
    start_bearing, end_bearing = _bearing(center, points[-1]), _bearing(center, end)
    if direction == 'CCW':
        sweep = (start_bearing - end_bearing + 360) % 360
    else:
        sweep = (end_bearing - start_bearing + 360) % 360
    steps = max(1, math.ceil((sweep or 360) / 2))
    for step in range(1, steps + 1):
        bearing = start_bearing - sweep * step / steps if direction == 'CCW' else start_bearing + sweep * step / steps
        points.append(_destination(center, bearing, radius_m))
    return True


def geometry_circle(geometry: str) -> Optional[Tuple[Tuple[float, float], float]]:
    """Return ((latitude, longitude), radius in metres) for a serialised circle."""
    parts = str(geometry or '').split('|')
    if parts[0].upper() != 'CIRCLE':
        return None
    coordinate, radius = _field(parts[1:], 'C'), _meters(_field(parts[1:], 'R'))
    if not coordinate or radius <= 0:
        return None
    try:
        return _point(coordinate), radius
    except ValueError:
        return None


def geometry_points(geometry: str) -> List[Tuple[float, float]]:
    """Return polygon vertices for a serialised PATH or SECTOR geometry."""
    try:
        return _geometry_points(geometry)
    except (KeyError, TypeError, ValueError):
        return []


def _geometry_points(geometry: str) -> List[Tuple[float, float]]:
    parts = str(geometry or '').split('|')
    kind = parts[0].upper()
    if kind == 'SECTOR':
        center_value = _field(parts[1:], 'C')
        radius = _meters(_field(parts[1:], 'R'))
        bearings = [float(item) for item in _field(parts[1:], 'B').split(',') if item.strip()]
        direction = (_field(parts[1:], 'D') or 'CW').upper()
        if not center_value or len(bearings) != 2:
            return []
        center = _point(center_value)
        points = [center, _destination(center, bearings[0], radius)]
        _append_arc(points, center, radius, _destination(center, bearings[1], radius), direction)
        points.append(center)
        return points
    if kind != 'PATH':
        return []
    points: List[Tuple[float, float]] = []
    for part in parts[1:]:
        if part.startswith('M=') or part.startswith('L='):
            points.append(_point(part[2:]))
        elif part.startswith('A='):
            values = dict(item.split(':', 1) for item in part[2:].split(',') if ':' in item)
            center_value, end_value = values.get('C', ''), values.get('E', '')
            if not center_value or not end_value:
                return []
            carried = _append_arc(
                points, _point(center_value), _meters(values.get('R', '')),
                _point(end_value), (values.get('D') or 'CW').upper(),
            )
            if not carried:
                return []
    return points if len(points) >= 3 else []

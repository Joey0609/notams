"""USCG Local Notice to Mariners (NOTMAR) GeoJSON adapter.

NAVCEN publishes the current Local Notice to Mariners map layers as GeoJSON.
The index is refreshed by USCG and tells us which numbered files currently
exist, so this adapter never relies on the retired weekly-PDF filenames.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List

import requests

from ..base import DataSource, SourceResult, append_record, empty_data
from ..common import EMPTY_TIME, PERMANENT_END, is_relevant_aerospace_area


DEFAULT_BASE_URL = 'https://navcen.uscg.gov/sites/default/files/msi'


def _compact_coordinate(value: Iterable[float]) -> str:
    """Convert GeoJSON ``[longitude, latitude]`` to the app's DMS token."""
    longitude, latitude = float(value[0]), float(value[1])

    def component(number: float, positive: str, negative: str, width: int) -> str:
        direction = positive if number >= 0 else negative
        total_seconds = round(abs(number) * 3600)
        degrees, remainder = divmod(total_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        return f'{direction}{degrees:0{width}d}{minutes:02d}{seconds:02d}'

    return component(latitude, 'N', 'S', 2) + component(longitude, 'E', 'W', 3)


def _geometry_records(geometry: Dict[str, Any]) -> List[str]:
    """Translate supported GeoJSON geometries to the browser's canonical form."""
    if not isinstance(geometry, dict):
        return []
    kind = str(geometry.get('type') or '')
    coordinates = geometry.get('coordinates')
    if kind == 'Point' and isinstance(coordinates, list) and len(coordinates) >= 2:
        return ['POINT|C=' + _compact_coordinate(coordinates)]
    if kind == 'LineString' and isinstance(coordinates, list) and len(coordinates) >= 2:
        points = [_compact_coordinate(point) for point in coordinates]
        return ['LINE|M=' + points[0] + ''.join('|L=' + point for point in points[1:])]
    if kind == 'Polygon' and isinstance(coordinates, list) and coordinates and len(coordinates[0]) >= 3:
        points = [_compact_coordinate(point) for point in coordinates[0]]
        if points[0] == points[-1]:
            points.pop()
        return ['PATH|M=' + points[0] + ''.join('|L=' + point for point in points[1:]) + '|Z'] if len(points) >= 3 else []
    if kind == 'MultiPolygon' and isinstance(coordinates, list):
        return [item for polygon in coordinates for item in _geometry_records({'type': 'Polygon', 'coordinates': polygon})]
    if kind == 'MultiLineString' and isinstance(coordinates, list):
        return [item for line in coordinates for item in _geometry_records({'type': 'LineString', 'coordinates': line})]
    return []


def _format_timestamp(value: Any, fallback: str) -> str:
    try:
        timestamp = float(value) / 1000
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime('%d %b %H:%M %Y').upper()
    except (TypeError, ValueError, OverflowError, OSError):
        return fallback


def _time_range(properties: Dict[str, Any]) -> str:
    start = _format_timestamp(properties.get('BEGIN_DATE'), '')
    end = _format_timestamp(properties.get('END_DATE'), PERMANENT_END)
    return f'{start} UNTIL {end}' if start else EMPTY_TIME


def _is_relevant_feature(properties: Dict[str, Any]) -> bool:
    text = '\n'.join(str(properties.get(key) or '') for key in ('TITLE', 'MSI_GROUP', 'SUB_CATEGORY', 'TYPE', 'DESCRIPTION'))
    return str(properties.get('MSI_GROUP') or '').strip().upper() == 'SPACE OPERATIONS' or is_relevant_aerospace_area(text, require_full_altitude=False)


def parse_uscg_geojson(payload: Dict[str, Any]) -> Dict[str, List[str]]:
    """Convert one USCG GeoJSON response to aligned common-source records."""
    output = empty_data()
    for feature in payload.get('features', []) if isinstance(payload, dict) else []:
        properties = feature.get('properties') if isinstance(feature, dict) else None
        if not isinstance(properties, dict) or not _is_relevant_feature(properties):
            continue
        uid = str(properties.get('MSI_UID') or feature.get('id') or 'UNKNOWN')
        title = str(properties.get('TITLE') or 'USCG Local Notice to Mariners')
        description = str(properties.get('DESCRIPTION') or title).strip()
        raw_message = f'USCG NOTMAR {uid}\nA) USCG\nE) {description}'
        geometries = _geometry_records(feature.get('geometry') if isinstance(feature, dict) else {})
        for position, geometry in enumerate(geometries, start=1):
            code = f'NOTMAR {uid}' + (f' AREA {position}' if len(geometries) > 1 else '')
            append_record(
                output,
                CODE=code,
                TIME=_time_range(properties),
                PLATID=f'USCG:{uid}:{position}',
                RAWMESSAGE=raw_message,
                ALTITUDE='None',
                SOURCE='NOTMAR',
                FIR=str(properties.get('ATU') or 'USCG'),
                GEOMETRY=geometry,
            )
    return output


class USCGDataSource(DataSource):
    name = 'uscg'

    def fetch(self):
        base_url = self.config.get('USCG', 'base_url', fallback=DEFAULT_BASE_URL).rstrip('/')
        timeout = self.config.getint('USCG', 'timeout', fallback=20)
        workers = self.config.getint('USCG', 'max_workers', fallback=8)
        try:
            index_response = requests.get(f'{base_url}/fileIndexNew.json', timeout=timeout)
            index_response.raise_for_status()
            index = index_response.json()
            file_names = []
            for prefix, metadata in index.items() if isinstance(index, dict) else []:
                count = int((metadata or {}).get('counter', 0) or 0)
                file_names.extend(f'{prefix}{number}.geojson' for number in range(1, count + 1))

            # Do not request the large buoy-only feeds: their records cannot be
            # aerospace notices, while every other USCG NOTMAR layer is checked.
            file_names = [name for name in file_names if not name.startswith('buoys_')]
            output = empty_data()
            failed_files = []

            def load(name):
                response = requests.get(f'{base_url}/{name}', timeout=timeout)
                response.raise_for_status()
                return parse_uscg_geojson(response.json())

            with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
                futures = {executor.submit(load, name): name for name in file_names}
                for future in as_completed(futures):
                    name = futures[future]
                    try:
                        data = future.result()
                    except Exception as exc:
                        failed_files.append(f'{name}: {exc}')
                        continue
                    for field, values in data.items():
                        output[field].extend(values)

            if file_names and len(failed_files) == len(file_names):
                return SourceResult(
                    provider=self.name,
                    success=False,
                    error='all USCG GeoJSON files failed: ' + '; '.join(failed_files),
                    stats={'files': len(file_names), 'failed_files': failed_files},
                )

            if failed_files:
                print(
                    f'[data-source:{self.name}] skipped {len(failed_files)} stale or unavailable files'
                )
            return SourceResult(
                provider=self.name,
                data=output,
                success=True,
                stats={
                    'files': len(file_names),
                    'loaded_files': len(file_names) - len(failed_files),
                    'failed_files': failed_files,
                },
            )
        except Exception as exc:
            return SourceResult(provider=self.name, success=False, error=str(exc))

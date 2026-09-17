"""One-time migration of persisted archive records to canonical GEOMETRY."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fetch.sources.geometry import path_geometry


LEGACY_GEOMETRY_KEYS = ('COORDINATES', 'SHAPE', 'CENTER', 'RADIUS', 'RADIUS_UNIT')


def geometry_for(record: dict) -> str:
    geometry = str(record.get('GEOMETRY') or '')
    if geometry:
        return geometry
    shape = str(record.get('SHAPE') or '').upper()
    center = str(record.get('CENTER') or '')
    radius = str(record.get('RADIUS') or '')
    unit = str(record.get('RADIUS_UNIT') or '').upper()
    if shape == 'CIRCLE' and center and radius and unit in {'KM', 'NM'}:
        return f'CIRCLE|C={center}|R={radius}{unit}'
    return path_geometry(str(record.get('COORDINATES') or '').split('-'))


def migrate_record(record: dict) -> bool:
    geometry = geometry_for(record)
    if not geometry:
        return False
    record['GEOMETRY'] = geometry
    for key in LEGACY_GEOMETRY_KEYS:
        record.pop(key, None)
    return True


def migrate_file(path: Path) -> tuple[int, int]:
    data = json.loads(path.read_text(encoding='utf-8'))
    changed = converted = 0
    if isinstance(data, dict) and isinstance(data.get('CODE'), list):
        count = int(data.get('NUM', len(data['CODE'])))
        geometries = list(data.get('GEOMETRY') or [''] * count)
        for index in range(count):
            record = {key: (data.get(key, [''] * count)[index] if index < len(data.get(key, [])) else '') for key in ('COORDINATES', 'SHAPE', 'CENTER', 'RADIUS', 'RADIUS_UNIT', 'GEOMETRY')}
            geometry = geometry_for(record)
            if geometry:
                geometries[index] = geometry; converted += 1
        data['GEOMETRY'] = geometries
        for key in LEGACY_GEOMETRY_KEYS: data.pop(key, None)
        changed = 1
    elif isinstance(data, list):
        def walk(value):
            nonlocal converted
            if isinstance(value, dict):
                if migrate_record(value): converted += 1
                for child in value.values(): walk(child)
            elif isinstance(value, list):
                for child in value: walk(child)
        walk(data); changed = 1
    if changed:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=4) + '\n', encoding='utf-8')
    return changed, converted


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    paths = list((root / 'data' / 'notam_db').glob('*.json')) + list((root / 'data' / 'archiveMatch').glob('match*.json'))
    totals = [0, 0]
    for path in paths:
        changed, converted = migrate_file(path)
        totals[0] += changed; totals[1] += converted
    print(f'migrated {totals[0]} files and {totals[1]} drawable archive records')

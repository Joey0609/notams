"""Archive successful FOCUS observations using the current NOTAM parser.

This module maintains the observation baseline and removes early withdrawals.
It does not run a scan, send notifications, or touch match files.
"""
from __future__ import annotations

from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile

from fetch.classify_notam_db import rebuild_notam_db_classify
from fetch.geometry_database import ARCHIVE_FIELDS
from fetch.sources.common import extract_fir, notam_dedup_key, parse_raw_notam_time
from fetch.sources.daip.parser import parse_daip_response
from fetch.sources.manager import get_enabled_source_names


ROOT = Path(__file__).resolve().parents[1]
TIME_FORMAT = '%d %b %H:%M %Y'
STATE_FILE = 'active_notams.json'
AVIATION_SOURCES = {'faa', 'daip', 'dins'}


def focus_locations(config):
    return sorted(set(filter(None, re.split(r'[,;\s]+',
        config.get('ICAO_FOCUSED', 'codes', fallback='').strip().upper()))))


def focus_scope(config):
    locations = focus_locations(config)
    if not locations:
        raise ValueError('NOTAM archival requires explicit ICAO_FOCUSED locations')
    providers = sorted(AVIATION_SOURCES.intersection(get_enabled_source_names(config)))
    return hashlib.sha256(json.dumps([locations, providers]).encode()).hexdigest()


def iter_focus_records(snapshot, locations):
    """Use the explicit focus section; legacy originals use configured FIRs."""
    focused = snapshot.get('FOCUSED_NOTAM_DATA')
    if focused is not None:
        snapshot = focused
    allowed = set(locations)
    for row in iter_snapshot_records(snapshot):
        firs = set(re.findall(r'\b[A-Z]{4}\b', extract_fir(
            row['RAWMESSAGE'], row.get('FIR', 'UNKNOWN'))))
        if firs & allowed:
            yield row


def observation_rows(records):
    observations = {}
    for row in records:
        value = parse_raw_notam_time(row.get('RAWMESSAGE', ''), row.get('TIME', ''))
        try:
            begin, finish = (datetime.strptime(p, TIME_FORMAT) for p in value.split(' UNTIL '))
            if finish < begin:
                continue
        except (ValueError, TypeError):
            continue
        key = identity(row)
        observations[key] = dict(key=list(key), month=begin.strftime('%Y-%m'),
                                 end=finish.replace(tzinfo=timezone.utc).isoformat())
    return observations


def early_withdrawals(previous, current, observed_at):
    return {key for key, row in previous.items()
            if key not in current and datetime.fromisoformat(row['end']) > observed_at}


def complete_aviation_snapshot(snapshot):
    # Old snapshots without a validity marker cannot prove that a disappearance
    # was a withdrawal rather than a failed or partial upstream request.
    return snapshot.get('FETCH_VALID') is True and not (
        AVIATION_SOURCES.intersection(snapshot.get('FAILED_SOURCES') or []))


def archive_current_focus(snapshot, config, db_dir, *, observed_at=None):
    """Archive one complete focus observation, retaining naturally expired rows."""
    if not complete_aviation_snapshot(snapshot):
        return dict(written=False, skipped='incomplete aviation snapshot')
    if not focus_locations(config):
        return dict(written=False, skipped='no explicit FOCUS configuration')
    scope = focus_scope(config)
    now = observed_at or datetime.now(timezone.utc)
    records = list(iter_focus_records(snapshot, focus_locations(config)))
    parsed, stats = reparse_records(records, '1900-01-01', '2199-12-31')
    current = observation_rows(parsed)
    path = Path(db_dir) / STATE_FILE
    old = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    if old.get('scope') == scope and datetime.fromisoformat(old['observed_at']) > now:
        raise ValueError('Refusing an out-of-order archive observation')
    previous = {tuple(r['key']): r for r in old.get('notices', [])} if old.get('scope') == scope else {}
    withdrawn = early_withdrawals(previous, current, now)
    notices = [r for _, r in sorted(current.items()) if datetime.fromisoformat(r['end']) > now]
    state = dict(scope=scope, observed_at=now.isoformat(), notices=notices)
    if old.get('scope') == scope and old.get('notices') == notices:
        state = old
    result = update_archive(parsed, db_dir, withdrawn=withdrawn, observation=state)
    return dict(parsing=stats, **result)


def base_code(record):
    raw = str(record.get('RAWMESSAGE') or '').strip()
    match = re.match(r'\(?([A-Z]\d{4}/\d{2})\s+NOTAM[NRCP]?\b', raw, re.I)
    if match:
        return match.group(1).upper()
    return re.sub(r'(?:_AREA\d+|\s+AREA\s+\d+)$', '',
                  str(record.get('CODE') or '').strip(), flags=re.I)


def identity(record, *, area=False):
    code = str(record['CODE']) if area else base_code(record)
    raw = str(record.get('RAWMESSAGE') or '')
    suffix = re.search(r'\s+AREA\s+(\d+)$', code) if area else None
    return (notam_dedup_key(raw, code), extract_fir(raw, record.get('FIR', 'UNKNOWN')),
            suffix.group(1) if suffix else '')


def iter_snapshot_records(snapshot):
    """Read legacy, segmented, and unfiltered DAIP payloads; ignore maritime."""
    if not isinstance(snapshot, dict):
        raise ValueError('NOTAM snapshot must be an object')
    if 'group' in snapshot:
        if not isinstance(snapshot['group'], list):
            raise ValueError('Invalid DAIP group list')
        for group in snapshot['group']:
            for section in group.get('notams', []) or []:
                for item in section.get('list', []) or []:
                    raw = str(item.get('rawtext') or item.get('text') or '')
                    yield dict(CODE=item.get('idshow') or item.get('id') or '',
                               TIME=parse_raw_notam_time(raw, item.get('text', '')),
                               RAWMESSAGE=raw, PLATID=item.get('key') or item.get('xid') or '',
                               FIR=section.get('code') or group.get('name') or 'UNKNOWN',
                               SOURCE='NOTAM')
        return
    segmented = any(key in snapshot for key in ('FOCUSED_NOTAM_DATA', 'NOTAM_DATA'))
    sections = [snapshot.get(key) for key in ('FOCUSED_NOTAM_DATA', 'NOTAM_DATA')] if segmented else [snapshot]
    for section in sections:
        if section is None:
            continue
        if not isinstance(section, dict):
            raise ValueError('Invalid NOTAM section')
        codes = section.get('CODE')
        if not isinstance(codes, list):
            raise ValueError('NOTAM section has no CODE array')
        for field in ('RAWMESSAGE', 'TIME'):
            if not isinstance(section.get(field), list) or len(section[field]) != len(codes):
                raise ValueError(f'NOTAM {field} array is not aligned')
        for field in ('SOURCE', 'FIR', 'PLATID', 'TRANSID'):
            if field in section and (not isinstance(section[field], list) or len(section[field]) != len(codes)):
                raise ValueError(f'NOTAM {field} array is not aligned')
        for index, code in enumerate(codes):
            source = section.get('SOURCE', ['NOTAM'] * len(codes))[index]
            if str(source).upper() != 'NOTAM':
                continue
            yield dict(CODE=code, TIME=section['TIME'][index],
                       RAWMESSAGE=section['RAWMESSAGE'][index], SOURCE='NOTAM',
                       FIR=section.get('FIR', ['UNKNOWN'] * len(codes))[index],
                       PLATID=section.get('PLATID', section.get('TRANSID', [''] * len(codes)))[index])


def reparse_records(records, start, end):
    """Keep the latest captured version of each notice, then use today's parser.

    Scope is the UTC effective START date, matching the monthly database layout.
    Expiration relative to today is intentionally never applied to history.
    """
    lower = datetime.combine(date.fromisoformat(start), time.min)
    upper = datetime.combine(date.fromisoformat(end) + timedelta(days=1), time.min)
    if lower >= upper:
        raise ValueError('Archive start must not follow end')
    stats = Counter(input_rows=0, filtered=0, invalid_time=0, outside_range=0, no_geometry=0)
    latest = {}
    for record in records:
        stats['input_rows'] += 1
        if str(record.get('SOURCE', 'NOTAM')).upper() != 'NOTAM':
            continue
        if not base_code(record) or not str(record.get('RAWMESSAGE') or '').strip():
            raise ValueError('Archive record is missing a NOTAM identity or original text')
        latest[identity(record)] = record
    stats['unique_notices'] = len(latest)
    output = []
    for record in latest.values():
        raw = str(record['RAWMESSAGE'])
        # The online DAIP parser already owns relevance, time, altitude, geometry,
        # multi-area expansion, and FAA-number handling. No historical filter copy.
        platid = re.sub(r':AREA:\d+$', '', str(record.get('PLATID') or ''))
        platid = platid or 'ARCHIVE:' + hashlib.sha256(repr(identity(record)).encode()).hexdigest()[:24]
        parsed = parse_daip_response({'group': [{'name': record.get('FIR', 'UNKNOWN'),
            'notams': [{'code': record.get('FIR', 'UNKNOWN'), 'list': [{
                'rawtext': raw, 'text': record.get('TIME', ''),
                'idshow': base_code(record), 'key': platid,
            }]}]}]})
        if not parsed['CODE']:
            from fetch.sources.common import is_relevant_area_notam
            stats['no_geometry' if is_relevant_area_notam(raw) else 'filtered'] += 1
            continue
        for index in range(len(parsed['CODE'])):
            row = {field: parsed[field][index] for field in parsed}
            try:
                begin, finish = (datetime.strptime(part, TIME_FORMAT) for part in row['TIME'].split(' UNTIL '))
                if finish < begin:
                    raise ValueError('End precedes start')
            except (TypeError, ValueError):
                stats['invalid_time'] += 1
                continue
            if not lower <= begin < upper:
                stats['outside_range'] += 1
                continue
            output.append(row)
    stats['accepted_areas'] = len(output)
    return output, dict(stats)


def _read_month(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    size = data.get('NUM')
    if not isinstance(size, int) or size < 0:
        raise ValueError(f'Invalid NUM: {path}')
    if size and any(not isinstance(data.get(f), list) or len(data[f]) != size for f in ARCHIVE_FIELDS):
        raise ValueError(f'Unaligned archive arrays: {path}')
    return [{field: data[field][i] for field in ARCHIVE_FIELDS} for i in range(size)]


def update_archive(records, db_dir, *, withdrawn=(), observation=None):
    """Stage, validate and classify first; back up before replacing changed files."""
    db_dir = Path(db_dir).resolve()
    records = list(records)
    withdrawn = set(map(tuple, withdrawn))
    if not records and not withdrawn and observation is None:
        return dict(changed_files=[], backup=None, months={}, written=False)
    db_dir.mkdir(parents=True, exist_ok=True)
    incoming = {}
    removed_areas = 0
    if withdrawn:
        for path in db_dir.glob('????-??.json'):
            removed = sum(identity(row) in withdrawn for row in _read_month(path))
            if removed:
                incoming.setdefault(path.stem, [])
                removed_areas += removed
    for record in records:
        month = datetime.strptime(record['TIME'].split(' UNTIL ')[0], TIME_FORMAT).strftime('%Y-%m')
        incoming.setdefault(month, []).append(record)
    months = {}
    for month, rows in incoming.items():
        path = db_dir / f'{month}.json'
        existing = _read_month(path) if path.exists() else []
        notice_ids = {identity(row) for row in rows} | withdrawn
        # Replace all areas of an amended notice, including obsolete AREA 2/3
        # when the latest parser now finds fewer described areas.
        months[month] = [row for row in existing if identity(row) not in notice_ids] + rows
    # Grouping is shared with the existing archive implementation. Work in a
    # temporary directory so parse/classification failures cannot corrupt the DB.
    with tempfile.TemporaryDirectory(prefix='notam-archive-', dir=db_dir.parent) as temp:
        stage = Path(temp)
        years = {month[:4] for month in months}
        for path in db_dir.glob('????-??.json'):
            if path.stem[:4] in years:
                _read_month(path)
                shutil.copy2(path, stage / path.name)
        for month, rows in months.items():
            latest = {identity(row, area=True): row for row in rows}
            rows = sorted(latest.values(), key=lambda row: (row['CODE'], identity(row, area=True)))
            data = {field: [str(row[field]) for row in rows] for field in ARCHIVE_FIELDS}
            data.update(NUM=len(rows), CLASSIFY={}, classify=[''] * len(rows))
            (stage / f'{month}.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        rebuild_notam_db_classify(str(stage))
        changed, counts = [], {}
        for path in sorted(stage.glob('????-??.json')):
            rows = _read_month(path)
            counts[path.stem] = len(rows)
            target = db_dir / path.name
            # Ignore harmless JSON formatting changes to untouched month files.
            if not target.exists() or json.loads(target.read_text(encoding='utf-8')) != json.loads(path.read_text(encoding='utf-8')):
                changed.append(path.name)
        if observation is not None:
            path = stage / STATE_FILE
            path.write_text(json.dumps(observation, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            target = db_dir / STATE_FILE
            if not target.exists() or json.loads(target.read_text(encoding='utf-8')) != observation:
                changed.append(STATE_FILE)
        backup = None
        if changed:
            backup = ROOT / 'temp' / 'archive_backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            backup.mkdir(parents=True)
            for name in changed:
                target = db_dir / name
                if target.exists():
                    shutil.copy2(target, backup / name)
            written = []
            try:
                for name in changed:
                    pending = db_dir / (name + '.tmp')
                    shutil.copyfile(stage / name, pending)
                    os.replace(pending, db_dir / name)
                    written.append(name)
            except Exception:
                for name in written:
                    old = backup / name
                    if old.exists():
                        shutil.copy2(old, db_dir / name)
                    else:
                        (db_dir / name).unlink()
                raise
        return dict(changed_files=changed, backup=str(backup) if backup else None,
                    months=counts, removed_areas=removed_areas,
                    written=bool(changed))

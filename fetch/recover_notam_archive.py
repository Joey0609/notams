"""Manually recover focused NOTAM originals from this repository's Git history."""
from __future__ import annotations

import argparse
import configparser
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fetch.archive_pipeline import (collect_git_records, focus_locations, focus_scope,
    identity, iter_focus_records, reparse_records, update_archive)


def month_range(start, end):
    value = datetime.fromisoformat(start).date().replace(day=1)
    finish = datetime.fromisoformat(end).date().replace(day=1)
    months = []
    while value <= finish:
        months.append(value.strftime('%Y-%m'))
        value = (value.replace(day=28) + timedelta(days=4)).replace(day=1)
    return months


def run(args):
    if datetime.fromisoformat(args.start) > datetime.fromisoformat(args.end):
        raise ValueError('Start follows end')
    config = configparser.ConfigParser()
    if not config.read(args.config, encoding='utf-8'):
        raise ValueError('Cannot read archive configuration')
    scope = focus_scope(config)
    locations = focus_locations(config)
    db_dir = Path(args.db_dir)
    months = month_range(args.start, args.end)
    records = []
    for month in months:
        path = db_dir / (month + '.json')
        if path.exists():
            records.extend(iter_focus_records(json.loads(path.read_text(encoding='utf-8')), locations))
    recovered, coverage = collect_git_records(ROOT, args.start, args.end,
                                              locations=locations, ref=args.git_ref)
    records.extend(recovered)
    withdrawn = set(map(tuple, coverage['withdrawn_notices']))
    records = [row for row in records if identity(row) not in withdrawn]
    parsed, stats = reparse_records(records, args.start, args.end)
    observation = coverage.pop('last_observation')
    if observation:
        observation['scope'] = scope
    result = update_archive(parsed, db_dir, rebuild_months=months, dry_run=args.dry_run,
                            withdrawn=withdrawn, observation=observation)
    report = dict(source='git', start=args.start, end=args.end, dry_run=args.dry_run,
                  generated_at=datetime.now(timezone.utc).isoformat(),
                  focus_locations=locations, coverage=coverage, parsing=stats, **result)
    if args.report:
        path = Path(args.report)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start', required=True, help='UTC effective start date, inclusive')
    parser.add_argument('--end', required=True, help='UTC effective start date, inclusive')
    parser.add_argument('--config', default=str(ROOT / 'config.ini'))
    parser.add_argument('--db-dir', default=str(ROOT / 'data/notam_db'))
    parser.add_argument('--git-ref', default='HEAD')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--report')
    args = parser.parse_args(argv)
    try:
        run(args)
    except Exception as exc:
        print(f'[NOTAM archive] {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

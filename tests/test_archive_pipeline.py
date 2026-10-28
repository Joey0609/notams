import json
import configparser
from datetime import datetime, timezone
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from fetch.archive_pipeline import (
    collect_git_records, iter_snapshot_records, reparse_records, update_archive,
    archive_current_focus, iter_focus_records, identity,
)


RAW = '''A1871/26 NOTAMN
Q)ZBPE/QRDCA/IV/BO/W/000/999/3554N11209E013
A)ZBPE B)2606041131 C)2606041151
E) A TEMPORARY DANGER AREA ESTABLISHED BOUNDED BY:
N360500E1120000-N360600E1121400-N354400E1121800-N354200E1120400,
BACK TO START. F)SFC G)UNL'''


def row(raw=RAW, code='A1871/26', **extra):
    result = dict(CODE=code, TIME='04 JUN 11:31 2026 UNTIL 04 JUN 11:51 2026',
                  PLATID='original-id', RAWMESSAGE=raw, SOURCE='NOTAM')
    result.update(extra)
    return result


def payload(rows):
    return {key: [r.get(key, '') for r in rows] for key in rows[0]} if rows else {
        'CODE': [], 'RAWMESSAGE': [], 'TIME': []}


class ArchivePipelineTests(unittest.TestCase):
    def test_segmented_snapshots_do_not_import_maritime_or_duplicate_root(self):
        d = payload([row()])
        snapshot = dict(d, FOCUSED_NOTAM_DATA=d, NOTAM_DATA=d,
                        MSI_DATA=payload([dict(row(), SOURCE='MSI')]))
        records = list(iter_snapshot_records(snapshot))
        parsed, _ = reparse_records(records, '2026-01-01', '2026-10-28')
        self.assertEqual(len(parsed), 1)
        self.assertTrue(parsed[0]['GEOMETRY'].startswith('PATH|'))

    def test_latest_filter_removes_missile_but_keeps_expired_launch(self):
        rows = [row(), row(RAW.replace('A TEMPORARY DANGER', 'ROCKET LAUNCH DANGER')),
                row(RAW.replace('A1871/26', 'A1872/26').replace('A TEMPORARY DANGER',
                    'MISSILE A TEMPORARY DANGER'), code='A1872/26')]
        parsed, stats = reparse_records(rows, '2026-01-01', '2026-10-28')
        self.assertEqual(len(parsed), 1)
        self.assertEqual(stats['filtered'], 1)
        self.assertEqual(parsed[0]['TIME'], row()['TIME'])

    def test_identical_numbers_from_different_firs_survive(self):
        parsed, _ = reparse_records([row(), row(RAW.replace('ZBPE', 'RPHI'))],
                                    '2026-01-01', '2026-10-28')
        self.assertEqual(len(parsed), 2)

    def test_old_area_suffix_is_not_stacked_and_current_geometry_is_used(self):
        parsed, _ = reparse_records([dict(row(code='A1871/26_AREA1'),
                                         GEOMETRY='CIRCLE|C=N000000E0000000|R=1NM')],
                                    '2026-01-01', '2026-10-28')
        self.assertEqual(parsed[0]['CODE'], 'A1871/26')
        self.assertTrue(parsed[0]['GEOMETRY'].startswith('PATH|'))

    def test_bad_parallel_arrays_are_an_error(self):
        with self.assertRaises(ValueError):
            list(iter_snapshot_records({'CODE': ['A1'], 'TIME': [], 'RAWMESSAGE': [RAW]}))

    def test_invalid_time_does_not_get_assigned_to_current_month(self):
        parsed, stats = reparse_records([row(RAW.replace('B)2606041131 C)2606041151', ''),
                                            TIME='bad')], '2026-01-01', '2026-10-28')
        self.assertEqual(parsed, [])
        self.assertEqual(stats['invalid_time'], 1)

    def test_write_is_backed_up_idempotent_and_preserves_other_years(self):
        parsed, _ = reparse_records([row()], '2026-01-01', '2026-10-28')
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / 'db'
            db.mkdir()
            untouched = db / '2025-01.json'
            untouched.write_text('{"NUM":0,"CODE":[],"TIME":[]}', encoding='utf-8')
            original = untouched.read_bytes()
            first = update_archive(parsed, db, rebuild_months={'2026-06'})
            self.assertIn('2026-06.json', first['changed_files'])
            before = (db / '2026-06.json').read_bytes()
            again = update_archive(parsed, db, rebuild_months={'2026-06'})
            self.assertEqual(again['changed_files'], [])
            self.assertEqual((db / '2026-06.json').read_bytes(), before)
            self.assertEqual(untouched.read_bytes(), original)
            changed = [dict(parsed[0], RAWMESSAGE=RAW + '\nREVISED')]
            result = update_archive(changed, db, rebuild_months={'2026-06'})
            self.assertEqual((Path(result['backup']) / '2026-06.json').read_bytes(), before)

    def test_git_recovery_reads_legacy_and_new_sections_chronologically(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            def git(*args):
                return subprocess.run(['git', '-c', 'user.name=Test', '-c',
                                       'user.email=test@example.invalid', *args], cwd=root,
                                      check=True, capture_output=True)
            git('init')
            first = payload([row()])
            for day, snap in [('2026-01-01', first),
                              ('2026-07-01', {'NOTAM_DATA': payload([row(RAW+'\nREVISED')])}),
                              ('2026-08-01', None), ('2026-09-01', first)]:
                path = root / 'data_dict.json'
                if snap is None:
                    path.unlink()
                    git('add', '-u', 'data_dict.json')
                else:
                    path.write_text(json.dumps(snap), encoding='utf-8')
                    git('add', 'data_dict.json')
                # Supply both dates so Git's commit-date bounds are deterministic.
                import os
                env = dict(os.environ, GIT_AUTHOR_DATE=day+'T12:00:00Z',
                           GIT_COMMITTER_DATE=day+'T12:00:00Z')
                subprocess.run(['git', '-c', 'user.name=Test', '-c',
                                'user.email=test@example.invalid', 'commit', '-m', day],
                               cwd=root, env=env, check=True, capture_output=True)
            records, report = collect_git_records(root, '2026-01-01', '2026-10-28')
            self.assertEqual(report['snapshots'], 3)
            self.assertEqual(report['unique_blobs'], 2)
            self.assertEqual(len(records), 3)
            parsed, _ = reparse_records(records, '2026-01-01', '2026-10-28')
            self.assertEqual(parsed[0]['RAWMESSAGE'], RAW)

    def test_appending_replaces_all_areas_of_an_amended_notice(self):
        parsed, _ = reparse_records([row()], '2026-01-01', '2026-10-28')
        with tempfile.TemporaryDirectory() as tmp:
            areas = [dict(parsed[0], CODE='A1871/26 AREA 1'),
                     dict(parsed[0], CODE='A1871/26 AREA 2')]
            update_archive(areas, tmp)
            update_archive(parsed, tmp)
            saved = json.loads((Path(tmp) / '2026-06.json').read_text(encoding='utf-8'))
            self.assertEqual(saved['CODE'], ['A1871/26'])

    def test_faa_domestic_area_numbers_remain_distinct(self):
        parsed, _ = reparse_records([row()], '2026-01-01', '2026-10-28')
        areas = [dict(parsed[0], CODE='6/1234 AREA 1', RAWMESSAGE='!FDC 6/1234 ZHU '+RAW),
                 dict(parsed[0], CODE='6/1234 AREA 2', RAWMESSAGE='!FDC 6/1234 ZHU '+RAW)]
        with tempfile.TemporaryDirectory() as tmp:
            update_archive(areas, tmp)
            saved = json.loads((Path(tmp) / '2026-06.json').read_text(encoding='utf-8'))
            self.assertEqual(saved['NUM'], 2)

    def test_classification_failure_never_changes_database(self):
        parsed, _ = reparse_records([row()], '2026-01-01', '2026-10-28')
        with tempfile.TemporaryDirectory() as tmp:
            update_archive(parsed, tmp)
            path = Path(tmp) / '2026-06.json'
            before = path.read_bytes()
            with patch('fetch.archive_pipeline.rebuild_notam_db_classify', side_effect=ValueError('bad')):
                with self.assertRaises(ValueError):
                    update_archive([dict(parsed[0], RAWMESSAGE=RAW+' changed')], tmp)
            self.assertEqual(path.read_bytes(), before)

    def test_focus_only_and_early_withdrawal_never_uses_failed_fetches(self):
        config = configparser.ConfigParser()
        config.read_dict({'DATA_SOURCES': {'enabled': 'daip,msa'},
                          'ICAO_FOCUSED': {'codes': 'ZBPE'}})
        baseline = {'FETCH_VALID': True, 'FOCUSED_NOTAM_DATA': payload([
            row(), row(RAW.replace('ZBPE', 'RPHI'))]),
            'NOTAM_DATA': payload([row(RAW.replace('A1871/26', 'A9999/26'), code='A9999/26')])}
        empty = {'FETCH_VALID': True, 'FOCUSED_NOTAM_DATA': payload([])}
        with tempfile.TemporaryDirectory() as tmp:
            archive_current_focus(baseline, config, tmp,
                observed_at=datetime(2026, 5, 1, tzinfo=timezone.utc))
            path = Path(tmp) / '2026-06.json'
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))['NUM'], 1)
            before = path.read_bytes()
            again = archive_current_focus(baseline, config, tmp,
                observed_at=datetime(2026, 5, 2, tzinfo=timezone.utc))
            self.assertEqual(again['changed_files'], [])
            failed = archive_current_focus(dict(empty, FAILED_SOURCES=['daip']), config, tmp,
                observed_at=datetime(2026, 5, 3, tzinfo=timezone.utc))
            self.assertFalse(failed['written'])
            self.assertEqual(path.read_bytes(), before)
            removed = archive_current_focus(empty, config, tmp,
                observed_at=datetime(2026, 6, 4, 11, 40, tzinfo=timezone.utc))
            self.assertEqual(removed['removed_areas'], 1)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))['NUM'], 0)

    def test_natural_expiration_remains_in_archive(self):
        config = configparser.ConfigParser()
        config.read_dict({'DATA_SOURCES': {'enabled': 'daip'}, 'ICAO_FOCUSED': {'codes': 'ZBPE'}})
        with tempfile.TemporaryDirectory() as tmp:
            archive_current_focus({'FETCH_VALID': True, 'FOCUSED_NOTAM_DATA': payload([row()])},
                config, tmp, observed_at=datetime(2026, 5, 1, tzinfo=timezone.utc))
            result = archive_current_focus({'FETCH_VALID': True, 'FOCUSED_NOTAM_DATA': payload([])},
                config, tmp, observed_at=datetime(2026, 6, 4, 12, tzinfo=timezone.utc))
            self.assertEqual(result['removed_areas'], 0)
            self.assertEqual(json.loads((Path(tmp)/'2026-06.json').read_text(encoding='utf-8'))['NUM'], 1)

    def test_git_withdrawal_uses_observation_time_and_requires_validity(self):
        import os
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(['git', 'init', tmp], check=True, capture_output=True)
            def commit(day, snapshot):
                (root/'data_dict.json').write_text(json.dumps(snapshot), encoding='utf-8')
                subprocess.run(['git', 'add', 'data_dict.json'], cwd=root, check=True, capture_output=True)
                env = dict(os.environ, GIT_AUTHOR_DATE=day+'T12:00:00Z', GIT_COMMITTER_DATE=day+'T12:00:00Z')
                subprocess.run(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                    'commit', '-m', day], cwd=root, env=env, check=True, capture_output=True)
            commit('2026-05-01', dict(payload([row()]), FETCH_VALID=True))
            commit('2026-05-02', dict(payload([]), FETCH_VALID=False))
            _, failed = collect_git_records(root, '2026-01-01', '2026-05-02', locations=['ZBPE'])
            self.assertEqual(failed['withdrawn_notices'], [])
            commit('2026-05-03', dict(payload([]), FETCH_VALID=True))
            _, recovered = collect_git_records(root, '2026-01-01', '2026-05-03', locations=['ZBPE'])
            self.assertEqual(recovered['withdrawn_notices'], [list(identity(row()))])
            commit('2026-05-04', dict(payload([row()]), FETCH_VALID=True))
            _, restored = collect_git_records(root, '2026-01-01', '2026-05-04', locations=['ZBPE'])
            self.assertEqual(restored['withdrawn_notices'], [])

    def test_legacy_focus_filter_and_absent_focus_do_not_import_global_data(self):
        rows = [row(), row(RAW.replace('ZBPE','RPHI'))]
        self.assertEqual(len(list(iter_focus_records(payload(rows), ['ZBPE']))), 1)
        config = configparser.ConfigParser()
        config.read_dict({'DATA_SOURCES': {'enabled': 'daip'}})
        with tempfile.TemporaryDirectory() as tmp:
            result = archive_current_focus(dict(payload(rows), FETCH_VALID=True), config, tmp)
            self.assertFalse(result['written'])
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_main_scan_archives_focus_and_removes_withdrawn_notice(self):
        import main
        from fetch.sources.base import FetchBatchResult, SourceResult, append_record, empty_data
        config = configparser.ConfigParser()
        config.read_dict({'DATA_SOURCES': {'enabled': 'daip'},
            'ICAO': {'codes': 'ZBPE RPHI'}, 'ICAO_FOCUSED': {'codes': 'ZBPE'}})
        future = RAW.replace('260604', '261104')
        focused = [row(future, TIME='04 NOV 11:31 2026 UNTIL 04 NOV 11:51 2026')]
        outside = row(future.replace('ZBPE', 'RPHI').replace('A1871/26', 'A1872/26'),
                      code='A1872/26', TIME='04 NOV 11:31 2026 UNTIL 04 NOV 11:51 2026')
        def fetcher(config, locations, source_names=None):
            data = empty_data()
            for item in focused if locations == ['ZBPE'] else [outside]:
                append_record(data, **dict(item, FIR='ZBPE' if locations == ['ZBPE'] else 'RPHI',
                                          ALTITUDE='None', GEOMETRY='PATH|M=N360500E1120000|L=N360600E1121400|L=N354400E1121800|Z'))
            return FetchBatchResult(data=data, results=[SourceResult(provider='daip', success=True)])
        with tempfile.TemporaryDirectory() as tmp, \
                patch('main.load_config', return_value=config), \
                patch('main.notam_match_archive'), \
                patch('fetch.area_pair_alert.send_area_pair_alert'):
            snapshot = str(Path(tmp) / 'data_dict.json')
            with patch('main.SNAPSHOT_PATH', snapshot):
                def scan():
                    return main.run_scan(snapshot_path=snapshot, fetcher=fetcher, mail_enabled=False,
                        notification_sender=lambda *a, **k: None, visits_updater=lambda: None,
                        notify_list_path=str(Path(tmp)/'notify.txt'))
                scan()
                path = Path(tmp)/'data/notam_db/2026-11.json'
                self.assertEqual(json.loads(path.read_text(encoding='utf-8'))['CODE'], ['A1871/26'])
                focused.clear()
                scan()
                self.assertEqual(json.loads(path.read_text(encoding='utf-8'))['NUM'], 0)


if __name__ == '__main__':
    unittest.main()

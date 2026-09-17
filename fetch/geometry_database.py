"""Persistent archive store whose sole geographic field is GEOMETRY."""
from __future__ import annotations

import json
import re
import threading
from datetime import datetime
from pathlib import Path


ARCHIVE_FIELDS = ('CODE', 'TIME', 'PLATID', 'RAWMESSAGE', 'ALTITUDE', 'GEOMETRY')


class NotamDatabase:
    def __init__(self, db_path='./data/notam_db'):
        self.db_path = Path(db_path)
        self.db_path.mkdir(parents=True, exist_ok=True)
        self.cache = {}
        self.lock = threading.Lock()
        self._load()

    def _load(self):
        for path in self.db_path.glob('????-??.json'):
            data = json.loads(path.read_text(encoding='utf-8'))
            count = int(data.get('NUM', 0))
            normalized = {field: list(data.get(field, []) or [])[:count] for field in ARCHIVE_FIELDS}
            normalized['NUM'] = min((len(normalized[field]) for field in ARCHIVE_FIELDS), default=0)
            for field in ARCHIVE_FIELDS:
                normalized[field] = normalized[field][:normalized['NUM']]
            normalized['CLASSIFY'] = data.get('CLASSIFY', {})
            normalized['classify'] = list(data.get('classify', []) or [])[:normalized['NUM']]
            self.cache[path.stem] = normalized

    @staticmethod
    def _month(time_value):
        match = re.match(r'\d{1,2}\s+[A-Za-z]{3}\s+\d{2}:\d{2}\s+(\d{4})', str(time_value))
        if not match:
            return datetime.utcnow().strftime('%Y-%m')
        value = datetime.strptime(str(time_value).split(' UNTIL ', 1)[0], '%d %b %H:%M %Y')
        return value.strftime('%Y-%m')

    def _data(self, month):
        if month not in self.cache:
            self.cache[month] = {field: [] for field in ARCHIVE_FIELDS}
            self.cache[month].update({'NUM': 0, 'CLASSIFY': {}, 'classify': []})
        return self.cache[month]

    def save_notam(self, record):
        missing = [field for field in ARCHIVE_FIELDS if not str(record.get(field) or '')]
        if missing:
            raise ValueError(f'NOTAM archive record missing: {", ".join(missing)}')
        with self.lock:
            data = self._data(self._month(record['TIME']))
            try:
                index = data['CODE'].index(record['CODE'])
            except ValueError:
                index = -1
            if index >= 0:
                for field in ARCHIVE_FIELDS:
                    data[field][index] = str(record[field])
            else:
                for field in ARCHIVE_FIELDS:
                    data[field].append(str(record[field]))
                data['NUM'] += 1

    def close(self):
        for month, data in self.cache.items():
            order = sorted(range(data['NUM']), key=lambda index: data['CODE'][index])
            saved = {field: [data[field][index] for index in order] for field in ARCHIVE_FIELDS}
            saved['NUM'] = len(saved['CODE'])
            saved['CLASSIFY'] = {}
            saved['classify'] = [''] * saved['NUM']
            (self.db_path / f'{month}.json').write_text(json.dumps(saved, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

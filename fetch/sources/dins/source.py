import hashlib

from fetch.dinsQueryWeb import dinsQueryWeb

from ..base import DataSource, SourceResult, normalized_data


class DINSDataSource(DataSource):
    """Compatibility adapter for the legacy FAA DINS HTML source."""

    name = 'dins'

    def fetch(self):
        try:
            payload = dinsQueryWeb(' '.join(self.locations))
            if payload.get('ERROR'):
                return SourceResult(provider=self.name, success=False, error=payload['ERROR'])
            data = normalized_data(payload)
            for index, code in enumerate(data['CODE']):
                data['PLATID'][index] = _stable_id(code, data['COORDINATES'][index])
                data['SOURCE'][index] = 'NOTAM'
                data['FIR'][index] = 'UNKNOWN'
            return SourceResult(provider=self.name, data=data, success=True)
        except Exception as exc:
            return SourceResult(provider=self.name, success=False, error=str(exc))


def _stable_id(code, coordinates):
    digest = hashlib.sha256(f'{code}|{coordinates}'.encode('utf-8')).hexdigest()[:16]
    return f'dins:{digest}'

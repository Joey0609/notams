from ..base import DataSource, SourceResult
from .client import FAAClient
from .parser import parse_faa_response


class FAADataSource(DataSource):
    name = 'faa'

    def __init__(self, config, locations, client=None):
        super().__init__(config, locations)
        section = config['FAA'] if config.has_section('FAA') else {}
        self.freeform_terms = _split_values(
            section.get('freeform_terms', 'AEROSPACE,AER0SPACE,DNG ZONE')
        )
        self.client = client or FAAClient(
            search_url=section.get('search_url', 'https://notams.aim.faa.gov/notamSearch/search'),
            index_url=section.get('index_url', 'https://notams.aim.faa.gov/notamSearch/nsapp.html'),
            timeout=int(section.get('timeout', 7)),
            retries=int(section.get('retries', 2)),
            max_workers=int(section.get('max_workers', 2)),
            max_pages=int(section.get('max_pages', 100)),
        )

    def fetch(self):
        try:
            response = self.client.fetch_all(self.locations, self.freeform_terms)
            success = response.get('success', 0) > 0
            return SourceResult(
                provider=self.name,
                data=parse_faa_response(response),
                success=success,
                error=None if success else 'all FAA queries failed',
                stats={
                    'queries_ok': response.get('success', 0),
                    'queries_failed': response.get('fail', 0),
                },
            )
        except Exception as exc:
            return SourceResult(provider=self.name, success=False, error=str(exc))


def _split_values(value):
    return [item.strip() for item in str(value or '').split(',') if item.strip()]

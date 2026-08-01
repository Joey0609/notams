from ..base import DataSource, SourceResult
from .client import DAIPClient
from .parser import parse_daip_response


class DAIPDataSource(DataSource):
    name = 'daip'

    def __init__(self, config, locations, client=None):
        super().__init__(config, locations)
        section = config['DAIP'] if config.has_section('DAIP') else {}
        self.radius = section.get('radius', '10')
        self.sort = section.get('sort', 'Criticality')
        self.client = client or DAIPClient(
            query_url=section.get('query_url', 'https://www.daip.jcs.mil/daip/mobile/query'),
            index_url=section.get('index_url', 'https://www.daip.jcs.mil/daip/mobile/index'),
            timeout=int(section.get('timeout', 15)),
            verify_ssl=_as_bool(section.get('verify_ssl', 'false')),
        )

    def fetch(self):
        try:
            response = self.client.fetch_locations(
                self.locations,
                radius=self.radius,
                sort=self.sort,
            )
            data = parse_daip_response(response)
            return SourceResult(
                provider=self.name,
                data=data,
                success=True,
                stats={
                    'reported_count': response.get('count', 0),
                    'parsed_count': len(data['CODE']),
                },
            )
        except Exception as exc:
            return SourceResult(provider=self.name, success=False, error=str(exc))


def _as_bool(value):
    return str(value).strip().lower() not in {'0', 'false', 'no', 'off'}

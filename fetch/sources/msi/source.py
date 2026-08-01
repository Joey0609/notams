from fetch.MSI_FETCH import MSI_FETCH

from ..base import DataSource, SourceResult, normalized_data


class MSIDataSource(DataSource):
    """Compatibility adapter for the existing maritime-safety source."""

    name = 'msi'

    def fetch(self):
        try:
            return SourceResult(
                provider=self.name,
                data=normalized_data(MSI_FETCH()),
                success=True,
            )
        except Exception as exc:
            return SourceResult(provider=self.name, success=False, error=str(exc))

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .geometry import path_geometry


DATA_FIELDS = (
    'CODE',
    'TIME',
    'PLATID',
    'RAWMESSAGE',
    'ALTITUDE',
    'SOURCE',
    'FIR',
    'GEOMETRY',
)


def empty_data() -> Dict[str, List[str]]:
    return {field_name: [] for field_name in DATA_FIELDS}


def append_record(data: Dict[str, List[str]], **record: Any) -> None:
    for field_name in DATA_FIELDS:
        data[field_name].append(str(record.get(field_name, '') or ''))


def normalized_data(payload: Optional[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Convert legacy source payloads to the common field-aligned schema.

    Older maritime and DINS fetchers still expose polygon vertices through
    ``COORDINATES``.  The site only renders canonical ``GEOMETRY`` strings, so
    convert that legacy field while normalizing rather than letting the shape
    disappear at the source-adapter boundary.
    """
    payload = payload if isinstance(payload, dict) else {}
    codes = payload.get('CODE', []) or []
    size = len(codes)
    output = empty_data()
    aliases = {'PLATID': 'TRANSID'}
    legacy_coordinates = payload.get('COORDINATES') if payload.get('GEOMETRY') is None else None

    for index in range(size):
        for field_name in DATA_FIELDS:
            values = payload.get(field_name)
            if values is None and field_name in aliases:
                values = payload.get(aliases[field_name])
            if values is None and field_name == 'GEOMETRY':
                values = legacy_coordinates
            if not isinstance(values, (list, tuple)):
                values = []
            fallback = ''
            if field_name == 'SOURCE':
                fallback = 'NOTAM'
            elif field_name == 'FIR':
                fallback = 'UNKNOWN'
            elif field_name == 'ALTITUDE':
                fallback = 'None'
            value = str(values[index] if index < len(values) else fallback)
            if field_name == 'GEOMETRY' and legacy_coordinates is not None:
                value = path_geometry(value.split('-'))
            output[field_name].append(value)
    return output


@dataclass
class SourceResult:
    provider: str
    data: Dict[str, List[str]] = field(default_factory=empty_data)
    success: bool = True
    error: Optional[str] = None
    stats: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FetchBatchResult:
    data: Dict[str, List[str]] = field(default_factory=empty_data)
    results: List[SourceResult] = field(default_factory=list)

    @property
    def any_success(self) -> bool:
        return any(result.success for result in self.results)


class DataSource(ABC):
    name = 'unknown'

    def __init__(self, config, locations: List[str]):
        self.config = config
        self.locations = locations

    @abstractmethod
    def fetch(self) -> SourceResult:
        """Fetch upstream data and return records in the common schema."""
        raise NotImplementedError

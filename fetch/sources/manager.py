import re

from .base import DATA_FIELDS, FetchBatchResult, empty_data


SOURCE_ALIASES = {
    'fns': 'faa',
    'fns_notam_search': 'faa',
    'dinsqueryweb': 'dins',
}


def get_enabled_source_names(config):
    raw = config.get('DATA_SOURCES', 'enabled', fallback='faa')
    names = []
    for item in re.split(r'[,;\s]+', raw):
        name = SOURCE_ALIASES.get(item.strip().lower(), item.strip().lower())
        if name and name not in names:
            names.append(name)
    if not names:
        raise ValueError('DATA_SOURCES.enabled 至少需要配置一个数据源')
    return names


def get_locations(config):
    raw = config.get('ICAO', 'codes', fallback='')
    locations = []
    for item in re.split(r'[,;\s]+', raw):
        value = item.strip().upper()
        if value and value not in locations:
            locations.append(value)
    return locations


def fetch_enabled_sources(config, locations=None):
    locations = locations or get_locations(config)
    names = get_enabled_source_names(config)
    registry = _source_registry()
    merged = empty_data()
    results = []
    seen_records = set()

    for name in names:
        source_class = registry.get(name)
        if source_class is None:
            available = ', '.join(sorted(registry))
            raise ValueError(f'未知数据源 {name!r}，可选值: {available}')
        result = source_class(config, locations).fetch()
        results.append(result)
        if not result.success:
            print(f'[data-source:{name}] 获取失败: {result.error}')
            continue

        accepted = 0
        for index, code in enumerate(result.data.get('CODE', []) or []):
            source_values = result.data.get('SOURCE', []) or []
            source_type = str(source_values[index] if index < len(source_values) else 'NOTAM').upper()
            record_key = (source_type, re.sub(r'\s+', '', str(code)).upper())
            if record_key in seen_records:
                continue
            seen_records.add(record_key)
            for field_name in DATA_FIELDS:
                values = result.data.get(field_name, []) or []
                merged[field_name].append(str(values[index] if index < len(values) else ''))
            accepted += 1
        print(
            f'[data-source:{name}] 解析 {len(result.data.get("CODE", []))} 条，'
            f'聚合采用 {accepted} 条'
        )

    return FetchBatchResult(data=merged, results=results)


def _source_registry():
    from .daip import DAIPDataSource
    from .dins import DINSDataSource
    from .faa import FAADataSource
    from .msi import MSIDataSource

    return {
        'faa': FAADataSource,
        'daip': DAIPDataSource,
        'dins': DINSDataSource,
        'msi': MSIDataSource,
    }

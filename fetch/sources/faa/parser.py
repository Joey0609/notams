import html

from ..base import empty_data
from ..common import (
    add_area_records,
    deduplicate_by_code,
    extract_fir,
    is_relevant_area_notam,
    parse_faa_date_range,
)


def parse_faa_response(response):
    output = empty_data()
    queries = response.get('queries', []) if isinstance(response, dict) else []
    for query_result in queries:
        query_type = query_result.get('query_type')
        fallback_fir = query_result.get('query') if query_type == 'location' else 'UNKNOWN'
        for item in query_result.get('notams', []) or []:
            raw_message = html.unescape(str(item.get('icaoMessage', '') or ''))
            if not is_relevant_area_notam(raw_message):
                continue
            code = str(item.get('notamNumber', 'UNKNOWN') or 'UNKNOWN')
            platid = str(item.get('transactionID') or code)
            add_area_records(
                output,
                code=code,
                raw_message=raw_message,
                time_value=parse_faa_date_range(item.get('startDate'), item.get('endDate')),
                platid=platid,
                fir=extract_fir(raw_message, fallback_fir),
            )
    return deduplicate_by_code(output)

import html

from ..base import empty_data
from ..common import (
    add_area_records,
    deduplicate_by_code,
    extract_fir,
    is_relevant_area_notam,
    parse_raw_notam_time,
)


def parse_daip_response(response):
    output = empty_data()
    groups = response.get('group', []) if isinstance(response, dict) else []
    for group in groups or []:
        group_fir = str(group.get('name', 'UNKNOWN') or 'UNKNOWN')
        for notam_group in group.get('notams', []) or []:
            fallback_fir = str(notam_group.get('code') or group_fir)
            for item in notam_group.get('list', []) or []:
                raw_message = html.unescape(
                    str(item.get('rawtext', '') or '')
                ).lstrip('\r\n')
                display_text = html.unescape(str(item.get('text', '') or ''))
                searchable_text = raw_message or display_text
                if not is_relevant_area_notam(searchable_text):
                    continue
                code = str(item.get('idshow') or item.get('id') or 'UNKNOWN')
                platid = str(item.get('key') or item.get('xid') or f'{fallback_fir}:{code}')
                add_area_records(
                    output,
                    code=code,
                    raw_message=searchable_text,
                    time_value=parse_raw_notam_time(raw_message, display_text),
                    platid=platid,
                    fir=extract_fir(raw_message, fallback_fir),
                )
    return deduplicate_by_code(output)

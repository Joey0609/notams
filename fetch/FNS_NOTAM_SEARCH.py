"""Backward-compatible entry point for the refactored FAA data source.

New code should use ``fetch.sources`` and select providers in ``config.ini``.
"""

import configparser
import os

from fetch.sources.faa import FAADataSource


def FNS_NOTAM_SEARCH(icao_codes=None):
    config = _load_config()
    locations = _parse_locations(
        icao_codes or config.get('ICAO', 'codes', fallback='')
    )
    result = FAADataSource(config, locations).fetch()
    data = result.data
    return {
        'CODE': data['CODE'],
        'COORDINATES': data['COORDINATES'],
        'TIME': data['TIME'],
        'TRANSID': data['PLATID'],
        'RAWMESSAGE': data['RAWMESSAGE'],
        'ALTITUDE': data['ALTITUDE'],
        'SOURCE': data['SOURCE'],
        'FIR': data['FIR'],
        'ERROR': result.error,
    }


def _load_config():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config = configparser.ConfigParser()
    config.read(os.path.join(repo_root, 'config.ini'), encoding='utf-8')
    return config


def _parse_locations(value):
    return [item.strip().upper() for item in str(value or '').replace(',', ' ').split() if item.strip()]


if __name__ == '__main__':
    print(FNS_NOTAM_SEARCH())

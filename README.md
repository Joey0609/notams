<div align="center">

# 🌐 Notam Website Viewer 

![GitHub stars](https://img.shields.io/github/stars/Joey0609/notams?style=social)
![GitHub forks](https://img.shields.io/github/forks/Joey0609/notams?style=social)
![GitHub issues](https://img.shields.io/github/issues/Joey0609/notams)
[![Website](https://img.shields.io/badge/website-online-brightgreen)](https://joey0609.github.io/notams/)
[![Website Visits](https://img.shields.io/badge/dynamic/json?color=blue&label=Visits&query=value&url=https://joey0609.github.io/notams/visits.json)](https://counter.dev/dashboard.html?user=Starsky69&token=Beb6_vARt7c%3D)
</div>

[中文](README_CN.md) | English

This project parses NOTAMs and related maritime safety notices to extract rocket launch areas, debris zones, and restricted zones, then visualizes them on a map. It also includes historical archive matching, source reconciliation, image export, coordinate lookup, and distance measurement features.<br>

## Website: https://joey0609.github.io/notams/ <br>

**If you find this project helpful, please consider giving it a ⭐ on GitHub. Your support helps us keep improving and adding new features.**

**This project is modified from FallingFengre/notams:main.**<br>

## <span style="font-weight:bold;color:red;">This project must not be used for illegal purposes. Please help safeguard national security, and do not analyze or distribute non-rocket flight notams.</span>

## Project Overview

NOTAMs (Notice to Airmen) are aviation notices that warn pilots about temporary hazards, including restricted areas, debris zones, and other flight limitations. For rocket launch missions, these notices often contain the area boundary, effective time, notice number, and supporting remarks, making them an important source for identifying launch activity and hazard zones. The project parses these notices into structured coordinates and combines them with time windows and source metadata for unified display.

The current pipeline covers three main data sources: NOTAM notices, NGA MSI maritime safety information, and archived match results. These sources do not share a single consistent text format, so the parser handles coordinate extraction, time normalization, area filtering, and deduplication before writing the final results to the map and local data files.

## Typical Format

Rocket-launch-related NOTAMs often look like this:<br>

> A1690/23 - A TEMPORARY DANGER AREA ESTABLISHED BOUNDED BY: N392852E0955438-N385637E0955854-N390118E0970056-N393335E0965708 BACK TO START. VERTICAL LIMITS:SFC-UNL. SFC - UNL, 06 JUL 03:18 2023 UNTIL 06 JUL 04:45 2023. CREATED: 05 JUL 07:40 2023

In this example, “A1690/23” is the NOTAM serial number, the sequence of coordinates defines the hazard area, and “06 JUL 03:18 2023 UNTIL 06 JUL 04:45 2023” is the effective time window. The wording may vary across countries and sea areas, but the core information usually remains the same: notice ID, time range, and coordinate boundaries.

## Usage

After startup, the project automatically fetches data, generates structured results, and renders them on the map. The map focuses on information needed for current visibility and analysis rather than preserving every original notice in full. When the same event appears from multiple sources, the system keeps the most complete and interpretable fields and tries to avoid being overwritten by empty or default values.

### Data-source selection

Select providers in `config.ini`. FAA remains the default:

```ini
[DATA_SOURCES]
enabled = faa
```

Use `enabled = daip` for DAIP, or `enabled = faa, daip` to aggregate both in priority order. Duplicate records with the same `SOURCE + CODE` keep the version from the first configured provider. `[ICAO] codes` supplies the shared location list.

Available providers are `faa`, `daip`, `dins` (legacy adapter), and `msi` (legacy adapter). Provider-specific request and parsing code lives under `fetch/sources/<provider>/`. Every provider emits the same normalized fields, while `main.py` only performs aggregation, filtering, classification, and persistence.

The DAIP certificate chain is commonly absent from Python/Certifi's default trust store, so the sample configuration uses `verify_ssl = false`. Set it to `true` when the corresponding CA certificates are installed in the runtime environment.

```text
fetch/sources/
├── base.py
├── common.py
├── manager.py
├── faa/
├── daip/
├── dins/
└── msi/
```

If you find a bug or want to improve the project, feel free to open an Issue or Pull Request.

### NOTAM archive

Every successful scan in `main.run_scan()` archives only the explicit FOCUS
NOTAM section. It reuses the current relevance, time, altitude, geometry and
multi-area parser. The existing update-and-deploy workflow publishes these
monthly files along with the current snapshot; no separate monthly archive
workflow or retired FAA archive endpoint is used.

A NOTAM missing from the next complete aviation observation before its declared
end time is removed from the database. Naturally expired records remain. Failed
or partial aviation fetches cannot delete records. The observation baseline is
stored in `data/notam_db/active_notams.json`; changing the configured focus scope
starts a new baseline instead of inferring withdrawals across different scopes.

```bash
# Preview recovery of previously observed FOCUS originals.
python -m fetch.recover_notam_archive --start 2026-01-01 --end 2026-10-29 --git-ref origin/main --dry-run --report temp/archive_preview.json

# Rebuild the selected months, with automatic backups.
python -m fetch.recover_notam_archive --start 2026-01-01 --end 2026-10-29 --git-ref origin/main --report temp/archive_recovery.json
```

Git recovery needs a full checkout. It reprocesses saved originals using current
rules and applies the same early-withdrawal rule chronologically at snapshot
commit times. Old snapshots without an explicit successful-fetch marker cannot
prove a withdrawal and are not used as deletion evidence. Segmented snapshots
use their FOCUS section; legacy flat snapshots are restricted by the current
`ICAO_FOCUSED` locations. Date bounds use the UTC effective start date.

This recovers this project's observations, **not complete upstream history**.
Missed or previously discarded originals cannot be reconstructed. Reports retain
that limitation; old `data/progress.json` success markers are not reused. Changed
files are backed up under `temp/archive_backups/` before replacement. Recovery
itself does not fetch upstream data or run notifications, visits, or matching.

**Other Pages**

[Baidu Tieba](https://tieba.baidu.com/p/9298301903)

**Open Source License and Third-Party Libraries**

This project uses the following third-party open-source software:

Leaflet v1.9.4  
Copyright (c) 2010-2025, Volodymyr Agafonkin  
License: BSD 2-Clause License  
Website: <https://leafletjs.cn/>  
License file: static/leaflet/LICENSE

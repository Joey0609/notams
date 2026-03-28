"""
From U.S. Maritime Administration (NGA MSI):
https://msi.nga.mil/
"""

import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Debug mode: when True, skip expiration filtering.
DEBUG = True

MONTHS = {
    "JAN": 1,
    "FEB": 2,
    "MAR": 3,
    "APR": 4,
    "MAY": 5,
    "JUN": 6,
    "JUL": 7,
    "AUG": 8,
    "SEP": 9,
    "OCT": 10,
    "NOV": 11,
    "DEC": 12,
}
MONTHS_REV = {v: k for k, v in MONTHS.items()}

# Blacklist landing areas to suppress.
BLACKLIST_AREAS = [
    [
        "S085300E0922800",
        "S074600E0892700",
        "S301200E0610900",
        "S404500W0022100",
        "S425600W0022400",
        "S321600E0631000",
    ]
]


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
CACHE_FILE = os.path.join(ROOT_DIR, "data", "msi_nav_result.json")

# Fallback defaults if external config module is not present.
MSI_FETCH_EXPIRE_TIME = 1800
MSI_NAV_AREAS = ["4", "C", "12", "P", "A"]
MSI_DNC_REGIONS = []

try:
    import config as msi_config  # type: ignore

    MSI_FETCH_EXPIRE_TIME = int(getattr(msi_config, "MSI_FETCH_EXPIRE_TIME", MSI_FETCH_EXPIRE_TIME))
    MSI_NAV_AREAS = list(getattr(msi_config, "MSI_NAV_AREAS", MSI_NAV_AREAS))
    MSI_DNC_REGIONS = list(getattr(msi_config, "MSI_DNC_REGIONS", MSI_DNC_REGIONS))
except Exception:
    pass


def make_headers():
    return {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
    }


def preprocess_text(text):
    text = re.sub(r"\s+", " ", str(text or ""))
    return text.strip()


def parse_coordinates_msi(text):
    """
    Parse coordinates like:
    38-18.00N 074-57.00W
    -> N381800W0745700
    """
    coords = []
    pattern = r"(\d{1,2})-(\d{2})\.(\d{2})([NS])\s+(\d{2,3})-(\d{2})\.(\d{2})([EW])"
    matches = re.findall(pattern, str(text or ""))

    for match in matches:
        lat_deg, lat_min, lat_dec, lat_dir, lon_deg, lon_min, lon_dec, lon_dir = match
        lat_sec = round(int(lat_dec) * 60 / 100)
        lon_sec = round(int(lon_dec) * 60 / 100)

        formatted_lat = f"{lat_dir}{int(lat_deg):02d}{int(lat_min):02d}{lat_sec:02d}"
        formatted_lon = f"{lon_dir}{int(lon_deg):03d}{int(lon_min):02d}{lon_sec:02d}"
        coords.append(formatted_lat + formatted_lon)

    return coords


def parse_cancel_time(msg_text, _created_on):
    pattern = r"CANCEL\s+THIS\s+MSG\s+(\d{2})(\d{4})Z\s+([A-Z]+)\s+(\d{2})"
    match = re.search(pattern, str(msg_text or ""), re.IGNORECASE)
    if not match:
        return None

    day, time_text, month_str, year_short = match.groups()
    hour = int(time_text[:2])
    minute = int(time_text[2:])
    month = MONTHS.get(month_str.upper(), 1)
    year = 2000 + int(year_short)

    try:
        return datetime(year, month, int(day), hour, minute)
    except Exception:
        return None


def parse_msg_code(msg_text, msg_type):
    escaped_type = re.escape(str(msg_type or ""))
    pattern = rf"({escaped_type}\s+\d+/\d+(?:\([A-Z0-9,]+\))?)"
    match = re.search(pattern, str(msg_text or ""), re.IGNORECASE)
    if match:
        return match.group(1).strip()

    pattern2 = r"([A-Z]+\s+[IVX]*\s*\d+/\d+(?:\([A-Z0-9,]+\))?)"
    match2 = re.search(pattern2, str(msg_text or ""))
    if match2:
        return match2.group(1).strip()

    return str(msg_type or "MSI")


def format_window(start_dt, end_dt):
    start_str = f"{start_dt.day:02d} {MONTHS_REV[start_dt.month]} {start_dt.hour:02d}:{start_dt.minute:02d} {start_dt.year}"
    end_str = f"{end_dt.day:02d} {MONTHS_REV[end_dt.month]} {end_dt.hour:02d}:{end_dt.minute:02d} {end_dt.year}"
    return f"{start_str} UNTIL {end_str}"


def get_base_year(created_on):
    base_year = datetime.utcnow().year
    year_match = re.search(r"(\d{4})$", str(created_on or ""))
    if year_match:
        base_year = int(year_match.group(1))
    return base_year


def parse_time_segment(time_text, base_year):
    """
    Parse time segments and return a list of windows.
    The returned list may contain multiple windows for DAILY/ALTERNATE patterns.
    """
    time_text = preprocess_text(time_text)
    windows = []

    pattern_daily_prefix = (
        r"DAILY\s+(\d{1,2})\s+([A-Z]{3})\s+THRU\s+(\d{1,2})\s+([A-Z]{3})(?:\s+(\d{2}))?:?\s*"
        r"(\d{4})Z\s+TO\s+(\d{4})Z"
    )
    daily_prefix = re.search(pattern_daily_prefix, time_text, re.IGNORECASE)
    if daily_prefix:
        start_day, start_mon, end_day, end_mon, year_short, start_time, end_time = daily_prefix.groups()
        start_hour, start_min = int(start_time[:2]), int(start_time[2:])
        end_hour, end_min = int(end_time[:2]), int(end_time[2:])
        start_month = MONTHS.get(start_mon.upper(), 1)
        end_month = MONTHS.get(end_mon.upper(), start_month)

        start_year = base_year
        end_year = base_year
        if year_short:
            end_year = 2000 + int(year_short)
            start_year = end_year - 1 if end_month < start_month else end_year
        elif end_month < start_month:
            end_year = base_year + 1

        try:
            current_date = datetime(start_year, start_month, int(start_day))
            end_date = datetime(end_year, end_month, int(end_day))
            while current_date <= end_date:
                start_dt = current_date.replace(hour=start_hour, minute=start_min)
                end_dt = current_date.replace(hour=end_hour, minute=end_min)
                if end_dt <= start_dt:
                    end_dt += timedelta(days=1)
                windows.append(format_window(start_dt, end_dt))
                current_date += timedelta(days=1)
        except Exception as exc:
            print(f"[warn] DAILY prefix parse error: {exc}")
        if windows:
            return windows

    pattern_daily_reversed = r"(\d{4})Z\s+TO\s+(\d{4})Z\s+DAILY\s+(\d{1,2})\s+THRU\s+(\d{1,2})\s+([A-Z]{3})(?:\s+(\d{2}))?"
    daily_rev = re.search(pattern_daily_reversed, time_text, re.IGNORECASE)
    if daily_rev:
        start_time, end_time, start_day, end_day, month_str, year_short = daily_rev.groups()
        start_hour, start_min = int(start_time[:2]), int(start_time[2:])
        end_hour, end_min = int(end_time[:2]), int(end_time[2:])
        month = MONTHS.get(month_str.upper(), 12)
        year = 2000 + int(year_short) if year_short else base_year
        try:
            for day in range(int(start_day), int(end_day) + 1):
                start_dt = datetime(year, month, day, start_hour, start_min)
                end_dt = datetime(year, month, day, end_hour, end_min)
                if end_dt <= start_dt:
                    end_dt += timedelta(days=1)
                windows.append(format_window(start_dt, end_dt))
        except Exception as exc:
            print(f"[warn] DAILY reversed parse error: {exc}")
        if windows:
            return windows

    pattern_daily_full = (
        r"(\d{4})Z\s+TO\s+(\d{4})Z\s+DAILY\s+(\d{1,2})\s+([A-Z]{3})\s+THRU\s+"
        r"(\d{1,2})\s+([A-Z]{3})(?:\s+(\d{2}))?"
    )
    daily_full = re.search(pattern_daily_full, time_text, re.IGNORECASE)
    if daily_full:
        start_time, end_time, start_day, start_mon, end_day, end_mon, year_short = daily_full.groups()
        start_hour, start_min = int(start_time[:2]), int(start_time[2:])
        end_hour, end_min = int(end_time[:2]), int(end_time[2:])
        start_month = MONTHS.get(start_mon.upper(), 1)
        end_month = MONTHS.get(end_mon.upper(), start_month)

        start_year = base_year
        end_year = base_year
        if year_short:
            end_year = 2000 + int(year_short)
            start_year = end_year - 1 if end_month < start_month else end_year
        elif end_month < start_month:
            end_year = base_year + 1

        try:
            current_date = datetime(start_year, start_month, int(start_day))
            end_date = datetime(end_year, end_month, int(end_day))
            while current_date <= end_date:
                start_dt = current_date.replace(hour=start_hour, minute=start_min)
                end_dt = current_date.replace(hour=end_hour, minute=end_min)
                if end_dt <= start_dt:
                    end_dt += timedelta(days=1)
                windows.append(format_window(start_dt, end_dt))
                current_date += timedelta(days=1)
        except Exception as exc:
            print(f"[warn] DAILY full parse error: {exc}")
        if windows:
            return windows

    main_pattern = r"(\d{6})Z\s+TO\s+(\d{6})Z\s+([A-Z]{3})(?:\s+(\d{2}))?"
    main_match = re.search(main_pattern, time_text, re.IGNORECASE)

    current_month = None
    current_year = base_year

    if main_match:
        start_code, end_code, month_str, year_short = main_match.groups()
        start_day = int(start_code[:2])
        start_hour = int(start_code[2:4])
        start_min = int(start_code[4:6])
        end_day = int(end_code[:2])
        end_hour = int(end_code[2:4])
        end_min = int(end_code[4:6])
        current_month = MONTHS.get(month_str.upper(), 12)
        if year_short:
            current_year = 2000 + int(year_short)

        try:
            start_dt = datetime(current_year, current_month, start_day, start_hour, start_min)
            end_dt = datetime(current_year, current_month, end_day, end_hour, end_min)
            if end_dt <= start_dt:
                if end_day < start_day:
                    next_month = current_month + 1 if current_month < 12 else 1
                    next_year = current_year + 1 if current_month == 12 else current_year
                    end_dt = datetime(next_year, next_month, end_day, end_hour, end_min)
                else:
                    end_dt += timedelta(days=1)
            windows.append(format_window(start_dt, end_dt))
        except Exception as exc:
            print(f"[warn] main window parse error: {exc}")

    alternate_match = re.search(r"ALTERNATE\s+(.+?)(?:\d+\.\s|CANCEL|$)", time_text, re.IGNORECASE | re.DOTALL)
    if alternate_match:
        alt_text = alternate_match.group(1)
        daily_alt_pattern = r"(\d{4})Z\s+TO\s+(\d{4})Z\s+DAILY\s+(\d{1,2})\s+THRU\s+(\d{1,2})\s+([A-Z]{3})(?:\s+(\d{2}))?"
        daily_alt = re.search(daily_alt_pattern, alt_text, re.IGNORECASE)

        if daily_alt:
            start_time, end_time, start_day, end_day, month_str, year_short = daily_alt.groups()
            start_hour, start_min = int(start_time[:2]), int(start_time[2:])
            end_hour, end_min = int(end_time[:2]), int(end_time[2:])
            month = MONTHS.get(month_str.upper(), current_month or 12)
            year = 2000 + int(year_short) if year_short else current_year
            try:
                for day in range(int(start_day), int(end_day) + 1):
                    start_dt = datetime(year, month, day, start_hour, start_min)
                    end_dt = datetime(year, month, day, end_hour, end_min)
                    if end_dt <= start_dt:
                        end_dt += timedelta(days=1)
                    windows.append(format_window(start_dt, end_dt))
            except Exception as exc:
                print(f"[warn] alternate DAILY parse error: {exc}")
        else:
            pairs = re.findall(
                r"(\d{6})Z\s+TO\s+(\d{6})Z(?:[,\s]+(?:AND\s+)?)?([A-Z]{3})?(?:\s+(\d{2}))?",
                alt_text,
                re.IGNORECASE,
            )
            last_month = current_month or 12
            last_year = current_year
            month_info = {}

            for i, (_sc, _ec, mon, yr) in enumerate(pairs):
                if mon:
                    month_info[i] = (MONTHS.get(mon.upper(), last_month), 2000 + int(yr) if yr else current_year)

            for i in range(len(pairs) - 1, -1, -1):
                if i in month_info:
                    last_month, last_year = month_info[i]
                else:
                    month_info[i] = (last_month, last_year)

            for i, (start_code, end_code, _mon, _yr) in enumerate(pairs):
                month, year = month_info.get(i, (current_month or 12, current_year))
                start_day = int(start_code[:2])
                start_hour = int(start_code[2:4])
                start_min = int(start_code[4:6])
                end_day = int(end_code[:2])
                end_hour = int(end_code[2:4])
                end_min = int(end_code[4:6])
                try:
                    start_dt = datetime(year, month, start_day, start_hour, start_min)
                    end_dt = datetime(year, month, end_day, end_hour, end_min)
                    if end_dt <= start_dt:
                        if end_day < start_day:
                            next_month = month + 1 if month < 12 else 1
                            next_year = year + 1 if month == 12 else year
                            end_dt = datetime(next_year, next_month, end_day, end_hour, end_min)
                        else:
                            end_dt += timedelta(days=1)
                    windows.append(format_window(start_dt, end_dt))
                except Exception as exc:
                    print(f"[warn] alternate pair parse error: {exc}")

    return windows


def check_against_blacklist(coords):
    if not coords or len(coords) < 3:
        return False

    for blacklist_coords in BLACKLIST_AREAS:
        if len(blacklist_coords) < 3:
            continue
        match_count = sum(1 for c in coords if c in blacklist_coords)
        overlap_ratio = match_count / len(coords)
        if overlap_ratio > 0.5:
            return True

    return False


def extract_areas_with_time(msg_text, base_year):
    areas = []
    area_counter = 1

    prefix_daily_pattern = r"(DAILY\s+\d{1,2}\s+[A-Z]{3}\s+THRU\s+\d{1,2}\s+[A-Z]{3}(?:\s+\d{2})?):"
    prefix_match = re.search(prefix_daily_pattern, msg_text, re.IGNORECASE)
    prefix_daily_text = prefix_match.group(1) if prefix_match else None

    area_with_time_pattern = (
        r"[A-Z]\.\s+(\d{4}Z\s+TO\s+\d{4}Z)\s+IN\s+AREAS?\s+BOUND\s+BY\s+"
        r"((?:\d{1,2}-\d{2}\.\d{2}[NS]\s+\d{2,3}-\d{2}\.\d{2}[EW][,.\s]*)+)"
    )
    area_time_matches = re.findall(area_with_time_pattern, msg_text, re.IGNORECASE | re.DOTALL)

    if area_time_matches:
        for time_section, coord_text in area_time_matches:
            coords = parse_coordinates_msi(coord_text)
            if len(coords) >= 3:
                if check_against_blacklist(coords):
                    print("[filter] matched blacklist area, skipped")
                    continue
                full_time_text = f"{prefix_daily_text}: {time_section}" if prefix_daily_text else time_section
                time_windows = parse_time_segment(full_time_text, base_year)
                time_str = ";".join(time_windows) if time_windows else None
                areas.append((area_counter, coords, time_str))
                area_counter += 1
        if areas:
            return areas

    old_format_pattern = (
        r"[A-Z]\.\s+(.+?IN\s+AREAS?\s+BOUND\s+BY\s+)"
        r"((?:\d{1,2}-\d{2}\.\d{2}[NS]\s+\d{2,3}-\d{2}\.\d{2}[EW][,.\s]*)+)"
    )
    old_format_matches = re.findall(old_format_pattern, msg_text, re.IGNORECASE | re.DOTALL)

    if old_format_matches:
        for time_section, coord_text in old_format_matches:
            coords = parse_coordinates_msi(coord_text)
            if len(coords) >= 3:
                if check_against_blacklist(coords):
                    print("[filter] matched blacklist area, skipped")
                    continue
                time_windows = parse_time_segment(time_section, base_year)
                time_str = ";".join(time_windows) if time_windows else None
                areas.append((area_counter, coords, time_str))
                area_counter += 1
        if areas:
            return areas

    simple_area_pattern = r"[A-Z]\.\s+((?:\d{1,2}-\d{2}\.\d{2}[NS]\s+\d{2,3}-\d{2}\.\d{2}[EW][,.\s]*)+)"
    simple_matches = re.findall(simple_area_pattern, msg_text, re.IGNORECASE)

    if simple_matches:
        overall_windows = parse_time_segment(msg_text, base_year)
        overall_time_str = ";".join(overall_windows) if overall_windows else None

        for coord_text in simple_matches:
            coords = parse_coordinates_msi(coord_text)
            if len(coords) >= 3:
                if check_against_blacklist(coords):
                    print("[filter] matched blacklist area, skipped")
                    continue
                areas.append((area_counter, coords, overall_time_str))
                area_counter += 1
        if areas:
            return areas

    coords = parse_coordinates_msi(msg_text)
    if len(coords) >= 3:
        if check_against_blacklist(coords):
            print("[filter] matched blacklist area, skipped")
            return []
        time_windows = parse_time_segment(msg_text, base_year)
        time_str = ";".join(time_windows) if time_windows else None
        areas.append((1, coords, time_str))

    return areas


def fetch_url_with_retry(url, max_retries=3):
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=make_headers(), timeout=20, verify=False)
            if response.status_code == 200:
                try:
                    return response.json()
                except Exception:
                    print(f"[warn] non-json response for {url}")
                    return None
            print(f"[warn] request failed status={response.status_code}, retry {attempt + 1}/{max_retries}")
        except Exception as exc:
            print(f"[error] request error: {exc}, retry {attempt + 1}/{max_retries}")
            if attempt == max_retries - 1:
                raise
    return None


def process_single_url(url):
    local_result = {
        "CODE": [],
        "COORDINATES": [],
        "TIME": [],
        "TRANSID": [],
        "RAWMESSAGE": [],
        "SOURCE": [],
        "FIR": [],
        "ALTITUDE": [],
    }

    try:
        print(f"[progress] requesting: {url}", flush=True)
        data = fetch_url_with_retry(url)
        if not data:
            return local_result

        smaps = data.get("smaps", [])
        print(f"[progress] got {len(smaps)} records", flush=True)

        for smap in smaps:
            category = str(smap.get("category", ""))
            if category not in ["ROCKET LAUNCHING", "SPACE DEBRIS"]:
                continue

            msg_text = smap.get("msgText", "")
            msg_id = smap.get("msgID", "")
            msg_type = smap.get("msgType", "")
            created_on = smap.get("createdOn", "")
            if not msg_text:
                continue

            if not DEBUG:
                cancel_time = parse_cancel_time(msg_text, created_on)
                if cancel_time and cancel_time < datetime.utcnow():
                    print(f"[filter] expired by cancel time: {msg_id}", flush=True)
                    continue

            code = parse_msg_code(msg_text, msg_type)
            base_year = get_base_year(created_on)
            areas = extract_areas_with_time(msg_text, base_year)

            if not areas:
                print(f"[warn] no valid coordinates: {msg_id}", flush=True)
                continue

            temp_areas = []
            for area_number, coords, time_str in areas:
                if not time_str:
                    print(f"[warn] failed to parse time: {code} AREA {area_number}", flush=True)
                    continue
                temp_areas.append((area_number, coords, time_str))

            if len(temp_areas) == 1:
                area_number, coords, time_str = temp_areas[0]
                _ = area_number
                local_result["CODE"].append(code)
                local_result["COORDINATES"].append("-".join(coords))
                local_result["TIME"].append(time_str)
                local_result["TRANSID"].append(msg_id)
                local_result["RAWMESSAGE"].append(msg_text)
                local_result["SOURCE"].append("MSI_NAV")
                local_result["FIR"].append("MSI_NAV")
                local_result["ALTITUDE"].append("None")
                print(f"[progress] parsed: {code}", flush=True)
            else:
                for area_number, coords, time_str in temp_areas:
                    area_code = f"{code} AREA {area_number}"
                    local_result["CODE"].append(area_code)
                    local_result["COORDINATES"].append("-".join(coords))
                    local_result["TIME"].append(time_str)
                    local_result["TRANSID"].append(msg_id)
                    local_result["RAWMESSAGE"].append(msg_text)
                    local_result["SOURCE"].append("MSI_NAV")
                    local_result["FIR"].append("MSI_NAV")
                    local_result["ALTITUDE"].append("None")
                    print(f"[progress] parsed: {area_code}", flush=True)

    except Exception as exc:
        print(f"[error] process URL failed {url}: {exc}", flush=True)

    return local_result


def empty_payload():
    return {
        "CODE": [],
        "COORDINATES": [],
        "TIME": [],
        "TRANSID": [],
        "RAWMESSAGE": [],
        "SOURCE": [],
        "FIR": [],
        "ALTITUDE": [],
    }


def MSI_NAV_SEARCH():
    print("[progress] start MSI_NAV_SEARCH...", flush=True)

    if os.path.exists(CACHE_FILE) and not DEBUG:
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                cache_data = json.load(f)
            cache_time = datetime.fromisoformat(cache_data.get("timestamp", "2000-01-01"))
            if (datetime.now() - cache_time).total_seconds() < MSI_FETCH_EXPIRE_TIME:
                print(f"[progress] use cache (time: {cache_time})", flush=True)
                result = cache_data.get("data", empty_payload())
                print(f"[progress] done via cache, got {len(result.get('CODE', []))} records", flush=True)
                return result
        except Exception as exc:
            print(f"[warn] read cache failed: {exc}", flush=True)

    result = empty_payload()
    urls = []

    for nav_area in MSI_NAV_AREAS:
        urls.append(
            f"https://msi.nga.mil/api/publications/smaps?navArea={nav_area}&status=active&category=14&output=json"
        )

    for dnc_region in MSI_DNC_REGIONS:
        urls.append(
            f"https://msi.nga.mil/api/publications/smaps?dncRegion={dnc_region}&status=active&category=14&output=json"
        )

    with ThreadPoolExecutor(max_workers=5) as executor:
        future_to_url = {executor.submit(process_single_url, url): url for url in urls}
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                local_result = future.result()
                for key in result.keys():
                    result[key].extend(local_result[key])
            except Exception as exc:
                print(f"[error] thread failed {url}: {exc}", flush=True)

    print(f"[progress] MSI_NAV_SEARCH done, got {len(result['CODE'])} records", flush=True)

    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({"timestamp": datetime.now().isoformat(), "data": result}, f, ensure_ascii=False, indent=2)
        print(f"[progress] cache saved: {CACHE_FILE}", flush=True)
    except Exception as exc:
        print(f"[warn] save cache failed: {exc}", flush=True)

    return result


def MSI_FETCH():
    try:
        return MSI_NAV_SEARCH()
    except Exception as exc:
        print(f"MSI_FETCH error: {exc}", flush=True)
        return empty_payload()


if __name__ == "__main__":
    DEBUG = True
    output = MSI_NAV_SEARCH()
    print(f"\nTotal records: {len(output['CODE'])}")
    for i in range(min(5, len(output["CODE"]))):
        print(f"\n--- Record {i + 1} ---")
        print(f"CODE: {output['CODE'][i]}")
        print(f"TIME: {str(output['TIME'][i])[:100]}...")
        print(f"COORDINATES: {str(output['COORDINATES'][i])[:80]}...")

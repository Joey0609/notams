import json
import os
import re
from datetime import datetime
from typing import Dict, List, Tuple


TIME_FORMAT = "%d %b %H:%M %Y"
MONTH_FILE_RE = re.compile(r"^\d{4}-\d{2}\.json$")


def _parse_time_range(time_str: str) -> Tuple[float, float]:
    try:
        parts = str(time_str).split(" UNTIL ")
        start = datetime.strptime(parts[0], TIME_FORMAT).timestamp()
        end = datetime.strptime(parts[1], TIME_FORMAT).timestamp()
        return start, end
    except Exception:
        return 0.0, 0.0


def _find(parent: Dict[int, int], x: int) -> int:
    parent.setdefault(x, x)
    if parent[x] != x:
        parent[x] = _find(parent, parent[x])
    return parent[x]


def _union(parent: Dict[int, int], a: int, b: int) -> None:
    pa = _find(parent, a)
    pb = _find(parent, b)
    if pa != pb:
        parent[pb] = pa


def rebuild_notam_db_classify(db_dir: str = "./data/notam_db") -> Dict[str, int]:
    if not os.path.isdir(db_dir):
        raise FileNotFoundError(f"notam_db 目录不存在: {db_dir}")

    month_files = sorted(
        [f for f in os.listdir(db_dir) if MONTH_FILE_RE.match(f)]
    )

    if not month_files:
        return {"files": 0, "records": 0, "groups": 0}

    month_data: Dict[str, Dict] = {}
    records: List[Dict] = []

    for filename in month_files:
        path = os.path.join(db_dir, filename)
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        month_data[filename] = data
        num = int(data.get("NUM", 0))

        codes = data.get("CODE", [])
        times = data.get("TIME", [])

        for i in range(num):
            code = str(codes[i]) if i < len(codes) else ""
            time_str = str(times[i]) if i < len(times) else ""
            s, e = _parse_time_range(time_str)
            if s > 0 and e > 0:
                records.append(
                    {
                        "gidx": len(records),
                        "month": filename,
                        "idx": i,
                        "code": code,
                        "start": s,
                        "end": e,
                    }
                )

    if not records:
        for filename, data in month_data.items():
            data.pop("CLASSIFY", None)
            data.pop("classify", None)
            data["CLASSIFY"] = {}
            data["classify"] = ["" for _ in range(int(data.get("NUM", 0)))]
            out = os.path.join(db_dir, filename)
            with open(out, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        return {"files": len(month_files), "records": 0, "groups": 0}

    parent: Dict[int, int] = {}

    for i in range(len(records)):
        r1 = records[i]
        d1 = r1["end"] - r1["start"]
        if d1 <= 0:
            continue

        for j in range(i + 1, len(records)):
            r2 = records[j]
            d2 = r2["end"] - r2["start"]
            if d2 <= 0:
                continue

            overlap = max(0.0, min(r1["end"], r2["end"]) - max(r1["start"], r2["start"]))
            if overlap <= 0:
                continue

            ratio1 = overlap / d1
            ratio2 = overlap / d2

            max_duration = max(d1, d2)
            if max_duration <= 10800:
                if abs(r2["start"] - r1["start"]) > 15 * 60:
                    continue
                min_threshold = 0.4
                max_threshold = 1.6
            else:
                min_threshold = 0.8
                max_threshold = 1.2

            if min_threshold <= ratio1 <= max_threshold and min_threshold <= ratio2 <= max_threshold:
                _union(parent, r1["gidx"], r2["gidx"])

    groups: Dict[int, List[int]] = {}
    for rec in records:
        root = _find(parent, rec["gidx"])
        groups.setdefault(root, []).append(rec["gidx"])

    group_members_by_key: Dict[str, List[str]] = {}
    gidx_to_class_key: Dict[int, str] = {}

    for member_ids in groups.values():
        codes = sorted(records[g]["code"] for g in sorted(member_ids))
        combined_str = "".join(codes)
        key_num = int.from_bytes(combined_str.encode("utf-8"), "big") % 998244353
        class_key = f"c{key_num}"

        # 哈希冲突时追加后缀，避免覆盖。
        if class_key in group_members_by_key and group_members_by_key[class_key] != codes:
            suffix = 2
            while f"{class_key}_{suffix}" in group_members_by_key:
                suffix += 1
            class_key = f"{class_key}_{suffix}"

        group_members_by_key[class_key] = codes
        for g in member_ids:
            gidx_to_class_key[g] = class_key

    for filename, data in month_data.items():
        num = int(data.get("NUM", 0))

        data.pop("CLASSIFY", None)
        data.pop("classify", None)

        class_list = ["" for _ in range(num)]
        month_classify: Dict[str, List[str]] = {}

        month_records = [r for r in records if r["month"] == filename]
        for r in month_records:
            class_key = gidx_to_class_key.get(r["gidx"], "")
            if 0 <= r["idx"] < num:
                class_list[r["idx"]] = class_key

            if class_key:
                month_classify[class_key] = sorted(set(group_members_by_key[class_key]))

        data["CLASSIFY"] = dict(sorted(month_classify.items(), key=lambda kv: kv[0]))
        data["classify"] = class_list

        out_path = os.path.join(db_dir, filename)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    return {
        "files": len(month_files),
        "records": len(records),
        "groups": len(group_members_by_key),
    }


if __name__ == "__main__":
    stats = rebuild_notam_db_classify("./data/notam_db")
    print(
        f"[CLASSIFY] 完成: files={stats['files']}, records={stats['records']}, groups={stats['groups']}"
    )

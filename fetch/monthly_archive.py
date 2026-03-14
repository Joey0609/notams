#!/usr/bin/env python3
"""
月度 NOTAM 归档脚本
================================
作用：获取"上个月"（相对于运行时间）的所有航警，写入本地 NotamDatabase。

调用方式：
  # 自动获取上个月（适合 GitHub Actions）
  python fetch/monthly_archive.py

  # 手动指定年月（本地调试）
  python fetch/monthly_archive.py --year 2025 --month 1

逻辑说明：
  - 对目标月份内的每一天调用 FNS_NOTAM_ARCHIVE_SEARCH（searchType=5）
  - 通过 progress.json 跳过已成功抓取的日期（支持失败续跑）
  - 去重后写入 data/notam_db/{YYYY-MM}.json
  - 全部完成后输出统计并以退出码 0 / 1 标识成功与否
"""

import argparse
import calendar
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

# ---------- 路径设置：不论从哪里运行都能正确找到模块 ----------
_REPO_ROOT = Path(__file__).resolve().parent.parent
_FETCH_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_REPO_ROOT))
sys.path.insert(0, str(_FETCH_DIR))

from FNS_NOTAM_ARCHIVE_SEARCH import FNS_NOTAM_ARCHIVE_SEARCH   # noqa: E402
from dataBase import NotamDatabase                               # noqa: E402

# progress.json 固定写到 data/progress.json（相对仓库根）
_PROGRESS_FILE = str(_REPO_ROOT / "data" / "progress.json")
_DB_DIR        = str(_REPO_ROOT / "data" / "notam_db")


# ----------------------------------------------------------------
def last_month_info():
    """返回"上个月"的 (year, month)。"""
    today = datetime.utcnow()
    first_of_this = today.replace(day=1)
    prev = first_of_this - timedelta(days=1)   # 上个月最后一天
    return prev.year, prev.month


def iter_days(year: int, month: int):
    """生成目标月份内每 3 天一次的 YYYY-MM-DD 字符串列表。"""
    _, last_day = calendar.monthrange(year, month)
    return [
        f"{year}-{month:02d}-{d:02d}"
        for d in range(1, last_day + 1, 3)
    ]


def save_results_to_db(result: dict, db: "NotamDatabase"):
    """把单天查询结果写入 NotamDatabase，返回写入条数。"""
    codes = result.get("CODE", [])
    count = 0
    for i in range(len(codes)):
        record = {
            "CODE":        result["CODE"][i],
            "COORDINATES": result["COORDINATES"][i],
            "TIME":        result["TIME"][i],
            "PLATID":      result["TRANSID"][i],   # 字段名统一映射
            "RAWMESSAGE":  result["RAWMESSAGE"][i],
            "ALTITUDE":    result["ALTITUDE"][i],
        }
        db.save_notam(record)
        count += 1
    return count


# ----------------------------------------------------------------
def fetch_month(year: int, month: int) -> bool:
    """
    获取指定年月的全部航警并写入 DB。
    返回 True 表示全程无错误，False 表示有部分日期失败。
    """
    _, last_day = calendar.monthrange(year, month)
    date_list = iter_days(year, month)
    month_tag = f"{year}-{month:02d}"

    print(f"\n[月度归档] ======= 开始归档 {month_tag} =======")
    print(f"[月度归档] 目标范围: {date_list[0]} ~ {date_list[-1]}（每 3 天一次，共 {len(date_list)} 次请求）")
    print(f"[月度归档] 进度文件: {_PROGRESS_FILE}")
    print(f"[月度归档] 数据库  : {_DB_DIR}\n")

    db = NotamDatabase(_DB_DIR)
    total_saved = 0
    failed_dates = []

    for date_str in date_list:
        print(f"[月度归档] ─── {date_str} ───")
        try:
            result = FNS_NOTAM_ARCHIVE_SEARCH(
                icao="",
                date=date_str,
                mode=0,
                progress_filepath=_PROGRESS_FILE,
            )

            status = result.get("_status", "ok")

            if status == "already_done":
                print(f"[月度归档] {date_str} 已在进度记录中，跳过（数据已在 DB）。")

            elif status == "empty" or not result.get("CODE"):
                print(f"[月度归档] {date_str} 无符合条件的航警。")

            else:
                n = save_results_to_db(result, db)
                total_saved += n
                print(f"[月度归档] {date_str} 写入 {n} 条，累计 {total_saved} 条。")

        except Exception as exc:
            msg = f"[月度归档] {date_str} 抓取失败: {exc}"
            print(msg)
            failed_dates.append(date_str)
            time.sleep(10)          # 出错后等待更长时间

        # 日期之间的礼貌延迟（仅非最后一天）
        if date_str != date_list[-1]:
            time.sleep(2)

    db.close()

    print(f"\n[月度归档] ======= {month_tag} 归档结束 =======")
    print(f"[月度归档] 累计新增写入: {total_saved} 条")
    if failed_dates:
        print(f"[月度归档] 以下 {len(failed_dates)} 天抓取失败（可重新运行续跑）:")
        for d in failed_dates:
            print(f"  · {d}")
        return False

    print(f"[月度归档] 全部日期处理成功 ✓")
    return True


# ----------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="月度 NOTAM 归档：获取指定月份（默认上个月）的全部历史航警并写入 DB。"
    )
    parser.add_argument("--year",  type=int, default=None,
                        help="目标年份（如 2025），留空则自动取上个月")
    parser.add_argument("--month", type=int, default=None,
                        help="目标月份 1-12，留空则自动取上个月")
    args = parser.parse_args()

    if args.year is not None and args.month is not None:
        year, month = args.year, args.month
        print(f"[月度归档] 使用手动指定月份: {year}-{month:02d}")
    else:
        year, month = last_month_info()
        print(f"[月度归档] 自动检测到上个月: {year}-{month:02d}")

    success = fetch_month(year, month)
    sys.exit(0 if success else 1)

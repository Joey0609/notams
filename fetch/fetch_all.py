import os
import json
import time
from datetime import datetime, timedelta
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from dataBase import  *
# 导入获取历史航警的函数
from FNS_NOTAM_ARCHIVE_SEARCH import *
from classify_notam_db import rebuild_notam_db_classify

def batch_fetch_and_save(start_date, end_date, interval_days=3):
    """
    批量获取并保存NOTAM数据

    参数:
    start_date: 开始日期，格式 "YYYY-MM-DD"
    end_date: 结束日期，格式 "YYYY-MM-DD"
    """
    # 创建数据库实例
    db = NotamDatabase("./data/notam_db")

    # 生成日期范围
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    date_range = [start + timedelta(days=x) for x in range(0,(end - start).days + interval_days, interval_days)] # 每隔interval_days天获取一次数据

    print(f"计划获取 {len(date_range)} 天的数据，从 {start_date} 到 {end_date}")

    total_notams_saved = 0

    # 遍历每个日期
    for date in date_range:
        date_str = date.strftime("%Y-%m-%d")
        print(f"\n===== 正在获取 {date_str} 的数据 =====")

        try:
            # 获取当天所有区域的NOTAM数据
            result = FNS_NOTAM_ARCHIVE_SEARCH("", date_str, mode=0)

            # 处理"已完成"状态（progress.json 中已记录为全部成功）
            if result.get("_status") == "already_done":
                print(f"[跳过] {date_str} 已在进度记录中，无需重复保存")
                continue

            codes = result.get("CODE", [])
            print(f"[INFO] 成功获取 {date_str} 的 NOTAM 数据，共 {len(codes)} 条记录")
            # 转换并保存数据
            saved_count = 0
            for i in range(len(codes)):
                notam_record = {
                    "CODE": result["CODE"][i],
                    "COORDINATES": result["COORDINATES"][i],
                    "TIME": result["TIME"][i],
                    "PLATID": result["TRANSID"][i],  # 转换字段名
                    "RAWMESSAGE": result["RAWMESSAGE"][i],
                    "ALTITUDE": result["ALTITUDE"][i],
                }
                db.save_notam(notam_record)
                saved_count += 1

            print(f"[成功] {date_str} 保存 {saved_count} 条NOTAM数据")
            total_notams_saved += saved_count

            # 随机延迟，避免请求过于频繁
            if date != date_range[-1]:  # 不是最后一天
                delay = random.uniform(3, 6)
                print(f"[等待] 休息 {delay:.1f} 秒后继续...")
                time.sleep(delay)

        except Exception as e:
            print(f"[错误] {date_str} 获取或保存数据失败: {str(e)}")
            # 出错后等待更长时间
            time.sleep(10)

    # 关闭数据库，保存所有剩余数据
    db.close()

    # 打印统计信息
    stats = db.get_statistics()
    print("\n===== 任务完成 =====")
    print(f"总共保存 {total_notams_saved} 条NOTAM数据")
    print("数据库统计信息:")
    for month, count in stats["months"].items():
        print(f"  {month}: {count} 条记录")
    print(f"总计: {stats['total_notams']} 条记录")

    # 批量抓取结束后，统一重建 notam_db 的 classify（支持跨月分组）
    classify_stats = rebuild_notam_db_classify("./data/notam_db")
    print(
        f"[CLASSIFY] 已重建: files={classify_stats['files']}, "
        f"records={classify_stats['records']}, groups={classify_stats['groups']}"
    )

    return total_notams_saved


if __name__ == "__main__":
    # 设置日期范围（2023年1月1日到2023年1月5日）
    start_date = "2021-01-01"
    end_date = "2022-12-31"

    print("===== 开始批量获取历史航警数据 =====")
    print(f"日期范围: {start_date} 到 {end_date}")
    print("注意: 每次API请求后会有3-6秒的随机延迟，避免请求过于频繁")

    try:
        total_saved = batch_fetch_and_save(start_date, end_date, interval_days=10)
        print(f"\n===== 任务成功完成! 共保存 {total_saved} 条NOTAM数据 =====")
    except KeyboardInterrupt:
        print("\n[警告] 用户中断了程序执行")
        print("[提示] 已保存的数据不会丢失，下次运行会自动加载")
    except Exception as e:
        print(f"\n[错误] 程序执行过程中发生未预期的错误: {str(e)}")
        print("[提示] 已保存的数据可能需要手动检查完整性")
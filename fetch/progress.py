import json
import os
from datetime import datetime

def save_progress(date: str, success_list: list, failure_list: list, filepath: str = "./data/progress.json"):
    """
    将某日的 ICAO 处理结果（成功/失败列表）保存到 progress.json
    
    Args:
        date (str): 日期，格式如 "2024-06-01"
        success_list (list): 成功处理的 ICAO 代码列表
        failure_list (list): 失败处理的 ICAO 代码列表
        filepath (str): 存储文件路径，默认为 "progress.json"
    """
    # 构建记录
    record = {
        "date": date,
        "success_list": success_list,
        "failure_list": failure_list,
        "timestamp": datetime.now().isoformat()
    }

    # 读取现有数据（如果文件存在）
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except (json.JSONDecodeError, ValueError):
                data = {}
    else:
        data = {}

    # 更新或插入当天记录
    data[date] = record

    # 写回文件
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"[INFO] 已保存 {date} 的处理状态到 {filepath}")
def load_progress(date: str, filepath: str = "./data/progress.json"):
    """
    从 progress.json 中读取某日的成功与失败 ICAO 列表
    
    Args:
        date (str): 日期，格式如 "2024-06-01"
        filepath (str): 存储文件路径，默认为 "progress.json"
    
    Returns:
        tuple: (success_list, failure_list) 
               如果该日期无记录，返回 ([], [])
    """
    if not os.path.exists(filepath):
        return [], []
    
    with open(filepath, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except (json.JSONDecodeError, ValueError):
            return [], []
    
    record = data.get(date)
    if record:
        return record.get("success_list", []), record.get("failure_list", [])
    else:
        return [], []
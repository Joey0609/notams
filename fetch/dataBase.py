import os
import json
import re
from datetime import datetime
import threading


class NotamDatabase:
    def __init__(self, db_path="./data"):
        """
        初始化 NOTAM 数据库管理器

        参数:
        db_path: 数据库存储路径
        """
        self.db_path = db_path
        self.cache = {}  # 缓存格式: {"YYYY-MM": {数据结构}}
        self.call_count = 0
        self.save_threshold = 5
        self.lock = threading.Lock()  # 线程安全锁
        self._ensure_db_directory()
        self._load_existing_data()

    def _ensure_db_directory(self):
        """确保数据库目录存在"""
        if not os.path.exists(self.db_path):
            os.makedirs(self.db_path)
            print(f"[INFO] 创建数据库目录: {self.db_path}")

    def _extract_month_from_time(self, time_str):
        """
        从 TIME 字段提取年月信息

        参数:
        time_str: 时间字符串，格式类似 "15 MAR 12:00 2023 UNTIL 16 MAR 12:00 2023"

        返回:
        "YYYY-MM" 格式的字符串，例如 "2023-03"
        """
        try:
            # 尝试从字符串中提取年份和月份
            # 格式示例: "15 MAR 12:00 2023 UNTIL 16 MAR 12:00 2023"
            parts = time_str.split()
            if len(parts) >= 4:
                day = parts[0]
                month_abbr = parts[1]
                year = parts[3]

                # 转换月份缩写为数字
                month_map = {
                    "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04",
                    "MAY": "05", "JUN": "06", "JUL": "07", "AUG": "08",
                    "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12"
                }

                month = month_map.get(month_abbr.upper(), "01")
                return f"{year}-{month}"
        except Exception as e:
            print(f"[WARNING] 无法从时间字符串解析年月: {time_str}, 错误: {e}")

        # 默认返回当前年月
        now = datetime.now()
        return f"{now.year}-{now.month:02d}"

    def _load_existing_data(self):
        """从文件加载所有现有数据到缓存"""
        print("[INFO] 正在加载现有数据库...")
        files_loaded = 0

        if not os.path.exists(self.db_path):
            print("[INFO] 数据库目录不存在，将创建新数据库")
            return

        for filename in os.listdir(self.db_path):
            if filename.endswith('.json') and re.match(r'\d{4}-\d{2}\.json', filename):
                file_path = os.path.join(self.db_path, filename)
                month_key = filename[:-5]  # 移除 .json 后缀

                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        self.cache[month_key] = data
                        files_loaded += 1
                except Exception as e:
                    print(f"[ERROR] 加载文件 {filename} 时出错: {e}")

        print(f"[INFO] 已加载 {files_loaded} 个月份的数据到缓存")

    def _get_month_data(self, month_key):
        """获取或创建特定月份的数据结构"""
        if month_key not in self.cache:
            self.cache[month_key] = {
                "NUM": 0,
                "CODE": [],
                "COORDINATES": [],
                "TIME": [],
                "PLATID": [],
                "RAWMESSAGE": [],
                "ALTITUDE": []
            }
        return self.cache[month_key]

    def _sort_month_data(self, month_data):
        """按 CODE 字典序对月份数据进行排序"""
        if month_data["NUM"] <= 1:
            return month_data

        # 创建索引列表并按 CODE 排序
        indices = list(range(month_data["NUM"]))
        indices.sort(key=lambda i: str(month_data["CODE"][i]) if i < len(month_data["CODE"]) else "")

        # 重新排列所有数组
        sorted_data = {
            "NUM": month_data["NUM"],
            "CODE": [month_data["CODE"][i] for i in indices if i < len(month_data["CODE"])],
            "COORDINATES": [month_data["COORDINATES"][i] for i in indices if i < len(month_data["COORDINATES"])],
            "TIME": [month_data["TIME"][i] for i in indices if i < len(month_data["TIME"])],
            "PLATID": [month_data["PLATID"][i] for i in indices if i < len(month_data["PLATID"])],
            "RAWMESSAGE": [month_data["RAWMESSAGE"][i] for i in indices if i < len(month_data["RAWMESSAGE"])],
            "ALTITUDE": [month_data["ALTITUDE"][i] for i in indices if i < len(month_data["ALTITUDE"])]
        }

        return sorted_data

    def _save_month_data(self, month_key):
        """将特定月份的数据保存到文件"""
        if month_key not in self.cache:
            return

        month_data = self.cache[month_key]
        filename = f"{month_key}.json"
        file_path = os.path.join(self.db_path, filename)

        # 按 CODE 字典序排序
        sorted_data = self._sort_month_data(month_data)
        self.cache[month_key] = sorted_data

        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(sorted_data, f, ensure_ascii=False, indent=2)
            print(f"[INFO] 已保存 {month_key} 数据到 {file_path}，共 {sorted_data['NUM']} 条记录")
        except Exception as e:
            print(f"[ERROR] 保存文件 {filename} 时出错: {e}")

    def _flush_all_data(self):
        """将所有缓存数据写入文件"""
        print("[INFO] 正在将所有缓存数据写入文件...")
        for month_key in list(self.cache.keys()):
            self._save_month_data(month_key)
        print("[INFO] 所有数据已保存")

    def save_notam(self, notam_data):
        """
        保存单条 NOTAM 数据到数据库

        参数:
        notam_data: 包含 CODE, COORDINATES, TIME, PLATID, RAWMESSAGE, ALTITUDE 字段的字典
        """
        with self.lock:  # 确保线程安全
            # 验证输入数据
            required_fields = ["CODE", "COORDINATES", "TIME", "PLATID", "RAWMESSAGE", "ALTITUDE"]
            for field in required_fields:
                if field not in notam_data:
                    raise ValueError(f"NOTAM 数据缺少必需字段: {field}")

            # 提取月份
            month_key = self._extract_month_from_time(notam_data["TIME"])

            # 获取或创建月份数据
            month_data = self._get_month_data(month_key)
            # 检查是否已存在相同 CODE 的记录
            if notam_data["CODE"] in month_data["CODE"]:
                index = month_data["CODE"].index(notam_data["CODE"])
                # 更新现有记录
                month_data["COORDINATES"][index] = notam_data["COORDINATES"]
                month_data["TIME"][index] = notam_data["TIME"]
                month_data["PLATID"][index] = notam_data["PLATID"]
                month_data["RAWMESSAGE"][index] = notam_data["RAWMESSAGE"]
                month_data["ALTITUDE"][index] = notam_data["ALTITUDE"]
                print(f"[INFO] 已更新现有 NOTAM: {notam_data['CODE']} (月份: {month_key})")
            else:
                # 添加新记录
                month_data["CODE"].append(notam_data["CODE"])
                month_data["COORDINATES"].append(notam_data["COORDINATES"])
                month_data["TIME"].append(notam_data["TIME"])
                month_data["PLATID"].append(notam_data["PLATID"])
                month_data["RAWMESSAGE"].append(notam_data["RAWMESSAGE"])
                month_data["ALTITUDE"].append(notam_data["ALTITUDE"])
                month_data["NUM"] += 1
                print(f"[INFO] 已添加新 NOTAM: {notam_data['CODE']} (月份: {month_key})")

            # 更新计数器并检查是否需要保存
            self.call_count += 1
            if self.call_count >= self.save_threshold:
                print(f"[INFO] 达到保存阈值 ({self.save_threshold})，正在保存数据...")
                self._flush_all_data()
                self.call_count = 0

    def close(self):
        """关闭数据库，保存所有剩余数据"""
        print("[INFO] 关闭数据库，保存剩余数据...")
        self._flush_all_data()

    def get_statistics(self):
        """获取数据库统计信息"""
        total_notams = 0
        month_stats = {}

        for month_key, data in self.cache.items():
            count = data["NUM"]
            total_notams += count
            month_stats[month_key] = count

        return {
            "total_notams": total_notams,
            "months": month_stats,
            "files_in_directory": len([f for f in os.listdir(self.db_path) if f.endswith('.json')])
        }

    def backup_database(self, backup_dir="../data/backup"):
        """
        备份整个数据库

        参数:
        backup_dir: 备份目录路径
        """
        os.makedirs(backup_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(backup_dir, f"backup_{timestamp}")
        os.makedirs(backup_path, exist_ok=True)

        # 保存所有数据
        self._flush_all_data()

        # 复制所有文件
        files_copied = 0
        for filename in os.listdir(self.db_path):
            if filename.endswith('.json'):
                src = os.path.join(self.db_path, filename)
                dst = os.path.join(backup_path, filename)
                try:
                    with open(src, 'r', encoding='utf-8') as src_file:
                        content = src_file.read()
                    with open(dst, 'w', encoding='utf-8') as dst_file:
                        dst_file.write(content)
                    files_copied += 1
                except Exception as e:
                    print(f"[ERROR] 备份文件 {filename} 时出错: {e}")

        print(f"[INFO] 数据库备份完成，共备份 {files_copied} 个文件到 {backup_path}")
        return backup_path
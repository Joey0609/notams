import requests
import json
import datetime
import os
import sys

# === 配置 ===

URL = "https://counter.dev/dump?user=Starsky69&token=Beb6_vARt7c=&utcoffset=8"
OUTPUT_FILE = "visits.json"
SITE = "joey0609.github.io"
PAGE = "/notams/"

HEADERS = {
    "Accept": "text/event-stream",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://counter.dev/dashboard.html?user=Starsky69&token=Beb6_vARt7c=",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
}


def update_visits():
    today = datetime.date.today().isoformat()  # e.g. "2025-11-26"

    # 检查是否今天已更新
    # if os.path.exists(OUTPUT_FILE):
    #     try:
    #         with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
    #             existing = json.load(f)
    #             if existing.get("updated_at") == today:
    #                 print(f"✅ {OUTPUT_FILE} 已是今日最新，跳过更新。")
    #                 return
    #     except Exception:
    #         pass  # 文件损坏，重新生成

    print("[info] 正在获取最新访问数据...")
    try:
        with requests.get(URL, headers=HEADERS, stream=True, timeout=10) as r:
            r.raise_for_status()
            for line in r.iter_lines(decode_unicode=True):
                if (line.startswith(' ') and '"type":"dump"' in line) or (line.startswith('data: {"type":"dump"')):
                    data = json.loads(line[6:])
                    visits = (
                        data.get("payload", {})
                        .get("sites", {})
                        .get(SITE, {})
                        .get("visits", {})
                        .get("all", {})
                        .get("page", {})
                        .get(PAGE, 0)
                    )
                    result = {
                        "value": visits,
                        "updated_at": today
                    }
                    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                        json.dump(result, f, ensure_ascii=False, indent=2)
                    print(f"[ok] 成功更新 {OUTPUT_FILE}: 访问量={visits}, 日期={today}")
                    return

        raise RuntimeError("未找到有效的 dump 数据")

    except Exception as e:
        print(f"[error] 获取数据失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    update_visits()
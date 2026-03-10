# Copilot 指南 — Notams 项目（简明）

目的：帮助 AI 代理快速理解仓库结构、关键运行路径、数据流与项目特有约定，便于安全、可重复地修改代码或生成补丁。

快速概览
- 项目用途：从 FAA / 其它来源抓取 NOTAM，解析出“火箭发射/抛掷碎片危险区”（多边形坐标），并在前端以 Leaflet 可视化。
- 入口脚本：`main.py`（抓取 -> 生成 `data_dict.json` -> 与历史数据库匹配 -> 写入 `data/archiveMatch`）。

关键运行命令（本地开发）
- 安装依赖：`pip install -r requirements.txt`
- 单次抓取并生成数据：`python main.py`
- 批量历史抓取：`python fetch/fetch_all.py`（会写入 `data/notam_db/*.json`）

重要文件与职责（快速导航）
- `main.py`：程序主干，负责读取 `config.ini`、调用 FNS/dins 抓取函数、过滤（`EXCLUDE_RECTS`）、分类与写 `data_dict.json`。
- `fetch/FNS_NOTAM_SEARCH.py`：与 FAA(notams.aim.faa.gov) 交互的爬取与解析逻辑，包含坐标提取规则 `extract_coordinate_groups` 与时间格式化 `parse_time`。
- `fetch/FNS_NOTAM_ARCHIVE_SEARCH.py`、`fetch/fetch_all.py`：历史数据抓取/批处理工具，写入 `data/notam_db`。
- `fetch/dataBase.py`：按月分文件存储 NOTAM 的本地 DB 管理类 `NotamDatabase`，包含保存/排序/备份逻辑。
- `fetch/Archive_Notam_Match.py`：把当前抓取的 NOTAM 与 `data/notam_db` 中的历史记录匹配，输出 `data/archiveMatch/match*.json`。
- `data_dict.json`：主进程输出的数据结构（见“数据格式”）。

数据格式速查（`data_dict.json`）
- 顶层键：`CODE`, `COORDINATES`, `TIME`, `PLATID`/`TRANSID`, `RAWMESSAGE`, `ALTITUDE`, `CLASSIFY`, `HASH`, `NUM`。
- `COORDINATES`：以 `-` 分隔的标准化点串，点格式如 `N392852E0955438`（详见 `FNS_NOTAM_SEARCH.standardize_coordinate`）。
- `TIME`：字符串形如 `25 NOV 04:01 2025 UNTIL 25 NOV 04:41 2025`，许多算法依赖该格式进行时间重叠判定（见 `classify_data`）。

工程约定与注意点（对自动编辑很重要）
- 坐标处理：多个文件（`main.py` 与 `Archive_Notam_Match.py`）都实现了 `parse_point`、`point_in_poly` 等函数；修改坐标解析请同时更新两处。示例：`parse_point` 接受 `([NS])\d{4,6}([WE])\d{5,7}`。
- 过滤规则：`EXCLUDE_RECTS` 在 `main.py` 中定义（用于排除国内大范围非目标区域）。更改阈值会影响最终 `data_dict.json` 的数量与 HASH，可能触发大量 archive 匹配。
- 分类（grouping）：`classify_data` 使用时间窗口重叠 + 并查集合并；阈值随持续时长调整（短窗口/长窗口不同阈值）。自动化改动时请保留相同策略或逐项验证。 
- 日志捕获：主进程用 `PrintCapture` 将 stdout/stderr 写入内存 `LogCapture`，因此任意打印会被采集。不要移除该捕获，除非同时调整日志暴露端点。
- 外部依赖与网络：`FNS_NOTAM_SEARCH` 使用 `requests` 并对 FAA 接口做大量 POST 请求；任何改动都要注意请求速率与失败重试逻辑（`fetch_one_with_retry`）。

快速修改示例（常见任务）
- 增加新的 ICAO 源：在 `config.ini` 或 `main.py` 中更新 `ICAO` 列表；测试：`python main.py` -> 检查 `data_dict.json` 是否包含新 CODE。
- 调整坐标正则：同时修改 `FNS_NOTAM_SEARCH.standardize_coordinate` 与 `main.parse_point` / `Archive_Notam_Match.parse_point`，并运行一轮 `python main.py` 验证解析（检查若干 `RAWMESSAGE`）。

安全与合规提醒
- 仓库 README 明确标注“禁止外传项目与 URL”。任何自动化提交或公开共享前，请确保不含敏感或受限信息。

依赖与运行环境
- 主要依赖见 `requirements.txt`：`requests`, `numpy`, `pandas`, `beautifulsoup4`。
- 假定 Python 3.8+。Windows 下默认路径为仓库根目录。

如果你是 AI 代理：
- 优先检查：`main.py`、`fetch/FNS_NOTAM_SEARCH.py`、`fetch/dataBase.py`、`fetch/Archive_Notam_Match.py`。
- 小心修改：任何改变坐标解析、时间格式、或 `EXCLUDE_RECTS` 会放大回归影响；先在独立分支与小规模样本上运行 `python main.py` 验证输出。
- 在补丁中引用具体文件与行（如需要），并在 PR 描述中附上“本地验证步骤”和“受影响输出样本”。

---
如需我把某部分扩展为示例测试脚本或把 README 中的运行步骤写成 CI/任务，请说明要自动化的目标。

import colorsys
import io
import re
import json
import math
import os
from datetime import datetime, timedelta

import requests
from PIL import Image, ImageDraw
import html


MAIL_LAUNCH_SITES = [
    {'name': '酒泉卫星发射中心', 'lat': 40.96806, 'lon': 100.27806, 'icon': 'statics/launch.png'},
    {'name': '西昌卫星发射中心', 'lat': 28.24556, 'lon': 102.02667, 'icon': 'statics/launch.png'},
    {'name': '太原卫星发射中心', 'lat': 38.84861, 'lon': 111.60778, 'icon': 'statics/launch.png'},
    {'name': '文昌航天发射场', 'lat': 19.610379, 'lon': 110.954996, 'icon': 'statics/launch.png'},
    {'name': '海南商业航天发射场', 'lat': 19.592983, 'lon': 110.934836, 'icon': 'statics/launch.png'},
    {'name': '海阳东方航天港', 'lat': 36.688761, 'lon': 121.259377, 'icon': 'statics/launch1.png'},
]

# 与网页 scripts.js 保持一致的颜色池
COLOR_POOL_VECTOR = [
    '#a70000ff', '#1a2cd1', '#006d1bff', '#806800ff', '#6a009bff',
    '#548100ff', '#a74e00ff', '#313131', '#a0008bff', '#006b79ff'
]

COLOR_POOL_SATELLITE = [
    '#ff3b3b', '#00d9ff', '#00ff41', '#ffea00', '#c300ffff',
    '#7dff00', '#ff8c00', '#ffffff', '#ff1493', '#00ffff'
]


def parse_point(pt):
    import re

    m = re.match(r'([NS])(\d{4,6})([WE])(\d{5,7})', pt)
    if not m:
        return None
    ns, lat_s, ew, lon_s = m.group(1), m.group(2), m.group(3), m.group(4)
    if len(lat_s) == 6:
        deg = int(lat_s[:2]); minute = int(lat_s[2:4]); sec = int(lat_s[4:6])
    else:
        deg = int(lat_s[:2]); minute = int(lat_s[2:4]); sec = 0
    lat = deg + minute / 60.0 + sec / 3600.0
    if ns == 'S':
        lat = -lat
    if len(lon_s) == 7:
        deg = int(lon_s[:3]); minute = int(lon_s[3:5]); sec = int(lon_s[5:7])
    else:
        deg = int(lon_s[:3]); minute = int(lon_s[3:5]); sec = 0
    lon = deg + minute / 60.0 + sec / 3600.0
    if ew == 'W':
        lon = -lon
    return (lat, lon)


def _safe_get(data, key):
    value = data.get(key, []) if isinstance(data, dict) else []
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, list):
        return value
    return []


def _build_notam_map(data):
    codes = _safe_get(data, 'CODE')
    times = _safe_get(data, 'TIME')
    coords = _safe_get(data, 'COORDINATES')
    platids = _safe_get(data, 'PLATID')
    size = min(len(codes), len(times), len(coords), len(platids))

    records = {}
    for i in range(size):
        pid = str(platids[i])
        if not pid:
            continue
        records[pid] = {
            'index': i,
            'CODE': str(codes[i]),
            'TIME': str(times[i]),
            'COORDINATES': str(coords[i]),
            'PLATID': pid,
        }
    return records


def _format_match_summary(match_idx, top_n=5):
    match_path = os.path.join('data', 'archiveMatch', f'match{match_idx}.json')
    if not os.path.exists(match_path):
        return ['历史匹配结果未生成']

    try:
        with open(match_path, 'r', encoding='utf-8') as f:
            items = json.load(f)
    except Exception as exc:
        return [f'读取历史匹配失败: {exc}']

    if not isinstance(items, list) or not items:
        return ['无历史匹配结果']

    lines = []
    matched_items = items if top_n is None else items[:top_n]

    for item in matched_items:
        code = item.get('CODE', 'UNKNOWN')
        tm = item.get('TIME', 'UNKNOWN')
        overlap = item.get('Overlapping_Area', 0)
        dist = item.get('Center_Distance', -1)
        if isinstance(dist, (int, float)) and dist >= 0:
            metric = f'重叠 {overlap}% / 中心距离 {dist} km'
        else:
            metric = f'重叠 {overlap}%'
        # 尝试格式化时间为北京时间显示
        try:
            tm_fmt = convert_time(str(tm))
        except Exception:
            tm_fmt = str(tm)
        lines.append(f'{code}\n{tm_fmt}\n{metric}')
    return lines


def _collect_polygons(data):
    coords_list = _safe_get(data, 'COORDINATES')
    codes = _safe_get(data, 'CODE')
    polys = []

    for i, coords in enumerate(coords_list):
        pts = []
        for token in str(coords).split('-'):
            p = parse_point(token.strip())
            if p:
                pts.append(p)
        if len(pts) >= 3:
            code = codes[i] if i < len(codes) else f'NOTAM-{i}'
            polys.append((str(code), pts))

    return polys


def convert_time(utcTimeStr):
    """把类似 "25 NOV 04:01 2025 UNTIL 25 NOV 04:41 2025" 的 UTC 时间区间转换为北京时间显示。
    返回格式："2025年11月25日 12:01 ~ 2025年11月25日 12:41 北京时间 (UTC+8)"；解析失败则返回原始字符串或 '时间未知'。"""
    if not utcTimeStr:
        return '时间未知'
    s = str(utcTimeStr).strip()
    if s in ('null', 'undefined'):
        return '时间未知'

    regex = r"(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2}:\d{2})\s+(\d{4})\s+UNTIL\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2}:\d{2})\s+(\d{4})"
    m = re.search(regex, s)
    if not m:
        return s

    start_day, start_mon, start_time, start_year, end_day, end_mon, end_time, end_year = m.groups()

    month_map = {
        'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4,
        'MAY': 5, 'JUN': 6, 'JUL': 7, 'AUG': 8,
        'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
    }

    def to_local(d, mth, time_str, y):
        mnum = month_map.get(mth.upper())
        if not mnum:
            return None
        try:
            hour, minute = map(int, time_str.split(':'))
            dt = datetime(int(y), int(mnum), int(d), hour, minute)
            dt_local = dt + timedelta(hours=8)
            return dt_local
        except Exception:
            return None

    s_dt = to_local(start_day, start_mon, start_time, start_year)
    e_dt = to_local(end_day, end_mon, end_time, end_year)
    if not s_dt or not e_dt:
        return s

    return f"{s_dt.year}年{s_dt.month}月{s_dt.day}日 {s_dt.hour:02d}:{s_dt.minute:02d} ~ {e_dt.year}年{e_dt.month}月{e_dt.day}日 {e_dt.hour:02d}:{e_dt.minute:02d} 北京时间 (UTC+8)"


def _build_code_class_map(data):
    classify = data.get('CLASSIFY', {}) if isinstance(data, dict) else {}
    code_to_class = {}
    if isinstance(classify, dict):
        for class_key, codes in classify.items():
            if not isinstance(codes, list):
                continue
            for code in codes:
                code_to_class[str(code)] = str(class_key)
    return code_to_class


def _hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))


def _index_to_rgb(index):
    hue = (index * 0.618033988749895) % 1.0
    saturation = 0.72
    value = 0.92
    red, green, blue = colorsys.hsv_to_rgb(hue, saturation, value)
    return (int(red * 255), int(green * 255), int(blue * 255))


def _class_key_to_rgb(class_key):
    seed = sum((index + 1) * ord(ch) for index, ch in enumerate(str(class_key)))
    hue = (seed % 360) / 360.0
    saturation = 0.72
    value = 0.92
    red, green, blue = colorsys.hsv_to_rgb(hue, saturation, value)
    return (int(red * 255), int(green * 255), int(blue * 255))


def _build_group_color_map(data, provider='gaode_vec'):
    classify = data.get('CLASSIFY', {}) if isinstance(data, dict) else {}
    pool = COLOR_POOL_VECTOR if provider in ('gaode_vec', 'tianditu_vec') else COLOR_POOL_SATELLITE
    if not pool:
        return {}

    group_color_map = {}
    if isinstance(classify, dict) and classify:
        for idx, group_key in enumerate(classify.keys()):
            group_color_map[str(group_key)] = _hex_to_rgb(pool[idx % len(pool)])
    return group_color_map


def _lonlat_to_world_px(lat, lon, zoom):
    lat = max(min(lat, 85.05112878), -85.05112878)
    sin_lat = math.sin(math.radians(lat))
    scale = 256 * (2 ** zoom)
    x = (lon + 180.0) / 360.0 * scale
    y = (0.5 - math.log((1 + sin_lat) / (1 - sin_lat)) / (4 * math.pi)) * scale
    return x, y


def _world_px_to_lonlat(x, y, zoom):
    scale = 256 * (2 ** zoom)
    lon = x / scale * 360.0 - 180.0
    n = math.pi - 2.0 * math.pi * y / scale
    lat = math.degrees(math.atan(math.sinh(n)))
    return lat, lon


def _tile_url(x, y, z, provider='gaode_vec'):
    if provider == 'gaode_vec':
        server = x % 4 + 1
        return f'https://webrd0{server}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
    if provider == 'gaode_img':
        server = x % 4 + 1
        return f'https://webst0{server}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}'
    server = x % 4
    return f'http://t{server}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'


def _fetch_tile_image(url, session):
    response = session.get(url, timeout=15, headers={'User-Agent': 'Mozilla/5.0'})
    response.raise_for_status()
    return Image.open(io.BytesIO(response.content)).convert('RGBA')


def _render_tiles_map(
    polys,
    data,
    min_width=960,
    min_height=540,
    max_width=2200,
    max_height=1600,
    padding=100,
    provider='gaode_vec',
):
    if not polys:
        return None

    min_lat = min(pt[0] for _, poly in polys for pt in poly)
    max_lat = max(pt[0] for _, poly in polys for pt in poly)
    min_lon = min(pt[1] for _, poly in polys for pt in poly)
    max_lon = max(pt[1] for _, poly in polys for pt in poly)

    # 极小包围盒时补一点余量，避免后续尺寸过小
    if max_lat - min_lat < 1e-5:
        max_lat += 1e-4
        min_lat -= 1e-4
    if max_lon - min_lon < 1e-5:
        max_lon += 1e-4
        min_lon -= 1e-4

    center_lat = (min_lat + max_lat) / 2.0
    center_lon = (min_lon + max_lon) / 2.0

    # 按最大画布约束选缩放级别，确保所有落区可完整容纳
    chosen_zoom = 3
    span_x = 0.0
    span_y = 0.0
    for zoom in range(3, 14):
        x1, y1 = _lonlat_to_world_px(max_lat, min_lon, zoom)
        x2, y2 = _lonlat_to_world_px(min_lat, max_lon, zoom)
        cur_span_x = abs(x2 - x1)
        cur_span_y = abs(y2 - y1)
        if cur_span_x <= max_width - 2 * padding and cur_span_y <= max_height - 2 * padding:
            chosen_zoom = zoom
            span_x = cur_span_x
            span_y = cur_span_y
        else:
            break

    # 用包围盒跨度反推画布尺寸（不再固定宽高）
    width = int(math.ceil(max(min_width, min(max_width, span_x + 2 * padding))))
    height = int(math.ceil(max(min_height, min(max_height, span_y + 2 * padding))))

    center_x, center_y = _lonlat_to_world_px(center_lat, center_lon, chosen_zoom)
    half_w = width / 2.0
    half_h = height / 2.0
    min_world_x = center_x - half_w
    min_world_y = center_y - half_h
    max_world_x = center_x + half_w
    max_world_y = center_y + half_h

    tile_x_start = int(math.floor(min_world_x / 256.0))
    tile_y_start = int(math.floor(min_world_y / 256.0))
    tile_x_end = int(math.floor(max_world_x / 256.0))
    tile_y_end = int(math.floor(max_world_y / 256.0))

    canvas = Image.new('RGBA', (width, height), (255, 255, 255, 255))
    session = requests.Session()

    for tile_x in range(tile_x_start, tile_x_end + 1):
        for tile_y in range(tile_y_start, tile_y_end + 1):
            url = _tile_url(tile_x, tile_y, chosen_zoom, provider=provider)
            try:
                tile = _fetch_tile_image(url, session)
            except Exception:
                tile = Image.new('RGBA', (256, 256), (240, 240, 240, 255))

            offset_x = int(tile_x * 256 - min_world_x)
            offset_y = int(tile_y * 256 - min_world_y)
            canvas.alpha_composite(tile, (offset_x, offset_y))

    draw = ImageDraw.Draw(canvas, 'RGBA')

    def to_canvas_px(lat, lon):
        world_x, world_y = _lonlat_to_world_px(lat, lon, chosen_zoom)
        return world_x - min_world_x, world_y - min_world_y

    code_to_class = _build_code_class_map(data)
    polygon_groups = []
    for code, poly in polys:
        class_key = code_to_class.get(code, code)
        polygon_groups.append((class_key, code, poly))

    group_color_map = _build_group_color_map(data, provider=provider)
    fallback_rgb = _hex_to_rgb((COLOR_POOL_VECTOR if provider in ('gaode_vec', 'tianditu_vec') else COLOR_POOL_SATELLITE)[0])

    for group_key, code, poly in polygon_groups:
        color = group_color_map.get(group_key, fallback_rgb)
        points = [to_canvas_px(lat, lon) for lat, lon in poly]
        draw.polygon(points, fill=color + (250,), outline=color + (140,))
        draw.line(points + [points[0]], fill=color + (140,), width=1)

    # 叠加发射场图标（与网站主地图保持一致）
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icon_cache = {}

    def load_site_icon(icon_rel_path):
        if icon_rel_path in icon_cache:
            return icon_cache[icon_rel_path]
        abs_path = os.path.join(repo_root, icon_rel_path.replace('/', os.sep))
        try:
            icon_img = Image.open(abs_path).convert('RGBA').resize((22, 22), Image.Resampling.LANCZOS)
        except Exception:
            icon_img = None
        icon_cache[icon_rel_path] = icon_img
        return icon_img

    for site in MAIL_LAUNCH_SITES:
        px, py = to_canvas_px(site['lat'], site['lon'])
        if px < -20 or py < -20 or px > width + 20 or py > height + 20:
            continue
        site_icon = load_site_icon(site.get('icon', 'statics/launch.png'))
        if site_icon is None:
            continue

        # 与网页 Leaflet 设置一致：iconSize=[22,22], iconAnchor=[11,11]
        icon_x = int(round(px - 11))
        icon_y = int(round(py - 11))
        canvas.alpha_composite(site_icon, (icon_x, icon_y))

    output = io.BytesIO()
    canvas.save(output, format='PNG', optimize=True)
    return output.getvalue()


def generate_change_email_draft(previous_data, current_data, include_match=True, include_website=True):
    prev_map = _build_notam_map(previous_data or {})
    curr_map = _build_notam_map(current_data or {})

    added_ids = sorted(set(curr_map.keys()) - set(prev_map.keys()))
    removed_ids = sorted(set(prev_map.keys()) - set(curr_map.keys()))
    kept_ids = sorted(set(curr_map.keys()) & set(prev_map.keys()))

    polys = _collect_polygons(current_data or {})
    image_bytes = None
    if polys:
        image_bytes = _render_tiles_map(
            polys,
            current_data or {},
            padding=100,
            provider='gaode_vec',
        )

    lines = []

    def _time_of(item):
        try:
            return convert_time(item.get('TIME', ''))
        except Exception:
            return item.get('TIME', '')

    lines.append('新增航警：')
    if added_ids:
        for pid in added_ids:
            item = curr_map[pid]
            lines.append(f"- {item['CODE']}")
            lines.append(f"  航警时间: {_time_of(item)}")
            lines.append(f"  航警坐标: {item['COORDINATES']}")
            if include_match:
                lines.append(f"  历史匹配结果(链接): https://joey0609.github.io/notams/match.html?index={item['index']}")
                for match_line in _format_match_summary(item['index']):
                    lines.append(f'  - {match_line}')
    else:
        lines.append('- 无新增航警')

    lines.append('移除航警：')
    if removed_ids:
        for pid in removed_ids:
            item = prev_map[pid]
            lines.append(f"- {item['CODE']}")
            lines.append(f"  航警时间: {_time_of(item)}")
            lines.append(f"  航警坐标: {item['COORDINATES']}")
    else:
        lines.append('- 无移除航警')

    lines.append('保留航警：')
    if kept_ids:
        for pid in kept_ids:
            item = curr_map[pid]
            lines.append(f"- {item['CODE']}")
            lines.append(f"  航警时间: {_time_of(item)}")
            lines.append(f"  航警坐标: {item['COORDINATES']}")
            if include_match:
                lines.append(f"  历史匹配结果(链接): https://joey0609.github.io/notams/match.html?index={item['index']}")
                for match_line in _format_match_summary(item['index']):
                    lines.append(f'  - {match_line}')
    else:
        lines.append('- 无保留航警')

    body_text = '\n'.join(lines)

    def e(x):
        return html.escape(str(x))

    def nl2br(s):
        return e(s).replace('\n', '<br/>')

    def match_link(index_value):
        url = f'https://joey0609.github.io/notams/match.html?index={index_value}'
        return f'<a href="{url}" target="_blank" style="color:#1a73e8; text-decoration:none;">历史匹配结果</a>'

    def home_link():
        return '<a href="https://joey0609.github.io/notams/" target="_blank" style="color:#1a73e8; text-decoration:none;">【打开网站】</a>'

    body_html = '<html><body style="font-family: \"Microsoft YaHei\", Arial, sans-serif; color: #222;">'
    body_html += '<div style="line-height:1.6; font-size:14px;">'

    # 图片放在最前面
    if image_bytes:
        body_html += '<div style="margin: 2px 0 10px 0;"><img src="cid:notam_overview_x1" alt="NOTAM落区总览图" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;"/></div>'

    if include_website:
        body_html += '<div style="margin: 4px 0 8px 0;">' + home_link() + '</div>'

    body_html += '<div style="font-weight:700; font-size:1.08em; margin:6px 0;">新增航警：</div>'
    if added_ids:
        body_html += '<ul style="margin:0 0 6px 8px; padding-left:10px;">'
        for pid in added_ids:
            item = curr_map[pid]
            code_html = f'<strong>{e(item["CODE"])}</strong>'
            tmp_link = match_link(item['index']) if include_match else ''
            body_html += f'<li>{code_html}<div style="margin-left:6px;">时间: {e(_time_of(item))}<br/>坐标: {e(item["COORDINATES"])}<br/>{tmp_link}</div>'
            if include_match:
                body_html += '<ul style="margin:2px 0 4px 6px; padding-left:10px;">'
                for match_line in _format_match_summary(item['index']):
                    body_html += f'<li>{nl2br(match_line)}</li>'
                body_html += '</ul>'
            body_html += '</li>'
        body_html += '</ul>'
    else:
        body_html += '<div style="margin-left:8px;">- 无新增航警</div>'

    body_html += '<div style="font-weight:700; font-size:1.08em; margin:6px 0;">移除航警：</div>'
    if removed_ids:
        body_html += '<ul style="margin:0 0 6px 8px; padding-left:10px;">'
        for pid in removed_ids:
            item = prev_map[pid]
            body_html += f'<li><strong>{e(item["CODE"])}</strong><div style="margin-left:6px;">时间: {e(_time_of(item))}<br/>坐标: {e(item["COORDINATES"])}</div></li>'
        body_html += '</ul>'
    else:
        body_html += '<div style="margin-left:8px;">- 无移除航警</div>'

    body_html += '<div style="font-weight:700; font-size:1.08em; margin:6px 0;">保留航警：</div>'
    if kept_ids:
        body_html += '<ul style="margin:0 0 6px 8px; padding-left:10px;">'
        for pid in kept_ids:
            item = curr_map[pid]
            code_html = f'<strong>{e(item["CODE"])}</strong>'
            tmp_link = match_link(item['index']) if include_match else ''
            body_html += f'<li>{code_html}<div style="margin-left:6px;">时间: {e(_time_of(item))}<br/>坐标: {e(item["COORDINATES"])}<br/>{tmp_link}</div>'
            if include_match:
                body_html += '<ul style="margin:2px 0 4px 6px; padding-left:10px;">'
                for match_line in _format_match_summary(item['index']):
                    body_html += f'<li>{nl2br(match_line)}</li>'
                body_html += '</ul>'
            body_html += '</li>'
        body_html += '</ul>'
    else:
        body_html += '<div style="margin-left:8px;">- 无保留航警</div>'

    body_html += '</div></body></html>'
    payload = {
        'subject': f"[NOTAM] 航警变化通知",
        'body_text': body_text,
        'body_html': body_html,
        'added_count': len(added_ids),
        'removed_count': len(removed_ids),
        'attachments': [],
        'inline_images': [
            {
                'cid': 'notam_overview_x1',
                'filename': 'notam_overview_x1.png',
                'data': image_bytes,
            }
        ] if image_bytes else [],
    }

    print('已生成邮件内容（内存模式，不落盘）')
    if image_bytes:
        print('已生成落区总览图并内嵌到邮件正文')

    return payload
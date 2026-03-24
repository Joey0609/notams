import os
import json
import math
import re
from math import radians, cos, sin, asin, sqrt
from datetime import datetime

def parse_point(pt):
    m = re.match(r'([NS])(\d{4,6})([WE])(\d{5,7})', pt)
    if not m:
        return None
    ns, lat_s, ew, lon_s = m.group(1), m.group(2), m.group(3), m.group(4)
    if len(lat_s) == 6:
        deg = int(lat_s[:2]); minute = int(lat_s[2:4]); sec = int(lat_s[4:6])
    else:
        deg = int(lat_s[:2]); minute = int(lat_s[2:4]); sec = 0
    lat = deg + minute/60.0 + sec/3600.0
    if ns == 'S':
        lat = -lat
    if len(lon_s) == 7:
        deg = int(lon_s[:3]); minute = int(lon_s[3:5]); sec = int(lon_s[5:7])
    else:
        deg = int(lon_s[:3]); minute = int(lon_s[3:5]); sec = 0
    lon = deg + minute/60.0 + sec/3600.0
    if ew == 'W':
        lon = -lon
    return (lat, lon)

def point_in_rect(pt, rect):
    lat, lon = pt
    return rect['lat_min'] <= lat <= rect['lat_max'] and rect['lon_min'] <= lon <= rect['lon_max']

def point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i][0], poly[i][1]
        xj, yj = poly[j][0], poly[j][1]
        intersect = ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-16) + xi)
        if intersect:
            inside = not inside
        j = i
    return inside

def seg_intersect(a, b, c, d):
    def orient(p, q, r):
        return (q[0]-p[0])*(r[1]-p[1]) - (q[1]-p[1])*(r[0]-p[0])
    def on_seg(p,q,r):
        return min(p[0], r[0]) <= q[0] <= max(p[0], r[0]) and min(p[1], r[1]) <= q[1] <= max(p[1], r[1])
    o1 = orient(a,b,c); o2 = orient(a,b,d); o3 = orient(c,d,a); o4 = orient(c,d,b)
    if o1*o2 < 0 and o3*o4 < 0:
        return True
    if o1 == 0 and on_seg(a,c,b): return True
    if o2 == 0 and on_seg(a,d,b): return True
    if o3 == 0 and on_seg(c,a,d): return True
    if o4 == 0 and on_seg(c,b,d): return True
    return False

# Haversine公式计算两点间大圆距离（单位：公里）
def haversine(lon1, lat1, lon2, lat2):
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees)
    """
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371  # 地球平均半径，单位公里
    return c * r

# 匹配两条航警
def match_two_notams(notam1, notam2):
    """
    匹配两条航警
    :param notam1: 当前航警字典 (dataDict中的航警)
    :param notam2: 历史航警字典
    :return: (overlap_ratio, center_distance)
        overlap_ratio: 重叠面积比例 (0~1)，无重叠时为0
        center_distance: 中心点距离(公里)，当overlap_ratio>0时为-1
    """
    # 获取点列表 (纬度, 经度)
    poly1_orig = notam1.get('points', [])  # 当前航警的点列表
    poly2_orig = notam2.get('points', [])  # 历史航警的点列表
    
    if len(poly1_orig) < 3 or len(poly2_orig) < 3:
        return 0.0, 1000.0  # 无效多边形，不匹配
    
    # 1. 计算AABB (Axis-Aligned Bounding Box)
    lats1 = [p[0] for p in poly1_orig]
    lons1 = [p[1] for p in poly1_orig]
    aabb1 = {
        'lat_min': min(lats1), 'lat_max': max(lats1),
        'lon_min': min(lons1), 'lon_max': max(lons1)
    }
    
    lats2 = [p[0] for p in poly2_orig]
    lons2 = [p[1] for p in poly2_orig]
    aabb2 = {
        'lat_min': min(lats2), 'lat_max': max(lats2),
        'lon_min': min(lons2), 'lon_max': max(lons2)
    }
    
    # 计算AABB交集
    lat_min = max(aabb1['lat_min'], aabb2['lat_min'])
    lat_max = min(aabb1['lat_max'], aabb2['lat_max'])
    lon_min = max(aabb1['lon_min'], aabb2['lon_min'])
    lon_max = min(aabb1['lon_max'], aabb2['lon_max'])
    
    # 检查AABB是否相交
    if lat_min >= lat_max or lon_min >= lon_max:
        overlap_ratio = 0.0
    else:
        # 2. 检查多边形是否实际相交
        intersect = False
        
        # 检查notam1的点是否在notam2多边形内
        for p in poly1_orig:
            x, y = p[1], p[0]  # 转换为(x=经度, y=纬度)
            if point_in_poly(x, y, [(pt[1], pt[0]) for pt in poly2_orig]):  # 转换为(x,y)格式
                intersect = True
                break
        
        # 检查notam2的点是否在notam1多边形内
        if not intersect:
            for p in poly2_orig:
                x, y = p[1], p[0]
                if point_in_poly(x, y, [(pt[1], pt[0]) for pt in poly1_orig]):
                    intersect = True
                    break
        
        # 检查边是否相交
        if not intersect:
            n1 = len(poly1_orig)
            n2 = len(poly2_orig)
            for i in range(n1):
                a_orig = poly1_orig[i]
                b_orig = poly1_orig[(i + 1) % n1]
                a = (a_orig[1], a_orig[0])  # (经度, 纬度)
                b = (b_orig[1], b_orig[0])
                
                for j in range(n2):
                    c_orig = poly2_orig[j]
                    d_orig = poly2_orig[(j + 1) % n2]
                    c = (c_orig[1], c_orig[0])
                    d = (d_orig[1], d_orig[0])
                    
                    if seg_intersect(a, b, c, d):
                        intersect = True
                        break
                if intersect:
                    break
        
        # 3. 计算重叠比例
        if intersect:
            # 计算AABB交集面积
            area_intersection = (lat_max - lat_min) * (lon_max - lon_min)
            # 计算两个AABB的面积
            area_aabb1 = (aabb1['lat_max'] - aabb1['lat_min']) * (aabb1['lon_max'] - aabb1['lon_min'])
            area_aabb2 = (aabb2['lat_max'] - aabb2['lat_min']) * (aabb2['lon_max'] - aabb2['lon_min'])
            
            # 计算交集占各自AABB的比例
            ratio1 = area_intersection / area_aabb1 if area_aabb1 > 0 else 0
            ratio2 = area_intersection / area_aabb2 if area_aabb2 > 0 else 0
            
            # 取最小值作为重叠比例
            overlap_ratio = min(ratio1, ratio2)
        else:
            overlap_ratio = 0.0
    
    # 4. 处理结果
    if overlap_ratio > 0:
        return overlap_ratio, -1.0  # 有重叠，距离设为-1
    
    # 无重叠，计算中心点距离
    center1_lat = sum(lats1) / len(lats1)
    center1_lon = sum(lons1) / len(lons1)
    center2_lat = sum(lats2) / len(lats2)
    center2_lon = sum(lons2) / len(lons2)
    
    center_distance = haversine(center1_lon, center1_lat, center2_lon, center2_lat)
    return 0.0, center_distance

def notam_match_archive(dataDict):
    """
    将dataDict中的航警与历史航警数据库匹配
    :param dataDict: 当前获取的航警数据字典
    """
    # 1. 创建输出目录（已有就清空）
    archive_match_dir = 'data/archiveMatch'
    if os.path.exists(archive_match_dir):
        for filename in os.listdir(archive_match_dir):
            file_path = os.path.join(archive_match_dir, filename)
            if os.path.isfile(file_path):
                os.remove(file_path)
    else:
        os.makedirs(archive_match_dir, exist_ok=True)
    
    # 2. 收集所有历史航警
    notam_db_dir = 'data/notam_db'
    history_notams = []
    
    if os.path.exists(notam_db_dir):
        for filename in os.listdir(notam_db_dir):
            if filename.endswith('.json'):
                filepath = os.path.join(notam_db_dir, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        db_data = json.load(f)
                        for i in range(db_data.get('NUM', 0)):
                            notam = {
                                "CODE": db_data['CODE'][i],
                                "COORDINATES": db_data['COORDINATES'][i],
                                "TIME": db_data['TIME'][i],
                                "PLATID": db_data['PLATID'][i],
                                "RAWMESSAGE": db_data['RAWMESSAGE'][i],
                                "ALTITUDE": db_data['ALTITUDE'][i] if 'ALTITUDE' in db_data and i < len(db_data['ALTITUDE']) else 'None',
                                "source_file": filename
                            }
                            # 解析坐标点
                            coords_str = notam['COORDINATES']
                            pts = []
                            for part in coords_str.split('-'):
                                p = parse_point(part.strip())
                                if p:
                                    pts.append(p)
                            if len(pts) >= 3:  # 有效多边形至少3个点
                                notam['points'] = pts
                                history_notams.append(notam)
                except Exception as e:
                    print(f"读取历史文件 {filename} 时出错: {str(e)}")
    
    print(f"共加载 {len(history_notams)} 条历史航警")
    # 2.1 构建当前航警分类索引，用于给每条匹配项补充“同类子项”
    current_classify = dataDict.get('CLASSIFY', {}) if isinstance(dataDict, dict) else {}
    code_to_current_group = {}
    if isinstance(current_classify, dict):
        for group_key, codes in current_classify.items():
            if isinstance(codes, list):
                for code in codes:
                    code_to_current_group[str(code)] = str(group_key)

    current_group_index = {}
    for i in range(dataDict.get('NUM', 0)):
        code = str(dataDict['CODE'][i])
        group_key = code_to_current_group.get(code)
        if not group_key:
            continue
        current_group_index.setdefault(group_key, []).append(i)
    
    # 3. 为当前dataDict中的每条航警生成匹配文件
    for idx in range(dataDict['NUM']):
        current_notam = {
            "CODE": dataDict['CODE'][idx],
            "COORDINATES": dataDict['COORDINATES'][idx],
            "TIME": dataDict['TIME'][idx],
            "PLATID": dataDict['PLATID'][idx],
            "RAWMESSAGE": dataDict['RAWMESSAGE'][idx],
            "ALTITUDE": dataDict['ALTITUDE'][idx]
        }
        
        # 解析当前航警的坐标点
        pts = []
        for part in current_notam['COORDINATES'].split('-'):
            p = parse_point(part.strip())
            if p:
                pts.append(p)
        current_notam['points'] = pts
        
        if len(pts) < 3:
            print(f"警告: 航警 {current_notam['CODE']} 坐标点不足3个，跳过匹配")
            continue
        
        # 4. 匹配历史航警
        matches = []
        for hist in history_notams:
            overlap_ratio, center_distance = match_two_notams(current_notam, hist)
            
            # 检查是否匹配
            if overlap_ratio > 0 or (overlap_ratio == 0 and 0 < center_distance < 250):
                # 创建历史航警副本并添加匹配字段
                match_item = hist.copy()
                match_item['Overlapping_Area'] = round(overlap_ratio * 100, 1)  # 转换为百分比
                match_item['Center_Distance'] = round(center_distance, 1) if overlap_ratio == 0 else -1.0

                # 为当前匹配项补充“同类子项”（来自当前 dataDict，而不是把它们添加到主列表）
                related_items = []
                current_group_key = code_to_current_group.get(str(current_notam['CODE']))
                if current_group_key and current_group_key in current_group_index:
                    for rel_idx in current_group_index[current_group_key]:
                        if rel_idx == idx:
                            continue
                        related_items.append({
                            'CODE': dataDict['CODE'][rel_idx],
                            'COORDINATES': dataDict['COORDINATES'][rel_idx],
                            'TIME': dataDict['TIME'][rel_idx],
                            'PLATID': dataDict['PLATID'][rel_idx],
                            'RAWMESSAGE': dataDict['RAWMESSAGE'][rel_idx],
                            'ALTITUDE': dataDict['ALTITUDE'][rel_idx] if 'ALTITUDE' in dataDict and rel_idx < len(dataDict['ALTITUDE']) else 'None',
                            'source_file': 'current_dict',
                            'GroupKey': current_group_key,
                            'IsSameGroup': True,
                            'parent_index': idx,
                        })

                match_item['RelatedItems'] = related_items
                
                # 添加匹配信息
                matches.append({
                    'item': match_item,
                    'overlap_ratio': overlap_ratio,
                    'center_distance': center_distance
                })
        
        # 5. 排序匹配结果
        # 优先级: 1. 重叠面积比例(降序) 2. 中心距离(升序)
        matches.sort(key=lambda x: (-x['overlap_ratio'], x['center_distance']))
        
        # 提取排序后的匹配项
        match_list = [item['item'] for item in matches]
        
        # 6. 保存匹配结果
        output_file = os.path.join(archive_match_dir, f'match{idx}.json')
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(match_list, f, ensure_ascii=False, indent=4)
        
        print(f"为航警 {current_notam['CODE']} 生成 {len(match_list)} 个匹配项 -> {output_file}")
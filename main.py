import os
import numpy as np
import pandas as pd
import configparser
from fetch.dinsQueryWeb import dinsQueryWeb
from fetch.FNS_NOTAM_SEARCH import FNS_NOTAM_SEARCH
import json
import re

dins = False
FNSs = True

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

EXCLUDE_RECTS = [
    {'lat_min': 39.303183, 'lat_max': 40.856476, 'lon_min': 101.300003, 'lon_max': 105.242712},
    {'lat_min': 36.263957, 'lat_max': 45.841384, 'lon_min': 73.570446,  'lon_max': 90.944820},
]


def load_config():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    config_file = os.path.join(current_dir, 'config.ini')
    config = configparser.ConfigParser()
    if not os.path.exists(config_file):
        config['ICAO'] = {
            'codes': 'ZBPE ZGZU ZHWH ZJSA ZLHW ZPKM ZSHA ZWUQ ZYSH VVTS WSJC WIIF YMMM WMFC RPHI AYPM AGGG ANAU NFFF KZAK VYYF VCCF VOMF WAAF RJJJ RCAA YBBB VVGL VVHN VVHM RCSP VVHM WIIF ',
        }     
        with open(config_file, 'w', encoding='utf-8') as f:
            f.write('# FIR/ICAO配置，填写你需要获取的航警所在的飞行情报区（FIR）代码或机场ICAO代码\n')
            config.write(f)
    config.read(config_file, encoding='utf-8')
    return config

config = load_config()
ICAO_CODES = config.get('ICAO', 'codes', fallback='ZBPE ZGZU ZHWH ZJSA ZLHW ZPKM ZSHA ZWUQ ZYSH VVTS WSJC WIIF YMMM WMFC RPHI AYPM AGGG ANAU NFFF KZAK VYYF VCCF VOMF WAAF RJJJ RCAA YBBB VVGL VVHN VVHM RCSP VVHM WIIF')


try:
    current_config = load_config()
    current_icao_codes = current_config.get('ICAO', 'codes', fallback=ICAO_CODES)
except Exception as e:
    current_icao_codes = ICAO_CODES

dataDict = {
    "CODE": [],
    "COORDINATES": [],
    "TIME": [],
    "NUM": 0,
}
source_num = 0

if dins:
    dins_data = dinsQueryWeb(current_icao_codes)
    if dins_data.get("CODE"):
        source_num += 1
        # dataDict["CODE"].extend(dins_data["CODE"])
        # dataDict["COORDINATES"].extend(dins_data["COORDINATES"])
        # dataDict["TIME"].extend(dins_data["TIME"])
        # print(f"爬取来源{source_num}: dinsQueryWeb, 获取 {len(dins_data['CODE'])} 条航警")
        fns_code = []
        fns_coord = []
        fns_time = []

        for code, coords_str, t in zip(FNS_data['CODE'], FNS_data['COORDINATES'], FNS_data['TIME']):
            pts = []
            for part in coords_str.split('-'):
                p = parse_point(part.strip())
                if p:
                    pts.append(p)
            excluded = False
            for rect in EXCLUDE_RECTS:
                #1检查落区顶点是否在矩形内
                if any(point_in_rect(p, rect) for p in pts):
                    excluded = True
                    break
                #2检查矩形顶点是否在落区内
                corners = [(rect['lat_min'], rect['lon_min']), (rect['lat_min'], rect['lon_max']),
                            (rect['lat_max'], rect['lon_min']), (rect['lat_max'], rect['lon_max'])]
                if any(point_in_poly(c[0], c[1], pts) for c in corners):
                    excluded = True
                    break
                #3检查边是否相交
                rect_edges = [
                    ((rect['lat_min'], rect['lon_min']), (rect['lat_min'], rect['lon_max'])),
                    ((rect['lat_min'], rect['lon_max']), (rect['lat_max'], rect['lon_max'])),
                    ((rect['lat_max'], rect['lon_max']), (rect['lat_max'], rect['lon_min'])),
                    ((rect['lat_max'], rect['lon_min']), (rect['lat_min'], rect['lon_min'])),
                ]
                found_intersect = False
                for i in range(len(pts)):
                    a = pts[i]; b = pts[(i+1)%len(pts)]
                    for edge in rect_edges:
                        if seg_intersect(a, b, edge[0], edge[1]):
                            excluded = True
                            found_intersect = True
                            break
                    if found_intersect:
                        break
                if excluded:
                    break
                        
            if not excluded:
                fns_code.append(code)
                fns_coord.append(coords_str)
                fns_time.append(t)

        if fns_code:
            dataDict["CODE"].extend(fns_code)
            dataDict["COORDINATES"].extend(fns_coord)
            dataDict["TIME"].extend(fns_time)
        print(f"爬取来源{source_num}: FNS_NOTAM_SEARCH, 获取 {len(fns_code)} 条航警")

if FNSs:
    FNS_data = FNS_NOTAM_SEARCH()
    if FNS_data.get("CODE"):
        source_num += 1
        dataDict["CODE"].extend(FNS_data["CODE"])
        dataDict["COORDINATES"].extend(FNS_data["COORDINATES"])
        dataDict["TIME"].extend(FNS_data["TIME"])
        print(f"爬取来源{source_num}: FNS_NOTAM_SEARCH, 获取 {len(FNS_data['CODE'])} 条航警")
sorted_data = sorted(zip(dataDict["CODE"], dataDict["COORDINATES"], dataDict["TIME"]), key=lambda x: x[0])
dataDict["CODE"], dataDict["COORDINATES"], dataDict["TIME"] = zip(*sorted_data)
dataDict["NUM"] = len(dataDict["CODE"])

print(dataDict)
with open('data_dict.json', 'w', encoding='utf-8') as json_file:
    json.dump(dataDict, json_file, ensure_ascii=False, indent=4)

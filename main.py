import os
import numpy as np
import pandas as pd
import configparser
from dinsQueryWeb import dinsQueryWeb
from fetch.FNS_NOTAM_SEARCH import FNS_NOTAM_SEARCH
import json

dins = False
FNSs = True

def load_config():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    config_file = os.path.join(current_dir, 'config.ini')
    config = configparser.ConfigParser()
    if not os.path.exists(config_file):
        config['ICAO'] = {
            'codes': 'ZBPE ZGZU ZHWH ZJSA ZLHW ZPKM ZSHA ZWUQ ZYSH VVTS WSJC WIIF YMMM WMFC RPHI AYPM AGGG ANAU NFFF KZAK VYYF VCCF VOMF WAAF RJJJ RCAA YBBB VVGL VVHN VVHM RCSP VVHM WIIF ',
        }
        config['SERVER'] = {
            'host': '127.0.0.1',
            'port': '5000',
            'auto_open_browser': 'true'
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
        dataDict["CODE"].extend(dins_data["CODE"])
        dataDict["COORDINATES"].extend(dins_data["COORDINATES"])
        dataDict["TIME"].extend(dins_data["TIME"])
        print(f"爬取来源{source_num}: dinsQueryWeb, 获取 {len(dins_data['CODE'])} 条航警")

if FNSs:
    FNS_data = FNS_NOTAM_SEARCH()
    if FNS_data.get("CODE"):
        source_num += 1
        dataDict["CODE"].extend(FNS_data["CODE"])
        dataDict["COORDINATES"].extend(FNS_data["COORDINATES"])
        dataDict["TIME"].extend(FNS_data["TIME"])
        print(f"爬取来源{source_num}: FNS_NOTAM_SEARCH, 获取 {len(FNS_data['CODE'])} 条航警")

dataDict["NUM"] = len(dataDict["CODE"])

print(dataDict)
with open('data_dict.json', 'w', encoding='utf-8') as json_file:
    json.dump(dataDict, json_file, ensure_ascii=False, indent=4)

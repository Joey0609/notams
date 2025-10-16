import os
import webbrowser
import numpy as np
import pandas as pd
from flask import Flask, render_template, jsonify, send_from_directory
import configparser
from fetch.dinsQueryWeb import dinsQueryWeb
from fetch.FNS_NOTAM_SEARCH import FNS_NOTAM_SEARCH

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
HOST = config.get('SERVER', 'host', fallback='127.0.0.1')
PORT = config.getint('SERVER', 'port', fallback=5000)
AUTO_OPEN = config.getboolean('SERVER', 'auto_open_browser', fallback=True)

if AUTO_OPEN:
    webbrowser.open(f"http://{HOST}:{PORT}")

print(f"使用时请不要关闭控制台，在浏览器中访问http://{HOST}:{PORT}以开始使用")
# print(f"当前使用的ICAO码: {ICAO_CODES}")

app = Flask(__name__)
app.template_folder = '.'
app.static_folder = 'static'

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/statics/<path:filename>')
def load_stat(filename):
    return send_from_directory(app.static_folder, filename)

@app.route('/scripts/<path:filename>')
def load_scripts(filename):
    return send_from_directory('scripts', filename)

@app.route('/config')
def get_config():
    """获取当前配置信息的API端点"""
    return jsonify({
        'icao_codes': ICAO_CODES,
        'server': {
            'host': HOST,
            'port': PORT
        }
    })

@app.route('/fetch')
def fetch():
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
    print(f"使用时请不要关闭控制台，在浏览器中访问http://{HOST}:{PORT}以开始使用")
    return jsonify(dataDict)
if __name__ == '__main__':
    app.run(host=HOST, port=PORT)
import requests
from bs4 import BeautifulSoup
import re
import os
import webbrowser
import numpy as np
import pandas as pd
from flask import Flask, render_template, jsonify, send_from_directory
webbrowser.open("http://127.0.0.1:5000")
print("使用时请不要关闭控制台，在浏览器中访问http://127.0.0.1:5000以开始使用")
app=Flask(__name__)
app.template_folder = 'templates'
app.static_folder = 'static'
@app.route('/')
def index():
    return render_template('index.html')
@app.route('/statics/<path:filename>')
def load_stat(filename):
    return send_from_directory(app.static_folder, filename)
@app.route('/scripts/<path:filename>')
def load_scripts(filename):
    return send_from_directory('scripts',filename) 
@app.route('/fetch')
def fetch():
    data1=np.array(["CODE","COORDINATES","TIME"])

    current_dir = os.path.dirname(os.path.abspath(__file__))

    def removeC(text):
        return re.sub(r'[\r\n\[\]...]+', ' ', text)
    def removeC2(text):
        return re.sub(r'[\s+\r\n\[\]...]+', '', text)
    form_url = "https://www.notams.faa.gov/dinsQueryWeb/queryRetrievalMapAction.do" 
    headers = {
        "authority": "www.notams.faa.gov",
    # "method": "POST",
    # "path": "/dinsQueryWeb/queryRetrievalMapAction.do",
    # "scheme": "https",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,ko;q=0.7",
        "cache-control": "max-age=0",
    # "content-length": "136",
        "content-type": "application/x-www-form-urlencoded",
        "origin": "https://www.notams.faa.gov",
        "priority": "u=0, i",
        "referer": "https://www.notams.faa.gov/dinsQueryWeb/",
        "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }
    data = {
        "retrieveLocId": "ZBPE ZGZU ZHWH ZJSA ZLHW ZPKM ZSHA ZWUQ ZYSH RPHI VVHM WSJC RPHI VVHM WSJC YMMM WIIF RJJJ", 
        "reportType": "Report", 
        "actionType": "notamRetrievalByICAOs",
    }
    
    data2 = {
        "retrieveLocId": "RPHI VVHM WSJC YMMM WIIF RJJJ", 
        "reportType": "Report",     
        "actionType": "notamRetrievalByICAOs",
    }

    response = requests.post(form_url, headers=headers, data=data)
    response.raise_for_status() 
    #print(response.text)

    html_file = "submitted_page.html"
    file_path = os.path.join(current_dir, html_file)
    with open(file_path, 'w', encoding='utf-8') as file:
        file.write(response.text)

    #webbrowser.open(html_file)
    with open(file_path, 'r', encoding='utf-8') as file:
        html_content = file.read()
    soup = BeautifulSoup(html_content, 'html.parser')
    td_elements = soup.find_all('td', class_='textBlack12', valign='top')
    for td in td_elements:
        pre_tag = td.find('pre') 
        if pre_tag:
            text_content = pre_tag.get_text(strip=True) 
            text_content = removeC(text_content)
            textCforCoor = removeC2(text_content)
            #print(text_content)
            if "A TEMPORARY" in text_content or "AEROSPACE" in text_content:
                # print(text_content)
                coordinates_pattern = r"N\d{4,6}E\d{5,7}(?:-N\d{4,6}E\d{5,7})*"
                coordinates = re.search(coordinates_pattern, textCforCoor)
                fuck="N000000E0000000"
                if not coordinates:
                    subPattern = r'(\d{6}N\d{7}E)'
                    tmp = re.findall(subPattern, textCforCoor, flags=re.DOTALL)
                    if tmp and len(tmp)>2:
                        # print(tmp)
                        fuck = '-'.join(f"N{m[:6]}E{m[7:-1]}" for m in tmp)
                if not coordinates and fuck == "N000000E0000000":
                    subPattern = r'(\d{4}N\d{5}E)'
                    tmp = re.findall(subPattern, textCforCoor, flags=re.DOTALL)
                    if tmp and len(tmp)>2:
                        # print(tmp)
                        fuck = '-'.join(f"N{m[:4]}E{m[5:-1]}" for m in tmp)
                coordinates_result = coordinates.group() if coordinates else fuck
                time_pattern = r"\d{2} [A-Z]{3} \d{2}:\d{2} \d{4} UNTIL \d{2} [A-Z]{3} \d{2}:\d{2} \d{4}"
                time_info = re.search(time_pattern, text_content)
                # print(text_content)
                time_result = time_info.group() if time_info else "00 JAN 00:00 0000 UNTIL 00 JAN 00:00 0000"
                currentText=text_content.split('-',1)
                # if "B5341/24" in currentText:
                    # print(coordinates)
                data1=np.vstack([data1,np.array([currentText[0],coordinates_result,time_result])]) 
        
    #print(data1)
    df = pd.DataFrame(data1)
    df_unique = df.drop_duplicates(subset=1)
    data1 = df_unique.to_numpy()
    #txt_file    = 'output.txt'
    #np.savetxt(os.path.join(current_dir, txt_file), data1, fmt='%s', delimiter='\t')
    dataDict = {
        "CODE": data1[:, 0].tolist(),
        "COORDINATES": data1[:, 1].tolist(),
        "TIME": data1[:, 2].tolist()
    }
    dataDict["NUM"] = len(data1)
    print(dataDict)
    print("使用时请不要关闭控制台，在浏览器中访问http://127.0.0.1:5000以开始使用")
    return jsonify(dataDict)
app.run()
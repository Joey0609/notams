<div align="center">

# 🌐 NOTAM 网站查看器

![GitHub stars](https://img.shields.io/github/stars/Joey0609/notams?style=social)
![GitHub forks](https://img.shields.io/github/forks/Joey0609/notams?style=social)
![GitHub issues](https://img.shields.io/github/issues/Joey0609/notams)
[![Website](https://img.shields.io/badge/website-online-brightgreen)](https://joey0609.github.io/notams/)
[![Website Visits](https://img.shields.io/badge/dynamic/json?color=blue&label=Visits&query=value&url=https://joey0609.github.io/notams/visits.json)](https://counter.dev/dashboard.html?user=Starsky69&token=Beb6_vARt7c%3D)
</div>

[English](README.md) | 中文


## 网站：https://joey0609.github.io/notams/ <br>


本项目用于从 NOTAM 及相关海事安全信息中提取火箭发射、碎片落区及危险区坐标，并将其可视化展示在地图上。除了基础的区域绘制能力，网站还有历史归档、来源匹配、图片导出、经纬度查询、测距等功能。<br>

**如果你觉得这个项目有帮助，欢迎在 GitHub 上点个 ⭐。你的支持会鼓励我们持续改进并添加更多功能。谢谢！**

**本项目 FallingFengre/notams:main 的基础上进行修改。**<br>

## <span style="font-weight:bold;color:red;">本项目严禁用于非法用途，请用户自觉维护国家安全，对于非火箭航警做到不分析，不传播！</span>

## 项目概述

NOTAM（Notice to Airmen）是用于提示飞行活动风险的航空通告，其中常包含临时危险区、碎片落区、航行限制区等信息。对于火箭发射任务，这类通告往往会直接给出区域边界、有效时间、编号和补充说明，因此可以作为发射活动和危险区研判的重要数据来源。项目会把这些文本信息解析成结构化坐标，再结合时间窗口和来源标识进行统一展示。

当前项目主要覆盖三类数据：NOTAM 航警、NGA MSI 海警信息，以及历史归档匹配后的结果。不同来源的原文格式并不完全一致，因此解析链路会同时处理坐标提取、时间标准化、区域过滤和重复项去重，最终输出到前端地图和本地数据文件中。

## 典型格式

火箭发射相关的 NOTAM 通常如下：  <br>

> A1690/23 - A TEMPORARY DANGER AREA ESTABLISHED BOUNDED BY: N392852E0955438-N385637E0955854-N390118E0970056-N393335E0965708 BACK TO START. VERTICAL LIMITS:SFC-UNL. SFC - UNL, 06 JUL 03:18 2023 UNTIL 06 JUL 04:45 2023. CREATED: 05 JUL 07:40 2023

其中，“A1690/23” 是 NOTAM 编号，“N392852E0955438-N385637E0955854-N390118E0970056-N393335E0965708” 一类内容是坐标点序列，围成的区域就是需要展示的危险区。“06 JUL 03:18 2023 UNTIL 06 JUL 04:45 2023” 则是有效时间，可用于判断事件窗口。不同国家和海域的通告措辞会有所变化，但核心信息通常仍然是编号、时间和坐标边界。

## 使用说明

项目启动后会自动抓取数据、生成结构化结果并绘制到地图中。地图侧重展示当前有效和可视化分析所需的信息，而不是保留每条原文的完整格式。若同一事件同时出现在不同来源，系统会优先保留更完整、可解释性更强的字段，并尽量避免被空值或默认值覆盖。

欢迎提交Pull Request或Issue来帮助完善功能和修正问题！<br>

**其他页面**

[百度贴吧](https://tieba.baidu.com/p/9298301903)

**开源许可与第三方库**

本项目使用了以下第三方开源软件：

Leaflet v1.9.4  
Copyright (c) 2010-2025, Volodymyr Agafonkin  
License: BSD 2-Clause License  
Website: <https://leafletjs.cn/>  
License file: static/leaflet/LICENSE

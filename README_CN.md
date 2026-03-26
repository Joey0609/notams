<div align="center">

# 🌐 NOTAM 网站查看器

![GitHub stars](https://img.shields.io/github/stars/Joey0609/notams?style=social)
![GitHub forks](https://img.shields.io/github/forks/Joey0609/notams?style=social)
![GitHub issues](https://img.shields.io/github/issues/Joey0609/notams)
[![Website](https://img.shields.io/badge/website-online-brightgreen)](https://joey0609.github.io/notams/)
[![Website Visits](https://img.shields.io/badge/dynamic/json?color=blue&label=Visits&query=value&url=https://joey0609.github.io/notams/visits.json)](https://counter.dev/dashboard.html?user=Starsky69&token=Beb6_vARt7c%3D)
</div>

[English](README.md) | 中文

通过 NOTAM 获取并绘制火箭发射碎片区<br>

**如果你觉得这个项目有帮助，欢迎在 GitHub 上点个 ⭐。你的支持会鼓励我们持续改进并添加更多功能。谢谢！😊**

**本项目修改自 FallingFengre/notams:main。**<br>

## <span style="font-weight:bold;color:red;">本项目及其网址严禁对外传播</span>

**一、关于 NOTAM 与火箭发射碎片区**<br>

- &ensp;&ensp;&ensp;&ensp;随着我国航天技术持续发展与进步，航天发射活动越来越频繁。我们经常会看到某次发射的型号、时间、轨道等预测信息。除了根据目标轨道计算发射窗口，或者通过内部/公开渠道获取发射计划之外，普通人提前了解火箭发射信息的一个重要方式，就是分析相关 NOTAM 中包含的碎片区信息。NOTAM（Notice to Airmen）是航空通告，用于提醒飞行员航路或某一地点附近存在可能影响飞行安全的潜在危险。火箭发射过程中通常会有碎片（一级、二级等）落回地面。为了保障飞行安全，相关部门会提前在预测的碎片落区附近划定区域，禁止航空器进入，这个区域就是火箭碎片区。通过分析这些碎片区，我们可以获得发射时间、发射地点、轨迹走向等信息，甚至可以根据区域形状与分布推测火箭型号。  <br>
- 火箭发射相关的 NOTAM 通常如下：  <br>

> A1690/23 - A TEMPORARY DANGER AREA ESTABLISHED BOUNDED BY: N392852E0955438-N385637E0955854-N390118E0970056-N393335E0965708 BACK TO START. VERTICAL LIMITS:SFC-UNL. SFC - UNL, 06 JUL 03:18 2023 UNTIL 06 JUL 04:45 2023. CREATED: 05 JUL 07:40 2023

- &ensp;&ensp;&ensp;&ensp;其中，类似 “A1690/23” 的部分是 NOTAM 编号，“N392852E0955438-N385637E0955854-N390118E0970056-N393335E0965708” 是四个坐标点。这四个坐标点围成的矩形区域就是碎片区。“06 JUL 03:18 2023 UNTIL 06 JUL 04:45 2023” 是该 NOTAM 的生效时间，可用来判断发射窗口。国内空域的碎片区 NOTAM 往往以 “A TEMPORARY DANGER AREA” 开头；在其他国家空域和部分海域，NOTAM 格式可能不同，这会让文昌发射相关的 NOTAM 获取稍微麻烦一些。不过，所有发射碎片区 NOTAM 中包含的信息本质上是相同的。  <br>
- &ensp;&ensp;&ensp;&ensp;关于 NOTAM 的获取方式，请参考工具的帮助说明。

**其他页面**

[百度贴吧](https://tieba.baidu.com/p/9298301903)

**开源许可与第三方库**

本项目使用了以下第三方开源软件：

Leaflet v1.9.4  
Copyright (c) 2010-2025, Volodymyr Agafonkin  
License: BSD 2-Clause License  
Website: <https://leafletjs.cn/>  
License file: static/leaflet/LICENSE

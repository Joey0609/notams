<div align="center">

# 🌐 Notam Website Viewer 

![GitHub stars](https://img.shields.io/github/stars/Joey0609/notams?style=social)
![GitHub forks](https://img.shields.io/github/forks/Joey0609/notams?style=social)
![GitHub issues](https://img.shields.io/github/issues/Joey0609/notams)
[![Website](https://img.shields.io/badge/website-online-brightgreen)](https://joey0609.github.io/notams/)
[![Website Visits](https://img.shields.io/badge/dynamic/json?color=blue&label=Visits&query=value&url=https://joey0609.github.io/notams/visits.json)](https://counter.dev/dashboard.html?user=Starsky69&token=Beb6_vARt7c%3D)
</div>



Obtain and plot rocket launch debris zones via NOTAMs<br>

**<span style="color:orange;">Warning! This tool can automatically retrieve aviation warnings only. Some launches can be identified through navigational warnings, which cannot be automatically retrieved at this time. Please obtain and manually input coordinates if needed.</span>**<br>

**If you find this project helpful, please consider giving it a ⭐ on GitHub! Your support motivates us to keep improving and adding new features. Thank you! 😊**

**This project is forked from FallingFengre/notams:main.**<br>

## <span style="font-weight:bold;color:red;">This project and its URL are strictly prohibited from being shared externally!</span>

**I. About NOTAMs and Rocket Launch Debris Zones**<br>

- &ensp;&ensp;&ensp;&ensp;With the continuous development and advancement of China's space technology, the frequency of space launches is constantly increasing. We often see predictions about the model, time, and orbit of a certain launch. In addition to calculating launch windows based on target orbits or obtaining launch plans through internal or public information channels, one important way for ordinary people to learn about rocket launches in advance is by analyzing the debris zone information contained in relevant NOTAMs. A NOTAM (Notice to Airmen) is a notice filed with an aviation authority to alert aircraft pilots of potential hazards along a flight route or at a location that could affect the safety of the flight. Rocket launches often involve debris (first stage, second stage, etc.) falling back to Earth. To ensure flight safety, relevant authorities will designate an area near the predicted debris impact location in advance, prohibiting aircraft from entering. This area is known as a rocket debris zone. By analyzing these debris zones, we can obtain information such as the launch time and location, general trajectory, and even deduce the rocket model based on the shape and distribution of the zone.  <br>
- Rocket launch-related NOTAMs often appear as follows:  <br>

> A1690/23 - A TEMPORARY DANGER AREA ESTABLISHED BOUNDED BY: N392852E0955438-N385637E0955854-N390118E0970056-N393335E0965708 BACK TO START. VERTICAL LIMITS:SFC-UNL. SFC - UNL, 06 JUL 03:18 2023 UNTIL 06 JUL 04:45 2023. CREATED: 05 JUL 07:40 2023

- &ensp;&ensp;&ensp;&ensp;Among this, something like "A1690/23" is the NOTAM serial number, "N392852E0955438-N385637E0955854-N390118E0970056-N393335E0965708" are four coordinates. The rectangular area enclosed by these four coordinate points is the debris zone. "06 JUL 03:18 2023 UNTIL 06 JUL 04:45 2023" is the effective time of the NOTAM, which can be used to determine the launch window. Debris zone NOTAMs for launches in domestic airspace often begin with "A TEMPORARY DANGER AREA". In other countries' airspace and over some sea areas, the NOTAM format may differ, which can make obtaining debris zone NOTAMs for Wenchang launches slightly more troublesome. However, the information contained in all launch debris zone NOTAMs is essentially the same.  <br>
- &ensp;&ensp;&ensp;&ensp;For methods on obtaining NOTAMs, please refer to the tool's help section.

**Other Pages**
[Baidu Tieba](https://tieba.baidu.com/p/9298301903)


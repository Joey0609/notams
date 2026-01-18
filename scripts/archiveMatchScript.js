// archiveMatchScript.js
// 全局变量
let matchIndex = -1;
let matchData = null;
const matchColorPool = [
    '#3498db99', '#e74c3c99', '#2ecc7199', '#f39c1299', '#9b59b699',
    '#1abc9c99', '#34495e99', '#16a08599', '#27ae6099', '#2980b999',
    '#8e44ad99', '#2c3e5099', '#d3540099', '#c0392b99', '#7f8c8d99'
];
const originalNotamColor = '#4444ffff'; // 原始航警使用半透明红色

// 页面加载
window.addEventListener('DOMContentLoaded', function() {
    matchIndex = parseInt(getUrlParameter('index')) || 0;
    loadMatchData(matchIndex);
});

// 获取URL参数
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// 加载匹配数据
function loadMatchData(index) {
    const loadingModal = document.getElementById('loadingModal');
    if (loadingModal) loadingModal.style.display = 'block';
    
    fetch(`data/archiveMatch/match${index}.json`, { cache: 'no-cache' })
        .then(r => { 
            if (!r.ok) throw new Error(r.status); 
            return r.json(); 
        })
        .then(data => {
            matchData = data;
            drawOriginalNotam();
            assignMatchGroupColors();
            drawMatchNotams();
            updateMatchSidebar();
        })
        .catch(err => {
            console.error('加载匹配数据失败:', err);
            document.getElementById('notamList').innerHTML = `<div style="padding:20px;text-align:center;color:#e74c3c">加载匹配数据失败: ${err.message || err}</div>`;
        })
        .finally(() => {
            if (loadingModal) loadingModal.style.display = 'none';
        });
}

// 绘制原始航警
function drawOriginalNotam() {
    // 先清除所有匹配多边形，保留地图和图层
    clearMatchPolygons();
    
    fetch('data_dict.json', { cache: 'no-cache' })
        .then(r => { 
            if (!r.ok) throw new Error(`HTTP error ${r.status}`); 
            return r.json(); 
        })
        .then(data => {
            if (matchIndex >= data.NUM || matchIndex < 0) {
                console.error(`Invalid index ${matchIndex}, total NOTAMs: ${data.NUM}`);
                return;
            }
            
            const originalNotam = {
                COORDINATES: data.COORDINATES[matchIndex],
                TIME: data.TIME[matchIndex],
                CODE: data.CODE[matchIndex],
                ALTITUDE: data.ALTITUDE[matchIndex] || 'None',
                RAWMESSAGE: data.RAWMESSAGE[matchIndex] || ''
            };
            
            // 绘制原始航警，使用特殊颜色（半透明红色）
            drawNotArchive(
                originalNotam.COORDINATES,
                originalNotam.TIME,
                originalNotam.CODE,
                originalNotam.ALTITUDE,
                'original',
                originalNotamColor,
                0,
                originalNotam.RAWMESSAGE || "",
                0.8
            );
            
            // 将原始航警置于顶层
            if (window.polygonAuto && window.polygonAuto.length > 0) {
                const lastPoly = window.polygonAuto[window.polygonAuto.length - 1];
                if (lastPoly) {
                    lastPoly.bringToFront();
                }
            }
        })
        .catch(err => {
            console.error('Failed to load original NOTAM:', err);
            showNotification('无法加载原始航警数据，请检查 data_dict.json');
        });
}

// 清除匹配多边形，保留原始航警
function clearMatchPolygons() {
    // 保留原始航警 (假定它是 polygonAuto 的最后一个元素)
    const originalPoly = window.polygonAuto && window.polygonAuto.length > 0 
        ? window.polygonAuto[window.polygonAuto.length - 1] 
        : null;
    
    // 清除其他自动航警
    if (window.polygonAuto) {
        for (let i = 0; i < window.polygonAuto.length - 1; i++) {
            const p = window.polygonAuto[i];
            if (p) map.removeLayer(p);
        }
        window.polygonAuto = originalPoly ? [originalPoly] : [];
    }
    
    // 清除匹配航警
    if (polygonMatch) {
        polygonMatch.forEach(p => p && map.removeLayer(p));
        polygonMatch = [];
    }
    
    // 重置匹配状态
    Object.keys(visibleMatchState).forEach(key => {
        if (key !== 'original') delete visibleMatchState[key];
    });
}

// 分配匹配组颜色
function assignMatchGroupColors() {
    matchGroupColors = {};
    if (!matchData || !Array.isArray(matchData)) return;
    
    // 筛选重叠面积大于20%的匹配项
    matchData = matchData.filter(item => {
        const overlap = item.Overlapping_Area || 0;
        const total = item.Total_Area || 1;
        return total === 0 ? false : (overlap / total) >= 20;
    });
    
    // 按重叠面积和距离排序
    matchData.sort((a, b) => {
        const overlapA = (a.Overlapping_Area || 0);
        const overlapB = (b.Overlapping_Area || 0);
        const distanceA = (a.Center_Distance || 1000);
        const distanceB = (b.Center_Distance || 1000);
        
        // 优先按重叠面积降序
        if (overlapA !== overlapB) {
            return overlapB - overlapA;
        }
        // 重叠相同时按距离升序
        return distanceA - distanceB;
    });
    
    // 为每个分组分配颜色
    const uniqueGroups = [...new Set(matchData.map(item => item.CODE))];
    let i = 0;
    uniqueGroups.forEach(code => {
        matchGroupColors[code] = matchColorPool[i++ % matchColorPool.length];
    });
}

// 获取匹配组颜色
function getMatchColor(code) {
    return matchGroupColors[code] || matchColorPool[0];
}

// 绘制匹配航警
function drawMatchNotams() {
    if (!matchData || !Array.isArray(matchData)) return;
    
    polygonMatch = [];
    
    for (let i = 0; i < matchData.length; i++) {
        const item = matchData[i];
        const col = getMatchColor(item.CODE);
        drawNotArchive(
            item.COORDINATES,
            item.TIME,
            item.CODE,
            item.ALTITUDE,
            i,
            col,
            0,
            item.RAWMESSAGE || "",
            0.05
        );
        // 重用自动航警的数组
        polygonMatch[i] = window.polygonAuto[i];
        visibleMatchState[i] = true;
    }
    // 适应所有多边形
    if (polygonMatch.length > 0) {
        const group = L.featureGroup(polygonMatch.filter(p => p));
        map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 8 });
    }
}

// 定位到匹配航警
function locateToMatchNotam(index) {
    if (!matchData || index >= matchData.length) return;
    try {
        const poly = polygonMatch[index];
        if (poly) {
            map.fitBounds(poly.getBounds(), { padding: [80, 80], maxZoom: 8 });
        }
    } catch (e) { 
        console.error(e); 
    }
}

// 更改匹配组颜色
function changeMatchGroupColor(code, newColor, idx) {
    matchGroupColors[code] = newColor;
    
    // 重新绘制该组所有航警
    for (let i = 0; i < matchData.length; i++) {
        if (matchData[i].CODE === code && polygonMatch[i]) {
            polygonMatch[i].setStyle({
                color: newColor,
                fillColor: newColor
            });
        }
    }
    
    updateMatchSidebar();
}

// 关闭加载模态框
function closeLoadingModal() {
    const modal = document.getElementById('loadingModal');
    if (modal) modal.style.display = 'none';
}

// 日志面板控制
function toggleLogPanel() {
    const panel = document.getElementById('logPanel');
    if (panel) panel.classList.toggle('open');
}

function clearLogs() {
    const content = document.getElementById('logContent');
    if (content) {
        content.innerHTML = '<div class="log-empty">暂无日志</div>';
    }
}

// 复制原始航警
function copyMatchRaw(idx) {
    const raw = matchData?.[idx]?.RAWMESSAGE || '';
    if (typeof handleCopy === 'function') {
        handleCopy(raw);
    } else {
        fallbackCopyText(raw);
    }
}

// 回退复制方案
function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);
    
    const range = document.createRange();
    range.selectNodeContents(textarea);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    textarea.setSelectionRange(0, text.length);
    
    let success = false;
    try {
        success = document.execCommand('copy');
    } catch (e) {
        console.error('Copy failed:', e);
    }
    document.body.removeChild(textarea);
    
    if (success) {
        showNotification('已复制原始航警到剪贴板');
    } else {
        showNotification('复制失败，请长按手动复制');
    }
}

// 绘制NOTAM多边形
function drawNotArchive(COORstrin, timee, codee, altitude, numm, col, is_self, rawmessage, fillopacity = 0.5) {
    var pos = COORstrin;
    var timestr = is_self ? null : convertTime(timee);
    var stPos = 0;
    var arr = [];
    
    for (var i = 0; i < pos.length; i++) {
        if (pos[i] == "-") {
            var tmp = pos.substring(stPos, i);
            arr.push(tmp);
            stPos = i + 1;
        }
    }
    arr.push(pos.substring(stPos, pos.length));
    
    var _TheArray = [];
    for (var i = 0; i < arr.length; i++) {
        _TheArray.push(pullOut(arr[i]));
    }
    
    var latlngs = [];
    for (var i = 0; i < _TheArray.length; i++) {
        if (_TheArray[i]) {
            latlngs.push([_TheArray[i][1], _TheArray[i][0]]); // [lat, lng]
        }
    }

    if (latlngs.length < 3) return; // 至少需要3个点才能绘制多边形

    // 对坐标点排序，确保多边形是凸的或至少是合理的形状
    latlngs = sortPolygonPoints(latlngs);

    // 创建多边形
    var tmpPolygon = L.polygon(latlngs, {
        color: col,
        weight: 1,
        opacity: 1,
        fillColor: col,
        fillOpacity: fillopacity
    }).addTo(map);

    // 创建弹出窗口内容
    var popupContent;
    if (!is_self) {
        popupContent = "<div class='notam-popup'>" +
            "<div class='notam-popup-header'>" +
            "<h4>NOTAM信息</h4>" +
            "</div>" +
            "<div class='notam-popup-body'>" +
            "<div class='popup-info-row'>" +
            "<span class='popup-label'>持续时间:</span>" +
            "<span class='popup-value'>" + timestr + "</span>" +
            "</div>" +
            "<div class='popup-info-row row-horizontal'>" +
            "<div class='popup-col'>" +
            "<span class='popup-label'>航警编号:</span>" +
            "<span class='popup-value'>" + codee + "</span>" +
            "</div>" +
            "<div class='popup-col'>" +
            "<span class='popup-label'>航警高度:</span>" +
            "<span class='popup-value'>" + altitude + "</span>" +
            "</div>" +
            "</div>" +
            "<div class='notam-popup-buttons'>" +
            "<button class='copy copy-coord' onclick=\"handleCopy('" + COORstrin + "')\">复制坐标</button>" +
            "<button class='copy copy-raw' data-raw-index='" + numm + "'>复制原始航警</button>" +
            "</div>" +
            "</div>";
    } else {
        popupContent = "<div class='notam-popup'>" +
            "<div class='notam-popup-header'>" +
            "<h4>用户绘制落区</h4>" +
            "</div>" +
            "<div class='notam-popup-body'>" +
            "<div class='popup-info-row'>" +
            "<span class='popup-value'>航警" + numm + "</span>" +
            "</div>" +
            "</div>" +
            "<div class='notam-popup-buttons'>" +
            "<button class='copy' onclick=\"handleCopy('" + COORstrin + "')\">复制坐标</button>" +
            "</div>" +
            "</div>";
    }

    tmpPolygon.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'notam-info-popup'
    });
    
    // 为弹出窗口添加打开事件监听器，处理复制原始航警按钮
    tmpPolygon.on('popupopen', function(e) {
        const popup = e.popup;
        const popupElement = popup.getElement();
        if (popupElement) {
            const rawBtn = popupElement.querySelector('.copy-raw[data-raw-index]');
            if (rawBtn) {
                const idx = parseInt(rawBtn.getAttribute('data-raw-index'));
                rawBtn.onclick = function(event) {
                    event.stopPropagation();
                    const raw = dict?.RAWMESSAGE?.[idx] || '';
                    handleCopy(raw);
                };
            }
        }
    });

    // 存储多边形引用
    if (is_self) {
        polygon[numm] = tmpPolygon;
    } else {
        polygonAuto[numm] = tmpPolygon;
    }
}
// 历史航警检索功能
let archiveDict = null;
let polygonArchive = [];
let archiveGroupColors = {};
let archiveVisibleState = {};
let currentRegionOverlay = null;

// ICAO区域边界定义（简化的矩形范围）
const ICAO_REGIONS = {
    'VVTS': { name: '越南胡志明', bounds: [[8, 102], [23, 110]], center: [10.8, 106.7] },
    'RPHI': { name: '菲律宾马尼拉', bounds: [[4, 116], [21, 127]], center: [14.6, 121.0] },
    'RJJJ': { name: '日本东京', bounds: [[24, 122], [46, 154]], center: [35.7, 139.7] },
    'KZAK': { name: '美国阿拉斯加', bounds: [[51, -180], [71, -130]], center: [64.2, -149.5] },
    'VCCF': { name: '斯里兰卡科伦坡', bounds: [[5.9, 79.8], [9.9, 82]], center: [6.9, 79.9] },
    'internal': { name: '内陆及近海', bounds: [[18, 100], [45, 135]], center: [36, 103] }
};

// 切换历史检索侧边栏
function toggleArchiveSidebar() {
    const sidebar = document.getElementById('archiveSidebar');
    if (!sidebar.classList.contains('open') && window.innerWidth <= 768) {
        sidebar.style.height = '50vh';
    }
    sidebar.classList.toggle('open');
}

// 初始化历史检索功能
(function initArchiveSearch() {
    const btnSearch = document.getElementById('btnSearchArchive');
    const btnClear = document.getElementById('btnClearArchive');
    const dateInput = document.getElementById('archiveDate');
    const regionSelect = document.getElementById('archiveRegion');

    // 设置默认日期为昨天
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    dateInput.value = yesterday.toISOString().split('T')[0];

    // 检索按钮
    btnSearch.addEventListener('click', async () => {
        const date = dateInput.value;
        const region = regionSelect.value;

        if (!date) {
            showNotification('请选择日期');
            return;
        }

        await searchArchiveNotams(date, region);
    });

    // 清除按钮
    btnClear.addEventListener('click', () => {
        clearArchiveNotams();
        showNotification('已清除历史航警');
    });

    // 区域选择变化时显示区域
    regionSelect.addEventListener('change', () => {
        showRegionOnMap(regionSelect.value);
    });
})();

// 搜索历史航警
async function searchArchiveNotams(date, region) {
    const statusEl = document.getElementById('archiveStatus');
    const listEl = document.getElementById('archiveNotamList');

    // 显示加载状态
    statusEl.className = 'archive-status show loading';
    statusEl.textContent = '正在检索历史航警...';
    listEl.innerHTML = '';

    try {
        const response = await fetch('/fetch_archive', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ date, region })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        // 清除旧的历史航警
        clearArchiveNotams();

        // 保存数据
        archiveDict = data;

        if (data.NUM === 0) {
            statusEl.className = 'archive-status show';
            statusEl.textContent = '未找到相关航警';
            return;
        }

        // 分配颜色
        assignArchiveGroupColors(data.CLASSIFY || {});

        // 绘制历史航警
        drawAllArchiveNotams();

        // 更新航警列表
        updateArchiveList();

        // 更新状态
        statusEl.className = 'archive-status show success';
        statusEl.textContent = `成功检索到 ${data.NUM} 条历史航警`;

        // 3秒后隐藏状态
        setTimeout(() => {
            statusEl.classList.remove('show');
        }, 3000);

        showNotification(`检索成功：找到 ${data.NUM} 条航警`);

    } catch (error) {
        console.error('历史航警检索失败:', error);
        statusEl.className = 'archive-status show error';
        statusEl.textContent = `检索失败: ${error.message}`;
        showNotification('检索失败，请重试');
    }
}

// 分配历史航警分组颜色
function assignArchiveGroupColors(classify) {
    archiveGroupColors = {};
    Object.keys(classify).forEach(key => {
        archiveGroupColors[key] = randomColor();
    });
}

// 获取历史航警的颜色
function getColorForArchiveCode(code) {
    if (!archiveDict || !archiveDict.CLASSIFY) return currentColorPool[0];
    for (const [group, codes] of Object.entries(archiveDict.CLASSIFY)) {
        if (codes.includes(code)) {
            return archiveGroupColors[group] || currentColorPool[0];
        }
    }
    return currentColorPool[0];
}

// 绘制所有历史航警
function drawAllArchiveNotams() {
    if (!archiveDict || archiveDict.NUM === 0) return;

    for (let i = 0; i < archiveDict.NUM; i++) {
        const col = getColorForArchiveCode(archiveDict.CODE[i]);
        drawArchiveNotam(
            archiveDict.COORDINATES[i],
            archiveDict.TIME[i],
            archiveDict.CODE[i],
            i,
            col,
            archiveDict.RAWMESSAGE?.[i] || ""
        );
        archiveVisibleState[i] = true;
    }
}

// 绘制单个历史航警
function drawArchiveNotam(COORstrin, timee, codee, numm, col, rawmessage) {
    var pos = COORstrin;
    var timestr = convertTime(timee);
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
            latlngs.push([_TheArray[i][1], _TheArray[i][0]]);
        }
    }

    if (latlngs.length < 3) return;

    // 创建多边形
    var tmpPolygon = L.polygon(latlngs, {
        color: col,
        weight: 2,
        opacity: 0.8,
        fillColor: col,
        fillOpacity: 0.4,
        dashArray: '5, 5'  // 虚线样式，区分历史航警
    }).addTo(map);

    // 创建弹出窗口
    var popupContent = "<div class='notam-popup'>" +
        "<div class='notam-popup-header' style='background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);'>" +
        "<h4>历史航警信息</h4>" +
        "</div>" +
        "<div class='notam-popup-body'>" +
        "<div class='popup-info-row'>" +
        "<span class='popup-label'>持续时间:</span>" +
        "<span class='popup-value'>" + timestr + "</span>" +
        "</div>" +
        "<div class='popup-info-row'>" +
        "<span class='popup-label'>航警编号:</span>" +
        "<span class='popup-value'>" + codee + "</span>" +
        "</div>" +
        "</div>" +
        "<div class='notam-popup-buttons'>" +
        "<button class='copy copy-coord' onclick=\"handleCopy('" + COORstrin + "')\">复制坐标</button>" +
        "<button class='copy copy-raw' onclick=\"handleCopy('" + (rawmessage || '').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "')\">复制原始航警</button>" +
        "</div>" +
        "</div>";

    tmpPolygon.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'notam-info-popup'
    });

    polygonArchive[numm] = tmpPolygon;
}

// 清除所有历史航警
function clearArchiveNotams() {
    polygonArchive.forEach(p => p && map.removeLayer(p));
    polygonArchive = [];
    archiveVisibleState = {};
    archiveDict = null;
    document.getElementById('archiveNotamList').innerHTML = '';
    updateSidebar(); // 更新主航警列表
}

// 更新历史航警列表显示
function updateArchiveList() {
    const listEl = document.getElementById('archiveNotamList');

    if (!archiveDict || archiveDict.NUM === 0) {
        listEl.innerHTML = '';
        return;
    }

    let html = '<div style="font-weight: bold; margin-bottom: 10px; color: #856404;">历史航警列表:</div>';
    
    for (let i = 0; i < archiveDict.NUM; i++) {
        const code = archiveDict.CODE[i];
        const rawTime = archiveDict.TIME[i] || '';
        const prettyTime = convertTime(rawTime);
        const col = getColorForArchiveCode(code);

        html += `
        <div class="archive-notam-item" style="border-left-color: ${col}; cursor: pointer;"
            onclick="locateToArchiveNotam(${i})">
            <div class="notam-code">${code}</div>
            <div class="notam-time">${prettyTime}</div>
        </div>`;
    }

    listEl.innerHTML = html;
}

// 定位到历史航警
function locateToArchiveNotam(index) {
    if (!archiveDict || index >= archiveDict.NUM) return;
    try {
        const points = parseCoordinatesToPoints(archiveDict.COORDINATES[index]);
        if (points && points.length > 0) {
            const bounds = L.latLngBounds(points);
            map.fitBounds(bounds, { padding: [80, 80], maxZoom: 6 });
        }
    } catch (e) {
        console.error(e);
    }
}

// 在地图上显示选中的区域
function showRegionOnMap(regionCode) {
    // 移除旧的区域覆盖层
    if (currentRegionOverlay) {
        map.removeLayer(currentRegionOverlay);
        currentRegionOverlay = null;
    }

    if (!regionCode || !ICAO_REGIONS[regionCode]) return;

    const region = ICAO_REGIONS[regionCode];

    // 绘制区域矩形
    currentRegionOverlay = L.rectangle(region.bounds, {
        color: '#3498db',
        weight: 2,
        fillColor: '#3498db',
        fillOpacity: 0.1,
        dashArray: '10, 5'
    }).addTo(map);

    // 添加标签
    const label = L.marker(region.center, {
        icon: L.divIcon({
            className: 'region-label',
            html: `<div style="background: rgba(52, 152, 219, 0.9); color: white; padding: 5px 10px; border-radius: 5px; font-weight: bold; white-space: nowrap;">${region.name}</div>`,
            iconSize: [100, 30]
        })
    }).addTo(map);

    // 将标签也存储，方便一起删除
    currentRegionOverlay.label = label;

    // 缩放到区域
    map.fitBounds(region.bounds, { padding: [50, 50] });

    // 5秒后自动移除区域显示
    setTimeout(() => {
        if (currentRegionOverlay) {
            map.removeLayer(currentRegionOverlay);
            if (currentRegionOverlay.label) {
                map.removeLayer(currentRegionOverlay.label);
            }
            currentRegionOverlay = null;
        }
    }, 5000);
}

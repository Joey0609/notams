// 历史航警检索功能
let archiveDict = null;
let polygonArchive = [];
let archiveGroupColors = {};
let archiveVisibleState = {};
let currentRegionOverlay = null;
let regionOverlayTimer = null; // 保存定时器ID
let archiveBlacklistCodes = new Set();

async function loadArchiveBlacklist() {
    try {
        const resp = await fetch('data/blacklist.json', { cache: 'no-cache' });
        if (!resp.ok) {
            archiveBlacklistCodes = new Set();
            return;
        }
        const raw = await resp.json();
        if (Array.isArray(raw)) {
            archiveBlacklistCodes = new Set(raw.map((x) => String(x || '').trim()).filter(Boolean));
        } else {
            archiveBlacklistCodes = new Set();
        }
    } catch (e) {
        console.warn('加载 blacklist 失败，按无黑名单处理', e);
        archiveBlacklistCodes = new Set();
    }
}

// 切换历史检索侧边栏
function toggleArchiveSidebar() {
    const sidebar = document.getElementById('archiveSidebar');
    const isOpening = !sidebar.classList.contains('open');
    
    sidebar.classList.toggle('open');
    
    // 如果是打开面板，重置到初始位置
    if (isOpening && window.resetArchivePosition) {
        window.resetArchivePosition();
    }
    
    console.log('历史检索面板状态:', sidebar.classList.contains('open') ? '打开' : '关闭');
}

// 初始化历史检索功能
(function initArchiveSearch() {
    const btnSearch = document.getElementById('btnSearchArchive');
    const btnClear = document.getElementById('btnClearArchive');
    const startDateInput = document.getElementById('archiveStartDate');
    const endDateInput = document.getElementById('archiveEndDate');
    // 移除区域选择元素
    const regionSelectElement = document.getElementById('archiveRegion');
    if (regionSelectElement) {
        regionSelectElement.parentElement.remove();
    }

    const minDateText = '2022-01-01';
    const todayDate = new Date();
    const maxDateText = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;

    startDateInput.min = minDateText;
    startDateInput.max = maxDateText;
    endDateInput.min = minDateText;
    endDateInput.max = maxDateText;

    // 默认最近30天
    const defaultEnd = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
    const defaultStart = new Date(defaultEnd);
    defaultStart.setDate(defaultStart.getDate() - 30);
    if (defaultStart < new Date(minDateText)) {
        defaultStart.setTime(new Date(minDateText).getTime());
    }

    const toDateInputText = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    startDateInput.value = toDateInputText(defaultStart);
    endDateInput.value = toDateInputText(defaultEnd);

    // 检索按钮
    btnSearch.addEventListener('click', async () => {
        const startDateRaw = startDateInput.value;
        const endDateRaw = endDateInput.value;

        if (!startDateRaw || !endDateRaw) {
            showNotification('请选择起止日期');
            return;
        }

        const startDate = new Date(`${startDateRaw}T00:00:00`);
        const endDate = new Date(`${endDateRaw}T23:59:59`);
        const minDate = new Date(`${minDateText}T00:00:00`);
        const maxDate = new Date(`${maxDateText}T23:59:59`);

        if (startDate < minDate || endDate > maxDate) {
            showNotification('仅允许选择 2022-01-01 至今天 的日期');
            return;
        }

        if (startDate > endDate) {
            showNotification('起始日期不能晚于结束日期');
            return;
        }

        console.log('点击检索按钮，日期区间:', startDateRaw, endDateRaw);

        await searchArchiveNotams(startDateRaw, endDateRaw);
    });

    // 清除按钮
    btnClear.addEventListener('click', () => {
        clearArchiveNotams();
        showNotification('已清除历史航警');
    });

    // 初始化拖动功能
    initArchiveDraggable();
})();

// 历史检索面板拖动功能
function initArchiveDraggable() {
    const sidebar = document.getElementById('archiveSidebar');
    const header = document.getElementById('archiveSidebarHeader');
    
    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;
    let xOffset = 0;
    let yOffset = 0;

    // 获取客户端坐标（兼容鼠标和触摸）
    function getClientCoords(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    // 开始拖动
    function dragStart(e) {
        // 如果点击的是按钮或输入框，不触发拖动
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.closest('button')) {
            return;
        }

        const coords = getClientCoords(e);
        initialX = coords.x - xOffset;
        initialY = coords.y - yOffset;
        isDragging = true;
        
        header.style.cursor = 'grabbing';
        e.preventDefault();
    }

    // 拖动中
    function drag(e) {
        if (!isDragging) return;
        
        e.preventDefault();
        const coords = getClientCoords(e);
        currentX = coords.x - initialX;
        currentY = coords.y - initialY;
        xOffset = currentX;
        yOffset = currentY;

        // 完全自由拖动，无边界限制
        setTranslate(xOffset, yOffset, sidebar);
    }

    // 结束拖动
    function dragEnd(e) {
        if (!isDragging) return;
        
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
        
        header.style.cursor = 'grab';
    }

    // 设置位置
    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate(${xPos}px, ${yPos}px)`;
    }

    // 重置到初始位置
    function resetPosition() {
        xOffset = 0;
        yOffset = 0;
        currentX = 0;
        currentY = 0;
        setTranslate(0, 0, sidebar);
    }

    // 将重置函数暴露到全局，供 toggleArchiveSidebar 调用
    window.resetArchivePosition = resetPosition;

    // 鼠标事件
    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    // 触摸事件
    header.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', dragEnd);

    // 设置标题栏样式
    header.style.cursor = 'grab';
    header.style.userSelect = 'none';
}

// 日期字符串转时间对象
function parseNotamTimeRange(dateStr) {
    // 航警时间格式：05 JAN 11:09 2024 UNTIL 05 JAN 11:32 2024
    const regex = /(\d{1,2}) (\w{3}) (\d{2}:\d{2}) (\d{4}) UNTIL (\d{1,2}) (\w{3}) (\d{2}:\d{2}) (\d{4})/;
    const match = String(dateStr || '').match(regex);
    if (!match) return null;

    const [, sDay, sMon, sTime, sYear, eDay, eMon, eTime, eYear] = match;
    const monthMap = {
        JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
        JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
    };

    const sm = monthMap[String(sMon).toUpperCase()];
    const em = monthMap[String(eMon).toUpperCase()];
    if (sm === undefined || em === undefined) return null;

    const [sh, si] = String(sTime).split(':').map(Number);
    const [eh, ei] = String(eTime).split(':').map(Number);

    // 源时间按 UTC 解析，再转换到北京时间进行区间判断
    const startUtc = new Date(Date.UTC(Number(sYear), sm, Number(sDay), sh, si, 0));
    const endUtc = new Date(Date.UTC(Number(eYear), em, Number(eDay), eh, ei, 0));
    const startBj = new Date(startUtc.getTime() + 8 * 60 * 60 * 1000);
    const endBj = new Date(endUtc.getTime() + 8 * 60 * 60 * 1000);
    return { start: startBj, end: endBj };
}

// 从本地加载指定月份的历史航警数据
async function loadLocalArchiveMonthData(year, month) {
    const filePath = `data/notam_db/${year}-${month.toString().padStart(2, '0')}.json`;
    
    console.log('尝试加载本地数据文件:', filePath);
    
    try {
        const response = await fetch(filePath);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`数据文件不存在: ${filePath}`);
                return null;
            }
            throw new Error(`无法加载数据文件: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`成功加载 ${year}-${month} 数据:`, data);
        return data;
    } catch (error) {
        console.error(`加载 ${year}-${month} 数据失败:`, error);
        return null;
    }
}

// 获取区间内所有相关月份
function getMonthsInRange(startDate, endDate) {
    const months = [];
    let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (current <= endMonth) {
        months.push({
            year: current.getFullYear(),
            month: current.getMonth() + 1
        });
        current.setMonth(current.getMonth() + 1);
    }

    return months;
}

// 合并多个数据源，筛选区间内的航警
function filterNotamsWithinDateRange(allData, startDate, endDate) {
    const result = {
        NUM: 0,
        CODE: [],
        COORDINATES: [],
        TIME: [],
        PLATID: [],
        RAWMESSAGE: [],
        ALTITUDE: [],
        CLASSIFY: {}
    };
    
    // 分类数据结构
    const classifyMap = {};
    const seen = new Set();
    
    // 遍历所有加载的数据
    for (const data of allData) {
        if (!data || !data.NUM || data.NUM === 0) continue;
        
        for (let i = 0; i < data.NUM; i++) {
            try {
                console.log('正在处理航警:', data.TIME[i]);
                const range = parseNotamTimeRange(data.TIME[i]);
                if (!range) {
                    continue;
                }

                // 按完整时间区间判断是否与筛选区间重叠
                const overlapped = range.end >= startDate && range.start <= endDate;
                if (overlapped) {
                    const code = data.CODE[i] || '';
                    if (archiveBlacklistCodes.has(String(code))) {
                        continue;
                    }
                    const uniqueKey = [
                        code,
                        data.TIME[i] || '',
                        data.COORDINATES[i] || '',
                        data.PLATID?.[i] || ''
                    ].join('|');
                    if (seen.has(uniqueKey)) {
                        continue;
                    }
                    seen.add(uniqueKey);
                    // 添加到结果
                    result.CODE.push(code);
                    result.COORDINATES.push(data.COORDINATES[i]);
                    result.TIME.push(data.TIME[i]);
                    result.PLATID.push(data.PLATID?.[i] || 'UNKNOWN');
                    result.RAWMESSAGE.push(data.RAWMESSAGE?.[i] || '');
                    result.ALTITUDE.push(data.ALTITUDE?.[i] || 'Unknown');
                    if (!Array.isArray(result.SOURCE)) result.SOURCE = [];
                    if (!Array.isArray(result.FIR)) result.FIR = [];
                    result.SOURCE.push(data.SOURCE?.[i] || 'NOTAM');
                    result.FIR.push(data.FIR?.[i] || '');
                    
                    // 收集分类信息
                    for (const [group, codes] of Object.entries(data.CLASSIFY || {})) {
                        if (codes.includes(code)) {
                            if (!classifyMap[group]) {
                                classifyMap[group] = [];
                            }
                            if (!classifyMap[group].includes(code)) {
                                classifyMap[group].push(code);
                            }
                        }
                    }
                    
                    result.NUM++;
                }
            } catch (e) {
                console.error('处理航警时出错:', e, data?.CODE?.[i]);
            }
        }
    }
    
    // 构建CLASSIFY对象
    result.CLASSIFY = classifyMap;
    
    console.log(`筛选结果: 共 ${result.NUM} 条航警在 ${startDate.toISOString().split('T')[0]} 至 ${endDate.toISOString().split('T')[0]} 内`);
    return result;
}

// 搜索历史航警 - 按自定义区间加载本地数据
async function searchArchiveNotams(startDateStr, endDateStr) {
    console.log('开始搜索历史航警...', { startDateStr, endDateStr });
    
    const btnSearch = document.getElementById('btnSearchArchive');
    const originalText = btnSearch.textContent;

    // 显示加载状态
    btnSearch.innerHTML = '正在检索<span class="btn-spinner"></span>';
    btnSearch.disabled = true;
    btnSearch.style.opacity = '0.8';

    try {
        await loadArchiveBlacklist();
        const startDate = new Date(`${startDateStr}T00:00:00`);
        const endDate = new Date(`${endDateStr}T23:59:59`);

        // 获取区间相关月份
        const relatedMonths = getMonthsInRange(startDate, endDate);
        console.log('需要加载的月份:', relatedMonths);
        
        // 加载所有相关月份的数据
        const loadDataPromises = relatedMonths.map(month => 
            loadLocalArchiveMonthData(month.year, month.month)
        );
        
        const allMonthData = await Promise.all(loadDataPromises);
        
        // 筛选区间内的航警
        const filteredData = filterNotamsWithinDateRange(allMonthData, startDate, endDate);

        // 清除旧的历史航警
        clearArchiveNotams();

        // 保存数据
        archiveDict = filteredData;

        if (!filteredData || filteredData.NUM === 0) {
            // 显示未找到状态
            btnSearch.innerHTML = '未找到相关航警';
            btnSearch.disabled = false;
            btnSearch.style.opacity = '1';
            btnSearch.style.background = 'linear-gradient(135deg, #95a5a6, #7f8c8d)';
            
            // 3秒后恢复
            setTimeout(() => {
                btnSearch.innerHTML = originalText;
                btnSearch.style.background = '';
            }, 3000);
            
            showNotification('未找到相关航警');
            return;
        }

        // 调试：打印时间数据
        console.log('历史航警数据:', filteredData);

        // 分配颜色
        assignArchiveGroupColors(filteredData.CLASSIFY || {});

        // 绘制历史航警
        drawAllArchiveNotams();

        // 更新航警列表（主列表）
        updateSidebar();

        // 显示成功状态
        btnSearch.innerHTML = `找到 ${filteredData.NUM} 条航警`;
        btnSearch.disabled = false;
        btnSearch.style.opacity = '1';
        btnSearch.style.background = 'linear-gradient(135deg, #27ae60, #229954)';

        // 3秒后恢复
        setTimeout(() => {
            btnSearch.innerHTML = originalText;
            btnSearch.style.background = '';
        }, 3000);

        showNotification(`检索成功：找到 ${filteredData.NUM} 条航警（区间 ${startDateStr} 至 ${endDateStr}）`);

    } catch (error) {
        console.error('历史航警检索失败:', error);
        
        // 显示失败状态
        btnSearch.innerHTML = '检索失败，重新检索';
        btnSearch.disabled = false;
        btnSearch.style.opacity = '1';
        btnSearch.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
        
        // 3秒后恢复
        setTimeout(() => {
            btnSearch.innerHTML = originalText;
            btnSearch.style.background = '';
        }, 3000);
        
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

    // 先清除旧的多边形
    polygonArchive.forEach(p => p && map.removeLayer(p));
    polygonArchive = [];

    for (let i = 0; i < archiveDict.NUM; i++) {
        const col = getColorForArchiveCode(archiveDict.CODE[i]);
        drawArchiveNotam(
            archiveDict.COORDINATES[i],
            archiveDict.TIME[i],
            archiveDict.CODE[i],
            i,
            col,
            archiveDict.RAWMESSAGE?.[i] || "",
            archiveDict.SOURCE?.[i] || 'NOTAM',
            archiveDict.FIR?.[i] || ''
        );
        // 保持之前的可见状态
        if (archiveVisibleState[i] === false) {
            const poly = polygonArchive[i];
            if (poly) map.removeLayer(poly);
        } else {
            archiveVisibleState[i] = true;
        }
    }
}

// 绘制单个历史航警
function drawArchiveNotam(COORstrin, timee, codee, numm, col, rawmessage, sourceType = 'NOTAM', fir = '') {
    var pos = COORstrin;
    console.log(timee);
    var timestr = convertTime(timee);
    console.log(timestr);
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

    const wrappedRings = typeof buildWrappedLatLngRings === 'function' ? buildWrappedLatLngRings(latlngs) : [latlngs];
    if (!wrappedRings || wrappedRings.length === 0) return;

    // 创建多边形
    var tmpPolygon = L.polygon(wrappedRings, {
        color: col,
        weight: 2,
        opacity: 0.8,
        fillColor: col,
        fillOpacity: 0.5,
        dashArray: '3, 3'  // 虚线样式，区分历史航警
    }).addTo(map);

    // 创建弹出窗口
    var popupContent = "<div class='notam-popup'>" +
        "<div class='notam-popup-header' style='background: linear-gradient(135deg, #1e9613ff 0%, #127209ff 100%);'>" +
        "<h4>历史NOTAM信息</h4>" +
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
        "<div class='popup-info-row row-horizontal'>" +
        "<div class='popup-col'>" +
        "<span class='popup-label'>来源:</span>" +
        "<span class='popup-value'>" + (sourceType || 'NOTAM') + "</span>" +
        "</div>" +
        "<div class='popup-col'>" +
        "<span class='popup-label'>飞行情报区:</span>" +
        "<span class='popup-value'>" + (fir || '-') + "</span>" +
        "</div>" +
        "</div>" +
        "<div class='popup-info-row'>" +
        "<span class='popup-label'>数据来源日期:</span>" +
        "<span class='popup-value'>" + extractDateFromNotamTime(timee) + "</span>" +
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

// 从航警时间字符串中提取日期
function extractDateFromNotamTime(notamTime) {
    // 格式: "05 JAN 11:09 2024 UNTIL 05 JAN 11:32 2024"
    const parts = notamTime.split(' ');
    if (parts.length >= 5) {
        return `${parts[0]} ${parts[1]} ${parts[4]}`;
    }
    return notamTime;
}

// 清除所有历史航警
function clearArchiveNotams() {
    polygonArchive.forEach(p => p && map.removeLayer(p));
    polygonArchive = [];
    archiveVisibleState = {};
    archiveDict = null;
    updateSidebar(); // 更新主航警列表
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
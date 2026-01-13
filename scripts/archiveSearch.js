// 历史航警检索功能
let archiveDict = null;
let polygonArchive = [];
let archiveGroupColors = {};
let archiveVisibleState = {};
let currentRegionOverlay = null;
let regionOverlayTimer = null; // 保存定时器ID

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
    const btnSelectDate = document.getElementById('btnSelectDate');
    const selectedDateText = document.getElementById('selectedDateText');
    const calendarPopup = document.getElementById('calendarPopup');
    const yearSelect = document.getElementById('archiveYear');
    const monthSelect = document.getElementById('archiveMonth');
    const calendarGrid = document.getElementById('calendarGrid');
    // 移除区域选择元素
    const regionSelectElement = document.getElementById('archiveRegion');
    if (regionSelectElement) {
        regionSelectElement.parentElement.remove();
    }
    
    let selectedDay = null;
    let selectedYear = null;
    let selectedMonth = null;
    
    // 限制年份范围：2023-2025
    const minYear = 2023;
    const maxYear = 2025;
    for (let y = maxYear; y >= minYear; y--) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y + '年';
        yearSelect.appendChild(option);
    }
    
    // 设置默认年份（如果当前年份在范围内）
    const currentYear = new Date().getFullYear();
    if (currentYear >= minYear && currentYear <= maxYear) {
        yearSelect.value = currentYear;
    } else if (currentYear < minYear) {
        yearSelect.value = minYear;
    } else {
        yearSelect.value = maxYear;
    }
    
    // 生成日历网格
    function renderCalendar() {
        const year = parseInt(yearSelect.value);
        const month = parseInt(monthSelect.value);
        
        // 清空日历
        calendarGrid.innerHTML = '';
        
        // 添加星期标题
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        weekdays.forEach(day => {
            const weekdayEl = document.createElement('div');
            weekdayEl.className = 'calendar-weekday';
            weekdayEl.textContent = day;
            calendarGrid.appendChild(weekdayEl);
        });
        
        // 获取月份第一天是星期几（0=星期日）
        const firstDay = new Date(year, month - 1, 1).getDay();
        // 获取这个月有多少天
        const daysInMonth = new Date(year, month, 0).getDate();
        
        // 添加空白格子（月份开始前的日子）
        for (let i = 0; i < firstDay; i++) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'calendar-day empty';
            calendarGrid.appendChild(emptyEl);
        }
        
        // 获取今天的日期
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === year && (today.getMonth() + 1) === month;
        
        // 检查日期是否在允许范围内
        const isDateInRange = (y, m, d) => {
            const dateToCheck = new Date(y, m - 1, d);
            const minDate = new Date(minYear, 0, 1); // 2023-01-01
            const maxDate = new Date(maxYear, 11, 31); // 2025-12-31
            return dateToCheck >= minDate && dateToCheck <= maxDate;
        };
        
        // 添加每一天
        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            dayEl.textContent = day;
            dayEl.dataset.day = day;
            
            // 检查日期是否在允许范围内
            if (!isDateInRange(year, month, day)) {
                dayEl.classList.add('out-of-range');
                dayEl.style.opacity = '0.5';
                dayEl.style.cursor = 'not-allowed';
                continue; // 跳过不可选日期
            }
            
            // 标记今天
            if (isCurrentMonth && day === today.getDate()) {
                dayEl.classList.add('today');
            }
            
            // 如果是当前选中的日期
            if (selectedDay === day && selectedYear === year && selectedMonth === month) {
                dayEl.classList.add('selected');
            }
            
            // 点击事件
            dayEl.addEventListener('click', () => {
                // 检查点击的日期是否在允许范围内
                if (!isDateInRange(year, month, day)) {
                    showNotification(`仅允许选择 ${minYear}年1月 至 ${maxYear}年12月 的日期`);
                    return;
                }
                
                // 移除之前的选中状态
                calendarGrid.querySelectorAll('.calendar-day.selected').forEach(el => {
                    el.classList.remove('selected');
                });
                // 添加新的选中状态
                dayEl.classList.add('selected');
                selectedDay = day;
                selectedYear = parseInt(yearSelect.value);
                selectedMonth = parseInt(monthSelect.value);
                
                // 更新显示文本
                updateDateText();
                
                // 关闭日历
                calendarPopup.classList.remove('show');
                btnSelectDate.classList.remove('open');
            });
            
            calendarGrid.appendChild(dayEl);
        }
    }

    // 更新日期显示文本
    function updateDateText() {
        if (selectedYear && selectedMonth && selectedDay) {
            selectedDateText.textContent = `${selectedYear}年${selectedMonth}月${selectedDay}日`;
        } else {
            selectedDateText.textContent = '选择日期';
        }
    }

    // 日期选择按钮点击事件
    btnSelectDate.addEventListener('click', (e) => {
        e.stopPropagation();
        calendarPopup.classList.toggle('show');
        btnSelectDate.classList.toggle('open');
    });

    // 点击外部关闭日历
    document.addEventListener('click', (e) => {
        if (!calendarPopup.contains(e.target) && e.target !== btnSelectDate) {
            calendarPopup.classList.remove('show');
            btnSelectDate.classList.remove('open');
        }
    });

    // 设置默认日期为昨天（在允许范围内）
    const defaultDate = new Date();
    if (defaultDate.getFullYear() > maxYear) {
        defaultDate.setFullYear(maxYear, 11, 31); // 2025-12-31
    } else if (defaultDate.getFullYear() < minYear) {
        defaultDate.setFullYear(minYear, 0, 1); // 2023-01-01
    } else {
        defaultDate.setDate(defaultDate.getDate() - 1); // 昨天
    }
    
    // 确保默认日期在允许范围内
    if (defaultDate < new Date(minYear, 0, 1)) {
        defaultDate.setFullYear(minYear, 0, 1);
    }
    if (defaultDate > new Date(maxYear, 11, 31)) {
        defaultDate.setFullYear(maxYear, 11, 31);
    }
    
    yearSelect.value = defaultDate.getFullYear();
    monthSelect.value = defaultDate.getMonth() + 1;
    selectedDay = defaultDate.getDate();
    selectedYear = defaultDate.getFullYear();
    selectedMonth = defaultDate.getMonth() + 1;
    
    // 年份或月份变化时重新渲染日历
    yearSelect.addEventListener('change', renderCalendar);
    monthSelect.addEventListener('change', renderCalendar);
    
    // 初始化日历
    renderCalendar();
    updateDateText();

    // 检索按钮
    btnSearch.addEventListener('click', async () => {
        if (!selectedYear || !selectedMonth || !selectedDay) {
            showNotification('请选择日期');
            return;
        }
        
        // 检查日期范围
        const selectedDate = new Date(selectedYear, selectedMonth - 1, selectedDay);
        const minDate = new Date(minYear, 0, 1);
        const maxDate = new Date(maxYear, 11, 31);
        
        if (selectedDate < minDate || selectedDate > maxDate) {
            showNotification(`仅允许选择 ${minYear}年1月 至 ${maxYear}年12月 的日期`);
            return;
        }
        
        const year = String(selectedYear);
        const month = String(selectedMonth).padStart(2, '0');
        const day = String(selectedDay).padStart(2, '0');
        const date = `${year}-${month}-${day}`;

        console.log('点击检索按钮，日期:', date);

        await searchArchiveNotams(date);
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
function parseNotamDate(dateStr) {
    // 根据航警时间格式解析：05 JAN 11:09 2024 UNTIL 05 JAN 11:32 2024
    const parts = dateStr.split(' ');
    const startDay = parseInt(parts[0]);
    const startMonth = parts[1];
    const startYear = parseInt(parts[3]);
    
    // 月份映射
    const monthMap = {
        'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
        'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
    };
    
    return new Date(startYear, monthMap[startMonth], startDay);
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

// 获取选择日期前后15天内所有相关月份
function getRelatedMonths(baseDate) {
    const months = new Set();
    const startDate = new Date(baseDate);
    startDate.setDate(startDate.getDate() - 15); // 往前15天
    
    const endDate = new Date(baseDate);
    endDate.setDate(endDate.getDate() + 15); // 往后15天
    
    // 遍历日期范围内的所有月份
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        months.add({
            year: currentDate.getFullYear(),
            month: currentDate.getMonth() + 1 // 月份从1开始
        });
        // 移到下个月第一天
        currentDate.setMonth(currentDate.getMonth() + 1);
        currentDate.setDate(1);
    }
    
    return Array.from(months);
}

// 合并多个数据源，筛选日期范围内的航警
function filterNotamsWithinDateRange(allData, baseDate) {
    const startDate = new Date(baseDate);
    startDate.setDate(startDate.getDate() - 15); // 往前15天
    const endDate = new Date(baseDate);
    endDate.setDate(endDate.getDate() + 15); // 往后15天
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
    
    // 遍历所有加载的数据
    for (const data of allData) {
        if (!data || !data.NUM || data.NUM === 0) continue;
        
        for (let i = 0; i < data.NUM; i++) {
            try {
                console.log('正在处理航警:', data.TIME[i]);
                const notamDate = parseNotamDate(data.TIME[i]);
                // 检查是否在日期范围内
                if (notamDate >= startDate && notamDate <= endDate) {
                    // 添加到结果
                    result.CODE.push(data.CODE[i]);
                    result.COORDINATES.push(data.COORDINATES[i]);
                    result.TIME.push(data.TIME[i]);
                    result.PLATID.push(data.PLATID?.[i] || 'UNKNOWN');
                    result.RAWMESSAGE.push(data.RAWMESSAGE?.[i] || '');
                    result.ALTITUDE.push(data.ALTITUDE?.[i] || 'Unknown');
                    
                    // 收集分类信息
                    for (const [group, codes] of Object.entries(data.CLASSIFY || {})) {
                        if (codes.includes(data.CODE[i])) {
                            if (!classifyMap[group]) {
                                classifyMap[group] = [];
                            }
                            if (!classifyMap[group].includes(data.CODE[i])) {
                                classifyMap[group].push(data.CODE[i]);
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
    
    console.log(`筛选结果: 共 ${result.NUM} 条航警在 ${baseDate.toISOString().split('T')[0]} 前后15天内`);
    return result;
}

// 搜索历史航警 - 改为前端加载本地数据
async function searchArchiveNotams(dateStr) {
    console.log('开始搜索历史航警...', { dateStr });
    
    const btnSearch = document.getElementById('btnSearchArchive');
    const originalText = btnSearch.textContent;

    // 显示加载状态
    btnSearch.innerHTML = '正在检索<span class="btn-spinner"></span>';
    btnSearch.disabled = true;
    btnSearch.style.opacity = '0.8';

    try {
        // 解析选择的日期
        const baseDate = new Date(dateStr);
        
        // 获取相关月份
        const relatedMonths = getRelatedMonths(baseDate);
        console.log('需要加载的月份:', relatedMonths);
        
        // 加载所有相关月份的数据
        const loadDataPromises = relatedMonths.map(month => 
            loadLocalArchiveMonthData(month.year, month.month)
        );
        
        const allMonthData = await Promise.all(loadDataPromises);
        
        // 筛选日期范围内的航警
        const filteredData = filterNotamsWithinDateRange(allMonthData, baseDate);

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

        showNotification(`检索成功：找到 ${filteredData.NUM} 条航警 (前后15天内)`);

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
            archiveDict.RAWMESSAGE?.[i] || ""
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
function drawArchiveNotam(COORstrin, timee, codee, numm, col, rawmessage) {
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

    // 创建多边形
    var tmpPolygon = L.polygon(latlngs, {
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
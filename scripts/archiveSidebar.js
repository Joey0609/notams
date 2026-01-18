// archiveSidebar.js
let sidebarOpen = false;

function toggleSidebar() {
    const sidebar = document.getElementById('notamSidebar');
    const listPage = document.getElementById('notamListPage');
    
    if (window.innerWidth <= 768) {
        if (!sidebar.classList.contains('open')) {
            sidebar.style.height = '35vh';
        }
    } else {
        sidebar.style.height = '';
    }
    
    // 打开时确保显示航警列表页
    if (!sidebar.classList.contains('open')) {
        listPage.style.display = 'block';
    }
    
    sidebar.classList.toggle('open');
    sidebarOpen = sidebar.classList.contains('open');
}

(function initDraggableSidebar() {
    const sidebarHeader = document.getElementById('notamSidebarHeader');
    const sidebar = document.getElementById('notamSidebar');
    
    let startY = 0;
    let startHeight = 0;
    let isDragging = false;
    const MIN_HEIGHT = 60;  // 最小高度（只露出标题栏）
    const CLOSE_THRESHOLD = 80; // 拖到这个高度以下自动收起

    function isNarrowScreen() {
        return window.innerWidth <= 768;
    }

    function getClientY(e) {
        if (e.touches && e.touches.length > 0) {
            return e.touches[0].clientY;
        }
        return e.clientY;
    }

    function onDragStart(e) {
        if (!isNarrowScreen()) return;
        
        isDragging = true;
        startY = getClientY(e);
        startHeight = sidebar.offsetHeight;
        
        // 防止文本选择
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        
        // 添加拖拽中的样式
        if (sidebarHeader) sidebarHeader.style.cursor = 'grabbing';
        sidebar.style.transition = 'none'; // 拖拽时禁用过渡动画
    }

    function onDragMove(e) {
        if (!isDragging || !isNarrowScreen()) return;
        
        // 阻止默认行为，防止触发下拉刷新
        e.preventDefault();
        
        const currentY = getClientY(e);
        const deltaY = currentY - startY; // 正值 = 向下拖动
        let newHeight = startHeight - deltaY;
        
        // 限制高度范围
        const maxHeight = window.innerHeight * 0.9;
        newHeight = Math.max(MIN_HEIGHT, Math.min(newHeight, maxHeight));
        
        sidebar.style.height = `${newHeight}px`;
    }

    function onDragEnd(e) {
        if (!isDragging) return;
        
        isDragging = false;
        
        // 恢复样式
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
        if (sidebarHeader) sidebarHeader.style.cursor = '';
        sidebar.style.transition = ''; // 恢复过渡动画
        
        // 检查是否需要自动收起
        const currentHeight = sidebar.offsetHeight;
        if (currentHeight <= CLOSE_THRESHOLD) {
            // 先移除 open 类触发收起动画，保持当前高度不变
            sidebar.classList.remove('open');
            sidebarOpen = false;
            // 等收起动画完成后再重置高度
            setTimeout(() => {
                sidebar.style.height = '35vh';
            }, 350); // 与 CSS transition 时间一致
        }
    }

    // 鼠标事件
    if (sidebarHeader) {
        sidebarHeader.addEventListener('mousedown', onDragStart);
        sidebarHeader.addEventListener('touchstart', onDragStart, { passive: true });
        sidebarHeader.addEventListener('touchmove', function(e) {
            if (isDragging) {
                e.preventDefault();
            }
        }, { passive: false });
    }
    
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    // 触摸事件（移动端）
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('touchend', onDragEnd);
    document.addEventListener('touchcancel', onDragEnd);

    window.addEventListener('resize', function() {
        if (!isNarrowScreen()) {
            sidebar.style.height = '';
        } else if (sidebar.classList.contains('open')) {
            if (!sidebar.style.height) {
                sidebar.style.height = '35vh';
            }
        }
    });
})();


// 北京时间转换
function convertTime(utcTimeStr) {
    // 处理空值或无效值
    if (!utcTimeStr || utcTimeStr === 'null' || utcTimeStr === 'undefined') {
        return '时间未知';
    }
    
    const regex = /(\d{2}) (\w{3}) (\d{2}:\d{2}) (\d{4}) UNTIL (\d{2}) (\w{3}) (\d{2}:\d{2}) (\d{4})/;
    const match = utcTimeStr.match(regex);
    if (!match) {
        console.warn('时间格式不匹配:', utcTimeStr);
        return utcTimeStr; // 返回原始字符串
    }

    const [, startDay, startMonth, startTime, startYear, endDay, endMonth, endTime, endYear] = match;
    
    // 月份映射表（支持大小写）
    const monthMap = {
        'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 
        'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
        'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12',
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
        'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
        'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };

    function toLocal(day, month, time, year) {
        // 确保月份转为大写后再查找
        const monthUpper = month.toUpperCase();
        const monthNum = monthMap[monthUpper] || monthMap[month];
        
        if (!monthNum) {
            console.error('无法识别的月份:', month);
            return { y: 0, m: 0, d: 0, h: '00', i: '00' };
        }
        
        // 确保日期和月份是两位数
        const dayPadded = String(day).padStart(2, '0');
        const dateString = `${year}-${monthNum}-${dayPadded}T${time}:00Z`;
        
        const utc = new Date(dateString);
        
        if (isNaN(utc.getTime())) {
            console.error('无效的日期:', dateString);
            return { y: 0, m: 0, d: 0, h: '00', i: '00' };
        }
        
        const btc = new Date(utc.getTime() + 8 * 60 * 60 * 1000);
        return {
            y: btc.getUTCFullYear(),
            m: btc.getUTCMonth() + 1,
            d: btc.getUTCDate(),
            h: String(btc.getUTCHours()).padStart(2, "0"),
            i: String(btc.getUTCMinutes()).padStart(2, "0")
        };
    }

    const s = toLocal(startDay, startMonth, startTime, startYear);
    const e = toLocal(endDay, endMonth, endTime, endYear);
    
    return `${s.y}年${s.m}月${s.d}日 ${s.h}:${s.i} ~ ${e.y}年${e.m}月${e.d}日 ${e.h}:${e.i} 北京时间 (UTC+8)`;
}

// 全局状态变量
const visibleMatchState = {};
let polygonMatch = [];
let matchGroupColors = {};

// 更新侧边栏
function updateMatchSidebar() {
    const container = document.getElementById('notamList');
    const countEl = document.getElementById('notamCount');
    
    if (!matchData || !Array.isArray(matchData)) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#999">暂无匹配的历史航警</div>';
        countEl.textContent = 0;
        return;
    }
    console.log('更新匹配航警侧边栏，数量:', matchData.length);
    countEl.textContent = matchData.length;
    
    // 批量操作按钮
    let html = `
    <div style="font-weight: bold; padding: 10px; background: #ecf0f1; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <span>匹配的历史航警 (${matchData.length})</span>
        <div style="display: flex; gap: 5px;">
            <button onclick="event.stopPropagation(); showAllMatches()" title="全部显示" style="padding: 3px 8px; font-size: 12px; background: #3498db; color: white; border: none; border-radius: 3px; cursor: pointer;">全部显示</button>
            <button onclick="event.stopPropagation(); hideAllMatches()" title="全部隐藏" style="padding: 3px 8px; font-size: 12px; background: #3498db; color: white; border: none; border-radius: 3px; cursor: pointer;">全部隐藏</button>
        </div>
    </div>`;
    
    // 按排序后的顺序显示
    matchData.forEach((item, i) => {
        const rawTime = item.TIME || '';
        const prettyTime = convertTime(rawTime);
        const col = getMatchColor(item.CODE);
        const visible = visibleMatchState[i] !== false;
        const overlapArea = item.Overlapping_Area ?? 0;
        const centerDistance = item.Center_Distance ?? -1;
        
        html += `
        <div class="notam-item match-item" style="--group-color:${col}; cursor:pointer;"
            onmouseenter="this.style.background='rgba(0,0,0,0.06)'; hoverHighlightMatchNotam(${i});"
            onmouseleave="this.style.background=''; hoverUnhighlightMatchNotam(${i});"
            onclick="locateToMatchNotam(${i})">
            <div class="notam-content">
                <div class="notam-header">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="color-picker-wrapper" onclick="event.stopPropagation();">
                            <div class="color-preview" style="background:${col}">
                                <input type="color" class="color-picker" value="${col.substring(0, 7)}"
                                    onchange="event.stopPropagation(); changeMatchGroupColor('${item.CODE}', this.value, ${i})">
                            </div>
                        </div>
                        <span class="notam-code">${item.CODE}</span>
                    </div>
                </div>
                <div class="notam-time">
                    ${prettyTime}
                </div>
                <div class="match-info">
                    <span>${overlapArea > 0 ? `重叠面积: ${overlapArea.toFixed(1)}%` : `中心距离: ${centerDistance.toFixed(1)}km`}</span>
                    <span>${item.source_file || '未知来源'}</span>
                </div>
            </div>
            <div class="notam-actions">
                <button class="icon-btn"
                    onclick="event.stopPropagation(); copyMatchRaw(${i})"
                    title="复制原始航警">
                    <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/></svg>
                </button>
                <button class="icon-btn"
                    onclick="event.stopPropagation(); toggleMatchVisibility(${i})"
                    title="${visible ? '隐藏' : '显示'}">
                    ${visible
                    ? `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.85786 18C6.23858 21 4 24 4 24C4 24 12.9543 36 24 36C25.3699 36 26.7076 35.8154 28 35.4921M20.0318 12.5C21.3144 12.1816 22.6414 12 24 12C35.0457 12 44 24 44 24C44 24 41.7614 27 38.1421 30" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.3142 20.6211C19.4981 21.5109 19 22.6972 19 23.9998C19 26.7612 21.2386 28.9998 24 28.9998C25.3627 28.9998 26.5981 28.4546 27.5 27.5705" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M42 42L6 6" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
                    : `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 36C35.0457 36 44 24 44 24C44 24 35.0457 12 24 12C12.9543 12 4 24 4 24C4 24 12.9543 36 24 36Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/><path d="M24 29C26.7614 29 29 26.7614 29 24C29 21.2386 26.7614 19 24 19C21.2386 19 19 21.2386 19 24C19 26.7614 21.2386 29 24 29Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/></svg>`
                    }
                </button>
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
}

function toggleMatchVisibility(idx) {
    visibleMatchState[idx] = !visibleMatchState[idx];
    const poly = polygonMatch[idx];
    if (poly) {
        if (visibleMatchState[idx]) poly.addTo(map);
        else map.removeLayer(poly);
    }
    updateMatchSidebar();
}

function hoverHighlightMatchNotam(idx) {
    const poly = polygonMatch[idx];
    if (poly && visibleMatchState[idx] !== false) {
        poly.setStyle({
            weight: 3,
            opacity: 1,
            fillOpacity: 0.6
        });
        poly.bringToFront();
    }
}

function hoverUnhighlightMatchNotam(idx) {
    const poly = polygonMatch[idx];
    if (poly && visibleMatchState[idx] !== false) {
        poly.setStyle({
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.05
        });
    }
}

function showAllMatches() {
    if (!matchData || !Array.isArray(matchData)) return;
    for (let i = 0; i < matchData.length; i++) {
        visibleMatchState[i] = true;
        const poly = polygonMatch[i];
        if (poly) poly.addTo(map);
    }
    updateMatchSidebar();
}

function hideAllMatches() {
    if (!matchData || !Array.isArray(matchData)) return;
    for (let i = 0; i < matchData.length; i++) {
        visibleMatchState[i] = false;
        const poly = polygonMatch[i];
        if (poly) map.removeLayer(poly);
    }
    updateMatchSidebar();
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

// 通知函数 (如果未定义)
if (typeof showNotification === 'undefined') {
    window.showNotification = function(message) {
        console.log('Notification:', message);
    };
}
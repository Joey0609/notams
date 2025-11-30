function toggleSidebar() {
    const sidebar = document.getElementById('notamSidebar');
    if (!sidebar.classList.contains('open') && window.innerWidth <= 768) {
        sidebar.style.height = '35vh'; // Reset height when opening
    }
    sidebar.classList.toggle('open');
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
        sidebarHeader.style.cursor = 'grabbing';
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
        sidebarHeader.style.cursor = '';
        sidebar.style.transition = ''; // 恢复过渡动画
        
        // 检查是否需要自动收起
        const currentHeight = sidebar.offsetHeight;
        if (currentHeight <= CLOSE_THRESHOLD) {
            // 先移除 open 类触发收起动画，保持当前高度不变
            sidebar.classList.remove('open');
            // 等收起动画完成后再重置高度
            setTimeout(() => {
                sidebar.style.height = '35vh';
            }, 350); // 与 CSS transition 时间一致
        }
    }

    // 鼠标事件
    sidebarHeader.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    // 触摸事件（移动端）
    sidebarHeader.addEventListener('touchstart', onDragStart, { passive: true });
    document.addEventListener('touchmove', onDragMove, { passive: false }); // passive: false 允许 preventDefault
    document.addEventListener('touchend', onDragEnd);
    document.addEventListener('touchcancel', onDragEnd);

    // 防止在拖拽标题栏时触发页面的下拉刷新
    sidebarHeader.addEventListener('touchmove', function(e) {
        if (isDragging) {
            e.preventDefault();
        }
    }, { passive: false });

    // 窗口大小改变时重置
    window.addEventListener('resize', function() {
        if (!isNarrowScreen() && sidebar.classList.contains('open')) {
            sidebar.style.height = ''; // 宽屏模式清除高度设置
        }
    });
})();


// 北京时间转换（放在这里或 scripts.js 均可）
function convertTime(utcTimeStr) {
    const regex = /(\d{2}) (\w{3}) (\d{2}:\d{2}) (\d{4}) UNTIL (\d{2}) (\w{3}) (\d{2}:\d{2}) (\d{4})/;
    const match = utcTimeStr.match(regex);
    if (!match) return utcTimeStr;

    const [, startDay, startMonth, startTime, startYear, endDay, endMonth, endTime, endYear] = match;
    const monthMap = {
        JAN: "1", FEB: "2", MAR: "3", APR: "4", MAY: "5", JUN: "6",
        JUL: "7", AUG: "8", SEP: "9", OCT: "10", NOV: "11", DEC: "12"
    };

    function toLocal(day, month, time, year) {
        const utc = new Date(`${year}-${monthMap[month]}-${day}T${time}:00Z`);
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
    return `北京时间 ${s.y}年${s.m}月${s.d}日 ${s.h}:${s.i} ~ ${e.y}年${e.m}月${e.d}日 ${e.h}:${e.i}`;
}

function updateSidebar() {
    const container = document.getElementById('notamList');
    const countEl = document.getElementById('notamCount');

    if (!dict || dict.NUM === 0) {
        container.innerHTML = '<div style="text-align:center;color:#999;padding:30px;">暂无航警</div>';
        countEl.textContent = '0';
        return;
    }

    countEl.textContent = dict.NUM;

    let html = '';
    for (let i = 0; i < dict.NUM; i++) {
        const code = dict.CODE[i];
        const rawTime = dict.TIME[i] || '';
        const prettyTime = convertTime(rawTime);
        const rawMessage = dict.RAWMESSAGE?.[i] || '';
        const col = getColorForCode(code);
        const visible = visibleState[i] !== false;
        html += `
        <div class="notam-item" style="--group-color:${col}; cursor:pointer;"
            onmouseenter="this.style.background='rgba(0,0,0,0.06)'; hoverHighlightNotam(${i});"
            onmouseleave="this.style.background=''; hoverUnhighlightNotam(${i});"
            ontouchstart="this.style.background='rgba(0,0,0,0.06)'; hoverHighlightNotam(${i});"
            ontouchend="this.style.background=''; hoverUnhighlightNotam(${i});"
            onclick="locateToNotam(${i})">
            <div class="notam-content">
                <div class="notam-header">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="color-picker-wrapper" onclick="event.stopPropagation();">
                            <div class="color-preview" style="background:${col}">
                            <input type="color" class="color-picker" value="${col}"
                                onchange="event.stopPropagation(); changeGroupColor('${code}', this.value, ${i})">
                            </div>
                            
                        </div>

                        <span class="notam-code">${code}</span>
                    </div>

                    
                </div>
                <div class="notam-time">
                    ${prettyTime}
                </div>
            </div>
            <div class="notam-actions">
                    <button class="icon-btn"
                        onclick="event.stopPropagation(); copyRaw(${i})"
                        title="复制原始航警">
                        <!-- Copy Icon -->
                        <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/></svg>
                    </button>

                    <button class="icon-btn"
                        onclick="event.stopPropagation(); toggleVisibility(${i})"
                        title="${visible ? '隐藏' : '显示'}">
                        <!-- Dynamic visibility icon -->
                        ${visible
                ? `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.85786 18C6.23858 21 4 24 4 24C4 24 12.9543 36 24 36C25.3699 36 26.7076 35.8154 28 35.4921M20.0318 12.5C21.3144 12.1816 22.6414 12 24 12C35.0457 12 44 24 44 24C44 24 41.7614 27 38.1421 30" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.3142 20.6211C19.4981 21.5109 19 22.6972 19 23.9998C19 26.7612 21.2386 28.9998 24 28.9998C25.3627 28.9998 26.5981 28.4546 27.5 27.5705" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M42 42L6 6" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
                : `<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 36C35.0457 36 44 24 44 24C44 24 35.0457 12 24 12C12.9543 12 4 24 4 24C4 24 12.9543 36 24 36Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/><path d="M24 29C26.7614 29 29 26.7614 29 24C29 21.2386 26.7614 19 24 19C21.2386 19 19 21.2386 19 24C19 26.7614 21.2386 29 24 29Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/></svg>`

                         }
                    </button>
                </div>
            
        </div>`;
    }
    container.innerHTML = html;
}

/* 改变某个航警所属分组的颜色（同一个 CLASSIFY 分组所有航警一起改） */
function changeGroupColor(code, newColor, exampleIdx) {
    if (!dict || !dict.CLASSIFY) return;
    for (const [group, codes] of Object.entries(dict.CLASSIFY)) {
        if (codes.includes(code)) {
            groupColors[group] = newColor;
            break;
        }
    }
    // 重新绘制该组所有航警
    drawAllAutoNotams();
    updateSidebar();
}

/* 复制原始航警 → 美观通知 */
function copyRaw(idx) {
    const raw = dict.RAWMESSAGE?.[idx] || '';
    // 使用 scripts.js 中定义的通用复制函数
    if (typeof handleCopy === 'function') {
        handleCopy(raw);
    } else {
        // 回退方案
        fallbackCopyText(raw);
    }
}

/* 回退复制方案（兼容安卓 WebView） */
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

/* 显示/隐藏单条 */
function toggleVisibility(idx) {
    visibleState[idx] = !visibleState[idx];
    const poly = polygonAuto[idx];
    if (poly) {
        if (visibleState[idx]) poly.addTo(map);
        else map.removeLayer(poly);
    }
    updateSidebar();
}
document.getElementById('btnRefresh').onclick = () => {
    refetchData();
}
document.getElementById('btnShowAll').onclick = () => {
    for (let i = 0; i < dict.NUM; i++) visibleState[i] = true;
    polygonAuto.forEach(p => p && p.addTo(map));
    updateSidebar();
};

document.getElementById('btnHideAll').onclick = () => {
    for (let i = 0; i < dict.NUM; i++) visibleState[i] = false;
    polygonAuto.forEach(p => p && map.removeLayer(p));
    updateSidebar();
};
/* 定位 */
function locateToNotam(index) {
    if (!dict || index >= dict.NUM) return;
    try {
        const points = parseCoordinatesToPoints(dict.COORDINATES[index]);
        if (points && points.length > 0) {
            const bounds = L.latLngBounds(points);
            map.fitBounds(bounds, { padding: [80, 80], maxZoom: 6 });
        }
    } catch (e) { console.error(e); }
}
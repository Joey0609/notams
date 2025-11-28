function toggleSidebar() {
    const sidebar = document.getElementById('notamSidebar');
    if (!sidebar.classList.contains('open') && window.innerWidth <= 768) {
        sidebar.style.height = '50vh'; // Reset height when closing
    }
    sidebar.classList.toggle('open');
}
// 可拖拽侧边栏头部以调整高度（仅窄屏时启用）
const sidebarHeader = document.getElementById('notamSidebarHeader');
let startY, startTop, isDragging = false;
function handleStartDrag(e) {
    isDragging = true;
    startY = e.clientY;
    const sidebar = document.getElementById('notamSidebar');
    startTop = parseInt(window.getComputedStyle(sidebar).height, 10);
    document.body.style.userSelect = 'none'; // Prevent text selection
};
function handleDrag(e) {
    if (isDragging) {
        const sidebar = document.getElementById('notamSidebar');
        const newTop = Math.min(startTop - (e.clientY - startY), window.innerHeight * 0.9);
        if (newTop < 10) {
            sidebar.classList.toggle('open');
            isDragging = false;
            document.body.style.userSelect = '';
            return;
        }
        sidebar.style.height = `${Math.max(0, newTop)}px`; // Prevent moving out of view
    }
}
function handleEndDrag(e) {
    isDragging = false;
    document.body.style.userSelect = ''; // Restore text selection
}

if (window.innerWidth <= 768) { // Narrow screen condition
    sidebarHeader.addEventListener('mousedown', (e) => handleStartDrag(e));
    sidebarHeader.addEventListener('touchstart', (e) => handleStartDrag(e.touches[0]),{ passive: false});
    document.addEventListener('mousemove', (e) => handleDrag(e));
    document.addEventListener('touchmove', (e) => handleDrag(e.touches[0]),{ passive: false});
    document.addEventListener('mouseup', (e) => handleEndDrag(e));
    document.addEventListener('touchend', (e) => handleEndDrag(e.changedTouches[0]),{ passive: false});
}


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

    if (!dict || dict.NUM === 0) {
        container.innerHTML = '<div style="text-align:center;color:#999;padding:30px;">暂无航警</div>';
        return;
    }

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
            onmouseover="this.style.background='rgba(0,0,0,0.06)'"
            onmouseout="this.style.background=''"
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
    navigator.clipboard.writeText(raw).then(() => {
        showNotification('已复制原始航警到剪贴板');
    }).catch(() => {
        showNotification('复制失败');
    });
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
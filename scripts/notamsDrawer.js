let expanded = false;
let warningCount = 0;
let manualNotams = []; // 存储手动绘制的航警信息
let manualVisibleState = {}; // 存储每个手动航警的显示/隐藏状态
let manualPolygons = []; // 存储手动绘制的多边形对象

// 地图交互绘制相关变量
let isMapDrawing = false; // 是否正在地图绘制模式
let drawingPoints = []; // 当前绘制的点
let drawingPolyline = null; // 临时绘制的折线
let drawingMarkers = []; // 临时绘制的标记点
let isAltPressed = false; // 是否按住Alt键
let tempLine = null; // 鼠标跟随的临时线

// 切换到手动绘制页面
function toggleManualDrawer() {
    const sidebar = document.getElementById('notamSidebar');
    const listPage = document.getElementById('notamListPage');
    const manualPage = document.getElementById('manualDrawPage');
    
    // 根据屏幕宽度设置或清除高度
    if (window.innerWidth <= 768) {
        // 窄屏模式：设置高度
        if (!sidebar.classList.contains('open')) {
            sidebar.style.height = '35vh';
        }
    } else {
        // 宽屏模式：清除高度设置
        sidebar.style.height = '';
    }
    
    if (sidebar.classList.contains('open') && manualPage.style.display === 'block') {
        // 如果手动绘制页面已打开，则关闭侧边栏
        sidebar.classList.remove('open');
    } else {
        // 打开侧边栏并切换到手动绘制页面
        sidebar.classList.add('open');
        listPage.style.display = 'none';
        manualPage.style.display = 'block';
        updateManualList();
        initColorPicker();
    }
}

// 初始化颜色选择器
function initColorPicker() {
    const colorPicker = document.getElementById('manualColorPicker');
    const colorPreview = document.getElementById('manualColorPreview');
    
    if (colorPicker && colorPreview) {
        // 初始化颜色
        colorPreview.style.background = colorPicker.value;
        
        // 监听颜色变化
        colorPicker.addEventListener('input', function() {
            colorPreview.style.background = this.value;
        });
    }
}

// 切换到航警列表页面
function switchToListPage() {
    const listPage = document.getElementById('notamListPage');
    const manualPage = document.getElementById('manualDrawPage');
    
    listPage.style.display = 'block';
    manualPage.style.display = 'none';
}

// 从航警列表页切换到手动绘制页
function switchToManualPage() {
    const listPage = document.getElementById('notamListPage');
    const manualPage = document.getElementById('manualDrawPage');
    
    listPage.style.display = 'none';
    manualPage.style.display = 'block';
    updateManualList();
}

// 旧的toggleDrawer函数保留兼容性
function toggleDrawer() {
    toggleManualDrawer();
}

function drawWarning() {
    const text = document.getElementById('warningInput').value.trim();
    const colorInput = document.getElementById('manualColorPicker');
    const color = colorInput ? colorInput.value : '#0078ff';
    
    const coordPattern = /[NS]\d{4,6}[WE]\d{5,7}/;
    const coordPattern2= /\d{4,6}[NS]\d{5,7}[WE]/;
    const coordPattern3= /\d{1,3}-\d{1,2}\.\d{1,2}[NS]\/\d{1,3}-\d{1,2}\.\d{1,2}[WE]/;
    const coordPattern4= /\d{1,3}-\d{1,2}\.\d{1,2}[NS]\d{1,3}-\d{1,2}\.\d{1,2}[WE]/;
    
    let targ=text.replace(/{[^}]+}/g, '');
    targ = targ.replace(/%[^%]+%/g, ''); 
    targ = targ.replace(/[\r\n]+/g, '');
    targ = targ.replace(/\s+/g, '');
    
    if (!coordPattern.test(targ)&&!coordPattern2.test(targ)&&!coordPattern3.test(targ)&&!coordPattern4.test(targ)) {
        alert("请输入正确的航警，格式应包含有效的坐标\n（如：N394838E1005637-N391617E1005933-N392001E1021555-N395223E1021334\n或：074700N1200200E-081000N1203300E-081300N1203800E-071800N1212200E\n或：19-14.25N/112-28.12E、19-15.43N/112-56.63E、18-21.26N/112-59.02E和18-20.09N/112-30.66E）");
        return;
    }

    if (!text) {
        alert("请填写内容！");
        return;
    }
    
    warningCount++;
    const num = warningCount;
    const notamId = `航警-${num}`;

    // 解析坐标并绘制
    const parsedCoords = parseNotamCoordinates(text);
    if (!parsedCoords || parsedCoords.length < 3) {
        alert("无法解析足够的坐标点（至少需要3个）");
        return;
    }

    // 绘制多边形
    const polygon = L.polygon(parsedCoords, {
        color: color,
        fillColor: color,
        fillOpacity: 0.3,
        weight: 2
    }).addTo(map);

    // 保存手动航警信息
    manualNotams.push({
        id: notamId,
        coords: parsedCoords,
        originalText: text,  // 保存原始输入文本
        color: color,
        polygon: polygon
    });
    
    manualVisibleState[notamId] = true;
    manualPolygons.push(polygon);

    // 更新手动航警列表
    updateManualList();

    // 清空输入框
    document.getElementById('warningInput').value = '';
    
    // 将地图视图调整到新绘制的区域
    map.fitBounds(polygon.getBounds());
    
    showNotification(`已添加手动航警 ${notamId}`, 'success');
}

// 对多边形坐标点进行排序（与scripts.js中的函数相同）
function sortPolygonPointsManual(latlngs) {
    if (latlngs.length < 3) return latlngs;
    
    // 计算中心点（质心）
    let centerLat = 0, centerLng = 0;
    for (let i = 0; i < latlngs.length; i++) {
        centerLat += latlngs[i][0];
        centerLng += latlngs[i][1];
    }
    centerLat /= latlngs.length;
    centerLng /= latlngs.length;
    
    // 按照相对于中心点的极角排序
    const sortedPoints = latlngs.slice().sort((a, b) => {
        const angleA = Math.atan2(a[0] - centerLat, a[1] - centerLng);
        const angleB = Math.atan2(b[0] - centerLat, b[1] - centerLng);
        return angleA - angleB;
    });
    
    return sortedPoints;
}

// 解析NOTAM坐标的辅助函数
function parseNotamCoordinates(text) {
    text = text.replace(/{[^}]+}/g, ''); 
    text = text.replace(/%[^%]+%/g, ''); 
    text = text.replace(/[\r\n]+/g, '');
    text = text.replace(/\s+/g, '');
    
    const coorRegex = /[NS]\d{4,6}[WE]\d{5,7}(?:-[NS]\d{4,6}[WE]\d{5,7})*/g;
    let coor = text.match(coorRegex);
    
    if(coor==null){
        coor=processCoordinates(text);      
    }
    if(coor==null){
        coor=processCoordinates2(text)
    }
    if(coor==null){
        coor=processCoordinates3(text);
    }
    if(coor==null){
        coor=processCoordinates4(text);
    }
    
    if (!coor || coor.length === 0) return null;
    
    // 将坐标字符串转换为经纬度数组
    const coordStr = coor[0];
    const coordParts = coordStr.split('-');
    const latLngs = [];
    
    for (let part of coordParts) {
        const latLng = parseCoordString(part);
        if (latLng) {
            latLngs.push(latLng);
        }
    }
    
    // 对坐标点排序，确保多边形是凸的或至少是合理的形状
    if (latLngs.length >= 3) {
        return sortPolygonPointsManual(latLngs);
    }
    
    return latLngs;
}

// 解析单个坐标字符串（如 N394838E1005637）
function parseCoordString(coordStr) {
    // 匹配 N/S + 数字 + E/W + 数字 格式
    const match = coordStr.match(/([NS])(\d{4,6})([EW])(\d{5,7})/);
    if (!match) return null;
    
    const latDir = match[1];
    const latStr = match[2];
    const lngDir = match[3];
    const lngStr = match[4];
    
    // 解析纬度
    let lat;
    if (latStr.length === 6) { // DDMMSS
        const deg = parseInt(latStr.substring(0, 2));
        const min = parseInt(latStr.substring(2, 4));
        const sec = parseInt(latStr.substring(4, 6));
        lat = deg + min/60 + sec/3600;
    } else if (latStr.length === 4) { // DDMM
        const deg = parseInt(latStr.substring(0, 2));
        const min = parseInt(latStr.substring(2, 4));
        lat = deg + min/60;
    }
    if (latDir === 'S') lat = -lat;
    
    // 解析经度
    let lng;
    if (lngStr.length === 7) { // DDDMMSS
        const deg = parseInt(lngStr.substring(0, 3));
        const min = parseInt(lngStr.substring(3, 5));
        const sec = parseInt(lngStr.substring(5, 7));
        lng = deg + min/60 + sec/3600;
    } else if (lngStr.length === 5) { // DDDMM
        const deg = parseInt(lngStr.substring(0, 3));
        const min = parseInt(lngStr.substring(3, 5));
        lng = deg + min/60;
    }
    if (lngDir === 'W') lng = -lng;
    
    return [lat, lng];
}
function processCoordinates(textCforCoor) {
    const subPattern = /\d{6}[NS]\d{7}[WE]/g;
    const tmp = textCforCoor.match(subPattern) || [];
    if (tmp.length > 2) {
        const result = tmp.map(m => 
            m[6] + m.substring(0, 6) + m.slice(-1) + m.substring(7, m.length - 1)
        ).join('-');
        let st=[];
        st[0]=result;
        return st;
    }
    return null;
}
function processCoordinates2(textCforCoor) {
    const subPattern = /\d{4}[NS]\d{5}[WE]/g;
    const tmp = textCforCoor.match(subPattern) || [];
    if (tmp.length > 2) {
        const result = tmp.map(m => 
            m[4] + m.substring(0, 4) + m.slice(-1) + m.substring(5, m.length - 1)
        ).join('-');
        let st=[];
        st[0]=result;
        return st;
    }
    return null;
}
function processCoordinates3(textCforCoor) {
    const subPattern = /\d{1,3}-\d{1,2}\.\d{1,2}[NS]\/\d{1,3}-\d{1,2}\.\d{1,2}[WE]/g;
    const tmp = textCforCoor.match(subPattern) || [];
    
    if (tmp.length >= 1) {
        const result = tmp.map(coord => {
            const parts = coord.split('/');
            const latPart = parts[0];
            const lonPart = parts[1];
            const latMatch = latPart.match(/(\d{1,3})-(\d{1,2})\.(\d{1,2})([NS])/);
            const latDeg = parseInt(latMatch[1]);
            const latMinInt = parseInt(latMatch[2]);
            const latMinDec = parseInt(latMatch[3]);
            const latDir = latMatch[4];
            const latSec = Math.round(latMinDec * 60 / 100);
            const lonMatch = lonPart.match(/(\d{1,3})-(\d{1,2})\.(\d{1,2})([WE])/);
            const lonDeg = parseInt(lonMatch[1]);
            const lonMinInt = parseInt(lonMatch[2]);
            const lonMinDec = parseInt(lonMatch[3]);
            const lonDir = lonMatch[4];
            const lonSec = Math.round(lonMinDec * 60 / 100);
            const formattedLat = latDir + 
                latDeg.toString().padStart(2, '0') + 
                latMinInt.toString().padStart(2, '0') + 
                latSec.toString().padStart(2, '0');
            const formattedLon = lonDir + 
                lonDeg.toString().padStart(3, '0') + 
                lonMinInt.toString().padStart(2, '0') + 
                lonSec.toString().padStart(2, '0');
            return formattedLat + formattedLon;
        }).join('-');
        let st = [];
        st[0] = result;
        return st;
    }
    return null;
}
function processCoordinates4(textCforCoor) {
    const subPattern = /\d{1,3}-\d{1,2}\.\d{1,2}[NS]\d{1,3}-\d{1,2}\.\d{1,2}[WE]/g;
    const tmp = textCforCoor.match(subPattern) || [];
    if (tmp.length >= 1) {
        const result = tmp.map(coord => {
            const parts = coord.match(/(\d{1,3}-\d{1,2}\.\d{1,2}[NS])(\d{1,3}-\d{1,2}\.\d{1,2}[WE])/);
            const latPart = parts[1];
            const lonPart = parts[2];
            const latMatch = latPart.match(/(\d{1,3})-(\d{1,2})\.(\d{1,2})([NS])/);
            const latDeg = parseInt(latMatch[1]);
            const latMinInt = parseInt(latMatch[2]);
            const latMinDec = parseInt(latMatch[3]);
            const latDir = latMatch[4];
            const latSec = Math.round(latMinDec * 60 / 100);
            const lonMatch = lonPart.match(/(\d{1,3})-(\d{1,2})\.(\d{1,2})([WE])/);
            const lonDeg = parseInt(lonMatch[1]);
            const lonMinInt = parseInt(lonMatch[2]);
            const lonMinDec = parseInt(lonMatch[3]);
            const lonDir = lonMatch[4];
            const lonSec = Math.round(lonMinDec * 60 / 100);
            const formattedLat = latDir + 
                latDeg.toString().padStart(2, '0') + 
                latMinInt.toString().padStart(2, '0') + 
                latSec.toString().padStart(2, '0');
            const formattedLon = lonDir + 
                lonDeg.toString().padStart(3, '0') + 
                lonMinInt.toString().padStart(2, '0') + 
                lonSec.toString().padStart(2, '0');
            return formattedLat + formattedLon;
        }).join('-');
        let st = [];
        st[0] = result;
        return st;
    }
    return null;
}
function selfDrawNot(text, color, num) {
    text = text.replace(/{[^}]+}/g, ''); 
    text = text.replace(/%[^%]+%/g, ''); 
    text = text.replace(/[\r\n]+/g, '');
    text = text.replace(/\s+/g, '');
    const coorRegex = /[NS]\d{4,6}[WE]\d{5,7}(?:-[NS]\d{4,6}[WE]\d{5,7})*/g;
    // const timeRegex = /(\d{2} [A-Z]{3} \d{2}:\d{2} \d{4} UNTIL \d{2} [A-Z]{3} \d{2}:\d{2} \d{4})/;
    const codeRegex = /A\d{4}\/\d{2}/g;
    let coor = text.match(coorRegex);
    if(coor==null){
        coor=processCoordinates(text);      
    }
    if(coor==null){
        coor=processCoordinates2(text)
    }
    if(coor==null){
        coor=processCoordinates3(text);
    }
    if(coor==null){
        coor=processCoordinates4(text);
    }
    // alert(coor);
    // const time = text.match(timeRegex);
    const code = text.match(codeRegex);
    // alert(coor[0]);
    drawNot(coor[0], "null", code, null, num, color, 1);
}

function notRemove(num) {
    if (polygon[num]) {
        map.removeLayer(polygon[num]);
        polygon[num] = null;
    }
}

// 更新手动航警列表
function updateManualList() {
    const container = document.getElementById('manualListContainer');
    const countSpan = document.getElementById('manualCount');
    
    if (!container) return;
    
    // 更新计数
    if (countSpan) {
        countSpan.textContent = manualNotams.length;
    }
    
    container.innerHTML = '';
    
    if (manualNotams.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #7f8c8d;">暂无手动绘制的航警</div>';
        return;
    }
    
    // 添加批量操作按钮 - 样式与自动航警一致
    let html = '<div style="font-weight: bold; padding: 10px 15px; background: #ecf0f1; display: flex; justify-content: space-between; align-items: center;">' +
        '<span>手动绘制 (' + manualNotams.length + ')</span>' +
        '<div style="display: flex; gap: 5px;">' +
        '<button onclick="event.stopPropagation(); showAllManual()" title="全部显示" style="padding: 3px 8px; font-size: 12px; background: #3498db; color: white; border: none; border-radius: 3px; cursor: pointer; transition: all 0.2s;" onmouseenter="this.style.background=\'#2980b9\'; this.style.transform=\'translateY(-1px)\'; this.style.boxShadow=\'0 2px 5px rgba(0,0,0,0.2)\'" onmouseleave="this.style.background=\'#3498db\'; this.style.transform=\'translateY(0)\'; this.style.boxShadow=\'none\'" onmousedown="this.style.transform=\'translateY(0)\'; this.style.boxShadow=\'0 1px 2px rgba(0,0,0,0.2)\'" onmouseup="this.style.transform=\'translateY(-1px)\'; this.style.boxShadow=\'0 2px 5px rgba(0,0,0,0.2)\'">全部显示</button>' +
        '<button onclick="event.stopPropagation(); hideAllManual()" title="全部隐藏" style="padding: 3px 8px; font-size: 12px; background: #3498db; color: white; border: none; border-radius: 3px; cursor: pointer; transition: all 0.2s;" onmouseenter="this.style.background=\'#2980b9\'; this.style.transform=\'translateY(-1px)\'; this.style.boxShadow=\'0 2px 5px rgba(0,0,0,0.2)\'" onmouseleave="this.style.background=\'#3498db\'; this.style.transform=\'translateY(0)\'; this.style.boxShadow=\'none\'" onmousedown="this.style.transform=\'translateY(0)\'; this.style.boxShadow=\'0 1px 2px rgba(0,0,0,0.2)\'" onmouseup="this.style.transform=\'translateY(-1px)\'; this.style.boxShadow=\'0 2px 5px rgba(0,0,0,0.2)\'">全部隐藏</button>' +
        '<button onclick="event.stopPropagation(); removeAllManual()" title="清空全部" style="padding: 3px 8px; font-size: 12px; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer; transition: all 0.2s;" onmouseenter="this.style.background=\'#c0392b\'; this.style.transform=\'translateY(-1px)\'; this.style.boxShadow=\'0 2px 5px rgba(0,0,0,0.2)\'" onmouseleave="this.style.background=\'#e74c3c\'; this.style.transform=\'translateY(0)\'; this.style.boxShadow=\'none\'" onmousedown="this.style.transform=\'translateY(0)\'; this.style.boxShadow=\'0 1px 2px rgba(0,0,0,0.2)\'" onmouseup="this.style.transform=\'translateY(-1px)\'; this.style.boxShadow=\'0 2px 5px rgba(0,0,0,0.2)\'">清空</button>' +
        '</div>' +
        '</div>';
    
    // 渲染每个手动航警 - 紧凑布局：标题在上，横排按钮在下
    manualNotams.forEach((notam, index) => {
        const visible = manualVisibleState[notam.id] !== false;
        html += `
        <div class="manual-notam-item" style="--group-color:${notam.color}; cursor:pointer; margin-bottom: 8px; padding: 10px; border-radius: 6px; background: #f8f9fa; border-left: 5px solid ${notam.color}; ${visible ? '' : 'opacity:0.5;'}"
            onclick="locateToManualNotam('${notam.id}')"
            onmouseenter="this.style.background='rgba(0,0,0,0.06)'; hoverHighlightManual('${notam.id}');"
            onmouseleave="this.style.background='#f8f9fa'; hoverUnhighlightManual('${notam.id}');">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom: 8px;">
                <div class="color-picker-wrapper" onclick="event.stopPropagation();">
                    <div class="color-preview" style="background:${notam.color}">
                        <input type="color" class="color-picker" value="${notam.color.substring(0, 7)}"
                            onchange="event.stopPropagation(); changeManualColor('${notam.id}', this.value); this.parentElement.style.background=this.value;">
                    </div>
                </div>
                <span style="font-weight: bold; color: #2c3e50;">${notam.id}</span>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="icon-btn" onclick="event.stopPropagation(); copyManualCoords('${notam.id}')" title="复制坐标">
                    <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/></svg>
                </button>
                <button class="icon-btn" onclick="event.stopPropagation(); toggleManualVisibility('${notam.id}')" title="${visible ? '隐藏' : '显示'}">
                    ${visible ?
                        '<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.85786 18C6.23858 21 4 24 4 24C4 24 12.9543 36 24 36C25.3699 36 26.7076 35.8154 28 35.4921M20.0318 12.5C21.3144 12.1816 22.6414 12 24 12C35.0457 12 44 24 44 24C44 24 41.7614 27 38.1421 30" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.3142 20.6211C19.4981 21.5109 19 22.6972 19 23.9998C19 26.7612 21.2386 28.9998 24 28.9998C25.3627 28.9998 26.5981 28.4546 27.5 27.5705" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M42 42L6 6" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>' :
                        '<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 36C35.0457 36 44 24 44 24C44 24 35.0457 12 24 12C12.9543 12 4 24 4 24C4 24 12.9543 36 24 36Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/><path d="M24 29C26.7614 29 29 26.7614 29 24C29 21.2386 26.7614 19 24 19C21.2386 19 19 21.2386 19 24C19 26.7614 21.2386 29 24 29Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/></svg>'
                    }
                </button>
                <button class="icon-btn" onclick="event.stopPropagation(); removeManual('${notam.id}')" title="删除">
                    <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 10V44H39V10H9Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/><path d="M20 20V33" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M28 20V33" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 10H44" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 10L19.289 4H28.7771L32 10H16Z" fill="none" stroke="#333" stroke-width="4" stroke-linejoin="round"/></svg>
                </button>
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
}

// 悬停高亮手动航警
function hoverHighlightManual(notamId) {
    const notam = manualNotams.find(n => n.id === notamId);
    if (notam && notam.polygon && manualVisibleState[notamId]) {
        notam.polygon.setStyle({
            weight: 4,
            opacity: 1,
            fillOpacity: 0.5
        });
    }
}

// 取消悬停高亮
function hoverUnhighlightManual(notamId) {
    const notam = manualNotams.find(n => n.id === notamId);
    if (notam && notam.polygon && manualVisibleState[notamId]) {
        notam.polygon.setStyle({
            weight: 2,
            opacity: 1,
            fillOpacity: 0.3
        });
    }
}

// 定位到手动航警
function locateToManualNotam(notamId) {
    const notam = manualNotams.find(n => n.id === notamId);
    if (notam && notam.polygon) {
        map.fitBounds(notam.polygon.getBounds());
    }
}

// 更改手动航警颜色
function changeManualColor(notamId, newColor) {
    const notam = manualNotams.find(n => n.id === notamId);
    if (notam) {
        notam.color = newColor;
        if (notam.polygon) {
            notam.polygon.setStyle({
                color: newColor,
                fillColor: newColor
            });
        }
        // 立即更新列表显示
        updateManualList();
    }
}

// 切换手动航警显示/隐藏
function toggleManualVisibility(notamId) {
    const notam = manualNotams.find(n => n.id === notamId);
    if (notam && notam.polygon) {
        const newState = !manualVisibleState[notamId];
        manualVisibleState[notamId] = newState;
        
        if (newState) {
            notam.polygon.addTo(map);
        } else {
            map.removeLayer(notam.polygon);
        }
        
        updateManualList();
    }
}

// 复制手动航警坐标
function copyManualCoords(notamId) {
    const notam = manualNotams.find(n => n.id === notamId);
    if (notam) {
        // 使用原始输入文本（如果有），否则回退到格式化坐标
        const coordsStr = notam.originalText || notam.coords.map(c => `${c[0]}, ${c[1]}`).join('\n');
        
        if (typeof handleCopy === 'function') {
            handleCopy(coordsStr);
        } else {
            navigator.clipboard.writeText(coordsStr).then(() => {
                showNotification('已复制到剪贴板', 'success');
            }).catch(err => {
                console.error('复制失败:', err);
                showNotification('复制失败', 'error');
            });
        }
    }
}

// 删除单个手动航警
function removeManual(notamId) {
    const index = manualNotams.findIndex(n => n.id === notamId);
    if (index !== -1) {
        const notam = manualNotams[index];
        if (notam.polygon) {
            map.removeLayer(notam.polygon);
        }
        manualNotams.splice(index, 1);
        delete manualVisibleState[notamId];
        updateManualList();
        showNotification('已删除手动航警', 'success');
    }
}

// 全部显示手动航警
function showAllManual() {
    manualNotams.forEach(notam => {
        if (notam.polygon) {
            notam.polygon.addTo(map);
            manualVisibleState[notam.id] = true;
        }
    });
    updateManualList();
    showNotification('已显示全部手动航警', 'success');
}

// 全部隐藏手动航警
function hideAllManual() {
    manualNotams.forEach(notam => {
        if (notam.polygon) {
            map.removeLayer(notam.polygon);
            manualVisibleState[notam.id] = false;
        }
    });
    updateManualList();
    showNotification('已隐藏全部手动航警', 'success');
}

// 清空全部手动航警
function removeAllManual() {
    if (manualNotams.length === 0) return;
    
    if (confirm('确定要清空所有手动绘制的航警吗？')) {
        manualNotams.forEach(notam => {
            if (notam.polygon) {
                map.removeLayer(notam.polygon);
            }
        });
        manualNotams = [];
        manualVisibleState = {};
        manualPolygons = [];
        warningCount = 0;
        updateManualList();
        showNotification('已清空所有手动航警', 'success');
    }
}

function modeInitial(){
    clearAllPolygons();
    siteInit();
}

// ============ 地图交互绘制功能 ============

// 切换地图绘制模式
function toggleMapDrawing() {
    isMapDrawing = !isMapDrawing;
    const btn = document.getElementById('mapDrawToggleBtn');
    
    if (isMapDrawing) {
        // 开始绘制
        btn.textContent = '✓ 结束绘制';
        btn.style.background = '#e74c3c';
        startMapDrawing();
        showNotification('📍 开始绘制：点击添加点，右击闭合，按住Alt自动对齐5°角', 'info', 5000);
    } else {
        // 结束绘制
        btn.textContent = '📍 在地图中绘制';
        btn.style.background = '#27ae60';
        cancelMapDrawing();
    }
}

// 开始地图绘制
function startMapDrawing() {
    drawingPoints = [];
    drawingMarkers = [];
    
    // 改变鼠标样式
    document.getElementById('allmap').style.cursor = 'crosshair';
    
    // 监听键盘事件
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    // 监听地图点击事件
    map.on('click', handleMapClick);
    map.on('dblclick', finishDrawing);
    map.on('contextmenu', finishDrawing);
    map.on('mousemove', handleMouseMove);
}

// 取消地图绘制
function cancelMapDrawing() {
    // 清理临时图形
    clearDrawingTemp();
    
    // 恢复鼠标样式
    document.getElementById('allmap').style.cursor = '';
    
    // 移除事件监听
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('keyup', handleKeyUp);
    map.off('click', handleMapClick);
    map.off('dblclick', finishDrawing);
    map.off('contextmenu', finishDrawing);
    map.off('mousemove', handleMouseMove);
}

// 清理临时绘制元素
function clearDrawingTemp() {
    if (drawingPolyline) {
        map.removeLayer(drawingPolyline);
        drawingPolyline = null;
    }
    if (tempLine) {
        map.removeLayer(tempLine);
        tempLine = null;
    }
    drawingMarkers.forEach(marker => map.removeLayer(marker));
    drawingMarkers = [];
    drawingPoints = [];
}

// 键盘按下事件
function handleKeyDown(e) {
    if (e.key === 'Alt') {
        isAltPressed = true;
    }
}

// 键盘释放事件
function handleKeyUp(e) {
    if (e.key === 'Alt') {
        isAltPressed = false;
    }
}

// 处理地图点击
function handleMapClick(e) {
    if (!isMapDrawing) return;
    
    let point = [e.latlng.lat, e.latlng.lng];
    
    // 如果按住Alt且有上一个点，进行角度吸附
    if (isAltPressed && drawingPoints.length > 0) {
        point = snapToAngle(drawingPoints[drawingPoints.length - 1], point);
    }
    
    // 如果已有3个点，检查是否靠近初始点
    if (drawingPoints.length >= 3) {
        const distToFirst = map.distance(e.latlng, L.latLng(drawingPoints[0]));
        if (distToFirst < 50000) { // 50km内自动吸附
            point = drawingPoints[0];
            // 自动完成绘制
            setTimeout(() => finishDrawing(e), 100);
            return;
        }
    }
    
    // 添加点
    drawingPoints.push(point);
    
    // 添加标记
    const marker = L.circleMarker(point, {
        radius: 5,
        color: '#e74c3c',
        fillColor: '#e74c3c',
        fillOpacity: 0.8,
        weight: 2
    }).addTo(map);
    
    // 为第一个点添加特殊样式
    if (drawingPoints.length === 1) {
        marker.setStyle({
            radius: 7,
            color: '#27ae60',
            fillColor: '#27ae60'
        });
    }
    
    drawingMarkers.push(marker);
    
    // 更新折线
    updateDrawingPolyline();
}

// 鼠标移动事件
function handleMouseMove(e) {
    if (!isMapDrawing || drawingPoints.length === 0) return;
    
    let mousePoint = [e.latlng.lat, e.latlng.lng];
    
    // 如果按住Alt，显示角度吸附效果
    if (isAltPressed && drawingPoints.length > 0) {
        mousePoint = snapToAngle(drawingPoints[drawingPoints.length - 1], mousePoint);
    }
    
    // 如果已有3个点，检查是否靠近初始点
    if (drawingPoints.length >= 3) {
        const distToFirst = map.distance(e.latlng, L.latLng(drawingPoints[0]));
        if (distToFirst < 50000) { // 50km内高亮初始点
            mousePoint = drawingPoints[0];
            // 高亮第一个点
            if (drawingMarkers[0]) {
                drawingMarkers[0].setStyle({
                    radius: 9,
                    color: '#f39c12',
                    fillColor: '#f39c12'
                });
            }
        } else {
            // 恢复第一个点样式
            if (drawingMarkers[0]) {
                drawingMarkers[0].setStyle({
                    radius: 7,
                    color: '#27ae60',
                    fillColor: '#27ae60'
                });
            }
        }
    }
    
    // 更新临时线
    if (tempLine) {
        map.removeLayer(tempLine);
    }
    
    tempLine = L.polyline([drawingPoints[drawingPoints.length - 1], mousePoint], {
        color: '#3498db',
        weight: 2,
        dashArray: '5, 5',
        opacity: 0.7
    }).addTo(map);
}

// 将点吸附到5°整数倍的角度
function snapToAngle(fromPoint, toPoint) {
    const lat1 = fromPoint[0];
    const lng1 = fromPoint[1];
    const lat2 = toPoint[0];
    const lng2 = toPoint[1];
    
    // 计算角度（相对于正北方向）
    const dx = lng2 - lng1;
    const dy = lat2 - lat1;
    let angle = Math.atan2(dx, dy) * 180 / Math.PI; // 转换为度
    
    // 吸附到最近的5度整数倍
    const snappedAngle = Math.round(angle / 5) * 5;
    
    // 计算距离
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // 根据吸附后的角度计算新坐标
    const radians = snappedAngle * Math.PI / 180;
    const newLat = lat1 + distance * Math.cos(radians);
    const newLng = lng1 + distance * Math.sin(radians);
    
    return [newLat, newLng];
}

// 更新绘制中的折线
function updateDrawingPolyline() {
    if (drawingPolyline) {
        map.removeLayer(drawingPolyline);
    }
    
    if (drawingPoints.length > 1) {
        drawingPolyline = L.polyline(drawingPoints, {
            color: '#3498db',
            weight: 3,
            opacity: 0.8
        }).addTo(map);
    }
}

// 完成绘制
function finishDrawing(e) {
    if (e) {
        e.originalEvent.preventDefault();
    }
    
    if (!isMapDrawing || drawingPoints.length < 3) {
        if (drawingPoints.length > 0 && drawingPoints.length < 3) {
            showNotification('至少需要3个点才能形成区域', 'warning');
        }
        return;
    }
    
    // 获取当前颜色
    const colorInput = document.getElementById('manualColorPicker');
    const color = colorInput ? colorInput.value : '#3498db';
    
    // 创建多边形
    warningCount++;
    const notamId = `航警-${warningCount}`;
    
    const polygon = L.polygon(drawingPoints, {
        color: color,
        fillColor: color,
        fillOpacity: 0.3,
        weight: 2
    }).addTo(map);
    
    // 保存手动航警信息
    const coordsStr = drawingPoints.map((p, i) => `点${i+1}: ${p[0].toFixed(6)}, ${p[1].toFixed(6)}`).join('\n');
    manualNotams.push({
        id: notamId,
        coords: drawingPoints.slice(), // 复制数组
        originalText: coordsStr,
        color: color,
        polygon: polygon
    });
    
    manualVisibleState[notamId] = true;
    manualPolygons.push(polygon);
    
    // 更新列表
    updateManualList();
    
    // 调整视图
    map.fitBounds(polygon.getBounds());
    
    // 清理临时元素
    clearDrawingTemp();
    
    // 退出绘制模式
    isMapDrawing = false;
    const btn = document.getElementById('mapDrawToggleBtn');
    btn.textContent = '📍 在地图中绘制';
    btn.style.background = '#27ae60';
    cancelMapDrawing();
    
    showNotification(`✓ 已创建 ${notamId}（${drawingPoints.length}个点）`, 'success');
}
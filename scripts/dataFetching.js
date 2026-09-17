const loadingModal = document.getElementById('loadingModal');

function closeLoadingModal() {
    loadingModal.style.display = 'none';
}

function buildEmptyDataDict() {
    return { CODE: [], TIME: [], PLATID: [], RAWMESSAGE: [], ALTITUDE: [], SOURCE: [], FIR: [], GEOMETRY: [], CLASSIFY: {}, CLASSIFY_FOCUSED: {}, FOCUSED_NUM: 0, NUM: 0 };
}

function appendSection(target, section) {
    if (!section || typeof section !== 'object') return;
    const size = Number(section.NUM || 0);
    for (let i = 0; i < size; i++) {
        target.CODE.push(section.CODE?.[i] || ''); target.TIME.push(section.TIME?.[i] || '');
        target.PLATID.push(section.PLATID?.[i] || ''); target.RAWMESSAGE.push(section.RAWMESSAGE?.[i] || '');
        target.ALTITUDE.push(section.ALTITUDE?.[i] || 'None'); target.SOURCE.push(section.SOURCE?.[i] || 'NOTAM');
        target.FIR.push(section.FIR?.[i] || 'UNKNOWN'); target.GEOMETRY.push(section.GEOMETRY?.[i] || '');
    }
}

function normalizeDataPayload(raw) {
    // 顺序固定为 聚焦段 → 外部段 → MSI 段：页面行号即 data/archiveMatch/match{idx}.json 的编号
    const merged = buildEmptyDataDict();
    appendSection(merged, raw?.FOCUSED_NOTAM_DATA);
    appendSection(merged, raw?.NOTAM_DATA);
    appendSection(merged, raw?.MSI_DATA);
    merged.NUM = merged.CODE.length;
    merged.CLASSIFY_FOCUSED = raw?.FOCUSED_NOTAM_DATA?.CLASSIFY || {};
    merged.CLASSIFY = raw?.NOTAM_DATA?.CLASSIFY || {};
    // 只有前 FOCUSED_NUM 行（聚焦段）有 match{idx}.json
    merged.FOCUSED_NUM = Number(raw?.FOCUSED_NOTAM_DATA?.NUM || 0);
    return merged;
}
// 页面加载即获取一次；维护期间不请求 data_dict.json
if (!isSitePaused()) {
    loadingModal.style.display = 'block';
    fetch('data_dict.json', { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(data => {
            dict = normalizeDataPayload(data);
            assignAllGroupColors(dict.CLASSIFY_FOCUSED, dict.CLASSIFY);
            drawAllAutoNotams();
            updateSidebar();
        })
        .catch(err => {
            console.error(err);
            alert("获取航警失败，可能是网络问题或当前无相关航警。手动输入功能仍可使用。");
        })
        .finally(() => loadingModal.style.display = 'none');
}

let dict = null;

function drawAllAutoNotams() {
    clearAllPolygons();
    if (!dict || dict.NUM === 0) return;

    for (let i = 0; i < dict.NUM; i++) {
        const col = getColorForCode(dict.CODE[i]);
        drawNot(dict.TIME[i], dict.CODE[i], dict.ALTITUDE[i], i, col, 0, dict.RAWMESSAGE?.[i] || '', dict.SOURCE?.[i] || 'NOTAM', dict.FIR?.[i] || '', dict.GEOMETRY?.[i] || '');
        visibleState[i] = true;
    }
}

function clearAllPolygons() {
    // 只清除自动获取的航警，不清除历史航警
    polygonAuto.forEach(p => p && map.removeLayer(p));
    polygonAuto = [];
    visibleState = {};
    // 清除样式缓存，避免悬停时使用旧颜色
    if (typeof originalPolygonStyles !== 'undefined') {
        originalPolygonStyles = {};
    }
}

// 重新获取（按钮已移除，这里保留函数供以后可能使用）
function refetchData() {
    if (isSitePaused()) {
        showSitePausePage();
        return;
    }
    loadingModal.style.display = 'block';
    fetch('data_dict.json', { cache: 'no-cache' })
        .then(r => r.json())
        .then(data => {
            dict = normalizeDataPayload(data);
            assignAllGroupColors(dict.CLASSIFY_FOCUSED, dict.CLASSIFY);
            drawAllAutoNotams();
            updateSidebar();
        })
        .finally(() => loadingModal.style.display = 'none');
}

// function fetchInit() {
//     clearAllPolygons();
//     updateSidebar();
// }
// document.getElementById('fetchButton').addEventListener('click', () => {
//     refetchData();
// });

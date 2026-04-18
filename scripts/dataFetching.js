const loadingModal = document.getElementById('loadingModal');

function closeLoadingModal() {
    loadingModal.style.display = 'none';
}

function buildEmptyDataDict() {
    return {
        CODE: [],
        COORDINATES: [],
        TIME: [],
        PLATID: [],
        RAWMESSAGE: [],
        ALTITUDE: [],
        SOURCE: [],
        FIR: [],
        CLASSIFY: {},
        NUM: 0
    };
}

function appendSection(target, section) {
    if (!section || typeof section !== 'object') return;

    const codes = Array.isArray(section.CODE) ? section.CODE : [];
    const coords = Array.isArray(section.COORDINATES) ? section.COORDINATES : [];
    const times = Array.isArray(section.TIME) ? section.TIME : [];
    const ids = Array.isArray(section.PLATID) ? section.PLATID : [];
    const raws = Array.isArray(section.RAWMESSAGE) ? section.RAWMESSAGE : [];
    const alts = Array.isArray(section.ALTITUDE) ? section.ALTITUDE : [];
    const srcs = Array.isArray(section.SOURCE) ? section.SOURCE : [];
    const firs = Array.isArray(section.FIR) ? section.FIR : [];

    const size = Math.min(codes.length, coords.length, times.length, ids.length, raws.length);
    for (let i = 0; i < size; i++) {
        target.CODE.push(codes[i]);
        target.COORDINATES.push(coords[i]);
        target.TIME.push(times[i]);
        target.PLATID.push(ids[i]);
        target.RAWMESSAGE.push(raws[i]);
        target.ALTITUDE.push(alts[i] || 'None');
        target.SOURCE.push(srcs[i] || 'NOTAM');
        target.FIR.push(firs[i] || '');
    }
}

function normalizeDataPayload(raw) {
    if (!raw || typeof raw !== 'object') return buildEmptyDataDict();

    // 兼容旧结构：顶层就是可绘制数据
    if (Array.isArray(raw.CODE) && Array.isArray(raw.COORDINATES) && Array.isArray(raw.TIME)) {
        return raw;
    }

    // 新结构：拆分为 NOTAM_DATA / MSI_DATA
    const merged = buildEmptyDataDict();
    appendSection(merged, raw.NOTAM_DATA);
    appendSection(merged, raw.MSI_DATA);
    merged.NUM = merged.CODE.length;
    merged.CLASSIFY = raw.CLASSIFY || (raw.NOTAM_DATA && raw.NOTAM_DATA.CLASSIFY) || {};
    return merged;
}

// 页面加载即获取一次
loadingModal.style.display = 'block';
fetch('data_dict.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
        dict = normalizeDataPayload(data);
        assignGroupColors(dict.CLASSIFY || {});
        drawAllAutoNotams();
        updateSidebar();
    })
    .catch(err => {
        console.error(err);
        alert("获取航警失败，可能是网络问题或当前无相关航警。手动输入功能仍可使用。");
    })
    .finally(() => loadingModal.style.display = 'none');

let dict = null;

function drawAllAutoNotams() {
    clearAllPolygons();
    if (!dict || dict.NUM === 0) return;

    for (let i = 0; i < dict.NUM; i++) {
        const col = getColorForCode(dict.CODE[i]);
        drawNot(
            dict.COORDINATES[i],
            dict.TIME[i],
            dict.CODE[i],
            dict.ALTITUDE[i],
            i,
            col,
            0,
            dict.RAWMESSAGE?.[i] || "",
            dict.SOURCE?.[i] || 'NOTAM',
            dict.FIR?.[i] || ''
        );
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
    loadingModal.style.display = 'block';
    fetch('data_dict.json', { cache: 'no-cache' })
        .then(r => r.json())
        .then(data => {
            dict = normalizeDataPayload(data);
            assignGroupColors(dict.CLASSIFY || {});
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
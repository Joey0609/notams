const loadingModal = document.getElementById('loadingModal');

function closeLoadingModal() {
    loadingModal.style.display = 'none';
}

// 页面加载即获取一次
loadingModal.style.display = 'block';
fetch('data_dict.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
        dict = data;
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
            i,
            col,
            0,
            dict.RAWMESSAGE?.[i] || ""
        );
        visibleState[i] = true;
    }
}

function clearAllPolygons() {
    polygonAuto.forEach(p => p && map.removeLayer(p));
    polygonAuto = [];
    visibleState = {};
}

// 重新获取（按钮已移除，这里保留函数供以后可能使用）
function refetchData() {
    loadingModal.style.display = 'block';
    fetch('data_dict.json', { cache: 'no-cache' })
        .then(r => r.json())
        .then(data => {
            dict = data;
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
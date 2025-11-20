const loadingModal = document.getElementById('loadingModal');

// 关闭加载窗口的函数
function closeLoadingModal() {
    loadingModal.style.display = 'none';
}

loadingModal.style.display = 'block';

fetch('/fetch')
.then(response => {
if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
}
return response.json();
})
.then(fetch => {
    console.log(fetch);
    dict = fetch;
    clearAllPolygons();
    // siteInit();
    for(var i=0;i<dict.NUM;i++){
        drawNot(dict.COORDINATES[i],dict.TIME[i],dict.CODE[i],i,"blue",0,dict.RAWMESSAGE[i]);
    }
    if (autoListExpanded) {
        updateAutoListContent();
    }
})
.catch(error => {
    console.error('Error fetching data:', error);
    alert("可能由于以下原因未获取到航警!\n1、当前时间无中国航天相关航警（如有疏漏请反馈）。\n2、您的网络连接存在问题。\n3、用于爬取航警信息的网站炸了\n您可以继续使用手动输入功能。");
})
.finally(() => {
    loadingModal.style.display = 'none';
});

function clearAllPolygons() {
    for(let i = 0; i < polygonAuto.length; i++){
        if (polygonAuto[i]) {
            map.removeLayer(polygonAuto[i]);
        }
    }
    polygonAuto = [];

    for(let i = 0; i < polygon.length; i++){
        if (polygon[i]) {
            map.removeLayer(polygon[i]);
        }
    }
    polygon = [];

    removeHighlight();
}

function fetchInit(){
    for(let i = 0; i < polygonAuto.length; i++){
        if (polygonAuto[i]) {
            map.removeLayer(polygonAuto[i]);
        }
    }
    polygonAuto = [];
    removeHighlight();
    if (autoListExpanded) {
        updateAutoListContent();
    }
}

let dict;
function fetchData(selectedColor) {
    loadingModal.style.display = 'block';
    fetch('/fetch')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(fetch => {
            console.log("Fetched Data:", fetch);
            dict = fetch;
            console.log(selectedColor);
            for (let i = 0; i < dict.NUM; i++) {
                drawNot(dict.COORDINATES[i], dict.TIME[i], dict.CODE[i], i, selectedColor, 0, dict.RAWMESSAGE[i]);
            }
            if (autoListExpanded) {
                updateAutoListContent();
            }
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            alert("可能由于以下原因未获取到航警!\n1、当前时间无中国航天相关航警（如有疏漏请反馈）。\n2、您的网络连接存在问题。\n您可以继续使用手动输入功能。");
        }).finally(() => {
            loadingModal.style.display = 'none';
        });
}
const fetchButton = document.getElementById('fetchButton');
const colorSelect = document.getElementById('color1');
fetchButton.addEventListener('click', () => {
    const selectedColor = colorSelect.value;
    fetchInit();
    fetchData(selectedColor);
});
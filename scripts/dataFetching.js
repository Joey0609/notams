const DRAW_NEED_VERIFY = 0;
(async () => {
    const loadingModal = document.getElementById('loadingModal');
    const SECRET_KEY = "'Why reinvent the wheel?'";
    const THREE_MINUTES_IN_SECONDS = 3 * 60;
    const verificationResult = await verifyUrl(SECRET_KEY, THREE_MINUTES_IN_SECONDS);
    if (!verificationResult.valid && DRAW_NEED_VERIFY) {
        alert(`无法绘制航警：${verificationResult.reason}`);
    }
    else {
        loadingModal.style.display = 'block';
        // fetch('/fetch')
        fetch('data_dict.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(fetch => {
                console.log(fetch);
                // document.getElementById('output').textContent = JSON.stringify(data);
                dict = fetch;
                map.clearOverlays();
                siteInit();
                for (var i = 0; i < dict.NUM; i++) {
                    // alert(i);
                    drawNot(dict.COORDINATES[i], dict.TIME[i], dict.CODE[i], i, "blue", 0);
                }
                if (autoListExpanded) {
                    updateAutoListContent();
                }
            })
            .catch(error => {
                console.error('Error fetching data:', error);
                alert("可能由于以下原因未获取到航警!\n1、当前时间无中国航天相关航警（如有疏漏请反馈）。\n2、您的网络连接存在问题。\n3、用于爬取航警信息的dinsQueryWeb炸了\n您可以继续使用手动输入功能。");
            })
            .finally(() => {
                loadingModal.style.display = 'none';
            });
    }
})();
function fetchInit() {
    if (!dict) {
        dict = { NUM: 0 };
    }
    for (let i = 0; i < dict.NUM; i++) {
        map.removeOverlay(polygonAuto[i]);
    }
    removeHighlight();
    if (autoListExpanded) {
        updateAutoListContent();
    }
}
let dict;
async function fetchData(selectedColor) {
    const SECRET_KEY = "'Why reinvent the wheel?'";
    const THREE_MINUTES_IN_SECONDS = 3 * 60;
    const verificationResult = await verifyUrl(SECRET_KEY, THREE_MINUTES_IN_SECONDS);
    if (!verificationResult.valid && DRAW_NEED_VERIFY) {
        alert(`无法绘制航警：${verificationResult.reason}`);
        return;
    }
    else {
        console.log("验证通过，开始获取数据");
    }
    loadingModal.style.display = 'block';
    // fetch('/fetch')
    fetch('data_dict.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(fetch => {
            console.log("Fetched Data:", fetch);
            dict = fetch;
            // map.clearOverlays();
            // siteInit();
            console.log(selectedColor);
            // alert(dict.TIME[1]);
            for (let i = 0; i < dict.NUM; i++) {
                drawNot(dict.COORDINATES[i], dict.TIME[i], dict.CODE[i], i, selectedColor, 0);
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
    // removeObj();
});
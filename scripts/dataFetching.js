const DRAW_NEED_VERIFY = 0;
(async () => {
    const loadingModal = document.getElementById('loadingModal');
    const SECRET_KEY = "'Why reinvent the wheel?'";
    const THREE_MINUTES_IN_SECONDS = 3 * 60;
    const verificationResult = await verifyUrl(SECRET_KEY, THREE_MINUTES_IN_SECONDS);
    if (!verificationResult.valid && DRAW_NEED_VERIFY) {
        alert(`Unable to draw NOTAM: ${verificationResult.reason}`);
    }
    else {
        loadingModal.style.display = 'block';
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
                    try {
                    drawNot(dict.COORDINATES[i], dict.TIME[i], dict.CODE[i], i, "blue", 0);
                    } catch (e) {
                        console.error(`Error drawing NOTAM index ${i}:`, e);
                    }
                }
                if (autoListExpanded) {
                    updateAutoListContent();
                }
            })
            .catch(error => {
                console.error('Error fetching data:', error);
                alert("The NOTAMs could not be fetched due to the following reasons:\n1. There are no current NOTAMs related to Chinese aerospace activities (please report if there are omissions).\n2. There is an issue with your network connection.\n3. The service used to fetch NOTAM information (dinsQueryWeb) is down.\nYou can continue using the manual input feature.");
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
        alert(`Unable to draw NOTAM: ${verificationResult.reason}`);
        return;
    }
    else {
        console.log("Verification successful, starting data fetch");
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
            alert("The NOTAMs could not be fetched due to the following reasons:\n1. There are no current NOTAMs related to Chinese aerospace activities (please report if there are omissions).\n2. There is an issue with your network connection.\nYou can continue using the manual input feature.");
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
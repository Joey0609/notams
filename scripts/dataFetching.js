fetch('/fetch')
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
    for(var i=1;i<dict.NUM;i++){
        // alert(i);
        drawNot(dict.COORDINATES[i],dict.TIME[i],dict.CODE[i],i-1,"blue",0);
    }
})
.catch(error => {
    console.error('Error fetching data:', error);
});
function fetchInit(){
    for(let i = 0; i < dict.NUM; i++){
        map.removeOverlay(polygonAuto[i]);
    }
}
let dict;
function fetchData(selectedColor) {
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
            // map.clearOverlays();
            // siteInit();
            console.log(selectedColor);
            // alert(dict.TIME[1]);
            for (let i = 1; i < dict.NUM; i++) {
                drawNot(dict.COORDINATES[i], dict.TIME[i], dict.CODE[i], i - 1, selectedColor, 0);
            }
        })
        .catch(error => {
            console.error('Error fetching data:', error);
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
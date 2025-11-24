var map = null;


var highlightPolygon = null;
var autoListExpanded = false;
var polygon = [];
var polygonAuto = [];
var launchSiteMarkers = [];

var tileLayers = {
    //天地图矢量图层
    tianditu_vec: {
        url: 'http://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=',
        options: {
            subdomains: ['0'],
            attribution: '&copy; 天地图'
        }
    },
    tianditu_vec_anno: {
        url: 'http://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=',
        options: {
            subdomains: ['0'],
            attribution: ''
        }
    },
    //天地图影像图层
    tianditu_img: {
        url: 'http://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=',
        options: {
            subdomains: ['0'],
            attribution: '&copy; 天地图'
        }
    },
    tianditu_img_anno: {
        url: 'http://t{s}.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=',
        options: {
            subdomains: ['0'],
            attribution: ''
        }
    },
    //高德地图
    gaode_vec: {
        url: 'http://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        options: {
            subdomains: ['1', '2', '3', '4'],
            attribution: '&copy; 高德地图'
        }
    },
    gaode_img: {
        url: 'http://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
        options: {
            subdomains: ['1', '2', '3', '4'],
            attribution: '&copy; 高德地图'
        }
    },
    gaode_img_anno: {
        url: 'http://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}',
        options: {
            subdomains: ['1', '2', '3', '4'],
            attribution: ''
        }
    },
};

function getRandomTileLayer() {
    var providers = [
        'gaode_vec',     // 高德矢量
        // 'gaode_img',     // 高德影像
        // 'tianditu_vec',  // 天地图矢量
        // 'tianditu_img'   // 天地图影像
    ];
    
    var randomProvider = providers[Math.floor(Math.random() * providers.length)];
    console.log('使用地图源:', randomProvider);
    
    return randomProvider;
}

//当前使用的地图源
var currentMapProvider = getRandomTileLayer();
var currentBaseLayer = null;
var currentAnnoLayer = null;


function handleCopy(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification("成功复制到剪贴板");
    }).catch(err => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    });
}

// 初始化地图
makeMap();
function makeMap() {
    // 创建Leaflet地图
    map = L.map('allmap', {
        center: [36, 103],
        zoom: 6,
        minZoom: 3,
        zoomControl: false,  // 关闭默认缩放控件，稍后添加到右下角
        attributionControl: false  // 关闭默认版权控件
    });

    // 添加缩放控件到右下角
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // 添加自定义版权信息
    L.control.attribution({
        position: 'bottomright',
        prefix: 'NOTAM落区绘制工具 by 叁点壹肆壹伍 | <a href="https://leafletjs.cn" target="_blank">Leaflet</a>'
    }).addTo(map);

    // 添加基础图层
    addMapLayers(currentMapProvider);

    // 添加比例尺
    L.control.scale({
        metric: true,
        imperial: false,
        position: 'bottomleft'
    }).addTo(map);

    // 添加图层切换控件
    addLayerControl();

    // 初始化发射场标记
    siteInit();
}

// 添加地图图层
function addMapLayers(provider) {
    if (currentBaseLayer) {
        map.removeLayer(currentBaseLayer);
    }
    if (currentAnnoLayer) {
        map.removeLayer(currentAnnoLayer);
    }
    var baseConfig = tileLayers[provider];
    if (baseConfig) {
        var tileUrl = baseConfig.url;
        
        if (provider.startsWith('tianditu')) {
            var tdtKeys = [
                'ad322867b18949f56e94e4fca2cfdfa2',
            ];
            var randomKey = tdtKeys[Math.floor(Math.random() * tdtKeys.length)];
            tileUrl += randomKey;
        }

        currentBaseLayer = L.tileLayer(tileUrl, baseConfig.options).addTo(map);
        if (provider === 'tianditu_vec') {
            var annoConfig = tileLayers.tianditu_vec_anno;
            currentAnnoLayer = L.tileLayer(annoConfig.url + randomKey, annoConfig.options).addTo(map);
        } else if (provider === 'tianditu_img') {
            var annoConfig = tileLayers.tianditu_img_anno;
            currentAnnoLayer = L.tileLayer(annoConfig.url + randomKey, annoConfig.options).addTo(map);
        } else if (provider === 'gaode_img') {
            var annoConfig = tileLayers.gaode_img_anno;
            currentAnnoLayer = L.tileLayer(annoConfig.url, annoConfig.options).addTo(map);
        }
    }
}

// 添加图层切换控件
function addLayerControl() {
    var baseMaps = {
        "矢量图层": L.tileLayer(tileLayers.gaode_vec.url, tileLayers.gaode_vec.options),
        "卫星图层": L.tileLayer(tileLayers.gaode_img.url, tileLayers.gaode_img.options),
    };
    // baseMaps["天地图"] = L.tileLayer(tileLayers.tianditu_vec.url + 'ad322867b18949f56e94e4fca2cfdfa2', tileLayers.tianditu_vec.options);
    // baseMaps["天地图卫星"] = L.tileLayer(tileLayers.tianditu_img.url + 'ad322867b18949f56e94e4fca2cfdfa2', tileLayers.tianditu_img.options);

    L.control.layers(baseMaps, null, {
        position: 'topright',
        collapsed: false  // 默认展开图层控件
    }).addTo(map);
}

// 初始化发射场标记
function siteInit() {
    var screen_width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
    if (screen_width > 1000) screen_width = 1000;
    var opt_width = screen_width / 3 < 100 ? 100 : screen_width / 3;

    var sites = [
        {
            name: '酒泉卫星发射中心',
            lat: 40.96806,
            lng: 100.27806,
            icon: '/statics/launch.png',
            content: "<b><large>甘肃酒泉</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/酒泉卫星发射中心' target='_blank' style='text-decoration: none; font-weight: bold;'>酒泉卫星发射中心</a>（Jiuquan Satellite Launch Center，JSLC，又称东风航天城）</b>，是中国创建最早、规模最大的综合型导弹、卫星发射中心，也是中国目前唯一的载人航天发射场。"
        },
        {
            name: '西昌卫星发射中心',
            lat: 28.24556,
            lng: 102.02667,
            icon: '/statics/launch.png',
            content: "<b><large>四川西昌</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/西昌卫星发射中心' target='_blank' style='text-decoration: none; font-weight: bold;'>西昌卫星发射中心</a>（Xichang Satellite Launch Center，XSLC）</b>始建于1970年，于1982年交付使用，自1984年1月发射中国第一颗通信卫星以来，到如今已进行国内外卫星发射超过百次。"
        },
        {
            name: '太原卫星发射中心',
            lat: 38.84861,
            lng: 111.60778,
            icon: '/statics/launch.png',
            content: "<b><large>山西太原</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/太原卫星发射中心' target='_blank' style='text-decoration: none; font-weight: bold;'>太原卫星发射中心</a>（Taiyuan Satellite Launch Center, TSLC）</b>，位于山西省忻州市岢岚县北18公里处，是中国试验卫星、应用卫星和运载火箭发射试验基地之一。"
        },
        {
            name: '文昌航天发射场',
            lat: 19.637836,
            lng: 110.956571,
            icon: '/statics/launch.png',
            content: "<b><large>海南文昌</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/文昌航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>文昌航天发射场</a>" +
                "（Wenchang Spacecraft Launch Site, WSLS）</b>位于中国海南省文昌市，是中国首座滨海航天发射场，也是世界现有的少数低纬度航天发射场之一。" +
                "<b><a href='https://sat.huijiwiki.com/wiki/海南商业航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>海南商业航天发射场</a>（Hainan Commercial Spacecraft Launch Site）</b>，是我国首个开工建设的商业航天发射场，由海南国际商业航天发射有限公司投建，致力于打造国际一流、市场化运营的航天发射场，进一步提升我国民商运载火箭发射能力。"       
        }, 
        {
            name: '海阳东方航天港',
            lat: 36.688761,
            lng: 121.259377,
            icon: '/statics/launch1.png',
            content: "<b><large>山东海阳</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/海阳东方航天港' target='_blank' style='text-decoration: none; font-weight: bold;'>海阳东方航天港</a>（Haiyang Oriental Spaceport）</b>是中国唯一一个运载火箭海上发射母港。"
        }
    ];

    sites.forEach(function(site) {
        drawLaunchsite(site.lat, site.lng, site.name, site.content, site.icon);
    });
}

// 绘制发射场标记
function drawLaunchsite(lat, lng, title, content, iconUrl) {
    var icon = L.icon({
        iconUrl: iconUrl,
        iconSize: iconUrl.includes('launch1') ? [28, 28] : [18, 20],
        iconAnchor: iconUrl.includes('launch1') ? [14, 14] : [9, 10],
        popupAnchor: [0, -40]
    });

    var marker = L.marker([lat, lng], {icon: icon}).addTo(map);
    
    marker.bindPopup(content, {
        maxWidth: 300,
        className: 'launch-site-popup'
    });

    launchSiteMarkers.push(marker);
}

// 高亮NOTAM
function highlightNotam(index, color) {
    removeHighlight();

    if (!dict || index >= dict.NUM) return;

    try {
        const coordinates = dict.COORDINATES[index];
        const points = parseCoordinatesToPoints(coordinates);

        if (points && points.length > 0) {
            highlightPolygon = L.polygon(points, {
                color: color,
                weight: 3,
                opacity: 1,
                fillColor: color,
                fillOpacity: 0.6
            }).addTo(map);
        }
    } catch (e) {
        console.error('高亮绘制失败', e);
    }
}

// 移除高亮
function removeHighlight() {
    if (highlightPolygon) {
        map.removeLayer(highlightPolygon);
        highlightPolygon = null;
    }
}

// 解析坐标为Leaflet点
function parseCoordinatesToPoints(coordStr) {
    const arr = coordStr.split('-');
    const points = [];

    for (let i = 0; i < arr.length; i++) {
        const coord = pullOut(arr[i]);
        if (coord) {
            points.push([coord[1], coord[0]]); // Leaflet使用 [lat, lng]
        }
    }

    return points;
}

// 绘制NOTAM多边形
function drawNot(COORstrin, timee, codee, numm, col, is_self, rawmessage) {
    var pos = COORstrin;
    var timestr = is_self ? null : convertTime(timee);
    var stPos = 0;
    var arr = [];
    
    for (var i = 0; i < pos.length; i++) {
        if (pos[i] == "-") {
            var tmp = pos.substring(stPos, i);
            arr.push(tmp);
            stPos = i + 1;
        }
    }
    arr.push(pos.substring(stPos, pos.length));
    
    var _TheArray = [];
    for (var i = 0; i < arr.length; i++) {
        _TheArray.push(pullOut(arr[i]));
    }
    
    var latlngs = [];
    for (var i = 0; i < _TheArray.length; i++) {
        if (_TheArray[i]) {
            latlngs.push([_TheArray[i][1], _TheArray[i][0]]); // [lat, lng]
        }
    }

    if (latlngs.length < 3) return; // 至少需要3个点才能绘制多边形

    // 创建多边形
    var tmpPolygon = L.polygon(latlngs, {
        color: col,
        weight: 1,
        opacity: 1,
        fillColor: col,
        fillOpacity: 0.3
    }).addTo(map);

    // 创建弹出窗口内容
    var popupContent;
    if (!is_self) {
        popupContent = "<div class='notam-popup'>" +
            "<div class='notam-popup-header'>" +
            "<h4>NOTAM信息</h4>" +
            "</div>" +
            "<div class='notam-popup-body'>" +
            "<div class='popup-info-row'>" +
            "<span class='popup-label'>持续时间:</span>" +
            "<span class='popup-value'>" + timestr + "</span>" +
            "</div>" +
            "<div class='popup-info-row'>" +
            "<span class='popup-label'>航警编号:</span>" +
            "<span class='popup-value'>" + codee + "</span>" +
            "</div>" +
            "</div>" +
            "<div class='notam-popup-buttons'>" +
            "<button class='copy copy-coord' onclick=\"handleCopy('" + COORstrin + "')\">复制坐标</button>" +
            "<button class='copy copy-raw' onclick=\"handleCopy('" + (rawmessage || '').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "')\">复制原始航警</button>" +
            "</div>" +
            "</div>";
    } else {
        popupContent = "<div class='notam-popup'>" +
            "<div class='notam-popup-header'>" +
            "<h4>用户绘制落区</h4>" +
            "</div>" +
            "<div class='notam-popup-body'>" +
            "<div class='popup-info-row'>" +
            "<span class='popup-value'>航警" + numm + "</span>" +
            "</div>" +
            "</div>" +
            "<div class='notam-popup-buttons'>" +
            "<button class='copy' onclick=\"handleCopy('" + COORstrin + "')\">复制坐标</button>" +
            "</div>" +
            "</div>";
    }

    tmpPolygon.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'notam-info-popup'
    });

    // 存储多边形引用
    if (is_self) {
        polygon[numm] = tmpPolygon;
    } else {
        polygonAuto[numm] = tmpPolygon;
    }
}

// 解析坐标字符串
function pullOut(stri) {
    var tmpp = [];
    var stPos = 1;
    var a, b;
    var c, d;
    
    for (var i = 1; i < stri.length; i++) {
        if (stri[i] == "E" || stri[i] == "W") {
            stPos = i + 1;
        }
    }
    
    a = stri.substring(1, stPos - 1);
    b = stri.substring(stPos, stri.length);
    
    if (a.length == 4) {
        c = (a - (a % 100)) / 100 + (a % 100) / 60;
        d = (b - (b % 100)) / 100 + (b % 100) / 60;
    } else if (a.length == 6) {
        c = (a - (a % 10000)) / 10000 + ((a % 10000) - (a % 100)) / 6000 + (a % 100) / 3600;
        d = (b - (b % 10000)) / 10000 + ((b % 10000) - (b % 100)) / 6000 + (b % 100) / 3600;
    }
    
    if (stri[stPos - 1] == "E") {
        tmpp.push(d);
    } else {
        tmpp.push(0 - d);
    }
    
    if (stri[0] == "N") {
        tmpp.push(c);
    } else {
        tmpp.push(0 - c);
    }

    return tmpp;
}
var polygonAuto = [];           // 自动获取的多边形
var groupColors = {};           // CLASSIFY → color
var visibleState = {};          // index → true/false

// 随机颜色池（明亮且对比度好）
const colorPool = [
    "#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6",
    "#1abc9c", "#e67e22", "#34495e", "#e84393", "#00b894"
];
let currentColor_idx = 0;
function randomColor() {
    return colorPool[currentColor_idx++ % colorPool.length];
    // return colorPool[Math.floor(Math.random() * colorPool.length)];
}

function assignGroupColors(classify) {
    groupColors = {};
    Object.keys(classify).forEach(key => {
        groupColors[key] = randomColor();
    });
}

function getColorForCode(code) {
    if (!dict || !dict.CLASSIFY) return "#3498db";
    for (const [group, codes] of Object.entries(dict.CLASSIFY)) {
        if (codes.includes(code)) {
            return groupColors[group] || "#3498db";
        }
    }
    return "#3498db";
}
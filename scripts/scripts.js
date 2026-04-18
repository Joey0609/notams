var map = null;


var highlightPolygon = null;
var autoListExpanded = false;
var polygon = [];
var polygonAuto = [];
var launchSiteMarkers = [];
var landingZoneMarkers = [];

const MSI_AEROSPACE_KEYWORDS = ["ROCKET", "LAUNCH", "SPACE", "RE-ENTRY", "REENTRY", "DEBRIS", "AEROSPACE", "SATELLITE", "MISSILE", "SPACECRAFT"];

// 世界复制数量：左侧 10 个 + 右侧 10 个 + 当前世界
const WRAP_WORLD_COPIES_PER_SIDE = 10;
const WRAP_WORLD_LNG_SPAN = 360;
const WRAP_WORLD_OFFSETS = (() => {
    const offsets = [];
    for (let i = -WRAP_WORLD_COPIES_PER_SIDE; i <= WRAP_WORLD_COPIES_PER_SIDE; i++) {
        offsets.push(i * WRAP_WORLD_LNG_SPAN);
    }
    return offsets;
})();

// 海外发射场开关：0=不绘制，1=绘制
var drawForeignLaunchSite = 0;

// 海南发射场相关标记（用于缩放级别切换）
var hainanMergedMarker = null;
var hainanSeparateMarkers = [];

// 存储原始样式以便恢复
var originalPolygonStyles = {};

/* 航警列表 hover 高亮指定多边形 */
function hoverHighlightNotam(idx) {
    const poly = polygonAuto[idx];
    if (!poly) return;
    
    // 第一次高亮时保存原始样式
    if (!originalPolygonStyles[idx]) {
        originalPolygonStyles[idx] = {
            weight: poly.options.weight || 1,
            fillOpacity: poly.options.fillOpacity || 0.5,
            opacity: poly.options.opacity || 1,
            color: poly.options.color,
            fillColor: poly.options.fillColor
        };
    }
    
    const saved = originalPolygonStyles[idx];
    
    // 应用高亮样式：边框加粗 + 填充透明度提高（使用保存的原色）
    poly.setStyle({
        weight: 4,
        fillOpacity: 0.7,
        opacity: 1,
        color: saved.color,
        fillColor: saved.fillColor
    });
    
    // 将该多边形置于顶层
    if (poly.bringToFront) {
        poly.bringToFront();
    }
}

/* 列表 hover 取消高亮 */
function hoverUnhighlightNotam(idx) {
    const poly = polygonAuto[idx];
    if (!poly) return;
    
    const saved = originalPolygonStyles[idx];
    if (saved) {
        poly.setStyle({
            weight: saved.weight,
            fillOpacity: saved.fillOpacity,
            opacity: saved.opacity,
            color: saved.color,
            fillColor: saved.fillColor
        });
    }
}

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

// 矢量图层颜色池
const colorPoolVector = [
    "#a70000ff", "#1a2cd1", "#006d1bff", "#806800ff", "#6a009bff",
    "#548100ff", "#a74e00ff", "#313131", "#a0008bff", "#006b79ff"
];

// 卫星图层颜色池
const colorPoolSatellite = [
    "#ff3b3b", "#00d9ff", "#00ff41", "#ffea00", "#c300ffff",
    "#7dff00", "#ff8c00", "#ffffff", "#ff1493", "#00ffff"
];

// 当前使用的颜色池
let currentColorPool = colorPoolVector;
let currentColor_idx = 0;

function randomColor() {
    return currentColorPool[currentColor_idx++ % currentColorPool.length];
}

// 根据地图类型切换颜色池
function switchColorPool(isVectorMap) {
    currentColorPool = isVectorMap ? colorPoolVector : colorPoolSatellite;
    currentColor_idx = 0; // 重置索引
}

// 检查当前地图是否为矢量图层
function isVectorMap() {
    return currentMapProvider === 'gaode_vec' || currentMapProvider === 'tianditu_vec';
}
// ==================== 颜色系统结束 ====================

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

switchColorPool(currentMapProvider === 'gaode_vec' || currentMapProvider === 'tianditu_vec');


function handleCopy(text) {
    // 通用复制函数，兼容安卓 WebView
    function fallbackCopy(str) {
        const textarea = document.createElement('textarea');
        textarea.value = str;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        textarea.setAttribute('readonly', ''); // 防止移动端弹出键盘
        document.body.appendChild(textarea);
        
        // 针对 iOS 的特殊处理
        const range = document.createRange();
        range.selectNodeContents(textarea);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        textarea.setSelectionRange(0, str.length); // 安卓需要这个
        
        let success = false;
        try {
            success = document.execCommand('copy');
        } catch (e) {
            console.error('execCommand copy failed:', e);
        }
        document.body.removeChild(textarea);
        return success;
    }
    
    // 优先使用现代 Clipboard API
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(() => {
            showNotification("成功复制到剪贴板");
        }).catch(err => {
            // Clipboard API 失败，使用回退方案
            if (fallbackCopy(text)) {
                showNotification("成功复制到剪贴板");
            } else {
                showNotification("复制失败，请手动复制");
            }
        });
    } else {
        // 不支持 Clipboard API，直接使用回退方案
        if (fallbackCopy(text)) {
            showNotification("成功复制到剪贴板");
        } else {
            showNotification("复制失败，请手动复制");
        }
    }
}

// 初始化地图
makeMap();
function makeMap() {
    // 创建Leaflet地图
    map = L.map('allmap', {
        center: [36, 103],
        zoom: 6,
        minZoom: 3,
        worldCopyJump: false,
        zoomControl: false,  // 关闭默认缩放控件，稍后添加到右下角
        attributionControl: false,  // 关闭默认版权控件
        
    });

    map.getPane('overlayPane').style.zIndex = 400;
    map.getPane('markerPane').style.zIndex = 350;   // 在落区多边形下

    // 添加缩放控件到右下角
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // 添加自定义版权信息
    L.control.attribution({
        position: 'bottomright',
        prefix: 'NOTAM落区绘制工具 by 叁点壹肆壹伍 Joey0609'
    }).addTo(map);

    // 添加比例尺
    L.control.scale({
        metric: true,
        imperial: false,
        position: 'bottomleft'
    }).addTo(map);

    // 添加图层切换控件
    addLayerControl();

    if (!currentBaseLayer) {
        addMapLayers(currentMapProvider);
    }

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

        currentBaseLayer = L.tileLayer(tileUrl, baseConfig.options);
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
    var gaodeVecLayer = L.tileLayer(tileLayers.gaode_vec.url, tileLayers.gaode_vec.options);
    var gaodeImgLayer = L.tileLayer(tileLayers.gaode_img.url, tileLayers.gaode_img.options);
    
    var baseMaps = {
        "矢量图层": gaodeVecLayer,
        "卫星图层": gaodeImgLayer,
    };
    // baseMaps["天地图"] = L.tileLayer(tileLayers.tianditu_vec.url + 'ad322867b18949f56e94e4fca2cfdfa2', tileLayers.tianditu_vec.options);
    // baseMaps["天地图卫星"] = L.tileLayer(tileLayers.tianditu_img.url + 'ad322867b18949f56e94e4fca2cfdfa2', tileLayers.tianditu_img.options);

    if (currentMapProvider === 'gaode_vec') {
        currentBaseLayer = gaodeVecLayer;
    } else if (currentMapProvider === 'gaode_img') {
        currentBaseLayer = gaodeImgLayer;
    }
    if (currentBaseLayer) {
        currentBaseLayer.addTo(map);
    }

    L.control.layers(baseMaps, null, {
        position: 'topright',
        collapsed: false  // 默认展开图层控件
    }).addTo(map);


    map.on('baselayerchange', function(e) {
        // 判断切换到了哪个图层
        var isVector = (e.name === "矢量图层");
        currentMapProvider = isVector ? 'gaode_vec' : 'gaode_img';
        
        // 切换颜色池
        switchColorPool(isVector);
        
        // 重新分配颜色并重绘航警
        if (dict && dict.CLASSIFY) {
            assignGroupColors(dict.CLASSIFY);
            redrawAllNotams();
        }
        
        console.log('切换到:', e.name, '使用颜色池:', isVector ? '深色系' : '鲜艳系');
    });
}

function redrawAllNotams() {
    if (!dict || dict.NUM === 0) return;
    
    var currentVisibleState = Object.assign({}, visibleState);
    
    // 只重绘自动航警，不影响历史航警
    for (let i = 0; i < polygonAuto.length; i++) {
        if (polygonAuto[i]) {
            map.removeLayer(polygonAuto[i]);
        }
    }
    polygonAuto = [];
    originalPolygonStyles = {};  // 清除缓存的样式
    
    for (var i = 0; i < dict.NUM; i++) {
        var color = getColorForCode(dict.CODE[i]);
        drawNot(
            dict.COORDINATES[i],
            dict.TIME[i],
            dict.CODE[i],
            dict.ALTITUDE[i],
            i,
            color,
            0,
            dict.RAWMESSAGE[i],
            dict.SOURCE?.[i] || 'NOTAM',
            dict.FIR?.[i] || ''
        );
        
        if (currentVisibleState[i] === false && polygonAuto[i]) {
            map.removeLayer(polygonAuto[i]);
        }
    }
    
    visibleState = currentVisibleState;
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
            icon: 'statics/launch.png',
            content: "<b><large>甘肃酒泉</large></b><br>" +
                "<b><a href='https://baike.baidu.com/item/酒泉卫星发射中心' target='_blank' style='text-decoration: none; font-weight: bold;'>酒泉卫星发射中心</a>（Jiuquan Satellite Launch Center，JSLC，又称东风航天城）</b>，是中国创建最早、规模最大的综合型导弹、卫星发射中心，也是中国目前唯一的载人航天发射场。"
        },
        {
            name: '西昌卫星发射中心',
            lat: 28.24556,
            lng: 102.02667,
            icon: 'statics/launch.png',
            content: "<b><large>四川西昌</large></b><br>" +
                "<b><a href='https://baike.baidu.com/item/西昌卫星发射中心' target='_blank' style='text-decoration: none; font-weight: bold;'>西昌卫星发射中心</a>（Xichang Satellite Launch Center，XSLC）</b>始建于1970年，于1982年交付使用，自1984年1月发射中国第一颗通信卫星以来，到如今已进行国内外卫星发射超过百次。"
        },
        {
            name: '太原卫星发射中心',
            lat: 38.84861,
            lng: 111.60778,
            icon: 'statics/launch.png',
            content: "<b><large>山西太原</large></b><br>" +
                "<b><a href='https://baike.baidu.com/item/太原卫星发射中心' target='_blank' style='text-decoration: none; font-weight: bold;'>太原卫星发射中心</a>（Taiyuan Satellite Launch Center, TSLC）</b>，位于山西省忻州市岢岚县北18公里处，是中国试验卫星、应用卫星和运载火箭发射试验基地之一。"
        },
        {
            name: '文昌航天发射场',
            lat: 19.614379-0.004,
            lng: 110.950996+0.004,
            icon: 'statics/launch.png',
            content: "<b><large>海南文昌</large></b><br>" +
                "<b><a href='https://baike.baidu.com/item/文昌航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>文昌航天发射场</a>" +
                "（Wenchang Spacecraft Launch Site, WSLS）</b>位于中国海南省文昌市，是中国首座滨海航天发射场，也是世界现有的少数低纬度航天发射场之一。"
        }, 
        {
            name: '海南商业航天发射场',
            lat: 19.596983-0.004,
            lng: 110.930836+0.004,
            icon: 'statics/launch.png',
            content: "<b><large>海南文昌</large></b><br>" +
                "<b><a href='https://baike.baidu.com/item/海南商业航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>海南商业航天发射场</a>（Hainan Commercial Spacecraft Launch Site）</b>，是我国首个开工建设的商业航天发射场，由海南国际商业航天发射有限公司投建，致力于打造国际一流、市场化运营的航天发射场，进一步提升我国民商运载火箭发射能力。"
        },
        {
            name: '海阳东方航天港',
            lat: 36.688761,
            lng: 121.259377,
            icon: 'statics/launch1.png',
            content: "<b><large>山东海阳</large></b><br>" +
                "<b><a href='https://baike.baidu.com/item/中国东方航天港' target='_blank' style='text-decoration: none; font-weight: bold;'>海阳东方航天港</a>（Haiyang Oriental Spaceport）</b>是中国唯一一个运载火箭海上发射母港。"
        }
    ];

    sites.forEach(function(site) {
        // 跳过海南的两个发射场，单独处理
        if (site.name === '文昌航天发射场' || site.name === '海南商业航天发射场') {
            return;
        }
        drawLaunchsite(site.lat, site.lng, site.name, site.content, site.icon);
    });

    // 初始化海南发射场标记（根据缩放级别决定合并或分离）
    initHainanSites(sites);
    
    // 监听地图缩放事件，动态切换海南发射场显示模式
    map.on('zoomend', function() {
        updateHainanSitesDisplay(sites);
    });

    var landingZones = [
        {
            name: '蓝箭航天火箭回收着陆场',
            //38.445084, 103.480743
            lat: 38.445084,
            lng: 103.480743,
            icon: 'statics/land1.png',
            content: "<b><large>甘肃民勤</large></b><br>" +
                "<b>蓝箭航天火箭回收着陆场</b>，位于甘肃武威市民勤县境内，是蓝箭航天用于其可回收运载火箭朱雀三号的着陆场。"
        },
        {
            name: 'CZ-12A火箭回收着陆场',
            //39°02'38.4"N 101°55'22.8"E
            lat: 39.043999,
            lng: 101.922999,
            icon: 'statics/land2.png',
            content: "<b><large>甘肃民勤</large></b><br>" +
                "<b>CZ-12A火箭回收着陆场</b>，位于甘肃武威市民勤县境内，是用于CZ-12A等运载火箭一级回收的着陆场。"
        }
    ];

    landingZones.forEach(function(landingZone) {
        drawLandingZone(landingZone.lat, landingZone.lng, landingZone.name, landingZone.content, landingZone.icon);
    });

    if (Number(drawForeignLaunchSite) === 1) {
        drawForeignLaunchSites();
    }
}

// 绘制发射场标记
function drawLaunchsite(lat, lng, title, content, iconUrl) {
    var icon = L.icon({
        iconUrl: iconUrl,
        iconSize: iconUrl.includes('launch1') ? [22, 22] : [22, 22],
        iconAnchor: iconUrl.includes('launch1') ? [11, 11] : [11, 11],
        popupAnchor: [0, -40]
    });

    var markerGroup = createWrappedMarkerGroup(lat, lng, icon, content);
    markerGroup.addTo(map);
    launchSiteMarkers.push(markerGroup);
}

function drawLandingZone(lat, lng, title, content, iconUrl){
    var icon = L.icon({
        iconUrl: iconUrl,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -40]
    });

    var markerGroup = createWrappedMarkerGroup(lat, lng, icon, content);
    markerGroup.addTo(map);
    landingZoneMarkers.push(markerGroup);
}

function drawForeignLaunchSites() {
    const foreignSites = [
        { name: '中大西洋区域发射场', lat: 37.84341, lng: -75.478195 },
        { name: '伍默拉靶场综合体', lat: -30.955278, lng: 136.532222 },
        { name: '内之浦航天中心', lat: 31.25, lng: 131.08 },
        { name: '军际特种装备测试中心', lat: 30.778056, lng: -3.055278 },
        { name: '卡普斯京亚尔', lat: 48.59, lng: 45.72 },
        { name: '卡纳维拉尔角太空军基地', lat: 28.488889, lng: -80.577778 },
        { name: '因约克恩机场', lat: 35.658611, lng: -117.829444 },
        { name: '圭亚那航天中心', lat: 5.28, lng: -52.79 },
        { name: '塞姆南航天中心', lat: 35.234444, lng: 53.911111 },
        { name: '多姆巴罗夫斯基空军基地', lat: 51.093889, lng: 59.842222 },
        { name: '太平洋太空港综合体', lat: 57.435833, lng: -152.337778 },
        { name: '奥德赛发射平台', lat: null, lng: null },
        { name: '布罗格里奥航天中心', lat: -2.938333, lng: 40.2125 },
        { name: '帕尔马希姆空军基地', lat: 31.897778, lng: 34.690556 },
        { name: '德尔塔级潜艇', lat: null, lng: null },
        { name: '拜科努尔航天发射场', lat: 45.965, lng: 63.305 },
        { name: '斯沃博德尼航天发射场', lat: 51.883333, lng: 128.333333 },
        { name: '普列谢茨克航天发射场', lat: 62.925556, lng: 40.577778 },
        { name: '东方航天发射场', lat: 51.884553, lng: 128.334778 },
        { name: '沃洛普斯飞行设施', lat: 37.940194, lng: -75.466389 },
        { name: '沙赫鲁德导弹测试场', lat: 36, lng: 55 },
        { name: '火箭实验室发射综合体1号', lat: -39.2615, lng: 177.864876 },
        { name: '爱德华空军基地', lat: 34.905556, lng: -117.883611 },
        { name: '甘多空军基地', lat: 27.930278, lng: -15.385 },
        { name: '种子岛航天中心', lat: 30.4, lng: 130.97 },
        { name: '罗老航天中心', lat: 34.431867, lng: 127.535069 },
        { name: '考爱岛导弹试验靶场', lat: 22.083333, lng: -159.5 },
        { name: '肯尼迪航天中心', lat: 28.524167, lng: -80.650833 },
        { name: '东海卫星发射场', lat: 40.85, lng: 129.67 },
        { name: '范登堡空军基地', lat: 34.732778, lng: -120.568056 },
        { name: '萨迪什·达万航天中心', lat: 13.719939, lng: 80.230425 },
        { name: '西海卫星发射场', lat: 39.66, lng: 124.705 },
        { name: '里根试验场', lat: 8.716667, lng: 167.733333 },
        { name: '阿尔坎塔拉航天中心', lat: -2.333333, lng: -44.4 },
        { name: '莫哈维航空航天港', lat: 35.06, lng: -118.15 },
        { name: '康沃尔航天港', lat: 50.440833, lng: -4.995278 },
        { name: '星港', lat: 25.997, lng: -97.157 },
        { name: '纪伊太空发射场', lat: 33.544167, lng: 135.889444 }
    ];

    foreignSites.forEach(site => {
        if (!isFinite(site.lat) || !isFinite(site.lng)) {
            console.warn('海外发射场缺少坐标，已跳过:', site.name);
            return;
        }

        const popupContent = "<b><large>海外发射场</large></b><br>" +
            "<b>" + site.name + "</b><br>" +
            "坐标: " + site.lat.toFixed(6) + ", " + site.lng.toFixed(6);

        drawLaunchsite(site.lat, site.lng, site.name, popupContent, 'statics/launch1.png');
    });
}

function createWrappedMarkerGroup(lat, lng, icon, popupContent) {
    const markers = WRAP_WORLD_OFFSETS.map(offset => {
        const marker = L.marker([lat, lng + offset], { icon: icon });
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'launch-site-popup'
        });
        return marker;
    });

    return L.layerGroup(markers);
}

// 初始化海南发射场标记
function initHainanSites(sites) {
    const wenchang = sites.find(s => s.name === '文昌航天发射场');
    const commercial = sites.find(s => s.name === '海南商业航天发射场');
    
    if (!wenchang || !commercial) return;
    
    // 计算两个发射场的中心点
    const centerLat = (wenchang.lat + commercial.lat) / 2;
    const centerLng = (wenchang.lng + commercial.lng) / 2;
    
    // 创建合并后的标记（低缩放级别显示）
    const mergedIcon = L.icon({
        iconUrl: 'statics/launch.png',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -40]
    });
    
    const mergedContent = "<b><large>海南文昌</large></b><br>" +
        "<b><a href='https://baike.baidu.com/item/文昌航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>文昌航天发射场</a>" +
        "（Wenchang Spacecraft Launch Site, WSLS）</b>位于中国海南省文昌市，是中国首座滨海航天发射场，也是世界现有的少数低纬度航天发射场之一。<br><br>" +
        "<b><a href='https://baike.baidu.com/item/海南商业航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>海南商业航天发射场</a>（Hainan Commercial Spacecraft Launch Site）</b>，" +
        "是我国首个开工建设的商业航天发射场，由海南国际商业航天发射有限公司投建，致力于打造国际一流、市场化运营的航天发射场，进一步提升我国民商运载火箭发射能力。";
    
    hainanMergedMarker = createWrappedMarkerGroup(centerLat, centerLng, mergedIcon, mergedContent);
    
    // 创建分离的标记（高缩放级别显示）
    const wenchangIcon = L.icon({
        iconUrl: 'statics/launch.png',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -40]
    });
    
    const wenchangMarker = createWrappedMarkerGroup(wenchang.lat, wenchang.lng, wenchangIcon, wenchang.content);
    
    const commercialIcon = L.icon({
        iconUrl: 'statics/launch.png',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -40]
    });
    
    const commercialMarker = createWrappedMarkerGroup(commercial.lat, commercial.lng, commercialIcon, commercial.content);
    
    hainanSeparateMarkers = [wenchangMarker, commercialMarker];
    
    // 根据当前缩放级别决定显示哪个
    updateHainanSitesDisplay(sites);
}

// 根据缩放级别更新海南发射场的显示状态
function updateHainanSitesDisplay(sites) {
    const currentZoom = map.getZoom();
    const ZOOM_THRESHOLD = 10; // 缩放级别阈值，大于等于此值时分开显示
    
    if (currentZoom >= ZOOM_THRESHOLD) {
        // 高缩放级别：分开显示
        if (hainanMergedMarker && map.hasLayer(hainanMergedMarker)) {
            map.removeLayer(hainanMergedMarker);
        }
        hainanSeparateMarkers.forEach(marker => {
            if (!map.hasLayer(marker)) {
                marker.addTo(map);
                launchSiteMarkers.push(marker);
            }
        });
    } else {
        // 低缩放级别：合并显示
        hainanSeparateMarkers.forEach(marker => {
            if (map.hasLayer(marker)) {
                map.removeLayer(marker);
                // 从 launchSiteMarkers 中移除
                const idx = launchSiteMarkers.indexOf(marker);
                if (idx > -1) {
                    launchSiteMarkers.splice(idx, 1);
                }
            }
        });
        if (hainanMergedMarker && !map.hasLayer(hainanMergedMarker)) {
            hainanMergedMarker.addTo(map);
            if (!launchSiteMarkers.includes(hainanMergedMarker)) {
                launchSiteMarkers.push(hainanMergedMarker);
            }
        }
    }
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

function normalizeLngForWrap(lng) {
    let v = Number(lng);
    if (!isFinite(v)) return lng;
    while (v > 180) v -= 360;
    while (v < -180) v += 360;
    return v;
}

function buildWrappedLatLngRings(latlngs) {
    if (!Array.isArray(latlngs) || latlngs.length < 3) return [];
    const normalized = latlngs.map(([lat, lng]) => [lat, normalizeLngForWrap(lng)]);
    return WRAP_WORLD_OFFSETS.map(offset =>
        normalized.map(([lat, lng]) => [lat, lng + offset])
    );
}

window.buildWrappedLatLngRings = buildWrappedLatLngRings;

function sortPolygonPoints(latlngs) {
    if (latlngs.length < 3) return latlngs;
    
    let centerLat = 0, centerLng = 0;
    for (let i = 0; i < latlngs.length; i++) {
        centerLat += latlngs[i][0];
        centerLng += latlngs[i][1];
    }
    centerLat /= latlngs.length;
    centerLng /= latlngs.length;
    
    //极角排序
    const sortedPoints = latlngs.slice().sort((a, b) => {
        const angleA = Math.atan2(a[0] - centerLat, a[1] - centerLng);
        const angleB = Math.atan2(b[0] - centerLat, b[1] - centerLng);
        return angleA - angleB;
    });
    
    return sortedPoints;
}

// 绘制NOTAM多边形
function drawNot(COORstrin, timee, codee, altitude, numm, col, is_self, rawmessage, sourceType = 'NOTAM', fir = '') {
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

    // 对坐标点排序，确保多边形是凸的或至少是合理的形状
    latlngs = sortPolygonPoints(latlngs);
    const wrappedRings = buildWrappedLatLngRings(latlngs);
    if (wrappedRings.length === 0) return;

    // 创建多边形
    var tmpPolygon = L.polygon(wrappedRings, {
        color: col,
        weight: 1,
        opacity: 1,
        fillColor: col,
        fillOpacity: 0.5
    }).addTo(map);

    // 创建弹出窗口内容
    var popupContent;

    function extractMsiKeywords(text) {
        var upper = String(text || '').toUpperCase();
        var found = MSI_AEROSPACE_KEYWORDS.filter(function(k) {
            return upper.indexOf(k) !== -1;
        });
        return found.length ? found.join(', ') : '-';
    }

    if (!is_self) {
        var normalizedSource = (sourceType || 'NOTAM').toUpperCase();
        var isMsi = normalizedSource.startsWith('MSI');
        var popupTitle = isMsi ? 'MSI 信息' : 'NOTAM 信息';
        var codeLabel = isMsi ? '海警编号' : '航警编号';
        var rawLabel = isMsi ? '复制原始海警' : '复制原始航警';
                var secondLineLabel = isMsi ? '关键词' : '飞行情报区';
                var secondLineValue = isMsi ? extractMsiKeywords(rawmessage) : (fir || 'UNKNOWN');
        var sourceAndSecondLineRow = "<div class='popup-info-row row-horizontal'>" +
            "<div class='popup-col'>" +
            "<span class='popup-label'>来源:</span>" +
            "<span class='popup-value'>" + (sourceType || 'NOTAM') + "</span>" +
            "</div>" +
            "<div class='popup-col'>" +
            "<span class='popup-label'>" + secondLineLabel + ":</span>" +
            "<span class='popup-value'>" + secondLineValue + "</span>" +
            "</div>" +
            "</div>";
        var codeAndDetailRow = isMsi
            ? "<div class='popup-info-row'>" +
              "<span class='popup-label'>" + codeLabel + ":</span>" +
              "<span class='popup-value'>" + codee + "</span>" +
              "</div>"
            : "<div class='popup-info-row row-horizontal'>" +
              "<div class='popup-col'>" +
              "<span class='popup-label'>" + codeLabel + ":</span>" +
              "<span class='popup-value'>" + codee + "</span>" +
              "</div>" +
              "<div class='popup-col'>" +
              "<span class='popup-label'>航警高度:</span>" +
              "<span class='popup-value'>" + altitude + "</span>" +
              "</div>" +
              "</div>";

        popupContent = "<div class='notam-popup'>" +
            "<div class='notam-popup-header'>" +
            "<h4>" + popupTitle + "</h4>" +
            "</div>" +
            "<div class='notam-popup-body'>" +
            "<div class='popup-info-row'>" +
            "<span class='popup-label'>持续时间:</span>" +
            "<span class='popup-value'>" + timestr + "</span>" +
            "</div>" +
            sourceAndSecondLineRow +
            codeAndDetailRow +
            "<div class='notam-popup-buttons'>" +
            "<button class='copy copy-coord' onclick=\"handleCopy('" + COORstrin + "')\">复制坐标</button>" +
            "<button class='copy copy-raw' data-raw-index='" + numm + "'>" + rawLabel + "</button>" +
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
    
    // 为弹出窗口添加打开事件监听器，处理复制原始航警按钮
    tmpPolygon.on('popupopen', function(e) {
        const popup = e.popup;
        const popupElement = popup.getElement();
        if (popupElement) {
            const rawBtn = popupElement.querySelector('.copy-raw[data-raw-index]');
            if (rawBtn) {
                const idx = parseInt(rawBtn.getAttribute('data-raw-index'));
                rawBtn.onclick = function(event) {
                    event.stopPropagation();
                    const raw = dict?.RAWMESSAGE?.[idx] || '';
                    handleCopy(raw);
                };
            }
        }
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

function assignGroupColors(classify) {
    groupColors = {};
    Object.keys(classify).forEach(key => {
        groupColors[key] = randomColor();
    });
}

function getColorForCode(code) {
    if (!dict || !dict.CLASSIFY) return currentColorPool[0];
    for (const [group, codes] of Object.entries(dict.CLASSIFY)) {
        if (codes.includes(code)) {
            return groupColors[group] || currentColorPool[0];
        }
    }
    return currentColorPool[0];
}
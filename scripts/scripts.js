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
var drawForeignLaunchSite = 1;

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
        const style = poly.__baseStyle || poly.options || {};
        originalPolygonStyles[idx] = {
            weight: style.weight || 1,
            fillOpacity: style.fillOpacity ?? 0.5,
            opacity: style.opacity ?? 1,
            color: style.color,
            fillColor: style.fillColor || style.color
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

// 矢量图层颜色池（聚焦段以外的航警）
const colorPoolVector = [
    "#a70000ff", "#1a2cd1", "#006d1bff", "#806800ff", "#6a009bff",
    "#548100ff", "#a74e00ff", "#313131", "#a0008bff", "#006b79ff"
];

// 卫星图层颜色池（聚焦段以外的航警）
const colorPoolSatellite = [
    "#ff3b3b", "#00d9ff", "#00ff41", "#ffea00", "#c300ffff",
    "#7dff00", "#ff8c00", "#ffffff", "#ff1493", "#00ffff"
];

// 聚焦段（[ICAO_FOCUSED]）专用颜色池：与全量池错开，保证两类航警一眼可分
const colorPoolVectorFocused = [
    "#00b7d4ff", "#ff3d8bff", "#7a4bffff", "#00b050ff", "#ff7a00ff",
    "#c200c2ff", "#4a4affff", "#00a3a3ff", "#ff5c5cff", "#8fa300ff"
];

const colorPoolSatelliteFocused = [
    "#00e5ffff", "#ff2d95ff", "#b388ffff", "#00ff9dff", "#ffaa00ff",
    "#ff00e5ff", "#6ec6ffff", "#00ffd5ff", "#ff6b6bff", "#e8ff3aff"
];

// 当前使用的颜色池
let currentColorPool = colorPoolVector;
let currentFocusedColorPool = colorPoolVectorFocused;
let currentColor_idx = 0;

function randomColor() {
    return currentColorPool[currentColor_idx++ % currentColorPool.length];
}

// 根据地图类型切换颜色池
function switchColorPool(isVectorMap) {
    currentColorPool = isVectorMap ? colorPoolVector : colorPoolSatellite;
    currentFocusedColorPool = isVectorMap ? colorPoolVectorFocused : colorPoolSatelliteFocused;
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
        prefix: 'NOTAM航警落区绘制工具 by 叁点壹肆壹伍 Joey0609'
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
        
        // 重新分配颜色并重绘航警（聚焦段与外部段各用一套颜色池）
        if (dict && (dict.CLASSIFY || dict.CLASSIFY_FOCUSED)) {
            assignAllGroupColors(dict.CLASSIFY_FOCUSED, dict.CLASSIFY);
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
        drawNot(dict.TIME[i], dict.CODE[i], dict.ALTITUDE[i], i, color, 0, dict.RAWMESSAGE[i], dict.SOURCE?.[i] || 'NOTAM', dict.FIR?.[i] || '', dict.GEOMETRY?.[i] || '');
        
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
    const foreignSiteIcon = 'statics/launch.png';
    const foreignSites = [
        {
            name: '卡纳维拉尔角太空军基地',
            lat: 28.488889,
            lng: -80.577778,
            content: "<b><large>美国佛罗里达</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/卡纳维拉尔角太空军站' target='_blank' style='text-decoration: none; font-weight: bold;'>卡纳维拉尔角太空军基地</a>（Cape Canaveral Space Force Station，CCSFS）</b>，简称“卡角”，原称卡纳维拉尔角空军基地，1949 年启用，是美国东海岸的主要发射基地，现有空间发射综合体 37B、40、41 三个发射台，与肯尼迪航天中心相邻。"
        },
        {
            name: '圭亚那航天中心',
            lat: 5.28,
            lng: -52.79,
            content: "<b><large>法属圭亚那库鲁</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/圭亚那航天中心' target='_blank' style='text-decoration: none; font-weight: bold;'>圭亚那航天中心</a>（Guiana Space Centre，CSG；法语：Centre Spatial Guyanais）</b>，位于南美洲法属圭亚那库鲁西北部，1964 年建立、1968 年开始运作，由欧洲空间局、法国国家空间研究中心和阿丽亚娜空间公司共同使用。"
        },
        {
            name: '拜科努尔航天发射场',
            lat: 45.965,
            lng: 63.305,
            content: "<b><large>哈萨克斯坦拜科努尔</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/拜科努尔航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>拜科努尔航天发射场</a>（Baikonur Cosmodrome）</b>，位于哈萨克斯坦南部，1955 年建立，是世界上第一个轨道与载人航天发射场，目前由俄罗斯租借至 2050 年，俄罗斯多数卫星和所有载人飞船都在此发射。"
        },
        {
            name: '普列谢茨克航天发射场',
            lat: 62.925556,
            lng: 40.577778,
            content: "<b><large>俄罗斯阿尔汉格尔斯克</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/普列谢茨克航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>普列谢茨克航天发射场</a>（Plesetsk Cosmodrome）</b>，位于阿尔汉格尔斯克州米尔内，1957 年建立，最初是 R-7 洲际弹道导弹基地；因纬度较高，适合闪电轨道、高倾角近地轨道与太阳同步轨道发射。"
        },
        {
            name: '东方航天发射场',
            lat: 51.884553,
            lng: 128.334778,
            content: "<b><large>俄罗斯阿穆尔</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/东方航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>东方航天发射场</a>（Vostochny Cosmodrome）</b>，又称沃斯托克尼航天发射场，位于远东阿穆尔州，2016 年 4 月 28 日首次发射，用于降低俄罗斯对拜科努尔航天发射场的依赖。"
        },
        {
            name: '火箭实验室发射综合体1号',
            lat: -39.2615,
            lng: 177.864876,
            content: "<b><large>新西兰马希亚</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/火箭实验室发射综合体1号' target='_blank' style='text-decoration: none; font-weight: bold;'>火箭实验室发射综合体1号</a>（Rocket Lab Launch Complex 1）</b>，又称马希亚发射综合体，位于新西兰北岛马希亚半岛南端的阿胡里点，由火箭实验室拥有并运营；2017 年 5 月 25 日发射电子号，成为第一个执行轨道发射的私人发射场。"
        },
        {
            name: '种子岛航天中心',
            lat: 30.4,
            lng: 130.97,
            content: "<b><large>日本鹿儿岛</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/种子岛航天中心' target='_blank' style='text-decoration: none; font-weight: bold;'>种子岛航天中心</a>（Tanegashima Space Center，TNSC）</b>，位于九州以南约 40 公里的种子岛东南海岸，总面积约 9.7 平方公里，1969 年建立，是日本最大的火箭发射基地，现由日本宇宙航空研究开发机构管理。"
        },
        {
            name: '罗老航天中心',
            lat: 34.431867,
            lng: 127.535069,
            content: "<b><large>韩国全罗南道</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/罗老航天中心' target='_blank' style='text-decoration: none; font-weight: bold;'>罗老航天中心</a>（Naro Space Center）</b>，位于全罗南道高兴郡，2009 年 7 月启用，由国有的韩国航空航天研究院运营，设有两座发射台、控制塔以及火箭总装与测试设施。"
        },
        {
            name: '肯尼迪航天中心',
            lat: 28.524167,
            lng: -80.650833,
            content: "<b><large>美国佛罗里达</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/肯尼迪航天中心' target='_blank' style='text-decoration: none; font-weight: bold;'>肯尼迪航天中心</a>（Kennedy Space Center，KSC）</b>，位于佛罗里达州东海岸的梅里特岛，1962 年 7 月成立，是美国国家航空航天局主要的航天发射场，自阿波罗 4 号起一直承担 NASA 载人航天任务的发射。"
        },
        {
            name: '范登堡空军基地',
            lat: 34.732778,
            lng: -120.568056,
            content: "<b><large>美国加利福尼亚</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/范登堡太空军基地' target='_blank' style='text-decoration: none; font-weight: bold;'>范登堡空军基地</a>（Vandenberg Space Force Base，VSFB，现称范登堡太空军基地）</b>，位于加州隆坡西北约 15 公里，1941 年建立，由美国太空军第 30 太空发射三角洲部队运营，主要执行极轨卫星发射与导弹试验。"
        },
        {
            name: '萨迪什·达万航天中心',
            lat: 13.719939,
            lng: 80.230425,
            content: "<b><large>印度安得拉邦</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/萨迪什·达万航天中心' target='_blank' style='text-decoration: none; font-weight: bold;'>萨迪什·达万航天中心</a>（Satish Dhawan Space Centre，SDSC）</b>，又称斯里赫里戈达靶场（SHAR），位于安得拉邦斯里赫里戈达岛，由印度空间研究组织运营，2002 年改为以 ISRO 前主席萨迪什·达万命名。"
        },
        {
            name: '西海卫星发射场',
            lat: 39.66,
            lng: 124.705,
            content: "<b><large>朝鲜东仓里</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/西海卫星发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>西海卫星发射场</a>（Sohae Satellite Launching Station）</b>，又称东仓洞航天发射中心，位于朝鲜西北部靠近中国边界的丘陵地带，2012 年 4 月首次发射光明星 3 号失败，同年 12 月发射成功。"
        },
        {
            name: '星港',
            lat: 25.997,
            lng: -97.157,
            content: "<b><large>美国得克萨斯</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/星港' target='_blank' style='text-decoration: none; font-weight: bold;'>星港</a>（Starbase，又称星际基地、博卡奇卡发射场）</b>，位于得克萨斯州博卡奇卡村附近，隶属太空探索技术公司，是星舰的专属发射场；2025 年 5 月当地成立星港市。"
        },
        {
            name: '帕尔马希姆空军基地',
            lat: 31.897778,
            lng: 34.690556,
            content: "<b><large>以色列帕尔马希姆</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/帕尔马希姆空军基地' target='_blank' style='text-decoration: none; font-weight: bold;'>帕尔马希姆空军基地</a>（Palmachim Airbase）</b>，位于地中海沿岸的以色列军事设施与航天发射场，1988 年启用，以附近的棕榈农场命名。"
        },
        {
            name: '中大西洋区域发射场',
            lat: 37.84341,
            lng: -75.478195,
            content: "<b><large>美国弗吉尼亚</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/中大西洋区域发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>中大西洋区域发射场</a>（Mid-Atlantic Regional Spaceport，MARS）</b>，位于弗吉尼亚州沃洛普斯岛南端，隶属于沃洛普斯飞行设施，2006 年启用的商业航天发射设施。"
        },
        {
            name: '塞姆南航天中心',
            lat: 35.234444,
            lng: 53.911111,
            content: "<b><large>伊朗塞姆南</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/塞姆南航天中心' target='_blank' style='text-decoration: none; font-weight: bold;'>塞姆南航天中心</a>（Semnan Space Center）</b>，位于塞姆南市东南约 50 公里，2009 年启用，是伊朗主要的航天发射场。"
        },
        {
            name: '阿尔坎塔拉航天中心',
            lat: -2.333333,
            lng: -44.4,
            content: "<b><large>巴西马拉尼昂</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/阿尔坎塔拉航天中心' target='_blank' style='text-decoration: none; font-weight: bold;'>阿尔坎塔拉航天中心</a>（Alcantara Space Center）</b>，位于巴西马拉尼昂州阿尔坎塔拉半岛，1982 年启用，是巴西航天局的主要航天发射中心。"
        },
        {
            name: '纪伊太空发射场',
            lat: 33.544167,
            lng: 135.889444,
            content: "<b><large>日本和歌山</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/纪伊太空发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>纪伊太空发射场</a>（Space Port Kii）</b>，位于和歌山县串本町，2024 年 3 月首次发射凯洛斯 1 号，是日本第一个民营火箭发射场，由航天公司 Space One 运营。"
        }
    ].map(site => ({
        ...site,
        icon: foreignSiteIcon,
    }));

    foreignSites.forEach(site => {
        if (!Number.isFinite(site.lat) || !Number.isFinite(site.lng)) {
            console.warn('海外发射场缺少坐标，已跳过:', site.name);
            return;
        }

        drawLaunchsite(site.lat, site.lng, site.name, site.content, site.icon);
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
        const style = { color, weight: 3, opacity: 1, fillColor: color, fillOpacity: 0.6 };
        highlightPolygon = geometryToLayer(dict.GEOMETRY?.[index] || '', style);
        if (highlightPolygon) highlightPolygon.addTo(map);
    } catch (error) {
        console.error('高亮绘制失败', error);
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
    const arr = String(coordStr || '').split('-');
    const points = [];

    for (let i = 0; i < arr.length; i++) {
        const coord = pullOut(arr[i]);
        if (coord) {
            points.push([coord[1], coord[0]]); // Leaflet使用 [lat, lng]
        }
    }

    return points;
}

function parseCircleCenter(center) {
    const point = pullOut(String(center || ''));
    return point && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) ? [point[1], point[0]] : null;
}

function circleRadiusMeters(radius, unit) {
    const value = Number(radius);
    return Number.isFinite(value) && value > 0 ? value * (String(unit || '').toUpperCase() === 'NM' ? 1852 : 1000) : 0;
}

function formatCircleCoordinates(center, radius, unit) {
    return String(center || '') + ' RADIUS ' + String(radius || '') + String(unit || '').toUpperCase();
}

// Keep circles continuous on the horizontally wrapped map, just like polygons.
// The small compatibility surface lets existing sidebar/highlight code treat the
// resulting FeatureGroup as a normal vector layer.
function createWrappedCircle(center, radiusMeters, options) {
    const normalizedLng = normalizeLngForWrap(center[1]);
    const circles = WRAP_WORLD_OFFSETS.map(offset => L.circle([center[0], normalizedLng + offset], { ...options, radius: radiusMeters }));
    const group = L.featureGroup(circles);
    group.options = { ...options, radius: radiusMeters };
    group.__baseStyle = { ...group.options };
    group.setStyle = function(style) { circles.forEach(circle => circle.setStyle(style)); return group; };
    group.bringToFront = function() { circles.forEach(circle => circle.bringToFront()); return group; };
    group.bindPopup = function(content, popupOptions) { circles.forEach(circle => circle.bindPopup(content, popupOptions)); return group; };
    group.getBounds = function() { return circles[Math.floor(circles.length / 2)].getBounds(); };
    group.__circleCenter = L.latLng(center[0], normalizedLng);
    group.__circleRadius = radiusMeters;
    return group;
}

function normalizeLngForWrap(lng) {
    let value = Number(lng);
    if (!Number.isFinite(value)) return lng;
    while (value > 180) value -= 360;
    while (value < -180) value += 360;
    return value;
}

function unwrapLatLngs(latlngs) {
    if (!Array.isArray(latlngs) || latlngs.length === 0) return [];
    const output = [[latlngs[0][0], normalizeLngForWrap(latlngs[0][1])]];
    for (let index = 1; index < latlngs.length; index++) {
        let longitude = normalizeLngForWrap(latlngs[index][1]);
        const previous = output[output.length - 1][1];
        while (longitude - previous > 180) longitude -= 360;
        while (longitude - previous < -180) longitude += 360;
        output.push([latlngs[index][0], longitude]);
    }
    return output;
}

function buildWrappedLatLngRings(latlngs) {
    const continuous = unwrapLatLngs(latlngs);
    if (continuous.length < 3) return [];
    return WRAP_WORLD_OFFSETS.map(offset => continuous.map(([lat, lng]) => [lat, lng + offset]));
}

// 与 createWrappedCircle 同理：多世界副本会让 getBounds() 覆盖 ±3600°，
// 使侧边栏定位、导出图等 fitBounds 的缩放被压到最小级别，因此固定返回原始（未偏移）范围。
function createWrappedPolygon(points, options) {
    const rings = buildWrappedLatLngRings(points);
    if (rings.length === 0) return null;
    const polygon = L.polygon(rings, options);
    const baseRing = rings[Math.floor(rings.length / 2)];
    polygon.__baseLatLngs = baseRing;
    polygon.getBounds = function() { return L.latLngBounds(baseRing); };
    return polygon;
}

function geometryCoordinate(value) {
    return parseCircleCenter(String(value || ''));
}

function geometryRadiusMeters(value) {
    const match = String(value || '').match(/^(\d+(?:\.\d+)?)(KM|NM)$/i);
    return match ? circleRadiusMeters(match[1], match[2]) : 0;
}

function initialBearingDegrees(from, to) {
    const rad = Math.PI / 180;
    const lat1 = from[0] * rad, lat2 = to[0] * rad;
    const deltaLng = (to[1] - from[1]) * rad;
    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    return (Math.atan2(y, x) / rad + 360) % 360;
}

function destinationPoint(center, bearing, meters) {
    const rad = Math.PI / 180, earth = 6371008.8;
    const distance = meters / earth, direction = bearing * rad;
    const lat1 = center[0] * rad, lng1 = center[1] * rad;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance) + Math.cos(lat1) * Math.sin(distance) * Math.cos(direction));
    const lng2 = lng1 + Math.atan2(Math.sin(direction) * Math.sin(distance) * Math.cos(lat1), Math.cos(distance) - Math.sin(lat1) * Math.sin(lat2));
    return [lat2 / rad, lng2 / rad];
}

function appendArc(points, center, radius, end, direction) {
    if (!points.length || !center || !radius || !end) return false;
    const start = points[points.length - 1];
    const startBearing = initialBearingDegrees(center, start);
    const endBearing = initialBearingDegrees(center, end);
    let sweep = direction === 'CCW' ? (startBearing - endBearing + 360) % 360 : (endBearing - startBearing + 360) % 360;
    if (sweep === 0) sweep = 360;
    const steps = Math.max(1, Math.ceil(sweep / 2));
    for (let step = 1; step <= steps; step++) {
        const bearing = direction === 'CCW' ? startBearing - sweep * step / steps : startBearing + sweep * step / steps;
        points.push(destinationPoint(center, bearing, radius));
    }
    return true;
}

function geometryToLayer(geometry, options) {
    const parts = String(geometry || '').split('|');
    if (!parts[0]) return null;
    const kind = parts.shift().toUpperCase();
    if (kind === 'CIRCLE') {
        const center = geometryCoordinate((parts.find(part => part.startsWith('C=')) || '').slice(2));
        const radius = geometryRadiusMeters((parts.find(part => part.startsWith('R=')) || '').slice(2));
        return center && radius ? createWrappedCircle(center, radius, options) : null;
    }
    if (kind === 'SECTOR') {
        const center = geometryCoordinate((parts.find(part => part.startsWith('C=')) || '').slice(2));
        const radius = geometryRadiusMeters((parts.find(part => part.startsWith('R=')) || '').slice(2));
        const bearings = ((parts.find(part => part.startsWith('B=')) || '').slice(2)).split(',').map(Number);
        const direction = ((parts.find(part => part.startsWith('D=')) || '').slice(2)).toUpperCase() || 'CW';
        if (!center || !radius || bearings.length !== 2 || !bearings.every(Number.isFinite)) return null;
        const points = [center, destinationPoint(center, bearings[0], radius)];
        appendArc(points, center, radius, destinationPoint(center, bearings[1], radius), direction);
        points.push(center);
        return createWrappedPolygon(points, options);
    }
    if (kind !== 'PATH') return null;
    const points = [];
    for (const part of parts) {
        if (part.startsWith('M=') || part.startsWith('L=')) {
            const point = geometryCoordinate(part.slice(2));
            if (!point) return null;
            points.push(point);
        } else if (part.startsWith('A=')) {
            const values = Object.fromEntries(part.slice(2).split(',').map(item => item.split(':', 2)));
            const center = geometryCoordinate(values.C), end = geometryCoordinate(values.E);
            if (!appendArc(points, center, geometryRadiusMeters(values.R), end, String(values.D || 'CW').toUpperCase())) return null;
        }
    }
    return points.length >= 3 ? createWrappedPolygon(points, options) : null;
}

window.buildWrappedLatLngRings = buildWrappedLatLngRings;
window.geometryToLayer = geometryToLayer;

/* 拼接 E) 段的相邻两行：源报文既可能在单词中间硬折行（例如 "...BAC" + "K TO START"）
   也可能是自然换行。规则：
   - 行尾与行首都带空白 → 去掉行首空白直接接上（避免出现双空格）
   - 只有一侧带空白 → 直接接上（保留原有空白，不重复补空格）
   - 两侧都是字母/数字 → 判定为单词中间的硬折行 → 直接接上（BAC + K → BACK）
   - 其它情况 → 补一个空格（"...BY:" + "N3958..." → "...BY: N3958..."） */
function joinNotamLines(previous, line) {
    if (!previous) return line;
    if (!line) return previous;
    const last = previous.slice(-1);
    const first = line.slice(0, 1);
    if (/\s/.test(last) && /\s/.test(first)) return previous + line.replace(/^\s+/, '');
    if (/\s/.test(last) || /\s/.test(first)) return previous + line;
    if (/[0-9A-Za-z]/.test(last) && /[0-9A-Za-z]/.test(first)) return previous + line;
    return previous + ' ' + line;
}

/* 从原始报文中取出 E) 段正文：默认取全部行（maxLines <= 0 表示不限行数、不出现省略号），
   传入正数则最多显示该行数、多出的用 ... 省略。行内容保留原始空白，返回纯文本（不带末尾换行）。 */
function extractNotamDetails(rawMessage, maxLines = 0) {
    const text = String(rawMessage || '').replace(/\r/g, '');
    const match = text.match(/(?:^|\n)\s*E\)\s*([\s\S]*?)(?=\s[A-H]\)|$)/);
    if (!match) return '';
    // 不做 trim：行首/行尾的空白是硬折行的边界信息，拼接时要保留
    const lines = match[1].split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return '';
    const shown = maxLines > 0 ? lines.slice(0, maxLines) : lines;
    return shown.join('\n') + (shown.length < lines.length ? '...' : '');
}

function extractFullNotamDetails(rawMessage, maxLines = 0) {
    const lines = String(rawMessage == null ? '' : rawMessage)
        .replace(/\r/g, '')
        .split('\n')
        .filter(line => line.trim() !== '');
    if (lines.length === 0) return '';
    const shown = maxLines > 0 ? lines.slice(0, maxLines) : lines;
    return shown.join('\n') + (shown.length < lines.length ? '...' : '');
}

function escapeNotamText(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* 详情末尾的断行：HTML 里换行必须用 <br>；而且行尾**单个** <br> 不会渲染出空行
   （末尾的空行盒高度为 0），要「最后一行是空行」必须连续两次断行。 */
const NOTAM_DETAIL_TRAILING_BREAK = '<br><br>';

function notamDetailHtml(rawMessage, maxLines = 0) {
    const details = extractNotamDetails(rawMessage, maxLines);
    if (details) {
        const text = details.split('\n').reduce((accumulated, line) => joinNotamLines(accumulated, line), '');
        if (!text) return '';
        return escapeNotamText(text) + NOTAM_DETAIL_TRAILING_BREAK;
    }
    const full = extractFullNotamDetails(rawMessage, maxLines);
    if (!full) return '';
    return escapeNotamText(full).replace(/\n/g, '<br>') + NOTAM_DETAIL_TRAILING_BREAK;
}

/* 弹窗标题栏：左侧标题 + 右侧「图钉」（固定弹窗）与「复制」（复制原始报文），两个图标同为 14×14 */
const POPUP_PIN_ICON = "<svg width='14' height='14' viewBox='0 0 24 24' aria-hidden='true'>" +
    "<path fill='currentColor' d='M16 9V4h1V2H7v2h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z'/></svg>";
const POPUP_COPY_ICON = "<svg width='14' height='14' viewBox='0 0 24 24' aria-hidden='true'>" +
    "<path fill='currentColor' d='M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z'/></svg>";
const POPUP_CLOSE_ICON = "<svg width='14' height='14' viewBox='0 0 24 24' aria-hidden='true'>" +
    "<path fill='currentColor' d='M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'/></svg>";

let popupRawSeq = 0;
const popupRawMessages = new Map();

function registerPopupRawMessage(rawMessage) {
    const key = 'raw-' + (++popupRawSeq);
    popupRawMessages.set(key, String(rawMessage == null ? '' : rawMessage));
    return key;
}

function popupRawMessage(key) {
    return popupRawMessages.get(key) || '';
}

function buildNotamPopupHeader(title, rawMessage, headerStyle) {
    const key = registerPopupRawMessage(rawMessage);
    const styleAttr = headerStyle ? " style='" + headerStyle + "'" : '';
    return "<div class='notam-popup-header'" + styleAttr + ">" +
        "<h4>" + title + "</h4>" +
        "<div class='popup-header-actions'>" +
        "<button class='popup-pin' data-pinned='false' title='固定弹窗' aria-label='固定弹窗'>" + POPUP_PIN_ICON + "</button>" +
        "<button class='popup-copy-raw' data-raw-key='" + key + "' title='复制原始报文' aria-label='复制原始报文'>" + POPUP_COPY_ICON + "</button>" +
        "</div>" +
        "</div>";
}

/* 固定状态记在 popup 对象上：Leaflet 重新定位（点击同一多边形）会执行
   update() → _updateContent()，按原始字符串重写弹窗正文，按钮 DOM 会被重建，
   所以状态不能只存在按钮上；点击事件也改用容器委托，重建后依然有效。
   Leaflet 侧还需要同步两处：getEvents() 的 closeOnClick（点击地图关闭）、
   openOn() 的 autoClose（被新弹窗顶掉）。 */
function setPopupPinned(popup, pinned) {
    if (!popup || !popup.options) return;
    popup.__pinned = !!pinned;
    popup.options.closeOnClick = !pinned;
    popup.options.autoClose = !pinned;
    const map = popup._map || popup.__pinMap;
    if (map && typeof map.off === 'function') {
        popup.__pinMap = map;
        map.off('preclick', popup.close, popup);
        if (!pinned) map.on('preclick', popup.close, popup);
    }
    applyPopupPinState(popup);
}

/* 把固定状态套用到（可能刚被重建的）图钉按钮上 */
function applyPopupPinState(popup, container) {
    if (!popup) return;
    const element = container || (popup.getElement ? popup.getElement() : null);
    const button = element && element.querySelector ? element.querySelector('.popup-pin') : null;
    if (!button) return;
    const pinned = popup.__pinned === true;
    button.dataset.pinned = pinned ? 'true' : 'false';
    button.title = pinned ? '已固定：点击地图或打开其它航警都不会关闭' : '固定弹窗';
}

/* 容器级事件委托 + 内容重写后重新套用状态 */
function ensurePopupActionDelegation(container, popup) {
    if (!container || !popup) return;
    if (!container.__popupActionsBound && typeof container.addEventListener === 'function') {
        container.__popupActionsBound = true;
        container.addEventListener('click', function(event) {
            const target = event.target;
            if (!target || typeof target.closest !== 'function') return;
            if (target.closest('.popup-pin')) {
                event.stopPropagation();
                setPopupPinned(popup, popup.__pinned !== true);
                return;
            }
            const copyButton = target.closest('.popup-copy-raw[data-raw-key]');
            if (copyButton) {
                event.stopPropagation();
                handleCopy(popupRawMessage(copyButton.getAttribute('data-raw-key')));
            }
        });
    }
    if (typeof popup._updateContent === 'function' && !popup.__pinContentPatched) {
        popup.__pinContentPatched = true;
        const originalUpdateContent = popup._updateContent;
        popup._updateContent = function() {
            originalUpdateContent.apply(this, arguments);
            applyPopupPinState(this, container);
        };
    }
}

/* Leaflet 的关闭按钮是 <a aria-label="Close popup"><span>×</span></a>，只在 _initLayout 里创建一次，
   重写弹窗正文不会重建它，所以这里一次性换成与图钉/复制同一套 14×14 图标；
   万一没换成，按钮里仍是原来的 ×，不会变成空按钮。 */
function applyPopupCloseIcon(popup) {
    const element = popup && popup.getElement ? popup.getElement() : null;
    const button = element && element.querySelector ? element.querySelector('a.leaflet-popup-close-button') : null;
    if (!button || typeof button.innerHTML !== 'string' || button.innerHTML.indexOf('<svg') !== -1) return;
    button.innerHTML = POPUP_CLOSE_ICON;
}

/* 弹窗标题栏按钮：复制原始报文 + 固定弹窗（各页面共用一份实现） */
function bindPopupActions(layer) {
    if (!layer || typeof layer.on !== 'function') return;

    layer.on('popupopen', function(e) {
        const popup = e && e.popup;
        if (!popup) return;
        applyPopupCloseIcon(popup);
        ensurePopupActionDelegation(popup.getElement ? popup.getElement() : null, popup);
        // 每次重新打开都回到未固定状态（重新定位不会触发 popupopen，固定状态因此保留）
        setPopupPinned(popup, false);
    });

    layer.on('popupclose', function(e) {
        const popup = e && e.popup;
        if (!popup) return;
        // 关闭后恢复默认「点击地图即关闭、被新弹窗顶掉」，下次打开由 Leaflet 重新绑定
        setPopupPinned(popup, false);
    });
}

/* 统一的航警弹窗信息行：持续时间 / 航警编号 + 飞行情报区（编号在前）/ 航警详情 */
function buildNotamPopupRows(options) {
    const settings = options || {};
    let rows = "<div class='popup-info-row'>" +
        "<span class='popup-label'>持续时间:</span>" +
        "<span class='popup-value'>" + (settings.timeText || '') + "</span>" +
        "</div>" +
        "<div class='popup-info-row row-horizontal'>" +
        "<div class='popup-col'>" +
        "<span class='popup-label'>" + (settings.codeLabel || '航警编号') + ":</span>" +
        "<span class='popup-value'>" + (settings.code || '') + "</span>" +
        "</div>" +
        "<div class='popup-col'>" +
        "<span class='popup-label'>" + (settings.regionLabel || '飞行情报区') + ":</span>" +
        "<span class='popup-value'>" + (settings.regionValue || '-') + "</span>" +
        "</div>" +
        "</div>";

    // 详情默认取全部行（不截断、不加省略号），超出部分由滚动区 + 底部渐隐查看
    const detailLines = typeof settings.detailLines === 'number' ? settings.detailLines : 0;
    const detailHtml = notamDetailHtml(settings.rawMessage, detailLines);
    if (detailHtml) {
        // 外层容器用于承载底部渐隐遮罩（见 styles.css .popup-detail-wrap::after）
        rows += "<div class='popup-info-row'>" +
            "<span class='popup-label'>" + (settings.detailLabel || '航警详情') + ":</span>" +
            "<div class='popup-detail-wrap'>" +
            "<span class='popup-value popup-detail'>" + detailHtml + "</span>" +
            "</div>" +
            "</div>";
    }
    return rows + (settings.extraRows || '');
}

window.extractNotamDetails = extractNotamDetails;
window.buildNotamPopupRows = buildNotamPopupRows;

// 绘制NOTAM多边形
function drawNot(timee, codee, altitude, numm, col, is_self, rawmessage, sourceType = 'NOTAM', fir = '', geometry = '') {
    var timestr = is_self ? null : convertTime(timee);
    const style = { color: col, weight: 1, opacity: 1, fillColor: col, fillOpacity: 0.5 };
    var tmpPolygon = geometryToLayer(geometry, style);
    if (!tmpPolygon) return;
    tmpPolygon.addTo(map);
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
        var regionLabel = isMsi ? '关键词' : '飞行情报区';
        var regionValue = isMsi ? extractMsiKeywords(rawmessage) : (fir || 'UNKNOWN');

        // 统一布局：标题栏右侧「复制」按钮；内容为 持续时间 / 航警编号 + 飞行情报区（编号在前）/ 航警详情
        popupContent = "<div class='notam-popup'>" +
            buildNotamPopupHeader(popupTitle, rawmessage) +
            "<div class='notam-popup-body'>" +
            buildNotamPopupRows({
                timeText: timestr,
                code: codee,
                codeLabel: isMsi ? '海警编号' : '航警编号',
                regionLabel: regionLabel,
                regionValue: regionValue,
                detailLabel: isMsi ? '海警详情' : '航警详情',
                rawMessage: rawmessage
            }) +
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
            "<button class='copy' onclick=\"handleCopy('" + geometry + "')\">复制坐标</button>" +
            "</div>" +
            "</div>";
    }

    tmpPolygon.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'notam-info-popup'
    });

    // 标题栏「图钉 / 复制」按钮
    bindPopupActions(tmpPolygon);

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
var groupColors = {};           // 外部段 CLASSIFY → color
var groupColorsFocused = {};    // 聚焦段 CLASSIFY → color
var visibleState = {};          // index → true/false

/* 为一段 CLASSIFY 分配颜色；targetMap/pool 可指定目标映射与颜色池 */
function assignGroupColors(classify, targetMap, pool) {
    const target = targetMap || groupColors;
    const palette = pool || currentColorPool;
    Object.keys(target).forEach(key => { delete target[key]; });
    Object.keys(classify || {}).forEach(key => {
        target[key] = palette[currentColor_idx++ % palette.length];
    });
    return target;
}

/* 同时分配聚焦段与外部段的颜色：聚焦段用聚焦池，其余用全量池 */
function assignAllGroupColors(focusedClassify, classify) {
    assignGroupColors(focusedClassify || {}, groupColorsFocused, currentFocusedColorPool);
    assignGroupColors(classify || {}, groupColors, currentColorPool);
}

function getColorForCode(code) {
    for (const [group, codes] of Object.entries((dict && dict.CLASSIFY_FOCUSED) || {})) {
        if (codes.includes(code)) {
            return groupColorsFocused[group] || currentFocusedColorPool[0];
        }
    }
    if (!dict || !dict.CLASSIFY) return currentColorPool[0];
    for (const [group, codes] of Object.entries(dict.CLASSIFY)) {
        if (codes.includes(code)) {
            return groupColors[group] || currentColorPool[0];
        }
    }
    return currentColorPool[0];
}

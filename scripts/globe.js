/* 只读 Cesium 球面适配：Leaflet 仍是航警数据与二维操作的唯一来源。 */
(function () {
    'use strict';
    var viewer = null;
    var active = false;
    var handler = null;
    var hud = null;
    var popups = [];      // 打开着的气泡：2D 里固定弹窗和新弹窗可以并存，这里也支持多个
    var POPUP_TIP = 8;    // 下三角高度，与 styles.css 里 .globe-notam-popup::before 的 border 宽度一致
    var highlighted = {};
    var measurePoints = [];
    var measurePreview = null;
    var tool = 'none';
    var refreshTimer = null;
    var entitiesById = {};

    function note(message, type) {
        if (typeof window.showNotification === 'function') window.showNotification(message, type || 'info');
        else console.warn(message);
    }

    function available() {
        return !!(window.Cesium && Cesium.WebGLConstants && document.getElementById('globeMap'));
    }

    function makeViewer() {
        if (viewer) return viewer;
        if (!available()) return null;
        // Esri 的预缓存 XYZ 瓦片使用 Web Mercator；不走 ArcGIS 元数据初始化，避免资源对象未建立时停止渲染。
        var imagery = new Cesium.UrlTemplateImageryProvider({
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: 19,
            credit: new Cesium.Credit('Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community')
        });
        viewer = new Cesium.Viewer('globeMap', {
            imageryProvider: false,
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            animation: false,
            timeline: false,
            fullscreenButton: false,
            selectionIndicator: false,
            infoBox: false,
            requestRenderMode: true,
            maximumRenderTimeChange: Infinity,
            // Cesium 默认 useBrowserRecommendedResolution = true，官方说明是「忽略 window.devicePixelRatio，
            // 按 CSS 像素渲染」：整块 canvas 只有 CSS 像素那么大，2x/3x 屏上被浏览器整体放大一次，
            // 于是卫星影像、落区多边形、billboard 图标、测距线全部一起糊 —— 这就是「分辨率超级低」的根因。
            // 置为 false 后按设备像素渲染（dpr 多少就渲染多少）。
            // 若以后在 3x 手机上觉得掉帧，可再给 resolutionScale 传 2 / devicePixelRatio 把 dpr 封顶到 2x
            // （resolutionScale 是「在基准分辨率上再乘的倍数」，不是绝对物理像素比）。
            useBrowserRecommendedResolution: false,
            terrainProvider: new Cesium.EllipsoidTerrainProvider()
        });
        // 清掉默认底图后只安装 WGS-84 全球卫星图；requestRenderMode 防止空闲时持续占用显卡。
        viewer.imageryLayers.removeAll();
        var imageryLayer = viewer.imageryLayers.addImageryProvider(imagery);
        imageryLayer.show = true;
        var imageryErrorReported = false;
        imagery.errorEvent.addEventListener(function () {
            if (!imageryErrorReported) {
                imageryErrorReported = true;
                note('全球卫星影像加载失败，请检查网络后重试');
            }
        });
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#14213d');
        // 晨昏光照（3D 功能面板里的那个开关）初始关闭；开关、显示时刻、渐变动画全部交给下面的 fx 控制器。
        viewer.scene.globe.enableLighting = false;
        // 时间只由我们自己的定时器推进（见 fxStep），所以关掉 Cesium 自带的时钟推进：
        // “实时跟随 / 冻结在选定时刻 / 倍速播放”三件事因此只有一条代码路径，也不会被 clockRange 之类的
        // 设置搅乱。viewer 的 animation / timeline 本来就关着，这里只是显式钉死。
        viewer.clock.shouldAnimate = false;
        var cameraController = viewer.scene.screenSpaceCameraController;
        cameraController.enableCollisionDetection = false;
        // 视角：左右拖拽转地球保留，斜视 / 自由视角 / 双击追踪都关掉。
        //   enableTilt = false → 关掉 tiltEventTypes：中键拖拽(MIDDLE_DRAG)、双指旋转(PINCH)、Ctrl+左/右键拖拽
        //   enableLook = false → 关掉 lookEventTypes：Shift+左键拖拽（自由视角 free-look）
        //   旋转(rotateEventTypes: 左键拖拽)只移动相机在球面上的位置、不改俯仰，
        //   有 enableTilt=false 兜着，所以转的时候视角始终正着，不会变斜视。
        // 保留：左键拖拽旋转、滚轮 / 右键拖拽 / 双指缩放(zoomEventTypes)。
        // 若只想禁中键、保留双指与 Ctrl 拖拽，可改成过滤而不是总开关：
        //   cameraController.tiltEventTypes = cameraController.tiltEventTypes.filter(function (type) {
        //       return (type && type.eventType ? type.eventType : type) !== Cesium.CameraEventType.MIDDLE_DRAG;
        //   });
        cameraController.enableTilt = false;
        cameraController.enableLook = false;
        cameraController.enableRotate = true;
        // Viewer 默认把 LEFT_DOUBLE_CLICK 绑成「双击实体 = 飞过去并跟随(trackedEntity)」，
        // 那条路径带自己的倾斜角、且由 EntityView 每帧接管相机，上面的开关管不到，
        // 所以要把这条默认动作删掉，否则双击某个航警落区视角会突然切过去。
        // 注意：这只删 Viewer 自带的 handler，globe.js 自己 new 的 handler（测距「双击结束」）不受影响。
        viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        viewer.cesiumWidget.creditContainer.style.display = 'block';
        // 左下角那个 Cesium LOGO 是 CreditDisplay 的默认静态 credit。本应用完全不碰 Cesium ion
        // （geocoder / baseLayerPicker 都关了，影像走 Esri，地形用椭球），按 Cesium 官方说法这条可以移除：
        // https://community.cesium.com/t/remove-cesiumion-logo/25502
        // 影像版权文字（Tiles © Esri …）属于 Esri 影像的署名，保留不动。
        var defaultCredit = Cesium.CreditDisplay && (Cesium.CreditDisplay.cesiumCredit || Cesium.CreditDisplay._cesiumCredit);
        if (defaultCredit && viewer.creditDisplay && typeof viewer.creditDisplay.removeStaticCredit === 'function') {
            viewer.creditDisplay.removeStaticCredit(defaultCredit);
        }
        viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(103, 36, 18000000) });
        createUi();
        bindEvents();
        return viewer;
    }

    function createUi() {
        hud = document.createElement('div');
        hud.className = 'globe-query-hud';
        hud.hidden = true;
        popupContainer().appendChild(hud);
        bindFxControls();   // 3D 功能面板（晨昏光照 / 显示时刻 / 倍速播放）的控件绑定
    }

    function latLngsFromLayer(layer) {
        if (!layer) return [];
        if (layer.__baseLatLngs) return layer.__baseLatLngs.map(function (p) { return { lat: p[0], lng: p[1] }; });
        if (!layer.getLatLngs) return [];
        var value = layer.getLatLngs();
        while (Array.isArray(value) && Array.isArray(value[0])) value = value[0];
        return (value || []).map(function (p) { return { lat: p.lat, lng: p.lng }; });
    }

    function layerVisible(layer) {
        return !!(window.map && layer && (map.hasLayer(layer) || layer._map === map));
    }

    function cssColor(value, alpha) {
        var c = Cesium.Color.fromCssColorString(value || '#38bdf8');
        return c.withAlpha(alpha);
    }

    function addLayer(layer, id) {
        if (!layer || !layerVisible(layer)) return;
        var base = layer.__baseStyle || layer.options || {};
        var color = base.fillColor || base.color || '#38bdf8';
        var entity;
        if (layer.__circleCenter && layer.__circleRadius) {
            entity = viewer.entities.add({
                id: id,
                position: Cesium.Cartesian3.fromDegrees(layer.__circleCenter.lng, layer.__circleCenter.lat),
                ellipse: { semiMajorAxis: layer.__circleRadius, semiMinorAxis: layer.__circleRadius, material: cssColor(color, base.fillOpacity == null ? 0.5 : base.fillOpacity), outline: true, outlineColor: cssColor(base.color || color, 1), height: 0 }
            });
        } else {
            var points = latLngsFromLayer(layer);
            if (points.length < 3) return;
            entity = viewer.entities.add({
                id: id,
                polygon: { hierarchy: Cesium.Cartesian3.fromDegreesArray(points.reduce(function (out, p) { out.push(p.lng, p.lat); return out; }, [])), material: cssColor(color, base.fillOpacity == null ? 0.5 : base.fillOpacity), outline: true, outlineColor: cssColor(base.color || color, 1), height: 0, classificationType: Cesium.ClassificationType.BOTH }
            });
        }
        entity.__layer = layer;
        entity.__baseColor = color;
        entity.__baseOpacity = base.fillOpacity == null ? 0.5 : base.fillOpacity;
        entitiesById[id] = entity;
    }

    function addMarkers(items, prefix) {
        var count = 0;
        var seen = {};
        function normalizeLongitude(lng) {
            var value = Number(lng);
            while (value > 180) value -= 360;
            while (value < -180) value += 360;
            return value;
        }
        function visit(item) {
            if (!item) return;
            if (Array.isArray(item)) { item.forEach(visit); return; }
            if (typeof item.eachLayer === 'function' && !item.getLatLng) { item.eachLayer(visit); return; }
            if (!item.getLatLng || !layerVisible(item)) return;
            var p = item.getLatLng();
            var lng = normalizeLongitude(p.lng);
            var key = p.lat.toFixed(6) + ',' + lng.toFixed(6);
            if (seen[key]) return; // Leaflet 的世界环绕副本在球面上只显示一次。
            seen[key] = true;
            var iconOptions = item.options && item.options.icon && item.options.icon.options;
            var imageUrl = iconOptions && iconOptions.iconUrl;
            var iconSize = iconOptions && iconOptions.iconSize;
            var markerOptions = {
                id: prefix + '-' + (++count),
                position: Cesium.Cartesian3.fromDegrees(lng, p.lat)
            };
            if (imageUrl) {
                markerOptions.billboard = {
                    image: imageUrl,
                    width: iconSize ? iconSize[0] : 22,
                    height: iconSize ? iconSize[1] : 22,
                    verticalOrigin: Cesium.VerticalOrigin.CENTER,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
                };
            } else {
                markerOptions.point = { pixelSize: 9, color: Cesium.Color.WHITE, outlineColor: Cesium.Color.fromCssColorString('#0f3d63'), outlineWidth: 2, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND };
            }
            var entity = viewer.entities.add(markerOptions);
            // 记住对应的 Leaflet 标记：点击时 showPopup() 要用它的 getPopup().getContent()。
            // 之前没挂上，球面上点发射场 / 落区图标就完全没有提示（二维里是 bindPopup 的内容）。
            entity.__layer = item;
        }
        visit(items);
    }

    function addMeasures() {
        (window.__notamMeasurements || []).forEach(function (measure, index) {
            var points = measure.points || [];
            if (points.length < 2) return;
            viewer.entities.add({
                id: 'measure-' + index,
                polyline: { positions: Cesium.Cartesian3.fromDegreesArray(points.reduce(function (out, p) { out.push(p.lng, p.lat); return out; }, [])), width: 3, material: Cesium.Color.fromCssColorString('#f59e0b'), clampToGround: true }
            });
        });
    }

    function refresh() {
        if (!viewer || !active) return;
        viewer.entities.removeAll();
        entitiesById = {};
        (window.polygonAuto || []).forEach(function (layer, index) { addLayer(layer, 'auto-' + index); });
        (window.polygonArchive || []).forEach(function (layer, index) { addLayer(layer, 'archive-' + index); });
        var manualItems = typeof manualNotams !== 'undefined' ? manualNotams : [];
        var manualStates = typeof manualVisibleState !== 'undefined' ? manualVisibleState : {};
        manualItems.forEach(function (item, index) { if (item && item.polygon && manualStates[item.id] === false) return; addLayer(item && item.polygon, 'manual-' + index); });
        addMarkers(window.launchSiteMarkers || [], 'launch');
        addMarkers(window.landingZoneMarkers || [], 'landing');
        addMeasures();
        Object.keys(highlighted).forEach(function (id) { if (highlighted[id]) highlight(id, true); });
        viewer.scene.requestRender();
    }

    /* ── 气泡 ──
       2D 里 Leaflet 的弹窗可以并存：固定的弹窗不会被点地图或新弹窗顶掉。球面这边同样支持多个气泡，
       每个气泡自己记锚点 / 图钉状态 / 自动上移次数，postRender 时逐个贴回锚点。 */

    function popupContainer() { return document.getElementById('globeMap'); }

    function popupForLayer(layer) {
        for (var i = 0; i < popups.length; i++) if (popups[i].layer === layer) return popups[i];
        return null;
    }

    function createPopupEntry() {
        var entry = { el: document.createElement('div'), layer: null, anchor: null, anchorTop: 0, pinned: false, panLeft: 0, hideTimer: null, open: false };
        entry.el.className = 'globe-notam-popup';
        entry.el.hidden = true;
        entry.el.addEventListener('click', function (event) {
            var close = event.target.closest('.globe-popup-close');
            if (close) { closePopup(entry); return; }
            var pin = event.target.closest('.popup-pin');
            if (pin) { entry.pinned = !entry.pinned; applyPopupPinState(entry); return; }
            var copy = event.target.closest('.popup-copy-raw[data-raw-key]');
            if (copy && typeof window.handleCopy === 'function') window.handleCopy(window.popupRawMessage(copy.dataset.rawKey));
        });
        popupContainer().appendChild(entry.el);
        return entry;
    }

    /* 关掉一个气泡：先播淡出，动画结束再真正隐藏并从列表里摘掉（期间又被打开就取消） */
    function closePopup(entry) {
        if (!entry) return;
        entry.open = false;
        entry.anchor = null;
        entry.panLeft = 0;
        entry.pinned = false;
        entry.layer = null;
        applyPopupPinState(entry);
        entry.el.classList.remove('is-visible');
        window.clearTimeout(entry.hideTimer);
        entry.hideTimer = window.setTimeout(function () {
            if (entry.open) return;
            entry.el.hidden = true;
            var index = popups.indexOf(entry);
            if (index !== -1) popups.splice(index, 1);
            if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
        }, 200);   // 略长于 CSS 的 .18s 过渡
    }

    /* 关掉所有「没固定」的气泡（点空白 / 切回二维走这里），固定的留着 */
    function closeUnpinnedPopups() {
        popups.slice().forEach(function (entry) { if (!entry.pinned) closePopup(entry); });
    }

    /* 把图钉状态写到标题栏那颗钉子上（沿用 2D 的 data-pinned / 文案约定） */
    function applyPopupPinState(entry) {
        if (!entry) return;
        var button = entry.el.querySelector('.popup-pin');
        if (!button) return;
        button.dataset.pinned = entry.pinned ? 'true' : 'false';
        button.title = entry.pinned ? '已固定：点击地图或打开其它航警都不会关闭' : '固定弹窗';
        button.setAttribute('aria-label', button.title);
    }

    /* 上方空间不够时，照 2D autoPan 的思路把视角往上挪一点：
       相机沿经线往北走 Δ，画面里的东西就往下走 Δ，锚点因此落到更低的位置，气泡上方就有地方了。
       只改纬度、经度和高度不动，而且 setView 不带朝向 —— 相机依旧是正俯视，不会变成斜视。 */
    function panViewUp(pixels) {
        if (!viewer || !pixels) return;
        var camera = viewer.camera;
        var canvas = viewer.scene.canvas;
        var carto = camera.positionCartographic;
        if (!carto) return;
        var fovy = camera.frustum && camera.frustum.fovy ? camera.frustum.fovy : Math.PI / 3;
        // 该高度下 1 像素大约对应多少米（近似，够用；下一帧还会再量一次）
        var metersPerPixel = (2 * carto.height * Math.tan(fovy / 2)) / Math.max(1, canvas.clientHeight);
        var lat = Cesium.Math.toDegrees(carto.latitude) + (pixels * metersPerPixel) / 111320;
        lat = Math.max(-85, Math.min(85, lat));
        camera.setView({ destination: Cesium.Cartesian3.fromDegrees(Cesium.Math.toDegrees(carto.longitude), lat, carto.height) });
        viewer.scene.requestRender();
    }

    /* 把气泡摆到锚点正上方（底边的下三角指着锚点），和 2D 一致：永远在上方。
       严格跟随锚点 —— 不做屏幕边缘吸附，锚点被拖出视野时气泡就跟着只露一半或整个移出去；
       只有「刚打开」那会儿上方确实放不下，才像 2D 的 autoPan 那样把视角往上挪一点（最多两次）。 */
    function placePopup(entry, x, y) {
        var width = entry.el.offsetWidth;
        var height = entry.el.offsetHeight;
        var margin = 8;
        var gap = entry.anchorTop + POPUP_TIP;   // 气泡底边离锚点的高度：2D 的 popupAnchor + 三角高，三角尖和 2D 落在同一处
        entry.el.classList.add('globe-popup-above');
        if (y - height - gap < margin) {
            if (entry.panLeft > 0) {
                entry.panLeft--;
                panViewUp(height + gap + margin - y);
            }
        } else {
            // 已经放得下了：之后用户自己转视角/缩放时就只严格跟随，不再动相机
            entry.panLeft = 0;
        }
        var left = x - width / 2;
        entry.el.style.left = left + 'px';
        entry.el.style.top = (y - height - gap) + 'px';
        // 气泡是以锚点为中线的，三角自然就在正中间
        entry.el.style.setProperty('--popup-pointer-x', Math.min(width - 12, Math.max(12, width / 2)) + 'px');
    }

    /* 视角一动（缩放 / 旋转 / 惯性）就把每个气泡重新贴回自己的锚点；锚点转到地球背面时先藏起来 */
    function syncPopupToAnchor(entry) {
        if (!entry.open || !entry.anchor || !viewer) return;
        var screen = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, entry.anchor);
        if (!screen) { entry.el.hidden = true; return; }
        entry.el.hidden = false;
        placePopup(entry, screen.x, screen.y);
    }

    function syncPopups() {
        for (var i = 0; i < popups.length; i++) syncPopupToAnchor(popups[i]);
    }

    function showPopup(layer, position) {
        if (!layer) return;
        var content = layer.getPopup && layer.getPopup() ? layer.getPopup().getContent() : '';
        if (!content) return;
        // 已经有这个图层的气泡就复用它；否则复用最后一个「没固定」的（对应 Leaflet 的 autoClose），
        // 固定的那些留着不动 —— 所以点别处不会把 PIN 住的气泡顶掉。
        var entry = popupForLayer(layer);
        if (!entry) {
            var last = popups[popups.length - 1];
            entry = last && !last.pinned ? last : createPopupEntry();
        }
        window.clearTimeout(entry.hideTimer);
        var wasOpen = entry.open;
        entry.el.innerHTML = '<button class="globe-popup-close" aria-label="关闭">×</button>' + content;
        // 有标题栏的气泡把关闭按钮挪进标题栏；没有标题栏的（发射场 / 落区）就留在右上角
        var closeButton = entry.el.querySelector('.globe-popup-close');
        var headerActions = entry.el.querySelector('.popup-header-actions');
        if (closeButton && headerActions) headerActions.appendChild(closeButton);
        // 发射场 / 回收场这类没有 .notam-popup 内容的气泡，切到和 2D Leaflet 完全一致的那套样式
        entry.el.classList.toggle('globe-popup-plain', !entry.el.querySelector('.notam-popup'));
        // 2D 里气泡离锚点多高由 Leaflet 的 popupAnchor 决定（发射场是 -40），照抄过来三角尖位置才一致
        var iconOptions = layer.options && layer.options.icon && layer.options.icon.options;
        entry.anchorTop = iconOptions && iconOptions.popupAnchor ? Math.abs(iconOptions.popupAnchor[1]) : 0;
        // 新气泡 / 换了一个航警回到未固定；同一个航警再点一次只是重绘内容，固定状态保留（与 2D 一致）
        if (!wasOpen || entry.layer !== layer) entry.pinned = false;
        entry.layer = layer;
        entry.anchor = position;   // 世界坐标；之后每帧都拿它重算屏幕位置，跟着视角一起动
        entry.open = true;
        entry.panLeft = 2;
        entry.el.hidden = false;
        if (popups.indexOf(entry) === -1) popups.push(entry);
        applyPopupPinState(entry);
        syncPopupToAnchor(entry);
        if (wasOpen) {
            entry.el.classList.add('is-visible');   // 已经开着，换内容不重播动画，免得闪
        } else {
            // 从关到开：先摆好位置和三角，下一帧再加 .is-visible，让淡入 + 展开真的跑起来
            entry.el.classList.remove('is-visible');
            window.requestAnimationFrame(function () {
                if (entry.open) entry.el.classList.add('is-visible');
            });
        }
    }

    function pickPosition(screenPosition) {
        if (!viewer) return null;
        var ray = viewer.camera.getPickRay(screenPosition);
        var cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        if (!cartesian) return null;
        var cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        return { lat: Cesium.Math.toDegrees(cartographic.latitude), lng: Cesium.Math.toDegrees(cartographic.longitude) };
    }

    function updateHud(point) {
        if (!hud) return;
        if (!point) { hud.hidden = true; return; }
        hud.textContent = '纬度: ' + point.lat.toFixed(6) + '，经度: ' + point.lng.toFixed(6) + '  Ctrl+C 复制';
        hud.hidden = false;
    }

    function globeDistance(points) {
        var total = 0;
        for (var i = 1; i < points.length; i++) {
            var a = Cesium.Cartographic.fromDegrees(points[i - 1].lng, points[i - 1].lat);
            var b = Cesium.Cartographic.fromDegrees(points[i].lng, points[i].lat);
            total += new Cesium.EllipsoidGeodesic(a, b).surfaceDistance;
        }
        return total;
    }

    function drawPreview(cursor) {
        if (!viewer) return;
        if (measurePreview) viewer.entities.remove(measurePreview);
        var points = measurePoints.slice();
        if (cursor) points.push(cursor);
        if (points.length < 2) return;
        measurePreview = viewer.entities.add({ polyline: { positions: Cesium.Cartesian3.fromDegreesArray(points.reduce(function (out, p) { out.push(p.lng, p.lat); return out; }, [])), width: 3, material: Cesium.Color.fromCssColorString('#f59e0b'), clampToGround: true } });
        if (hud) { hud.textContent = '测距: ' + formatDistance(globeDistance(points)) + '；双击结束，右键退出'; hud.hidden = false; }
    }

    function formatDistance(meters) { return meters < 1000 ? meters.toFixed(0) + ' m' : (meters / 1000).toFixed(2) + ' km'; }

    function bindEvents() {
        handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        // 每渲染一帧就把打开的气泡贴回锚点：滚轮缩放、拖拽旋转、惯性滑行期间气泡都跟着航警走
        viewer.scene.postRender.addEventListener(syncPopups);
        handler.setInputAction(function (movement) {
            var point = pickPosition(movement.position);
            if (tool === 'latlng') { updateHud(point); return; }
            if (tool === 'measure') { if (point) { measurePoints.push(point); drawPreview(); } return; }
            var picked = viewer.scene.pick(movement.position);
            if (Cesium.defined(picked) && picked.id && picked.id.__layer) {
                var entityPosition = picked.id.position && typeof picked.id.position.getValue === 'function' ? picked.id.position.getValue(Cesium.JulianDate.now()) : null;
                if (!entityPosition && point) entityPosition = Cesium.Cartesian3.fromDegrees(point.lng, point.lat);
                if (entityPosition) showPopup(picked.id.__layer, entityPosition);
            }
            else closeUnpinnedPopups();   // 点空白只关没固定的，PIN 住的留着（和 2D 一致）
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        handler.setInputAction(function (movement) {
            var point = pickPosition(movement.endPosition);
            if (tool === 'latlng') updateHud(point);
            if (tool === 'measure' && measurePoints.length) drawPreview(point);
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        handler.setInputAction(function () {
            if (tool !== 'measure') return;
            if (measurePoints.length < 2) { note('请至少选择两个点再结束测距'); return; }
            if (window.NotamMeasure) window.NotamMeasure.addGlobeMeasure(measurePoints.slice());
            note('测距完成: ' + formatDistance(globeDistance(measurePoints)), 'success');
            measurePoints = [];
            if (measurePreview) viewer.entities.remove(measurePreview);
            measurePreview = null;
            refresh(true);
        }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        handler.setInputAction(function () {
            if (tool === 'measure' && window.NotamMeasure) window.NotamMeasure.stopFromGlobe();
            else if (tool === 'latlng' && window.NotamMeasure) window.NotamMeasure.stopFromGlobe();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    /* ══════════════════ 3D 功能面板：晨昏光照 / 显示时刻 / 倍速播放 ══════════════════

       光照本体只有两件事：打开 viewer.scene.globe.enableLighting，再把 viewer.clock.currentTime
       拨到要看的时刻 —— Cesium 的太阳方向每帧由 frameState.time（= clock.tick()）算出，所以
       “改时刻”就是“改晨昏线”。三个必须知道的点（都来自 Cesium 1.114 的官方文档与源码）：

       1) 本 viewer 是 requestRenderMode: true + maximumRenderTimeChange: Infinity（见 makeViewer）：
          改时刻、改光照都不会自动重绘，必须自己调 viewer.scene.requestRender()。
       2) 本 viewer 用 EllipsoidTerrainProvider，globe 走的是 GlobeFS.glsl 里的 ENABLE_DAYNIGHT_SHADING
          分支：lambertDiffuseMultiplier / vertexShadowDarkness 是死开关（那一支把系数写死成
          clamp(lambert * 5.0 + 0.3, 0, 1)），SunLight.intensity 也会被 czm_lightColor 的
          “max 分量归一化到 1”吃掉。唯一能连续调“晨昏强度”的是 lightingFadeOut/InDistance 这一对：
              fade = clamp((cameraDist - fadeOut) / (fadeIn - fadeOut), 0, 1)
              diffuseIntensity = mix(1.0, diffuseIntensity, fade)
              vec4 finalColor = vec4(color.rgb * czm_lightColor * diffuseIntensity, color.a)
          fade = 0 时 diffuseIntensity 恒为 1.0，而关闭光照走的是 finalColor = color —— 两者等价，
          所以“渐渐打开”= 让 fade 从 0 连续涨到默认值，并且只在 fade = 0 的那一帧翻 enableLighting，
          翻转那一帧不会有跳变。地面大气按同一个 fade 混合
          （finalColor.rgb = mix(finalColor.rgb, finalAtmosphereColor.rgb, fade)），于是它也一起渐入。
       3) 默认距离（1e7 / 2e7）是刻意保留的：相机离地心 < 1e7（高度约 < 3600km）时晨昏会淡出到没有，
          这是 Cesium 的既定行为，产品上也决定不做提示。想让任何缩放都保留晨昏，
          把 FX_DEFAULT_FADEOUT / FX_DEFAULT_FADEIN 改成 0 / 1 即可。

       开关、显示时刻、倍速都只存在这个模块的内存里：切到 2D 再回 3D 仍然保留，刷新页面就重置
       （仓库不引入 localStorage，这次也不引入）。 */

    var FX_DEFAULT_FADEOUT = 10000000;   // Cesium 1.114 默认 globe.lightingFadeOutDistance
    var FX_DEFAULT_FADEIN = 20000000;    // Cesium 1.114 默认 globe.lightingFadeInDistance
    var FX_FAR = 1000000000000;          // “恒不点亮”用的超大距离，见 fxSetEffectiveFade()
    var FX_FADE_DUR = 650;               // 晨昏强度渐入 / 渐出时长（ms）
    var FX_HAZE_DUR = 250;               // 地面大气那一相的时长（ms）：翻 enableLighting 的前后各补一段
    var FX_SPEED_MIN = 1;
    var FX_SPEED_MAX = 86400;            // 1 秒 = 1 天（地球自转一圈）

    var fxEnabled = false;               // 开关状态
    var fxMode = 'playing';              // 'playing' 播放中 | 'frozen' 冻结在显示时刻
    var fxMultiplier = 1;                // 倍速，1 = 真实速度（此时按真实时间对齐）
    var fxTime = null;                   // Cesium.JulianDate：当前显示时刻
    var fxTimer = null;
    var fxLastStep = 0;
    var fxBound = false;
    var fxFadeRaf = 0;
    var fxFadeFrom = 0, fxFadeTo = 0, fxFadeStart = 0, fxFadeDur = 0, fxFadeDone = null;
    var fxFadeCurrent = 0;               // 动画内部的当前强度（0 = 无晨昏，1 = 完整晨昏）
    var fxFadePinned = false;            // 那一对距离是否正被动画（或调试助手）接管

    function fxEl(id) { return document.getElementById(id); }
    function fxPad(value) { return (value < 10 ? '0' : '') + value; }
    /* JulianDate → 原生 Date。注意 Cesium 1.114 的 toDate 是**静态方法**（JulianDate.toDate(jd)），
       实例上并没有 toDate —— 写成 jd.toDate() 会当场抛 “fxTime.toDate is not a function”。
       所有“把显示时刻变成人能读的东西”的路径都走这里，别再直接调实例方法。 */
    function fxDate(julianDate) { return Cesium.JulianDate.toDate(julianDate); }

    function fxClampSpeed(value) {
        value = Number(value);
        if (!isFinite(value) || value < FX_SPEED_MIN) return FX_SPEED_MIN;
        if (value > FX_SPEED_MAX) return FX_SPEED_MAX;
        return value;
    }

    /* 滑杆（0–1000 线性）↔ 倍速（1–86400 对数）：滑块 0% = 1×、100% = 86400×，中间按固定比例变化 */
    function fxSpeedFromSlider(value) {
        var t = Math.min(1000, Math.max(0, Number(value) || 0)) / 1000;
        return fxClampSpeed(Math.round(Math.pow(FX_SPEED_MAX, t)));
    }
    function fxSliderFromSpeed(multiplier) {
        return Math.round(Math.log(fxClampSpeed(multiplier)) / Math.log(FX_SPEED_MAX) * 1000);
    }
    function fxDurationText(seconds) {
        if (seconds < 60) return seconds + ' 秒';
        if (seconds < 3600) return Math.round(seconds / 60) + ' 分钟';
        if (seconds < 86400) return (seconds / 3600).toFixed(seconds % 3600 ? 1 : 0) + ' 小时';
        return (seconds / 86400).toFixed(seconds % 86400 ? 1 : 0) + ' 天';
    }
    function fxSpeedText(multiplier) {
        return Math.round(multiplier) + '×（1 秒 = ' + fxDurationText(Math.round(multiplier)) + '）';
    }

    /* 本地时间 → datetime-local 的 value（YYYY-MM-DDTHH:mm）：必须用本地字段拼，
       不能用 toISOString().slice()，那是 UTC，会整整差一个时区。 */
    function fxLocalInputValue(date) {
        return date.getFullYear() + '-' + fxPad(date.getMonth() + 1) + '-' + fxPad(date.getDate()) +
            'T' + fxPad(date.getHours()) + ':' + fxPad(date.getMinutes());
    }
    /* datetime-local 的 value → Date：手动切分再 new Date(y, m-1, d, h, mi)，
       而不是 new Date(字符串) —— 无时区的日期时间串在不同浏览器/历史版本里解析规则不一致，
       手动构造才能钉死“本地时间”语义（和上面写出时的语义对称）。 */
    function fxParseLocalInput(value) {
        var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
        if (!m) return null;
        var date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0);
        return isNaN(date.getTime()) ? null : date;
    }
    function fxUtcText(date) {
        return date.getUTCFullYear() + '-' + fxPad(date.getUTCMonth() + 1) + '-' + fxPad(date.getUTCDate()) +
            ' ' + fxPad(date.getUTCHours()) + ':' + fxPad(date.getUTCMinutes()) + 'Z';
    }
    /* 与“现在”的差值：先归到分钟再拆天/小时/分，避免出现“0小时60分”这种取整毛刺 */
    function fxDeltaText(seconds) {
        var totalMinutes = Math.round(Math.abs(seconds) / 60);
        var parts = [];
        var days = Math.floor(totalMinutes / 1440);
        var hours = Math.floor((totalMinutes % 1440) / 60);
        var minutes = totalMinutes % 60;
        if (days) parts.push(days + '天');
        if (hours) parts.push(hours + '小时');
        if (minutes || !parts.length) parts.push(minutes + '分');
        return (seconds >= 0 ? '+' : '-') + parts.join('');
    }
    function fxModeText() {
        if (!fxEnabled) return '已关闭';
        if (fxMode === 'frozen') return '已暂停';
        if (fxMultiplier === 1) return '实时跟随';
        return '播放中';
    }
    function fxStatusText() {
        if (!fxTime) return '当前未显示晨昏';
        var date = fxDate(fxTime);
        var delta = Cesium.JulianDate.secondsDifference(fxTime, Cesium.JulianDate.now());
        return '显示 ' + fxLocalInputValue(date).replace('T', ' ') + '（本地） · ' + fxUtcText(date) + ' UTC\n' +
            '距现在 ' + fxDeltaText(delta) + ' · 状态 ' + fxModeText();
    }

    function fxSyncUi() {
        var toggle = fxEl('globeFxToggle');
        if (toggle) toggle.checked = fxEnabled;
        // 正在输入的输入框不要被定时器改写，否则光标会被顶掉
        var timeInput = fxEl('globeFxTime');
        if (timeInput && fxTime && document.activeElement !== timeInput) timeInput.value = fxLocalInputValue(fxDate(fxTime));
        var slider = fxEl('globeFxSpeed');
        if (slider && document.activeElement !== slider) slider.value = String(fxSliderFromSpeed(fxMultiplier));
        var speedLabel = fxEl('globeFxSpeedLabel');
        if (speedLabel) speedLabel.textContent = fxSpeedText(fxMultiplier);
        var play = fxEl('globeFxPlay');
        if (play) play.textContent = fxMode === 'playing' ? '⏸ 暂停' : '▶ 播放';
        var status = fxEl('globeFxStatus');
        if (status) status.textContent = fxStatusText();
    }

    /* 推进一次：1× 直接对齐真实时间（顺带自动修正漂移），其它倍速按“真实流逝 × 倍速”累加
       —— 页面被挂起时定时器不跑，也就不会在回来时突然跳一大段。 */
    function fxStep() {
        if (!viewer || !fxTime) return;
        var nowMs = Date.now();
        var elapsed = fxLastStep ? Math.max(0, nowMs - fxLastStep) / 1000 : 0;
        fxLastStep = nowMs;
        if (fxMultiplier === 1) {
            fxTime = Cesium.JulianDate.now();
        } else if (elapsed > 0) {
            fxTime = Cesium.JulianDate.addSeconds(fxTime, elapsed * fxMultiplier, fxTime);
        }
        viewer.clock.currentTime = fxTime;
        fxSyncUi();
        viewer.scene.requestRender();
    }

    /* 刷新节奏由倍速决定，取 60000 / 倍速 毫秒，让全球视野下每次重绘大约只移动一两个像素：
         1×     → 60000ms（真实时间跟随，一分钟一帧，显卡几乎不动）
         600×   → 100ms
         86400× → 下限 16ms（≈ 每帧，画面里地球一秒转一圈） */
    function fxIntervalMs() {
        return Math.max(16, Math.round(60000 / fxMultiplier));
    }
    function fxStopTimer() {
        if (fxTimer) { window.clearInterval(fxTimer); fxTimer = null; }
    }
    function fxStartTimer() {
        fxStopTimer();
        if (!viewer || !fxEnabled || fxMode === 'frozen' || !active || document.hidden) return;
        fxLastStep = Date.now();
        fxTimer = window.setInterval(fxStep, fxIntervalMs());
    }

    /* 与 GlobeFS 一致：3D 下 cameraDist = length(czm_view[3]) = 相机到地心的距离 */
    function fxCameraDistance() {
        return viewer ? Cesium.Cartesian3.magnitude(viewer.camera.positionWC) : 0;
    }
    /* 默认距离下、当前相机距离对应的晨昏强度（0 = 完全无晨昏，1 = 完整晨昏） */
    function fxDefaultFade() {
        var distance = fxCameraDistance();
        var fade = (distance - FX_DEFAULT_FADEOUT) / (FX_DEFAULT_FADEIN - FX_DEFAULT_FADEOUT);
        return Math.min(1, Math.max(0, fade));
    }
    /* 反解出一对距离，让 fade 恰好等于 f：fadeOut = D - f*K、fadeIn = D + (1-f)*K
       （代回 fade = (cameraDist - fadeOut) / (fadeIn - fadeOut) 正好是 f；分母恒为 K > 0，不会除零）。
       两个端点用固定值：f <= 0 → 任何缩放下恒不点亮；f >= 1 → 任何缩放下都是完整晨昏。
       每帧按“当时的 D”重算，所以动画期间用户缩放 / 旋转也不会跳。 */
    function fxSetEffectiveFade(f) {
        if (!viewer) return;
        var d = fxCameraDistance();
        if (f <= 0) {
            viewer.scene.globe.lightingFadeOutDistance = FX_FAR;
            viewer.scene.globe.lightingFadeInDistance = FX_FAR + 1;
        } else if (f >= 1) {
            viewer.scene.globe.lightingFadeOutDistance = 0;
            viewer.scene.globe.lightingFadeInDistance = 1;
        } else {
            var k = FX_DEFAULT_FADEIN - FX_DEFAULT_FADEOUT;
            viewer.scene.globe.lightingFadeOutDistance = d - f * k;
            viewer.scene.globe.lightingFadeInDistance = d + (1 - f) * k;
        }
    }
    /* 当前真实的晨昏强度。距离没被动画接管时，那一对距离就是默认值，真实强度也就是 fxDefaultFade()；
       不能直接报 fxFadeCurrent —— 用户缩放 / 旋转会改变默认强度，上一次动画留下的值会过时，
       而“过时的值”一旦被当成下一次动画的起点，就会出现“先跳到旧强度、再渐隐”的突变
       （默认距离下从全球视角拉到 15000km，强度本来就是 0.5，不能拿上一次的 1.0 当起点）。 */
    function fxCurrentFade() {
        return fxFadePinned ? fxFadeCurrent : fxDefaultFade();
    }
    /* 动画结束 / 直接落地都回到 Cesium 默认距离：此时 fade 仍等于 fxDefaultFade()，外观不变 */
    function fxRestoreFadeDistances() {
        if (!viewer) return;
        viewer.scene.globe.lightingFadeOutDistance = FX_DEFAULT_FADEOUT;
        viewer.scene.globe.lightingFadeInDistance = FX_DEFAULT_FADEIN;
    }
    function fxFinishFade() {
        if (!viewer) return;
        fxFadePinned = false;
        fxFadeCurrent = fxDefaultFade();
        fxRestoreFadeDistances();
        viewer.scene.requestRender();
    }
    /* 起步一个渐变动画（缓入缓出）。已经在跑就直接换目标：从当前强度接着走，不回零、不闪。 */
    function fxAnimateFade(target, duration, onDone) {
        target = Math.min(1, Math.max(0, target));
        if (!fxFadePinned) {
            // 全新一轮动画：先把起点对齐“此刻真实的强度”（缩放会改变它）。
            // 同一轮里的相位交接（开：收大气 → 晨昏渐入）时 fxFadePinned 已经是 true，沿用动画值。
            fxFadeCurrent = fxDefaultFade();
            fxFadePinned = true;
        }
        fxFadeFrom = fxFadeCurrent;
        fxFadeTo = target;
        fxFadeDur = Math.max(0, duration);
        fxFadeStart = 0;
        fxFadeDone = onDone || null;
        if (!fxFadeRaf) fxFadeRaf = window.requestAnimationFrame(fxFadeFrame);
    }
    function fxFadeFrame(timestamp) {
        if (!viewer) { fxFadeRaf = 0; fxFadeDone = null; return; }
        if (!fxFadeStart) fxFadeStart = timestamp;
        var p = fxFadeDur > 0 ? Math.min(1, (timestamp - fxFadeStart) / fxFadeDur) : 1;
        var eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;   // easeInOutCubic
        fxFadeCurrent = fxFadeFrom + (fxFadeTo - fxFadeFrom) * eased;
        fxSetEffectiveFade(fxFadeCurrent);
        viewer.scene.requestRender();
        if (p >= 1) {
            var done = fxFadeDone;
            fxFadeRaf = 0;
            fxFadeDone = null;
            if (done) done();
            return;
        }
        fxFadeRaf = window.requestAnimationFrame(fxFadeFrame);
    }

    /* 开关：分两相，保证“翻 enableLighting 的那一帧 fade 正好是 0”，因此没有突变。
         开：fade 默认值 → 0（此时光照还是关的，只是把地面大气平滑收掉）→ 翻成开 → fade 0 → 默认值（晨昏与大气一起渐入）
         关：fade 默认值 → 0（晨昏渐隐）→ 翻成关 → fade 0 → 默认值（把地面大气那一层平滑接回来） */
    function fxSetEnabled(enabled) {
        if (!viewer) return;
        enabled = !!enabled;
        if (enabled === fxEnabled) { fxSyncUi(); return; }
        fxEnabled = enabled;
        if (enabled) {
            if (viewer.scene.globe.enableLighting) {
                // 光照本来就开着（例如上一次关闭动画还没跑完又点开）：直接渐入，不需要翻转
                fxAnimateFade(fxDefaultFade(), FX_FADE_DUR, fxFinishFade);
            } else {
                fxAnimateFade(0, FX_HAZE_DUR, function () {
                    if (!viewer || !fxEnabled) return;
                    viewer.scene.globe.enableLighting = true;
                    fxAnimateFade(fxDefaultFade(), FX_FADE_DUR, fxFinishFade);
                });
            }
            if (!fxTime) fxTime = Cesium.JulianDate.now();
            fxMode = 'playing';
            fxMultiplier = 1;                   // 打开就是 1× 实时跟随
            viewer.clock.currentTime = fxTime;
            fxStartTimer();
        } else {
            fxStopTimer();
            if (!viewer.scene.globe.enableLighting) {
                fxAnimateFade(fxDefaultFade(), FX_HAZE_DUR, function () {
                    if (!viewer || fxEnabled) return;
                    fxFinishFade();
                });
            } else {
                fxAnimateFade(0, FX_FADE_DUR, function () {
                    if (!viewer || fxEnabled) return;
                    viewer.scene.globe.enableLighting = false;
                    fxAnimateFade(fxDefaultFade(), FX_HAZE_DUR, function () {
                        if (!viewer || fxEnabled) return;
                        fxFinishFade();
                    });
                });
            }
        }
        fxSyncUi();
    }

    /* 拨到某个时刻。frozen 为 false 表示“从这一刻起继续播放”。 */
    function fxSetTime(date, frozen) {
        if (!viewer || !date || isNaN(date.getTime())) return;
        fxTime = Cesium.JulianDate.fromDate(date);
        viewer.clock.currentTime = fxTime;
        fxMode = frozen === false ? 'playing' : 'frozen';
        fxStartTimer();
        fxSyncUi();
        viewer.scene.requestRender();
    }
    function fxPlay() {
        if (!viewer || !fxEnabled) return;
        if (!fxTime) fxTime = Cesium.JulianDate.now();
        fxMode = 'playing';
        fxStartTimer();
        fxSyncUi();
    }
    function fxPause() {
        fxMode = 'frozen';
        fxStopTimer();
        fxSyncUi();
    }
    /* 回到现在：拨回真实当前时刻、倍速回 1×、恢复播放（= 实时跟随） */
    function fxResumeLive() {
        if (!viewer) return;
        fxMultiplier = 1;
        fxMode = 'playing';
        fxTime = Cesium.JulianDate.now();
        viewer.clock.currentTime = fxTime;
        if (fxEnabled) fxStartTimer();
        fxSyncUi();
        viewer.scene.requestRender();
    }

    /* 进入 / 离开 3D：光照与显示时刻按已存状态直接落地（不重播渐变动画），
       离开时暂停播放（避免回到 3D 时时间已经跑远）。 */
    function fxOnEnter() {
        if (!viewer) return;
        if (!fxTime || (fxMode === 'playing' && fxMultiplier === 1)) fxTime = Cesium.JulianDate.now();
        viewer.clock.currentTime = fxTime;
        viewer.scene.globe.enableLighting = fxEnabled;
        fxFadePinned = false;
        fxFadeCurrent = fxDefaultFade();
        fxRestoreFadeDistances();
        fxStartTimer();
        fxSyncUi();
        viewer.scene.requestRender();
    }
    function fxOnLeave() {
        fxStopTimer();
        if (fxMode === 'playing' && fxMultiplier !== 1) fxMode = 'frozen';
        if (typeof window.closeGlobeFxArea === 'function') window.closeGlobeFxArea();
    }

    function bindFxControls() {
        if (fxBound) return;
        var toggle = fxEl('globeFxToggle');
        var timeInput = fxEl('globeFxTime');
        var slider = fxEl('globeFxSpeed');
        if (!toggle || !timeInput || !slider) return;   // 页面上没有这套控件（理论上不会发生）
        fxBound = true;
        if (!fxTime) fxTime = Cesium.JulianDate.now();

        toggle.addEventListener('change', function () { fxSetEnabled(toggle.checked); });

        timeInput.addEventListener('change', function () {
            var date = fxParseLocalInput(timeInput.value);
            if (!date) { note('时间格式不正确，已保留当前显示时刻'); fxSyncUi(); return; }
            fxSetTime(date, true);   // 手动选时刻 = 冻结在该时刻
        });

        Array.prototype.forEach.call(document.querySelectorAll('[data-globe-fx-offset]'), function (button) {
            button.addEventListener('click', function () {
                var base = fxTime ? fxDate(fxTime) : new Date();
                var offset = Number(button.getAttribute('data-globe-fx-offset')) || 0;
                fxSetTime(new Date(base.getTime() + offset * 1000), true);
            });
        });

        var nowButton = fxEl('globeFxNow');
        if (nowButton) nowButton.addEventListener('click', fxResumeLive);

        var playButton = fxEl('globeFxPlay');
        if (playButton) playButton.addEventListener('click', function () {
            if (fxMode === 'playing') fxPause(); else fxPlay();
        });

        slider.addEventListener('input', function () {
            fxMultiplier = fxSpeedFromSlider(slider.value);
            fxSyncUi();
            if (fxMode === 'playing') fxStartTimer();   // 换倍速 = 换刷新节奏
        });

        // 切到后台就停推进（省掉看不见的空转），回前台继续；1× 会自己重新对齐真实时间，不会跳变
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) fxStopTimer(); else fxStartTimer();
        });

        fxSyncUi();
    }

    function enter() {
        var instance = makeViewer();
        if (!instance) { note('3D 地球当前不可用，已保留二维地图'); return; }
        var center = window.map ? map.getCenter() : { lat: 36, lng: 103 };
        var zoom = window.map ? map.getZoom() : 6;
        var height = Math.max(250000, 22000000 / Math.pow(2, Math.max(0, zoom - 2)));
        instance.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, height) });
        active = true;
        window.mapViewMode = '3d';
        document.body.classList.add('globe-active');
        refresh();
        fxOnEnter();   // 相机已经摆好（fxDefaultFade 依赖相机到地心的距离），再把晨昏/时刻落地
        window.requestAnimationFrame(function () { instance.resize(); instance.scene.requestRender(); });
        if (typeof window.updateMapModeControl === 'function') window.updateMapModeControl();
    }

    function leave() {
        if (!active) return;
        var cartographic = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
        if (cartographic && window.map) {
            map.setView([Cesium.Math.toDegrees(cartographic.latitude), Cesium.Math.toDegrees(cartographic.longitude)], map.getZoom(), { animate: false });
        }
        active = false;
        tool = 'none';
        measurePoints = [];
        if (measurePreview) viewer.entities.remove(measurePreview);
        measurePreview = null;
        // 切回二维：没固定的气泡关掉；PIN 住的留在列表里（元素随容器一起隐藏），再进 3D 时原样出现
        closeUnpinnedPopups();
        if (hud) hud.hidden = true;
        document.body.classList.remove('globe-active');
        window.mapViewMode = '2d';
        fxOnLeave();   // 停推进、收起功能面板（开关/时刻/倍速都留着，回 3D 时按原状态落地）
        if (typeof window.updateMapModeControl === 'function') window.updateMapModeControl();
    }

    function setActiveTool(next) {
        tool = next || 'none';
        measurePoints = [];
        if (measurePreview && viewer) viewer.entities.remove(measurePreview);
        measurePreview = null;
        if (hud) hud.hidden = tool === 'none';
    }

    function highlight(id, enabled) {
        highlighted[id] = !!enabled;
        var entity = entitiesById[id];
        if (!entity || !entity.polygon) return;
        entity.polygon.material = cssColor(entity.__baseColor, enabled ? 0.82 : entity.__baseOpacity);
        entity.polygon.outlineColor = cssColor(entity.__baseColor, 1);
        viewer.scene.requestRender();
    }


    document.addEventListener('click', function (event) {
        if (!active) return;
        if (!event.target.closest('#exportButton, #btnExportImage, #selectAreaBtn, #manualToggle, .custom-btn')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        note('图片导出和手动绘制仅支持二维地图，请先返回二维地图');
    }, true);
    // 只在二维图层真实增删时重建球面要素，不再用定时器轮询，避免 GPU 长时间满载。
    if (window.map && typeof map.on === 'function') {
        map.on('layeradd layerremove', function () {
            if (!active) return;
            window.clearTimeout(refreshTimer);
            refreshTimer = window.setTimeout(function () { refresh(); }, 80);
        });
    }
    window.NotamGlobe = {
        enter: enter,
        leave: leave,
        refresh: refresh,
        isActive: function () { return active; },
        setActiveTool: setActiveTool,
        highlight: highlight,
        /* 3D 功能面板（晨昏光照 / 显示时刻 / 倍速播放）的状态与操作。
           面板 DOM 的开合归 buttons.js，这里只管状态与渲染。
           state() 与 setEffectiveFade() 是给人工验收用的：控制台里
           NotamGlobe.fx.setEffectiveFade(0.5) 应该看到“半强度晨昏”（证明强度是连续量而不是硬切），
           fx.state() 会报出当前生效强度与那一对距离。 */
        fx: {
            isEnabled: function () { return fxEnabled; },
            setEnabled: function (value) { fxSetEnabled(value); },
            setTime: function (value) {
                var date = value instanceof Date ? value : new Date(value);
                if (isNaN(date.getTime())) return;
                fxSetTime(date, true);
            },
            setMultiplier: function (value) {
                fxMultiplier = fxClampSpeed(value);
                fxSyncUi();
                if (fxMode === 'playing') fxStartTimer();
            },
            play: fxPlay,
            pause: fxPause,
            resumeLive: fxResumeLive,
            syncUi: fxSyncUi,
            state: function () {
                return {
                    enabled: fxEnabled,
                    mode: fxMode,
                    multiplier: fxMultiplier,
                    time: fxTime ? fxDate(fxTime).toISOString() : null,
                    localTime: fxTime ? fxLocalInputValue(fxDate(fxTime)) : null,
                    effectiveFade: fxCurrentFade(),
                    lighting: viewer ? viewer.scene.globe.enableLighting : null,
                    fadeOutDistance: viewer ? viewer.scene.globe.lightingFadeOutDistance : null,
                    fadeInDistance: viewer ? viewer.scene.globe.lightingFadeInDistance : null,
                    intervalMs: fxIntervalMs()
                };
            },
            setEffectiveFade: function (f) {
                if (!viewer) return;
                fxFadeCurrent = Math.min(1, Math.max(0, Number(f) || 0));
                fxFadePinned = true;   // 接管那一对距离，直到下一次开关 / 重进 3D
                fxSetEffectiveFade(fxFadeCurrent);
                viewer.scene.requestRender();
            }
        }
    };
}());
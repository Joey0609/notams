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
        viewer.scene.globe.enableLighting = false;
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
    window.NotamGlobe = { enter: enter, leave: leave, refresh: refresh, isActive: function () { return active; }, setActiveTool: setActiveTool, highlight: highlight };
}());
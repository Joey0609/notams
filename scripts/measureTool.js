(function () {
    let activeTool = 'none';
    let isMeasuring = false;
    let isLatLngQuerying = false;
    let measurePoints = [];
    let fixedLine = null;
    let tempLine = null;
    let distanceLabel = null;
    let snapHint = null;
    let latLngQueryHint = null;
    let currentQueryText = '';
    let persistedMeasures = [];
    window.__notamMeasurements = window.__notamMeasurements || [];
    let snapHintTimer = null;
    let measureStartIsLaunchSite = false;

    const SNAP_PX = 14;

    function getWrapLngOffsets() {
        if (typeof WRAP_WORLD_OFFSETS !== 'undefined' && Array.isArray(WRAP_WORLD_OFFSETS) && WRAP_WORLD_OFFSETS.length) {
            return WRAP_WORLD_OFFSETS;
        }
        return [0];
    }

    function normalizeLng(lng) {
        if (typeof normalizeLngForWrap === 'function') return normalizeLngForWrap(lng);
        let value = Number(lng);
        if (!Number.isFinite(value)) return lng;
        while (value > 180) value -= 360;
        while (value < -180) value += 360;
        return value;
    }

    function normalizeMeasureLatLng(latlng) {
        if (!latlng) return latlng;
        return L.latLng(latlng.lat, normalizeLng(latlng.lng));
    }

    // 让 value 落在上一点附近：经度差始终小于 180°，跨 180° 时不会再绕地球一圈
    function unwrapLngToPrevious(previousLng, lng) {
        let value = lng;
        while (value - previousLng > 180) value -= 360;
        while (value - previousLng < -180) value += 360;
        return value;
    }

    // 把一条经度连续的路径铺到每个世界副本上，直接交给一个 L.polyline 当多 ring 用
    function buildWrappedRings(path) {
        return getWrapLngOffsets().map(offset => path.map(point => L.latLng(point.lat, point.lng + offset)));
    }

    /* marker（公里牌 / 倾角 / 吸附提示）同样要每个副本一份，否则平移地图后它们会消失。
       返回一个句柄：group 用于 addTo / removeLayer，setLatLng / setIcon 会同步到所有副本。 */
    function createWrappedLayerSet(latlng, createLayer) {
        const offsets = getWrapLngOffsets();
        const target = normalizeMeasureLatLng(latlng);
        const layers = offsets.map(offset => createLayer(target.lat, target.lng + offset));
        return {
            group: L.layerGroup(layers),
            layers,
            offsets,
            addTo(targetMap) { this.group.addTo(targetMap); return this; },
            setLatLng(next) {
                const point = normalizeMeasureLatLng(next);
                layers.forEach((layer, index) => layer.setLatLng([point.lat, point.lng + offsets[index]]));
                return this;
            },
            setIcon(icon) {
                layers.forEach(layer => { if (typeof layer.setIcon === 'function') layer.setIcon(icon); });
                return this;
            },
            onAdd(handler) {
                layers.forEach(layer => layer.on('add', handler));
                return this;
            },
            getElement() {
                return layers.length ? layers[0].getElement() : null;
            },
        };
    }

    function createWrappedMarkerSet(latlng, options) {
        return createWrappedLayerSet(latlng, (lat, lng) => L.marker([lat, lng], options));
    }

    function notify(msg, type) {
        if (typeof showNotification === 'function') {
            showNotification(msg, type || 'info');
        } else {
            console.log(msg);
        }
    }

    function getMeasureButton() {
        return document.getElementById('btnMeasure');
    }

    function getLatLngQueryButton() {
        return document.getElementById('btnLatLngQuery');
    }

    function setButtonState(active) {
        const btn = getMeasureButton();
        if (!btn) return;
        if (active) {
            btn.classList.add('active');
            btn.textContent = '测距中';
        } else {
            btn.classList.remove('active');
            btn.textContent = '测距';
        }
    }

    function setLatLngQueryButtonState(active) {
        const btn = getLatLngQueryButton();
        if (!btn) return;
        if (active) {
            btn.classList.add('active');
            btn.textContent = '经纬度查询中';
        } else {
            btn.classList.remove('active');
            btn.textContent = '经纬度查询';
        }
    }

    function setActiveTool(tool) {
        activeTool = tool;
        isMeasuring = tool === 'measure';
        isLatLngQuerying = tool === 'latlng';
        setButtonState(isMeasuring);
        setLatLngQueryButtonState(isLatLngQuerying);
        map.getContainer().classList.toggle('measure-mode', isMeasuring);
        map.getContainer().classList.toggle('latlng-query-mode', isLatLngQuerying);
        if (window.NotamGlobe && window.NotamGlobe.isActive()) window.NotamGlobe.setActiveTool(tool);
    }

    function formatLatLng(latlng) {
        if (!latlng) return '';
        return '纬度: ' + latlng.lat.toFixed(6) + ', 经度: ' + normalizeLng(latlng.lng).toFixed(6);
    }

    function ensureLatLngQueryHint() {
        if (latLngQueryHint) return latLngQueryHint;
        const container = map.getContainer();
        latLngQueryHint = L.DomUtil.create('div', 'latlng-query-hint', container);
        latLngQueryHint.style.display = 'none';
        return latLngQueryHint;
    }

    function updateLatLngQueryHint(latlng, containerPoint) {
        const hint = ensureLatLngQueryHint();
        if (!latlng) {
            hint.style.display = 'none';
            currentQueryText = '';
            return;
        }

        currentQueryText = formatLatLng(latlng);
        hint.textContent = currentQueryText + '  Ctrl+C 复制';
        hint.style.display = 'block';

        const point = containerPoint || map.latLngToContainerPoint(latlng);
        hint.style.left = (point.x + 14) + 'px';
        hint.style.top = (point.y + 14) + 'px';
    }

    function clearLatLngQueryHint() {
        if (latLngQueryHint) {
            latLngQueryHint.style.display = 'none';
        }
        currentQueryText = '';
    }

    function formatDistance(meters) {
        if (meters < 1000) return meters.toFixed(0) + ' m';
        return (meters / 1000).toFixed(2) + ' km';
    }

    function totalDistance(points) {
        let sum = 0;
        for (let i = 1; i < points.length; i++) {
            sum += map.distance(points[i - 1], points[i]);
        }
        return sum;
    }

    // 根据每段起点纬度和该段大圆初始方位计算可达轨道倾角。
    // 结果保留升轨/降轨方向，范围为 0° 到 180°。
    function segmentInclinationDegrees(from, to) {
        if (!from || !to) return null;
        if (Math.abs(from.lat - to.lat) < 1e-12 && Math.abs(from.lng - to.lng) < 1e-12) return null;

        const lat1 = toRad(from.lat);
        const lat2 = toRad(to.lat);
        const deltaLng = toRad(to.lng - from.lng);
        const y = Math.sin(deltaLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2)
            - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
        const bearing = Math.atan2(y, x);
        const cosInclination = Math.cos(lat1) * Math.sin(bearing);
        return toDeg(Math.acos(Math.max(-1, Math.min(1, cosInclination))));
    }

    function formatInclination(degrees, segmentIndex) {
        return Number.isFinite(degrees) ? '第' + segmentIndex + '段倾角: ' + degrees.toFixed(1) + '°' : '';
    }

    function getActiveSegmentInclination(points, previewPoint, startIsLaunchSite) {
        // 起点是不是发射场：2D 用模块里那份状态；3D 球面自己记，所以允许显式传进来
        const fromLaunchSite = startIsLaunchSite === undefined ? measureStartIsLaunchSite : !!startIsLaunchSite;
        if (!fromLaunchSite || !points || points.length === 0) return null;
        const to = previewPoint || points[points.length - 1];
        const from = previewPoint ? points[points.length - 1] : points[points.length - 2];
        if (!from || !to) return null;

        const degrees = segmentInclinationDegrees(from, to);
        return Number.isFinite(degrees) ? {
            degrees,
            segmentIndex: previewPoint ? points.length : points.length - 1,
        } : null;
    }

    function toRad(deg) {
        return (deg * Math.PI) / 180;
    }

    function toDeg(rad) {
        return (rad * 180) / Math.PI;
    }

    // 使用大圆插值将每段折线细分为球面曲线，避免平面直线观感。
    function interpolateGreatCircle(a, b, segmentCount) {
        const lat1 = toRad(a.lat);
        const lon1 = toRad(a.lng);
        const lat2 = toRad(b.lat);
        const lon2 = toRad(b.lng);

        const sinLat1 = Math.sin(lat1), cosLat1 = Math.cos(lat1);
        const sinLat2 = Math.sin(lat2), cosLat2 = Math.cos(lat2);
        const d = 2 * Math.asin(Math.sqrt(
            Math.sin((lat2 - lat1) / 2) ** 2 +
            cosLat1 * cosLat2 * Math.sin((lon2 - lon1) / 2) ** 2
        ));

        if (!isFinite(d) || d === 0) {
            return [L.latLng(a.lat, a.lng), L.latLng(b.lat, b.lng)];
        }

        const pts = [];
        const sinD = Math.sin(d);
        const n = Math.max(1, segmentCount);
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            const A = Math.sin((1 - t) * d) / sinD;
            const B = Math.sin(t * d) / sinD;

            const x = A * cosLat1 * Math.cos(lon1) + B * cosLat2 * Math.cos(lon2);
            const y = A * cosLat1 * Math.sin(lon1) + B * cosLat2 * Math.sin(lon2);
            const z = A * sinLat1 + B * sinLat2;

            const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
            const lon = Math.atan2(y, x);
            pts.push(L.latLng(toDeg(lat), toDeg(lon)));
        }
        return pts;
    }

    function buildGeodesicPath(points) {
        if (!points || points.length <= 1) return (points || []).map(normalizeMeasureLatLng);
        const out = [normalizeMeasureLatLng(points[0])];
        for (let i = 1; i < points.length; i++) {
            // 起点用已经连续化后的上一点（可能落在 ±180 之外），插值本身只用 sin/cos，等价
            const a = out[out.length - 1];
            const b = points[i];
            const meters = map.distance(a, b);
            const segmentCount = Math.max(1, Math.min(64, Math.ceil(meters / 120000)));
            const seg = interpolateGreatCircle(a, b, segmentCount);
            for (let k = 1; k < seg.length; k++) {
                const previous = out[out.length - 1].lng;
                out.push(L.latLng(seg[k].lat, unwrapLngToPrevious(previous, seg[k].lng)));
            }
        }
        return out;
    }

    function clearOverlay() {
        if (fixedLine) {
            map.removeLayer(fixedLine);
            fixedLine = null;
        }
        if (tempLine) {
            map.removeLayer(tempLine);
            tempLine = null;
        }
        if (distanceLabel) {
            map.removeLayer(distanceLabel.group);
            distanceLabel = null;
        }
        if (snapHint) {
            map.removeLayer(snapHint.group);
            snapHint = null;
        }
        if (snapHintTimer) {
            clearTimeout(snapHintTimer);
            snapHintTimer = null;
        }
    }

    function clearQueryOverlay() {
        clearLatLngQueryHint();
    }

    function resetMeasure() {
        measurePoints = [];
        measureStartIsLaunchSite = false;
        clearOverlay();
    }

    function resetLatLngQuery() {
        clearQueryOverlay();
    }

    function createSegmentInclinationLabels(points, startIsLaunchSite) {
        // 2D 用模块里那份状态；3D 球面自己记，所以允许显式传进来
        const fromLaunchSite = startIsLaunchSite === undefined ? measureStartIsLaunchSite : !!startIsLaunchSite;
        if (!fromLaunchSite) return [];

        const labels = [];
        for (let i = 1; i < points.length; i++) {
            const degrees = segmentInclinationDegrees(points[i - 1], points[i]);
            if (!Number.isFinite(degrees)) continue;

            const midpoint = interpolateGreatCircle(points[i - 1], points[i], 2)[1];
            const icon = L.divIcon({
                className: 'measure-distance-label',
                html: formatInclination(degrees, i),
                iconSize: null,
            });
            labels.push(createWrappedMarkerSet(midpoint, {
                icon,
                interactive: false,
                keyboard: false,
                zIndexOffset: 999,
            }).addTo(map));
        }
        return labels;
    }

    function createPersistedMeasure(points, meters, startIsLaunchSite) {
        if (!points || points.length < 2) return 0;

        // 记录这条测距的起点到底是不是发射场：球面那边要照着同一规则补每段倾角标签
        const fromLaunchSite = startIsLaunchSite === undefined ? measureStartIsLaunchSite : !!startIsLaunchSite;
        const line = L.polyline(buildWrappedRings(buildGeodesicPath(points)), {
            color: '#f59e0b',
            weight: 3,
            opacity: 0.95,
        }).addTo(map);
        const inclinationLabels = createSegmentInclinationLabels(points, fromLaunchSite);

        const endPoint = points[points.length - 1];
        const labelIcon = L.divIcon({
            className: 'measure-result-marker',
            html: '<div class="measure-result-badge">'
                + '<span class="measure-result-text">' + formatDistance(meters) + '</span>'
                + '<button type="button" class="measure-result-close" aria-label="删除测距">&times;</button>'
                + '</div>',
            iconSize: null,
        });
        const label = createWrappedMarkerSet(endPoint, {
            icon: labelIcon,
            interactive: true,
            keyboard: false,
            zIndexOffset: 1000,
        });

        // startIsLaunchSite 一起存下来：球面那边要靠它决定「要不要补每段倾角标签」（和 2D 同规则）
        const storeItem = {
            points: points.map(function(point) { return { lat: point.lat, lng: point.lng }; }),
            startIsLaunchSite: fromLaunchSite,
        };
        const item = { line, label, inclinationLabels, storeItem };
        persistedMeasures.push(item);
        window.__notamMeasurements.push(storeItem);
        if (window.NotamGlobe) window.NotamGlobe.refresh(true);

        // 每个世界副本上的公里牌都能关掉这次测距
        label.onAdd(function () {
            const el = this.getElement();
            if (!el) return;
            const closeBtn = el.querySelector('.measure-result-close');
            if (!closeBtn) return;
            closeBtn.onclick = function (e) {
                L.DomEvent.stop(e);
                removePersistedMeasure(item);
            };
        });

        label.addTo(map);
        return inclinationLabels.length;
    }

    /* 删掉一次已完成的测距：二维图层 + 记录 + 通知球面重建。
       （3D 那颗公里牌上的 × 也走这里，见文件末尾的 removeGlobeMeasure —— 两边删的是同一份记录。） */
    function removePersistedMeasure(item) {
        if (!item) return;
        if (item.line) map.removeLayer(item.line);
        if (item.label) map.removeLayer(item.label.group);
        (item.inclinationLabels || []).forEach((inclinationLabel) => map.removeLayer(inclinationLabel.group));
        persistedMeasures = persistedMeasures.filter((x) => x !== item);
        window.__notamMeasurements = window.__notamMeasurements.filter((x) => x !== item.storeItem);
        if (window.NotamGlobe) window.NotamGlobe.refresh(true);
    }

    function updateSnapHint(latlng) {
        if (!latlng) {
            if (snapHint) {
                map.removeLayer(snapHint.group);
                snapHint = null;
            }
            return;
        }

        if (!snapHint) {
            snapHint = createWrappedLayerSet(latlng, (lat, lng) => L.circleMarker([lat, lng], {
                radius: 5,
                color: '#f59e0b',
                weight: 2,
                fillColor: '#f59e0b',
                fillOpacity: 0.15,
                interactive: false,
            })).addTo(map);
        } else {
            snapHint.setLatLng(latlng);
        }
    }

    function flashSnapHint(latlng) {
        updateSnapHint(latlng);
        if (snapHintTimer) {
            clearTimeout(snapHintTimer);
        }
        snapHintTimer = setTimeout(function () {
            updateSnapHint(null);
            snapHintTimer = null;
        }, 500);
    }

    function addUniqueCandidate(latlng, candidates, seen, isLaunchSite) {
        if (!latlng || !Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)) {
            return;
        }

        const key = latlng.lat + ',' + latlng.lng;
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push({ latlng, isLaunchSite: !!isLaunchSite });
    }

    function isVisibleLayer(layer) {
        if (!map || typeof map.hasLayer !== 'function') return false;
        return map.hasLayer(layer) || layer._map === map;
    }

    function collectMarkerLatLngs(layer, candidates, seen, isLaunchSite) {
        if (!layer) return;

        if (Array.isArray(layer)) {
            layer.forEach((item) => collectMarkerLatLngs(item, candidates, seen, isLaunchSite));
            return;
        }

        if (typeof layer.getLatLng === 'function') {
            if (isVisibleLayer(layer)) {
                addUniqueCandidate(layer.getLatLng(), candidates, seen, isLaunchSite);
            }
            return;
        }

        if (typeof layer.eachLayer === 'function' && isVisibleLayer(layer)) {
            layer.eachLayer((child) => collectMarkerLatLngs(child, candidates, seen, isLaunchSite));
        }
    }

    function getSnapCandidates(extraPoints) {
        const candidates = [];
        const seen = new Set();

        collectMarkerLatLngs(window.launchSiteMarkers || [], candidates, seen, true);
        collectMarkerLatLngs(window.landingZoneMarkers || [], candidates, seen, false);

        const polygonGroups = [
            window.polygonAuto || [],
            window.polygon || [],
            window.polygonArchive || [],
        ];

        polygonGroups.forEach((group) => {
            if (!Array.isArray(group)) return;
            group.forEach((poly) => {
                if (poly && typeof poly.getBounds === 'function' && isVisibleLayer(poly)) {
                    if (typeof poly.getLatLng === 'function') addUniqueCandidate(poly.getLatLng(), candidates, seen, false);
                    else {
                        const bounds = poly.getBounds();
                        if (bounds && typeof bounds.getCenter === 'function') addUniqueCandidate(bounds.getCenter(), candidates, seen, false);
                    }
                }
            });
        });

        // 测距过程中，允许吸附到已落点（包含起点）；每个世界副本都要有一份，
        // 否则在别的副本里点回自己刚下的点就吸不上了。
        // extraPoints 是给 3D 球面用的：它的选点存在 globe.js 里，不在下面的 measurePoints 里。
        const livePoints = measurePoints.concat(extraPoints || []);
        for (let i = 0; i < livePoints.length; i++) {
            const point = livePoints[i];
            if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
            getWrapLngOffsets().forEach((offset) => {
                addUniqueCandidate(L.latLng(point.lat, point.lng + offset), candidates, seen, false);
            });
        }

        return candidates;
    }

    function getSnappedResult(latlng) {
        const targetPoint = map.latLngToContainerPoint(latlng);
        const candidates = getSnapCandidates();

        let best = null;
        let bestDist = Infinity;

        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            if (!candidate) continue;
            const candPoint = map.latLngToContainerPoint(candidate.latlng);
            const pxDist = targetPoint.distanceTo(candPoint);
            if (pxDist <= SNAP_PX && pxDist < bestDist) {
                best = candidate;
                bestDist = pxDist;
            }
        }

        return {
            latlng: best ? best.latlng : latlng,
            isLaunchSite: !!(best && best.isLaunchSite),
            snapped: !!best,
        };
    }

    function updateLines(cursorLatLng) {
        if (measurePoints.length === 0) return;

        // 折线按世界副本铺开：一条 layer、多个 ring，跨 180° 的段也不会绕地球一圈
        const fixedRings = buildWrappedRings(buildGeodesicPath(measurePoints));
        if (!fixedLine) {
            fixedLine = L.polyline(fixedRings, {
                color: '#f59e0b',
                weight: 3,
                opacity: 0.95,
            }).addTo(map);
        } else {
            fixedLine.setLatLngs(fixedRings);
        }

        if (cursorLatLng) {
            const last = measurePoints[measurePoints.length - 1];
            const previewRings = buildWrappedRings(buildGeodesicPath([last, cursorLatLng]));
            if (!tempLine) {
                tempLine = L.polyline(previewRings, {
                    color: '#f59e0b',
                    weight: 2,
                    opacity: 0.8,
                    dashArray: '6, 6',
                }).addTo(map);
            } else {
                tempLine.setLatLngs(previewRings);
            }

            const total = totalDistance(measurePoints) + map.distance(last, cursorLatLng);
            updateDistanceLabel(cursorLatLng, total, getActiveSegmentInclination(measurePoints, cursorLatLng));
        } else {
            if (tempLine) {
                map.removeLayer(tempLine);
                tempLine = null;
            }
            const total = totalDistance(measurePoints);
            updateDistanceLabel(measurePoints[measurePoints.length - 1], total, getActiveSegmentInclination(measurePoints));
        }
    }

    function updateDistanceLabel(latlng, meters, segmentInclination) {
        const text = formatDistance(meters)
            + (segmentInclination ? '<br>' + formatInclination(segmentInclination.degrees, segmentInclination.segmentIndex) : '');
        const icon = L.divIcon({
            className: 'measure-distance-label',
            html: text,
            iconSize: null,
        });

        if (!distanceLabel) {
            distanceLabel = createWrappedMarkerSet(latlng, {
                icon,
                interactive: false,
                keyboard: false,
                zIndexOffset: 1000,
            }).addTo(map);
        } else {
            distanceLabel.setLatLng(latlng);
            distanceLabel.setIcon(icon);
        }
    }

    function onMapClick(e) {
        if (!isMeasuring) return;
        const snappedResult = getSnappedResult(e.latlng);
        // 统一归一化入库：视口跨 180° 时地图会返回 195/-190 这类越界经度，
        // 存归一化后的值，画的时候再按世界副本铺开。
        measurePoints.push(normalizeMeasureLatLng(snappedResult.latlng));
        if (measurePoints.length === 1) {
            measureStartIsLaunchSite = snappedResult.isLaunchSite;
        }
        if (snappedResult.snapped) {
            flashSnapHint(snappedResult.latlng);
        }
        updateLines(null);
    }

    function onMapMove(e) {
        if (isMeasuring) {
            const snappedResult = getSnappedResult(e.latlng);
            updateSnapHint(snappedResult.snapped ? snappedResult.latlng : null);
            if (measurePoints.length > 0) {
                updateLines(snappedResult.latlng);
            }
            return;
        }

        if (isLatLngQuerying) {
            updateLatLngQueryHint(e.latlng, e.containerPoint);
        }
    }

    function finishMeasure() {
        if (!isMeasuring) return;
        if (measurePoints.length < 2) {
            notify('请至少点击两个点再结束测距');
            return;
        }
        const total = totalDistance(measurePoints);
        const inclinationCount = createPersistedMeasure(measurePoints.slice(), total);
        resetMeasure();
        notify('测距完成: ' + formatDistance(total)
            + (inclinationCount ? '，已显示 ' + inclinationCount + ' 段倾角' : ''), 'success');
    }

    function finishCurrentIfPossible() {
        if (measurePoints.length >= 2) {
            const total = totalDistance(measurePoints);
            const inclinationCount = createPersistedMeasure(measurePoints.slice(), total);
            notify('测距完成: ' + formatDistance(total)
                + (inclinationCount ? '，已显示 ' + inclinationCount + ' 段倾角' : ''), 'success');
        }
        resetMeasure();
    }

    function onMapDblClick(e) {
        if (!isMeasuring) return;
        L.DomEvent.stop(e);
        finishMeasure();
    }

    function onMapRightClick(e) {
        if (!isMeasuring && !isLatLngQuerying) return;
        L.DomEvent.stop(e);
        if (isLatLngQuerying) {
            stopLatLngQuery();
            notify('已退出经纬度查询');
            return;
        }
        finishCurrentIfPossible();
        stopMeasure();
        notify('已退出测距模式');
    }

    function onPopupOpen(e) {
        if (!isMeasuring) return;
        if (e && e.popup) {
            map.closePopup(e.popup);
        } else {
            map.closePopup();
        }
    }

    function onKeyDown(e) {
        if (!isMeasuring && !isLatLngQuerying) return;

        if (isLatLngQuerying && e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'c') {
            if (currentQueryText) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof handleCopy === 'function') {
                    handleCopy(currentQueryText);
                } else {
                    notify(currentQueryText);
                }
            }
            return;
        }

        if (e.key === 'Escape') {
            if (isLatLngQuerying) {
                stopLatLngQuery();
                notify('已退出经纬度查询');
                return;
            }
            resetMeasure();
            notify('已清除当前测距');
        }
    }

    function bindEvents() {
        map.on('click', onMapClick);
        map.on('mousemove', onMapMove);
        map.on('dblclick', onMapDblClick);
        map.on('contextmenu', onMapRightClick);
        map.on('popupopen', onPopupOpen);
        document.addEventListener('keydown', onKeyDown);
    }

    function unbindEvents() {
        map.off('click', onMapClick);
        map.off('mousemove', onMapMove);
        map.off('dblclick', onMapDblClick);
        map.off('contextmenu', onMapRightClick);
        map.off('popupopen', onPopupOpen);
        document.removeEventListener('keydown', onKeyDown);
    }

    function startMeasure() {
        if (window.NotamGlobe && window.NotamGlobe.isActive()) {
            if (isLatLngQuerying) stopLatLngQuery();
            isMeasuring = true;
            setActiveTool('measure');
            resetMeasure();
            notify('球面测距已开启: 单击选点，双击结束，右键退出');
            return;
        }
        if (!window.map) {
            notify('地图尚未初始化');
            return;
        }
        if (isLatLngQuerying) {
            stopLatLngQuery();
        }
        isMeasuring = true;
        setActiveTool('measure');
        resetMeasure();
        map.doubleClickZoom.disable();
        bindEvents();
        notify('测距已开启: 单击选点，双击结束当前测距，右键退出测距模式');
    }

    function stopMeasure() {
        isMeasuring = false;
        setActiveTool('none');
        unbindEvents();
        map.doubleClickZoom.enable();
        resetMeasure();
    }

    function startLatLngQuery() {
        if (window.NotamGlobe && window.NotamGlobe.isActive()) {
            if (isMeasuring) stopMeasure();
            setActiveTool('latlng');
            notify('球面经纬度查询已开启: Ctrl+C 复制，右键退出');
            return;
        }
        if (!window.map) {
            notify('地图尚未初始化');
            return;
        }
        if (isMeasuring) {
            stopMeasure();
        }
        setActiveTool('latlng');
        resetLatLngQuery();
        map.doubleClickZoom.disable();
        bindEvents();
        notify('经纬度查询已开启: Ctrl+C 复制，右键退出');
    }

    function stopLatLngQuery() {
        isLatLngQuerying = false;
        setActiveTool('none');
        unbindEvents();
        map.doubleClickZoom.enable();
        resetLatLngQuery();
    }

    function toggleMeasure() {
        if (isMeasuring) {
            stopMeasure();
        } else {
            startMeasure();
        }
    }

    function toggleLatLngQuery() {
        if (isLatLngQuerying) {
            stopLatLngQuery();
        } else {
            startLatLngQuery();
        }
    }

    function initMeasureButton() {
        const btn = getMeasureButton();
        if (!btn) return;
        btn.addEventListener('click', toggleMeasure);
    }

    function initLatLngQueryButton() {
        const btn = getLatLngQueryButton();
        if (!btn) return;
        btn.addEventListener('click', toggleLatLngQuery);
    }


    /* ── 给 3D 球面复用的那一层 ──
       globe.js 不重写任何测距数学与格式：走这里的同一批函数，所以同一条线在 2D / 3D 报出的
       数字与文案完全一致；吸附候选也直接用 2D 那份（发射场 / 落区 / 多边形中心 / 已选点），
       两种模式吸的是同一批点。3D 只负责把结果画到球面上。 */
    window.NotamMeasure = {
        SNAP_PX: SNAP_PX,
        /* 当前的工具状态（'none' / 'measure' / 'latlng'）：切回 2D 再进 3D 时，
           globe.js 用它把球面的工具状态对齐回来（按钮写着「测距中」球面就得能测距）。 */
        currentTool: function () { return activeTool; },
        formatDistance: formatDistance,
        formatInclination: formatInclination,
        /* 两点距离：直接用 Leaflet 的 map.distance（2D 的 totalDistance 也是它逐段累加），
           两种模式数字必然相同，不会出现「球面比平面多几百米」这种怪事。 */
        distanceBetween: function (a, b) {
            if (!a || !b) return 0;
            return map.distance(L.latLng(a.lat, a.lng), L.latLng(b.lat, b.lng));
        },
        pathDistance: function (points) {
            return totalDistance((points || []).map(function (point) { return L.latLng(point.lat, point.lng); }));
        },
        activeSegmentInclination: getActiveSegmentInclination,
        segmentInclinationDegrees: segmentInclinationDegrees,
        /* 两点之间的大圆中点：2D 用它放每段的倾角标签，球面用同一个点放同一块标签 */
        greatCircleMidpoint: function (a, b) {
            if (!a || !b) return null;
            return interpolateGreatCircle(a, b, 2)[1];
        },
        snapCandidates: function (extraPoints) { return getSnapCandidates(extraPoints); },
        addGlobeMeasure: function(rawPoints, startIsLaunchSite) {
            var points = (rawPoints || []).map(function(point) { return L.latLng(point.lat, point.lng); });
            if (points.length < 2) return 0;
            // 返回倾角标签数：3D 完成提示要按 2D 的文案带上「已显示 N 段倾角」
            return createPersistedMeasure(points, totalDistance(points), startIsLaunchSite);
        },
        /* 3D 球面上那颗公里牌的 × 走这里：按下标删掉这次测距（二维图层与记录一起删） */
        removeGlobeMeasure: function (index) {
            var store = window.__notamMeasurements || [];
            var target = store[index];
            if (!target) return;
            var item = persistedMeasures.find(function (measure) { return measure.storeItem === target; });
            if (item) removePersistedMeasure(item);
            else {
                store.splice(index, 1);
                if (window.NotamGlobe) window.NotamGlobe.refresh(true);
            }
        },
        stopFromGlobe: function() {
            if (isMeasuring) stopMeasure();
            else if (isLatLngQuerying) stopLatLngQuery();
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMeasureButton);
        document.addEventListener('DOMContentLoaded', initLatLngQueryButton);
    } else {
        initMeasureButton();
        initLatLngQueryButton();
    }
})();

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
    let snapHintTimer = null;

    const SNAP_PX = 14;

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
    }

    function formatLatLng(latlng) {
        if (!latlng) return '';
        return '纬度: ' + latlng.lat.toFixed(6) + ', 经度: ' + latlng.lng.toFixed(6);
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
        if (!points || points.length <= 1) return points || [];
        const out = [points[0]];
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1];
            const b = points[i];
            const meters = map.distance(a, b);
            const segmentCount = Math.max(1, Math.min(64, Math.ceil(meters / 120000)));
            const seg = interpolateGreatCircle(a, b, segmentCount);
            out.push(...seg.slice(1));
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
            map.removeLayer(distanceLabel);
            distanceLabel = null;
        }
        if (snapHint) {
            map.removeLayer(snapHint);
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
        clearOverlay();
    }

    function resetLatLngQuery() {
        clearQueryOverlay();
    }

    function createPersistedMeasure(points, meters) {
        if (!points || points.length < 2) return;

        const line = L.polyline(buildGeodesicPath(points), {
            color: '#f59e0b',
            weight: 3,
            opacity: 0.95,
        }).addTo(map);

        const endPoint = points[points.length - 1];
        const labelIcon = L.divIcon({
            className: 'measure-result-marker',
            html: '<div class="measure-result-badge">'
                + '<span class="measure-result-text">' + formatDistance(meters) + '</span>'
                + '<button type="button" class="measure-result-close" aria-label="删除测距">&times;</button>'
                + '</div>',
            iconSize: null,
        });
        const label = L.marker(endPoint, {
            icon: labelIcon,
            interactive: true,
            keyboard: false,
            zIndexOffset: 1000,
        });

        const item = { line, label };
        persistedMeasures.push(item);

        label.on('add', function () {
            const el = label.getElement();
            if (!el) return;
            const closeBtn = el.querySelector('.measure-result-close');
            if (!closeBtn) return;
            closeBtn.onclick = function (e) {
                L.DomEvent.stop(e);
                if (item.line) map.removeLayer(item.line);
                if (item.label) map.removeLayer(item.label);
                persistedMeasures = persistedMeasures.filter((x) => x !== item);
            };
        });

        label.addTo(map);
    }

    function updateSnapHint(latlng) {
        if (!latlng) {
            if (snapHint) {
                map.removeLayer(snapHint);
                snapHint = null;
            }
            return;
        }

        if (!snapHint) {
            snapHint = L.circleMarker(latlng, {
                radius: 5,
                color: '#f59e0b',
                weight: 2,
                fillColor: '#f59e0b',
                fillOpacity: 0.15,
                interactive: false,
            }).addTo(map);
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

    function getSnapCandidates() {
        const candidates = [];

        const markerGroups = [
            window.launchSiteMarkers || [],
            window.landingZoneMarkers || [],
        ];

        markerGroups.forEach((group) => {
            group.forEach((mk) => {
                if (mk && typeof mk.getLatLng === 'function') {
                    candidates.push(mk.getLatLng());
                }
            });
        });

        const polygonGroups = [
            window.polygonAuto || [],
            window.polygon || [],
            window.polygonArchive || [],
        ];

        polygonGroups.forEach((group) => {
            group.forEach((poly) => {
                if (poly && typeof poly.getBounds === 'function') {
                    candidates.push(poly.getBounds().getCenter());
                }
            });
        });

        // 测距过程中，允许吸附到已落点（包含起点）。
        for (let i = 0; i < measurePoints.length; i++) {
            candidates.push(measurePoints[i]);
        }

        return candidates;
    }

    function getSnappedResult(latlng) {
        const targetPoint = map.latLngToContainerPoint(latlng);
        const candidates = getSnapCandidates();

        let best = null;
        let bestDist = Infinity;

        for (let i = 0; i < candidates.length; i++) {
            const cand = candidates[i];
            const candPoint = map.latLngToContainerPoint(cand);
            const pxDist = targetPoint.distanceTo(candPoint);
            if (pxDist <= SNAP_PX && pxDist < bestDist) {
                best = cand;
                bestDist = pxDist;
            }
        }

        return {
            latlng: best || latlng,
            snapped: !!best,
        };
    }

    function updateLines(cursorLatLng) {
        if (measurePoints.length === 0) return;

        if (!fixedLine) {
            fixedLine = L.polyline(buildGeodesicPath(measurePoints), {
                color: '#f59e0b',
                weight: 3,
                opacity: 0.95,
            }).addTo(map);
        } else {
            fixedLine.setLatLngs(buildGeodesicPath(measurePoints));
        }

        if (cursorLatLng) {
            const last = measurePoints[measurePoints.length - 1];
            const previewPoints = buildGeodesicPath([last, cursorLatLng]);
            if (!tempLine) {
                tempLine = L.polyline(previewPoints, {
                    color: '#f59e0b',
                    weight: 2,
                    opacity: 0.8,
                    dashArray: '6, 6',
                }).addTo(map);
            } else {
                tempLine.setLatLngs(previewPoints);
            }

            const total = totalDistance(measurePoints) + map.distance(last, cursorLatLng);
            updateDistanceLabel(cursorLatLng, total);
        } else {
            if (tempLine) {
                map.removeLayer(tempLine);
                tempLine = null;
            }
            const total = totalDistance(measurePoints);
            updateDistanceLabel(measurePoints[measurePoints.length - 1], total);
        }
    }

    function updateDistanceLabel(latlng, meters) {
        const text = formatDistance(meters);
        const icon = L.divIcon({
            className: 'measure-distance-label',
            html: text,
            iconSize: null,
        });

        if (!distanceLabel) {
            distanceLabel = L.marker(latlng, {
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
        measurePoints.push(snappedResult.latlng);
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
        createPersistedMeasure(measurePoints.slice(), total);
        resetMeasure();
        notify('测距完成: ' + formatDistance(total), 'success');
    }

    function finishCurrentIfPossible() {
        if (measurePoints.length >= 2) {
            const total = totalDistance(measurePoints);
            createPersistedMeasure(measurePoints.slice(), total);
            notify('测距完成: ' + formatDistance(total), 'success');
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMeasureButton);
        document.addEventListener('DOMContentLoaded', initLatLngQueryButton);
    } else {
        initMeasureButton();
        initLatLngQueryButton();
    }
})();

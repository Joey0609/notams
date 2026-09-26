// 只保存界面偏好，不保存航警数据、凭据或手动画图内容。
(function () {
    var STORAGE_KEY = 'notam-map-preferences-v1';
    var values = {};

    try {
        values = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
        if (!values || typeof values !== 'object' || Array.isArray(values)) values = {};
    } catch (error) {
        values = {};
        console.warn('[设置] 无法读取浏览器本地配置:', error);
    }

    function save() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
            return true;
        } catch (error) {
            console.warn('[设置] 无法保存浏览器本地配置:', error);
            return false;
        }
    }

    window.NotamAppSettings = {
        get: function (key, fallback) {
            return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback;
        },
        set: function (key, value) {
            values[key] = value;
            save();
        },
        remove: function (key) {
            delete values[key];
            save();
        },
        save: save,
        reload: function () {
            try {
                var loaded = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
                values = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? loaded : {};
                return values;
            } catch (error) {
                console.warn('[设置] 无法重新加载浏览器本地配置:', error);
                return values;
            }
        }
    };

    document.addEventListener('DOMContentLoaded', function () {
        var sourceVisibility = window.NotamAppSettings.get('notamTypeVisibility', null);
        if (sourceVisibility && typeof window.setNotamTypeVisibility === 'function') {
            window.setNotamTypeVisibility(sourceVisibility);
        }

        if (window.NotamAppSettings.get('mapMode') === 'globe' && typeof window.selectMapMode === 'function') {
            window.selectMapMode('globe');
        }
    });
})();

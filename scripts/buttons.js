const helpButton = document.getElementById('helpButton');
const exportButton = document.getElementById('exportButton');
const expandableArea = document.getElementById('expandableArea');
const exportArea = document.getElementById('exportArea');
const logPanel = document.getElementById('logPanel');
const sidebarToggle = document.getElementById('sidebarToggle');
const manualToggle = document.getElementById('manualToggle');
let logPanelExpanded = false;
let logPanelListener = null;
let userScrolledUp = false;
let lastRenderedCount = 0;
const customButton = document.getElementById('customButton');
let isHelpExpanded = false;
let isExportExpanded = false;

/* 液态玻璃的悬停高光跟随指针：把圆心写进 --glass-x / --glass-y（元素内的百分比），
   CSS 里那层 ::after 的径向渐变用它当圆心。指针事件本身就是一帧最多一次，
   直接写变量即可跟手，不需要 rAF 循环。
   触摸/手写笔没有 hover：改为按住期间加 .is-touching 点亮，并跟随手指（松手或离开时收起）。 */
function glassSheenPercent(rect, clientX, clientY) {
    const clamp = (value) => Math.min(125, Math.max(-25, value));
    return {
        x: clamp(((clientX - rect.left) / rect.width) * 100),
        y: clamp(((clientY - rect.top) / rect.height) * 100),
    };
}

function bindGlassSheen(control) {
    if (!control || control.__glassSheenBound) return;
    control.__glassSheenBound = true;

    const move = (event) => {
        const rect = control.getBoundingClientRect ? control.getBoundingClientRect() : null;
        if (!rect || !rect.width || !rect.height) return;
        if (!control.style || typeof control.style.setProperty !== 'function') return;
        const point = glassSheenPercent(rect, event.clientX, event.clientY);
        control.style.setProperty('--glass-x', point.x.toFixed(2) + '%');
        control.style.setProperty('--glass-y', point.y.toFixed(2) + '%');
    };
    const release = (event) => {
        if (!event || event.pointerType !== 'mouse') control.classList.remove('is-touching');
    };

    control.addEventListener('pointerenter', move, { passive: true });
    control.addEventListener('pointermove', move, { passive: true });
    control.addEventListener('pointerdown', (event) => {
        move(event);
        if (event.pointerType !== 'mouse') control.classList.add('is-touching');
    }, { passive: true });
    control.addEventListener('pointerup', release, { passive: true });
    control.addEventListener('pointercancel', release, { passive: true });
    control.addEventListener('pointerleave', () => control.classList.remove('is-touching'), { passive: true });
}

[helpButton, exportButton, sidebarToggle, manualToggle, customButton].forEach(bindGlassSheen);

/* 地图模式（矢量地图 / 卫星地图 / 3D 地球）三个选项也要同一套跟随指针的光斑 */
document.querySelectorAll('#mapModeControl button').forEach(bindGlassSheen);

const GITHUB_STAR_URL = 'https://github.com/Joey0609/notams';
const GITHUB_STAR_THANK_YOU = '❤ 谢谢 ❤';
const GITHUB_STAR_RESET_DELAY = 30000;

// 日志面板功能

function toggleLogPanel() {
    if (!logPanel) return;
    logPanelExpanded = !logPanelExpanded;
    
    if (logPanelExpanded) {
        logPanel.classList.add('show');
        userScrolledUp = false;
        lastRenderedCount = 0;
        renderBrowserLogs();
        
        if (window.BrowserConsoleLogs) {
            logPanelListener = () => renderBrowserLogs();
            BrowserConsoleLogs.addListener(logPanelListener);
        }
    } else {
        logPanel.classList.remove('show');
        if (logPanelListener && window.BrowserConsoleLogs) {
            BrowserConsoleLogs.removeListener(logPanelListener);
        }
        logPanelListener = null;
    }
}

function renderBrowserLogs() {
    const logContent = document.getElementById('logContent');
    const logsApi = window.BrowserConsoleLogs;
    if (!logContent || !logsApi) return;

    const logs = logsApi.getEntries();
    if (logs.length === 0) {
        logContent.innerHTML = '<div class="log-empty">暂无日志</div>';
        lastRenderedCount = 0;
        return;
    }

    const hasNewLogs = logs.length !== lastRenderedCount;
    lastRenderedCount = logs.length;

    logContent.innerHTML = logs.map(log => {
        const level = (log.level || 'LOG').toUpperCase();
        const timestamp = log.timestamp || '';
        const message = formatLogMessage(log.message || '');
        return `<div class="log-item">
            <span class="log-timestamp">[${escapeHtml(timestamp)}]</span>
            <span class="log-level log-level-${level}">${level}</span>
            <span class="log-message">${message}</span>
        </div>`;
    }).join('');

    if (!userScrolledUp && hasNewLogs) {
        logContent.scrollTop = logContent.scrollHeight;
    }
}

function clearLogs() {
    const logsApi = window.BrowserConsoleLogs;
    if (!logsApi) return;
    logsApi.clear();
    lastRenderedCount = 0;
    userScrolledUp = false;
    renderBrowserLogs();
}

document.addEventListener('DOMContentLoaded', function() {
    const logContent = document.getElementById('logContent');
    if (logContent) {
        logContent.addEventListener('scroll', function() {
            const isAtBottom = logContent.scrollHeight - logContent.scrollTop <= logContent.clientHeight + 50;
            userScrolledUp = !isAtBottom;
        });
    }

    setupGithubStarBubble();
});

function setupGithubStarBubble() {
    const starCallout = document.querySelector('.github-star-callout');
    if (!starCallout) return;

    if (!starCallout.dataset.defaultHtml) {
        starCallout.dataset.defaultHtml = starCallout.innerHTML;
    }

    starCallout.addEventListener('click', (event) => {
        event.preventDefault();

        window.open(GITHUB_STAR_URL, '_blank', 'noopener,noreferrer');
        starCallout.innerHTML = GITHUB_STAR_THANK_YOU;

        if (starCallout._resetTimer) {
            clearTimeout(starCallout._resetTimer);
        }

        starCallout._resetTimer = setTimeout(() => {
            starCallout.innerHTML = starCallout.dataset.defaultHtml || '求个 <strong>⭐</strong>';
            starCallout._resetTimer = null;
        }, GITHUB_STAR_RESET_DELAY);
    });
}

function formatLogMessage(text) {
    if (!text) return '';
    return escapeHtml(text).replace(/\n/g, '<br>');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}
// 可调试的高度变量
const HELP_AREA_HEIGHT = 320;  // 帮助区域高度
const EXPORT_AREA_HEIGHT = 230; // 导出区域高度

helpButton.addEventListener('click', () => {
    if (isExportExpanded) {
        // 先收起导出页
        closeExportArea();
        // 稍微延迟后展开帮助页
        setTimeout(() => {
            openHelpArea();
        }, 100);
    } else {
        // 切换帮助页状态
        if (isHelpExpanded) {
            closeHelpArea();
        } else {
            openHelpArea();
        }
    }
});

exportButton.addEventListener('click', () => {
    if (isHelpExpanded) {
        // 先收起帮助页
        closeHelpArea();
        // 稍微延迟后展开导出页
        setTimeout(() => {
            openExportArea();
        }, 100);
    } else {
        // 切换导出页状态
        if (isExportExpanded) {
            closeExportArea();
        } else {
            openExportArea();
        }
    }
});

/* ── 底部按钮行：帮助 / 导出 / 航警列表 ──
   窄屏（<=768px）下三者排在同一行（bottom: 42px）：帮助、导出靠左，「航警列表」居中，
   展开的面板就停在整行正上方（90px），按钮本身不再上移，这一行始终不会散开。
   宽屏维持原来的行为：按钮抬到面板上方。 */
function isNarrowLayout() {
    return window.innerWidth <= 768;
}

function panelBottom(isOpen) {
    if (isNarrowLayout()) return '90px';
    return isOpen ? '10px' : '40px';
}

/* 宽屏下面板展开时把按钮抬到面板正上方；窄屏下按钮行不动，返回 0 */
function setRowLift(areaHeight) {
    const lift = isNarrowLayout() ? 0 : areaHeight;
    helpButton.style.transform = `translateY(-${lift}px)`;
    exportButton.style.transform = `translateY(-${lift}px)`;
    if (customButton) customButton.style.transform = `translateY(-${lift}px)`;
}

function openHelpArea() {
    isHelpExpanded = true;
    expandableArea.classList.add('is-open');
    expandableArea.style.maxHeight = HELP_AREA_HEIGHT + 'px';
    expandableArea.style.bottom = panelBottom(true);
    // 等待 DOM 更新后获取实际高度
    setTimeout(() => {
        setRowLift(HELP_AREA_HEIGHT);
    }, 10);
    helpButton.textContent = '收起';
}

function closeHelpArea() {
    isHelpExpanded = false;
    expandableArea.classList.remove('is-open');
    expandableArea.style.maxHeight = '0';
    expandableArea.style.bottom = panelBottom(false);
    setRowLift(0);
    helpButton.textContent = '帮助';
}

function openExportArea() {
    isExportExpanded = true;
    exportArea.classList.add('is-open');
    exportArea.style.maxHeight = EXPORT_AREA_HEIGHT + 'px';
    exportArea.style.bottom = panelBottom(true);
    // 等待 DOM 更新后获取实际高度
    setTimeout(() => {
        setRowLift(EXPORT_AREA_HEIGHT);
    }, 10);
    exportButton.textContent = '收起';
}

function closeExportArea() {
    isExportExpanded = false;
    exportArea.classList.remove('is-open');
    exportArea.style.maxHeight = '0';
    exportArea.style.bottom = panelBottom(false);
    setRowLift(0);
    exportButton.textContent = '导出';
}


// 动态调整展开区域的位置
window.addEventListener('resize', () => {
    expandableArea.style.bottom = panelBottom(isHelpExpanded);
    exportArea.style.bottom = panelBottom(isExportExpanded);
    // 宽窄屏切换时同步按钮位移（宽屏要抬到面板上方，窄屏归零）
    if (isHelpExpanded) {
        setRowLift(HELP_AREA_HEIGHT);
    } else if (isExportExpanded) {
        setRowLift(EXPORT_AREA_HEIGHT);
    } else {
        setRowLift(0);
    }
});

/* ── 窄屏下这一行放不放得下 ──
   「航警列表」居中时左边缘是 (视口宽 - 按钮宽) / 2；撞上「导出」右边缘（含间距）就放不下，
   这时给 body 加 .nav-row-tight，由 styles.css 把它改成紧跟在「导出」右边。
   判断只用到「导出」的位置和「航警列表」的宽度，两者都不随该 class 变化，不会来回抖。 */
const NAV_ROW_MAX_WIDTH = 768;  // 与 styles.css 的窄屏断点一致
const NAV_ROW_GAP = 12;         // 「导出」与「航警列表」之间的水平间距（px）
let navRowFitFrame = 0;

function updateNavRowFit() {
    navRowFitFrame = 0;
    if (!helpButton || !exportButton || !sidebarToggle || !document.body) return;

    if (window.innerWidth > NAV_ROW_MAX_WIDTH) {
        document.body.classList.remove('nav-row-tight');
        return;
    }

    const exportRight = exportButton.getBoundingClientRect().right;
    const toggleWidth = sidebarToggle.getBoundingClientRect().width;
    const centeredLeft = (window.innerWidth - toggleWidth) / 2;
    document.body.classList.toggle('nav-row-tight', centeredLeft < exportRight + NAV_ROW_GAP);
}

function scheduleNavRowFit() {
    if (navRowFitFrame) return;
    navRowFitFrame = requestAnimationFrame(updateNavRowFit);
}

updateNavRowFit();
window.addEventListener('resize', scheduleNavRowFit);
window.addEventListener('orientationchange', scheduleNavRowFit);
window.addEventListener('load', updateNavRowFit);


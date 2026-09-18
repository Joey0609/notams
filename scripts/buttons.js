const helpButton = document.getElementById('helpButton');
const exportButton = document.getElementById('exportButton');
const expandableArea = document.getElementById('expandableArea');
const exportArea = document.getElementById('exportArea');
const globeFxButton = document.getElementById('globeFxButton');   // 3D 专用「功能」按钮（2D 下由 CSS 隐藏）
const globeFxArea = document.getElementById('globeFxArea');       // 3D 功能面板：晨昏光照 / 显示时刻 / 倍速播放
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
let isGlobeFxExpanded = false;

/* 液态玻璃的悬停高光跟随指针：把圆心写进 --glass-x / --glass-y（元素内的百分比），
   CSS 里那层 ::after 的径向渐变用它当圆心。指针事件本身就是一帧最多一次，
   直接写变量即可跟手，不需要 rAF 循环。
   触摸没有 hover：改为按住期间加 .is-touching 点亮，并跟随手指（松手或滑出按钮时收起）。
   .is-touching 的 CSS 与 :hover 逐像素等价（只亮光斑、不提亮底色、不加阴影、不位移），
   所以移动端「按住不放」= 电脑端鼠标悬停。 */
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

    /* 把光斑圆心写成元素内的百分比坐标（--glass-x / --glass-y）。
       坐标必须能用，否则亮点就不在按压位置上了：
       - 个别 WebView 会把触摸派生的 pointer 事件填成 (0,0)；这些按钮都不在视口原点，一看就是坏值；
       - NaN 更要命：var() 替换失败会让整条 background-image 失效、光斑整层不画，
         表现就是「按下去只在按钮上亮一片、手指底下没有亮点」。
       所以坏坐标一律钉到按钮中心，绝不让亮点跑到按压位置之外。 */
    const writeSheen = (clientX, clientY) => {
        const rect = control.getBoundingClientRect ? control.getBoundingClientRect() : null;
        if (!rect || !rect.width || !rect.height) return;
        if (!control.style || typeof control.style.setProperty !== 'function') return;
        const usable = typeof clientX === 'number' && typeof clientY === 'number' &&
            isFinite(clientX) && isFinite(clientY) && !(clientX === 0 && clientY === 0);
        const x = usable ? clientX : rect.left + rect.width / 2;
        const y = usable ? clientY : rect.top + rect.height / 2;
        const point = glassSheenPercent(rect, x, y);
        control.style.setProperty('--glass-x', point.x.toFixed(2) + '%');
        control.style.setProperty('--glass-y', point.y.toFixed(2) + '%');
    };

    /* 坐标是否还落在按钮里（留 2px 容差）：手指滑出去就当作「不再按住」，与鼠标 hover 离开按钮一致 */
    const stillOnControl = (clientX, clientY) => {
        const rect = control.getBoundingClientRect ? control.getBoundingClientRect() : null;
        if (!rect || !rect.width || !rect.height) return false;
        const pad = 2;
        return clientX >= rect.left - pad && clientX <= rect.right + pad &&
            clientY >= rect.top - pad && clientY <= rect.bottom + pad;
    };

    /* ── 触摸：用 touch 事件，不用 pointer 事件 ──
       这是「按住之后拖动，亮点必须一直跟着手指」的关键。触摸的 pointer 事件流会被浏览器的
       滚动 / 平移手势掐断：手指只要移动几个像素、浏览器判定这是滚屏，就会给这个元素派发
       pointercancel，此后 pointermove 再也不会派给元素，亮点就地冻住，直到松手才收。
       触摸事件没有这个问题 —— 整个手势期间 touchmove 始终派发给 touchstart 的那个元素
       （这里是 passive 监听，不阻止页面滚动），所以手指滑到哪儿，亮点就跟到哪儿。
       手指滑出按钮则收起（滑回来重新点亮），和鼠标 hover 的进出行为一致。 */
    const touchOf = (event) =>
        (event.touches && event.touches[0]) ||
        (event.changedTouches && event.changedTouches[0]) ||
        null;

    control.addEventListener('touchstart', (event) => {
        const touch = touchOf(event);
        if (touch) writeSheen(touch.clientX, touch.clientY);
        control.classList.add('is-touching');
    }, { passive: true });

    control.addEventListener('touchmove', (event) => {
        const touch = touchOf(event);
        if (!touch) return;
        writeSheen(touch.clientX, touch.clientY);
        if (stillOnControl(touch.clientX, touch.clientY)) control.classList.add('is-touching');
        else control.classList.remove('is-touching');
    }, { passive: true });

    const endTouch = () => control.classList.remove('is-touching');
    control.addEventListener('touchend', endTouch, { passive: true });
    control.addEventListener('touchcancel', endTouch, { passive: true });

    /* ── 鼠标 / 手写笔：走 pointer 事件 ──
       触摸派生的 pointer 事件（pointerType 为 'touch'，个别 WebView 甚至是空串）一律忽略，
       交给上面那条 touch 链路，免得两套机制互相抢着收放 .is-touching。
       鼠标的点亮归 CSS 的 :hover 管，这里只负责把光斑圆心跟着指针走；
       手写笔悬停未必有 hover，所以按下时补一个 .is-touching（外观与 hover 逐像素相同）。 */
    if (!window.PointerEvent) return;

    const isMouseOrPen = (event) => event.pointerType === 'mouse' || event.pointerType === 'pen';
    const move = (event) => { if (isMouseOrPen(event)) writeSheen(event.clientX, event.clientY); };
    const release = (event) => { if (isMouseOrPen(event)) control.classList.remove('is-touching'); };

    control.addEventListener('pointerenter', move, { passive: true });
    control.addEventListener('pointermove', move, { passive: true });
    control.addEventListener('pointerdown', (event) => {
        move(event);
        if (event.pointerType === 'pen') control.classList.add('is-touching');
    }, { passive: true });
    control.addEventListener('pointerup', release, { passive: true });
    control.addEventListener('pointercancel', release, { passive: true });
    control.addEventListener('pointerleave', release, { passive: true });
}

[helpButton, exportButton, sidebarToggle, manualToggle, customButton, globeFxButton].forEach(bindGlassSheen);

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
const GLOBE_FX_AREA_HEIGHT = 340; // 3D 功能面板的兜底高度（优先量 scrollHeight，见 globeFxAreaHeight()）

helpButton.addEventListener('click', () => {
    if (isGlobeFxExpanded) {
        // 3D 功能面板开着：先收起它，再展开帮助（和「导出」→「帮助」同一套错峰节奏）
        closeGlobeFxArea();
        setTimeout(() => {
            openHelpArea();
        }, 100);
        return;
    }
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
    if (isGlobeFxExpanded) {
        // 3D 功能面板开着：先收起它，再展开导出页
        closeGlobeFxArea();
        setTimeout(() => {
            openExportArea();
        }, 100);
        return;
    }
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
    // 3D 下这一行是「帮助 + 功能」（导出被 CSS 隐藏），抬升要一起抬，否则两块按钮会错位。
    // 2D 下这个按钮是 display:none，写 transform 无副作用。
    if (globeFxButton) globeFxButton.style.transform = `translateY(-${lift}px)`;
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

/* ── 3D 功能面板（晨昏光照 / 显示时刻 / 倍速播放）──
   开合、位置、抬升完全沿用「帮助 / 导出」那一套（同一个面板样式、同一个 panelBottom() 基线、
   同一个 setRowLift()），三块面板互斥。
   注意：开关状态、显示时刻、倍速、状态行文字都不属于这里 —— 它们由 globe.js 的 fx 控制器持有
   （只有它拿得到 Cesium viewer），这里只负责布局，并在展开时叫它同步一次 UI。 */
function globeFxAreaHeight() {
    // 面板以后还会加模块，高度会变：优先量真实内容高度（收起时 max-height:0，scrollHeight 仍是内容高度）
    const measured = globeFxArea ? globeFxArea.scrollHeight : 0;
    const natural = measured > 0 ? measured : GLOBE_FX_AREA_HEIGHT;
    // 窗口很矮时封顶，超出部分在面板内部滚动（.globe-fx-area 本身就是 overflow-y: auto）
    return Math.min(natural, Math.max(160, window.innerHeight - 140));
}

function openGlobeFxArea() {
    if (!globeFxArea || !globeFxButton) return;
    isGlobeFxExpanded = true;
    globeFxArea.classList.add('is-open');
    globeFxArea.style.maxHeight = globeFxAreaHeight() + 'px';
    globeFxArea.style.bottom = panelBottom(true);
    setTimeout(() => {
        setRowLift(globeFxAreaHeight());
    }, 10);
    globeFxButton.textContent = '收起';
    // 展开时把开关 / 时刻输入框 / 状态行同步到实际状态（切过 2D 再回来时尤其需要）
    const fx = window.NotamGlobe && window.NotamGlobe.fx;
    if (fx && typeof fx.syncUi === 'function') fx.syncUi();
}

function closeGlobeFxArea() {
    // 只有它真的开着才动布局：globe.js 切回 2D 时会无条件叫这里收面板，
    // 那时若「帮助」开着，setRowLift(0) 会把帮助按钮连同面板一起放下来（错位）。
    if (!globeFxArea || !globeFxButton || !isGlobeFxExpanded) return;
    isGlobeFxExpanded = false;
    globeFxArea.classList.remove('is-open');
    globeFxArea.style.maxHeight = '0';
    globeFxArea.style.bottom = panelBottom(false);
    setRowLift(0);
    globeFxButton.textContent = '功能';
}

if (globeFxButton) {
    globeFxButton.addEventListener('click', () => {
        if (isHelpExpanded) {
            closeHelpArea();
            setTimeout(() => { openGlobeFxArea(); }, 100);
            return;
        }
        if (isExportExpanded) {
            // 2D 展开过导出页再切到 3D 时，导出页处于“已展开但被 CSS 隐藏”的状态，先把它收干净
            closeExportArea();
            setTimeout(() => { openGlobeFxArea(); }, 100);
            return;
        }
        if (isGlobeFxExpanded) closeGlobeFxArea();
        else openGlobeFxArea();
    });
}


// 动态调整展开区域的位置
window.addEventListener('resize', () => {
    expandableArea.style.bottom = panelBottom(isHelpExpanded);
    exportArea.style.bottom = panelBottom(isExportExpanded);
    if (globeFxArea) globeFxArea.style.bottom = panelBottom(isGlobeFxExpanded);
    // 宽窄屏切换时同步按钮位移（宽屏要抬到面板上方，窄屏归零）
    if (isHelpExpanded) {
        setRowLift(HELP_AREA_HEIGHT);
    } else if (isExportExpanded) {
        setRowLift(EXPORT_AREA_HEIGHT);
    } else if (isGlobeFxExpanded) {
        setRowLift(globeFxAreaHeight());
    } else {
        setRowLift(0);
    }
});

/* ── 窄屏下这一行放不放得下 ──
   「航警列表」居中时左边缘是 (视口宽 - 按钮宽) / 2；撞上左侧那颗按钮的右边缘（含间距）就放不下，
   这时给 body 加 .nav-row-tight，由 styles.css 把它改成紧贴那颗按钮右边。
   判断只用到左侧按钮的位置和「航警列表」的宽度，两者都不随该 class 变化，不会来回抖。
   左侧那颗按钮随模式换人：2D 是「导出」，3D 是「功能」（2D/3D 下另一颗是 display:none，
   getBoundingClientRect() 会全是 0，不能拿来当基准）。两者右边缘都是 116px，所以
   styles.css 里 body.nav-row-tight #sidebarToggle {left: 128px} 那条兜底规则不用改。 */
const NAV_ROW_MAX_WIDTH = 768;  // 与 styles.css 的窄屏断点一致
const NAV_ROW_GAP = 12;         // 左侧按钮与「航警列表」之间的水平间距（px）
const NAV_ROW_LEFT_ANCHOR_RIGHT = 116;  // 量不到时退回的右边缘：left 74 + width 42
let navRowFitFrame = 0;

function updateNavRowFit() {
    navRowFitFrame = 0;
    if (!helpButton || !exportButton || !sidebarToggle || !document.body) return;

    if (window.innerWidth > NAV_ROW_MAX_WIDTH) {
        document.body.classList.remove('nav-row-tight');
        return;
    }

    const leftAnchor = document.body.classList.contains('globe-active') ? globeFxButton : exportButton;
    const anchorRect = leftAnchor ? leftAnchor.getBoundingClientRect() : null;
    const anchorRight = anchorRect && anchorRect.width ? anchorRect.right : NAV_ROW_LEFT_ANCHOR_RIGHT;
    const toggleWidth = sidebarToggle.getBoundingClientRect().width;
    const centeredLeft = (window.innerWidth - toggleWidth) / 2;
    document.body.classList.toggle('nav-row-tight', centeredLeft < anchorRight + NAV_ROW_GAP);
}

function scheduleNavRowFit() {
    if (navRowFitFrame) return;
    navRowFitFrame = requestAnimationFrame(updateNavRowFit);
}

updateNavRowFit();
window.addEventListener('resize', scheduleNavRowFit);
window.addEventListener('orientationchange', scheduleNavRowFit);
window.addEventListener('load', updateNavRowFit);


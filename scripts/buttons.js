const helpButton = document.getElementById('helpButton');
const exportButton = document.getElementById('exportButton');
const expandableArea = document.getElementById('expandableArea');
const exportArea = document.getElementById('exportArea');
const logPanel = document.getElementById('logPanel');
let logPanelExpanded = false;
let logPanelListener = null;
let userScrolledUp = false;
let lastRenderedCount = 0;
const customButton = document.getElementById('customButton');
let isHelpExpanded = false;
let isExportExpanded = false;

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
});

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

function openHelpArea() {
    isHelpExpanded = true;
    expandableArea.style.maxHeight = HELP_AREA_HEIGHT + 'px';
    const isMobile = window.innerWidth <= 768;
    expandableArea.style.bottom = isMobile ? '60px' : '10px';
    // 等待 DOM 更新后获取实际高度
    setTimeout(() => {
        helpButton.style.transform = `translateY(-${HELP_AREA_HEIGHT }px)`;
        exportButton.style.transform = `translateY(-${HELP_AREA_HEIGHT }px)`;
        if (customButton) customButton.style.transform = `translateY(-${HELP_AREA_HEIGHT }px)`;
    }, 10);
    helpButton.textContent = '收起';
}

function closeHelpArea() {
    isHelpExpanded = false;
    expandableArea.style.maxHeight = '0';
    const isMobile = window.innerWidth <= 768;
    expandableArea.style.bottom = isMobile ? '90px' : '40px';
    helpButton.style.transform = 'translateY(0)';
    exportButton.style.transform = 'translateY(0)';
    if (customButton) customButton.style.transform = 'translateY(0)';
    helpButton.textContent = '帮助';
}

function openExportArea() {
    isExportExpanded = true;
    exportArea.style.maxHeight = EXPORT_AREA_HEIGHT + 'px';
    const isMobile = window.innerWidth <= 768;
    exportArea.style.bottom = isMobile ? '60px' : '10px';
    // 等待 DOM 更新后获取实际高度
    setTimeout(() => {
        helpButton.style.transform = `translateY(-${EXPORT_AREA_HEIGHT }px)`;
        exportButton.style.transform = `translateY(-${EXPORT_AREA_HEIGHT }px)`;
        if (customButton) customButton.style.transform = `translateY(-${EXPORT_AREA_HEIGHT }px)`;
    }, 10);
    exportButton.textContent = '收起';
}

function closeExportArea() {
    isExportExpanded = false;
    exportArea.style.maxHeight = '0';
    const isMobile = window.innerWidth <= 768;
    exportArea.style.bottom = isMobile ? '90px' : '40px';
    helpButton.style.transform = 'translateY(0)';
    exportButton.style.transform = 'translateY(0)';
    if (customButton) customButton.style.transform = 'translateY(0)';
    exportButton.textContent = '导出';
}


// 动态调整展开区域的位置
window.addEventListener('resize', () => {
    const isMobile = window.innerWidth <= 768;
    if (isHelpExpanded) {
        expandableArea.style.bottom = isMobile ? '60px' : '10px';
    } else {
        expandableArea.style.bottom = isMobile ? '90px' : '40px';
    }
    if (isExportExpanded) {
        exportArea.style.bottom = isMobile ? '60px' : '10px';
    } else {
        exportArea.style.bottom = isMobile ? '90px' : '40px';
    }
});


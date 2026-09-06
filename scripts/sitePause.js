/*
 * 临时维护开关：只需修改此变量并重新部署静态文件。
 * 为空字符串表示正常服务；示例：'2026-09-10T00:00:00+08:00'
 */
const SITE_PAUSE_UNTIL = '';

const SITE_PAUSE_MESSAGE = '为积极响应国家网络安全工作部署，切实履行平台主体责任，本站自即日起主动暂停服务进行安全自查与优化，计划于 {date} 恢复访问。由此带来的不便，敬请谅解，衷心感谢您的理解与支持。';

function getSitePauseUntil() {
    if (!SITE_PAUSE_UNTIL || typeof SITE_PAUSE_UNTIL !== 'string') return null;
    const timestamp = Date.parse(SITE_PAUSE_UNTIL);
    if (!Number.isFinite(timestamp)) {
        console.warn('[sitePause] SITE_PAUSE_UNTIL 不是有效的 ISO 8601 时间，已按正常服务处理。');
        return null;
    }
    return new Date(timestamp);
}

function getSitePauseInfo() {
    const until = getSitePauseUntil();
    if (!until || until.getTime() <= Date.now()) return { paused: false, until: null };
    return { paused: true, until };
}

function isSitePaused() {
    return getSitePauseInfo().paused;
}

function formatSitePauseDate(date) {
    return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date).replace(/\s+/g, ' ');
}

function showSitePausePage() {
    const overlay = document.getElementById('sitePauseOverlay');
    if (!overlay) return;
    const info = getSitePauseInfo();
    if (!info.paused) {
        overlay.classList.remove('is-visible');
        document.documentElement.classList.remove('site-paused');
        document.body.classList.remove('site-paused');
        return;
    }

    const date = formatSitePauseDate(info.until);
    const dateNode = overlay.querySelector('[data-pause-date]');
    const messageNode = overlay.querySelector('[data-pause-message]');
    if (dateNode) dateNode.textContent = date;
    if (messageNode) messageNode.textContent = SITE_PAUSE_MESSAGE.replace('{date}', date);
    overlay.classList.add('is-visible');
    document.documentElement.classList.add('site-paused');
    document.body.classList.add('site-paused');
}

// 此脚本放在页面脚本之前加载，确保暂停时不会获取数据。
showSitePausePage();

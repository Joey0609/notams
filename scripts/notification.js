function showNotification(message, duration = 2000) {
    // 移除旧的
    const old = document.querySelector('.notification');
    if (old) old.remove();

    const div = document.createElement('div');
    div.className = 'notification';
    div.textContent = message;
    document.body.appendChild(div);

    // 触发 reflow
    requestAnimationFrame(() => div.classList.add('show'));

    setTimeout(() => {
        div.classList.remove('show');
        setTimeout(() => div.remove(), 400);
    }, duration);
}
/* 来源导航与同一份纵向列表双向联动；指针捕获保证拖到轨道外也可松手。 */
(function () {
    const rail = document.getElementById('sourceNavigator');
    const list = document.getElementById('notamList');
    if (!rail || !list) return;
    const keys = ['NOTAM', 'MSI', 'MSA', 'NOTMAR'];
    const buttons = Array.from(rail.querySelectorAll('button'));
    const thumb = rail.querySelector('.source-thumb');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let position = 0, target = 0, velocity = 0, frame = 0, dragging = false;
    let pointer = null, downX = 0, downPosition = 0, moved = false, lastTime = 0;
    let scrolling = false, scrollFrame = 0, scrollEnd = 0;
    const clamp = value => Math.max(0, Math.min(3, value));
    const sections = () => keys.map(key => list.querySelector('[data-source-group="' + key + '"]'));
    const offsets = () => sections().map(section => section ? section.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - 58 : 0);
    function paint() {
        const width = (rail.clientWidth - 8) / 4;
        thumb.style.width = width + 'px';
        thumb.style.transform = 'translateX(' + (position * width) + 'px)';
        buttons.forEach((button, i) => {
            button.classList.toggle('is-selected', Math.round(clamp(position)) === i);
            button.setAttribute('aria-pressed', String(Math.round(clamp(position)) === i));
        });
    }
    function spring(time) {
        const dt = Math.min((time - (lastTime || time)) / 1000, 0.032);
        lastTime = time;
        velocity += ((target - position) * 210 - velocity * 23) * dt;
        position += velocity * dt;
        paint();
        if (Math.abs(target - position) > 0.001 || Math.abs(velocity) > 0.01) frame = requestAnimationFrame(spring);
        else { position = target; velocity = 0; frame = 0; lastTime = 0; paint(); }
    }
    function move(value, animate = true) {
        target = value;
        if (!animate || reduced.matches) {
            cancelAnimationFrame(frame); frame = 0; lastTime = 0; velocity = 0; position = value; paint();
        } else if (!frame) frame = requestAnimationFrame(spring);
    }
    function scrollToPosition(value, smooth) {
        const points = offsets(), bounded = clamp(value), left = Math.floor(bounded), right = Math.min(3, left + 1);
        list.scrollTo({ top: points[left] + (points[right] - points[left]) * (bounded - left), behavior: smooth && !reduced.matches ? 'smooth' : 'instant' });
    }
    function select(index, smooth = true) {
        scrolling = true; clearTimeout(scrollEnd);
        move(index); scrollToPosition(index, smooth);
        scrollEnd = setTimeout(() => { scrolling = false; }, smooth ? 800 : 80);
    }
    rail.addEventListener('pointerdown', event => {
        if (event.button !== 0 || pointer !== null) return;
        pointer = event.pointerId; downX = event.clientX; downPosition = position; moved = false;
        cancelAnimationFrame(frame); frame = 0; velocity = 0; lastTime = 0;
        rail.setPointerCapture(pointer);
    });
    rail.addEventListener('pointermove', event => {
        if (pointer !== event.pointerId) return;
        const delta = (event.clientX - downX) / ((rail.clientWidth - 8) / 4);
        if (Math.abs(event.clientX - downX) > 3) moved = true;
        if (!moved) return;
        dragging = true; rail.classList.add('is-dragging');
        const raw = downPosition + delta, bounded = clamp(raw);
        move(bounded + Math.tanh(raw - bounded) * 0.18, false);
        scrollToPosition(bounded, false);
    });
    function release(event, cancelled = false) {
        if (pointer !== event.pointerId) return;
        const wasMoved = moved;
        if (rail.hasPointerCapture(pointer)) rail.releasePointerCapture(pointer);
        pointer = null; dragging = false; rail.classList.remove('is-dragging');
        if (cancelled || wasMoved) select(Math.round(clamp(position)));
        else {
            const bounds = rail.getBoundingClientRect();
            select(Math.round(clamp((event.clientX - bounds.left - 4) / ((bounds.width - 8) / 4) - 0.5)));
        }
    }
    rail.addEventListener('pointerup', event => release(event));
    rail.addEventListener('pointercancel', event => release(event, true));
    buttons.forEach((button, i) => {
        button.addEventListener('click', event => { if (event.detail === 0) select(i); });
        button.addEventListener('keydown', event => {
            let next = i;
            if (event.key === 'ArrowRight') next = Math.min(3, i + 1);
            else if (event.key === 'ArrowLeft') next = Math.max(0, i - 1);
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = 3;
            else return;
            event.preventDefault(); buttons[next].focus(); select(next);
        });
    });
    function syncScroll() {
        scrollFrame = 0;
        if (dragging || scrolling) return;
        const points = offsets(), top = list.scrollTop;
        // 浏览列表时只跟随当前分组，不按组内滚动进度插值。
        let index = 0;
        for (let i = 1; i < points.length; i++) {
            if (top >= points[i] - 1) index = i;
        }
        move(index);
    }
    list.addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(syncScroll); }, { passive: true });
    ['wheel', 'touchstart', 'pointerdown'].forEach(type => list.addEventListener(type, () => { scrolling = false; clearTimeout(scrollEnd); }, { passive: true }));
    function refresh() {
        buttons.forEach((button, i) => {
            const count = sections()[i]?.querySelectorAll('.notam-item').length || 0;
            button.setAttribute('aria-label', keys[i] + '，' + count + ' 条航警');
        });
        // 为最后一段保留足够滚动空间，空来源同样能被准确定位。
        const lastSection = sections().filter(Boolean).at(-1);
        const lastHeight = lastSection ? lastSection.getBoundingClientRect().height : 0;
        // 仅在最后一组不足一屏时补齐，避免滚到底只剩半张卡片和大块空白。
        list.style.paddingBottom = Math.max(16, list.clientHeight - lastHeight - 68) + 'px';
        syncScroll(); paint();
    }
    new ResizeObserver(refresh).observe(list);
    new ResizeObserver(paint).observe(rail);
    window.NotamSourceNavigator = { refresh };
    refresh();
})();

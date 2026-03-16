(function() {
    const MAX_ENTRIES = 500;
    const entries = [];
    const listeners = new Set();

    function notifyListeners() {
        listeners.forEach(cb => {
            try {
                cb();
            } catch (err) {
                // Intentionally silent to avoid recursive logging
            }
        });
    }

    function stringifyValue(value) {
        if (typeof value === 'string') return value;
        if (value instanceof Error) return value.stack || value.message || String(value);
        try {
            return JSON.stringify(value);
        } catch (err) {
            return String(value);
        }
    }

    function addEntry(level, args) {
        const message = (args || [])
            .filter(arg => arg !== undefined && arg !== null)
            .map(arg => stringifyValue(arg))
            .join(' ');
        const entry = {
            timestamp: new Date().toLocaleTimeString(),
            level: (level || 'log').toUpperCase(),
            message: message.trim()
        };

        entries.push(entry);
        if (entries.length > MAX_ENTRIES) {
            entries.shift();
        }

        notifyListeners();
    }

    const nativeConsole = window.console || {};
    ['log', 'info', 'warn', 'error', 'debug'].forEach(method => {
        const original = nativeConsole[method];
        if (typeof original !== 'function') return;
        nativeConsole[method] = function(...args) {
            addEntry(method, args);
            original.apply(nativeConsole, args);
        };
    });

    window.addEventListener('error', event => {
        addEntry('error', [
            event.message,
            `${event.filename}:${event.lineno}:${event.colno}`,
            event.error && event.error.stack
        ]);
    });

    window.addEventListener('unhandledrejection', event => {
        const reason = event.reason;
        addEntry('error', [
            'UnhandledPromiseRejection',
            reason && reason.stack ? reason.stack : reason
        ]);
    });

    window.BrowserConsoleLogs = {
        getEntries: () => entries.slice(),
        clear: () => {
            entries.length = 0;
            notifyListeners();
        },
        addListener: callback => listeners.add(callback),
        removeListener: callback => listeners.delete(callback)
    };
})();

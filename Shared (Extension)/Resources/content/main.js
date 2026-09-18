/*
 * NoMoreCookies — content script entry point.
 *
 * Timing is the whole game here. The static stylesheet is already applied
 * by the time this runs, so known banners never paint. Everything below is
 * about catching the ones that show up later: on load, on scroll, on exit
 * intent, or ten seconds in when a timer fires.
 */

(function () {
    "use strict";

    var NMC = window.NMC;
    var api = NMC.api;
    var state = NMC.state;

    /* ------------------------------------------------------------ *
     * Settings
     * ------------------------------------------------------------ */

    function merge(stored) {
        var s = {};
        Object.keys(NMC.DEFAULTS).forEach(function (k) {
            s[k] = stored && stored[k] !== undefined ? stored[k] : NMC.DEFAULTS[k];
        });
        s.categories = Object.assign({}, NMC.DEFAULTS.categories, (stored && stored.categories) || {});
        return s;
    }

    function hostMatches(host, entry) {
        if (!host || !entry) return false;
        host = host.toLowerCase().replace(/^www\./, "");
        entry = entry.toLowerCase().replace(/^www\./, "");
        return host === entry || host.endsWith("." + entry);
    }

    function isAllowlisted(host, list) {
        for (var i = 0; i < (list || []).length; i++) {
            if (hostMatches(host, list[i])) return true;
        }
        return false;
    }

    function refreshContext() {
        var get;
        try {
            get = api.storage.local.get(null);
        } catch (e) {
            return Promise.resolve();
        }
        if (!get || typeof get.then !== "function") return Promise.resolve();

        return get
            .then(function (stored) {
                state.settings = merge(stored);
                return state.isTop ? location.hostname : topHost();
            })
            .then(function (host) {
                state.host = host || location.hostname;
                state.allowed = !isAllowlisted(state.host, state.settings.allowlist);
                state.settingsReady = true;
                NMC.applyClasses();
                if (!state.allowed || !state.settings.enabled) NMC.restoreAll();
            })
            .catch(function () {
                state.settingsReady = true;
            });
    }

    /* A sub-frame cannot see the top-level hostname cross-origin, but the
       background script can, so the allowlist still covers embedded frames. */
    function topHost() {
        return NMC.send({ type: "nmc:tophost" }).then(function (res) {
            return (res && res.host) || location.hostname;
        });
    }

    /* ------------------------------------------------------------ *
     * Scan scheduling
     * ------------------------------------------------------------ */

    var pending = null;
    var scanCount = 0;

    function interval() {
        /* Back off once a page has proven to be mutation-heavy. */
        if (scanCount < 20) return 150;
        if (scanCount < 60) return 400;
        return 1200;
    }

    function schedule(delay) {
        if (pending) return;
        pending = setTimeout(function () {
            pending = null;
            run();
        }, delay === undefined ? interval() : delay);
    }

    function run() {
        if (!state.settingsReady) return;
        if (!state.settings.enabled || !state.allowed) return;
        scanCount++;
        try {
            window.NMC_CMP.run();
        } catch (e) {
            /* ignore */
        }
        try {
            window.NMC_HEUR.scan();
        } catch (e) {
            /* ignore */
        }
    }

    /* ------------------------------------------------------------ *
     * Triggers
     * ------------------------------------------------------------ */

    function startObserver() {
        var target = document.documentElement;
        if (!target) return;

        var mo = new MutationObserver(function () {
            schedule();
        });

        try {
            mo.observe(target, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["style", "class", "open", "hidden", "aria-modal", "aria-hidden"]
            });
        } catch (e) {
            /* ignore */
        }
    }

    /* Timers, because plenty of pop-ups are on a plain setTimeout. */
    var SWEEPS = [0, 300, 800, 1500, 3000, 5000, 8000, 12000, 20000, 30000];

    function startSweeps() {
        SWEEPS.forEach(function (ms) {
            setTimeout(function () {
                schedule(0);
            }, ms);
        });
    }

    function startEventTriggers() {
        var opts = { passive: true, capture: true };

        /* Scroll-triggered and exit-intent pop-ups. */
        window.addEventListener("scroll", function () {
            schedule(200);
        }, opts);

        document.addEventListener("mouseout", function (e) {
            if (!e.relatedTarget && e.clientY <= 0) schedule(0);
        }, opts);

        window.addEventListener("blur", function () {
            schedule(300);
        }, opts);

        document.addEventListener("visibilitychange", function () {
            if (!document.hidden) schedule(300);
        }, opts);

        window.addEventListener("load", function () {
            schedule(0);
            setTimeout(function () {
                schedule(0);
            }, 600);
        }, opts);

        /* Single-page apps swap the whole view without a navigation. */
        window.addEventListener("popstate", function () {
            schedule(300);
        }, opts);
    }

    /* ------------------------------------------------------------ *
     * Popup <-> content messaging
     * ------------------------------------------------------------ */

    function onMessage(msg) {
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case "nmc:getState":
                /* Only the top frame answers, otherwise every iframe races
                   to reply and the popup gets whichever arrives first. */
                if (!state.isTop) return;
                return Promise.resolve({
                    host: state.host,
                    allowed: state.allowed,
                    items: NMC.summary()
                });

            case "nmc:restore":
                NMC.restore(msg.id);
                return Promise.resolve({ ok: true });

            case "nmc:restoreAll":
                NMC.restoreAll();
                return Promise.resolve({ ok: true });

            case "nmc:rescan":
                run();
                return Promise.resolve({ ok: true });

            case "nmc:settingsChanged":
                return refreshContext().then(function () {
                    schedule(0);
                    return { ok: true };
                });
        }
    }

    try {
        api.runtime.onMessage.addListener(onMessage);
    } catch (e) {
        /* ignore */
    }

    try {
        api.storage.onChanged.addListener(function (changes, area) {
            if (area !== "local") return;
            refreshContext().then(function () {
                schedule(0);
            });
        });
    } catch (e) {
        /* ignore */
    }

    /* ------------------------------------------------------------ *
     * Boot
     * ------------------------------------------------------------ */

    function whenBody(fn) {
        if (document.body) return fn();
        var mo = new MutationObserver(function () {
            if (document.body) {
                mo.disconnect();
                fn();
            }
        });
        mo.observe(document.documentElement, { childList: true });
    }

    refreshContext().then(function () {
        schedule(0);
    });

    startObserver();
    startEventTriggers();

    whenBody(function () {
        /* Record what shipped with the page so "appeared later" means
           something. Banners in the initial HTML still get scored, they
           just do not collect that particular point. */
        try {
            window.NMC_HEUR.baseline();
        } catch (e) {
            /* ignore */
        }
        startSweeps();
    });
})();

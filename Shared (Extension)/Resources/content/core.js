/*
 * NoMoreCookies — shared runtime for the content scripts.
 */

window.NMC = (function () {
    "use strict";

    var api = window.browser || window.chrome;
    var D = window.NMC_DATA;

    /* Keep in sync with shared/defaults.js, which background.js and the
       popup use. Content scripts cannot import modules, hence the copy. */
    var DEFAULTS = {
        enabled: true,
        mode: "balanced",
        categories: {
            cookie: true, news: true, app: true, adblock: true,
            video: true, ads: true, login: true
        },
        autoReject: true,
        unlockScroll: true,
        blockConsentScripts: true,
        blockPopupScripts: true,
        blockAdNetworks: true,
        blockTrackers: true,
        allowlist: [],
        totalBlocked: 0
    };

    var state = {
        settings: DEFAULTS,
        settingsReady: false,
        allowed: true, // false once we learn this site is allowlisted
        host: location.hostname,
        isTop: window.top === window.self,
        hidden: [],
        nextId: 1,
        unlocked: false,
        clicks: 0
    };

    /* ---------------------------------------------------------- *
     * Element helpers
     * ---------------------------------------------------------- */

    function textOf(el, cap) {
        var t = el.textContent || "";
        if (t.length > (cap || 4000)) t = t.slice(0, cap || 4000);
        return t.replace(/\s+/g, " ").trim().toLowerCase();
    }

    function labelOf(el) {
        var parts = [
            el.getAttribute && el.getAttribute("aria-label"),
            el.getAttribute && el.getAttribute("title"),
            el.value,
            el.textContent
        ];
        for (var i = 0; i < parts.length; i++) {
            var p = (parts[i] || "").replace(/\s+/g, " ").trim();
            if (p) return p;
        }
        return "";
    }

    function nameBlob(el) {
        var id = el.id || "";
        var cls = typeof el.className === "string" ? el.className : "";
        return (id + " " + cls).slice(0, 300);
    }

    /* Word-boundary regexes assume hyphenated-lowercase ("sticky-player").
       A huge share of modern sites (CSS Modules, styled-components) instead
       ship PascalCase or camelCase ("StickyVideoPlayer") with no separator
       at all, which no hyphen-anchored pattern can ever reach. This splits
       on case changes too, so "StickyVideoPlayer" reads as "sticky video
       player" for matching purposes. */
    function normalizedName(el) {
        return nameBlob(el)
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/[-_]+/g, " ")
            .toLowerCase();
    }

    function isVisible(el, cs) {
        cs = cs || getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        if (parseFloat(cs.opacity) === 0) return false;
        return true;
    }

    /* A short, human-readable name for the popup's "we hid this" list. */
    function describe(el) {
        var txt = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (txt.length > 70) txt = txt.slice(0, 67) + "…";
        if (txt) return txt;
        var tag = el.tagName.toLowerCase();
        if (el.id) return tag + "#" + el.id;
        var cls = typeof el.className === "string" ? el.className.trim().split(/\s+/)[0] : "";
        return cls ? tag + "." + cls : tag;
    }

    /* ---------------------------------------------------------- *
     * Shadow DOM
     *
     * We can only reach open roots, which covers every CMP we know of.
     * Hosts are almost always custom elements, so scanning tag names with
     * a dash is a cheap way to find them without a full tree walk.
     * ---------------------------------------------------------- */

    var knownHosts = new WeakSet();

    function collectRoots() {
        var roots = [document];
        var seen = 0;

        function descend(root, depth) {
            if (depth > 4) return;
            var all;
            try {
                all = root.querySelectorAll("*");
            } catch (e) {
                return;
            }
            for (var i = 0; i < all.length && seen < 6000; i++, seen++) {
                var el = all[i];
                if (el.tagName.indexOf("-") === -1 && !el.shadowRoot) continue;
                var sr = el.shadowRoot;
                if (!sr) continue;
                knownHosts.add(el);
                roots.push(sr);
                descend(sr, depth + 1);
            }
        }

        try {
            descend(document, 0);
        } catch (e) {
            /* A hostile page can throw from a patched querySelectorAll. */
        }
        return roots;
    }

    function deepQuery(selector, roots) {
        var out = [];
        roots = roots || [document];
        for (var i = 0; i < roots.length; i++) {
            var found;
            try {
                found = roots[i].querySelectorAll(selector);
            } catch (e) {
                continue;
            }
            for (var j = 0; j < found.length; j++) out.push(found[j]);
        }
        return out;
    }

    /* ---------------------------------------------------------- *
     * Hiding and restoring
     * ---------------------------------------------------------- */

    function hide(el, category, reason) {
        if (!el || el.nodeType !== 1) return false;
        if (el.hasAttribute("data-nmc-hidden") || el.hasAttribute("data-nmc-allow")) return false;

        var rec = {
            id: state.nextId++,
            el: el,
            category: category,
            reason: reason || "",
            label: describe(el),
            prevDisplay: el.style.getPropertyValue("display"),
            prevPriority: el.style.getPropertyPriority("display")
        };

        el.setAttribute("data-nmc-hidden", category);
        /* The attribute rule in cosmetic.css does the work; the inline copy
           is there for scripts that keep re-writing style.display. */
        try {
            el.style.setProperty("display", "none", "important");
        } catch (e) {
            /* ignore */
        }

        /* display:none stops rendering but not playback, and a floating
           player we just hid would carry on talking. */
        try {
            var media = el.querySelectorAll("video, audio");
            for (var i = 0; i < media.length; i++) {
                if (!media[i].paused) media[i].pause();
            }
        } catch (e) {
            /* ignore */
        }

        /* A <dialog> opened with showModal() also owns the top layer and
           the page's scroll lock, so close it properly. */
        if (el.tagName === "DIALOG" && el.open && typeof el.close === "function") {
            try {
                el.close();
            } catch (e) {
                /* ignore */
            }
        }

        state.hidden.push(rec);
        report();
        return true;
    }

    /* Neutralise rather than remove: used for full-screen click blockers,
       where deleting the node would reflow the page under it. */
    function passthrough(el) {
        if (!el || el.hasAttribute("data-nmc-passthrough")) return false;
        el.setAttribute("data-nmc-passthrough", "1");
        return true;
    }

    function restore(id) {
        for (var i = 0; i < state.hidden.length; i++) {
            var rec = state.hidden[i];
            if (rec.id !== id) continue;
            var el = rec.el;
            try {
                el.removeAttribute("data-nmc-hidden");
                el.setAttribute("data-nmc-allow", "1");
                if (rec.prevDisplay) el.style.setProperty("display", rec.prevDisplay, rec.prevPriority);
                else el.style.removeProperty("display");
            } catch (e) {
                /* ignore */
            }
            state.hidden.splice(i, 1);
            report();
            return true;
        }
        return false;
    }

    function restoreAll() {
        var ids = state.hidden.map(function (r) {
            return r.id;
        });
        ids.forEach(restore);
        if (state.unlocked) {
            document.documentElement.classList.remove("nmc-unlocked");
            state.unlocked = false;
        }
    }

    /* ---------------------------------------------------------- *
     * Scroll unlock
     * ---------------------------------------------------------- */

    function unlockScroll() {
        if (!state.settings.unlockScroll) return;
        var html = document.documentElement;
        if (!html) return;

        html.classList.add("nmc-unlocked");
        state.unlocked = true;

        /* Inline styles beat our stylesheet's !important only when they are
           themselves !important, but clearing them is cheap and tidier. */
        [html, document.body].forEach(function (el) {
            if (!el) return;
            ["overflow", "overflow-y", "overflow-x", "position", "height", "max-height", "touch-action"].forEach(
                function (prop) {
                    try {
                        el.style.removeProperty(prop);
                    } catch (e) {
                        /* ignore */
                    }
                }
            );
        });

        /* Modals often mark the rest of the page inert. With the modal gone
           that would leave the site permanently unusable. */
        try {
            var inerts = document.querySelectorAll("[inert]");
            for (var i = 0; i < inerts.length; i++) {
                if (!inerts[i].hasAttribute("data-nmc-hidden")) inerts[i].removeAttribute("inert");
            }
        } catch (e) {
            /* ignore */
        }
    }

    /* ---------------------------------------------------------- *
     * Clicking
     *
     * Synthetic events are isTrusted:false, which no consent platform we
     * have met actually checks. The full pointer sequence is there for
     * frameworks that listen for something other than "click".
     * ---------------------------------------------------------- */

    var MAX_CLICKS = 12;

    function click(el) {
        if (!el || state.clicks >= MAX_CLICKS) return false;
        state.clicks++;

        var rect = { x: 0, y: 0 };
        try {
            var r = el.getBoundingClientRect();
            rect = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        } catch (e) {
            /* ignore */
        }

        var opts = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX: rect.x,
            clientY: rect.y,
            button: 0
        };

        try {
            el.dispatchEvent(new PointerEvent("pointerdown", Object.assign({ pointerType: "mouse", isPrimary: true }, opts)));
            el.dispatchEvent(new MouseEvent("mousedown", opts));
            el.dispatchEvent(new PointerEvent("pointerup", Object.assign({ pointerType: "mouse", isPrimary: true }, opts)));
            el.dispatchEvent(new MouseEvent("mouseup", opts));
            el.dispatchEvent(new MouseEvent("click", opts));
        } catch (e) {
            try {
                el.click();
            } catch (e2) {
                return false;
            }
        }
        return true;
    }

    /* ---------------------------------------------------------- *
     * Settings + messaging
     * ---------------------------------------------------------- */

    function categoryOn(cat) {
        if (!state.settings.enabled || !state.allowed) return false;
        return state.settings.categories[cat] !== false;
    }

    function applyClasses() {
        var html = document.documentElement;
        if (!html) return;
        var off = !state.settings.enabled || !state.allowed;
        html.classList.toggle("nmc-off", off);
        D.CATEGORIES.forEach(function (cat) {
            html.classList.toggle("nmc-off-" + cat, !off && state.settings.categories[cat] === false);
        });
        if (off && state.unlocked) {
            html.classList.remove("nmc-unlocked");
            state.unlocked = false;
        }
    }

    var reportTimer = null;
    function report() {
        if (reportTimer) return;
        reportTimer = setTimeout(function () {
            reportTimer = null;
            send({ type: "nmc:count", count: state.hidden.length });
        }, 250);
    }

    function send(msg) {
        try {
            var p = api.runtime.sendMessage(msg);
            if (p && typeof p.catch === "function") p.catch(function () {});
            return p;
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    function summary() {
        return state.hidden.map(function (r) {
            return { id: r.id, category: r.category, label: r.label, reason: r.reason };
        });
    }

    return {
        api: api,
        DEFAULTS: DEFAULTS,
        state: state,
        textOf: textOf,
        labelOf: labelOf,
        nameBlob: nameBlob,
        normalizedName: normalizedName,
        isVisible: isVisible,
        describe: describe,
        collectRoots: collectRoots,
        deepQuery: deepQuery,
        hide: hide,
        passthrough: passthrough,
        restore: restore,
        restoreAll: restoreAll,
        unlockScroll: unlockScroll,
        click: click,
        categoryOn: categoryOn,
        applyClasses: applyClasses,
        send: send,
        summary: summary
    };
})();

/*
 * NoMoreCookies — consent platform handling.
 *
 * Hiding a cookie banner is only half the job: the site asks again on the
 * next page load, and some of them hold the scroll lock hostage. So where
 * we recognise the platform we click its "reject all" control first, then
 * hide whatever is left.
 */

(function () {
    "use strict";

    var NMC = window.NMC;
    var D = window.NMC_DATA;

    var handled = Object.create(null);
    var genericTries = 0;
    var MAX_GENERIC_TRIES = 6;
    var pendingSecondStage = Object.create(null);

    var MANAGE_RE =
        /manage\s+(cookie|consent|preference|setting|option)|cookie\s+settings|customi[sz]e|more\s+options|configure|einstellungen|personnaliser|configurar|impostazioni/i;

    var CLICKABLE_SEL =
        'button, a[role="button"], [role="button"], input[type="button"], input[type="submit"], a[href="#"], a[href^="javascript"], .btn, [class*="button" i]';

    /* Element plus every open shadow root beneath it. */
    function subRoots(el) {
        var roots = [el];
        function walk(node, depth) {
            if (depth > 3) return;
            var all;
            try {
                all = node.querySelectorAll("*");
            } catch (e) {
                return;
            }
            for (var i = 0; i < all.length && i < 3000; i++) {
                if (all[i].shadowRoot) {
                    roots.push(all[i].shadowRoot);
                    walk(all[i].shadowRoot, depth + 1);
                }
            }
        }
        walk(el, 0);
        return roots;
    }

    function usable(el) {
        if (!el || el.disabled) return false;
        if (el.hasAttribute("data-nmc-clicked")) return false;
        /* getBoundingClientRect on a CSS-hidden banner is all zeros, which
           is fine — the listener still fires. We only skip detached nodes. */
        return el.isConnected !== false;
    }

    function scoreButton(el) {
        var label = NMC.labelOf(el);
        if (!label || label.length > 80) return 0;

        if (/reject\s+all|decline\s+all|deny\s+all|refuse\s+all|alle\s+ablehnen|tout\s+refuser|rechazar\s+todo|rifiuta\s+tutto/i.test(label)) {
            return 100;
        }
        if (D.REJECT_RE.test(label) && !D.ACCEPT_RE.test(label)) return 80;
        return 0;
    }

    function scoreCloseButton(el) {
        var label = NMC.labelOf(el);
        var aria = (el.getAttribute("aria-label") || "") + " " + NMC.nameBlob(el);
        if (D.CLOSE_RE.test(label.trim())) return 30;
        if (D.CLOSE_ATTR_RE.test(aria)) return 20;
        return 0;
    }

    function pickBest(root, scorer) {
        var roots = subRoots(root);
        var cands = NMC.deepQuery(CLICKABLE_SEL, roots);
        var best = null;
        var bestScore = 0;
        for (var i = 0; i < cands.length && i < 400; i++) {
            var el = cands[i];
            if (!usable(el)) continue;
            var s = scorer(el);
            if (s > bestScore) {
                bestScore = s;
                best = el;
            }
        }
        return best;
    }

    function clickIt(el, why) {
        if (!el) return false;
        el.setAttribute("data-nmc-clicked", why);
        var ok = NMC.click(el);
        if (ok) NMC.unlockScroll();
        return ok;
    }

    /* Try, in order: reject-all, the explicit selectors' fallback, the
       settings panel (which usually hides a reject-all), then close. */
    function dismiss(root, def) {
        var btn;

        if (def && def.reject) {
            var roots = subRoots(root);
            for (var i = 0; i < def.reject.length; i++) {
                var found = NMC.deepQuery(def.reject[i], roots);
                for (var j = 0; j < found.length; j++) {
                    if (usable(found[j])) return clickIt(found[j], "cmp-reject");
                }
            }
        }

        btn = pickBest(root, scoreButton);
        if (btn) return clickIt(btn, "reject");

        /* Some platforms bury "reject all" one level in. Open the panel and
           come back for a second look. */
        var key = (def && def.id) || "generic";
        if (!pendingSecondStage[key]) {
            var manage = pickBest(root, function (el) {
                var label = NMC.labelOf(el);
                return label && label.length < 60 && MANAGE_RE.test(label) ? 50 : 0;
            });
            if (manage) {
                pendingSecondStage[key] = true;
                clickIt(manage, "manage");
                setTimeout(function () {
                    var again = pickBest(document.documentElement, scoreButton);
                    if (again) clickIt(again, "reject-stage2");
                    /* Whether or not that worked, do not leave a settings
                       panel sitting open. */
                    if (def) hideRoots(def);
                }, 600);
                return true;
            }
        }

        btn = pickBest(root, scoreCloseButton);
        if (btn) return clickIt(btn, "close");

        return false;
    }

    function hideRoots(def) {
        var roots = NMC.collectRoots();
        for (var i = 0; i < def.roots.length; i++) {
            var found = NMC.deepQuery(def.roots[i], roots);
            for (var j = 0; j < found.length; j++) {
                NMC.hide(found[j], "cookie", def.id);
            }
        }
        NMC.unlockScroll();
    }

    function runKnown() {
        var roots = NMC.collectRoots();

        for (var i = 0; i < D.CMPS.length; i++) {
            var def = D.CMPS[i];
            if (handled[def.id]) continue;

            var root = null;
            for (var r = 0; r < def.roots.length; r++) {
                var found = NMC.deepQuery(def.roots[r], roots);
                if (found.length) {
                    root = found[0];
                    break;
                }
            }
            if (!root) continue;

            handled[def.id] = true;

            if (NMC.state.settings.autoReject) dismiss(root, def);
            hideRoots(def);
        }
    }

    /* No known platform, but the page is clearly asking about cookies. */
    function runGeneric() {
        if (genericTries >= MAX_GENERIC_TRIES) return;
        if (!NMC.state.settings.autoReject) return;

        var roots = NMC.collectRoots();
        var candidates = NMC.deepQuery(
            '[class*="cookie" i], [id*="cookie" i], [class*="consent" i], [id*="consent" i], [class*="gdpr" i], [id*="gdpr" i], [class*="privacy" i][class*="banner" i], dialog, [role="dialog"], [aria-modal="true"]',
            roots
        );

        for (var i = 0; i < candidates.length && i < 60; i++) {
            var el = candidates[i];
            if (el.hasAttribute("data-nmc-cmp-seen")) continue;
            if (el.matches(D.NEVER_SEL)) continue;

            var text = NMC.textOf(el, 3000);
            if (!hasCookieLanguage(text)) continue;

            /* Prefer the outermost container so the reject button is in scope. */
            el.setAttribute("data-nmc-cmp-seen", "1");
            genericTries++;

            var btn = pickBest(el, scoreButton);
            if (btn) {
                clickIt(btn, "generic-reject");
                NMC.hide(el, "cookie", "generic");
                return;
            }
        }
    }

    function hasCookieLanguage(text) {
        var strong = D.WORDS.cookie.strong;
        for (var i = 0; i < strong.length; i++) {
            if (text.indexOf(strong[i]) !== -1) return true;
        }
        return false;
    }

    /* A consent platform served in its own cross-origin iframe. Our content
       script runs in there, so the whole document is the banner. */
    function runFrame() {
        if (NMC.state.isTop) return;
        if (handled.__frame) return;
        if (!document.body) return;

        var isCmpHost = D.CMP_FRAME_RE.test(location.hostname);
        var text = NMC.textOf(document.body, 3000);
        if (!isCmpHost && !hasCookieLanguage(text)) return;

        handled.__frame = true;
        if (NMC.state.settings.autoReject) dismiss(document.body, { id: "frame" });
    }

    /* Called by the heuristics engine just before it hides something it
       classified itself. Hiding alone means the site asks again on the next
       page load, so answer the thing first where we safely can. */
    function tryDismiss(el, category) {
        if (!NMC.state.settings.autoReject) return false;
        if (!el || el.hasAttribute("data-nmc-cmp-seen")) return false;
        el.setAttribute("data-nmc-cmp-seen", "1");

        try {
            var btn = null;
            if (category === "cookie") btn = pickBest(el, scoreButton);
            /* For everything else only an unambiguous close control: an "X",
               a "No thanks", an aria-label that says dismiss. */
            if (!btn) btn = pickBest(el, scoreCloseButton);
            if (!btn) return false;
            return clickIt(btn, "heuristic-" + category);
        } catch (e) {
            return false;
        }
    }

    window.NMC_CMP = {
        tryDismiss: tryDismiss,
        run: function () {
            if (!NMC.categoryOn("cookie")) return;
            try {
                runFrame();
                runKnown();
                runGeneric();
            } catch (e) {
                /* Never let a broken page take the whole engine down. */
            }
        }
    };
})();

/*
 * NoMoreCookies — generic overlay detection.
 *
 * Selector lists age badly and never cover the hand-rolled newsletter modal
 * on someone's Shopify theme. This scores anything that *behaves* like an
 * interruption — floats above the page, arrived after load, covers content,
 * talks like a nag — and hides it once the evidence adds up.
 *
 * Scoring is deliberately conservative: geometry alone is never enough,
 * because sticky headers and cookie bars look identical to a layout engine.
 * In balanced mode something has to actually *say* it is a nag.
 */

(function () {
    "use strict";

    var NMC = window.NMC;
    var D = window.NMC_DATA;

    var CAND_SEL = [
        "dialog",
        '[role="dialog"]',
        '[role="alertdialog"]',
        '[aria-modal="true"]',
        '[class*="modal" i]',
        '[class*="popup" i]',
        '[class*="pop-up" i]',
        '[class*="overlay" i]',
        '[class*="interstitial" i]',
        '[class*="lightbox" i]',
        '[class*="takeover" i]',
        '[class*="banner" i]',
        '[class*="consent" i]',
        '[class*="cookie" i]',
        '[class*="gdpr" i]',
        '[class*="newsletter" i]',
        '[class*="subscribe" i]',
        '[class*="signup" i]',
        '[class*="sign-up" i]',
        '[class*="optin" i]',
        '[class*="opt-in" i]',
        '[class*="sticky" i]',
        '[class*="floating" i]',
        '[class*="promo" i]',
        '[class*="drawer" i]',
        '[class*="flyout" i]',
        '[class*="slide-in" i]',
        '[class*="toast" i]',
        '[class*="notification" i]',
        '[id*="modal" i]',
        '[id*="popup" i]',
        '[id*="overlay" i]',
        '[id*="consent" i]',
        '[id*="cookie" i]',
        '[id*="gdpr" i]',
        '[id*="newsletter" i]',
        '[id*="banner" i]',
        '[id*="subscribe" i]',
        '[id*="signup" i]',
        '[id*="interstitial" i]',
        '[id*="promo" i]',
        "body > *",
        "body > * > *",
        "body > * > * > *"
    ].join(",");

    /* Sites where a floating player is something the viewer asked for. */
    var VIDEO_HOST_RE =
        /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|netflix\.com|hulu\.com|max\.com|hbomax\.com|disneyplus\.com|primevideo\.com|tv\.apple\.com|spotify\.com|soundcloud\.com|dailymotion\.com|plex\.tv|jellyfin\.org)$/i;

    /* Categories where clicking the site's own dismiss control is safe and
       useful. Sticky ads are excluded: their "close" button is as often a
       click-through as a real one. */
    var DISMISSABLE = { cookie: true, news: true, app: true, adblock: true, video: true, login: true };

    /* Floating widgets are frequently built as an outer shell (background,
       border, drag handle, close button, branding) wrapping an inner frame
       that holds the actual player — and it's often the INNER frame that
       carries its own explicit position:fixed/sticky (commonly just to
       escape a parent's overflow:hidden), which is what evaluate() ends up
       matching. Hiding only that inner frame leaves the shell's empty box
       sitting in the corner — on a phone screen, a meaningful slice of the
       viewport for nothing. This walks up while an ancestor still looks
       like part of the same small floating thing, so the whole shell comes
       down with it.

       Deliberately not gated on the ancestor itself being positioned: only
       one element in a chain needs an explicit position for the rest to
       ride along with it, so requiring every level to repeat it would just
       make this walk stop one level too early on the sites that need it
       most. */
    function widenToShell(el) {
        var target = el;
        var vw = window.innerWidth || 1;
        var vh = window.innerHeight || 1;

        for (var up = 0; up < 4; up++) {
            var parent = target.parentElement;
            if (!parent || parent === document.body || parent === document.documentElement) break;

            var r;
            try {
                r = parent.getBoundingClientRect();
            } catch (e) {
                break;
            }
            var visW = Math.min(r.right, vw) - Math.max(r.left, 0);
            var visH = Math.min(r.bottom, vh) - Math.max(r.top, 0);
            var area = Math.max(0, Math.min(1, (visW * visH) / (vw * vh)));

            /* Still shaped like a small floating box, not a page section
               the video merely happens to sit inside. */
            if (area > 0.4) break;

            /* Never swallow anything holding real content or a meaningful
               amount of its own text (a close-button label or branding is
               fine; a page section's worth of copy is not). */
            try {
                if (parent.querySelector(D.CONTENT_GUARD_SEL)) break;
            } catch (e) {
                break;
            }
            if (NMC.textOf(parent, 400).length > 80) break;

            target = parent;
        }

        return target;
    }

    var started = Date.now();
    var earlySeen = new WeakSet();
    var firstSweepDone = false;

    function alphaOf(color) {
        var m = /^rgba?\(([^)]+)\)$/.exec(color || "");
        if (!m) return 0;
        var parts = m[1].split(",");
        return parts.length < 4 ? 1 : parseFloat(parts[3]);
    }

    function matchWords(text) {
        var order = ["adblock", "cookie", "login", "app", "push", "newsletter", "ads"];
        for (var i = 0; i < order.length; i++) {
            var key = order[i];
            var set = D.WORDS[key];
            var j;
            for (j = 0; j < set.strong.length; j++) {
                if (text.indexOf(set.strong[j]) !== -1) return { key: key, strength: 2 };
            }
        }
        for (var k = 0; k < order.length; k++) {
            var set2 = D.WORDS[order[k]];
            for (var n = 0; n < set2.weak.length; n++) {
                if (text.indexOf(set2.weak[n]) !== -1) return { key: order[k], strength: 1 };
            }
        }
        return null;
    }

    /* Keyword buckets map onto the six user-facing toggles. */
    function toCategory(key) {
        if (key === "push" || key === "newsletter") return "news";
        if (key === "cookie") return "cookie";
        if (key === "login") return "login";
        if (key === "app") return "app";
        if (key === "adblock") return "adblock";
        return "ads";
    }

    function hasCloseButton(el) {
        try {
            return !!el.querySelector(
                '[aria-label*="close" i], [aria-label*="dismiss" i], [class*="close" i], [id*="close" i], button[title*="close" i]'
            );
        } catch (e) {
            return false;
        }
    }

    function evaluate(el) {
        if (el.nodeType !== 1) return null;
        if (el.hasAttribute("data-nmc-hidden") || el.hasAttribute("data-nmc-allow")) return null;

        try {
            if (el.matches(D.NEVER_SEL)) return null;
            if (el.closest("[data-nmc-hidden], [data-nmc-allow]")) return null;
        } catch (e) {
            return null;
        }

        /* Google's One Tap card carries no readable text or name hint (its
           content lives in a cross-origin iframe), so it has to be caught
           by id before the generic, text-driven scoring below — and ahead
           of the visibility check, since the static cosmetic.css rule
           already display:none's it by the time this runs, which would
           otherwise make it invisible for evaluate()'s own purposes and
           leave it out of the "we blocked this" count. */
        try {
            if (el.matches(D.GOOGLE_ONETAP_SEL)) {
                /* Whichever of the two we were handed — the outer shell or
                   the iframe itself — hide the shell, so an iframe match
                   never leaves an empty container box sitting in the
                   corner. */
                var oneTapTarget = el.closest("#credential_picker_container") || el.parentElement || el;
                return { category: "login", score: 10, reason: "google one tap", target: oneTapTarget };
            }
        } catch (e) {
            /* ignore */
        }

        var cs;
        try {
            cs = getComputedStyle(el);
        } catch (e) {
            return null;
        }
        if (!NMC.isVisible(el, cs)) return null;

        var pos = cs.position;
        var role = el.getAttribute("role");
        var dialogish =
            (el.tagName === "DIALOG" && el.open) ||
            role === "dialog" ||
            role === "alertdialog" ||
            el.getAttribute("aria-modal") === "true";

        if (pos !== "fixed" && pos !== "sticky" && pos !== "absolute" && !dialogish) return null;

        var r;
        try {
            r = el.getBoundingClientRect();
        } catch (e) {
            return null;
        }

        var vw = window.innerWidth || 1;
        var vh = window.innerHeight || 1;
        if (r.width < 48 || r.height < 28) return null;
        if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return null;

        var visW = Math.min(r.right, vw) - Math.max(r.left, 0);
        var visH = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        var area = Math.max(0, Math.min(1, (visW * visH) / (vw * vh)));

        var z = parseInt(cs.zIndex, 10);
        if (isNaN(z)) z = 0;

        /* Absolutely positioned things are usually just layout. Only treat
           one as an overlay if it is both large and lifted. */
        if (pos === "absolute" && !dialogish && !(area >= 0.4 && z >= 50)) return null;

        /* Never touch anything wrapping the actual article. */
        try {
            if (el.querySelector(D.CONTENT_GUARD_SEL)) return null;
        } catch (e) {
            return null;
        }

        var text = NMC.textOf(el, 4000);

        /* Hard stop. An overlay that is selling access to the thing behind it
           is out of scope, and this check sits ahead of every other signal so
           no amount of scoring can route around it. */
        if (D.PAYWALL_RE.test(text)) return null;

        var name = NMC.nameBlob(el);
        var hostFloatOk = VIDEO_HOST_RE.test(location.hostname);

        var linkCount = 0;
        try {
            linkCount = el.querySelectorAll("a[href]").length;
        } catch (e) {
            /* ignore */
        }

        /* ---- special cases that stand on their own ---- */

        var hasVideo = false;
        var hasAd = false;
        try {
            hasVideo = !!el.querySelector(D.VIDEO_SEL);
            hasAd = !!el.querySelector(D.AD_SEL);
        } catch (e) {
            /* ignore */
        }

        /* "Fixed" is only one way a player docks. Plenty of sites — ABC
           News/Disney's player among them, going by its own class name
           ("StickyVideoPlayer") — use position:sticky instead, which floats
           the same way but respects its container's scroll bounds.
           position:sticky is not enough evidence on its own, though: an
           element keeps that computed style whether or not it is actually
           stuck right now, and plenty of sites use it for an ordinary
           in-article video that "sticks" pleasantly as you scroll past its
           own section — a look the reader chose, not a nag. So a sticky
           candidate only counts once it is either visibly pinned against a
           viewport edge (real, current evidence of floating) or the
           component's own name says what it is. */
        var stickyFloating =
            pos === "sticky" &&
            (r.top <= 4 || r.bottom >= vh - 4 || r.left <= 4 || r.right >= vw - 4 ||
                D.VIDEO_FLOAT_NAME_RE.test(NMC.normalizedName(el)));

        if ((pos === "fixed" || stickyFloating) && hasVideo && area < 0.4 && !hostFloatOk && text.length < 600) {
            return { category: "video", score: 10, reason: "floating player", target: widenToShell(el) };
        }

        if (hasAd && (area >= 0.5 || (pos === "fixed" && area < 0.4))) {
            return { category: "ads", score: 10, reason: "sticky ad" };
        }

        /* A full-page scrim with nothing in it: pure click blocker. */
        if (pos === "fixed" && area >= 0.85 && text.length < 24) {
            var a = alphaOf(cs.backgroundColor);
            if ((a > 0.02 && a < 0.99) || cs.backdropFilter !== "none" || cs.webkitBackdropFilter !== "none") {
                return { category: "ads", score: 10, reason: "click blocker" };
            }
        }

        /* ---- general scoring ---- */

        var m = matchWords(text);
        var score = 0;

        if (pos === "fixed") score += 2;
        else if (dialogish) score += 2;
        else score += 1;

        if (z >= 9999) score += 2;
        else if (z >= 1000) score += 1;

        if (area >= 0.5) score += 2;
        else if (area >= 0.15) score += 1;

        if (dialogish) score += 1;
        if (D.NAME_HINT_RE.test(name)) score += 2;
        if (hasCloseButton(el)) score += 1;
        if (firstSweepDone && !earlySeen.has(el)) score += 1;

        if (m) score += m.strength === 2 ? 4 : 1;

        /* Penalties for things that are probably site furniture. */
        if (linkCount > 12) score -= 3;
        if (text.length > 3000) score -= 2;
        try {
            if (el.querySelector("nav, header") && (!m || m.strength < 2)) score -= 2;
        } catch (e) {
            /* ignore */
        }

        var aggressive = NMC.state.settings.mode === "aggressive";

        if (m && m.strength === 2 && score >= 5) {
            return { category: toCategory(m.key), score: score, reason: m.key };
        }

        /* Without a keyword we need it to look unmistakably like a modal,
           and we only go that far when the user asked us to. */
        if (aggressive && score >= 7 && (pos === "fixed" || dialogish) && area > 0.02 && area < 0.97) {
            return { category: "ads", score: score, reason: "overlay" };
        }

        return null;
    }

    function collect() {
        var roots = NMC.collectRoots();
        var out = [];
        var seen = new Set();

        for (var i = 0; i < roots.length; i++) {
            var found;
            try {
                found = roots[i].querySelectorAll(CAND_SEL);
            } catch (e) {
                continue;
            }
            for (var j = 0; j < found.length && out.length < 800; j++) {
                var el = found[j];
                if (seen.has(el)) continue;
                seen.add(el);
                out.push(el);
            }
        }
        return out;
    }

    /* Blocking an ad request does not reclaim its space: the slot stays in
       the layout as a reserved gap. This walks the emptied slots and takes
       the smallest clearly-ad-named box around each one with it. */
    function collapseAdSlots() {
        if (!NMC.categoryOn("ads")) return;
        /* Slots legitimately measure zero until they fill, so give the honest
           ones time to arrive before calling one dead. */
        if (Date.now() - started < 2500) return;

        var slots = NMC.deepQuery(D.AD_SEL, NMC.collectRoots());

        for (var i = 0; i < slots.length && i < 200; i++) {
            var el = slots[i];
            if (el.hasAttribute("data-nmc-hidden") || el.hasAttribute("data-nmc-allow")) continue;
            if (el.closest("[data-nmc-hidden], [data-nmc-allow]")) continue;

            var r;
            try {
                r = el.getBoundingClientRect();
            } catch (e) {
                continue;
            }
            if (r.width > 4 && r.height > 4) continue; // it loaded; leave it

            var target = el;
            for (var up = 0; up < 3; up++) {
                var parent = target.parentElement;
                if (!parent || parent === document.body || parent === document.documentElement) break;
                if (!D.AD_WRAPPER_RE.test(NMC.nameBlob(parent))) break;
                /* Only swallow a wrapper that held the ad and nothing else. */
                if (NMC.textOf(parent, 200).length > 12) break;
                target = parent;
            }

            NMC.hide(target, "ads", "empty ad slot");
        }
    }

    function scan() {
        var els = collect();

        for (var i = 0; i < els.length; i++) {
            var el = els[i];

            var verdict;
            try {
                verdict = evaluate(el);
            } catch (e) {
                verdict = null;
            }
            if (!verdict) continue;
            if (!NMC.categoryOn(verdict.category)) continue;

            /* verdict.target is set when the scored element isn't the whole
               story — the video fast path hands back the outer shell it
               widened up to, so both the dismiss control and the hide land
               on the real container, not just the inner player frame. */
            var target = verdict.target || el;

            /* Prefer pressing the site's own "reject"/"close" control: that
               records a choice, so the nag does not come back, and a
               floating player returns to where it belongs. Hiding is the
               fallback, and happens either way. */
            if (DISMISSABLE[verdict.category]) {
                try {
                    window.NMC_CMP.tryDismiss(target, verdict.category);
                } catch (e) {
                    /* ignore */
                }
            }

            if (NMC.hide(target, verdict.category, verdict.reason)) {
                /* Anything that big was almost certainly holding the scroll
                   lock, and a floating player never is. */
                if (verdict.category !== "video") NMC.unlockScroll();
            }
        }

        try {
            collapseAdSlots();
        } catch (e) {
            /* ignore */
        }
    }

    /* Called on the very first pass so that whatever is already on screen at
       document_start is treated as part of the page, not as an intruder. */
    function baseline() {
        var els = collect();
        for (var i = 0; i < els.length; i++) earlySeen.add(els[i]);
        firstSweepDone = true;
    }

    window.NMC_HEUR = {
        scan: scan,
        baseline: baseline,
        evaluate: evaluate,
        collapseAdSlots: collapseAdSlots
    };
})();

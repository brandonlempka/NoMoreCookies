/*
 * NoMoreCookies — settings shape, shared by the background script and the
 * popup. content/core.js carries a duplicate of this object because content
 * scripts cannot import modules; change one, change the other.
 */

export const DEFAULTS = {
    enabled: true,
    mode: "balanced", // "balanced" | "aggressive"
    categories: {
        cookie: true,
        news: true,
        app: true,
        adblock: true,
        video: true,
        ads: true,
        login: true
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

export const CATEGORY_LABELS = {
    cookie: "Cookie & consent banners",
    news: "Email & notification pop-ups",
    app: "“Open in app” banners",
    adblock: "Anti-adblock walls",
    video: "Floating video players",
    ads: "Ads, interstitials & overlays",
    login: "Sign-in & registration walls"
};

export function mergeSettings(stored) {
    const s = {};
    for (const k of Object.keys(DEFAULTS)) {
        s[k] = stored && stored[k] !== undefined ? stored[k] : DEFAULTS[k];
    }
    s.categories = { ...DEFAULTS.categories, ...((stored && stored.categories) || {}) };
    return s;
}

export function normalizeHost(host) {
    return (host || "").toLowerCase().replace(/^www\./, "");
}

export function hostMatches(host, entry) {
    host = normalizeHost(host);
    entry = normalizeHost(entry);
    if (!host || !entry) return false;
    return host === entry || host.endsWith("." + entry);
}

export function isAllowlisted(host, list) {
    return (list || []).some((entry) => hostMatches(host, entry));
}

/*
 * NoMoreCookies — background script.
 *
 * Three jobs: answer sub-frames that need the top-level hostname, keep the
 * toolbar badge honest, and keep declarativeNetRequest in step with the
 * user's toggles and allowlist.
 */

import { DEFAULTS, mergeSettings, normalizeHost } from "./shared/defaults.js";

const api = globalThis.browser ?? globalThis.chrome;

const RULESETS = {
    consent: "blockConsentScripts",
    popups: "blockPopupScripts",
    ads: "blockAdNetworks",
    tracking: "blockTrackers"
};

/* Session rules that punch a hole in the blocklists for allowlisted sites. */
const ALLOW_RULE_BASE = 9000;

/* tabId -> (frameId -> hidden count), so the badge can total a page
   whose banners live in iframes. */
const counts = new Map();

async function getSettings() {
    try {
        return mergeSettings(await api.storage.local.get(null));
    } catch {
        return { ...DEFAULTS };
    }
}

/* ---------------------------------------------------------------- *
 * Badge
 * ---------------------------------------------------------------- */

async function paintBadge(tabId, count) {
    if (tabId === undefined || tabId === null) return;
    try {
        await api.action.setBadgeText({ tabId, text: count > 0 ? String(count) : "" });
        await api.action.setBadgeBackgroundColor({ tabId, color: "#2f6f4f" });
    } catch {
        /* iOS has no badge, and that is fine. */
    }
}

/* ---------------------------------------------------------------- *
 * declarativeNetRequest
 * ---------------------------------------------------------------- */

async function syncRulesets(settings) {
    const enable = [];
    const disable = [];
    for (const [id, key] of Object.entries(RULESETS)) {
        const on = settings.enabled && settings[key] !== false;
        (on ? enable : disable).push(id);
    }
    try {
        await api.declarativeNetRequest.updateEnabledRulesets({
            enableRulesetIds: enable,
            disableRulesetIds: disable
        });
    } catch (e) {
        console.warn("NoMoreCookies: could not update rulesets", e);
    }
}

async function syncAllowRules(settings) {
    /* One high-priority allowAllRequests rule per allowlisted host, so a
       site the user has excused is not touched at the network layer either.
       Older Safari builds reject allowAllRequests; losing this only means
       allowlisting is cosmetic-only, so a failure is not worth surfacing. */
    const rules = settings.allowlist.map((host, i) => ({
        id: ALLOW_RULE_BASE + i,
        priority: 100,
        action: { type: "allowAllRequests" },
        condition: {
            urlFilter: `||${normalizeHost(host)}^`,
            resourceTypes: ["main_frame", "sub_frame"]
        }
    }));

    try {
        const existing = await api.declarativeNetRequest.getSessionRules();
        await api.declarativeNetRequest.updateSessionRules({
            removeRuleIds: existing.map((r) => r.id),
            addRules: rules
        });
    } catch (e) {
        console.warn("NoMoreCookies: session allow rules unavailable", e);
    }
}

async function syncNetwork() {
    const settings = await getSettings();
    await syncRulesets(settings);
    await syncAllowRules(settings);
}

/* ---------------------------------------------------------------- *
 * Messaging
 * ---------------------------------------------------------------- */

api.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || !msg.type) return;

    switch (msg.type) {
        case "nmc:tophost": {
            /* sender.tab.url is the top-level page even when the message
               came from a cross-origin iframe. */
            let host = "";
            try {
                host = new URL(sender.tab?.url || "").hostname;
            } catch {
                /* ignore */
            }
            return Promise.resolve({ host });
        }

        case "nmc:count": {
            const tabId = sender.tab?.id;
            if (tabId === undefined) return;
            const frameCounts = counts.get(tabId) || new Map();
            frameCounts.set(sender.frameId ?? 0, msg.count);
            counts.set(tabId, frameCounts);

            let total = 0;
            for (const n of frameCounts.values()) total += n;
            paintBadge(tabId, total);
            return Promise.resolve({ ok: true });
        }

        case "nmc:getCount": {
            const frameCounts = counts.get(msg.tabId);
            let total = 0;
            if (frameCounts) for (const n of frameCounts.values()) total += n;
            return Promise.resolve({ count: total });
        }

        case "nmc:sync":
            return syncNetwork().then(() => ({ ok: true }));
    }
});

api.tabs.onRemoved.addListener((tabId) => counts.delete(tabId));

api.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading") {
        counts.delete(tabId);
        paintBadge(tabId, 0);
    }
});

api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const keys = Object.keys(changes);
    const netKeys = ["enabled", "allowlist", ...Object.values(RULESETS)];
    if (keys.some((k) => netKeys.includes(k))) {
        syncNetwork();
    }
});

api.runtime.onInstalled.addListener(async () => {
    const stored = await api.storage.local.get(null);
    /* Write defaults through on first run so the popup and the content
       scripts agree about what "unset" means. */
    await api.storage.local.set(mergeSettings(stored));
    syncNetwork();
});

syncNetwork();

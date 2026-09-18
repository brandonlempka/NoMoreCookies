/*
 * NoMoreCookies — popup controller.
 */

import { DEFAULTS, CATEGORY_LABELS, mergeSettings, normalizeHost, isAllowlisted } from "./shared/defaults.js";

const api = globalThis.browser ?? globalThis.chrome;

const CATEGORY_HINTS = {
    cookie: "Consent banners, GDPR/CCPA bars, privacy prompts",
    news: "Newsletter modals, discount pop-ups, notification nags",
    app: "Smart banners and “continue in the app” interstitials",
    adblock: "“Please disable your ad blocker” walls",
    video: "Players that detach and follow you down the page",
    ads: "Interstitial ads, sticky rails, click blockers",
    login: "“Sign in to continue” walls over free content"
};

const el = (id) => document.getElementById(id);

let settings = { ...DEFAULTS };
let tab = null;
let host = "";
let netDirty = false;
let reports = [];
let reportCategoryChecks = {};

/* ---------------------------------------------------------------- *
 * Loading
 * ---------------------------------------------------------------- */

async function activeTab() {
    try {
        const tabs = await api.tabs.query({ active: true, currentWindow: true });
        return tabs && tabs[0] ? tabs[0] : null;
    } catch {
        return null;
    }
}

async function askContent(message) {
    if (!tab) return null;
    try {
        return await api.tabs.sendMessage(tab.id, message);
    } catch {
        /* No content script on this page — chrome:// pages, the start page,
           PDFs, or a site the user has not granted access to. */
        return null;
    }
}

async function save(patch) {
    settings = { ...settings, ...patch };
    await api.storage.local.set(patch);
    await askContent({ type: "nmc:settingsChanged" });
}

/* ---------------------------------------------------------------- *
 * Site reports
 * ---------------------------------------------------------------- */

async function loadReports() {
    const stored = await api.storage.local.get("reports");
    reports = Array.isArray(stored.reports) ? stored.reports : [];
}

async function saveReports() {
    await api.storage.local.set({ reports });
}

function reportSummary(r) {
    const bits = [];
    if (r.stillBroken) bits.push("still broken");
    if (r.categories.length) bits.push(`still visible: ${r.categories.map((c) => CATEGORY_LABELS[c] || c).join(", ")}`);
    if (r.other) bits.push(`other: "${r.other}"`);
    return bits.length ? bits.join("; ") : "(no details)";
}

function reportText(r) {
    const date = new Date(r.createdAt).toLocaleDateString();
    return `${r.host} — ${reportSummary(r)} (reported ${date})`;
}

async function shareText(title, text) {
    if (navigator.share) {
        try {
            await navigator.share({ title, text });
            return;
        } catch {
            /* user cancelled the share sheet, or it's unavailable here */
            return;
        }
    }
    try {
        await navigator.clipboard.writeText(text);
        window.alert("Sharing isn't available here — copied to the clipboard instead.");
    } catch {
        /* nothing more we can do */
    }
}

/* ---------------------------------------------------------------- *
 * Rendering
 * ---------------------------------------------------------------- */

function renderCategories() {
    const box = el("categories");
    box.textContent = "";

    for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
        const row = document.createElement("label");
        row.className = "row";

        const text = document.createElement("span");
        text.className = "row-text";
        text.append(document.createTextNode(label));
        const small = document.createElement("small");
        small.textContent = CATEGORY_HINTS[key];
        text.append(small);

        const sw = document.createElement("span");
        sw.className = "switch";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = settings.categories[key] !== false;
        input.addEventListener("change", () => {
            save({ categories: { ...settings.categories, [key]: input.checked } });
        });
        const track = document.createElement("span");
        track.className = "track";
        track.setAttribute("aria-hidden", "true");
        sw.append(input, track);

        row.append(text, sw);
        box.append(row);
    }
}

function renderSite() {
    const off = isAllowlisted(host, settings.allowlist);
    el("site-host").textContent = host || "this page";
    el("site-toggle").checked = !off;
    el("site-state").textContent = !settings.enabled
        ? "Extension is off"
        : off
          ? "Excused — nothing is hidden here"
          : "Protected";
    document.body.classList.toggle("site-off", off);
    el("site-toggle").disabled = !settings.enabled || !host;
}

function renderBlocked(items) {
    const list = el("blocked-list");
    const head = el("blocked-head");
    const n = items.length;

    el("count").textContent = String(n);
    el("blocked-label").textContent =
        n === 0 ? "Nothing hidden yet" : n === 1 ? "1 thing hidden here" : `${n} things hidden here`;
    el("total").textContent =
        n === 0
            ? "This page has behaved itself so far"
            : `${n} interruption${n === 1 ? "" : "s"} hidden on this page`;

    list.textContent = "";
    for (const item of items) {
        const li = document.createElement("li");

        const what = document.createElement("span");
        what.className = "what";
        what.textContent = item.label || "(unnamed element)";
        what.title = item.label || "";

        const kind = document.createElement("span");
        kind.className = "kind";
        kind.textContent = item.category;

        const undo = document.createElement("button");
        undo.className = "undo";
        undo.textContent = "Show";
        undo.addEventListener("click", async () => {
            await askContent({ type: "nmc:restore", id: item.id });
            refreshBlocked();
        });

        li.append(what, kind, undo);
        list.append(li);
    }

    el("restore-all").hidden = n === 0;
    head.disabled = n === 0;
    if (n === 0) {
        head.setAttribute("aria-expanded", "false");
        list.hidden = true;
    }
}

function renderToggles() {
    el("enabled").checked = settings.enabled;
    el("autoReject").checked = settings.autoReject;
    el("unlockScroll").checked = settings.unlockScroll;
    el("aggressive").checked = settings.mode === "aggressive";
    el("blockConsentScripts").checked = settings.blockConsentScripts;
    el("blockPopupScripts").checked = settings.blockPopupScripts;
    el("blockAdNetworks").checked = settings.blockAdNetworks;
    el("blockTrackers").checked = settings.blockTrackers;
    document.body.classList.toggle("off", !settings.enabled);
    el("tagline").textContent = settings.enabled ? "Watching this page" : "Paused";
}

function renderReportForm() {
    el("report-host").textContent = host || "this site";
    el("report-still-broken").checked = false;
    el("report-other").value = "";
    reportCategoryChecks = {};

    const box = el("report-categories");
    box.textContent = "";
    for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
        const row = document.createElement("label");
        row.className = "row";

        const text = document.createElement("span");
        text.className = "row-text";
        text.textContent = label;

        const sw = document.createElement("span");
        sw.className = "switch";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = false;
        input.addEventListener("change", () => {
            reportCategoryChecks[key] = input.checked;
        });
        const track = document.createElement("span");
        track.className = "track";
        track.setAttribute("aria-hidden", "true");
        sw.append(input, track);

        row.append(text, sw);
        box.append(row);
    }
}

function renderReportsList() {
    const list = el("reports-list");
    const n = reports.length;
    const open = reports.filter((r) => !r.fixed);

    el("reports-count").textContent = String(n);
    el("reports-label").textContent = n === 0 ? "No reports yet" : n === 1 ? "1 report saved" : `${n} reports saved`;
    el("share-all").hidden = open.length === 0;

    list.textContent = "";
    for (const r of [...reports].sort((a, b) => b.createdAt - a.createdAt)) {
        const li = document.createElement("li");
        li.className = "report-row" + (r.fixed ? " fixed" : "");

        const meta = document.createElement("div");
        meta.className = "report-meta";
        meta.textContent = `${r.host} — ${new Date(r.createdAt).toLocaleDateString()}`;
        if (r.fixed) {
            const badge = document.createElement("span");
            badge.className = "fixed-badge";
            badge.textContent = "Fixed";
            meta.append(" ", badge);
        }

        const summary = document.createElement("div");
        summary.className = "report-summary";
        summary.textContent = reportSummary(r);

        const actions = document.createElement("div");
        actions.className = "report-actions";

        const shareBtn = document.createElement("button");
        shareBtn.className = "undo";
        shareBtn.textContent = "Share";
        shareBtn.addEventListener("click", () => shareText("NoMoreCookies report", reportText(r)));

        const fixBtn = document.createElement("button");
        fixBtn.className = "undo";
        fixBtn.textContent = r.fixed ? "Reopen" : "Mark fixed";
        fixBtn.addEventListener("click", async () => {
            r.fixed = !r.fixed;
            await saveReports();
            renderReportsList();
        });

        actions.append(shareBtn, fixBtn);
        li.append(meta, summary, actions);
        list.append(li);
    }
}

async function refreshBlocked() {
    const state = await askContent({ type: "nmc:getState" });
    if (state) {
        host = state.host || host;
        renderBlocked(state.items || []);
    } else {
        renderBlocked([]);
        el("total").textContent = "Not active on this page";
    }
    renderSite();
}

/* ---------------------------------------------------------------- *
 * Wiring
 * ---------------------------------------------------------------- */

function markNetDirty() {
    netDirty = true;
    el("reload-hint").hidden = false;
}

function wire() {
    el("enabled").addEventListener("change", async (e) => {
        await save({ enabled: e.target.checked });
        renderToggles();
        renderSite();
        markNetDirty();
        refreshBlocked();
    });

    el("site-toggle").addEventListener("change", async (e) => {
        const entry = normalizeHost(host);
        if (!entry) return;
        const list = settings.allowlist.filter((h) => normalizeHost(h) !== entry);
        if (!e.target.checked) list.push(entry);
        await save({ allowlist: list });
        renderSite();
        markNetDirty();
        refreshBlocked();
    });

    el("autoReject").addEventListener("change", (e) => save({ autoReject: e.target.checked }));
    el("unlockScroll").addEventListener("change", (e) => save({ unlockScroll: e.target.checked }));
    el("aggressive").addEventListener("change", (e) =>
        save({ mode: e.target.checked ? "aggressive" : "balanced" })
    );

    for (const key of ["blockConsentScripts", "blockPopupScripts", "blockAdNetworks", "blockTrackers"]) {
        el(key).addEventListener("change", async (e) => {
            await save({ [key]: e.target.checked });
            markNetDirty();
        });
    }

    el("blocked-head").addEventListener("click", () => {
        const head = el("blocked-head");
        const open = head.getAttribute("aria-expanded") === "true";
        head.setAttribute("aria-expanded", String(!open));
        el("blocked-list").hidden = open;
    });

    el("restore-all").addEventListener("click", async () => {
        await askContent({ type: "nmc:restoreAll" });
        refreshBlocked();
    });

    el("open-reports").addEventListener("click", async () => {
        await loadReports();
        renderReportForm();
        renderReportsList();
        el("settings-view").hidden = true;
        el("reports-view").hidden = false;
    });

    el("close-reports").addEventListener("click", () => {
        el("reports-view").hidden = true;
        el("settings-view").hidden = false;
    });

    el("report-save").addEventListener("click", async () => {
        const categories = Object.keys(reportCategoryChecks).filter((k) => reportCategoryChecks[k]);
        const stillBroken = el("report-still-broken").checked;
        const other = el("report-other").value.trim();
        if (!stillBroken && categories.length === 0 && !other) return;

        reports.push({
            id: crypto.randomUUID(),
            host: normalizeHost(host) || host || "unknown site",
            url: (tab && tab.url) || "",
            stillBroken,
            categories,
            other,
            createdAt: Date.now(),
            fixed: false
        });
        await saveReports();
        renderReportForm();
        renderReportsList();
    });

    el("share-all").addEventListener("click", () => {
        const open = reports.filter((r) => !r.fixed);
        if (!open.length) return;
        const text = ["NoMoreCookies — site reports", ...open.map(reportText)].join("\n");
        shareText("NoMoreCookies — site reports", text);
    });

    el("reload").addEventListener("click", async () => {
        if (tab) {
            try {
                await api.tabs.reload(tab.id);
            } catch {
                /* ignore */
            }
        }
        window.close();
    });
}

async function init() {
    settings = mergeSettings(await api.storage.local.get(null));
    tab = await activeTab();

    try {
        host = tab && tab.url ? new URL(tab.url).hostname : "";
    } catch {
        host = "";
    }

    renderToggles();
    renderCategories();
    renderSite();
    wire();
    await refreshBlocked();
}

init();

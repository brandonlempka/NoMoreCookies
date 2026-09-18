# NoMoreCookies

A Safari Web Extension that hides the things sites throw at you after the page
loads — cookie/consent banners, newsletter modals, “open in app” nags,
anti-adblock walls, floating video players and interstitial ads — and gives you
the scrollbar back when a modal takes it hostage.

One codebase, both platforms: **macOS Safari** and **Safari on iOS/iPadOS**.

---

## How it works

Three layers, fastest first.

**1. Network (`declarativeNetRequest`)** — 430 rules across four
independently toggleable lists:

| Ruleset | Rules | Covers |
| --- | --- | --- |
| `consent` | 74 | OneTrust, Cookiebot, Didomi, Quantcast, Usercentrics, Sourcepoint, TrustArc, Osano, … |
| `popups` | 71 | Privy, OptinMonster, Sumo, Justuno, Bounce Exchange, OneSignal, Branch smart banners, … |
| `ads` | 162 | Ad servers and exchanges, verification, native-ad widgets, video ad tech, mobile SDKs, pop/redirect adware |
| `tracking` | 123 | Product analytics, session replay, audience measurement, social pixels, CDP telemetry, fingerprinting |

When the script never loads, the banner never exists. The ad and tracking
rules deliberately **omit** `resourceTypes`: `declarativeNetRequest` then
defaults to "every type except `main_frame`", which is exactly the right
shape for ad blocking and avoids depending on how a given engine spells the
type names.

**2. Static CSS (`rules/cosmetic.css`)** — injected at `document_start`, so
known offenders never paint, not even for a frame. Every rule is gated behind a
class that only appears on `<html>` when a category is switched *off*, so the
default state — before async storage has even been read — is "everything
active". That ordering is the whole reason there is no flash of banner.

**3. Runtime engine (`content/`)** — for everything the first two layers miss:

| File | Job |
| --- | --- |
| `data.js` | Selector tables, 28 consent-platform definitions, keyword sets, reject/accept/close regexes |
| `core.js` | Settings, open-shadow-DOM traversal, hide/restore registry, scroll unlock, synthetic clicks |
| `cmp.js` | Finds a known CMP, clicks its *reject all*, falls back to opening the settings panel and rejecting there |
| `heuristics.js` | Scores anything that *behaves* like an interruption, widens to the outer shell before hiding it, and collapses ad slots the network layer emptied |
| `main.js` | Scheduling: MutationObserver, timed sweeps, scroll / exit-intent / visibility triggers |

### What the heuristics actually check

Geometry alone is never enough — a sticky header and a cookie bar look
identical to a layout engine. So the element must first pass a gate (floating
above the page, visible, sensibly sized, not wrapping `<main>`/`<article>`),
and then earn points from position, z-index, viewport coverage, dialog
semantics, id/class hints, having a close button, arriving after load, and —
weighted heaviest — *what it says*.

In **balanced** mode (default) something has to match a strong phrase like
“we use cookies”, “off your first order”, “open in app”, “disable your ad
blocker” or “sign in to continue”. **Aggressive** mode also hides unlabelled
overlays that score highly on structure alone.

Seven categories, each with its own switch: cookie banners, email/notification
pop-ups, app-install banners, anti-adblock walls, floating video players, ad
overlays, and sign-in/registration walls.

Three cases short-circuit the scoring because they are unambiguous: a fixed
small box containing a video player, a fixed element containing an ad slot, and
a full-page semi-transparent scrim with no text in it.

### Answering rather than just hiding

Hiding a cookie banner means the site asks again tomorrow. So before hiding
anything in a dismissable category the engine looks for the site's own control
and clicks it: *reject all* → *only necessary* → *continue without accepting* →
an unambiguous close/“no thanks”. It will never click a control whose label
reads as acceptance. Clicks are capped at 12 per frame.

The reject matcher covers English plus German, Spanish, French, Italian, Dutch,
Portuguese and the Nordic languages — you are in the US, but plenty of US-facing
sites ship an EU-built banner.

### Floating video: sticky, not just fixed, and the whole shell

Docking players don't all use `position: fixed`. Plenty — ABC News/Disney's
player among them, going by its own class name, `StickyVideoPlayer` — use
`position: sticky` instead, which floats the same way but respects its
container's scroll bounds. A `sticky` computed style is true whether or not
the element is actually pinned right now, though (an ordinary in-article video
can legitimately use `position: sticky` too, to stay in view while the reader
scrolls through its own section — that's the reader's choice, not a nag). So a
`sticky` candidate only counts once it's either visibly pinned against a
viewport edge — real, current evidence of floating — or the component's own
name says what it is, matched after normalizing camelCase/PascalCase class
names (`StickyVideoPlayer` → `sticky video player`) so hyphen-only matching
doesn't miss the CSS-Modules-style naming most modern sites actually ship.

Whatever gets matched this way is also frequently just the *inner* frame of a
two-part widget — a portal-style player often needs its own `position: fixed`
just to escape a parent's `overflow: hidden`, while a separate outer shell
owns the background, border, and close button. Hiding only the inner frame
leaves that shell sitting in the corner — on a phone, a meaningful slice of
the screen for an empty box. So before hiding, the engine walks up while an
ancestor still looks like part of the same small floating thing (comparably
sized, no content of its own worth mentioning), and hides the widest one that
qualifies — while refusing to widen past anything holding real page content,
so a coincidentally-fixed page-wide wrapper around a small video never gets
swallowed whole.

### Collapsing what the network layer leaves behind

Blocking an ad request does not reclaim its space — the slot stays in the
layout as a reserved gap. A second pass finds ad slots that came back empty
and walks up to the smallest clearly ad-named wrapper holding nothing else,
then hides that instead. It waits 2.5s first, because an honest slot also
measures zero until it fills.

### Where the line is

Sign-in and registration walls over otherwise-free content are in scope.
**Paywalls are not**, and that is enforced rather than merely omitted:
`PAYWALL_RE` in `content/data.js` runs in `evaluate()` ahead of every other
signal, so no amount of scoring routes around it. Nothing in this repo targets
publishers, blocks metering scripts, clears entitlement cookies or spoofs
referrers.

The fixture set makes the distinction concrete: it contains a login wall and a
paywall that are *structurally identical* — same position, size, z-index,
`role="dialog"`, same close button — differing only in their text. The login
wall is dismissed and hidden; the paywall is left alone and its button is never
pressed.

One honest gap: the generic "full-page scrim with no text in it" rule keys on
structure, so a paywall's separate backdrop element can still match it. Hiding
a backdrop does not reveal the article underneath, but it is not nothing.

### Escape hatches

Nothing is hidden silently. The popup lists everything hidden on the current
page with a **Show** button per item, a per-site off switch, and six category
toggles. Hidden media is paused, so a floating player that disappears does not
keep talking from off-screen.

---

## Building and installing

Open `NoMoreCookies.xcodeproj` in Xcode (the project is in Xcode 27's format,
so use Xcode 27 or newer) and run the **NoMoreCookies (macOS)** or
**NoMoreCookies (iOS)** scheme. Or from the command line:

```bash
xcodebuild -scheme "NoMoreCookies (macOS)" -configuration Debug -destination 'platform=macOS' build
```

### Turning it on — macOS

1. Run the macOS app once.
2. Safari → Settings → Extensions → enable **NoMoreCookies**.
   (Unsigned local builds also need Safari → Settings → Developer →
   *Allow unsigned extensions*, which resets each time Safari restarts.)
3. Set website access to **Allow on Every Website**.

### Turning it on — iOS / iPadOS

1. Run the iOS scheme on a device or simulator.
2. Settings → Apps → Safari → Extensions → **NoMoreCookies** → on.
3. Tap **All Websites** → **Allow**.

Website access matters more than it sounds: with per-site permission, Safari
prompts on every new domain and the banner wins the race while you decide.

---

## Layout

```
Shared (Extension)/Resources/
├── manifest.json            MV3
├── background.js            badge, ruleset sync, top-frame host lookup
├── shared/defaults.js       settings shape (background + popup)
├── content/                 data · core · cmp · heuristics · main
├── rules/
│   ├── cosmetic.css         static hide rules, category-gated
│   ├── dnr-consent.json     consent-platform hosts
│   ├── dnr-popups.json      pop-up / push / smart-banner hosts
│   ├── dnr-ads.json         ad servers, exchanges, video ad tech
│   └── dnr-tracking.json    analytics, session replay, pixels
├── popup.html/.css/.js      control panel
└── images/                  extension + toolbar icons
```

`content/core.js` carries a hand-copy of `DEFAULTS` because content scripts
cannot import modules. If you change the settings shape, change both.

---

## Known trade-offs

- **Consent-script blocking is on by default.** A handful of EU-focused sites
  gate their content on a consent response that now never happens. Turn the
  toggle off, or use the per-site switch, if a page comes up empty.
- **Closed shadow roots are invisible** to any extension. Every CMP checked
  here uses an open root; a closed one would need the static CSS layer to catch it.
- **`googletagmanager.com` is in the tracking list**, and it is the single
  most likely source of breakage: plenty of sites route non-analytics
  functionality through GTM. It is the first toggle to try when a page
  misbehaves.
- **No scriptlet layer.** Real blockers inject stubs (uBlock's `set-constant`
  and friends) so that page scripts expecting `window.adsbygoogle` or a
  Google Publisher Tag object do not throw once the network layer removes
  them. Doing that needs `MAIN`-world injection and is not implemented, so
  some sites will log errors.
- **`declarativeNetRequest`, not a Safari Content Blocker.** A native
  `WKContentRuleList` extension is the production route on Safari — WebKit
  compiles the rules, capacity runs to ~150k, and it supports
  `css-display-none` actions. It needs two more Xcode targets, which is more
  surgery than a proof of concept warrants. 430 DNR rules cover the volume.
- **Paywalls are out of scope**, by design and by guard. See *Where the line
  is* above.

## Testing

`content/` has no build step and no framework, so the quickest check is a
harness page: stub `window.browser`, load the five content scripts in manifest
order, inject fixtures after load, and assert on `data-nmc-hidden`. The fixture
set used during development covers both directions, up to 26 assertions
across hide/collapse/keep/click cases, including a two-part portal-style
player (outer chrome shell + inner fixed-position frame, both must go) next to
a big fixed wrapper that legitimately holds real content alongside an
unrelated small video (must survive whole). Give the page a real viewport; the
geometry gate reads
`innerWidth`/`innerHeight` and a zero-size viewport fails everything.

/*
 * NoMoreCookies — static data tables.
 *
 * Plain script (content scripts are not modules), so everything hangs off
 * one global in the extension's isolated world.
 */

window.NMC_DATA = (function () {
    "use strict";

    /* ------------------------------------------------------------ *
     * Known consent platforms.
     *
     * `roots` finds the banner, `reject` is tried in order and the first
     * match is clicked. Order inside `reject` goes from "reject
     * everything" to "only what's strictly necessary" to "just close it".
     * ------------------------------------------------------------ */
    var CMPS = [
        {
            id: "onetrust",
            roots: ["#onetrust-consent-sdk", "#onetrust-banner-sdk"],
            reject: [
                "#onetrust-reject-all-handler",
                ".ot-pc-refuse-all-handler",
                "#onetrust-pc-btn-handler + button",
                ".onetrust-close-btn-handler"
            ]
        },
        {
            id: "cookiebot",
            roots: ["#CybotCookiebotDialog"],
            reject: [
                "#CybotCookiebotDialogBodyButtonDecline",
                "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
                "#CybotCookiebotDialogBodyLevelButtonDecline"
            ]
        },
        {
            id: "quantcast",
            roots: [".qc-cmp2-container", ".qc-cmp-cleanslate"],
            reject: ['button[mode="secondary"]', ".qc-cmp2-summary-buttons > button:first-child"]
        },
        {
            id: "didomi",
            roots: ["#didomi-host", "#didomi-popup"],
            reject: [
                "#didomi-notice-disagree-button",
                ".didomi-continue-without-agreeing",
                "button.didomi-components-button--secondary"
            ]
        },
        {
            id: "trustarc",
            roots: ["#truste-consent-track", ".truste_overlay"],
            reject: ["#truste-consent-required", ".call", "#truste-consent-close"]
        },
        {
            id: "usercentrics",
            roots: ["#usercentrics-root", "#usercentrics-cmp-ui"],
            shadow: true,
            reject: [
                '[data-testid="uc-deny-all-button"]',
                "#deny",
                'button[data-action-type="deny"]'
            ]
        },
        {
            id: "osano",
            roots: [".osano-cm-window", ".osano-cm-dialog"],
            reject: [".osano-cm-denyAll", ".osano-cm-button--type_denyAll", ".osano-cm-deny"]
        },
        {
            id: "sourcepoint",
            roots: ['[id^="sp_message_container"]', ".sp_veil", "body.sp-message-open"],
            /* The real UI lives in a cross-origin iframe; our content script
               runs in there too and the generic text matcher handles it. */
            reject: ['button[title*="Reject" i]', 'button[title*="Disagree" i]']
        },
        {
            id: "cookieyes",
            roots: [".cky-consent-container", ".cky-modal"],
            reject: [".cky-btn-reject", '[data-cky-tag="reject-button"]']
        },
        {
            id: "complianz",
            roots: ["#cmplz-cookiebanner-container", ".cmplz-cookiebanner"],
            reject: [".cmplz-deny", ".cmplz-btn.cmplz-deny"]
        },
        {
            id: "termly",
            roots: ["#termly-code-snippet-support", ".t-consentPrompt"],
            reject: ['[data-tid="banner-decline"]', ".t-declineAllButton"]
        },
        {
            id: "borlabs",
            roots: ["#BorlabsCookieBox"],
            reject: ["[data-cookie-refuse]", "a.cookie-refuse", ".borlabs-cookie-refuse"]
        },
        {
            id: "iubenda",
            roots: ["#iubenda-cs-banner", ".iubenda-cs-container"],
            reject: [".iubenda-cs-reject-btn", ".iub-cmp-reject-btn"]
        },
        {
            id: "klaro",
            roots: [".klaro .cookie-notice", ".klaro .cookie-modal"],
            reject: [".cn-decline", ".cm-btn-decline", ".cm-btn-danger"]
        },
        {
            id: "cookiescript",
            roots: ["#cookiescript_injected"],
            reject: ["#cookiescript_reject", "#cookiescript_close"]
        },
        {
            id: "axeptio",
            roots: ["#axeptio_overlay", ".axeptio_widget"],
            reject: ["button#axeptio_btn_dismiss", "button.axeptio_btn_dismiss"]
        },
        {
            id: "consentmanager",
            roots: ["#cmpbox", "#cmpwrapper"],
            shadow: true,
            reject: [".cmpboxbtnno", ".cmpboxbtnnotxt", "#cmpbntnotxt"]
        },
        {
            id: "evidon",
            roots: ["#_evidon_banner", "#_evidon-barrier-wrapper"],
            reject: ["#_evidon-decline-button", "#_evidon-banner-declinebutton"]
        },
        {
            id: "fundingchoices",
            roots: [".fc-consent-root", ".fc-dialog-container"],
            reject: [".fc-cta-do-not-consent", ".fc-secondary-button"]
        },
        {
            id: "tarteaucitron",
            roots: ["#tarteaucitronRoot", "#tarteaucitronAlertBig"],
            reject: ["#tarteaucitronAllDenied2", "#tarteaucitronAllDenied"]
        },
        {
            id: "cookiehub",
            roots: ["#ch2", ".ch2-dialog"],
            reject: [".ch2-deny-all-btn", "#ch2-deny-all-btn"]
        },
        {
            id: "ketch",
            roots: ["#lanyard_root", "#ketch-consent-banner"],
            shadow: true,
            reject: ['button[aria-label*="Reject" i]', "#ketch-banner-button-secondary"]
        },
        {
            id: "moove",
            roots: ["#moove_gdpr_cookie_info_bar"],
            reject: [".moove-gdpr-infobar-reject-btn", ".mgbutton.moove-gdpr-infobar-reject-btn"]
        },
        {
            id: "cookielawinfo",
            roots: ["#cookie-law-info-bar"],
            reject: ["#wt-cli-reject-btn", ".cli_action_button[data-cli_action='reject']"]
        },
        {
            id: "cookieconsent",
            roots: ["#cc-main", ".cc-window"],
            reject: ['[data-role="necessary"]', ".cc-deny", ".cc-dismiss", "#cc-btn-necessary"]
        },
        {
            id: "cookiefirst",
            roots: ["[data-cookiefirst-widget]", ".cookiefirst-root"],
            reject: ['[data-cookiefirst-action="reject"]']
        },
        {
            id: "civic",
            roots: ["#ccc", "#ccc-overlay"],
            reject: ["#ccc-reject-settings", "#ccc-notify-reject"]
        },
        {
            id: "uniconsent",
            roots: ["#unic", ".unic-box"],
            reject: [".unic-reject-all", 'button[data-unic="reject"]']
        }
    ];

    /* ------------------------------------------------------------ *
     * Button text matching
     * ------------------------------------------------------------ */

    /* Phrases that mean "no". Deliberately phrase-heavy: a bare "no" or a
       lone "x" is far too easy to hit by accident. */
    var REJECT_RE = new RegExp(
        [
            "^(reject|decline|refuse|deny|disagree)\\b",
            "\\b(reject|decline|refuse|deny)\\s+(all|cookies|everything|non-essential)",
            "\\bonly\\s+(necessary|essential|required|technical|functional)",
            "\\b(necessary|essential|required|technical|functional)\\s+(cookies\\s+)?only",
            "\\buse\\s+necessary\\s+cookies\\s+only",
            "\\bcontinue\\s+without\\s+(agreeing|accepting)",
            "\\bwithout\\s+accepting",
            "\\bdo\\s+not\\s+(consent|accept|sell|share|agree)",
            "\\bdon'?t\\s+(accept|sell|share|agree)",
            "\\bopt\\s?-?\\s?out\\b",
            "\\breject\\s+non-?essential",
            // Non-English, common enough to be worth carrying.
            "alle\\s+ablehnen|^ablehnen|nur\\s+(notwendige|erforderliche)",
            "^rechazar|rechazar\\s+todo|solo\\s+(las\\s+)?necesarias",
            "^refuser|tout\\s+refuser|continuer\\s+sans\\s+accepter",
            "^rifiuta|rifiuta\\s+tutto|solo\\s+(i\\s+)?necessari",
            "^weigeren|alles\\s+weigeren|alleen\\s+noodzakelijke",
            "^recusar|^rejeitar|rejeitar\\s+tudo",
            "^neka|^avvisa|^afvis|nej\\s+tack"
        ].join("|"),
        "i"
    );

    /* Anything that looks like a yes. Used purely as a veto so that a
       string like "Accept all / Reject all" on one control is skipped. */
    var ACCEPT_RE = new RegExp(
        [
            "^(accept|agree|allow|ok|okay|got\\s+it|i\\s+(accept|agree|understand))\\b",
            "\\b(accept|allow|agree\\s+to)\\s+(all|cookies|everything)",
            "^(zustimmen|akzeptieren|alle\\s+akzeptieren)",
            "^(aceptar|aceptar\\s+todo)",
            "^(accepter|tout\\s+accepter)",
            "^(accetta|accetta\\s+tutto)",
            "^(aceitar|godkänn|acceptera)"
        ].join("|"),
        "i"
    );

    /* Close buttons, for pop-ups where there is nothing to reject. */
    var CLOSE_RE =
        /^(close|dismiss|×|✕|✖|⨯|x|no thanks?|no,? thanks?|not now|maybe later|later|skip|skip for now|not interested|continue to site|no gracias|nein danke|non merci)$/i;

    var CLOSE_ATTR_RE = /\b(close|dismiss|cancel|schließen|cerrar|fermer|chiudi)\b/i;

    /* ------------------------------------------------------------ *
     * Content keywords, split by how much they prove on their own.
     * ------------------------------------------------------------ */
    var WORDS = {
        cookie: {
            strong: [
                "we use cookies", "uses cookies", "use cookies", "using cookies",
                "cookie policy", "cookie settings", "cookie preferences",
                "cookie consent", "cookie notice", "manage cookies",
                "accept all cookies", "reject all cookies", "essential cookies",
                "necessary cookies", "third-party cookies", "third party cookies",
                "consent to the use of cookies", "your privacy choices",
                "privacy preferences", "manage consent", "consent preferences",
                "tracking technologies", "do not sell my personal",
                "do not sell or share", "legitimate interest",
                "store and/or access information on a device",
                "iab transparency", "tcf", "gdpr", "ccpa"
            ],
            weak: ["privacy policy", "personalised ads", "personalized ads", "our partners", "cookies"]
        },
        newsletter: {
            strong: [
                "subscribe to our newsletter", "sign up for our newsletter",
                "join our newsletter", "sign up for emails", "join our mailing list",
                "off your first order", "off your first purchase", "% off your order",
                "unlock 10%", "unlock 15%", "unlock 20%",
                "be the first to know", "stay in the loop", "join the list",
                "get exclusive offers", "welcome offer", "enter your email",
                "email signup", "subscribe now", "don't miss out"
            ],
            weak: ["newsletter", "subscribe", "email address", "sign up", "discount code", "coupon"]
        },
        app: {
            strong: [
                "open in app", "open in the app", "continue in app",
                "continue in the app", "get the app", "download our app",
                "download the app", "view in app", "better in the app",
                "use the app", "install our app", "switch to the app",
                "available on the app store", "get it on google play",
                "open in mobile app"
            ],
            weak: ["app store", "google play", "our app", "mobile app"]
        },
        adblock: {
            strong: [
                "ad blocker", "adblocker", "ad-blocker", "adblock",
                "disable your ad", "turn off your ad", "whitelist us",
                "whitelist our site", "allowlist our site", "allowlist us",
                "ads help us", "support us by disabling", "blocking our ads",
                "pause your ad blocker", "we noticed you're using"
            ],
            weak: ["advertising revenue", "support our journalism"]
        },
        push: {
            strong: [
                "allow notifications", "enable notifications", "browser notifications",
                "push notifications", "turn on notifications", "get notified",
                "receive notifications", "subscribe to notifications"
            ],
            weak: ["notifications"]
        },
        ads: {
            strong: ["advertisement", "sponsored content", "ads by", "advertise with us"],
            weak: ["sponsored", "promoted"]
        },
        login: {
            strong: [
                "sign in to continue", "log in to continue", "login to continue",
                "sign up to continue", "register to continue",
                "create a free account to continue", "create an account to continue",
                "sign in to see", "log in to see", "sign up to see more",
                "sign up to view", "log in to view", "join to view",
                "sign in to read", "log in to read", "register to keep reading",
                "continue reading with a free account", "log in or sign up",
                "you must be logged in", "sign in for the full experience",
                "create an account to see", "sign up to get the full"
            ],
            weak: ["sign in", "log in", "create an account", "register now", "continue with google"]
        }
    };

    /* Paid content. The engine leaves these alone: hiding the overlay on an
       article somebody is charging for is not blocking an annoyance, it is
       taking the article. Matched against an overlay's own text, so it wins
       over every other signal in evaluate(). */
    var PAYWALL_RE = new RegExp(
        [
            "(subscribe|subscription)\\s+to\\s+(continue|keep|read)",
            "continue\\s+reading\\s+with\\s+a\\s+subscription",
            "you'?(ve|\\s+have)?\\s*(reached|read|used)\\s+your",
            "\\d+\\s+free\\s+articles?",
            "free\\s+articles?\\s+(remaining|left)",
            "articles?\\s+left\\s+this\\s+month",
            "this\\s+(article|content|story|video)\\s+is\\s+for\\s+subscribers",
            "subscribers?[-\\s]only",
            "become\\s+a\\s+(member|subscriber)",
            "unlock\\s+(this|the\\s+full)\\s+(article|story|content)",
            "start\\s+your\\s+(free\\s+)?trial",
            "paywall",
            "premium\\s+(content|article|subscribers)",
            "\\$\\d+(\\.\\d+)?\\s*(/|per\\s+)\\s*(month|week|year)"
        ].join("|"),
        "i"
    );

    /* id / class fragments that suggest "this thing is an overlay". */
    var NAME_HINT_RE =
        /(^|[-_ ])(modal|popup|pop-up|overlay|interstitial|lightbox|dialog|takeover|slide-?in|flyout|drawer|toast|gate|curtain|veil|scrim|backdrop|banner|notice|consent|cookie|gdpr|ccpa|newsletter|subscribe|signup|sign-up|optin|opt-in|promo|offer|nag|prompt)([-_ ]|$)/i;

    /* If a candidate contains one of these it is page furniture, not an
       overlay, and we keep our hands off it. */
    var CONTENT_GUARD_SEL =
        'main, article, [role="main"], [role="article"], #main-content, #primary, .site-content, .post-content, .entry-content';

    /* Things that are never candidates, whatever they score. */
    var NEVER_SEL =
        "html, body, head, script, style, link, meta, title, noscript, template, svg, path, video, audio, canvas";

    /* Players that get re-parented into a floating shell. */
    var VIDEO_SEL =
        'video, iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="vimeo"], iframe[src*="dailymotion"], iframe[src*="brightcove"], iframe[src*="jwplayer"], iframe[src*="jwplatform"], iframe[src*="kaltura"], iframe[src*="wistia"], iframe[src*="vidyard"], iframe[src*="anyclip"], iframe[src*="connatix"], iframe[src*="vidazoo"], iframe[src*="primis"], .jwplayer, .video-js, .brightcove-player';

    /* Ad slots: used both by the sticky-rail heuristic and by the pass that
       collapses the empty boxes the network layer leaves behind. */
    var AD_SEL = [
        "ins.adsbygoogle",
        'iframe[id^="google_ads"]',
        'iframe[id^="aswift"]',
        'iframe[src*="doubleclick"]',
        'iframe[src*="googlesyndication"]',
        'iframe[src*="amazon-adsystem"]',
        'iframe[src*="adnxs"]',
        'iframe[src*="criteo"]',
        'iframe[src*="taboola"]',
        'iframe[src*="outbrain"]',
        'iframe[src*="teads"]',
        'iframe[src*="3lift"]',
        'iframe[src*="pubmatic"]',
        'iframe[src*="rubiconproject"]',
        '[id^="div-gpt-ad"]',
        '[id^="google_ads_iframe"]',
        "[data-ad-slot]",
        "[data-ad-client]",
        "[data-google-query-id]",
        "[data-adunit]",
        '[class*="taboola"]',
        '[class*="outbrain"]',
        '[class*="adsbygoogle"]',
        '[class*="gpt-ad" i]',
        '[class*="dfp-ad" i]',
        '[id*="dfp-ad" i]'
    ].join(", ");

    /* Wrappers worth collapsing once the slot inside them came back empty.
       Matched on whole id/class words so "gradient" or "loading" cannot
       accidentally read as "ad". */
    var AD_WRAPPER_RE =
        /(^|[-_ ])(ad|ads|adv|advert|advertisement|advertising|adslot|adunit|adbox|adwrap|adspace|ad-slot|ad-unit|ad-container|ad-wrapper|ad-holder|ad-placeholder|banner-ad|leaderboard|skyscraper|mpu|dfp|gpt|sponsored|sponsorship)([-_ ]|$)/i;

    /* Words that mean "this player is currently detached and floating",
       tested against a camelCase-normalized name so "StickyVideoPlayer"
       (Disney/ABC's own class name) reads the same as "sticky-video". Kept
       separate from NAME_HINT_RE: those words mean "this is a nag", these
       mean "this is a player that has left its place in the article", which
       is a different — and much narrower — claim. */
    var VIDEO_FLOAT_NAME_RE =
        /\b(sticky|floating|docked|dock|pinned|minivideo|miniplayer|pip)\b/i;

    /* Consent iframes whose origin alone is proof enough. */
    var CMP_FRAME_RE =
        /(cookielaw|onetrust|cookiebot|quantcast|consensu|privacy-mgmt|sp-prod|trustarc|usercentrics|osano|didomi|privacy-center|termly|iubenda|cookie-script|axept|consentmanager|evidon|fundingchoices|cookieyes|cookiehub|ketchcdn|sirdata|sddan)\./i;

    /* Google Identity Services' auto-shown "One Tap" sign-in card. Its
       whole UI lives inside a Google-hosted, cross-origin iframe, so there
       is no text or button on the parent page for the generic heuristics
       to key off — the container's own id is the only signal we get.
       Checked against the current accounts.google.com/gsi/client bundle:
       it builds `<div id="credential_picker_container">` on document.body
       holding `<iframe id="credential_picker_iframe" title="Sign in with
       Google Dialog">`. This only matches the unsolicited One Tap prompt,
       never a "Sign in with Google" button the site placed deliberately,
       which is a separate iframe with neither id. */
    var GOOGLE_ONETAP_SEL =
        '#credential_picker_container, iframe#credential_picker_iframe, iframe[title="Sign in with Google Dialog" i]';

    return {
        CMPS: CMPS,
        REJECT_RE: REJECT_RE,
        ACCEPT_RE: ACCEPT_RE,
        CLOSE_RE: CLOSE_RE,
        CLOSE_ATTR_RE: CLOSE_ATTR_RE,
        WORDS: WORDS,
        NAME_HINT_RE: NAME_HINT_RE,
        CONTENT_GUARD_SEL: CONTENT_GUARD_SEL,
        NEVER_SEL: NEVER_SEL,
        VIDEO_SEL: VIDEO_SEL,
        AD_SEL: AD_SEL,
        AD_WRAPPER_RE: AD_WRAPPER_RE,
        PAYWALL_RE: PAYWALL_RE,
        CMP_FRAME_RE: CMP_FRAME_RE,
        VIDEO_FLOAT_NAME_RE: VIDEO_FLOAT_NAME_RE,
        GOOGLE_ONETAP_SEL: GOOGLE_ONETAP_SEL,
        CATEGORIES: ["cookie", "news", "app", "adblock", "video", "ads", "login"]
    };
})();

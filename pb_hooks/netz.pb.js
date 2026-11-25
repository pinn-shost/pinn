// pb_hooks/netz.pb.js
// Protection for pinn. behind an own reverse proxy (since 1.152.0). The logic lives in pinn-netz.js.
//
// Requests from the internet (the visitor address is not in the home network, see pinn-netz.js) never reach:
//   /_/                                     the PocketBase administration (dashboard)
//   /api/collections/_superusers/...        sign-in and management of PocketBase superusers
//   /api/settings, /api/backups, /api/logs, /api/crons, /api/collections[/<name>], /api/collections/import
//                                           PocketBase administration interfaces (superusers only anyway)
//   /api/collections/<name>/auth-with-..., request-..., confirm-..., impersonate
//                                           PocketBase's own sign-in ways - pinn. signs in via /api/pinn/login and only
//                                           renews with auth-refresh, which stays allowed
// In the home network (and via Tailscale/WireGuard) everything stays as before.
// Answer: 403 with a short note. Security warning to the admins (pinn-alarm.js): at once for a sign-in attempt
// (POST to auth-with-…/request-…), otherwise after 10 refused requests from the same address within 10 minutes -
// single visits by bots that scan the internet do not cause a push.

routerUse((e) => {
    let path = "";
    try { path = String(e.request.url.path || ""); } catch (err) { return e.next(); }
    const admin = path === "/_" || path.indexOf("/_/") === 0;
    const pbApi = /^\/api\/(settings|backups|logs|crons)(\/|$)/.test(path) ||
        /^\/api\/collections\/?$/.test(path) ||
        /^\/api\/collections\/[^\/]+\/?$/.test(path) ||
        /^\/api\/collections\/_superusers(\/|$)/.test(path) ||
        /^\/api\/collections\/[^\/]+\/(auth-with-|request-|confirm-|impersonate)/.test(path);
    if (!admin && !pbApi) return e.next();
    let aussen = true;
    try { aussen = require(`${__hooks}/pinn-netz.js`).vonAussen(e); } catch (err) { aussen = true; }
    if (!aussen) return e.next();
    e.response.header().set("Cache-Control", "no-store");
    try {
        const alarm = require(`${__hooks}/pinn-alarm.js`);
        let post = false;
        try { post = String(e.request.method || "").toUpperCase() === "POST"; } catch (err) { post = false; }
        if (post && /\/(auth-with-|request-|confirm-|impersonate)/.test(path)) alarm.melde(e, "verwaltung", { extra: "Anmeldeversuch: " + path });
        else alarm.zaehleUndMelde(e, "verwaltung", 10, 10 * 60 * 1000);
    } catch (err) { /* ignore */ }
    if (admin) return e.string(403, "pinn.: Die PocketBase-Verwaltung ist nur im Heimnetz erreichbar.");
    return e.json(403, { status: 403, message: "Nur im Heimnetz erreichbar.", data: {} });
});

// Check for admins (since 1.165.1): how does pinn. see the device that asks - home network or internet?
// Settings → Admin → System → "Access from outside". Behind an own reverse proxy that does not pass on the real
// visitor (or with Docker's userland proxy) every visitor looks like the home network - then the protection above
// does not work. The admin tests it once on the phone without Wi-Fi.
//   GET /api/pinn/netz/pruefen -> { adresse, intern, proxy: { gesetzt, wert } }
routerAdd("GET", "/api/pinn/netz/pruefen", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isAdmin(e)) return e.json(403, { error: "Nur für Admins." });
    const n = require(`${__hooks}/pinn-netz.js`);
    const ip = n.visitor(e);
    let wert = "";
    try { wert = String($os.getenv(n.ENV_NETZE) || "").trim(); } catch (err) { wert = ""; }
    e.response.header().set("Cache-Control", "no-store");
    return e.json(200, { adresse: n.ipText(ip), intern: !!ip && n.isIntern(ip), proxy: { gesetzt: !!wert, wert: wert.slice(0, 200) } });
}, $apis.requireAuth("benutzer"));

// Protection against embedding (since 1.165.1): pinn. may only be shown inside a frame of its own pages (e.g. the PDF
// view). A foreign web page could otherwise load pinn. invisibly and catch clicks ("clickjacking").
// Whoever wants to show pinn. in Home Assistant (webpage card) or a similar page names its address in the
// environment value PINN_EINBETTEN (space or comma separated, e.g. "http://192.168.1.10:8123 https://ha.example.org").
routerUse((e) => {
    const extra = [];
    let raw = "";
    try { raw = String($os.getenv("PINN_EINBETTEN") || ""); } catch (err) { raw = ""; }
    raw.split(/[\s,]+/).forEach(x => {
        const v = x.trim().replace(/\/+$/, "");
        if (/^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(v) || /^https?:\/\/\[[0-9A-Fa-f:]+\](:\d{1,5})?$/.test(v)) extra.push(v);
    });
    try {
        const h = e.response.header();
        h.set("Content-Security-Policy", "frame-ancestors 'self'" + (extra.length ? " " + extra.join(" ") : ""));
        if (!extra.length) h.set("X-Frame-Options", "SAMEORIGIN");
        if (!h.get("X-Content-Type-Options")) h.set("X-Content-Type-Options", "nosniff");
    } catch (err) { /* ignore */ }
    return e.next();
});

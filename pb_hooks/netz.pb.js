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

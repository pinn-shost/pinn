// pb_hooks/pinn-kinderschutz.js
// Not a *.pb.js file -> not loaded as a hook automatically, only pulled in via require().
//
// Kids' page only (since 1.165.1): a profile whose member is set to "kids' page only" signs in at the family
// dashboard without PIN and password. Until now only the app limited such a profile to the kids' page - the
// sign-in itself was a full member sign-in. Whoever stood at the tablet and knew a little technology could use it
// to read documents, contracts, finances, locations or health data through the interface.
//
// Now the server limits these profiles itself (kinderschutz.pb.js): only what the kids' page needs is allowed,
// everything else is answered with 403. The list is deliberately short ("closed by default"): new routes are
// blocked for kids-only profiles until they are added here on purpose.
//
// Allowed for kids-only profiles:
//   everything outside /api/ (the app itself, pictures, service worker)
//   /api/health
//   renewing the sign-in (auth-refresh), reading profiles and the family name
//   the family areas (/api/pinn/bereiche…) - the old family record (familien_daten) is dissolved since 1.166.0
//   /api/pinn/save (only answers "nothing to do" since 1.166.0), stars and rewards, birthdays, reminders/push, weather, time, design, language status
//   /api/pinn/kassen (load only - the server sends nothing but the child's own pocket money, see pinn-kassen.js)
//   the dashboard routes of the device (profile selection, back to the dashboard) and the own sessions (sign out)
//   files (/api/files/…) but no file token - protected files (documents, receipts) stay closed
// Not allowed, for example: documents, contracts, pinboard photos, finances and bookings, location, health, chats,
// settings, AI, set-up, administration and live updates (/api/realtime - would deliver changes of other collections).

const CACHE_PREFIX = "pinnKidsOnly:";
const CACHE_MS = 30 * 1000;

// Exact paths (any method unless noted in METHODS)
const EXACT = {
    "/api/health": true,
    "/api/collections/benutzer/auth-refresh": true,
    "/api/pinn/save": true,
    "/api/pinn/kassen": true,
    "/api/pinn/aufgaben/belohnung": true,
    "/api/pinn/zeit": true,
    "/api/pinn/design": true,
    "/api/pinn/sprache/status": true,
    "/api/pinn/system/status": true,
    "/api/pinn/einrichtung/offen": true,
    "/api/pinn/familie": true,
    "/api/pinn/login": true,
    "/api/pinn/password": true,
};
// Path prefixes (a prefix ends with "/" or is followed by "/" or the end of the path)
const PREFIXES = [
    "/api/pinn/bereiche",
    "/api/pinn/push",
    "/api/pinn/geburtstag",
    "/api/pinn/geburtstage",
    "/api/pinn/zuhause/wetter",
    "/api/pinn/zuhause/wetter-tag",
    "/api/pinn/dashboard",
    "/api/pinn/sitzungen",
];
// Collections: allowed methods
const COLLECTIONS = {
    benutzer: { GET: true },
    familien: { GET: true },
};

function hasPrefix(path, prefix) {
    return path === prefix || path.indexOf(prefix + "/") === 0;
}

// true = a kids-only profile may use this request
function allowed(method, path) {
    const p = String(path || "");
    const m = String(method || "GET").toUpperCase();
    if (p.indexOf("/api/") !== 0 && p !== "/api") return true;
    if (m === "OPTIONS" || m === "HEAD") return true;
    if (EXACT[p]) return true;
    for (let i = 0; i < PREFIXES.length; i++) if (hasPrefix(p, PREFIXES[i])) return true;
    const col = /^\/api\/collections\/([^\/]+)\/records(\/[^\/]+)?\/?$/.exec(p);
    if (col) {
        const rights = COLLECTIONS[col[1]];
        return !!(rights && rights[m]);
    }
    // Files: yes (pictures of the family), but never a token for protected files
    if (p.indexOf("/api/files/") === 0) return m === "GET" && p.indexOf("/api/files/token") !== 0;
    return false;
}

// Is the signed-in profile a kids-only profile? Cached for 30 s per profile, so that not every request reads the
// family members (a change in the settings applies after at most 30 s).
function isKidsOnly(user) {
    if (!user) return false;
    let role = "";
    try { role = user.getString("rolle") || "mitglied"; } catch (e) { return false; }
    if (role !== "mitglied") return false;
    let id = "";
    try { id = user.id; } catch (e) { id = ""; }
    if (!id) return false;
    const now = Date.now();
    try {
        const raw = String($app.store().get(CACHE_PREFIX + id) || "");
        const bar = raw.indexOf("|");
        if (bar > 0 && now - (parseInt(raw.slice(bar + 1), 10) || 0) < CACHE_MS) return raw.slice(0, bar) === "1";
    } catch (e) { /* no cache */ }
    let kids = false;
    try { kids = require(`${__hooks}/pinn-dashboard.js`).kidsOnlyProfile(user); } catch (e) { kids = false; }
    try { $app.store().set(CACHE_PREFIX + id, (kids ? "1" : "0") + "|" + now); } catch (e) { /* ignore */ }
    return kids;
}

// Middleware check: returns true if the request has to be refused
function refuse(e) {
    if (!e || !e.auth) return false;
    let isUser = false;
    try { isUser = e.auth.collection().name === "benutzer"; } catch (err) { isUser = false; }
    if (!isUser) return false;
    let path = "", method = "GET";
    try { path = String(e.request.url.path || ""); } catch (err) { path = ""; }
    try { method = String(e.request.method || "GET"); } catch (err) { method = "GET"; }
    if (allowed(method, path)) return false;
    return isKidsOnly(e.auth);
}

// Only the child's own pocket money from the finance data of a fund (recurring pocket money, balance
// settings and the child's own entries) - nothing else of the fund
function kidFinanceView(data, memberId) {
    const d = data && typeof data === "object" && !Array.isArray(data) ? data : {};
    const arr = (x) => Array.isArray(x) ? x : [];
    const mid = String(memberId || "");
    if (!mid) return { recurring: [], pocketMoney: [], pocketLedger: [] };
    return {
        recurring: arr(d.recurring).filter(r => r && r.allowanceFor === mid),
        pocketMoney: arr(d.pocketMoney).filter(p => p && p.id === mid),
        pocketLedger: arr(d.pocketLedger).filter(l => l && l.kid === mid),
    };
}

module.exports = { allowed, isKidsOnly, refuse, kidFinanceView };

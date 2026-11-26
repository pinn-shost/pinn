// pb_hooks/pinn-alarm.js
// Security warnings to the admins (since 1.152.0).
//
// Whenever somebody tries to get around a protection or to guess something, pinn. blocks or ignores it as before - and
// in addition the admins get a push "🚨 Security warning" with what is known about the visitor, plus an entry in the
// error log (area "sicherheit") with all details.
//
// Kinds (art):
//   ipsperre       many wrong sign-ins from one address -> address locked                       (whole server)
//   profilsperre   too many wrong passwords for one profile -> profile locked                    (its family)
//   pinsperre      too many wrong PINs/passwords on a family dashboard -> profile locked          (its family)
//   startpasswort  sign-in with the start password "Admin" from the internet -> refused          (profile's family)
//   verwaltung     PocketBase administration / admin interfaces from the internet -> refused      (whole server)
//   ortung         many location reports with unknown device IDs -> address ignored for an hour   (whole server)
//   schluessel     many invalid access keys (dashboard, widget, smart home) from the internet     (whole server)
//
// Who is warned: for a family's matter the admins of that family and the main admin; for the whole server the main
// admin and the admins of every family. Pushes of the whole server contain no family or profile names (several
// households may share one server) - those are only in the error log, which only the main admin sees for entries
// without a family.
//
// What is known about the visitor (nothing is looked up on other servers - no location by address, no name lookup):
//   address (IPv4 or IPv6, and the /64 network), home network or internet, the direct sender (e.g. the proxy) and
//   X-Forwarded-For, browser identifier (and a readable "iPhone · Safari"), device name sent by the pinn. app, browser
//   language, Origin/Referer, method and path, target (family/profile/dashboard device), number of attempts. For
//   internet addresses the log names a page where the admin can look the address up himself.
//
// Not too many pushes: per kind, address and family at most one push per hour (RUHE_MS), on the whole server at most
// MAX_PRO_STUNDE pushes per hour. The error log entry is always written (pinn-protokoll.js combines repeats).

const PREFIX = "pinnAlarm:";
const RUHE_MS = 60 * 60 * 1000;
const MAX_PRO_STUNDE = 20;
const ZAEHL_PREFIX = "pinnAlarmZaehler:";

// German message per kind (pinn-pushtext.js translates them for the recipient)
const SATZ = {
    ipsperre: () => "Viele falsche Anmeldeversuche von einer Adresse – sie ist vorübergehend gesperrt.",
    profilsperre: (o) => "Zu viele falsche Passwörter für „" + o.profil + "“. Das Profil ist vorübergehend gesperrt – die Sperre lässt sich unter Konto → Profile verwalten aufheben.",
    pinsperre: (o) => "Zu viele falsche PINs für „" + o.profil + "“ am Familien-Dashboard – das Profil ist vorübergehend gesperrt.",
    startpasswort: () => "Jemand hat versucht, sich aus dem Internet mit dem Start-Passwort anzumelden – abgewiesen.",
    verwaltung: () => "Zugriffsversuche auf die PocketBase-Verwaltung aus dem Internet – abgewiesen.",
    ortung: () => "Viele Ortungsmeldungen mit unbekannten Geräte-IDs – die Adresse wird 1 Stunde ignoriert.",
    schluessel: () => "Viele ungültige Zugangsschlüssel (Familien-Dashboard, Widget oder Smart Home) von einer Adresse – abgewiesen.",
};
const TITEL = "🚨 Sicherheitswarnung";
const TITEL_PROFIL = "🔒 Anmeldung gesperrt"; // kept for the profile lock (known title since 1.140)

function header(e, name) {
    try { return String(e.request.header.get(name) || ""); } catch (err) { return ""; }
}
function clean(s, max) {
    return String(s || "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max || 300);
}
function store() { try { return $app.store(); } catch (e) { return null; } }
function sGet(k) { const s = store(); try { return s ? s.get(k) : null; } catch (e) { return null; } }
function sSet(k, v) { const s = store(); try { if (s) s.set(k, v); } catch (e) { /* ignore */ } }

// Everything that is known about the visitor of a request
function besucher(e) {
    const out = { ip: "", netz: "", aussen: true, peer: "", xff: "", agent: "", geraet: "", appGeraet: "", sprache: "", origin: "", referer: "", methode: "", pfad: "" };
    if (!e) return out;
    try {
        const n = require(`${__hooks}/pinn-netz.js`);
        out.ip = n.clientIp(e);
        out.netz = n.sperrSchluessel(e);
        out.aussen = n.vonAussen(e);
    } catch (err) { /* keep defaults */ }
    try { out.peer = String(e.remoteIP() || ""); } catch (err) { out.peer = ""; }
    out.xff = clean(header(e, "X-Forwarded-For"), 300);
    out.agent = clean(header(e, "User-Agent"), 400);
    try { out.geraet = require(`${__hooks}/pinn-sitzungen.js`).nameFromAgent(out.agent); } catch (err) { out.geraet = ""; }
    let app = header(e, "X-Pinn-Geraet");
    try { app = decodeURIComponent(app); } catch (err) { /* leave as is */ }
    out.appGeraet = clean(app, 100);
    out.sprache = clean(header(e, "Accept-Language").split(",")[0], 40);
    out.origin = clean(header(e, "Origin"), 200);
    out.referer = clean(header(e, "Referer"), 200);
    try { out.methode = String(e.request.method || ""); } catch (err) { out.methode = ""; }
    try { out.pfad = clean(String(e.request.url.path || ""), 200); } catch (err) { out.pfad = ""; }
    return out;
}

function adresseZeile(b) {
    const ip = b.netz && b.netz !== b.ip ? b.ip + " – " + b.netz : (b.ip || "?");
    return "Adresse: " + ip + (b.aussen ? " (aus dem Internet)" : " (Heimnetz)");
}
function details(b, o, art) {
    const z = [];
    z.push("Art: " + art);
    z.push("Zeit: " + new Date().toISOString());
    z.push(adresseZeile(b));
    if (b.peer && b.peer !== b.ip) z.push("Direkter Absender (Proxy): " + b.peer);
    if (b.xff) z.push("X-Forwarded-For: " + b.xff);
    if (b.geraet) z.push("Gerät: " + b.geraet);
    if (b.appGeraet) z.push("Gerätename aus der App: " + b.appGeraet);
    if (b.agent) z.push("Browser-Kennung: " + b.agent);
    if (b.sprache) z.push("Sprache: " + b.sprache);
    if (b.origin) z.push("Origin: " + b.origin);
    if (b.referer) z.push("Referer: " + b.referer);
    if (b.pfad) z.push("Anfrage: " + (b.methode ? b.methode + " " : "") + b.pfad);
    if (o.familieName) z.push("Familie: " + o.familieName);
    if (o.profil) z.push("Profil: " + o.profil);
    if (o.geraetName) z.push("Familien-Dashboard: " + o.geraetName);
    if (o.anzahl) z.push("Versuche: " + o.anzahl);
    if (o.extra) z.push(String(o.extra));
    if (b.aussen && b.ip) z.push("Selbst nachschlagen (öffnet eine fremde Seite): https://www.abuseipdb.com/check/" + encodeURIComponent(b.ip));
    return z.join("\n");
}

function familieName(id) {
    if (!id) return "";
    try { return $app.findRecordById("familien", id).getString("name"); } catch (e) { return ""; }
}
// Admins to warn: family -> its admins + main admins; whole server -> main admins + every family admin
function empfaenger(familie) {
    let recs = [];
    try {
        recs = familie
            ? $app.findRecordsByFilter("benutzer", "(familie = {:f} && rolle = 'admin') || rolle = 'hauptadmin'", "", 0, 0, { f: familie })
            : $app.findRecordsByFilter("benutzer", "rolle = 'admin' || rolle = 'hauptadmin'", "", 0, 0);
    } catch (e) { recs = []; }
    return recs.map(r => r.id);
}

// Limits for pushes: true = this push may go out (and is counted)
function pushErlaubt(art, b, familie) {
    const now = Date.now();
    const k = PREFIX + art + ":" + (b.netz || b.ip || "?") + ":" + (familie || "");
    const last = parseInt(String(sGet(k) || "0"), 10) || 0;
    if (now - last < RUHE_MS) return false;
    const h = String(sGet(PREFIX + "stunde") || "").split("|");
    let start = parseInt(h[0], 10) || 0;
    let n = parseInt(h[1], 10) || 0;
    if (now - start > RUHE_MS) { start = now; n = 0; }
    if (n >= MAX_PRO_STUNDE) return false;
    sSet(PREFIX + "stunde", start + "|" + (n + 1));
    sSet(k, String(now));
    return true;
}

// Report a security event.
//   e     request (for the visitor details; may be null)
//   art   kind, see the head of this file
//   opts  { familie, profil, geraetName, anzahl, extra, url }
function melde(e, art, opts) {
    const o = Object.assign({}, opts || {});
    if (!SATZ[art]) return;
    const b = besucher(e);
    const familie = String(o.familie || "");
    o.familieName = familieName(familie);
    o.profil = clean(o.profil, 60);
    o.geraetName = clean(o.geraetName, 60);
    const satz = SATZ[art](o);

    // 1. Error log (always)
    try {
        require(`${__hooks}/pinn-protokoll.js`).warnung("sicherheit", satz + " " + adresseZeile(b), { familie: familie, details: details(b, o, art) });
    } catch (err) {
        console.log("[Sicherheit] " + satz + " " + adresseZeile(b));
    }

    // 2. Push to the admins (limited)
    if (!pushErlaubt(art, b, familie)) return;
    const zeilen = [satz, adresseZeile(b)];
    if (b.geraet) zeilen.push("Gerät: " + b.geraet);
    if (o.anzahl) zeilen.push("Versuche: " + o.anzahl);
    zeilen.push("Alle Angaben im Fehlerprotokoll (Sicherheit).");
    let push = null;
    try { push = require(`${__hooks}/pinn-push.js`); } catch (err) { return; }
    empfaenger(familie).forEach(id => {
        try {
            push.notifyUser(id, {
                titel: art === "profilsperre" ? TITEL_PROFIL : TITEL,
                text: zeilen.join("\n"),
                url: o.url || "/?protokoll=sicherheit",
                tag: "sicherheit-" + art + "-" + (familie || "server"),
                urgency: "high",
            });
        } catch (err) { /* ignore */ }
    });
}

// Count a suspicious attempt of the visitor; returns the count when it reaches "max" within "fensterMs"
// (then the counting starts again), otherwise 0. Only counts requests from the internet unless opts.auchInnen.
function zaehle(e, art, max, fensterMs, opts) {
    let key = "";
    try {
        const n = require(`${__hooks}/pinn-netz.js`);
        if (!(opts && opts.auchInnen) && !n.vonAussen(e)) return 0;
        key = n.sperrSchluessel(e);
    } catch (err) { return 0; }
    if (!key) return 0;
    const now = Date.now();
    const k = ZAEHL_PREFIX + art + ":" + key;
    const p = String(sGet(k) || "").split("|");
    let c = parseInt(p[0], 10) || 0;
    let ab = parseInt(p[1], 10) || 0;
    if (now - ab > fensterMs) { c = 0; ab = now; }
    c++;
    if (c >= max) { sSet(k, "0|" + now); return c; }
    sSet(k, c + "|" + ab);
    return 0;
}
// Count and report when the limit is reached (helper for the places that only want a warning)
function zaehleUndMelde(e, art, max, fensterMs, opts) {
    const n = zaehle(e, art, max, fensterMs, opts);
    if (n) melde(e, art, Object.assign({ anzahl: n }, opts || {}));
    return n;
}

module.exports = { melde, zaehle, zaehleUndMelde, besucher };

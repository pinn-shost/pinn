// pb_hooks/pinn-sicherabruf.js
// Not a *.pb.js file -> not loaded as a hook automatically, only pulled in via require().
//
// Safe fetching of addresses that a user typed in (since 1.165.1): recipe links and recipe images (pinn-ki.js),
// links of the waste calendar (pinn-muell.js).
//
// Why: the server must never be used to reach devices in the home network (router, NAS, cameras, Home Assistant …).
// Until now only the NAME in the link was checked. Two ways round that:
//   1. a public name that points to a home address (e.g. "192.168.1.1.nip.io" or an own DNS entry)
//   2. a public page that answers with a redirect to a home address - PocketBase's $http.send follows redirects
//      on its own and cannot be told not to
// What happens now:
//   - Every name is looked up first (nslookup, part of every Alpine/BusyBox container). If one of the addresses lies
//     in the home network (or is loopback, link-local, multicast …), the link is refused.
//   - If curl is installed (image ghcr.io/pinn-shost/pinn and, since 1.165.1, the image of the stack), the request is
//     made with curl: pinned to the checked address (--resolve, so the name cannot change in between) and WITHOUT
//     following redirects. pinn. follows them itself (at most 5) and checks every new address the same way.
//   - Without curl, pinn. falls back to $http.send after the name check (then a redirect is still followed - the
//     admin sees a hint once in the log).
//
// fetch(url, opts) returns an object like $http.send: { statusCode, headers: { "Content-Type": … }, body }
//   (body = bytes; text with toString(res.body)). opts: { headers, timeout (s), maxBytes }
// Errors (not allowed, not found, too big, no connection) are thrown as Error with a German message.

const MAX_REDIRECTS = 5;
const MAX_BYTES_DEFAULT = 8 * 1024 * 1024;
const TOOL_KEY = "pinnAbrufWerkzeug";

function netz() { return require(`${__hooks}/pinn-netz.js`); }

// ---------------------------------------------------------------------------------------------
// Checks (pure functions, tested with node)
// ---------------------------------------------------------------------------------------------
// Address that the server must never reach: home network, loopback, link-local, carrier-grade NAT, "this network",
// multicast and reserved ranges
function blockedIp(ip) {
    if (!ip) return true;
    const n = netz();
    if (n.isIntern(ip)) return true;
    if (ip.v === 4) return ip.b[0] === 0 || ip.b[0] >= 224;
    if (ip.b[0] === 0xff) return true;                                     // IPv6 multicast
    if (ip.b.every((x, i) => i === 15 ? x <= 1 : x === 0)) return true;     // :: and ::1
    return false;
}
// Name check without looking it up (as before): local names and single names without a dot
function blockedName(host) {
    const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (!h || h === "localhost" || /\.(localhost|local|lan|home|internal|intranet|corp|fritz\.box|duckdns\.org|home\.arpa)$/.test(h) || h === "fritz.box") return true;
    if (h.indexOf(":") < 0 && !/^\d+(\.\d+){3}$/.test(h) && !/\./.test(h)) return true;
    return false;
}
// "https://user@host:8443/x" -> { scheme, host, port, ip } (ip = parsed address if the host is an IP literal)
function parseUrl(url) {
    const m = /^(https?):\/\/(?:[^@\/?#]*@)?(\[[^\]]+\]|[^\/:?#]+)(?::(\d{1,5}))?(?:[\/?#]|$)/i.exec(String(url || ""));
    if (!m) return null;
    const scheme = m[1].toLowerCase();
    const host = m[2].replace(/^\[|\]$/g, "").toLowerCase();
    const port = m[3] ? parseInt(m[3], 10) : (scheme === "https" ? 443 : 80);
    if (!(port > 0 && port < 65536)) return null;
    let ip = null;
    try { ip = netz().parseIp(host); } catch (e) { ip = null; }
    // Numbers in other spellings (e.g. 2130706433, 0x7f.1, 127.1) are never real public names
    if (!ip && host.split(".").every(part => /^(0x[0-9a-f]*|\d+)$/i.test(part))) return { scheme, host, port, ip: null, numeric: true };
    return { scheme, host, port, ip };
}
// Addresses from the output of nslookup (BusyBox and bind formats). The first "Address" block belongs to the DNS
// server - only addresses after a line "Name:" count.
function parseNslookup(text) {
    const out = [];
    let seenName = false;
    String(text || "").split(/\r?\n/).forEach(line => {
        const l = line.trim();
        if (/^Name:/i.test(l)) { seenName = true; return; }
        if (!seenName) return;
        const m = /^Address(?:\s*\d+)?:\s*([0-9a-fA-F:.]+)/i.exec(l);
        if (m) out.push(m[1]);
    });
    return out;
}
// Relative redirect target -> absolute address
function resolveUrl(base, loc) {
    const r = String(loc || "").trim();
    if (!r) return "";
    if (/^https?:\/\//i.test(r)) return r;
    if (/^\/\//.test(r)) return (/^https:/i.test(base) ? "https:" : "http:") + r;
    const m = String(base).match(/^(https?:\/\/[^\/?#]+)(\/[^?#]*)?/i);
    if (!m) return "";
    if (r.charAt(0) === "/") return m[1] + r;
    return m[1] + (m[2] || "/").replace(/[^\/]*$/, "") + r;
}
// Output of curl -w (status, content type, redirect target - one per line)
function parseCurlInfo(text) {
    const l = String(text || "").split(/\r?\n/);
    return { status: parseInt(l[0], 10) || 0, contentType: String(l[1] || "").trim(), location: String(l[2] || "").trim() };
}

// ---------------------------------------------------------------------------------------------
// With PocketBase
// ---------------------------------------------------------------------------------------------
function run(args) {
    const cmd = $os.cmd(...args);
    return toString(cmd.output());
}
// Which tools does the container have? Checked once per start.
function tools() {
    let t = null;
    try { t = $app.store().get(TOOL_KEY); } catch (e) { t = null; }
    if (t && typeof t === "object") return t;
    t = { nslookup: false, curl: false };
    try { run(["nslookup", "localhost"]); t.nslookup = true; } catch (e) {
        // nslookup ends with an error code if a name is unknown - it exists nevertheless
        t.nslookup = !/not found|no such file|executable file/i.test(String(e && e.message || e));
    }
    try { run(["curl", "--version"]); t.curl = true; } catch (e) { t.curl = false; }
    if (!t.curl) console.log("[Abruf] curl fehlt im Container – Weiterleitungen werden nicht einzeln geprüft (Image neu bauen).");
    if (!t.nslookup) console.log("[Abruf] nslookup fehlt im Container – Namen werden nur nach ihrer Schreibweise geprüft.");
    try { $app.store().set(TOOL_KEY, t); } catch (e) { /* ignore */ }
    return t;
}
// Looks the name up: list of parsed addresses, null = could not be looked up (tool missing)
function lookUp(host, t) {
    if (!t.nslookup) return null;
    let text = "";
    try { text = run(["nslookup", host]); } catch (e) { text = String(e && e.message || ""); }
    const list = [];
    parseNslookup(text).forEach(a => { const ip = netz().parseIp(a); if (ip) list.push(ip); });
    return list;
}
const NOT_ALLOWED = "Diese Adresse ist nicht erlaubt – bitte einen öffentlichen Link verwenden.";
// Checks one address; returns the checked IP to connect to (or null if the name could not be looked up)
function check(u, t) {
    if (!u || u.numeric) throw new Error(NOT_ALLOWED);
    if (u.ip) { if (blockedIp(u.ip)) throw new Error(NOT_ALLOWED); return u.ip; }
    if (blockedName(u.host)) throw new Error(NOT_ALLOWED);
    const ips = lookUp(u.host, t);
    if (ips === null) return null;
    if (!ips.length) throw new Error("Diese Adresse gibt es nicht – bitte den Link prüfen.");
    if (ips.some(blockedIp)) throw new Error(NOT_ALLOWED);
    return ips.find(ip => ip.v === 4) || ips[0];
}

function fetchWithCurl(url, opts, t) {
    const n = netz();
    const timeout = Math.max(3, Math.min(60, parseInt(opts.timeout, 10) || 20));
    const maxBytes = Math.max(1024, parseInt(opts.maxBytes, 10) || MAX_BYTES_DEFAULT);
    const tmp = "/tmp/pinn-abruf-" + $security.randomStringWithAlphabet(12, "abcdefghijklmnopqrstuvwxyz0123456789");
    let current = url;
    try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            const u = parseUrl(current);
            const ip = check(u, t);
            const args = ["curl", "-sS", "--proto", "=http,https", "--max-time", String(timeout), "--max-filesize", String(maxBytes),
                "--compressed", "-o", tmp, "-w", "%{http_code}\n%{content_type}\n%{redirect_url}"];
            const h = opts.headers || {};
            Object.keys(h).forEach(k => { args.push("-H", k + ": " + String(h[k]).replace(/[\r\n]/g, " ")); });
            if (ip) args.push("--resolve", u.host + ":" + u.port + ":" + (ip.v === 6 ? "[" + n.ipText(ip) + "]" : n.ipText(ip)));
            args.push("--", current);
            let info;
            try { info = parseCurlInfo(run(args)); } catch (e) {
                const msg = String(e && e.message || e);
                if (/exit status 63/.test(msg)) throw new Error("Die Datei ist zu groß.");
                if (/exit status 28/.test(msg)) throw new Error("Zeitüberschreitung beim Abruf.");
                throw new Error("Keine Verbindung (" + msg.slice(0, 120) + ").");
            }
            if (info.status >= 300 && info.status < 400 && info.location) {
                const next = resolveUrl(current, info.location);
                if (!next) throw new Error("Ungültige Weiterleitung.");
                current = next;
                continue;
            }
            let body = null;
            try { body = $os.readFile(tmp); } catch (e) { body = null; }
            return { statusCode: info.status, headers: { "Content-Type": info.contentType }, body: body, url: current };
        }
        throw new Error("Zu viele Weiterleitungen.");
    } finally {
        try { $os.remove(tmp); } catch (e) { /* not created */ }
    }
}

function fetch(url, opts) {
    const o = opts || {};
    const t = tools();
    if (t.curl) return fetchWithCurl(url, o, t);
    // Without curl: at least the name and its addresses are checked (redirects are followed by PocketBase)
    check(parseUrl(url), t);
    const res = $http.send({ url: url, method: "GET", timeout: Math.max(3, Math.min(60, parseInt(o.timeout, 10) || 20)), headers: o.headers || {} });
    return { statusCode: res.statusCode, headers: res.headers || {}, body: res.body, raw: res.raw, url: url };
}
// Only the check, without fetching (e.g. before a link is stored)
function allowed(url) {
    try { check(parseUrl(url), tools()); return true; } catch (e) { return false; }
}

module.exports = { fetch, allowed, blockedIp, blockedName, parseUrl, parseNslookup, resolveUrl, parseCurlInfo };

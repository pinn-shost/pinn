// pb_hooks/pinn-netz.js
// Network address of the visitor and "from the internet" detection (since 1.152.0).
//
// Why: pinn. can sit behind a reverse proxy (Caddy of the stack, Nginx Proxy Manager, Traefik, Cloudflare Tunnel …).
// Then every request arrives from the proxy, and the real visitor is only named in the header X-Forwarded-For.
// That header can be written by anybody, so it is only believed if the request really comes from a proxy we trust:
//
//   1. The direct peer (the TCP connection) must be a trusted proxy - otherwise X-Forwarded-For is ignored.
//   2. X-Forwarded-For is read from right to left (every proxy appends the address it saw). The first address
//      that is NOT a trusted proxy is the visitor. If all of them are trusted, the leftmost one is the visitor.
//
// Trusted proxies: environment value PINN_PROXY_NETZE (comma separated), default "privat":
//   privat       loopback, private networks (Docker networks, home network) and 100.64.0.0/10 (Tailscale - e.g. a
//                proxy on a rented server that reaches the NAS through Tailscale)
//   cloudflare   the published address ranges of Cloudflare (only needed with the orange cloud in front of an own proxy;
//                Cloudflare Tunnel does not need it)
//   none         never believe X-Forwarded-For (pinn. is reached without a proxy)
//   10.0.0.5, 172.18.0.0/16, 2001:db8::/32 …   single addresses or networks
//
// "From the internet" = the visitor address is neither loopback, private, link-local, unique-local nor 100.64.0.0/10
// (carrier-grade NAT, used by Tailscale). Used by netz.pb.js to keep the PocketBase administration and the default
// password away from the internet, and by pinn-ortung.js to slow down guessing of tracker IDs.
//
// Pure functions (parseIp, inNet, …) work without PocketBase - tested with node.

const ENV_NETZE = "PINN_PROXY_NETZE";

// Loopback, private, link-local and unique-local networks, and carrier-grade NAT (Tailscale addresses 100.x)
const PRIVAT = ["127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "100.64.0.0/10",
    "::1/128", "fc00::/7", "fe80::/10"];
// Additionally counted as "inside" (not from the internet), but not trusted as a proxy: "unspecified"
const INTERN_EXTRA = ["0.0.0.0/32", "::/128"];
// Published ranges of Cloudflare (https://www.cloudflare.com/ips/)
const CLOUDFLARE = ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
    "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15",
    "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
    "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29",
    "2c0f:f248::/32"];

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------
function parseV4(s) {
    const p = s.split(".");
    if (p.length !== 4) return null;
    const b = [];
    for (let i = 0; i < 4; i++) {
        if (!/^\d{1,3}$/.test(p[i])) return null;
        const n = parseInt(p[i], 10);
        if (n > 255) return null;
        b.push(n);
    }
    return b;
}
function parseV6(s) {
    // Embedded IPv4 at the end (e.g. ::ffff:192.168.1.5): turn it into two hex groups first
    if (s.indexOf(".") >= 0) {
        const at = s.lastIndexOf(":");
        const v4 = at >= 0 ? parseV4(s.slice(at + 1)) : null;
        if (!v4) return null;
        s = s.slice(0, at + 1) + ((v4[0] << 8) | v4[1]).toString(16) + ":" + ((v4[2] << 8) | v4[3]).toString(16);
    }
    const halves = s.split("::");
    if (halves.length > 2) return null;
    const part = (x) => x === "" ? [] : x.split(":");
    const head = part(halves[0]);
    const rest = halves.length === 2 ? part(halves[1]) : [];
    const all = head.concat(rest);
    for (let i = 0; i < all.length; i++) {
        if (!/^[0-9a-fA-F]{1,4}$/.test(all[i])) return null;
    }
    let groups;
    if (halves.length === 2) {
        const fill = 8 - all.length;
        if (fill < 1) return null;
        groups = head.concat(new Array(fill).fill("0"), rest);
    } else {
        if (all.length !== 8) return null;
        groups = all;
    }
    const b = [];
    groups.forEach(g => { const n = parseInt(g, 16); b.push((n >> 8) & 255); b.push(n & 255); });
    return b;
}
// "1.2.3.4", "1.2.3.4:5678", "::1", "[2001:db8::1]:443", "fe80::1%eth0" -> { v: 4|6, b: [bytes] } or null.
// IPv4-mapped IPv6 (::ffff:1.2.3.4) becomes IPv4.
function parseIp(raw) {
    let s = String(raw || "").trim();
    if (!s || s.length > 64) return null;
    const br = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
    if (br) s = br[1];
    else if (/^[\d.]+:\d+$/.test(s)) s = s.slice(0, s.indexOf(":"));
    const zone = s.indexOf("%");
    if (zone >= 0) s = s.slice(0, zone);
    if (s.indexOf(":") < 0) {
        const b4 = parseV4(s);
        return b4 ? { v: 4, b: b4 } : null;
    }
    const b6 = parseV6(s);
    if (!b6) return null;
    let mapped = true;
    for (let i = 0; i < 10; i++) if (b6[i] !== 0) mapped = false;
    if (mapped && b6[10] === 255 && b6[11] === 255) return { v: 4, b: b6.slice(12) };
    return { v: 6, b: b6 };
}
// Text form of a parsed address (IPv4 dotted, IPv6 shortened as usual: longest run of zero groups becomes "::")
function ipText(ip) {
    if (!ip) return "";
    if (ip.v === 4) return ip.b.join(".");
    const g = [];
    for (let i = 0; i < 16; i += 2) g.push(((ip.b[i] << 8) | ip.b[i + 1]).toString(16));
    let best = -1, bestLen = 0;
    for (let i = 0; i < 8;) {
        if (g[i] !== "0") { i++; continue; }
        let j = i;
        while (j < 8 && g[j] === "0") j++;
        if (j - i > bestLen && j - i > 1) { best = i; bestLen = j - i; }
        i = j;
    }
    if (best < 0) return g.join(":");
    return g.slice(0, best).join(":") + "::" + g.slice(best + bestLen).join(":");
}
// "10.0.0.0/8", "192.168.1.5", "2001:db8::/32" -> { v, b, len } or null
function parseNet(raw) {
    const s = String(raw || "").trim();
    const at = s.indexOf("/");
    const ip = parseIp(at >= 0 ? s.slice(0, at) : s);
    if (!ip) return null;
    const max = ip.v === 4 ? 32 : 128;
    let len = max;
    if (at >= 0) {
        const t = s.slice(at + 1);
        if (!/^\d{1,3}$/.test(t)) return null;
        len = parseInt(t, 10);
        // An IPv4-mapped network was written in IPv6 form: shorten the prefix accordingly
        if (ip.v === 4 && s.indexOf(":") >= 0) len -= 96;
        if (len < 0 || len > max) return null;
    }
    return { v: ip.v, b: ip.b, len: len };
}
function inNet(ip, net) {
    if (!ip || !net || ip.v !== net.v) return false;
    let bits = net.len;
    for (let i = 0; bits > 0; i++, bits -= 8) {
        const mask = bits >= 8 ? 255 : (255 << (8 - bits)) & 255;
        if ((ip.b[i] & mask) !== (net.b[i] & mask)) return false;
    }
    return true;
}
function inAny(ip, nets) {
    for (let i = 0; i < nets.length; i++) if (inNet(ip, nets[i])) return true;
    return false;
}
function nets(list) { return list.map(parseNet).filter(Boolean); }

const NETS_PRIVAT = nets(PRIVAT);
const NETS_INTERN = nets(PRIVAT.concat(INTERN_EXTRA));
const NETS_CLOUDFLARE = nets(CLOUDFLARE);

// Trusted proxies from a setting text (see the head of this file). Unknown words are ignored (logged once).
function trustedFrom(text) {
    const words = String(text || "").split(/[\s,;]+/).map(w => w.trim()).filter(Boolean);
    if (!words.length) return { nets: NETS_PRIVAT.slice(), unbekannt: [] };
    let out = [];
    const unbekannt = [];
    for (let i = 0; i < words.length; i++) {
        const w = words[i].toLowerCase();
        if (w === "keine" || w === "none" || w === "aus") return { nets: [], unbekannt: [] };
        if (w === "privat" || w === "private") out = out.concat(NETS_PRIVAT);
        else if (w === "cloudflare") out = out.concat(NETS_CLOUDFLARE);
        else {
            const n = parseNet(w);
            if (n) out.push(n); else unbekannt.push(words[i]);
        }
    }
    return { nets: out, unbekannt: unbekannt };
}

// Visitor address from the direct peer and the X-Forwarded-For header (pure function, see the head of this file)
function visitorFrom(peerText, xff, trusted) {
    const peer = parseIp(peerText);
    if (!peer) return null;
    if (!xff || !inAny(peer, trusted)) return peer;
    const parts = String(xff).split(",").map(s => s.trim()).filter(Boolean);
    let last = peer;
    for (let i = parts.length - 1; i >= 0; i--) {
        const ip = parseIp(parts[i]);
        if (!ip) return last;              // garbage: keep the last address we could check
        if (!inAny(ip, trusted)) return ip; // first address that is not a trusted proxy = the visitor
        last = ip;
    }
    return last;                            // all trusted: leftmost (e.g. a phone in the home network)
}
function isIntern(ip) { return !!ip && inAny(ip, NETS_INTERN); }

// ---------------------------------------------------------------------------------------------
// With PocketBase
// ---------------------------------------------------------------------------------------------
function env(name) {
    try { return String($os.getenv(name) || "").trim(); } catch (e) { return ""; }
}
let cache = { text: null, nets: NETS_PRIVAT };
function trusted() {
    const text = env(ENV_NETZE);
    if (cache.text !== text) {
        const t = trustedFrom(text);
        if (t.unbekannt.length) console.log("[Netz] " + ENV_NETZE + ": unbekannte Angabe(n) ignoriert: " + t.unbekannt.join(", "));
        cache = { text: text, nets: t.nets };
    }
    return cache.nets;
}
function header(e, name) {
    try { return String(e.request.header.get(name) || ""); } catch (err) { return ""; }
}
function peerOf(e) {
    let p = "";
    try { p = String(e.remoteIP() || ""); } catch (err) { p = ""; }
    if (!p) { try { p = String(e.request.remoteAddr || ""); } catch (err) { p = ""; } }
    return p;
}
// Parsed visitor address of a request (null if unknown)
function visitor(e) {
    try { return visitorFrom(peerOf(e), header(e, "X-Forwarded-For"), trusted()); } catch (err) { return null; }
}
// Visitor address as text ("" if unknown)
function clientIp(e) { return ipText(visitor(e)); }
// Key for counting failed attempts per visitor: IPv4 address, or the /64 network for IPv6 (every home connection gets a
// whole /64 - counting single IPv6 addresses would let an attacker simply switch to the next one)
function sperrSchluessel(e) {
    const ip = visitor(e);
    if (!ip) return "";
    if (ip.v === 4) return ipText(ip);
    return ipText({ v: 6, b: ip.b.slice(0, 8).concat([0, 0, 0, 0, 0, 0, 0, 0]) }).replace(/::$/, "").replace(/:$/, "") + "::/64";
}
// Does the request come from the internet? (unknown address counts as "from the internet" - the safe side)
function vonAussen(e) { return !isIntern(visitor(e)); }

module.exports = {
    ENV_NETZE,
    parseIp, parseNet, inNet, ipText, trustedFrom, visitorFrom, isIntern,
    clientIp, vonAussen, visitor, sperrSchluessel,
};

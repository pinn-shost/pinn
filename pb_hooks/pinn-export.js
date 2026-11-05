// pb_hooks/pinn-export.js
// Data export: a complete family (or flat share) as a ZIP - data + documents.
// Not a *.pb.js file -> only pulled in via require() from export.pb.js.
//
// The server does not pack anything itself: it delivers the data collection by collection as JSON and every file
// individually. The ZIP is built by the app in the browser (pb_public/datenexport.js). This way the NAS gets
// neither intermediate files nor load from compressing, and the container "wartung" is not needed.
//
// Which collections? Automatically all own collections with a field "familie" (relation or text)
// plus the record in "familien" itself. If a new collection is added later, it is part of the export without
// any change here. Only things that are bound to this server or to devices
// or are secret are excluded (see AUSSCHLUSS) - they would not work on another NAS anyway
// (encrypted with this server's key) or do not belong in a file.
//
// Permissions:
//   - Main admin: every family, complete (also private funds and "only for me" calendars) -
//     intended for moving to another NAS.
//   - Family admin: only the own family and only what they may see in the app, too. Funds of
//     which they are not a member (including bookings, receipts and documents of these funds) and
//     "only for me" calendars of other profiles stay out. The app shows how much is missing.
//   - Everyone else: no export.
//
// Never in the export: passwords (not even as a checksum), sign-in keys, dashboard PINs,
// credentials for iCloud/Google/Home Assistant, signed-in devices, push subscriptions, error log.

const FORMAT = "pinn-familien-export";
const FORMAT_VERSION = 1;

// Collections that are never exported
const AUSSCHLUSS = {
    apple_zugaenge: "zugang",        // iCloud credentials (encrypted with this server's key)
    google_zugaenge: "zugang",       // Google sign-ins
    google_client: "zugang",         // OAuth data of the server
    kalender_konten: "zugang",       // Calendar accounts per profile (credentials)
    sitzungen: "geraet",             // signed-in devices
    push_abos: "geraet",             // push subscriptions of the devices
    push_nachrichten: "geraet",      // delivered push texts
    dashboard_geraete: "geraet",     // enabled dashboard devices
    protokoll: "server",             // error log
    hinweise: "server",              // bell - short-lived messages
    kurse: "server",                 // price cache (applies to all families, reloads itself)
};

// Fields that are never exported (in addition to password and tokenKey of every profile collection)
const FELD_AUSSCHLUSS = {
    benutzer: ["dashboard_pin", "systemrechte"],
    smarthome_zugaenge: ["token", "ha"],
};

// order in the export (the rest alphabetically after it)
const ZUERST = ["familien", "benutzer", "familien_daten"];

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function hasField(col, name) {
    try { return !!col.fields.getByName(name); } catch (e) { return false; }
}
function str(v) { return v === null || v === undefined ? "" : String(v); }
function isId(v) { return /^[A-Za-z0-9_-]{1,40}$/.test(str(v)); }
function fehler(status, text, code) {
    const e = new Error(text);
    e.pinnStatus = status;
    e.pinnCode = code || "fehler";
    return e;
}
function benutzer() { return require(`${__hooks}/pinn-benutzer.js`); }

// fields of a collection: [{ name, typ, hidden }]
function feldInfos(col) {
    const out = [];
    const add = (f) => {
        if (!f) return;
        let n = "", typ = "", hidden = false;
        try { n = str(f.getName()); } catch (e) { try { n = str(f.name); } catch (e2) { n = ""; } }
        if (!n) return;
        try { typ = str(f.type()); } catch (e) { try { typ = str(f.type); } catch (e2) { typ = ""; } }
        try { hidden = !!f.getHidden(); } catch (e) { try { hidden = !!f.hidden; } catch (e2) { hidden = false; } }
        out.push({ name: n, typ: typ, hidden: hidden });
    };
    let names = null;
    try { names = col.fields.fieldNames(); } catch (e) { names = null; }
    if (names && names.length !== undefined) {
        for (let i = 0; i < names.length; i++) {
            let f = null;
            try { f = col.fields.getByName(str(names[i])); } catch (e) { f = null; }
            add(f);
        }
        if (out.length) return out;
    }
    try {
        const list = col.fields;
        for (let i = 0; i < list.length; i++) add(list[i]);
    } catch (e) { /* nothing */ }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Which collections belong to the family?
// ---------------------------------------------------------------------------------------------
function sammlungen() {
    let cols = [];
    try { cols = $app.findAllCollections(); } catch (e) { cols = []; }
    const out = [];
    for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (!c) continue;
        let name = "", system = false, typ = "";
        try { name = str(c.name); system = !!c.system; typ = str(c.type); } catch (e) { continue; }
        if (!name || system || typ === "view") continue;
        if (name.charAt(0) === "_" || name.indexOf("pinn_tmp_") === 0) continue;
        if (AUSSCHLUSS[name]) continue;
        if (name === benutzer().FAMILIEN) { out.push({ name: name, feld: "id" }); continue; }
        if (!hasField(c, "familie")) continue;
        out.push({ name: name, feld: "familie" });
    }
    out.sort((a, b) => {
        const ia = ZUERST.indexOf(a.name), ib = ZUERST.indexOf(b.name);
        if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });
    return out;
}
function sammlungInfo(name) {
    return sammlungen().find(s => s.name === name) || null;
}

// ---------------------------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------------------------
// -> { familie, name, vollstaendig, user, familien (main admin only) }
function zugriff(e, wunsch) {
    const b = benutzer();
    if (!b.isAdmin(e)) throw fehler(403, "Den Export können nur Admins erstellen.", "admin");
    wunsch = str(wunsch).trim();
    if (b.isMainAdmin(e)) {
        let fams = [];
        try { fams = $app.findRecordsByFilter(b.FAMILIEN, "id != ''", "name", 0, 0); } catch (err) { fams = []; }
        const liste = fams.map(f => ({ id: f.id, name: f.getString("name") }));
        if (!liste.length) throw fehler(404, "Auf diesem Server gibt es noch keine Familie.", "keine");
        let f = wunsch ? liste.find(x => x.id === wunsch) : liste[0];
        if (!f) throw fehler(404, "Diese Familie gibt es nicht (mehr).", "familie");
        return { familie: f.id, name: f.name, vollstaendig: true, user: e.auth, familien: liste };
    }
    const own = b.familyOf(e);
    if (!own) throw fehler(403, "Dein Profil gehört zu keiner Familie.", "familie");
    if (wunsch && wunsch !== own) throw fehler(403, "Du kannst nur deine eigene Familie exportieren.", "familie");
    let name = "";
    try { name = $app.findRecordById(b.FAMILIEN, own).getString("name"); } catch (err) { name = ""; }
    return { familie: own, name: name, vollstaendig: false, user: e.auth, familien: null };
}

// What a family admin may not see: { kassen: {id:1}, kalender: {id:1}, anzahl: {kassen, kalender} }
function sperren(z) {
    const s = { kassen: {}, kalender: {}, anzahl: { kassen: 0, kalender: 0 } };
    if (z.vollstaendig) return s;
    try {
        if (findCol("kassen")) {
            const k = require(`${__hooks}/pinn-kassen.js`);
            k.metaList(z.familie).forEach(m => {
                if (!k.isMember(m, z.user)) { s.kassen[m.id] = 1; s.anzahl.kassen++; }
            });
        }
    } catch (err) { console.log("[Export] Kassen nicht prüfbar: " + err.message); }
    try {
        if (findCol("kalender_eigene")) {
            $app.findRecordsByFilter("kalender_eigene", "familie = {:f} && geteilt = false && besitzer != {:u}", "", 0, 0,
                { f: z.familie, u: z.user.id }).forEach(r => { s.kalender[r.id] = 1; s.anzahl.kalender++; });
        }
    } catch (err) { console.log("[Export] Kalender nicht prüfbar: " + err.message); }
    return s;
}
function erlaubt(name, rec, sp) {
    if (name === "kassen") return !sp.kassen[rec.id];
    if (name === "kalender_eigene") return !sp.kalender[rec.id];
    if (name === "kalender_termine") return !sp.kalender[rec.getString("kalender")];
    let kasse = "";
    try { kasse = rec.getString("kasse"); } catch (e) { kasse = ""; }
    if (kasse && sp.kassen[kasse]) return false;
    return true;
}

// ---------------------------------------------------------------------------------------------
// Reading records
// ---------------------------------------------------------------------------------------------
function datensaetze(info, familie) {
    const filter = info.feld === "id" ? "id = {:f}" : "familie = {:f}";
    try { return $app.findRecordsByFilter(info.name, filter, "", 0, 0, { f: familie }); } catch (e) { return []; }
}

// A record as a plain object - without passwords, keys and locked fields,
// but with the remaining hidden fields (e.g. personal design settings).
function alsObjekt(rec, infos, sperrFelder) {
    const weg = sperrFelder.concat(["password", "tokenKey"]);
    infos.forEach(f => { if (f.typ === "password") weg.push(f.name); });
    const zeigen = infos.filter(f => f.hidden && weg.indexOf(f.name) < 0).map(f => f.name);
    try { rec.ignoreEmailVisibility(true); } catch (e) { /* not a profile collection */ }
    if (zeigen.length) { try { rec.unhide.apply(rec, zeigen); } catch (e) { /* older version */ } }
    let obj = null;
    try { obj = JSON.parse(JSON.stringify(rec)); } catch (e) { obj = null; }
    if (!obj || typeof obj !== "object") {
        obj = { id: rec.id };
        infos.forEach(f => {
            if (weg.indexOf(f.name) >= 0) return;
            try { obj[f.name] = rec.get(f.name); } catch (e2) { /* ignore */ }
        });
    }
    weg.forEach(n => { delete obj[n]; });
    delete obj.expand;
    return obj;
}

// file names of a record: [{ feld, name }]
function dateienVon(obj, infos) {
    const out = [];
    infos.forEach(f => {
        if (f.typ !== "file") return;
        const v = obj[f.name];
        const list = Array.isArray(v) ? v : (v ? [v] : []);
        list.forEach(n => { if (typeof n === "string" && n) out.push({ feld: f.name, name: n }); });
    });
    return out;
}
function dateiGroesse(rec, name) {
    let fsys = null;
    try {
        fsys = $app.newFilesystem();
        const a = fsys.attributes(rec.baseFilesPath() + "/" + name);
        return Number(a.size) || 0;
    } catch (e) {
        return 0;
    } finally {
        try { if (fsys) fsys.close(); } catch (e) { /* ignore */ }
    }
}

// ---------------------------------------------------------------------------------------------
// Route contents
// ---------------------------------------------------------------------------------------------
function version() {
    try { return require(`${__hooks}/pinn-system.js`).installierteVersion(); } catch (e) { return ""; }
}
function wohnform(familie) {
    try { return require(`${__hooks}/pinn-pushtext.js`).wohnformOf(familie); } catch (e) { return "familie"; }
}

// Overview: what is in the export?
function uebersicht(e, wunsch) {
    const z = zugriff(e, wunsch);
    const sp = sperren(z);
    const liste = [];
    let dateien = 0, bytes = 0, ausgelassen = 0;
    sammlungen().forEach(info => {
        const col = findCol(info.name);
        if (!col) return;
        const infos = feldInfos(col);
        const mitDateien = infos.some(f => f.typ === "file");
        const recs = datensaetze(info, z.familie);
        let n = 0, d = 0;
        recs.forEach(r => {
            if (!z.vollstaendig && !erlaubt(info.name, r, sp)) { ausgelassen++; return; }
            n++;
            if (!mitDateien) return;
            infos.forEach(f => {
                if (f.typ !== "file") return;
                let v = null;
                try { v = r.get(f.name); } catch (err) { v = null; }
                const names = Array.isArray(v) ? v : (v ? [String(v)] : []);
                names.forEach(nm => { if (nm) { d++; bytes += dateiGroesse(r, String(nm)); } });
            });
        });
        if (n) liste.push({ name: info.name, anzahl: n, dateien: d });
        dateien += d;
    });
    return {
        format: FORMAT, formatVersion: FORMAT_VERSION, version: version(),
        familie: { id: z.familie, name: z.name, wohnform: wohnform(z.familie) },
        familien: z.familien,
        vollstaendig: z.vollstaendig,
        sammlungen: liste,
        dateien: dateien,
        bytes: bytes,
        ausgelassen: { datensaetze: ausgelassen, kassen: sp.anzahl.kassen, kalender: sp.anzahl.kalender },
        nichtEnthalten: Object.keys(AUSSCHLUSS),
        exportiertVon: e.auth.getString("username"),
    };
}

// One collection: { name, datensaetze, dateien: [{ datensatz, feld, name, groesse }] }
function sammlung(e, wunsch, name) {
    const z = zugriff(e, wunsch);
    const info = sammlungInfo(str(name));
    if (!info) throw fehler(404, "Diese Sammlung gehört nicht zum Export.", "sammlung");
    const col = findCol(info.name);
    if (!col) throw fehler(404, "Diese Sammlung gibt es nicht.", "sammlung");
    const sp = sperren(z);
    const infos = feldInfos(col);
    const sperrFelder = FELD_AUSSCHLUSS[info.name] || [];
    const recs = datensaetze(info, z.familie);
    const out = { name: info.name, datensaetze: [], dateien: [] };
    recs.forEach(r => {
        if (!z.vollstaendig && !erlaubt(info.name, r, sp)) return;
        const obj = alsObjekt(r, infos, sperrFelder);
        out.datensaetze.push(obj);
        dateienVon(obj, infos).forEach(d => {
            out.dateien.push({ datensatz: r.id, feld: d.feld, name: d.name, groesse: dateiGroesse(r, d.name) });
        });
    });
    return out;
}

// Deliver a file (after checking whether it belongs to the family and is released)
const MIME = {
    pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
    heic: "image/heic", heif: "image/heif", svg: "image/svg+xml", txt: "text/plain", csv: "text/csv", json: "application/json",
};
function datei(e, wunsch, name, datensatz, dateiname) {
    const z = zugriff(e, wunsch);
    const info = sammlungInfo(str(name));
    if (!info) throw fehler(404, "Diese Sammlung gehört nicht zum Export.", "sammlung");
    if (!isId(datensatz)) throw fehler(400, "Ungültiger Datensatz.", "datensatz");
    dateiname = str(dateiname);
    if (!dateiname || dateiname.indexOf("/") >= 0 || dateiname.indexOf("\\") >= 0 || dateiname.indexOf("..") >= 0) {
        throw fehler(400, "Ungültiger Dateiname.", "datei");
    }
    let rec = null;
    try { rec = $app.findRecordById(info.name, datensatz); } catch (err) { rec = null; }
    if (!rec) throw fehler(404, "Diesen Eintrag gibt es nicht mehr.", "fehlt");
    const fam = info.feld === "id" ? rec.id : rec.getString("familie");
    if (fam !== z.familie) throw fehler(403, "Diese Datei gehört nicht zu dieser Familie.", "familie");
    if (!z.vollstaendig && !erlaubt(info.name, rec, sperren(z))) throw fehler(403, "Kein Zugriff auf diese Datei.", "privat");
    const infos = feldInfos(rec.collection());
    let gefunden = false;
    infos.forEach(f => {
        if (f.typ !== "file" || gefunden) return;
        let v = null;
        try { v = rec.get(f.name); } catch (err) { v = null; }
        const names = Array.isArray(v) ? v.map(String) : (v ? [String(v)] : []);
        if (names.indexOf(dateiname) >= 0) gefunden = true;
    });
    if (!gefunden) throw fehler(404, "Diese Datei gibt es nicht mehr.", "fehlt");

    const key = rec.baseFilesPath() + "/" + dateiname;
    let fsys = null;
    try {
        fsys = $app.newFilesystem();
        fsys.serve(e.response, e.request, key, dateiname);
        return true;
    } catch (err) {
        console.log("[Export] Datei über das Dateisystem nicht lesbar (" + err.message + ") – lese direkt.");
    } finally {
        try { if (fsys) fsys.close(); } catch (err) { /* ignore */ }
    }
    // Fallback: PocketBase's local storage
    let bytes = null;
    try { bytes = $os.readFile("/pb_data/storage/" + key); } catch (err) { bytes = null; }
    if (!bytes) throw fehler(404, "Diese Datei fehlt auf dem NAS.", "fehlt");
    const ext = (dateiname.split(".").pop() || "").toLowerCase();
    return e.blob(200, MIME[ext] || "application/octet-stream", bytes);
}

module.exports = { FORMAT, FORMAT_VERSION, uebersicht, sammlung, datei, sammlungen };

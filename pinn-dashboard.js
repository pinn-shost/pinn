// pb_hooks/pinn-dashboard.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden
// (Routen in dashboard.pb.js, Einrichtung über pinn-benutzer.js -> ensureSchema).
//
// Familien-Dashboard (z. B. ein iPad in der Küche):
//  - Ein Admin der Familie richtet ein Gerät als Dashboard ein. Das Gerät bekommt dabei einen
//    zufälligen Schlüssel. Der Server speichert davon nur den SHA-256-Wert in der gesperrten
//    Sammlung "dashboard_geraete" (nur über die Routen erreichbar, Löschen der Familie löscht mit).
//  - Mit diesem Schlüssel zeigt das Gerät ohne Anmeldung die Profile seiner Familie und öffnet ein
//    Profil per Tipp - bzw. erst nach Eingabe der PIN, wenn das Profil eine hat.
//  - PIN: freiwillig, 4 oder 6 Ziffern. Gespeichert im Profil im versteckten Feld "dashboard_pin"
//    als "<Länge>$<Salz>$<SHA-256(Salz:PIN)>" - nie im Klartext.
//  - Nach 5 falschen PINs wird das Profil am Dashboard gesperrt: 30 Sekunden, danach jeweils doppelt
//    so lange, höchstens 15 Minuten. Die Zähler liegen nur im Arbeitsspeicher (kein Schreiben auf
//    die Festplatte, nach einem Neustart wieder bei 0).
//  - Gäste (Rolle "gast") haben kein bekanntes Passwort und keine PIN - sie kommen nur über das
//    Dashboard in die App.
//
//  - Hintergrund je Familie: Ein Admin wählt unter Konto → „Dashboard-Hintergrund“ Standard, eine
//    Farbe, einen Farbverlauf oder ein eigenes Bild. Gespeichert in der gesperrten Sammlung
//    "dashboard_hintergruende" (ein Datensatz je Familie, Löschen der Familie löscht mit).
//    Das Bild wird in der App verkleinert (JPEG) und als Bild-Daten gespeichert. Das Dashboard-Gerät
//    bekommt mit den Profilen nur den kleinen Stil samt Stand und lädt das Bild selbst nur, wenn es
//    sich geändert hat (danach liegt es auf dem Gerät - auch offline).
//
// Schonend für CPU und Speicher: nur einzelne Datenbankzugriffe je Aktion, kein Zeitplan.
// "zuletzt benutzt" wird höchstens einmal am Tag je Gerät gespeichert.
// Stil und Stand des Hintergrunds liegen zusätzlich im Arbeitsspeicher, damit beim Öffnen des
// Dashboards nicht jedes Mal das große Bild aus der Datenbank gelesen wird.

const GERAETE = "dashboard_geraete";
const PIN_FIELD = "dashboard_pin";
const MAX_FAILS = 5;
const LOCK_PREFIX = "pinnPinSperre:";
const HINTERGRUND = "dashboard_hintergruende";
const BG_CACHE_PREFIX = "pinnDashBg:";
const BG_MAX_CHARS = 2600000;          // Bild-Daten (Base64) höchstens ca. 1,9 MB
const BG_ARTEN = ["standard", "farbe", "verlauf", "bild"];

function base() {
    return require(`${__hooks}/pinn-benutzer.js`);
}

// ---------------------------------------------------------------------------------------------
// Einrichtung
// ---------------------------------------------------------------------------------------------
// Legt die Sammlungen "dashboard_geraete" und "dashboard_hintergruende" an, falls sie fehlen.
// true = beide vorhanden.
function ensureSchema() {
    const devices = ensureDeviceSchema();
    const bg = ensureBackgroundSchema();
    return devices && bg;
}

function ensureDeviceSchema() {
    const lib = base();
    if (lib.findCol(GERAETE)) return true;
    const fam = lib.findCol(lib.FAMILIEN);
    if (!fam) return false; // Familien-Sammlung fehlt noch - beim nächsten Aufruf erneut
    try {
        lib.createCollection({
            type: "base",
            name: GERAETE,
            fields: [
                { name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false },
                { name: "name", type: "text", max: 60 },
                { name: "schluessel", type: "text", max: 128 },
                { name: "erstellt_von", type: "text", max: 30 },
                { name: "zuletzt", type: "text", max: 30 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: ["CREATE INDEX `idx_dashboard_geraete_schluessel` ON `" + GERAETE + "` (`schluessel`)"],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        });
        console.log("[Dashboard] Sammlung \"" + GERAETE + "\" angelegt.");
        return true;
    } catch (err) {
        console.log("[Dashboard] Sammlung \"" + GERAETE + "\" nicht anlegbar: " + err.message);
        return false;
    }
}

function ensureBackgroundSchema() {
    const lib = base();
    if (lib.findCol(HINTERGRUND)) return true;
    const fam = lib.findCol(lib.FAMILIEN);
    if (!fam) return false;
    try {
        lib.createCollection({
            type: "base",
            name: HINTERGRUND,
            fields: [
                { name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false },
                { name: "stil", type: "json", maxSize: 4000 },
                { name: "bild", type: "text", max: BG_MAX_CHARS + 100 },
                { name: "stand", type: "text", max: 30 },
                { name: "geaendert_von", type: "text", max: 30 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: ["CREATE INDEX `idx_dashboard_hintergruende_familie` ON `" + HINTERGRUND + "` (`familie`)"],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        });
        console.log("[Dashboard] Sammlung \"" + HINTERGRUND + "\" angelegt.");
        return true;
    } catch (err) {
        console.log("[Dashboard] Sammlung \"" + HINTERGRUND + "\" nicht anlegbar: " + err.message);
        return false;
    }
}

// ---------------------------------------------------------------------------------------------
// Geräte
// ---------------------------------------------------------------------------------------------
function hashKey(key) {
    return $security.sha256("pinn-dashboard:" + String(key));
}
function cleanDeviceName(v) {
    return String(v || "").replace(/\s+/g, " ").trim().slice(0, 60);
}

// Neues Dashboard-Gerät. Der Schlüssel wird nur hier einmal im Klartext zurückgegeben.
function newDevice(familyId, name, userId) {
    if (!familyId) throw new Error("Dein Profil gehört zu keiner Familie.");
    if (!ensureDeviceSchema()) throw new Error("Die Sammlung \"" + GERAETE + "\" fehlt.");
    const key = $security.randomString(48);
    const rec = new Record($app.findCollectionByNameOrId(GERAETE));
    rec.set("familie", familyId);
    rec.set("name", cleanDeviceName(name) || "Dashboard");
    rec.set("schluessel", hashKey(key));
    rec.set("erstellt_von", String(userId || ""));
    rec.set("zuletzt", new Date().toISOString());
    $app.save(rec);
    return { id: rec.id, key: key, name: rec.getString("name") };
}

// Gerät zu einem Schlüssel oder null
function findDevice(key) {
    const k = String(key || "");
    if (k.length < 20 || k.length > 200) return null;
    if (!base().findCol(GERAETE)) return null;
    try {
        return $app.findFirstRecordByFilter(GERAETE, "schluessel = {:h}", { h: hashKey(k) });
    } catch (e) {
        return null;
    }
}

// "zuletzt benutzt" höchstens einmal am Tag speichern
function touchDevice(rec) {
    const now = new Date().toISOString();
    if (rec.getString("zuletzt").slice(0, 10) === now.slice(0, 10)) return;
    try {
        rec.set("zuletzt", now);
        $app.save(rec);
    } catch (e) { /* egal */ }
}

function listDevices(familyId) {
    if (!familyId || !base().findCol(GERAETE)) return [];
    try {
        return $app.findRecordsByFilter(GERAETE, "familie = {:f}", "-created", 0, 0, { f: String(familyId) }).map(r => ({
            id: r.id,
            name: r.getString("name"),
            zuletzt: r.getString("zuletzt"),
            created: r.getString("created"),
        }));
    } catch (e) {
        return [];
    }
}

// Gerät der eigenen Familie entfernen. Ist es schon weg, gilt das als erledigt.
function removeDevice(familyId, id) {
    if (!base().findCol(GERAETE)) return;
    let rec = null;
    try { rec = $app.findRecordById(GERAETE, String(id || "")); } catch (e) { return; }
    if (rec.getString("familie") !== String(familyId || "")) throw new Error("Dieses Gerät gehört zu einer anderen Familie.");
    $app.delete(rec);
}

// ---------------------------------------------------------------------------------------------
// Hintergrund je Familie
// ---------------------------------------------------------------------------------------------
function cleanHex(v) {
    const s = String(v || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : "";
}
// Nur bekannte, einfache Werte übernehmen
function cleanStyle(input) {
    const src = (input && typeof input === "object" && !Array.isArray(input)) ? input : {};
    let art = String(src.art || "standard");
    if (BG_ARTEN.indexOf(art) < 0) art = "standard";
    let dim = parseInt(src.abdunkeln, 10);
    if (!isFinite(dim)) dim = 25;
    dim = Math.max(0, Math.min(70, dim));
    const verlauf = String(src.verlauf || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 20);
    return {
        art: art,
        farbe: cleanHex(src.farbe) || "#2F4B41",
        verlauf: verlauf || "morgen",
        abdunkeln: dim,
    };
}
// Bild-Daten prüfen: nur JPEG/PNG/WebP als Base64, nicht zu groß. "" = ungültig.
function cleanImage(v) {
    const s = String(v || "");
    if (!s || s.length > BG_MAX_CHARS) return "";
    const m = /^data:image\/(jpeg|png|webp);base64,/.exec(s.slice(0, 40));
    if (!m) return "";
    const data = s.slice(m[0].length);
    if (data.length < 100 || /[^A-Za-z0-9+/=]/.test(data)) return "";
    return s;
}

function backgroundRecord(familyId) {
    if (!familyId || !base().findCol(HINTERGRUND)) return null;
    try {
        return $app.findFirstRecordByFilter(HINTERGRUND, "familie = {:f}", { f: String(familyId) });
    } catch (e) {
        return null;
    }
}
function parseStyle(rec) {
    let raw = {};
    try {
        raw = require(`${__hooks}/calendar-sync.js`).parseRecordData(rec.get("stil")) || {};
    } catch (e) { raw = {}; }
    return cleanStyle(raw);
}
// Kleine Beschreibung (ohne Bild) aus einem Datensatz
function metaOf(rec) {
    if (!rec) return { stil: cleanStyle({}), stand: "", bild: false };
    const stil = parseStyle(rec);
    const hasImage = rec.getString("bild").length > 0;
    if (stil.art === "bild" && !hasImage) stil.art = "standard";
    return { stil: stil, stand: rec.getString("stand"), bild: hasImage };
}
function cacheMeta(familyId, meta) {
    try { $app.store().set(BG_CACHE_PREFIX + familyId, JSON.stringify(meta)); } catch (e) { /* egal */ }
}
// Stil + Stand + "hat Bild" - aus dem Arbeitsspeicher, sonst einmal aus der Datenbank
function backgroundMeta(familyId) {
    const fid = String(familyId || "");
    if (!fid) return metaOf(null);
    try {
        const raw = $app.store().get(BG_CACHE_PREFIX + fid);
        if (raw) return JSON.parse(String(raw));
    } catch (e) { /* neu lesen */ }
    const meta = metaOf(backgroundRecord(fid));
    cacheMeta(fid, meta);
    return meta;
}
// Stil + Bild-Daten (für die Einstellungen und das Dashboard-Gerät)
function backgroundFull(familyId) {
    const rec = backgroundRecord(familyId);
    const meta = metaOf(rec);
    return { stil: meta.stil, stand: meta.stand, bild: rec ? rec.getString("bild") : "" };
}
// Speichern. bild: undefined = unverändert lassen, "" / null = entfernen, sonst neue Bild-Daten.
function saveBackground(familyId, userId, stil, bild) {
    if (!familyId) throw new Error("Dein Profil gehört zu keiner Familie.");
    if (!ensureBackgroundSchema()) throw new Error("Die Sammlung \"" + HINTERGRUND + "\" fehlt.");
    let rec = backgroundRecord(familyId);
    if (!rec) {
        rec = new Record($app.findCollectionByNameOrId(HINTERGRUND));
        rec.set("familie", familyId);
        rec.set("bild", "");
    }
    const clean = cleanStyle(stil);
    if (bild !== undefined) {
        if (bild === null || bild === "") {
            rec.set("bild", "");
        } else {
            const img = cleanImage(bild);
            if (!img) throw new Error("Das Bild ist ungültig oder zu groß.");
            rec.set("bild", img);
        }
    }
    if (clean.art === "bild" && !rec.getString("bild")) throw new Error("Bitte zuerst ein Bild auswählen.");
    rec.set("stil", clean);
    rec.set("stand", String(Date.now()));
    rec.set("geaendert_von", String(userId || ""));
    $app.save(rec);
    const meta = { stil: clean, stand: rec.getString("stand"), bild: rec.getString("bild").length > 0 };
    cacheMeta(String(familyId), meta);
    return meta;
}

// ---------------------------------------------------------------------------------------------
// Profile fürs Dashboard (nur das Nötigste, keine E-Mail o. Ä.)
// ---------------------------------------------------------------------------------------------
function profilesFor(familyId) {
    const lib = base();
    let recs = [];
    try {
        recs = $app.findRecordsByFilter(lib.USERS, "familie = {:f}", "", 0, 0, { f: String(familyId || "") });
    } catch (e) {
        recs = [];
    }
    return recs
        .filter(r => r.getString("rolle") !== "hauptadmin")
        .map(r => ({
            id: r.id,
            username: r.getString("username"),
            rolle: r.getString("rolle") || "mitglied",
            mitglied: r.getString("mitglied"),
            pin: pinLength(r),
        }))
        .sort((a, b) => a.username.localeCompare(b.username));
}

// ---------------------------------------------------------------------------------------------
// PIN
// ---------------------------------------------------------------------------------------------
function parsePin(rec) {
    let raw = "";
    try { raw = rec.getString(PIN_FIELD); } catch (e) { raw = ""; }
    const parts = String(raw || "").split("$");
    if (parts.length !== 3) return null;
    const len = parseInt(parts[0], 10);
    if ((len !== 4 && len !== 6) || !parts[1] || !parts[2]) return null;
    return { len: len, salt: parts[1], hash: parts[2] };
}
// 0 = keine PIN, sonst 4 oder 6
function pinLength(rec) {
    const p = parsePin(rec);
    return p ? p.len : 0;
}
function validPinFormat(pin) {
    return /^(\d{4}|\d{6})$/.test(String(pin || ""));
}
function hashPin(salt, pin) {
    return $security.sha256(String(salt) + ":" + String(pin));
}
// Leere PIN = PIN entfernen. Wirft bei ungültigem Format.
function setPin(rec, pin) {
    const p = String(pin || "").trim();
    if (!p) {
        rec.set(PIN_FIELD, "");
        return;
    }
    if (!validPinFormat(p)) throw new Error("Die PIN muss aus 4 oder 6 Ziffern bestehen.");
    const salt = $security.randomString(16);
    rec.set(PIN_FIELD, p.length + "$" + salt + "$" + hashPin(salt, p));
}
// true = PIN stimmt (oder das Profil hat gar keine PIN)
function checkPin(rec, pin) {
    const p = parsePin(rec);
    if (!p) return true;
    const given = String(pin || "");
    if (!validPinFormat(given) || given.length !== p.len) return false;
    return $security.equal(p.hash, hashPin(p.salt, given));
}

// ---------------------------------------------------------------------------------------------
// Sperre nach zu vielen Fehlversuchen (nur im Arbeitsspeicher)
// ---------------------------------------------------------------------------------------------
function readLock(id) {
    try {
        const raw = $app.store().get(LOCK_PREFIX + id);
        const parts = String(raw || "").split("|");
        return { n: parseInt(parts[0], 10) || 0, until: parseInt(parts[1], 10) || 0 };
    } catch (e) {
        return { n: 0, until: 0 };
    }
}
// Verbleibende Sperre in Sekunden (0 = nicht gesperrt)
function lockedFor(id) {
    const rest = readLock(id).until - Date.now();
    return rest > 0 ? Math.ceil(rest / 1000) : 0;
}
// Fehlversuch zählen. Gibt die neue Sperre in Sekunden zurück (0 = noch nicht gesperrt).
function registerFail(id) {
    const lock = readLock(id);
    const n = lock.n + 1;
    let until = 0;
    if (n >= MAX_FAILS) {
        const seconds = Math.min(15 * 60, 30 * Math.pow(2, n - MAX_FAILS));
        until = Date.now() + seconds * 1000;
    }
    try { $app.store().set(LOCK_PREFIX + id, n + "|" + until); } catch (e) { /* egal */ }
    return until ? Math.ceil((until - Date.now()) / 1000) : 0;
}
function clearFails(id) {
    try { $app.store().remove(LOCK_PREFIX + id); } catch (e) { /* egal */ }
}
function waitText(seconds) {
    const s = Math.max(1, Math.round(seconds));
    if (s < 60) return s + " Sekunden";
    const m = Math.ceil(s / 60);
    return m === 1 ? "einer Minute" : m + " Minuten";
}

module.exports = {
    GERAETE, PIN_FIELD, HINTERGRUND,
    ensureSchema, newDevice, findDevice, touchDevice, listDevices, removeDevice, cleanDeviceName,
    profilesFor, pinLength, setPin, checkPin, validPinFormat,
    lockedFor, registerFail, clearFails, waitText,
    backgroundMeta, backgroundFull, saveBackground,
};

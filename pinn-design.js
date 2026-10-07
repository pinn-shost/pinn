// pb_hooks/pinn-design.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
// Persönliche Design-Einstellungen je Profil (geräteübergreifend).
//
// Gespeichert wird im Profil (Sammlung "benutzer") im versteckten JSON-Feld "design_einstellungen":
//   { werte: { schluessel: wert, ... }, stand: <Zeitstempel in ms> }
// "stand" ist der Zeitpunkt der letzten Änderung auf dem Gerät. Der Server behält immer den
// neueren Stand - so überschreibt ein Gerät, das offline alte Einstellungen nachträgt, keine
// neueren Änderungen von einem anderen Gerät.

const FIELD = "design_einstellungen";
const MAX_KEYS = 60;
const MAX_KEY_LEN = 40;
const MAX_STRING_LEN = 300;

// Feld im Profil sicherstellen. true = vorhanden.
function ensureField() {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const col = lib.findCol(lib.USERS);
    if (!col) return false;
    if (lib.hasField(col, FIELD)) return true;
    try {
        col.fields.add(lib.makeField({ name: FIELD, type: "json", maxSize: 20000, hidden: true }));
        $app.save(col);
        console.log("[Design] Feld \"" + FIELD + "\" im Profil angelegt.");
        return true;
    } catch (err) {
        console.log("[Design] Feld \"" + FIELD + "\" nicht anlegbar: " + err.message);
        return false;
    }
}

// Nur einfache Werte zulassen (Text, Zahl, Ja/Nein, Listen aus Text/Zahlen).
function cleanValue(v) {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return isFinite(v) ? v : undefined;
    if (typeof v === "string") return v.slice(0, MAX_STRING_LEN);
    if (Array.isArray(v)) {
        const out = [];
        for (let i = 0; i < v.length && out.length < 30; i++) {
            const x = v[i];
            if (typeof x === "string") out.push(x.slice(0, MAX_STRING_LEN));
            else if (typeof x === "number" && isFinite(x)) out.push(x);
            else if (typeof x === "boolean") out.push(x);
        }
        return out;
    }
    return undefined;
}

function cleanDesign(input) {
    const src = (input && typeof input === "object") ? input : {};
    const rawWerte = (src.werte && typeof src.werte === "object" && !Array.isArray(src.werte)) ? src.werte : {};
    const werte = {};
    let n = 0;
    Object.keys(rawWerte).forEach(k => {
        if (n >= MAX_KEYS) return;
        if (!/^[A-Za-z0-9_.-]+$/.test(k) || k.length > MAX_KEY_LEN) return;
        const v = cleanValue(rawWerte[k]);
        if (v === undefined) return;
        werte[k] = v;
        n++;
    });
    let stand = parseInt(src.stand, 10);
    if (!isFinite(stand) || stand < 0) stand = 0;
    // Uhrzeit eines Geräts, die weit in der Zukunft liegt, nicht übernehmen
    const maxStand = Date.now() + 24 * 60 * 60 * 1000;
    if (stand > maxStand) stand = maxStand;
    return { werte: werte, stand: stand };
}

function readDesign(userRec) {
    let raw = {};
    try {
        raw = require(`${__hooks}/calendar-sync.js`).parseRecordData(userRec.get(FIELD)) || {};
    } catch (err) { raw = {}; }
    return cleanDesign(raw);
}

// Speichert, wenn der neue Stand nicht älter ist. Gibt { design, uebernommen, fehler } zurück.
function saveDesign(userId, input) {
    const incoming = cleanDesign(input);
    if (!incoming.stand) incoming.stand = Date.now();
    ensureField();
    const rec = $app.findRecordById("benutzer", userId);
    const current = readDesign(rec);
    if (current.stand > incoming.stand) {
        // Auf einem anderen Gerät wurde später geändert -> dieser Stand gilt
        return { design: current, uebernommen: false, fehler: "" };
    }
    rec.set(FIELD, incoming);
    $app.save(rec);
    let saved = incoming;
    try { saved = readDesign($app.findRecordById("benutzer", userId)); } catch (err) { saved = incoming; }
    if (JSON.stringify(saved) !== JSON.stringify(incoming)) {
        return { design: saved, uebernommen: false, fehler: "Design wurde nicht gespeichert (Feld \"" + FIELD + "\" fehlt im Profil)." };
    }
    return { design: saved, uebernommen: true, fehler: "" };
}

module.exports = { FIELD, ensureField, cleanDesign, readDesign, saveDesign };

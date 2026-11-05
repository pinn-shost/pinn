// pb_hooks/pinn-design.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
// Personal design settings per profile (across devices).
//
// Stored in the profile (collection "benutzer") in the hidden JSON field "design_einstellungen":
//   { werte: { schluessel: wert, ... }, stand: <timestamp in ms> }
// "stand" is the time of the last change on the device. The server always keeps the
// newer state - so a device that submits old settings after being offline does not overwrite any
// newer changes from another device.

const FIELD = "design_einstellungen";
const MAX_KEYS = 60;
const MAX_KEY_LEN = 40;
const MAX_STRING_LEN = 300;

// Make sure the field exists in the profile. true = present.
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

// Only allow simple values (text, number, yes/no, lists of text/numbers).
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
    // Do not take over a device time that lies far in the future
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

// Saves if the new state is not older. Returns { design, uebernommen, fehler }.
function saveDesign(userId, input) {
    const incoming = cleanDesign(input);
    if (!incoming.stand) incoming.stand = Date.now();
    ensureField();
    const rec = $app.findRecordById("benutzer", userId);
    const current = readDesign(rec);
    if (current.stand > incoming.stand) {
        // Changed later on another device -> that state applies
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

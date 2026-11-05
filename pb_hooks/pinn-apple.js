// pb_hooks/pinn-apple.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
//
// Apple credentials PER FAMILY (Apple ID + app-specific password).
//
// Storage location: locked PocketBase collection "apple_zugaenge"
//  - creates itself on start (setup(), called from apple_credentials.pb.js)
//  - ALL API rules are locked (null): neither the app nor a browser can read or write
//    the collection - only the server hooks and the superuser in the dashboard
//  - fields additionally "hidden"
//  - the password is stored AES-encrypted in the database ($security.encrypt)
//  - deleting a family automatically deletes its credentials too (cascadeDelete)
//
// Key for the encryption (32 characters):
//  - preferably from the .env: PINN_SCHLUESSEL
//  - if it is missing there, a random key is generated once on the first start and stored in
//    pb_data/pinn_schluessel.txt (so that everything works without further set-up)
//  - if PINN_SCHLUESSEL is set later, existing credentials are automatically re-encrypted
//    with the new key on the next access
//
// The same key also encrypts the Google access (pinn-google.js, collection "google_zugaenge").
//
// Migration: if PINN_APPLE_ID / PINN_APPLE_APP_PASSWORD are still in the .env, they are taken over once
// on start, encrypted, for the family that formerly owned the Apple calendar. After that
// both lines can be removed from the .env.

const APPLE = "apple_zugaenge";
const KEY_ENV = "PINN_SCHLUESSEL";
const KEY_FILE = "/pb_data/pinn_schluessel.txt";
const LEGACY_ID_ENV = "PINN_APPLE_ID";
const LEGACY_PW_ENV = "PINN_APPLE_APP_PASSWORD";
const CLOSED_RULES = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"];

function readEnv(name) {
    try { return String($os.getenv(name) || "").trim(); } catch (e) { return ""; }
}

// PocketBase IDs consist of 15 lowercase letters/digits - anything else is rejected.
function validFamilyId(id) {
    return /^[a-z0-9]{15}$/.test(String(id || ""));
}

function fileText(path) {
    const raw = $os.readFile(path);
    try {
        if (typeof toString === "function") {
            const t = toString(raw);
            if (typeof t === "string" && t.indexOf("[object") !== 0) return t;
        }
    } catch (e) { /* continue */ }
    let s = "";
    for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
    return s;
}

// ---------------------------------------------------------------------------------------------
// Key
// ---------------------------------------------------------------------------------------------
function fileKey(create) {
    let k = "";
    try { k = fileText(KEY_FILE).trim(); } catch (e) { k = ""; }
    if (k.length === 32) return k;
    if (!create) return "";
    k = $security.randomString(32);
    $os.writeFile(KEY_FILE, k, 384); // 0600
    console.log("[Apple-Zugang] Neuer Schlüssel in pb_data/pinn_schluessel.txt erzeugt.");
    return k;
}

// [current key, possibly old key]
function keys() {
    const env = readEnv(KEY_ENV);
    if (env) {
        if (env.length !== 32) throw new Error(KEY_ENV + " in der .env muss genau 32 Zeichen lang sein.");
        const old = fileKey(false);
        return (old && old !== env) ? [env, old] : [env];
    }
    return [fileKey(true)];
}

function encrypt(text) {
    return $security.encrypt(String(text), keys()[0]);
}

// Returns { text, current } (current = decrypted with the current key) or null.
function decrypt(cipher) {
    if (!cipher) return null;
    const ks = keys();
    for (let i = 0; i < ks.length; i++) {
        try {
            const t = $security.decrypt(String(cipher), ks[i]);
            if (t) return { text: String(t), current: i === 0 };
        } catch (e) { /* next key */ }
    }
    return null;
}

// ---------------------------------------------------------------------------------------------
// collection
// ---------------------------------------------------------------------------------------------
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}

function ensureCollection() {
    let col = findCol(APPLE);
    if (col) {
        // Rules must stay locked - if someone opened them in the dashboard, close them again
        let changed = false;
        CLOSED_RULES.forEach(k => {
            if (col[k] !== null && col[k] !== undefined) { col[k] = null; changed = true; }
        });
        if (changed) {
            $app.save(col);
            console.log("[Apple-Zugang] Zugriffsregeln von \"" + APPLE + "\" wieder gesperrt.");
        }
        return col;
    }
    const fam = findCol("familien");
    if (!fam) throw new Error("Sammlung \"familien\" fehlt noch.");
    const def = {
        type: "base",
        name: APPLE,
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
            { name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: true },
            { name: "apple_id", type: "text", max: 200, hidden: true },
            { name: "passwort", type: "text", max: 2000, hidden: true },
            { name: "created", type: "autodate", onCreate: true, onUpdate: false },
            { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX `idx_pinn_apple_familie` ON `" + APPLE + "` (`familie`)"],
    };
    $app.save(new Collection(def));
    col = findCol(APPLE);
    if (!col) throw new Error("Sammlung \"" + APPLE + "\" wurde nicht gespeichert.");
    console.log("[Apple-Zugang] Gesperrte Sammlung \"" + APPLE + "\" angelegt.");
    return col;
}

function findRecord(familyId) {
    if (!validFamilyId(familyId)) return null;
    try { return $app.findFirstRecordByFilter(APPLE, "familie = {:f}", { f: familyId }); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------------------------
// Read / save / delete credentials
// ---------------------------------------------------------------------------------------------
function hasCredentials(familyId) {
    const rec = findRecord(familyId);
    return !!(rec && rec.getString("apple_id") && rec.getString("passwort"));
}

// { email, appPassword, configured, error }
function getCredentials(familyId) {
    const empty = { email: "", appPassword: "", configured: false, error: "" };
    const rec = findRecord(familyId);
    if (!rec) return empty;
    const email = rec.getString("apple_id");
    let res = null;
    try { res = decrypt(rec.getString("passwort")); } catch (e) {
        return { email: email, appPassword: "", configured: false, error: e.message };
    }
    if (!res) {
        return { email: email, appPassword: "", configured: false, error: "Das gespeicherte Passwort kann nicht entschlüsselt werden (Schlüssel geändert?). Bitte Apple-ID und App-spezifisches Passwort neu eingeben." };
    }
    if (!res.current) {
        // Encrypted with the old key -> switch to the current one
        try {
            rec.set("passwort", encrypt(res.text));
            $app.save(rec);
            console.log("[Apple-Zugang] Zugangsdaten einer Familie mit dem neuen Schlüssel neu verschlüsselt.");
        } catch (e) { /* again next time */ }
    }
    return { email: email, appPassword: res.text, configured: !!(email && res.text), error: "" };
}

function cleanAppleId(v) {
    return String(v || "").trim().slice(0, 200);
}
function cleanAppPassword(v) {
    return String(v || "").replace(/\s+/g, "").slice(0, 100);
}
function validateInput(appleId, appPassword) {
    if (!appleId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(appleId)) return "Bitte eine gültige Apple-ID (E-Mail-Adresse) eingeben.";
    if (!appPassword || appPassword.length < 8) return "Bitte das App-spezifische Passwort eingeben (Format xxxx-xxxx-xxxx-xxxx).";
    return "";
}

function saveCredentials(familyId, appleId, appPassword) {
    if (!validFamilyId(familyId)) throw new Error("Ungültige Familie.");
    const col = ensureCollection();
    let rec = findRecord(familyId);
    if (!rec) {
        rec = new Record(col);
        rec.set("familie", familyId);
    }
    rec.set("apple_id", appleId);
    rec.set("passwort", encrypt(appPassword));
    $app.save(rec);
}

function deleteCredentials(familyId) {
    const rec = findRecord(familyId);
    if (rec) $app.delete(rec);
}

// IDs of all families with stored credentials
function familiesWithCredentials() {
    try {
        return $app.findRecordsByFilter(APPLE, "apple_id != '' && passwort != ''", "", 0, 0).map(r => r.getString("familie")).filter(validFamilyId);
    } catch (e) { return []; }
}

// ---------------------------------------------------------------------------------------------
// Set-up + migration from the .env
// ---------------------------------------------------------------------------------------------
function migrateLegacyEnv() {
    const email = readEnv(LEGACY_ID_ENV);
    const pw = cleanAppPassword(readEnv(LEGACY_PW_ENV));
    if (!email || !pw) return;
    let target = null;
    try { target = $app.findFirstRecordByFilter("familien", "kalender = true"); } catch (e) { target = null; }
    if (!target) {
        try { target = $app.findRecordsByFilter("familien", "", "created", 1, 0)[0] || null; } catch (e) { target = null; }
    }
    if (!target) return; // no family yet - again on the next start
    if (findRecord(target.id)) {
        console.log("[Apple-Zugang] " + LEGACY_ID_ENV + " / " + LEGACY_PW_ENV + " sind bereits übernommen und können aus der .env entfernt werden.");
        return;
    }
    saveCredentials(target.id, cleanAppleId(email), pw);
    console.log("[Apple-Zugang] Zugangsdaten aus der .env verschlüsselt der Familie \"" + target.getString("name") + "\" übernommen. " + LEGACY_ID_ENV + " / " + LEGACY_PW_ENV + " können jetzt aus der .env entfernt werden.");
    // Hand over this family's previous shared calendar file, so that it is not empty until the
    // next sync
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        $os.rename(calendarSync.LEGACY_KALENDER_FILE_PATH, calendarSync.kalenderPfad(target.id));
    } catch (e) { /* does not exist */ }
}

function setup() {
    ensureCollection();
    keys(); // Check the key or generate it once (runs only once on start, without a race)
    try { migrateLegacyEnv(); } catch (e) { console.log("[Apple-Zugang] Übernahme aus der .env fehlgeschlagen: " + e.message); }
    // Remove the old shared calendar file (before the switch to per family)
    try { $os.remove(require(`${__hooks}/calendar-sync.js`).LEGACY_KALENDER_FILE_PATH); } catch (e) { /* does not exist */ }
}

module.exports = {
    APPLE, KEY_ENV, validFamilyId, ensureCollection, setup,
    encrypt, decrypt, // also for the Google access (pinn-google.js) - same key
    hasCredentials, getCredentials, saveCredentials, deleteCredentials, familiesWithCredentials,
    cleanAppleId, cleanAppPassword, validateInput,
};

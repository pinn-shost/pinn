// pb_hooks/pinn-apple.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Apple-Zugangsdaten JE FAMILIE (Apple-ID + App-spezifisches Passwort).
//
// Speicherort: gesperrte PocketBase-Sammlung "apple_zugaenge"
//  - legt sich beim Start selbst an (setup(), aufgerufen aus apple_credentials.pb.js)
//  - ALLE API-Regeln sind gesperrt (null): weder die App noch ein Browser kann die Sammlung lesen
//    oder beschreiben - nur die Server-Hooks und der Superuser im Dashboard
//  - Felder zusätzlich "hidden"
//  - das Passwort liegt AES-verschlüsselt in der Datenbank ($security.encrypt)
//  - Löschen einer Familie löscht ihre Zugangsdaten automatisch mit (cascadeDelete)
//
// Schlüssel für die Verschlüsselung (32 Zeichen):
//  - bevorzugt aus der .env: PINN_SCHLUESSEL
//  - fehlt er dort, wird beim ersten Start einmalig ein zufälliger Schlüssel erzeugt und in
//    pb_data/pinn_schluessel.txt abgelegt (damit alles ohne weitere Einrichtung funktioniert)
//  - wird PINN_SCHLUESSEL später gesetzt, werden vorhandene Zugangsdaten beim nächsten Zugriff
//    automatisch mit dem neuen Schlüssel neu verschlüsselt
//
// Derselbe Schlüssel verschlüsselt auch den Google-Zugang (pinn-google.js, Sammlung "google_zugaenge").
//
// Umzug: Stehen noch PINN_APPLE_ID / PINN_APPLE_APP_PASSWORD in der .env, werden sie beim Start
// einmalig verschlüsselt der Familie übernommen, der der Apple-Kalender bisher gehörte. Danach
// können beide Zeilen aus der .env entfernt werden.

const APPLE = "apple_zugaenge";
const KEY_ENV = "PINN_SCHLUESSEL";
const KEY_FILE = "/pb_data/pinn_schluessel.txt";
const LEGACY_ID_ENV = "PINN_APPLE_ID";
const LEGACY_PW_ENV = "PINN_APPLE_APP_PASSWORD";
const CLOSED_RULES = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"];

function readEnv(name) {
    try { return String($os.getenv(name) || "").trim(); } catch (e) { return ""; }
}

// PocketBase-IDs bestehen aus 15 Kleinbuchstaben/Ziffern - alles andere wird abgewiesen.
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
    } catch (e) { /* weiter */ }
    let s = "";
    for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
    return s;
}

// ---------------------------------------------------------------------------------------------
// Schlüssel
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

// [aktueller Schlüssel, ggf. alter Schlüssel]
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

// Gibt { text, current } zurück (current = mit dem aktuellen Schlüssel entschlüsselt) oder null.
function decrypt(cipher) {
    if (!cipher) return null;
    const ks = keys();
    for (let i = 0; i < ks.length; i++) {
        try {
            const t = $security.decrypt(String(cipher), ks[i]);
            if (t) return { text: String(t), current: i === 0 };
        } catch (e) { /* nächster Schlüssel */ }
    }
    return null;
}

// ---------------------------------------------------------------------------------------------
// Sammlung
// ---------------------------------------------------------------------------------------------
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}

function ensureCollection() {
    let col = findCol(APPLE);
    if (col) {
        // Regeln müssen gesperrt bleiben - falls jemand sie im Dashboard geöffnet hat, wieder schließen
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
// Zugangsdaten lesen / speichern / löschen
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
        // Mit dem alten Schlüssel verschlüsselt -> auf den aktuellen umstellen
        try {
            rec.set("passwort", encrypt(res.text));
            $app.save(rec);
            console.log("[Apple-Zugang] Zugangsdaten einer Familie mit dem neuen Schlüssel neu verschlüsselt.");
        } catch (e) { /* beim nächsten Mal erneut */ }
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

// IDs aller Familien mit hinterlegten Zugangsdaten
function familiesWithCredentials() {
    try {
        return $app.findRecordsByFilter(APPLE, "apple_id != '' && passwort != ''", "", 0, 0).map(r => r.getString("familie")).filter(validFamilyId);
    } catch (e) { return []; }
}

// ---------------------------------------------------------------------------------------------
// Einrichtung + Umzug aus der .env
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
    if (!target) return; // noch keine Familie - beim nächsten Start erneut
    if (findRecord(target.id)) {
        console.log("[Apple-Zugang] " + LEGACY_ID_ENV + " / " + LEGACY_PW_ENV + " sind bereits übernommen und können aus der .env entfernt werden.");
        return;
    }
    saveCredentials(target.id, cleanAppleId(email), pw);
    console.log("[Apple-Zugang] Zugangsdaten aus der .env verschlüsselt der Familie \"" + target.getString("name") + "\" übernommen. " + LEGACY_ID_ENV + " / " + LEGACY_PW_ENV + " können jetzt aus der .env entfernt werden.");
    // Bisherige gemeinsame Kalenderdatei dieser Familie übergeben, damit sie nicht bis zum
    // nächsten Abgleich leer ist
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        $os.rename(calendarSync.LEGACY_KALENDER_FILE_PATH, calendarSync.kalenderPfad(target.id));
    } catch (e) { /* nicht vorhanden */ }
}

function setup() {
    ensureCollection();
    keys(); // Schlüssel prüfen bzw. einmalig erzeugen (läuft beim Start nur einmal, ohne Wettlauf)
    try { migrateLegacyEnv(); } catch (e) { console.log("[Apple-Zugang] Übernahme aus der .env fehlgeschlagen: " + e.message); }
    // Alte gemeinsame Kalenderdatei (vor der Umstellung auf je Familie) entfernen
    try { $os.remove(require(`${__hooks}/calendar-sync.js`).LEGACY_KALENDER_FILE_PATH); } catch (e) { /* nicht vorhanden */ }
}

module.exports = {
    APPLE, KEY_ENV, validFamilyId, ensureCollection, setup,
    encrypt, decrypt, // auch für den Google-Zugang (pinn-google.js) - gleicher Schlüssel
    hasCredentials, getCredentials, saveCredentials, deleteCredentials, familiesWithCredentials,
    cleanAppleId, cleanAppPassword, validateInput,
};

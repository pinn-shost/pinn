// pb_hooks/pinn-wobistdu.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// „Wo bist du?“ (Übersicht → Kachel „Familienmitglieder“ → Person antippen):
//   - Jemand fragt eine Person, die gerade keinen Live-Standort teilt. Alle Profile, die mit diesem
//     Familienmitglied verknüpft sind, bekommen eine Push-Nachricht (Link /?wobistdu=<ID>).
//   - Die Person antwortet in pinn. mit ihrem aktuellen Standort (einmalig aus dem Browser – es wird
//     nichts dauerhaft geteilt) oder mit einer kurzen Antwort („Bin zu Hause“, „Bin gleich da“ …).
//   - Wer gefragt hat, bekommt die Antwort als Push-Nachricht und sieht sie in pinn. auf einer Karte.
//
// Daten: pb_data/pinn_wobistdu.json – nur die letzten 24 Stunden, ältere Anfragen werden verworfen.
//   [{ id, familie, von (Profil-ID), vonMitglied, vonName, an (Mitglied-ID), anName, zeit,
//      antwort: { zeit, lat, lon, genau, text, wer (Profil-ID) } }]
// Höchstens eine offene Frage je Fragendem und Person in 2 Minuten (kein Push-Gewitter).

const FILE = "/pb_data/pinn_wobistdu.json";
const KEEP_MS = 24 * 60 * 60 * 1000;
const REPEAT_MS = 2 * 60 * 1000;
const CODES = ["zuhause", "unterwegs", "gleich", "gut", "anrufen"];

module.exports = { ask, answer, listFor };

function readAll() {
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        const o = JSON.parse(calendarSync.bytesToText($os.readFile(FILE)));
        if (Array.isArray(o)) return o.filter(x => x && x.id && Date.now() - Number(x.zeit || 0) < KEEP_MS);
    } catch (e) { /* noch keine Datei */ }
    return [];
}
function writeAll(list) {
    try { $os.writeFile(FILE, JSON.stringify(list.slice(-300)), 420); } catch (e) { console.log("[Wo bist du] " + FILE + " nicht speicherbar: " + e.message); }
}
function newId() { return "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function cleanName(v) { return String(v || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 40); }

function langOf(u) {
    let w = {};
    try { w = require(`${__hooks}/pinn-design.js`).readDesign(u).werte || {}; } catch (e) { w = {}; }
    const s = String(w.sprache || "");
    if (["de", "en", "fr", "es"].indexOf(s) >= 0) return s;
    const land = String(w.land || "").toUpperCase();
    if (["DE", "AT", "CH", "LI", "LU"].indexOf(land) >= 0) return "de";
    if (["FR", "BE", "MC"].indexOf(land) >= 0) return "fr";
    if (["ES", "MX", "AR", "CO", "CL", "PE"].indexOf(land) >= 0) return "es";
    return "en";
}
const CODE_TEXT = {
    de: { zuhause: "🏠 Bin zu Hause", unterwegs: "🚶 Bin unterwegs", gleich: "⏱️ Bin gleich da", gut: "👍 Alles gut", anrufen: "📞 Ruf mich an" },
    en: { zuhause: "🏠 I'm at home", unterwegs: "🚶 I'm on the move", gleich: "⏱️ Almost there", gut: "👍 All good", anrufen: "📞 Call me" },
    fr: { zuhause: "🏠 Je suis à la maison", unterwegs: "🚶 Je suis en route", gleich: "⏱️ J'arrive bientôt", gut: "👍 Tout va bien", anrufen: "📞 Appelle-moi" },
    es: { zuhause: "🏠 Estoy en casa", unterwegs: "🚶 Estoy en camino", gleich: "⏱️ Llego enseguida", gut: "👍 Todo bien", anrufen: "📞 Llámame" },
};
function askMessage(lang, name) {
    const n = name || ({ de: "Jemand", en: "Someone", fr: "Quelqu'un", es: "Alguien" }[lang]);
    if (lang === "de") return { titel: "📍 " + n + " fragt: Wo bist du?", text: "Tippe hier, um deinen Standort zu schicken oder kurz zu antworten." };
    if (lang === "fr") return { titel: "📍 " + n + " demande : où es-tu ?", text: "Touche ici pour envoyer ta position ou répondre en un mot." };
    if (lang === "es") return { titel: "📍 " + n + " pregunta: ¿dónde estás?", text: "Toca aquí para enviar tu ubicación o responder rápido." };
    return { titel: "📍 " + n + " asks: where are you?", text: "Tap here to send your location or a quick reply." };
}
function answerMessage(lang, name, a) {
    const n = name || ({ de: "Jemand", en: "Someone", fr: "Quelqu'un", es: "Alguien" }[lang]);
    const t = a.text ? ((CODE_TEXT[lang] || CODE_TEXT.en)[a.text] || ("„" + a.text + "“")) : "";
    if (lang === "de") return { titel: "📍 " + n + " hat geantwortet", text: a.lat != null ? "Standort geschickt – tippe zum Ansehen." : t };
    if (lang === "fr") return { titel: "📍 " + n + " a répondu", text: a.lat != null ? "Position envoyée – touche pour la voir." : t };
    if (lang === "es") return { titel: "📍 " + n + " ha respondido", text: a.lat != null ? "Ubicación enviada: toca para verla." : t };
    return { titel: "📍 " + n + " replied", text: a.lat != null ? "Location sent – tap to view." : t };
}

function targetsFor(familyId, memberId) {
    try {
        return $app.findRecordsByFilter("benutzer", "familie = {:f} && mitglied = {:m} && rolle != 'gast'", "", 0, 0, { f: familyId, m: memberId });
    } catch (e) { return []; }
}

// Frage stellen
function ask(e, body) {
    const u = e.auth;
    const fam = u.getString("familie");
    if (!fam || u.getString("rolle") === "gast") throw new Error("Nicht erlaubt.");
    const an = String((body && body.an) || "").trim().slice(0, 100);
    if (!an) throw new Error("Keine Person gewählt.");
    if (an === u.getString("mitglied")) throw new Error("Das bist du selbst.");
    const targets = targetsFor(fam, an);
    if (!targets.length) throw new Error("Diese Person hat kein eigenes Profil in pinn. – bitte direkt anrufen.");
    const list = readAll();
    const now = Date.now();
    const same = list.filter(x => x.familie === fam && x.von === u.id && x.an === an && !x.antwort && now - Number(x.zeit) < REPEAT_MS).pop();
    if (same) return { id: same.id, schon: true };
    const item = {
        id: newId(), familie: fam, von: u.id, vonMitglied: u.getString("mitglied"), vonName: cleanName(body.name),
        an: an, anName: cleanName(body.anName), zeit: now, antwort: null,
    };
    list.push(item);
    writeAll(list);
    let sent = 0;
    try {
        const push = require(`${__hooks}/pinn-push.js`);
        targets.forEach(t => {
            const msg = askMessage(langOf(t), item.vonName);
            try { sent += push.notifyUser(t.id, { titel: msg.titel, text: msg.text, url: "/?wobistdu=" + item.id, tag: "wobistdu-" + item.id, urgency: "high" }) || 0; } catch (err) { /* nächstes Profil */ }
        });
    } catch (err) {
        console.log("[Wo bist du] Push: " + err.message);
    }
    return { id: item.id, push: sent };
}

// Antworten (nur die gefragte Person)
function answer(e, body) {
    const u = e.auth;
    const fam = u.getString("familie");
    const id = String((body && body.id) || "");
    const list = readAll();
    const item = list.find(x => x.id === id && x.familie === fam);
    if (!item) throw new Error("Diese Frage ist nicht mehr da.");
    if (item.an !== u.getString("mitglied")) throw new Error("Diese Frage ist nicht an dich gerichtet.");
    const a = { zeit: Date.now(), wer: u.id, lat: null, lon: null, genau: null, text: "" };
    const lat = Number(body.lat), lon = Number(body.lon);
    if (body.lat != null && isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) {
        a.lat = Math.round(lat * 1e6) / 1e6;
        a.lon = Math.round(lon * 1e6) / 1e6;
        const g = Number(body.genau);
        a.genau = isFinite(g) && g > 0 ? Math.round(g) : null;
    } else {
        const t = String(body.text || "").trim();
        if (CODES.indexOf(t) >= 0) a.text = t;
        else if (t) a.text = t.replace(/[\r\n\t]+/g, " ").slice(0, 80);
        else throw new Error("Keine Antwort.");
    }
    item.antwort = a;
    if (body.name) item.anName = cleanName(body.name);
    writeAll(list);
    let sent = 0;
    try {
        const asker = $app.findRecordById("benutzer", item.von);
        const msg = answerMessage(langOf(asker), item.anName, a);
        sent = require(`${__hooks}/pinn-push.js`).notifyUser(item.von, { titel: msg.titel, text: msg.text, url: "/?wobistdu=" + item.id, tag: "wobistdu-" + item.id, urgency: "high" }) || 0;
    } catch (err) {
        console.log("[Wo bist du] Push Antwort: " + err.message);
    }
    return { ok: true, push: sent };
}

// Für die App: eigene Fragen (mit Antworten) und Fragen an mich, letzte 24 Stunden
function listFor(e) {
    const u = e.auth;
    const fam = u.getString("familie");
    const me = u.getString("mitglied");
    const items = readAll().filter(x => x.familie === fam && (x.von === u.id || (me && x.an === me))).map(x => ({
        id: x.id, von: x.von, vonMitglied: x.vonMitglied || "", vonName: x.vonName || "", an: x.an, anName: x.anName || "",
        zeit: x.zeit, antwort: x.antwort || null, meine: x.von === u.id, anMich: !!me && x.an === me,
    }));
    return { jetzt: Date.now(), anfragen: items };
}

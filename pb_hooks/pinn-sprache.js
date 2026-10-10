// pb_hooks/pinn-sprache.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() aus sprache.pb.js.
//
// Sprachsteuerung (Einstellungen → Sprachsteuerung): Jedes Profil kann einen persönlichen, geheimen
// Link erzeugen. Ein Siri-Kurzbefehl (bzw. unter Android „HTTP Shortcuts“) schickt den gesprochenen
// Satz dorthin; pinn. versteht ihn (Deutsch, Englisch, Französisch, Spanisch) und antwortet mit einem
// Satz zum Vorlesen – in der Sprache des Profils.
//
// Befehle:
//   - Einkaufsliste ergänzen:  „Milch und zwei Packungen Eier auf die Einkaufsliste (bei Rewe)“
//   - Einkaufsliste vorlesen:  „Was steht auf der Einkaufsliste?“
//   - Aufgabe anlegen:         „Erinnere mich morgen an den Müll“ · „Aufgabe: Fenster putzen am Samstag“
//   - Tagesüberblick:          „Was steht heute an?“ · „Was steht morgen an?“ (Termine + offene Aufgaben)
//
// Sammlung „sprache_zugaenge“ (gesperrt, nur über die Routen): { benutzer, familie, token }
// Gäste haben keine Sprachsteuerung; Profile mit Kindersicherung können nur abfragen.
// Schutz: höchstens 30 Befehle je Minute und Link.

const COL = "sprache_zugaenge";
const USERS = "benutzer";
const LIMIT_PER_MIN = 30;

function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function ensureSchema() {
    if (findCol(COL)) return;
    try {
        $app.save(new Collection({
            type: "base",
            name: COL,
            fields: [
                { name: "benutzer", type: "text", max: 40, required: true },
                { name: "familie", type: "text", max: 40 },
                { name: "token", type: "text", max: 80 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: [
                "CREATE UNIQUE INDEX `idx_sprache_benutzer` ON `" + COL + "` (`benutzer`)",
                "CREATE INDEX `idx_sprache_token` ON `" + COL + "` (`token`)",
            ],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Sprache] Sammlung \"" + COL + "\" angelegt.");
    } catch (err) {
        console.log("[Sprache] Konnte Sammlung nicht anlegen: " + err.message);
    }
}
function newToken() {
    try { return $security.randomString(40); } catch (e) { /* weiter */ }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < 40; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
}
function recOfUser(userId) {
    if (!userId || !findCol(COL)) return null;
    try { return $app.findFirstRecordByFilter(COL, "benutzer = {:u}", { u: String(userId) }); } catch (e) { return null; }
}
function recOfToken(token) {
    const t = String(token || "").trim();
    if (t.length < 24 || !/^[A-Za-z0-9]+$/.test(t) || !findCol(COL)) return null;
    try { return $app.findFirstRecordByFilter(COL, "token = {:t}", { t: t }); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------------------------
// Profil: Sprache, Gast, Kindersicherung
// ---------------------------------------------------------------------------------------------
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
function isChildLocked(u, data) {
    const r = u.getString("rolle");
    if (r === "admin" || r === "hauptadmin" || r === "gast") return false;
    const members = Array.isArray(data && data.members) ? data.members : [];
    const m = members.find(x => x && x.id === u.getString("mitglied"));
    return !!(m && m.childLock);
}

// ---------------------------------------------------------------------------------------------
// Einrichten / Status (angemeldet)
// ---------------------------------------------------------------------------------------------
function statusFor(auth) {
    const rec = recOfUser(auth.id);
    let kind = false;
    try { kind = isChildLocked(auth, require(`${__hooks}/pinn-benutzer.js`).loadFamilyDataFor(auth.getString("familie"))); } catch (e) { kind = false; }
    return { aktiv: !!(rec && rec.getString("token")), token: rec ? rec.getString("token") : "", kind: kind };
}
function einrichten(auth, neu) {
    if (auth.getString("rolle") === "gast") throw new Error("Für Gastkonten nicht verfügbar.");
    if (!auth.getString("familie")) throw new Error("Keine Familie.");
    ensureSchema();
    let rec = recOfUser(auth.id);
    if (!rec) {
        rec = new Record(findCol(COL));
        rec.set("benutzer", auth.id);
    }
    rec.set("familie", auth.getString("familie"));
    if (neu || !rec.getString("token")) rec.set("token", newToken());
    $app.save(rec);
    return statusFor(auth);
}
function ausschalten(auth) {
    const rec = recOfUser(auth.id);
    if (rec) $app.delete(rec);
    return statusFor(auth);
}
function cleanupUser(userId) {
    const rec = recOfUser(userId);
    if (rec) { try { $app.delete(rec); } catch (e) { /* egal */ } }
}

// ---------------------------------------------------------------------------------------------
// Texte (Antworten)
// ---------------------------------------------------------------------------------------------
const T = {
    de: {
        help: "Ich kann Sachen auf die Einkaufsliste setzen, die Liste vorlesen, Aufgaben anlegen und sagen, was heute ansteht. Sag zum Beispiel: Milch und Eier auf die Einkaufsliste.",
        added: "Auf {l}: {i}.", already: "{i} steht schon auf {l}.", addedSome: "Auf {l}: {i}. Schon drauf war: {d}.",
        listEmpty: "{l} ist leer.", listHas: "Auf {l}: {i}.", more: "und {n} weitere",
        task: "Aufgabe angelegt: {t}{d}.", due: ", fällig {d}",
        today: "heute", tomorrow: "morgen", dayLead: { 0: "Heute", 1: "Morgen" },
        nothing: "{w} steht nichts an.", events: "Termine: {e}.", tasks: "Offene Aufgaben: {t}.", allday: "ganztägig",
        childLock: "Mit Kindersicherung kann ich nur vorlesen, was ansteht.", noItems: "Ich habe nicht verstanden, was auf die Liste soll.",
        noTask: "Ich habe nicht verstanden, welche Aufgabe ich anlegen soll.", error: "Das hat leider nicht geklappt: {m}",
        listName: "der Einkaufsliste", listNamed: "der Liste {n}", and: "und",
        days: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
    },
    en: {
        help: "I can add things to the shopping list, read the list, create tasks and tell you what's on today. For example, say: add milk and eggs to the shopping list.",
        added: "Added to {l}: {i}.", already: "{i} is already on {l}.", addedSome: "Added to {l}: {i}. Already on it: {d}.",
        listEmpty: "{l} is empty.", listHas: "On {l}: {i}.", more: "and {n} more",
        task: "Task created: {t}{d}.", due: ", due {d}",
        today: "today", tomorrow: "tomorrow", dayLead: { 0: "Today", 1: "Tomorrow" },
        nothing: "{w} there's nothing on.", events: "Events: {e}.", tasks: "Open tasks: {t}.", allday: "all day",
        childLock: "With child lock I can only read out what's on.", noItems: "I didn't catch what should go on the list.",
        noTask: "I didn't catch which task to create.", error: "Sorry, that didn't work: {m}",
        listName: "the shopping list", listNamed: "the {n} list", and: "and",
        days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    },
    fr: {
        help: "Je peux ajouter des articles à la liste de courses, lire la liste, créer des tâches et dire ce qui est prévu aujourd'hui. Dites par exemple : ajoute du lait et des œufs à la liste.",
        added: "Ajouté à {l} : {i}.", already: "{i} est déjà sur {l}.", addedSome: "Ajouté à {l} : {i}. Déjà dessus : {d}.",
        listEmpty: "{l} est vide.", listHas: "Sur {l} : {i}.", more: "et {n} autres",
        task: "Tâche créée : {t}{d}.", due: ", pour {d}",
        today: "aujourd'hui", tomorrow: "demain", dayLead: { 0: "Aujourd'hui", 1: "Demain" },
        nothing: "{w}, rien de prévu.", events: "Rendez-vous : {e}.", tasks: "Tâches ouvertes : {t}.", allday: "toute la journée",
        childLock: "Avec le contrôle parental, je peux seulement lire ce qui est prévu.", noItems: "Je n'ai pas compris quoi ajouter à la liste.",
        noTask: "Je n'ai pas compris quelle tâche créer.", error: "Désolé, ça n'a pas marché : {m}",
        listName: "la liste de courses", listNamed: "la liste {n}", and: "et",
        days: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
    },
    es: {
        help: "Puedo añadir cosas a la lista de la compra, leer la lista, crear tareas y decirte qué hay hoy. Di por ejemplo: añade leche y huevos a la lista.",
        added: "Añadido a {l}: {i}.", already: "{i} ya está en {l}.", addedSome: "Añadido a {l}: {i}. Ya estaba: {d}.",
        listEmpty: "{l} está vacía.", listHas: "En {l}: {i}.", more: "y {n} más",
        task: "Tarea creada: {t}{d}.", due: ", para {d}",
        today: "hoy", tomorrow: "mañana", dayLead: { 0: "Hoy", 1: "Mañana" },
        nothing: "{w} no hay nada.", events: "Citas: {e}.", tasks: "Tareas pendientes: {t}.", allday: "todo el día",
        childLock: "Con el control parental solo puedo leer lo que hay.", noItems: "No he entendido qué añadir a la lista.",
        noTask: "No he entendido qué tarea crear.", error: "Lo siento, no ha funcionado: {m}",
        listName: "la lista de la compra", listNamed: "la lista {n}", and: "y",
        days: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
    },
};
function fill(s, v) { return String(s).replace(/\{(\w)\}/g, (m, k) => (v[k] != null ? v[k] : "")); }
function joinList(arr, L) {
    if (arr.length <= 1) return arr.join("");
    return arr.slice(0, -1).join(", ") + " " + L.and + " " + arr[arr.length - 1];
}

// ---------------------------------------------------------------------------------------------
// Datum (Europe/Berlin, wie die übrigen Erinnerungen)
// ---------------------------------------------------------------------------------------------
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function lastSundayUtc(year, month) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1, 0, 0);
}
function tzOffsetMs(utcMs) {
    const y = new Date(utcMs).getUTCFullYear();
    return (utcMs >= lastSundayUtc(y, 2) && utcMs < lastSundayUtc(y, 9)) ? 7200000 : 3600000;
}
function wallIso(ms) { const d = new Date(ms + tzOffsetMs(ms)); return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()); }
function todayIso() { return wallIso(Date.now()); }
function addDays(iso, n) {
    const p = iso.split("-").map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}
function weekday(iso) { const p = iso.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); }
function diffDays(a, b) {
    const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
function dayWord(iso, L) {
    const t = todayIso();
    if (iso === t) return L.today;
    if (iso === addDays(t, 1)) return L.tomorrow;
    return L.days[weekday(iso)];
}

// ---------------------------------------------------------------------------------------------
// Satz verstehen
// ---------------------------------------------------------------------------------------------
const NUM = {
    eins: 1, ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, "fünf": 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, "zwölf": 12,
    one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
    un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12,
    uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12,
};
const UNITS = "kg|g|gramm|kilo|l|liter|litres?|litros?|ml|packungen|packung|päckchen|pck|dosen|dose|flaschen|flasche|gläser|glas|tüten|tüte|beutel|becher|stück|bund|kisten|kiste|rollen|rolle|tuben|tube|tafeln|tafel|netze|netz|packs?|packets?|cans?|tins?|bottles?|jars?|bags?|boxes|box|loaves|loaf|pieces?|cartons?|paquets?|bouteilles?|boîtes?|pots?|sachets?|canettes?|paquetes?|botellas?|latas?|botes?|bolsas?|cajas?|tarros?";
const ARTICLES = /^(?:noch\s+|bitte\s+|etwas\s+|neue[nsrm]?\s+|frische[nsrm]?\s+|ein(?:e[nsm]?)?\s+|die\s+|der\s+|das\s+|den\s+|some\s+|more\s+|the\s+|an?\s+|du\s+|de\s+la\s+|de\s+l'|des\s+|de\s+|d'|la\s+|le\s+|les\s+|l'|un\s+|une\s+|el\s+|los\s+|las\s+|unos\s+|unas\s+|algo\s+de\s+|más\s+)+/i;

function cleanSentence(text) {
    return String(text || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/^(?:hey\s+siri,?\s*|ok(?:ay)?\s+google,?\s*)?(?:pinn[.,:]?\s*)?/i, "").replace(/[.!?¡¿]+$/g, "").trim();
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function parseItems(raw) {
    const parts = String(raw || "").split(/\s*(?:,|;|\bund\b|\bsowie\b|\band\b|\bet\b|\by\b|\be\b|\bplus\b)\s*/i).map(x => x.trim()).filter(Boolean);
    const out = [];
    parts.forEach(part => {
        let p = part.replace(/^(?:noch|bitte|also|auch|also|then)\s+/i, "");
        let qty = "";
        const m = p.match(new RegExp("^(\\d+(?:[.,]\\d+)?|" + Object.keys(NUM).join("|") + ")\\s+(?:(" + UNITS + ")\\s+)?(?:(?:of|de|d')\\s*)?(.+)$", "i"));
        if (m) {
            const n = /^\d/.test(m[1]) ? m[1].replace(".", ",") : String(NUM[m[1].toLowerCase()]);
            const u = (m[2] || "").toLowerCase();
            if (/^(gramm)$/.test(u)) qty = n + " g";
            else if (/^(kilo)$/.test(u)) qty = n + " kg";
            else if (/^(liter|litres?|litros?)$/.test(u)) qty = n + " l";
            else if (/^(kg|g|l|ml)$/.test(u)) qty = n + " " + u;
            else if (u) qty = n + " " + (/^(dosen?|packung(en)?|päckchen|flaschen?|gläser|glas|tüten?|beutel|becher|stück|bund|kisten?|rollen?|tuben?|tafeln?|netze?)$/.test(u) ? cap(u) : u);
            else if (Number(n.replace(",", ".")) > 1) qty = n;
            p = m[3];
        }
        p = p.replace(ARTICLES, "").trim();
        if (p && p.length <= 80) out.push({ name: cap(p), qty: qty });
    });
    return out;
}

// Datumsangabe aus einem Aufgabensatz lösen -> { iso, rest }
function parseDate(text) {
    let s = " " + text + " ";
    const t = todayIso();
    let iso = "";
    const rules = [
        [/\s(?:übermorgen|day after tomorrow|après-demain|pasado mañana)\s/i, 2],
        [/\s(?:morgen|tomorrow|demain|mañana)\s/i, 1],
        [/\s(?:heute|today|aujourd'hui|hoy)\s/i, 0],
    ];
    for (const [re, n] of rules) { if (re.test(s)) { iso = addDays(t, n); s = s.replace(re, " "); break; } }
    if (!iso) {
        const names = [
            ["sonntag", "sunday", "dimanche", "domingo"], ["montag", "monday", "lundi", "lunes"], ["dienstag", "tuesday", "mardi", "martes"],
            ["mittwoch", "wednesday", "mercredi", "miércoles"], ["donnerstag", "thursday", "jeudi", "jueves"], ["freitag", "friday", "vendredi", "viernes"],
            ["samstag", "saturday", "samedi", "sábado"],
        ];
        for (let wd = 0; wd < 7 && !iso; wd++) {
            for (const nm of names[wd]) {
                const re = new RegExp("\\s(?:am\\s+|on\\s+|le\\s+|el\\s+|this\\s+|next\\s+|nächsten\\s+|kommenden\\s+)?" + nm + "\\s", "i");
                if (re.test(s)) {
                    let d = (wd - weekday(t) + 7) % 7;
                    if (d === 0) d = 7;
                    iso = addDays(t, d);
                    s = s.replace(re, " ");
                    break;
                }
            }
        }
    }
    let rest = s.replace(/\s+/g, " ").trim()
        .replace(/^(?:daran,?\s*|an\s+(?:den|die|das)?\s*|dass\s+(?:ich|wir)\s+|to\s+|that\s+|de\s+|d'|que\s+)/i, "")
        .replace(/\s+(?:zu\s+)?(?:erledigen|machen)$/i, "")
        .trim();
    return { iso, rest: cap(rest) };
}

function intentOf(text) {
    const s = text.toLowerCase();
    // Einkaufsliste vorlesen
    if (/(was|welche).*\b(auf|steht|stehen)\b.*liste\b|liste vorlesen|lies? .*liste|was (muss|soll|müssen) (ich|wir) (noch )?(ein)?kaufen|what'?s on (the |my |our )?(shopping )?list|read (out )?(the |my )?(shopping )?list|what do (i|we) need to buy|qu'?est-ce qu'?il y a sur la liste|lis la liste|qu'?est-ce que (je dois|nous devons|on doit) acheter|qu[eé] hay en la lista|lee la lista|qu[eé] (tengo|tenemos|hay) que comprar/.test(s)) {
        const shop = s.match(/\b(?:bei|von|at|from|chez|de|en|para)\s+([a-zäöüéèàñ0-9][\wäöüéèàñ' -]{1,30})$/i);
        return { art: "liste", laden: shop ? shop[1] : "" };
    }
    // Einkaufsliste ergänzen
    const add = [
        /^(?:bitte\s+)?(?:setz(?:e)?|schreib(?:e)?|pack(?:e)?|füg(?:e)?|trag(?:e)?|tu)?\s*(.+?)\s+(?:auf|zur|in die|zu der)\s+(?:die\s+|meine\s+|unsere\s+)?(?:einkaufsliste|liste|einkaufszettel)(?:\s+(?:bei|für|von)\s+(.+?))?(?:\s+(?:hinzu|ein|dazu|drauf))?$/i,
        /^(?:wir brauchen|ich brauche|kauf(?:e|en)?|einkaufen|einkauf)[:\s]+(.+?)(?:\s+(?:bei|von)\s+(.+))?$/i,
        /^(?:please\s+)?(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:the|my|our)\s+(?:shopping\s+)?(?:list)(?:\s+(?:at|for)\s+(.+))?$/i,
        /^(?:we need|i need|buy)\s+(.+?)(?:\s+(?:at|from)\s+(.+))?$/i,
        /^(?:ajoute|mets|rajoute|note)\s+(.+?)\s+(?:à|a|sur|dans)\s+(?:la|ma)\s+liste(?:\s+de\s+courses)?(?:\s+(?:chez|pour)\s+(.+))?$/i,
        /^(?:il (?:nous|me) faut|achète|acheter)\s+(.+?)(?:\s+chez\s+(.+))?$/i,
        /^(?:añade|agrega|pon|apunta)\s+(.+?)\s+(?:a|en)\s+la\s+lista(?:\s+de\s+la\s+compra)?(?:\s+(?:de|para|en)\s+(.+))?$/i,
        /^(?:necesitamos|necesito|compra|comprar)\s+(.+?)(?:\s+en\s+(.+))?$/i,
    ];
    for (const re of add) {
        const m = text.match(re);
        if (m) return { art: "kaufen", items: parseItems(m[1]), laden: m[2] || "" };
    }
    // Aufgabe
    const task = [
        /^(?:erinnere|erinner)\s+(?:mich|uns)\s+(.+)$/i,
        /^(?:neue\s+)?(?:aufgabe|todo|to-do|to do)[:\s]+(.+)$/i,
        /^remind (?:me|us)\s+(.+)$/i,
        /^(?:new\s+|add\s+(?:a\s+)?)?(?:task|to-?do)[:\s]+(.+)$/i,
        /^rappelle[- ](?:moi|nous)\s+(.+)$/i,
        /^(?:nouvelle\s+|ajoute\s+(?:une\s+)?)?tâche[:\s]+(.+)$/i,
        /^recu[eé]rda(?:me|nos)\s+(.+)$/i,
        /^(?:nueva\s+|añade\s+(?:una\s+)?)?tarea[:\s]+(.+)$/i,
    ];
    for (const re of task) {
        const m = text.match(re);
        if (m) return Object.assign({ art: "aufgabe" }, parseDate(m[1]));
    }
    // Tagesüberblick
    if (/(was|welche).*(heute|morgen)|termine (heute|morgen)|mein tag|tagesüberblick|was (ist|gibt'?s) (heute|morgen)|what'?s (on|happening|planned|up)|(today|tomorrow)'?s? (plan|agenda|schedule)|my day|agenda|qu'?est-ce qu'?il y a|programme|ma journée|qu'?est-ce que j'?ai|qu[eé] (tengo|hay|tenemos)|mi día|mi agenda/.test(s)) {
        const morgen = /(\bmorgen\b|tomorrow|demain|mañana)/.test(s) && !/(übermorgen|pasado mañana|après-demain)/.test(s);
        return { art: "tag", offset: morgen ? 1 : 0 };
    }
    return { art: "hilfe" };
}

// ---------------------------------------------------------------------------------------------
// Einkaufsliste
// ---------------------------------------------------------------------------------------------
function norm(s) { return String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, ""); }
function targetList(data, laden) {
    const lists = Array.isArray(data.shoppingLists) ? data.shoppingLists.filter(l => l && l.id && l.id !== "essensplanung") : [];
    if (laden) {
        const k = norm(laden);
        const hit = lists.find(l => norm(l.name) === k) || lists.find(l => k && (norm(l.name).indexOf(k) >= 0 || k.indexOf(norm(l.name)) >= 0));
        if (hit) return hit;
    }
    const tgt = data.shoppingMealTarget && data.shoppingMealTarget.listId;
    const main = tgt ? lists.find(l => l.id === tgt) : null;
    return main || { id: "essensplanung", name: "" };
}
function listLabel(list, L) { return list && list.name ? fill(L.listNamed, { n: list.name }) : L.listName; }
function itemText(it) { return (it.qty ? it.qty + " " : "") + it.name; }

function addItems(familyId, auth, intent, L) {
    if (!intent.items.length) return { antwort: L.noItems };
    let reply = "", changed = false;
    let before = null, after = null;
    $app.runInTransaction((tx) => {
        const rec = tx.findFirstRecordByFilter("familien_daten", "familie = {:f}", { f: String(familyId) });
        const data = require(`${__hooks}/calendar-sync.js`).parseRecordData(rec.get("data")) || {};
        const items = Array.isArray(data.shoppingItems) ? data.shoppingItems : [];
        before = Object.assign({}, data, { shoppingItems: items.slice() });
        const list = targetList(data, intent.laden);
        const listId = list.id;
        const added = [], dup = [];
        intent.items.forEach((it, i) => {
            const exists = items.find(x => x && !x.done && (x.listId || "essensplanung") === listId && norm(x.name) === norm(it.name));
            if (exists) { dup.push(it.name); return; }
            items.push({
                id: "si" + Date.now().toString(36) + i + Math.random().toString(36).slice(2, 6),
                name: it.name, qty: it.qty, note: "", done: false, createdAt: Date.now(), listId: listId, voice: true,
            });
            added.push(itemText(it));
        });
        data.shoppingItems = items;
        const ll = listLabel(list, L);
        if (added.length) {
            rec.set("data", data);
            tx.save(rec);
            changed = true;
            after = data;
            reply = dup.length ? fill(L.addedSome, { l: ll, i: joinList(added, L), d: joinList(dup, L) }) : fill(L.added, { l: ll, i: joinList(added, L) });
        } else {
            reply = fill(L.already, { l: ll, i: joinList(dup, L) });
        }
    });
    if (changed) {
        try { require(`${__hooks}/pinn-hinweise.js`).afterSave(familyId, before, after, auth); } catch (err) { console.log("[Sprache] Hinweise: " + err.message); }
    }
    return { antwort: reply, geaendert: changed };
}
function readList(familyId, intent, L) {
    const data = require(`${__hooks}/pinn-benutzer.js`).loadFamilyDataFor(familyId) || {};
    const items = (Array.isArray(data.shoppingItems) ? data.shoppingItems : []).filter(x => x && !x.done && x.name);
    let list = null, open = items;
    if (intent.laden) {
        list = targetList(data, intent.laden);
        open = items.filter(x => (x.listId || "essensplanung") === list.id);
    }
    const ll = list ? listLabel(list, L) : cap(L.listName);
    if (!open.length) return { antwort: fill(L.listEmpty, { l: cap(ll) }) };
    const names = open.slice(0, 15).map(itemText);
    if (open.length > 15) names.push(fill(L.more, { n: open.length - 15 }));
    return { antwort: fill(L.listHas, { l: ll, i: joinList(names, L) }) };
}

// ---------------------------------------------------------------------------------------------
// Aufgaben
// ---------------------------------------------------------------------------------------------
function createTask(familyId, auth, intent, L) {
    const title = String(intent.rest || "").slice(0, 120);
    if (!title) return { antwort: L.noTask };
    const lib = require(`${__hooks}/pinn-aufgaben.js`);
    const task = lib.saveTask({ title: title, notes: "", dueDate: intent.iso || "", neu: true }, auth.id, familyId);
    try { require(`${__hooks}/pinn-hinweise.js`).taskCreated(familyId, task, auth); } catch (err) { /* egal */ }
    return { antwort: fill(L.task, { t: title, d: intent.iso ? fill(L.due, { d: dayWord(intent.iso, L) }) : "" }), geaendert: true };
}

// ---------------------------------------------------------------------------------------------
// Tagesüberblick: Termine (Familienkalender + eigene Kalender) und offene Aufgaben
// ---------------------------------------------------------------------------------------------
function unfold(text) { return String(text || "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/); }
function parseDt(line) {
    // DTSTART;TZID=Europe/Berlin:20261010T090000 | DTSTART;VALUE=DATE:20261010 | DTSTART:20261010T070000Z
    const i = line.indexOf(":");
    if (i < 0) return null;
    const v = line.slice(i + 1).trim();
    const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    if (!m[4]) return { date: m[1] + "-" + m[2] + "-" + m[3], time: "", allDay: true };
    if (m[7]) {
        const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
        const d = new Date(ms + tzOffsetMs(ms));
        return { date: wallIso(ms), time: pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()), allDay: false };
    }
    return { date: m[1] + "-" + m[2] + "-" + m[3], time: m[4] + ":" + m[5], allDay: false };
}
function parseEvents(text) {
    const out = [];
    let cur = null;
    unfold(text).forEach(line => {
        if (line === "BEGIN:VEVENT") { cur = { exdates: [] }; return; }
        if (line === "END:VEVENT") { if (cur && cur.start) out.push(cur); cur = null; return; }
        if (!cur) return;
        const key = line.split(/[;:]/)[0].toUpperCase();
        if (key === "DTSTART") cur.start = parseDt(line);
        else if (key === "DTEND") cur.end = parseDt(line);
        else if (key === "SUMMARY") cur.summary = line.slice(line.indexOf(":") + 1).replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, " ").trim();
        else if (key === "RRULE") cur.rrule = line.slice(line.indexOf(":") + 1);
        else if (key === "UID") cur.uid = line.slice(line.indexOf(":") + 1).trim();
        else if (key === "RECURRENCE-ID") cur.recur = parseDt(line);
        else if (key === "EXDATE") { line.slice(line.indexOf(":") + 1).split(",").forEach(v => { const d = parseDt("X:" + v.trim()); if (d) cur.exdates.push(d.date); }); }
        else if (key === "STATUS") cur.cancelled = /CANCELLED/i.test(line);
        else if (key === "X-PINN-OWNER") cur.owner = line.slice(line.indexOf(":") + 1).trim();
    });
    return out;
}
function occursOn(ev, day) {
    const s = ev.start.date;
    if (day < s || ev.exdates.indexOf(day) >= 0) return false;
    if (!ev.rrule) {
        if (ev.start.allDay) {
            const end = ev.end && ev.end.date > s ? ev.end.date : addDays(s, 1);
            return day < end;
        }
        return day === s;
    }
    const r = {};
    ev.rrule.split(";").forEach(p => { const kv = p.split("="); r[(kv[0] || "").toUpperCase()] = kv[1] || ""; });
    const interval = Math.max(1, Number(r.INTERVAL) || 1);
    if (r.UNTIL) { const u = parseDt("X:" + r.UNTIL); if (u && day > u.date) return false; }
    const dd = diffDays(s, day);
    const count = Number(r.COUNT) || 0;
    const pd = s.split("-").map(Number), pq = day.split("-").map(Number);
    switch (r.FREQ) {
        case "DAILY": return dd % interval === 0 && (!count || dd / interval < count);
        case "WEEKLY": {
            const codes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
            const by = r.BYDAY ? r.BYDAY.split(",").map(x => x.slice(-2)) : [codes[weekday(s)]];
            if (by.indexOf(codes[weekday(day)]) < 0) return false;
            const weeks = Math.floor((dd + ((weekday(s) + 6) % 7)) / 7);
            return weeks % interval === 0 && (!count || weeks / interval < Math.ceil(count / by.length));
        }
        case "MONTHLY": {
            const months = (pq[0] - pd[0]) * 12 + (pq[1] - pd[1]);
            if (months % interval !== 0 || (count && months / interval >= count)) return false;
            if (r.BYDAY) {
                const m = r.BYDAY.match(/^(-?\d)?([A-Z]{2})$/);
                if (!m) return false;
                const codes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
                if (codes[weekday(day)] !== m[2]) return false;
                const n = Number(m[1] || 1);
                if (n > 0) return Math.ceil(pq[2] / 7) === n;
                const dim = new Date(Date.UTC(pq[0], pq[1], 0)).getUTCDate();
                return pq[2] + 7 > dim;
            }
            return pq[2] === pd[2];
        }
        case "YEARLY": {
            const years = pq[0] - pd[0];
            return years % interval === 0 && (!count || years / interval < count) && pq[1] === pd[1] && pq[2] === pd[2];
        }
        default: return day === s;
    }
}
function eventsOn(familyId, userId, day) {
    let text = "";
    try { text += require(`${__hooks}/calendar-sync.js`).readCalendarText(familyId) || ""; } catch (e) { /* egal */ }
    try { text += "\n" + (require(`${__hooks}/pinn-kalender.js`).icsAllForFamily(familyId) || ""); } catch (e) { /* egal */ }
    const evs = parseEvents(text).filter(ev => !ev.cancelled && (!ev.owner || ev.owner === userId));
    const overridden = {};
    evs.filter(ev => ev.recur && ev.uid).forEach(ev => { overridden[ev.uid + "|" + ev.recur.date] = true; });
    const seen = {};
    const out = [];
    evs.forEach(ev => {
        if (ev.recur) { if (ev.start.date !== day) return; }
        else if (ev.uid && overridden[ev.uid + "|" + day]) return;
        else if (!occursOn(ev, day)) return;
        const k = (ev.summary || "") + "|" + ev.start.time;
        if (seen[k]) return;
        seen[k] = true;
        out.push({ time: ev.start.allDay ? "" : ev.start.time, title: ev.summary || "" });
    });
    return out.sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));
}
function dayOverview(familyId, auth, intent, L) {
    const day = addDays(todayIso(), intent.offset || 0);
    const evs = eventsOn(familyId, auth.id, day).filter(e => e.title);
    let tasks = [];
    try {
        tasks = (require(`${__hooks}/pinn-aufgaben.js`).listAll(familyId) || [])
            .filter(t => t && !t.done && (t.title || t.titel) && t.dueDate && (intent.offset ? t.dueDate === day : t.dueDate <= day));
    } catch (e) { tasks = []; }
    const lead = L.dayLead[intent.offset ? 1 : 0];
    if (!evs.length && !tasks.length) return { antwort: fill(L.nothing, { w: lead }) };
    const parts = [lead + ":"];
    if (evs.length) {
        const list = evs.slice(0, 8).map(e => (e.time ? e.time + " " : "") + e.title);
        if (evs.length > 8) list.push(fill(L.more, { n: evs.length - 8 }));
        parts.push(fill(L.events, { e: joinList(list, L) }));
    }
    if (tasks.length) {
        const list = tasks.slice(0, 8).map(t => String(t.title || t.titel).replace(/^\S+\s(?=\S)/u, m => (/\p{Extended_Pictographic}/u.test(m) ? "" : m)));
        if (tasks.length > 8) list.push(fill(L.more, { n: tasks.length - 8 }));
        parts.push(fill(L.tasks, { t: joinList(list, L) }));
    }
    return { antwort: parts.join(" ") };
}

// ---------------------------------------------------------------------------------------------
// Einstieg: Befehl über den geheimen Link
// ---------------------------------------------------------------------------------------------
function befehl(token, text) {
    const rec = recOfToken(token);
    if (!rec) return { ok: false, status: 403, antwort: "Dieser Link ist nicht (mehr) gültig – bitte in pinn. unter Einstellungen → Sprachsteuerung neu einrichten." };
    let user = null;
    try { user = $app.findRecordById(USERS, rec.getString("benutzer")); } catch (e) { user = null; }
    if (!user || user.getString("rolle") === "gast" || !user.getString("familie")) {
        return { ok: false, status: 403, antwort: "Dieses Profil hat keine Sprachsteuerung." };
    }
    const familyId = user.getString("familie");
    const lang = langOf(user);
    const L = T[lang] || T.en;
    // Schutz vor Dauerfeuer: 30 Befehle je Minute und Link
    try {
        const k = "pinnSprache:" + rec.id + ":" + Math.floor(Date.now() / 60000);
        const n = Number($app.store().get(k) || 0) + 1;
        $app.store().set(k, n);
        if (n > LIMIT_PER_MIN) return { ok: false, status: 429, antwort: fill(L.error, { m: "429" }) };
    } catch (e) { /* egal */ }

    const sentence = cleanSentence(text);
    if (!sentence) return { ok: true, antwort: L.help };
    const intent = intentOf(sentence);
    try {
        if (intent.art === "kaufen" || intent.art === "aufgabe") {
            let locked = false;
            try { locked = isChildLocked(user, require(`${__hooks}/pinn-benutzer.js`).loadFamilyDataFor(familyId)); } catch (e) { locked = false; }
            if (locked) return { ok: true, antwort: L.childLock };
        }
        let r;
        if (intent.art === "kaufen") r = addItems(familyId, user, intent, L);
        else if (intent.art === "liste") r = readList(familyId, intent, L);
        else if (intent.art === "aufgabe") r = createTask(familyId, user, intent, L);
        else if (intent.art === "tag") r = dayOverview(familyId, user, intent, L);
        else r = { antwort: L.help };
        return Object.assign({ ok: true, art: intent.art }, r);
    } catch (err) {
        console.log("[Sprache] " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("Sprachsteuerung", err.message, {}); } catch (e) { /* Protokoll nicht verfügbar */ }
        return { ok: false, status: 200, antwort: fill(L.error, { m: err.message }) };
    }
}

module.exports = { ensureSchema, statusFor, einrichten, ausschalten, cleanupUser, befehl, intentOf, parseItems, parseDate, parseEvents, occursOn };

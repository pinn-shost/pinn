// pb_hooks/pinn-pushtext.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Push-Texte vom Server in der Sprache des Empfängers und passend zur Wohnform (Familie oder WG).
//
// Alle Server-Pushes laufen über pinn-push.js#notifyUserDetailed. Dort wird jede Nachricht einmal je
// Empfänger mit localize(userId, msg) umgeschrieben – bevor sie in die Warteschlange fürs Handy und
// unter die 🔔 Glocke kommt. Die Module (Ortung, Pinnwand, Kassen, Verträge …) bauen ihre Texte also
// weiter auf Deutsch; hier stehen die Übersetzungen an einer Stelle.
//
//  - Sprache: aus dem Profil (persönliches Design, Wert „sprache“: de, en, fr, es). Ohne Angabe: Deutsch.
//  - Wohnform: aus den Familiendaten (Feld „wohnform“: 'familie' oder 'wg'). Gelesen wird nur dieses
//    eine Feld per SQL (json_extract), nicht die großen Familiendaten; das Ergebnis bleibt im
//    Zwischenspeicher, bis sich die Familiendaten ändern.
//  - Die WG-Begriffe sind dieselben wie in der App (index.html, PINN_I18N → TERMS): Familie → WG,
//    family → flatshare, famille → colocation, familia → piso compartido usw.
//
// Übersetzt wird je Nachrichtenart (Tag der Nachricht, z. B. „sos-…“, „termin-…“) mit festen Mustern.
// Frei eingegebene Inhalte (Namen, Termintitel, Zettel-Texte, Adressen) bleiben unverändert. Was kein
// Muster trifft, bleibt Deutsch – eine unbekannte Meldung geht also nie verloren.

const LANGS = ["de", "en", "fr", "es"];

// ---------------------------------------------------------------------------------------------
// Sprache und Wohnform des Empfängers
// ---------------------------------------------------------------------------------------------
function langOfUser(userRec) {
    try {
        const w = require(`${__hooks}/pinn-design.js`).readDesign(userRec).werte || {};
        const c = String(w.sprache || "").slice(0, 2).toLowerCase();
        return LANGS.indexOf(c) >= 0 ? c : "de";
    } catch (e) { return "de"; }
}

const WF_KEY = "pinnWohnform:";
function wohnformOf(familyId) {
    if (!familyId) return "familie";
    let stamp = "";
    try { stamp = require(`${__hooks}/pinn-benutzer.js`).familyDataStamp(familyId); } catch (e) { stamp = ""; }
    try {
        const raw = $app.store().get(WF_KEY + familyId);
        if (raw) {
            const c = JSON.parse(String(raw));
            if (c && c.s === stamp && stamp) return c.w === "wg" ? "wg" : "familie";
        }
    } catch (e) { /* neu lesen */ }
    let w = "";
    try {
        const m = new DynamicModel({ w: "" });
        $app.db().newQuery("SELECT COALESCE(json_extract(data, '$.wohnform'), '') AS w FROM familien_daten WHERE familie = {:f} LIMIT 1")
            .bind({ f: String(familyId) }).one(m);
        w = String(m.w || "");
    } catch (e) {
        // SQLite ohne JSON-Funktionen (sollte es nicht geben): einmal die Familiendaten lesen
        try { w = String((require(`${__hooks}/pinn-benutzer.js`).loadFamilyDataFor(familyId) || {}).wohnform || ""); } catch (e2) { w = ""; }
    }
    w = w === "wg" ? "wg" : "familie";
    try { $app.store().set(WF_KEY + familyId, JSON.stringify({ s: stamp, w: w })); } catch (e) { /* egal */ }
    return w;
}

// ---------------------------------------------------------------------------------------------
// WG-Begriffe (wie in der App: index.html → TERMS)
// ---------------------------------------------------------------------------------------------
function cap(up, s) { return up ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
const FAM_EMOJI = /\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67(?:\u200D\uD83D\uDC66)?/g;
const WG_EMOJI = "\uD83E\uDDD1\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1";
const TERMS = {
    de: { keep: /Familienstammbuch|Familienkutsche/g, rules: [
        [/\b([Jj])edes Familienmitglied\b/g, "$1eder Mitbewohner"],
        [/\b([Dd])as Familienmitglied\b/g, "$1er Mitbewohner"],
        [/\b([Ee])in weiteres Familienmitglied\b/g, "$1inen weiteren Mitbewohner"],
        [/\b(an|für|über|Bitte|bitte) ein Familienmitglied\b/g, "$1 einen Mitbewohner"],
        [/\b([Nn])eues Familienmitglied\b/g, "$1euer Mitbewohner"],
        [/Familienmitgliedern/g, "Mitbewohnern"],
        [/Familienmitglieds/g, "Mitbewohners"],
        [/Familienmitglieder/g, "Mitbewohner"],
        [/Familienmitglied/g, "Mitbewohner"],
        [/\b(den|allen|zwischen) Familien(?![-\wÄÖÜäöüß])/g, "$1 Haushalten"],
        [/\bFamilien(?![-\wÄÖÜäöüß])/g, "Haushalte"],
        [/\b[Ff]amilien-(?=[A-Za-zÄÖÜäöü])/g, "WG-"],
        [/\b([Ff])amilien([a-zäöüß])/g, (m, f, c) => "WG-" + (f === "F" ? c.toUpperCase() : c)],
        [/\b[Ff]amilie\b/g, "WG"],
    ] },
    en: { keep: /family register|[Ff]amily bus/g, rules: [
        [/\b([Ff])amily members\b/g, (m, f) => cap(f === "F", "flatmates")],
        [/\b([Ff])amily member\b/g, (m, f) => cap(f === "F", "flatmate")],
        [/\b([Ff])amilies\b/g, (m, f) => cap(f === "F", "households")],
        [/\b([Ff])amily\b/g, (m, f) => cap(f === "F", "flatshare")],
    ] },
    fr: { keep: /livret de famille|nom de famille|voiture familiale/g, rules: [
        [/\b([Mm])embres de (?:la|ta|votre|cette) famille\b/g, (m, f) => cap(f === "M", "colocataires")],
        [/\b([Mm])embre de (?:la|ta|votre|cette) famille\b/g, (m, f) => cap(f === "M", "colocataire")],
        [/\b([Tt])outes les familles\b/g, "$1ous les foyers"],
        [/\b([Ff])amilles\b/g, (m, f) => cap(f === "F", "foyers")],
        [/\bfamili(?:aux|ales|ale|al)\b/g, "de la colocation"],
        [/\b([Ff])amille\b/g, (m, f) => cap(f === "F", "colocation")],
    ] },
    es: { keep: /libro de familia|coche familiar/g, rules: [
        [/\b([Mm])iembros de (?:la|tu|esta) familia\b/g, (m, f) => cap(f === "M", "compañeros de piso")],
        [/\b([Mm])iembro de (?:la|tu|esta) familia\b/g, (m, f) => cap(f === "M", "compañero de piso")],
        [/\b([Tt])odas las familias\b/g, "$1odos los hogares"],
        [/\b([Ll])as familias\b/g, "$1os hogares"],
        [/\b([Ff])amilias\b/g, (m, f) => cap(f === "F", "hogares")],
        [/\bde la familia\b/g, "del piso compartido"],
        [/\ba la familia\b/g, "al piso compartido"],
        [/\b([Tt])oda la familia\b/g, "$1odo el piso compartido"],
        [/\b([Ll])a familia\b/g, (m, f) => cap(f === "L", "el piso compartido")],
        [/\b([Uu])na familia\b/g, (m, f) => cap(f === "U", "un piso compartido")],
        [/\b([Ee])sta familia\b/g, (m, f) => cap(f === "E", "este piso compartido")],
        [/\b([Oo])tra familia\b/g, (m, f) => cap(f === "O", "otro piso compartido")],
        [/\b([Nn])inguna familia\b/g, (m, f) => cap(f === "N", "ningún piso compartido")],
        [/\bfamiliares\b/g, "del piso"],
        [/\bfamiliar\b/g, "del piso"],
        [/\b([Ff])amilia\b/g, (m, f) => cap(f === "F", "piso compartido")],
    ] },
};
const TERM_HINT = /[Ff]amil|\uD83D\uDC68\u200D\uD83D\uDC69/;
function applyTerms(s, lang) {
    const T = TERMS[lang] || TERMS.de;
    if (!s || !TERM_HINT.test(s)) return s;
    const kept = [];
    s = s.replace(T.keep, m => { kept.push(m); return "\u0001" + (kept.length - 1) + "\u0002"; });
    for (let i = 0; i < T.rules.length; i++) s = s.replace(T.rules[i][0], T.rules[i][1]);
    s = s.replace(FAM_EMOJI, WG_EMOJI);
    if (kept.length) s = s.replace(/\u0001(\d+)\u0002/g, (m, i) => kept[+i]);
    return s;
}

// ---------------------------------------------------------------------------------------------
// Übersetzungen
// Regel: [Muster (deutscher Text), { en, fr, es }]
// In den Vorlagen: {n} = Teil n, ebenfalls übersetzt · <n> = Teil n unverändert (Namen, Titel …)
//                  [n] = Namensliste („A, B und C“ → „A, B and C“) · Funktion (g, h) für Sonderfälle
// „…“ in den Vorlagen werden am Ende in die Anführungszeichen der Sprache umgewandelt.
// ---------------------------------------------------------------------------------------------
const WD = {
    en: { So: "Sun", Mo: "Mon", Di: "Tue", Mi: "Wed", Do: "Thu", Fr: "Fri", Sa: "Sat" },
    fr: { So: "dim.", Mo: "lun.", Di: "mar.", Mi: "mer.", Do: "jeu.", Fr: "ven.", Sa: "sam." },
    es: { So: "dom", Mo: "lun", Di: "mar", Mi: "mié", Do: "jue", Fr: "vie", Sa: "sáb" },
};
const AND = { en: " and ", fr: " et ", es: " y " };
function plural(n, one, many) { return Number(n) === 1 ? one : many; }

// Wörter und Wendungen, die als Teil anderer Texte vorkommen (überall gültig)
const EXACT = {
    "Morgen": { en: "Tomorrow", fr: "Demain", es: "Mañana" },
    "heute": { en: "today", fr: "aujourd’hui", es: "hoy" },
    "morgen": { en: "tomorrow", fr: "demain", es: "mañana" },
    "Zuhause": { en: "Home", fr: "Domicile", es: "Casa" },
    "Ohne Titel": { en: "Untitled", fr: "Sans titre", es: "Sin título" },
    "Standort noch unbekannt": { en: "Location not yet known", fr: "Position encore inconnue", es: "Ubicación aún desconocida" },
    "Standort bekannt": { en: "Location known", fr: "Position connue", es: "Ubicación conocida" },
    "heute Morgen": { en: "this morning", fr: "ce matin", es: "esta mañana" },
    "heute Mittag": { en: "this lunchtime", fr: "ce midi", es: "este mediodía" },
    "heute Nachmittag": { en: "this afternoon", fr: "cet après-midi", es: "esta tarde" },
    "heute Abend": { en: "this evening", fr: "ce soir", es: "esta noche" },
    "Jemand": { en: "Someone", fr: "Quelqu’un", es: "Alguien" },
    "Der Hilferuf": { en: "The call for help", fr: "L’appel à l’aide", es: "La llamada de auxilio" },
    "Dein Einkauf": { en: "Your shopping", fr: "Tes courses", es: "Tu compra" },
    "Ein Ausgleich": { en: "A settlement", fr: "Un règlement", es: "Una liquidación" },
    "Neue Umfrage": { en: "New poll", fr: "Nouveau sondage", es: "Nueva encuesta" },
    "Countdown": { en: "Countdown", fr: "Compte à rebours", es: "Cuenta atrás" },
};

// Muster, die überall gelten (Datum, Uhrzeit, Dauer …)
const SHARED = [
    [/^(So|Mo|Di|Mi|Do|Fr|Sa), (\d\d)\.(\d\d)\.(?: (\d\d:\d\d))?$/, {
        en: g => WD.en[g[1]] + " " + g[2] + "/" + g[3] + (g[4] ? " " + g[4] : ""),
        fr: g => WD.fr[g[1]] + " " + g[2] + "/" + g[3] + (g[4] ? " " + g[4] : ""),
        es: g => WD.es[g[1]] + " " + g[2] + "/" + g[3] + (g[4] ? " " + g[4] : ""),
    }],
    [/^(\d\d)\.(\d\d)\.(\d{4})$/, { en: "<1>/<2>/<3>", fr: "<1>/<2>/<3>", es: "<1>/<2>/<3>" }],
    [/^(\d\d:\d\d) Uhr$/, { en: "<1>", fr: "<1>", es: "<1>" }],
    [/^In (\d+) Minuten$/, { en: "In <1> minutes", fr: "Dans <1> minutes", es: "En <1> minutos" }],
    [/^In 1 Stunde$/, { en: "In 1 hour", fr: "Dans 1 heure", es: "En 1 hora" }],
    [/^In ([\d.]+) Stunden$/, { en: "In <1> hours", fr: "Dans <1> heures", es: "En <1> horas" }],
    [/^Morgen, ([^·]+)$/, { en: "Tomorrow, {1}", fr: "Demain, {1}", es: "Mañana, {1}" }],
    [/^in (\d+) Tagen$/, { en: "in <1> days", fr: "dans <1> jours", es: "en <1> días" }],
    [/^(\d+) Std\. (\d+) Min\.$/, { en: "<1> h <2> min", fr: "<1> h <2> min", es: "<1> h <2> min" }],
    [/^(\d+) Min\.$/, { en: "<1> min", fr: "<1> min", es: "<1> min" }],
];

// Muster je Nachrichtenart (Tag). Die erste passende Gruppe gilt.
const GROUPS = [
    // --- Test-Nachricht (Einstellungen → Benachrichtigungen) ---
    { tag: /^test$/, rules: [
        [/^Hallo (.+)! 👋$/, { en: "Hello <1>! 👋", fr: "Bonjour <1> ! 👋", es: "¡Hola, <1>! 👋" }],
        [/^Benachrichtigungen von pinn\. kommen auf diesem Gerät an\.$/, { en: "Notifications from pinn. arrive on this device.", fr: "Les notifications de pinn. arrivent sur cet appareil.", es: "Las notificaciones de pinn. llegan a este dispositivo." }],
    ] },
    // --- Terminerinnerung ---
    { tag: /^termin-/, rules: [
        [/^(.+) um (\d\d:\d\d)$/, { en: "<1> at <2>", fr: "<1> à <2>", es: "<1> a las <2>" }],
        [/^mit ([^·]+)$/, { en: "with [1]", fr: "avec [1]", es: "con [1]" }],
    ] },
    // --- Tagesübersicht ---
    { tag: /^tagesuebersicht-/, rules: [
        [/^Guten Morgen, (.+)!$/, { en: "Good morning, <1>!", fr: "Bonjour <1> !", es: "¡Buenos días, <1>!" }],
        [/^Hallo, (.+)!$/, { en: "Hello, <1>!", fr: "Bonjour <1> !", es: "¡Hola, <1>!" }],
        [/^Guten Abend, (.+)!$/, { en: "Good evening, <1>!", fr: "Bonsoir <1> !", es: "¡Buenas tardes, <1>!" }],
        [/^Heute steht für dich nichts im Kalender\.$/, { en: "Nothing in your calendar today.", fr: "Rien dans ton agenda aujourd’hui.", es: "Hoy no tienes nada en el calendario." }],
        [/^([^·]*) \((\d+)x nicht erledigt\)$/, { en: "<1> (<2>× not done)", fr: "<1> (<2>× non fait)", es: "<1> (<2>× sin hacer)" }],
        [/^Mittag: ([^·]+)$/, { en: "Lunch: {1}", fr: "Déjeuner : {1}", es: "Comida: {1}" }],
        [/^Abend: ([^·]+)$/, { en: "Dinner: {1}", fr: "Dîner : {1}", es: "Cena: {1}" }],
    ] },
    // --- Neue Zuweisung (Termin/Aufgabe) ---
    { tag: /^zuweisung-/, rules: [
        [/^Neue Aufgabe für dich$/, { en: "New task for you", fr: "Nouvelle tâche pour toi", es: "Nueva tarea para ti" }],
        [/^Neuer Termin für dich$/, { en: "New event for you", fr: "Nouveau rendez-vous pour toi", es: "Nuevo evento para ti" }],
        [/^fällig ([^·]+)$/, { en: "due {1}", fr: "échéance {1}", es: "vence {1}" }],
        [/^von ([^·]+)$/, { en: "from <1>", fr: "de <1>", es: "de <1>" }],
    ] },
    // --- Kinder: Aufgabe erledigt / alles geschafft ---
    { tag: /^kind-/, rules: [
        [/^(.+) hat eine Aufgabe erledigt ✅$/, { en: "<1> completed a task ✅", fr: "<1> a terminé une tâche ✅", es: "<1> ha completado una tarea ✅" }],
        [/^(.+) hat alles geschafft! 🏆$/, { en: "<1> has done everything! 🏆", fr: "<1> a tout fini ! 🏆", es: "¡<1> lo ha hecho todo! 🏆" }],
        [/^Alle Aufgaben bis jetzt sind erledigt\.$/, { en: "All tasks so far are done.", fr: "Toutes les tâches jusqu’à présent sont faites.", es: "Todas las tareas hasta ahora están hechas." }],
        [/^Alle Aufgaben bis jetzt sind erledigt – zuletzt „([\s\S]*)“\.$/, { en: "All tasks so far are done – last „<1>“.", fr: "Toutes les tâches jusqu’à présent sont faites – dernière : „<1>“.", es: "Todas las tareas hasta ahora están hechas – la última: „<1>“." }],
        [/^Alle Aufgaben für jetzt sind erledigt – zuletzt „([\s\S]*)“\.$/, { en: "All tasks for now are done – last „<1>“.", fr: "Toutes les tâches pour l’instant sont faites – dernière : „<1>“.", es: "Todas las tareas por ahora están hechas – la última: „<1>“." }],
        [/^Alle Aufgaben für (heute Morgen|heute Mittag|heute Nachmittag|heute Abend) sind erledigt – zuletzt „([\s\S]*)“\.$/, { en: "All tasks for {1} are done – last „<2>“.", fr: "Toutes les tâches de {1} sont faites – dernière : „<2>“.", es: "Todas las tareas de {1} están hechas – la última: „<2>“." }],
    ] },
    // --- Jemand hat alle Aufgaben erledigt ---
    { tag: /^alle-erledigt-/, rules: [
        [/^(.+) hat alle Aufgaben erledigt 🎉$/, { en: "<1> has finished all tasks 🎉", fr: "<1> a terminé toutes ses tâches 🎉", es: "¡<1> ha terminado todas sus tareas! 🎉" }],
        [/^Alle Aufgaben bis jetzt sind abgehakt – zuletzt „([\s\S]*)“\.$/, { en: "All tasks so far are checked off – last „<1>“.", fr: "Toutes les tâches jusqu’à présent sont cochées – dernière : „<1>“.", es: "Todas las tareas hasta ahora están marcadas – la última: „<1>“." }],
    ] },
    // --- SOS ---
    { tag: /^sos-/, rules: [
        [/^SOS: (.+) braucht Hilfe!$/, { en: "SOS: {1} needs help!", fr: "SOS : {1} a besoin d’aide !", es: "SOS: ¡{1} necesita ayuda!" }],
        [/^Erneuter Hilferuf: (.+) braucht Hilfe!$/, { en: "Another call for help: {1} needs help!", fr: "Nouvel appel à l’aide : {1} a besoin d’aide !", es: "Nueva llamada de auxilio: ¡{1} necesita ayuda!" }],
        [/^TEST: (.+) braucht Hilfe!$/, { en: "TEST: {1} needs help!", fr: "TEST : {1} a besoin d’aide !", es: "PRUEBA: ¡{1} necesita ayuda!" }],
        [/^(.+) \(Test\)$/, { en: "<1> (test)", fr: "<1> (test)", es: "<1> (prueba)" }],
        [/^Dein Hilferuf wurde gesendet$/, { en: "Your call for help has been sent", fr: "Ton appel à l’aide a été envoyé", es: "Tu llamada de auxilio se ha enviado" }],
        [/^Entwarnung: (.+)$/, { en: "All clear: {1}", fr: "Fin d’alerte : {1}", es: "Fin de la alerta: {1}" }],
        [/^([\s\S]+)\. Tippe für Karte, Anruf und Notruf ([^.]+)\.$/, { en: "{1}. Tap for map, call and emergency number <2>.", fr: "{1}. Touche pour la carte, l’appel et le numéro d’urgence <2>.", es: "{1}. Toca para ver el mapa, llamar o marcar el número de emergencia <2>." }],
        [/^([\s\S]+)\. Nur ein Test – nur du bekommst diese Meldung\.$/, { en: "{1}. Just a test – only you receive this message.", fr: "{1}. Ce n’est qu’un test – toi seul(e) reçois ce message.", es: "{1}. Solo es una prueba – solo tú recibes este aviso." }],
        [/^Deine Familie wurde alarmiert \((\d+) Geräte?\) und sieht deinen Standort\.$/, {
            en: g => "Your family has been alerted (" + g[1] + plural(g[1], " device", " devices") + ") and can see your location.",
            fr: g => "Ta famille a été alertée (" + g[1] + plural(g[1], " appareil", " appareils") + ") et voit ta position.",
            es: g => "Se ha avisado a tu familia (" + g[1] + plural(g[1], " dispositivo", " dispositivos") + "), que puede ver tu ubicación.",
        }],
        [/^Kein Gerät deiner Familie ist für Push angemeldet – bitte zusätzlich anrufen \(([^)]+)\)\.$/, { en: "No device in your family is registered for notifications – please also call (<1>).", fr: "Aucun appareil de ta famille n’est inscrit aux notifications – appelle aussi le <1>.", es: "Ningún dispositivo de tu familia tiene activadas las notificaciones – llama también al <1>." }],
        [/^(.+) hat den Hilferuf von (\d\d:\d\d) Uhr beendet\.$/, { en: "<1> ended the call for help from <2>.", fr: "<1> a mis fin à l’appel à l’aide de <2>.", es: "<1> ha finalizado la llamada de auxilio de las <2>." }],
        [/^([\s\S]+) · (\d\d:\d\d) Uhr( \(± \d+ m\))?$/, { en: "{1} · <2><3>", fr: "{1} · <2><3>", es: "{1} · <2><3>" }],
        [/^Standort (-?\d+\.\d+), (-?\d+\.\d+)$/, { en: "Location <1>, <2>", fr: "Position <1>, <2>", es: "Ubicación <1>, <2>" }],
    ] },
    // --- Ortung: Standortfreigabe geändert ---
    { tag: /^ortung-teilen-/, rules: [
        [/^Standort geteilt$/, { en: "Location shared", fr: "Position partagée", es: "Ubicación compartida" }],
        [/^Standort nicht mehr geteilt$/, { en: "Location no longer shared", fr: "Position plus partagée", es: "Ubicación ya no compartida" }],
        [/^(.+) hat deine Standortfreigabe in pinn\. eingeschaltet\.$/, { en: "<1> turned on your location sharing in pinn.", fr: "<1> a activé le partage de ta position dans pinn.", es: "<1> ha activado tu ubicación compartida en pinn." }],
        [/^(.+) hat deine Standortfreigabe in pinn\. ausgeschaltet\.$/, { en: "<1> turned off your location sharing in pinn.", fr: "<1> a désactivé le partage de ta position dans pinn.", es: "<1> ha desactivado tu ubicación compartida en pinn." }],
    ] },
    // --- Ortung: „Ich bin unterwegs“ (Heimweg) ---
    { tag: /^ortung-unterwegs-/, rules: [
        [/^(.+) ist unterwegs nach Hause$/, { en: "<1> is on the way home", fr: "<1> est en route vers la maison", es: "<1> va de camino a casa" }],
        [/^(.+) ist zu Hause angekommen$/, { en: "<1> has arrived home", fr: "<1> est arrivé(e) à la maison", es: "<1> ha llegado a casa" }],
        [/^Antippen für Live-Standort, Karte und Anruf\. Meldung kommt beim Ankommen\.$/, { en: "Tap for live location, map and call. You’ll be notified on arrival.", fr: "Touche pour la position en direct, la carte et l’appel. Tu seras prévenu(e) à l’arrivée.", es: "Toca para ver la ubicación en directo, el mapa y llamar. Recibirás un aviso al llegar." }],
        [/^Heimweg beendet \((.+)\)\.$/, { en: "Way home finished ({1}).", fr: "Trajet retour terminé ({1}).", es: "Camino a casa terminado ({1})." }],
    ] },
    // --- Ortung: Ankommen / Verlassen eines Orts ---
    { tag: /^ortung-/, rules: [
        [/^(.+) \((\d\d:\d\d) Uhr\)$/, { en: "{1} (<2>)", fr: "{1} (<2>)", es: "{1} (<2>)" }],
        [/^(.+) ist zu Hause angekommen\.$/, { en: "<1> has arrived home.", fr: "<1> est arrivé(e) à la maison.", es: "<1> ha llegado a casa." }],
        [/^(.+) ist bei „(.+)“ angekommen\.$/, { en: "<1> has arrived at „<2>“.", fr: "<1> est arrivé(e) à „<2>“.", es: "<1> ha llegado a „<2>“." }],
        [/^(.+) hat das Zuhause verlassen\.$/, { en: "<1> has left home.", fr: "<1> a quitté la maison.", es: "<1> ha salido de casa." }],
        [/^(.+) hat „(.+)“ verlassen\.$/, { en: "<1> has left „<2>“.", fr: "<1> a quitté „<2>“.", es: "<1> ha salido de „<2>“." }],
    ] },
    // --- Ortung: Einkauf beim Laden automatisch abgehakt ---
    { tag: /^einkauf-/, rules: [
        [/^Einkauf abgehakt$/, { en: "Shopping checked off", fr: "Courses cochées", es: "Compra marcada" }],
        [/^(.+) ist erledigt \((\d+) Min\. bei (.+)\)\. Tippe hier, um den Betrag einzutragen\.$/, { en: "{1} is done (<2> min at <3>). Tap here to enter the amount.", fr: "{1} – terminé (<2> min chez <3>). Touche ici pour saisir le montant.", es: "{1}: hecho (<2> min en <3>). Toca aquí para anotar el importe." }],
    ] },
    // --- Ortung: im Laden angekommen ---
    { tag: /^laden-/, rules: [
        [/^Du bist bei (.+)$/, { en: "You’re at <1>", fr: "Tu es chez <1>", es: "Estás en <1>" }],
        [/^Geplant: (.+)\. Tippe hier für die Einkaufsliste\.$/, { en: "Planned: <1>. Tap here for the shopping list.", fr: "Prévu : <1>. Touche ici pour la liste de courses.", es: "Previsto: <1>. Toca aquí para ver la lista de la compra." }],
        [/^Tippe hier für die Einkaufsliste\.$/, { en: "Tap here for the shopping list.", fr: "Touche ici pour la liste de courses.", es: "Toca aquí para ver la lista de la compra." }],
    ] },
    // --- Pinnwand: Reaktion / Stimmen / Antwort / Erinnerung / neuer Zettel ---
    { tag: /^pinnwand-reaktion-/, rules: [
        [/^Reaktion auf deinen Zettel$/, { en: "Reaction to your note", fr: "Réaction à ta note", es: "Reacción a tu nota" }],
        [/^([\s\S]+) – „([\s\S]*)“$/, { en: "[1] – „<2>“", fr: "[1] – „<2>“", es: "[1] – „<2>“" }],
    ] },
    { tag: /^pinnwand-stimme-/, rules: [
        [/^Neue Stimmen$/, { en: "New votes", fr: "Nouveaux votes", es: "Nuevos votos" }],
        [/^(.+) hat abgestimmt – „([\s\S]*)“$/, { en: "<1> voted – „<2>“", fr: "<1> a voté – „<2>“", es: "<1> ha votado – „<2>“" }],
        [/^(.+) haben abgestimmt – „([\s\S]*)“$/, { en: "[1] voted – „<2>“", fr: "[1] ont voté – „<2>“", es: "[1] han votado – „<2>“" }],
    ] },
    { tag: /^pinnwand-antwort-/, rules: [
        [/^(.+) hat geantwortet$/, { en: "<1> replied", fr: "<1> a répondu", es: "<1> ha respondido" }],
    ] },
    { tag: /^pinnwand-erinnerung-/, rules: [
        [/^Erinnerung von der Pinnwand$/, { en: "Reminder from the board", fr: "Rappel du tableau", es: "Recordatorio del tablón" }],
    ] },
    { tag: /^pinnwand-/, rules: [
        [/^(.+) \(für ([^()]+)\)$/, { en: "{1} (for [2])", fr: "{1} (pour [2])", es: "{1} (para [2])" }],
        [/^(.+) sagt Danke$/, { en: "<1> says thanks", fr: "<1> dit merci", es: "<1> da las gracias" }],
        [/^(.+): neue Liste$/, { en: "<1>: new list", fr: "<1> : nouvelle liste", es: "<1>: nueva lista" }],
        [/^(.+) hat ein Foto angepinnt$/, { en: "<1> pinned a photo", fr: "<1> a épinglé une photo", es: "<1> ha fijado una foto" }],
        [/^Umfrage von (.+)$/, { en: "Poll by <1>", fr: "Sondage de <1>", es: "Encuesta de <1>" }],
        [/^(.+) hat etwas angepinnt$/, { en: "<1> pinned something", fr: "<1> a épinglé quelque chose", es: "<1> ha fijado algo" }],
        [/^Einfach so\. 💛$/, { en: "Just because. 💛", fr: "Juste comme ça. 💛", es: "Porque sí. 💛" }],
        [/^([^:]+): Einfach so\. 💛$/, { en: "[1]: Just because. 💛", fr: "[1] : Juste comme ça. 💛", es: "[1]: Porque sí. 💛" }],
        [/^Tippe zum Ansehen\.$/, { en: "Tap to view.", fr: "Touche pour voir.", es: "Toca para ver." }],
        [/^([\s\S]+) – jetzt abstimmen$/, { en: "{1} – vote now", fr: "{1} – vote maintenant", es: "{1} – vota ahora" }],
        [/^Heute!( – [\s\S]*)?$/, { en: "Today!<1>", fr: "Aujourd’hui !<1>", es: "¡Hoy!<1>" }],
        [/^Morgen!( – [\s\S]*)?$/, { en: "Tomorrow!<1>", fr: "Demain !<1>", es: "¡Mañana!<1>" }],
        [/^Noch (\d+) Tage( – [\s\S]*)?$/, { en: "<1> days to go<2>", fr: "Encore <1> jours<2>", es: "Faltan <1> días<2>" }],
        [/^Neuer Countdown von (.+)$/, { en: "New countdown from <1>", fr: "Nouveau compte à rebours de <1>", es: "Nueva cuenta atrás de <1>" }],
    ] },
    // --- Dokumente: Ablauf, Garantie, Gewährleistung ---
    { tag: /^dokument-/, rules: [
        [/^Läuft ab: (.+)$/, { en: "Expires: <1>", fr: "Expire : <1>", es: "Caduca: <1>" }],
        [/^Garantie endet: (.+)$/, { en: "Warranty ends: <1>", fr: "Fin de garantie : <1>", es: "Fin de la garantía: <1>" }],
        [/^Gewährleistung endet: (.+)$/, { en: "Statutory warranty ends: <1>", fr: "Fin de la garantie légale : <1>", es: "Fin de la garantía legal: <1>" }],
        [/^Gültig bis (\S+) \((.+?)\) – rechtzeitig verlängern oder erneuern\.$/, { en: "Valid until {1} ({2}) – renew or replace in good time.", fr: "Valable jusqu’au {1} ({2}) – à prolonger ou renouveler à temps.", es: "Válido hasta el {1} ({2}) – renuévalo a tiempo." }],
        [/^Die Herstellergarantie endet am (\S+) \((.+?)\)\. Mängel am besten vorher melden\.$/, { en: "The manufacturer’s warranty ends on {1} ({2}). Best report any defects before then.", fr: "La garantie du fabricant prend fin le {1} ({2}). Mieux vaut signaler les défauts avant.", es: "La garantía del fabricante termina el {1} ({2}). Mejor comunica los defectos antes." }],
        [/^Die gesetzliche Gewährleistung endet am (\S+) \((.+?)\)\. Mängel vorher beim Händler reklamieren\.$/, { en: "The statutory warranty ends on {1} ({2}). Report defects to the retailer before then.", fr: "La garantie légale prend fin le {1} ({2}). Réclame les défauts auprès du vendeur avant.", es: "La garantía legal termina el {1} ({2}). Reclama los defectos al vendedor antes." }],
    ] },
    // --- Verträge: Kündigungsfrist, Vertragsende, eigene Erinnerung ---
    { tag: /^vertrag-/, rules: [
        [/^Letzte Chance: (.+) kündigen$/, { en: "Last chance: cancel <1>", fr: "Dernière chance : résilier <1>", es: "Última oportunidad: cancelar <1>" }],
        [/^Kündigungsfrist: (.+)$/, { en: "Notice period: <1>", fr: "Préavis : <1>", es: "Plazo de preaviso: <1>" }],
        [/^Vertrag endet: (.+)$/, { en: "Contract ends: <1>", fr: "Fin du contrat : <1>", es: "Fin del contrato: <1>" }],
        [/^Kündigung bis (\S+) \((.+?)\) zum (\S+) – sonst verlängert er sich um einen Monat\.$/, { en: "Cancel by {1} ({2}) to end on {3} – otherwise it renews for one month.", fr: "Résiliation avant le {1} ({2}) pour le {3} – sinon il est prolongé d’un mois.", es: "Cancela antes del {1} ({2}) para el {3}; si no, se prorroga un mes." }],
        [/^Kündigung bis (\S+) \((.+?)\) zum (\S+) – sonst verlängert er sich um (\d+) Monate\.$/, { en: "Cancel by {1} ({2}) to end on {3} – otherwise it renews for <4> months.", fr: "Résiliation avant le {1} ({2}) pour le {3} – sinon il est prolongé de <4> mois.", es: "Cancela antes del {1} ({2}) para el {3}; si no, se prorroga <4> meses." }],
        [/^Der Vertrag endet am (\S+) \((.+?)\)\.$/, { en: "The contract ends on {1} ({2}).", fr: "Le contrat prend fin le {1} ({2}).", es: "El contrato termina el {1} ({2})." }],
        [/^Erinnerung zu diesem Vertrag$/, { en: "Reminder for this contract", fr: "Rappel pour ce contrat", es: "Recordatorio de este contrato" }],
    ] },
    // --- Kassen: Ausgleich eingetragen / zur Kasse hinzugefügt ---
    { tag: /^ausgleich-/, rules: [
        [/^Ausgleich: (.+)$/, { en: "Settlement: <1>", fr: "Règlement : <1>", es: "Liquidación: <1>" }],
        [/^([\s\S]+) wurde für dich eingetragen\.$/, { en: "{1} was recorded for you.", fr: "{1} a été enregistré pour toi.", es: "{1} se ha registrado para ti." }],
    ] },
    { tag: /^kasse-/, rules: [
        [/^(.+) hat dich zur Kasse „(.+)“ hinzugefügt\.( Ausgaben werden geteilt\.)?$/, {
            en: (g, h) => h.t(g[1]) + " added you to the fund „" + g[2] + "“." + (g[3] ? " Expenses are shared." : ""),
            fr: (g, h) => h.t(g[1]) + " t’a ajouté(e) à la caisse „" + g[2] + "“." + (g[3] ? " Les dépenses sont partagées." : ""),
            es: (g, h) => h.t(g[1]) + " te ha añadido a la caja „" + g[2] + "“." + (g[3] ? " Los gastos se comparten." : ""),
        }],
    ] },
];

// Ersatztext, wenn ein Gerät geweckt wird, die Nachricht aber nicht (mehr) abholbar ist
const FALLBACK = {
    de: { titel: "pinn.", text: "Es gibt Neuigkeiten in pinn." },
    en: { titel: "pinn.", text: "There’s something new in pinn." },
    fr: { titel: "pinn.", text: "Il y a du nouveau dans pinn." },
    es: { titel: "pinn.", text: "Hay novedades en pinn." },
};

// ---------------------------------------------------------------------------------------------
// Übersetzer
// ---------------------------------------------------------------------------------------------
const LETTER = /[A-Za-zÄÖÜäöüßÀ-ÿ0-9]/;
// Ränder ohne Buchstaben (Emojis, ❗, Leerzeichen), die beim zweiten Versuch abgetrennt werden
const EDGE = /^([^A-Za-zÄÖÜäöüßÀ-ÿ0-9„"(¡¿]*)([\s\S]*?)([^A-Za-zÄÖÜäöüßÀ-ÿ0-9“"').!?…]*)$/;

function groupFor(tag) {
    const t = String(tag || "");
    for (let i = 0; i < GROUPS.length; i++) if (GROUPS[i].tag.test(t)) return GROUPS[i];
    return null;
}

function makeTranslator(lang, group) {
    const rules = (group ? group.rules : []).concat(SHARED);
    const names = s => {
        const i = s.lastIndexOf(" und ");
        return i < 0 ? s : s.slice(0, i) + AND[lang] + s.slice(i + 5);
    };
    function fill(out, g, depth) {
        const h = { t: v => valueOf(v, depth), names: names };
        if (typeof out === "function") return out(g, h);
        return out.replace(/\{(\d)\}|<(\d)>|\[(\d)\]/g, (m, a, b, c) => {
            if (a) return h.t(g[+a] || "");
            if (b) return g[+b] || "";
            return names(g[+c] || "");
        });
    }
    function core(s, depth) {
        if (!s || !LETTER.test(s)) return null;
        const ex = EXACT[s];
        if (ex && ex[lang] !== undefined) return ex[lang];
        for (let i = 0; i < rules.length; i++) {
            const m = rules[i][0].exec(s);
            if (m) return fill(rules[i][1][lang], m, depth + 1);
        }
        return null;
    }
    // Ganzer Text, sonst ohne Emojis/Zeichen am Rand
    function loose(s, depth) {
        if (depth > 6) return null;
        const r = core(s, depth);
        if (r !== null) return r;
        const m = EDGE.exec(s);
        if (m && (m[1] || m[3]) && m[2]) {
            const c = core(m[2], depth);
            if (c !== null) return m[1] + c + m[3];
        }
        return null;
    }
    // Teil eines anderen Textes: übersetzen, wenn ein Muster passt, sonst unverändert
    function valueOf(v, depth) {
        const r = loose(String(v || ""), depth);
        return r === null ? String(v || "") : r;
    }
    // Ganzer Nachrichtentext: als Ganzes, sonst Zeile für Zeile und Teil für Teil („ · “)
    function text(s, depth) {
        const r = loose(s, depth);
        if (r !== null) return r;
        if (s.indexOf("\n") >= 0) return s.split("\n").map(x => text(x, depth + 1)).join("\n");
        if (s.indexOf(" · ") >= 0) return s.split(" · ").map(x => valueOf(x, depth + 1)).join(" · ");
        return s;
    }
    return s => text(String(s || ""), 0);
}

function quotes(s, lang) {
    if (lang === "fr") return s.replace(/„([^„“]*)“/g, "« $1 »");
    if (lang === "es") return s.replace(/„([^„“]*)“/g, "«$1»");
    return s.replace(/„([^„“]*)“/g, "“$1”");
}

function translateFor(lang, wohnform, msg) {
    const out = Object.assign({}, msg);
    if (lang !== "de") {
        const tr = makeTranslator(lang, groupFor(msg.tag));
        if (msg.titel) out.titel = quotes(tr(msg.titel), lang);
        if (msg.text) out.text = quotes(tr(msg.text), lang);
    }
    if (wohnform === "wg") {
        if (out.titel) out.titel = applyTerms(String(out.titel), lang);
        if (out.text) out.text = applyTerms(String(out.text), lang);
    }
    return out;
}

// Nachricht für ein Profil umschreiben. Fehler ändern nie etwas: dann bleibt der deutsche Text.
function localize(userId, msg) {
    if (!msg || !userId) return msg;
    try {
        const user = $app.findRecordById("benutzer", String(userId));
        const lang = langOfUser(user);
        const wohnform = wohnformOf(user.getString("familie"));
        if (lang === "de" && wohnform !== "wg") return msg;
        return translateFor(lang, wohnform, msg);
    } catch (e) {
        console.log("[Push] Text nicht übersetzt: " + e.message);
        return msg;
    }
}

// Ersatztext für das Gerät mit dieser Push-Adresse (Sprache seines Profils)
function fallbackForEndpoint(endpoint) {
    try {
        const abo = $app.findFirstRecordByFilter("push_abos", "endpoint = {:e}", { e: String(endpoint || "") });
        const user = $app.findRecordById("benutzer", abo.getString("benutzer"));
        return Object.assign({ tag: "pinn-allgemein", url: "/" }, FALLBACK[langOfUser(user)] || FALLBACK.de);
    } catch (e) { return null; }
}

module.exports = { localize, translateFor, fallbackForEndpoint, wohnformOf, langOfUser, applyTerms };

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
//  - Sprache: aus dem Profil (persönliches Design, Wert „sprache“: de, en, fr, es, it, pt, zh). Ohne Angabe: Deutsch.
//  - Wohnform: aus den Familiendaten (Feld „wohnform“: 'familie' oder 'wg'). Gelesen wird nur dieses
//    eine Feld per SQL (json_extract), nicht die großen Familiendaten; das Ergebnis bleibt im
//    Zwischenspeicher, bis sich die Familiendaten ändern.
//  - Die WG-Begriffe sind dieselben wie in der App (index.html, PINN_I18N → TERMS): Familie → WG,
//    family → flatshare, famille → colocation, familia → piso compartido usw.
//
// Übersetzt wird je Nachrichtenart (Tag der Nachricht, z. B. „sos-…“, „termin-…“) mit festen Mustern.
// Frei eingegebene Inhalte (Namen, Termintitel, Zettel-Texte, Adressen) bleiben unverändert. Was kein
// Muster trifft, bleibt Deutsch – eine unbekannte Meldung geht also nie verloren.

const LANGS = ["de", "en", "fr", "es", "it", "pt", "zh"];

// ---------------------------------------------------------------------------------------------
// Sprache und Wohnform des Empfängers
// ---------------------------------------------------------------------------------------------
function langOfUser(userRec) {
    try {
        const w = require(`${__hooks}/pinn-design.js`).readDesign(userRec).werte || {};
        const c = String(w.sprache || "").slice(0, 2).toLowerCase();
        return LANGS.indexOf(c) >= 0 ? c : (c ? "en" : "de");
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
    it: { keep: /libro di famiglia|auto di famiglia/g, rules: [
        [/\b([Mm])embri della famiglia\b/g, (m, f) => cap(f === "M", "coinquilini")],
        [/\b([Mm])embro della famiglia\b/g, (m, f) => cap(f === "M", "coinquilino")],
        [/\b([Tt])utta la famiglia\b/g, "$1utta la casa"],
        [/\b([Tt])utte le famiglie\b/g, "$1utte le case"],
        [/\b([Ll])e famiglie\b/g, "$1e case"],
        [/\b([Ff])amiglie\b/g, (m, f) => cap(f === "F", "case")],
        [/\bfamiliari\b/g, "coinquilini"],
        [/\bfamiliare\b/g, "della casa"],
        [/\b([Ff])amiglia\b/g, (m, f) => cap(f === "F", "casa condivisa")],
    ] },
    pt: { keep: /livro de família|carro de família|carro da família/g, rules: [
        [/\b([Mm])embros da família\b/g, (m, f) => cap(f === "M", "colegas de casa")],
        [/\b([Mm])embro da família\b/g, (m, f) => cap(f === "M", "colega de casa")],
        [/\b([Tt])oda a família\b/g, "$1oda a casa"],
        [/\b([Tt])odas as famílias\b/g, "$1odas as casas"],
        [/\b([Ff])amília toda\b/g, (m, f) => cap(f === "F", "casa toda")],
        [/\b([Ff])amílias\b/g, (m, f) => cap(f === "F", "casas")],
        [/\bfamiliares\b/g, "da casa"],
        [/\bfamiliar\b/g, "da casa"],
        [/\b([Ff])amília\b/g, (m, f) => cap(f === "F", "casa compartilhada")],
    ] },
    zh: { keep: /家庭医生/g, rules: [
        [/家庭成员/g, "室友"],
        [/全家/g, "整个合租"],
        [/家庭/g, "合租"],
    ] },
};
const TERM_HINT = /[Ff]amil|[Ff]am\u00EDli|[Ff]amigli|\u5BB6\u5EAD|\u5168\u5BB6|\uD83D\uDC68\u200D\uD83D\uDC69/;
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
    it: { So: "dom", Mo: "lun", Di: "mar", Mi: "mer", Do: "gio", Fr: "ven", Sa: "sab" },
    pt: { So: "dom", Mo: "seg", Di: "ter", Mi: "qua", Do: "qui", Fr: "sex", Sa: "sáb" },
    zh: { So: "周日", Mo: "周一", Di: "周二", Mi: "周三", Do: "周四", Fr: "周五", Sa: "周六" },
};
const AND = { en: " and ", fr: " et ", es: " y ", it: " e ", pt: " e ", zh: "和" };
function plural(n, one, many) { return Number(n) === 1 ? one : many; }

// Wörter und Wendungen, die als Teil anderer Texte vorkommen (überall gültig)
const EXACT = {
    "Morgen": { en: "Tomorrow", fr: "Demain", es: "Mañana", it: "Domani", pt: "Amanhã", zh: "明天" },
    "heute": { en: "today", fr: "aujourd’hui", es: "hoy", it: "oggi", pt: "hoje", zh: "今天" },
    "morgen": { en: "tomorrow", fr: "demain", es: "mañana", it: "domani", pt: "amanhã", zh: "明天" },
    "Zuhause": { en: "Home", fr: "Domicile", es: "Casa", it: "Casa", pt: "Casa", zh: "家" },
    "Ohne Titel": { en: "Untitled", fr: "Sans titre", es: "Sin título", it: "Senza titolo", pt: "Sem título", zh: "无标题" },
    "Standort noch unbekannt": { en: "Location not yet known", fr: "Position encore inconnue", es: "Ubicación aún desconocida", it: "Posizione ancora sconosciuta", pt: "Localização ainda desconhecida", zh: "位置尚未知" },
    "Standort bekannt": { en: "Location known", fr: "Position connue", es: "Ubicación conocida", it: "Posizione nota", pt: "Localização conhecida", zh: "位置已知" },
    "heute Morgen": { en: "this morning", fr: "ce matin", es: "esta mañana", it: "stamattina", pt: "hoje de manhã", zh: "今天早上" },
    "heute Mittag": { en: "this lunchtime", fr: "ce midi", es: "este mediodía", it: "a pranzo", pt: "hoje ao meio-dia", zh: "今天中午" },
    "heute Nachmittag": { en: "this afternoon", fr: "cet après-midi", es: "esta tarde", it: "nel pomeriggio", pt: "hoje à tarde", zh: "今天下午" },
    "heute Abend": { en: "this evening", fr: "ce soir", es: "esta noche", it: "stasera", pt: "hoje à noite", zh: "今天晚上" },
    "Jemand": { en: "Someone", fr: "Quelqu’un", es: "Alguien", it: "Qualcuno", pt: "Alguém", zh: "某人" },
    "Der Hilferuf": { en: "The call for help", fr: "L’appel à l’aide", es: "La llamada de auxilio", it: "La richiesta di aiuto", pt: "O pedido de socorro", zh: "求救" },
    "Dein Einkauf": { en: "Your shopping", fr: "Tes courses", es: "Tu compra", it: "La tua spesa", pt: "Suas compras", zh: "你的购物" },
    "Ein Ausgleich": { en: "A settlement", fr: "Un règlement", es: "Una liquidación", it: "Un conguaglio", pt: "Um acerto", zh: "一次结算" },
    "Neue Umfrage": { en: "New poll", fr: "Nouveau sondage", es: "Nueva encuesta", it: "Nuovo sondaggio", pt: "Nova enquete", zh: "新投票" },
    "Countdown": { en: "Countdown", fr: "Compte à rebours", es: "Cuenta atrás", it: "Conto alla rovescia", pt: "Contagem regressiva", zh: "倒计时" },
};

// Muster, die überall gelten (Datum, Uhrzeit, Dauer …)
const SHARED = [
    [/^(So|Mo|Di|Mi|Do|Fr|Sa), (\d\d)\.(\d\d)\.(?: (\d\d:\d\d))?$/, {
        en: g => WD.en[g[1]] + " " + g[2] + "/" + g[3] + (g[4] ? " " + g[4] : ""),
        fr: g => WD.fr[g[1]] + " " + g[2] + "/" + g[3] + (g[4] ? " " + g[4] : ""),
        es: g => WD.es[g[1]] + " " + g[2] + "/" + g[3] + (g[4] ? " " + g[4] : ""),
        it: g => WD.it[g[1]] + " " + g[2] + "/" + g[3] + (g[4] ? " " + g[4] : ""),
        pt: g => WD.pt[g[1]] + " " + g[2] + "/" + g[3] + (g[4] ? " " + g[4] : ""),
        zh: g => WD.zh[g[1]] + " " + Number(g[3]) + "月" + Number(g[2]) + "日" + (g[4] ? " " + g[4] : ""),
    }],
    [/^(\d\d)\.(\d\d)\.(\d{4})$/, { en: "<1>/<2>/<3>", fr: "<1>/<2>/<3>", es: "<1>/<2>/<3>", it: "<1>/<2>/<3>", pt: "<1>/<2>/<3>", zh: "<1>/<2>/<3>" }],
    [/^(\d\d:\d\d) Uhr$/, { en: "<1>", fr: "<1>", es: "<1>", it: "<1>", pt: "<1>", zh: "<1>" }],
    [/^In (\d+) Minuten$/, { en: "In <1> minutes", fr: "Dans <1> minutes", es: "En <1> minutos", it: "Tra <1> minuti", pt: "Em <1> minutos", zh: "<1> 分钟后" }],
    [/^In 1 Stunde$/, { en: "In 1 hour", fr: "Dans 1 heure", es: "En 1 hora", it: "Tra 1 ora", pt: "Em 1 hora", zh: "1 小时后" }],
    [/^In ([\d.]+) Stunden$/, { en: "In <1> hours", fr: "Dans <1> heures", es: "En <1> horas", it: "Tra <1> ore", pt: "Em <1> horas", zh: "<1> 小时后" }],
    [/^Morgen, ([^·]+)$/, { en: "Tomorrow, {1}", fr: "Demain, {1}", es: "Mañana, {1}", it: "Domani, {1}", pt: "Amanhã, {1}", zh: "明天，{1}" }],
    [/^in (\d+) Tagen$/, { en: "in <1> days", fr: "dans <1> jours", es: "en <1> días", it: "tra <1> giorni", pt: "em <1> dias", zh: "<1> 天后" }],
    [/^(\d+) Std\. (\d+) Min\.$/, { en: "<1> h <2> min", fr: "<1> h <2> min", es: "<1> h <2> min", it: "<1> h <2> min", pt: "<1> h <2> min", zh: "<1> 小时 <2> 分钟" }],
    [/^(\d+) Min\.$/, { en: "<1> min", fr: "<1> min", es: "<1> min", it: "<1> min", pt: "<1> min", zh: "<1> 分钟" }],
];

// Muster je Nachrichtenart (Tag). Die erste passende Gruppe gilt.
const GROUPS = [
    // --- Test-Nachricht (Einstellungen → Benachrichtigungen) ---
    { tag: /^test$/, rules: [
        [/^Hallo (.+)! 👋$/, { en: "Hello <1>! 👋", fr: "Bonjour <1> ! 👋", es: "¡Hola, <1>! 👋", it: "Ciao <1>! 👋", pt: "Olá, <1>! 👋", zh: "你好，<1>！👋" }],
        [/^Benachrichtigungen von pinn\. kommen auf diesem Gerät an\.$/, { en: "Notifications from pinn. arrive on this device.", fr: "Les notifications de pinn. arrivent sur cet appareil.", es: "Las notificaciones de pinn. llegan a este dispositivo.", it: "Le notifiche di pinn. arrivano su questo dispositivo.", pt: "As notificações do pinn. chegam neste aparelho.", zh: "pinn. 的通知会发送到此设备。" }],
    ] },
    // --- Terminerinnerung ---
    { tag: /^termin-/, rules: [
        [/^(.+) um (\d\d:\d\d)$/, { en: "<1> at <2>", fr: "<1> à <2>", es: "<1> a las <2>", it: "<1> alle <2>", pt: "<1> às <2>", zh: "<1> <2>" }],
        [/^mit ([^·]+)$/, { en: "with [1]", fr: "avec [1]", es: "con [1]", it: "con [1]", pt: "com [1]", zh: "与 [1]" }],
    ] },
    // --- Tagesübersicht ---
    { tag: /^tagesuebersicht-/, rules: [
        [/^Guten Morgen, (.+)!$/, { en: "Good morning, <1>!", fr: "Bonjour <1> !", es: "¡Buenos días, <1>!", it: "Buongiorno, <1>!", pt: "Bom dia, <1>!", zh: "早上好，<1>！" }],
        [/^Hallo, (.+)!$/, { en: "Hello, <1>!", fr: "Bonjour <1> !", es: "¡Hola, <1>!", it: "Ciao, <1>!", pt: "Olá, <1>!", zh: "你好，<1>！" }],
        [/^Guten Abend, (.+)!$/, { en: "Good evening, <1>!", fr: "Bonsoir <1> !", es: "¡Buenas tardes, <1>!", it: "Buonasera, <1>!", pt: "Boa noite, <1>!", zh: "晚上好，<1>！" }],
        [/^Heute steht für dich nichts im Kalender\.$/, { en: "Nothing in your calendar today.", fr: "Rien dans ton agenda aujourd’hui.", es: "Hoy no tienes nada en el calendario.", it: "Oggi non hai nulla in calendario.", pt: "Hoje você não tem nada na agenda.", zh: "今天你的日历里没有安排。" }],
        [/^([^·]*) \((\d+)x nicht erledigt\)$/, { en: "<1> (<2>× not done)", fr: "<1> (<2>× non fait)", es: "<1> (<2>× sin hacer)", it: "<1> (<2>× non fatto)", pt: "<1> (<2>× não feito)", zh: "<1>（<2> 次未完成）" }],
        [/^Mittag: ([^·]+)$/, { en: "Lunch: {1}", fr: "Déjeuner : {1}", es: "Comida: {1}", it: "Pranzo: {1}", pt: "Almoço: {1}", zh: "午餐：{1}" }],
        [/^Abend: ([^·]+)$/, { en: "Dinner: {1}", fr: "Dîner : {1}", es: "Cena: {1}", it: "Cena: {1}", pt: "Jantar: {1}", zh: "晚餐：{1}" }],
    ] },
    // --- Neue Zuweisung (Termin/Aufgabe) ---
    { tag: /^zuweisung-/, rules: [
        [/^Neue Aufgabe für dich$/, { en: "New task for you", fr: "Nouvelle tâche pour toi", es: "Nueva tarea para ti", it: "Nuova attività per te", pt: "Nova tarefa para você", zh: "给你的新任务" }],
        [/^Neuer Termin für dich$/, { en: "New event for you", fr: "Nouveau rendez-vous pour toi", es: "Nuevo evento para ti", it: "Nuovo evento per te", pt: "Novo compromisso para você", zh: "给你的新日程" }],
        [/^fällig ([^·]+)$/, { en: "due {1}", fr: "échéance {1}", es: "vence {1}", it: "scade {1}", pt: "vence {1}", zh: "截止 {1}" }],
        [/^von ([^·]+)$/, { en: "from <1>", fr: "de <1>", es: "de <1>", it: "da <1>", pt: "de <1>", zh: "来自 <1>" }],
    ] },
    // --- Kinder: Aufgabe erledigt / alles geschafft ---
    { tag: /^kind-/, rules: [
        [/^(.+) hat eine Aufgabe erledigt ✅$/, { en: "<1> completed a task ✅", fr: "<1> a terminé une tâche ✅", es: "<1> ha completado una tarea ✅", it: "<1> ha completato un’attività ✅", pt: "<1> concluiu uma tarefa ✅", zh: "<1> 完成了一项任务 ✅" }],
        [/^(.+) hat alles geschafft! 🏆$/, { en: "<1> has done everything! 🏆", fr: "<1> a tout fini ! 🏆", es: "¡<1> lo ha hecho todo! 🏆", it: "<1> ha fatto tutto! 🏆", pt: "<1> fez tudo! 🏆", zh: "<1> 全部完成了！🏆" }],
        [/^Alle Aufgaben bis jetzt sind erledigt\.$/, { en: "All tasks so far are done.", fr: "Toutes les tâches jusqu’à présent sont faites.", es: "Todas las tareas hasta ahora están hechas.", it: "Tutte le attività finora sono fatte.", pt: "Todas as tarefas até agora estão concluídas.", zh: "到目前为止的所有任务都已完成。" }],
        [/^Alle Aufgaben bis jetzt sind erledigt – zuletzt „([\s\S]*)“\.$/, { en: "All tasks so far are done – last „<1>“.", fr: "Toutes les tâches jusqu’à présent sont faites – dernière : „<1>“.", es: "Todas las tareas hasta ahora están hechas – la última: „<1>“.", it: "Tutte le attività finora sono fatte – l’ultima: „<1>“.", pt: "Todas as tarefas até agora estão concluídas – a última: „<1>“.", zh: "到目前为止的所有任务都已完成——最后一个：„<1>“。" }],
        [/^Alle Aufgaben für jetzt sind erledigt – zuletzt „([\s\S]*)“\.$/, { en: "All tasks for now are done – last „<1>“.", fr: "Toutes les tâches pour l’instant sont faites – dernière : „<1>“.", es: "Todas las tareas por ahora están hechas – la última: „<1>“.", it: "Tutte le attività per ora sono fatte – l’ultima: „<1>“.", pt: "Todas as tarefas por ora estão concluídas – a última: „<1>“.", zh: "目前的所有任务都已完成——最后一个：„<1>“。" }],
        [/^Alle Aufgaben für (heute Morgen|heute Mittag|heute Nachmittag|heute Abend) sind erledigt – zuletzt „([\s\S]*)“\.$/, { en: "All tasks for {1} are done – last „<2>“.", fr: "Toutes les tâches de {1} sont faites – dernière : „<2>“.", es: "Todas las tareas de {1} están hechas – la última: „<2>“.", it: "Tutte le attività di {1} sono fatte – l’ultima: „<2>“.", pt: "Todas as tarefas de {1} estão concluídas – a última: „<2>“.", zh: "{1}的所有任务都已完成——最后一个：„<2>“。" }],
    ] },
    // --- Jemand hat alle Aufgaben erledigt ---
    { tag: /^alle-erledigt-/, rules: [
        [/^(.+) hat alle Aufgaben erledigt 🎉$/, { en: "<1> has finished all tasks 🎉", fr: "<1> a terminé toutes ses tâches 🎉", es: "¡<1> ha terminado todas sus tareas! 🎉", it: "<1> ha completato tutte le attività 🎉", pt: "<1> concluiu todas as tarefas 🎉", zh: "<1> 完成了所有任务 🎉" }],
        [/^Alle Aufgaben bis jetzt sind abgehakt – zuletzt „([\s\S]*)“\.$/, { en: "All tasks so far are checked off – last „<1>“.", fr: "Toutes les tâches jusqu’à présent sont cochées – dernière : „<1>“.", es: "Todas las tareas hasta ahora están marcadas – la última: „<1>“.", it: "Tutte le attività finora sono spuntate – l’ultima: „<1>“.", pt: "Todas as tarefas até agora estão marcadas – a última: „<1>“.", zh: "到目前为止的所有任务都已勾选——最后一个：„<1>“。" }],
    ] },
    // --- SOS ---
    { tag: /^sos-/, rules: [
        [/^SOS: (.+) braucht Hilfe!$/, { en: "SOS: {1} needs help!", fr: "SOS : {1} a besoin d’aide !", es: "SOS: ¡{1} necesita ayuda!", it: "SOS: {1} ha bisogno di aiuto!", pt: "SOS: {1} precisa de ajuda!", zh: "SOS：{1} 需要帮助！" }],
        [/^Erneuter Hilferuf: (.+) braucht Hilfe!$/, { en: "Another call for help: {1} needs help!", fr: "Nouvel appel à l’aide : {1} a besoin d’aide !", es: "Nueva llamada de auxilio: ¡{1} necesita ayuda!", it: "Nuova richiesta di aiuto: {1} ha bisogno di aiuto!", pt: "Novo pedido de socorro: {1} precisa de ajuda!", zh: "再次求救：{1} 需要帮助！" }],
        [/^TEST: (.+) braucht Hilfe!$/, { en: "TEST: {1} needs help!", fr: "TEST : {1} a besoin d’aide !", es: "PRUEBA: ¡{1} necesita ayuda!", it: "TEST: {1} ha bisogno di aiuto!", pt: "TESTE: {1} precisa de ajuda!", zh: "测试：{1} 需要帮助！" }],
        [/^(.+) \(Test\)$/, { en: "<1> (test)", fr: "<1> (test)", es: "<1> (prueba)", it: "<1> (test)", pt: "<1> (teste)", zh: "<1>（测试）" }],
        [/^Dein Hilferuf wurde gesendet$/, { en: "Your call for help has been sent", fr: "Ton appel à l’aide a été envoyé", es: "Tu llamada de auxilio se ha enviado", it: "La tua richiesta di aiuto è stata inviata", pt: "Seu pedido de socorro foi enviado", zh: "你的求救已发送" }],
        [/^Entwarnung: (.+)$/, { en: "All clear: {1}", fr: "Fin d’alerte : {1}", es: "Fin de la alerta: {1}", it: "Cessato allarme: {1}", pt: "Fim do alerta: {1}", zh: "解除警报：{1}" }],
        [/^([\s\S]+)\. Tippe für Karte, Anruf und Notruf ([^.]+)\.$/, { en: "{1}. Tap for map, call and emergency number <2>.", fr: "{1}. Touche pour la carte, l’appel et le numéro d’urgence <2>.", es: "{1}. Toca para ver el mapa, llamar o marcar el número de emergencia <2>.", it: "{1}. Tocca per mappa, chiamata e numero di emergenza <2>.", pt: "{1}. Toque para ver o mapa, ligar e chamar o número de emergência <2>.", zh: "{1}。点按可查看地图、拨打电话和紧急号码 <2>。" }],
        [/^([\s\S]+)\. Nur ein Test – nur du bekommst diese Meldung\.$/, { en: "{1}. Just a test – only you receive this message.", fr: "{1}. Ce n’est qu’un test – toi seul(e) reçois ce message.", es: "{1}. Solo es una prueba – solo tú recibes este aviso.", it: "{1}. Solo un test: solo tu ricevi questo messaggio.", pt: "{1}. É só um teste – só você recebe esta mensagem.", zh: "{1}。只是测试——只有你会收到这条消息。" }],
        [/^Deine Familie wurde alarmiert \((\d+) Geräte?\) und sieht deinen Standort\.$/, {
            en: g => "Your family has been alerted (" + g[1] + plural(g[1], " device", " devices") + ") and can see your location.",
            fr: g => "Ta famille a été alertée (" + g[1] + plural(g[1], " appareil", " appareils") + ") et voit ta position.",
            es: g => "Se ha avisado a tu familia (" + g[1] + plural(g[1], " dispositivo", " dispositivos") + "), que puede ver tu ubicación.",
            it: g => "La tua famiglia è stata avvisata (" + g[1] + plural(g[1], " dispositivo", " dispositivi") + ") e vede la tua posizione.",
            pt: g => "Sua família foi avisada (" + g[1] + plural(g[1], " aparelho", " aparelhos") + ") e vê a sua localização.",
            zh: g => "你的家人已收到提醒（" + g[1] + " 台设备），并能看到你的位置。",
        }],
        [/^Kein Gerät deiner Familie ist für Push angemeldet – bitte zusätzlich anrufen \(([^)]+)\)\.$/, { en: "No device in your family is registered for notifications – please also call (<1>).", fr: "Aucun appareil de ta famille n’est inscrit aux notifications – appelle aussi le <1>.", es: "Ningún dispositivo de tu familia tiene activadas las notificaciones – llama también al <1>.", it: "Nessun dispositivo della tua famiglia è registrato per le notifiche: chiama anche (<1>).", pt: "Nenhum aparelho da sua família está registrado para notificações – ligue também (<1>).", zh: "你家庭中没有任何设备注册了通知——请同时拨打电话（<1>）。" }],
        [/^(.+) hat den Hilferuf von (\d\d:\d\d) Uhr beendet\.$/, { en: "<1> ended the call for help from <2>.", fr: "<1> a mis fin à l’appel à l’aide de <2>.", es: "<1> ha finalizado la llamada de auxilio de las <2>.", it: "<1> ha terminato la richiesta di aiuto delle <2>.", pt: "<1> encerrou o pedido de socorro das <2>.", zh: "<1> 结束了 <2> 发出的求救。" }],
        [/^([\s\S]+) · (\d\d:\d\d) Uhr( \(± \d+ m\))?$/, { en: "{1} · <2><3>", fr: "{1} · <2><3>", es: "{1} · <2><3>", it: "{1} · <2><3>", pt: "{1} · <2><3>", zh: "{1} · <2><3>" }],
        [/^Standort (-?\d+\.\d+), (-?\d+\.\d+)$/, { en: "Location <1>, <2>", fr: "Position <1>, <2>", es: "Ubicación <1>, <2>", it: "Posizione <1>, <2>", pt: "Localização <1>, <2>", zh: "位置 <1>，<2>" }],
    ] },
    // --- Ortung: Standortfreigabe geändert ---
    { tag: /^ortung-teilen-/, rules: [
        [/^Standort geteilt$/, { en: "Location shared", fr: "Position partagée", es: "Ubicación compartida", it: "Posizione condivisa", pt: "Localização compartilhada", zh: "位置已共享" }],
        [/^Standort nicht mehr geteilt$/, { en: "Location no longer shared", fr: "Position plus partagée", es: "Ubicación ya no compartida", it: "Posizione non più condivisa", pt: "Localização não mais compartilhada", zh: "位置不再共享" }],
        [/^(.+) hat deine Standortfreigabe in pinn\. eingeschaltet\.$/, { en: "<1> turned on your location sharing in pinn.", fr: "<1> a activé le partage de ta position dans pinn.", es: "<1> ha activado tu ubicación compartida en pinn.", it: "<1> ha attivato la condivisione della tua posizione in pinn.", pt: "<1> ativou o compartilhamento da sua localização no pinn.", zh: "<1> 在 pinn. 中开启了你的位置共享。" }],
        [/^(.+) hat deine Standortfreigabe in pinn\. ausgeschaltet\.$/, { en: "<1> turned off your location sharing in pinn.", fr: "<1> a désactivé le partage de ta position dans pinn.", es: "<1> ha desactivado tu ubicación compartida en pinn.", it: "<1> ha disattivato la condivisione della tua posizione in pinn.", pt: "<1> desativou o compartilhamento da sua localização no pinn.", zh: "<1> 在 pinn. 中关闭了你的位置共享。" }],
    ] },
    // --- Ortung: „Ich bin unterwegs“ (Heimweg) ---
    { tag: /^ortung-unterwegs-/, rules: [
        [/^(.+) ist unterwegs nach Hause$/, { en: "<1> is on the way home", fr: "<1> est en route vers la maison", es: "<1> va de camino a casa", it: "<1> sta tornando a casa", pt: "<1> está a caminho de casa", zh: "<1> 正在回家的路上" }],
        [/^(.+) ist zu Hause angekommen$/, { en: "<1> has arrived home", fr: "<1> est arrivé(e) à la maison", es: "<1> ha llegado a casa", it: "<1> è arrivato/a a casa", pt: "<1> chegou em casa", zh: "<1> 已到家" }],
        [/^Antippen für Live-Standort, Karte und Anruf\. Meldung kommt beim Ankommen\.$/, { en: "Tap for live location, map and call. You’ll be notified on arrival.", fr: "Touche pour la position en direct, la carte et l’appel. Tu seras prévenu(e) à l’arrivée.", es: "Toca para ver la ubicación en directo, el mapa y llamar. Recibirás un aviso al llegar.", it: "Tocca per posizione in tempo reale, mappa e chiamata. Riceverai un avviso all’arrivo.", pt: "Toque para ver a localização ao vivo, o mapa e ligar. Você será avisado ao chegar.", zh: "点按可查看实时位置、地图并拨打电话。到达时你会收到通知。" }],
        [/^Heimweg beendet \((.+)\)\.$/, { en: "Way home finished ({1}).", fr: "Trajet retour terminé ({1}).", es: "Camino a casa terminado ({1}).", it: "Ritorno a casa terminato ({1}).", pt: "Caminho de casa encerrado ({1}).", zh: "回家路程已结束（{1}）。" }],
    ] },
    // --- Ortung: Ankommen / Verlassen eines Orts ---
    { tag: /^ortung-/, rules: [
        [/^(.+) \((\d\d:\d\d) Uhr\)$/, { en: "{1} (<2>)", fr: "{1} (<2>)", es: "{1} (<2>)", it: "{1} (<2>)", pt: "{1} (<2>)", zh: "{1}（<2>）" }],
        [/^(.+) ist zu Hause angekommen\.$/, { en: "<1> has arrived home.", fr: "<1> est arrivé(e) à la maison.", es: "<1> ha llegado a casa.", it: "<1> è arrivato/a a casa.", pt: "<1> chegou em casa.", zh: "<1> 已到家。" }],
        [/^(.+) ist bei „(.+)“ angekommen\.$/, { en: "<1> has arrived at „<2>“.", fr: "<1> est arrivé(e) à „<2>“.", es: "<1> ha llegado a „<2>“.", it: "<1> è arrivato/a da „<2>“.", pt: "<1> chegou em „<2>“.", zh: "<1> 已到达„<2>“。" }],
        [/^(.+) hat das Zuhause verlassen\.$/, { en: "<1> has left home.", fr: "<1> a quitté la maison.", es: "<1> ha salido de casa.", it: "<1> è uscito/a di casa.", pt: "<1> saiu de casa.", zh: "<1> 已离开家。" }],
        [/^(.+) hat „(.+)“ verlassen\.$/, { en: "<1> has left „<2>“.", fr: "<1> a quitté „<2>“.", es: "<1> ha salido de „<2>“.", it: "<1> ha lasciato „<2>“.", pt: "<1> saiu de „<2>“.", zh: "<1> 已离开„<2>“。" }],
    ] },
    // --- Ortung: Einkauf beim Laden automatisch abgehakt ---
    { tag: /^einkauf-/, rules: [
        [/^Einkauf abgehakt$/, { en: "Shopping checked off", fr: "Courses cochées", es: "Compra marcada", it: "Spesa spuntata", pt: "Compras marcadas", zh: "购物已勾选" }],
        [/^(.+) ist erledigt \((\d+) Min\. bei (.+)\)\. Tippe hier, um den Betrag einzutragen\.$/, { en: "{1} is done (<2> min at <3>). Tap here to enter the amount.", fr: "{1} – terminé (<2> min chez <3>). Touche ici pour saisir le montant.", es: "{1}: hecho (<2> min en <3>). Toca aquí para anotar el importe.", it: "{1} è fatto (<2> min da <3>). Tocca qui per inserire l’importo.", pt: "{1} foi concluído (<2> min em <3>). Toque aqui para informar o valor.", zh: "{1} 已完成（在 <3> 停留 <2> 分钟）。点按这里输入金额。" }],
    ] },
    // --- Ortung: im Laden angekommen ---
    { tag: /^laden-/, rules: [
        [/^Du bist bei (.+)$/, { en: "You’re at <1>", fr: "Tu es chez <1>", es: "Estás en <1>", it: "Sei da <1>", pt: "Você está em <1>", zh: "你在 <1>" }],
        [/^Geplant: (.+)\. Tippe hier für die Einkaufsliste\.$/, { en: "Planned: <1>. Tap here for the shopping list.", fr: "Prévu : <1>. Touche ici pour la liste de courses.", es: "Previsto: <1>. Toca aquí para ver la lista de la compra.", it: "Previsto: <1>. Tocca qui per la lista della spesa.", pt: "Planejado: <1>. Toque aqui para ver a lista de compras.", zh: "已计划：<1>。点按这里查看购物清单。" }],
        [/^Tippe hier für die Einkaufsliste\.$/, { en: "Tap here for the shopping list.", fr: "Touche ici pour la liste de courses.", es: "Toca aquí para ver la lista de la compra.", it: "Tocca qui per la lista della spesa.", pt: "Toque aqui para ver a lista de compras.", zh: "点按这里查看购物清单。" }],
    ] },
    // --- Pinnwand: Reaktion / Stimmen / Antwort / Erinnerung / neuer Zettel ---
    { tag: /^pinnwand-reaktion-/, rules: [
        [/^Reaktion auf deinen Zettel$/, { en: "Reaction to your note", fr: "Réaction à ta note", es: "Reacción a tu nota", it: "Reazione al tuo biglietto", pt: "Reação ao seu recado", zh: "对你便签的回应" }],
        [/^([\s\S]+) – „([\s\S]*)“$/, { en: "[1] – „<2>“", fr: "[1] – „<2>“", es: "[1] – „<2>“", it: "[1] – „<2>“", pt: "[1] – „<2>“", zh: "[1]——„<2>“" }],
    ] },
    { tag: /^pinnwand-stimme-/, rules: [
        [/^Neue Stimmen$/, { en: "New votes", fr: "Nouveaux votes", es: "Nuevos votos", it: "Nuovi voti", pt: "Novos votos", zh: "新的投票" }],
        [/^(.+) hat abgestimmt – „([\s\S]*)“$/, { en: "<1> voted – „<2>“", fr: "<1> a voté – „<2>“", es: "<1> ha votado – „<2>“", it: "<1> ha votato – „<2>“", pt: "<1> votou – „<2>“", zh: "<1> 投了票——„<2>“" }],
        [/^(.+) haben abgestimmt – „([\s\S]*)“$/, { en: "[1] voted – „<2>“", fr: "[1] ont voté – „<2>“", es: "[1] han votado – „<2>“", it: "[1] hanno votato – „<2>“", pt: "[1] votaram – „<2>“", zh: "[1] 投了票——„<2>“" }],
    ] },
    { tag: /^pinnwand-antwort-/, rules: [
        [/^(.+) hat geantwortet$/, { en: "<1> replied", fr: "<1> a répondu", es: "<1> ha respondido", it: "<1> ha risposto", pt: "<1> respondeu", zh: "<1> 回复了" }],
    ] },
    { tag: /^pinnwand-erinnerung-/, rules: [
        [/^Erinnerung von der Pinnwand$/, { en: "Reminder from the board", fr: "Rappel du tableau", es: "Recordatorio del tablón", it: "Promemoria dalla bacheca", pt: "Lembrete do mural", zh: "来自留言板的提醒" }],
    ] },
    { tag: /^pinnwand-/, rules: [
        [/^(.+) \(für ([^()]+)\)$/, { en: "{1} (for [2])", fr: "{1} (pour [2])", es: "{1} (para [2])", it: "{1} (per [2])", pt: "{1} (para [2])", zh: "{1}（给 [2]）" }],
        [/^(.+) sagt Danke$/, { en: "<1> says thanks", fr: "<1> dit merci", es: "<1> da las gracias", it: "<1> dice grazie", pt: "<1> agradece", zh: "<1> 说谢谢" }],
        [/^(.+): neue Liste$/, { en: "<1>: new list", fr: "<1> : nouvelle liste", es: "<1>: nueva lista", it: "<1>: nuova lista", pt: "<1>: nova lista", zh: "<1>：新清单" }],
        [/^(.+) hat ein Foto angepinnt$/, { en: "<1> pinned a photo", fr: "<1> a épinglé une photo", es: "<1> ha fijado una foto", it: "<1> ha fissato una foto", pt: "<1> fixou uma foto", zh: "<1> 钉上了一张照片" }],
        [/^Umfrage von (.+)$/, { en: "Poll by <1>", fr: "Sondage de <1>", es: "Encuesta de <1>", it: "Sondaggio di <1>", pt: "Enquete de <1>", zh: "<1> 发起的投票" }],
        [/^(.+) hat etwas angepinnt$/, { en: "<1> pinned something", fr: "<1> a épinglé quelque chose", es: "<1> ha fijado algo", it: "<1> ha fissato qualcosa", pt: "<1> fixou algo", zh: "<1> 钉上了一些东西" }],
        [/^Einfach so\. 💛$/, { en: "Just because. 💛", fr: "Juste comme ça. 💛", es: "Porque sí. 💛", it: "Così, senza motivo. 💛", pt: "Só porque sim. 💛", zh: "没什么特别的理由。💛" }],
        [/^([^:]+): Einfach so\. 💛$/, { en: "[1]: Just because. 💛", fr: "[1] : Juste comme ça. 💛", es: "[1]: Porque sí. 💛", it: "[1]: Così, senza motivo. 💛", pt: "[1]: Só porque sim. 💛", zh: "[1]：没什么特别的理由。💛" }],
        [/^Tippe zum Ansehen\.$/, { en: "Tap to view.", fr: "Touche pour voir.", es: "Toca para ver.", it: "Tocca per vedere.", pt: "Toque para ver.", zh: "点按查看。" }],
        [/^([\s\S]+) – jetzt abstimmen$/, { en: "{1} – vote now", fr: "{1} – vote maintenant", es: "{1} – vota ahora", it: "{1} – vota ora", pt: "{1} – vote agora", zh: "{1}——现在就投票" }],
        [/^Heute!( – [\s\S]*)?$/, { en: "Today!<1>", fr: "Aujourd’hui !<1>", es: "¡Hoy!<1>", it: "Oggi!<1>", pt: "Hoje!<1>", zh: "就是今天！<1>" }],
        [/^Morgen!( – [\s\S]*)?$/, { en: "Tomorrow!<1>", fr: "Demain !<1>", es: "¡Mañana!<1>", it: "Domani!<1>", pt: "Amanhã!<1>", zh: "就是明天！<1>" }],
        [/^Noch (\d+) Tage( – [\s\S]*)?$/, { en: "<1> days to go<2>", fr: "Encore <1> jours<2>", es: "Faltan <1> días<2>", it: "Mancano <1> giorni<2>", pt: "Faltam <1> dias<2>", zh: "还有 <1> 天<2>" }],
        [/^Neuer Countdown von (.+)$/, { en: "New countdown from <1>", fr: "Nouveau compte à rebours de <1>", es: "Nueva cuenta atrás de <1>", it: "Nuovo conto alla rovescia di <1>", pt: "Nova contagem regressiva de <1>", zh: "<1> 发起的新倒计时" }],
    ] },
    // --- Dokumente: Ablauf, Garantie, Gewährleistung ---
    { tag: /^dokument-/, rules: [
        [/^Läuft ab: (.+)$/, { en: "Expires: <1>", fr: "Expire : <1>", es: "Caduca: <1>", it: "Scade: <1>", pt: "Vence: <1>", zh: "到期：<1>" }],
        [/^Garantie endet: (.+)$/, { en: "Warranty ends: <1>", fr: "Fin de garantie : <1>", es: "Fin de la garantía: <1>", it: "Fine della garanzia: <1>", pt: "Fim da garantia: <1>", zh: "保修结束：<1>" }],
        [/^Gewährleistung endet: (.+)$/, { en: "Statutory warranty ends: <1>", fr: "Fin de la garantie légale : <1>", es: "Fin de la garantía legal: <1>", it: "Fine della garanzia legale: <1>", pt: "Fim da garantia legal: <1>", zh: "法定保修结束：<1>" }],
        [/^Gültig bis (\S+) \((.+?)\) – rechtzeitig verlängern oder erneuern\.$/, { en: "Valid until {1} ({2}) – renew or replace in good time.", fr: "Valable jusqu’au {1} ({2}) – à prolonger ou renouveler à temps.", es: "Válido hasta el {1} ({2}) – renuévalo a tiempo.", it: "Valido fino al {1} ({2}) – rinnova o sostituisci in tempo.", pt: "Válido até {1} ({2}) – renove ou substitua a tempo.", zh: "有效期至 {1}（{2}）——请及时续期或更换。" }],
        [/^Die Herstellergarantie endet am (\S+) \((.+?)\)\. Mängel am besten vorher melden\.$/, { en: "The manufacturer’s warranty ends on {1} ({2}). Best report any defects before then.", fr: "La garantie du fabricant prend fin le {1} ({2}). Mieux vaut signaler les défauts avant.", es: "La garantía del fabricante termina el {1} ({2}). Mejor comunica los defectos antes.", it: "La garanzia del produttore termina il {1} ({2}). Meglio segnalare eventuali difetti prima.", pt: "A garantia do fabricante termina em {1} ({2}). O melhor é comunicar defeitos antes disso.", zh: "厂商保修将于 {1}（{2}）结束。最好在此之前报告缺陷。" }],
        [/^Die gesetzliche Gewährleistung endet am (\S+) \((.+?)\)\. Mängel vorher beim Händler reklamieren\.$/, { en: "The statutory warranty ends on {1} ({2}). Report defects to the retailer before then.", fr: "La garantie légale prend fin le {1} ({2}). Réclame les défauts auprès du vendeur avant.", es: "La garantía legal termina el {1} ({2}). Reclama los defectos al vendedor antes.", it: "La garanzia legale termina il {1} ({2}). Segnala i difetti al venditore prima di allora.", pt: "A garantia legal termina em {1} ({2}). Comunique os defeitos ao vendedor antes disso.", zh: "法定保修将于 {1}（{2}）结束。请在此之前向卖家反映缺陷。" }],
    ] },
    // --- Verträge: Kündigungsfrist, Vertragsende, eigene Erinnerung ---
    { tag: /^vertrag-/, rules: [
        [/^Letzte Chance: (.+) kündigen$/, { en: "Last chance: cancel <1>", fr: "Dernière chance : résilier <1>", es: "Última oportunidad: cancelar <1>", it: "Ultima possibilità: disdire <1>", pt: "Última chance: cancelar <1>", zh: "最后机会：解除 <1>" }],
        [/^Kündigungsfrist: (.+)$/, { en: "Notice period: <1>", fr: "Préavis : <1>", es: "Plazo de preaviso: <1>", it: "Preavviso: <1>", pt: "Prazo de aviso: <1>", zh: "通知期：<1>" }],
        [/^Vertrag endet: (.+)$/, { en: "Contract ends: <1>", fr: "Fin du contrat : <1>", es: "Fin del contrato: <1>", it: "Il contratto termina: <1>", pt: "O contrato termina: <1>", zh: "合同结束：<1>" }],
        [/^Kündigung bis (\S+) \((.+?)\) zum (\S+) – sonst verlängert er sich um einen Monat\.$/, { en: "Cancel by {1} ({2}) to end on {3} – otherwise it renews for one month.", fr: "Résiliation avant le {1} ({2}) pour le {3} – sinon il est prolongé d’un mois.", es: "Cancela antes del {1} ({2}) para el {3}; si no, se prorroga un mes.", it: "Disdici entro il {1} ({2}) per terminare il {3}: altrimenti si rinnova di un mese.", pt: "Cancele até {1} ({2}) para encerrar em {3} – senão renova por um mês.", zh: "请在 {1}（{2}）前解约，于 {3} 终止——否则将续期一个月。" }],
        [/^Kündigung bis (\S+) \((.+?)\) zum (\S+) – sonst verlängert er sich um (\d+) Monate\.$/, { en: "Cancel by {1} ({2}) to end on {3} – otherwise it renews for <4> months.", fr: "Résiliation avant le {1} ({2}) pour le {3} – sinon il est prolongé de <4> mois.", es: "Cancela antes del {1} ({2}) para el {3}; si no, se prorroga <4> meses.", it: "Disdici entro il {1} ({2}) per terminare il {3}: altrimenti si rinnova di <4> mesi.", pt: "Cancele até {1} ({2}) para encerrar em {3} – senão renova por <4> meses.", zh: "请在 {1}（{2}）前解约，于 {3} 终止——否则将续期 <4> 个月。" }],
        [/^Der Vertrag endet am (\S+) \((.+?)\)\.$/, { en: "The contract ends on {1} ({2}).", fr: "Le contrat prend fin le {1} ({2}).", es: "El contrato termina el {1} ({2}).", it: "Il contratto termina il {1} ({2}).", pt: "O contrato termina em {1} ({2}).", zh: "合同将于 {1}（{2}）结束。" }],
        [/^Erinnerung zu diesem Vertrag$/, { en: "Reminder for this contract", fr: "Rappel pour ce contrat", es: "Recordatorio de este contrato", it: "Promemoria per questo contratto", pt: "Lembrete deste contrato", zh: "此合同的提醒" }],
    ] },
    // --- Vorrat: Mindesthaltbarkeit (pinn-vorrat.js) ---
    { tag: /^vorrat-/, rules: [
        [/^Läuft heute ab: (.+)$/, { en: "Expires today: <1>", fr: "Expire aujourd’hui : <1>", es: "Caduca hoy: <1>", it: "Scade oggi: <1>", pt: "Vence hoje: <1>", zh: "今天过期：<1>" }],
        [/^Läuft morgen ab: (.+)$/, { en: "Expires tomorrow: <1>", fr: "Expire demain : <1>", es: "Caduca mañana: <1>", it: "Scade domani: <1>", pt: "Vence amanhã: <1>", zh: "明天过期：<1>" }],
        [/^Läuft bald ab: (.+)$/, { en: "Expiring soon: <1>", fr: "Expire bientôt : <1>", es: "Caduca pronto: <1>", it: "In scadenza: <1>", pt: "Vencendo em breve: <1>", zh: "即将过期：<1>" }],
        [/^Abgelaufen: (.+)$/, { en: "Expired: <1>", fr: "Périmé : <1>", es: "Caducado: <1>", it: "Scaduto: <1>", pt: "Vencido: <1>", zh: "已过期：<1>" }],
        [/^(\d+) Vorrats-Artikel laufen bald ab$/, { en: "<1> pantry items expiring soon", fr: "<1> articles des réserves expirent bientôt", es: "<1> artículos de la despensa caducan pronto", it: "<1> articoli della dispensa in scadenza", pt: "<1> itens da despensa vencendo em breve", zh: "<1> 项储藏物品即将过期" }],
        [/^([^·]+) \(heute\)$/, { en: "<1> (today)", fr: "<1> (aujourd’hui)", es: "<1> (hoy)", it: "<1> (oggi)", pt: "<1> (hoje)", zh: "<1>（今天）" }],
        [/^([^·]+) \(morgen\)$/, { en: "<1> (tomorrow)", fr: "<1> (demain)", es: "<1> (mañana)", it: "<1> (domani)", pt: "<1> (amanhã)", zh: "<1>（明天）" }],
        [/^([^·]+) \(in (\d+) Tagen\)$/, { en: "<1> (in <2> days)", fr: "<1> (dans <2> jours)", es: "<1> (en <2> días)", it: "<1> (tra <2> giorni)", pt: "<1> (em <2> dias)", zh: "<1>（<2> 天后）" }],
        [/^([^·]+) \(seit gestern abgelaufen\)$/, { en: "<1> (expired yesterday)", fr: "<1> (périmé depuis hier)", es: "<1> (caducado desde ayer)", it: "<1> (scaduto ieri)", pt: "<1> (venceu ontem)", zh: "<1>（昨天已过期）" }],
        [/^([^·]+) \(seit (\d+) Tagen abgelaufen\)$/, { en: "<1> (expired <2> days ago)", fr: "<1> (périmé depuis <2> jours)", es: "<1> (caducado hace <2> días)", it: "<1> (scaduto <2> giorni fa)", pt: "<1> (venceu há <2> dias)", zh: "<1>（<2> 天前已过期）" }],
        [/^Tippe hier für Rezeptideen mit dem, was da ist\.$/, { en: "Tap here for recipe ideas with what you have.", fr: "Touche ici pour des idées de recettes avec ce que tu as.", es: "Toca aquí para ver ideas de recetas con lo que tienes.", it: "Tocca qui per idee di ricette con quello che c’è.", pt: "Toque aqui para ver ideias de receitas com o que você tem.", zh: "点按这里，用现有的食材找食谱灵感。" }],
    ] },
    // --- Extra-Erinnerung an Aufgaben (pinn-push.js, ab 1.57) – der Aufgabentitel bleibt unverändert ---
    { tag: /^aufgabe-erinnerung-/, rules: [
        [/^Heute fällig – du bist dran\.$/, { en: "Due today – it’s your turn.", fr: "À faire aujourd’hui – c’est ton tour.", es: "Vence hoy – te toca.", it: "Scade oggi: tocca a te.", pt: "Vence hoje – é a sua vez.", zh: "今天到期——轮到你了。" }],
        [/^Heute fällig\.$/, { en: "Due today.", fr: "À faire aujourd’hui.", es: "Vence hoy.", it: "Scade oggi.", pt: "Vence hoje.", zh: "今天到期。" }],
    ] },
    // --- Müllabfuhr am Vortag (pinn-push.js, ab 1.31) – die Müllarten selbst bleiben wie im Kalender ---
    { tag: /^muell-/, rules: [
        [/^Morgen ist Müllabfuhr$/, { en: "Bin collection tomorrow", fr: "Collecte des déchets demain", es: "Mañana pasa la recogida de basura", it: "Domani raccolta rifiuti", pt: "Amanhã tem coleta de lixo", zh: "明天垃圾回收" }],
        [/^Du bist dran: (.+)$/, { en: "Your turn: <1>", fr: "C’est ton tour : <1>", es: "Te toca: <1>", it: "Tocca a te: <1>", pt: "Sua vez: <1>", zh: "轮到你了：<1>" }],
        [/^Dran: (.+)$/, { en: "Taking the bins out: <1>", fr: "Sort les poubelles : <1>", es: "Saca la basura: <1>", it: "Portare fuori i bidoni: <1>", pt: "Levar as lixeiras para fora: <1>", zh: "拿出垃圾桶：<1>" }],
    ] },
    // --- Sicherheit: Profil nach zu vielen falschen Passwörtern gesperrt (pinn-sitzungen.js) ---
    { tag: /^sicherheit-/, rules: [
        [/^🔒 Anmeldung gesperrt$/, { en: "🔒 Login locked", fr: "🔒 Connexion bloquée", es: "🔒 Inicio de sesión bloqueado", it: "🔒 Accesso bloccato", pt: "🔒 Login bloqueado", zh: "🔒 登录已锁定" }],
        [/^Zu viele falsche Passwörter für „(.+)“\. Das Profil ist vorübergehend gesperrt – die Sperre lässt sich unter Konto → Profile verwalten aufheben\.$/, {
            en: "Too many wrong passwords for „<1>“. The profile is temporarily locked – you can unlock it under Account → Manage profiles.",
            fr: "Trop de mots de passe erronés pour „<1>“. Le profil est temporairement bloqué – tu peux le débloquer sous Compte → Gérer les profils.",
            es: "Demasiadas contraseñas incorrectas para „<1>“. El perfil está bloqueado temporalmente – puedes desbloquearlo en Cuenta → Gestionar perfiles.", it: "Troppe password errate per „<1>“. Il profilo è temporaneamente bloccato: puoi sbloccarlo da Account → Gestisci profili.", pt: "Muitas senhas erradas para „<1>“. O perfil está temporariamente bloqueado – você pode desbloqueá-lo em Conta → Gerenciar perfis.", zh: "„<1>“ 的错误密码次数过多。该个人资料已被暂时锁定——可在“账号 → 管理个人资料”中解锁。",
        }],
    ] },
    // --- Kassen: Ausgleich eingetragen / zur Kasse hinzugefügt ---
    { tag: /^ausgleich-/, rules: [
        [/^Ausgleich: (.+)$/, { en: "Settlement: <1>", fr: "Règlement : <1>", es: "Liquidación: <1>", it: "Conguaglio: <1>", pt: "Acerto: <1>", zh: "结算：<1>" }],
        [/^([\s\S]+) wurde für dich eingetragen\.$/, { en: "{1} was recorded for you.", fr: "{1} a été enregistré pour toi.", es: "{1} se ha registrado para ti.", it: "{1} è stato registrato per te.", pt: "{1} foi registrado para você.", zh: "已为你记录 {1}。" }],
    ] },
    { tag: /^kasse-/, rules: [
        [/^(.+) hat dich zur Kasse „(.+)“ hinzugefügt\.( Ausgaben werden geteilt\.)?$/, {
            en: (g, h) => h.t(g[1]) + " added you to the fund „" + g[2] + "“." + (g[3] ? " Expenses are shared." : ""),
            fr: (g, h) => h.t(g[1]) + " t’a ajouté(e) à la caisse „" + g[2] + "“." + (g[3] ? " Les dépenses sont partagées." : ""),
            es: (g, h) => h.t(g[1]) + " te ha añadido a la caja „" + g[2] + "“." + (g[3] ? " Los gastos se comparten." : ""),
            it: (g, h) => h.t(g[1]) + " ti ha aggiunto alla cassa „" + g[2] + "“." + (g[3] ? " Le spese sono condivise." : ""),
            pt: (g, h) => h.t(g[1]) + " adicionou você à caixa „" + g[2] + "“." + (g[3] ? " As despesas são compartilhadas." : ""),
            zh: (g, h) => h.t(g[1]) + " 把你加入了资金池„" + g[2] + "“。" + (g[3] ? "支出会分摊。" : ""),
        }],
    ] },
];

// Ersatztext, wenn ein Gerät geweckt wird, die Nachricht aber nicht (mehr) abholbar ist
const FALLBACK = {
    de: { titel: "pinn.", text: "Es gibt Neuigkeiten in pinn." },
    en: { titel: "pinn.", text: "There’s something new in pinn." },
    fr: { titel: "pinn.", text: "Il y a du nouveau dans pinn." },
    es: { titel: "pinn.", text: "Hay novedades en pinn." },
    it: { titel: "pinn.", text: "C’è una novità in pinn." },
    pt: { titel: "pinn.", text: "Há novidades no pinn." },
    zh: { titel: "pinn.", text: "pinn. 有新动态" },
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
    if (lang === "es" || lang === "it") return s.replace(/„([^„“]*)“/g, "«$1»");
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

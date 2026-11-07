// pb_hooks/pinn-wobistdu.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
//
// "Where are you?" (Overview → tile "Family members" → tap a person):
//   - Someone asks a person who is currently not sharing a live location. All profiles that are linked to this
//     family member get a push message (link /?wobistdu=<ID>).
//   - The person answers in pinn. with their current location (once from the browser - nothing
//     is shared permanently) or with a short reply ("At home", "Be there soon" ...).
//   - Whoever asked gets the reply as a push message and sees it in pinn. on a map.
//
// Data: pb_data/pinn_wobistdu.json - only the last 24 hours, older requests are discarded.
//   [{ id, familie, von (profile ID), vonMitglied, vonName, an (member ID), anName, zeit,
//      antwort: { zeit, lat, lon, genau, text, wer (profile ID) } }]
// At most one open question per asker and person within 2 minutes (no push storm).

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
    } catch (e) { /* no file yet */ }
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
    if (["de", "en", "fr", "es", "it", "pt", "zh", "ja", "ko", "ru", "nl", "tr", "pl"].indexOf(s) >= 0) return s;
    if (/^[a-z]{2}$/.test(s)) return "en";
    const land = String(w.land || "").toUpperCase();
    if (["DE", "AT", "CH", "LI", "LU"].indexOf(land) >= 0) return "de";
    if (["FR", "BE", "MC"].indexOf(land) >= 0) return "fr";
    if (["ES", "MX", "AR", "CO", "CL", "PE"].indexOf(land) >= 0) return "es";
    if (["IT", "SM", "VA"].indexOf(land) >= 0) return "it";
    if (["BR", "PT", "AO", "MZ"].indexOf(land) >= 0) return "pt";
    if (["CN"].indexOf(land) >= 0) return "zh";
    if (["JP"].indexOf(land) >= 0) return "ja";
    if (["KR"].indexOf(land) >= 0) return "ko";
    if (["RU"].indexOf(land) >= 0) return "ru";
    if (["NL", "SR", "AW", "CW", "SX"].indexOf(land) >= 0) return "nl";
    if (["TR"].indexOf(land) >= 0) return "tr";
    if (["PL"].indexOf(land) >= 0) return "pl";
    return "en";
}
const CODE_TEXT = {
    de: { zuhause: "🏠 Bin zu Hause", unterwegs: "🚶 Bin unterwegs", gleich: "⏱️ Bin gleich da", gut: "👍 Alles gut", anrufen: "📞 Ruf mich an" },
    en: { zuhause: "🏠 I'm at home", unterwegs: "🚶 I'm on the move", gleich: "⏱️ Almost there", gut: "👍 All good", anrufen: "📞 Call me" },
    fr: { zuhause: "🏠 Je suis à la maison", unterwegs: "🚶 Je suis en route", gleich: "⏱️ J'arrive bientôt", gut: "👍 Tout va bien", anrufen: "📞 Appelle-moi" },
    es: { zuhause: "🏠 Estoy en casa", unterwegs: "🚶 Estoy en camino", gleich: "⏱️ Llego enseguida", gut: "👍 Todo bien", anrufen: "📞 Llámame" },
    it: { zuhause: "🏠 Sono a casa", unterwegs: "🚶 Sono in giro", gleich: "⏱️ Arrivo subito", gut: "👍 Tutto bene", anrufen: "📞 Chiamami" },
    pt: { zuhause: "🏠 Estou em casa", unterwegs: "🚶 Estou a caminho", gleich: "⏱️ Chego já", gut: "👍 Tudo bem", anrufen: "📞 Me ligue" },
    zh: { zuhause: "🏠 我在家", unterwegs: "🚶 我在路上", gleich: "⏱️ 马上到", gut: "👍 一切都好", anrufen: "📞 给我打电话" },
    ja: { zuhause: "🏠 家にいます", unterwegs: "🚶 移動中です", gleich: "⏱️ もうすぐ着きます", gut: "👍 大丈夫です", anrufen: "📞 電話してください" },
    ko: { zuhause: "🏠 집이에요", unterwegs: "🚶 이동 중이에요", gleich: "⏱️ 곧 도착해요", gut: "👍 괜찮아요", anrufen: "📞 전화해 주세요" },
    ru: { zuhause: "🏠 Я дома", unterwegs: "🚶 Я в пути", gleich: "⏱️ Почти на месте", gut: "👍 Всё хорошо", anrufen: "📞 Позвони мне" },
    nl: { zuhause: "🏠 Ik ben thuis", unterwegs: "🚶 Ik ben onderweg", gleich: "⏱️ Ben er zo", gut: "👍 Alles goed", anrufen: "📞 Bel me" },
    tr: { zuhause: "🏠 Evdeyim", unterwegs: "🚶 Yoldayım", gleich: "⏱️ Neredeyse vardım", gut: "👍 Her şey yolunda", anrufen: "📞 Beni ara" },
    pl: { zuhause: "🏠 Jestem w domu", unterwegs: "🚶 Jestem w drodze", gleich: "⏱️ Zaraz będę", gut: "👍 Wszystko w porządku", anrufen: "📞 Zadzwoń do mnie" },
};
function askMessage(lang, name) {
    const n = name || ({ de: "Jemand", en: "Someone", fr: "Quelqu'un", es: "Alguien", it: "Qualcuno", pt: "Alguém", zh: "有人", ja: "誰か", ko: "누군가", ru: "Кто-то", nl: "Iemand", tr: "Biri", pl: "Ktoś" }[lang]);
    if (lang === "de") return { titel: "📍 " + n + " fragt: Wo bist du?", text: "Tippe hier, um deinen Standort zu schicken oder kurz zu antworten." };
    if (lang === "fr") return { titel: "📍 " + n + " demande : où es-tu ?", text: "Touche ici pour envoyer ta position ou répondre en un mot." };
    if (lang === "es") return { titel: "📍 " + n + " pregunta: ¿dónde estás?", text: "Toca aquí para enviar tu ubicación o responder rápido." };
    if (lang === "it") return { titel: "📍 " + n + " chiede: dove sei?", text: "Tocca qui per inviare la tua posizione o rispondere al volo." };
    if (lang === "pt") return { titel: "📍 " + n + " pergunta: onde você está?", text: "Toque aqui para enviar sua localização ou responder rápido." };
    if (lang === "zh") return { titel: "📍 " + n + " 问：你在哪里？", text: "点按这里发送你的位置或快速回复。" };
    if (lang === "ja") return { titel: "📍 " + n + "から：今どこ？", text: "タップして位置を送るか、ひとことで返信できます。" };
    if (lang === "ko") return { titel: "📍 " + n + "님이 물어요: 어디야?", text: "여기를 탭해 위치를 보내거나 짧게 답하세요." };
    if (lang === "ru") return { titel: "📍 " + n + " спрашивает: где ты?", text: "Нажмите здесь, чтобы отправить местоположение или коротко ответить." };
    if (lang === "nl") return { titel: "📍 " + n + " vraagt: waar ben je?", text: "Tik hier om je locatie te sturen of kort te antwoorden." };
    if (lang === "tr") return { titel: "📍 " + n + " soruyor: neredesin?", text: "Konumunu göndermek veya kısaca yanıtlamak için buraya dokun." };
    if (lang === "pl") return { titel: "📍 " + n + " pyta: gdzie jesteś?", text: "Dotknij tutaj, aby wysłać swoją lokalizację lub krótko odpowiedzieć." };
    return { titel: "📍 " + n + " asks: where are you?", text: "Tap here to send your location or a quick reply." };
}
function answerMessage(lang, name, a) {
    const n = name || ({ de: "Jemand", en: "Someone", fr: "Quelqu'un", es: "Alguien", it: "Qualcuno", pt: "Alguém", zh: "有人", ja: "誰か", ko: "누군가", ru: "Кто-то", nl: "Iemand", tr: "Biri", pl: "Ktoś" }[lang]);
    const t = a.text ? ((CODE_TEXT[lang] || CODE_TEXT.en)[a.text] || ("„" + a.text + "“")) : "";
    if (lang === "de") return { titel: "📍 " + n + " hat geantwortet", text: a.lat != null ? "Standort geschickt – tippe zum Ansehen." : t };
    if (lang === "fr") return { titel: "📍 " + n + " a répondu", text: a.lat != null ? "Position envoyée – touche pour la voir." : t };
    if (lang === "es") return { titel: "📍 " + n + " ha respondido", text: a.lat != null ? "Ubicación enviada: toca para verla." : t };
    if (lang === "it") return { titel: "📍 " + n + " ha risposto", text: a.lat != null ? "Posizione inviata: tocca per vederla." : t };
    if (lang === "pt") return { titel: "📍 " + n + " respondeu", text: a.lat != null ? "Localização enviada – toque para ver." : t };
    if (lang === "zh") return { titel: "📍 " + n + " 回复了", text: a.lat != null ? "位置已发送——点按查看。" : t };
    if (lang === "ja") return { titel: "📍 " + n + "から返信がありました", text: a.lat != null ? "位置が送られました – タップして表示。" : t };
    if (lang === "ko") return { titel: "📍 " + n + "님이 답했어요", text: a.lat != null ? "위치를 보냈어요 – 탭해서 보기." : t };
    if (lang === "ru") return { titel: "📍 " + n + " ответил(а)", text: a.lat != null ? "Местоположение отправлено – нажмите, чтобы посмотреть." : t };
    if (lang === "nl") return { titel: "📍 " + n + " heeft geantwoord", text: a.lat != null ? "Locatie gestuurd – tik om te bekijken." : t };
    if (lang === "tr") return { titel: "📍 " + n + " yanıtladı", text: a.lat != null ? "Konum gönderildi – görmek için dokun." : t };
    if (lang === "pl") return { titel: "📍 " + n + ": odpowiedź", text: a.lat != null ? "Lokalizacja wysłana – dotknij, aby zobaczyć." : t };
    return { titel: "📍 " + n + " replied", text: a.lat != null ? "Location sent – tap to view." : t };
}

function targetsFor(familyId, memberId) {
    try {
        return $app.findRecordsByFilter("benutzer", "familie = {:f} && mitglied = {:m} && rolle != 'gast'", "", 0, 0, { f: familyId, m: memberId });
    } catch (e) { return []; }
}

// Ask a question
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
            try { sent += push.notifyUser(t.id, { titel: msg.titel, text: msg.text, url: "/?wobistdu=" + item.id, tag: "wobistdu-" + item.id, urgency: "high" }) || 0; } catch (err) { /* next profile */ }
        });
    } catch (err) {
        console.log("[Wo bist du] Push: " + err.message);
    }
    return { id: item.id, push: sent };
}

// Answer (only the person asked)
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

// For the app: own questions (with answers) and questions to me, last 24 hours
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

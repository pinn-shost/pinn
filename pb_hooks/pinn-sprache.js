// pb_hooks/pinn-sprache.js
// Not a *.pb.js file -> NOT loaded as a hook automatically, only via require() from sprache.pb.js.
//
// Voice control (Settings -> Sprachsteuerung): every profile can create a personal, secret link. A Siri shortcut
// (on Android "HTTP Shortcuts") sends the spoken sentence there; pinn. understands it (German, English, French, Spanish,
// Russian, Dutch, Italian, Portuguese, Chinese, Japanese, Korean, Turkish, Polish, Ukrainian) and answers with one
// sentence to be read aloud - in the language of the profile (Russian since 1.121.0, nl/it/pt/zh/ja/ko since 1.128.0,
// Turkish, Polish and Ukrainian since 1.137.0).
//
// Commands:
//   - add to the shopping list:  "Milch und zwei Packungen Eier auf die Einkaufsliste (bei Rewe)"
//   - read the shopping list:    "Was steht auf der Einkaufsliste?"
//   - create a task:             "Erinnere mich morgen an den Müll" - "Aufgabe: Fenster putzen am Samstag"
//   - daily overview:            "Was steht heute an?" - "Was steht morgen an?" (events + open tasks)
//   - widget data (since 1.140.0): read-only overview for iPhone widgets and the Apple Watch (widgetData)
//
// Collection "sprache_zugaenge" (locked, only via the routes): { benutzer, familie, token }
// Guests have no voice control; profiles with child lock can only ask what is on.
// Protection: at most 30 commands per minute and link.

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
    try { return $security.randomString(40); } catch (e) { /* continue */ }
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
// Profile: language, guest, child lock
// ---------------------------------------------------------------------------------------------
function langOf(u) {
    let w = {};
    try { w = require(`${__hooks}/pinn-design.js`).readDesign(u).werte || {}; } catch (e) { w = {}; }
    const s = String(w.sprache || "");
    if (["de", "en", "fr", "es", "ru", "nl", "it", "pt", "zh", "ja", "ko", "tr", "pl", "uk"].indexOf(s) >= 0) return s;
    if (/^[a-z]{2}$/.test(s)) return "en";
    const land = String(w.land || "").toUpperCase();
    if (["DE", "AT", "CH", "LI", "LU"].indexOf(land) >= 0) return "de";
    if (["FR", "BE", "MC"].indexOf(land) >= 0) return "fr";
    if (["ES", "MX", "AR", "CO", "CL", "PE"].indexOf(land) >= 0) return "es";
    if (["RU"].indexOf(land) >= 0) return "ru";
    if (["NL", "SR"].indexOf(land) >= 0) return "nl";
    if (["IT", "SM", "VA"].indexOf(land) >= 0) return "it";
    if (["PT", "BR", "AO", "MZ"].indexOf(land) >= 0) return "pt";
    if (["CN", "TW", "HK", "MO"].indexOf(land) >= 0) return "zh";
    if (["JP"].indexOf(land) >= 0) return "ja";
    if (["KR"].indexOf(land) >= 0) return "ko";
    if (["TR"].indexOf(land) >= 0) return "tr";
    if (["PL"].indexOf(land) >= 0) return "pl";
    if (["UA"].indexOf(land) >= 0) return "uk";
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
// Set-up / status (signed in)
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
    if (rec) { try { $app.delete(rec); } catch (e) { /* ignore */ } }
}

// ---------------------------------------------------------------------------------------------
// Texts (answers)
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
    ru: {
        help: "Я могу добавлять товары в список покупок, зачитывать список, создавать задачи и говорить, что запланировано на сегодня. Скажите, например: добавь молоко и яйца в список покупок.",
        added: "{l}, добавлено: {i}.", already: "{l}: уже есть – {i}.", addedSome: "{l}, добавлено: {i}. Уже было: {d}.",
        listEmpty: "{l} пуст.", listHas: "{l}: {i}.", more: "и ещё {n}",
        task: "Задача создана: {t}{d}.", due: " {d}",
        today: "на сегодня", tomorrow: "на завтра", dayLead: { 0: "Сегодня", 1: "Завтра" },
        nothing: "{w} ничего не запланировано.", events: "События: {e}.", tasks: "Открытые задачи: {t}.", allday: "весь день",
        childLock: "В детском режиме я могу только зачитывать, что запланировано.", noItems: "Не удалось понять, что добавить в список.",
        noTask: "Не удалось понять, какую задачу создать.", error: "К сожалению, не получилось: {m}",
        listName: "Список покупок", listNamed: "Список {n}", and: "и",
        days: ["на воскресенье", "на понедельник", "на вторник", "на среду", "на четверг", "на пятницу", "на субботу"],
    },
    // Optional per-language settings: lc = keep the list name lower case in the middle of a sentence, sep / lastSep = list
    // separators (default ", " and " <and> "), colon / glue = joiner of the daily overview (default ":" and " "),
    // listNameN / listNamedN / listNameP / listNamedP = list name as subject ({N}) and after "on/in" ({P}) for languages with
    // cases (default: the same as listName / listNamed = {l}), tr = Turkish capital letters (i -> İ)
    nl: {
        help: "Ik kan dingen op het boodschappenlijstje zetten, het lijstje voorlezen, taken aanmaken en vertellen wat er vandaag op het programma staat. Zeg bijvoorbeeld: zet melk en eieren op het boodschappenlijstje.",
        added: "Toegevoegd aan {l}: {i}.", already: "{i} staat al op {l}.", addedSome: "Toegevoegd aan {l}: {i}. Stond er al op: {d}.",
        listEmpty: "{l} is leeg.", listHas: "Op {l}: {i}.", more: "en nog {n}",
        task: "Taak aangemaakt: {t}{d}.", due: ", voor {d}",
        today: "vandaag", tomorrow: "morgen", dayLead: { 0: "Vandaag", 1: "Morgen" },
        nothing: "{w} staat er niets op het programma.", events: "Afspraken: {e}.", tasks: "Openstaande taken: {t}.", allday: "hele dag",
        childLock: "Met kinderslot kan ik alleen voorlezen wat er op het programma staat.", noItems: "Ik heb niet begrepen wat er op het lijstje moet.",
        noTask: "Ik heb niet begrepen welke taak ik moet aanmaken.", error: "Helaas, dat is niet gelukt: {m}",
        listName: "het boodschappenlijstje", listNamed: "de lijst {n}", and: "en",
        days: ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"],
    },
    it: {
        lc: true,
        help: "Posso aggiungere cose alla lista della spesa, leggere la lista, creare attività e dirti cosa c'è in programma oggi. Di' per esempio: aggiungi latte e uova alla lista della spesa.",
        added: "Aggiunto alla {l}: {i}.", already: "{i} è già nella {l}.", addedSome: "Aggiunto alla {l}: {i}. Erano già presenti: {d}.",
        listEmpty: "La {l} è vuota.", listHas: "Nella {l}: {i}.", more: "e altri {n}",
        task: "Attività creata: {t}{d}.", due: ", per {d}",
        today: "oggi", tomorrow: "domani", dayLead: { 0: "Oggi", 1: "Domani" },
        nothing: "{w} non c'è niente in programma.", events: "Appuntamenti: {e}.", tasks: "Attività aperte: {t}.", allday: "tutto il giorno",
        childLock: "Con il blocco bambini posso solo leggere cosa c'è in programma.", noItems: "Non ho capito cosa aggiungere alla lista.",
        noTask: "Non ho capito quale attività creare.", error: "Mi dispiace, non ha funzionato: {m}",
        listName: "lista della spesa", listNamed: "lista {n}", and: "e",
        days: ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"],
    },
    pt: {
        lc: true,
        help: "Posso adicionar itens à lista de compras, ler a lista, criar tarefas e dizer o que tem para hoje. Diga, por exemplo: adicione leite e ovos à lista de compras.",
        added: "Adicionado à {l}: {i}.", already: "{i} já está na {l}.", addedSome: "Adicionado à {l}: {i}. Já estava: {d}.",
        listEmpty: "A {l} está vazia.", listHas: "Na {l}: {i}.", more: "e mais {n}",
        task: "Tarefa criada: {t}{d}.", due: ", para {d}",
        today: "hoje", tomorrow: "amanhã", dayLead: { 0: "Hoje", 1: "Amanhã" },
        nothing: "{w} não há nada.", events: "Compromissos: {e}.", tasks: "Tarefas em aberto: {t}.", allday: "o dia todo",
        childLock: "Com o controle parental, só posso ler o que está na agenda.", noItems: "Não entendi o que colocar na lista.",
        noTask: "Não entendi qual tarefa criar.", error: "Desculpe, não deu certo: {m}",
        listName: "lista de compras", listNamed: "lista {n}", and: "e",
        days: ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"],
    },
    zh: {
        lc: true, sep: "、", lastSep: "和", colon: "", glue: "",
        help: "我可以把东西加到购物清单、朗读清单、创建任务，并告诉你今天有什么安排。比如说：把牛奶和鸡蛋加到购物清单。",
        added: "已加到{l}：{i}。", already: "{i}已经在{l}里了。", addedSome: "已加到{l}：{i}。已有：{d}。",
        listEmpty: "{l}是空的。", listHas: "{l}上有：{i}。", more: "另外{n}项",
        task: "已创建任务：{t}{d}。", due: "，{d}到期",
        today: "今天", tomorrow: "明天", dayLead: { 0: "今天", 1: "明天" },
        nothing: "{w}没有安排。", events: "日程：{e}。", tasks: "待办任务：{t}。", allday: "全天",
        childLock: "开启儿童锁时，我只能朗读安排。", noItems: "我没听懂要把什么加到清单。",
        noTask: "我没听懂要创建什么任务。", error: "抱歉，没成功：{m}",
        listName: "购物清单", listNamed: "{n}清单", and: "和",
        days: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    },
    ja: {
        lc: true, sep: "、", lastSep: "と", colon: "の", glue: "",
        help: "買い物リストへの追加、リストの読み上げ、タスクの作成、今日の予定の確認ができます。たとえば「買い物リストに牛乳と卵を追加して」と言ってください。",
        added: "{l}に追加しました：{i}。", already: "{i}はすでに{l}にあります。", addedSome: "{l}に追加しました：{i}。すでにあった項目：{d}。",
        listEmpty: "{l}は空です。", listHas: "{l}：{i}。", more: "ほか{n}件",
        task: "タスクを作成しました：{t}{d}。", due: "（期限：{d}）",
        today: "今日", tomorrow: "明日", dayLead: { 0: "今日", 1: "明日" },
        nothing: "{w}の予定はありません。", events: "予定：{e}。", tasks: "未完了のタスク：{t}。", allday: "終日",
        childLock: "チャイルドロックがかかっているため、予定の読み上げのみ可能です。", noItems: "リストに追加する内容を聞き取れませんでした。",
        noTask: "作成するタスクを聞き取れませんでした。", error: "すみません、うまくいきませんでした：{m}",
        listName: "買い物リスト", listNamed: "{n}のリスト", and: "と",
        days: ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"],
    },
    ko: {
        lc: true, lastSep: " 그리고 ", colon: "의", glue: " ",
        help: "장보기 목록에 항목을 추가하고, 목록을 읽어 주고, 할 일을 만들고, 오늘 일정을 알려 드릴 수 있어요. 예를 들어 이렇게 말해 보세요: 장보기 목록에 우유랑 달걀 추가해 줘.",
        added: "{l}에 추가했어요: {i}.", already: "{l}에 이미 있어요: {i}.", addedSome: "{l}에 추가했어요: {i}. 이미 있던 항목: {d}.",
        listEmpty: "{l}은 비어 있어요.", listHas: "{l}: {i}.", more: "그 외 {n}개",
        task: "할 일을 만들었어요: {t}{d}.", due: " (기한: {d})",
        today: "오늘", tomorrow: "내일", dayLead: { 0: "오늘", 1: "내일" },
        nothing: "{w}은 일정이 없어요.", events: "일정: {e}.", tasks: "남은 할 일: {t}.", allday: "종일",
        childLock: "아이 보호 잠금이 켜져 있어서 일정만 읽어 드릴 수 있어요.", noItems: "목록에 무엇을 추가할지 알아듣지 못했어요.",
        noTask: "어떤 할 일을 만들지 알아듣지 못했어요.", error: "죄송해요, 잘 안 됐어요: {m}",
        listName: "장보기 목록", listNamed: "{n} 목록", and: "그리고",
        days: ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"],
    },
    tr: {
        tr: true,
        help: "Alışveriş listesine ürün ekleyebilir, listeyi sesli okuyabilir, görev oluşturabilir ve bugün neler olduğunu söyleyebilirim. Örneğin şunu söyle: alışveriş listesine süt ve yumurta ekle.",
        added: "{l}ne eklendi: {i}.", already: "{i} zaten {l}nde var.", addedSome: "{l}ne eklendi: {i}. Zaten vardı: {d}.",
        listEmpty: "{l} boş.", listHas: "{l}nde: {i}.", more: "ve {n} tane daha",
        task: "Görev oluşturuldu: {t}{d}.", due: ", son tarih {d}",
        today: "bugün", tomorrow: "yarın", dayLead: { 0: "Bugün", 1: "Yarın" },
        nothing: "{w} için planlanmış bir şey yok.", events: "Randevular: {e}.", tasks: "Açık görevler: {t}.", allday: "tüm gün",
        childLock: "Çocuk kilidi açıkken yalnızca programı sesli okuyabilirim.", noItems: "Listeye neyin ekleneceğini anlayamadım.",
        noTask: "Hangi görevin oluşturulacağını anlayamadım.", error: "Maalesef olmadı: {m}",
        listName: "alışveriş listesi", listNamed: "{n} listesi", and: "ve",
        days: ["pazar", "pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi"],
    },
    pl: {
        help: "Mogę dodawać produkty do listy zakupów, odczytywać listę, tworzyć zadania i mówić, co jest dziś w planie. Powiedz na przykład: dodaj mleko i jajka do listy zakupów.",
        added: "Dodano do {l}: {i}.", already: "Na {P} już jest: {i}.", addedSome: "Dodano do {l}: {i}. Już było: {d}.",
        listEmpty: "{N} jest pusta.", listHas: "Na {P}: {i}.", more: "i jeszcze {n}",
        task: "Dodano zadanie: {t}{d}.", due: ", termin: {d}",
        today: "dzisiaj", tomorrow: "jutro", dayLead: { 0: "Na dziś", 1: "Na jutro" },
        nothing: "{w} nic nie zaplanowano.", events: "Spotkania: {e}.", tasks: "Otwarte zadania: {t}.", allday: "cały dzień",
        childLock: "Przy włączonej blokadzie dziecięcej mogę tylko odczytać, co jest w planie.", noItems: "Nie udało mi się zrozumieć, co dodać do listy.",
        noTask: "Nie udało mi się zrozumieć, jakie zadanie utworzyć.", error: "Niestety to się nie udało: {m}",
        listName: "listy zakupów", listNamed: "listy {n}", and: "i",
        listNameN: "lista zakupów", listNamedN: "lista {n}", listNameP: "liście zakupów", listNamedP: "liście {n}",
        days: ["w niedzielę", "w poniedziałek", "we wtorek", "w środę", "w czwartek", "w piątek", "w sobotę"],
    },
    uk: {
        help: "Я можу додавати товари до списку покупок, зачитувати список, створювати завдання й розповідати, що заплановано на сьогодні. Скажіть, наприклад: додай молоко і яйця до списку покупок.",
        added: "До {l} додано: {i}.", already: "У {l} уже є: {i}.", addedSome: "До {l} додано: {i}. Уже було: {d}.",
        listEmpty: "{N} порожній.", listHas: "У {P}: {i}.", more: "і ще {n}",
        task: "Завдання створено: {t}{d}.", due: ", термін: {d}",
        today: "сьогодні", tomorrow: "завтра", dayLead: { 0: "Сьогодні", 1: "Завтра" },
        nothing: "{w} нічого не заплановано.", events: "Події: {e}.", tasks: "Відкриті завдання: {t}.", allday: "увесь день",
        childLock: "У дитячому режимі я можу лише зачитувати, що заплановано.", noItems: "Не вдалося зрозуміти, що додати до списку.",
        noTask: "Не вдалося зрозуміти, яке завдання створити.", error: "На жаль, не вийшло: {m}",
        listName: "списку покупок", listNamed: "списку {n}", and: "і",
        listNameN: "список покупок", listNamedN: "список {n}", listNameP: "списку покупок", listNamedP: "списку {n}",
        days: ["у неділю", "у понеділок", "у вівторок", "у середу", "у четвер", "у п’ятницю", "у суботу"],
    },
};
function fill(s, v) { return String(s).replace(/\{(\w)\}/g, (m, k) => (v[k] != null ? v[k] : "")); }
function joinList(arr, L) {
    if (arr.length <= 1) return arr.join("");
    const sep = L.sep != null ? L.sep : ", ";
    const last = L.lastSep != null ? L.lastSep : " " + L.and + " ";
    return arr.slice(0, -1).join(sep) + last + arr[arr.length - 1];
}
function capL(s, L) { return L.lc ? s : cap(s, L.tr); }

// ---------------------------------------------------------------------------------------------
// Date (Europe/Berlin, like the other reminders)
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
// Understanding the sentence
// ---------------------------------------------------------------------------------------------
// NOTE (goja): the server's regex engine has no \b for non-ASCII letters and no look-behind. Patterns for Cyrillic and
// CJK therefore use ^, $ and \s instead of \b, and the CJK item lists are split by hand (splitJa / splitKo).
const NUM = {
    eins: 1, ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, "fünf": 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, "zwölf": 12,
    one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
    un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12,
    uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12,
    "один": 1, "одна": 1, "одно": 1, "одну": 1, "два": 2, "две": 2, "три": 3, "четыре": 4, "пять": 5, "шесть": 6, "семь": 7, "восемь": 8, "девять": 9, "десять": 10, "двенадцать": 12,
    // Dutch
    een: 1, "één": 1, twee: 2, drie: 3, vijf: 5, zes: 6, zeven: 7, negen: 9, tien: 10, twaalf: 12,
    // Italian
    due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, dodici: 12,
    // Portuguese
    um: 1, uma: 1, dois: 2, duas: 2, "três": 3, sete: 7, oito: 8, dez: 10, doze: 12,
    // Turkish (the dotted capital \u0130 of \"\u0130ki\" is handled in numOf)
    bir: 1, iki: 2, "üç": 3, "dört": 4, "beş": 5, "altı": 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, oniki: 12,
    // Polish
    jeden: 1, jedna: 1, jedno: 1, dwa: 2, dwie: 2, trzy: 3, cztery: 4, "pięć": 5, "sześć": 6, siedem: 7, osiem: 8, "dziewięć": 9, "dziesięć": 10, "dwanaście": 12,
    // Ukrainian (one / two / three ... as in Russian are already there)
    "дві": 2, "чотири": 4, "п'ять": 5, "шість": 6, "сім": 7, "вісім": 8, "дев'ять": 9, "десять": 10, "дванадцять": 12,
};
function numOf(tok) {
    const t = String(tok);
    if (Object.prototype.hasOwnProperty.call(NUM, t)) return NUM[t];
    const l = t.toLowerCase().replace(/i\u0307/g, "i");
    return Object.prototype.hasOwnProperty.call(NUM, l) ? NUM[l] : 1;
}
const UNITS = "kg|g|gramm|kilo|l|liter|litres?|litros?|ml|packungen|packung|päckchen|pck|dosen|dose|flaschen|flasche|gläser|glas|tüten|tüte|beutel|becher|stück|bund|kisten|kiste|rollen|rolle|tuben|tube|tafeln|tafel|netze|netz|packs?|packets?|cans?|tins?|bottles?|jars?|bags?|boxes|box|loaves|loaf|pieces?|cartons?|paquets?|bouteilles?|boîtes?|pots?|sachets?|canettes?|paquetes?|botellas?|latas?|botes?|bolsas?|cajas?|tarros?|кг|килограмм(?:а|ов)?|кило|г|грамм(?:а|ов)?|л|литр(?:а|ов)?|мл|миллилитр(?:а|ов)?|упаковк[аиу]|упаковок|пачк[аиу]|пачек|банк[аиу]|банок|бутылк[аиу]|бутылок|пакет(?:а|ов)?|штук[аи]?|коробк[аиу]|коробок|буханк[аиу]|буханок"
    // Dutch, Italian, Portuguese
    + "|pakken|pak|pakjes|pakje|blikken|blik|flessen|fles|potten|pot|zakken|zak|dozen|doos|bossen|bosje|bosjes|stuks|stuk|bakken|bak|kratten|krat|gram|"
    + "litri|litro|chilo|chili|etti|etto|confezioni|confezione|scatole|scatola|lattine|lattina|bottiglie|bottiglia|barattoli|barattolo|sacchetti|sacchetto|pacchetti|pacchetto|pacchi|pacco|pezzi|pezzo|vasetti|vasetto|cartoni|cartone|rotoli|rotolo|"
    + "pacotes|pacote|caixas|caixa|garrafas|garrafa|potes|pote|sacos|saco|sacolas|sacola|unidades|unidade|quilos|quilo|gramas|grama|dúzias|dúzia|maços|maço|rolos|tubos|"
    // Turkish, Polish, Ukrainian
    + "paketler|paket|kutular|kutu|şişeler|şişe|kavanozlar|kavanoz|poşetler|poşet|torbalar|torba|adet|tane|demetler|demet|kasalar|kasa|koliler|koli|kilogram|litre|"
    + "opakowania|opakowanie|opakowań|butelki|butelka|butelek|puszki|puszka|puszek|słoiki|słoik|słoików|paczki|paczka|paczek|torebki|torebka|torebek|kostki|kostka|kostek|sztuki|sztuka|sztuk|szt|bochenki|bochenek|bochenków|pęczki|pęczek|pęczków|kilogramy|kilogram|litry|litr|litrów|kartony|karton|kartonów|rolki|rolka|rolek|skrzynki|skrzynka|skrzynek|worki|worek|worków|tabliczki|tabliczka|tabliczek|"
    + "пакети|пакет|пакетів|пачки|пачка|пачок|пляшки|пляшка|пляшок|банки|банка|банок|упаковки|упаковка|упаковок|кілограми|кілограм|кілограмів|кг|грами|грам|грамів|літри|літр|літрів|мл|штуки|штука|штук|шт|ящики|ящик|ящиків|коробки|коробка|коробок|рулони|рулон|рулонів|буханки|буханка|буханок|пучки|пучок|пучків|десяток|дюжина";
const ARTICLES = /^(?:noch\s+|bitte\s+|etwas\s+|neue[nsrm]?\s+|frische[nsrm]?\s+|ein(?:e[nsm]?)?\s+|die\s+|der\s+|das\s+|den\s+|some\s+|more\s+|the\s+|an?\s+|du\s+|de\s+la\s+|de\s+l'|des\s+|de\s+|d'|la\s+|le\s+|les\s+|l'|un\s+|une\s+|el\s+|los\s+|las\s+|unos\s+|unas\s+|algo\s+de\s+|más\s+|ещё\s+|еще\s+|пожалуйста\s+|немного\s+|het\s+|een\s+|wat\s+|nog\s+|meer\s+|verse\s+|il\s+|lo\s+|gli\s+|i\s+|dei\s+|degli\s+|delle\s+|del\s+|dello\s+|della\s+|dell'\s*|un'\s*|uno\s+|una\s+|po'\s+di\s+|ancora\s+|altro\s+|altra\s+|os\s+|as\s+|o\s+|uns\s+|umas\s+|uma\s+|um\s+pouco\s+de\s+|um\s+|pouco\s+de\s+)+/i;

function cleanSentence(text) {
    return String(text || "")
        .replace(/[\u0000-\u001f]/g, " ")
        .replace(/[\u2018\u2019\u02bc`\u00b4]/g, "'")   // typographic apostrophes from dictation -> '
        .replace(/\u3000/g, " ")                        // ideographic space
        .replace(/\s+/g, " ").trim()
        .replace(/^(?:he[yj]\s+siri,?\s*|(?:ok(?:ay|ej)?|tamam)\s+google,?\s*|привет,?\s+siri,?\s*|привіт,?\s+siri,?\s*|окей,?\s+google,?\s*|окей,?\s+гугл,?\s*)?(?:pinn[.,:]?\s*)?/i, "")
        .replace(/[.!?¡¿。！？…、，]+$/g, "")
        .trim();
}
// tr = Turkish: dotted i -> İ (toUpperCase would give a plain I)
function cap(s, tr) {
    if (!s) return s;
    const c = s.charAt(0);
    return (tr && c === "i" ? "\u0130" : c.toUpperCase()) + s.slice(1);
}

// Russian: after a quantity the name stands in the genitive ("2 литра молока") – for common goods it is turned back into the
// basic form, so the list shows "Молоко" and duplicates are recognised. Unknown words stay as spoken.
const RU_NOM = {
    "молока": "молоко", "масла": "масло", "хлеба": "хлеб", "сахара": "сахар", "соли": "соль", "картофеля": "картофель", "яиц": "яйца",
    "макарон": "макароны", "сыра": "сыр", "мяса": "мясо", "муки": "мука", "воды": "вода", "сока": "сок", "риса": "рис", "помидоров": "помидоры",
    "огурцов": "огурцы", "яблок": "яблоки", "бананов": "бананы", "печенья": "печенье", "чая": "чай", "колбасы": "колбаса", "пива": "пиво",
    "вина": "вино", "йогурта": "йогурт", "творога": "творог", "сметаны": "сметана", "кефира": "кефир", "лука": "лук", "моркови": "морковь",
    "шоколада": "шоколад", "конфет": "конфеты", "апельсинов": "апельсины", "крупы": "крупа", "гречки": "гречка", "курицы": "курица",
    "рыбы": "рыба", "сосисок": "сосиски", "салфеток": "салфетки", "туалетной бумаги": "туалетная бумага", "кофе": "кофе",
};

// Polish and Ukrainian: after a quantity the name stands in the genitive (\"dwie butelki mleka\", \"два літри молока\") - common
// goods are turned back into the basic form, unknown words stay as spoken. Turkish: accusative (\"sütü\", \"yumurtayı\").
const PL_NOM = {
    "mleka": "mleko", "jajek": "jajka", "chleba": "chleb", "masła": "masło", "cukru": "cukier", "soli": "sól", "makaronu": "makaron", "sera": "ser",
    "wody": "woda", "soku": "sok", "ryżu": "ryż", "mąki": "mąka", "kawy": "kawa", "herbaty": "herbata", "piwa": "piwo", "wina": "wino",
    "jogurtu": "jogurt", "śmietany": "śmietana", "jabłek": "jabłka", "bananów": "banany", "pomidorów": "pomidory", "ogórków": "ogórki",
    "ziemniaków": "ziemniaki", "cebuli": "cebula", "marchewki": "marchewka", "czekolady": "czekolada", "mięsa": "mięso", "kurczaka": "kurczak",
    "ryby": "ryba", "parówek": "parówki", "chusteczek": "chusteczki", "papieru toaletowego": "papier toaletowy", "płynu do naczyń": "płyn do naczyń",
    "proszku do prania": "proszek do prania", "bułek": "bułki", "serków": "serki", "pieczywa": "pieczywo", "oleju": "olej", "szynki": "szynka",
};
const UK_NOM = {
    "молока": "молоко", "яєць": "яйця", "хліба": "хліб", "масла": "масло", "цукру": "цукор", "солі": "сіль", "макаронів": "макарони", "сиру": "сир",
    "води": "вода", "соку": "сік", "рису": "рис", "борошна": "борошно", "кави": "кава", "чаю": "чай", "пива": "пиво", "вина": "вино",
    "йогурту": "йогурт", "сметани": "сметана", "яблук": "яблука", "бананів": "банани", "помідорів": "помідори", "огірків": "огірки",
    "картоплі": "картопля", "цибулі": "цибуля", "моркви": "морква", "шоколаду": "шоколад", "м’яса": "м’ясо", "курки": "курка", "риби": "риба",
    "сосисок": "сосиски", "серветок": "серветки", "туалетного паперу": "туалетний папір", "олії": "олія", "шинки": "шинка", "печива": "печиво",
};
const TR_NOM = {
    "sütü": "süt", "yumurtayı": "yumurta", "ekmeği": "ekmek", "peyniri": "peynir", "tereyağını": "tereyağı", "makarnayı": "makarna", "suyu": "su",
    "şekeri": "şeker", "tuzu": "tuz", "unu": "un", "pirinci": "pirinç", "domatesi": "domates", "salatalığı": "salatalık", "elmayı": "elma",
    "muzu": "muz", "portakalı": "portakal", "çayı": "çay", "kahveyi": "kahve", "yoğurdu": "yoğurt", "soğanı": "soğan", "havucu": "havuç",
    "patatesi": "patates", "tavuğu": "tavuk", "balığı": "balık", "yağı": "yağ", "bisküviyi": "bisküvi", "çikolatayı": "çikolata", "birayı": "bira",
};
function nomOf(name, lang) {
    const k = String(name || "").toLowerCase().replace(/i\u0307/g, "i");
    const map = lang === "pl" ? PL_NOM : (lang === "uk" ? UK_NOM : (lang === "tr" ? TR_NOM : RU_NOM));
    return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : name;
}

// ---- CJK quantities (Chinese, Japanese, Korean) ----
const CJK_NUMS = { "一": 1, "二": 2, "两": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12, "半": 0.5,
    "한": 1, "하나": 1, "두": 2, "둘": 2, "세": 3, "셋": 3, "네": 4, "넷": 4, "다섯": 5, "여섯": 6, "일곱": 7, "여덟": 8, "아홉": 9, "열": 10, "열한": 11, "열두": 12 };
const ZH_NUM_RE = "\\d+(?:[.,]\\d+)?|十二|十一|[一二两兩三四五六七八九十半]";
const JA_NUM_RE = "\\d+(?:[.,]\\d+)?|十二|十一|[一二三四五六七八九十]";
const KO_NUM_RE = "\\d+(?:[.,]\\d+)?|열두|열한|하나|다섯|여섯|일곱|여덟|아홉|열|한|두|둘|세|셋|네|넷";
const ZH_UNIT_RE = "公斤|千克|公升|毫升|克|斤|升|包|袋|瓶|罐|盒|箱|个|個|只|条|條|块|塊|根|把|片|桶|卷|管|打|份|听|颗|顆|串|束|盘|盤|杯|套";
const JA_UNIT_RE = "キログラム|キロ|ミリリットル|リットル|グラム|kg|ml|g|l|L|袋|本|個|コ|パック|缶|箱|瓶|枚|束|丁|玉|切れ|ケース|斤|房|杯|セット|つ|匹|尾|台|足";
const KO_UNIT_RE = "킬로그램|킬로|밀리리터|리터|그램|봉지|봉|팩|캔|병|개|박스|상자|통|묶음|단|판|포기|장|마리|근|줄|조각|세트|송이|자루|갑|모|kg|ml|g|l|L";
const CJK_UNIT_KIND = {
    "公斤": "kg", "千克": "kg", "キログラム": "kg", "キロ": "kg", "kg": "kg", "킬로그램": "kg", "킬로": "kg",
    "克": "g", "グラム": "g", "g": "g", "그램": "g",
    "公升": "l", "升": "l", "リットル": "l", "l": "l", "L": "l", "리터": "l",
    "毫升": "ml", "ミリリットル": "ml", "ml": "ml", "밀리리터": "ml",
    // counting words: only the number is kept ("6 eggs"), the word itself adds nothing
    "个": "cnt", "個": "cnt", "只": "cnt", "条": "cnt", "條": "cnt", "块": "cnt", "塊": "cnt", "根": "cnt", "片": "cnt", "颗": "cnt", "顆": "cnt",
    "コ": "cnt", "本": "cnt", "枚": "cnt", "つ": "cnt", "匹": "cnt", "尾": "cnt", "玉": "cnt",
    "개": "cnt", "마리": "cnt", "장": "cnt", "조각": "cnt", "송이": "cnt", "포기": "cnt", "모": "cnt",
};
function cjkNumber(tok) {
    if (/^\d/.test(tok)) return Number(String(tok).replace(",", "."));
    return Object.prototype.hasOwnProperty.call(CJK_NUMS, tok) ? CJK_NUMS[tok] : 1;
}
function fmtNum(n) { return String(n).replace(".", ","); }
function cjkQty(numTok, unit) {
    const n = cjkNumber(numTok);
    const kind = CJK_UNIT_KIND[unit] || "pack";
    if (kind === "cnt") return n > 1 ? fmtNum(n) : "";
    if (kind === "pack") return fmtNum(n) + unit;
    return fmtNum(n) + " " + kind;
}
// Korean particles: only strip a particle when it fits the preceding syllable ("오이" keeps its 이, "달걀이" loses it)
function hasBatchim(ch) { const c = ch.charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; }
function stripKoParticle(name) {
    const n = String(name || "").trim();
    if (n.length < 2) return n;
    const last = n.charAt(n.length - 1), prev = n.charAt(n.length - 2);
    const b = hasBatchim(prev);
    if ((last === "을" && b) || (last === "를" && !b) || (last === "이" && b) || (last === "가" && !b) || (last === "은" && b) || (last === "는" && !b)) return n.slice(0, -1);
    return n;
}
// Japanese: split at と / や / 、 – but not at the start of a word (とうふ) and not after the polite prefixes お / ご (おとうふ, おやつ)
function splitJa(raw) {
    const s = String(raw || "").replace(/(?:それから|あとは|あと|および|ならびに)/g, "、");
    const parts = [];
    let cur = "";
    for (let i = 0; i < s.length; i++) {
        const ch = s.charAt(i);
        if (ch === "、" || ch === "，" || ch === "," || ch === ";" || ch === "；") { parts.push(cur); cur = ""; continue; }
        if ((ch === "と" || ch === "や") && cur.length > 0 && i + 1 < s.length) {
            const prev = cur.charAt(cur.length - 1);
            if (prev !== "お" && prev !== "ご") { parts.push(cur); cur = ""; continue; }
        }
        cur += ch;
    }
    parts.push(cur);
    return parts;
}
// Korean: "우유랑 달걀", "우유, 달걀", "우유하고 달걀", "우유 그리고 달걀"
function splitKo(raw) {
    const toks = String(raw || "").replace(/[,，、;；]/g, " , ").split(/\s+/).filter(Boolean);
    const parts = [];
    let cur = [];
    toks.forEach(t => {
        if (t === "," || t === "그리고" || t === "및" || t === "랑" || t === "이랑" || t === "하고") { if (cur.length) parts.push(cur.join(" ")); cur = []; return; }
        const m = t.match(/^(.+?)(?:이랑|랑|하고)$/);
        if (m) { cur.push(m[1]); parts.push(cur.join(" ")); cur = []; return; }
        cur.push(t);
    });
    if (cur.length) parts.push(cur.join(" "));
    return parts;
}
const ZH_HEAD = new RegExp("^(" + ZH_NUM_RE + ")\\s*(" + ZH_UNIT_RE + ")(?:的)?(.+)$");
const ZH_TAIL = new RegExp("^(.+?)(" + ZH_NUM_RE + ")(" + ZH_UNIT_RE + ")$");
const JA_HEAD = new RegExp("^(" + JA_NUM_RE + ")\\s*(" + JA_UNIT_RE + ")(?:の)?(.+)$");
const JA_TAIL = new RegExp("^(.+?)(?:を|は|が|×|x)?\\s*(" + JA_NUM_RE + ")\\s*(" + JA_UNIT_RE + ")$");
const KO_HEAD = new RegExp("^(" + KO_NUM_RE + ")\\s*(" + KO_UNIT_RE + ")\\s*(?:의|짜리)?\\s*(.+)$");
const KO_TAIL = new RegExp("^(.+?)\\s*(" + KO_NUM_RE + ")\\s*(" + KO_UNIT_RE + ")$");

function parseItemsCjk(raw, lang) {
    let parts;
    if (lang === "ja") parts = splitJa(raw);
    else if (lang === "ko") parts = splitKo(raw);
    else parts = String(raw || "").split(/(?:还有|還有|以及|加上|再加|和|跟|与|與|及|、|，|,|;|；)/);
    const head = lang === "ja" ? JA_HEAD : (lang === "ko" ? KO_HEAD : ZH_HEAD);
    const tail = lang === "ja" ? JA_TAIL : (lang === "ko" ? KO_TAIL : ZH_TAIL);
    const out = [];
    parts.forEach(part => {
        let p = String(part || "").trim().replace(/^(?:もう|また|あと|그리고|还要|還要|再|也)\s*/, "");
        let qty = "", name = p;
        const h = p.match(head);
        const t = h ? null : p.match(tail);
        if (h) { qty = cjkQty(h[1], h[2]); name = h[3]; }
        else if (t) { qty = cjkQty(t[2], t[3]); name = t[1]; }
        name = name.trim();
        if (lang === "ja") name = name.replace(/(?:を|も|が|は)$/, "").trim();
        else if (lang === "ko") name = stripKoParticle(name.replace(/\s*(?:좀|조금)$/, ""));
        else name = name.replace(/^(?:一些|一点|一點|些|点|點)/, "").replace(/(?:吧|啊|呀|等)$/, "").trim();
        if (name && name.length <= 80) out.push({ name: name, qty: qty });
    });
    return out;
}

// lang: set by the sentence pattern that matched ("nl", "ja" …); without it only the shared separators are used
function parseItems(raw, lang) {
    if (lang === "ja" || lang === "zh" || lang === "ko") return parseItemsCjk(raw, lang);
    // Dutch "en" is only a separator in Dutch sentences (in French/Spanish it is a preposition: "tomates en boîte")
    // \"en\" (nl), \"i\" / \"oraz\" (pl), \"ve\" / \"ile\" (tr), \"і\" / \"й\" / \"та\" (uk) only separate in sentences of that language
    const extraSep = lang === "nl" ? "|\\ben\\b" : (lang === "pl" ? "|\\s+i\\s+|\\s+oraz\\s+|\\s+a\\s+także\\s+" : (lang === "tr" ? "|\\s+ve\\s+|\\s+ile\\s+|\\s+ayrıca\\s+" : (lang === "uk" ? "|\\s+і\\s+|\\s+й\\s+|\\s+та\\s+|\\s+а\\s+також\\s+" : "")));
    const splitRe = new RegExp("\\s*(?:,|;|\\bund\\b|\\bsowie\\b|\\band\\b|\\bet\\b|\\by\\b|\\be\\b|\\bplus\\b|\\s+и\\s+|\\s+а\\s+также\\s+|\\s+плюс\\s+" + extraSep + ")\\s*", "i");
    const parts = String(raw || "").split(splitRe).map(x => x.trim()).filter(Boolean);
    const out = [];
    parts.forEach(part => {
        let p = part.replace(/^(?:noch|bitte|also|auch|then|nog|ook|anche|também)\s+/i, "");
        if (lang === "pl") p = p.replace(/^(?:jeszcze|też|także|proszę|trochę|więcej)\s+/i, "");
        else if (lang === "tr") p = p.replace(/^(?:(?:bize|bana)\s+)?(?:biraz\s+|birkaç\s+|daha\s+|yine\s+|lütfen\s+)?/i, "");
        else if (lang === "uk") p = p.replace(/^(?:ще|також|будь\s+ласка|трохи|більше)\s+/i, "");
        let qty = "";
        const m = p.match(new RegExp("^(\\d+(?:[.,]\\d+)?|\\u0130ki|" + Object.keys(NUM).join("|") + ")\\s+(?:(" + UNITS + ")\\s+)?(?:(?:(?:of|de|di|do|da|van)\\s+)|d')?(.+)$", "i"));
        if (m) {
            const n = /^\d/.test(m[1]) ? m[1].replace(".", ",") : String(numOf(m[1]));
            const u = (m[2] || "").toLowerCase();
            if (/^(gramm?|grama|gramas)$/.test(u)) qty = n + " g";
            else if (/^(kilo|quilos?|chilo|chili)$/.test(u)) qty = n + " kg";
            else if (/^(liter|litres?|litros?|litri|litro)$/.test(u)) qty = n + " l";
            else if (/^(kg|g|l|ml)$/.test(u)) qty = n + " " + u;
            else if (/^(etto|etti)$/.test(u)) qty = fmtNum(Number(n.replace(",", ".")) * 100) + " g";
            else if (/^(?:кг|килограмм(?:а|ов)?|кило)$/.test(u)) qty = n + " кг";
            else if (/^(?:г|грамм(?:а|ов)?)$/.test(u)) qty = n + " г";
            else if (/^(?:л|литр(?:а|ов)?)$/.test(u)) qty = n + " л";
            else if (/^(?:мл|миллилитр(?:а|ов)?)$/.test(u)) qty = n + " мл";
            else if (/^(?:кілограм(?:и|ів)?)$/.test(u)) qty = n + " кг";
            else if (/^(?:грам(?:и|ів)?)$/.test(u)) qty = n + " г";
            else if (/^(?:літр(?:и|ів)?)$/.test(u)) qty = n + " л";
            else if (/^(?:kilogram|kilogramy)$/.test(u)) qty = n + " kg";
            else if (/^(?:litr|litry|litrów)$/.test(u)) qty = n + " l";
            else if (/^(?:adet|tane|szt|sztuk|sztuka|sztuki|шт|штук|штука|штуки)$/.test(u)) qty = n;
            else if (u) qty = n + " " + (/^(dosen?|packung(en)?|päckchen|flaschen?|gläser|glas|tüten?|beutel|becher|stück|bund|kisten?|rollen?|tuben?|tafeln?|netze?)$/.test(u) ? cap(u) : u);
            else if (Number(n.replace(",", ".")) > 1) qty = n;
            p = nomOf(m[3], lang);
        } else if (lang === "tr") {
            p = nomOf(p, lang);
        }
        p = p.replace(ARTICLES, "").trim();
        if (lang === "tr" || lang === "pl" || lang === "uk") p = nomOf(p, lang);
        if (p && p.length <= 80) out.push({ name: cap(p, lang === "tr"), qty: qty });
    });
    return out;
}

// Split a date word off a task sentence -> { iso, rest }
function parseDate(text, lang) {
    let s = " " + text + " ";
    const t = todayIso();
    let iso = "";
    const rules = [
        [/\s(?:übermorgen|overmorgen|day after tomorrow|après-demain|pasado mañana|dopodomani|depois de amanhã|depois de amanha|послезавтра|pojutrze|післязавтра|позавтра|öbür\s+gün|ertesi\s+gün)\s/i, 2],
        [/\s(?:(?:na|do|на)\s+)?(?:morgen|tomorrow|demain|mañana|domani|amanhã|amanha|завтра|jutro|jutra|yar[ıi]n(?:a|ki)?)\s/i, 1],
        [/\s(?:(?:na|на)\s+)?(?:heute|vandaag|today|aujourd'hui|hoy|oggi|hoje|сегодня|dzisiaj|dziś|dzis|сьогодні|bugün(?:e|kü)?)\s/i, 0],
    ];
    for (const [re, n] of rules) { if (re.test(s)) { iso = addDays(t, n); s = s.replace(re, " "); break; } }
    if (!iso) {
        const names = [
            ["sonntag", "sunday", "dimanche", "domingo", "воскресенье", "zondag", "domenica", "niedziela", "niedzielę", "неділя", "неділю", "pazar", "pazara"],
            ["montag", "monday", "lundi", "lunes", "понедельник", "maandag", "lunedì", "lunedi", "segunda-feira", "segunda", "poniedziałek", "понеділок", "pazartesi", "pazartesiye"],
            ["dienstag", "tuesday", "mardi", "martes", "вторник", "dinsdag", "martedì", "martedi", "terça-feira", "terca-feira", "terça", "terca", "wtorek", "вівторок", "salı", "salıya"],
            ["mittwoch", "wednesday", "mercredi", "miércoles", "среду", "среда", "woensdag", "mercoledì", "mercoledi", "quarta-feira", "quarta", "środa", "środę", "середа", "середу", "çarşamba", "çarşambaya"],
            ["donnerstag", "thursday", "jeudi", "jueves", "четверг", "donderdag", "giovedì", "giovedi", "quinta-feira", "quinta", "czwartek", "четвер", "perşembe", "perşembeye"],
            ["freitag", "friday", "vendredi", "viernes", "пятницу", "пятница", "vrijdag", "venerdì", "venerdi", "sexta-feira", "sexta", "piątek", "п'ятниця", "п'ятницю", "cuma", "cumaya"],
            ["samstag", "saturday", "samedi", "sábado", "субботу", "суббота", "zaterdag", "sabato", "sabado", "sobota", "sobotę", "субота", "суботу", "cumartesi", "cumartesiye"],
        ];
        for (let wd = 0; wd < 7 && !iso; wd++) {
            for (const nm of names[wd]) {
                const re = new RegExp("\\s(?:am\\s+|on\\s+|le\\s+|el\\s+|this\\s+|next\\s+|nächsten\\s+|kommenden\\s+|в\\s+|во\\s+|на\\s+|op\\s+|aanstaande\\s+|komende\\s+|volgende\\s+|di\\s+|il\\s+|prossimo\\s+|prossima\\s+|na\\s+|no\\s+|em\\s+|nesta\\s+|neste\\s+|próxima\\s+|próximo\\s+|w\\s+|we\\s+|do\\s+|у\\s+|następn\\S*\\s+|przyszł\\S*\\s+|najbliższ\\S*\\s+|наступн\\S*\\s+|цього\\s+|gelecek\\s+|önümüzdeki\\s+)?" + nm + "\\s", "i");
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
        .replace(/^(?:daran,?\s*|an\s+(?:den|die|das)?\s*|dass\s+(?:ich|wir)\s+|to\s+|that\s+|de\s+|d'|que\s+|про\s+|о\s+|об\s+|что\s+|чтобы\s+|aan\s+(?:het\s+|de\s+|een\s+)?|eraan\s+(?:dat\s+)?(?:ik\s+|we\s+)?|om\s+|di\s+(?:che\s+)?|che\s+|para\s+)/i, "")
        .replace(/\s+(?:zu\s+)?(?:erledigen|machen)$/i, "")
        .trim();
    // Turkish / Polish / Ukrainian: little words that stay behind after the date word was cut out
    if (lang === "tr") rest = rest.replace(/^(?:(?:günü|gün|için)\s+)/i, "");
    else if (lang === "pl") rest = rest.replace(/^(?:(?:że|żeby|aby|by)\s+)/i, "");
    else if (lang === "uk") rest = rest.replace(/^(?:(?:про|що|щоб|аби)\s+)/i, "");
    return { iso, rest: cap(rest.trim(), lang === "tr") };
}

// Chinese / Japanese / Korean: date words stand inside the sentence without spaces
const CJK_WEEKDAYS = { "日": 0, "天": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "月": 1, "火": 2, "水": 3, "木": 4, "金": 5, "土": 6, "일": 0, "월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6 };
function parseDateCjk(text, lang) {
    let s = " " + String(text || "").trim() + " ";
    const t = todayIso();
    let iso = "";
    const rules = {
        zh: [[/(?:大后天|大後天)/, 3], [/(?:后天|後天)/, 2], [/(?:明天|明日)/, 1], [/(?:今天|今日)/, 0]],
        ja: [[/(?:明後日|あさって)/, 2], [/(?:明日|あした|あす)/, 1], [/(?:今日|きょう)/, 0]],
        ko: [[/\s(?:내일모레|모레)(?:은|도|까지|에)?\s/, 2], [/\s내일(?:은|도|까지|에)?\s/, 1], [/\s오늘(?:은|도|까지|에)?\s/, 0]],
    }[lang] || [];
    for (const [re, n] of rules) { if (re.test(s)) { iso = addDays(t, n); s = s.replace(re, " "); break; } }
    if (!iso) {
        let re = null;
        if (lang === "zh") re = /(?:这|這|本|下个|下個|下)?(?:周|星期|礼拜|禮拜)(日|天|一|二|三|四|五|六)(?:前|之前)?/;
        else if (lang === "ja") re = /(?:今度の|次の|来週の|今週の|来週|今週)?(日|月|火|水|木|金|土)曜日?(?:に|の|まで)?/;
        else if (lang === "ko") re = /\s(?:이번\s*주\s*|다음\s*주\s*|이번\s*|다음\s*|오는\s*)?(일|월|화|수|목|금|토)요일(?:은|에|까지)?\s/;
        const m = re ? s.match(re) : null;
        if (m) {
            let d = (CJK_WEEKDAYS[m[1]] - weekday(t) + 7) % 7;
            if (d === 0) d = 7;
            iso = addDays(t, d);
            s = s.replace(re, " ");
        }
    }
    let rest = s.replace(/\s+/g, " ").trim();
    if (lang === "zh") rest = rest.replace(/^[，,、:：\s]+/, "").replace(/^(?:记得|記得|别忘了|別忘了|要|得|在|的)/, "").trim();
    else if (lang === "ja") rest = rest.replace(/^[、,\s]+/, "").replace(/(?:を|に|の|は|が|まで|も)$/, "").trim();
    else rest = rest.replace(/^[,\s]+/, "").trim();
    return { iso, rest: cap(rest) };
}

// A store / list name that is only a generic word ("장보기" = shopping) is no store name
function cleanStore(s, lang) {
    const v = String(s || "").trim();
    if (!v) return "";
    if (lang === "tr" && /^(?:alışveriş|market|benim|bizim|alışveriş\s+listesi)$/i.test(v)) return "";
    if (lang === "pl" && /^(?:zakupów|zakupowej|moja|moją|nasza|naszą|moja\s+lista|zakupy)$/i.test(v)) return "";
    if (lang === "uk" && /^(?:покупок|покупки|мій|наш|мого|нашого)$/i.test(v)) return "";
    if (lang === "ko" && /^(?:장보기|쇼핑|구매|마트|내|우리|나의|저의|제|장보기용)$/.test(v)) return "";
    if (lang === "zh" && /^(?:我|我们|我的|我们的|购物|超市|采购)$/.test(v)) return "";
    if (lang === "ja" && /^(?:私|私の|我が家|うち|買い物|買物)$/.test(v)) return "";
    return v;
}

// "Read the list" sentences of the newer languages: [pattern, language, store group (0 = none)]
const LIST_MORE = [
    [/(?:wat|welke)\s.*\b(?:staat|staan|zit|zitten)\b.*lijst/, "nl", 0],
    [/lees\s+(?:de\s+|het\s+|mijn\s+|onze\s+)?(?:boodschappen)?lijst(?:je)?\s+(?:even\s+)?voor|lees\s+(?:de\s+|het\s+|mijn\s+|onze\s+)?(?:boodschappen)?lijst(?:je)?\s*$/, "nl", 0],
    [/wat\s+(?:moeten|moet|willen)\s+(?:we|ik)\s+(?:nog\s+)?(?:kopen|halen)|wat\s+hebben\s+we\s+(?:nog\s+)?nodig/, "nl", 0],
    [/(?:cosa|che\s+cosa|che|quali)\s.*(?:c'?è|ci\s+sono|sta|stanno|segnato|scritto).*\blista|leggi\s+(?:la\s+|mia\s+|nostra\s+)?lista|(?:cosa|che\s+cosa)\s+(?:devo|dobbiamo|dovrei|dovremmo)\s+(?:ancora\s+)?comprare|(?:cosa|che\s+cosa)\s+(?:ci\s+)?serve\s*$/, "it", 0],
    [/(?:o\s+que|que|quais)\s.*(?:tem|há|existe|está|tá|estão|consta).*\blista|(?:leia|lê|ler)\s+(?:a\s+|minha\s+|nossa\s+)?lista|(?:o\s+que|que)\s+(?:eu\s+)?(?:preciso|precisamos|temos\s+que|tenho\s+que|devo)\s+comprar/, "pt", 0],
    [/^(?:(.+?)的)?(?:购物清单|购物单|购物列表|采购清单|清单|列表)(?:上|里|中)?(?:都)?有(?:什么|哪些|啥)(?:东西)?$/, "zh", 1],
    [/^(?:请|帮我|麻烦)?(?:读一下|念一下|读出|念出|朗读|读读|念念|读|念|看看|告诉我|说说)(?:一下)?(?:我的|我们的)?(?:(.+?)的)?(?:购物清单|购物单|购物列表|采购清单|清单)$/, "zh", 1],
    [/^(?:我们|我|咱们)?(?:还)?(?:需要|要|得|该)买(?:什么|哪些|啥)(?:东西)?$|^(?:我们|我|咱们)?还需要(?:什么|哪些|啥)$/, "zh", 0],
    [/^(?:(.+?)の)?(?:買い物|買物|ショッピング)?(?:リスト|一覧)(?:には|に|の中には|の中は|は)?(?:何|なに|なん)(?:が|を)?(?:ある|あります|入って|載って|書いて)/, "ja", 1],
    [/^(?:(.+?)の)?(?:買い物|買物|ショッピング)?(?:リスト|一覧)(?:を)?(?:読んで|読み上げて|教えて|聞かせて|見せて|確認|チェック)/, "ja", 1],
    [/^(?:今|他に|あと)?(?:何|なに)(?:を|が)(?:買|必要)/, "ja", 0],
    [/^(?:(.+?)\s+)?(?:장보기|쇼핑|구매)?\s*(?:목록|리스트)(?:에|에는|엔|에서|이|가)?\s*(?:뭐|무엇|뭘|어떤 게)/, "ko", 1],
    [/^(?:(.+?)\s+)?(?:장보기|쇼핑|구매)?\s*(?:목록|리스트)\s*(?:을|를)?\s*(?:읽어|알려|말해|보여|확인)/, "ko", 1],
    [/^(?:우리\s*)?(?:뭐|뭘|무엇을?)\s*(?:를\s*)?(?:더\s*)?(?:사야|살까|사면)/, "ko", 0],
    // Turkish: \"Alışveriş listesinde ne var?\", \"Migros listesinde neler var?\", \"Listeyi oku\", \"Ne almam lazım?\"
    [/^(?:(.+?)\s+)?(?:alışveriş\s+|market\s+)?listesinde\s+(?:ne|neler|neler\s+var|ne\s+var)(?:\s+var|\s+yazıyor|\s+yazılı)?(?:\s+acaba)?$/, "tr", 1],
    [/^(?:(.+?)\s+)?(?:alışveriş\s+|market\s+)?(?:listesini|listeyi|listemizi|listemi)\s+(?:oku|okur\s+musun|okuyabilir\s+misin|sesli\s+oku|söyle|söyler\s+misin|göster)$/, "tr", 1],
    [/^ne(?:ler)?\s+(?:almam|almamız|almalıyım|almalıyız|alacağız|alalım|eksik)(?:\s+(?:lazım|gerek|gerekiyor))?$|^(?:neye|nelere)\s+ihtiyacımız\s+var$|^ne\s+lazım$/, "tr", 0],
    // Polish: \"Co jest na liście zakupów?\", \"Przeczytaj listę zakupów\", \"Co muszę kupić?\"
    [/^co\s+(?:jeszcze\s+)?(?:jest|mamy|mam|znajduje\s+się|się\s+znajduje|figuruje|zapisano|wpisano)\s+(?:jeszcze\s+)?(?:na|w)\s+(?:mojej\s+|naszej\s+)?(?:liście|listy)(?:\s+zakupów|\s+zakupowej)?(?:\s+(?:w|z|dla)?\s*(.+))?$/, "pl", 1],
    [/^(?:przeczytaj|odczytaj|powiedz|pokaż)\s+(?:mi\s+)?(?:moją\s+|naszą\s+)?list[ęa](?:\s+zakupów|\s+zakupową)?(?:\s+(?:w|z|dla)?\s*(.+))?$/, "pl", 1],
    [/^co\s+(?:muszę|musimy|mam|mamy|trzeba|powinienem|powinniśmy|jeszcze\s+muszę|jeszcze\s+musimy)\s+(?:jeszcze\s+)?kupić$|^(?:co|czego)\s+(?:jeszcze\s+)?(?:potrzebuję|potrzebujemy|brakuje)$/, "pl", 0],
    // Ukrainian: \"Що в списку покупок?\", \"Зачитай список\", \"Що треба купити?\"
    [/^(?:що\s+(?:зараз\s+|ще\s+)?(?:є\s+)?(?:у\s+нас\s+|у\s+мене\s+)?(?:в|у|на)\s+(?:моєму\s+|нашому\s+)?списку|(?:прочитай|зачитай|озвучи|назви|покажи|скажи)\s+(?:мені\s+)?(?:мій\s+|наш\s+)?список|що\s+(?:мені\s+|нам\s+)?(?:ще\s+)?(?:потрібно|треба|слід)\s+купити)(?:\s+покупок)?(?:\s+(?:для|з|в|у)?\s*(.+))?$/, "uk", 1],
];
// "Add to the list" sentences of the newer languages: [pattern, language, item group, store group (0 = none)]
const ADD_MORE = [
    // Dutch
    [/^(?:zet|doe|plaats|schrijf|voeg)\s+(.+?)\s+(?:toe\s+aan|op|aan|bij)\s+(?:de|het|mijn|ons|onze)\s+(?:boodschappen|winkel)?(?:lijstje|lijst|lijstjes)(?:\s+(?:van|bij|voor)\s+(.+?))?(?:\s+(?:toe|erbij|erop))?$/i, "nl", 1, 2],
    [/^(?:we\s+hebben|ik\s+heb|wij\s+hebben)\s+(.+?)\s+nodig(?:\s+(?:bij|van)\s+(.+))?$/i, "nl", 1, 2],
    [/^(?:koop|kopen)[:\s]+(.+?)(?:\s+(?:bij|van)\s+(.+))?$/i, "nl", 1, 2],
    // Italian
    [/^(?:per\s+favore\s+|ti\s+prego\s+)?(?:aggiungi|aggiungere|metti|mettere|scrivi|segna|inserisci)\s+(.+?)\s+(?:alla|sulla|nella|in|su|a)\s+(?:mia\s+|nostra\s+)?lista(?:\s+della\s+spesa|\s+spesa)?(?:\s+(?:di|da|presso|per)\s+(.+))?$/i, "it", 1, 2],
    [/^(?:ci\s+serve|ci\s+servono|mi\s+serve|mi\s+servono|ho\s+bisogno\s+di|abbiamo\s+bisogno\s+di|dobbiamo\s+comprare|devo\s+comprare|compra|comprare)\s+(.+?)(?:\s+(?:da|presso)\s+(.+))?$/i, "it", 1, 2],
    // Portuguese
    [/^(?:por\s+favor\s+)?(?:adicione|adiciona|adicionar|coloque|coloca|ponha|põe|anote|anota|escreva|inclua|inclui)\s+(.+?)\s+(?:à|a|na|no|em)\s+(?:minha\s+|nossa\s+)?lista(?:\s+de\s+compras|\s+do\s+mercado|\s+de\s+mercado)?(?:\s+(?:do|da|no|na|de|para)\s+(.+))?$/i, "pt", 1, 2],
    [/^(?:precisamos\s+de|preciso\s+de|temos\s+que\s+comprar|tenho\s+que\s+comprar|compre|compra|comprar)\s+(.+?)(?:\s+(?:no|na|do|da)\s+(.+))?$/i, "pt", 1, 2],
    // Chinese
    [/^(?:请|请帮我|帮我|麻烦)?把(.+?)(?:加到|加入到|加入|添加到|添加进|放到|放进|写到|记到|写进|加进)(?:我的|我们的)?(?:(.+?)的)?(?:购物|超市|采购)?(?:清单|列表|单子|单)(?:里|上|中)?$/, "zh", 1, 2],
    [/^(?:请|帮我|麻烦)?(?:往|在|给)?(?:我的|我们的)?(?:(.+?)的)?(?:购物|超市|采购)?(?:清单|列表)(?:里|上|中)?(?:再)?(?:加上|加入|添加|加|放|写上|写|记)(.+)$/, "zh", 2, 1],
    [/^(?:我们|我|咱们)?(?:还)?(?:需要买|需要|要买|得买|想买|该买)(.+)$/, "zh", 1, 0],
    [/^(?:请|帮我)?买(.+)$/, "zh", 1, 0],
    // Japanese
    [/^(?:(.+?)の)?(?:買い物|買物|ショッピング)?(?:リスト|一覧)(?:に|へ)(.+?)(?:を|も)?(?:追加|足し|足す|加え|入れ|書い|書き|載せ|のせ|メモ|登録).*$/, "ja", 2, 1],
    [/^(.+?)(?:を|も)?(?:(.+?)の)?(?:買い物|買物|ショッピング)?(?:リスト|一覧)(?:に|へ)(?:追加|足し|足す|加え|入れ|書い|書き|載せ|のせ|メモ|登録).*$/, "ja", 1, 2],
    [/^(.+?)(?:が|を)?(?:必要です|必要だ|必要|いります|いる|ほしい|欲しい)$/, "ja", 1, 0],
    [/^(.+?)(?:を)?(?:買わなきゃ|買わないと|買わなくちゃ|買わなければ|買う必要が(?:ある|あります)|買いたい|買って(?:おいて|ください|くれ)?|買う).*$/, "ja", 1, 0],
    // Korean
    [/^(?:(.+?)\s+)?(?:장보기|쇼핑|구매|마트)?\s*(?:목록|리스트)(?:에|에다|에다가)\s*(\S.*?)\s*(?:을|를)?\s*(?:추가|넣|적어|적|써|올려|등록|더해|메모)\S*(?:\s*(?:줘|주세요|줄래|줘요))?$/, "ko", 2, 1],
    [/^(.+?)\s*(?:을|를)?\s+(?:(?:내|우리)\s+)?(?:장보기|쇼핑|구매|마트)?\s*(?:목록|리스트)(?:에|에다|에다가)\s*(?:추가|넣|적어|적|써|올려|등록|더해|메모)\S*(?:\s*(?:줘|주세요|줄래|줘요))?$/, "ko", 1, 0],
    [/^(.+?)\s+(?:필요해요?|필요합니다|필요하다|있어야 해요?|사야 해요?|사야 돼요?|사야돼|사야지|사야겠다|사야겠어요?|사야 한다|사야 합니다|떨어졌어요?)$/, "ko", 1, 0],
    // Turkish (the object stands before the verb: \"Süt ve yumurtayı alışveriş listesine ekle\")
    [/^(?:(.+?)\s+)?(?:alışveriş\s+|market\s+)?(?:listesine|listeye|listemize|listeme)\s+(.+?)\s+(?:ekle|ekler\s+misin|ekleyin|ekleyebilir\s+misin|ekler\s+misiniz|yaz|yazar\s+mısın|koy|ilave\s+et)$/i, "tr", 2, 1],
    [/^(.+?)\s+(?:alışveriş\s+|market\s+)?(?:listesine|listeye|listemize|listeme)\s+(?:ekle|ekler\s+misin|ekleyin|ekleyebilir\s+misin|ekler\s+misiniz|yaz|yazar\s+mısın|koy|ilave\s+et)$/i, "tr", 1, 0],
    [/^(.+?)\s+(?:almam|almamız|almalıyım|almalıyız|alalım|alınacak|alınması)(?:\s+(?:lazım|gerek|gerekiyor))?$/i, "tr", 1, 0],
    [/^(.+?)\s+(?:lazım|gerekli|gerek|lazımdı|gerekiyor)$/i, "tr", 1, 0],
    [/^(.+?)\s+satın\s+al(?:ır\s+mısın)?$/i, "tr", 1, 0],
    // Polish
    [/^(?:proszę\s+)?(?:dodaj|dopisz|wpisz|zapisz|dorzuć|dołóż|wstaw|umieść)\s+(?:do|na)\s+(?:mojej\s+|naszej\s+|moją\s+|naszą\s+)?list[yęa](?:\s+zakupów|\s+zakupowej)?\s+(.+)$/i, "pl", 1, 0],
    [/^(?:proszę\s+)?(?:dodaj|dopisz|wpisz|zapisz|dorzuć|dołóż|wstaw|umieść)\s+(.+?)\s+(?:do|na)\s+(?:mojej\s+|naszej\s+|moją\s+|naszą\s+)?list[yęa](?:\s+zakupów|\s+zakupowej)?(?:\s+(?:(?:w|z|dla)\s+)?(.+))?$/i, "pl", 1, 2],
    [/^(?:potrzebujemy|potrzebuję|potrzebuje|brakuje\s+nam|brakuje\s+mi|musimy\s+kupić|muszę\s+kupić|trzeba\s+kupić|kup|kupić|kupmy)\s+(.+?)(?:\s+(?:w|z)\s+(.+))?$/i, "pl", 1, 2],
    // Ukrainian (\"до списку\" = genitive, \"у список\" = accusative)
    [/^(?:будь\s+ласка,?\s+)?(?:додай|додайте|запиши|занеси|внеси|впиши|поклади|постав|допиши)\s+(?:в|у|до|на)\s+(?:мій\s+|наш\s+|мого\s+|нашого\s+|моєму\s+|нашому\s+)?(?:списку|список|покупки)(?:\s+покупок)?\s+(.+)$/i, "uk", 1, 0],
    [/^(?:будь\s+ласка,?\s+)?(?:додай|додайте|запиши|занеси|внеси|впиши|поклади|постав|допиши)\s+(.+?)\s+(?:в|у|до|на)\s+(?:мій\s+|наш\s+|мого\s+|нашого\s+|моєму\s+|нашому\s+)?(?:списку|список|покупки)(?:\s+покупок)?(?:\s+(?:для|з|в|у)?\s*(.+))?$/i, "uk", 1, 2],
    [/^(?:(?:нам|мені)\s+(?:потрібно|треба|потрібні|потрібен|потрібна|потрібне)(?:\s+купити)?|(?:потрібно|треба|слід)\s+купити|купи|купити|придбай|купімо)\s+(.+?)(?:\s+(?:в|у|з)\s+(.+))?$/i, "uk", 1, 2],
];
// "Create a task" sentences of the newer languages: [pattern, language]
const TASK_MORE = [
    [/^herinner\s+(?:me|ons)\s+(.+)$/i, "nl"],
    [/^(?:nieuwe\s+)?(?:taak|to-?do)[:\s]+(.+)$/i, "nl"],
    [/^ricord(?:ami|aci)\s+(.+)$/i, "it"],
    [/^(?:(?:nuova|nuovo)\s+|aggiungi\s+(?:un\s+|un'\s*|una\s+)?)?(?:attività|compito|promemoria|task)[:\s]+(.+)$/i, "it"],
    [/^lembr[ae](?:-me|-nos|\s+me|\s+nos)\s+(.+)$/i, "pt"],
    [/^(?:me|nos)\s+lembre\s+(.+)$/i, "pt"],
    [/^(?:nova\s+|adicione\s+(?:uma\s+)?)?(?:tarefa|lembrete)[:\s]+(.+)$/i, "pt"],
    [/^(?:请|请帮我|帮我|麻烦)?提醒(?:我们|咱们|我)(.+)$/, "zh"],
    [/^(?:新建|新增|添加|创建|新)?(?:任务|待办)[:：\s]*(.+)$/, "zh"],
    [/^(?:新しい)?(?:タスク|やること|ToDo|todo)(?:を)?(?:追加|作成)?[:：\s]*(.+)$/i, "ja"],
    [/^(.+?)(?:を|と)?(?:思い出させて|リマインドしてください|リマインドして|リマインド|忘れないように(?:して|教えて|知らせて|言って)|通知して)$/, "ja"],
    [/^リマインダー(?:を)?(?:設定|追加|作成)?[:：\s]*(.+)$/, "ja"],
    [/^(?:새\s*)?(?:할\s*일|태스크|todo)\s*(?:추가)?[:：\s]+(.+)$/i, "ko"],
    [/^(.+?)\s*(?:알려\s*(?:줘|주세요|줄래)|알림\s*(?:해|설정해)\s*(?:줘|주세요)|리마인드\s*(?:해\s*)?(?:줘|주세요)|상기시켜\s*(?:줘|주세요)|잊지\s*않게\s*(?:해\s*)?(?:줘|주세요)|까먹지\s*않게\s*(?:해\s*)?(?:줘|주세요))$/, "ko"],
    [/^(?:리마인더|알림)\s*[:：]\s*(.+)$/, "ko"],
    [/^(?:(?:bana|bize)\s+)?(.+?)\s+(?:hatırlat|hatırlatır\s+mısın|hatırlatır\s+mısınız|hatırlatabilir\s+misin|hatırlatın)$/i, "tr"],
    [/^(?:yeni\s+)?(?:görev|yapılacak)(?:\s+ekle)?[:\s]+(.+)$/i, "tr"],
    [/^przypomnij\s+(?:mi|nam)[,:]?\s+(.+)$/i, "pl"],
    [/^(?:nowe\s+|dodaj\s+(?:nowe\s+)?)?(?:zadanie|przypomnienie)[:\s]+(.+)$/i, "pl"],
    [/^нагадай(?:\s+(?:мені|нам))?[,:]?\s+(.+)$/i, "uk"],
    [/^(?:нове\s+завдання|додай\s+завдання|створи\s+завдання|завдання)[:\s]+(.+)$/i, "uk"],
];
// "What is on today / tomorrow" of the newer languages -> 0 (today), 1 (tomorrow) or -1 (not such a sentence)
function dayOfMore(s) {
    const has = (re) => re.test(s);
    const dayNl = has(/(?:^|\s)(?:vandaag|morgen)(?:\s|$)/), dayIt = has(/(?:^|\s)(?:oggi|domani)(?:\s|$)/), dayPt = has(/(?:^|\s)(?:hoje|amanhã|amanha)(?:\s|$)/);
    let hit = false, tomorrow = false;
    if (dayNl && (has(/programma|agenda|afspra|gepland|te doen|planning/) || has(/^wat\s+(?:staat|is|heb|gebeurt|speelt)\s/))) { hit = true; tomorrow = has(/(?:^|\s)morgen(?:\s|$)/) && !has(/overmorgen/); }
    else if (has(/\bmijn dag\b|\bdagoverzicht\b/)) { hit = true; tomorrow = false; }
    else if (dayIt && (has(/programma|agenda|impegni|appuntamenti|calendario|da fare|attività|giornata/) || has(/^(?:cosa|che cosa|che)\s+c'?è\s/))) { hit = true; tomorrow = has(/(?:^|\s)domani(?:\s|$)/) && !has(/dopodomani/); }
    else if (has(/la mia giornata|la mia agenda|i miei impegni/)) { hit = true; tomorrow = false; }
    else if (dayPt && (has(/agenda|compromissos|programação|programado|planejado|tarefas|para fazer|tem para|o que tem|o que há|o que tenho|quais/))) { hit = true; tomorrow = has(/(?:^|\s)(?:amanhã|amanha)(?:\s|$)/) && !has(/depois de amanh/); }
    else if (has(/minha agenda|meu dia|minha rotina de hoje/)) { hit = true; tomorrow = false; }
    else if (has(/(?:今天|明天|今日|明日)[^，。]*(?:安排|日程|计划|行程|事|活动|任务|待办)|(?:今天|明天)的(?:日程|安排)|我的一天|我的日程|日程安排|有什么安排/)) { hit = true; tomorrow = has(/明天|明日/) && !has(/后天|後天/); }
    else if (has(/(?:今日|明日|あした|あす|きょう)(?:の)?(?:予定|スケジュール|用事|アジェンダ)|(?:今日|明日|あした|あす|きょう)(?:は|って)?(?:何|なに|どんな).*(?:ある|予定|入って)|私の一日|予定(?:を)?教えて|スケジュール(?:を)?教えて|^予定は/)) { hit = true; tomorrow = has(/明日|あした|あす/) && !has(/明後日|あさって/); }
    else if (has(/(?:오늘|내일)\s*(?:의\s*)?(?:일정|스케줄|계획|할\s*일|약속)|(?:오늘|내일)\s*은?\s*(?:뭐|무슨|어떤)|^(?:내\s*)?하루\s*(?:일정|뭐)/)) { hit = true; tomorrow = has(/내일/) && !has(/모레/); }
    if (!hit) {
        // Turkish, Polish, Ukrainian
        if (has(/(?:^|\s)(?:bugün|bugünkü|yarın|yarınki|bugünün|yarının)(?:\s|$)/) && has(/program|takvim|randevu|plan|gündem|görev|etkinlik|neler|ne\s+var|ne\s+yapıyoruz|ne\s+yapacağız/)) { hit = true; tomorrow = has(/(?:^|\s)(?:yarın|yarınki|yarının)(?:\s|$)/) && !has(/öbür\s+gün|ertesi\s+gün/); }
        else if (has(/(?:^|\s)(?:günüm|günlük\s+özet|bugünkü\s+programım)(?:\s|$)/)) { hit = true; tomorrow = false; }
        else if (has(/(?:^|\s)(?:dzisiaj|dziś|dzis|dzisiejsz\S*|jutro|jutrzejsz\S*)(?:\s|$)/) && (has(/plan|kalendarz|agend|terminy|spotkani|zadani|do\s+zrobienia|harmonogram/) || has(/^co\s+(?:mam|mamy|jest|się\s+dzieje|robimy|na)\s/))) { hit = true; tomorrow = has(/(?:^|\s)(?:jutro|jutrzejsz\S*)(?:\s|$)/) && !has(/pojutrze/); }
        else if (has(/^(?:mój\s+dzień|mój\s+plan\s+dnia|mój\s+kalendarz)/)) { hit = true; tomorrow = false; }
        else if (has(/(?:^|\s)(?:сьогодні|завтра)(?:\s|$)/) && (has(/план|розклад|календар|заплановано|завдан|зустріч|справ|подій|що\s+(?:в|у|на|мені|нам|маємо|є)\s|які\s/))) { hit = true; tomorrow = has(/(?:^|\s)завтра(?:\s|$)/) && !has(/післязавтра|позавтра/); }
        else if (has(/^(?:мій\s+день|мій\s+розклад)/)) { hit = true; tomorrow = false; }
    }
    return hit ? (tomorrow ? 1 : 0) : -1;
}

function intentOf(text, pref) {
    const s = text.toLowerCase().replace(/i\u0307/g, "i");
    // Ukrainian sentences: \"Купи хліб і молоко\" would also fit the Russian patterns, which do not know \"і\" as a separator -
    // so the Ukrainian patterns come first when the profile speaks Ukrainian or the sentence has a Ukrainian letter
    const ukFirst = pref === "uk" || /[іїєґ]/i.test(text);
    // Russian: read the list ("Что в списке покупок?", "Прочитай список", "Что нужно купить?", optionally with a shop: "… для Лидл").
    // Note: the server regex (goja) has no \b for Cyrillic and no look-behind – hence whitespace / start of line instead of \b.
    const ruList = s.match(/^(?:что\s+(?:сейчас\s+|ещё\s+|еще\s+)?(?:есть\s+)?(?:у\s+нас\s+|у\s+меня\s+)?(?:в|на)\s+(?:моём\s+|моем\s+|нашем\s+)?списк[еа]|(?:прочитай|прочти|зачитай|озвучь|назови|покажи)\s+(?:мне\s+)?(?:мой\s+|наш\s+)?список|что\s+(?:мне\s+|нам\s+)?(?:ещё\s+|еще\s+)?(?:нужно|надо)\s+купить)(?:\s+покупок)?(?:\s+(?:для|из|в)?\s*(.+))?$/);
    if (ruList) return { art: "liste", laden: ruList[1] ? ruList[1].trim() : "" };
    // Read the shopping list
    if (/(was|welche).*\b(auf|steht|stehen)\b.*liste\b|liste vorlesen|lies? .*liste|was (muss|soll|müssen) (ich|wir) (noch )?(ein)?kaufen|what'?s on (the |my |our )?(shopping )?list|read (out )?(the |my )?(shopping )?list|what do (i|we) need to buy|qu'?est-ce qu'?il y a sur la liste|lis la liste|qu'?est-ce que (je dois|nous devons|on doit) acheter|qu[eé] hay en la lista|lee la lista|qu[eé] (tengo|tenemos|hay) que comprar/.test(s)) {
        const shop = s.match(/\b(?:bei|von|at|from|chez|de|en|para)\s+([a-zäöüéèàñ0-9][\wäöüéèàñ' -]{1,30})$/i);
        return { art: "liste", laden: shop ? shop[1] : "" };
    }
    // Read the shopping list (Dutch, Italian, Portuguese, Chinese, Japanese, Korean, Turkish, Polish, Ukrainian)
    for (const [re, lang, si] of LIST_MORE) {
        const m = s.match(re);
        if (!m) continue;
        if (si) return { art: "liste", laden: cleanStore(m[si], lang) };
        let shop = null;
        if (lang === "nl") shop = s.match(/(?:^|\s)(?:bij|van|voor)\s+([a-z0-9][\w' -]{1,30})$/i);
        else if (lang === "it") shop = s.match(/(?:^|\s)(?:di|da|presso|per)\s+([a-z0-9][\w' -]{1,30})$/i);
        else if (lang === "pt") shop = s.match(/(?:^|\s)(?:no|na|do|da|em)\s+([a-zà-ú0-9][\wà-ú' -]{1,30})$/i);
        return { art: "liste", laden: shop ? shop[1] : "" };
    }
    // Korean: "what's on today – tell me" must not be taken for a reminder ("… 알려 줘")
    if (/[가-힣]/.test(s)) { const d = dayOfMore(s); if (d >= 0) return { art: "tag", offset: d }; }
    if (ukFirst) {
        for (const [re, lang, ii, si] of ADD_MORE) {
            if (lang !== "uk") continue;
            const m = text.match(re);
            if (m) return { art: "kaufen", items: parseItems(m[ii], lang), laden: si ? cleanStore(m[si], lang) : "" };
        }
    }
    // Add to the shopping list
    const add = [
        /^(?:bitte\s+)?(?:setz(?:e)?|schreib(?:e)?|pack(?:e)?|füg(?:e)?|trag(?:e)?|tu)?\s*(.+?)\s+(?:auf|zur|in die|zu der)\s+(?:die\s+|meine\s+|unsere\s+)?(?:einkaufsliste|liste|einkaufszettel)(?:\s+(?:bei|für|von)\s+(.+?))?(?:\s+(?:hinzu|ein|dazu|drauf))?$/i,
        /^(?:wir brauchen|ich brauche|kauf(?:e|en)?|einkaufen|einkauf)[:\s]+(.+?)(?:\s+(?:bei|von)\s+(.+))?$/i,
        /^(?:please\s+)?(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:the|my|our)\s+(?:shopping\s+)?(?:list)(?:\s+(?:at|for)\s+(.+))?$/i,
        /^(?:we need|i need|buy)\s+(.+?)(?:\s+(?:at|from)\s+(.+))?$/i,
        /^(?:ajoute|mets|rajoute|note)\s+(.+?)\s+(?:à|a|sur|dans)\s+(?:la|ma)\s+liste(?:\s+de\s+courses)?(?:\s+(?:chez|pour)\s+(.+))?$/i,
        /^(?:il (?:nous|me) faut|achète|acheter)\s+(.+?)(?:\s+chez\s+(.+))?$/i,
        /^(?:añade|agrega|pon|apunta)\s+(.+?)\s+(?:a|en)\s+la\s+lista(?:\s+de\s+la\s+compra)?(?:\s+(?:de|para|en)\s+(.+))?$/i,
        /^(?:necesitamos|necesito|compra|comprar)\s+(.+?)(?:\s+en\s+(.+))?$/i,
        /^(?:пожалуйста,?\s+)?(?:добавь|добавьте|запиши|поставь|положи|внеси)\s+(.+?)\s+(?:в|на)\s+(?:мой\s+|наш\s+)?(?:список|покупки)(?:\s+покупок)?(?:\s+(?:для|из|в)?\s*(.+))?$/i,
        /^(?:(?:нам|мне)\s+(?:нужно|надо)(?:\s+купить)?|нам\s+нужны|мне\s+нужны|нужно\s+купить|надо\s+купить|купи|купить)\s+(.+?)(?:\s+(?:в|из)\s+(.+))?$/i,
    ];
    for (const re of add) {
        const m = text.match(re);
        if (m) return { art: "kaufen", items: parseItems(m[1]), laden: m[2] || "" };
    }
    for (const [re, lang, ii, si] of ADD_MORE) {
        const m = text.match(re);
        if (m) return { art: "kaufen", items: parseItems(m[ii], lang), laden: si ? cleanStore(m[si], lang) : "" };
    }
    // Task
    const task = [
        /^(?:erinnere|erinner)\s+(?:mich|uns)\s+(.+)$/i,
        /^(?:neue\s+)?(?:aufgabe|todo|to-do|to do)[:\s]+(.+)$/i,
        /^remind (?:me|us)\s+(.+)$/i,
        /^(?:new\s+|add\s+(?:a\s+)?)?(?:task|to-?do)[:\s]+(.+)$/i,
        /^rappelle[- ](?:moi|nous)\s+(.+)$/i,
        /^(?:nouvelle\s+|ajoute\s+(?:une\s+)?)?tâche[:\s]+(.+)$/i,
        /^recu[eé]rda(?:me|nos)\s+(.+)$/i,
        /^(?:nueva\s+|añade\s+(?:una\s+)?)?tarea[:\s]+(.+)$/i,
        /^напомни(?:\s+(?:мне|нам))?\s+(.+)$/i,
        /^(?:новая\s+задача|добавь\s+задачу|создай\s+задачу|задачу|задача)[:\s]+(.+)$/i,
    ];
    for (const re of task) {
        const m = text.match(re);
        if (m) return Object.assign({ art: "aufgabe" }, parseDate(m[1]));
    }
    for (const [re, lang] of TASK_MORE) {
        const m = text.match(re);
        if (!m) continue;
        return Object.assign({ art: "aufgabe" }, (lang === "zh" || lang === "ja" || lang === "ko") ? parseDateCjk(m[1], lang) : parseDate(m[1], lang));
    }
    // Daily overview
    if (/(was|welche).*(heute|morgen)|termine (heute|morgen)|mein tag|tagesüberblick|was (ist|gibt'?s) (heute|morgen)|what'?s (on|happening|planned|up)|(today|tomorrow)'?s? (plan|agenda|schedule)|my day|agenda|qu'?est-ce qu'?il y a|programme|ma journée|qu'?est-ce que j'?ai|qu[eé] (tengo|hay|tenemos)|mi día|mi agenda|(?:что|какие|какой)\s.*(?:сегодня|завтра)|что\s+запланировано|что\s+по\s+плану|мой\s+день|расписание/.test(s)) {
        const morgen = /(\bmorgen\b|tomorrow|demain|mañana|завтра|domani|amanhã|amanha)/.test(s) && !/(übermorgen|overmorgen|pasado mañana|après-demain|послезавтра|dopodomani|depois de amanh)/.test(s);
        return { art: "tag", offset: morgen ? 1 : 0 };
    }
    const more = dayOfMore(s);
    if (more >= 0) return { art: "tag", offset: more };
    return { art: "hilfe" };
}

// ---------------------------------------------------------------------------------------------
// Shopping list
// ---------------------------------------------------------------------------------------------
function norm(s) {
    return String(s || "").toLowerCase().replace(/i\u0307/g, "i").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/ё/g, "е")
        .replace(/[ąáàâ]/g, "a").replace(/[ćç]/g, "c").replace(/[ęéèê]/g, "e").replace(/ł/g, "l").replace(/ń/g, "n").replace(/[óòô]/g, "o").replace(/ś/g, "s")
        .replace(/[źż]/g, "z").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ş/g, "s")
        .replace(/[^a-z0-9а-яіїєґ]/g, "");
}
// Inflected shop names (Polish \"w Biedronce\" - list \"Biedronka\"): same beginning, only the ending differs
function sameStem(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 5) return false;
    let p = 0;
    while (p < n && a.charAt(p) === b.charAt(p)) p++;
    return p >= 4 && p >= n - 2;
}
function targetList(data, laden) {
    const lists = Array.isArray(data.shoppingLists) ? data.shoppingLists.filter(l => l && l.id && l.id !== "essensplanung") : [];
    if (laden) {
        const k = norm(laden);
        const hit = lists.find(l => norm(l.name) === k) || lists.find(l => k && (norm(l.name).indexOf(k) >= 0 || k.indexOf(norm(l.name)) >= 0))
            || lists.find(l => k && sameStem(norm(l.name), k));
        if (hit) return hit;
    }
    const tgt = data.shoppingMealTarget && data.shoppingMealTarget.listId;
    const main = tgt ? lists.find(l => l.id === tgt) : null;
    return main || { id: "essensplanung", name: "" };
}
function listLabel(list, L, form) {
    const named = !!(list && list.name);
    const f = form || "";
    const tpl = L[(named ? "listNamed" : "listName") + f] || L[named ? "listNamed" : "listName"];
    return named ? fill(tpl, { n: list.name }) : tpl;
}
// Placeholders of the answer texts: {l} list name, {N} as subject, {P} after "on/in" (see the note at the texts)
function lv(list, L, v) { return Object.assign({ l: listLabel(list, L), N: capL(listLabel(list, L, "N"), L), P: listLabel(list, L, "P") }, v); }
function itemText(it) { return (it.qty ? it.qty + " " : "") + it.name; }

function addItems(familyId, auth, intent, L) {
    if (!intent.items.length) return { antwort: L.noItems };
    // Since 1.105 the shopping list lives in its own area "einkauf" (pinn-bereiche.js)
    let bereiche = null;
    try { bereiche = require(`${__hooks}/pinn-bereiche.js`); } catch (e) { bereiche = null; }
    if (bereiche && bereiche.isMoved(familyId, "einkauf")) return addItemsArea(bereiche, familyId, auth, intent, L);
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
            reply = dup.length ? fill(L.addedSome, lv(list, L, { i: joinList(added, L), d: joinList(dup, L) })) : fill(L.added, lv(list, L, { i: joinList(added, L) }));
        } else {
            reply = fill(L.already, lv(list, L, { i: joinList(dup, L) }));
        }
    });
    if (changed) {
        try { require(`${__hooks}/pinn-hinweise.js`).afterSave(familyId, before, after, auth); } catch (err) { console.log("[Sprache] Hinweise: " + err.message); }
    }
    return { antwort: reply, geaendert: changed };
}
// The same inside the own area "einkauf"
function addItemsArea(bereiche, familyId, auth, intent, L) {
    let reply = "";
    const r = bereiche.updateArea(familyId, "einkauf", (data) => {
        const items = Array.isArray(data.shoppingItems) ? data.shoppingItems : [];
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
        if (!added.length) { reply = fill(L.already, lv(list, L, { i: joinList(dup, L) })); return false; }
        reply = dup.length ? fill(L.addedSome, lv(list, L, { i: joinList(added, L), d: joinList(dup, L) })) : fill(L.added, lv(list, L, { i: joinList(added, L) }));
        return true;
    });
    if (r.changed) {
        try { require(`${__hooks}/pinn-hinweise.js`).afterSave(familyId, r.before, r.after, auth); } catch (err) { console.log("[Sprache] Hinweise: " + err.message); }
    }
    return { antwort: reply, geaendert: r.changed };
}
function readList(familyId, intent, L) {
    const data = require(`${__hooks}/pinn-benutzer.js`).loadFamilyDataFor(familyId) || {}; // includes the areas
    const items = (Array.isArray(data.shoppingItems) ? data.shoppingItems : []).filter(x => x && !x.done && x.name);
    let list = null, open = items;
    if (intent.laden) {
        list = targetList(data, intent.laden);
        open = items.filter(x => (x.listId || "essensplanung") === list.id);
    }
    const ll = list ? listLabel(list, L) : capL(L.listName, L);
    const lvl = lv(list, L, {});
    if (!open.length) return { antwort: fill(L.listEmpty, Object.assign(lvl, { l: capL(ll, L) })) };
    const names = open.slice(0, 15).map(itemText);
    if (open.length > 15) names.push(fill(L.more, { n: open.length - 15 }));
    return { antwort: fill(L.listHas, Object.assign(lvl, { l: ll, i: joinList(names, L) })) };
}

// ---------------------------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------------------------
function createTask(familyId, auth, intent, L) {
    const title = String(intent.rest || "").slice(0, 120);
    if (!title) return { antwort: L.noTask };
    const lib = require(`${__hooks}/pinn-aufgaben.js`);
    const task = lib.saveTask({ title: title, notes: "", dueDate: intent.iso || "", neu: true }, auth.id, familyId);
    try { require(`${__hooks}/pinn-hinweise.js`).taskCreated(familyId, task, auth); } catch (err) { /* ignore */ }
    return { antwort: fill(L.task, { t: title, d: intent.iso ? fill(L.due, { d: dayWord(intent.iso, L) }) : "" }), geaendert: true };
}

// ---------------------------------------------------------------------------------------------
// Daily overview: events (family calendar + own calendars) and open tasks
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
    try { text += require(`${__hooks}/calendar-sync.js`).readCalendarText(familyId) || ""; } catch (e) { /* ignore */ }
    try { text += "\n" + (require(`${__hooks}/pinn-kalender.js`).icsAllForFamily(familyId) || ""); } catch (e) { /* ignore */ }
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
    const colon = L.colon != null ? L.colon : ":";
    const glue = L.glue != null ? L.glue : " ";
    const parts = [lead + colon];
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
    return { antwort: parts.join(glue) };
}

// ---------------------------------------------------------------------------------------------
// Widget data (since 1.140.0): the same secret link, read only. For iPhone widgets (Scriptable), the
// Shortcuts widget and the Apple Watch (a shortcut). Texts in the language of the profile.
// ---------------------------------------------------------------------------------------------
const WIDGET_T = {
    de: { shop: "Einkauf", events: "Termine", tasks: "Aufgaben", none: "Nichts geplant", empty: "Liste leer", more: "+{n} weitere" },
    en: { shop: "Shopping", events: "Events", tasks: "Tasks", none: "Nothing planned", empty: "List empty", more: "+{n} more" },
    fr: { shop: "Courses", events: "Rendez-vous", tasks: "Tâches", none: "Rien de prévu", empty: "Liste vide", more: "+{n} autres" },
    es: { shop: "Compra", events: "Citas", tasks: "Tareas", none: "Nada previsto", empty: "Lista vacía", more: "+{n} más" },
    ru: { shop: "Покупки", events: "События", tasks: "Задачи", none: "Ничего не запланировано", empty: "Список пуст", more: "+ещё {n}" },
    nl: { shop: "Boodschappen", events: "Afspraken", tasks: "Taken", none: "Niets gepland", empty: "Lijst leeg", more: "+{n} meer" },
    it: { shop: "Spesa", events: "Appuntamenti", tasks: "Attività", none: "Niente in programma", empty: "Lista vuota", more: "+{n} altri" },
    pt: { shop: "Compras", events: "Compromissos", tasks: "Tarefas", none: "Nada planeado", empty: "Lista vazia", more: "+{n} mais" },
    zh: { shop: "购物", events: "日程", tasks: "任务", none: "暂无安排", empty: "清单为空", more: "另有 {n} 项" },
    ja: { shop: "買い物", events: "予定", tasks: "タスク", none: "予定なし", empty: "リストは空です", more: "ほか {n} 件" },
    ko: { shop: "장보기", events: "일정", tasks: "할 일", none: "예정된 일 없음", empty: "목록이 비었습니다", more: "외 {n}개" },
    tr: { shop: "Alışveriş", events: "Randevular", tasks: "Görevler", none: "Planlanmış bir şey yok", empty: "Liste boş", more: "+{n} tane daha" },
    pl: { shop: "Zakupy", events: "Terminy", tasks: "Zadania", none: "Nic nie zaplanowano", empty: "Lista pusta", more: "+{n} więcej" },
    uk: { shop: "Покупки", events: "Події", tasks: "Завдання", none: "Нічого не заплановано", empty: "Список порожній", more: "+ще {n}" },
};
function widgetDay(familyId, user, offset, W, L) {
    const day = addDays(todayIso(), offset);
    const events = eventsOn(familyId, user.id, day).filter(e => e.title).slice(0, 10)
        .map(e => ({ time: e.time || "", title: e.title }));
    let tasks = [];
    try {
        tasks = (require(`${__hooks}/pinn-aufgaben.js`).listAll(familyId) || [])
            .filter(t => t && !t.done && (t.title || t.titel) && t.dueDate && (offset ? t.dueDate === day : t.dueDate <= day))
            .slice(0, 10)
            .map(t => String(t.title || t.titel).replace(/^\S+\s(?=\S)/u, m => (/\p{Extended_Pictographic}/u.test(m) ? "" : m)));
    } catch (e) { tasks = []; }
    return { date: day, label: L.dayLead[offset ? 1 : 0], events: events, tasks: tasks };
}
function widgetData(token, view, format) {
    const rec = recOfToken(token);
    if (!rec) return { ok: false, status: 403, error: "Dieser Link ist nicht (mehr) gültig – bitte in pinn. unter Einstellungen → Sprachsteuerung neu einrichten." };
    let user = null;
    try { user = $app.findRecordById(USERS, rec.getString("benutzer")); } catch (e) { user = null; }
    if (!user || user.getString("rolle") === "gast" || !user.getString("familie")) return { ok: false, status: 403, error: "Dieses Profil hat keine Sprachsteuerung." };
    const familyId = user.getString("familie");
    const lang = langOf(user);
    const L = T[lang] || T.en;
    const W = WIDGET_T[lang] || WIDGET_T.en;
    try {
        const k = "pinnSprache:" + rec.id + ":" + Math.floor(Date.now() / 60000);
        const n = Number($app.store().get(k) || 0) + 1;
        $app.store().set(k, n);
        if (n > LIMIT_PER_MIN) return { ok: false, status: 429, error: "429" };
    } catch (e) { /* ignore */ }
    try {
        const days = [widgetDay(familyId, user, 0, W, L), widgetDay(familyId, user, 1, W, L)];
        const data = require(`${__hooks}/pinn-benutzer.js`).loadFamilyDataFor(familyId) || {};
        const open = (Array.isArray(data.shoppingItems) ? data.shoppingItems : []).filter(x => x && !x.done && x.name);
        const shop = open.slice(0, 12).map(itemText);
        const out = {
            ok: true, language: lang, updated: new Date().toISOString(),
            texts: { shop: W.shop, events: W.events, tasks: W.tasks, none: W.none, empty: W.empty, allday: L.allday },
            days: days,
            shopping: { count: open.length, items: shop, more: open.length > shop.length ? fill(W.more, { n: open.length - shop.length }) : "" },
        };
        if (format === "text") {
            const lines = [];
            const dayLines = d => {
                lines.push(d.label + " (" + d.date.slice(8, 10) + "." + d.date.slice(5, 7) + ".)");
                if (!d.events.length && !d.tasks.length) lines.push("  " + W.none);
                d.events.forEach(e => lines.push("  " + (e.time ? e.time + " " : "") + e.title));
                d.tasks.forEach(t => lines.push("  ☐ " + t));
            };
            if (view === "einkauf") {
                lines.push(W.shop + " (" + open.length + ")");
                if (!shop.length) lines.push("  " + W.empty);
                shop.forEach(x => lines.push("  • " + x));
                if (out.shopping.more) lines.push("  " + out.shopping.more);
            } else if (view === "morgen") dayLines(days[1]);
            else if (view === "alles") {
                dayLines(days[0]);
                lines.push("");
                dayLines(days[1]);
                lines.push("");
                lines.push(W.shop + " (" + open.length + ")");
                if (!shop.length) lines.push("  " + W.empty);
                shop.forEach(x => lines.push("  • " + x));
                if (out.shopping.more) lines.push("  " + out.shopping.more);
            } else dayLines(days[0]);
            out.text = lines.join("\n");
        }
        return out;
    } catch (err) {
        console.log("[Sprache] Widget: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("Sprachsteuerung", err.message, {}); } catch (e) { /* log not available */ }
        return { ok: false, status: 200, error: fill(L.error, { m: err.message }) };
    }
}

// ---------------------------------------------------------------------------------------------
// Entry point: command via the secret link
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
    // Protection against flooding: 30 commands per minute and link
    try {
        const k = "pinnSprache:" + rec.id + ":" + Math.floor(Date.now() / 60000);
        const n = Number($app.store().get(k) || 0) + 1;
        $app.store().set(k, n);
        if (n > LIMIT_PER_MIN) return { ok: false, status: 429, antwort: fill(L.error, { m: "429" }) };
    } catch (e) { /* ignore */ }

    const sentence = cleanSentence(text);
    if (!sentence) return { ok: true, antwort: L.help };
    const intent = intentOf(sentence, lang);
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
        if (L.tr && r && r.antwort) r.antwort = cap(r.antwort, true); // Turkish: first letter İ / I, not i
        return Object.assign({ ok: true, art: intent.art }, r);
    } catch (err) {
        console.log("[Sprache] " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("Sprachsteuerung", err.message, {}); } catch (e) { /* log not available */ }
        return { ok: false, status: 200, antwort: fill(L.error, { m: err.message }) };
    }
}

module.exports = { texts: T, cleanSentence, ensureSchema, statusFor, einrichten, ausschalten, cleanupUser, befehl, widgetData, widgetTexts: WIDGET_T, intentOf, parseItems, parseDate, parseEvents, occursOn };

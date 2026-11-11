/* pinn. – Voice control (js/sprachsteuerung.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: Settings → Voice control – load and show the personal secret link (loadVoiceSettings,
   renderVoiceSettings), create or renew it, switch it off and try a sentence (voiceSetup, voiceOff, voiceTest).
   Since 1.141.0 the widget script is modular: tick boxes for events, tasks and household tasks; tapping a task in the widget
   ticks it off in pinn. as well (server: POST /api/pinn/widget/abhaken). Since 1.141.2 gold of the app instead of green, ticks instead of circles, new look of the quick access tiles.
   Since 1.147.0 open tasks show an empty ring and ticked ones a filled tick, the tasks of the maintenance plan
   (Home -> house & garden) are a group of their own, and the three guides (iPhone, Android, widgets) start closed.
   Since 1.141.1 in the style of Apple Reminders, without
   shopping lists, plus a second script with three quick access tiles (widgetQuickScript).
   Since 1.140.0: widgets and Apple Watch – read-only links on the same secret link (widgetLink), the ready-made
   Scriptable widget script (widgetScript) and the set-up steps. Server: GET /api/pinn/widget in pb_hooks/sprache.pb.js.
   The settings load when the section is opened. The server side is pb_hooks/sprache.pb.js + pinn-sprache.js. */

/* ==========================================================
   Voice control (Settings → Voice control, pb_hooks/sprache.pb.js + pinn-sprache.js)
   ----------------------------------------------------------
   On request every profile gets its own secret link. A Siri shortcut (or on Android the app
   "HTTP Shortcuts") sends the spoken sentence there, the server understands it (German, English,
   French, Spanish) and answers with a sentence to be read aloud:
   - "Milk and two packs of eggs on the shopping list (at Rewe)"
   - "What's on the shopping list?"
   - "Remind me about the bins tomorrow" / "Task: clean the windows on Saturday"
   - "What's on today?" / "What's on tomorrow?"
   The link works like a password for exactly these commands. Guests have no voice control;
   profiles with child lock can only ask, not create anything.
   ========================================================== */
let voiceState = null;
function voiceLink(token) { return location.origin + '/api/pinn/sprache?token=' + encodeURIComponent(token); }
// Widget link: the same secret token, read-only data. view = the view key of the server (today, tomorrow, shopping, everything); text = plain text for shortcuts
function widgetLink(token, view, text) {
  return location.origin + '/api/pinn/widget?token=' + encodeURIComponent(token) + '&ansicht=' + (view || 'heute') + (text ? '&format=text' : '');
}
// Ready-made script for the free iOS app Scriptable (home screen and lock screen widget).
// Modular since 1.141.0: cfg = { events, tasks, household, house } decides what the widget shows (one script per widget;
// house since 1.147.0 = tasks of the maintenance plan in Home -> house & garden, shown up to two months ahead with their date).
// Since 1.141.1 in the style of Apple Reminders: dark grey, white text, round circles (SF Symbols); ticked tasks stay
// below the open ones, grey with a filled circle. Tapping a task in a medium or large widget ticks it off in pinn. as well:
// iOS opens Scriptable for a moment, the script sends the tick (POST /api/pinn/widget/abhaken) and shows the result.
function widgetScript(token, cfg) {
  const c = cfg || {};
  const conf = { events: !!c.events, tasks: !!c.tasks, household: !!c.household, house: !!c.house };
  const tpl = String.raw`// pinn. widget for Scriptable (made in pinn.: Settings > Voice control > Widgets). One script = one widget.
const BASE = __BASE__;
const TOKEN = __TOKEN__;
const CFG = __CFG__;
const API = BASE + "/api/pinn/widget?token=" + TOKEN + "&ansicht=alles";
const TICK = BASE + "/api/pinn/widget/abhaken?token=" + TOKEN;
const BG = "#1C1C1E", WHITE = "#FFFFFF", GRAY = "#8E8E93", DONE = "#636366", ACCENT = __ACCENT__;
const q = (args && args.queryParameters) || {};
let note = "";
// 1. Tap on a task: tick it off in pinn. (k = t, i = id of the task, d = 1 ticked / 0 open again)
if (q.k === "t" && q.i) {
  try {
    const r = new Request(TICK + "&art=task&id=" + encodeURIComponent(q.i) + "&erledigt=" + (q.d === "0" ? "0" : "1"));
    r.method = "POST";
    const res = await r.loadJSON();
    if (!res || !res.ok) note = (res && res.error) || "Error";
  } catch (e) { note = "No connection"; }
}
// 2. Load the data
let d = null;
try { d = await new Request(API).loadJSON(); } catch (e) { d = null; }
const fam = config.widgetFamily || "";
const lock = fam.indexOf("accessory") === 0;
const small = fam === "small";
const tappable = !!(d && d.ok && d.canTick) && (fam === "medium" || fam === "large" || !fam);
const base = URLScheme.forRunningScript();
const tapUrl = (id, done) => base + (base.indexOf("?") >= 0 ? "&" : "?") + "k=t&i=" + encodeURIComponent(id) + "&d=" + (done ? 1 : 0);
// Group of a task: house & garden (maintenance plan), household or other tasks
const groupOf = t => (t.house ? "house" : (t.household ? "household" : "tasks"));
// Date of a task that is due later (only house & garden tasks are shown ahead of time)
function dueLabel(t) {
  if (!t.due || !d.today || t.due <= d.today) return "";
  try { return new Date(t.due + "T12:00:00").toLocaleDateString(d.language || undefined, { day: "numeric", month: "short" }); }
  catch (e) { return t.due.slice(8, 10) + "." + t.due.slice(5, 7) + "."; }
}
// 3. Build the rows: { t: text, kind: head | event | task | done | more, url, note }
const rows = [];
if (d && d.ok) {
  const day = d.days[0];
  if (CFG.events) {
    rows.push({ t: d.texts.events, kind: "head" });
    if (!day.events.length) rows.push({ t: d.texts.none, kind: "more" });
    day.events.forEach(e => rows.push({ t: (e.time ? e.time + "  " : "") + e.title, kind: "event" }));
  }
  // Tasks and household tasks share one list (as before), house & garden gets its own heading
  const groups = [];
  if (CFG.tasks || CFG.household) groups.push({ head: CFG.tasks ? d.texts.tasks : d.texts.household, take: g => (g === "tasks" ? CFG.tasks : (g === "household" ? CFG.household : false)) });
  if (CFG.house) groups.push({ head: d.texts.house || d.texts.household, take: g => g === "house" });
  groups.forEach(gr => {
    const list = (d.tasks || []).filter(t => gr.take(groupOf(t)));
    const open = list.filter(t => !t.done), done = list.filter(t => t.done);
    rows.push({ t: gr.head + (open.length ? "  " + open.length : ""), kind: "head" });
    if (!list.length) rows.push({ t: d.texts.none, kind: "more" });
    open.forEach(t => rows.push({ t: t.title, kind: "task", note: dueLabel(t), url: tappable ? tapUrl(t.id, true) : "" }));
    done.forEach(t => rows.push({ t: t.title, kind: "done", url: tappable ? tapUrl(t.id, false) : "" }));
  });
}
// 4. Draw the widget (dark grey, white text; open task = empty ring, ticked task = filled tick)
const w = new ListWidget();
w.backgroundColor = new Color(BG);
w.setPadding(14, 14, 12, 14);
const SIZE = small ? 14 : 16;
function symbol(name, color, size) {
  const sym = SFSymbol.named(name);
  return sym ? { image: sym.image, color: color, size: size } : null;
}
function line(r) {
  if (r.kind === "head") {
    const t = w.addText(String(r.t));
    t.font = Font.boldSystemFont(small ? 15 : 18);
    t.textColor = new Color(ACCENT);
    t.lineLimit = 1;
    return;
  }
  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  if (r.url) row.url = r.url;
  const icon = r.kind === "task" ? symbol("circle", GRAY, SIZE + 2) : (r.kind === "done" ? symbol("checkmark.circle.fill", ACCENT, SIZE + 2) : (r.kind === "event" ? symbol("calendar", GRAY, SIZE + 2) : null));
  if (icon) {
    const img = row.addImage(icon.image);
    img.imageSize = new Size(icon.size, icon.size);
    img.tintColor = new Color(icon.color);
    row.addSpacer(8);
  }
  const t = row.addText(String(r.t));
  t.font = Font.systemFont(SIZE);
  t.textColor = new Color(r.kind === "done" ? DONE : (r.kind === "more" ? GRAY : WHITE));
  t.lineLimit = 1;
  if (r.note) {
    row.addSpacer(6);
    const n = row.addText(String(r.note));
    n.font = Font.systemFont(SIZE - 3);
    n.textColor = new Color(GRAY);
    n.lineLimit = 1;
  }
  row.addSpacer();
}
if (!d || !d.ok) {
  line({ t: "pinn.", kind: "head" });
  line({ t: (d && d.error) || "No connection", kind: "more" });
} else if (lock) {
  const body = rows.filter(r => r.kind === "task" || r.kind === "event");
  const max = fam === "accessoryRectangular" ? 3 : 1;
  (body.length ? body : rows).slice(0, max).forEach(r => { const t = w.addText((r.kind === "task" ? "\u25CB " : "") + r.t); t.lineLimit = 1; });
} else {
  const max = fam === "large" ? 11 : (small ? 4 : (fam === "medium" ? 5 : 8));
  rows.slice(0, max).forEach((r, i) => { if (i) w.addSpacer(r.kind === "head" ? 8 : 5); line(r); });
  if (rows.length > max) { w.addSpacer(4); line({ t: "…", kind: "more" }); }
}
if (note) { w.addSpacer(4); line({ t: "\u26A0 " + note, kind: "more" }); }
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
if (config.runsInWidget) Script.setWidget(w);
else if (q.k) await w.presentLarge();
else await w.presentMedium();
Script.complete();
`;
  return tpl
    .replace('__BASE__', () => JSON.stringify(location.origin))
    .replace('__TOKEN__', () => JSON.stringify(token))
    .replace('__ACCENT__', () => JSON.stringify(widgetAccent()))
    .replace('__CFG__', () => JSON.stringify(conf));
}
// Gold of the app (theme colour "mustard", customisable in the settings) for the widget scripts; fallback = the default
function widgetAccent() {
  let c = '';
  try { c = getComputedStyle(document.documentElement).getPropertyValue('--c-mustard').trim(); } catch (e) { c = ''; }
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#A67B01';
}
// Quick access widget (since 1.141.1, new look in 1.141.2): three tiles – lists/shopping, finances (currency sign of the
// region), tasks. A tile opens pinn. on that page (link ?seite=…, see openPageFromUrl in js/appstart.js). iOS opens such a
// link in Safari, not in the installed app (no way around it), so the profile has to be signed in once in Safari.
function widgetQuickScript() {
  const conf = {
    sym: (typeof curSym === 'function' ? curSym() : '') || '€',
    tiles: [
      { page: 'einkauf', icon: 'cart.fill', label: tk('nav.lists') },
      { page: 'finanzen', icon: '', label: tk('nav.finance') },
      { page: 'aufgaben', icon: 'checkmark', label: tk('nav.tasks') },
    ],
  };
  const tpl = String.raw`// pinn. quick access for Scriptable (made in pinn.: Settings > Voice control > Widgets). Medium widget with three tiles.
const BASE = __BASE__;
const CFG = __CFG__;
const TILE = "#2C2C2E", EDGE = "#3A3A3C", WHITE = "#FFFFFF", ACCENT = __ACCENT__;
const fam = config.widgetFamily || "";
const w = new ListWidget();
const grad = new LinearGradient();
grad.colors = [new Color("#2A2A2E"), new Color("#141416")];
grad.locations = [0, 1];
w.backgroundGradient = grad;
w.url = BASE;
// Round badge with the symbol (or the currency sign) in the gold of the app
function badge(parent, tile, size) {
  const c = parent.addStack();
  c.layoutHorizontally();
  c.centerAlignContent();
  c.size = new Size(size, size);
  c.cornerRadius = size / 2;
  c.backgroundColor = new Color(ACCENT, 0.22);
  c.addSpacer();
  if (tile.icon && SFSymbol.named(tile.icon)) {
    const img = c.addImage(SFSymbol.named(tile.icon).image);
    img.imageSize = new Size(size * 0.5, size * 0.5);
    img.tintColor = new Color(ACCENT);
  } else {
    const s = c.addText(CFG.sym);
    s.font = Font.boldSystemFont(CFG.sym.length > 2 ? size * 0.32 : size * 0.5);
    s.textColor = new Color(ACCENT);
    s.minimumScaleFactor = 0.5;
    s.lineLimit = 1;
  }
  c.addSpacer();
}
if (fam.indexOf("accessory") === 0) {
  const t = w.addText("pinn.");
  t.font = Font.boldSystemFont(14);
} else if (fam === "small") {
  w.setPadding(10, 12, 10, 12);
  CFG.tiles.forEach((tile, i) => {
    if (i) w.addSpacer(6);
    const row = w.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.url = BASE + "/?seite=" + tile.page;
    badge(row, tile, 28);
    row.addSpacer(8);
    const t = row.addText(tile.label);
    t.font = Font.semiboldSystemFont(15);
    t.textColor = new Color(WHITE);
    t.lineLimit = 1;
    row.addSpacer();
  });
} else {
  w.setPadding(12, 14, 12, 14);
  // Tile width from the screen width (a medium widget is about 87 percent of the screen width); small safety margin
  let screen = 390;
  try { screen = Device.screenSize().width; } catch (e) { screen = 390; }
  const gap = 10;
  const tileW = Math.floor((screen * 0.84 - 28 - 2 * gap) / 3);
  const tileH = fam === "large" ? 108 : 84;
  if (fam === "large") w.addSpacer();
  const outer = w.addStack();
  outer.layoutHorizontally();
  outer.addSpacer();
  CFG.tiles.forEach((tile, i) => {
    if (i) outer.addSpacer(gap);
    const box = outer.addStack();
    box.layoutVertically();
    box.centerAlignContent();
    box.backgroundColor = new Color(TILE);
    box.cornerRadius = 22;
    box.borderWidth = 1;
    box.borderColor = new Color(EDGE);
    box.size = new Size(tileW, tileH);
    box.url = BASE + "/?seite=" + tile.page;
    box.addSpacer();
    const top = box.addStack();
    top.addSpacer();
    badge(top, tile, 38);
    top.addSpacer();
    box.addSpacer(7);
    const lab = box.addStack();
    lab.addSpacer();
    const t = lab.addText(tile.label);
    t.font = Font.semiboldSystemFont(13);
    t.textColor = new Color(WHITE);
    t.lineLimit = 1;
    t.minimumScaleFactor = 0.7;
    lab.addSpacer();
    box.addSpacer();
  });
  outer.addSpacer();
  if (fam === "large") w.addSpacer();
}
if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
`;
  return tpl
    .replace('__BASE__', () => JSON.stringify(location.origin))
    .replace('__ACCENT__', () => JSON.stringify(widgetAccent()))
    .replace('__CFG__', () => JSON.stringify(conf));
}
// What the widget should show: stored on this device, so every profile / phone keeps its own choice
const WIDGET_PICK_KEY = 'pinnWidgetPick';
function widgetPick() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(WIDGET_PICK_KEY) || 'null'); } catch (e) { p = null; }
  if (!p || typeof p !== 'object') p = { events: true, tasks: true, household: false, house: true };
  return p;
}
function widgetPickSave(p) { try { localStorage.setItem(WIDGET_PICK_KEY, JSON.stringify(p)); } catch (e) { /* storage not available */ } }
function widgetPickHtml() {
  const p = widgetPick();
  const box = (id, on, label) => `<label class="flex items-center gap-2 text-[12px] text-ink/80"><input type="checkbox" id="${id}" class="accent-pine"${on ? ' checked' : ''} /><span>${label}</span></label>`;
  return `<div class="rounded-lg bg-ink/5 p-3 mt-3 flex flex-col gap-1.5">
        <p class="text-[12px] font-medium">${escapeHtml(tk('voice.widgetPick'))}</p>
        ${box('wgEvents', p.events, escapeHtml(tk('voice.widgetEvents')))}
        ${box('wgTasks', p.tasks, escapeHtml(tk('voice.widgetTasks')))}
        ${box('wgHousehold', p.household, escapeHtml(tk('voice.widgetHousehold')))}
        ${box('wgHouse', !!p.house, escapeHtml(tk('voice.widgetHouse')))}
      </div>`;
}
function widgetPickRead() {
  const p = {
    events: !!(document.getElementById('wgEvents') || {}).checked,
    tasks: !!(document.getElementById('wgTasks') || {}).checked,
    household: !!(document.getElementById('wgHousehold') || {}).checked,
    house: !!(document.getElementById('wgHouse') || {}).checked,
  };
  return { pick: p, cfg: p };
}
async function loadVoiceSettings() {
  const box = document.getElementById('voiceSettingsBody');
  if (!box) return;
  if (isCurrentUserGuest()) { box.innerHTML = ('<p class="text-xs text-ink/50">' + tk('smart.notForGuests') + '</p>'); return; }
  try {
    const res = await apiFetch('/api/pinn/sprache/status', { method: 'GET' });
    if (res.status === 404) throw new Error(tk('voice.hookMissing'));
    voiceState = await res.json();
  } catch (err) {
    voiceState = { error: err.message || tk('fin.err.server') };
  }
  renderVoiceSettings();
}
function renderVoiceSettings() {
  const box = document.getElementById('voiceSettingsBody');
  if (!box) return;
  const st = voiceState || {};
  if (st.error) { box.innerHTML = `<p class="text-xs text-red-500">${escapeHtml(st.error)}</p>`; return; }
  const examples = [tk('voice.addMilkEggsShopping'), tk('voice.addTwoPacksPasta'), tk('voice.whatsShoppingList'), tk('voice.remindMeTakeOut'), tk('voice.whatsToday')];
  const exHtml = `<div class="rounded-xl bg-ink/5 p-3"><p class="text-xs font-medium mb-1">${tk('voice.whatPinnUnderstands')}</p><div class="flex flex-col gap-0.5 text-[11px] text-ink/60">${examples.map(x => `<span>${escapeHtml(x)}</span>`).join('')}</div><p class="text-[11px] text-ink/45 mt-1.5">${tk('voice.alsoOtherLanguages')}</p></div>`;
  if (!st.aktiv) {
    box.innerHTML = `
      <p class="text-xs text-ink/60">${tk('voice.sayHeySiriPinn')}</p>
      ${exHtml}
      <button type="button" id="voiceSetupBtn" class="self-start px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90 transition">${tk('voice.setUpVoiceControl')}</button>
      ${st.kind ? ('<p class="text-[11px] text-ink/45">' + tk('voice.childLockListDaily') + '</p>') : ''}`;
    document.getElementById('voiceSetupBtn').addEventListener('click', () => voiceSetup(false));
    return;
  }
  const link = voiceLink(st.token);
  box.innerHTML = `
    <p class="text-xs text-ink/60">${tk('voice.personalLinkWorksLike')}</p>
    <div class="flex items-center gap-2">
      <input id="voiceLinkInput" type="text" readonly class="flex-1 min-w-0 rounded-lg border border-ink/15 px-3 py-2 text-xs bg-ink/5" value="${escapeHtml(link)}" />
      <button type="button" id="voiceCopyBtn" class="shrink-0 px-3 py-2 rounded-lg border border-ink/15 text-xs hover:border-pine hover:text-pine transition">${tk('common.copy')}</button>
    </div>
    <details class="rounded-xl border border-ink/10 bg-white p-3">
      <summary class="text-sm font-medium cursor-pointer">${escapeHtml(tk('voice.iosTitle'))}</summary>
      <ol class="text-[12px] text-ink/70 leading-relaxed mt-2 list-decimal pl-5 flex flex-col gap-1">
        <li>${tk('voice.ios1')}</li>
        <li>${tk('voice.ios2')}</li>
        <li>${tk('voice.ios3')}</li>
        <li>${tk('voice.ios4')}</li>
        <li>${tk('voice.ios5')}</li>
      </ol>
    </details>
    <details class="rounded-xl border border-ink/10 bg-white p-3">
      <summary class="text-sm font-medium cursor-pointer">🤖 Android</summary>
      <ol class="text-[12px] text-ink/70 leading-relaxed mt-2 list-decimal pl-5 flex flex-col gap-1">
        <li>${tk('voice.and1')}</li>
        <li>${tk('voice.and2', { var: escapeHtml(tk('voice.inputVar')), code: '<code class="text-[11px]">{"text": "{{' + escapeHtml(tk('voice.inputVar')) + '}}"}</code>' })}</li>
        <li>${tk('voice.and3')}</li>
      </ol>
    </details>
    <details class="rounded-xl border border-ink/10 bg-white p-3">
      <summary class="text-sm font-medium cursor-pointer">${escapeHtml(tk('voice.widgetTitle'))}</summary>
      <p class="text-[12px] text-ink/70 mt-2">${tk('voice.widgetIntro')}</p>
      <p class="text-[12px] font-medium mt-3">${escapeHtml(tk('voice.widgetIosTitle'))}</p>
      <ol class="text-[12px] text-ink/70 leading-relaxed mt-1 list-decimal pl-5 flex flex-col gap-1">
        <li>${tk('voice.widgetIos1')}</li>
        <li>${tk('voice.widgetIos2')}</li>
        <li>${tk('voice.widgetIos3')}</li>
      </ol>
      ${widgetPickHtml()}
      <button type="button" id="widgetScriptBtn" class="mt-2 px-3 py-1.5 rounded-lg border border-ink/15 text-xs hover:border-pine hover:text-pine transition">${tk('voice.widgetCopyScript')}</button>
      <p class="text-[11px] text-ink/50 mt-3">${escapeHtml(tk('voice.widgetQuickHint'))}</p>
      <button type="button" id="widgetQuickBtn" class="mt-2 px-3 py-1.5 rounded-lg border border-ink/15 text-xs hover:border-pine hover:text-pine transition">${tk('voice.widgetQuickCopy')}</button>
      <p class="text-[11px] text-ink/50 mt-2">${escapeHtml(tk('voice.widgetTick'))}</p>
      <p class="text-[12px] font-medium mt-4">${escapeHtml(tk('voice.widgetWatchTitle'))}</p>
      <ol class="text-[12px] text-ink/70 leading-relaxed mt-1 list-decimal pl-5 flex flex-col gap-1">
        <li>${tk('voice.widgetWatch1')}</li>
        <li>${tk('voice.widgetWatch2')}</li>
        <li>${tk('voice.widgetWatch3')}</li>
        <li>${tk('voice.widgetWatch4')}</li>
      </ol>
      <button type="button" id="widgetLinkBtn" class="mt-2 px-3 py-1.5 rounded-lg border border-ink/15 text-xs hover:border-pine hover:text-pine transition">${tk('voice.widgetCopyLink')}</button>
      <p class="text-[11px] text-ink/50 mt-2">${tk('voice.widgetViews')}</p>
      <p class="text-[11px] text-ink/45 mt-1">${escapeHtml(tk('voice.widgetNote'))}</p>
    </details>
    ${exHtml}
    <p class="text-[11px] text-ink/45">${escapeHtml(tk('voice.onTheGo'))}${st.kind ? ' ' + escapeHtml(tk('voice.childLockListDaily')) : ''}</p>
    <div class="flex flex-wrap gap-2">
      <button type="button" id="voiceTestBtn" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs hover:border-pine hover:text-pine transition">${tk('voice.try')}</button>
      <button type="button" id="voiceRenewBtn" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs hover:border-pine hover:text-pine transition">${tk('smart.newLink')}</button>
      <button type="button" id="voiceOffBtn" class="px-3 py-1.5 rounded-lg text-xs text-red-600 hover:bg-red-50 transition">${tk('smart.service.turnOff')}</button>
    </div>
    <p id="voiceTestOut" class="hidden text-xs rounded-lg bg-pine/10 text-pine px-3 py-2"></p>`;
  document.getElementById('voiceCopyBtn').addEventListener('click', async () => {
    const ok = await copyTextRobust(link);
    finShowToast(ok === false ? tk('voice.copyingNotPossiblePlease') : tk('voice.linkCopied'));
  });
  document.getElementById('widgetScriptBtn').addEventListener('click', async () => {
    const sel = widgetPickRead();
    if (!sel.cfg.events && !sel.cfg.tasks && !sel.cfg.household && !sel.cfg.house) { finShowToast(tk('voice.widgetNeedOne')); return; }
    widgetPickSave(sel.pick);
    const ok = await copyTextRobust(widgetScript(st.token, sel.cfg));
    finShowToast(ok === false ? tk('voice.copyingNotPossiblePlease') : tk('voice.widgetScriptCopied'));
  });
  document.getElementById('widgetQuickBtn').addEventListener('click', async () => {
    const ok = await copyTextRobust(widgetQuickScript());
    finShowToast(ok === false ? tk('voice.copyingNotPossiblePlease') : tk('voice.widgetScriptCopied'));
  });
  document.getElementById('widgetLinkBtn').addEventListener('click', async () => {
    const ok = await copyTextRobust(widgetLink(st.token, 'heute', true));
    finShowToast(ok === false ? tk('voice.copyingNotPossiblePlease') : tk('voice.linkCopied'));
  });
  document.getElementById('voiceRenewBtn').addEventListener('click', () => {
    if (confirm(tk('voice.createNewLinkOld'))) voiceSetup(true);
  });
  document.getElementById('voiceOffBtn').addEventListener('click', voiceOff);
  document.getElementById('voiceTestBtn').addEventListener('click', voiceTest);
}
async function voiceSetup(renew) {
  try {
    const res = await apiFetch('/api/pinn/sprache/einrichten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ neu: !!renew }) });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || tk('common.error'));
    voiceState = data;
    renderVoiceSettings();
    finShowToast(renew ? tk('voice.newLinkCreated') : tk('voice.voiceControlSetUp'));
  } catch (err) { alert((tk('voice.voiceControl') + ' ') + (err.message || tk('fin.err.server'))); }
}
async function voiceOff() {
  if (!confirm(tk('voice.turnOffVoiceControl'))) return;
  try {
    const res = await apiFetch('/api/pinn/sprache/ausschalten', { method: 'POST' });
    voiceState = await res.json();
    renderVoiceSettings();
  } catch (err) { alert((tk('voice.voiceControl') + ' ') + (err.message || tk('fin.err.server'))); }
}
async function voiceTest() {
  const text = prompt(tk('voice.whatWouldLikeSay'), tk('voice.whatsToday2'));
  if (!text) return;
  const out = document.getElementById('voiceTestOut');
  try {
    const res = await fetch(voiceLink(voiceState.token) + '&json=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    const data = await res.json();
    out.textContent = '🗣️ ' + (data.antwort || data.error || '–');
    out.classList.remove('hidden');
    // Changes (list, tasks) reach all devices through the normal sync
  } catch (err) {
    out.textContent = '⚠️ ' + (err.message || tk('fin.err.server'));
    out.classList.remove('hidden');
  }
}
document.addEventListener('toggle', (e) => {
  if (e.target && e.target.id === 'settingsVoiceAccordion' && e.target.open) loadVoiceSettings();
}, true);

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('sprachsteuerung');

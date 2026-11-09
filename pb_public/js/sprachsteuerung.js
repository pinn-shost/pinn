/* pinn. – Voice control (js/sprachsteuerung.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: Settings → Voice control – load and show the personal secret link (loadVoiceSettings,
   renderVoiceSettings), create or renew it, switch it off and try a sentence (voiceSetup, voiceOff, voiceTest).
   Since 1.141.0 the widget script is modular: tick boxes for events, tasks, household tasks and every shopping list; tapping a task or
   item in the widget ticks it off in pinn. as well (server: POST /api/pinn/widget/abhaken).
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
// Since 1.141.0 modular: cfg = { events, tasks, household, lists: [{ id, name }] } decides what the widget shows
// (one script per widget). Tapping a task or shopping item in a medium or large widget ticks it off in pinn. as well:
// iOS opens Scriptable for a moment, the script sends the tick (POST /api/pinn/widget/abhaken) and shows the result.
function widgetScript(token, cfg) {
  const c = cfg || {};
  const conf = {
    events: !!c.events, tasks: !!c.tasks, household: !!c.household,
    lists: (Array.isArray(c.lists) ? c.lists : []).map(l => ({ id: String(l.id), name: String(l.name || '') })),
  };
  const tpl = String.raw`// pinn. widget for Scriptable (made in pinn.: Settings > Voice control > Widgets). One script = one widget.
const BASE = __BASE__;
const TOKEN = __TOKEN__;
const CFG = __CFG__;
const API = BASE + "/api/pinn/widget?token=" + TOKEN + "&ansicht=alles";
const TICK = BASE + "/api/pinn/widget/abhaken?token=" + TOKEN;
const q = (args && args.queryParameters) || {};
let note = "";
// 1. Tap on a task or item: tick it off in pinn. (k = t task / s shopping item, i = id, d = 1 ticked / 0 open)
if (q.k && q.i) {
  try {
    const r = new Request(TICK + "&art=" + (q.k === "t" ? "task" : "shop") + "&id=" + encodeURIComponent(q.i) + "&erledigt=" + (q.d === "0" ? "0" : "1"));
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
const tapUrl = (k, id, done) => base + (base.indexOf("?") >= 0 ? "&" : "?") + "k=" + k + "&i=" + encodeURIComponent(id) + "&d=" + (done ? 1 : 0);
// 3. Build the rows: { t: text, kind: head | row | done | more | foot, url }
const rows = [];
if (d && d.ok) {
  const day = d.days[0];
  if (CFG.events) {
    rows.push({ t: d.texts.events + " · " + day.label, kind: "head" });
    if (!day.events.length) rows.push({ t: d.texts.none, kind: "more" });
    day.events.forEach(e => rows.push({ t: (e.time ? e.time + " " : "") + e.title, kind: "row" }));
  }
  if (CFG.tasks || CFG.household) {
    const list = (d.tasks || []).filter(t => (t.household ? CFG.household : CFG.tasks));
    rows.push({ t: (CFG.tasks ? d.texts.tasks : d.texts.household) + " (" + list.length + ")", kind: "head" });
    if (!list.length) rows.push({ t: d.texts.none, kind: "more" });
    list.forEach(t => rows.push({ t: "\u2610 " + t.title, kind: "row", url: tappable ? tapUrl("t", t.id, true) : "" }));
  }
  CFG.lists.forEach(cl => {
    const l = (d.lists || []).find(x => x.id === cl.id);
    rows.push({ t: "\uD83D\uDED2 " + (cl.name || (l && l.name) || d.texts.shop) + " (" + (l ? l.count : 0) + ")", kind: "head" });
    if (!l || !l.items.length) rows.push({ t: d.texts.empty, kind: "more" });
    else {
      l.items.forEach(x => rows.push(x.done
        ? { t: "\u2611 " + x.text, kind: "done", url: tappable ? tapUrl("s", x.id, false) : "" }
        : { t: "\u2610 " + x.text, kind: "row", url: tappable ? tapUrl("s", x.id, true) : "" }));
      if (l.more) rows.push({ t: l.more, kind: "more" });
      // Finishing the shopping (booking the amount) is done in pinn. itself
      if (l.doneCount && !lock && !small) rows.push({ t: "\u2714 " + d.texts.finish, kind: "foot", url: BASE });
    }
  });
}
// 4. Draw the widget
const w = new ListWidget();
w.backgroundColor = new Color("#00374A");
w.setPadding(10, 12, 10, 12);
w.url = BASE;
function line(r) {
  const t = w.addText(String(r.t));
  const head = r.kind === "head" || r.kind === "foot";
  t.font = head ? Font.boldSystemFont(small || lock ? 11 : 12) : Font.systemFont(small || lock ? 11 : 12);
  t.textColor = new Color(head ? "#9ee6c9" : (r.kind === "done" ? "#7fa3ad" : (r.kind === "more" ? "#b6cdd3" : "#ffffff")));
  t.lineLimit = 1;
  if (r.url) t.url = r.url;
  return t;
}
if (!d || !d.ok) {
  line({ t: "pinn.", kind: "head" });
  line({ t: (d && d.error) || "No connection", kind: "more" });
} else if (lock) {
  const body = rows.filter(r => r.kind === "row" || r.kind === "done");
  const max = fam === "accessoryRectangular" ? 3 : 1;
  (body.length ? body : rows).slice(0, max).forEach(line);
} else {
  const max = fam === "large" ? 14 : (small ? 6 : (fam === "medium" ? 6 : 12));
  rows.slice(0, max).forEach((r, i) => { if (i && r.kind === "head") w.addSpacer(3); line(r); });
  if (rows.length > max) line({ t: "…", kind: "more" });
}
if (note) { w.addSpacer(2); line({ t: "⚠ " + note, kind: "more" }); }
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
if (config.runsInWidget) Script.setWidget(w);
else if (q.k) await w.presentLarge();
else await w.presentMedium();
Script.complete();
`;
  return tpl
    .replace('__BASE__', () => JSON.stringify(location.origin))
    .replace('__TOKEN__', () => JSON.stringify(token))
    .replace('__CFG__', () => JSON.stringify(conf));
}
// What the widget should show: stored on this device, so every profile / phone keeps its own choice
const WIDGET_PICK_KEY = 'pinnWidgetPick';
function widgetPick() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(WIDGET_PICK_KEY) || 'null'); } catch (e) { p = null; }
  if (!p || typeof p !== 'object') p = { events: true, tasks: true, household: false, lists: [] };
  p.lists = Array.isArray(p.lists) ? p.lists : [];
  return p;
}
function widgetPickSave(p) { try { localStorage.setItem(WIDGET_PICK_KEY, JSON.stringify(p)); } catch (e) { /* storage not available */ } }
// Shopping lists of the family (id + name) for the tick boxes
function widgetShoppingLists() {
  try { return (typeof allShoppingLists === 'function' ? allShoppingLists() : []).filter(l => l && l.id).map(l => ({ id: String(l.id), name: String(l.name || '') })); } catch (e) { return []; }
}
function widgetPickHtml() {
  const p = widgetPick();
  const box = (id, on, label, cls, data) => `<label class="flex items-center gap-2 text-[12px] text-ink/80"><input type="checkbox"${id ? ' id="' + id + '"' : ''} class="accent-pine ${cls || ''}"${data || ''}${on ? ' checked' : ''} /><span>${label}</span></label>`;
  const lists = widgetShoppingLists().map(l => box('', p.lists.indexOf(l.id) >= 0, '🛒 ' + escapeHtml(tk('voice.widgetList', { name: l.name })), 'wgList', ' data-id="' + escapeHtml(l.id) + '" data-name="' + escapeHtml(l.name) + '"')).join('');
  return `<div class="rounded-lg bg-ink/5 p-3 mt-3 flex flex-col gap-1.5">
        <p class="text-[12px] font-medium">${escapeHtml(tk('voice.widgetPick'))}</p>
        ${box('wgEvents', p.events, escapeHtml(tk('voice.widgetEvents')))}
        ${box('wgTasks', p.tasks, escapeHtml(tk('voice.widgetTasks')))}
        ${box('wgHousehold', p.household, escapeHtml(tk('voice.widgetHousehold')))}
        ${lists}
      </div>`;
}
function widgetPickRead() {
  const p = {
    events: !!(document.getElementById('wgEvents') || {}).checked,
    tasks: !!(document.getElementById('wgTasks') || {}).checked,
    household: !!(document.getElementById('wgHousehold') || {}).checked,
    lists: [],
  };
  const chosen = [];
  document.querySelectorAll('.wgList').forEach(el => { if (el.checked) { p.lists.push(el.dataset.id); chosen.push({ id: el.dataset.id, name: el.dataset.name || '' }); } });
  return { pick: p, cfg: { events: p.events, tasks: p.tasks, household: p.household, lists: chosen } };
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
    <details class="rounded-xl border border-ink/10 bg-white p-3" open>
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
    if (!sel.cfg.events && !sel.cfg.tasks && !sel.cfg.household && !sel.cfg.lists.length) { finShowToast(tk('voice.widgetNeedOne')); return; }
    widgetPickSave(sel.pick);
    const ok = await copyTextRobust(widgetScript(st.token, sel.cfg));
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

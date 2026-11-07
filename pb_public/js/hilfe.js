/* pinn. – Help & tutorial (js/hilfe.js, since 1.124.0)
   Classic script, no build step: all top-level names share one global scope with the other files in js/.
   Loaded after js/hinweise.js and before js/ausblick.js (which starts the app).
   Contents:
   - the help page (hlpOpen / hlpClose): one chapter per menu, each as a quick run-through and as a detailed
     explanation; the texts live in pb_public/i18n/<code>.i18n.js under help.* (every language)
   - the first-steps tutorial (hlpTourOpen …): starts once for a new profile, can be restarted under
     Settings → Help & tutorial
   - the search source for the global search (hlpSearch, called by gsCollect in js/listen.js): help topics are
     shown in their own group below the user's own entries
   Everything is built from DOM nodes with textContent – no text is ever inserted as markup. */

/* ==========================================================
   Chapters (one per menu). detail texts: one line per topic, "Title::Text"
   ========================================================== */
const HLP_CHAPTERS = [
  { id: 'uebersicht', view: 'uebersicht', icon: '🏠', title: 'nav.overview', quick: 'help.ch.uebersicht.quick', detail: 'help.ch.uebersicht.detail' },
  { id: 'pinnwand', view: 'pinnwand', icon: '📌', title: 'nav.board', quick: 'help.ch.pinnwand.quick', detail: 'help.ch.pinnwand.detail' },
  { id: 'termine', view: 'termine', icon: '📅', title: 'nav.calendar', quick: 'help.ch.termine.quick', detail: 'help.ch.termine.detail' },
  { id: 'rezepte', view: 'rezepte', icon: '🍽', title: 'nav.recipes', quick: 'help.ch.rezepte.quick', detail: 'help.ch.rezepte.detail' },
  { id: 'vorrat', view: 'vorrat', icon: '🥫', title: 'nav.pantry', quick: 'help.ch.vorrat.quick', detail: 'help.ch.vorrat.detail' },
  { id: 'einkauf', view: 'einkauf', icon: '📝', title: 'nav.lists', quick: 'help.ch.einkauf.quick', detail: 'help.ch.einkauf.detail' },
  { id: 'aufgaben', view: 'aufgaben', icon: '✅', title: 'nav.tasks', quick: 'help.ch.aufgaben.quick', detail: 'help.ch.aufgaben.detail' },
  { id: 'familie', view: 'familie', icon: 'fam', title: 'nav.family', quick: 'help.ch.familie.quick', detail: 'help.ch.familie.detail' },
  { id: 'finanzen', view: 'finanzen', icon: '💶', title: 'nav.finance', quick: 'help.ch.finanzen.quick', detail: 'help.ch.finanzen.detail' },
  { id: 'dokumente', view: 'dokumente', icon: '🗂️', title: 'nav.documents', quick: 'help.ch.dokumente.quick', detail: 'help.ch.dokumente.detail' },
  { id: 'fahrzeuge', view: 'fahrzeuge', icon: '🚗', title: 'nav.vehicles', quick: 'help.ch.fahrzeuge.quick', detail: 'help.ch.fahrzeuge.detail' },
  { id: 'haus', view: 'haus', icon: '🏡', title: 'nav.home', quick: 'help.ch.haus.quick', detail: 'help.ch.haus.detail' },
  { id: 'suche', view: null, icon: '🔍', title: 'help.ch.suche.title', quick: 'help.ch.suche.quick', detail: 'help.ch.suche.detail' },
  { id: 'konto', view: 'konto', icon: '👤', title: 'nav.account', quick: 'help.ch.konto.quick', detail: 'help.ch.konto.detail' },
  { id: 'einstellungen', view: 'einstellungen', icon: '⚙️', title: 'nav.settings', quick: 'help.ch.einstellungen.quick', detail: 'help.ch.einstellungen.detail' },
];

// Tutorial steps: the page that is shown behind the card (null = stay where you are);
// menu: true = the side menu is opened behind the card for this step (and closed again afterwards)
const HLP_TOUR_STEPS = [
  { icon: '👋', view: 'uebersicht', title: 'help.tour.s1.title', text: 'help.tour.s1.text' },
  { icon: '🧭', view: null, menu: true, title: 'help.tour.s2.title', text: 'help.tour.s2.text' },
  { icon: '🏠', view: 'uebersicht', title: 'help.tour.s3.title', text: 'help.tour.s3.text' },
  { icon: '📅', view: 'termine', title: 'help.tour.s4.title', text: 'help.tour.s4.text' },
  { icon: '🍽', view: 'rezepte', title: 'help.tour.s5.title', text: 'help.tour.s5.text' },
  { icon: '🔍', view: null, title: 'help.tour.s6.title', text: 'help.tour.s6.text' },
  { icon: '⚙️', view: 'einstellungen', title: 'help.tour.s7.title', text: 'help.tour.s7.text' },
];

const HLP_MODE_KEY = 'pinn.hilfe.modus';
const HLP_TOUR_KEY = 'pinn.hilfe.tour.';
// A profile counts as new for this long after it was created – older profiles are never interrupted by the tutorial
const HLP_NEW_PROFILE_DAYS = 14;

let hlpMode = 'quick';
let hlpOpenState = false;
let hlpTourIndex = -1;
let hlpTourSteps = [];
let hlpTourMenuOpened = false; // the tutorial itself opened the side menu

/* ---------- small helpers ---------- */
function hlpEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}
function hlpStoreGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function hlpStoreSet(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* storage not available */ } }
function hlpChapterIcon(c) { return c.icon === 'fam' ? PINN_I18N.famIcon() : c.icon; }
function hlpChapterTitle(c) { return tk(c.title); }
function hlpAllowed(view) { return !view || typeof isViewAllowed !== 'function' || isViewAllowed(view); }
// Chapters the current profile may see (guests and the child lock hide some menus)
function hlpChapters() { return HLP_CHAPTERS.filter(c => hlpAllowed(c.view)); }
// quick text: one step per line
function hlpQuickLines(c) { return tk(c.quick).split('\n').map(s => s.trim()).filter(Boolean); }
// detailed text: one topic per line, "Title::Text"
function hlpDetailItems(c) {
  return tk(c.detail).split('\n').map(s => s.trim()).filter(Boolean).map(line => {
    const i = line.indexOf('::');
    return i < 0 ? { t: '', d: line } : { t: line.slice(0, i).trim(), d: line.slice(i + 2).trim() };
  });
}

/* ==========================================================
   Help page
   ========================================================== */
function hlpBuildChapter(c, open) {
  const det = hlpEl('details', 'hlp-ch');
  det.id = 'hlpCh-' + c.id;
  if (open) det.open = true;
  const sum = hlpEl('summary', 'hlp-sum');
  sum.appendChild(hlpEl('span', 'hlp-ico', hlpChapterIcon(c)));
  sum.appendChild(hlpEl('span', 'hlp-ch-title', hlpChapterTitle(c)));
  sum.appendChild(hlpEl('span', 'hlp-chev', '›'));
  det.appendChild(sum);

  const body = hlpEl('div', 'hlp-ch-body');
  if (hlpMode === 'quick') {
    const ol = hlpEl('ol', 'hlp-quick');
    hlpQuickLines(c).forEach(line => ol.appendChild(hlpEl('li', '', line)));
    body.appendChild(ol);
    const more = hlpEl('button', 'hlp-link', tk('help.mode.detail') + ' ›');
    more.type = 'button';
    more.addEventListener('click', () => hlpOpen({ chapter: c.id, mode: 'detail' }));
    body.appendChild(more);
  } else {
    const wrap = hlpEl('div', 'hlp-detail');
    hlpDetailItems(c).forEach((it, i) => {
      const item = hlpEl('div', 'hlp-item');
      item.id = 'hlpIt-' + c.id + '-' + i;
      if (it.t) item.appendChild(hlpEl('h4', 'hlp-item-title', it.t));
      item.appendChild(hlpEl('p', 'hlp-item-text', it.d));
      wrap.appendChild(item);
    });
    body.appendChild(wrap);
  }
  if (c.view) {
    const go = hlpEl('button', 'hlp-go', tk('help.openPage'));
    go.type = 'button';
    go.addEventListener('click', () => { hlpClose(); setView(c.view); });
    body.appendChild(go);
  }
  det.appendChild(body);
  return det;
}

function hlpRender(openChapter) {
  const body = document.getElementById('hlpBody');
  if (!body) return;
  body.textContent = '';
  body.appendChild(hlpEl('p', 'hlp-intro', tk('help.intro')));
  hlpChapters().forEach(c => body.appendChild(hlpBuildChapter(c, c.id === openChapter)));
  document.getElementById('hlpModeQuick').classList.toggle('hlp-on', hlpMode === 'quick');
  document.getElementById('hlpModeDetail').classList.toggle('hlp-on', hlpMode === 'detail');
}

// opts: { chapter: id to open, item: index of the topic to scroll to, mode: 'quick' | 'detail' }
function hlpOpen(opts) {
  opts = opts || {};
  if (typeof closeGlobalSearch === 'function') closeGlobalSearch();
  if (typeof setSidebar === 'function') setSidebar(false);
  if (hlpTourIndex >= 0) hlpTourClose(false);
  if (opts.mode === 'quick' || opts.mode === 'detail') {
    hlpMode = opts.mode;
    hlpStoreSet(HLP_MODE_KEY, hlpMode);
  }
  const overlay = document.getElementById('hlpOverlay');
  hlpRender(opts.chapter);
  overlay.classList.remove('hidden');
  hlpOpenState = true;
  document.body.classList.add('hlp-open');
  const body = document.getElementById('hlpBody');
  body.scrollTop = 0;
  if (opts.chapter) {
    const target = opts.item != null ? document.getElementById('hlpIt-' + opts.chapter + '-' + opts.item) : document.getElementById('hlpCh-' + opts.chapter);
    if (target) setTimeout(() => { try { target.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { target.scrollIntoView(); } }, 60);
  }
}
function hlpClose() {
  if (!hlpOpenState) return;
  hlpOpenState = false;
  document.getElementById('hlpOverlay').classList.add('hidden');
  document.body.classList.remove('hlp-open');
}
function hlpSetMode(mode) {
  hlpMode = mode === 'detail' ? 'detail' : 'quick';
  hlpStoreSet(HLP_MODE_KEY, hlpMode);
  // keep the chapters that are open
  const openIds = Array.from(document.querySelectorAll('#hlpBody details.hlp-ch[open]')).map(d => d.id.replace('hlpCh-', ''));
  hlpRender(null);
  openIds.forEach(id => { const d = document.getElementById('hlpCh-' + id); if (d) d.open = true; });
}

/* ==========================================================
   Tutorial (first steps)
   ========================================================== */
function hlpTourKeyFor(uid) { return HLP_TOUR_KEY + uid; }
function hlpTourMarkSeen() {
  const u = typeof currentUser === 'function' ? currentUser() : null;
  if (u && u.id) hlpStoreSet(hlpTourKeyFor(u.id), '1');
}

function hlpTourRender() {
  const step = hlpTourSteps[hlpTourIndex];
  if (!step) return;
  const total = hlpTourSteps.length;
  const last = hlpTourIndex === total - 1;
  document.getElementById('hlpTourIcon').textContent = step.icon;
  document.getElementById('hlpTourTitle').textContent = tk(step.title);
  document.getElementById('hlpTourText').textContent = tk(step.text);
  document.getElementById('hlpTourProgress').textContent = tk('help.tour.progress', { n: hlpTourIndex + 1, total });
  document.getElementById('hlpTourBack').classList.toggle('hlp-inv', hlpTourIndex === 0);
  document.getElementById('hlpTourNext').textContent = last ? tk('help.tour.finish') : tk('help.tour.next');
  document.getElementById('hlpTourSkip').classList.toggle('hidden', last);
  document.getElementById('hlpTourShow').classList.toggle('hidden', !step.view);
  const dots = document.getElementById('hlpTourDots');
  dots.textContent = '';
  hlpTourSteps.forEach((s, i) => dots.appendChild(hlpEl('span', 'hlp-dot' + (i === hlpTourIndex ? ' hlp-dot-on' : ''))));
  // The page behind the card shows what the step is about
  if (step.view && typeof currentView !== 'undefined' && currentView !== step.view) {
    try { setView(step.view); } catch (e) { /* the page is not available right now */ }
  }
  // The menu step shows the opened side menu (same on phone, tablet and computer); every other step closes it again
  const wantMenu = !!step.menu;
  if (typeof setSidebar === 'function' && (wantMenu || hlpTourMenuOpened)) {
    try { setSidebar(wantMenu); } catch (e) { /* the menu is not available right now */ }
    hlpTourMenuOpened = wantMenu;
  }
  document.getElementById('hlpTour').classList.toggle('hlp-tour-menu', wantMenu);
}

function hlpTourOpen(index) {
  if (typeof closeGlobalSearch === 'function') closeGlobalSearch();
  if (typeof setSidebar === 'function') setSidebar(false);
  hlpClose();
  // Pages the profile may not open (guest, child lock) are left out
  hlpTourSteps = HLP_TOUR_STEPS.filter(s => hlpAllowed(s.view));
  hlpTourIndex = Math.max(0, Math.min(index || 0, hlpTourSteps.length - 1));
  document.getElementById('hlpTour').classList.remove('hidden');
  document.body.classList.add('hlp-open');
  hlpTourRender();
}
// done: true = the tutorial counts as seen (finished, skipped or left on a page)
function hlpTourClose(done) {
  if (hlpTourIndex < 0) return;
  hlpTourIndex = -1;
  if (hlpTourMenuOpened) {
    hlpTourMenuOpened = false;
    try { if (typeof setSidebar === 'function') setSidebar(false); } catch (e) { /* ignore */ }
  }
  document.getElementById('hlpTour').classList.remove('hlp-tour-menu');
  document.getElementById('hlpTour').classList.add('hidden');
  if (!hlpOpenState) document.body.classList.remove('hlp-open');
  if (done) hlpTourMarkSeen();
}
function hlpTourStep(delta) {
  const next = hlpTourIndex + delta;
  if (next < 0) return;
  if (next >= hlpTourSteps.length) {
    hlpTourClose(true);
    if (typeof setView === 'function') setView('uebersicht');
    return;
  }
  hlpTourIndex = next;
  hlpTourRender();
}

// Called once after the app has started: only profiles that were created recently see the tutorial on their own
function hlpTourMaybeStart() {
  try {
    if (typeof isCurrentUserGuest === 'function' && isCurrentUserGuest()) return;
    if (typeof isDashboardSession === 'function' && isDashboardSession()) return;
    if (typeof isDashboardDevice === 'function' && isDashboardDevice()) return;
    if (typeof kidsOnlyActive === 'function' && kidsOnlyActive()) return; // kids' page only: no tour
    const u = typeof currentUser === 'function' ? currentUser() : null;
    if (!u || !u.id) return;
    const key = hlpTourKeyFor(u.id);
    if (hlpStoreGet(key)) return;
    // PocketBase writes "2026-11-03 12:00:00.000Z" – Safari needs the "T"
    const created = Date.parse(String(u.created || '').replace(' ', 'T'));
    if (!created || Date.now() - created > HLP_NEW_PROFILE_DAYS * 86400000) { hlpStoreSet(key, 'old'); return; }
    hlpTourOpen(0);
  } catch (e) { /* the tutorial is optional */ }
}

/* ==========================================================
   Search source (see gsCollect in js/listen.js)
   Returns at most HLP_SEARCH_MAX hits, best first. They are shown in their own group below the user's entries.
   ========================================================== */
const HLP_SEARCH_MAX = 5;
function hlpSearch(words, qn) {
  if (!qn || qn.length < 2 || typeof gsScore !== 'function') return [];
  const out = [];
  const typeLabel = tk('search.type.help');
  const add = (score, order, title, sub, icon, run) => {
    if (score < 0) return;
    // a match only in the description needs a longer search term
    if (score >= 6 && qn.length < 3) return;
    out.push({ type: 'help', group: 'help', icon, typeLabel, title, sub, score, order, tie: 0, run });
  };
  hlpChapters().forEach((c, ci) => {
    const title = hlpChapterTitle(c);
    const icon = hlpChapterIcon(c);
    add(gsScore(title, hlpQuickLines(c).join(' '), words, qn, ''), ci * 100, title, '', icon,
      () => hlpOpen({ chapter: c.id }));
    hlpDetailItems(c).forEach((it, ii) => {
      if (!it.t) return;
      add(gsScore(it.t, it.d + ' ' + title, words, qn, ''), ci * 100 + ii + 1, it.t, title, icon,
        () => hlpOpen({ chapter: c.id, item: ii, mode: 'detail' }));
    });
  });
  // The tutorial itself
  add(gsScore(tk('help.tourStart'), 'tutorial', words, qn, ''), 9999, tk('help.tourStart'), '', '🧭', () => hlpTourOpen(0));
  out.sort((a, b) => a.score - b.score || a.order - b.order);
  return out.slice(0, HLP_SEARCH_MAX);
}

/* ==========================================================
   Wiring
   ========================================================== */
(function initHelp() {
  const saved = hlpStoreGet(HLP_MODE_KEY);
  if (saved === 'detail' || saved === 'quick') hlpMode = saved;
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  on('hlpClose', hlpClose);
  on('hlpModeQuick', () => hlpSetMode('quick'));
  on('hlpModeDetail', () => hlpSetMode('detail'));
  on('hlpTourBtn', () => hlpTourOpen(0));
  on('hlpOpenBtn', () => hlpOpen({}));
  on('hlpTourStartBtn', () => hlpTourOpen(0));
  on('hlpTourNext', () => hlpTourStep(1));
  on('hlpTourBack', () => hlpTourStep(-1));
  on('hlpTourSkip', () => hlpTourClose(true));
  on('hlpTourShow', () => hlpTourClose(true)); // "Pause": hide the card and stay on the page behind it
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (hlpTourIndex >= 0) { hlpTourClose(true); return; }
    if (hlpOpenState) hlpClose();
  });
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('hilfe');

/* pinn. – Shortcuts tile on the overview (js/kurzbefehle.js, since 1.150.0)
   Part of the pinn. web app (pb_public/index.html). Classic script, no build step: all top-level names share
   one global scope with the other files in js/ (prefix kz…, CSS classes kz-…).

   A tile on the overview with app-like icons that open a function directly (drink, wash hands, enter an
   expense …). The apps are chosen per profile under Settings → Overview → Shortcuts (kzEnabled, stored with the
   personal design as ovShortcuts). The tile only appears while at least one app is chosen and available.
   Long press on an app opens its quick window (js/kurzfenster.js, since 1.150.0).
   Every app: id, group, colours (two shades for the icon background), glyph (SVG paths, stroke style), label key,
   which view it belongs to (for rights: guests, child lock), optional badge text and the action (run).
   New app: one row in KZ_APPS + the label key shortcut.app.<id> in all i18n files. */

var kzEnabled = [];
var KZ_LONG_PRESS_MS = 450;

// Glyphs: 24 x 24, white strokes (css/kurzbefehle.css)
var KZ_APPS = [
  { id: 'trinken', group: 'health', c: ['#4FB6EA', '#1F7FC4'], view: 'familie', health: true,
    g: '<path d="M12 3.5C12 3.5 6 10 6 14a6 6 0 0 0 12 0c0-4-6-10.5-6-10.5z"/><path d="M9.5 15a2.5 2.5 0 0 0 2 2.2"/>' },
  { id: 'haende', group: 'health', c: ['#3FD0B8', '#128F88'], view: 'familie', health: true,
    g: '<circle cx="9" cy="14" r="5"/><circle cx="17" cy="8" r="2.5"/><circle cx="18.5" cy="16.5" r="1.5"/>' },
  { id: 'medikamente', group: 'health', c: ['#F27C8E', '#C73A55'], view: 'familie', health: true,
    g: '<g transform="rotate(-40 12 12)"><rect x="3" y="8.5" width="18" height="7" rx="3.5"/><path d="M12 8.5v7"/></g>' },
  { id: 'einkauf', group: 'everyday', c: ['#FFA659', '#E0701F'], view: 'einkauf',
    g: '<path d="M3 4h2.5l2.2 10.5h9.6L19.5 8H6.2"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>' },
  { id: 'aufgabe', group: 'everyday', c: ['#6CC184', '#2F8E4E'], view: 'aufgaben',
    g: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>' },
  { id: 'termin', group: 'everyday', c: ['#7F8CF0', '#4452C8'], view: 'termine',
    g: '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M12 13v4M10 15h4"/>' },
  { id: 'kochen', group: 'everyday', c: ['#F58A66', '#CC4B25'], view: 'rezepte',
    g: '<path d="M4 11h16v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M3 11h18M9 7c0-1.5 1.5-1.5 1.5-3M14 7c0-1.5 1.5-1.5 1.5-3"/>' },
  { id: 'zettel', group: 'everyday', c: ['#F4CB55', '#CC9A12'], view: 'pinnwand',
    g: '<path d="M9 4h6l-1 5 3 3H7l3-3z"/><path d="M12 12v8"/>' },
  { id: 'chat', group: 'everyday', c: ['#56BDF0', '#2582C9'], view: 'chat',
    g: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>' },
  { id: 'putzplan', group: 'home', c: ['#5CCAD8', '#228C9C'], view: 'aufgaben',
    g: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>' },
  { id: 'pflanzen', group: 'home', c: ['#78C657', '#3A8F2A'], view: 'haus',
    g: '<path d="M12 20v-8"/><path d="M12 12c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5zM12 15c0-3-2.2-5-5.5-5 0 3 2.2 5 5.5 5z"/>' },
  { id: 'haustier', group: 'home', c: ['#C9935A', '#8F5E2B'], view: 'familie',
    g: '<ellipse cx="12" cy="16" rx="4.2" ry="3.4"/><circle cx="6.5" cy="11" r="1.8"/><circle cx="10" cy="7" r="1.8"/><circle cx="14" cy="7" r="1.8"/><circle cx="17.5" cy="11" r="1.8"/>' },
  { id: 'vorrat', group: 'home', c: ['#A98BE0', '#6A47B5'], view: 'vorrat',
    g: '<path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9"/>' },
  { id: 'ausgabe', group: 'finance', c: ['#F0706B', '#C23631'], view: 'finanzen', finance: true,
    g: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7"/>' },
  { id: 'einnahme', group: 'finance', c: ['#4FC58A', '#1F8F55'], view: 'finanzen', finance: true,
    g: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7M12 8.5v7"/>' },
  { id: 'finanzen', group: 'finance', c: ['#4F9F9A', '#256C68'], view: 'finanzen', finance: true,
    g: '<path d="M4 18V9M10 18V5M16 18v-7M21 20H3"/>' },
  { id: 'sos', group: 'safety', c: ['#F05A55', '#B8191B'], view: 'familie', notGuest: true,
    g: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>' },
  { id: 'unterwegs', group: 'safety', c: ['#5C98E8', '#2D63B8'], view: 'familie', notGuest: true,
    g: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>' },
];
var KZ_GROUPS = ['health', 'everyday', 'home', 'finance', 'safety'];

function kzApp(id) { return KZ_APPS.find(a => a.id === id); }
function kzApplyPrefs(list) {
  kzEnabled = Array.isArray(list) ? list.filter((id, i, a) => kzApp(id) && a.indexOf(id) === i) : [];
}
// Can this app be used by the signed-in profile right now? (guests, child lock, finances not loaded …)
function kzAvailable(a) {
  try {
    if ((a.health || a.notGuest) && isCurrentUserGuest()) return false;
    if (a.finance && !(typeof finance !== 'undefined' && finance)) return false;
    return isViewAllowed(a.view);
  } catch (e) { return false; }
}
function kzActiveApps() { return KZ_APPS.filter(a => kzEnabled.includes(a.id) && kzAvailable(a)); }
// Order on the tile = order of the list above
function kzIconHtml(a, small) {
  return `<span class="kz-ico${small ? ' sm' : ''}" style="--kz-a:${a.c[0]};--kz-b:${a.c[1]}"><svg viewBox="0 0 24 24" aria-hidden="true">${a.g}</svg></span>`;
}
function kzLabel(a) { return tk('shortcut.app.' + a.id); }

/* ---------- Small numbers under the icons ---------- */
function kzHealthData() {
  const me = ghState && ghState.me;
  if (!me || !ghState.people || !ghState.people[me]) return null;
  const p = ghState.people[me];
  return { id: me, d: ghNorm(p.daten, p.kind) };
}
function kzBadge(a) {
  try {
    if (a.id === 'trinken' || a.id === 'haende' || a.id === 'medikamente') {
      if (typeof ghEnsureLoaded === 'function') ghEnsureLoaded();
      const h = kzHealthData();
      if (!h) return '';
      if (a.id === 'trinken') return tk('shortcut.sub.drink', { ml: ghNum(ghDrinkTotal(h.d)), goal: ghNum(h.d.drink.goal) });
      if (a.id === 'haende') return tk('shortcut.sub.hands', { n: ghNum(Number(h.d.hands.log[ghToday()]) || 0) });
      const taken = h.d.meds.taken[ghToday()] || [];
      const open = ghMedSlots(h.d).filter(s => s.time && !taken.includes(s.key)).length;
      return h.d.meds.list.length ? tk('shortcut.sub.meds', { n: ghNum(open) }) : '';
    }
    if (a.id === 'einkauf') {
      const n = shoppingItems.filter(x => !x.done).length;
      return n ? tk('shortcut.sub.shop', { n }) : '';
    }
  } catch (e) { /* no number */ }
  return '';
}

/* ---------- Tile ---------- */
function renderShortcutsTile() {
  const body = document.getElementById('shortcutsTileBody');
  if (!body) return;
  const apps = kzActiveApps();
  body.innerHTML = `<div class="kz-grid">${apps.map(a => {
    const sub = kzBadge(a);
    return `<button type="button" class="kz-app" data-kz="${a.id}" aria-label="${escapeHtml(kzLabel(a))}">${kzIconHtml(a, false)}<span class="kz-name">${escapeHtml(kzLabel(a))}</span><span class="kz-sub">${sub ? escapeHtml(sub) : '&nbsp;'}</span></button>`;
  }).join('')}</div>`;
}

/* ---------- Settings → Overview → Shortcuts ---------- */
function kzRenderSettings() {
  const box = document.getElementById('kzSettingsList');
  if (!box) return;
  const guest = isCurrentUserGuest();
  box.innerHTML = KZ_GROUPS.map(g => {
    const rows = KZ_APPS.filter(a => a.group === g && !((a.health || a.notGuest) && guest)).map(a => {
      const on = kzEnabled.includes(a.id);
      return `<label class="kz-set-row${on ? '' : ' is-off'}">
        ${kzIconHtml(a, true)}
        <span class="kz-set-label">${escapeHtml(kzLabel(a))}</span>
        <span class="ov-set-switch"><input type="checkbox" data-kz-toggle="${a.id}" aria-label="${escapeHtml(kzLabel(a))}" ${on ? 'checked' : ''} /><span class="ov-track"></span><span class="ov-knob"></span></span>
      </label>`;
    }).join('');
    return rows ? `<h5 class="kz-set-group">${escapeHtml(tk('shortcut.group.' + g))}</h5>${rows}` : '';
  }).join('');
  const hint = document.getElementById('kzSettingsNone');
  if (hint) hint.classList.toggle('hidden', kzEnabled.length > 0);
}

/* ---------- Actions ---------- */
function kzGo(view, after) {
  if (currentView !== view) setView(view);
  if (typeof after === 'function') after();
}
async function kzHealthReady() {
  for (let i = 0; i < 40 && ghState.loading; i++) await new Promise(r => setTimeout(r, 150));
  if (!ghState.loaded || Date.now() - ghState.at > GH_STALE_MS) await ghLoad();
  return ghState.me && ghState.people[ghState.me] ? ghState.me : null;
}
async function kzCountHands() {
  const id = await kzHealthReady();
  if (!id) { finShowToast(tk('shortcut.unavailable'), true); return; }
  const day = ghToday();
  let count = 0;
  ghChange(id, (d) => {
    d.blocks.hands = true;
    d.hands.log[day] = (Number(d.hands.log[day]) || 0) + 1;
    count = d.hands.log[day];
  });
  finShowToast(tk('shortcut.handsDone', { n: ghNum(count) }));
  renderShortcutsTile();
}
function kzRun(id) {
  const a = kzApp(id);
  if (!a || !kzAvailable(a)) return;
  // The calls to the pop-ups stay inside this function (child lock: never hand them out directly)
  switch (id) {
    case 'trinken': ghOpenFromLink('trinken', ''); break;
    case 'medikamente': ghOpenFromLink('medikamente', ''); break;
    case 'haende': kzCountHands(); break;
    case 'einkauf': kzGo('einkauf'); break;
    case 'aufgabe': openTaskModal(); break;
    case 'termin': openAddEventModal(); break;
    case 'kochen': kzGo('rezepte'); break;
    case 'zettel': openPinboardEditor(null, 'note'); break;
    case 'chat': kzGo('chat'); break;
    case 'putzplan': kzGo('haushalt'); break;
    case 'pflanzen': hsOpen('garten'); break;
    case 'haustier': kzGo('familie', () => famSetTab('tiere')); break;
    case 'vorrat': kzGo('vorrat'); break;
    case 'ausgabe': openExpenseModal(); break;
    case 'einnahme': openExpenseModal({ preset: { amountText: '-' } }); break;
    case 'finanzen': kzGo('finanzen'); break;
    case 'sos': case 'unterwegs': kzGo('familie', () => famSetTab('ortung')); break;
  }
}

/* ---------- Wiring ---------- */
(function wireShortcuts() {
  const tile = document.getElementById('shortcutsTileBody');
  // Short tap = the function itself; long press (or right click) = a small window with its main actions
  // (js/kurzfenster.js). The tap that ends a long press must not start the function as well.
  let pressTimer = 0, pressAt = null, longDone = false;
  const cancelPress = () => { clearTimeout(pressTimer); pressTimer = 0; };
  if (tile) {
    tile.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-kz]');
      if (!b || (e.pointerType === 'mouse' && e.button !== 0)) return;
      longDone = false;
      pressAt = { x: e.clientX, y: e.clientY };
      cancelPress();
      pressTimer = setTimeout(() => {
        pressTimer = 0;
        longDone = true;
        try { if (navigator.vibrate) navigator.vibrate(15); } catch (err) { /* no vibration */ }
        kzSheetOpen(b.dataset.kz);
      }, KZ_LONG_PRESS_MS);
    });
    tile.addEventListener('pointermove', (e) => {
      if (pressTimer && pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 10) cancelPress();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => tile.addEventListener(n, cancelPress));
    tile.addEventListener('contextmenu', (e) => {
      const b = e.target.closest('[data-kz]');
      if (!b) return;
      e.preventDefault();
      longDone = true;
      kzSheetOpen(b.dataset.kz);
    });
    tile.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kz]');
      if (!b) return;
      if (longDone) { longDone = false; return; }
      kzRun(b.dataset.kz);
    });
  }
  const list = document.getElementById('kzSettingsList');
  if (list) list.addEventListener('change', (e) => {
    const box = e.target.closest('[data-kz-toggle]');
    if (!box) return;
    const id = box.dataset.kzToggle;
    kzEnabled = box.checked ? KZ_APPS.map(a => a.id).filter(x => x === id || kzEnabled.includes(x)) : kzEnabled.filter(x => x !== id);
    saveOverviewPrefs();
  });
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('kurzbefehle');

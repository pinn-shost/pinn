/* pinn. – Overview tile: birthdays (js/geburtstage.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: birthdays from the family's iCloud and Google contacts (loadBirthdays, cache), upcoming birthdays, hiding a birthday
   by swiping (hideBirthday, bundled keys) and the birthday tile (renderBirthdayTile). */

/* ---------- Tile: birthdays (the family's iCloud and Google contacts) ---------- */
const LS_BIRTHDAYS_PREFIX = 'pinn.geburtstage.';
const BIRTHDAY_RELOAD_MS = 6 * 60 * 60 * 1000;
let birthdayData = { geladen: false, eingerichtet: false, stand: '', liste: [], fehler: '', quellen: { apple: false, google: false }, anzahl: { apple: 0, google: 0 } };
let birthdayLoadedFor = null;
let birthdayLastFetch = 0;
let birthdayTileExpanded = false;

function birthdayCacheKey() {
  const u = currentUser();
  return u && u.familie ? LS_BIRTHDAYS_PREFIX + u.familie : '';
}
function normalizeBirthdayData(body) {
  const liste = Array.isArray(body && body.liste) ? body.liste.filter(b => b && typeof b.n === 'string' && b.m >= 1 && b.m <= 12 && b.d >= 1 && b.d <= 31) : [];
  return {
    geladen: true,
    eingerichtet: !!(body && body.eingerichtet),
    stand: String((body && body.stand) || ''),
    liste: liste.map(b => ({ n: b.n, m: Number(b.m), d: Number(b.d), y: b.y ? Number(b.y) : null, q: b.q === 'g' ? 'g' : 'a' })),
    fehler: String((body && body.fehler) || ''),
    quellen: {
      apple: !!(body && body.quellen ? body.quellen.apple : (body && body.eingerichtet)),
      google: !!(body && body.quellen && body.quellen.google),
    },
    anzahl: {
      apple: liste.filter(b => b.q !== 'g').length,
      google: liste.filter(b => b.q === 'g').length,
    },
  };
}
function writeBirthdayCache() {
  const k = birthdayCacheKey();
  if (!k) return;
  try { localStorage.setItem(k, JSON.stringify(birthdayData)); } catch (e) { /* full */ }
}
function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function birthdayInYear(y, m, d) {
  if (m === 2 && d === 29 && !isLeapYear(y)) return new Date(y, 1, 28);
  return new Date(y, m - 1, d);
}
// Birthdays from today up to "days" days ahead, next one first
function upcomingBirthdays(days) {
  if (!birthdayData || !birthdayData.eingerichtet || !Array.isArray(birthdayData.liste)) return [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = [];
  birthdayData.liste.forEach(b => {
    let next = birthdayInYear(today.getFullYear(), b.m, b.d);
    if (next < today) next = birthdayInYear(today.getFullYear() + 1, b.m, b.d);
    const diff = Math.round((next - today) / 86400000);
    if (diff <= days) out.push({ ...b, next, diff, age: b.y ? next.getFullYear() - b.y : null });
  });
  return out.sort((a, b) => (a.diff - b.diff) || a.n.localeCompare(b.n, 'de'));
}
// Short, stable key per contact (name + day + month) - for the list of hidden birthdays
function bdayKey(b) {
  const str = `${b.n}|${b.m}|${b.d}`;
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
// The server stores at most 30 texts of 300 characters per design value - so the keys are bundled
function bdayPackHidden() {
  const out = [];
  let cur = '';
  [...(overviewBdayHidden || [])].forEach(k => {
    if (cur && cur.length + k.length + 1 > 290) { out.push(cur); cur = ''; }
    cur += (cur ? ',' : '') + k;
  });
  if (cur) out.push(cur);
  return out.slice(0, 30);
}
function bdayUnpackHidden(v) {
  const set = new Set();
  (Array.isArray(v) ? v : []).forEach(x => String(x).split(',').forEach(k => {
    k = k.trim();
    if (/^[0-9a-z]{1,8}$/.test(k)) set.add(k);
  }));
  return set;
}
function isBirthdayHidden(b) { return !!overviewBdayHidden && overviewBdayHidden.has(bdayKey(b)); }
function visibleUpcomingBirthdays(days) { return upcomingBirthdays(days).filter(b => !isBirthdayHidden(b)); }
function hideBirthday(key) {
  if (!key) return;
  const wrap = document.querySelector(`#birthdayTileBody .ov-bday-swipe[data-bday-key="${key}"]`);
  const finish = () => {
    if (!overviewBdayHidden) overviewBdayHidden = new Set();
    overviewBdayHidden.add(key);
    saveOverviewPrefs();
  };
  if (!wrap) { finish(); return; }
  wrap.classList.add('is-gone');
  setTimeout(finish, 230);
}

function birthdayWhenText(diff) {
  if (diff === 0) return 'Heute 🎉';
  if (diff === 1) return 'Morgen';
  return `in ${diff} Tagen`;
}
function renderBirthdayTile() {
  const body = document.getElementById('birthdayTileBody');
  const range = document.getElementById('birthdayTileRange');
  if (!body || !range) return;
  range.textContent = `nächste ${overviewBdayDays} Tage`;
  if (!birthdayData.geladen) {
    body.innerHTML = '<p class="text-sm text-ink/40 italic">Geburtstage werden geladen …</p>';
    return;
  }
  if (!birthdayData.eingerichtet) {
    body.innerHTML = '<p class="text-sm text-ink/40 italic">Die Geburtstage kommen aus den iCloud- bzw. Google-Kontakten. Dafür muss ein Admin unter Einstellungen → Kalender eine Apple-ID hinterlegen oder ein Google-Konto verbinden.</p>';
    return;
  }
  const list = visibleUpcomingBirthdays(overviewBdayDays);
  if (!list.length) {
    body.innerHTML = `<p class="text-sm text-ink/40 italic">${birthdayData.fehler && !birthdayData.liste.length
      ? 'Die Kontakte konnten nicht geladen werden.'
      : `In den nächsten ${overviewBdayDays} Tagen hat niemand Geburtstag.`}</p>`;
    return;
  }
  const limit = birthdayTileExpanded ? list.length : 4;
  const rows = list.slice(0, limit).map(b => {
    const month = b.next.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '');
    const weekday = b.next.toLocaleDateString('de-DE', { weekday: 'long' });
    const sub = [weekday, b.age ? `wird ${b.age}` : ''].filter(Boolean).join(' · ');
    const key = bdayKey(b);
    return `
      <div class="ov-bday-swipe" data-bday-key="${key}">
        <button type="button" class="ov-bday-action" data-bday-hide="${key}">Ausblenden</button>
        <div class="ov-bday-row${b.diff === 0 ? ' is-today' : ''}">
          <div class="ov-bday-date"><b>${b.next.getDate()}</b><span>${escapeHtml(month)}</span></div>
          <div class="ov-bday-text">
            <div class="ov-bday-name">${escapeHtml(b.n)}</div>
            <div class="ov-bday-sub">${escapeHtml(sub)}</div>
          </div>
          <div class="ov-bday-when">${birthdayWhenText(b.diff)}</div>
          <button type="button" class="ov-bday-x" data-bday-hide="${key}" aria-label="Geburtstag ausblenden" title="Ausblenden">×</button>
        </div>
      </div>`;
  }).join('');
  const more = list.length > 4
    ? `<button type="button" class="ov-bday-more" data-bday-more="1">${birthdayTileExpanded ? 'Weniger anzeigen' : `+ ${list.length - limit} weitere`}</button>`
    : '';
  body.innerHTML = `<div class="ov-bday-list">${rows}${more}</div>`;
}
document.getElementById('birthdayTileBody').addEventListener('click', (e) => {
  const hide = e.target.closest('[data-bday-hide]');
  if (hide) { hideBirthday(hide.dataset.bdayHide); return; }
  if (!e.target.closest('[data-bday-more]')) return;
  birthdayTileExpanded = !birthdayTileExpanded;
  renderBirthdayTile();
});

// Like on the iPhone: swipe a row to the left -> „Ausblenden“ appears; swiping far hides it directly
(function attachBirthdaySwipe() {
  const box = document.getElementById('birthdayTileBody');
  const OPEN = 104;
  let row = null, wrap = null, sx = 0, sy = 0, base = 0, dx = 0, dir = null;
  const closeAll = (except) => box.querySelectorAll('.ov-bday-swipe.is-open').forEach(w => {
    if (w === except) return;
    w.classList.remove('is-open');
    const r = w.querySelector('.ov-bday-row');
    if (r) r.style.transform = '';
  });
  box.addEventListener('touchstart', (e) => {
    const r = e.target.closest('.ov-bday-row');
    if (!r || e.touches.length !== 1 || e.target.closest('[data-bday-hide]')) { row = null; return; }
    row = r; wrap = r.parentElement;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; dir = null;
    base = wrap.classList.contains('is-open') ? -OPEN : 0;
    closeAll(wrap);
  }, { passive: true });
  box.addEventListener('touchmove', (e) => {
    if (!row) return;
    const mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
    if (!dir) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      dir = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
    }
    if (dir !== 'h') return;
    dx = mx;
    row.style.transition = 'none';
    row.style.transform = `translateX(${Math.min(0, base + mx)}px)`;
  }, { passive: true });
  const end = () => {
    if (!row) return;
    const r = row, w = wrap;
    row = null;
    r.style.transition = '';
    if (dir !== 'h') return;
    const x = Math.min(0, base + dx);
    if (x < -w.offsetWidth * 0.55) {
      r.style.transform = `translateX(-${w.offsetWidth}px)`;
      hideBirthday(w.dataset.bdayKey);
    } else if (x < -OPEN / 2) {
      w.classList.add('is-open');
      r.style.transform = `translateX(-${OPEN}px)`;
    } else {
      w.classList.remove('is-open');
      r.style.transform = '';
    }
  };
  box.addEventListener('touchend', end);
  box.addEventListener('touchcancel', end);
  document.addEventListener('touchstart', (e) => { if (!e.target.closest('#birthdayTileBody')) closeAll(null); }, { passive: true });
})();

// Loads the birthdays of the own family (at most every 6 hours, otherwise from device storage)
async function loadBirthdays(force) {
  const u = currentUser();
  const key = birthdayCacheKey();
  if (!u || !key || isCurrentUserGuest()) {
    birthdayLoadedFor = null;
    birthdayData = { geladen: true, eingerichtet: false, stand: '', liste: [], fehler: '', quellen: { apple: false, google: false }, anzahl: { apple: 0, google: 0 } };
    refreshOverviewTiles();
    return;
  }
  if (birthdayLoadedFor !== key) {
    birthdayLoadedFor = key;
    birthdayLastFetch = 0;
    birthdayTileExpanded = false;
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { cached = null; }
    birthdayData = cached ? normalizeBirthdayData(cached) : { geladen: false, eingerichtet: false, stand: '', liste: [], fehler: '', quellen: { apple: false, google: false }, anzahl: { apple: 0, google: 0 } };
    refreshOverviewTiles();
    renderBirthdaySettingsStatus();
  }
  if (!navigator.onLine) return;
  if (!force && Date.now() - birthdayLastFetch < BIRTHDAY_RELOAD_MS) return;
  birthdayLastFetch = Date.now();
  try {
    const res = await apiFetch('/api/pinn/geburtstage', { cache: 'no-store' });
    if (!res.ok) {
      if (!birthdayData.geladen) { birthdayData.geladen = true; refreshOverviewTiles(); }
      return; // e.g. server hook not installed yet
    }
    const body = await res.json().catch(() => null);
    if (!body || birthdayLoadedFor !== key) return;
    birthdayData = normalizeBirthdayData(body);
    writeBirthdayCache();
    refreshOverviewTiles();
    renderBirthdaySettingsStatus();
  } catch (e) { /* offline - device storage stays */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  loadBirthdays(false);
  refreshOverviewTiles(); // new day: update "Heute"/"Morgen"
});
window.addEventListener('online', () => loadBirthdays(false));

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('geburtstage');

/* pinn. – js/hinweise.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded right before js/ausblick.js (which stays last and starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.41.0, only the comments were translated):
   - Shopping notice – "Going shopping?" banner when arriving at a shop (lp…)
   - Way home – "I'm on my way home" banner, popup, map and SOS countdown (hw…)
   - Bell (notices) – open expenses, family news, version news, swipe to dismiss (nt…)
   - Shops with an address – places cache, offline queue, "Edit list" popup, planned shopping
     trips reported to the server (laden…)
   index.html only calls these functions later (when the user acts or from bootApp), never while
   it is still loading – that is why this file may come after the inline script. */

/* ==========================================================
   Shopping notice – "Going shopping?"
   ----------------------------------------------------------
   - The shops come with the SOS query (/api/pinn/ortung/sos → laeden): all shops (shopping lists with an
     address and the "Remind me on arrival" switch on) within whose radius the user's OWN phone is right now.
     Only while you are there – not if you were there earlier in the day.
   - A shop is only shown if there is something on its list – whether or not a shopping trip is planned.
   - One shop: a tile across the full width. Two shops: the banner splits, one tile per shop with a link
     to its list. Three or more: one tile with a link to the "Lists" page.
   - × hides the notice for this visit (key: shop + arrival time). It is hidden on the "Lists" page.
     The push message on arrival is sent by the server (pinn-ortung.js).
   ========================================================== */
var LS_LP_DISMISS = 'pinn.ladenHinweisAus';
var lpHere = [];
const LP_T = {
  de: { q: 'Gehst du einkaufen?', bei: 'Du bist bei {laden}', n1: '1 Artikel auf der Liste', n: '{n} Artikel auf der Liste', n1k: '1 Artikel', nk: '{n} Artikel',
        mehr: '{n} Läden in deiner Nähe', alle: 'Zu den Einkaufslisten', x: 'Hinweis entfernen' },
  en: { q: 'Going shopping?', bei: "You're at {laden}", n1: '1 item on the list', n: '{n} items on the list', n1k: '1 item', nk: '{n} items',
        mehr: '{n} shops nearby', alle: 'Open the shopping lists', x: 'Dismiss' },
  fr: { q: 'Tu fais les courses ?', bei: 'Tu es chez {laden}', n1: '1 article sur la liste', n: '{n} articles sur la liste', n1k: '1 article', nk: '{n} articles',
        mehr: '{n} magasins à proximité', alle: 'Voir les listes de courses', x: 'Masquer' },
  es: { q: '¿Vas a hacer la compra?', bei: 'Estás en {laden}', n1: '1 artículo en la lista', n: '{n} artículos en la lista', n1k: '1 artículo', nk: '{n} artículos',
        mehr: '{n} tiendas cerca', alle: 'Ver las listas de la compra', x: 'Ocultar' },
};
function lpT(k, vars) {
  const l = (window.PINN_I18N && PINN_I18N.current) || 'en';
  const d = LP_T[l] || LP_T.en;
  let s = d[k] != null ? d[k] : (LP_T.en[k] != null ? LP_T.en[k] : k);
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, n) => (vars[n] != null ? String(vars[n]) : ''));
  return s;
}
function lpTake(body) {
  lpHere = Array.isArray(body && body.laeden) ? body.laeden.filter(x => x && x.laden) : [];
}
function lpKey(x) { return String(x.laden) + '|' + String(Number(x.seit || 0)); }
function lpDismissed() {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(LS_LP_DISMISS) || '{}') || {}; } catch (e) { o = {}; }
  return (o && typeof o === 'object') ? o : {};
}
function lpDismiss(keys) {
  const o = lpDismissed();
  const now = Date.now();
  keys.forEach(k => { o[k] = now; });
  Object.keys(o).forEach(k => { if (now - Number(o[k] || 0) > 2 * 24 * 60 * 60 * 1000) delete o[k]; });
  try { localStorage.setItem(LS_LP_DISMISS, JSON.stringify(o)); } catch (e) { /* ignore */ }
}
function lpItems() {
  if (!lpHere.length || !sosEnabled() || isCurrentUserGuest() || !isViewAllowed('einkauf')) return [];
  if (currentView === 'einkauf') return [];
  const hidden = lpDismissed();
  return lpHere
    .filter(x => getShoppingList(x.laden) && !hidden[lpKey(x)])
    .map(x => ({ ...x, list: getShoppingList(x.laden), count: ladenOpenCount(x.laden) }))
    .filter(x => x.count > 0);
}
function lpName(x) { return (x.list && x.list.name) || x.name || ''; }
function lpRenderBanner() {
  const b = document.getElementById('lpBanner');
  if (!b) return;
  const items = lpItems();
  if (!items.length) {
    if (!b.classList.contains('hidden')) { b.classList.add('hidden'); b.innerHTML = ''; try { hwLayout(); } catch (e) { /* ignore */ } }
    return;
  }
  const tile = (attr, title, sub, ic) => `<button type="button" class="lp-tile" ${attr}>
      <span class="lp-ic" aria-hidden="true">${ic}</span>
      <span class="lp-txt"><span class="lp-t">${title}</span><span class="lp-s">${escapeHtml(sub)}</span></span>
      <span class="lp-chev" aria-hidden="true">›</span>
    </button>`;
  let tiles;
  if (items.length === 1) {
    const x = items[0];
    tiles = tile(`data-lplist="${escapeHtml(x.laden)}"`, escapeHtml(lpT('bei', { laden: lpName(x) })), x.count === 1 ? lpT('n1') : lpT('n', { n: x.count }), '🛒');
  } else if (items.length === 2) {
    tiles = items.map(x => tile(`data-lplist="${escapeHtml(x.laden)}"`, escapeHtml(lpName(x)), x.count === 1 ? lpT('n1k') : lpT('nk', { n: x.count }), '🛒')).join('');
  } else {
    tiles = tile('data-lpall="1"', escapeHtml(lpT('mehr', { n: items.length })), lpT('alle') + ' · ' + items.map(lpName).join(', '), '🛍️');
  }
  const html = `<div class="lp-head"><span class="lp-q">${escapeHtml(lpT('q'))}</span><button type="button" class="lp-x" data-lpx="1" aria-label="${escapeHtml(lpT('x'))}">×</button></div>
    <div class="lp-tiles">${tiles}</div>`;
  b.dataset.keys = items.map(lpKey).join(',');
  const wasHidden = b.classList.contains('hidden');
  if (b.innerHTML !== html) b.innerHTML = html;
  b.classList.remove('hidden');
  if (wasHidden) { try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { /* ignore */ } }
  try { hwLayout(); } catch (e) { /* ignore */ }
}
(function lpWire() {
  const b = document.getElementById('lpBanner');
  if (!b) return;
  b.addEventListener('click', (e) => {
    if (e.target.closest('[data-lpx]')) {
      e.stopPropagation();
      lpDismiss(String(b.dataset.keys || '').split(',').filter(Boolean));
      lpRenderBanner();
      return;
    }
    const one = e.target.closest('[data-lplist]');
    if (one) { ntOpenLink('/?liste=' + encodeURIComponent(one.dataset.lplist)); return; }
    if (e.target.closest('[data-lpall]')) {
      if (!isViewAllowed('einkauf')) return;
      setView('einkauf');
      try { if (currentShoppingListId || currentShoppingPlanTaskId) showShoppingOverview(); } catch (err) { /* ignore */ }
    }
  });
  window.addEventListener('resize', () => { if (!b.classList.contains('hidden')) { try { hwLayout(); } catch (e) { /* ignore */ } } });
})();

/* ==========================================================
   Way home – "I'm on my way home"
   ----------------------------------------------------------
   - The data comes with the SOS query (/api/pinn/ortung/sos → heimwege, zuhause): running trips home
     with current location, address and distance to home (as the crow flies), plus the ones ended in
     the last hour (arrived / ended).
   - A notice (banner) appears at the top. Tapping opens the popup. "Close" keeps a running trip home
     in the banner, arrivals that were looked at disappear. The × removes everything the banner is
     currently reporting at once (on this device, until a new trip home starts or someone arrives).
     The push message "… has arrived home" opens the popup directly.
     All trips home can always be opened from the bell.
   - Family: map with everyone who is on the way, address, time, distance, call/message per person
     (mobile number from the emergency card). Emergency numbers are deliberately not shown here – they
     only come with an SOS.
   - The person themselves: SOS button (tapping starts a 3-second countdown, tapping again cancels;
     then the same alarm as from "Traccar Client" – route /api/pinn/ortung/sos-ausloesen), family
     contacts to call, emergency number 110 and "End way home".
   ========================================================== */
var LS_HW_DISMISS = 'pinn.heimwegAusgeblendet';
var hwList = [];
var hwHome = null;
var hwOpenFlag = false;
var hwForceId = '';
var hwMap = null;
var hwMapFree = false;
var hwRenderedKey = '';
var hwBusy = false;
var HW_SOS_SEC = 3;         // Countdown before the SOS is sent (tap again = cancel)
var hwSosUntil = 0;
var hwSosTimer = null;
var hwSosLastSec = 0;
var hwSosSending = false;
var hwSosError = '';

function hwActive() { return hwList.filter(h => h.aktiv); }
function hwDone() { return hwList.filter(h => !h.aktiv); }
function hwIsMine(h) { const me = famMyMemberId(); return !!me && h.memberId === me; }
function hwMember(h) { return memberById(h.memberId) || null; }
function hwName(h) { const m = hwMember(h); return m ? memberLabel(m) : (h.name || 'Jemand'); }
function hwPhone(memberId) { return String((famPass(memberId) || {}).phone || '').trim(); }
function hwKm(m) {
  if (m == null || !isFinite(m)) return '';
  if (m < 1000) return (Math.round(m / 10) * 10) + ' m';
  return (m < 10000 ? numDec((m / 1000).toFixed(1)) : Math.round(m / 1000)) + ' km';
}
function hwDur(min) {
  const n = Math.max(1, Math.round(Number(min) || 0));
  return n >= 60 ? Math.floor(n / 60) + ' Std. ' + (n % 60) + ' Min.' : n + ' Min.';
}
function hwJoinNames(names) {
  if (names.length <= 1) return names[0] || '';
  return names.slice(0, -1).join(', ') + ' und ' + names[names.length - 1];
}
function hwBannerKey(h) { return h.aktiv ? h.id : h.id + '|ende'; }

/* ---------- Hide (×) – per device and family ---------- */
function hwDismissed() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_HW_DISMISS) || 'null');
    return o && o.familie === ((currentUser() && currentUser().familie) || '') && o.ids && typeof o.ids === 'object' ? o.ids : {};
  } catch (e) { return {}; }
}
function hwDismiss(keys) {
  const ids = hwDismissed();
  const now = Date.now();
  keys.forEach(k => { ids[k] = now; });
  Object.keys(ids).forEach(k => { if (now - Number(ids[k] || 0) > 2 * 24 * 3600 * 1000) delete ids[k]; });
  try { localStorage.setItem(LS_HW_DISMISS, JSON.stringify({ familie: (currentUser() && currentUser().familie) || '', ids })); } catch (e) { /* ignore */ }
}
// Arrivals of the others in the last hour
function hwArrivals() { return hwDone().filter(h => h.grund === 'angekommen' && !hwIsMine(h)); }
// Everything the banner would report (running trips home and arrivals) – the × removes it all at once,
// otherwise dismissing the running trip home was immediately followed by another person's arrival
function hwPendingKeys() {
  const hidden = hwDismissed();
  return hwActive().concat(hwArrivals()).map(hwBannerKey).filter(k => !hidden[k]);
}
// What the banner currently shows: running trips home; otherwise arrivals of the others in the last hour
function hwBannerItems() {
  if (!sosEnabled()) return [];
  const hidden = hwDismissed();
  const act = hwActive();
  if (act.some(h => !hidden[hwBannerKey(h)])) return act;
  return hwArrivals().filter(h => !hidden[hwBannerKey(h)]);
}

/* ---------- Data (from sosCheck) ---------- */
function hwTake(body) {
  hwList = Array.isArray(body && body.heimwege) ? body.heimwege : [];
  hwHome = body && body.zuhause && isFinite(body.zuhause.lat) ? body.zuhause : null;
}
function hwApply() {
  hwRenderBanner();
  try { ntRefresh(); } catch (e) { /* bell not ready yet */ }
  if (hwOpenFlag) {
    if (hwList.length) hwRender(); else hwClose();
    return;
  }
  if (hwForceId) {
    const want = hwForceId;
    hwForceId = '';
    if (hwList.some(h => h.id === want) || hwActive().length) hwOpen(want);
  }
}

/* ---------- Banner ---------- */
function hwRenderBanner() {
  const b = document.getElementById('hwBanner');
  if (!b) return;
  const items = hwBannerItems();
  if (!items.length) { b.classList.add('hidden'); hwLayout(); return; }
  const active = items[0].aktiv;
  const mine = items.find(hwIsMine);
  const others = items.filter(h => !hwIsMine(h));
  let title, sub;
  if (active) {
    if (mine && !others.length) {
      title = '<b>Du</b> bist unterwegs nach Hause';
      sub = 'Deine Familie sieht deinen Standort · Kontakte & Notruf';
    } else {
      const names = (mine ? ['Du'] : []).concat(others.map(hwName));
      title = `<b>${escapeHtml(hwJoinNames(names))}</b> ${mine ? 'seid' : (names.length > 1 ? 'sind' : 'ist')} unterwegs nach Hause`;
      if (others.length === 1) {
        const h = others[0];
        const parts = [];
        if (h.entfernung != null) parts.push('noch ' + hwKm(h.entfernung) + ' bis Zuhause');
        if (h.aktuell && h.aktuell.zeit) parts.push(famAgo(h.aktuell.zeit));
        else parts.push('seit ' + sosClock(h.seit));
        sub = parts.join(' · ');
      } else {
        sub = 'Antippen für Karte und Anruf';
      }
    }
  } else {
    title = `🏠 <b>${escapeHtml(hwJoinNames(others.map(hwName)))}</b> ${others.length > 1 ? 'sind' : 'ist'} zu Hause angekommen`;
    sub = others.length === 1 ? sosClock(others[0].ende) + ' · ' + hwDur(others[0].minuten) + ' unterwegs' : 'Antippen für Details';
  }
  const avas = items.slice(0, 3).map(h => {
    const m = hwMember(h);
    return `<span class="fam-ava sm" style="--fam:${famAttr(famColor(m))}">${m ? famAvatarInner(m) : '<span class="fam-ava-in">🚶</span>'}</span>`;
  }).join('');
  b.classList.toggle('done', !active);
  b.classList.toggle('mine', !!active && !!mine && !others.length);
  b.style.setProperty('--hw', active ? famColor(hwMember(others[0] || mine)) : '#2F7D4F');
  b.dataset.id = items[0].id;
  b.innerHTML = `<span class="hw-avas">${avas}</span>
    <span class="hw-txt"><span class="hw-t">${title}</span><span class="hw-s">${active ? '<span class="hw-walk" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}${escapeHtml(sub)}</span></span>
    <span class="hw-chev" aria-hidden="true">›</span>
    <button type="button" class="hw-x" data-hwbanner="x" aria-label="Hinweis entfernen">×</button>`;
  b.classList.remove('hidden');
  hwLayout();
}
// Banner below the header, the bell notice (if open) below it
function hwLayout() {
  const header = document.querySelector('#appShell > header');
  const top = Math.round((header ? header.getBoundingClientRect().bottom : 60) + 8);
  const b = document.getElementById('hwBanner');
  let next = top;
  if (b && !b.classList.contains('hidden')) {
    b.style.top = top + 'px';
    next = top + b.offsetHeight + 8;
  }
  // Shopping notice ("Going shopping?") below the way-home notice
  const lp = document.getElementById('lpBanner');
  if (lp && !lp.classList.contains('hidden')) {
    lp.style.top = next + 'px';
    next = next + lp.offsetHeight + 8;
  }
  // Outlook (weekly preview / monthly outlook) below the way-home notice
  const ab = document.getElementById('abBanner');
  if (ab && !ab.classList.contains('hidden')) {
    ab.style.top = next + 'px';
    next = next + ab.offsetHeight + 8;
  }
  const hint = document.getElementById('ntHint');
  if (hint && !hint.classList.contains('hidden')) hint.style.top = next + 'px';
}
function hwBannerOffset() {
  const b = document.getElementById('hwBanner');
  const hw = b && !b.classList.contains('hidden') ? b.offsetHeight + 8 : 0;
  const lpb = document.getElementById('lpBanner');
  const lp = lpb && !lpb.classList.contains('hidden') ? lpb.offsetHeight + 8 : 0;
  let ab = 0;
  try { ab = abBannerOffset(); } catch (e) { ab = 0; }
  return hw + lp + ab;
}

/* ---------- Popup ---------- */
function hwOpen(id) {
  if (!sosEnabled()) return;
  if (!hwList.length) { hwForceId = id || 'x'; sosCheck(); return; }
  hwOpenFlag = true;
  hwRenderedKey = '';
  hwMapFree = false;
  document.getElementById('hwOverlay').classList.remove('hidden');
  hwRender();
  if (id) {
    const h = hwList.find(x => x.id === id);
    if (h && h.aktiv && h.aktuell && hwMap) { hwMapFree = true; hwMap.setView(Number(h.aktuell.lat), Number(h.aktuell.lon), 15); }
  }
  sosSchedule();
}
function hwClose() {
  if (hwSosUntil) { hwSosStop(); finShowToast('SOS abgebrochen'); }
  hwOpenFlag = false;
  hwRenderedKey = '';
  if (hwMap) { hwMap.destroy(); hwMap = null; }
  const ov = document.getElementById('hwOverlay');
  if (ov) ov.classList.add('hidden');
  const card = document.getElementById('hwCard');
  if (card) card.innerHTML = '';
  // Arrivals looked at in the popup are done – no need to dismiss them in the banner again.
  // Running trips home stay in the banner.
  const seen = hwArrivals().map(hwBannerKey);
  if (seen.length) hwDismiss(seen);
  hwRenderBanner();
  sosSchedule();
}
function hwShowMap() { return hwActive().some(h => !hwIsMine(h) || h.aktuell); }
function hwRender() {
  const card = document.getElementById('hwCard');
  if (!card) return;
  const act = hwActive();
  const mine = act.find(hwIsMine) || null;
  const key = [act.map(h => h.id).join(','), hwDone().map(h => h.id).join(','), mine ? 'm' : '', hwShowMap() ? 'k' : ''].join('|');
  if (hwRenderedKey !== key) {
    if (hwMap) { hwMap.destroy(); hwMap = null; }
    card.innerHTML = hwSkeleton();
    hwRenderedKey = key;
    if (hwShowMap()) requestAnimationFrame(hwAttachMap);
  }
  hwUpdate();
}
function hwSkeleton() {
  const act = hwActive();
  const mine = act.find(hwIsMine) || null;
  const others = act.filter(h => !hwIsMine(h));
  const lead = others[0] || mine || hwDone()[0] || null;
  const m = lead ? hwMember(lead) : null;
  let kicker, title;
  if (!act.length) { kicker = '🏠 Heimweg'; title = 'Alle sind angekommen'; }
  else if (mine && !others.length) { kicker = '🚶 Dein Heimweg'; title = 'Du bist unterwegs nach Hause'; }
  else {
    const names = (mine ? ['Du'] : []).concat(others.map(hwName));
    kicker = '🚶 Heimweg';
    title = hwJoinNames(names) + ' ' + (mine ? 'seid' : (names.length > 1 ? 'sind' : 'ist')) + ' unterwegs nach Hause';
  }
  const ava = `<span class="fam-ava" style="--fam:#fff">${m ? famAvatarInner(m) : '<span class="fam-ava-in">🚶</span>'}</span>`;
  const canFam = isViewAllowed('familie');
  return `
    <div class="sos-head hw-head${act.length ? '' : ' done'}" style="--hw:${famAttr(act.length ? famColor(m) : '#2F7D4F')}">
      ${ava}
      <div class="min-w-0">
        <div class="sos-kicker">${kicker}</div>
        <div class="sos-title">${escapeHtml(title)}</div>
        <div class="sos-sub" id="hwSub"></div>
      </div>
    </div>
    <div class="sos-body">
      ${mine ? '<div id="hwMine"></div>' : ''}
      ${hwShowMap() ? `<div class="sos-map-slot"><div id="hwMapHost" class="fam-map-host"></div></div>` : ''}
      <div id="hwPeople" class="flex flex-col gap-2"></div>
      <div id="hwDoneList"></div>
    </div>
    <div class="sos-foot">
      ${canFam ? `<button type="button" class="sos-btn-close" data-hwact="familie">👨‍👩‍👧 Familie</button>` : ''}
      <button type="button" class="sos-btn-close" data-hwact="close">Schließen</button>
    </div>`;
}
// Fill the contents with the latest data (without rebuilding the map)
function hwUpdate() {
  const act = hwActive();
  const mine = act.find(hwIsMine) || null;
  const others = act.filter(h => !hwIsMine(h));
  const sub = document.getElementById('hwSub');
  if (sub) {
    if (others.length === 1) sub.textContent = 'seit ' + sosClock(others[0].seit) + (others[0].entfernung != null ? ' · noch ' + hwKm(others[0].entfernung) + ' (Luftlinie)' : '');
    else if (others.length > 1) sub.textContent = others.length + ' Personen unterwegs · Live-Standorte';
    else if (mine) sub.textContent = 'seit ' + sosClock(mine.seit) + ' · Deine Familie sieht deinen Live-Standort';
    else sub.textContent = 'Heimwege der letzten Stunde';
  }
  const mineBox = document.getElementById('hwMine');
  if (mineBox && mine && !hwSosUntil && !hwSosSending) { mineBox.innerHTML = hwMineHtml(mine); hwSosPaint(); }
  const people = document.getElementById('hwPeople');
  if (people) people.innerHTML = others.map(hwPersonHtml).join('');
  const doneBox = document.getElementById('hwDoneList');
  if (doneBox) {
    const done = hwDone();
    doneBox.innerHTML = done.length ? `<div class="hw-sec">Heimweg beendet</div>` + done.map(hwDoneHtml).join('') : '';
  }
  hwDrawMap();
}
function hwMineHtml(h) {
  const me = famMyMemberId();
  const seen = new Set();
  const calls = [];
  members.filter(m => m.id !== me && !famIsPet(m)).forEach(m => {
    const ph = hwPhone(m.id);
    const k = ph.replace(/[^\d+]/g, '');
    if (!ph || seen.has(k)) return;
    seen.add(k);
    calls.push(`<a class="sos-call person hw-call" style="--hw:${famAttr(famColor(m))}" href="${famAttr(famTel(ph))}"><span class="ic">📞</span><b>${escapeHtml(memberLabel(m))}</b><span>${escapeHtml(ph)}</span></a>`);
  });
  // own emergency contacts from the emergency card
  const own = famPass(me) || {};
  (Array.isArray(own.contacts) ? own.contacts : []).forEach(c => {
    const ph = String((c && c.phone) || '').trim();
    const k = ph.replace(/[^\d+]/g, '');
    if (!ph || seen.has(k)) return;
    seen.add(k);
    calls.push(`<a class="sos-call person hw-call" href="${famAttr(famTel(ph))}"><span class="ic">📞</span><b>${escapeHtml(c.name || 'Kontakt')}</b><span>${escapeHtml(c.relation || ph)}</span></a>`);
  });
  const pol = regionNotruf().polizei;
  calls.push(`<a class="sos-call police" href="tel:${escapeHtml(pol)}"><span class="ic">🚓</span><b>${escapeHtml(pol)}</b><span>Polizei-Notruf</span></a>`);
  const pos = h.aktuell;
  return `<div class="hw-mine">
      <div class="hw-mine-h">${pos ? `📍 ${escapeHtml(pos.adresse || (Number(pos.lat).toFixed(5) + ', ' + Number(pos.lon).toFixed(5)))}` : '📍 Noch kein aktueller Standort – pinn. offen lassen oder „Traccar Client“ einschalten'}</div>
      ${pos ? `<div class="sos-when">🕒 ${escapeHtml(sosClock(pos.zeit))}${pos.genau ? ` <span class="acc">(± ${escapeHtml(String(pos.genau))} m)</span>` : ''}${h.entfernung != null ? ' · 🏠 noch ' + escapeHtml(hwKm(h.entfernung)) : ''}</div>` : ''}
      <button type="button" id="hwSosBtn" class="hw-sos" data-hwact="sos" aria-live="assertive">
        <span class="hw-sos-fill"></span>
        <span class="hw-sos-in"><span class="hw-sos-ic" data-sosic>SOS</span><span class="hw-sos-txt"><b data-sost>SOS – Familie alarmieren</b><small data-soss>Sofort-Alarm mit deinem Standort an alle</small></span></span>
      </button>
      ${hwSosError ? `<div class="hw-sos-err">⚠️ ${escapeHtml(hwSosError)}</div>` : `<div class="hw-sos-note">Antippen startet einen Countdown von ${HW_SOS_SEC} Sekunden – nochmal tippen bricht ab.</div>`}
      <div class="hw-sec">Familie anrufen</div>
      <div class="hw-calls">${calls.join('')}</div>
      ${calls.length === 1 ? `<p class="text-[11px] text-ink/50 mt-1">In den Notfallpässen der Familie ist noch keine Handynummer hinterlegt${famCanEdit() ? ' – unter Familie → Bearbeiten eintragen' : ''}.</p>` : ''}
      <button type="button" class="hw-end" data-hwact="ende">🏁 Ich bin angekommen · Heimweg beenden</button>
    </div>`;
}
function hwPersonHtml(h) {
  const m = hwMember(h);
  const name = hwName(h);
  const ph = hwPhone(h.memberId);
  const c = h.aktuell;
  const live = c && famNow() - Number(c.zeit || 0) < 2 * 60 * 1000;
  const meta = [];
  meta.push('seit ' + sosClock(h.seit));
  if (c) meta.push(live ? '<span class="sos-live">● live</span>' : 'aktualisiert ' + escapeHtml(famAgo(c.zeit)));
  if (c && c.akku != null) meta.push('🔋 ' + escapeHtml(String(c.akku)) + ' %');
  if (c && c.tempo) meta.push(escapeHtml(String(c.tempo)) + ' km/h');
  return `<div class="hw-person" style="--hw:${famAttr(famColor(m))}">
      <div class="flex items-center gap-3">
        <span class="fam-ava sm" style="--fam:${famAttr(famColor(m))}">${m ? famAvatarInner(m) : '<span class="fam-ava-in">🚶</span>'}</span>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold leading-snug">${escapeHtml(name)}</div>
          <div class="text-[12.5px] leading-snug break-words">${c ? '📍 ' + escapeHtml(c.adresse || (Number(c.lat).toFixed(5) + ', ' + Number(c.lon).toFixed(5))) + (c.genau ? ` <span class="text-ink/45">(± ${escapeHtml(String(c.genau))} m)</span>` : '') : '📍 Standort noch unbekannt'}</div>
          <div class="text-[11px] text-ink/55 leading-snug mt-0.5">${meta.join(' · ')}</div>
        </div>
        ${h.entfernung != null ? `<span class="hw-dist" title="Luftlinie bis Zuhause">🏠 ${escapeHtml(hwKm(h.entfernung))}</span>` : ''}
      </div>
      <div class="flex flex-wrap gap-2 mt-2.5">
        ${ph ? `<a class="fz-mini-btn primary" href="${famAttr(famTel(ph))}">📞 ${escapeHtml(name)} anrufen</a>
        <a class="fz-mini-btn" href="${famAttr('sms:' + ph.replace(/[^\d+]/g, ''))}">💬 Nachricht</a>` : `<span class="text-[11px] text-ink/50 self-center">Keine Handynummer im Notfallpass${famCanEdit() ? ' – unter Familie → Bearbeiten eintragen' : ''}.</span>`}
        ${c ? `<button type="button" class="fz-mini-btn" data-hwact="zeigen" data-hwid="${famAttr(h.id)}">📍 Auf der Karte</button>` : ''}
      </div>
    </div>`;
}
function hwDoneHtml(h) {
  const name = hwIsMine(h) ? 'Du' : hwName(h);
  const txt = h.grund === 'angekommen'
    ? `${hwIsMine(h) ? 'bist' : 'ist'} um ${sosClock(h.ende)} zu Hause angekommen (${hwDur(h.minuten)})`
    : `${hwIsMine(h) ? 'hast' : 'hat'} den Heimweg um ${sosClock(h.ende)} beendet`;
  return `<div class="hw-done"><span>${h.grund === 'angekommen' ? '🏠' : '🏁'}</span><span><b>${escapeHtml(name)}</b> ${escapeHtml(txt)}</span></div>`;
}

/* ---------- Map ---------- */
function hwAttachMap() {
  const host = document.getElementById('hwMapHost');
  if (!host || hwMap) return;
  hwMap = famCreateMap(host, { fitBtn: true, onFit: () => { hwMapFree = false; hwFit(); }, onUserMove: () => { hwMapFree = true; } });
  hwMapFree = false;
  const h = hwHome || famHomePoint();
  if (h) hwMap.setView(Number(h.lat), Number(h.lon), 13); else hwMap.setView(51.1657, 10.4515, 6);
  hwDrawMap();
}
function hwFit() {
  if (!hwMap) return;
  const pts = hwActive().filter(h => h.aktuell).map(h => [Number(h.aktuell.lat), Number(h.aktuell.lon)]);
  const home = hwHome || famHomePoint();
  if (home) pts.push([Number(home.lat), Number(home.lon)]);
  if (pts.length) hwMap.fit(pts, 16);
}
function hwDrawMap() {
  if (!hwMap) return;
  const marks = [];
  const circles = [];
  const home = hwHome || famHomePoint();
  if (home) {
    marks.push({ lat: Number(home.lat), lon: Number(home.lon), html: '<div class="fm-place">🏠</div>', cls: 'is-place' });
    circles.push({ lat: Number(home.lat), lon: Number(home.lon), r: Number(home.radius) || 150, color: '#2F7D4F', dash: true });
  }
  hwActive().filter(h => h.aktuell).forEach(h => {
    const m = hwMember(h);
    const c = h.aktuell;
    const live = famNow() - Number(c.zeit || 0) < FAM_LIVE_MS;
    marks.push({
      id: h.id, lat: Number(c.lat), lon: Number(c.lon),
      html: `<div class="fm-mk${live ? ' live' : ' stale'}" style="--fam:${famAttr(famColor(m))}">
          <div class="fm-mk-ava">${m ? famAvatarInner(m) : '<span class="fam-ava-in">🚶</span>'}</div>
          <div class="fm-mk-lbl">🚶 ${escapeHtml(hwIsMine(h) ? 'Du' : hwName(h))}</div>
        </div>`,
    });
    if (c.genau) circles.push({ lat: Number(c.lat), lon: Number(c.lon), r: Math.max(5, Number(c.genau)), color: famColor(m) });
  });
  hwMap.setMarkers(marks);
  hwMap.setCircles(circles);
  if (!hwMapFree) hwFit();
}

/* ---------- SOS from the way-home popup ---------- */
function hwSosPaint() {
  const b = document.getElementById('hwSosBtn');
  if (!b) return;
  const t = b.querySelector('[data-sost]'), sub = b.querySelector('[data-soss]'), ic = b.querySelector('[data-sosic]'), fill = b.querySelector('.hw-sos-fill');
  b.classList.toggle('counting', !!hwSosUntil && !hwSosSending);
  b.classList.toggle('sending', hwSosSending);
  b.disabled = hwSosSending;
  if (hwSosSending) {
    ic.textContent = '📡'; t.textContent = 'Alarm wird gesendet …'; sub.textContent = 'Einen Moment, bitte';
    fill.style.width = '100%';
  } else if (hwSosUntil) {
    const left = Math.max(0, hwSosUntil - Date.now());
    ic.textContent = String(Math.max(1, Math.ceil(left / 1000)));
    t.textContent = 'Alarm in ' + Math.max(1, Math.ceil(left / 1000)) + ' Sekunde' + (Math.ceil(left / 1000) > 1 ? 'n' : '') + ' …';
    sub.textContent = 'Nochmal tippen zum Abbrechen';
    fill.style.width = Math.min(100, 100 - (left / (HW_SOS_SEC * 1000)) * 100).toFixed(1) + '%';
  } else {
    ic.textContent = 'SOS'; t.textContent = 'SOS – Familie alarmieren'; sub.textContent = 'Sofort-Alarm mit deinem Standort an alle';
    fill.style.width = '0';
  }
}
function hwSosVibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }
function hwSosStop() {
  clearInterval(hwSosTimer);
  hwSosTimer = null;
  hwSosUntil = 0;
  hwSosPaint();
}
function hwSosPress() {
  if (hwSosSending) return;
  if (hwSosUntil) { hwSosStop(); hwSosVibrate(60); finShowToast('SOS abgebrochen'); return; }
  hwSosError = '';
  const note = document.querySelector('#hwMine .hw-sos-err');
  if (note) { note.className = 'hw-sos-note'; note.textContent = 'Nochmal tippen bricht den Alarm ab.'; }
  hwSosUntil = Date.now() + HW_SOS_SEC * 1000;
  hwSosLastSec = HW_SOS_SEC;
  hwSosVibrate(200);
  hwSosPaint();
  clearInterval(hwSosTimer);
  hwSosTimer = setInterval(() => {
    if (!hwSosUntil) return;
    const left = hwSosUntil - Date.now();
    if (left <= 0) {
      clearInterval(hwSosTimer);
      hwSosTimer = null;
      hwSosUntil = 0;
      hwSosSend();
      return;
    }
    const sec = Math.ceil(left / 1000);
    if (sec !== hwSosLastSec) { hwSosLastSec = sec; hwSosVibrate(150); }
    hwSosPaint();
  }, 100);
}
// Location from the browser only if it is already allowed (no prompt in an emergency), at most 2.5 seconds
async function hwSosBrowserPos() {
  try {
    if (!navigator.geolocation || !navigator.permissions || !navigator.permissions.query) return null;
    const st = await navigator.permissions.query({ name: 'geolocation' });
    if (!st || st.state !== 'granted') return null;
    return await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 2500);
      navigator.geolocation.getCurrentPosition(
        (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lon: p.coords.longitude, genau: Math.round(p.coords.accuracy || 0) || null }); },
        () => { clearTimeout(t); resolve(null); },
        { enableHighAccuracy: true, timeout: 2500, maximumAge: 60000 }
      );
    });
  } catch (e) { return null; }
}
async function hwSosSend() {
  hwSosSending = true;
  hwSosPaint();
  let failed = '';
  let id = '';
  if (navigator.onLine === false) {
    failed = 'Keine Verbindung zu pinn. – der Alarm konnte nicht gesendet werden.';
  } else {
    const pos = await hwSosBrowserPos();
    try {
      const r = await famPost('sos-ausloesen', pos || {});
      id = (r && r.id) || '';
    } catch (e) {
      failed = e.message || 'Der Alarm konnte nicht gesendet werden.';
    }
  }
  hwSosSending = false;
  if (failed) {
    hwSosError = failed;
    hwSosVibrate([400, 120, 400]);
    const mine = hwActive().find(hwIsMine);
    const box = document.getElementById('hwMine');
    if (box && mine) { box.innerHTML = hwMineHtml(mine); hwSosPaint(); } else hwSosPaint();
    const pol = regionNotruf().polizei;
    if (confirm(failed + '\n\nJetzt den Polizei-Notruf ' + pol + ' anrufen?')) location.href = 'tel:' + pol;
    return;
  }
  hwSosError = '';
  hwSosVibrate([300, 100, 300]);
  finShowToast('🆘 Alarm gesendet – deine Familie ist informiert');
  hwClose();
  sosStarted = true;
  if (id) sosForceId = id;
  await sosCheck();
}

/* ---------- End your own way home ---------- */
async function hwEndMine(btn) {
  if (hwBusy) return;
  if (!confirm('Heimweg beenden? Danach gilt deine Standortfreigabe wieder wie vorher.')) return;
  hwBusy = true;
  if (btn) btn.disabled = true;
  try {
    await famPost('unterwegs', { an: false });
    finShowToast('Heimweg beendet');
    if (currentView === 'familie') famLoadStatus().then(() => famRefreshLive()).catch(() => {});
    await sosCheck();
  } catch (e) {
    finShowToast(e.message || 'Keine Verbindung – bitte gleich noch einmal versuchen.', true);
    if (btn) btn.disabled = false;
  } finally {
    hwBusy = false;
  }
}

/* ---------- Start & wiring ---------- */
// From the push message: /?heimweg=<ID> opens the popup
function hwReadUrl() {
  let id = '';
  try { id = new URLSearchParams(location.search).get('heimweg') || ''; } catch (e) { id = ''; }
  if (!id) return;
  hwForceId = id;
  try {
    const q = new URLSearchParams(location.search);
    q.delete('heimweg');
    const rest = q.toString();
    history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
  } catch (e) { /* ignore */ }
}
(function wireHeimweg() {
  const banner = document.getElementById('hwBanner');
  const overlay = document.getElementById('hwOverlay');
  const card = document.getElementById('hwCard');
  if (!banner || !overlay || !card) return;
  banner.addEventListener('click', (e) => {
    if (e.target.closest('[data-hwbanner="x"]')) {
      e.stopPropagation();
      hwDismiss(hwPendingKeys());
      hwRenderBanner();
      finShowToast('Hinweis entfernt – über die 🔔 Glocke weiter abrufbar');
      return;
    }
    hwOpen(banner.dataset.id || '');
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hwClose(); });
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hwact]');
    if (!b) return;
    switch (b.dataset.hwact) {
      case 'close': hwClose(); break;
      case 'ende': hwEndMine(b); break;
      case 'sos': hwSosPress(); break;
      case 'familie': hwClose(); setView('familie'); break;
      case 'zeigen': {
        const h = hwList.find(x => x.id === b.dataset.hwid);
        if (h && h.aktuell && hwMap) {
          hwMapFree = true;
          hwMap.setView(Number(h.aktuell.lat), Number(h.aktuell.lon), Math.max(hwMap.zoom(), 16));
          const slot = card.querySelector('.sos-map-slot');
          if (slot) slot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        break;
      }
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hwOpenFlag && !sosOpenId) hwClose(); });
  window.addEventListener('resize', hwLayout);
  // Notification "… is on the way home" tapped while pinn. is already open
  try {
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (ev) => {
      const d = ev.data || {};
      if (d.type !== 'pinn-open') return;
      let id = '';
      try { id = new URL(d.url || '/', location.origin).searchParams.get('heimweg') || ''; } catch (e) { id = ''; }
      if (!id || !sosEnabled()) return;
      sosStarted = true;
      hwForceId = id;
      sosCheck();
    });
  } catch (e) { /* ignore */ }
})();

/* ==========================================================
   Bell (notices) & shops with an address
   ----------------------------------------------------------
   - Bell to the right of the family name: open expenses of planned shopping trips (ticked off, but no
     amount booked yet – whether by hand, on another device or automatically in the shop) and news
     from the version log that have not been read on this device yet.
   - When the app opens (and after a longer break) a notice appears as long as expenses are missing.
   - Shops: one or more addresses (branches) per shopping list (Lists → Edit list).
     Stored as "shop" places in the location feature on the NAS (pinn-ortung.js, route /laden), so they
     also show up under Family → Places. Without a connection the change is queued and sent later.
   - Open "Plan shopping" tasks are reported to the server (/api/pinn/ortung/einkaeufe). If a phone stays
     in the shop for "verweil" minutes (default 10), the server ticks off the task.
   - Family news (/api/pinn/hinweise, pb_hooks/pinn-hinweise.js): new items on shopping lists, new lists
     and entries, planned meals, new recipes, tasks and events of the others. Tapping opens the matching
     page, swipe/× removes, "Clear all" empties the bell.
     The server never reports gift lists and private lists.
   ========================================================== */
var LS_LADEN_ORTE = 'pinn.ladenOrte';
var LS_LADEN_QUEUE = 'pinn.ladenQueue';
var LS_LADEN_SENT = 'pinn.ladenPlaeneGesendet';
var LS_NT_SEEN = 'pinn.hinweise.gelesen';
var LS_NT_HIDDEN_NEWS = 'pinn.hinweise.ausgeblendet';   // news dismissed one by one (versions)
var LS_NT_HIDDEN_HW = 'pinn.hinweise.heimwegeWeg';      // dismissed trips home (ID + state)
var LS_NT_ACT = 'pinn.hinweise.familie';           // family news (per profile on the device)
var ntSwipe = null;            // swipe gesture in progress in the bell
var ntSwipeEndedAt = 0;        // ignore a click right after swiping
var ntClearing = false;        // "Clear all" is running (animation)
var ntRenderDeferred = false;  // redraw postponed during swipe/clear
var ntActMem = null;           // family news (cached in memory)
var ntActBusy = false;
var ntActLastFetch = 0;
var ntPanelSeenBefore = 0;     // "seen until" when the bell was opened (for the dots on new cards)
var ntUrlParams = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } })();
var ntStarted = false;
var ntPanelOpen = false;
var ntKnownPending = null;     // plan IDs that were already open (for the notice on new ones)
var ntAutoAsked = new Set();   // plans for which the server has already been asked about "ticked off automatically"
var ntHiddenAt = 0;
var ladenSyncTimer = null;
var ladenSyncBusy = false;
var ladenFlushBusy = false;
var ladenModalState = null;
var ladenSearchTimer = null;
var ladenSearchSeq = 0;

/* ---------- small helpers ---------- */
function ntFamily() { return (currentUser() && currentUser().familie) || ''; }
function ntReadLs(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && v.familie === ntFamily() ? v : null; } catch (e) { return null; }
}
function ntWriteLs(key, obj) {
  try { localStorage.setItem(key, JSON.stringify({ ...obj, familie: ntFamily() })); } catch (e) { /* ignore */ }
}
function ntCmpVer(a, b) {
  const pa = String(a || '0').split('.').map(Number), pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
// Shorten a Nominatim address: without country, state and district
function ntShortAddr(name) {
  const parts = String(name || '').split(',').map(x => x.trim()).filter(Boolean)
    .filter(x => !/^(Deutschland|Germany|Österreich|Schweiz)$/i.test(x))
    .filter(x => !/^(Landkreis|Kreis|Regierungsbezirk|Verwaltungsgemeinschaft)\b/i.test(x))
    .filter(x => !/^(Baden-Württemberg|Bayern|Berlin|Brandenburg|Bremen|Hamburg|Hessen|Mecklenburg-Vorpommern|Niedersachsen|Nordrhein-Westfalen|Rheinland-Pfalz|Saarland|Sachsen|Sachsen-Anhalt|Schleswig-Holstein|Thüringen)$/i.test(x));
  return parts.slice(0, 5).join(', ').slice(0, 200);
}
function ntWhen(iso) {
  const t = typeof iso === 'number' ? iso : Date.parse(iso || '');
  if (!t) return '';
  const d = new Date(t);
  const today = new Date();
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return ntTx('heute {0} Uhr', hm);
  if (d.toDateString() === yest.toDateString()) return ntTx('gestern {0} Uhr', hm);
  return ntTx('{0}, {1} Uhr', d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }), hm);
}
/* ---------- Bell: texts in the selected language ----------
   The bell's sentences consist of text and highlighted names (<b>…</b>). The automatic translation
   only sees fragments of them ("hat … angelegt") and does not recognise them. That is why the whole
   template with {0}, {1} … is translated here (language file, entries "nt|…") and the values are
   inserted only afterwards. The finished cards carry data-no-i18n – names and titles typed in freely
   stay unchanged that way. Without an entry in the language file the German template is kept. */
function ntTpl(tpl) {
  try { if (window.PINN_I18N && PINN_I18N.active) return PINN_I18N.t(tpl, 'nt') || tpl; } catch (e) { /* German */ }
  return tpl;
}
// values as ready-made HTML (already escaped)
function ntT(tpl, ...vals) {
  return escapeHtml(ntTpl(tpl)).replace(/\{(\d)\}/g, (m, i) => (vals[+i] != null ? String(vals[+i]) : ''));
}
// plain text (values unchanged, no HTML)
function ntTx(tpl, ...vals) {
  return ntTpl(tpl).replace(/\{(\d)\}/g, (m, i) => (vals[+i] != null ? String(vals[+i]) : ''));
}
// Fallback names the server inserts when a title is missing – translate exactly these words only
var NT_WORDS = ['Jemand', 'Foto', 'Zettel', 'Liste', 'Umfrage', 'Countdown', 'Dokument', 'Vertrag', 'Fahrzeug', 'Buchung', 'Einkaufsliste', 'Kasse', 'Einkauf'];
function ntW(s) { return NT_WORDS.indexOf(String(s || '')) >= 0 ? ntTx(String(s)) : String(s || ''); }
function ntLangCode() { return (window.PINN_I18N && PINN_I18N.active && PINN_I18N.current) || 'de'; }
// Time like sosClock, but translated
function ntClock(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const t = ntTx('{0} Uhr', d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
  return d.toDateString() === new Date().toDateString() ? t : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ', ' + t;
}
function ntDur(min) {
  const n = Math.max(1, Math.round(Number(min) || 0));
  return n >= 60 ? ntTx('{0} Std. {1} Min.', Math.floor(n / 60), n % 60) : ntTx('{0} Min.', n);
}
// Event suffix from the server ("Di 06.10., 14:00 Uhr") in the selected language
function ntTerminZ(e) {
  const z = String((e && e.z) || '');
  if (!z || ntLangCode() === 'de') return z;
  const m = String((e && e.d) || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return z;
  const day = new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const tm = z.match(/(\d\d:\d\d) Uhr/);
  return tm ? day + ', ' + ntTx('{0} Uhr', tm[1]) : day;
}

/* ==========================================================
   Shops: places cache, queue, "Edit list" popup
   ========================================================== */
function ladenCacheFromStatus(st) {
  if (!st || !Array.isArray(st.orte)) return;
  ntWriteLs(LS_LADEN_ORTE, { orte: st.orte.filter(o => o && o.laden), at: Date.now() });
}
function ladenCachedPlaces() { const c = ntReadLs(LS_LADEN_ORTE); return c && Array.isArray(c.orte) ? c.orte : []; }
function ladenQueueRead() { const q = ntReadLs(LS_LADEN_QUEUE); return q && q.ops && typeof q.ops === 'object' ? q.ops : {}; }
function ladenQueueWrite(ops) { ntWriteLs(LS_LADEN_QUEUE, { ops }); }
var LADEN_MAX_FILIALEN = 10;
function ladenNewId() { let s = 'f'; const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; for (let i = 0; i < 11; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
// Queued save as a shop with branches (older format { ort } is converted)
function ladenQueuedShop(listId, op) {
  if (!op || op.op !== 'save') return null;
  if (op.laden && Array.isArray(op.laden.filialen)) return op.laden;
  const o = op.ort;
  if (!o) return null;
  const known = ladenCachedPlaces().find(x => x.laden === listId);
  return {
    laden: listId, name: o.name || 'Laden',
    filialen: [{ id: o.id || (known ? known.id : '') || ladenNewId(), lat: o.lat, lon: o.lon, adresse: o.adresse || '' }],
    verweil: o.verweil, abhaken: o.abhaken !== false, erledigtPush: o.erledigtPush !== false, erinnern: o.erinnern !== false, ankunft: !!o.ankunft,
  };
}
// Places (branches) of a shop – queued changes take precedence over the server state
function ladenPlacesFor(listId) {
  if (!listId) return [];
  const cached = ladenCachedPlaces().filter(o => o.laden === listId);
  const q = ladenQueueRead()[listId];
  if (!q) return cached;
  const shop = ladenQueuedShop(listId, q);
  if (!shop) return [];
  return shop.filialen.map(f => ({
    ...(cached.find(o => o.id === f.id) || {}),
    id: f.id, laden: listId, name: shop.name, lat: f.lat, lon: f.lon, adresse: f.adresse || '',
    verweil: shop.verweil, abhaken: shop.abhaken, erledigtPush: shop.erledigtPush, erinnern: shop.erinnern, ankunft: shop.ankunft,
  }));
}
async function ladenRefreshCache() {
  if (isCurrentUserGuest() || !ntFamily()) return false;
  try {
    const res = await apiFetch('/api/pinn/ortung/status', { cache: 'no-store' });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    if (body && Array.isArray(body.orte)) { ladenCacheFromStatus(body); return true; }
  } catch (e) { /* offline */ }
  return false;
}
function ladenQueueSave(listId, shop) {
  const ops = ladenQueueRead();
  ops[listId] = { op: 'save', laden: shop, at: Date.now() };
  ladenQueueWrite(ops);
  ladenFlush();
}
function ladenQueueDelete(listId) {
  if (!listId || isCurrentUserGuest()) return;
  const ops = ladenQueueRead();
  const known = ladenCachedPlaces().some(o => o.laden === listId);
  if (!known && !ops[listId]) return; // never had an address
  if (!known) delete ops[listId]; else ops[listId] = { op: 'del', at: Date.now() };
  ladenQueueWrite(ops);
  ladenFlush();
}
async function ladenFlush() {
  if (ladenFlushBusy || isCurrentUserGuest() || !ntFamily()) return;
  const ids = Object.keys(ladenQueueRead());
  if (!ids.length) return;
  ladenFlushBusy = true;
  let sent = false;
  try {
    for (const listId of ids) {
      const op = ladenQueueRead()[listId];
      if (!op) continue;
      let res;
      const shop = ladenQueuedShop(listId, op);
      try {
        res = shop
          ? await apiFetch('/api/pinn/ortung/laden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(shop) })
          : await apiFetch('/api/pinn/ortung/ort-loeschen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ laden: listId }) });
      } catch (e) { break; } // no connection - try again later
      if (res.status === 404) break; // server files not installed yet
      if (!res.ok && res.status !== 400 && res.status !== 403) break; // server not ready right now
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        finShowToast('Adressen des Ladens nicht gespeichert: ' + (b.error || 'Fehler'), true);
      }
      const cur = ladenQueueRead();
      if (cur[listId] && cur[listId].at === op.at) { delete cur[listId]; ladenQueueWrite(cur); }
      sent = true;
    }
  } finally {
    ladenFlushBusy = false;
  }
  if (sent) { await ladenRefreshCache(); ladenPlansSync(true); }
}

/* ---------- "Edit list" popup: address ---------- */
function ladenModalOpen(listId) {
  const block = document.getElementById('shoppingListAddrBlock');
  if (!block) return;
  const allowed = !isCurrentUserGuest();
  block.classList.toggle('hidden', !allowed);
  if (!allowed) { ladenModalState = null; return; }
  const ps = ladenPlacesFor(listId);
  ladenModalState = { listId, filialen: [], orig: ps, dirty: false, adding: false };
  ladenModalFill(ps);
  document.getElementById('shoppingListAddrInput').value = '';
  document.getElementById('shoppingListAddrResults').innerHTML = '';
  ladenModalRender();
  // Reload the server state (e.g. changed on another device)
  if (listId) ladenRefreshCache().then(ok => {
    if (!ok || !ladenModalState || ladenModalState.listId !== listId || ladenModalState.dirty) return;
    if (document.getElementById('shoppingListModal').classList.contains('hidden')) return;
    const fresh = ladenPlacesFor(listId);
    ladenModalState.orig = fresh;
    ladenModalFill(fresh);
    ladenModalRender();
  });
}
function ladenModalFill(ps) {
  if (!ladenModalState) return;
  const list = (Array.isArray(ps) ? ps : []).filter(x => x && isFinite(Number(x.lat)) && isFinite(Number(x.lon)));
  ladenModalState.filialen = list.map(x => ({ id: x.id || ladenNewId(), adresse: x.adresse || '', lat: Number(x.lat), lon: Number(x.lon) }));
  ladenModalState.adding = false;
  const p = list[0] || null;
  document.getElementById('shoppingListAddrStay').value = String(p && p.verweil ? [5, 10, 15, 20, 30, 45, 60].reduce((a, b) => Math.abs(b - p.verweil) < Math.abs(a - p.verweil) ? b : a) : 10);
  document.getElementById('shoppingListAddrDone').checked = !p || p.abhaken !== false;
  document.getElementById('shoppingListAddrDonePush').checked = !p || p.erledigtPush !== false;
  document.getElementById('shoppingListAddrRemind').checked = !p || p.erinnern !== false;
  document.getElementById('shoppingListAddrArrive').checked = !!(p && p.ankunft);
}
function ladenModalRender() {
  const st = ladenModalState;
  if (!st) return;
  const chosen = document.getElementById('shoppingListAddrChosen');
  const n = st.filialen.length;
  const has = n > 0;
  const full = n >= LADEN_MAX_FILIALEN;
  chosen.classList.toggle('hidden', !has);
  document.getElementById('shoppingListAddrSearchWrap').classList.toggle('hidden', has && (!st.adding || full));
  document.getElementById('shoppingListAddrAdd').classList.toggle('hidden', !has || st.adding || full);
  document.getElementById('shoppingListAddrOpts').classList.toggle('hidden', !has);
  const input = document.getElementById('shoppingListAddrInput');
  input.placeholder = has ? 'Weitere Filiale suchen, z. B. Rewe Bahnhofstraße' : 'z. B. Rewe Hauptstraße Musterstadt';
  chosen.innerHTML = st.filialen.map((f, i) => `<div class="ntl-chosen">
      <span class="text-lg leading-none">📍</span>
      <span class="min-w-0 flex-1 text-sm leading-snug">${n > 1 ? `<span class="block text-[10px] uppercase tracking-wide text-ink/40">Filiale ${i + 1}</span>` : ''}${escapeHtml(f.adresse || 'Lage auf der Karte festgelegt')}</span>
      <button type="button" class="fz-mini-btn" data-ladenact="remove" data-ladenidx="${i}" aria-label="Adresse entfernen">✕</button>
    </div>`).join('');
}
async function ladenSearch(q) {
  const box = document.getElementById('shoppingListAddrResults');
  const seq = ++ladenSearchSeq;
  if (String(q || '').trim().length < 3) { box.innerHTML = ''; return; }
  box.innerHTML = '<p class="text-xs text-ink/40 px-1">Suche …</p>';
  try {
    const res = await apiFetch('/api/pinn/ortung/suche?q=' + encodeURIComponent(q.trim()));
    const body = await res.json().catch(() => ({}));
    if (seq !== ladenSearchSeq) return;
    const list = Array.isArray(body.treffer) ? body.treffer : [];
    box.innerHTML = list.length
      ? list.map((t, i) => `<button type="button" class="fz-pick-row text-xs" data-ladenhit="${i}">📍 <span class="min-w-0 flex-1">${escapeHtml(ntShortAddr(t.name))}</span></button>`).join('')
      : `<p class="text-xs text-ink/40 px-1">${escapeHtml(res.status === 404 ? 'Die Adresssuche ist auf dem Server noch nicht eingespielt.' : (body.error || 'Nichts gefunden – Straße und Ort probieren.'))}</p>`;
    box._hits = list;
  } catch (e) {
    if (seq === ladenSearchSeq) box.innerHTML = '<p class="text-xs text-red-600 px-1">Suche nicht möglich – keine Verbindung.</p>';
  }
}
function ladenModalSave(listId, name) {
  const st = ladenModalState;
  ladenModalState = null;
  if (!st || isCurrentUserGuest() || !listId) return;
  const orig = Array.isArray(st.orig) ? st.orig : [];
  if (!st.filialen.length) {
    if (orig.length) ladenQueueDelete(listId);
    return;
  }
  const shop = {
    laden: listId, name: String(name || 'Laden').slice(0, 40),
    filialen: st.filialen.slice(0, LADEN_MAX_FILIALEN).map(f => ({ id: f.id, lat: f.lat, lon: f.lon, adresse: f.adresse || '' })),
    verweil: Number(document.getElementById('shoppingListAddrStay').value) || 10,
    abhaken: document.getElementById('shoppingListAddrDone').checked,
    erledigtPush: document.getElementById('shoppingListAddrDonePush').checked,
    erinnern: document.getElementById('shoppingListAddrRemind').checked,
    ankunft: document.getElementById('shoppingListAddrArrive').checked,
  };
  if (orig.length) {
    const o = orig[0];
    const sameBranches = orig.length === shop.filialen.length && shop.filialen.every((f, i) => {
      const x = orig[i];
      return x && x.id === f.id && Number(x.lat) === Number(f.lat) && Number(x.lon) === Number(f.lon) && String(x.adresse || '') === f.adresse;
    });
    const same = sameBranches && orig.every(x => String(x.name || '') === shop.name)
      && String(o.verweil == null ? 10 : o.verweil) === String(shop.verweil)
      && (o.abhaken !== false) === shop.abhaken && (o.erledigtPush !== false) === shop.erledigtPush
      && (o.erinnern !== false) === shop.erinnern && !!o.ankunft === shop.ankunft;
    if (same) return;
  }
  ladenQueueSave(listId, shop);
  const n = shop.filialen.length;
  finShowToast((n > 1 ? n + ' Adressen gespeichert' : 'Adresse gespeichert') + ' – der Laden steht jetzt auch unter Familie → Orte.');
}
(function wireLadenModal() {
  const input = document.getElementById('shoppingListAddrInput');
  const box = document.getElementById('shoppingListAddrResults');
  if (!input || !box) return;
  input.addEventListener('input', () => {
    clearTimeout(ladenSearchTimer);
    ladenSearchTimer = setTimeout(() => ladenSearch(input.value), 450);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    clearTimeout(ladenSearchTimer);
    ladenSearch(input.value);
  });
  input.addEventListener('focus', () => {
    // Keyboard: keep the field visible
    setTimeout(() => { try { input.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ignore */ } }, 300);
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ladenhit]');
    if (!b || !ladenModalState) return;
    const t = (box._hits || [])[Number(b.dataset.ladenhit)];
    if (!t) return;
    const lat = Number(t.lat), lon = Number(t.lon);
    const st = ladenModalState;
    // Do not add the same branch twice
    if (st.filialen.some(f => Math.abs(f.lat - lat) < 0.0002 && Math.abs(f.lon - lon) < 0.0002)) {
      finShowToast('Diese Adresse ist schon eingetragen.', true);
      return;
    }
    if (st.filialen.length >= LADEN_MAX_FILIALEN) return;
    st.filialen.push({ id: ladenNewId(), adresse: ntShortAddr(t.name), lat, lon });
    st.adding = false;
    st.dirty = true;
    box.innerHTML = '';
    input.value = '';
    input.blur();
    ladenModalRender();
  });
  document.getElementById('shoppingListAddrChosen').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ladenact="remove"]');
    if (!b || !ladenModalState) return;
    const i = Number(b.dataset.ladenidx);
    if (!(i >= 0)) return;
    ladenModalState.filialen.splice(i, 1);
    ladenModalState.dirty = true;
    ladenModalRender();
  });
  // Another branch: show the search, pre-filled with the list's name
  document.getElementById('shoppingListAddrAdd').addEventListener('click', () => {
    if (!ladenModalState) return;
    ladenModalState.adding = true;
    ladenModalRender();
    box.innerHTML = '';
    input.value = document.getElementById('shoppingListNameInput').value.trim() + ' ';
    input.focus();
  });
  ['shoppingListAddrStay', 'shoppingListAddrDone', 'shoppingListAddrDonePush', 'shoppingListAddrRemind', 'shoppingListAddrArrive'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { if (ladenModalState) ladenModalState.dirty = true; });
  });
})();

/* ---------- Report planned shopping trips to the server ---------- */
function ladenPlansPayload() {
  const stamm = shoppingStammladenId();
  return shoppingPlans
    .filter(p => !p.bookedAt)
    .map(p => {
      const t = aufgaben.find(a => a.id === p.id);
      if (!t || t.done) return null;
      const listen = p.listIds
        .map(id => (id === SHOPPING_MEAL_LIST_ID ? stamm : id))
        .filter(id => id && shoppingLists.some(l => l.id === id))
        .filter((x, i, a) => a.indexOf(x) === i);
      return listen.length ? { aufgabe: p.id, titel: String(t.title || '').slice(0, 120), listen } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.aufgabe < b.aufgabe ? -1 : 1));
}
// Open items per shopping list with a shop address – for "Going shopping?" on arrival.
// Meal planning counts for the main shop unless it is shown there anyway.
function ladenOpenCount(listId) {
  let n = 0;
  try { n = shoppingListSummary(listId).count; } catch (e) { n = 0; }
  try {
    if (listId === shoppingStammladenId() && !listHasRecipeItems(listId)) n += shoppingListSummary(SHOPPING_MEAL_LIST_ID).count;
  } catch (e) { /* ignore */ }
  return n;
}
function ladenOffenPayload() {
  const withAddr = new Set(ladenCachedPlaces().map(o => o && o.laden).filter(Boolean));
  const out = {};
  shoppingLists.forEach(l => {
    if (!l || !l.id || l.id === SHOPPING_MEAL_LIST_ID || !withAddr.has(l.id)) return;
    const n = ladenOpenCount(l.id);
    if (n > 0) out[l.id] = n;
  });
  return out;
}
function ladenPlansSync(force) {
  clearTimeout(ladenSyncTimer);
  ladenSyncTimer = setTimeout(() => ladenPlansSyncNow(!!force), force ? 50 : 1200);
}
async function ladenPlansSyncNow(force) {
  try { lpRenderBanner(); } catch (e) { /* list changed: update the shopping notice at the top */ }
  if (ladenSyncBusy || isCurrentUserGuest() || !ntFamily() || !pb.authStore.isValid) return;
  const plaene = ladenPlansPayload();
  const offen = ladenOffenPayload();
  const json = JSON.stringify({ plaene, offen });
  const last = ntReadLs(LS_LADEN_SENT);
  if (!force) {
    if (last && last.json === json && Date.now() - (last.at || 0) < 30 * 60 * 1000) return;
    if (!last && !plaene.length && !Object.keys(offen).length) return;
  }
  ladenSyncBusy = true;
  try {
    const res = await apiFetch('/api/pinn/ortung/einkaeufe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plaene, offen }) });
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    ntWriteLs(LS_LADEN_SENT, { json, at: Date.now() });
    if (Array.isArray(body.erledigt)) ntApplyAuto(body.erledigt);
  } catch (e) {
    /* offline - try again next time */
  } finally {
    ladenSyncBusy = false;
  }
}
// Note shopping trips ticked off by the server on the plan (for the text in the bell)
function ntApplyAuto(list) {
  let changed = false;
  shoppingPlans = shoppingPlans.map(p => {
    if (p.auto) return p;
    const x = list.find(e => e && e.aufgabe === p.id);
    if (!x) return p;
    changed = true;
    return { ...p, auto: { zeit: Number(x.zeit) || Date.now(), memberId: x.memberId || '', wer: x.wer || '', minuten: Number(x.minuten) || 0, listen: Array.isArray(x.listen) ? x.listen : [] } };
  });
  if (changed) { persistState(); ntRefresh(); }
}

/* ==========================================================
   Bell
   ========================================================== */
function ntPurchases() {
  if (isCurrentUserGuest() || !isViewAllowed('finanzen')) return [];
  return shoppingPlans
    .filter(p => !p.bookedAt)
    .map(p => {
      const task = aufgaben.find(a => a.id === p.id);
      if (!task || !task.done) return null;
      const lists = p.listIds.map(id => getShoppingList(id)).filter(Boolean);
      return lists.length ? { plan: p, task, lists } : null;
    })
    .filter(Boolean)
    .sort((a, b) => String(b.task.doneAt || '').localeCompare(String(a.task.doneAt || '')));
}
function ntSeenVersion() {
  let v = '';
  try { v = localStorage.getItem(LS_NT_SEEN) || ''; } catch (e) { v = ''; }
  if (!v) {
    // First start with the bell: only show the newest version as new
    v = PINN_CHANGELOG[1] ? PINN_CHANGELOG[1].v : '0';
    try { localStorage.setItem(LS_NT_SEEN, v); } catch (e) { /* ignore */ }
  }
  return v;
}
function ntHiddenRead(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch (e) { return []; }
}
function ntHiddenAdd(key, id, max) {
  const list = ntHiddenRead(key).filter(x => x !== id);
  list.push(String(id));
  try { localStorage.setItem(key, JSON.stringify(list.slice(-(max || 60)))); } catch (e) { /* ignore */ }
}
function ntNews() {
  const seen = ntSeenVersion();
  const hidden = new Set(ntHiddenRead(LS_NT_HIDDEN_NEWS));
  return PINN_CHANGELOG.filter(e => !e.rueckblick && ntCmpVer(e.v, seen) > 0 && !hidden.has(String(e.v)));
}
function ntMarkNewsRead() {
  try { localStorage.setItem(LS_NT_SEEN, APP_VERSION); localStorage.removeItem(LS_NT_HIDDEN_NEWS); } catch (e) { /* ignore */ }
  ntRefresh();
}

/* ---------- Family news (shopping, lists, meals, recipes, tasks, events) ----------
   State per profile on the device: { familie, user, list: [notice], seenAt (ms), hidden: { id: time } }
   A dismissed notice reappears if the same person changes more there later
   (the server merges that into the same notice, the time gets newer). */
var NT_ACT_MAX_AGE = 3 * 24 * 60 * 60 * 1000;
function ntActKey() {
  const u = currentUser();
  return { familie: ntFamily(), user: (u && u.id) || '' };
}
function ntActState() {
  const k = ntActKey();
  if (ntActMem && ntActMem.familie === k.familie && ntActMem.user === k.user) return ntActMem;
  let st = null;
  try { st = JSON.parse(localStorage.getItem(LS_NT_ACT) || 'null'); } catch (e) { st = null; }
  if (!st || st.familie !== k.familie || st.user !== k.user || !Array.isArray(st.list)) {
    // First start: whatever is already there counts as seen (no flood at the bell)
    st = { familie: k.familie, user: k.user, list: [], seenAt: Date.now(), hidden: {} };
  }
  if (!st.hidden || typeof st.hidden !== 'object') st.hidden = {};
  if (!Number(st.seenAt)) st.seenAt = Date.now();
  ntActMem = st;
  return st;
}
function ntActSave() {
  if (!ntActMem) return;
  try { localStorage.setItem(LS_NT_ACT, JSON.stringify(ntActMem)); } catch (e) { /* ignore */ }
}
function ntActNormalize(x) {
  if (!x || !x.id || !x.art) return null;
  return {
    id: String(x.id), art: String(x.art), ziel: String(x.ziel || ''), typ: String(x.typ || ''),
    wer: String(x.wer || ''), mitglied: String(x.mitglied || ''), name: String(x.name || ''),
    titel: String(x.titel || ''), anzahl: Math.max(1, Number(x.anzahl) || 1),
    text: String(x.text || ''), link: String(x.link || ''),
    eintraege: Array.isArray(x.eintraege) ? x.eintraege.filter(e => e && e.t).slice(0, 12) : [],
    zeit: Number(x.zeit) || Date.now(),
  };
}
// May this profile see the notice? (guests, child lock, private lists)
// The server only sends finances, contracts and documents to those allowed anyway (members of the cash box).
function ntActAllowed(a) {
  switch (a.art) {
    case 'push': return true; // personal message to this profile
    case 'einkauf': case 'einkaufsliste': case 'einkauf-ab': case 'einkauf-weg':
    case 'einkaufsliste-um': case 'einkaufsliste-weg':
      return isViewAllowed('einkauf');
    case 'liste': case 'liste-neu': case 'liste-ab': case 'liste-um': case 'liste-weg': {
      if (!isViewAllowed('einkauf')) return false;
      const l = familyLists.find(x => x.id === a.ziel);
      return !l || lsVisible(l); // deleted lists stay visible, other people's private ones never
    }
    case 'essen': return isViewAllowed('rezepte') || isViewAllowed('uebersicht');
    case 'rezept': return isViewAllowed('rezepte');
    case 'aufgabe': case 'aufgabe-ab': {
      if (!isViewAllowed('aufgaben')) return false;
      if (!childLockActive()) return true;
      return a.eintraege.some(e => e && aufgaben.some(x => x.id === e.id)); // own tasks only
    }
    case 'termin': return isViewAllowed('termine') || isViewAllowed('uebersicht');
    case 'vorrat': return isViewAllowed('vorrat');
    case 'mitglied': return true;
    case 'notfallpass': return isViewAllowed('familie');
    case 'pinnwand': case 'pinnwand-antwort': return isViewAllowed('pinnwand');
    case 'ausgabe': case 'ausgleich': case 'vertrag':
      return !isCurrentUserGuest() && isViewAllowed('finanzen');
    case 'fahrzeug': case 'fahrzeug-log':
      return !isCurrentUserGuest() && (isViewAllowed('fahrzeuge') || isViewAllowed('finanzen'));
    case 'dokument': return !isCurrentUserGuest() && isViewAllowed('dokumente');
    default: return false;
  }
}
function ntActivities() {
  if (!ntStarted || !ntFamily()) return [];
  const st = ntActState();
  const me = st.user;
  const min = Date.now() - NT_ACT_MAX_AGE;
  const single = st.list
    .filter(a => a && a.zeit >= min && a.wer !== me && !(st.hidden[a.id] && st.hidden[a.id] >= a.zeit))
    .filter(a => { try { return ntActAllowed(a); } catch (e) { return false; } })
    .map(a => {
      // Child lock: only name the own tasks in task notices
      if ((a.art !== 'aufgabe' && a.art !== 'aufgabe-ab') || !childLockActive()) return a;
      const eintraege = a.eintraege.filter(e => e && aufgaben.some(x => x.id === e.id));
      return { ...a, eintraege, anzahl: Math.max(1, eintraege.length) };
    })
    .sort((a, b) => b.zeit - a.zeit);
  return ntActMergeDay(single);
}
// Several notices from the same person about the same thing on the same day (e.g. items added to Rewe
// in the morning and evening) appear as ONE notice: counts added up, entries merged, newest time
function ntActMergeDay(list) {
  const groups = new Map();
  list.forEach(a => {
    // Personal messages are already merged by the server (same tag) - never here
    const k = a.art === 'push' ? 'push|' + a.id : [a.art, a.ziel, a.wer, new Date(a.zeit).toDateString()].join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  });
  return Array.from(groups.values()).map(g => {
    if (g.length === 1) return { ...g[0], ids: [g[0].id] };
    const seen = new Set();
    const eintraege = [];
    g.forEach(a => a.eintraege.forEach(e => {
      const k = e.id ? 'i:' + e.id : 't:' + e.t;
      if (seen.has(k)) return;
      seen.add(k);
      eintraege.push(e);
    }));
    const head = g[0]; // newest first (list is sorted by time)
    return {
      ...head,
      ids: g.map(a => a.id),
      anzahl: Math.max(eintraege.length, g.reduce((s, a) => s + (Number(a.anzahl) || 1), 0) - (g.reduce((s, a) => s + a.eintraege.length, 0) - eintraege.length)),
      eintraege: eintraege.slice(0, 12),
      zeit: Math.max(...g.map(a => a.zeit)),
    };
  }).sort((a, b) => b.zeit - a.zeit);
}
// Mark all single notices of a (merged) card as done
function ntActHide(a) {
  const st = ntActState();
  (a.ids && a.ids.length ? a.ids : [a.id]).forEach(id => {
    const x = st.list.find(y => y.id === id);
    st.hidden[id] = Math.max(x ? x.zeit : 0, a.zeit || 0) || Date.now();
  });
  ntActSave();
}
function ntActUnseen() {
  if (!ntStarted) return [];
  const seen = ntActState().seenAt;
  return ntActivities().filter(a => a.zeit > seen);
}
function ntActMarkSeen() {
  const st = ntActState();
  const newest = ntActivities().reduce((m, a) => Math.max(m, a.zeit), 0);
  st.seenAt = Math.max(Date.now(), newest);
  ntActSave();
}
async function ntActFetch(force) {
  if (!ntStarted || ntActBusy || !ntFamily() || !familyRecordId) return;
  if (!force && Date.now() - ntActLastFetch < 20000) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  ntActBusy = true;
  ntActLastFetch = Date.now();
  try {
    const res = await apiFetch('/api/pinn/hinweise', { cache: 'no-store' });
    if (!res.ok) return; // 404: server files not installed yet
    const body = await res.json().catch(() => null);
    if (!body || !Array.isArray(body.hinweise)) return;
    const st = ntActState();
    const before = new Set(ntActUnseen().map(a => a.id + ':' + a.zeit));
    st.list = body.hinweise.map(ntActNormalize).filter(Boolean);
    Object.keys(st.hidden).forEach(id => { if (!st.list.some(a => a.id === id)) delete st.hidden[id]; });
    ntActSave();
    const fresh = ntActUnseen().filter(a => !before.has(a.id + ':' + a.zeit));
    if (fresh.length && !ntPanelOpen) ntRing();
    ntRefresh();
  } catch (e) {
    /* offline - try again next time */
  } finally {
    ntActBusy = false;
  }
}
function ntActWho(a) {
  const m = a.mitglied && typeof memberById === 'function' ? memberById(a.mitglied) : null;
  return { m, name: m ? memberLabel(m) : (a.name || ntTx('Jemand')) };
}
function ntActDate(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return ntTx('heute');
  if (diff === 1) return ntTx('morgen');
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}
// Quotation marks of the selected language
function ntActQuote(t) {
  const c = ntLangCode();
  const q = c === 'fr' ? ['« ', ' »'] : c === 'es' ? ['«', '»'] : c === 'de' ? ['„', '“'] : ['“', '”'];
  return q[0] + escapeHtml(ntW(t)) + q[1];
}
// Icon of a personal push message (by its "tag")
var NT_PUSH_ICONS = {
  termin: '⏰', tagesuebersicht: '☀️', zuweisung: '📌', kind: '⭐', alle: '🎉', dokument: '📄',
  vertrag: '📝', kasse: '💶', ausgleich: '💸', pinnwand: '🧷', laden: '🛒', einkauf: '🛒',
  ortung: '📍', sos: '🆘', aufgabe: '✅', geburtstag: '🎂', muell: '🗑️', fahrzeug: '🚗',
};
function ntEuro(v) { return typeof fmtEur === 'function' ? fmtEur(v) : (Math.round((v || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' €'; }
function ntKasseName(a) {
  const k = typeof kasseById === 'function' ? kasseById(a.ziel) : null;
  return k ? i18nT(kasseDisplayName(k)) : ntW(a.titel || 'Kasse');
}
// Who owes whom – from this profile's point of view (shared cash boxes only; calculated like under
// Finances → "Who owes whom" with all bookings of the cash box up to today)
function ntKasseBalanceHtml(kasseId) {
  try {
    if (!kasseId || kasseId !== activeKasseId) return '';
    const k = kasseById(kasseId);
    if (!k || !kasseIsShared(k)) return '';
    if (!ausgabenLoaded && !finServerList.length) return '';
    const me = currentMember() ? currentMember().id : '';
    const { bal, transfers } = kasseBalances(k);
    if (!me || !(me in bal)) return '';
    const nm = id => { const m = kassePartById(id); return escapeHtml(m ? memberLabel(m) : '?'); };
    const mine = transfers.filter(t => t.from === me || t.to === me).map(t => t.from === me
      ? ntT('Du schuldest {0} {1}', nm(t.to), `<b>${escapeHtml(ntEuro(t.amount))}</b>`)
      : ntT('{0} schuldet dir {1}', nm(t.from), `<b>${escapeHtml(ntEuro(t.amount))}</b>`));
    if (mine.length) return '⚖️ ' + mine.join(' · ');
    return Math.abs(bal[me] || 0) < 0.005 ? '⚖️ ' + ntT('Bei dir ist alles ausgeglichen') : '';
  } catch (e) { return ''; }
}
// Text, icon and subline of a notice (sentences via ntT – see "Bell: texts in the selected language")
function ntActText(a) {
  const who = ntActWho(a);
  const nm = `<b>${escapeHtml(who.name)}</b>`;
  const n = a.anzahl;
  const first = a.eintraege[0] || { t: '' };
  const names = a.eintraege.map(e => ntW(e.t));
  const listNames = () => {
    const shown = escapeHtml(names.slice(0, 6).join(', '));
    return shown + (n > Math.min(6, names.length) ? ` … (${n})` : '');
  };
  const q = ntActQuote;
  const t = lsTypeSafe(a.typ);
  const shopList = () => {
    const l = getShoppingList(a.ziel);
    return { l, name: `<b>${escapeHtml((l && l.name) || ntW(a.titel || 'Einkaufsliste'))}</b>` };
  };
  const artikel = z => {
    const m = String(z || '').match(/^(\d+) Artikel$/);
    return m ? ntTx('{0} Artikel', m[1]) : String(z || '');
  };
  switch (a.art) {
    case 'push': {
      const text = String(a.text || '').trim();
      return {
        ico: NT_PUSH_ICONS[a.typ] || '🔔',
        main: `<b>${escapeHtml(a.titel || 'pinn.')}</b>`,
        sub: escapeHtml(text).replace(/\n/g, '<br>'),
        long: true,
      };
    }
    case 'einkauf': {
      const { l, name } = shopList();
      return {
        ico: l ? shoppingListLogoHtml(l, 30) : '🛒',
        main: n === 1 ? ntT('{0} hat {1} auf {2} gesetzt', nm, q(first.t), name) : ntT('{0} hat {1} Artikel auf {2} gesetzt', nm, n, name),
        sub: n === 1 ? '' : listNames(),
      };
    }
    case 'einkauf-ab': {
      const { l, name } = shopList();
      return {
        ico: l ? shoppingListLogoHtml(l, 30) : '🛒',
        main: n === 1 ? ntT('{0} hat {1} auf {2} abgehakt', nm, q(first.t), name) : ntT('{0} hat {1} Artikel auf {2} abgehakt', nm, n, name),
        sub: n === 1 ? '' : listNames(),
      };
    }
    case 'einkauf-weg': {
      const { l, name } = shopList();
      return {
        ico: l ? shoppingListLogoHtml(l, 30) : '🛒',
        main: n === 1 ? ntT('{0} hat {1} von {2} entfernt', nm, q(first.t), name) : ntT('{0} hat {1} Artikel von {2} entfernt', nm, n, name),
        sub: n === 1 ? '' : listNames(),
      };
    }
    case 'einkaufsliste':
      return { ico: '🛒', main: ntT('{0} hat die Einkaufsliste {1} angelegt', nm, q(a.titel || first.t)), sub: '' };
    case 'einkaufsliste-um':
      return { ico: '🛒', main: ntT('{0} hat die Einkaufsliste {1} in {2} umbenannt', nm, q(first.z || '…'), q(first.t)), sub: '' };
    case 'einkaufsliste-weg':
      return { ico: '🗑️', main: ntT('{0} hat die Einkaufsliste {1} gelöscht', nm, q(a.titel || first.t)), sub: '' };
    case 'liste-neu':
      return { ico: t.icon, main: ntT('{0} hat {2} {1} angelegt', nm, q(a.titel || first.t), escapeHtml(t.withArticle)), sub: '' };
    case 'liste-um':
      return { ico: t.icon, main: ntT('{0} hat {2} {1} in {3} umbenannt', nm, q(first.z || '…'), escapeHtml(t.withArticle), q(first.t)), sub: '' };
    case 'liste-weg':
      return { ico: '🗑️', main: ntT('{0} hat {2} {1} gelöscht', nm, q(a.titel || first.t), escapeHtml(t.withArticle)), sub: '' };
    case 'liste': {
      if (a.typ === 'wish') {
        return { ico: t.icon, main: n === 1 ? ntT('{0} wünscht sich {1}', nm, q(first.t)) : ntT('{0} hat {1} neue Wünsche auf dem Wunschzettel', nm, n), sub: n === 1 ? escapeHtml(ntW(a.titel)) : listNames() };
      }
      return {
        ico: t.icon,
        main: n === 1 ? ntT('{0} hat {1} zu {2} hinzugefügt', nm, q(first.t), q(a.titel)) : ntT('{0} hat {1} Einträge zu {2} hinzugefügt', nm, n, q(a.titel)),
        sub: n === 1 ? escapeHtml(t.label) : listNames(),
      };
    }
    case 'liste-ab':
      return {
        ico: t.icon,
        main: n === 1 ? ntT('{0} hat {1} in {2} abgehakt', nm, q(first.t), q(a.titel)) : ntT('{0} hat {1} Einträge in {2} abgehakt', nm, n, q(a.titel)),
        sub: n === 1 ? escapeHtml(t.label) : listNames(),
      };
    case 'essen':
      return {
        ico: '🍽️',
        main: n === 1 ? ntT('{0} hat {1} für {2} geplant', nm, q(first.t), escapeHtml(ntActDate(first.d) || ntTx('die Woche'))) : ntT('{0} hat {1} Essen geplant', nm, n),
        sub: n === 1 ? '' : a.eintraege.slice(0, 6).map(e => escapeHtml(e.t) + (e.d ? ' (' + escapeHtml(ntActDate(e.d)) + ')' : '')).join(', '),
      };
    case 'rezept':
      return { ico: '📖', main: n === 1 ? ntT('{0} hat das Rezept {1} angelegt', nm, q(first.t)) : ntT('{0} hat {1} neue Rezepte angelegt', nm, n), sub: n === 1 ? '' : listNames() };
    case 'aufgabe':
      return {
        ico: '✅',
        main: n === 1 ? ntT('{0} hat die Aufgabe {1} angelegt', nm, q(first.t)) : ntT('{0} hat {1} Aufgaben angelegt', nm, n),
        sub: n === 1 ? (first.d ? ntT('fällig {0}', escapeHtml(ntActDate(first.d))) : '') : listNames(),
      };
    case 'aufgabe-ab':
      return {
        ico: '✔️',
        main: n === 1 ? ntT('{0} hat {1} erledigt', nm, q(first.t)) : ntT('{0} hat {1} Aufgaben erledigt', nm, n),
        sub: n === 1 ? (a.typ === 'haushalt' ? ntT('Haushalt') : '') : listNames(),
      };
    case 'termin':
      return {
        ico: '📅',
        main: n === 1 ? ntT('{0} hat den Termin {1} eingetragen', nm, q(first.t)) : ntT('{0} hat {1} Termine eingetragen', nm, n),
        sub: n === 1 ? escapeHtml(ntTerminZ(first)) : a.eintraege.slice(0, 4).map(e => escapeHtml(e.t) + (e.z ? ' (' + escapeHtml(ntTerminZ(e)) + ')' : '')).join(', '),
      };
    case 'vorrat':
      return { ico: '🥫', main: n === 1 ? ntT('{0} hat {1} in den Vorrat aufgenommen', nm, q(first.t)) : ntT('{0} hat {1} Artikel in den Vorrat aufgenommen', nm, n), sub: n === 1 ? '' : listNames() };
    case 'mitglied': {
      const m = first.id && typeof memberById === 'function' ? memberById(first.id) : null;
      return {
        ico: m ? `<span class="nt-act-ico nt-ava" style="border-color:${escapeHtml(memberBorderColor(m))}">${memberAvatarInnerHTML(m)}</span>` : '👋',
        main: n === 1 ? ntT('{0} hat {1} zur Familie hinzugefügt', nm, `<b>${escapeHtml(first.t)}</b>`) : ntT('{0} hat {1} Familienmitglieder hinzugefügt', nm, n),
        sub: n === 1 ? escapeHtml(first.z ? i18nT(first.z) : '') : listNames(),
      };
    }
    case 'notfallpass':
      return { ico: '🩺', main: ntT('{0} hat den Notfallpass von {1} aktualisiert', nm, `<b>${escapeHtml(a.titel || first.t)}</b>`), sub: '' };
    case 'pinnwand':
      return { ico: '🧷', main: n === 1 ? ntT('{0} hat {1} an die Pinnwand gehängt', nm, q(first.t)) : ntT('{0} hat {1} Zettel an die Pinnwand gehängt', nm, n), sub: n === 1 ? '' : listNames() };
    case 'pinnwand-antwort':
      return { ico: '💬', main: n === 1 ? ntT('{0} hat auf {1} geantwortet', nm, q(a.titel)) : ntT('{0} hat {1}× auf {2} geantwortet', nm, n, q(a.titel)), sub: escapeHtml(first.t) };
    case 'ausgabe': {
      const sum = a.eintraege.reduce((x, e) => x + (Number(e.b) || 0), 0);
      const bal = ntKasseBalanceHtml(a.ziel);
      const kname = escapeHtml(ntKasseName(a));
      const isArt = z => /^\d+ Artikel$/.test(String(z || ''));
      let main;
      if (n === 1 && Number(first.b) < 0) main = ntT('{0} hat eine Einnahme gebucht: {1} · {2}', nm, q(first.t), `<b>${escapeHtml(ntEuro(-first.b))}</b>`);
      else if (n === 1 && first.z && !isArt(first.z)) main = ntT('{0} war bei {1} einkaufen · {2}', nm, `<b>${escapeHtml(first.z)}</b>`, `<b>${escapeHtml(ntEuro(first.b))}</b>`);
      else if (n === 1) main = ntT('{0} hat {1} gebucht · {2}', nm, q(first.t), `<b>${escapeHtml(ntEuro(first.b))}</b>`);
      else main = ntT('{0} hat {1} Ausgaben eingetragen · {2}', nm, n, `<b>${escapeHtml(ntEuro(sum))}</b>`);
      const details = n === 1 ? (isArt(first.z) ? escapeHtml(artikel(first.z)) : '') : a.eintraege.slice(0, 4).map(e => escapeHtml(isArt(e.z) ? ntW(e.t) : (e.z || ntW(e.t))) + ' ' + escapeHtml(ntEuro(e.b))).join(', ');
      return { ico: '💶', main, sub: [details, kname].filter(Boolean).join(' · '), extra: bal };
    }
    case 'ausgleich': {
      return { ico: '💸', main: ntT('{0} hat einen Ausgleich über {1} eingetragen', nm, `<b>${escapeHtml(ntEuro(first.b))}</b>`), sub: escapeHtml(ntKasseName(a)), extra: ntKasseBalanceHtml(a.ziel) };
    }
    case 'fahrzeug-log': {
      const v = first.f && typeof fzVehicle === 'function' ? fzVehicle(first.f) : null;
      return {
        ico: '⛽',
        main: n === 1 ? ntT('{0} hat {1} eingetragen · {2}', nm, q(first.t), `<b>${escapeHtml(ntEuro(first.b))}</b>`) : ntT('{0} hat {1} Fahrzeug-Einträge gemacht', nm, n),
        sub: [v ? escapeHtml(ntW(fzName(v))) : '', escapeHtml(ntKasseName(a))].filter(Boolean).join(' · '),
        extra: ntKasseBalanceHtml(a.ziel),
      };
    }
    case 'vertrag':
      return { ico: '📝', main: n === 1 ? ntT('{0} hat den Vertrag {1} angelegt', nm, q(first.t)) : ntT('{0} hat {1} Verträge angelegt', nm, n), sub: [n === 1 ? escapeHtml(first.z || '') : listNames(), escapeHtml(ntKasseName(a))].filter(Boolean).join(' · ') };
    case 'fahrzeug':
      return { ico: '🚗', main: n === 1 ? ntT('{0} hat das Fahrzeug {1} hinzugefügt', nm, q(first.t)) : ntT('{0} hat {1} Fahrzeuge hinzugefügt', nm, n), sub: n === 1 ? escapeHtml(first.z || '') : listNames() };
    case 'dokument': {
      const cat = first.z && typeof docCategory === 'function' ? docCategory(first.z) : null;
      return {
        ico: (cat && cat.icon) || '📄',
        main: n === 1 ? ntT('{0} hat das Dokument {1} abgelegt', nm, q(first.t)) : ntT('{0} hat {1} Dokumente abgelegt', nm, n),
        sub: n === 1 ? escapeHtml(cat && cat.label ? i18nT(cat.label) : '') : listNames(),
      };
    }
    default:
      return { ico: '🔔', main: nm, sub: '' };
  }
}
// List type: icon, name ("Packliste") and – for the sentences – with article ("die Packliste", "den
// Wunschzettel"). In other languages the translated name is there in lower case (the templates
// of the language files insert it appropriately, without a German article).
function lsTypeSafe(id) {
  const t = (typeof lsType === 'function' && id) ? lsType(id) : null;
  const one = (t && t.one) || 'Liste';
  const label = ntLangCode() === 'de' ? one : i18nT(one);
  let withArticle;
  if (ntLangCode() === 'de') withArticle = (/zettel$/i.test(one) ? 'den ' : 'die ') + one;
  else withArticle = label.charAt(0).toLowerCase() + label.slice(1);
  return { icon: (t && t.icon) || '📋', one, label, withArticle };
}
function ntActCardHtml(a) {
  const x = ntActText(a);
  const isNew = a.zeit > ntPanelSeenBefore;
  const ico = /^</.test(String(x.ico)) ? x.ico : `<span class="nt-act-ico">${x.ico}</span>`;
  return `<div class="nt-card act${a.art === 'push' ? ' push' : ''}" data-ntact="act" data-actid=""${escapeHtml(a.id)}" data-ntkey="act:${escapeHtml(a.id)}" role="button" tabindex="0">
    <button type="button" class="nt-del" data-ntact="del" aria-label="Hinweis entfernen" title="Entfernen">×</button>
    <div class="nt-act-row">
      ${ico}
      <div class="min-w-0 flex-1"${a.art === 'push' ? '' : ' data-no-i18n'}>
        <div class="nt-act-main">${isNew ? `<span class="nt-dot" aria-label="${escapeHtml(ntTx('neu'))}"></span>` : ''}${x.main}</div>
        ${x.sub ? `<div class="nt-act-sub${x.long ? ' long' : ''}">${x.sub}</div>` : ''}
        ${x.extra ? `<div class="nt-act-bal">${x.extra}</div>` : ''}
        <div class="nt-act-time">${escapeHtml(ntWhen(a.zeit))}</div>
      </div>
    </div>
  </div>`;
}
// Address a notice opens when tapped (same format as the links of the push messages)
function ntActLink(a) {
  const first = a.eintraege[0] || {};
  const one = a.anzahl === 1 && first.id;
  const q = (k, v) => '/?' + k + '=' + encodeURIComponent(v || '1');
  switch (a.art) {
    case 'push': return a.link || '/';
    case 'einkauf': case 'einkaufsliste': case 'einkauf-ab': case 'einkauf-weg': case 'einkaufsliste-um':
      return getShoppingList(a.ziel) ? q('liste', a.ziel) : q('einkauf');
    case 'einkaufsliste-weg': case 'liste-weg': return q('einkauf');
    case 'liste': case 'liste-neu': case 'liste-ab': case 'liste-um':
      return lsGetList(a.ziel) ? q('listen', a.ziel) : q('einkauf');
    case 'essen': return q('essen', first.d);
    case 'rezept': return q('rezept', one ? first.id : '1');
    case 'aufgabe': case 'aufgabe-ab': return q('aufgabe', one ? first.id : '1');
    case 'termin': return q('termin', first.d);
    case 'vorrat': return q('vorrat', one ? first.id : '1');
    case 'mitglied': return q('mitglied', first.id);
    case 'notfallpass': return q('mitglied', a.ziel);
    case 'pinnwand': return q('pinnwand', one ? first.id : '1');
    case 'pinnwand-antwort': return q('pinnwand', a.ziel);
    case 'ausgabe': case 'ausgleich':
      return one ? q('ausgabe', first.id) + '&kasse=' + encodeURIComponent(a.ziel) : q('kasse', a.ziel);
    case 'fahrzeug-log':
      return one && first.f ? q('fahrzeug', first.f) + '&kasse=' + encodeURIComponent(a.ziel) : q('kasse', a.ziel);
    case 'vertrag': return (one ? q('vertrag', first.id) + '&' : '/?') + 'kasse=' + encodeURIComponent(a.ziel);
    case 'fahrzeug': return q('fahrzeug', one ? first.id : '1') + '&kasse=' + encodeURIComponent(a.ziel);
    case 'dokument': return q('dokument', one ? first.id : '1');
    default: return '/';
  }
}
// Tap: open the matching place (the notice is done with that)
function ntActOpen(id) {
  const a = ntActivities().find(x => x.id === id);
  if (!a) return;
  ntActHide(a);
  ntClosePanel();
  ntRefresh();
  ntOpenLink(ntActLink(a));
}
// Opens the place behind an app address (from the bell, from a push message tapped while the app
// is already open, or on start via ?aufgabe=… etc.). Result: true if recognised.
//   ?sos= ?heimweg= ?hinweise=1 ?ausgabe=(&kasse=) ?fahrzeug=(&kasse=) ?vertrag=(&kasse=) ?kasse=
//   ?dokument= ?pinnwand= ?familie= ?mitglied= ?aufgabe= ?termin= ?rezept= ?essen= ?vorrat=
//   ?listen= (packing/check lists …) ?liste= (shopping list) ?einkauf=1      (value 1 = page only)
function ntUseQuery(k, v) {
  try { history.replaceState(null, '', location.pathname + '?' + k + '=' + encodeURIComponent(v) + location.hash); } catch (e) { /* ignore */ }
}
function ntSwitchKasse(id) {
  if (!id || typeof kasseById !== 'function' || !kasseById(id)) return;
  if (activeKasseId !== id) kassenSetActive(id);
}
function ntOpenLink(url) {
  let p;
  try { p = new URL(url || '/', location.origin).searchParams; } catch (e) { return false; }
  const g = k => p.get(k) || '';
  const real = v => v && v !== '1';
  try {
    if (g('ausblick')) { abOpen(g('ausblick') === 'monat' ? 'monat' : 'woche'); return true; }
    if (g('wobistdu')) {
      if (!isCurrentUserGuest()) setTimeout(() => wbOpen(g('wobistdu')), 150);
      return true;
    }
    if (g('geburtstag')) {
      setView('uebersicht');
      if (memberById(g('geburtstag'))) setTimeout(() => ofsOpen(g('geburtstag')), 120);
      return true;
    }
    if (g('sos')) {
      if (sosEnabled()) { sosStarted = true; sosForceId = g('sos'); sosCheck(); }
      return true;
    }
    if (g('heimweg')) {
      if (sosEnabled()) { sosStarted = true; hwForceId = g('heimweg'); sosCheck(); }
      return true;
    }
    if (g('hinweise')) {
      const buys = ntPurchases();
      if (buys.length === 1) openShoppingPlanDone(buys[0].plan.id, buys[0].task.title);
      else ntOpenPanel();
      return true;
    }
    if (g('ausgabe')) {
      if (isCurrentUserGuest() || !isViewAllowed('finanzen')) return true;
      const id = g('ausgabe');
      const open = () => {
        const x = finServerList.find(e => e.id === id) || ausgaben.find(e => e.id === id);
        ntSwitchKasse((x && x.kasse) || g('kasse'));
        const log = fzLogById(id);
        if (log && isViewAllowed('fahrzeuge')) { fzOpenVehicle(log.vehicle); return; }
        setView('finanzen');
        finSetTab('ausgaben');
        const y = ausgaben.find(e => e.id === id);
        if (y) openExpenseModal({ expense: y });
      };
      if (!ausgabenLoaded) loadAusgaben().then(open, open); else open();
      return true;
    }
    if (g('fahrzeug')) {
      if (isCurrentUserGuest()) return true;
      ntSwitchKasse(g('kasse'));
      const id = g('fahrzeug');
      if (real(id) && fzVehicle(id)) fzOpenVehicle(id);
      else setView(isViewAllowed('fahrzeuge') ? 'fahrzeuge' : 'finanzen');
      return true;
    }
    if (g('konto')) { if (isViewAllowed('konto')) setView('konto'); return true; }
    if (g('vertrag')) {
      if (isCurrentUserGuest()) return true;
      ntSwitchKasse(g('kasse'));
      if (vtContract(g('vertrag'))) { ntUseQuery('vertrag', g('vertrag')); vtOpenFromUrl(); }
      else { setView('finanzen'); finSetTab('vertraege'); }
      return true;
    }
    if (g('kasse')) {
      if (isCurrentUserGuest() || !isViewAllowed('finanzen')) return true;
      if (kasseById(g('kasse'))) { ntSwitchKasse(g('kasse')); setView('finanzen'); }
      else { ntUseQuery('kasse', g('kasse')); kasseOpenFromUrl(); }
      return true;
    }
    if (g('dokument')) { ntUseQuery('dokument', g('dokument')); docOpenFromUrl(); return true; }
    if (g('pinnwand')) { ntUseQuery('pinnwand', g('pinnwand')); pwOpenFromUrl(); return true; }
    if (g('familie')) { ntUseQuery('familie', g('familie')); famOpenFromUrl(); return true; }
    if (g('mitglied')) {
      if (isViewAllowed('familie')) famOpenPass(g('mitglied'));
      return true;
    }
    if (g('haustier')) {
      if (isViewAllowed('familie') && !isCurrentUserGuest()) ptOpen(real(g('haustier')) ? g('haustier') : '');
      return true;
    }
    if (g('urlaub')) { setTimeout(() => wxOpen(g('urlaub')), 120); return true; }
    if (g('wetter')) { setTimeout(() => wxOpen('home'), 120); return true; }
    if (g('aufgabe')) {
      if (!isViewAllowed('aufgaben')) return true;
      const id = g('aufgabe');
      setView('aufgaben');
      // Since 1.57: tasks with their own input (e.g. meter readings) open that input directly
      if (real(id) && aufgaben.some(t => t.id === id)) openTaskFromLink(id);
      return true;
    }
    if (g('termin')) {
      if (isViewAllowed('termine') && /^\d{4}-\d{2}-\d{2}$/.test(g('termin'))) gsJumpToDay(g('termin'));
      else setView(isViewAllowed('termine') ? 'termine' : 'uebersicht');
      return true;
    }
    if (g('rezept')) {
      if (!isViewAllowed('rezepte')) return true;
      setView('rezepte');
      if (real(g('rezept')) && recipes.some(r => r.id === g('rezept'))) openRecipeDetailPage(g('rezept'));
      return true;
    }
    if (g('essen')) { setView(isViewAllowed('rezepte') ? 'rezepte' : 'uebersicht'); return true; }
    if (g('vorrat')) {
      if (!isViewAllowed('vorrat')) return true;
      if (g('vorrat') === 'ablauf') { pantryOnlyExpiring = true; pantryGroupMode = 'mhd'; }
      setView('vorrat');
      return true;
    }
    if (g('listen')) {
      if (!isViewAllowed('einkauf')) return true;
      setView('einkauf');
      if (lsGetList(g('listen'))) lsOpenList(g('listen'));
      return true;
    }
    if (g('liste')) {
      if (!isViewAllowed('einkauf')) return true;
      setView('einkauf');
      if (getShoppingList(g('liste'))) openShoppingList(g('liste'));
      return true;
    }
    if (g('einkauf')) { if (isViewAllowed('einkauf')) setView('einkauf'); return true; }
  } catch (e) { console.warn('Link öffnen fehlgeschlagen', url, e); }
  return false;
}
// The bell opens these addresses itself on start (the others - ?sos, ?heimweg, ?kasse, ?vertrag,
// ?dokument, ?pinnwand, ?familie - are already handled by their own sections during start-up)
var NT_START_LINKS = ['wobistdu', 'geburtstag', 'haustier', 'urlaub', 'wetter', 'ausblick', 'ausgabe', 'fahrzeug', 'mitglied', 'aufgabe', 'termin', 'rezept', 'essen', 'vorrat', 'listen', 'einkauf', 'konto'];

// Number on the bell: open expenses, running trips home, unread news and new family notices
function ntUpdateBadge() {
  const btn = document.getElementById('ntBellBtn');
  if (!btn) return { buys: [] };
  const buys = ntPurchases();
  const news = ntNews();
  const hwN = ntHeimwege().filter(h => h.aktiv).length;
  const actN = ntActUnseen().length;
  const n = buys.length + news.length + hwN + actN;
  const badge = document.getElementById('ntBellBadge');
  badge.textContent = n > 9 ? '9+' : String(n);
  badge.classList.toggle('hidden', !n);
  badge.classList.toggle('soft', !buys.length && !hwN);
  btn.classList.toggle('has', !!buys.length || !!hwN);
  btn.setAttribute('aria-label', n ? `Hinweise (${n})` : 'Hinweise');
  return { buys };
}
function ntRefresh() {
  const btn = document.getElementById('ntBellBtn');
  if (!btn) return;
  if (!familyRecordId || !ntStarted) { btn.classList.add('hidden'); return; }
  btn.classList.remove('hidden');
  const { buys } = ntUpdateBadge();
  // Newly open expenses (e.g. just ticked off in the shop) -> show notice
  const ids = buys.map(b => b.plan.id);
  if (ntKnownPending) {
    const fresh = ids.filter(id => !ntKnownPending.has(id) && id !== planDoneTaskId);
    if (fresh.length) { ntRing(); setTimeout(ntShowHint, 450); } // check after the booking popup that may open right away
  }
  ntKnownPending = new Set(ids);
  if (!buys.length) ntHideHint();
  // Was one of them ticked off automatically? Ask the server once
  const ask = buys.filter(b => !b.plan.auto && !ntAutoAsked.has(b.plan.id));
  if (ask.length) { ask.forEach(b => ntAutoAsked.add(b.plan.id)); ladenPlansSync(true); }
  if (ntPanelOpen) ntRenderPanel();
}
function ntRing() {
  const btn = document.getElementById('ntBellBtn');
  if (!btn) return;
  btn.classList.remove('ring');
  void btn.offsetWidth;
  btn.classList.add('ring');
}

/* ---------- Panel ---------- */
function ntPanelEl() {
  let el = document.getElementById('ntPanel');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ntPanel';
    el.className = 'nt-panel hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Hinweise');
    document.body.appendChild(el);
    el.addEventListener('click', ntPanelClick);
    ntWireSwipe(el);
  }
  return el;
}
function ntPlacePanel() {
  const el = ntPanelEl();
  const btn = document.getElementById('ntBellBtn');
  const r = btn.getBoundingClientRect();
  el.style.top = Math.round(r.bottom + 8) + 'px';
  if (window.innerWidth < 520) { el.style.left = '8px'; el.style.right = '8px'; el.style.width = 'auto'; }
  else {
    const w = Math.min(400, window.innerWidth - 16);
    el.style.width = w + 'px';
    el.style.right = 'auto';
    el.style.left = Math.round(Math.max(8, Math.min(r.left - 16, window.innerWidth - w - 8))) + 'px';
  }
}
function ntOpenPanel() {
  ntHideHint();
  ntPanelOpen = true;
  ntPanelSeenBefore = ntActState().seenAt;
  ntRenderPanel();
  ntPlacePanel();
  ntPanelEl().classList.remove('hidden');
  // New family notices now count as seen (dots stay while the bell is open)
  ntActMarkSeen();
  ntUpdateBadge();
  ntActFetch(false);
}
function ntClosePanel() {
  ntPanelOpen = false;
  const el = document.getElementById('ntPanel');
  if (el) el.classList.add('hidden');
}
function ntBuyCardHtml(b) {
  const a = b.plan.auto;
  const shops = b.lists.map(l => l.name || '').filter(Boolean).join(', ');
  const autoTxt = a ? (a.minuten ? ntT('automatisch abgehakt nach {0}', escapeHtml(ntDur(a.minuten))) : ntT('automatisch abgehakt')) + (a.wer ? ' · ' + escapeHtml(a.wer) : '') : '';
  return `<div class="nt-card buy" data-ntplan="${escapeHtml(b.plan.id)}" data-ntkey="buy:${escapeHtml(b.plan.id)}">
    <button type="button" class="nt-del" data-ntact="del" aria-label="Hinweis entfernen" title="Entfernen">×</button>
    <div class="flex items-center gap-2.5">
      <div class="nt-logos">${b.lists.slice(0, 3).map(l => shoppingListLogoHtml(l, 30)).join('')}</div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium leading-snug truncate">${escapeHtml(b.task.title || 'Einkauf')}</div>
        <div class="text-[11px] text-ink/55 leading-snug">${escapeHtml(shops)}${b.task.doneAt || a ? ' · ' + escapeHtml(ntWhen(b.task.doneAt || (a && a.zeit))) : ''}</div>
        ${autoTxt ? `<div class="text-[11px] text-ink/55 leading-snug" data-no-i18n>📍 ${autoTxt}</div>` : ''}
      </div>
    </div>
    <div class="flex gap-2 mt-2.5">
      <button type="button" class="fz-mini-btn primary flex-1" data-ntact="book">💶 Betrag eintragen</button>
      <button type="button" class="fz-mini-btn" data-ntact="skip">Ohne Beträge</button>
    </div>
  </div>`;
}
function ntNewsHtml(e) {
  const sym = { neu: '+', info: '~', fix: '*' };
  return `<div class="nt-card news" data-ntact="log" data-ntkey="news:${escapeHtml(e.v)}" role="button" tabindex="0" title="Im Versions-Log ansehen">
    <button type="button" class="nt-del" data-ntact="del" aria-label="Hinweis entfernen" title="Entfernen">×</button>
    <div class="flex items-baseline justify-between gap-2">
      <span class="text-sm font-medium">${escapeHtml(e.titel)}</span>
      <span class="text-[11px] text-ink/40 shrink-0">v${escapeHtml(e.v)} · ${escapeHtml(e.datum || '')}</span>
    </div>
    <ul class="nt-pts">${(e.punkte || []).map(p => `<li class="t-${escapeHtml(p[0])}"><span>${sym[p[0]] || '·'}</span><span>${escapeHtml(p[1])}</span></li>`).join('')}</ul>
  </div>`;
}
// Trips home (running and ended in the last hour) – stay available here even if the banner was removed
function ntHwKey(h) { return String(h.id) + ':' + (h.aktiv ? 'a' : 'e'); }
function ntHeimwege() {
  if (!(typeof sosEnabled === 'function' && sosEnabled())) return [];
  const hidden = new Set(ntHiddenRead(LS_NT_HIDDEN_HW));
  return hwList.filter(h => h && !hidden.has(ntHwKey(h)));
}
// Merge trips home of the same person on the same day into ONE card (the running or newest one
// is in front, the others appear as times below it)
function ntHwDay(h) {
  const t = Number(h.aktiv ? h.seit : (h.ende || h.seit)) || Date.now();
  return new Date(t).toDateString();
}
function ntHwTime(h) { return Number(h.aktiv ? h.seit : (h.ende || h.seit)) || 0; }
function ntHwGroups() {
  const map = new Map();
  ntHeimwege().forEach(h => {
    const k = (h.memberId || h.name || h.id) + '|' + ntHwDay(h);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(h);
  });
  return Array.from(map.values()).map(list => {
    list.sort((a, b) => ((b.aktiv ? 1 : 0) - (a.aktiv ? 1 : 0)) || (ntHwTime(b) - ntHwTime(a)));
    return { main: list[0], all: list };
  }).sort((a, b) => ((b.main.aktiv ? 1 : 0) - (a.main.aktiv ? 1 : 0)) || (ntHwTime(b.main) - ntHwTime(a.main)));
}
function ntHwCardHtml(g) {
  const h = g.main;
  const m = hwMember(h);
  const mine = hwIsMine(h);
  const nm = escapeHtml(hwName(h));
  let t, sub;
  if (h.aktiv) {
    t = mine ? ntT('Du bist unterwegs nach Hause') : ntT('{0} ist unterwegs nach Hause', nm);
    sub = [ntTx('seit {0}', ntClock(h.seit)), h.entfernung != null ? ntTx('noch {0}', hwKm(h.entfernung)) : '', h.aktuell && h.aktuell.adresse ? h.aktuell.adresse : ''].filter(Boolean).join(' · ');
  } else {
    t = h.grund === 'angekommen'
      ? (mine ? ntT('Du bist zu Hause angekommen') : ntT('{0} ist zu Hause angekommen', nm))
      : (mine ? ntT('Du hast den Heimweg beendet') : ntT('{0} hat den Heimweg beendet', nm));
    sub = ntClock(h.ende) + (h.minuten ? ' · ' + ntTx('{0} unterwegs', ntDur(h.minuten)) : '');
  }
  // More trips home on the same day: count and times
  let more = '';
  if (g.all.length > 1) {
    const today = new Date(ntHwTime(h)).toDateString() === new Date().toDateString();
    const times = g.all.slice(1).sort((a, b) => ntHwTime(a) - ntHwTime(b)).map(x => ntClock(ntHwTime(x))).filter(Boolean);
    more = ntTx(today ? '{0} Heimwege heute' : '{0} Heimwege an diesem Tag', g.all.length) + (times.length ? ' · ' + ntTx('außerdem {0}', times.join(', ')) : '');
  }
  const key = g.all.map(ntHwKey).join(',');
  return `<div class="nt-card hw${h.aktiv ? '' : ' done'}" style="--hw:${famAttr(h.aktiv ? famColor(m) : '#2F7D4F')}" data-ntact="hw" data-hwid="${famAttr(h.id)}" data-ntkey="hw:${famAttr(key)}" role="button" tabindex="0">
    <button type="button" class="nt-del" data-ntact="del" aria-label="Hinweis entfernen" title="Entfernen">×</button>
    <div class="flex items-center gap-2.5">
      <span class="fam-ava sm" style="--fam:${famAttr(famColor(m))}">${m ? famAvatarInner(m) : '<span class="fam-ava-in">🚶</span>'}</span>
      <div class="min-w-0 flex-1" data-no-i18n>
        <div class="text-sm font-medium leading-snug">${h.aktiv ? '🚶 ' : (h.grund === 'angekommen' ? '🏠 ' : '🏁 ')}${t}</div>
        <div class="text-[11px] text-ink/55 leading-snug truncate">${escapeHtml(sub)}</div>
        ${more ? `<div class="text-[11px] text-ink/45 leading-snug">${escapeHtml(more)}</div>` : ''}
      </div>
      <span class="text-ink/30 text-xl leading-none">›</span>
    </div>
  </div>`;
}
function ntRenderPanel() {
  const el = ntPanelEl();
  // Do not redraw in the middle of a swipe gesture or during "Clear all"
  if (ntClearing || (ntSwipe && ntSwipe.lock === 'x')) { ntRenderDeferred = true; return; }
  ntRenderDeferred = false;
  const buys = ntPurchases();
  const news = ntNews();
  const hws = ntHwGroups();
  const acts = ntActivities();
  const any = buys.length || news.length || hws.length || acts.length;
  let html = `<div class="nt-head">
      <span class="font-serif text-lg">Hinweise</span>
      <span class="flex items-center gap-1">
        ${any ? '<button type="button" class="nt-clear" data-ntact="clear">Alle löschen</button>' : ''}
        <button type="button" class="nt-x" data-ntact="close" aria-label="Schließen">×</button>
      </span>
    </div>`;
  if (hws.length) {
    html += `<div class="nt-sec">Heimweg</div>` + hws.map(ntHwCardHtml).join('');
  }
  if (buys.length) {
    html += `<div class="nt-sec">Ausgaben nachtragen</div>` + buys.map(ntBuyCardHtml).join('');
  }
  const mine = acts.filter(a => a.art === 'push');
  const family = acts.filter(a => a.art !== 'push');
  if (mine.length) {
    html += `<div class="nt-sec">Für dich</div>` + mine.map(ntActCardHtml).join('');
  }
  if (family.length) {
    html += `<div class="nt-sec">Neu in der Familie</div>` + family.map(ntActCardHtml).join('');
  }
  if (news.length) {
    html += `<div class="nt-sec flex items-center justify-between"><span>Neu in pinn.</span><button type="button" class="nt-link" data-ntact="read">Gelesen</button></div>` + news.map(ntNewsHtml).join('');
  }
  if (!any) {
    html += `<div class="nt-empty"><div class="text-3xl mb-1">✨</div><div class="text-sm">Alles erledigt</div><div class="text-[11px] text-ink/45 mt-1">Hier erscheinen deine Benachrichtigungen, Heimwege, Einkäufe, deren Ausgaben noch fehlen, alles, was die Familie einträgt oder ändert (Einkauf, Listen, Essen, Rezepte, Aufgaben, Termine, Vorrat, Pinnwand, Ausgaben, Verträge, Dokumente, Familie) und Neuerungen in pinn. – Antippen öffnet die passende Stelle.</div></div>`;
  }
  if (any) html += `<div class="nt-swipe-tip">Zum Entfernen eine Karte zur Seite wischen</div>`;
  el.innerHTML = html;
}
function ntPanelClick(e) {
  if (Date.now() - ntSwipeEndedAt < 450 || ntClearing) { e.preventDefault(); e.stopPropagation(); return; }
  const b = e.target.closest('[data-ntact]');
  if (!b) return;
  const card = b.closest('[data-ntplan]');
  const planId = card ? card.dataset.ntplan : '';
  switch (b.dataset.ntact) {
    case 'close': ntClosePanel(); break;
    case 'del': {
      e.stopPropagation();
      const c = b.closest('[data-ntkey]');
      if (c && ntDismissAllowed(c)) ntAnimateOut(c, 1, () => ntDismissCommit(c.dataset.ntkey));
      break;
    }
    case 'hw': ntClosePanel(); hwOpen(b.dataset.hwid || ''); break;
    case 'act': ntActOpen(b.dataset.actid || ''); break;
    case 'clear': e.stopPropagation(); ntClearAll(); break;
    case 'read': ntMarkNewsRead(); break;
    case 'log': ntClosePanel(); ntMarkNewsRead(); openChangelogTerminal(); break;
    case 'book': {
      const t = aufgaben.find(a => a.id === planId);
      ntClosePanel();
      openShoppingPlanDone(planId, t ? t.title : 'Einkauf');
      break;
    }
    case 'skip': {
      if (!confirm('Diesen Einkauf ohne Beträge abschließen? Die Artikel bleiben auf den Listen.')) return;
      shoppingPlans = shoppingPlans.map(p => p.id === planId ? { ...p, bookedAt: new Date().toISOString(), skipped: true } : p);
      persistState();
      renderTasks();
      ntRefresh();
      break;
    }
  }
}

/* ---------- Removing notices: swipe (touch) & × (desktop) ---------- */
// Shopping: is completed like "Without amounts" – so ask first
function ntDismissAllowed(card) {
  const key = String(card.dataset.ntkey || '');
  if (!key.startsWith('buy:')) return true;
  return confirm('Diesen Einkauf ohne Beträge abschließen? Die Artikel bleiben auf den Listen.');
}
function ntDismissCommit(key, noRefresh) {
  key = String(key || '');
  const i = key.indexOf(':');
  const kind = key.slice(0, i), id = key.slice(i + 1);
  if (!id) return;
  if (kind === 'news') ntHiddenAdd(LS_NT_HIDDEN_NEWS, id, 40);
  else if (kind === 'hw') id.split(',').filter(Boolean).forEach(k => ntHiddenAdd(LS_NT_HIDDEN_HW, k, 60));
  else if (kind === 'act') {
    const a = ntActivities().find(x => x.id === id);
    if (a) ntActHide(a);
    else {
      const st = ntActState();
      const x = st.list.find(y => y.id === id);
      st.hidden[id] = x ? x.zeit : Date.now();
      ntActSave();
    }
  } else if (kind === 'buy') {
    shoppingPlans = shoppingPlans.map(p => p.id === id ? { ...p, bookedAt: new Date().toISOString(), skipped: true } : p);
    if (!noRefresh) { persistState(); renderTasks(); }
  }
  if (!noRefresh) ntRefresh();
}
// Slide the card out, then collapse its height, then apply
function ntAnimateOut(card, dir, done) {
  if (card._ntOut) return;
  card._ntOut = true;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { done(); return; }
  card.style.transition = 'transform .2s ease-in, opacity .2s ease-in';
  card.style.transform = `translateX(${dir < 0 ? '-' : ''}115%)`;
  card.style.opacity = '0';
  setTimeout(() => ntCollapse(card, done), 200);
}
function ntSnapBack(card) {
  card.style.transition = 'transform .22s ease, opacity .22s ease';
  card.style.transform = '';
  card.style.opacity = '';
  setTimeout(() => { if (!card._ntOut) card.style.transition = ''; }, 240);
}
/* Swiping with touch gestures (more reliable than pointer events on iPhone/iPad):
   - the direction is fixed after a few pixels; horizontal keeps the panel still (no scrolling along)
   - a short, quick flick is enough, otherwise from a good quarter of the card width
   - the panel is not redrawn during the gesture (otherwise the card gets lost) */
function ntWireSwipe(panel) {
  let s = null;
  const finish = () => {
    const cur = s;
    s = null;
    ntSwipe = null;
    if (!cur || cur.lock !== 'x') return;
    ntSwipeEndedAt = Date.now();
    const card = cur.card;
    card.classList.remove('nt-dragging');
    const fast = Math.abs(cur.vx) > 0.35 && Math.abs(cur.dx) > 24 && Math.sign(cur.vx) === Math.sign(cur.dx);
    if (Math.abs(cur.dx) > cur.w * 0.28 || fast) {
      if (!ntDismissAllowed(card)) { ntSnapBack(card); if (ntRenderDeferred) setTimeout(ntRenderPanel, 260); return; }
      const dir = cur.dx < 0 ? -1 : 1;
      // let it fly on from the current position
      card.style.transition = 'transform .18s ease-out, opacity .18s ease-out';
      card.style.transform = `translate3d(${dir * (cur.w + 40)}px,0,0)`;
      card.style.opacity = '0';
      card._ntOut = true;
      setTimeout(() => ntCollapse(card, () => ntDismissCommit(card.dataset.ntkey)), 180);
    } else {
      ntSnapBack(card);
      if (ntRenderDeferred) setTimeout(ntRenderPanel, 260);
    }
  };
  panel.addEventListener('touchstart', (e) => {
    if (ntClearing || e.touches.length !== 1) { s = null; return; }
    const card = e.target.closest('.nt-card[data-ntkey]');
    if (!card || card._ntOut) { s = null; return; }
    const t = e.touches[0];
    s = { card, x0: t.clientX, y0: t.clientY, dx: 0, lock: '', vx: 0, lastX: t.clientX, lastT: Date.now(), w: card.offsetWidth || 300 };
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (!s) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - s.x0, dy = t.clientY - s.y0;
    if (!s.lock) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.1) { s = null; return; } // rather vertical: scroll the list
      s.lock = 'x';
      ntSwipe = s;
      s.card.classList.add('nt-dragging');
      s.card.style.transition = 'none';
    }
    if (e.cancelable) e.preventDefault();
    const now = Date.now();
    const v = (t.clientX - s.lastX) / Math.max(1, now - s.lastT);
    s.vx = s.vx * 0.3 + v * 0.7;
    s.lastX = t.clientX; s.lastT = now;
    s.dx = dx;
    s.card.style.transform = `translate3d(${dx}px,0,0)`;
    s.card.style.opacity = String(Math.max(0.3, 1 - Math.abs(dx) / (s.w * 1.2)));
  }, { passive: false });
  panel.addEventListener('touchend', finish);
  panel.addEventListener('touchcancel', finish);
}
// Collapse the height of a card (already slid out)
function ntCollapse(card, done) {
  const h = card.offsetHeight;
  card.style.height = h + 'px';
  card.style.overflow = 'hidden';
  void card.offsetHeight;
  card.style.transition = 'height .2s ease, margin .2s ease, padding .2s ease, border-width .2s ease';
  card.style.height = '0px';
  card.style.marginBottom = '0px';
  card.style.paddingTop = '0px';
  card.style.paddingBottom = '0px';
  card.style.borderWidth = '0px';
  setTimeout(done, 210);
}
// "Clear all": cards glide out to the left, slightly staggered, the list empties, then "All done"
function ntClearAll() {
  if (ntClearing) return;
  const panel = ntPanelEl();
  const cards = Array.from(panel.querySelectorAll('.nt-card[data-ntkey]'));
  if (!cards.length) return;
  const buyN = cards.filter(c => String(c.dataset.ntkey).startsWith('buy:')).length;
  if (buyN && !confirm(buyN === 1
    ? 'Dabei wird auch ein offener Einkauf ohne Beträge abgeschlossen. Die Artikel bleiben auf den Listen. Alle Hinweise löschen?'
    : `Dabei werden auch ${buyN} offene Einkäufe ohne Beträge abgeschlossen. Die Artikel bleiben auf den Listen. Alle Hinweise löschen?`)) return;
  const keys = cards.map(c => c.dataset.ntkey);
  const commit = () => {
    keys.forEach(k => ntDismissCommit(k, true));
    if (buyN) { persistState(); renderTasks(); }
    ntClearing = false;
    ntRefresh();
    ntRenderPanel();
  };
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { commit(); return; }
  ntClearing = true;
  const btn = panel.querySelector('[data-ntact="clear"]');
  if (btn) btn.disabled = true;
  // hide section headings and tip
  panel.querySelectorAll('.nt-sec, .nt-swipe-tip').forEach(x => {
    x.style.transition = 'opacity .25s ease';
    x.style.opacity = '0';
  });
  const step = Math.max(45, Math.min(110, Math.round(900 / cards.length)));
  cards.forEach((card, i) => {
    card._ntOut = true;
    setTimeout(() => {
      card.style.transition = 'transform .34s cubic-bezier(.45,0,.75,.4), opacity .34s ease-in';
      card.style.transform = 'translate3d(-115%,0,0)';
      card.style.opacity = '0';
      setTimeout(() => ntCollapse(card, () => {}), 300);
    }, i * step);
  });
  setTimeout(() => {
    panel.querySelectorAll('.nt-sec, .nt-swipe-tip').forEach(x => {
      x.style.transition = 'max-height .2s ease, margin .2s ease';
      x.style.maxHeight = x.offsetHeight + 'px';
      x.style.overflow = 'hidden';
      void x.offsetHeight;
      x.style.maxHeight = '0px';
      x.style.margin = '0px';
    });
    setTimeout(commit, 220);
  }, (cards.length - 1) * step + 300 + 220);
}

/* ---------- Notice when opening ---------- */
function ntShowHint() {
  const buys = ntPurchases();
  if (!buys.length || ntPanelOpen) return;
  if (!document.getElementById('shoppingPlanDoneModal').classList.contains('hidden')) return;
  let el = document.getElementById('ntHint');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ntHint';
    el.className = 'nt-hint hidden';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-nthint]');
      if (!b) return;
      if (b.dataset.nthint === 'x') { ntHideHint(); return; }
      const list = ntPurchases();
      ntHideHint();
      if (list.length === 1) openShoppingPlanDone(list[0].plan.id, list[0].task.title);
      else ntOpenPanel();
    });
  }
  const one = buys.length === 1 ? buys[0] : null;
  el.innerHTML = `<span class="text-xl leading-none">🛒</span>
    <span class="min-w-0 flex-1 text-sm leading-snug">${one
      ? `<b>${escapeHtml(one.task.title || 'Einkauf')}</b> ist erledigt – Ausgaben noch eintragen?`
      : `<b>${buys.length} Einkäufe</b> ohne eingetragene Ausgaben`}</span>
    <button type="button" class="nt-hint-btn" data-nthint="go">${one ? 'Eintragen' : 'Ansehen'}</button>
    <button type="button" class="nt-hint-x" data-nthint="x" aria-label="Schließen">×</button>`;
  const header = document.querySelector('#appShell > header');
  el.style.top = Math.round((header ? header.getBoundingClientRect().bottom : 60) + 8 + hwBannerOffset()) + 'px';
  el.classList.remove('hidden');
}
function ntHideHint() {
  const el = document.getElementById('ntHint');
  if (el) el.classList.add('hidden');
}

/* ---------- Start & wiring ---------- */
function ntStart() {
  ntStarted = true;
  // Outlook: check the banner (finances may only be loaded a little later)
  try { abStart(); setTimeout(() => { try { abRenderBanner(); } catch (e) { /* ignore */ } }, 5000); } catch (e) { /* ignore */ }
  ntActMem = null; // profile may have changed (dashboard)
  ntRefresh();
  ntActFetch(true);
  if (!isCurrentUserGuest()) {
    ladenFlush();
    ladenPlansSync(true);
    if (!ladenCachedPlaces().length) ladenRefreshCache();
  }
  // From a push message: ?hinweise=1 (enter amount) or ?liste=<ID> (arrived at the shop)
  const wantPanel = ntUrlParams.get('hinweise');
  const listId = ntUrlParams.get('liste');
  if (wantPanel || listId) {
    try {
      const q = new URLSearchParams(location.search);
      q.delete('hinweise'); q.delete('liste');
      const rest = q.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    } catch (e) { /* ignore */ }
  }
  if (listId && getShoppingList(listId) && isViewAllowed('einkauf')) {
    setView('einkauf');
    openShoppingList(listId);
  }
  // From a push message or a notice: open ?aufgabe=, ?termin=, ?ausgabe= … directly
  const linkKey = NT_START_LINKS.find(k => ntUrlParams.get(k));
  if (linkKey) {
    const target = '/?' + ntUrlParams.toString();
    try {
      const q = new URLSearchParams(location.search);
      NT_START_LINKS.concat(['kasse']).forEach(k => q.delete(k));
      const rest = q.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    } catch (e) { /* ignore */ }
    ntUrlParams = new URLSearchParams('');
    setTimeout(() => ntOpenLink(target), 50);
  }
  if (wantPanel) {
    const buys = ntPurchases();
    if (buys.length === 1) openShoppingPlanDone(buys[0].plan.id, buys[0].task.title);
    else ntOpenPanel();
  } else {
    setTimeout(ntShowHint, 900);
  }
}
(function wireBell() {
  const btn = document.getElementById('ntBellBtn');
  if (!btn) return;
  btn.classList.add('hidden');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ntPanelOpen) ntClosePanel(); else ntOpenPanel();
  });
  document.addEventListener('click', (e) => {
    if (!ntPanelOpen) return;
    if (!e.target.isConnected) return; // panel was just redrawn
    if (e.target.closest('#ntPanel') || e.target.closest('#ntBellBtn')) return;
    ntClosePanel();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ntPanelOpen) ntClosePanel(); });
  window.addEventListener('resize', () => { if (ntPanelOpen) ntPlacePanel(); });
  // Service worker: new push message -> reload the bell immediately; notification tapped while
  // pinn. is open -> open the matching place (SOS and way home open their sections themselves)
  try {
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (ev) => {
      const d = ev.data || {};
      if (d.type === 'pinn-push') {
        if (ntStarted) setTimeout(() => ntActFetch(true), 1200);
        return;
      }
      if (d.type !== 'pinn-open' || !ntStarted) return;
      let p = null;
      try { p = new URL(d.url || '/', location.origin).searchParams; } catch (e) { p = null; }
      if (!p || p.get('sos') || p.get('heimweg')) return;
      ntOpenLink(d.url);
      ntActFetch(true);
    });
  } catch (e) { /* ignore */ }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { ntHiddenAt = Date.now(); return; }
    if (!ntStarted) return;
    ladenFlush();
    ntActFetch(true);
    // After a longer break this counts like opening again: show open expenses again
    if (ntHiddenAt && Date.now() - ntHiddenAt > 10 * 60 * 1000) setTimeout(ntShowHint, 1500);
  });
  window.addEventListener('online', () => { if (ntStarted) { ladenFlush(); ladenPlansSync(true); ntActFetch(true); } });
  // Fetch family news regularly while pinn. is visible
  setInterval(() => { if (ntStarted && document.visibilityState === 'visible') ntActFetch(false); }, 90 * 1000);
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('hinweise');

/* pinn. – Waste calendar (js/muellkalender.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the waste calendar of the family (loadMuell, muellApply, cache, muellArtFarbe) and muellCalendarEvents, which adds
   the collection dates to the calendar as read-only entries. The settings page is in js/einstellungen.js. */

/* ---------- Waste calendar (Settings → Calendar, pb_hooks/muell.pb.js) ----------
   Exactly one waste calendar per family on the server. On the device it is only cached (offline);
   it is requested with the known state – if unchanged, the server only sends a short answer. */
var LS_MUELL = 'pinn.muell';              // { familie, stand, kalender, termine, darf, ki }
var muellData = null;                     // { kalender: { quelle, arten, ausgeblendet, anzeigen, anzahl, bis, … }, termine: [{ d, t }], stand }
var muellCanEdit = false;
var muellKi = false;
var muellServerMissing = false;
var muellLoading = false;
var muellSig = '';
var muellList = [];
function muellLoadCache(familyId) {
  muellData = null;
  muellSig = '';
  if (!familyId) return;
  try {
    const c = JSON.parse(localStorage.getItem(LS_MUELL) || 'null');
    if (c && c.familie === familyId) {
      muellData = c.kalender ? { kalender: c.kalender, termine: Array.isArray(c.termine) ? c.termine : [], stand: c.stand || 0 } : null;
      muellCanEdit = !!c.darf;
      muellKi = !!c.ki;
    }
  } catch (e) { /* broken cache */ }
}
function muellWriteCache(familyId) {
  try {
    localStorage.setItem(LS_MUELL, JSON.stringify({
      familie: familyId, stand: muellData ? muellData.stand : 0,
      kalender: muellData ? muellData.kalender : null, termine: muellData ? muellData.termine : [],
      darf: muellCanEdit, ki: muellKi,
    }));
  } catch (e) { /* full */ }
}
function muellArtFarbe(name) {
  const a = muellData && muellData.kalender && Array.isArray(muellData.kalender.arten) ? muellData.kalender.arten.find(x => x.name === name) : null;
  return (a && a.farbe) || '#7A6F5A';
}
// Additional calendar entries (read only): collection dates
function muellCalendarEvents() {
  if (!muellData || !muellData.kalender || muellData.kalender.anzeigen === false) return [];
  const k = muellData.kalender;
  const hidden = Array.isArray(k.ausgeblendet) ? k.ausgeblendet : [];
  const sig = (muellData.stand || 0) + '|' + hidden.join(',') + '|' + (muellData.termine || []).length;
  if (sig === muellSig) return muellList;
  const quelle = k.quelle && k.quelle.anbieter ? ' · ' + k.quelle.anbieter : '';
  const out = [];
  (muellData.termine || []).forEach((x, i) => {
    if (!x || !x.d || hidden.includes(x.t)) return;
    out.push({
      id: 'pinn-mk-' + x.d + '-' + i, date: x.d, time: '', endTime: null, title: x.t, memberId: null, location: '',
      description: tk('waste.collectionOf', { type: x.t }) + quelle, fullDayFiller: false, pinnHref: '', pinnCalName: '', isRecurring: false,
      pinnHoliday: 'muell', pinnColor: muellArtFarbe(x.t),
    });
  });
  muellSig = sig;
  muellList = out;
  return out;
}
function muellApply(body, familyId) {
  if (body && typeof body.darfAendern === 'boolean') muellCanEdit = body.darfAendern;
  if (body && typeof body.ki === 'boolean') muellKi = body.ki;
  if (!(body && body.unveraendert)) {
    muellData = body && body.kalender ? { kalender: body.kalender, termine: Array.isArray(body.termine) ? body.termine : [], stand: body.stand || Date.now() } : null;
    muellSig = '';
    try { rebuildEvents(); renderCalendar(); } catch (e) { /* calendar not built yet */ }
  }
  muellWriteCache(familyId);
  try { renderMuellSettings(); } catch (e) { /* not built yet */ }
}
async function loadMuell(force) {
  const fam = outboxFamily();
  if (!fam || muellLoading || !pb.authStore.token) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  muellLoading = true;
  try {
    const stand = !force && muellData ? muellData.stand : 0;
    const res = await apiFetch('/api/pinn/muell' + (stand ? '?stand=' + encodeURIComponent(stand) : ''), { cache: 'no-store' });
    if (res.status === 404) { muellServerMissing = true; try { renderMuellSettings(); } catch (e) { /* ignore */ } return; }
    if (!res.ok) return;
    const body = await res.json();
    muellServerMissing = false;
    if (outboxFamily() === fam) muellApply(body, fam);
  } catch (e) {
    /* offline: the cache stays */
  } finally {
    muellLoading = false;
  }
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('muellkalender');

/* pinn. – Trips in the calendar (js/reisen.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: packing lists with destination and period shown as read-only all-day entries in the calendar
   (tripCalendarEvents, refreshTripCalendar), the client copy of the travel-word check (calTravelKind) and the helpers
   that link a multi-day appointment to its packing list (calEventRange, calPackListForRange). The entries are merged
   into the calendar by rebuildEvents (js/offline.js); the packing lists themselves are in js/listen.js. */

/* ---------- Trips in the calendar (1.62) ----------
   Packing lists with destination and period appear as all-day entries ("Urlaub") on every day of the
   trip – read-only. Tap opens the packing list, long press shows the links (packing list, holiday weather). */
let tripCalSig = '';
let tripCalList = [];
function tripCalendarEvents() {
  let lists = [];
  try { lists = (familyLists || []).filter(l => l && l.type === 'pack' && lsVisible(l) && tripValid(l)); } catch (e) { return []; }
  const sig = lists.map(l => [l.id, l.trip.from, tripTo(l), l.name, l.icon, l.trip.place.titel].join('~')).join('|');
  if (sig === tripCalSig) return tripCalList;
  const out = [];
  lists.forEach(l => {
    const to = tripTo(l);
    const title = (l.icon || '🧳') + ' ' + (l.name || tripName(l));
    const where = [l.trip.place.titel, l.trip.place.zusatz].filter(Boolean).join(', ');
    let d = l.trip.from, guard = 0;
    while (d <= to && guard++ < 60) {
      out.push({
        id: 'pinn-trip-' + l.id + '-' + d, date: d, time: '', endTime: null, title, memberId: null, location: where,
        description: hcFmtDate(l.trip.from) + ' – ' + hcFmtDate(to), fullDayFiller: false, pinnHref: '', pinnCalName: '',
        isRecurring: false, pinnHoliday: 'urlaub', pinnTripList: l.id,
      });
      d = addDaysToDateStr(d, 1);
    }
  });
  tripCalSig = sig;
  tripCalList = out;
  return out;
}
// After changing a packing list: show the trip in the calendar right away
function refreshTripCalendar() { try { rebuildEvents(); renderCalendar(); } catch (e) { /* calendar not built yet */ } }
// Client copy of pb_hooks/pinn-packliste.js#travelKind: does the title sound like a trip?
function calTravelKind(title) {
  const t = ' ' + String(title || '').toLowerCase() + ' ';
  if (/(bank holiday|public holiday|feiertag|urlaubsantrag|urlaubsplanung)/.test(t)) return '';
  if (/(dienstreise|geschäftsreise|geschaeftsreise|business trip|viaje de negocios|déplacement|deplacement|voyage d'affaires)/.test(t)) return 'geschaeftsreise';
  const words = t.match(/[a-zäöüßéèêàâçñáíóúû]+/g) || [];
  const not = ['preise', 'preisen', 'kreise', 'kreisen', 'greise', 'reisebüro', 'reisekosten', 'reisekostenabrechnung'];
  const travel = ['kurztrip', 'städtetrip', 'staedtetrip', 'wochenendtrip', 'klassenfahrt', 'kreuzfahrt', 'roadtrip', 'vacation', 'vacations', 'holiday', 'holidays', 'trip', 'travel', 'journey', 'cruise', 'vacances', 'voyage', 'séjour', 'sejour', 'congés', 'conges', 'croisière', 'croisiere', 'vacaciones', 'viaje', 'escapada', 'crucero'];
  const hit = words.some(w => !not.includes(w) && (w.includes('urlaub') || /reisen?$/.test(w) || travel.includes(w)));
  return hit || /ferien (in|auf|am|an|bei|im)\b/.test(t) ? 'urlaub' : '';
}
// First and last day of a (multi-day) appointment from its single days
function calEventRange(ev) {
  let from = ev.date, to = ev.date;
  (events || []).forEach(e => {
    if (e === ev || e.title !== ev.title || (e.pinnHref || '') !== (ev.pinnHref || '') || !e.date) return;
    if (Math.abs(daysBetweenDateStrs(ev.date, e.date)) > 21) return;
    if (e.date < from) from = e.date;
    if (e.date > to) to = e.date;
  });
  return { from, to };
}
function calPackListForRange(from, to) {
  try { return (familyLists || []).find(l => l && l.type === 'pack' && lsVisible(l) && (() => { const f = (l.trip && l.trip.from) || l.date || ''; return f && f >= addDaysToDateStr(from, -3) && f <= to; })()) || null; } catch (e) { return null; }
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('reisen');

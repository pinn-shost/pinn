/* pinn. – Holidays in the calendar (js/feiertage.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: public holidays calculated locally per federal state (hcPublicHolidays, hcEaster), school holidays from the server
   (hcLoadSchoolHolidays, cache) and homeCalendarEvents, which adds both to the calendar as read-only entries. */

/* ---------- Public holidays (local) and school holidays (server) in the calendar ---------- */
var LS_SCHOOL_HOLIDAYS = 'pinn.schulferien'; // { 'NW|2026': { ts, liste: [{ name, von, bis }] } }
var hcSig = '';
var hcList = [];
var hcLoadingSchool = false;
function hcInvalidate() { hcSig = ''; }
function hcEaster(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
// Public holidays per federal state; regional = only in parts of the state
function hcPublicHolidays(y, bl) {
  const easter = hcEaster(y);
  const off = (n) => { const d = new Date(easter); d.setDate(d.getDate() + n); return isoDate(d); };
  const fix = (m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const bb = (() => { const d = new Date(y, 10, 22); while (d.getDay() !== 3) d.setDate(d.getDate() - 1); return isoDate(d); })();
  const rows = [
    [fix(1, 1), tk('holiday.newYear')],
    [fix(1, 6), tk('holiday.epiphany'), ['BW', 'BY', 'ST']],
    [fix(3, 8), tk('holiday.womensDay'), (bl === 'BE' && y >= 2019) || (bl === 'MV' && y >= 2023) ? [bl] : []],
    [off(-2), tk('holiday.goodFriday')],
    [off(0), tk('holiday.easterSunday'), ['BB']],
    [off(1), tk('holiday.easterMonday')],
    [fix(5, 1), tk('holiday.labourDay')],
    [off(39), tk('holiday.ascension')],
    [off(49), tk('holiday.whitSunday'), ['BB']],
    [off(50), tk('holiday.whitMonday')],
    [off(60), tk('holiday.corpusChristi'), ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'], ['SN', 'TH']],
    [fix(8, 15), tk('holiday.assumption'), ['SL'], ['BY']],
    [fix(9, 20), tk('holiday.childrensDay'), y >= 2019 ? ['TH'] : []],
    [fix(10, 3), tk('holiday.germanUnity')],
    [fix(10, 31), tk('holiday.reformation'), ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']],
    [fix(11, 1), tk('holiday.allSaints'), ['BW', 'BY', 'NW', 'RP', 'SL']],
    [bb, tk('holiday.repentance'), ['SN']],
    [fix(12, 25), tk('holiday.christmas1')],
    [fix(12, 26), tk('holiday.christmas2')],
  ];
  const out = [];
  rows.forEach(([date, name, only, regional]) => {
    if (!only || only.includes(bl)) out.push({ date, name, regional: false });
    else if (regional && regional.includes(bl)) out.push({ date, name, regional: true });
  });
  return out;
}
function hcSchoolStore() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_SCHOOL_HOLIDAYS) || '{}');
    return (o && typeof o === 'object') ? o : {};
  } catch (e) { return {}; }
}
function hcFmtDate(d) {
  const p = String(d).split('-');
  if (p.length !== 3) return d;
  try { return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(sysLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return `${p[2]}.${p[1]}.${p[0]}`; }
}
// Name of a German federal state in the app language (the codes in HOME_LAENDER stay the saved values)
// (keys written out in full so that the key check finds them)
const HOME_STATE_KEYS = {
  BW: 'state.BW',
  BY: 'state.BY',
  BE: 'state.BE',
  BB: 'state.BB',
  HB: 'state.HB',
  HH: 'state.HH',
  HE: 'state.HE',
  MV: 'state.MV',
  NI: 'state.NI',
  NW: 'state.NW',
  RP: 'state.RP',
  SL: 'state.SL',
  SN: 'state.SN',
  ST: 'state.ST',
  SH: 'state.SH',
  TH: 'state.TH',
};
function homeStateLabel(bl) {
  const key = HOME_STATE_KEYS[bl];
  return key ? tk(key) : ((typeof HOME_LAENDER !== 'undefined' && HOME_LAENDER[bl]) || bl);
}
// Additional calendar entries (read only): public holidays and school holidays
function homeCalendarEvents() {
  const bl = homeBundesland();
  if (!bl) return [];
  const o = homeOptions || {};
  const showHol = o.feiertage !== false, showSchool = o.ferien !== false;
  if (!showHol && !showSchool) return [];
  const y = new Date().getFullYear();
  const store = showSchool ? hcSchoolStore() : {};
  const keys = Object.keys(store).filter(k => k.indexOf(bl + '|') === 0).sort();
  const sig = [bl, showHol, showSchool, y, keys.map(k => k + ':' + (store[k].ts || 0)).join(',')].join('|');
  if (sig === hcSig) return hcList;
  const land = homeStateLabel(bl);
  const mk = (id, date, title, desc, kind) => ({
    id, date, time: '', endTime: null, title, memberId: null, location: '', description: desc,
    fullDayFiller: false, pinnHref: '', pinnCalName: '', isRecurring: false, pinnHoliday: kind,
  });
  const out = [];
  if (showHol) {
    for (let yy = y - 1; yy <= y + 2; yy++) {
      hcPublicHolidays(yy, bl).forEach(h => out.push(mk('pinn-ft-' + h.date, h.date, h.name,
        h.regional ? tk('holiday.regional', { state: land }) : tk('holiday.public', { state: land }), 'feiertag')));
    }
  }
  if (showSchool) {
    const seen = new Set();
    keys.forEach(k => (store[k].liste || []).forEach(f => {
      const sk = f.von + '|' + f.name;
      if (seen.has(sk) || !f.von || !f.bis) return;
      seen.add(sk);
      const desc = tk('holiday.school', { state: land, from: hcFmtDate(f.von), to: hcFmtDate(f.bis) });
      let d = f.von, guard = 0;
      while (d <= f.bis && guard++ < 120) {
        out.push(mk('pinn-sf-' + d + '-' + sk, d, f.name, desc, 'ferien'));
        d = addDaysToDateStr(d, 1);
      }
    }));
  }
  hcSig = sig;
  hcList = out;
  return out;
}
async function hcLoadSchoolHolidays(force) {
  const bl = homeBundesland();
  const o = homeOptions || {};
  if (!bl || o.ferien === false || hcLoadingSchool || !outboxFamily() || !pb.authStore.token) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const y = new Date().getFullYear();
  const store = hcSchoolStore();
  const years = [y - 1, y, y + 1].filter(yy => {
    const c = store[bl + '|' + yy];
    if (force || !c) return true;
    const maxAge = (Array.isArray(c.liste) && c.liste.length ? 7 : 1) * 86400000;
    return Date.now() - (Number(c.ts) || 0) > maxAge;
  });
  if (!years.length) return;
  hcLoadingSchool = true;
  let changed = false;
  try {
    for (const yy of years) {
      try {
        const res = await apiFetch('/api/pinn/zuhause/ferien?jahr=' + yy, { cache: 'no-store' });
        if (!res.ok) continue;
        const b = await res.json();
        if (b.error || b.bundesland !== bl || !Array.isArray(b.ferien)) continue;
        store[bl + '|' + yy] = { ts: Date.now(), liste: b.ferien };
        changed = true;
      } catch (e) { break; }
    }
  } finally {
    hcLoadingSchool = false;
  }
  if (!changed) return;
  Object.keys(store).forEach(k => {
    const parts = k.split('|');
    if (parts[0] !== bl || Number(parts[1]) < y - 1) delete store[k];
  });
  try { localStorage.setItem(LS_SCHOOL_HOLIDAYS, JSON.stringify(store)); } catch (e) { /* full */ }
  hcInvalidate();
  try { rebuildEvents(); renderCalendar(); } catch (e) { /* ignore */ }
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('feiertage');

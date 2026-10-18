/* pinn. – Calendar sources, names & colours (js/kalenderquellen.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: ICS helpers (unfoldICS, unescapeICSText, hexToRgba), own calendars (pinnCals, readPinnCalsFromIcs, setPinnCals),
   calendar labels, the sort order of all calendar lists (calListCompare, system calendars on top) and the colour of an
   appointment (colorForCalendarEvent). Reading the calendar file is in js/icsparser.js, loading it in js/kalenderdatei.js. */

/* ==========================================================
   Apple calendar import (kalender.ics, written by pb_hooks/cron_calendar.pb.js)
   ========================================================== */
function unfoldICS(text) {
  if (!text) return '';
  // ICS lines may be wrapped after 75 characters (the continuation starts with a space/tab)
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}
function unescapeICSText(s) {
  return (s || '').replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}
const ICS_EVENT_COLOR = '#3E7CA6'; // Fallback colour in case a calendar has no colour of its own (yet)

// Converts #rrggbb into an rgba(...) with the desired opacity - for the transparent
// (not opaque) appointment background.
function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
/* ---------- Own calendars (pb_hooks/kalender.pb.js + pinn-kalender.js) ----------
   Every profile can create any number of own calendars – „Nur für mich“ (private) or „Ganze Familie“
   (shared). The appointments are stored on the pinn. server. The server appends them to the calendar file
   (/api/pinn/kalender) – only those the profile may see – and delivers the calendar list as
   X-PINN-KALENDER lines at the same time (so also offline from the cached file).
   In the app the calendars are called „pinn:<id>“ (X-PINN-CALNAME), their appointments „pinn-termin:<id>“. */
const PINN_CAL_PREFIX = 'pinn:';
const PINN_CAL_COLORS = ['#2F4B41', '#3E7CA6', '#7A5C8E', '#B85C5C', '#B9842E', '#5C8A3E', '#2A9D8F', '#C0567A', '#D9822B', '#546E7A'];
let pinnCals = [];
function isPinnCalName(n) { return typeof n === 'string' && /^pinn:[a-z0-9]{15}$/.test(n); }
function pinnCalByName(n) { return isPinnCalName(n) ? (pinnCals.find(c => PINN_CAL_PREFIX + c.id === n) || null) : null; }
function readPinnCalsFromIcs(text) {
  const list = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    if (line.indexOf('X-PINN-KALENDER:') !== 0) return;
    try { const c = JSON.parse(line.slice(16)); if (c && c.id) list.push(c); } catch (e) { /* broken line */ }
  });
  return list;
}
function setPinnCals(list) {
  const next = Array.isArray(list) ? list : [];
  const changed = JSON.stringify(next) !== JSON.stringify(pinnCals);
  pinnCals = next;
  if (changed) { try { renderPinnCalSettings(); } catch (e) { /* settings not built yet */ } }
}
// Display name of a calendar (own calendars: name instead of „pinn:<id>“)
function calendarLabel(name) {
  const c = pinnCalByName(name);
  if (c) return c.name + (c.geteilt ? '' : ' 🔒') + (c.quelle === 'apple' ? ' · iCloud' : c.quelle === 'google' ? ' · Google' : '');
  return isPinnCalName(name) ? 'Eigener Kalender' : (name || '');
}
function calendarCount() { return appleCalendar.selectedCalendars.length + pinnCals.length; }
// School holidays, waste collection, school & daycare (system calendars): shown smaller and always at the very top
function isMinorCalEvent(ev) { return !!(ev && (ev.pinnHoliday === 'ferien' || ev.pinnHoliday === 'muell' || ev.pinnHoliday === 'schule')); }
// 1.62: trips (packing lists with destination and period) also stand at the very top, in normal size
function calTopRank(ev) { return isMinorCalEvent(ev) || (ev && ev.pinnHoliday === 'urlaub') ? 1 : 0; }
function minorSortWeight(a, b) { return calTopRank(b) - calTopRank(a); }
// Start time in minutes (-1 = all-day). Robust against spellings like „9:05“, „09:05“ or „0905“.
function calEventStartMin(ev) {
  if (!ev || ev.fullDayFiller || !ev.time) return -1;
  const m = String(ev.time).match(/(\d{1,2})\D?(\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : -1;
}
function calEventEndMin(ev) {
  if (!ev || !ev.endTime) return 24 * 60;
  const m = String(ev.endTime).match(/(\d{1,2})\D?(\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : 24 * 60;
}
// Common order for all calendar lists: system calendars (holidays/waste/school) always at the very top,
// then all active calendars together by time – all-day first, then by start, end and
// title. Person filters only dim, they don't re-sort.
function calListCompare(a, b) {
  const w = minorSortWeight(a, b);
  if (w) return w;
  const sa = calEventStartMin(a), sb = calEventStartMin(b);
  if (sa !== sb) return sa - sb;
  const ea = calEventEndMin(a), eb = calEventEndMin(b);
  if (ea !== eb) return ea - eb;
  return String(a.title || '').localeCompare(String(b.title || ''));
}

// Returns the calendar colour assigned to the appointment (fixed in the settings), or
// the neutral fallback colour if no colour is stored for this calendar (yet).
function colorForCalendarEvent(ev) {
  if (ev && ev.pinnHoliday === 'muell') return ev.pinnColor || '#7A6F5A'; // Waste calendar (colour per type of waste)
  if (ev && ev.pinnHoliday === 'schule') return ev.pinnColor || '#8E5BB5'; // School & daycare (colour of the child)
  if (ev && ev.pinnHoliday === 'urlaub') return ev.pinnColor || '#D9822B'; // trip (packing list, 1.62)
  if (ev && ev.pinnHoliday) return ev.pinnHoliday === 'ferien' ? '#2E9C7A' : '#C0392B'; // School holidays / public holidays (home)
  const pc = ev && pinnCalByName(ev.pinnCalName); // own calendar
  if (pc) return pc.farbe || ICS_EVENT_COLOR;
  if (ev && ev.pinnCalName && appleCalendar.calendarColors[ev.pinnCalName]) {
    return appleCalendar.calendarColors[ev.pinnCalName];
  }
  return ICS_EVENT_COLOR;
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('kalenderquellen');

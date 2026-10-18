/* pinn. – ICS parser (js/icsparser.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: reading the calendar file (parseICS, parseICSDateField, parseICSDuration), expanding recurring appointments
   (parseRRule, expandRecurrence) and spreading multi-day appointments over one entry per day (expandMultiDaySpan),
   plus small date helpers (toMinutes, pad2, addDaysToDateStr, daysBetweenDateStrs). */

function parseICSDateField(line) {
  const idx = line.indexOf(':');
  if (idx === -1) return null;
  const params = line.slice(0, idx);
  const value = line.slice(idx + 1).trim();
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mi, ss, isUtc] = m;
  if (hh === undefined || /VALUE=DATE(?!-TIME)/.test(params)) {
    return { date: `${y}-${mo}-${d}`, time: null };
  }
  if (isUtc) {
    // Convert UTC time -> to the browser's local time zone
    const dt = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mi, +(ss || 0)));
    const pad = n => String(n).padStart(2, '0');
    return { date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}` };
  }
  // Time with TZID or without any information: we take the time as it is (assumption: same
  // time zone as this family). A full IANA time zone conversion is not reliably possible
  // in the browser without an extra library.
  return { date: `${y}-${mo}-${d}`, time: `${hh}:${mi}` };
}
function parseICSDuration(str) {
  // Very simple support for e.g. "PT1H30M" or "P1D" (enough for the usual cases)
  const m = (str || '').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
  if (!m) return 60;
  const days = parseInt(m[1] || '0', 10), hours = parseInt(m[2] || '0', 10), mins = parseInt(m[3] || '0', 10);
  return days * 1440 + hours * 60 + mins;
}
function toMinutes(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function pad2(n) { return String(n).padStart(2, '0'); }

function parseRRule(str) {
  const rule = {};
  str.split(';').forEach(kv => { const [k, v] = kv.split('='); if (k) rule[k] = v; });
  return rule;
}

// Creates several occurrences from a base appointment with RRULE within a time window
// of -1 to +2 years around today. NOTE/limitation: only supports FREQ=DAILY/WEEKLY/
// MONTHLY/YEARLY with INTERVAL/COUNT/UNTIL as well as single exceptions (EXDATE, e.g. if only
// one appointment of a series was deleted). BYDAY, BYMONTHDAY and the like are not evaluated - for
// the vast majority of simple recurring appointments (e.g. "every 3 weeks") that is enough, for
// more complex rules (e.g. "every 2nd Tuesday of the month") it is not.
function expandRecurrence(base) {
  const rule = parseRRule(base.rrule);
  const freq = rule.FREQ;
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return [base];
  const interval = parseInt(rule.INTERVAL || '1', 10) || 1;
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : null;
  let untilDate = null;
  if (rule.UNTIL) { const u = parseICSDateField('X:' + rule.UNTIL); if (u) untilDate = u.date; }

  const windowStart = new Date(); windowStart.setFullYear(windowStart.getFullYear() - 1);
  const windowEnd = new Date(); windowEnd.setFullYear(windowEnd.getFullYear() + 2);

  const [y, mo, d] = base.startDate.split('-').map(Number);
  let cur = new Date(y, mo - 1, d);
  const results = [];
  let n = 0;
  while (cur <= windowEnd && n < 500 && (!count || n < count)) {
    const curISO = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
    if (untilDate && curISO > untilDate) break;
    const isExcluded = base.exdates && base.exdates.has(curISO);
    if (cur >= windowStart && !isExcluded) results.push({ ...base, startDate: curISO });
    n++;
    if (freq === 'DAILY') cur.setDate(cur.getDate() + interval);
    else if (freq === 'WEEKLY') cur.setDate(cur.getDate() + 7 * interval);
    else if (freq === 'MONTHLY') cur.setMonth(cur.getMonth() + interval);
    else if (freq === 'YEARLY') cur.setFullYear(cur.getFullYear() + interval);
  }
  return results;
}

function daysBetweenDateStrs(d1, d2) {
  const a = new Date(d1 + 'T00:00:00');
  const b = new Date(d2 + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
function addDaysToDateStr(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
// Spreads a multi-day appointment over one entry per day: on the first day from the start time
// to the end of the day, on intermediate days all-day, on the last day from the start of the day to the end time.
function expandMultiDaySpan(occ, spanDays, lastDayEndTime) {
  if (spanDays <= 0) return [occ];
  const results = [];
  for (let i = 0; i <= spanDays; i++) {
    const date = addDaysToDateStr(occ.startDate, i);
    let time, endTime, fullDayFiller = false;
    if (i === 0) {
      // Start day: the real start time is kept (if present), end open ("continues into the
      // next day") - that is real information and therefore counts normally for the time window.
      if (occ.time) { time = occ.time; endTime = '23:59'; }
      else { time = '06:00'; endTime = '22:00'; fullDayFiller = true; } // all-day start without any time information
    } else if (i === spanDays) {
      if (lastDayEndTime) { time = '00:00'; endTime = lastDayEndTime; }
      else { time = '06:00'; endTime = '22:00'; fullDayFiller = true; } // no real end known -> treat like "all-day"
    } else {
      // Intermediate day without any real time information ("runs over the whole day"): for the time window
      // only count 6-22 h (see computeTimeRange), so the view isn't stretched to the full
      // 24h needlessly. The display itself (fullDayFiller) still fills the column edge to edge
      // from top to bottom, instead of only showing a 6-22 section - so the appointment
      // is NOT visually shortened, only the time window around it.
      time = '06:00';
      endTime = '22:00';
      fullDayFiller = true;
    }
    results.push({ ...occ, startDate: date, time, endTime, fullDayFiller });
  }
  return results;
}

function parseICS(icsText) {
  const lines = unfoldICS(icsText).split('\n');
  const bases = [];
  let cur = null;
  let inAlarm = false; // inside a VALARM ("reminder") sub-block - ignore its fields
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VEVENT') { cur = {}; inAlarm = false; continue; }
    if (line === 'BEGIN:VALARM') { inAlarm = true; continue; }
    if (line === 'END:VALARM') { inAlarm = false; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.dt) {
        const startMin = cur.dt.time ? toMinutes(cur.dt.time) : null;
        const startDateStr = cur.dt.date;
        const isAllDay = !cur.dt.time;
        let endDateStr = cur.dtend ? cur.dtend.date : startDateStr;
        // For all-day appointments (VALUE=DATE) DTEND is EXCLUSIVE according to the iCal standard - a plain
        // Monday appointment already has Tuesday as its end date ("up to but excluding"). Without this
        // correction a single all-day day would wrongly be recognised as a 2-day appointment.
        if (isAllDay && cur.dtend && !cur.dtend.time && endDateStr !== startDateStr) {
          endDateStr = addDaysToDateStr(endDateStr, -1);
        }
        // Safety limit of a 13-day span in case the ICS data should ever be faulty
        const spanDays = Math.max(0, Math.min(daysBetweenDateStrs(startDateStr, endDateStr), 13));
        const lastDayEndTime = (cur.dtend && cur.dtend.time) ? cur.dtend.time : null;

        let endTime = null;
        if (spanDays === 0) {
          if (cur.dtend && cur.dtend.time) endTime = cur.dtend.time;
          else if (cur.durationMin != null && startMin != null) {
            const endMin = Math.min(startMin + cur.durationMin, 1439);
            endTime = `${pad2(Math.floor(endMin / 60))}:${pad2(endMin % 60)}`;
          }
        }

        const base = {
          uid: cur.uid || (startDateStr + '-' + (cur.summary || '')),
          startDate: startDateStr,
          time: cur.dt.time,
          endTime,
          title: cur.summary || 'Ohne Titel',
          rrule: cur.rrule || null,
          exdates: cur.exdates || null,
          location: cur.location || '',
          description: cur.description || '',
          pinnHref: cur.pinnHref || '',
          pinnCalName: cur.pinnCalName || '',
        };
        const recurrences = base.rrule ? expandRecurrence(base) : [base];
        recurrences.forEach(occ => {
          expandMultiDaySpan(occ, spanDays, lastDayEndTime).forEach(o => {
            bases.push({
              id: 'ics-' + o.uid + '-' + o.startDate,
              date: o.startDate,
              time: o.time || '',
              endTime: o.endTime || null,
              title: o.title,
              memberId: null,
              location: o.location || '',
              description: o.description || '',
              fullDayFiller: o.fullDayFiller || false,
              pinnHref: o.pinnHref || '',
              pinnCalName: o.pinnCalName || '',
              isRecurring: !!o.rrule,
            });
          });
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    if (inAlarm) continue; // Ignore fields inside the reminder (e.g. its own DESCRIPTION="Erinnerung")
    if (line.startsWith('SUMMARY')) cur.summary = unescapeICSText(line.slice(line.indexOf(':') + 1));
    else if (line.startsWith('UID')) cur.uid = line.slice(line.indexOf(':') + 1);
    else if (line.startsWith('DTSTART')) cur.dt = parseICSDateField(line);
    else if (line.startsWith('DTEND')) cur.dtend = parseICSDateField(line);
    else if (line.startsWith('DURATION')) cur.durationMin = parseICSDuration(line.slice(line.indexOf(':') + 1));
    else if (line.startsWith('RRULE')) cur.rrule = line.slice(line.indexOf(':') + 1);
    else if (line.startsWith('EXDATE')) {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const paramsPart = line.slice(0, idx);
        const valuesPart = line.slice(idx + 1);
        if (!cur.exdates) cur.exdates = new Set();
        valuesPart.split(',').forEach(v => {
          const parsed = parseICSDateField(paramsPart + ':' + v.trim());
          if (parsed) cur.exdates.add(parsed.date);
        });
      }
    }
    else if (line.startsWith('LOCATION')) cur.location = unescapeICSText(line.slice(line.indexOf(':') + 1));
    else if (line.startsWith('DESCRIPTION')) cur.description = unescapeICSText(line.slice(line.indexOf(':') + 1));
    else if (line.startsWith('X-PINN-HREF')) cur.pinnHref = line.slice(line.indexOf(':') + 1).trim();
    else if (line.startsWith('X-PINN-CALNAME')) cur.pinnCalName = line.slice(line.indexOf(':') + 1).trim();
  }
  // Multi-day appointments are spread over one entry per day (see expandMultiDaySpan above):
  // start day from the start time to the end of the day, intermediate days all-day, end day from 00:00 to the end time.
  return bases;
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('icsparser');

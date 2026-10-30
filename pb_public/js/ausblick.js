/* pinn. – js/ausblick.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   This file must stay the last script: it ends with bootApp(), which starts the app. */

/* ==========================================================
   Outlook: weekly preview & monthly finance outlook
   ----------------------------------------------------------
   - Weekly preview: every Sunday from 6 pm for the coming week – everything important for the whole
     family on one page (appointments, tasks, household, waste collection, meals, birthdays, holidays,
     school, deadlines, debits, pantry, weather), followed by a short look back at the past week.
   - Monthly outlook: on the last day of the month from 6 pm – per cash box a short look at the ending
     month and a more detailed one at the next (income, fixed costs, savings plans, what is left, rare
     items, notice periods). Only with access to finances (no guests, no child lock).
   - Banner at the top (like the way-home notice): once per profile – tapping opens the page, × removes
     it. The server remembers "seen" (pinn-ausblick.js) so it does not show up again on another device.
     Visible from Sunday 6 pm until Tuesday, or from 6 pm on the last day of the month until the 3rd.
   - The push message comes from the server (ausblick.pb.js), link: /?ausblick=woche or /?ausblick=monat.
   - Settings → Outlook: open both pages at any time, push on/off per profile.
   Everything is calculated from data pinn. has already loaded – works offline as well.
   Texts come from the text keys outlook.* (pb_public/i18n); categories and the like go through abTx (= i18nT, js/standardnamen.js).
   ========================================================== */
// Text keys of this page (pb_public/i18n, prefix outlook.) – abT('w_title') → tk('outlook.wTitle')
const AB_KEYS = {
  w_kicker: 'outlook.wKicker', w_title: 'outlook.wTitle', w_sub: 'outlook.wSub', b_w: 'outlook.bW',
  b_w_s: 'outlook.bWS', m_kicker: 'outlook.mKicker', m_title: 'outlook.mTitle', b_m: 'outlook.bM',
  b_m_s: 'outlook.bMS', c_termine: 'outlook.cTermine', c_termin: 'outlook.cTermin',
  c_aufgaben: 'outlook.cAufgaben', c_aufgabe: 'outlook.cAufgabe', c_essen: 'outlook.cEssen',
  c_geb: 'outlook.cGeb', c_gebs: 'outlook.cGebs', c_muell: 'outlook.cMuell', c_muells: 'outlook.cMuells',
  s_wetter: 'outlook.sWetter', s_merken: 'outlook.sMerken', s_tage: 'outlook.sTage', s_rueck: 'outlook.sRueck',
  s_offen: 'outlook.sOffen', heute: 'outlook.heute', morgen: 'outlook.morgen', frei: 'outlook.frei',
  ganz: 'outlook.ganz', fruehstueck: 'outlook.fruehstueck', mittag: 'outlook.mittag', abend: 'outlook.abend',
  alle: 'outlook.alle', reihum: 'outlook.reihum', haushalt: 'outlook.haushalt', raus: 'outlook.raus',
  geb: 'outlook.geb', geb_alt: 'outlook.gebAlt', ferien_bis: 'outlook.ferienBis', ferien_ab: 'outlook.ferienAb',
  vt_frist: 'outlook.vtFrist', vt_ende: 'outlook.vtEnde', vt_erinn: 'outlook.vtErinn', mhd: 'outlook.mhd',
  mhd_ab: 'outlook.mhdAb', faellig: 'outlook.faellig', abbuch: 'outlook.abbuch', eingang: 'outlook.eingang',
  r_termine: 'outlook.rTermine', r_haushalt: 'outlook.rHaushalt', r_ausg: 'outlook.rAusg',
  r_essen: 'outlook.rEssen', r_essen_p: 'outlook.rEssenP', r_top: 'outlook.rTop', r_leer: 'outlook.rLeer',
  leer: 'outlook.leer', zu_kal: 'outlook.zuKal', zu_aufg: 'outlook.zuAufg', m_rueck: 'outlook.mRueck',
  m_aus: 'outlook.mAus', m_ein: 'outlook.mEin', m_aus_t: 'outlook.mAusT', m_saldo: 'outlook.mSaldo',
  m_budget: 'outlook.mBudget', m_ueber: 'outlook.mUeber', m_top: 'outlook.mTop', m_spar: 'outlook.mSpar',
  m_p_ein: 'outlook.mPEin', m_p_fix: 'outlook.mPFix', m_p_spar: 'outlook.mPSpar', m_p_frei: 'outlook.mPFrei',
  m_frei_h: 'outlook.mFreiH', m_mehr: 'outlook.mMehr', m_weniger: 'outlook.mWeniger',
  m_selten: 'outlook.mSelten', m_fristen: 'outlook.mFristen', m_liste: 'outlook.mListe',
  m_weitere: 'outlook.mWeitere', m_leer: 'outlook.mLeer', m_keine: 'outlook.mKeine', zu_fin: 'outlook.zuFin',
  schliessen: 'outlook.schliessen', laden: 'outlook.laden', bis: 'outlook.bis', s_urlaub: 'outlook.sUrlaub',
  u_regen: 'outlook.uRegen', u_regen1: 'outlook.uRegen1', u_trocken: 'outlook.uTrocken',
  u_wasser: 'outlook.uWasser', u_sonne: 'outlook.uSonne', u_klima: 'outlook.uKlima', u_keine: 'outlook.uKeine',
  u_mehr: 'outlook.uMehr', tier_faellig: 'outlook.tierFaellig', tier_ueber: 'outlook.tierUeber',
  tier_geb: 'outlook.tierGeb',
};
function abLocale() { return sysLocale(); }
// Own text in the selected language (flat share wording comes from the #wg variants of the keys)
function abT(k, vars) { return tk(AB_KEYS[k] || ('outlook.' + k), vars); }
// Translate labels from the app (categories, waste types …) via the dictionary
function abTx(s) { return i18nT(s); }   // stored standard names and task titles (js/standardnamen.js)
function abEsc(s) { return escapeHtml(s == null ? '' : String(s)); }
function abDate(iso) { return new Date(iso + 'T00:00:00'); }
function abFmt(iso, opts) { try { return abDate(iso).toLocaleDateString(abLocale(), opts); } catch (e) { return iso; } }
function abShort(iso) { return abFmt(iso, { day: 'numeric', month: 'short' }); }
function abMonthName(key) { return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString(abLocale(), { month: 'long' }); }
function abRange(mondayIso) {
  const end = addDaysToDateStr(mondayIso, 6);
  const a = abDate(mondayIso), b = abDate(end);
  const same = a.getMonth() === b.getMonth();
  const left = same ? a.toLocaleDateString(abLocale(), { day: 'numeric' }) : a.toLocaleDateString(abLocale(), { day: 'numeric', month: 'short' });
  return left + ' – ' + b.toLocaleDateString(abLocale(), { day: 'numeric', month: 'short' });
}

/* ---------- Which week / which month? ---------- */
// Week in question: from Sunday 6 pm the coming one, otherwise the current one (Monday as ISO)
function abWeekKey(now) {
  const d = new Date(now || Date.now());
  if (d.getDay() === 0 && d.getHours() >= 18) d.setDate(d.getDate() + 1);
  return isoDate(startOfWeek(d));
}
function abIsMonthEnd(d) { return d.getDate() === new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
// Month in question: on the last day of the month from 6 pm the next one, otherwise the current one (YYYY-MM)
function abMonthKey(now) {
  const d = new Date(now || Date.now());
  if (abIsMonthEnd(d) && d.getHours() >= 18) return finMonthKey(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  return finMonthKey(d);
}
// Is a banner due right now? -> key or ''
function abDueKey(art) {
  const d = new Date();
  if (art === 'woche') {
    const wd = d.getDay();
    return ((wd === 0 && d.getHours() >= 18) || wd === 1 || wd === 2) ? abWeekKey(d) : '';
  }
  return ((abIsMonthEnd(d) && d.getHours() >= 18) || d.getDate() <= 3) ? abMonthKey(d) : '';
}
function abFinanceOk() {
  try {
    if (!currentUser() || isCurrentUserGuest() || childLockActive() || !isViewAllowed('finanzen') || !finance) return false;
    if (kassenServer === true) return kassenReal().length > 0;
    return true;
  } catch (e) { return false; }
}

/* ---------- "Already seen" (device + server) ---------- */
let abServer = null;      // last response from /api/pinn/ausblick
let abServerMissing = false;
let abOpenArt = '';
let abTimer = null;
function abLsKey() { const u = currentUser(); return u ? 'pinn.ausblick.' + u.id : ''; }
function abLocal() {
  try { const o = JSON.parse(localStorage.getItem(abLsKey()) || 'null'); if (o && typeof o === 'object') return o; } catch (e) { /* ignore */ }
  return { woche: '', monat: '', offen: {} };
}
function abLocalWrite(o) { try { if (abLsKey()) localStorage.setItem(abLsKey(), JSON.stringify(o)); } catch (e) { /* ignore */ } }
function abSeen(art, key) {
  const l = abLocal();
  const s = abServer && abServer.gesehen ? abServer.gesehen[art] || '' : '';
  return (l[art] || '') >= key || s >= key;
}
async function abMarkSeen(art, key) {
  if (!key) return;
  const l = abLocal();
  if (!l[art] || l[art] < key) l[art] = key;
  l.offen = l.offen || {};
  l.offen[art] = key;
  abLocalWrite(l);
  abRenderBanner();
  await abPushSeen();
}
// Report what was seen on this device to the server (also later, if it was seen offline)
async function abPushSeen() {
  if (abServerMissing || !navigator.onLine) return;
  const l = abLocal();
  const offen = l.offen || {};
  for (const art of Object.keys(offen)) {
    try {
      const res = await apiFetch('/api/pinn/ausblick/gesehen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ art, key: offen[art] }) });
      if (res.status === 404) { abServerMissing = true; return; }
      const body = await res.json().catch(() => ({}));
      if (res.ok && !body.error) {
        if (body.gesehen) abServer = body;
        const now = abLocal();
        if (now.offen) delete now.offen[art];
        abLocalWrite(now);
      }
    } catch (e) { return; }
  }
}
async function abLoadServer() {
  if (abServerMissing || !navigator.onLine) return;
  try {
    const res = await apiFetch('/api/pinn/ausblick', { cache: 'no-store' });
    if (res.status === 404) { abServerMissing = true; return; }
    const body = await res.json().catch(() => null);
    if (res.ok && body && !body.error && body.gesehen) abServer = body;
  } catch (e) { /* offline */ }
}

/* ---------- Banner ---------- */
function abBannerItem() {
  if (!currentUser() || isCurrentUserMainAdmin() || !familyRecordId) return null;
  const w = abDueKey('woche');
  if (w && !abSeen('woche', w)) return { art: 'woche', key: w };
  const m = abDueKey('monat');
  if (m && abFinanceOk() && !abSeen('monat', m)) return { art: 'monat', key: m };
  return null;
}
function abRenderBanner() {
  const b = document.getElementById('abBanner');
  if (!b) return;
  const it = abOpenArt ? null : abBannerItem();
  if (!it) {
    if (!b.classList.contains('hidden')) { b.classList.add('hidden'); try { hwLayout(); } catch (e) { /* ignore */ } }
    return;
  }
  let title, sub, icon;
  if (it.art === 'woche') {
    title = abT('b_w'); sub = abT('b_w_s', { range: abRange(it.key) }); icon = '🗓️';
  } else {
    const prevKey = finMonthKey(new Date(Number(it.key.slice(0, 4)), Number(it.key.slice(5, 7)) - 2, 1));
    title = abT('b_m', { monat: abMonthName(it.key) }); sub = abT('b_m_s', { prev: abMonthName(prevKey) }); icon = '💶';
  }
  b.dataset.art = it.art;
  b.dataset.key = it.key;
  b.style.setProperty('--ab', it.art === 'woche' ? 'var(--c-pine)' : '#2F7D4F');
  b.innerHTML = `<span class="ab-b-ic" aria-hidden="true">${icon}</span>
    <span class="ab-b-txt"><span class="ab-b-t">${abEsc(title)}</span><span class="ab-b-s">${abEsc(sub)}</span></span>
    <span class="hw-chev" aria-hidden="true">›</span>
    <button type="button" class="ab-b-x" data-abx="1" aria-label="${abEsc(abT('schliessen'))}">×</button>`;
  b.classList.remove('hidden');
  try { hwLayout(); } catch (e) { /* ignore */ }
}
function abBannerOffset() {
  const b = document.getElementById('abBanner');
  return b && !b.classList.contains('hidden') ? b.offsetHeight + 8 : 0;
}
(function abWireBanner() {
  const b = document.getElementById('abBanner');
  if (!b) return;
  b.addEventListener('click', (e) => {
    const art = b.dataset.art, key = b.dataset.key;
    if (!art) return;
    if (e.target.closest('[data-abx]')) { e.stopPropagation(); abMarkSeen(art, key); return; }
    abOpen(art);
  });
})();
async function abStart() {
  abRenderBanner();
  await abLoadServer();
  await abPushSeen();
  abRenderBanner();
  abRenderSettings();
  clearInterval(abTimer);
  // every 10 minutes (only while visible) check whether it has become Sunday 6 pm – costs nothing
  abTimer = setInterval(() => { if (document.visibilityState === 'visible') abRenderBanner(); }, 10 * 60 * 1000);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !currentUser() || !familyRecordId) return;
  abRenderBanner();
  abLoadServer().then(() => abPushSeen()).then(() => abRenderBanner());
});

/* ---------- Open / close the page ---------- */
async function abOpen(art, key) {
  art = art === 'monat' ? 'monat' : 'woche';
  key = key || (art === 'woche' ? abWeekKey() : abMonthKey());
  abOpenArt = art;
  const ov = document.getElementById('abOverlay');
  const body = document.getElementById('abBody');
  if (!ov || !body) return;
  ov.classList.remove('hidden');
  ov.style.setProperty('--ab', art === 'woche' ? 'var(--c-pine)' : '#2F7D4F');
  document.getElementById('abClose').setAttribute('aria-label', abT('schliessen'));
  body.innerHTML = `<div class="ab-empty ab-load">${abEsc(abT('laden'))}</div>`;
  abRenderBanner();
  try {
    if (art === 'woche') await abRenderWeek(body, key);
    else await abRenderMonth(body, key);
  } catch (e) {
    console.warn('Ausblick', e);
    body.innerHTML = `<div class="ab-empty"><span class="i">🙈</span>${abEsc(String(e && e.message || e))}</div>`;
  }
  const sheet = ov.querySelector('.ab-sheet');
  if (sheet) sheet.scrollTop = 0;
  // Seen: the current outlook no longer appears as a banner
  if (art === 'woche' || abFinanceOk()) abMarkSeen(art, key);
}
function abClose() {
  const ov = document.getElementById('abOverlay');
  if (ov) ov.classList.add('hidden');
  const body = document.getElementById('abBody');
  if (body) body.innerHTML = '';
  abOpenArt = '';
  abRenderBanner();
}
(function abWireOverlay() {
  const ov = document.getElementById('abOverlay');
  if (!ov) return;
  document.getElementById('abClose').addEventListener('click', abClose);
  ov.addEventListener('click', (e) => { if (e.target === ov) abClose(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abOpenArt) abClose(); });
  ov.addEventListener('click', (e) => {
    const a = e.target.closest('[data-abgo]');
    if (!a) return;
    const go = a.dataset.abgo;
    abClose();
    if (go === 'termine') setView(isViewAllowed('termine') ? 'termine' : 'uebersicht');
    else if (go === 'aufgaben') setView('aufgaben');
    else if (go.indexOf('fin') === 0) {
      const kid = go.slice(4);
      if (kid && typeof kassenSetActive === 'function' && kasseById(kid)) kassenSetActive(kid);
      setView('finanzen');
      try { finSetTab('ausgaben'); } catch (err) { /* ignore */ }
    }
  });
})();

/* ---------- Helpers ---------- */
// Calculate once for every cash box the profile is a member of (briefly switch the finance data)
function abForEachKasse(fn) {
  const out = [];
  if (!finance) return out;
  if (typeof kassenServer === 'undefined' || kassenServer !== true) {
    try { out.push(fn(null)); } catch (e) { console.warn('Ausblick', e); }
    return out;
  }
  const keepF = finance, keepA = ausgaben, keepId = activeKasseId;
  try {
    kassenRealSorted().forEach(k => {
      activeKasseId = k.id;
      finance = normalizeFinance(kasseWorkingData(k));
      try { rebuildAusgaben(); } catch (e) { ausgaben = []; }
      try { out.push(fn(k)); } catch (e) { console.warn('Ausblick', e); }
    });
  } finally {
    activeKasseId = keepId; finance = keepF; ausgaben = keepA;
  }
  return out;
}
async function abEnsureFinance() {
  try { if (typeof kassenServer !== 'undefined' && kassenServer === null && typeof kassenLoad === 'function') await kassenLoad(); } catch (e) { /* offline */ }
  try { if (!ausgabenLoaded) await loadAusgaben(); } catch (e) { /* offline */ }
}
function abAssigned(notes) {
  const ms = getAssignedMembersForEvent({ description: notes || '' });
  return ms;
}
function abWhoText(ms) {
  if (!ms || !ms.length) return '';
  if (members.length > 1 && ms.length === members.length) return abT('alle');
  return ms.map(memberLabel).join(', ');
}
function abAvas(ms) {
  if (!ms || !ms.length || (members.length > 2 && ms.length === members.length)) return '';
  return `<span class="ab-avas">${ms.slice(0, 3).map(m => `<span style="border-color:${memberBorderColor(m) === 'transparent' ? '#fff' : memberBorderColor(m)}">${memberAvatarInnerHTML(m)}</span>`).join('')}</span>`;
}
function abSchedOn(s, iso) {
  if (!s) return false;
  if (s.scheduleType === 'weekdays') {
    const wd = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'][abDate(iso).getDay()];
    return Array.isArray(s.weekdays) && s.weekdays.includes(wd);
  }
  const n = Number(s.intervalDays) || 0;
  if (n < 1) return false;
  if (n === 1) return true;
  const start = s.createdDate;
  if (!start || iso < start) return false;
  return daysBetweenDateStrs(start, iso) % n === 0;
}
// Household for one day: today and earlier the real tasks, after that calculated from the rules
function abHouseholdOn(iso, todayIso) {
  if (iso <= todayIso) {
    return aufgaben.filter(a => a.household && a.dueDate === iso).map(a => ({ title: a.title, ms: abAssigned(a.notes), done: !!a.done }));
  }
  const out = [];
  roomSchedules.forEach(s => {
    if (!abSchedOn(s, iso)) return;
    const room = rooms.find(r => r.id === s.roomId);
    const cat = cleaningCategoryById(s.category);
    const ms = (s.assignedMemberIds || []).map(memberById).filter(Boolean);
    out.push({ title: abTx(cat ? cat.label : 'Reinigung') + ': ' + (room ? abTx(room.name) : ''), ms: s.rotate ? [] : ms, rotate: !!s.rotate && ms.length > 1, msAll: ms });
  });
  trashBins.forEach(b => {
    if (!b.schedule || !abSchedOn(b.schedule, iso)) return;
    const wt = WASTE_TYPES.find(w => w.id === b.wasteType);
    const ms = (b.assignedMemberIds || []).map(memberById).filter(Boolean);
    out.push({ title: (wt ? wt.icon + ' ' + abTx(wt.taskLabel) : '🗑️') + ' ' + abT('raus'), ms: b.rotate ? [] : ms, rotate: !!b.rotate && ms.length > 1, msAll: ms });
  });
  return out;
}
function abWeatherFor(iso) {
  try {
    const days = (weatherDaily && Array.isArray(weatherDaily.days)) ? weatherDaily.days : [];
    return days.find(d => d.date === iso) || null;
  } catch (e) { return null; }
}

/* ---------- Weekly preview ---------- */
async function abRenderWeek(body, mondayIso) {
  const todayIso = isoDate(new Date());
  const days = [...Array(7)].map((_, i) => addDaysToDateStr(mondayIso, i));
  const endIso = days[6];
  const canCal = !(typeof isCalendarHiddenForGuest === 'function' && isCalendarHiddenForGuest()) && isViewAllowed('termine');
  const canTasks = isViewAllowed('aufgaben');
  const canMeals = isViewAllowed('rezepte');
  const canFin = abFinanceOk();
  if (canFin) await abEnsureFinance();
  const guest = isCurrentUserGuest();

  const evAll = canCal ? events.filter(e => e.date >= mondayIso && e.date <= endIso && isEventVisibleAsCalendarEntry(e)) : [];
  const evNormal = evAll.filter(e => !e.pinnHoliday);
  const evMuell = evAll.filter(e => e.pinnHoliday === 'muell');
  const evSchool = evAll.filter(e => e.pinnHoliday === 'schule');
  const evHoliday = evAll.filter(e => e.pinnHoliday === 'feiertag');
  // Holidays: once at the top instead of on every day
  const ferien = [];
  if (canCal) {
    const seen = new Set();
    events.filter(e => e.pinnHoliday === 'ferien' && e.date >= mondayIso && e.date <= endIso).forEach(e => {
      if (seen.has(e.title)) return;
      seen.add(e.title);
      const all = events.filter(x => x.pinnHoliday === 'ferien' && x.title === e.title).map(x => x.date).sort();
      // find the connected block around this week
      let s = e.date, t = e.date;
      while (all.includes(addDaysToDateStr(s, -1))) s = addDaysToDateStr(s, -1);
      while (all.includes(addDaysToDateStr(t, 1))) t = addDaysToDateStr(t, 1);
      ferien.push({ title: e.title, from: s, to: t });
    });
  }
  const tasksWeek = canTasks ? aufgaben.filter(a => !a.household && a.dueDate >= mondayIso && a.dueDate <= endIso) : [];
  const overdue = canTasks ? aufgaben.filter(a => !a.household && !a.done && a.dueDate && a.dueDate < todayIso && a.dueDate < mondayIso)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)) : [];
  const meals = canMeals ? mealPlan.filter(p => p.date >= mondayIso && p.date <= endIso) : [];
  const bdays = guest ? [] : upcomingBirthdays(400).filter(b => { const i = isoDate(b.next); return i >= mondayIso && i <= endIso; });
  // Debits and incoming payments of the week (recurring bookings of all own cash boxes)
  const bookings = [];
  const deadlines = [];
  if (canFin) {
    const multi = typeof kassenServer !== 'undefined' && kassenServer === true && kassenReal().length > 1;
    abForEachKasse(k => {
      finance.recurring.forEach(r => {
        finRecDates(r, mondayIso, endIso).forEach(date => {
          const amt = finRecurringAmountFor(r, date);
          if (!amt) return;
          bookings.push({ date, title: r.title || abTx(finCategory(r.category).label), amount: amt, kasse: multi && k ? k.name : '' });
        });
      });
      vtContracts().forEach(c => {
        const s = vtStatus(c, todayIso);
        if (s.state === 'aktiv' && s.kind === 'fixed' && !s.unknown && s.deadline && s.deadline <= endIso && s.deadline >= todayIso) deadlines.push({ date: s.deadline, title: c.name, kind: 'frist' });
        else if (s.state === 'aktiv' && s.kind === 'once' && !s.unknown && s.end && s.end >= mondayIso && s.end <= endIso) deadlines.push({ date: s.end, title: c.name, kind: 'ende' });
        const x = c.extraReminder || {};
        if (vtIsIso(x.date) && x.date >= mondayIso && x.date <= endIso && s.state !== 'beendet') deadlines.push({ date: x.date, title: c.name, kind: 'erinn', text: x.text || '' });
      });
    });
  }
  const pantry = isViewAllowed('vorrat') ? pantryItems.filter(p => { const d = pantryExpiryDays(p); return d !== null && d <= daysBetweenDateStrs(todayIso, endIso); })
    .sort((a, b) => String(a.bestBefore).localeCompare(String(b.bestBefore))) : [];

  // Household per day
  const hh = {};
  let hhCount = 0;
  if (canTasks) days.forEach(d => { hh[d] = abHouseholdOn(d, todayIso); hhCount += hh[d].length; });

  const kw = finIsoWeek(abDate(mondayIso));
  const nTasks = tasksWeek.length + hhCount;
  const chip = (n, one, many, ic) => n ? `<span class="ab-chip">${ic} <b>${n}</b> ${abEsc(abT(n === 1 ? one : many))}</span>` : '';
  let html = `<div class="ab-hero">
    <div class="ab-kicker">${abEsc(abT('w_kicker'))}</div>
    <div class="ab-h1">${abEsc(abT('w_title'))}</div>
    <div class="ab-hsub">${abEsc(abT('w_sub', { kw, range: abRange(mondayIso) }))}</div>
    <div class="ab-chips">${chip(evNormal.length, 'c_termin', 'c_termine', '📅')}${chip(nTasks, 'c_aufgabe', 'c_aufgaben', '✅')}${meals.length ? `<span class="ab-chip">🍽️ <b>${meals.length}</b> ${abEsc(abT('c_essen'))}</span>` : ''}${chip(bdays.length, 'c_geb', 'c_gebs', '🎂')}${chip(evMuell.length, 'c_muell', 'c_muells', '🗑️')}</div>
  </div><div class="ab-wrap">`;

  // Weather
  const wx = days.map(abWeatherFor);
  if (wx.some(Boolean)) {
    html += `<div class="ab-card"><div class="ab-h2">🌤️ ${abEsc(abT('s_wetter'))}</div><div class="ab-wx">${days.map((d, i) => {
      const w = wx[i];
      const wd = abFmt(d, { weekday: 'short' });
      if (!w) return `<div class="ab-wx-d"><span>${abEsc(wd)}</span><span class="i">·</span></div>`;
      return `<div class="ab-wx-d${(w.rain || 0) >= 60 ? ' rain' : ''}"><span>${abEsc(wd)}</span><span class="i">${weatherIconForCode(w.code)}</span><b>${tDeg(w.max)}</b> <span>${tDeg(w.min)}</span></div>`;
    }).join('')}</div></div>`;
  }

  // Holiday this week: weather at the destination (forecast or typical values)
  html += await abTripCardsHtml(mondayIso, endIso);

  // Don't forget: holidays, deadlines, pantry, pets, overdue items
  const hl = [];
  ferien.forEach(f => {
    const txt = f.from < mondayIso ? abT('ferien_bis', { d: abShort(f.to) }) : abT('ferien_ab', { d: abShort(f.from) }) + (f.to > f.from ? ' · ' + abT('bis', { d: abShort(f.to) }) : '');
    hl.push(`<div class="ab-hl"><span class="i">🏖️</span><span>${abEsc(f.title)}<small>${abEsc(txt)}</small></span></div>`);
  });
  deadlines.sort((a, b) => a.date.localeCompare(b.date)).forEach(dl => {
    const lab = dl.kind === 'frist' ? abT('vt_frist') : dl.kind === 'ende' ? abT('vt_ende') : abT('vt_erinn') + (dl.text ? ': ' + dl.text : '');
    hl.push(`<div class="ab-hl" style="--ab-tone:#B5651D"><span class="i">📄</span><span>${abEsc(dl.title)}<small>${abEsc(lab)}</small></span><span class="when">${abEsc(abFmt(dl.date, { weekday: 'short', day: 'numeric', month: 'short' }))}</span></div>`);
  });
  pantry.slice(0, 6).forEach(p => {
    const d = pantryExpiryDays(p);
    hl.push(`<div class="ab-hl" style="--ab-tone:${d < 0 ? '#C0392B' : '#9A6A00'}"><span class="i">⏳</span><span>${abEsc(p.name)}<small>${abEsc(d < 0 ? abT('mhd_ab') : abT('mhd', { d: abShort(p.bestBefore) }))}</small></span><span class="when">${abEsc(abShort(p.bestBefore))}</span></div>`);
  });
  if (pantry.length > 6) hl.push(`<div class="ab-hl"><span class="i"></span><span class="ab-note" style="margin:0">${abEsc(abT('m_weitere', { n: pantry.length - 6 }))}</span></div>`);
  if (!guest && isViewAllowed('familie')) abPetHighlights(mondayIso, endIso).forEach(x => hl.push(x));
  if (hl.length) html += `<div class="ab-card"><div class="ab-h2">📌 ${abEsc(abT('s_merken'))}</div>${hl.join('')}</div>`;
  if (overdue.length) {
    html += `<div class="ab-card"><div class="ab-h2">⏰ ${abEsc(abT('s_offen'))}<small>${overdue.length}</small></div>${overdue.slice(0, 6).map(a => {
      const ms = abAssigned(a.notes);
      return `<div class="ab-hl" style="--ab-tone:#C0392B"><span class="i">☐</span><span>${abEsc(abTx(a.title))}<small>${abEsc(abWhoText(ms))}</small></span><span class="when">${abEsc(abT('faellig', { d: abShort(a.dueDate) }))}</span></div>`;
    }).join('')}${overdue.length > 6 ? `<p class="ab-note">${abEsc(abT('m_weitere', { n: overdue.length - 6 }))}</p>` : ''}</div>`;
  }

  // Day by day
  let dayHtml = '';
  let anything = false;
  days.forEach(d => {
    const items = [];
    const hol = evHoliday.filter(e => e.date === d).map(e => e.title);
    bdays.filter(b => isoDate(b.next) === d).forEach(b => items.push(`<div class="ab-it" style="--c:#D6336C"><span class="t">🎂</span><span class="n">${abEsc(b.age ? abT('geb_alt', { name: b.n, age: b.age }) : abT('geb', { name: b.n }))}</span></div>`));
    evNormal.filter(e => e.date === d).sort(calListCompare).forEach(e => {
      const c = colorForCalendarEvent(e);
      const t = (e.fullDayFiller || !e.time) ? abT('ganz') : e.time;
      const ms = getAssignedMembersForEvent(e);
      items.push(`<div class="ab-it" style="--c:${c}"><span class="t">${abEsc(t)}</span><span class="n">${abEsc(e.title)}</span>${abAvas(ms)}</div>`);
    });
    evSchool.filter(e => e.date === d).forEach(e => items.push(`<div class="ab-it minor" style="--c:${colorForCalendarEvent(e)}"><span class="t">🎒</span><span class="n">${abEsc(e.title)}</span></div>`));
    evMuell.filter(e => e.date === d).forEach(e => items.push(`<div class="ab-it minor" style="--c:${colorForCalendarEvent(e)}"><span class="t">🗑️</span><span class="n">${abEsc(abTx(e.title))}</span></div>`));
    tasksWeek.filter(a => a.dueDate === d).forEach(a => {
      const ms = abAssigned(a.notes);
      const t = a.fromTime ? a.fromTime : '✅';
      items.push(`<div class="ab-it" style="--c:var(--c-mustard)"><span class="t">${abEsc(t)}</span><span class="n"${a.done ? ' style="text-decoration:line-through;opacity:.6"' : ''}>${abEsc(abTx(a.title))}</span>${ms.length ? `<span class="who">${abEsc(abWhoText(ms))}</span>` : ''}</div>`);
    });
    (hh[d] || []).length && items.push(`<div class="ab-it minor" style="--c:#6B8E7F;flex-wrap:wrap"><span class="t">🧹</span><span class="ab-chiprow" style="flex:1 1 auto;min-width:0">${hh[d].map(x => {
      const who = x.rotate ? abT('reihum') : abWhoText(x.ms);
      return `<span class="ab-mini"${x.done ? ' style="text-decoration:line-through;opacity:.6"' : ''}>${abEsc(abTx(x.title))}${who ? ' · ' + abEsc(who) : ''}</span>`;
    }).join('')}</span></div>`);
    meals.filter(p => p.date === d).sort((a, b) => mealTypeRank(a.mealType) - mealTypeRank(b.mealType)).forEach(p => {
      const r = p.recipeId ? recipes.find(x => x.id === p.recipeId) : null;
      items.push(`<div class="ab-it" style="--c:#C2703D"><span class="t">${abEsc(abT(mealTypeInfo(p.mealType).id))}</span><span class="n">${mealTypeIcon(p.mealType)} ${abEsc(r ? r.title : (p.title || '—'))}</span></div>`);
    });
    bookings.filter(x => x.date === d).forEach(x => {
      const inc = x.amount < 0;
      items.push(`<div class="ab-it minor" style="--c:${inc ? '#2F7D4F' : '#7A6F5A'}"><span class="t">💶</span><span class="n">${abEsc(x.title)}${x.kasse ? ' · ' + abEsc(x.kasse) : ''}</span><span class="amt"${inc ? ' style="color:#2F7D4F"' : ''}>${inc ? '+' : '−'}${abEsc(fmtEur(Math.abs(x.amount)))}</span></div>`);
    });
    if (items.length) anything = true;
    const w = abWeatherFor(d);
    const dt = abDate(d);
    const rel = d === todayIso ? abT('heute') : d === addDaysToDateStr(todayIso, 1) ? abT('morgen') : '';
    dayHtml += `<div class="ab-day${d === todayIso ? ' today' : ''}">
      <div class="ab-day-h"><span class="ab-day-n">${dt.getDate()}</span>
        <span class="ab-day-wd">${abEsc(abFmt(d, { weekday: 'long' }))}<small>${abEsc(rel || abFmt(d, { month: 'long' }))}</small></span>
        ${hol.map(h => `<span class="ab-day-tag">🎉 ${abEsc(h)}</span>`).join('')}
        ${w ? `<span class="ab-day-wx">${weatherIconForCode(w.code)} ${tDeg(w.max)}</span>` : ''}
      </div>
      ${items.length ? `<div class="ab-items">${items.join('')}</div>` : `<div class="ab-free">${abEsc(abT('frei'))}</div>`}
    </div>`;
  });
  html += `<div class="ab-card"><div class="ab-h2">📆 ${abEsc(abT('s_tage'))}</div>${anything ? dayHtml : `<div class="ab-empty"><span class="i">🌿</span>${abEsc(abT('leer'))}</div>`}</div>`;

  // Look back (short)
  html += `<div class="ab-card" id="abRueck"><div class="ab-h2">↩️ ${abEsc(abT('s_rueck'))}</div><div class="ab-tiles" id="abRueckTiles"></div><p class="ab-note" id="abRueckNote"></p></div>`;
  html += `<div class="ab-foot">${canCal ? `<button type="button" class="ab-btn ghost" data-abgo="termine">📅 ${abEsc(abT('zu_kal'))}</button>` : ''}${canTasks ? `<button type="button" class="ab-btn ghost" data-abgo="aufgaben">✅ ${abEsc(abT('zu_aufg'))}</button>` : ''}</div>`;
  html += '</div>';
  body.innerHTML = html;
  abFillWeekReview(mondayIso, { canCal, canMeals, canFin, canTasks });
}
async function abFillWeekReview(mondayIso, can) {
  const tiles = document.getElementById('abRueckTiles');
  if (!tiles) return;
  const from = addDaysToDateStr(mondayIso, -7), to = addDaysToDateStr(mondayIso, -1);
  const out = [];
  if (can.canCal) {
    const n = events.filter(e => !e.pinnHoliday && e.date >= from && e.date <= to && isEventVisibleAsCalendarEntry(e) && !e.fullDayFiller).length;
    out.push(`<div class="ab-tile"><small>📅 ${abEsc(abT('r_termine'))}</small><b>${n}</b></div>`);
  }
  if (can.canMeals) {
    const ms = mealPlan.filter(p => p.date >= from && p.date <= to);
    const cooked = ms.filter(p => p.cooked).length;
    out.push(`<div class="ab-tile"><small>🍽️ ${abEsc(abT(cooked ? 'r_essen' : 'r_essen_p'))}</small><b>${cooked || ms.length}</b></div>`);
  }
  if (can.canFin) {
    const sums = abForEachKasse(() => finEntriesInRange(from, to).reduce((s, e) => s + Math.max(0, Number(e.amount) || 0), 0));
    const total = sums.reduce((a, b) => a + b, 0);
    out.push(`<div class="ab-tile"><small>💶 ${abEsc(abT('r_ausg'))}</small><b>${abEsc(fmtEur0(total))}</b></div>`);
  }
  tiles.innerHTML = out.join('');
  // Household: "Who does how much?" over the last 7 days (only if the server supports it)
  if (!can.canTasks || (!roomSchedules.length && !trashBins.length) || isCurrentUserGuest() || !navigator.onLine) {
    if (!out.length) document.getElementById('abRueckNote').textContent = abT('r_leer');
    return;
  }
  try {
    const res = await apiFetch('/api/pinn/aufgaben/statistik?tage=7', { cache: 'no-store' });
    const b = await res.json().catch(() => ({}));
    if (!res.ok || b.error || !b.mitglieder) throw new Error('-');
    if (b.tage != null && Number(b.tage) !== 7) throw new Error('-');
    const per = b.mitglieder || {};
    let sum = 0, top = null, topN = 0;
    Object.keys(per).forEach(id => {
      const n = Number(per[id] && per[id].erledigt) || 0;
      sum += n;
      if (n > topN) { topN = n; top = memberById(id); }
    });
    const t = document.getElementById('abRueckTiles');
    if (!t) return;
    t.insertAdjacentHTML('beforeend', `<div class="ab-tile"><small>🧹 ${abEsc(abT('r_haushalt'))}</small><b>${sum}</b></div>`);
    const note = document.getElementById('abRueckNote');
    if (note && top && members.length > 1) note.textContent = abT('r_top', { name: memberLabel(top) });
  } catch (e) {
    const t = document.getElementById('abRueckTiles');
    if (t && !t.children.length) document.getElementById('abRueckNote').textContent = abT('r_leer');
  }
}

/* ---------- Monthly finance outlook ---------- */
function abMonthOffset(key) {
  const now = new Date();
  return (Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1) - (now.getFullYear() * 12 + now.getMonth());
}
function abRecIn(range) {
  const list = [];
  finance.recurring.forEach(r => {
    finRecDates(r, range.startIso, range.endIso).forEach(date => {
      const amount = finRecurringAmountFor(r, date);
      if (amount) list.push({ r, date, amount });
    });
  });
  return list.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}
function abSumRec(list) {
  let inc = 0, fix = 0, save = 0;
  list.forEach(x => {
    if (x.amount < 0) inc += -x.amount;
    else if (x.r.category === FIN_SAVINGS_CATEGORY) save += x.amount;
    else fix += x.amount;
  });
  return { inc: finRound(inc), fix: finRound(fix), save: finRound(save) };
}
async function abRenderMonth(body, key) {
  const nextName = abMonthName(key);
  const prevKey = finMonthKey(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 2, 1));
  const prevName = abMonthName(prevKey);
  const head = `<div class="ab-hero">
    <div class="ab-kicker">${abEsc(abT('m_kicker'))}</div>
    <div class="ab-h1">${abEsc(abT('m_title', { monat: nextName.charAt(0).toUpperCase() + nextName.slice(1) }))}</div>
    <div class="ab-hsub">${abEsc(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString(abLocale(), { month: 'long', year: 'numeric' }))}</div>
    <div class="ab-chips" id="abMonthChips"></div>
  </div>`;
  if (!abFinanceOk()) { body.innerHTML = head + `<div class="ab-wrap"><div class="ab-card ab-empty"><span class="i">🔒</span>${abEsc(abT('m_keine'))}</div></div>`; return; }
  await abEnsureFinance();
  const off = abMonthOffset(key);
  const range = finPeriodRange('month', off);
  const prev = finPeriodRange('month', off - 1);
  const todayIso = finTodayIso();
  const multi = typeof kassenServer !== 'undefined' && kassenServer === true && kassenReal().length > 1;
  let totIn = 0, totFix = 0, totSave = 0;
  const blocks = abForEachKasse(k => {
    // Look back (short)
    const ps = finStats(prev);
    const pb = finBudgetInfo('month', prev);
    const savedPrev = (ps.byCat.find(c => c.cat.id === FIN_SAVINGS_CATEGORY) || {}).total || 0;
    const spentPrev = finRound(ps.total - savedPrev);
    const top = ps.byCat.filter(c => c.cat.id !== FIN_SAVINGS_CATEGORY).slice(0, 3);
    const topMax = Math.max(1, ...top.map(c => c.total));
    // Outlook
    const rec = abRecIn(range);
    const sum = abSumRec(rec);
    const prevSum = abSumRec(abRecIn(prev));
    const bi = finBudgetInfo('month', range);
    const freeAmt = finRound(bi.income + bi.adjust - sum.fix - sum.save);
    totIn += sum.inc; totFix += sum.fix; totSave += sum.save;
    const rare = rec.filter(x => x.amount > 0 && ['quarterly', 'yearly'].includes(finRecInterval(x.r)));
    const fr = [];
    vtContracts().forEach(c => {
      const s = vtStatus(c, todayIso);
      if (s.state === 'aktiv' && s.kind === 'fixed' && !s.unknown && s.deadline >= range.startIso && s.deadline <= range.endIso) fr.push({ date: s.deadline, c, kind: 'frist' });
      else if (s.state === 'aktiv' && s.kind === 'once' && !s.unknown && s.end >= range.startIso && s.end <= range.endIso) fr.push({ date: s.end, c, kind: 'ende' });
    });
    fr.sort((a, b) => a.date.localeCompare(b.date));

    let h = '';
    if (multi && k) h += `<div class="ab-kasse"><i style="background:${abEsc(k.color || 'var(--c-pine)')}"></i>${abEsc((k.icon ? k.icon + ' ' : '') + (k.name || ''))}</div>`;
    // Look back
    const hasPrev = ps.total || ps.income;
    h += `<div class="ab-card"><div class="ab-h2">↩️ ${abEsc(abT('m_rueck', { monat: prevName }))}</div>`;
    if (hasPrev) {
      const rest = pb.budget != null ? finRound(pb.budget - spentPrev - savedPrev) : null;
      h += `<div class="ab-tiles">
        <div class="ab-tile"><small>${abEsc(abT('m_ein'))}</small><b>${abEsc(fmtEur0(ps.income))}</b></div>
        <div class="ab-tile"><small>${abEsc(abT('m_aus_t'))}</small><b>${abEsc(fmtEur0(spentPrev))}</b></div>
        <div class="ab-tile ${ps.balance >= 0 ? 'good' : 'bad'}"><small>${abEsc(abT('m_saldo'))}</small><b>${ps.balance >= 0 ? '+' : '−'}${abEsc(fmtEur0(Math.abs(ps.balance)))}</b></div>
        ${rest != null ? `<div class="ab-tile ${rest >= 0 ? 'good' : 'bad'}"><small>${abEsc(abT(rest >= 0 ? 'm_budget' : 'm_ueber'))}</small><b>${abEsc(fmtEur0(Math.abs(rest)))}</b></div>`
          : `<div class="ab-tile"><small>🐷 ${abEsc(abT('m_spar'))}</small><b>${abEsc(fmtEur0(savedPrev))}</b></div>`}
      </div>`;
      if (top.length) h += `<div style="margin-top:10px">${top.map(c => `<div class="ab-row" style="flex-wrap:wrap"><span class="n">${abEsc((c.cat.icon ? c.cat.icon + ' ' : '') + abTx(c.cat.label))}</span><span class="a">${abEsc(fmtEur0(c.total))}</span>
        <div class="ab-bar" style="flex-basis:100%"><span style="width:${Math.round(c.total / topMax * 100)}%;background:${abEsc(c.cat.color || 'var(--c-pine)')}"></span></div></div>`).join('')}</div>`;
      if (savedPrev && rest != null) h += `<p class="ab-note">🐷 ${abEsc(fmtEur0(savedPrev))} ${abEsc(abT('m_spar'))}</p>`;
    } else {
      h += `<p class="ab-note">${abEsc(abT('r_leer'))}</p>`;
    }
    h += '</div>';
    // Outlook
    h += `<div class="ab-card"><div class="ab-h2">🔭 ${abEsc(abT('m_aus', { monat: nextName }))}</div>`;
    if (!rec.length && !fr.length) {
      h += `<p class="ab-note">${abEsc(abT('m_leer'))}</p>`;
    } else {
      h += `<div class="ab-tiles">
        <div class="ab-tile good"><small>${abEsc(abT('m_p_ein'))}</small><b>${abEsc(fmtEur0(Math.max(sum.inc, bi.income)))}</b></div>
        <div class="ab-tile"><small>${abEsc(abT('m_p_fix'))}</small><b>${abEsc(fmtEur0(sum.fix))}</b></div>
        <div class="ab-tile"><small>${abEsc(abT('m_p_spar'))}</small><b>${abEsc(fmtEur0(sum.save))}</b></div>
        <div class="ab-tile hero ${freeAmt >= 0 ? 'good' : 'bad'}"><small>${abEsc(abT('m_p_frei'))}</small><b>${freeAmt < 0 ? '−' : ''}${abEsc(fmtEur0(Math.abs(freeAmt)))}</b></div>
      </div><p class="ab-note">${abEsc(abT('m_frei_h'))}</p>`;
      const diff = finRound(sum.fix - prevSum.fix);
      if (Math.abs(diff) >= 1 && prevSum.fix) h += `<p class="ab-note${diff > 0 ? ' warn' : ''}">${diff > 0 ? '📈' : '📉'} ${abEsc(abT(diff > 0 ? 'm_mehr' : 'm_weniger', { d: fmtEur0(Math.abs(diff)), prev: prevName }))}</p>`;
      if (rare.length) {
        h += `<div class="ab-h2" style="margin-top:12px">⚠️ ${abEsc(abT('m_selten'))}</div>${rare.map(x => `<div class="ab-row"><span class="d">${abEsc(abFmt(x.date, { day: 'numeric', month: 'short' }))}</span><span class="n">${abEsc(x.r.title || abTx(finCategory(x.r.category).label))}</span><span class="a">${abEsc(fmtEur(x.amount))}</span></div>`).join('')}`;
      }
      if (fr.length) {
        h += `<div class="ab-h2" style="margin-top:12px">📄 ${abEsc(abT('m_fristen'))}</div>${fr.map(x => `<div class="ab-row"><span class="d">${abEsc(abFmt(x.date, { day: 'numeric', month: 'short' }))}</span><span class="n">${abEsc(x.c.name)}</span><span class="a" style="font-weight:400;font-size:11.5px">${abEsc(x.kind === 'frist' ? abT('vt_frist') : abT('vt_ende'))}</span></div>`).join('')}`;
      }
      if (rec.length) {
        const show = rec.slice(0, 12);
        h += `<div class="ab-h2" style="margin-top:12px">🗓️ ${abEsc(abT('m_liste'))}<small>${rec.length}</small></div>${show.map(x => {
          const inc = x.amount < 0;
          const cat = finCategory(x.r.category);
          return `<div class="ab-row"><span class="d">${abEsc(abFmt(x.date, { day: 'numeric', month: 'short' }))}</span><span class="n">${abEsc((cat.icon ? cat.icon + ' ' : '') + (x.r.title || abTx(cat.label)))}</span><span class="a${inc ? ' in' : ''}">${inc ? '+' : '−'}${abEsc(fmtEur(Math.abs(x.amount)))}</span></div>`;
        }).join('')}${rec.length > show.length ? `<p class="ab-note">${abEsc(abT('m_weitere', { n: rec.length - show.length }))}</p>` : ''}`;
      }
    }
    h += `<div class="ab-foot" style="margin-top:8px"><button type="button" class="ab-btn ghost" data-abgo="fin:${abEsc(k ? k.id : '')}">💶 ${abEsc(abT('zu_fin'))}</button></div></div>`;
    return h;
  });
  body.innerHTML = head + `<div class="ab-wrap">${blocks.join('') || `<div class="ab-card ab-empty"><span class="i">💶</span>${abEsc(abT('m_leer'))}</div>`}</div>`;
  const chips = document.getElementById('abMonthChips');
  if (chips) chips.innerHTML = [
    totIn ? `<span class="ab-chip">⬆️ <b>${abEsc(fmtEur0(totIn))}</b></span>` : '',
    totFix ? `<span class="ab-chip">⬇️ <b>${abEsc(fmtEur0(totFix))}</b></span>` : '',
    totSave ? `<span class="ab-chip">🐷 <b>${abEsc(fmtEur0(totSave))}</b></span>` : '',
  ].join('');
}

/* ---------- Settings → Outlook ---------- */
function abRenderSettings() {
  const acc = document.getElementById('settingsAusblickAccordion');
  if (!acc) return;
  const fin = abFinanceOk();
  document.getElementById('abSetMonthBtn').classList.toggle('hidden', !fin);
  document.getElementById('abSetPushMonthRow').classList.toggle('hidden', !fin);
  const pw = document.getElementById('abSetPushWeek'), pm = document.getElementById('abSetPushMonth');
  const push = (abServer && abServer.push) || { woche: true, monat: true };
  pw.checked = push.woche !== false;
  pm.checked = push.monat !== false;
  pw.disabled = pm.disabled = abServerMissing;
  document.getElementById('abSetPushRows').classList.toggle('opacity-50', abServerMissing);
}
async function abSavePush() {
  const st = document.getElementById('abSetStatus');
  const body = { woche: document.getElementById('abSetPushWeek').checked, monat: document.getElementById('abSetPushMonth').checked };
  try {
    const res = await apiFetch('/api/pinn/ausblick/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const r = await res.json().catch(() => ({}));
    if (!res.ok || r.error) throw new Error(r.error || ('HTTP ' + res.status));
    abServer = r;
    st.textContent = tk('common.saved');
  } catch (e) {
    st.textContent = tk('common.saveFailed');
    abRenderSettings();
  }
  setTimeout(() => { if (st) st.textContent = ''; }, 2500);
}
(function abWireSettings() {
  const acc = document.getElementById('settingsAusblickAccordion');
  if (!acc) return;
  document.getElementById('abSetWeekBtn').addEventListener('click', () => abOpen('woche'));
  document.getElementById('abSetMonthBtn').addEventListener('click', () => abOpen('monat'));
  document.getElementById('abSetPushWeek').addEventListener('change', abSavePush);
  document.getElementById('abSetPushMonth').addEventListener('change', abSavePush);
  acc.addEventListener('toggle', () => { if (acc.open) { abRenderSettings(); abLoadServer().then(abRenderSettings); } });
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('ausblick');

bootApp();

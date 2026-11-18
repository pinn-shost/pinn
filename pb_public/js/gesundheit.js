/* pinn. – Health page per person (js/gesundheit.js, since 1.149.0)
   Part of the pinn. web app (pb_public/index.html). Classic script, no build step: all top-level names share
   one global scope with the other files in js/ (prefix gh…, CSS classes hp-…). Loaded right after js/familie.js.

   Family → tab "Health" (replaces the tab "Emergency"): the emergency numbers, every person (tap = their health
   page) and the pets' emergency passes. The health page is built from blocks the person switches on (like Home):
     drink        daily goal, glasses per day (popup: drink → amount), hints how much is still to go
     meds         medication & vitamins with times, ticked off per day
     hands        hand washing counter per day
     values       weight, blood pressure, pulse
     vaccines     vaccinations with the next due date
     appointments doctor's appointments
     sun          sunscreen: today's UV index from the weather of the home, "applied" per day (since 1.153.1)
     sleep        bedtime and "How did you sleep?" (three faces) per night (since 1.153.1)
     fruit        fruit & vegetables: portions per day against a goal (default 5) (since 1.153.1)
     tick         tick check in the evening, April to October (since 1.153.1)
     checkup      check-ups that come back (dentist, check-up …) and for children the German U/J examinations by age (since 1.153.1)
   The emergency pass stays in the family data (famPass, visible to the whole family, offline). On the health page
   it is switched on with a tick ("pass": true/false in the health data; without a value it counts as on when the
   pass is already filled) – nothing that was entered is lost when it is switched off.

   Server: pb_hooks/gesundheit.pb.js + pinn-gesundheit.js, collection "gesundheit" (one record per member).
   Only the person themself sees their data, for children also the adults. GET /api/pinn/gesundheit returns
   exactly these members; every save sends the "updated" of the last read – on a conflict (409) the change is
   applied again to the newer server state and sent once more.

   Data of a member (daten):
     { blocks: { drink, meds, hands, values, vaccines, appointments }, pass,
       drink: { goal, log: { <YYYY-MM-DD>: [{ id, t, kind, ml }] } },
       meds: { list: [{ id, name, kind: 'med'|'vit'|'other', dose, times: ['08:00'] }], taken: { <date>: ['<id>@<time>'] } },
       hands: { log: { <date>: n } },
       values: [{ id, date, weight, sys, dia, pulse }],
       vaccines: [{ id, name, date, next }],
       appointments: [{ id, date, time, who, note }],
       sun: { log: { <date>: true }, remind },  sleep: { bed: 'HH:MM', log: { <date>: 1|2|3 }, remind },
       fruit: { goal, log: { <date>: n }, remind },  tick: { log: { <date>: true }, remind },
       checkup: { list: [{ id, kind, name, every (months), last: <date>, added: <date> }], u: true|false, uDone: ['U4', …], remind } }
   Day logs older than GH_KEEP_DAYS are dropped when saving.

   Push reminders (since 1.149.1, server: pinn-gesundheit.js#runCron; since 1.150.3 for a child the parents get them too unless remindParents is false): switched on per block in the health data
     drink.remind { on, every (minutes), from, to }   meds.remind { on }   hands.remind { on, times: ['10:00', …] }
     since 1.153.1: sun.remind { on, time } (only on days with UV ≥ GH_UV_MIN at home)   sleep.remind { on, morning, morningTime }
     (30 minutes before sleep.bed; in the morning "How did you sleep?")   fruit.remind { on, times }   tick.remind { on, time } (April–October)
     checkup.remind { on } (10:00 on the day a check-up is due, then once a week while it is still open)
   They go to the profile of the person themself (for a child also to the parents). Tapping a message opens /?gesundheit=<trinken|medikamente|haende>
   &person=<member ID> (ghOpenFromLink): the health page of that person, for "trinken" also the drink popup. */

var GH_KEEP_DAYS = 120;
var GH_STALE_MS = 60 * 1000;
var GH_DAY_FROM = 7;   // drinking day for the hints: 7:00 …
var GH_DAY_TO = 21;    // … to 21:00
var GH_DRINKS = [
  { id: 'wasser', key: 'gh.drink.water', color: '#7EC8E3', cup: false },
  { id: 'saft', key: 'gh.drink.juice', color: '#F5A623', cup: false },
  { id: 'kaffee', key: 'gh.drink.coffee', color: '#7B4A2D', cup: true },
  { id: 'tee', key: 'gh.drink.tea', color: '#C9973F', cup: true },
  { id: 'milch', key: 'gh.drink.milk', color: '#F3EFE6', cup: false },
  { id: 'limo', key: 'gh.drink.soda', color: '#E5D74B', cup: false },
];
var GH_AMOUNTS = [150, 200, 250, 330, 500];
var GH_EVERY = [30, 45, 60, 90, 120, 150, 180, 240]; // drink reminder: minutes between two messages
var GH_GOALS = [1000, 1250, 1500, 1750, 2000, 2250, 2500, 2750, 3000, 3500];
var GH_BLOCKS = [
  { id: 'drink', icon: '💧', key: 'gh.block.drink' },
  { id: 'meds', icon: '💊', key: 'gh.block.meds' },
  { id: 'hands', icon: '🧼', key: 'gh.block.hands' },
  { id: 'values', icon: '⚖️', key: 'gh.block.values' },
  { id: 'vaccines', icon: '💉', key: 'gh.block.vaccines' },
  { id: 'appointments', icon: '🩺', key: 'gh.block.appointments' },
  { id: 'sun', icon: '🧴', key: 'gh.block.sun' },
  { id: 'sleep', icon: '😴', key: 'gh.block.sleep' },
  { id: 'fruit', icon: '🍎', key: 'gh.block.fruit' },
  { id: 'tick', icon: '🕷️', key: 'gh.block.tick' },
  { id: 'checkup', icon: '📋', key: 'gh.block.checkup' },
];
var GH_UV_MIN = 3;                 // from this UV index on sun protection is advised (WHO)
var GH_TICK_MONTHS = [4, 5, 6, 7, 8, 9, 10];
var GH_SLEEP_FACES = [{ v: 1, icon: '🙁', key: 'gh.sleep.bad' }, { v: 2, icon: '😐', key: 'gh.sleep.ok' }, { v: 3, icon: '🙂', key: 'gh.sleep.good' }];
// Check-ups to pick from (interval in months; the name is translated, own entries keep their name)
var GH_CHECKUPS = [
  { id: 'dentist', key: 'gh.checkup.dentist', every: 6 },
  { id: 'general', key: 'gh.checkup.general', every: 36 },
  { id: 'eyes', key: 'gh.checkup.eyes', every: 24 },
  { id: 'skin', key: 'gh.checkup.skin', every: 24 },
  { id: 'gyn', key: 'gh.checkup.gyn', every: 12 },
];
// German children's examinations: window in days after birth (approximate, as on the yellow booklet)
var GH_U_EXAMS = [
  { id: 'U2', from: 3, to: 10 }, { id: 'U3', from: 21, to: 35 }, { id: 'U4', from: 60, to: 120 },
  { id: 'U5', from: 150, to: 210 }, { id: 'U6', from: 270, to: 365 }, { id: 'U7', from: 600, to: 730 },
  { id: 'U7a', from: 990, to: 1095 }, { id: 'U8', from: 1350, to: 1460 }, { id: 'U9', from: 1770, to: 1945 },
  { id: 'J1', from: 4383, to: 5113 },
];
var ghState = { loaded: false, loading: false, at: 0, people: {}, me: '', error: '' };
var ghPersonId = null;
var ghModal = null;        // { type, memberId, id }
var ghSaveChain = {};      // memberId -> promise (saves one after the other)
var ghDrinkPick = null;    // { memberId, drink }
var ghClipSeq = 0;

/* ---------- Helpers ---------- */
function ghToday() { return isoDate(new Date()); }
function ghNum(n) { try { return Number(n).toLocaleString(sysLocale()); } catch (e) { return String(n); } }
function ghId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function ghAttr(v) { return escapeHtml(String(v == null ? '' : v)); }
function ghCanSee(memberId) { return !!ghState.people[memberId]; }
function ghCanEdit(memberId) { return ghCanSee(memberId) && !isCurrentUserGuest(); }
function ghFmtDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  try { return new Date(iso + 'T12:00:00').toLocaleDateString(sysLocale(), { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso; }
}
function ghDrinkById(id) { return GH_DRINKS.find(d => d.id === id) || GH_DRINKS[0]; }

// Data of a member with all defaults (never changes the stored object)
function ghNorm(raw, child) {
  const d = (raw && typeof raw === 'object') ? JSON.parse(JSON.stringify(raw)) : {};
  d.blocks = Object.assign({ drink: true, meds: true, hands: false, values: false, vaccines: false, appointments: false }, d.blocks || {});
  d.drink = Object.assign({ goal: child ? 1250 : 2000, log: {} }, d.drink || {});
  if (!d.drink.log || typeof d.drink.log !== 'object') d.drink.log = {};
  d.drink.remind = Object.assign({ on: false, every: 120, from: '08:00', to: '20:00' }, d.drink.remind || {});
  d.meds = Object.assign({ list: [], taken: {} }, d.meds || {});
  if (!Array.isArray(d.meds.list)) d.meds.list = [];
  if (!d.meds.taken || typeof d.meds.taken !== 'object') d.meds.taken = {};
  d.meds.remind = Object.assign({ on: false }, d.meds.remind || {});
  d.hands = Object.assign({ log: {} }, d.hands || {});
  if (!d.hands.log || typeof d.hands.log !== 'object') d.hands.log = {};
  d.hands.remind = Object.assign({ on: false, times: ['10:00', '14:00', '18:00'] }, d.hands.remind || {});
  if (!Array.isArray(d.hands.remind.times)) d.hands.remind.times = [];
  ['values', 'vaccines', 'appointments'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  // since 1.153.1
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  d.sun = Object.assign({ log: {} }, obj(d.sun)); d.sun.log = obj(d.sun.log);
  d.sun.remind = Object.assign({ on: false, time: '09:00' }, obj(d.sun.remind));
  d.sleep = Object.assign({ bed: child ? '19:30' : '22:30', log: {} }, obj(d.sleep)); d.sleep.log = obj(d.sleep.log);
  d.sleep.remind = Object.assign({ on: false, morning: false, morningTime: '07:30' }, obj(d.sleep.remind));
  d.fruit = Object.assign({ goal: 5, log: {} }, obj(d.fruit)); d.fruit.log = obj(d.fruit.log);
  d.fruit.remind = Object.assign({ on: false, times: ['12:00', '17:00'] }, obj(d.fruit.remind));
  if (!Array.isArray(d.fruit.remind.times)) d.fruit.remind.times = [];
  d.tick = Object.assign({ log: {} }, obj(d.tick)); d.tick.log = obj(d.tick.log);
  d.tick.remind = Object.assign({ on: false, time: '19:00' }, obj(d.tick.remind));
  d.checkup = Object.assign({ list: [], uDone: [] }, obj(d.checkup));
  if (!Array.isArray(d.checkup.list)) d.checkup.list = [];
  if (!Array.isArray(d.checkup.uDone)) d.checkup.uDone = [];
  if (typeof d.checkup.u !== 'boolean') d.checkup.u = !!child && ghUsesUExams();
  d.checkup.remind = Object.assign({ on: false }, obj(d.checkup.remind));
  return d;
}
// The U/J examinations are German (also offered in Austria/Switzerland, where similar booklets exist)
function ghUsesUExams() {
  try { return ['DE', 'AT', 'CH'].includes((window.PINN_REGION && PINN_REGION.land) || 'DE'); } catch (e) { return true; }
}
function ghData(memberId) {
  const p = ghState.people[memberId];
  return ghNorm(p ? p.daten : null, p ? p.kind : false);
}
function ghPrune(d) {
  const limit = new Date(); limit.setDate(limit.getDate() - GH_KEEP_DAYS);
  const min = isoDate(limit);
  [d.drink.log, d.meds.taken, d.hands.log, d.sun.log, d.sleep.log, d.fruit.log, d.tick.log].forEach(log => Object.keys(log).forEach(k => { if (k < min) delete log[k]; }));
  return d;
}
function ghPassOn(memberId, d) {
  if (d && d.pass === true) return true;
  if (d && d.pass === false) return false;
  return famPassFilled(famPass(memberId));
}
function ghDrinkTotal(d, day) { return (d.drink.log[day || ghToday()] || []).reduce((s, x) => s + (Number(x.ml) || 0), 0); }
function ghMedSlots(d) {
  const out = [];
  d.meds.list.forEach(med => {
    const times = (Array.isArray(med.times) && med.times.length) ? med.times.slice().sort() : [''];
    times.forEach(t => out.push({ med, time: t, key: med.id + '@' + t }));
  });
  return out.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
}

/* ---------- Server ---------- */
async function ghLoad() {
  if (ghState.loading) return;
  ghState.loading = true;
  try {
    const res = await apiFetch('/api/pinn/gesundheit', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || tk('common.actionFailed'));
    const people = {};
    (Array.isArray(body.personen) ? body.personen : []).forEach(p => { if (p && p.mitglied) people[p.mitglied] = { daten: p.daten || {}, updated: p.updated || '', kind: !!p.kind }; });
    ghState.people = people;
    ghState.me = body.ich || '';
    ghState.error = body.error || '';
    ghState.loaded = true;
  } catch (e) {
    ghState.error = e.message || tk('common.noConnectionVpn');
  } finally {
    ghState.loading = false;
    ghState.at = Date.now();
  }
  if (currentView === 'familie' && famTab === 'gesundheit' && !famDetailId) renderFamily();
  try { if (currentView === 'uebersicht') renderShortcutsTile(); } catch (e) { /* shortcuts not loaded */ }
}
function ghEnsureLoaded() {
  if (ghState.loading) return;
  if (!ghState.loaded || Date.now() - ghState.at > GH_STALE_MS) ghLoad();
}
// Apply a change: locally at once, then to the server. On a conflict the change is applied again to the
// server state (so entries from another device are kept) and sent once more.
function ghChange(memberId, mutate) {
  if (!ghCanEdit(memberId)) return;
  const p = ghState.people[memberId];
  const local = ghPrune(ghNorm(p.daten, p.kind));
  mutate(local);
  p.daten = local;
  ghRefresh();
  const send = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await apiFetch('/api/pinn/gesundheit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mitglied: memberId, daten: p.daten, expected: p.updated }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.conflict) {
        const merged = ghPrune(ghNorm(body.daten, p.kind));
        mutate(merged);
        p.daten = merged;
        p.updated = body.updated || '';
        continue;
      }
      if (!res.ok) throw new Error(body.error || tk('common.actionFailed'));
      p.updated = body.updated || p.updated;
      ghState.error = '';
      return;
    }
    throw new Error(tk('common.actionFailed'));
  };
  ghSaveChain[memberId] = (ghSaveChain[memberId] || Promise.resolve())
    .then(send)
    .catch(e => { ghState.error = e.message || tk('common.noConnectionVpn'); })
    .then(() => ghRefresh());
}
function ghRefresh() {
  try { if (currentView === 'uebersicht') renderShortcutsTile(); } catch (e) { /* shortcuts not loaded */ }
  if (currentView === 'familie' && famTab === 'gesundheit' && !famDetailId) renderFamily();
}

/* ---------- Pictures of glasses and cups ---------- */
function ghVesselSvg(drink, fill) {
  const id = 'hpclip' + (++ghClipSeq);
  const f = Math.max(0, Math.min(1, fill));
  const shape = drink.cup
    ? 'M9 16 H37 V48 Q37 58 27 58 H19 Q9 58 9 48 Z'
    : 'M9 6 H39 L35 58 H13 Z';
  const top = drink.cup ? 16 : 6;
  const y = 58 - (58 - top) * f;
  const handle = drink.cup ? '<path d="M37 24 Q47 24 47 34 Q47 44 37 44" fill="none" stroke="currentColor" stroke-width="2.5"/>' : '';
  return `<svg class="hp-vessel" viewBox="0 0 50 62" aria-hidden="true"><defs><clipPath id="${id}"><path d="${shape}"/></clipPath></defs>`
    + `<rect x="0" y="${y.toFixed(1)}" width="50" height="62" fill="${drink.color}" clip-path="url(#${id})"/>`
    + `<path d="${shape}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>${handle}</svg>`;
}

/* ---------- Banner of the health pages (since 1.150.5) ----------
   Water that rises with the drinks of the day (level = share of the daily goal), bubbles, a heartbeat line
   with a beating heart and a few floating things (pill, apple, soap, leaf). At night: stars instead of the sun.
   Animated parts carry hs-anim, so energy saving and "reduce motion" stop them (css/energiesparen.css). */
function ghSceneHtml(level, color) {
  const night = typeof fzSceneIsNight === 'function' ? fzSceneIsNight() : (new Date().getHours() >= 20 || new Date().getHours() < 6);
  const lv = Math.max(0, Math.min(1, Number(level) || 0));
  const water = Math.round(16 + lv * 34); // px of water: 16 (empty) to 50 (goal reached)
  const sky = night
    ? [[6, 10], [18, 24], [31, 8], [44, 30], [57, 12], [69, 22], [82, 6], [91, 18]].map(([x, y], i) => `<span class="hs-star${i % 3 === 0 ? ' tw hs-anim' : ''}" style="left:${x}%;top:${y}px;animation-delay:-${i * 0.6}s"></span>`).join('')
    : '<span class="gh-sun hs-anim"></span>';
  // [emoji (shown as our icon), left %, top px, delay s, colour]
  const floats = [['💊', 30, 14, 0, '#E07A5F'], ['🍎', 50, 26, 1.4, '#D64545'], ['🧼', 64, 10, 2.6, '#8E6BBF'], ['🍃', 41, 36, 3.5, '#5E8C31']]
    .map(([e, x, y, d, c]) => `<span class="gh-float hs-anim" style="left:${x}%;top:${y}px;animation-delay:-${d}s;color:${c}">${e}</span>`).join('');
  const bubbles = [8, 19, 33, 47, 58, 72, 86, 93]
    .map((x, i) => `<span class="gh-bubble hs-anim" style="left:${x}%;bottom:${Math.max(2, water - 18)}px;animation-delay:-${(i * 0.9).toFixed(1)}s;animation-duration:${3 + (i % 3)}s"></span>`).join('');
  const wave = 'M0 8 Q25 0 50 8 T100 8 T150 8 T200 8 V40 H0Z';
  return `<div class="fam-band gh-scene${night ? ' is-night' : ''}" style="--fz:${famAttr(color || 'var(--c-pine)')}" aria-hidden="true">
      ${sky}
      <svg class="gh-ecg" viewBox="0 0 300 40" preserveAspectRatio="none"><path class="hs-anim" d="M0 22 H95 L104 10 L114 34 L124 4 L136 30 L144 22 H300"></path></svg>
      <span class="gh-heart hs-anim">❤️</span>
      ${floats}
      <div class="gh-water" style="height:${water}px">
        <svg class="gh-wave back hs-anim" viewBox="0 0 200 40" preserveAspectRatio="none"><path d="${wave}"/></svg>
        <svg class="gh-wave front hs-anim" viewBox="0 0 200 40" preserveAspectRatio="none"><path d="${wave}"/></svg>
      </div>
      ${bubbles}
    </div>`;
}
// Share of the daily drinking goal of one person (0..1), 0 without the drink block
function ghDrinkLevel(memberId) {
  if (!ghCanSee(memberId)) return 0;
  const d = ghData(memberId);
  if (!d.blocks.drink) return 0;
  const goal = Number(d.drink.goal) || 2000;
  return Math.min(1, ghDrinkTotal(d, ghToday()) / goal);
}
// Banner on top of the tab "Health": the water shows the average of the family
function ghListHeroHtml(people) {
  const today = ghToday();
  const seen = people.filter(m => ghCanSee(m.id));
  const drinkers = seen.filter(m => ghData(m.id).blocks.drink);
  const avg = drinkers.length ? drinkers.reduce((n, m) => n + ghDrinkLevel(m.id), 0) / drinkers.length : 0.35;
  const reached = drinkers.filter(m => ghDrinkLevel(m.id) >= 1).length;
  let medsAll = 0, medsDone = 0;
  seen.forEach(m => {
    const d = ghData(m.id);
    if (!d.blocks.meds || !d.meds.list.length) return;
    const slots = ghMedSlots(d).length;
    medsAll += slots;
    medsDone += Math.min((d.meds.taken[today] || []).length, slots);
  });
  const chips = [];
  if (drinkers.length) chips.push(`<span class="vt-chip${reached >= drinkers.length ? '' : ' muted'}">💧 ${reached}/${drinkers.length}</span>`);
  if (medsAll) chips.push(`<span class="vt-chip${medsDone >= medsAll ? '' : ' muted'}">💊 ${medsDone}/${medsAll}</span>`);
  return `<div class="fz-hero gh-listhero" style="--fz:var(--c-pine)">
    ${ghSceneHtml(avg)}
    <div class="pt-listhero-body"><h3 class="font-serif text-xl leading-tight">${tk('gh.title')}</h3>${chips.length ? `<div class="flex items-center gap-1.5 flex-wrap">${chips.join('')}</div>` : ''}</div>
  </div>`;
}

/* ---------- Tab "Health" (list of persons) ---------- */
function ghPaneHtml() {
  ghEnsureLoaded();
  const n = regionNotruf();
  const calls = [`<a class="fz-act-btn fam-sos" href="tel:${escapeHtml(n.rettung)}"><span class="fz-ti">🚑</span>${tk('family.call2', { rettung: escapeHtml(n.rettung) })}</a>`];
  if (n.polizei && n.polizei !== n.rettung) calls.push(`<a class="fz-act-btn" href="tel:${escapeHtml(n.polizei)}"><span class="fz-ti">🚓</span>${tk('family.call3', { polizei: escapeHtml(n.polizei) })}</a>`);
  const today = ghToday();
  const rows = members.filter(m => !famIsPet(m)).map(m => {
    let sub;
    if (ghCanSee(m.id)) {
      const d = ghData(m.id);
      const parts = [];
      if (d.blocks.drink) parts.push('💧 ' + tk('gh.drink.ofGoal', { ml: ghNum(ghDrinkTotal(d, today)), goal: ghNum(d.drink.goal) }));
      if (d.blocks.meds && d.meds.list.length) {
        const slots = ghMedSlots(d);
        const taken = (d.meds.taken[today] || []).length;
        parts.push('💊 ' + Math.min(taken, slots.length) + '/' + slots.length);
      }
      if (ghPassOn(m.id, d)) parts.push('🆘');
      sub = parts.join(' · ') || tk('gh.openHealth');
    } else {
      sub = famPassFilled(famPass(m.id)) ? tk('family.emergencyCard2') : tk('family.noEmergencyCardYet');
    }
    return `<button type="button" class="fam-pass-row" data-ghopen="${famAttr(m.id)}" style="--fam:${famAttr(famColor(m))}">
      <span class="fam-ava sm">${famAvatarInner(m)}</span>
      <span class="min-w-0 flex-1 text-left">
        <span class="block text-sm font-medium truncate">${escapeHtml(memberLabel(m))}</span>
        <span class="block text-[11px] text-ink/55 truncate">${escapeHtml(sub)}</span>
      </span>
      <span class="text-ink/30 text-lg leading-none">›</span>
    </button>`;
  }).join('');
  return `
    ${ghListHeroHtml(members.filter(m => !famIsPet(m)))}
    <div class="fam-card">
      <div class="fz-h">${tk('family.emergency2')}</div>
      <div class="flex gap-2">${calls.join('')}</div>
    </div>
    ${rows ? `<div class="fam-card"><div class="fz-h">${tk('gh.title')}</div><div class="flex flex-col">${rows}</div></div>` : ''}
    ${ghState.error && ghState.loaded ? `<p class="text-xs text-red-600 text-center">${escapeHtml(ghState.error)}</p>` : ''}
    ${ptNotfallHtml()}
    <p class="text-[11px] text-ink/40 text-center">${tk('gh.privacyNote')}</p>`;
}

/* ---------- Health page of one person ---------- */
function ghOpenPerson(memberId) {
  if (!memberById(memberId)) return;
  ghPersonId = memberId;
  famDetailId = null;
  if (currentView !== 'familie') setView('familie');
  if (famTab !== 'gesundheit') famSetTab('gesundheit'); else renderFamily();
  ghPersonId = memberId;
  renderFamily();
  const sc = document.getElementById('famScroll');
  if (sc) sc.scrollTop = 0;
}
function ghPersonHtml(m) {
  ghEnsureLoaded();
  const see = ghCanSee(m.id);
  const edit = ghCanEdit(m.id);
  const d = ghData(m.id);
  const own = ghState.me && ghState.me === m.id;
  const note = !see ? (ghState.loaded ? tk('gh.onlyPass') : tk('common.loading'))
    : (own ? tk('gh.visibleOwn') : tk('gh.visibleAdults'));
  const blocks = see ? GH_BLOCKS.filter(b => d.blocks[b.id]).map(b => ghBlockHtml(b.id, m, d, edit)).join('') : '';
  return `
    <button type="button" class="self-start text-sm text-ink/55 hover:text-pine -mb-1" data-ghact="back">‹ ${tk('gh.title')}</button>
    <div class="fz-hero" style="--fz:${famAttr(famColor(m))}">
      ${ghSceneHtml(ghDrinkLevel(m.id), famColor(m))}
      <div class="fam-hero-ava"><span class="fam-ava big" style="--fam:${famAttr(famColor(m))}">${famAvatarInner(m)}</span></div>
      <div class="fam-hero-body">
        <div class="font-serif text-xl">${escapeHtml(memberLabel(m))}</div>
        <div class="text-xs text-ink/50 mt-0.5">${escapeHtml(note)}</div>
      </div>
    </div>
    ${ghState.error && see ? `<p class="text-xs text-red-600">${escapeHtml(ghState.error)}</p>` : ''}
    ${blocks}
    ${ghPassBlockHtml(m, d, see, edit)}
    ${see && edit ? ghBlockChooserHtml(d) : ''}`;
}
function ghCard(icon, title, body, extra) {
  return `<div class="fam-card hp-card"><div class="hp-head"><div class="fz-h" style="margin-bottom:0">${icon} ${title}</div>${extra || ''}</div>${body}</div>`;
}
function ghBlockHtml(id, m, d, edit) {
  if (id === 'drink') return ghDrinkHtml(m, d, edit);
  if (id === 'meds') return ghMedsHtml(m, d, edit);
  if (id === 'hands') return ghHandsHtml(m, d, edit);
  if (id === 'values') return ghValuesHtml(m, d, edit);
  if (id === 'vaccines') return ghVaccinesHtml(m, d, edit);
  if (id === 'appointments') return ghAppointmentsHtml(m, d, edit);
  if (id === 'sun') return ghSunHtml(m, d, edit);
  if (id === 'sleep') return ghSleepHtml(m, d, edit);
  if (id === 'fruit') return ghFruitHtml(m, d, edit);
  if (id === 'tick') return ghTickHtml(m, d, edit);
  if (id === 'checkup') return ghCheckupHtml(m, d, edit);
  return '';
}

/* ---------- Reminder settings (push, since 1.149.1) ---------- */
function ghRemindHtml(kind, m, r, edit) {
  if (!edit) return '';
  const mem = `data-member="${famAttr(m.id)}" data-kind="${kind}"`;
  const label = tk(kind === 'drink' ? 'gh.remind.drinkOn' : (kind === 'meds' ? 'gh.remind.medsOn' : 'gh.remind.handsOn'));
  let opts = '';
  if (r.on && kind === 'drink') {
    const every = GH_EVERY.includes(Number(r.every)) ? Number(r.every) : 120;
    opts = `<div class="hp-remind-opts">
      <label class="hp-remind-f">${tk('gh.remind.every')}<select class="hp-in" data-ghchange="rem-every" ${mem}>${GH_EVERY.map(n => `<option value="${n}"${n === every ? ' selected' : ''}>${tk('gh.remind.everyOpt', { min: n })}</option>`).join('')}</select></label>
      <label class="hp-remind-f">${tk('gh.remind.from')}<input type="time" class="hp-in" data-ghchange="rem-from" ${mem} value="${ghAttr(r.from)}" /></label>
      <label class="hp-remind-f">${tk('gh.remind.to')}<input type="time" class="hp-in" data-ghchange="rem-to" ${mem} value="${ghAttr(r.to)}" /></label>
    </div>`;
  } else if (r.on && kind === 'hands') {
    const times = (r.times || []).concat(['', '', '']).slice(0, 3);
    opts = `<div class="hp-remind-opts">
      ${times.map((t, i) => `<label class="hp-remind-f">${i === 0 ? tk('gh.remind.times') : '&nbsp;'}<input type="time" class="hp-in hp-hand-time" data-ghchange="rem-time" ${mem} data-i="${i}" value="${ghAttr(t)}" /></label>`).join('')}
    </div>`;
  }
  // For a child the parents can get the same reminder (switch per child, default on; server: pinn-gesundheit.js)
  const person = ghState.people[m.id];
  if (r.on && person && person.kind) {
    const parentsOn = !person.daten || person.daten.remindParents !== false;
    opts += `<label class="fz-check hp-remind-parents"><input type="checkbox" data-ghchange="rem-parents" ${mem}${parentsOn ? ' checked' : ''} /><span>👪 ${tk('gh.remind.parents')}</span></label>`;
  }
  return `<div class="hp-remind">
    <label class="fz-check"><input type="checkbox" data-ghchange="rem-on" ${mem}${r.on ? ' checked' : ''} /><span>🔔 ${label}</span></label>
    ${opts}
    ${r.on ? `<p class="text-[11px] text-ink/45 mt-1">${tk('gh.remind.hint')}</p>` : ''}
  </div>`;
}

/* ---------- Block: drink ---------- */
function ghDrinkHint(total, goal) {
  const rest = goal - total;
  if (rest <= 0) return tk('gh.drink.done');
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  const glasses = Math.ceil(rest / 250);
  if (h >= GH_DAY_TO) return tk('gh.drink.restLate', { ml: ghNum(rest) });
  const from = Math.max(h, GH_DAY_FROM);
  const hours = Math.max(1, GH_DAY_TO - from);
  const perHour = Math.ceil(rest / hours / 10) * 10;
  const expected = goal * Math.max(0, Math.min(1, (h - GH_DAY_FROM) / (GH_DAY_TO - GH_DAY_FROM)));
  const plan = total >= expected ? tk('gh.drink.onTrack') : tk('gh.drink.behind');
  return tk('gh.drink.rest', { ml: ghNum(rest), glasses: ghNum(glasses), perHour: ghNum(perHour), until: GH_DAY_TO + ':00' }) + ' ' + plan;
}
// Open "Settings" sections of the drink block per person (survive the re-render after every change)
const ghDrinkSettingsOpen = new Set();
function ghDrinkHtml(m, d, edit) {
  const today = ghToday();
  const list = (d.drink.log[today] || []).slice().sort((a, b) => String(a.t).localeCompare(String(b.t)));
  const total = ghDrinkTotal(d, today);
  const goal = Number(d.drink.goal) || 2000;
  const pct = Math.min(100, Math.round(total / goal * 100));
  const goalSel = edit
    ? `<select class="hp-goal" data-ghchange="goal" data-member="${famAttr(m.id)}" aria-label="${ghAttr(tk('gh.drink.goal'))}">${GH_GOALS.concat(GH_GOALS.includes(goal) ? [] : [goal]).sort((a, b) => a - b).map(g => `<option value="${g}"${g === goal ? ' selected' : ''}>${tk('gh.drink.goalOpt', { ml: ghNum(g) })}</option>`).join('')}</select>`
    : `<span class="text-xs text-ink/50">${tk('gh.drink.goalOpt', { ml: ghNum(goal) })}</span>`;
  const chips = list.map(x => {
    const dr = ghDrinkById(x.kind);
    return `<span class="hp-chip">${ghVesselSvg(dr, 0.7)}<span>${ghNum(x.ml)} ml</span><span class="text-ink/40">${escapeHtml(x.t || '')}</span>${edit ? `<button type="button" class="hp-x" data-ghact="drink-del" data-member="${famAttr(m.id)}" data-id="${famAttr(x.id)}" aria-label="${ghAttr(tk('common.delete'))}">×</button>` : ''}</span>`;
  }).join('');
  // Since 1.150.5: goal, today's drinks and the reminder sit in one folding "Settings" section under the button
  const open = ghDrinkSettingsOpen.has(m.id);
  const settings = `<details class="hp-fold" data-ghfold="drink" data-member="${famAttr(m.id)}"${open ? ' open' : ''}>
      <summary class="hp-fold-sum"><span>⚙️ ${tk('nav.settings')}</span><span class="hp-fold-meta">${tk('gh.drink.goalOpt', { ml: ghNum(goal) })}${list.length ? ' · ' + list.length + ' ×' : ''}</span><span class="hp-fold-arrow" aria-hidden="true">›</span></summary>
      <div class="hp-fold-body">
        <div class="hp-fold-row"><span class="hp-fold-l">🎯 ${tk('gh.drink.goal')}</span>${goalSel}</div>
        <div class="hp-fold-l mt-3">🥤 ${tk('gh.drink.todayList')}</div>
        ${chips ? `<div class="hp-chips mt-1.5">${chips}</div>` : `<p class="text-xs text-ink/45 mt-1">${tk('gh.drink.nothingYet')}</p>`}
        ${ghRemindHtml('drink', m, d.drink.remind, edit)}
      </div>
    </details>`;
  const body = `
    <div class="hp-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${total}"><span style="width:${pct}%"></span></div>
    <div class="flex items-baseline justify-between gap-2 mt-1.5">
      <span class="text-sm font-medium">${tk('gh.drink.ofGoal', { ml: ghNum(total), goal: ghNum(goal) })}</span>
      <span class="text-xs text-ink/50">${pct} %</span>
    </div>
    <p class="text-xs text-ink/60 mt-1">${escapeHtml(ghDrinkHint(total, goal))}</p>
    ${edit ? `<button type="button" class="hp-big-btn" data-ghact="drink-add" data-member="${famAttr(m.id)}">💧 ${tk('gh.drink.add')}</button>` : ''}
    ${settings}`;
  return ghCard('💧', tk('gh.block.drink'), body, '');
}
// Remember whether "Settings" of the drink block is open ("toggle" does not bubble, hence capture)
document.addEventListener('toggle', (e) => {
  const el = e.target;
  if (!el || !el.matches || !el.matches('details[data-ghfold="drink"]')) return;
  const id = el.dataset.member;
  if (el.open) ghDrinkSettingsOpen.add(id); else ghDrinkSettingsOpen.delete(id);
}, true);
function ghOpenDrinkPopup(memberId) {
  if (!ghCanEdit(memberId)) return;
  ghDrinkPick = { memberId, drink: null };
  let ov = document.getElementById('hpDrinkOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'hpDrinkOverlay';
    ov.className = 'hp-overlay';
    ov.addEventListener('click', (e) => {
      if (e.target === ov) { ghCloseDrinkPopup(); return; }
      const b = e.target.closest('[data-hpdrink],[data-hpml],[data-hpback],[data-hpclose]');
      if (!b) return;
      if (b.dataset.hpclose !== undefined) ghCloseDrinkPopup();
      else if (b.dataset.hpback !== undefined) { ghDrinkPick.drink = null; ghRenderDrinkPopup(); }
      else if (b.dataset.hpdrink) { ghDrinkPick.drink = b.dataset.hpdrink; ghRenderDrinkPopup(); }
      else if (b.dataset.hpml) ghLogDrink(ghDrinkPick.memberId, ghDrinkPick.drink, Number(b.dataset.hpml));
    });
    document.body.appendChild(ov);
  }
  ghRenderDrinkPopup();
  ov.classList.remove('hidden');
}
function ghCloseDrinkPopup() {
  const ov = document.getElementById('hpDrinkOverlay');
  if (ov) ov.classList.add('hidden');
  ghDrinkPick = null;
}
function ghRenderDrinkPopup() {
  const ov = document.getElementById('hpDrinkOverlay');
  if (!ov || !ghDrinkPick) return;
  const pick = ghDrinkPick.drink ? ghDrinkById(ghDrinkPick.drink) : null;
  const items = pick
    ? GH_AMOUNTS.map(ml => `<button type="button" class="hp-pick" data-hpml="${ml}">${ghVesselSvg(pick, ml / 500)}<span class="hp-pick-t">${ghNum(ml)} ml</span></button>`).join('')
    : GH_DRINKS.map(dr => `<button type="button" class="hp-pick" data-hpdrink="${dr.id}">${ghVesselSvg(dr, 0.75)}<span class="hp-pick-t">${escapeHtml(tk(dr.key))}</span></button>`).join('');
  ov.innerHTML = `<div class="hp-sheet" role="dialog" aria-modal="true">
    <div class="flex items-center justify-between gap-2 mb-3">
      ${pick ? `<button type="button" class="text-sm text-ink/55" data-hpback>‹ ${escapeHtml(tk('cal.back'))}</button>` : '<span></span>'}
      <div class="font-serif text-lg">${escapeHtml(pick ? tk('gh.drink.howMuch', { drink: tk(pick.key) }) : tk('gh.drink.what'))}</div>
      <button type="button" class="hp-x big" data-hpclose aria-label="${ghAttr(tk('common.close'))}">×</button>
    </div>
    <div class="hp-pick-grid">${items}</div>
  </div>`;
}
function ghLogDrink(memberId, kind, ml) {
  if (!ml || !kind) return;
  ghCloseDrinkPopup();
  const now = new Date();
  const entry = { id: ghId(), t: pad2(now.getHours()) + ':' + pad2(now.getMinutes()), kind, ml };
  const day = ghToday();
  try { finShowToast(tk('gh.drink.logged', { ml: ghNum(ml), drink: tk(ghDrinkById(kind).key) })); } catch (e) { /* no toast */ }
  ghChange(memberId, (d) => {
    const list = d.drink.log[day] || [];
    if (!list.some(x => x.id === entry.id)) list.push(entry);
    d.drink.log[day] = list;
  });
}

/* ---------- Block: medication & vitamins ---------- */
function ghMedsHtml(m, d, edit) {
  const today = ghToday();
  const taken = d.meds.taken[today] || [];
  const slots = ghMedSlots(d);
  const rows = slots.map(s => {
    const on = taken.includes(s.key);
    const icon = s.med.kind === 'vit' ? '🍊' : (s.med.kind === 'other' ? '🌿' : '💊');
    return `<div class="hp-row">
      <label class="hp-tick"><input type="checkbox" data-ghchange="med-taken" data-member="${famAttr(m.id)}" data-key="${famAttr(s.key)}"${on ? ' checked' : ''}${edit ? '' : ' disabled'} />
        <span class="hp-time">${escapeHtml(s.time || tk('gh.meds.anyTime'))}</span>
        <span class="min-w-0 flex-1 ${on ? 'line-through text-ink/40' : ''}">${icon} ${escapeHtml(s.med.name)}${s.med.dose ? `<span class="text-ink/50"> · ${escapeHtml(s.med.dose)}</span>` : ''}</span>
      </label>
      ${edit ? `<button type="button" class="hp-edit" data-ghact="med-edit" data-member="${famAttr(m.id)}" data-id="${famAttr(s.med.id)}" aria-label="${ghAttr(tk('common.edit'))}">✏️</button>` : ''}
    </div>`;
  }).join('');
  const body = rows
    ? `<div class="hp-list">${rows}</div>`
    : `<p class="text-sm text-ink/50">${tk('gh.meds.empty')}</p>`;
  const rem = ghRemindHtml('meds', m, d.meds.remind, edit);
  const add = edit ? `<button type="button" class="fz-mini-btn" data-ghact="med-new" data-member="${famAttr(m.id)}">+ ${tk('gh.add')}</button>` : '';
  return ghCard('💊', tk('gh.block.meds'), body + rem, add);
}
function ghMedForm(memberId, medId) {
  const d = ghData(memberId);
  const med = d.meds.list.find(x => x.id === medId) || { name: '', kind: 'med', dose: '', times: ['08:00'] };
  const times = (med.times || []).concat(['', '', '']).slice(0, 4);
  ghModal = { type: 'med', memberId, id: medId || '' };
  famOpenModal(`
    <h3 class="font-serif text-lg mb-3">${tk(medId ? 'gh.meds.edit' : 'gh.meds.new')}</h3>
    <label class="hp-lbl">${tk('gh.meds.name')}<input id="hpMedName" type="text" maxlength="80" value="${ghAttr(med.name)}" class="hp-in" /></label>
    <label class="hp-lbl">${tk('gh.meds.kind')}<select id="hpMedKind" class="hp-in">
      ${[['med', 'gh.meds.kindMed'], ['vit', 'gh.meds.kindVit'], ['other', 'gh.meds.kindOther']].map(k => `<option value="${k[0]}"${med.kind === k[0] ? ' selected' : ''}>${tk(k[1])}</option>`).join('')}
    </select></label>
    <label class="hp-lbl">${tk('gh.meds.dose')}<input id="hpMedDose" type="text" maxlength="60" value="${ghAttr(med.dose)}" class="hp-in" /></label>
    <div class="hp-lbl">${tk('gh.meds.times')}<div class="grid grid-cols-4 gap-2">${times.map((t, i) => `<input type="time" class="hp-in hp-med-time" data-i="${i}" value="${ghAttr(t)}" />`).join('')}</div></div>
    ${ghModalButtons(!!medId)}`);
}
function ghSaveMed() {
  const name = document.getElementById('hpMedName').value.trim().slice(0, 80);
  if (!name) { document.getElementById('hpMedName').focus(); return; }
  const kind = document.getElementById('hpMedKind').value;
  const dose = document.getElementById('hpMedDose').value.trim().slice(0, 60);
  const times = Array.from(document.querySelectorAll('.hp-med-time')).map(i => i.value).filter(v => /^\d{2}:\d{2}$/.test(v));
  const uniq = Array.from(new Set(times)).sort();
  const st = ghModal;
  famCloseModal();
  ghChange(st.memberId, (d) => {
    const id = st.id || ghId();
    const med = { id, name, kind: ['med', 'vit', 'other'].includes(kind) ? kind : 'med', dose, times: uniq };
    const i = d.meds.list.findIndex(x => x.id === id);
    if (i >= 0) d.meds.list[i] = med; else d.meds.list.push(med);
  });
}

/* ---------- Block: hand washing ---------- */
function ghHandsHtml(m, d, edit) {
  const n = Number(d.hands.log[ghToday()]) || 0;
  const body = `<div class="flex items-center gap-3">
      <div class="hp-count">${ghNum(n)}×</div>
      <div class="flex-1 text-sm text-ink/60">${tk('gh.hands.today')}</div>
      ${edit ? `<button type="button" class="fz-mini-btn" data-ghact="hands-minus" data-member="${famAttr(m.id)}"${n ? '' : ' disabled'} aria-label="−1">−</button>
      <button type="button" class="fz-mini-btn primary" data-ghact="hands-plus" data-member="${famAttr(m.id)}">+1</button>` : ''}
    </div>
    <p class="text-[11px] text-ink/45 mt-2">${tk('gh.hands.tip')}</p>
    ${ghRemindHtml('hands', m, d.hands.remind, edit)}`;
  return ghCard('🧼', tk('gh.block.hands'), body);
}

/* ---------- Block: values ---------- */
function ghValuesHtml(m, d, edit) {
  const list = d.values.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);
  const kg = PINN_REGION.unit('kg');
  const rows = list.map(v => `<div class="hp-row">
      <span class="hp-time">${escapeHtml(ghFmtDate(v.date))}</span>
      <span class="flex-1 text-sm">${[v.weight ? '⚖️ ' + ghNum(v.weight) + ' ' + kg : '', v.sys && v.dia ? '❤️ ' + v.sys + '/' + v.dia : '', v.pulse ? '💓 ' + v.pulse : ''].filter(Boolean).join(' · ')}</span>
      ${edit ? `<button type="button" class="hp-x" data-ghact="value-del" data-member="${famAttr(m.id)}" data-id="${famAttr(v.id)}" aria-label="${ghAttr(tk('common.delete'))}">×</button>` : ''}
    </div>`).join('');
  const body = rows ? `<div class="hp-list">${rows}</div>` : `<p class="text-sm text-ink/50">${tk('gh.values.empty')}</p>`;
  const add = edit ? `<button type="button" class="fz-mini-btn" data-ghact="value-new" data-member="${famAttr(m.id)}">+ ${tk('gh.add')}</button>` : '';
  return ghCard('⚖️', tk('gh.block.values'), body, add);
}
function ghValueForm(memberId) {
  ghModal = { type: 'value', memberId, id: '' };
  famOpenModal(`
    <h3 class="font-serif text-lg mb-3">${tk('gh.values.new')}</h3>
    <label class="hp-lbl">${tk('gh.date')}<input id="hpValDate" type="date" value="${ghToday()}" class="hp-in" /></label>
    <label class="hp-lbl">${tk('gh.values.weight', { unit: PINN_REGION.unit('kg') })}<input id="hpValWeight" type="number" inputmode="decimal" step="0.1" min="0" class="hp-in" /></label>
    <div class="hp-lbl">${tk('gh.values.bp')}<div class="grid grid-cols-2 gap-2"><input id="hpValSys" type="number" inputmode="numeric" placeholder="${ghAttr(tk('gh.values.sys'))}" class="hp-in" /><input id="hpValDia" type="number" inputmode="numeric" placeholder="${ghAttr(tk('gh.values.dia'))}" class="hp-in" /></div></div>
    <label class="hp-lbl">${tk('gh.values.pulse')}<input id="hpValPulse" type="number" inputmode="numeric" class="hp-in" /></label>
    ${ghModalButtons(false)}`);
}
function ghSaveValue() {
  const num = (id, max) => { const v = Number(String(document.getElementById(id).value).replace(',', '.')); return isFinite(v) && v > 0 && v < max ? Math.round(v * 10) / 10 : 0; };
  const date = document.getElementById('hpValDate').value || ghToday();
  const v = { id: ghId(), date, weight: num('hpValWeight', 1000), sys: Math.round(num('hpValSys', 300)), dia: Math.round(num('hpValDia', 250)), pulse: Math.round(num('hpValPulse', 300)) };
  if (!v.weight && !(v.sys && v.dia) && !v.pulse) return;
  const st = ghModal;
  famCloseModal();
  ghChange(st.memberId, (d) => { d.values.push(v); d.values = d.values.slice(-300); });
}

/* ---------- Block: vaccinations ---------- */
function ghVaccinesHtml(m, d, edit) {
  const today = ghToday();
  const soon = new Date(); soon.setDate(soon.getDate() + 60);
  const soonIso = isoDate(soon);
  const list = d.vaccines.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const rows = list.map(v => {
    const due = v.next && v.next <= soonIso;
    return `<div class="hp-row">
      <span class="flex-1 text-sm"><b>${escapeHtml(v.name)}</b>${v.date ? `<span class="text-ink/50"> · ${escapeHtml(ghFmtDate(v.date))}</span>` : ''}
        ${v.next ? `<span class="block text-[11px] ${due ? 'text-mustard font-medium' : 'text-ink/45'}">${tk(v.next < today ? 'gh.vaccines.overdue' : 'gh.vaccines.next', { date: escapeHtml(ghFmtDate(v.next)) })}</span>` : ''}</span>
      ${edit ? `<button type="button" class="hp-x" data-ghact="vaccine-del" data-member="${famAttr(m.id)}" data-id="${famAttr(v.id)}" aria-label="${ghAttr(tk('common.delete'))}">×</button>` : ''}
    </div>`;
  }).join('');
  const body = rows ? `<div class="hp-list">${rows}</div>` : `<p class="text-sm text-ink/50">${tk('gh.vaccines.empty')}</p>`;
  const add = edit ? `<button type="button" class="fz-mini-btn" data-ghact="vaccine-new" data-member="${famAttr(m.id)}">+ ${tk('gh.add')}</button>` : '';
  return ghCard('💉', tk('gh.block.vaccines'), body, add);
}
function ghVaccineForm(memberId) {
  ghModal = { type: 'vaccine', memberId, id: '' };
  famOpenModal(`
    <h3 class="font-serif text-lg mb-3">${tk('gh.vaccines.new')}</h3>
    <label class="hp-lbl">${tk('gh.vaccines.name')}<input id="hpVacName" type="text" maxlength="80" class="hp-in" /></label>
    <label class="hp-lbl">${tk('gh.date')}<input id="hpVacDate" type="date" value="${ghToday()}" class="hp-in" /></label>
    <label class="hp-lbl">${tk('gh.vaccines.nextLabel')}<input id="hpVacNext" type="date" class="hp-in" /></label>
    ${ghModalButtons(false)}`);
}
function ghSaveVaccine() {
  const name = document.getElementById('hpVacName').value.trim().slice(0, 80);
  if (!name) { document.getElementById('hpVacName').focus(); return; }
  const v = { id: ghId(), name, date: document.getElementById('hpVacDate').value || '', next: document.getElementById('hpVacNext').value || '' };
  const st = ghModal;
  famCloseModal();
  ghChange(st.memberId, (d) => { d.vaccines.push(v); });
}

/* ---------- Block: doctor's appointments ---------- */
function ghAppointmentsHtml(m, d, edit) {
  const today = ghToday();
  const upcoming = d.appointments.filter(a => (a.date || '') >= today).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const past = d.appointments.length - upcoming.length;
  const rows = upcoming.map(a => `<div class="hp-row">
      <span class="hp-time">${escapeHtml(ghFmtDate(a.date))}${a.time ? '<br>' + escapeHtml(a.time) : ''}</span>
      <span class="flex-1 text-sm"><b>${escapeHtml(a.who)}</b>${a.note ? `<span class="block text-[11px] text-ink/50">${escapeHtml(a.note)}</span>` : ''}</span>
      ${edit ? `<button type="button" class="hp-x" data-ghact="appt-del" data-member="${famAttr(m.id)}" data-id="${famAttr(a.id)}" aria-label="${ghAttr(tk('common.delete'))}">×</button>` : ''}
    </div>`).join('');
  const body = (rows ? `<div class="hp-list">${rows}</div>` : `<p class="text-sm text-ink/50">${tk('gh.appointments.empty')}</p>`)
    + (past ? `<p class="text-[11px] text-ink/40 mt-1">${tk('gh.appointments.past', { n: past })}</p>` : '');
  const add = edit ? `<button type="button" class="fz-mini-btn" data-ghact="appt-new" data-member="${famAttr(m.id)}">+ ${tk('gh.add')}</button>` : '';
  return ghCard('🩺', tk('gh.block.appointments'), body, add);
}
function ghAppointmentForm(memberId) {
  ghModal = { type: 'appt', memberId, id: '' };
  famOpenModal(`
    <h3 class="font-serif text-lg mb-3">${tk('gh.appointments.new')}</h3>
    <label class="hp-lbl">${tk('gh.appointments.who')}<input id="hpApWho" type="text" maxlength="80" class="hp-in" /></label>
    <div class="grid grid-cols-2 gap-2">
      <label class="hp-lbl">${tk('gh.date')}<input id="hpApDate" type="date" value="${ghToday()}" class="hp-in" /></label>
      <label class="hp-lbl">${tk('gh.time')}<input id="hpApTime" type="time" class="hp-in" /></label>
    </div>
    <label class="hp-lbl">${tk('gh.note')}<input id="hpApNote" type="text" maxlength="200" class="hp-in" /></label>
    ${ghModalButtons(false)}`);
}
function ghSaveAppointment() {
  const who = document.getElementById('hpApWho').value.trim().slice(0, 80);
  const date = document.getElementById('hpApDate').value;
  if (!who) { document.getElementById('hpApWho').focus(); return; }
  if (!date) { document.getElementById('hpApDate').focus(); return; }
  const a = { id: ghId(), who, date, time: document.getElementById('hpApTime').value || '', note: document.getElementById('hpApNote').value.trim().slice(0, 200) };
  const st = ghModal;
  famCloseModal();
  ghChange(st.memberId, (d) => { d.appointments.push(a); d.appointments = d.appointments.slice(-200); });
}

/* ---------- Reminder settings of the blocks since 1.153.1 ---------- */
// fields: [{ f: 'time'|'times', label }]; switches: [{ f: 'morning', label, time?: 'morningTime', timeLabel? }] (inside d[kind].remind)
function ghRemind2Html(kind, m, r, edit, onKey, fields, switches) {
  if (!edit) return '';
  const mem = `data-member="${famAttr(m.id)}" data-kind="${kind}"`;
  let opts = '';
  if (r.on) {
    const inputs = [];
    (fields || []).forEach(f => {
      if (f.f === 'times') {
        const times = (r.times || []).concat(['', '', '']).slice(0, 3);
        times.forEach((t, i) => inputs.push(`<label class="hp-remind-f">${i === 0 ? f.label : '&nbsp;'}<input type="time" class="hp-in hp-times-${kind}" data-ghchange="r2-times" ${mem} value="${ghAttr(t)}" /></label>`));
      } else {
        inputs.push(`<label class="hp-remind-f">${f.label}<input type="time" class="hp-in" data-ghchange="r2-time" data-field="${f.f}" ${mem} value="${ghAttr(r[f.f])}" /></label>`);
      }
    });
    if (inputs.length) opts += `<div class="hp-remind-opts">${inputs.join('')}</div>`;
    (switches || []).forEach(sw => {
      opts += `<label class="fz-check hp-remind-parents"><input type="checkbox" data-ghchange="r2-flag" data-field="${sw.f}" ${mem}${r[sw.f] ? ' checked' : ''} /><span>${sw.label}</span></label>`;
      // a switch may bring its own time field, shown right below it while it is on
      if (sw.time && r[sw.f]) opts += `<div class="hp-remind-opts"><label class="hp-remind-f">${sw.timeLabel}<input type="time" class="hp-in" data-ghchange="r2-time" data-field="${sw.time}" ${mem} value="${ghAttr(r[sw.time])}" /></label></div>`;
    });
    const person = ghState.people[m.id];
    if (person && person.kind) {
      const parentsOn = !person.daten || person.daten.remindParents !== false;
      opts += `<label class="fz-check hp-remind-parents"><input type="checkbox" data-ghchange="rem-parents" ${mem}${parentsOn ? ' checked' : ''} /><span>👪 ${tk('gh.remind.parents')}</span></label>`;
    }
  }
  return `<div class="hp-remind">
    <label class="fz-check"><input type="checkbox" data-ghchange="r2-on" ${mem}${r.on ? ' checked' : ''} /><span>🔔 ${tk(onKey)}</span></label>
    ${opts}
    ${r.on ? `<p class="text-[11px] text-ink/45 mt-1">${tk('gh.remind.hint')}</p>` : ''}
  </div>`;
}
function ghCheckRow(m, kind, on, label, edit) {
  return `<label class="hp-done${on ? ' on' : ''}"><input type="checkbox" data-ghchange="day-done" data-member="${famAttr(m.id)}" data-kind="${kind}"${on ? ' checked' : ''}${edit ? '' : ' disabled'} /><span>${label}</span></label>`;
}

/* ---------- Block: sunscreen (since 1.153.1) ---------- */
// Today's highest UV index at home (weather of the overview, js/wetter.js) – null if unknown
function ghUvToday() {
  try {
    const day = (weatherDaily && Array.isArray(weatherDaily.days)) ? weatherDaily.days.find(x => x.date === ghToday()) : null;
    if (day && day.uv != null && isFinite(day.uv)) return Math.round(day.uv);
  } catch (e) { /* no weather yet */ }
  return null;
}
function ghSunHtml(m, d, edit) {
  const uv = ghUvToday();
  const done = !!d.sun.log[ghToday()];
  const need = uv != null && uv >= GH_UV_MIN;
  const level = uv == null ? '' : (uv >= 8 ? 'very' : (uv >= 6 ? 'high' : (uv >= GH_UV_MIN ? 'mid' : 'low')));
  const head = uv == null
    ? `<p class="text-sm text-ink/55">${tk('gh.sun.noUv')}</p>`
    : `<div class="flex items-center gap-3"><div class="hp-uv lvl-${level}">UV ${ghNum(uv)}</div><div class="flex-1 text-sm">${tk(need ? 'gh.sun.need' : 'gh.sun.noNeed')}</div></div>`;
  const body = head
    + ghCheckRow(m, 'sun', done, tk('gh.sun.applied'), edit)
    + `<p class="text-[11px] text-ink/45 mt-2">${tk('gh.sun.tip', { uv: GH_UV_MIN })}</p>`
    + ghRemind2Html('sun', m, d.sun.remind, edit, 'gh.sun.remindOn', [{ f: 'time', label: tk('gh.remind.at') }]);
  return ghCard('🧴', tk('gh.block.sun'), body);
}

/* ---------- Block: sleep (since 1.153.1) ---------- */
function ghSleepHtml(m, d, edit) {
  const today = ghToday();
  const mid = famAttr(m.id);
  const v = Number(d.sleep.log[today]) || 0;
  const faces = GH_SLEEP_FACES.map(f => `<button type="button" class="hp-face${v === f.v ? ' on' : ''}" data-ghact="sleep-rate" data-member="${mid}" data-v="${f.v}"${edit ? '' : ' disabled'} aria-pressed="${v === f.v ? 'true' : 'false'}"><span class="hp-face-ic">${f.icon}</span><span>${tk(f.key)}</span></button>`).join('');
  // the last seven nights as small dots (oldest left)
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const k = isoDate(dt);
    const r = Number(d.sleep.log[k]) || 0;
    week.push(`<span class="hp-night r${r}" title="${ghAttr(ghFmtDate(k))}"></span>`);
  }
  const bed = edit
    ? `<input type="time" class="hp-in hp-bed" data-ghchange="sleep-bed" data-member="${mid}" value="${ghAttr(d.sleep.bed)}" aria-label="${ghAttr(tk('gh.sleep.bedtime'))}" />`
    : `<b>${escapeHtml(d.sleep.bed)}</b>`;
  const body = `
    <div class="hp-fold-row"><span class="hp-fold-l">🌙 ${tk('gh.sleep.bedtime')}</span>${bed}</div>
    <div class="hp-fold-l mt-3">${tk('gh.sleep.question')}</div>
    <div class="hp-faces">${faces}</div>
    <div class="flex items-center gap-2 mt-2"><span class="text-[11px] text-ink/45">${tk('gh.sleep.week')}</span><span class="hp-nights">${week.join('')}</span></div>
    ${ghRemind2Html('sleep', m, d.sleep.remind, edit, 'gh.sleep.remindOn', [], [{ f: 'morning', label: '☀️ ' + tk('gh.sleep.morningOn'), time: 'morningTime', timeLabel: tk('gh.sleep.morningAt') }])}`;
  return ghCard('😴', tk('gh.block.sleep'), body);
}

/* ---------- Block: fruit & vegetables (since 1.153.1) ---------- */
function ghFruitHtml(m, d, edit) {
  const n = Number(d.fruit.log[ghToday()]) || 0;
  const goal = Math.max(1, Math.min(10, Number(d.fruit.goal) || 5));
  const mid = famAttr(m.id);
  const dots = [];
  for (let i = 0; i < Math.max(goal, n); i++) dots.push(`<span class="hp-portion${i < n ? ' on' : ''}${i >= goal ? ' extra' : ''}"></span>`);
  const goalSel = edit
    ? `<select class="hp-goal" data-ghchange="fruit-goal" data-member="${mid}" aria-label="${ghAttr(tk('gh.fruit.goal'))}">${[3, 4, 5, 6, 7, 8].map(g => `<option value="${g}"${g === goal ? ' selected' : ''}>${tk('gh.fruit.goalOpt', { n: g })}</option>`).join('')}</select>`
    : '';
  const body = `<div class="flex items-center gap-3">
      <div class="hp-count">${ghNum(n)}<span class="hp-count-of">/${ghNum(goal)}</span></div>
      <div class="flex-1"><div class="hp-portions">${dots.join('')}</div><div class="text-xs text-ink/55 mt-1">${tk(n >= goal ? 'gh.fruit.done' : 'gh.fruit.today')}</div></div>
      ${edit ? `<button type="button" class="fz-mini-btn" data-ghact="fruit-minus" data-member="${mid}"${n ? '' : ' disabled'} aria-label="−1">−</button>
      <button type="button" class="fz-mini-btn primary" data-ghact="fruit-plus" data-member="${mid}">+1</button>` : ''}
    </div>
    ${goalSel ? `<div class="hp-fold-row mt-3"><span class="hp-fold-l">🎯 ${tk('gh.fruit.goal')}</span>${goalSel}</div>` : ''}
    <p class="text-[11px] text-ink/45 mt-2">${tk('gh.fruit.tip')}</p>
    ${ghRemind2Html('fruit', m, d.fruit.remind, edit, 'gh.fruit.remindOn', [{ f: 'times', label: tk('gh.remind.times') }])}`;
  return ghCard('🍎', tk('gh.block.fruit'), body);
}

/* ---------- Block: tick check (since 1.153.1) ---------- */
function ghTickSeason() { return GH_TICK_MONTHS.includes(new Date().getMonth() + 1); }
function ghTickHtml(m, d, edit) {
  const season = ghTickSeason();
  const done = !!d.tick.log[ghToday()];
  const body = (season
    ? ghCheckRow(m, 'tick', done, tk('gh.tick.done'), edit)
    : `<p class="text-sm text-ink/55">${tk('gh.tick.offSeason')}</p>`)
    + `<p class="text-[11px] text-ink/45 mt-2">${tk('gh.tick.tip')}</p>`
    + ghRemind2Html('tick', m, d.tick.remind, edit, 'gh.tick.remindOn', [{ f: 'time', label: tk('gh.remind.at') }]);
  return ghCard('🕷️', tk('gh.block.tick'), body);
}

/* ---------- Block: check-ups (since 1.153.1) ---------- */
function ghAddMonths(iso, months) {
  const p = String(iso || '').split('-').map(Number);
  if (p.length !== 3 || !p[0]) return '';
  const dt = new Date(p[0], p[1] - 1 + months, Math.min(p[2], 28), 12);
  return isoDate(dt);
}
function ghAddDays(iso, days) {
  const p = String(iso || '').split('-').map(Number);
  if (p.length !== 3 || !p[0]) return '';
  return isoDate(new Date(p[0], p[1] - 1, p[2] + days, 12));
}
function ghCheckupName(c) {
  const known = GH_CHECKUPS.find(x => x.id === c.kind);
  return known && !c.name ? tk(known.key) : (c.name || (known ? tk(known.key) : ''));
}
// due = last + interval; without a last date the day it was added (the server reminds from there, pinn-gesundheit.js)
function ghCheckupDue(c) { return c.last ? ghAddMonths(c.last, Number(c.every) || 12) : (c.added || ghToday()); }
function ghBirthOf(memberId) {
  const m = memberById(memberId);
  if (m && /^\d{4}-\d{2}-\d{2}$/.test(m.birthday || '')) return m.birthday;
  const p = famPass(memberId) || {};
  return /^\d{4}-\d{2}-\d{2}$/.test(p.birth || '') ? p.birth : '';
}
// Next open U/J examination of a child: { id, from, to } (dates) or null
function ghNextUExam(d, birth) {
  if (!birth) return null;
  const today = ghToday();
  for (const u of GH_U_EXAMS) {
    if (d.checkup.uDone.includes(u.id)) continue;
    const to = ghAddDays(birth, u.to);
    if (to < today) continue;      // window over without a tick: the next one counts
    return { id: u.id, from: ghAddDays(birth, u.from), to };
  }
  return null;
}
function ghCheckupHtml(m, d, edit) {
  const today = ghToday();
  const mid = famAttr(m.id);
  const person = ghState.people[m.id];
  const child = !!(person && person.kind);
  const rows = d.checkup.list.slice().sort((a, b) => ghCheckupDue(a).localeCompare(ghCheckupDue(b))).map(c => {
    const due = ghCheckupDue(c);
    const over = due <= today;
    return `<div class="hp-row">
      <span class="flex-1 text-sm"><b>${escapeHtml(ghCheckupName(c))}</b>
        <span class="block text-[11px] ${over ? 'hp-due' : 'text-ink/50'}">${over ? tk('gh.checkup.dueNow') : tk('gh.checkup.dueOn', { date: ghFmtDate(due) })} · ${tk('gh.checkup.every', { n: Number(c.every) || 12 })}${c.last ? ' · ' + tk('gh.checkup.last', { date: ghFmtDate(c.last) }) : ''}</span></span>
      ${edit ? `<button type="button" class="fz-mini-btn${over ? ' primary' : ''}" data-ghact="checkup-done" data-member="${mid}" data-id="${famAttr(c.id)}">✓ ${tk('gh.checkup.doneToday')}</button>
      <button type="button" class="hp-x" data-ghact="checkup-del" data-member="${mid}" data-id="${famAttr(c.id)}" aria-label="${ghAttr(tk('common.delete'))}">×</button>` : ''}
    </div>`;
  }).join('');
  let uHtml = '';
  if (child && d.checkup.u) {
    const birth = ghBirthOf(m.id);
    const next = ghNextUExam(d, birth);
    uHtml = `<div class="hp-u">${!birth ? `<span class="text-sm text-ink/55">${tk('gh.checkup.uNoBirth')}</span>`
      : (next ? `<span class="flex-1 text-sm"><b>${escapeHtml(next.id)}</b> · ${tk('gh.checkup.uWindow', { from: ghFmtDate(next.from), to: ghFmtDate(next.to) })}${next.from <= today ? ` <span class="hp-due">· ${tk('gh.checkup.dueNow')}</span>` : ''}</span>
        ${edit ? `<button type="button" class="fz-mini-btn${next.from <= today ? ' primary' : ''}" data-ghact="u-done" data-member="${mid}" data-id="${famAttr(next.id)}">✓ ${tk('gh.checkup.done')}</button>` : ''}`
        : `<span class="text-sm text-ink/55">${tk('gh.checkup.uAllDone')}</span>`)}</div>`;
  }
  const uSwitch = child && edit && ghUsesUExams()
    ? `<label class="fz-check mt-2"><input type="checkbox" data-ghchange="u-on" data-member="${mid}"${d.checkup.u ? ' checked' : ''} /><span>👶 ${tk('gh.checkup.uOn')}</span></label>` : '';
  const body = uHtml
    + (rows ? `<div class="hp-list">${rows}</div>` : (uHtml ? '' : `<p class="text-sm text-ink/50">${tk('gh.checkup.empty')}</p>`))
    + uSwitch
    + ghRemind2Html('checkup', m, d.checkup.remind, edit, 'gh.checkup.remindOn', []);
  const add = edit ? `<button type="button" class="fz-mini-btn" data-ghact="checkup-new" data-member="${mid}">+ ${tk('gh.add')}</button>` : '';
  return ghCard('📋', tk('gh.block.checkup'), body, add);
}
function ghCheckupForm(memberId) {
  ghModal = { type: 'checkup', memberId, id: '' };
  famOpenModal(`
    <h3 class="font-serif text-lg mb-3">${tk('gh.checkup.new')}</h3>
    <label class="hp-lbl">${tk('gh.checkup.which')}<select id="hpCuKind" class="hp-in">${GH_CHECKUPS.map(c => `<option value="${c.id}">${escapeHtml(tk(c.key))}</option>`).join('')}<option value="custom">${tk('gh.checkup.custom')}</option></select></label>
    <label class="hp-lbl hidden" id="hpCuNameRow">${tk('gh.checkup.name')}<input id="hpCuName" type="text" maxlength="60" class="hp-in" /></label>
    <div class="grid grid-cols-2 gap-2">
      <label class="hp-lbl">${tk('gh.checkup.everyLabel')}<select id="hpCuEvery" class="hp-in">${[3, 6, 12, 24, 36, 60].map(n => `<option value="${n}"${n === 6 ? ' selected' : ''}>${tk('gh.checkup.every', { n })}</option>`).join('')}</select></label>
      <label class="hp-lbl">${tk('gh.checkup.lastLabel')}<input id="hpCuLast" type="date" max="${ghToday()}" class="hp-in" /></label>
    </div>
    <p class="text-[11px] text-ink/45">${tk('gh.checkup.lastHint')}</p>
    ${ghModalButtons(false)}`);
  const kind = document.getElementById('hpCuKind');
  kind.addEventListener('change', () => {
    const c = GH_CHECKUPS.find(x => x.id === kind.value);
    document.getElementById('hpCuNameRow').classList.toggle('hidden', !!c);
    if (c) document.getElementById('hpCuEvery').value = String(c.every);
  });
}
function ghSaveCheckup() {
  const kind = document.getElementById('hpCuKind').value;
  const known = GH_CHECKUPS.find(x => x.id === kind);
  const name = known ? '' : document.getElementById('hpCuName').value.trim().slice(0, 60);
  if (!known && !name) { document.getElementById('hpCuName').focus(); return; }
  const c = { id: ghId(), kind: known ? kind : 'custom', name, every: Number(document.getElementById('hpCuEvery').value) || 12, last: document.getElementById('hpCuLast').value || '', added: ghToday() };
  const st = ghModal;
  famCloseModal();
  ghChange(st.memberId, (d) => { d.checkup.list.push(c); d.checkup.list = d.checkup.list.slice(-30); });
}

/* ---------- Emergency pass inside the health page ---------- */
function ghPassBlockHtml(m, d, see, edit) {
  const p = famPass(m.id) || {};
  const filled = famPassFilled(p);
  const on = see ? ghPassOn(m.id, d) : true;
  const facts = filled ? [
    p.blood ? '🩸 ' + p.blood : '',
    p.allergies ? '⚠️ ' + String(p.allergies).split(/[,;\n]/)[0].trim() : '',
    (Array.isArray(p.meds) ? p.meds.filter(x => x && (x.name || x.dose)).length : 0) ? '💊 ' + p.meds.filter(x => x && (x.name || x.dose)).length : '',
    (Array.isArray(p.contacts) ? p.contacts.filter(x => x && (x.name || x.phone)).length : 0) ? '📞 ' + p.contacts.filter(x => x && (x.name || x.phone)).length : '',
  ].filter(Boolean).join(' · ') : '';
  const toggle = see && edit ? `<label class="fz-check"><input type="checkbox" data-ghchange="pass" data-member="${famAttr(m.id)}"${on ? ' checked' : ''} /><span>${tk('gh.pass.activate')}<span class="block text-[11px] text-ink/45">${tk('gh.pass.hint')}</span></span></label>` : '';
  const content = on ? `
    <p class="text-sm ${filled ? 'text-ink/70' : 'text-mustard'} mb-2">${escapeHtml(filled ? (facts || tk('family.emergencyCard2')) : tk('family.noEmergencyCardYet'))}</p>
    <div class="flex flex-wrap gap-2">
      ${filled ? `<button type="button" class="fz-mini-btn" data-ghact="pass-open" data-member="${famAttr(m.id)}">🆘 ${tk('gh.pass.open')}</button>` : ''}
      ${famCanEdit() ? `<button type="button" class="fz-mini-btn${filled ? '' : ' primary'}" data-ghact="pass-edit" data-member="${famAttr(m.id)}">✏️ ${filled ? tk('common.edit') : tk('family.fillNow')}</button>` : ''}
    </div>` : '';
  return ghCard('🆘', tk('family.emergencyCard2'), toggle + content);
}

/* ---------- Choose the blocks ---------- */
function ghBlockChooserHtml(d) {
  const chips = GH_BLOCKS.map(b => `<button type="button" class="hp-block${d.blocks[b.id] ? ' on' : ''}" data-ghact="block" data-block="${b.id}" aria-pressed="${d.blocks[b.id] ? 'true' : 'false'}">${b.icon} ${tk(b.key)}</button>`).join('');
  return `<div class="fam-card"><div class="fz-h">🧩 ${tk('gh.blocks')}</div><p class="text-[11px] text-ink/45 mb-2">${tk('gh.blocksHint')}</p><div class="flex flex-wrap gap-2">${chips}</div></div>`;
}

function ghModalButtons(withDelete) {
  return `<div class="flex items-center gap-2 mt-4">
    ${withDelete ? `<button type="button" class="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50" data-ghact="modal-del">${tk('common.delete')}</button>` : ''}
    <span class="flex-1"></span>
    <button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink" data-ghact="modal-cancel">${tk('common.cancel')}</button>
    <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-ghact="modal-save">${tk('common.save')}</button>
  </div>`;
}

/* ---------- Link from a push message ---------- */
// ?gesundheit=<trinken|medikamente|haende>&person=<member ID>: opens the health page of that person;
// "trinken" opens the drink popup on top of it.
async function ghOpenFromLink(kind, memberId) {
  if (isCurrentUserGuest()) return;
  const idle = async () => { for (let i = 0; i < 40 && ghState.loading; i++) await new Promise(r => setTimeout(r, 150)); };
  await idle();
  if (!ghState.loaded || Date.now() - ghState.at > GH_STALE_MS) { await ghLoad(); await idle(); }
  const id = (memberId && memberById(memberId)) ? memberId : (ghState.me && memberById(ghState.me) ? ghState.me : '');
  if (!id) { setView('familie'); famSetTab('gesundheit'); return; }
  ghOpenPerson(id);
  if (kind === 'trinken' && ghCanEdit(id)) ghOpenDrinkPopup(id);
}

/* ---------- Wiring ---------- */
(function wireHealth() {
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-ghopen]');
    if (open) { ghOpenPerson(open.dataset.ghopen); return; }
    const act = e.target.closest('[data-ghact]');
    if (!act) return;
    const mid = act.dataset.member || ghPersonId || '';
    const id = act.dataset.id || '';
    switch (act.dataset.ghact) {
      case 'back':
        ghPersonId = null; renderFamily();
        { const sc = document.getElementById('famScroll'); if (sc) sc.scrollTop = 0; }
        break;
      case 'drink-add': ghOpenDrinkPopup(mid); break;
      case 'drink-del': {
        const day = ghToday();
        ghChange(mid, (d) => { d.drink.log[day] = (d.drink.log[day] || []).filter(x => x.id !== id); });
        break;
      }
      case 'med-new': ghMedForm(mid, ''); break;
      case 'med-edit': ghMedForm(mid, id); break;
      case 'hands-plus': case 'hands-minus': {
        const day = ghToday();
        const step = act.dataset.ghact === 'hands-plus' ? 1 : -1;
        ghChange(mid, (d) => { d.hands.log[day] = Math.max(0, (Number(d.hands.log[day]) || 0) + step); });
        break;
      }
      case 'fruit-plus': case 'fruit-minus': {
        const day = ghToday();
        const step = act.dataset.ghact === 'fruit-plus' ? 1 : -1;
        ghChange(mid, (d) => { d.fruit.log[day] = Math.max(0, Math.min(30, (Number(d.fruit.log[day]) || 0) + step)); });
        break;
      }
      case 'sleep-rate': {
        const day = ghToday();
        const v = Number(act.dataset.v) || 0;
        ghChange(mid, (d) => { if (Number(d.sleep.log[day]) === v) delete d.sleep.log[day]; else d.sleep.log[day] = v; });
        break;
      }
      case 'checkup-new': ghCheckupForm(mid); break;
      case 'checkup-done': { const day = ghToday(); ghChange(mid, (d) => { d.checkup.list.forEach(c => { if (c.id === id) c.last = day; }); }); break; }
      case 'checkup-del':
        if (confirm(tk('gh.checkup.deleteConfirm'))) ghChange(mid, (d) => { d.checkup.list = d.checkup.list.filter(c => c.id !== id); });
        break;
      case 'u-done': ghChange(mid, (d) => { if (!d.checkup.uDone.includes(id)) d.checkup.uDone.push(id); }); break;
      case 'value-new': ghValueForm(mid); break;
      case 'value-del': ghChange(mid, (d) => { d.values = d.values.filter(x => x.id !== id); }); break;
      case 'vaccine-new': ghVaccineForm(mid); break;
      case 'vaccine-del': ghChange(mid, (d) => { d.vaccines = d.vaccines.filter(x => x.id !== id); }); break;
      case 'appt-new': ghAppointmentForm(mid); break;
      case 'appt-del': ghChange(mid, (d) => { d.appointments = d.appointments.filter(x => x.id !== id); }); break;
      case 'pass-open':
        famDetailId = mid; famDetailMode = 'pass'; famPassFrom = 'gesundheit'; renderFamily();
        { const sc = document.getElementById('famScroll'); if (sc) sc.scrollTop = 0; }
        break;
      case 'pass-edit': famDetailId = null; famOpenEdit(mid); break;
      case 'block': {
        const b = act.dataset.block;
        ghChange(ghPersonId, (d) => { d.blocks[b] = !d.blocks[b]; });
        break;
      }
      case 'modal-cancel': ghModal = null; famCloseModal(); break;
      case 'modal-save':
        if (!ghModal) break;
        if (ghModal.type === 'med') ghSaveMed();
        else if (ghModal.type === 'value') ghSaveValue();
        else if (ghModal.type === 'vaccine') ghSaveVaccine();
        else if (ghModal.type === 'appt') ghSaveAppointment();
        else if (ghModal.type === 'checkup') ghSaveCheckup();
        break;
      case 'modal-del':
        if (ghModal && ghModal.type === 'med' && ghModal.id && confirm(tk('gh.meds.deleteConfirm'))) {
          const st = ghModal;
          famCloseModal();
          ghChange(st.memberId, (d) => {
            d.meds.list = d.meds.list.filter(x => x.id !== st.id);
            Object.keys(d.meds.taken).forEach(k => { d.meds.taken[k] = d.meds.taken[k].filter(t => t.indexOf(st.id + '@') !== 0); });
          });
        }
        break;
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-ghchange]');
    if (!el) return;
    const mid = el.dataset.member || ghPersonId || '';
    if (el.dataset.ghchange === 'goal') {
      const goal = Number(el.value) || 2000;
      ghChange(mid, (d) => { d.drink.goal = goal; });
    } else if (el.dataset.ghchange === 'med-taken') {
      const key = el.dataset.key;
      const on = el.checked;
      const day = ghToday();
      ghChange(mid, (d) => {
        const list = (d.meds.taken[day] || []).filter(k => k !== key);
        if (on) list.push(key);
        d.meds.taken[day] = list;
      });
    } else if (el.dataset.ghchange === 'day-done') {
      const kind = el.dataset.kind;
      const on = el.checked;
      const day = ghToday();
      ghChange(mid, (d) => { if (on) d[kind].log[day] = true; else delete d[kind].log[day]; });
    } else if (el.dataset.ghchange === 'fruit-goal') {
      const goal = Number(el.value) || 5;
      ghChange(mid, (d) => { d.fruit.goal = goal; });
    } else if (el.dataset.ghchange === 'sleep-bed') {
      const v = /^\d{2}:\d{2}$/.test(el.value) ? el.value : '';
      if (v) ghChange(mid, (d) => { d.sleep.bed = v; });
    } else if (el.dataset.ghchange === 'u-on') {
      const on = el.checked;
      ghChange(mid, (d) => { d.checkup.u = on; });
    } else if (el.dataset.ghchange.indexOf('r2-') === 0) {
      // reminders of the blocks since 1.153.1 (sun, sleep, fruit, tick, checkup)
      const kind = el.dataset.kind;
      const what = el.dataset.ghchange;
      const field = el.dataset.field;
      let apply = null;
      if (what === 'r2-on') { const on = el.checked; apply = (r) => { r.on = on; }; }
      else if (what === 'r2-flag') { const on = el.checked; apply = (r) => { r[field] = on; }; }
      else if (what === 'r2-time') { const v = /^\d{2}:\d{2}$/.test(el.value) ? el.value : ''; if (v) apply = (r) => { r[field] = v; }; }
      else if (what === 'r2-times') {
        const all = Array.from(document.querySelectorAll('.hp-times-' + kind)).map(i => i.value).filter(v => /^\d{2}:\d{2}$/.test(v));
        const times = Array.from(new Set(all)).sort();
        apply = (r) => { r.times = times; };
      }
      if (apply && ghCanEdit(mid)) ghChange(mid, (d) => { apply(d[kind].remind); });
    } else if (el.dataset.ghchange === 'rem-parents') {
      const on = el.checked;
      if (ghCanEdit(mid)) ghChange(mid, (d) => { d.remindParents = on; });
    } else if (el.dataset.ghchange.indexOf('rem-') === 0) {
      const kind = el.dataset.kind;
      const what = el.dataset.ghchange;
      const box = kind === 'drink' ? 'drink' : (kind === 'meds' ? 'meds' : 'hands');
      let apply = null;
      if (what === 'rem-on') { const on = el.checked; apply = (r) => { r.on = on; }; }
      else if (what === 'rem-every') { const v = Number(el.value) || 120; apply = (r) => { r.every = v; }; }
      else if (what === 'rem-from' || what === 'rem-to') {
        const v = /^\d{2}:\d{2}$/.test(el.value) ? el.value : '';
        if (v) apply = (r) => { r[what === 'rem-from' ? 'from' : 'to'] = v; };
      } else if (what === 'rem-time') {
        const all = Array.from(document.querySelectorAll('.hp-hand-time')).map(i => i.value).filter(v => /^\d{2}:\d{2}$/.test(v));
        const times = Array.from(new Set(all)).sort();
        apply = (r) => { r.times = times; };
      }
      if (apply && ghCanEdit(mid)) ghChange(mid, (d) => { apply(d[box].remind); });
    } else if (el.dataset.ghchange === 'pass') {
      const on = el.checked;
      ghChange(mid, (d) => { d.pass = on; });
      // Switched on without any entries yet: the form to fill in opens right away
      if (on && !famPassFilled(famPass(mid)) && famCanEdit()) famOpenEdit(mid);
    }
  });
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('gesundheit');

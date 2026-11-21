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
    if (med.prn === true) return; // as-needed medicines have no plan
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
  try { ghSyncPantry(); } catch (e) { /* pantry link is optional */ }
  try { ghRunRxTasks(); } catch (e) { /* tasks are optional */ }
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
  // keep the linked pantry entries up to date after every change of a supply
  setTimeout(() => { try { ghSyncPantry(); } catch (e) { /* pantry link is optional */ } }, 0);
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

/* ---------- Banner of the health pages ----------
   Since 1.162.0 a calm banner (js/banner.js → pnHealthBandHtml): soft gradient in the colour of the person, a
   heartbeat line, a heart / drop / pill as thin line icons and a quiet water line at the bottom that stands higher the
   more of the daily drinking goal is reached. (1.150.5 – 1.161.x: animated scene with sun, floating things, beating heart.) */
function ghSceneHtml(level, color) {
  return pnHealthBandHtml(level, color);
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

/* ---------- Quick window "How did you sleep?" (since 1.160.2) ----------
   Opened by the morning push message: a small window at the bottom with the three faces, like the other quick
   windows. One tap saves the answer for today and closes the window. */
function ghOpenSleepPopup(memberId) {
  if (!ghCanEdit(memberId)) return;
  let ov = document.getElementById('hpSleepOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'hpSleepOverlay';
    ov.className = 'hp-overlay';
    ov.addEventListener('click', (e) => {
      if (e.target === ov) { ghCloseSleepPopup(); return; }
      const b = e.target.closest('[data-hpsleep],[data-hpclose]');
      if (!b) return;
      if (b.dataset.hpclose !== undefined) { ghCloseSleepPopup(); return; }
      const v = Number(b.dataset.hpsleep) || 0;
      const mid = ov.dataset.member;
      ghCloseSleepPopup();
      if (!v || !mid) return;
      const day = ghToday();
      ghChange(mid, (d) => { d.sleep.log[day] = v; });
      try { finShowToast(tk('common.saved')); } catch (err) { /* no toast */ }
    });
    document.body.appendChild(ov);
  }
  ov.dataset.member = memberId;
  const d = ghData(memberId);
  const cur = d && d.sleep ? Number(d.sleep.log[ghToday()]) || 0 : 0;
  const faces = GH_SLEEP_FACES.map(f => `<button type="button" class="hp-face${cur === f.v ? ' on' : ''}" data-hpsleep="${f.v}"><span class="hp-face-ic">${f.icon}</span><span>${tk(f.key)}</span></button>`).join('');
  ov.innerHTML = `<div class="hp-sheet" role="dialog" aria-modal="true">
    <div class="flex items-center justify-between gap-2 mb-3">
      <div class="font-serif text-lg">😴 ${escapeHtml(tk('gh.sleep.question'))}</div>
      <button type="button" class="hp-x big" data-hpclose aria-label="${ghAttr(tk('common.close'))}">×</button>
    </div>
    <div class="hp-faces">${faces}</div>
  </div>`;
  ov.classList.remove('hidden');
}
function ghCloseSleepPopup() {
  const ov = document.getElementById('hpSleepOverlay');
  if (ov) ov.classList.add('hidden');
}

/* ---------- Medicine supply (since 1.161.0) ----------
   A medicine can have a supply: med.stock = { on, qty, at, unit, per, pack, rx, lead, min, exp, pantry, pantryId, synced, soonOn, emptyOn }
   - qty/at:  amount that was there at the time "at" (ms). From then on the planned doses (times of the plan, "per" each)
              are subtracted automatically - nothing has to be ticked off for that
   - per:     amount per intake; pack: amount per pack (0 = unknown); rx: needs a prescription
   - lead:    warn this many days before it runs out (default 14 days with, 7 days without prescription)
   - min:     only for "as needed" medicines (med.prn): warn at or below this amount; reduced with "taken"
   - exp:     best-before date of the pack in use
   - pantry/pantryId/synced: link with the page Vorrat (ghSyncPantry)
   - soonOn/emptyOn: dates (YYYY-MM-DD) from which the server sends the push messages (pb_hooks/pinn-gesundheit.js);
              set again on every change (ghStockStamp) */
const GH_STOCK_UNITS = ['Tablette', 'Kapsel', 'Stück', 'ml', 'Beutel'];
const GH_STOCK_EXP_DAYS = 30;
function ghStockOn(med) { return !!(med && med.stock && med.stock.on === true); }
function ghRound(n) { return Math.round(n * 100) / 100; }
function ghDayShift(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d); }
function ghDaysBetween(aIso, bIso) { return Math.round((new Date(bIso + 'T12:00:00') - new Date(aIso + 'T12:00:00')) / 86400000); }
function ghIsoOk(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
// Times of the plan as [hour, minute]; without a time the intake counts at 08:00
function ghMedClock(med) {
  const t = (Array.isArray(med.times) ? med.times : []).filter(v => /^\d{2}:\d{2}$/.test(v));
  return (t.length ? Array.from(new Set(t)).sort() : ['08:00']).map(v => [Number(v.slice(0, 2)), Number(v.slice(3))]);
}
// Date of the k-th upcoming intake (k >= 1); k <= 0 means today
function ghDoseDate(med, k, nowMs) {
  const now = nowMs || Date.now();
  if (k <= 0) return isoDate(new Date(now));
  const clock = ghMedClock(med);
  const base = new Date(now);
  let n = 0;
  for (let i = 0; i < 1500; i++) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    for (let j = 0; j < clock.length; j++) {
      const inst = new Date(day.getFullYear(), day.getMonth(), day.getDate(), clock[j][0], clock[j][1]).getTime();
      if (inst > now && ++n >= k) return isoDate(day);
    }
  }
  return '';
}
// What is left, for how long it lasts and how urgent it is. null if the medicine has no supply.
function ghStockInfo(med, nowMs) {
  if (!ghStockOn(med)) return null;
  const s = med.stock;
  const now = nowMs || Date.now();
  const per = Math.max(0, Number(s.per) || 0);
  const qty = Math.max(0, Number(s.qty) || 0);
  const prn = med.prn === true;
  const clock = ghMedClock(med);
  let used = 0;
  if (!prn && per > 0) {
    const at = Number(s.at) || now;
    const a = new Date(at);
    for (let i = 0; i < 1500; i++) {
      const day = new Date(a.getFullYear(), a.getMonth(), a.getDate() + i);
      if (day.getTime() > now) break;
      for (let j = 0; j < clock.length; j++) {
        const inst = new Date(day.getFullYear(), day.getMonth(), day.getDate(), clock[j][0], clock[j][1]).getTime();
        if (inst > at && inst <= now) used++;
      }
    }
  }
  const left = ghRound(Math.max(0, qty - used * per));
  const perDay = prn ? 0 : per * clock.length;
  const lead = Number(s.lead) > 0 ? Number(s.lead) : (s.rx ? 14 : 7);
  const today = isoDate(new Date(now));
  const days = perDay > 0 ? Math.floor(left / perDay + 1e-9) : null;
  let state = 'ok';
  if (left <= 0) state = 'empty';
  else if (prn) state = (Number(s.min) > 0 && left <= Number(s.min)) ? 'soon' : 'ok';
  else if (days !== null && days <= lead) state = 'soon';
  const expDays = ghIsoOk(s.exp) ? ghDaysBetween(today, s.exp) : null;
  const expState = expDays === null ? '' : (expDays < 0 ? 'expired' : (expDays <= GH_STOCK_EXP_DAYS ? 'soon' : ''));
  return { left, per, perDay, days, until: days !== null ? ghDayShift(today, days) : '', lead, state, expDays, expState, prn };
}
// Writes the dates for the server push into the medicine (call after every change of the supply)
function ghStockStamp(med) {
  if (!ghStockOn(med)) return med;
  const s = med.stock;
  const info = ghStockInfo(med);
  s.soonOn = ''; s.emptyOn = '';
  if (info && !info.prn && info.perDay > 0 && info.left > 0) {
    const doses = Math.floor(info.left / info.per + 1e-9);
    const k0 = Math.ceil((info.left - info.perDay * info.lead) / info.per - 1e-9);
    s.soonOn = ghDoseDate(med, k0);
    s.emptyOn = ghDoseDate(med, doses + 1);
  } else if (info && info.left <= 0 && !info.prn) {
    s.emptyOn = isoDate(new Date());
  }
  if (info && info.prn) {
    if (info.left <= 0) s.emptyOn = isoDate(new Date());
    else if (info.state === 'soon') s.soonOn = isoDate(new Date());
  }
  return med;
}
// Text under a medicine: amount and how long it lasts
function ghStockLine(med, info) {
  const s = med.stock;
  const parts = [info.left > 0 ? tk('gh.stock.left', { amount: fmtQtyUnit(info.left, s.unit) }) : tk('gh.stock.empty')];
  if (info.days !== null && info.left > 0) parts.push(tk('gh.stock.lasts', { n: info.days, date: ghFmtDate(info.until) }));
  return parts.join(' · ');
}
function ghStockHint(med, info) {
  const out = [];
  if (info.state === 'soon' || info.state === 'empty') out.push(tk(med.stock.rx ? 'gh.stock.hintRx' : 'gh.stock.hintBuy'));
  if (info.expState === 'expired') out.push(tk('gh.stock.expired', { date: ghFmtDate(med.stock.exp) }));
  else if (info.expState === 'soon') out.push(tk('gh.stock.expSoon', { date: ghFmtDate(med.stock.exp) }));
  return out;
}

/* ---------- Block: medication & vitamins ---------- */
function ghMedIcon(med) { return med.kind === 'vit' ? '🍊' : (med.kind === 'other' ? '🌿' : '💊'); }
function ghUnitLabel(u) { return u ? i18nT(u) : ''; }
function ghMedsHtml(m, d, edit) {
  const today = ghToday();
  const taken = d.meds.taken[today] || [];
  const slots = ghMedSlots(d);
  const mem = `data-member="${famAttr(m.id)}"`;
  const rows = slots.map(s => {
    const on = taken.includes(s.key);
    return `<div class="hp-row">
      <label class="hp-tick"><input type="checkbox" data-ghchange="med-taken" ${mem} data-key="${famAttr(s.key)}"${on ? ' checked' : ''}${edit ? '' : ' disabled'} />
        <span class="hp-time">${escapeHtml(s.time || tk('gh.meds.anyTime'))}</span>
        <span class="min-w-0 flex-1 ${on ? 'line-through text-ink/40' : ''}">${ghMedIcon(s.med)} ${escapeHtml(s.med.name)}${s.med.dose ? `<span class="text-ink/50"> · ${escapeHtml(s.med.dose)}</span>` : ''}</span>
      </label>
      ${edit ? `<button type="button" class="hp-edit" data-ghact="med-edit" ${mem} data-id="${famAttr(s.med.id)}" aria-label="${ghAttr(tk('common.edit'))}">✏️</button>` : ''}
    </div>`;
  }).join('');
  // As-needed medicines (house pharmacy): no fixed plan, only listed with their supply
  const prn = d.meds.list.filter(x => x.prn === true);
  const prnRows = prn.map(med => {
    const info = ghStockInfo(med);
    return `<div class="hp-row">
      <span class="min-w-0 flex-1 text-sm">${ghMedIcon(med)} ${escapeHtml(med.name)}${med.dose ? `<span class="text-ink/50"> · ${escapeHtml(med.dose)}</span>` : ''}
        ${info ? `<span class="block text-[11px] ${info.state === 'ok' ? 'text-ink/50' : 'text-mustard font-medium'}">${escapeHtml(ghStockLine(med, info))}</span>` : ''}</span>
      ${edit && info ? `<button type="button" class="fz-mini-btn" data-ghact="med-take" ${mem} data-id="${famAttr(med.id)}">${tk('gh.stock.take')}</button>` : ''}
      ${edit ? `<button type="button" class="hp-edit" data-ghact="med-edit" ${mem} data-id="${famAttr(med.id)}" aria-label="${ghAttr(tk('common.edit'))}">✏️</button>` : ''}
    </div>`;
  }).join('');
  // Supply of the medicines with a plan: remaining amount, how long it lasts, hints
  const stockRows = d.meds.list.filter(x => !x.prn && ghStockOn(x)).map(med => {
    const info = ghStockInfo(med);
    const hints = ghStockHint(med, info);
    return `<div class="hp-row" style="align-items:flex-start">
      <span class="min-w-0 flex-1 text-sm">${ghMedIcon(med)} ${escapeHtml(med.name)}
        <span class="block text-[11px] ${info.state === 'ok' ? 'text-ink/50' : 'text-mustard font-medium'}">${escapeHtml(ghStockLine(med, info))}</span>
        ${hints.map(h => `<span class="block text-[11px] text-mustard">⚠️ ${escapeHtml(h)}</span>`).join('')}</span>
      ${edit && Number(med.stock.pack) > 0 ? `<button type="button" class="fz-mini-btn" data-ghact="med-restock" ${mem} data-id="${famAttr(med.id)}">${tk('gh.stock.restock', { n: ghNum(Number(med.stock.pack)) })}</button>` : ''}
    </div>`;
  }).join('');
  let body = rows ? `<div class="hp-list">${rows}</div>` : (prnRows || stockRows ? '' : `<p class="text-sm text-ink/50">${tk('gh.meds.empty')}</p>`);
  if (prnRows) body += `<div class="text-[11px] uppercase tracking-wide text-ink/40 mt-3">${tk('gh.meds.prnList')}</div><div class="hp-list">${prnRows}</div>`;
  if (stockRows) body += `<div class="text-[11px] uppercase tracking-wide text-ink/40 mt-3">${tk('gh.stock.title')}</div><div class="hp-list">${stockRows}</div>`;
  const rem = ghRemindHtml('meds', m, d.meds.remind, edit);
  const add = edit ? `<button type="button" class="fz-mini-btn" data-ghact="med-new" ${mem}>+ ${tk('gh.add')}</button>` : '';
  return ghCard('💊', tk('gh.block.meds'), body + rem, add);
}
function ghMedForm(memberId, medId) {
  const d = ghData(memberId);
  const med = d.meds.list.find(x => x.id === medId) || { name: '', kind: 'med', dose: '', times: ['08:00'] };
  const times = (med.times || []).concat(['', '', '']).slice(0, 4);
  const on = ghStockOn(med);
  const info = on ? ghStockInfo(med) : null;
  const s = on ? med.stock : { qty: 0, unit: 'Tablette', per: 1, pack: 0, rx: false, lead: 0, min: 0, exp: '', pantry: false, warn: true };
  ghModal = { type: 'med', memberId, id: medId || '' };
  const unitOpts = GH_STOCK_UNITS.concat(s.unit && !GH_STOCK_UNITS.includes(s.unit) ? [s.unit] : []);
  famOpenModal(`
    <h3 class="font-serif text-lg mb-3">${tk(medId ? 'gh.meds.edit' : 'gh.meds.new')}</h3>
    <div class="mb-3 flex flex-wrap gap-2">
      ${skKiOn() ? `<button type="button" id="hpMedScan" class="fz-mini-btn">📷 ${tk('gh.stock.scan')}</button><input id="hpMedFile" type="file" accept="image/*" capture="environment" class="hidden" />` : ''}
      <button type="button" id="hpMedCode" class="fz-mini-btn">▦ ${tk('gh.stock.barcode')}</button><input id="hpMedCodeFile" type="file" accept="image/*" capture="environment" class="hidden" />
      <input id="hpStockPzn" type="hidden" value="${ghAttr(on && s.pzn ? s.pzn : '')}" />
      <p id="hpMedScanInfo" class="hidden text-xs w-full"></p>
    </div>
    <label class="hp-lbl">${tk('gh.meds.name')}<input id="hpMedName" type="text" maxlength="80" value="${ghAttr(med.name)}" class="hp-in" /></label>
    <label class="hp-lbl">${tk('gh.meds.kind')}<select id="hpMedKind" class="hp-in">
      ${[['med', 'gh.meds.kindMed'], ['vit', 'gh.meds.kindVit'], ['other', 'gh.meds.kindOther']].map(k => `<option value="${k[0]}"${med.kind === k[0] ? ' selected' : ''}>${tk(k[1])}</option>`).join('')}
    </select></label>
    <label class="hp-lbl">${tk('gh.meds.dose')}<input id="hpMedDose" type="text" maxlength="60" value="${ghAttr(med.dose)}" class="hp-in" /></label>
    <label class="fz-check mb-2"><input id="hpMedPrn" type="checkbox"${med.prn ? ' checked' : ''} /><span>${tk('gh.meds.prn')}</span></label>
    <div class="hp-lbl" id="hpMedTimesWrap"${med.prn ? ' style="display:none"' : ''}>${tk('gh.meds.times')}<div class="grid grid-cols-4 gap-2">${times.map((t, i) => `<input type="time" class="hp-in hp-med-time" data-i="${i}" value="${ghAttr(t)}" />`).join('')}</div></div>
    <details class="hp-stock mt-2"${on ? ' open' : ''}>
      <summary class="text-sm font-medium cursor-pointer">📦 ${tk('gh.stock.title')}</summary>
      <label class="fz-check mt-2"><input id="hpStockOn" type="checkbox"${on ? ' checked' : ''} /><span>${tk('gh.stock.track')}</span></label>
      <div class="grid grid-cols-2 gap-2 mt-2">
        <label class="hp-lbl" style="margin-bottom:0">${tk('gh.stock.qty')}<input id="hpStockQty" type="text" inputmode="decimal" value="${ghAttr(on && info ? String(info.left) : '')}" class="hp-in" /></label>
        <label class="hp-lbl" style="margin-bottom:0">${tk('gh.stock.unit')}<select id="hpStockUnit" class="hp-in">${unitOpts.map(u => `<option value="${ghAttr(u)}"${u === s.unit ? ' selected' : ''}>${escapeHtml(ghUnitLabel(u))}</option>`).join('')}</select></label>
        <label class="hp-lbl" style="margin-bottom:0">${tk('gh.stock.per')}<input id="hpStockPer" type="text" inputmode="decimal" value="${ghAttr(String(Number(s.per) || 1))}" class="hp-in" /></label>
        <label class="hp-lbl" style="margin-bottom:0">${tk('gh.stock.pack')}<input id="hpStockPack" type="text" inputmode="decimal" value="${ghAttr(Number(s.pack) > 0 ? String(Number(s.pack)) : '')}" class="hp-in" /></label>
      </div>
      <label class="fz-check mt-2"><input id="hpStockRx" type="checkbox"${s.rx ? ' checked' : ''} /><span>${tk('gh.stock.rx')}</span></label>
      <div class="grid grid-cols-2 gap-2 mt-2">
        <label class="hp-lbl" style="margin-bottom:0">${tk('gh.stock.lead')}<select id="hpStockLead" class="hp-in">
          <option value="0"${!Number(s.lead) ? ' selected' : ''}>${tk('gh.stock.leadAuto')}</option>
          ${[3, 7, 14, 21, 28].map(n => `<option value="${n}"${Number(s.lead) === n ? ' selected' : ''}>${tk('gh.stock.leadOpt', { n })}</option>`).join('')}
        </select></label>
        <label class="hp-lbl" style="margin-bottom:0">${tk('gh.stock.min')}<input id="hpStockMin" type="text" inputmode="decimal" value="${ghAttr(Number(s.min) > 0 ? String(Number(s.min)) : '')}" class="hp-in" /></label>
      </div>
      <label class="hp-lbl mt-2">${tk('gh.stock.exp')}<input id="hpStockExp" type="date" value="${ghAttr(ghIsoOk(s.exp) ? s.exp : '')}" class="hp-in" /></label>
      <label class="fz-check"><input id="hpStockWarn" type="checkbox"${s.warn === false ? '' : ' checked'} /><span>🔔 ${tk('gh.stock.warn')}</span></label>
      <label class="fz-check mt-1"><input id="hpStockPantry" type="checkbox"${s.pantry ? ' checked' : ''} /><span>🧺 ${tk('gh.stock.pantry')}</span></label>
      <p class="text-[11px] text-ink/50 mt-1">${tk('gh.stock.pantryNote')}</p>
    </details>
    ${ghModalButtons(!!medId)}`, (body) => {
      const prnEl = body.querySelector('#hpMedPrn');
      prnEl.addEventListener('change', () => { body.querySelector('#hpMedTimesWrap').style.display = prnEl.checked ? 'none' : ''; });
      const code = body.querySelector('#hpMedCode');
      if (code) {
        code.addEventListener('click', () => body.querySelector('#hpMedCodeFile').click());
        body.querySelector('#hpMedCodeFile').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) ghScanBarcode(f, body); });
      }
      const scan = body.querySelector('#hpMedScan');
      if (scan) {
        scan.addEventListener('click', () => body.querySelector('#hpMedFile').click());
        body.querySelector('#hpMedFile').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) ghScanPack(f, body); });
      }
    });
  try { if (!skKiOn()) Promise.resolve(recipeKiLoadStatus()).then(() => { if (skKiOn() && ghModal && ghModal.type === 'med' && !document.getElementById('hpMedScan') && document.getElementById('hpMedName')) ghMedFormRefresh(); }).catch(() => { /* offline */ }); } catch (e) { /* no AI */ }
}
// The AI status can arrive after the form opened: reopen it once with the entered values kept
function ghMedFormRefresh() {
  const st = ghModal;
  if (!st) return;
  const keep = ['hpMedName', 'hpMedDose'].map(id => (document.getElementById(id) || {}).value || '');
  ghMedForm(st.memberId, st.id);
  if (keep[0]) document.getElementById('hpMedName').value = keep[0];
  if (keep[1]) document.getElementById('hpMedDose').value = keep[1];
}
// Photo of the pack: the AI fills name, strength, pack size, unit, prescription and best-before date (always to be checked)
async function ghScanPack(file, body) {
  const info = body.querySelector('#hpMedScanInfo');
  const btn = body.querySelector('#hpMedScan');
  const show = (txt, bad) => { info.textContent = txt; info.classList.remove('hidden'); info.classList.toggle('text-red-500', !!bad); info.classList.toggle('text-ink/55', !bad); };
  if (!navigator.onLine) { show(tk('gh.stock.scanOffline'), true); return; }
  btn.disabled = true;
  show(tk('gh.stock.scanBusy'));
  try {
    const part = await recipeKiImagePart(file);
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 120000) : null;
    let res;
    try {
      res = await apiFetch('/api/pinn/ki/packung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateien: [part] }), signal: ctrl ? ctrl.signal : undefined });
    } finally { if (timer) clearTimeout(timer); }
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (res.status === 404) throw new Error(tk('school.newFilesKiPb'));
    if (!res.ok || !data.packung) throw new Error(data.error || tk('common.actionFailed'));
    const z = data.packung;
    if (!document.getElementById('hpMedName')) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    if (!document.getElementById('hpMedName').value.trim()) set('hpMedName', z.name);
    if (z.staerke && !document.getElementById('hpMedDose').value.trim()) set('hpMedDose', z.staerke);
    const on = document.getElementById('hpStockOn');
    if (z.packung > 0) { on.checked = true; set('hpStockPack', String(z.packung)); if (!document.getElementById('hpStockQty').value.trim()) set('hpStockQty', String(z.packung)); }
    if (z.einheit) set('hpStockUnit', z.einheit);
    if (z.rezeptpflichtig) document.getElementById('hpStockRx').checked = true;
    if (z.verfall) set('hpStockExp', z.verfall);
    const det = body.querySelector('details.hp-stock'); if (det) det.open = true;
    show([tk('gh.stock.scanDone', { name: z.name }), z.hinweis].filter(Boolean).join(' '));
  } catch (err) {
    show(tk('gh.stock.scanFail', { msg: err && err.name === 'AbortError' ? tk('school.aiTookTooLong') : (err && err.message ? err.message : tk('home.unknownError')) }), true);
  } finally { btn.disabled = false; }
}
function ghFormNum(id) {
  const el = document.getElementById(id);
  const v = el ? parseFloat(String(el.value || '').replace(',', '.')) : NaN;
  return isFinite(v) && v >= 0 ? ghRound(v) : 0;
}
function ghSaveMed() {
  const name = document.getElementById('hpMedName').value.trim().slice(0, 80);
  if (!name) { document.getElementById('hpMedName').focus(); return; }
  const kind = document.getElementById('hpMedKind').value;
  const dose = document.getElementById('hpMedDose').value.trim().slice(0, 60);
  const prn = document.getElementById('hpMedPrn').checked;
  const times = prn ? [] : Array.from(document.querySelectorAll('.hp-med-time')).map(i => i.value).filter(v => /^\d{2}:\d{2}$/.test(v));
  const uniq = Array.from(new Set(times)).sort();
  const stockOn = document.getElementById('hpStockOn').checked;
  const pzn = String((document.getElementById('hpStockPzn') || {}).value || '').replace(/\D/g, '').slice(0, 14);
  let stock = null;
  if (stockOn) {
    const exp = document.getElementById('hpStockExp').value;
    stock = {
      on: true, qty: ghFormNum('hpStockQty'), at: Date.now(), unit: document.getElementById('hpStockUnit').value,
      per: ghFormNum('hpStockPer') || 1, pack: ghFormNum('hpStockPack'), rx: document.getElementById('hpStockRx').checked,
      lead: Math.round(ghFormNum('hpStockLead')), min: ghFormNum('hpStockMin'), exp: ghIsoOk(exp) ? exp : '',
      warn: document.getElementById('hpStockWarn').checked, pantry: document.getElementById('hpStockPantry').checked,
    };
    if (pzn) stock.pzn = pzn;
  }
  const st = ghModal;
  famCloseModal();
  ghChange(st.memberId, (d) => {
    const id = st.id || ghId();
    const old = d.meds.list.find(x => x.id === id);
    const med = { id, name, kind: ['med', 'vit', 'other'].includes(kind) ? kind : 'med', dose, times: uniq };
    if (prn) med.prn = true;
    if (stock) {
      if (old && old.stock) { if (old.stock.pantryId) stock.pantryId = old.stock.pantryId; if (old.stock.synced !== undefined) stock.synced = old.stock.synced; if (old.stock.taskAt && stock.qty <= ghStockInfo(old).left + 0.004) stock.taskAt = old.stock.taskAt; }
      med.stock = stock;
      ghStockStamp(med);
    } else if (old && old.stock) {
      med.stock = Object.assign({}, old.stock, { on: false, soonOn: '', emptyOn: '' });
    }
    const i = d.meds.list.findIndex(x => x.id === id);
    if (i >= 0) d.meds.list[i] = med; else d.meds.list.push(med);
  });
}
// New pack: adds the pack size to what is left (the best-before date of the old pack is dropped)
function ghRestock(memberId, medId) {
  ghChange(memberId, (d) => {
    const med = d.meds.list.find(x => x.id === medId);
    if (!ghStockOn(med)) return;
    const info = ghStockInfo(med);
    med.stock.qty = ghRound(info.left + (Number(med.stock.pack) || 0));
    med.stock.at = Date.now();
    med.stock.exp = '';
    delete med.stock.taskAt;
    ghStockStamp(med);
  });
}
// As-needed medicine taken: subtracts one dose
function ghTakePrn(memberId, medId) {
  ghChange(memberId, (d) => {
    const med = d.meds.list.find(x => x.id === medId);
    if (!ghStockOn(med)) return;
    const info = ghStockInfo(med);
    med.stock.qty = ghRound(Math.max(0, info.left - (Number(med.stock.per) || 1)));
    med.stock.at = Date.now();
    ghStockStamp(med);
  });
}


/* ---------- Barcode of a pack (since 1.161.0) ----------
   German packs carry the PZN as a code 39 or, since securPharm, a Data Matrix with PZN, best-before date and batch.
   Only the PZN number and the best-before date can be read from it - there is no name in the code and pinn. has no
   drug database. So the first scan of a pack fills in the best-before date and remembers the PZN; once the entry is
   saved, the next pack with the same PZN fills in everything (name, unit, pack size, prescription) by itself.
   The code is read with the detector of the browser (not available everywhere), from a photo. */
function ghParseCode(raw) {
  const out = { pzn: '', exp: '' };
  const t = String(raw || '').replace(/[\u001d\u001e]/g, '|');
  let m = t.match(/(?:^|[|(])01\)?0?4150(\d{8})\d/) || t.match(/(?:^|\|)9N(\d{8})/);
  if (m) out.pzn = m[1];
  else { m = t.match(/^-?(\d{7,8})$/); if (m) out.pzn = m[1].padStart(8, '0'); }
  m = t.match(/\(17\)(\d{6})/) || t.match(/\|17(\d{6})/) || t.match(/\|D(\d{6})/) || t.match(/^01\d{14}17(\d{6})/);
  if (m) {
    const yy = Number(m[1].slice(0, 2)), mm = Number(m[1].slice(2, 4)); let dd = Number(m[1].slice(4, 6));
    if (mm >= 1 && mm <= 12) {
      if (!dd) dd = new Date(2000 + yy, mm, 0).getDate();
      out.exp = `${2000 + yy}-${pad2(mm)}-${pad2(dd)}`;
    }
  }
  return out;
}
function ghKnownPzn(pzn) {
  let hit = null;
  Object.keys(ghState.people).forEach(mid => {
    const list = (ghState.people[mid].daten && ghState.people[mid].daten.meds && ghState.people[mid].daten.meds.list) || [];
    list.forEach(med => { if (!hit && med && med.stock && med.stock.pzn === pzn) hit = med; });
  });
  return hit;
}
async function ghScanBarcode(file, body) {
  const info = body.querySelector('#hpMedScanInfo');
  const show = (txt, bad) => { info.textContent = txt; info.classList.remove('hidden'); info.classList.toggle('text-red-500', !!bad); info.classList.toggle('text-ink/55', !bad); };
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image')); i.src = url; });
    let res = { pzn: '', exp: '' };
    let ean = '';
    // 1) detector of the browser (PZN, Data Matrix with best-before date, EAN) - not available everywhere
    if ('BarcodeDetector' in window) {
      try {
        const formats = (await window.BarcodeDetector.getSupportedFormats()).filter(f => ['data_matrix', 'code_39', 'code_128', 'ean_13', 'ean_8', 'qr_code'].includes(f));
        const found = await new window.BarcodeDetector({ formats }).detect(img);
        (found || []).forEach(f => {
          const r = ghParseCode(f.rawValue);
          if (r.pzn && !res.pzn) res.pzn = r.pzn;
          if (r.exp && !res.exp) res.exp = r.exp;
          if (!ean && f.format && f.format.indexOf('ean') === 0) ean = String(f.rawValue || '').replace(/\D/g, '');
        });
      } catch (e) { /* fall back to the own EAN reader */ }
    }
    // 2) own EAN reader of the pantry scanner (works on every device)
    if (!res.pzn && !ean && typeof pantryScanDecodePhoto === 'function') { try { ean = await pantryScanDecodePhoto(img); } catch (e) { ean = ''; } }
    if (!res.pzn && !res.exp && !ean) { show(tk('gh.stock.barcodeNone'), true); return; }
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const det = body.querySelector('details.hp-stock'); if (det) det.open = true;
    document.getElementById('hpStockOn').checked = true;
    const code = res.pzn || ean;
    if (res.exp) set('hpStockExp', res.exp);
    if (code) set('hpStockPzn', code);
    const known = code ? ghKnownPzn(code) : null;
    if (known) {
      set('hpMedName', known.name); set('hpMedDose', known.dose || '');
      const k = known.stock;
      set('hpStockUnit', k.unit || 'Tablette'); set('hpStockPer', String(k.per || 1)); set('hpStockPack', k.pack > 0 ? String(k.pack) : '');
      if (k.pack > 0 && !document.getElementById('hpStockQty').value.trim()) set('hpStockQty', String(k.pack));
      document.getElementById('hpStockRx').checked = !!k.rx;
      show(tk('gh.stock.barcodeKnown', { name: known.name }));
      return;
    }
    // 3) EAN: online lookup through the server (same databases as the pantry: Open Food/Products/Beauty Facts)
    if (!res.pzn && ean && typeof pantryLookupBarcode === 'function') {
      show(tk('gh.stock.barcodeSearching'));
      const hit = await pantryLookupBarcode(ean);
      if (hit && hit.gefunden && hit.name) {
        if (!document.getElementById('hpMedName').value.trim()) set('hpMedName', hit.name);
        const q = String(hit.menge || '').match(/(\d+(?:[.,]\d+)?)\s*(tabl\w*|kaps\w*|caps\w*|ml|stk|st[üu]ck|pcs|beutel)?/i);
        if (q) {
          const n = parseFloat(q[1].replace(',', '.'));
          const u = (q[2] || '').toLowerCase();
          if (n > 0) { set('hpStockPack', String(n)); if (!document.getElementById('hpStockQty').value.trim()) set('hpStockQty', String(n)); }
          if (u) set('hpStockUnit', /^tabl/.test(u) ? 'Tablette' : (/^(kaps|caps)/.test(u) ? 'Kapsel' : (u === 'ml' ? 'ml' : (/^beutel/.test(u) ? 'Beutel' : 'Stück'))));
        }
        show(tk('gh.stock.barcodeOnline', { name: hit.name }));
        return;
      }
      show(tk('gh.stock.barcodeNoHit', { code: ean }));
      return;
    }
    show(tk('gh.stock.barcodeFound', { pzn: res.pzn || '–' }));
  } catch (err) {
    show(tk('gh.stock.barcodeNone'), true);
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- Task "get a prescription" (since 1.161.0) ----------
   Once for each running-low phase of a prescription medicine a task is created (due 3 days before it runs out, at the
   earliest today) for the person; restocking starts the next phase (ghRestock / ghSaveMed clear stock.taskAt). */
function ghRunRxTasks() {
  if (typeof queueTaskSave !== 'function' || typeof fzTaskId !== 'function' || !familyRecordId || isCurrentUserGuest()) return;
  let created = 0;
  Object.keys(ghState.people).forEach(mid => {
    if (!ghCanEdit(mid)) return;
    const p = ghState.people[mid];
    const d = ghNorm(p.daten, p.kind);
    d.meds.list.forEach(med => {
      if (!ghStockOn(med) || !med.stock.rx || med.stock.warn === false || med.stock.taskAt || created >= 6) return;
      const info = ghStockInfo(med);
      if (info.state === 'ok') return;
      const today = isoDate(new Date());
      const due = info.until && info.until > ghDayShift(today, 3) ? ghDayShift(info.until, -3) : today;
      const label = memberLabel(memberById(mid));
      const id = fzTaskId('gh|' + (typeof finFamilyKey === 'function' ? finFamilyKey() : '') + '|' + mid + '|' + med.id + '|' + today);
      queueTaskSave({ id, title: tk('gh.stock.taskTitle', { name: med.name }).slice(0, 200), notes: buildAssignedNotes(tk('gh.stock.taskNotes', { name: label }), [mid]), dueDate: due, fromTime: '', toTime: '', remindAt: '' }, true);
      created++;
      ghChange(mid, (dd) => { const mm = dd.meds.list.find(x => x.id === med.id); if (mm && mm.stock) mm.stock.taskAt = today; });
    });
  });
  if (created) { try { rebuildAufgaben(); renderTasks(); flushOutbox(); } catch (e) { /* tasks not ready */ } }
}

/* ---------- Link with the page Vorrat (since 1.161.0) ----------
   A medicine with "med.stock.pantry" has an entry in the pantry (name, amount, unit). The amount there follows the
   calculated amount; if someone changes it in the pantry (e.g. after buying), that value is taken over. Without
   prescription the pantry gets a minimum amount (lead time x use per day), so the shopping list fills itself; with
   prescription there is no minimum (it cannot be bought without one) - the warning comes as a push message instead. */
let ghSyncBusy = false;
function ghSyncPantry() {
  if (ghSyncBusy || typeof pantryItems === 'undefined' || !ghState.loaded) return;
  ghSyncBusy = true;
  try {
    let pantryChanged = false;
    Object.keys(ghState.people).forEach(mid => {
      if (!ghCanEdit(mid)) return;
      const p = ghState.people[mid];
      const d = ghNorm(p.daten, p.kind);
      const todo = d.meds.list.filter(x => ghStockOn(x) && x.stock.pantry === true);
      todo.forEach(med => {
        const s = med.stock;
        const info = ghStockInfo(med);
        let item = s.pantryId ? pantryItems.find(x => x.id === s.pantryId) : null;
        const minQty = (!s.rx && !info.prn && info.perDay > 0) ? ghRound(info.perDay * info.lead) : ((!s.rx && info.prn && Number(s.min) > 0) ? Number(s.min) : null);
        if (s.pantryId && !item) {
          // Entry was deleted in the pantry: stop the link
          ghChange(mid, (dd) => { const mm = dd.meds.list.find(x => x.id === med.id); if (mm && mm.stock) { mm.stock.pantry = false; delete mm.stock.pantryId; delete mm.stock.synced; } });
          return;
        }
        if (!item) {
          const label = memberLabel(memberById(mid));
          const created = {
            id: 'pv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: med.name, qty: info.left, unit: s.unit || '', minQty, category: 'sonstiges', location: '', stores: [],
            note: tk('gh.stock.pantryItemNote', { name: label }), bestBefore: ghIsoOk(s.exp) && info.left > 0 ? s.exp : '', barcodes: [], updatedAt: Date.now(),
          };
          pantryItems = [...pantryItems, created];
          pantryChanged = true;
          ghChange(mid, (dd) => { const mm = dd.meds.list.find(x => x.id === med.id); if (mm && mm.stock) { mm.stock.pantryId = created.id; mm.stock.synced = info.left; } });
          return;
        }
        const pq = Number(item.qty) || 0;
        if (s.synced !== undefined && Math.abs(pq - Number(s.synced)) > 0.004) {
          // Changed in the pantry: take that amount over as the new starting point
          ghChange(mid, (dd) => {
            const mm = dd.meds.list.find(x => x.id === med.id);
            if (!mm || !mm.stock) return;
            mm.stock.qty = ghRound(pq); mm.stock.at = Date.now(); mm.stock.synced = ghRound(pq);
            ghStockStamp(mm);
          });
          return;
        }
        const wantMin = minQty === null ? null : minQty;
        const same = Math.abs(pq - info.left) < 0.004 && (item.minQty === null || item.minQty === undefined ? wantMin === null : Math.abs(Number(item.minQty) - wantMin) < 0.004) && String(item.name) === String(med.name);
        if (!same) {
          pantryItems = pantryItems.map(x => x.id === item.id ? { ...x, name: med.name, qty: info.left, unit: s.unit || x.unit, minQty: wantMin, updatedAt: Date.now() } : x);
          pantryChanged = true;
        }
        if (Math.abs((Number(s.synced) || 0) - info.left) > 0.004 || s.synced === undefined) {
          // Remember what was written (silently, without a save of its own: it is saved with the next change)
          s.synced = info.left;
          const live = ghState.people[mid] && ghState.people[mid].daten && ghState.people[mid].daten.meds && ghState.people[mid].daten.meds.list.find(x => x.id === med.id);
          if (live && live.stock) live.stock.synced = info.left;
        }
      });
    });
    if (pantryChanged) { try { pantryCommit(); } catch (e) { /* pantry not ready */ } }
  } finally { ghSyncBusy = false; }
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
// ?gesundheit=<trinken|medikamente|haende|schlaf|geschlafen|…>&person=<member ID>: opens the health page of that person;
// "trinken" opens the drink popup on top of it, "geschlafen" the quick window "How did you sleep?".
async function ghOpenFromLink(kind, memberId) {
  if (isCurrentUserGuest()) return;
  const idle = async () => { for (let i = 0; i < 40 && ghState.loading; i++) await new Promise(r => setTimeout(r, 150)); };
  await idle();
  if (!ghState.loaded || Date.now() - ghState.at > GH_STALE_MS) { await ghLoad(); await idle(); }
  const id = (memberId && memberById(memberId)) ? memberId : (ghState.me && memberById(ghState.me) ? ghState.me : '');
  if (!id) { setView('familie'); famSetTab('gesundheit'); return; }
  ghOpenPerson(id);
  if (kind === 'trinken' && ghCanEdit(id)) ghOpenDrinkPopup(id);
  // Morning message "How did you sleep?" (since 1.160.2 its own link "geschlafen"; older messages with "schlaf"
  // open the window too if they are tapped before noon and today has no answer yet)
  const morning = kind === 'geschlafen' || (kind === 'schlaf' && new Date().getHours() < 12);
  if (morning && ghCanEdit(id)) {
    const d = ghData(id);
    if (kind === 'geschlafen' || !(d && d.sleep && d.sleep.log[ghToday()])) ghOpenSleepPopup(id);
  }
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
      case 'med-restock': ghRestock(mid, id); break;
      case 'med-take': ghTakePrn(mid, id); break;
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

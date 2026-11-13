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
       appointments: [{ id, date, time, who, note }] }
   Day logs older than GH_KEEP_DAYS are dropped when saving.

   Push reminders (since 1.149.1, server: pinn-gesundheit.js#runCron): switched on per block in the health data
     drink.remind { on, every (minutes), from, to }   meds.remind { on }   hands.remind { on, times: ['10:00', …] }
   They go to the profile of the person themself. Tapping a message opens /?gesundheit=<trinken|medikamente|haende>
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
  return d;
}
function ghData(memberId) {
  const p = ghState.people[memberId];
  return ghNorm(p ? p.daten : null, p ? p.kind : false);
}
function ghPrune(d) {
  const limit = new Date(); limit.setDate(limit.getDate() - GH_KEEP_DAYS);
  const min = isoDate(limit);
  [d.drink.log, d.meds.taken, d.hands.log].forEach(log => Object.keys(log).forEach(k => { if (k < min) delete log[k]; }));
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
  const body = `
    <div class="hp-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${total}"><span style="width:${pct}%"></span></div>
    <div class="flex items-baseline justify-between gap-2 mt-1.5">
      <span class="text-sm font-medium">${tk('gh.drink.ofGoal', { ml: ghNum(total), goal: ghNum(goal) })}</span>
      <span class="text-xs text-ink/50">${pct} %</span>
    </div>
    <p class="text-xs text-ink/60 mt-1">${escapeHtml(ghDrinkHint(total, goal))}</p>
    ${edit ? `<button type="button" class="hp-big-btn" data-ghact="drink-add" data-member="${famAttr(m.id)}">💧 ${tk('gh.drink.add')}</button>` : ''}
    ${chips ? `<div class="hp-chips">${chips}</div>` : ''}
    ${ghRemindHtml('drink', m, d.drink.remind, edit)}`;
  return ghCard('💧', tk('gh.block.drink'), body, goalSel);
}
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

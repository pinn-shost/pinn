/* pinn. – Overview tile: family members (js/familienkachel.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the family-members tile (renderFamilyTile) with live location, birthday, way home, SOS, battery, kids' progress,
   stars and school markers, the sparing reload of locations (ofsEnsurePolling, ofsTick), the quick-action sheet of a person
   (ofsOpen, ofsSheetHtml, ofsWire) and the „gleich zu Hause“ notice on the way home (hwSoonCheck). */

/* ---------- Tile: family members ----------
   All members side by side, name and status in small print below. Markers on the picture:
   - red blinking dot: live location (younger than 15 min., disappears by itself as soon as it
     gets older or the person stops sharing), top left the symbol of the known place (🏠, 🏫 …)
   - 🎂 + golden ring: birthday today (date of birth from the emergency pass), 🎁 up to 7 days before
   - 🚶 + ring: „Ich bin unterwegs“ (with distance to home), red pulsing ring: SOS running
   - 🪫: phone battery almost empty (≤ 15 %, not charging)
   - children with a kids page: progress ring of the kids' tasks due right now, ⭐ or ✅
   Tap: child → kids page, SOS → SOS popup, otherwise quick actions (ofsOpen). Press and hold always opens
   the quick actions (also for children).
   Locations: on the overview at most once per minute (quiet mode every 5 min.) and only while the
   tile is visible and the app is in the foreground – SOS and ways home come with the SOS query anyway. */
var OFS_POLL_MS = 60 * 1000;
var OFS_POLL_RUHE_MS = 5 * 60 * 1000;
var ofsPollTimer = null;
var ofsTicking = false;
var ofsNoServer = false;
var ofsOpenId = '';
var ofsPressTimer = null;
var ofsPressFired = false;

function ofsTileVisible() {
  const s = document.getElementById('familyTileSection');
  return currentView === 'uebersicht' && !!s && !s.classList.contains('hidden');
}
// Without fresh data: locations last remembered on this device (live markers expire over time)
function ofsEnsureStatus() {
  if (famStatus || !famOrtungAllowed()) return;
  try {
    const c = JSON.parse(localStorage.getItem(LS_FAM_STATUS) || 'null');
    if (c && c.familie === ((currentUser() && currentUser().familie) || '')) famStatus = c.data;
  } catch (e) { /* ignore */ }
}
function ofsBirthday(m) {
  const p = m ? famPass(m.id) : null;
  const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String((p && p.birth) || ''));
  if (!mm) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let next = birthdayInYear(today.getFullYear(), Number(mm[2]), Number(mm[3]));
  if (next < today) next = birthdayInYear(today.getFullYear() + 1, Number(mm[2]), Number(mm[3]));
  const diff = Math.round((next - today) / 86400000);
  const age = next.getFullYear() - Number(mm[1]);
  return { diff, today: diff === 0, age: age > 0 && age < 130 ? age : null };
}
function ofsKidProgress(m) {
  if (!isKidPageEnabled(m)) return null;
  try {
    const cfg = normalizeKidConfig(m.kid);
    const now = new Date();
    const list = kidTasksForPeriod(cfg, kidCurrentPeriod(cfg, now));
    if (!list.length) return { total: 0, done: 0 };
    const today = isoDate(now);
    return { total: list.length, done: list.filter(t => kidIsDone(m, t.id, today)).length };
  } catch (e) { return null; }
}
// Way home: „gleich zu Hause“ – at most 600 m as the crow flies or at most 5 minutes by speed
function ofsSoon(h) {
  if (!h || !h.aktiv || h.entfernung == null || !isFinite(h.entfernung)) return null;
  const tempo = h.aktuell && Number(h.aktuell.tempo) >= 4 ? Number(h.aktuell.tempo) : 4.5; // km/h, otherwise on foot
  const eta = Math.max(1, Math.round(Number(h.entfernung) / 1000 / tempo * 60));
  return (Number(h.entfernung) <= 600 || eta <= 5) ? { eta } : null;
}
// Stars of the kids page: balance, earned today, waiting wishes
function ofsStars(m) {
  try {
    if (!kidStarsOn(m)) return null;
    const today = isoDate(new Date());
    const heute = kidStarLog(m).filter(e => e.d === today && e.k !== 'tausch' && e.s !== 'nein').reduce((s, e) => s + (Number(e.n) || 0), 0);
    return { stand: kidStarBalance(m), heute, offen: kidStarPending(m).length };
  } catch (e) { return null; }
}
// School & daycare: open homework and parent letters with a deadline
function ofsSchool(m) {
  try {
    const today = isoDate(new Date());
    const soon = addDaysToDateStr(today, 2);
    const hw = skHomeworkOf(m.id).filter(h => !h.done).sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
    const letters = skLettersOf(m.id).filter(l => !l.done).sort((a, b) => String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')));
    const urgentLetters = letters.filter(l => skIso(l.deadline) && l.deadline <= soon);
    const lateHw = hw.filter(h => skIso(h.due) && h.due <= addDaysToDateStr(today, 1));
    if (!hw.length && !letters.length) return null;
    return { hw, letters, urgentLetters, lateHw };
  } catch (e) { return null; }
}
function ofsState(m) {
  const st = { g: null, live: false, place: null, low: false, sos: null, hw: null, soon: null, bday: ofsBirthday(m), kid: ofsKidProgress(m), stars: ofsStars(m), school: ofsSchool(m) };
  try { st.sos = sosActiveFor(m.id); } catch (e) { st.sos = null; }
  try { st.hw = (Array.isArray(hwList) ? hwList : []).find(h => h.aktiv && h.memberId === m.id) || null; } catch (e) { st.hw = null; }
  st.soon = ofsSoon(st.hw);
  if (famOrtungAllowed()) {
    const g = famDeviceForMember(m.id);
    if (g) {
      st.g = g;
      st.live = famIsLive(g);
      if (st.live) {
        st.place = famPlace(g.position.ort);
        const a = g.position.akku;
        st.low = a != null && Number(a) <= 15 && !g.position.laedt;
      }
    }
  }
  return st;
}
function ofsSubLine(st) {
  if (st.sos) return { cls: 'sos', t: '🆘 SOS' };
  if (st.soon) return { cls: 'soon', t: '🏠 ' + tk('famTile.almostThere') };
  if (st.hw) return { cls: '', t: '🚶 ' + (st.hw.entfernung != null ? (tk('famTile.left') + ' ') + hwKm(st.hw.entfernung) : tk('famTile.wayHome')) };
  if (st.bday && st.bday.today) return { cls: 'bday', t: tk('famTile.birthday') };
  if (st.live) return { cls: 'live', t: st.place ? st.place.name : 'unterwegs' };
  if (st.bday && st.bday.diff === 1) return { cls: '', t: tk('famTile.tomorrow') };
  if (st.bday && st.bday.diff <= 7) return { cls: '', t: '🎁 in ' + st.bday.diff + (' ' + tk('pet.days')) };
  if (st.kid && st.kid.total) return { cls: '', t: st.kid.done + '/' + st.kid.total + ' ✓' };
  return null;
}
function renderFamilyTile() {
  const body = document.getElementById('familyTileBody');
  if (!body) return;
  if (!members.length) { body.innerHTML = ''; return; }
  ofsEnsureStatus();
  const rows = members.map(m => ({ m, st: ofsState(m) }));
  const anySub = rows.some(r => ofsSubLine(r.st));
  body.innerHTML = `<div class="ov-fam-row">${rows.map(({ m, st }) => {
    const kid = isKidPageEnabled(m);
    const sub = ofsSubLine(st);
    const cls = ['ov-fam-item', kid ? 'is-kid' : '', st.sos ? 'is-sos' : '', st.bday && st.bday.today ? 'is-bday' : '', st.soon ? 'is-soon' : (st.hw ? 'is-hw' : '')].filter(Boolean).join(' ');
    let badge = '', badgeCls = '';
    if (st.bday && st.bday.today) badge = '🎂';
    else if (st.soon) badge = '🏠';
    else if (st.hw) badge = '🚶';
    else if (st.low) badge = '🪫';
    else if (st.stars) { badge = '⭐' + st.stars.stand; badgeCls = ' stars'; }
    else if (kid) badge = st.kid && st.kid.total && st.kid.done >= st.kid.total ? '✅' : '⭐';
    let school = '';
    if (st.school && st.school.urgentLetters.length) school = `<span class="ov-fam-school urgent" title="${escapeHtml(tk('famTile.letterWithDeadline'))}">✉️</span>`;
    else if (st.school && st.school.hw.length) school = `<span class="ov-fam-school${st.school.lateHw.length ? ' urgent' : ''}" title="${escapeHtml(tk('famTile.openHomework'))}">📚${st.school.hw.length}</span>`;
    else if (st.school && st.school.letters.length) school = `<span class="ov-fam-school" title="${escapeHtml(tk('famTile.openLetters'))}">✉️</span>`;
    const ring = kid && st.kid && st.kid.total ? `<span class="ov-fam-ring" style="--p:${Math.round(st.kid.done / st.kid.total * 100)}"></span>` : '';
    const title = st.sos ? tk('famTile.openSos') : (kid ? tk('famTile.openKidsPage') : tk('famTile.quickActions'));
    return `<button type="button" class="${cls}" data-mid="${escapeHtml(m.id)}" title="${title}" aria-label="${escapeHtml(memberLabel(m))}">
      <span class="ov-fam-ava-wrap">${ring}<span class="ov-fam-ava" style="border-color:${memberBorderColor(m)}">${memberAvatarInnerHTML(m)}</span>${st.live ? ('<span class="ov-fam-live" title="' + escapeHtml(tk('family.liveLocation')) + '"></span>') : ''}${st.place && st.place.emoji ? `<span class="ov-fam-place">${escapeHtml(st.place.emoji)}</span>` : ''}${badge ? `<span class="ov-fam-badge${badgeCls}">${badge}</span>` : ''}${school}</span>
      <span class="ov-fam-name">${escapeHtml(memberLabel(m))}</span>${anySub ? `<span class="ov-fam-sub${sub && sub.cls ? ' ' + sub.cls : ''}">${sub ? escapeHtml(sub.t) : ''}</span>` : ''}
    </button>`;
  }).join('')}${ptTileHtml(anySub)}</div>`;
  ptTileWire(body);
  body.querySelectorAll('.ov-fam-item:not(.is-pet)').forEach(b => {
    const id = b.dataset.mid;
    const startPress = () => {
      clearTimeout(ofsPressTimer);
      ofsPressFired = false;
      ofsPressTimer = setTimeout(() => {
        ofsPressFired = true;
        try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* ignore */ }
        ofsOpen(id);
      }, 550);
    };
    const cancelPress = () => clearTimeout(ofsPressTimer);
    b.addEventListener('pointerdown', startPress);
    b.addEventListener('pointerup', cancelPress);
    b.addEventListener('pointerleave', cancelPress);
    b.addEventListener('pointercancel', cancelPress);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      if (ofsPressFired) { ofsPressFired = false; return; }
      const m = memberById(id);
      if (!m) return;
      const a = sosActiveFor(id);
      if (a) { sosOpen(a.id); return; }
      if (isKidPageEnabled(m)) { openKidPage(id); return; }
      ofsOpen(id);
    });
  });
  ofsEnsurePolling();
}

/* ---------- Reload locations for the tile (sparingly) ---------- */
function ofsEnsurePolling() {
  if (ofsPollTimer || ofsTicking) return;
  if (!ofsTileVisible() && !ofsOpenId) return;
  const fresh = famStatus && famStatus.jetzt && Date.now() - (Number(famStatus.jetzt) - famSkew) < 30 * 1000;
  ofsSchedule(famOrtungAllowed() && !ofsNoServer && !fresh ? 400 : OFS_POLL_MS);
}
function ofsSchedule(ms) {
  clearTimeout(ofsPollTimer);
  ofsPollTimer = setTimeout(ofsTick, ms);
}
async function ofsTick() {
  ofsPollTimer = null;
  if (!ofsTileVisible() && !ofsOpenId) return; // restarted by renderFamilyTile or ofsOpen
  ofsTicking = true;
  try {
    if (document.visibilityState === 'visible' && famOrtungAllowed() && !ofsNoServer && currentView !== 'familie') {
      await famLoadStatus();
      if (famStatusErr && /nicht eingespielt/.test(famStatusErr)) ofsNoServer = true;
    }
  } catch (e) { /* next attempt */ }
  ofsTicking = false;
  if (ofsOpenId && wbWaiting()) { try { await wbLoad(); } catch (e) { /* ignore */ } }
  if (ofsTileVisible()) renderFamilyTile(); // even without new data: expired live dots disappear
  ofsRefreshSheet();
  if (!ofsTileVisible() && !ofsOpenId) return;
  const ruhe = window.pinnRuhe && window.pinnRuhe();
  ofsSchedule(ruhe || !famOrtungAllowed() || ofsNoServer ? OFS_POLL_RUHE_MS : OFS_POLL_MS);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  try { if (ofsTileVisible() || ofsOpenId) { clearTimeout(ofsPollTimer); ofsPollTimer = null; ofsSchedule(500); } } catch (e) { /* app not ready yet */ }
  try { bdayCheck(); } catch (e) { /* app not ready yet */ }
  try { wbCheckIncoming(); } catch (e) { /* app not ready yet */ }
});
window.addEventListener('pinn-wach', () => {
  try { if (ofsTileVisible()) { clearTimeout(ofsPollTimer); ofsPollTimer = null; ofsSchedule(300); } } catch (e) { /* ignore */ }
});

/* ---------- Quick actions for a person ---------- */
function ofsTodayItems(m) {
  const today = isoDate(new Date());
  let evs = [];
  try {
    evs = (Array.isArray(events) ? events : []).filter(ev => ev && ev.date === today && !ev.pinnHoliday
      && getAssignedMembersForEvent(ev).some(x => x.id === m.id));
  } catch (e) { evs = []; }
  const seen = new Set();
  evs = evs.filter(ev => { const k = (ev.time || '') + '|' + ev.title; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  let tasks = [];
  try {
    tasks = deriveTasks().filter(t => {
      const done = taskDoneOverrides.has(t.id) ? taskDoneOverrides.get(t.id) : t.done;
      if (done || !t.dueDate || t.dueDate > today) return false;
      if (!childLockTaskVisible({ description: t.description })) return false;
      return assigneesForTask(t).some(x => x.id === m.id);
    });
  } catch (e) { tasks = []; }
  return { evs, tasks };
}
function ofsCanAdd() { return !childLockActive(); }
function ofsSheetHtml(m) {
  const st = ofsState(m);
  const p = famPass(m.id) || {};
  const pet = famIsPet(m);
  const color = famColor(m);
  const isMe = m.id === famMyMemberId();
  const kid = isKidPageEnabled(m);
  const age = famAge(p.birth);
  const sub = [m.role && memberLabel(m) !== m.role ? m.role : '', age != null ? tk('family.ageYears', { n: age }) : '', pet && p.species ? p.species : ''].filter(Boolean).join(' · ');
  const phone = String(p.phone || '').trim();
  const out = [];

  out.push(`<div class="ofs-head">
    <span class="fam-ava big" style="--fam:${famAttr(color)}">${famAvatarInner(m)}${st.live ? '<span class="fam-ping"></span>' : ''}</span>
    <div class="min-w-0">
      <div class="font-serif text-xl truncate">${escapeHtml(memberLabel(m))}</div>
      ${sub ? `<div class="text-xs text-ink/50 mt-0.5">${escapeHtml(sub)}</div>` : ''}
    </div>
  </div>`);

  // Birthday
  if (st.bday && st.bday.today) {
    const canNote = !isMe && isViewAllowed('pinnwand') && ofsCanAdd();
    out.push(`<div class="ofs-bday">
      <span class="ofs-bday-ic">🎂</span>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold">${isMe ? tk('famTile.happyBirthday') : tk('famTile.birthdayToday')}</div>
        ${st.bday.age ? `<div class="text-xs text-ink/60">${isMe ? tk('famTile.youTurnToday', { n: st.bday.age }) : tk('famTile.turns', { n: st.bday.age })}</div>` : ''}
      </div>
      ${isMe ? '<button type="button" class="fz-mini-btn" data-ofs="replay">🎉</button>' : (canNote ? '<button type="button" class="fz-mini-btn primary" data-ofs="gratulieren">Gratulieren</button>' : '')}
    </div>`);
  } else if (st.bday && st.bday.diff <= 14) {
    out.push(`<div class="text-xs text-ink/55 -mt-1">🎁 ${st.bday.diff === 1 ? tk('famTile.birthdayTomorrow') : tk('famTile.birthdayInDays', { n: st.bday.diff })}${st.bday.age ? ' · ' + tk('famTile.turns', { n: st.bday.age }) : ''}</div>`);
  }

  // SOS / way home / location
  if (st.sos) {
    out.push(`<button type="button" class="fz-note-box urgent w-full text-left" data-ofs="sos"><span>🆘</span><span class="text-sm font-medium">${tk('famTile.sosActiveTap')}</span></button>`);
  }
  if (famOrtungAllowed() && st.g) {
    const g = st.g;
    const pos = g.teilen ? g.position : null;
    let line;
    if (!g.teilen) line = tk('family.locationNotShared');
    else if (!pos) line = tk('family.noLocationReceivedYet');
    else {
      line = [st.place ? st.place.emoji + ' ' + st.place.name : (st.live ? 'unterwegs' : 'zuletzt'), famAgo(pos.zeit),
        pos.akku != null ? (st.low ? '🪫 ' : '🔋 ') + pos.akku + ' %' : ''].filter(Boolean).join(' · ');
    }
    out.push(`<div class="fam-card">
      <div class="text-sm">${st.live ? '<span class="fam-dot"></span><span class="text-red-600 font-medium">live</span> · ' : ''}${escapeHtml(line)}</div>
      ${st.soon ? `<div class="text-xs mt-1" style="color:#2E9C7A;font-weight:600">🏠 <span>${tk('famTile.almostHome')}</span> · ${escapeHtml(tk('famTile.approxMin', { n: st.soon.eta }))}</div>`
        : (st.hw ? `<div class="text-xs text-ink/60 mt-1">🚶 ${tk('famTile.onWayHome')}${st.hw.entfernung != null ? ' · ' + escapeHtml((tk('famTile.left') + ' ') + hwKm(st.hw.entfernung)) : ''}</div>` : '')}
      ${st.low ? '<div class="text-xs text-red-600 mt-1">🪫 ' + tk('famTile.batteryLow') + '</div>' : ''}
    </div>`);
  }

  // „Wo bist du?“: my last question to this person
  const wb = isMe ? null : wbLastAskTo(m.id);
  if (wb) {
    const a = wb.antwort;
    out.push(`<div class="fam-card flex items-center gap-3">
      <span class="text-2xl leading-none">${a ? (a.lat != null ? '📍' : '💬') : '⏳'}</span>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">${a ? (a.lat != null ? '<span>' + tk('famTile.locationSent') + '</span>' : escapeHtml(wbAnswerText(a.text))) : '<span>' + tk('famTile.askedWhere') + '</span>'}</div>
        <div class="text-[11px] text-ink/50">${escapeHtml(a ? tk('famTile.answerAgo', { ago: famAgo(a.zeit) }) : tk('famTile.noAnswerYet', { ago: famAgo(wb.zeit) }))}</div>
      </div>
      ${a ? `<button type="button" class="fz-mini-btn${a.lat != null ? ' primary' : ''}" data-ofs="wbview" data-id="${famAttr(wb.id)}">${tk('common.view')}</button>` : ''}
    </div>`);
  }

  // Stars
  if (kid && st.stars) {
    out.push(`<div class="fam-card flex items-center gap-3">
      <span class="ofs-stars">⭐ ${st.stars.stand}</span>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium">${tk('famTile.starsCollected', { n: st.stars.stand })}</div>
        <div class="text-[11px] text-ink/50">${escapeHtml(tk('famTile.today') + st.stars.heute)}${st.stars.offen ? ' · ' + escapeHtml(tk('famTile.wishesWaiting', { n: st.stars.offen })) : ''}</div>
      </div>
      ${st.stars.offen ? ('<button type="button" class="fz-mini-btn primary" data-ofs="kid">' + tk('common.view') + '</button>') : ''}
    </div>`);
  }

  // School & daycare
  if (st.school) {
    const today = isoDate(new Date());
    const rows = [];
    st.school.letters.slice(0, 3).forEach(l => {
      const late = skIso(l.deadline) && l.deadline <= addDaysToDateStr(today, 2);
      rows.push(`<button type="button" class="ofs-row" data-ofs="letter" data-id="${famAttr(l.id)}"><span class="ofs-chk">✉️</span><span class="min-w-0 flex-1 truncate text-sm">${escapeHtml(l.title || tk('school.parentLetter'))}</span>${skIso(l.deadline) ? `<span class="ofs-due${late ? ' late' : ''}">${escapeHtml(ofsDueLabel(l.deadline))}</span>` : ''}</button>`);
    });
    st.school.hw.slice(0, 4).forEach(h => {
      const late = skIso(h.due) && h.due <= addDaysToDateStr(today, 1);
      rows.push(`<div class="ofs-row">${skCanTick() ? `<button type="button" class="ofs-chk" data-ofs="hwtoggle" data-id="${famAttr(h.id)}" aria-label="${escapeHtml(tk('school.done2'))}"></button>` : '<span class="ofs-chk">📚</span>'}<button type="button" class="min-w-0 flex-1 truncate text-sm text-left" data-ofs="school">${escapeHtml([h.subject, h.text].filter(Boolean).join(': ') || tk('famTile.homework'))}</button>${skIso(h.due) ? `<span class="ofs-due${late ? ' late' : ''}">${escapeHtml(ofsDueLabel(h.due))}</span>` : ''}</div>`);
    });
    const more = Math.max(0, st.school.letters.length - 3) + Math.max(0, st.school.hw.length - 4);
    out.push(`<div class="fam-card">
      <div class="flex items-center justify-between gap-2 mb-1"><div class="fz-h" style="margin-bottom:0">${tk('famTile.schoolDaycare')}</div><button type="button" class="fz-mini-btn" data-ofs="school">${tk('shop.open')}</button></div>
      ${rows.join('')}
      ${more ? `<p class="text-[11px] text-ink/45 mt-1">${tk('famTile.moreN', { n: more })}</p>` : ''}
    </div>`);
  }

  // Kids' tasks
  if (kid && st.kid && st.kid.total) {
    out.push(`<div class="fam-card">
      <div class="flex items-center justify-between gap-2 text-sm"><span>⭐ ${tk('famTile.kidTasks')}</span><span class="text-xs text-ink/55">${tk('famTile.doneOf', { done: st.kid.done, total: st.kid.total })}</span></div>
      <div class="ofs-bar"><i style="width:${Math.round(st.kid.done / st.kid.total * 100)}%"></i></div>
    </div>`);
  }

  // Today
  const today = ofsTodayItems(m);
  if (!pet) {
    const rows = [];
    today.evs.slice(0, 4).forEach(ev => rows.push(`<button type="button" class="ofs-row" data-ofs="termine"><span class="ofs-time">${escapeHtml(ev.time || 'ganztags')}</span><span class="min-w-0 flex-1 truncate text-sm">${escapeHtml(ev.title)}</span></button>`));
    today.tasks.slice(0, 4).forEach(t => rows.push(`<button type="button" class="ofs-row" data-ofs="aufgabe" data-id="${famAttr(t.id)}"><span class="ofs-time">☐</span><span class="min-w-0 flex-1 truncate text-sm">${escapeHtml(i18nT(t.title))}</span></button>`));
    const more = Math.max(0, today.evs.length - 4) + Math.max(0, today.tasks.length - 4);
    out.push(`<div class="fam-card">
      <div class="fz-h">${tk('famTile.today2')}</div>
      ${rows.length ? rows.join('') : '<p class="text-sm text-ink/45">' + tk('famTile.nothingToday') + '</p>'}
      ${more ? `<p class="text-[11px] text-ink/45 mt-1">${tk('famTile.moreN', { n: more })}</p>` : ''}
    </div>`);
  }

  // Actions
  const acts = [];
  const act = (key, ic, label, extra) => acts.push(`<button type="button" class="fz-act-btn" data-ofs="${key}"${extra || ''}><span class="fz-ti">${ic}</span><span>${label}</span></button>`);
  if (kid) act('kid', '⭐', tk('famTile.kidsPage'));
  if (phone && !isMe) {
    acts.push(`<a class="fz-act-btn" href="${famAttr(famTel(phone))}"><span class="fz-ti">📞</span><span>${tk('family.callBtn')}</span></a>`);
    acts.push(`<a class="fz-act-btn" href="${famAttr('sms:' + phone.replace(/[^\d+]/g, ''))}"><span class="fz-ti">💬</span><span>${tk('famTile.message')}</span></a>`);
  }
  if (st.g && st.g.teilen && st.g.position && isViewAllowed('familie')) act('karte', '🗺', tk('family.map'));
  if (wbCanAsk(m, st)) act('wobistdu', '📍', tk('wb.whereAreYou'));
  if (st.hw) act('heimweg', '🚶', tk('famTile.wayHome'));
  if (!pet && ofsCanAdd() && isViewAllowed('aufgaben')) act('task', '✅', tk('search.type.task'));
  if (!pet && ofsCanAdd() && isViewAllowed('pinnwand')) {
    act('zettel', '📝', tk('search.note.note'));
    if (!isMe) act('danke', '💛', tk('famTile.thanks'));
  }
  if (isViewAllowed('familie')) {
    act('profil', '👤', tk('famTile.profile'));
    act('pass', '🩺', tk('family.emergencyCard2'));
  }
  if (acts.length) out.push(`<div class="ofs-acts">${acts.join('')}</div>`);

  // Own phone: way home and sharing directly here
  if (isMe && famOrtungAllowed()) {
    const g = famMyDevice();
    if (g) {
      const unterwegs = famUnterwegs(g);
      out.push(`<div class="fam-card">
        <label class="fz-check" style="margin-bottom:8px"><input type="checkbox" data-ofs-share="${famAttr(g.id)}"${g.teilen ? ' checked' : ''} /><span>${tk('famTile.shareLocationFamily')}</span></label>
        <button type="button" class="fz-mini-btn${unterwegs ? ' primary' : ''}" data-ofs="unterwegs" data-an="${unterwegs ? '0' : '1'}">${unterwegs ? tk('family.endWayHome') : tk('family.imMyWayHome')}</button>
      </div>`);
    }
  }
  if (kid) out.push('<p class="text-[11px] text-ink/40 text-center">' + tk('famTile.tapHoldTip') + '</p>');
  return `<div class="ofs" data-ofs-root="${famAttr(m.id)}">${out.join('')}</div>`;
}
function ofsOpen(memberId) {
  const m = memberById(memberId);
  if (!m) return;
  ofsOpenId = memberId;
  ofsEnsureStatus();
  famOpenModal(ofsSheetHtml(m), ofsWire);
  ofsEnsurePolling();
  wbLoad().then(() => ofsRefreshSheet());
}
function ofsRefreshSheet() {
  if (!ofsOpenId) return;
  const modal = document.getElementById('famModal');
  const root = document.querySelector('#famModalBody [data-ofs-root]');
  if (!modal || modal.classList.contains('hidden') || !root || root.dataset.ofsRoot !== ofsOpenId) { ofsOpenId = ''; return; }
  const m = memberById(ofsOpenId);
  if (!m) { famCloseModal(); ofsOpenId = ''; return; }
  const body = document.getElementById('famModalBody');
  const ae = document.activeElement;
  if (ae && body.contains(ae) && ae.matches('input')) return; // at the switch right now
  body.innerHTML = ofsSheetHtml(m);
  ofsWire(body);
  try { armModalSnapshot('famModal'); } catch (e) { /* ignore */ }
}
function ofsClose() {
  ofsOpenId = '';
  famCloseModal();
}
function ofsWire(body) {
  const root = body.querySelector('[data-ofs-root]');
  if (!root) return;
  const id = root.dataset.ofsRoot;
  root.querySelectorAll('[data-ofs-share]').forEach(cb => cb.addEventListener('change', async () => {
    await famSetSharing(cb.dataset.ofsShare, cb.checked, cb);
    ofsRefreshSheet();
    renderFamilyTile();
  }));
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ofs]');
    if (!b) return;
    const m = memberById(id);
    if (!m) return;
    const k = b.dataset.ofs;
    const st = ofsState(m);
    if (k === 'kid') { ofsClose(); openKidPage(id); }
    else if (k === 'sos') { ofsClose(); if (st.sos) sosOpen(st.sos.id); }
    else if (k === 'heimweg') { ofsClose(); if (st.hw) hwOpen(st.hw.id); }
    else if (k === 'karte') { ofsClose(); if (st.g) famShowOnMap(st.g.id); }
    else if (k === 'profil') { ofsClose(); famOpenMember(id); }
    else if (k === 'pass') { ofsClose(); famOpenPass(id); }
    else if (k === 'termine') { ofsClose(); setView('termine'); }
    else if (k === 'aufgabe') {
      ofsClose();
      setView('aufgaben');
      const tid = b.dataset.id;
      if (tid && aufgaben.some(t => t.id === tid)) openTaskFromLink(tid);
    }
    else if (k === 'task') {
      ofsClose();
      openTaskModal();
      pendingTaskAssignees = [id];
      renderTaskAssigneeOptions();
      armModalSnapshot('taskModal');
    }
    else if (k === 'zettel' || k === 'danke' || k === 'gratulieren') {
      ofsClose();
      const preset = k === 'gratulieren' ? tk('famTile.happyBirthday') + ' 🎂🎉' : '';
      openPinboardEditor(null, k === 'danke' ? 'kudos' : 'note', preset);
      if (pwDraft) {
        pwDraft.to = [id];
        if (k === 'gratulieren') { pwDraft.color = 'rosa'; pwDraft.colorTouched = true; }
        pwRenderEditor();
      }
      armModalSnapshot('pinboardEditModal');
    }
    else if (k === 'unterwegs') {
      await famSetUnterwegs(b.dataset.an === '1', b);
      ofsRefreshSheet();
      renderFamilyTile();
    }
    else if (k === 'replay') { ofsClose(); bdayShow(m, ofsBirthday(m)); }
    else if (k === 'wobistdu') { await wbAsk(id, b); }
    else if (k === 'wbview') { wbOpen(b.dataset.id); }
    else if (k === 'school') { ofsClose(); skKid = id; famDetailId = null; if (currentView !== 'familie') setView('familie'); famSetTab('schule'); }
    else if (k === 'letter') {
      ofsClose();
      skKid = id; famDetailId = null;
      if (currentView !== 'familie') setView('familie');
      famSetTab('schule');
      if (skCanEdit()) skOpenLetter(b.dataset.id);
    }
    else if (k === 'hwtoggle') { skToggleHomework(b.dataset.id); setTimeout(() => { ofsRefreshSheet(); renderFamilyTile(); }, 60); }
  });
}

function ofsDueLabel(iso) {
  const today = isoDate(new Date());
  if (iso < today) return tk('school.overdue');
  if (iso === today) return tk('contract.today');
  if (iso === addDaysToDateStr(today, 1)) return tk('contract.tomorrow');
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString(sysLocale(), { weekday: 'short', day: 'numeric', month: 'numeric' });
}

/* ---------- Way home: „gleich zu Hause“ ----------
   If someone on the way home gets close (≤ 600 m or ≤ 5 min.), pinn. shows a short notice once per way
   home – data from the SOS query that runs anyway. */
var hwSoonSeen = new Set();
function hwSoonCheck() {
  (Array.isArray(hwList) ? hwList : []).forEach(h => {
    if (!h.aktiv || hwIsMine(h) || hwSoonSeen.has(h.id)) return;
    const s = ofsSoon(h);
    if (!s) return;
    hwSoonSeen.add(h.id);
    try { finShowToast('🏠 ' + tk('famTile.isAlmostHome', { name: hwName(h), n: s.eta })); } catch (e) { /* ignore */ }
  });
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('familienkachel');

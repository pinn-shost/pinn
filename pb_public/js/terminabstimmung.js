/* pinn. – Date polls in the calendar (js/terminabstimmung.js, since 1.163.0)
   Classic script, no build step: loaded after js/ausleihe.js. A button next to "+ Event" in the calendar opens the list of
   polls. Somebody suggests several dates, everybody answers per date with yes / maybe / no, the creator picks the winner
   and puts it into the calendar with one tap (the event form opens already filled in).
   Data: the family data key "eventPolls" (area "abstimmung", pb_hooks/pinn-bereiche.js) – synchronised between the devices.
   One poll:
     { id, title, place, note, options: [{ id, date, start, end }], invitees: [member IDs, empty = everybody],
       votes: { <member ID>: { <option ID>: 'y' | 'm' | 'n' } }, status: 'open' | 'decided', win: option ID,
       calendar: true once it was put into the calendar, by (user ID), byMember (member ID), created }
   Push messages (new poll, everybody answered, date decided) are sent by the server (pb_hooks/pinn-abstimmung.js) when
   the app calls /api/pinn/abstimmung/push after saving – the server reads the poll from the saved family data. */

var POLL_MAX_OPTIONS = 8;
var POLL_KEEP_DAYS = 21;     // decided polls stay in the list this long after their date
var pollEditing = '';

function pollMeId() { const m = currentMember(); return m ? m.id : ''; }
function pollById(id) { return eventPolls.find(p => p.id === id) || null; }
function pollInvitees(p) {
  const ids = Array.isArray(p.invitees) ? p.invitees.filter(id => memberById(id)) : [];
  return ids.length ? ids : members.map(m => m.id);
}
function pollIsOwner(p) {
  const u = currentUser();
  return !!(u && (p.by === u.id || (typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin())));
}
function pollOptLabel(o) {
  if (!o) return '';
  const d = new Date(o.date + 'T00:00:00');
  const day = d.toLocaleDateString(sysLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
  return o.start ? day + ', ' + o.start + (o.end ? '–' + o.end : '') : day;
}
function pollAnswered(p, mid) {
  const v = (p.votes && p.votes[mid]) || {};
  return p.options.length > 0 && p.options.every(o => v[o.id]);
}
function pollAllAnswered(p) { return pollInvitees(p).every(mid => pollAnswered(p, mid)); }
// Counts per option: { y, m, n }
function pollTally(p, optId) {
  const t = { y: 0, m: 0, n: 0 };
  pollInvitees(p).forEach(mid => { const v = p.votes && p.votes[mid] && p.votes[mid][optId]; if (v && t[v] !== undefined) t[v]++; });
  return t;
}
function pollBestOption(p) {
  let best = null, bestScore = -1;
  p.options.forEach(o => {
    const t = pollTally(p, o.id);
    const score = t.y * 100 + t.m * 10 - t.n;
    if (score > bestScore && (t.y + t.m) > 0) { bestScore = score; best = o.id; }
  });
  return best;
}
function pollVisible(p) {
  if (p.status !== 'decided') return true;
  const win = p.options.find(o => o.id === p.win);
  const last = win ? win.date : (p.options.map(o => o.date).sort().pop() || '');
  if (!last) return true;
  const limit = new Date(last + 'T00:00:00'); limit.setDate(limit.getDate() + POLL_KEEP_DAYS);
  return limit >= new Date();
}
// Open polls that wait for the answer of this profile
function pollWaitingForMe() {
  const me = pollMeId();
  if (!me) return [];
  return eventPolls.filter(p => p.status === 'open' && pollInvitees(p).includes(me) && !pollAnswered(p, me));
}

function pollSave(list) {
  eventPolls = list;
  persistState();
  pollUpdateBadge();
  const m = document.getElementById('pollModal');
  if (m && !m.classList.contains('hidden')) pollRenderList();
}
// Ask the server for the push message after the poll was saved (the server reads the saved poll itself)
async function pollPush(pollId, kind) {
  try {
    await persistState();
    await apiFetch('/api/pinn/abstimmung/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poll: pollId, kind }),
    });
  } catch (e) { /* no push – the poll itself is saved anyway */ }
}

/* ---------- Button with badge ---------- */
function pollUpdateBadge() {
  const b = document.getElementById('pollOpenBadge');
  if (!b) return;
  const n = pollWaitingForMe().length;
  b.textContent = n > 9 ? '9+' : String(n);
  b.classList.toggle('hidden', !n);
}

/* ---------- List popup ---------- */
function pollEnsureModal() {
  if (document.getElementById('pollModal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div id="pollModal" class="hidden fixed inset-0 bg-ink/30 backdrop-blur-sm z-[320] grid place-items-center p-4 sm:p-6">
    <div class="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto fade-in">
      <button id="pollCloseBtn" type="button" class="absolute top-3 right-3 w-7 h-7 rounded-full text-ink/40 hover:text-ink hover:bg-ink/5 transition grid place-items-center text-lg leading-none select-none" aria-label="${escapeHtml(tk('common.close'))}">×</button>
      <div class="flex items-center justify-between gap-3 mb-1 pr-6">
        <h3 class="font-serif text-lg">${escapeHtml(tk('poll.title'))}</h3>
        <button id="pollNewBtn" type="button" class="px-3 py-1.5 rounded-lg bg-pine text-white text-xs font-medium transition whitespace-nowrap">${escapeHtml(tk('poll.new'))}</button>
      </div>
      <p class="text-xs text-ink/50 mb-4">${escapeHtml(tk('poll.intro'))}</p>
      <div id="pollList"></div>
    </div></div>
    <div id="pollEditModal" class="hidden fixed inset-0 bg-ink/30 backdrop-blur-sm z-[330] grid place-items-center p-4 sm:p-6">
    <div class="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto fade-in">
      <button id="pollEditCloseBtn" type="button" class="absolute top-3 right-3 w-7 h-7 rounded-full text-ink/40 hover:text-ink hover:bg-ink/5 transition grid place-items-center text-lg leading-none select-none" aria-label="${escapeHtml(tk('common.close'))}">×</button>
      <h3 id="pollEditTitle" class="font-serif text-lg mb-4 pr-6"></h3>
      <label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="pollTitleInput">${escapeHtml(tk('poll.what'))}</label>
      <input id="pollTitleInput" type="text" maxlength="120" autocomplete="off" placeholder="${escapeHtml(tk('poll.whatPh'))}" class="w-full rounded-lg border border-ink/15 px-2.5 py-2 text-sm mb-3" />
      <label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="pollPlaceInput">${escapeHtml(tk('event.location'))}</label>
      <input id="pollPlaceInput" type="text" maxlength="120" autocomplete="off" class="w-full rounded-lg border border-ink/15 px-2.5 py-2 text-sm mb-3" />
      <div class="text-xs uppercase tracking-wide text-ink/40 mb-1">${escapeHtml(tk('poll.dates'))}</div>
      <div id="pollOptRows" class="flex flex-col gap-2 mb-2"></div>
      <button id="pollAddOptBtn" type="button" class="text-xs text-pine hover:underline mb-3">${escapeHtml(tk('poll.addDate'))}</button>
      <label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="pollNoteInput">${escapeHtml(tk('event.notes'))}</label>
      <textarea id="pollNoteInput" rows="2" maxlength="400" class="w-full rounded-lg border border-ink/15 px-2.5 py-2 text-sm mb-3"></textarea>
      <div class="text-xs uppercase tracking-wide text-ink/40 mb-1">${escapeHtml(tk('poll.who'))}</div>
      <div id="pollWho" class="flex flex-wrap gap-1.5 mb-3"></div>
      <p id="pollEditError" class="hidden text-xs text-red-500 mb-2"></p>
      <div class="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-ink/10">
        <button id="pollEditCancelBtn" type="button" class="px-3 py-2 rounded-lg border border-ink/15 text-sm text-ink/60 hover:bg-ink/5 transition">${escapeHtml(tk('common.cancel'))}</button>
        <button id="pollEditSaveBtn" type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium transition">${escapeHtml(tk('poll.send'))}</button>
      </div>
    </div></div>`;
  while (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);
  const byId = (id) => document.getElementById(id);
  byId('pollCloseBtn').addEventListener('click', pollCloseList);
  byId('pollModal').addEventListener('click', (e) => { if (e.target.id === 'pollModal') pollCloseList(); });
  byId('pollNewBtn').addEventListener('click', () => pollOpenEditor());
  byId('pollAddOptBtn').addEventListener('click', () => pollAddOptRow());
  byId('pollEditCloseBtn').addEventListener('click', () => attemptCloseModal('pollEditModal', pollCloseEditor));
  byId('pollEditCancelBtn').addEventListener('click', () => attemptCloseModal('pollEditModal', pollCloseEditor));
  wireModalOutsideClick('pollEditModal', pollCloseEditor);
  byId('pollEditSaveBtn').addEventListener('click', pollSaveEditor);
  byId('pollWho').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pollwho]');
    if (b) b.classList.toggle('active');
    if (b) pollStyleWho(b);
  });
  byId('pollOptRows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pollrm]');
    if (b && byId('pollOptRows').children.length > 1) b.closest('[data-pollrow]').remove();
  });
  byId('pollList').addEventListener('click', pollListClick);
}
function pollStyleWho(b) {
  const on = b.classList.contains('active');
  b.style.background = on ? 'var(--c-pine)' : 'transparent';
  b.style.color = on ? '#fff' : '';
}
function pollOpenList() {
  pollEnsureModal();
  pollRenderList();
  document.getElementById('pollModal').classList.remove('hidden');
}
function pollCloseList() { document.getElementById('pollModal').classList.add('hidden'); }

function pollRenderList() {
  const el = document.getElementById('pollList');
  const me = pollMeId();
  const open = eventPolls.filter(p => p.status !== 'decided').sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  const decided = eventPolls.filter(p => p.status === 'decided' && pollVisible(p)).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  if (!open.length && !decided.length) {
    el.innerHTML = `<p class="text-sm text-ink/45 italic py-6 text-center">${escapeHtml(tk('poll.empty'))}</p>`;
    return;
  }
  // Voting on behalf of members without an own profile (e.g. children)
  const proxies = members.filter(m => m.id !== me && !familyProfiles.some(p => p.mitglied === m.id));
  const card = (p) => {
    const inv = pollInvitees(p);
    const owner = pollIsOwner(p);
    const decidedOpt = p.status === 'decided' ? p.options.find(o => o.id === p.win) : null;
    const best = p.status === 'open' ? pollBestOption(p) : null;
    const asId = el.dataset['as' + p.id] || me;
    const canVote = p.status === 'open' && inv.includes(asId);
    const mv = (p.votes && p.votes[asId]) || {};
    const rows = p.options.map(o => {
      const t = pollTally(p, o.id);
      const isWin = decidedOpt && decidedOpt.id === o.id;
      const btn = (v, sym, label) => `<button type="button" class="w-8 h-8 rounded-full border text-sm grid place-items-center transition ${mv[o.id] === v ? 'text-white' : 'text-ink/50 border-ink/15 hover:border-pine'}" style="${mv[o.id] === v ? 'background:' + (v === 'y' ? 'var(--c-pine)' : v === 'm' ? 'var(--c-mustard)' : '#B5543C') + ';border-color:transparent' : ''}" data-poll-vote="${escapeHtml(p.id)}" data-opt="${escapeHtml(o.id)}" data-v="${v}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${sym}</button>`;
      return `<div class="flex items-center gap-2 py-2 border-t border-ink/10 first:border-t-0${isWin ? ' font-medium' : ''}">
        <div class="min-w-0 flex-1">
          <div class="text-sm truncate">${isWin ? '✅ ' : ''}${escapeHtml(pollOptLabel(o))}${best === o.id && inv.length > 1 ? ` <span class="text-[11px] text-pine">${escapeHtml(tk('poll.best'))}</span>` : ''}</div>
          <div class="text-[11px] text-ink/50">✔ ${t.y} · ? ${t.m} · ✕ ${t.n}</div>
        </div>
        ${canVote ? `<div class="flex items-center gap-1.5 shrink-0">${btn('y', '✔', tk('poll.yes'))}${btn('m', '?', tk('poll.maybe'))}${btn('n', '✕', tk('poll.no'))}</div>` : ''}
        ${p.status === 'open' && owner ? `<button type="button" class="shrink-0 px-2 py-1 rounded-lg border border-ink/15 text-[11px] text-ink/60 hover:text-pine hover:border-pine transition" data-poll-pick="${escapeHtml(p.id)}" data-opt="${escapeHtml(o.id)}">${escapeHtml(tk('poll.pick'))}</button>` : ''}
      </div>`;
    }).join('');
    const answered = inv.filter(mid => pollAnswered(p, mid)).length;
    const waiting = inv.filter(mid => !pollAnswered(p, mid)).map(mid => memberLabel(memberById(mid))).join(', ');
    const by = p.byMember && memberById(p.byMember) ? memberLabel(memberById(p.byMember)) : '';
    const proxySel = p.status === 'open' && proxies.length && inv.some(id => proxies.some(x => x.id === id)) ? `<div class="flex items-center gap-2 mt-2 text-xs text-ink/55">${escapeHtml(tk('poll.answerAs'))}
      <select class="rounded-lg border border-ink/15 px-2 py-1 text-xs bg-white" data-poll-as="${escapeHtml(p.id)}">${[memberById(me)].concat(proxies).filter(Boolean).filter(m => inv.includes(m.id)).map(m => `<option value="${escapeHtml(m.id)}"${m.id === asId ? ' selected' : ''}>${escapeHtml(memberLabel(m))}</option>`).join('')}</select></div>` : '';
    return `<div class="rounded-2xl border border-ink/10 shadow-sm p-3 mb-3" data-poll="${escapeHtml(p.id)}">
      <div class="flex items-start justify-between gap-2"><div class="min-w-0"><div class="font-medium truncate">${escapeHtml(p.title)}</div>
        <div class="text-[11px] text-ink/45 truncate">${escapeHtml([by ? tk('poll.by', { name: by }) : '', p.place ? '📍 ' + p.place : ''].filter(Boolean).join(' · '))}</div></div>
        ${owner ? `<button type="button" class="shrink-0 text-xs text-ink/40 hover:text-red-500" data-poll-del="${escapeHtml(p.id)}" aria-label="${escapeHtml(tk('common.delete'))}">🗑</button>` : ''}</div>
      ${p.note ? `<div class="text-xs text-ink/55 mt-1 whitespace-pre-line">${escapeHtml(p.note)}</div>` : ''}
      <div class="mt-2">${rows}</div>
      ${proxySel}
      <div class="text-[11px] text-ink/45 mt-2">${escapeHtml(tk('poll.answered', { n: answered, total: inv.length }))}${waiting && answered < inv.length ? ' · ' + escapeHtml(tk('poll.waitingFor', { names: waiting })) : ''}</div>
      ${decidedOpt ? `<div class="flex flex-wrap items-center gap-2 mt-3"><span class="text-sm text-pine font-medium">${escapeHtml(tk('poll.decided', { when: pollOptLabel(decidedOpt) }))}</span>
        ${p.calendar ? `<span class="text-xs text-ink/50">✓ ${escapeHtml(tk('poll.inCalendar'))}</span>` : `<button type="button" class="px-3 py-1.5 rounded-lg bg-pine text-white text-xs font-medium transition" data-poll-cal="${escapeHtml(p.id)}">${escapeHtml(tk('poll.toCalendar'))}</button>`}
        ${owner ? `<button type="button" class="text-xs text-ink/50 hover:text-pine" data-poll-reopen="${escapeHtml(p.id)}">${escapeHtml(tk('poll.reopen'))}</button>` : ''}</div>` : ''}
    </div>`;
  };
  el.innerHTML = open.map(card).join('') + (decided.length ? `<div class="text-[11px] uppercase tracking-wide text-ink/40 mb-1.5 mt-4">${escapeHtml(tk('poll.secDecided'))}</div>` + decided.map(card).join('') : '');
}
function pollListClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  const g = (k) => t.getAttribute(k);
  if (t.hasAttribute('data-poll-vote')) {
    const el = document.getElementById('pollList');
    pollVote(g('data-poll-vote'), g('data-opt'), g('data-v'), el.dataset['as' + g('data-poll-vote')] || pollMeId());
  } else if (t.hasAttribute('data-poll-pick')) pollDecide(g('data-poll-pick'), g('data-opt'));
  else if (t.hasAttribute('data-poll-del')) {
    if (confirm(tk('poll.confirmDelete'))) pollSave(eventPolls.filter(p => p.id !== g('data-poll-del')));
  } else if (t.hasAttribute('data-poll-reopen')) {
    pollSave(eventPolls.map(p => p.id === g('data-poll-reopen') ? { ...p, status: 'open', win: '', calendar: false } : p));
  } else if (t.hasAttribute('data-poll-cal')) pollToCalendar(g('data-poll-cal'));
}
document.addEventListener('change', (e) => {
  const s = e.target.closest && e.target.closest('[data-poll-as]');
  if (!s) return;
  document.getElementById('pollList').dataset['as' + s.dataset.pollAs] = s.value;
  pollRenderList();
});

function pollVote(pollId, optId, value, asMember) {
  const p = pollById(pollId);
  if (!p || !asMember || p.status !== 'open') return;
  const wasComplete = pollAllAnswered(p);
  const votes = { ...(p.votes || {}) };
  const mine = { ...(votes[asMember] || {}) };
  if (mine[optId] === value) delete mine[optId]; else mine[optId] = value;
  votes[asMember] = mine;
  const next = { ...p, votes };
  pollSave(eventPolls.map(x => x.id === pollId ? next : x));
  if (!wasComplete && pollAllAnswered(next)) pollPush(pollId, 'komplett');
}
function pollDecide(pollId, optId) {
  const p = pollById(pollId);
  if (!p) return;
  pollSave(eventPolls.map(x => x.id === pollId ? { ...x, status: 'decided', win: optId, calendar: false } : x));
  pollPush(pollId, 'entschieden');
}
// Open the event form for the winning date, already filled in
function pollToCalendar(pollId) {
  const p = pollById(pollId);
  const o = p && p.options.find(x => x.id === p.win);
  if (!o) return;
  pollCloseList();
  if (typeof setView === 'function') setView('termine');
  openAddEventModal();
  const addHour = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return String((h + 1) % 24).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };
  fillEventForm({
    title: p.title, location: p.place || '', notes: p.note || '', allDay: !o.start,
    startDate: o.date, endDate: o.date, startTime: o.start || '09:00', endTime: o.end || (o.start ? addHour(o.start) : '10:00'),
    assigneeIds: pollInvitees(p),
  });
  armModalSnapshot('addEventModal');
  // marked as "in the calendar" as soon as the form was opened from the poll – the person can still cancel there
  pollSave(eventPolls.map(x => x.id === pollId ? { ...x, calendar: true } : x));
}

/* ---------- Editor ---------- */
function pollAddOptRow(o) {
  const rows = document.getElementById('pollOptRows');
  if (rows.children.length >= POLL_MAX_OPTIONS) return;
  const row = document.createElement('div');
  row.setAttribute('data-pollrow', '1');
  row.className = 'flex items-center gap-1.5';
  row.innerHTML = `<input type="date" data-pd class="min-w-0 flex-1 rounded-lg border border-ink/15 px-2 py-1.5 text-sm" value="${escapeHtml((o && o.date) || '')}" />
    <input type="time" data-ps class="rounded-lg border border-ink/15 px-1.5 py-1.5 text-sm" style="width:5.6rem" value="${escapeHtml((o && o.start) || '')}" aria-label="${escapeHtml(tk('poll.from'))}" />
    <input type="time" data-pe class="rounded-lg border border-ink/15 px-1.5 py-1.5 text-sm" style="width:5.6rem" value="${escapeHtml((o && o.end) || '')}" aria-label="${escapeHtml(tk('poll.to'))}" />
    <button type="button" data-pollrm class="shrink-0 w-7 h-7 rounded-full text-ink/40 hover:text-red-500 grid place-items-center text-lg leading-none" aria-label="${escapeHtml(tk('common.delete'))}">×</button>`;
  rows.appendChild(row);
}
function pollOpenEditor() {
  pollEnsureModal();
  const byId = (id) => document.getElementById(id);
  pollEditing = '';
  byId('pollEditTitle').textContent = tk('poll.new');
  byId('pollTitleInput').value = '';
  byId('pollPlaceInput').value = '';
  byId('pollNoteInput').value = '';
  byId('pollOptRows').innerHTML = '';
  pollAddOptRow(); pollAddOptRow();
  const me = pollMeId();
  byId('pollWho').innerHTML = members.map(m => `<button type="button" data-pollwho="${escapeHtml(m.id)}" class="active px-2.5 py-1 rounded-full border border-ink/15 text-xs transition" style="background:var(--c-pine);color:#fff">${escapeHtml(memberLabel(m))}${m.id === me ? '' : ''}</button>`).join('');
  byId('pollEditError').classList.add('hidden');
  byId('pollEditModal').classList.remove('hidden');
  armModalSnapshot('pollEditModal');
}
function pollCloseEditor() { document.getElementById('pollEditModal').classList.add('hidden'); }
function pollSaveEditor() {
  const byId = (id) => document.getElementById(id);
  const err = (key) => { const e = byId('pollEditError'); e.textContent = tk(key); e.classList.remove('hidden'); };
  const title = byId('pollTitleInput').value.trim();
  if (!title) return err('poll.err.title');
  const options = [];
  byId('pollOptRows').querySelectorAll('[data-pollrow]').forEach(r => {
    const date = r.querySelector('[data-pd]').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const start = r.querySelector('[data-ps]').value || '';
    let end = r.querySelector('[data-pe]').value || '';
    if (!start) end = '';
    options.push({ id: newRecordId(), date, start, end });
  });
  if (options.length < 2) return err('poll.err.dates');
  const sel = Array.from(byId('pollWho').querySelectorAll('[data-pollwho].active')).map(b => b.dataset.pollwho);
  if (sel.length < 2) return err('poll.err.who');
  const u = currentUser();
  const rec = {
    id: newRecordId(), title: title.slice(0, 120), place: byId('pollPlaceInput').value.trim().slice(0, 120),
    note: byId('pollNoteInput').value.trim().slice(0, 400), options,
    invitees: sel.length === members.length ? [] : sel, votes: {}, status: 'open', win: '', calendar: false,
    by: (u && u.id) || '', byMember: pollMeId(), created: new Date().toISOString(),
  };
  // The creator's own answer is not assumed – everybody answers per date
  pollSave(eventPolls.concat(rec));
  pollCloseEditor();
  pollPush(rec.id, 'neu');
}

/* ---------- Wiring ---------- */
(function pollInit() {
  const btn = document.getElementById('pollOpenBtn');
  if (btn) btn.addEventListener('click', pollOpenList);
  if (typeof renderCalendar === 'function') {
    const orig = renderCalendar;
    renderCalendar = function () {
      const r = orig.apply(this, arguments);
      try { pollUpdateBadge(); } catch (e) { /* ignore */ }
      return r;
    };
  }
})();

(window.PINN_PARTS = window.PINN_PARTS || []).push('terminabstimmung');

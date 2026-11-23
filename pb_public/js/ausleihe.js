/* pinn. – Lending list: who has what from whom (js/ausleihe.js, since 1.163.0)
   Classic script, no build step: loaded after js/listen.js; shown as its own tab "Lending" on the Lists page
   (listen.js calls loanRender for the tab "leihe" and loanOpenEditor for the "+ New" button).
   Data: the family data key "loans" (area "ausleihe", pb_hooks/pinn-bereiche.js) – synchronised between the devices and
   changeable offline. One entry:
     { id, thing, from, to, date, due, again, remind, priv, back, note, by, created }
     from / to  = who gives / who gets it: { m: member ID } for a family member or { n: "Name" } for anybody else
                  (a colleague, a neighbour …); at least one of the two is a family member
     date       = lent on (YYYY-MM-DD), due = back by (YYYY-MM-DD or ""), back = returned on (YYYY-MM-DD or "" = still out)
     again      = while overdue: ask again every 1, 3 or 7 days; remind = push reminders on / off
     priv       = only visible for (and reminded to) the person who made the entry; by = that user's ID
   Reminders by push come from the server (pb_hooks/pinn-ausleihe.js): the day before, on the due day and then
   repeatedly while it is still not back. */

var LOAN_AGAIN = [1, 3, 7];
var loanEditing = '';       // ID of the entry in the editor ('' = new)
var loanShowDone = false;   // list of returned things expanded

function loanToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function loanDays(fromIso, toIso) {
  return Math.round((new Date(toIso + 'T00:00:00') - new Date(fromIso + 'T00:00:00')) / 86400000);
}
function loanDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString(sysLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}
function loanMeId() { const m = currentMember(); return m ? m.id : ''; }
function loanById(id) { return loans.find(l => l.id === id) || null; }
function loanVisible(l) {
  if (!l.priv) return true;
  const u = currentUser();
  return !!(u && l.by === u.id);
}
// Display name of one side of a loan
function loanParty(p) {
  if (!p) return '?';
  if (p.m) { const m = memberById(p.m); return m ? memberLabel(m) : '?'; }
  return String(p.n || '?');
}
function loanIsMe(p) { return !!(p && p.m && p.m === loanMeId()); }
// "Lent to Ben" / "Borrowed from Anna" / "Anna → Ben"
function loanWho(l) {
  if (loanIsMe(l.from)) return tk('loan.lentTo', { name: loanParty(l.to) });
  if (loanIsMe(l.to)) return tk('loan.borrowedFrom', { name: loanParty(l.from) });
  return loanParty(l.from) + ' → ' + loanParty(l.to);
}
// 'overdue' | 'today' | 'soon' | 'open' | 'done'
function loanState(l) {
  if (l.back) return 'done';
  if (!l.due) return 'open';
  const d = loanDays(loanToday(), l.due);
  return d < 0 ? 'overdue' : d === 0 ? 'today' : d <= 2 ? 'soon' : 'open';
}
function loanOpenCount() { return loans.filter(l => loanVisible(l) && !l.back).length; }

function loanSave(list) {
  loans = list;
  persistState();
  if (typeof renderShoppingList === 'function' && currentView === 'einkauf') renderShoppingList();
}

/* ---------- The tab ---------- */
function loanRender(el) {
  const all = loans.filter(loanVisible);
  const open = all.filter(l => !l.back).sort((a, b) => {
    const ra = { overdue: 0, today: 1, soon: 2, open: 3 }[loanState(a)], rb = { overdue: 0, today: 1, soon: 2, open: 3 }[loanState(b)];
    if (ra !== rb) return ra - rb;
    return (a.due || '9999').localeCompare(b.due || '9999') || (a.date || '').localeCompare(b.date || '');
  });
  const done = all.filter(l => l.back).sort((a, b) => b.back.localeCompare(a.back)).slice(0, 40);
  const card = (l) => {
    const st = loanState(l);
    let badge = '';
    if (st === 'overdue') badge = `<span class="text-[11px] font-medium text-red-600">${escapeHtml(tk('loan.overdueSince', { date: loanDate(l.due) }))}</span>`;
    else if (st === 'today') badge = `<span class="text-[11px] font-medium" style="color:var(--c-mustard)">${escapeHtml(tk('loan.dueToday'))}</span>`;
    else if (l.due && st !== 'done') badge = `<span class="text-[11px] ${st === 'soon' ? 'font-medium' : 'text-ink/50'}"${st === 'soon' ? ' style="color:var(--c-mustard)"' : ''}>${escapeHtml(tk('loan.dueOn', { date: loanDate(l.due) }))}</span>`;
    else if (st === 'done') badge = `<span class="text-[11px] text-pine">${escapeHtml(tk('loan.backOn', { date: loanDate(l.back) }))}</span>`;
    const meta = [l.date ? tk('loan.since', { date: loanDate(l.date) }) : '', l.priv ? '🔒 ' + tk('loan.onlyMe') : ''].filter(Boolean).join(' · ');
    return `<div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-3 flex items-start gap-3${st === 'done' ? ' opacity-60' : ''}" data-loan="${escapeHtml(l.id)}">
      <div class="text-2xl leading-none pt-0.5" aria-hidden="true">${st === 'done' ? '✅' : '🤝'}</div>
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline justify-between gap-2"><span class="font-medium truncate">${escapeHtml(l.thing)}</span>${badge}</div>
        <div class="text-xs text-ink/60 truncate">${escapeHtml(loanWho(l))}</div>
        ${meta ? `<div class="text-[11px] text-ink/45 truncate">${escapeHtml(meta)}</div>` : ''}
        ${l.note ? `<div class="text-xs text-ink/55 mt-1 whitespace-pre-line">${escapeHtml(l.note)}</div>` : ''}
      </div>
      <div class="flex flex-col items-end gap-1.5 shrink-0">
        ${l.back ? '' : `<button type="button" class="px-2.5 py-1 rounded-lg border border-pine text-pine text-xs hover:bg-ink/5 transition" data-loan-back="${escapeHtml(l.id)}">${escapeHtml(tk('loan.gotBack'))}</button>`}
        <button type="button" class="px-2.5 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition" data-loan-edit="${escapeHtml(l.id)}">${escapeHtml(tk('common.edit'))}</button>
      </div>
    </div>`;
  };
  const overdue = open.filter(l => loanState(l) === 'overdue');
  const rest = open.filter(l => loanState(l) !== 'overdue');
  const head = (t, n) => `<div class="text-[11px] uppercase tracking-wide text-ink/40 mb-1.5 mt-4 first:mt-0">${escapeHtml(t)}${n ? ' · ' + n : ''}</div>`;
  let html = '<div class="max-w-2xl">';
  if (!all.length) html += `<p class="text-sm text-ink/45 italic py-6 text-center">${escapeHtml(tk('loan.empty'))}</p>`;
  if (overdue.length) html += head(tk('loan.secOverdue'), overdue.length) + `<div class="flex flex-col gap-2">${overdue.map(card).join('')}</div>`;
  if (rest.length) html += head(tk('loan.secOpen'), rest.length) + `<div class="flex flex-col gap-2">${rest.map(card).join('')}</div>`;
  if (done.length) {
    html += `<button type="button" class="mt-5 text-xs text-ink/50 hover:text-pine transition" data-loan-done-toggle>${loanShowDone ? '▾' : '▸'} ${escapeHtml(tk('loan.secDone'))} (${done.length})</button>`;
    if (loanShowDone) html += `<div class="flex flex-col gap-2 mt-2">${done.map(card).join('')}</div>`;
  }
  html += '</div>';
  el.innerHTML = html;
  el.querySelectorAll('[data-loan-back]').forEach(b => b.addEventListener('click', () => loanMarkBack(b.dataset.loanBack)));
  el.querySelectorAll('[data-loan-edit]').forEach(b => b.addEventListener('click', () => loanOpenEditor(b.dataset.loanEdit)));
  const tg = el.querySelector('[data-loan-done-toggle]');
  if (tg) tg.addEventListener('click', () => { loanShowDone = !loanShowDone; loanRender(el); });
}
function loanMarkBack(id) {
  const l = loanById(id);
  if (!l) return;
  loanSave(loans.map(x => x.id === id ? { ...x, back: loanToday() } : x));
  if (typeof finShowToast === 'function') finShowToast(tk('loan.backDone'));
}

/* ---------- Editor ---------- */
function loanPartyOptions(sel) {
  const opts = members.map(m => `<option value="m:${escapeHtml(m.id)}"${sel && sel.m === m.id ? ' selected' : ''}>${escapeHtml(memberLabel(m))}</option>`).join('');
  return opts + `<option value="x"${sel && !sel.m ? ' selected' : ''}>${escapeHtml(tk('loan.otherPerson'))}</option>`;
}
function loanEnsureModal() {
  if (document.getElementById('loanModal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div id="loanModal" class="hidden fixed inset-0 bg-ink/30 backdrop-blur-sm z-[320] grid place-items-center p-4 sm:p-6">
    <div class="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto fade-in">
      <button id="loanCloseBtn" type="button" class="absolute top-3 right-3 w-7 h-7 rounded-full text-ink/40 hover:text-ink hover:bg-ink/5 transition grid place-items-center text-lg leading-none select-none" aria-label="${escapeHtml(tk('common.close'))}">×</button>
      <h3 id="loanTitle" class="font-serif text-lg mb-4 pr-6"></h3>
      <label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="loanThing">${escapeHtml(tk('loan.thing'))}</label>
      <input id="loanThing" type="text" maxlength="120" autocomplete="off" placeholder="${escapeHtml(tk('loan.thingPh'))}" class="w-full rounded-lg border border-ink/15 px-2.5 py-2 text-sm mb-3" />
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div class="min-w-0"><label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="loanFrom">${escapeHtml(tk('loan.from'))}</label><select id="loanFrom" class="w-full rounded-lg border border-ink/15 px-2.5 py-2 text-sm bg-white"></select>
          <input id="loanFromName" type="text" maxlength="60" autocomplete="off" placeholder="${escapeHtml(tk('loan.otherName'))}" class="hidden w-full rounded-lg border border-ink/15 px-2.5 py-2 text-sm mt-1.5" /></div>
        <div class="min-w-0"><label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="loanTo">${escapeHtml(tk('loan.to'))}</label><select id="loanTo" class="w-full rounded-lg border border-ink/15 px-2.5 py-2 text-sm bg-white"></select>
          <input id="loanToName" type="text" maxlength="60" autocomplete="off" placeholder="${escapeHtml(tk('loan.otherName'))}" class="hidden w-full rounded-lg border border-ink/15 px-2.5 py-2 text-sm mt-1.5" /></div>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div class="min-w-0"><label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="loanDate">${escapeHtml(tk('loan.lentOn'))}</label><input id="loanDate" type="date" class="w-full rounded-lg border border-ink/15 px-2.5 py-2 text-sm" /></div>
        <div class="min-w-0"><label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="loanDue">${escapeHtml(tk('loan.dueBy'))}</label><input id="loanDue" type="date" class="w-full rounded-lg border border-ink/15 px-2.5 py-2 text-sm" /></div>
      </div>
      <div id="loanRemindBox" class="mb-3">
        <label class="flex items-center gap-2 text-sm"><input id="loanRemind" type="checkbox" checked />${escapeHtml(tk('loan.remind'))}</label>
        <div id="loanAgainWrap" class="mt-2">
          <label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="loanAgain">${escapeHtml(tk('loan.again'))}</label>
          <select id="loanAgain" class="w-full rounded-lg border border-ink/15 px-2.5 py-2 text-sm bg-white">
            <option value="1">${escapeHtml(tk('loan.againDaily'))}</option><option value="3">${escapeHtml(tk('loan.again3'))}</option><option value="7">${escapeHtml(tk('loan.againWeekly'))}</option>
          </select>
        </div>
        <p class="text-[11px] text-ink/45 mt-1.5">${escapeHtml(tk('loan.remindHint'))}</p>
      </div>
      <label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="loanNote">${escapeHtml(tk('loan.note'))}</label>
      <textarea id="loanNote" rows="2" maxlength="500" class="w-full rounded-lg border border-ink/15 px-2.5 py-2 text-sm mb-3"></textarea>
      <label class="flex items-center gap-2 text-sm mb-3"><input id="loanPriv" type="checkbox" />${escapeHtml(tk('loan.private'))}</label>
      <div id="loanBackWrap" class="mb-3"><label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="loanBack">${escapeHtml(tk('loan.backOnLabel'))}</label><input id="loanBack" type="date" class="w-full rounded-lg border border-ink/15 px-2.5 py-2 text-sm" /></div>
      <p id="loanError" class="hidden text-xs text-red-500 mb-2"></p>
      <div class="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-ink/10">
        <button id="loanDeleteBtn" type="button" class="hidden px-3 py-2 rounded-lg border border-red-300 text-sm text-red-500 hover:bg-red-50 transition">${escapeHtml(tk('common.delete'))}</button>
        <span class="flex-1"></span>
        <button id="loanCancelBtn" type="button" class="px-3 py-2 rounded-lg border border-ink/15 text-sm text-ink/60 hover:bg-ink/5 transition">${escapeHtml(tk('common.cancel'))}</button>
        <button id="loanSaveBtn" type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium transition">${escapeHtml(tk('common.save'))}</button>
      </div>
    </div></div>`;
  document.body.appendChild(wrap.firstElementChild);
  const byId = (id) => document.getElementById(id);
  const toggleName = (sel, name) => { byId(name).classList.toggle('hidden', byId(sel).value !== 'x'); };
  byId('loanFrom').addEventListener('change', () => toggleName('loanFrom', 'loanFromName'));
  byId('loanTo').addEventListener('change', () => toggleName('loanTo', 'loanToName'));
  const syncRemind = () => {
    const on = !!byId('loanDue').value;
    byId('loanRemindBox').classList.toggle('hidden', !on);
    byId('loanAgainWrap').classList.toggle('hidden', !byId('loanRemind').checked);
  };
  byId('loanDue').addEventListener('input', syncRemind);
  byId('loanDue').addEventListener('change', syncRemind);
  byId('loanRemind').addEventListener('change', syncRemind);
  byId('loanCloseBtn').addEventListener('click', () => attemptCloseModal('loanModal', loanCloseEditor));
  byId('loanCancelBtn').addEventListener('click', () => attemptCloseModal('loanModal', loanCloseEditor));
  byId('loanSaveBtn').addEventListener('click', loanSaveEditor);
  byId('loanDeleteBtn').addEventListener('click', loanDeleteEditor);
  wireModalOutsideClick('loanModal', loanCloseEditor);
  byId('loanModal')._sync = syncRemind;
}
function loanCloseEditor() { document.getElementById('loanModal').classList.add('hidden'); }
function loanOpenEditor(id) {
  loanEnsureModal();
  const l = id ? loanById(id) : null;
  loanEditing = l ? l.id : '';
  const byId = (x) => document.getElementById(x);
  const me = loanMeId();
  const from = l ? l.from : (me ? { m: me } : { n: '' });
  const to = l ? l.to : { n: '' };
  byId('loanTitle').textContent = l ? tk('loan.edit') : tk('loan.new');
  byId('loanThing').value = l ? l.thing : '';
  byId('loanFrom').innerHTML = loanPartyOptions(from);
  byId('loanTo').innerHTML = loanPartyOptions(to);
  byId('loanFromName').value = from.m ? '' : (from.n || '');
  byId('loanToName').value = to.m ? '' : (to.n || '');
  byId('loanFromName').classList.toggle('hidden', !!from.m);
  byId('loanToName').classList.toggle('hidden', !!to.m);
  byId('loanDate').value = l ? (l.date || '') : loanToday();
  byId('loanDue').value = l ? (l.due || '') : '';
  byId('loanRemind').checked = l ? l.remind !== false : true;
  byId('loanAgain').value = String(l && LOAN_AGAIN.includes(l.again) ? l.again : 3);
  byId('loanNote').value = l ? (l.note || '') : '';
  byId('loanPriv').checked = !!(l && l.priv);
  byId('loanBack').value = l ? (l.back || '') : '';
  byId('loanBackWrap').classList.toggle('hidden', !l);
  byId('loanDeleteBtn').classList.toggle('hidden', !l);
  byId('loanError').classList.add('hidden');
  byId('loanModal')._sync();
  byId('loanModal').classList.remove('hidden');
  armModalSnapshot('loanModal');
}
function loanSaveEditor() {
  const byId = (x) => document.getElementById(x);
  const err = (key) => { const e = byId('loanError'); e.textContent = tk(key); e.classList.remove('hidden'); };
  const thing = byId('loanThing').value.trim();
  if (!thing) return err('loan.err.thing');
  const party = (sel, name) => {
    const v = byId(sel).value;
    if (v === 'x') return { n: byId(name).value.trim().slice(0, 60) };
    return { m: v.slice(2) };
  };
  const from = party('loanFrom', 'loanFromName'), to = party('loanTo', 'loanToName');
  if ((!from.m && !from.n) || (!to.m && !to.n)) return err('loan.err.name');
  if (!from.m && !to.m) return err('loan.err.member');
  if (from.m && to.m && from.m === to.m) return err('loan.err.same');
  const date = byId('loanDate').value || loanToday();
  const due = byId('loanDue').value || '';
  if (due && due < date) return err('loan.err.dueBefore');
  const old = loanEditing ? loanById(loanEditing) : null;
  const u = currentUser();
  const rec = {
    id: old ? old.id : newRecordId(), thing: thing.slice(0, 120), from, to, date, due,
    again: Number(byId('loanAgain').value) || 3, remind: !!due && byId('loanRemind').checked,
    priv: byId('loanPriv').checked, back: loanEditing ? (byId('loanBack').value || '') : '',
    note: byId('loanNote').value.trim().slice(0, 500),
    by: old ? (old.by || '') : ((u && u.id) || ''), created: old ? (old.created || '') : new Date().toISOString(),
  };
  loanSave(old ? loans.map(x => x.id === old.id ? rec : x) : loans.concat(rec));
  loanCloseEditor();
}
function loanDeleteEditor() {
  if (!loanEditing || !confirm(tk('loan.confirmDelete'))) return;
  loanSave(loans.filter(x => x.id !== loanEditing));
  loanCloseEditor();
}

(window.PINN_PARTS = window.PINN_PARTS || []).push('ausleihe');

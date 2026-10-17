/* pinn. – Household: take turns & fairness (js/reihum.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the "take turns" setting in the cleaning and bin popups (hhRotateEls, hhRotateUi, hhRotateLoad,
   hhRotateValue) and the card "Who does how much?" on the household page (renderHouseholdFairness, hhFairRender,
   period chips 30/90/365 days). The rotation itself happens on the server (pb_hooks/pinn-aufgaben.js). */

/* ==========================================================
   Household: take turns & "Who does how much?"
   ----------------------------------------------------------
   - Cleaning tasks (roomSchedules) and bins (trashBins) with at least two people responsible can get
     rotate = 'reihum' (in order) or 'fair' (whoever did the least in the last 30 days).
     The server (pinn-aufgaben.js) then assigns every new task to exactly one person;
     whoever misses a task stays up.
   - The statistics come from the server (/api/pinn/aufgaben/statistik, collection "haushalt_verlauf"), because
     completed tasks are deleted after 2 days at the latest. They are only queried when the
     household page is opened (at most once per minute).
   ========================================================== */
function hhRotateEls(containerId) {
  const p = containerId === 'trashBinMemberPicker' ? 'trashBin' : 'roomSchedule';
  return { wrap: document.getElementById(p + 'RotateWrap'), box: document.getElementById(p + 'Rotate'), mode: document.getElementById(p + 'RotateMode') };
}
function hhRotateUi(containerId) {
  const el = hhRotateEls(containerId);
  if (!el.wrap) return;
  el.wrap.classList.toggle('hidden', pendingHouseholdAssignedIds.length < 2);
  el.mode.classList.toggle('hidden', !el.box.checked);
}
function hhRotateLoad(containerId, val) {
  const el = hhRotateEls(containerId);
  if (!el.wrap) return;
  el.box.checked = val === 'reihum' || val === 'fair';
  el.mode.value = val === 'fair' ? 'fair' : 'reihum';
  hhRotateUi(containerId);
}
function hhRotateValue(containerId) {
  const el = hhRotateEls(containerId);
  if (!el.wrap || pendingHouseholdAssignedIds.length < 2 || !el.box.checked) return '';
  return el.mode.value === 'fair' ? 'fair' : 'reihum';
}
['trashBinMemberPicker', 'roomScheduleMemberPicker'].forEach(id => {
  const el = hhRotateEls(id);
  if (el.box) el.box.addEventListener('change', () => hhRotateUi(id));
});

const HH_FAIR_DAYS = [[30, '30 Tage'], [90, '90 Tage'], [365, '1 Jahr']];
let hhFairDays = 30;
let hhFairCache = null;     // { days, at, data }
let hhFairLoading = false;
let hhFairFailed = false;   // Server without statistics (older pinn-aufgaben.js) – the card stays hidden
async function renderHouseholdFairness(force) {
  const el = document.getElementById('hhFairCard');
  if (!el) return;
  if ((!roomSchedules.length && !trashBins.length) || hhFairFailed || isCurrentUserGuest()) { el.innerHTML = ''; return; }
  const have = hhFairCache && hhFairCache.days === hhFairDays;
  if (have) hhFairRender(hhFairCache.data);
  if (have && !force && Date.now() - hhFairCache.at < 60000) return;
  if (hhFairLoading || !navigator.onLine) return;
  hhFairLoading = true;
  try {
    const res = await apiFetch('/api/pinn/aufgaben/statistik?tage=' + hhFairDays, { cache: 'no-store' });
    if (res.status === 404) { hhFairFailed = true; el.innerHTML = ''; return; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error || !body.mitglieder) { if (!have) el.innerHTML = ''; return; }
    hhFairCache = { days: hhFairDays, at: Date.now(), data: body };
    hhFairRender(body);
  } catch (e) {
    if (!have) el.innerHTML = '';
  } finally {
    hhFairLoading = false;
  }
}
function hhFairRender(d) {
  const el = document.getElementById('hhFairCard');
  if (!el) return;
  const per = d.mitglieder || {};
  const inRule = new Set();
  [...roomSchedules, ...trashBins].forEach(r => (r.assignedMemberIds || []).forEach(id => inRule.add(id)));
  const rows = members.map(m => ({ m, s: per[m.id] || {} }))
    .filter(x => (x.s.erledigt || x.s.verpasst || x.s.offen) || inRule.has(x.m.id));
  const total = rows.reduce((s, r) => s + (r.s.erledigt || 0), 0);
  const max = Math.max(1, ...rows.map(r => r.s.erledigt || 0));
  rows.sort((a, b) => (b.s.erledigt || 0) - (a.s.erledigt || 0) || memberLabel(a.m).localeCompare(memberLabel(b.m)));
  const rowsHtml = rows.map(r => {
    const done = r.s.erledigt || 0;
    const share = total ? Math.round(done / total * 100) : 0;
    const color = (!r.m.color || r.m.color === 'transparent') ? 'var(--c-pine)' : r.m.color;
    return `<div class="hh-fair-row">
      <span class="w-8 h-8 rounded-full overflow-hidden border-2 shrink-0" style="border-color:${memberBorderColor(r.m)}">${memberAvatarInnerHTML(r.m)}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-sm truncate" data-no-i18n>${escapeHtml(memberLabel(r.m))}</span>
          <span class="text-xs text-ink/50 shrink-0"><b class="text-ink" data-no-i18n>${done}</b> <span>erledigt</span>${r.s.verpasst ? ` · <span data-no-i18n>${r.s.verpasst}</span> <span>verpasst</span>` : ''}${total ? ` · <span data-no-i18n>${share} %</span>` : ''}</span>
        </div>
        <div class="hh-fair-bar"><span style="width:${done / max * 100}%;background:${escapeHtml(color)}"></span></div>
      </div>
    </div>`;
  }).join('');
  const rules = (d.regeln || []).map(r => {
    const now = r.jetzt ? memberById(r.jetzt) : null;
    const next = r.naechster ? memberById(r.naechster) : null;
    if (!now && !next) return '';
    return `<div class="hh-fair-rule">
      <span class="flex-1 min-w-0 truncate" data-no-i18n>🔄 ${escapeHtml(r.titel || '')}</span>
      <span class="shrink-0 text-ink/55">${now ? `<span>dran:</span> <b class="text-ink" data-no-i18n>${escapeHtml(memberLabel(now))}</b>` : ''}${now && next ? ' · ' : ''}${next ? `<span>danach:</span> <b class="text-ink" data-no-i18n>${escapeHtml(memberLabel(next))}</b>` : ''}</span>
    </div>`;
  }).join('');
  const chips = HH_FAIR_DAYS.map(([n, label]) => `<button type="button" class="hh-fair-chip${n === hhFairDays ? ' active' : ''}" data-days="${n}">${label}</button>`).join('');
  el.innerHTML = `<div class="hh-fair rounded-xl border border-ink/10 p-3">
    <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
      <span class="font-serif text-base">⚖️ Wer macht wie viel?</span>
      <span class="flex gap-1">${chips}</span>
    </div>
    ${total || rows.some(r => r.s.verpasst) ? rowsHtml : '<p class="text-xs text-ink/40 italic">In diesem Zeitraum wurde noch keine Haushaltsaufgabe erledigt.</p>'}
    ${rules ? `<div class="hh-fair-rules">${rules}</div>` : ''}
  </div>`;
  el.querySelectorAll('.hh-fair-chip').forEach(b => b.addEventListener('click', () => {
    hhFairDays = Number(b.dataset.days) || 30;
    renderHouseholdFairness(true);
  }));
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('reihum');

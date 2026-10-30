/* pinn. – Voice control (js/sprachsteuerung.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: Settings → Voice control – load and show the personal secret link (loadVoiceSettings,
   renderVoiceSettings), create or renew it, switch it off and try a sentence (voiceSetup, voiceOff, voiceTest).
   The settings load when the section is opened. The server side is pb_hooks/sprache.pb.js + pinn-sprache.js. */

/* ==========================================================
   Voice control (Settings → Voice control, pb_hooks/sprache.pb.js + pinn-sprache.js)
   ----------------------------------------------------------
   On request every profile gets its own secret link. A Siri shortcut (or on Android the app
   "HTTP Shortcuts") sends the spoken sentence there, the server understands it (German, English,
   French, Spanish) and answers with a sentence to be read aloud:
   - "Milk and two packs of eggs on the shopping list (at Rewe)"
   - "What's on the shopping list?"
   - "Remind me about the bins tomorrow" / "Task: clean the windows on Saturday"
   - "What's on today?" / "What's on tomorrow?"
   The link works like a password for exactly these commands. Guests have no voice control;
   profiles with child lock can only ask, not create anything.
   ========================================================== */
let voiceState = null;
function voiceLink(token) { return location.origin + '/api/pinn/sprache?token=' + encodeURIComponent(token); }
async function loadVoiceSettings() {
  const box = document.getElementById('voiceSettingsBody');
  if (!box) return;
  if (isCurrentUserGuest()) { box.innerHTML = ('<p class="text-xs text-ink/50">' + tk('smart.notForGuests') + '</p>'); return; }
  try {
    const res = await apiFetch('/api/pinn/sprache/status', { method: 'GET' });
    if (res.status === 404) throw new Error(tk('voice.hookMissing'));
    voiceState = await res.json();
  } catch (err) {
    voiceState = { error: err.message || tk('fin.err.server') };
  }
  renderVoiceSettings();
}
function renderVoiceSettings() {
  const box = document.getElementById('voiceSettingsBody');
  if (!box) return;
  const st = voiceState || {};
  if (st.error) { box.innerHTML = `<p class="text-xs text-red-500">${escapeHtml(st.error)}</p>`; return; }
  const examples = [tk('voice.addMilkEggsShopping'), tk('voice.addTwoPacksPasta'), tk('voice.whatsShoppingList'), tk('voice.remindMeTakeOut'), tk('voice.whatsToday')];
  const exHtml = `<div class="rounded-xl bg-ink/5 p-3"><p class="text-xs font-medium mb-1">${tk('voice.whatPinnUnderstands')}</p><div class="flex flex-col gap-0.5 text-[11px] text-ink/60">${examples.map(x => `<span>${escapeHtml(x)}</span>`).join('')}</div><p class="text-[11px] text-ink/45 mt-1.5">${tk('voice.alsoGermanFrenchSpanish')}</p></div>`;
  if (!st.aktiv) {
    box.innerHTML = `
      <p class="text-xs text-ink/60">${tk('voice.sayHeySiriPinn')}</p>
      ${exHtml}
      <button type="button" id="voiceSetupBtn" class="self-start px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90 transition">${tk('voice.setUpVoiceControl')}</button>
      ${st.kind ? ('<p class="text-[11px] text-ink/45">' + tk('voice.childLockListDaily') + '</p>') : ''}`;
    document.getElementById('voiceSetupBtn').addEventListener('click', () => voiceSetup(false));
    return;
  }
  const link = voiceLink(st.token);
  box.innerHTML = `
    <p class="text-xs text-ink/60">${tk('voice.personalLinkWorksLike')}</p>
    <div class="flex items-center gap-2">
      <input id="voiceLinkInput" type="text" readonly class="flex-1 min-w-0 rounded-lg border border-ink/15 px-3 py-2 text-xs bg-ink/5" value="${escapeHtml(link)}" />
      <button type="button" id="voiceCopyBtn" class="shrink-0 px-3 py-2 rounded-lg border border-ink/15 text-xs hover:border-pine hover:text-pine transition">${tk('common.copy')}</button>
    </div>
    <details class="rounded-xl border border-ink/10 bg-white p-3" open>
      <summary class="text-sm font-medium cursor-pointer">${escapeHtml(tk('voice.iosTitle'))}</summary>
      <ol class="text-[12px] text-ink/70 leading-relaxed mt-2 list-decimal pl-5 flex flex-col gap-1">
        <li>${tk('voice.ios1')}</li>
        <li>${tk('voice.ios2')}</li>
        <li>${tk('voice.ios3')}</li>
        <li>${tk('voice.ios4')}</li>
        <li>${tk('voice.ios5')}</li>
      </ol>
    </details>
    <details class="rounded-xl border border-ink/10 bg-white p-3">
      <summary class="text-sm font-medium cursor-pointer">🤖 Android</summary>
      <ol class="text-[12px] text-ink/70 leading-relaxed mt-2 list-decimal pl-5 flex flex-col gap-1">
        <li>${tk('voice.and1')}</li>
        <li>${tk('voice.and2', { var: escapeHtml(tk('voice.inputVar')), code: '<code class="text-[11px]">{"text": "{{' + escapeHtml(tk('voice.inputVar')) + '}}"}</code>' })}</li>
        <li>${tk('voice.and3')}</li>
      </ol>
    </details>
    ${exHtml}
    <p class="text-[11px] text-ink/45">${escapeHtml(tk('voice.onTheGo'))}${st.kind ? ' ' + escapeHtml(tk('voice.childLockListDaily')) : ''}</p>
    <div class="flex flex-wrap gap-2">
      <button type="button" id="voiceTestBtn" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs hover:border-pine hover:text-pine transition">${tk('voice.try')}</button>
      <button type="button" id="voiceRenewBtn" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs hover:border-pine hover:text-pine transition">${tk('smart.newLink')}</button>
      <button type="button" id="voiceOffBtn" class="px-3 py-1.5 rounded-lg text-xs text-red-600 hover:bg-red-50 transition">${tk('smart.service.turnOff')}</button>
    </div>
    <p id="voiceTestOut" class="hidden text-xs rounded-lg bg-pine/10 text-pine px-3 py-2"></p>`;
  document.getElementById('voiceCopyBtn').addEventListener('click', async () => {
    const ok = await copyTextRobust(link);
    finShowToast(ok === false ? tk('voice.copyingNotPossiblePlease') : tk('voice.linkCopied'));
  });
  document.getElementById('voiceRenewBtn').addEventListener('click', () => {
    if (confirm(tk('voice.createNewLinkOld'))) voiceSetup(true);
  });
  document.getElementById('voiceOffBtn').addEventListener('click', voiceOff);
  document.getElementById('voiceTestBtn').addEventListener('click', voiceTest);
}
async function voiceSetup(renew) {
  try {
    const res = await apiFetch('/api/pinn/sprache/einrichten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ neu: !!renew }) });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || tk('common.error'));
    voiceState = data;
    renderVoiceSettings();
    finShowToast(renew ? tk('voice.newLinkCreated') : tk('voice.voiceControlSetUp'));
  } catch (err) { alert((tk('voice.voiceControl') + ' ') + (err.message || tk('fin.err.server'))); }
}
async function voiceOff() {
  if (!confirm(tk('voice.turnOffVoiceControl'))) return;
  try {
    const res = await apiFetch('/api/pinn/sprache/ausschalten', { method: 'POST' });
    voiceState = await res.json();
    renderVoiceSettings();
  } catch (err) { alert((tk('voice.voiceControl') + ' ') + (err.message || tk('fin.err.server'))); }
}
async function voiceTest() {
  const text = prompt(tk('voice.whatWouldLikeSay'), tk('voice.whatsToday2'));
  if (!text) return;
  const out = document.getElementById('voiceTestOut');
  try {
    const res = await fetch(voiceLink(voiceState.token) + '&json=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    const data = await res.json();
    out.textContent = '🗣️ ' + (data.antwort || data.error || '–');
    out.classList.remove('hidden');
    // Changes (list, tasks) reach all devices through the normal sync
  } catch (err) {
    out.textContent = '⚠️ ' + (err.message || tk('fin.err.server'));
    out.classList.remove('hidden');
  }
}
document.addEventListener('toggle', (e) => {
  if (e.target && e.target.id === 'settingsVoiceAccordion' && e.target.open) loadVoiceSettings();
}, true);

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('sprachsteuerung');

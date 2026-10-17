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
  if (isCurrentUserGuest()) { box.innerHTML = '<p class="text-xs text-ink/50">Für Gastkonten nicht verfügbar.</p>'; return; }
  try {
    const res = await apiFetch('/api/pinn/sprache/status', { method: 'GET' });
    if (res.status === 404) throw new Error('pb_hooks/sprache.pb.js fehlt auf dem Server');
    voiceState = await res.json();
  } catch (err) {
    voiceState = { error: err.message || 'Server nicht erreichbar' };
  }
  renderVoiceSettings();
}
function renderVoiceSettings() {
  const box = document.getElementById('voiceSettingsBody');
  if (!box) return;
  const st = voiceState || {};
  if (st.error) { box.innerHTML = `<p class="text-xs text-red-500">${escapeHtml(st.error)}</p>`; return; }
  const examples = ['„Milch und Eier auf die Einkaufsliste“', '„Zwei Packungen Nudeln auf die Liste bei Rewe“', '„Was steht auf der Einkaufsliste?“', '„Erinnere mich morgen an den Müll“', '„Was steht heute an?“'];
  const exHtml = `<div class="rounded-xl bg-ink/5 p-3"><p class="text-xs font-medium mb-1">Das versteht pinn.</p><div class="flex flex-col gap-0.5 text-[11px] text-ink/60">${examples.map(x => `<span>${escapeHtml(x)}</span>`).join('')}</div><p class="text-[11px] text-ink/45 mt-1.5">Auch auf Englisch, Französisch und Spanisch. Die Antwort kommt in deiner Sprache.</p></div>`;
  if (!st.aktiv) {
    box.innerHTML = `
      <p class="text-xs text-ink/60">Sag „Hey Siri, pinn“ und sprich einfach drauflos: Sachen auf die Einkaufsliste setzen, Aufgaben anlegen oder fragen, was heute ansteht. Dafür bekommt dein Profil einen persönlichen, geheimen Link.</p>
      ${exHtml}
      <button type="button" id="voiceSetupBtn" class="self-start px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90 transition">🎙️ Sprachsteuerung einrichten</button>
      ${st.kind ? '<p class="text-[11px] text-ink/45">Mit Kindersicherung lassen sich Liste und Tagesüberblick nur abfragen.</p>' : ''}`;
    document.getElementById('voiceSetupBtn').addEventListener('click', () => voiceSetup(false));
    return;
  }
  const link = voiceLink(st.token);
  box.innerHTML = `
    <p class="text-xs text-ink/60">Dein persönlicher Link – er wirkt wie ein Passwort für diese Befehle, also nicht weitergeben.</p>
    <div class="flex items-center gap-2">
      <input id="voiceLinkInput" type="text" readonly class="flex-1 min-w-0 rounded-lg border border-ink/15 px-3 py-2 text-xs bg-ink/5" value="${escapeHtml(link)}" />
      <button type="button" id="voiceCopyBtn" class="shrink-0 px-3 py-2 rounded-lg border border-ink/15 text-xs hover:border-pine hover:text-pine transition">Kopieren</button>
    </div>
    <details class="rounded-xl border border-ink/10 bg-white p-3" open>
      <summary class="text-sm font-medium cursor-pointer">📱 iPhone &amp; iPad: Siri-Kurzbefehl</summary>
      <ol class="text-[12px] text-ink/70 leading-relaxed mt-2 list-decimal pl-5 flex flex-col gap-1">
        <li>Link oben kopieren und die App <b>Kurzbefehle</b> öffnen → <b>+</b> (neuer Kurzbefehl).</li>
        <li>Aktion <b>„Text diktieren“</b> hinzufügen.</li>
        <li>Aktion <b>„Inhalte von URL abrufen“</b> hinzufügen, den Link als URL einfügen, auf den Pfeil tippen: Methode <b>POST</b>, Anfragetext <b>JSON</b>, neues Feld <b>Text</b> mit dem Schlüssel <b>text</b> und als Wert „Diktierter Text“.</li>
        <li>Aktion <b>„Text sprechen“</b> mit „Inhalte der URL“ hinzufügen.</li>
        <li>Den Kurzbefehl <b>pinn</b> nennen. Jetzt reicht „Hey Siri, pinn“ – Siri fragt nach, du sagst, was du möchtest.</li>
      </ol>
    </details>
    <details class="rounded-xl border border-ink/10 bg-white p-3">
      <summary class="text-sm font-medium cursor-pointer">🤖 Android</summary>
      <ol class="text-[12px] text-ink/70 leading-relaxed mt-2 list-decimal pl-5 flex flex-col gap-1">
        <li>Die kostenlose App <b>HTTP Shortcuts</b> aus dem Play Store installieren.</li>
        <li>Neuen Shortcut anlegen: Methode <b>POST</b>, URL = Link oben, Anfragetext <b>JSON</b>: <code class="text-[11px]">{"text": "{{Eingabe}}"}</code> – dabei eine Variable „Eingabe“ vom Typ <b>Texteingabe</b> anlegen (mit dem Mikrofon der Tastatur sprechen).</li>
        <li>Unter „Antwort“ <b>als Dialog anzeigen</b> wählen und den Shortcut auf den Startbildschirm legen.</li>
      </ol>
    </details>
    ${exHtml}
    <p class="text-[11px] text-ink/45">Unterwegs muss das Handy pinn. erreichen können – also im WLAN zu Hause oder mit eingeschaltetem VPN.${st.kind ? ' Mit Kindersicherung lassen sich Liste und Tagesüberblick nur abfragen.' : ''}</p>
    <div class="flex flex-wrap gap-2">
      <button type="button" id="voiceTestBtn" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs hover:border-pine hover:text-pine transition">▶ Ausprobieren</button>
      <button type="button" id="voiceRenewBtn" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs hover:border-pine hover:text-pine transition">Neuen Link erzeugen</button>
      <button type="button" id="voiceOffBtn" class="px-3 py-1.5 rounded-lg text-xs text-red-600 hover:bg-red-50 transition">Ausschalten</button>
    </div>
    <p id="voiceTestOut" class="hidden text-xs rounded-lg bg-pine/10 text-pine px-3 py-2"></p>`;
  document.getElementById('voiceCopyBtn').addEventListener('click', async () => {
    const ok = await copyTextRobust(link);
    finShowToast(ok === false ? 'Kopieren nicht möglich – bitte den Link markieren.' : 'Link kopiert.');
  });
  document.getElementById('voiceRenewBtn').addEventListener('click', () => {
    if (confirm('Neuen Link erzeugen? Der alte funktioniert danach nicht mehr – der Kurzbefehl muss angepasst werden.')) voiceSetup(true);
  });
  document.getElementById('voiceOffBtn').addEventListener('click', voiceOff);
  document.getElementById('voiceTestBtn').addEventListener('click', voiceTest);
}
async function voiceSetup(renew) {
  try {
    const res = await apiFetch('/api/pinn/sprache/einrichten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ neu: !!renew }) });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Fehler');
    voiceState = data;
    renderVoiceSettings();
    finShowToast(renew ? 'Neuer Link erzeugt.' : 'Sprachsteuerung eingerichtet.');
  } catch (err) { alert('Sprachsteuerung: ' + (err.message || 'Server nicht erreichbar')); }
}
async function voiceOff() {
  if (!confirm('Sprachsteuerung ausschalten? Der Link funktioniert danach nicht mehr.')) return;
  try {
    const res = await apiFetch('/api/pinn/sprache/ausschalten', { method: 'POST' });
    voiceState = await res.json();
    renderVoiceSettings();
  } catch (err) { alert('Sprachsteuerung: ' + (err.message || 'Server nicht erreichbar')); }
}
async function voiceTest() {
  const text = prompt('Was möchtest du sagen?', 'Was steht heute an?');
  if (!text) return;
  const out = document.getElementById('voiceTestOut');
  try {
    const res = await fetch(voiceLink(voiceState.token) + '&json=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    const data = await res.json();
    out.textContent = '🗣️ ' + (data.antwort || data.error || '–');
    out.classList.remove('hidden');
    // Changes (list, tasks) reach all devices through the normal sync
  } catch (err) {
    out.textContent = '⚠️ ' + (err.message || 'Server nicht erreichbar');
    out.classList.remove('hidden');
  }
}
document.addEventListener('toggle', (e) => {
  if (e.target && e.target.id === 'settingsVoiceAccordion' && e.target.open) loadVoiceSettings();
}, true);

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('sprachsteuerung');

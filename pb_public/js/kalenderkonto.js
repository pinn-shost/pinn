/* pinn. – js/kalenderkonto.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded first of the files in js/, right before js/finanzen.js (js/ausblick.js stays last and
   starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.59.0, only the comments were translated):
   - Settings → Home (Zuhause) – the family's address with suggestions, taking over the old weather
     location, own location on request, public holidays & school holidays (home…)
   - Settings → Calendar → waste calendar (Müllkalender) – search by place/street, link or file,
     waste types, refresh and remove (muell…)
   - Google Calendar (Android) – connect/remove, return from the Google sign-in (googleReturnFromUrl,
     called by bootApp in js/appstart.js)
   - Apple calendar account – Apple ID and app-specific password of the family, status of iCloud and
     Google, calendar selection with colours and the task calendar, full resync (appleCalendarModal,
     openCalendarModal, triggerFullCalendarResync)
   - Settings → Calendar (add calendar) – own iCloud/Google accounts per profile, calendars „Für mich“
     or „Familie“, calendars only on the pinn. server, the form „Kalender hinzufügen“ /
     „Kalender bearbeiten“ (pinnCal…, openPinnCalModal, pinnCalGoogleReturn)
   67 functions and 25 variables. index.html only calls these functions later (when the user acts or from
   bootApp), never while it is still loading – that is why this file may come after the inline script.
   50 statements run while this file loads: they only attach event listeners to elements of the
   settings page and the calendar forms (including wireModalOutsideClick for #appleCalendarModal);
   no timers, no calls into other files in js/. */

/* ==========================================================
   Apple calendar account & calendar selection (settings)
   ========================================================== */
/* ---------- Settings → Home (Zuhause) ---------- */
var homeSugTimer = null;
var homeSugSeq = 0;
var homeSugHits = [];

function homeSetStatus(text, err) {
  const el = document.getElementById('homeStatus');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('err', !!err);
}
function renderHomeSettings() {
  const card = document.getElementById('homeCard');
  if (!card) return;
  const guest = isCurrentUserGuest();
  const canEdit = homeCanEdit && !guest && !homeServerMissing;
  if (homeServerMissing) {
    card.innerHTML = `<div class="home-card-title">Server-Teil fehlt</div><div class="home-card-sub">pb_hooks/zuhause.pb.js und pinn-zuhause.js sind auf dem NAS noch nicht eingespielt.</div>`;
  } else if (homeInfo) {
    const sun = homeSunLine();
    card.innerHTML = `<div class="home-card-title">🏠 ${escapeHtml(homeInfo.titel || 'Zuhause')}</div>
      <div class="home-card-sub">${escapeHtml([homeInfo.zusatz, homeInfo.bundeslandName && !String(homeInfo.zusatz || '').includes(homeInfo.bundeslandName) ? homeInfo.bundeslandName : ''].filter(Boolean).join(' · '))}</div>
      ${sun ? `<div class="home-card-sun">Heute: ${sun}</div>` : ''}`;
  } else {
    card.innerHTML = `<div class="home-card-title">Noch kein Zuhause festgelegt</div>
      <div class="home-card-sub">${canEdit ? 'Adresse eingeben und einen Vorschlag antippen – oder einmalig den aktuellen Standort übernehmen.' : 'Das Zuhause kann ein Admin deiner Familie festlegen.'}</div>`;
  }
  document.getElementById('homeEditBox').classList.toggle('hidden', !canEdit);
  const input = document.getElementById('homeAddressInput');
  input.placeholder = homeInfo ? 'Neue Adresse eingeben …' : 'Adresse eingeben, z. B. Hauptstraße 5, Köln';
  document.getElementById('homeRemoveBtn').classList.toggle('hidden', !homeInfo);
  // Take over the previous weather location once
  const mig = document.getElementById('homeMigrateBtn');
  const wl = weatherLocation;
  const canMigrate = !homeInfo && wl && wl.lat != null && wl.lon != null;
  mig.classList.toggle('hidden', !canMigrate);
  if (canMigrate) mig.textContent = `🌤️ Bisherigen Wetter-Ort übernehmen${wl.label ? ' (' + wl.label + ')' : ''}`;

  const sel = document.getElementById('homeStateSelect');
  const bl = homeBundesland();
  sel.innerHTML = `<option value="">– ${bl ? 'keins' : 'bitte wählen'} –</option>` +
    Object.keys(HOME_LAENDER).map(k => `<option value="${k}"${k === bl ? ' selected' : ''}>${escapeHtml(HOME_LAENDER[k])}</option>`).join('');
  sel.disabled = !canEdit;
  const o = homeOptions || {};
  const hol = document.getElementById('homeShowHolidays');
  const sch = document.getElementById('homeShowSchool');
  hol.checked = o.feiertage !== false;
  sch.checked = o.ferien !== false;
  // Public holidays & school holidays live under Settings → Calendar and need the family's home
  const calOk = !!homeInfo && !homeServerMissing;
  sel.disabled = hol.disabled = sch.disabled = !canEdit || !calOk;
  document.getElementById('homeCalOptions').classList.toggle('set-disabled', !calOk);
  const hint = document.getElementById('homeCalHint');
  if (homeServerMissing) {
    hint.className = 'set-hint';
    hint.innerHTML = '<span>⚠️</span><span>Für Feiertage und Schulferien fehlt auf dem NAS noch der Server-Teil fürs Zuhause (pb_hooks/zuhause.pb.js).</span>';
  } else if (!calOk) {
    hint.className = 'set-hint';
    hint.innerHTML = `<span>🏠</span><span>Feiertage und Schulferien richten sich nach eurem Bundesland. Um sie zu nutzen, bitte zuerst unter <b>Zuhause</b> eure Adresse angeben${canEdit ? '' : ' – das kann ein Admin eurer Familie'}.</span>${canEdit ? '<button type="button" class="set-hint-btn" data-open-home>Zuhause angeben</button>' : ''}`;
  } else {
    hint.className = 'set-hint ok';
    hint.innerHTML = `<span>🏠</span><span>Grundlage ist euer Zuhause${homeInfo.bundeslandName ? ' (' + escapeHtml(homeInfo.bundeslandName) + ')' : ''} – das Bundesland lässt sich hier ändern.</span>`;
  }
  try { renderMuellSettings(); } catch (e) { /* waste calendar not built yet */ }
}
function homeSetCalStatus(text, err) {
  const el = document.getElementById('homeCalStatus');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('err', !!err);
}
// „Zuhause angeben“ in the calendar section: open the home section and scroll to it
document.getElementById('homeCalHint').addEventListener('click', (ev) => {
  if (!ev.target.closest('[data-open-home]')) return;
  const det = document.getElementById('homeSettingsAccordion');
  if (!det) return;
  det.open = true;
  setTimeout(() => {
    try { det.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { det.scrollIntoView(); }
    const inp = document.getElementById('homeAddressInput');
    if (inp && !document.getElementById('homeEditBox').classList.contains('hidden') && !window.matchMedia('(pointer: coarse)').matches) inp.focus({ preventScroll: true });
  }, 60);
});
function homeRenderSuggestions(list, msg) {
  const box = document.getElementById('homeSuggest');
  if (!box) return;
  homeSugHits = Array.isArray(list) ? list : [];
  if (msg) { box.innerHTML = `<p class="home-sug-msg">${escapeHtml(msg)}</p>`; return; }
  if (!homeSugHits.length) { box.innerHTML = ''; return; }
  // Best match at the bottom, right above the input field (stays visible above the keyboard)
  box.innerHTML = homeSugHits.slice().reverse().map(h => {
    const i = homeSugHits.indexOf(h);
    return `<button type="button" class="home-sug-row" role="option" data-homehit="${i}">
      <span>📍</span><span class="min-w-0"><b>${escapeHtml(h.titel)}</b><span class="home-sug-z">${escapeHtml(h.zusatz || '')}</span></span>
    </button>`;
  }).join('');
}
async function homeSearch(q) {
  const seq = ++homeSugSeq;
  try {
    const res = await apiFetch('/api/pinn/zuhause/suche?q=' + encodeURIComponent(q), { cache: 'no-store' });
    if (seq !== homeSugSeq) return;
    if (res.status === 404) { homeRenderSuggestions([], 'Der Server-Teil (pb_hooks/zuhause.pb.js) fehlt noch.'); return; }
    const body = await res.json().catch(() => ({}));
    if (seq !== homeSugSeq) return;
    const list = Array.isArray(body.treffer) ? body.treffer : [];
    homeRenderSuggestions(list, list.length ? '' : (body.error || 'Keine passende Adresse gefunden.'));
  } catch (e) {
    if (seq === homeSugSeq) homeRenderSuggestions([], 'Adresssuche nicht möglich – keine Verbindung zum NAS.');
  }
}
async function homeSave(hit) {
  homeSetStatus('Wird gespeichert …');
  try {
    const res = await apiFetch('/api/pinn/zuhause', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hit) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(body.error || 'Speichern fehlgeschlagen.');
    document.getElementById('homeAddressInput').value = '';
    homeRenderSuggestions([]);
    homeApply(body, outboxFamily());
    const z = body.zuhause;
    homeSetStatus(z && z.land === 'DE' && !z.bundesland ? 'Gespeichert. Bitte unter Kalender noch das Bundesland wählen.' : 'Gespeichert ✓');
    hcLoadSchoolHolidays(true);
  } catch (e) {
    homeSetStatus(navigator.onLine === false ? 'Keine Verbindung – das Zuhause lässt sich nur mit Verbindung zum NAS ändern.' : e.message, true);
  }
}
async function homeSetOptions(patch) {
  homeSetCalStatus('Wird gespeichert …');
  try {
    const res = await apiFetch('/api/pinn/zuhause/optionen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(body.error || 'Speichern fehlgeschlagen.');
    homeApply(body, outboxFamily());
    homeSetCalStatus('Gespeichert ✓');
    if (patch.bundesland !== undefined || patch.ferien) hcLoadSchoolHolidays(true);
  } catch (e) {
    homeSetCalStatus(navigator.onLine === false ? 'Keine Verbindung zum NAS.' : e.message, true);
    renderHomeSettings();
  }
}
async function homeFromCoords(lat, lon, fallbackTitle) {
  homeSetStatus('Adresse wird ermittelt …');
  let hit = null;
  try {
    const res = await apiFetch(`/api/pinn/zuhause/adresse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    hit = Array.isArray(body.treffer) && body.treffer[0] ? body.treffer[0] : null;
  } catch (e) { hit = null; }
  const data = hit || { lat, lon, titel: fallbackTitle || 'Zuhause', zusatz: '' };
  const label = [data.titel, data.zusatz].filter(Boolean).join(', ');
  homeSetStatus('');
  if (!confirm(`Als Zuhause übernehmen?\n\n${label}`)) return;
  await homeSave(data);
}

document.getElementById('homeAddressInput').addEventListener('input', (ev) => {
  const q = ev.target.value.trim();
  clearTimeout(homeSugTimer);
  homeSetStatus('');
  if (q.length < 3) { homeSugSeq++; homeRenderSuggestions([]); return; }
  homeSugTimer = setTimeout(() => homeSearch(q), 350);
});
document.getElementById('homeAddressInput').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  if (homeSugHits.length) homeSave(homeSugHits[0]);
  else { const q = ev.target.value.trim(); if (q.length >= 3) homeSearch(q); }
});
document.getElementById('homeSuggest').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-homehit]');
  if (!btn) return;
  const hit = homeSugHits[Number(btn.dataset.homehit)];
  if (hit) homeSave(hit);
});
document.getElementById('homeUseLocationBtn').addEventListener('click', () => {
  // Only here – once and on request – the device asks for the location
  if (!navigator.geolocation) { homeSetStatus('Standort ist auf diesem Gerät nicht verfügbar.', true); return; }
  const btn = document.getElementById('homeUseLocationBtn');
  btn.disabled = true;
  homeSetStatus('Standort wird bestimmt …');
  navigator.geolocation.getCurrentPosition(
    (pos) => { btn.disabled = false; homeFromCoords(pos.coords.latitude, pos.coords.longitude, 'Zuhause'); },
    () => { btn.disabled = false; homeSetStatus('Standort nicht freigegeben – bitte die Adresse eintippen.', true); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
});
document.getElementById('homeMigrateBtn').addEventListener('click', () => {
  const wl = weatherLocation;
  if (wl && wl.lat != null && wl.lon != null) homeFromCoords(wl.lat, wl.lon, wl.label || 'Zuhause');
});
document.getElementById('homeRemoveBtn').addEventListener('click', async () => {
  if (!confirm('Zuhause entfernen? Wetter, Sonnenzeiten und die Kartenmitte gibt es dann erst wieder mit einer neuen Adresse. Der Ort „Zuhause“ in der Ortung bleibt bestehen.')) return;
  homeSetStatus('Wird entfernt …');
  try {
    const res = await apiFetch('/api/pinn/zuhause/entfernen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(body.error || 'Entfernen fehlgeschlagen.');
    homeApply(body, outboxFamily());
    homeSetStatus('Entfernt.');
  } catch (e) {
    homeSetStatus(e.message, true);
  }
});

/* ---------- Settings → Calendar → waste calendar (Müllkalender) ---------- */
var muellManualMode = false;
var muellBusy = false;
var muellHits = [];
var muellProgressTimer = null;

function muellSetStatus(text, err) {
  const el = document.getElementById('muellStatus');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('err', !!err);
}
function muellFmtShort(d) {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }); }
  catch (e) { return d; }
}
function muellFmtLong(d) { return d ? hcFmtDate(d) : ''; }
function muellHomeAddress() {
  if (!homeInfo) return '';
  const ortTeil = [homeInfo.plz, homeInfo.ort].filter(Boolean).join(' ');
  const titel = homeInfo.titel || '';
  return [titel, ortTeil && !titel.includes(ortTeil) ? ortTeil : ''].filter(Boolean).join(', ');
}
function muellArtFarbeFrom(name, arten) {
  const a = Array.isArray(arten) ? arten.find(y => y.name === name) : null;
  return (a && a.farbe) || muellArtFarbe(name);
}
function renderMuellSettings() {
  const box = document.getElementById('muellSettings');
  if (!box) return;
  const guest = isCurrentUserGuest();
  const canEdit = muellCanEdit && !guest && !muellServerMissing;
  const k = muellData && muellData.kalender ? muellData.kalender : null;

  // Hint
  const hint = document.getElementById('muellHint');
  if (muellServerMissing) {
    hint.className = 'set-hint';
    hint.innerHTML = '<span>⚠️</span><span>Für den Müllkalender fehlt auf dem NAS noch der Server-Teil (pb_hooks/muell.pb.js und pinn-muell.js).</span>';
  } else if (!k && !canEdit) {
    hint.className = 'set-hint';
    hint.innerHTML = '<span>🗑️</span><span>Noch kein Müllkalender eingerichtet – das kann ein Admin eurer Familie hier erledigen.</span>';
  } else if (canEdit && !muellKi) {
    hint.className = 'set-hint';
    hint.innerHTML = '<span>🤖</span><span>Die KI-Suche ist auf dem Server nicht eingerichtet (PINN_GEMINI_KEY in der .env). Den Link zur .ics-Datei eures Entsorgers kannst du unten selbst einfügen oder die Datei hochladen.</span>';
  } else {
    hint.className = 'set-hint hidden';
    hint.innerHTML = '';
  }

  // Current calendar
  const card = document.getElementById('muellCard');
  card.classList.toggle('hidden', !k);
  document.getElementById('muellOptions').classList.toggle('hidden', !k);
  if (k) {
    const q = k.quelle || {};
    const heute = isoDate(new Date());
    const naechste = (muellData.termine || []).filter(x => x.d >= heute && !(k.ausgeblendet || []).includes(x.t)).slice(0, 3);
    const quelleZeile = q.art === 'datei'
      ? `Aus der Datei${q.dateiname ? ' „' + escapeHtml(q.dateiname) + '“' : ''} – für neue Termine einfach die neue Datei hochladen.`
      : `Aktualisiert sich jede Woche von selbst${k.geprueft ? ' · zuletzt geprüft am ' + escapeHtml(new Date(k.geprueft).toLocaleDateString('de-DE')) : ''}.`;
    const bald = k.bis && k.bis < addDaysToDateStr(heute, 30);
    card.innerHTML = `<div class="home-card-title">🗑️ ${escapeHtml(q.titel || 'Müllkalender')}</div>
      <div class="home-card-sub">${escapeHtml([q.anbieter, q.adresse].filter(Boolean).join(' · '))}</div>
      <div class="home-card-sub">${k.anzahl ? `${k.anzahl} kommende Abfuhrtermine bis ${escapeHtml(muellFmtLong(k.bis))}` : 'Keine kommenden Abfuhrtermine'}</div>
      ${naechste.length ? `<div class="muell-hit-dates">${naechste.map(x => `<span><i style="background:${escapeHtml(muellArtFarbe(x.t))}"></i>${escapeHtml(muellFmtShort(x.d))} – ${escapeHtml(x.t)}</span>`).join('')}</div>` : ''}
      <div class="home-card-sub" style="margin-top:0.45rem">${quelleZeile}</div>
      ${k.fehler ? `<div class="muell-err" style="margin-top:0.3rem">Letzte Prüfung fehlgeschlagen: ${escapeHtml(k.fehler)}</div>` : ''}
      ${bald ? `<div class="muell-err" style="margin-top:0.3rem">Die Termine reichen nur noch bis ${escapeHtml(muellFmtLong(k.bis))} – bitte einen neuen Kalender suchen oder die neue Datei hochladen.</div>` : ''}`;
    const tog = document.getElementById('muellShowToggle');
    tog.checked = k.anzeigen !== false;
    tog.disabled = !canEdit;
    const hidden = Array.isArray(k.ausgeblendet) ? k.ausgeblendet : [];
    document.getElementById('muellTypes').innerHTML = (k.arten || []).map((a, i) =>
      `<button type="button" class="muell-type${hidden.includes(a.name) ? ' off' : ''}" data-muellart="${i}"${canEdit ? '' : ' disabled'} aria-pressed="${hidden.includes(a.name) ? 'false' : 'true'}" title="${canEdit ? 'Antippen zum Ein-/Ausblenden' : ''}"><i style="background:${escapeHtml(a.farbe || '#7A6F5A')}"></i>${escapeHtml(a.name)}</button>`).join('');
    document.getElementById('muellCardBtns').classList.toggle('hidden', !canEdit);
    document.getElementById('muellRefreshBtn').classList.toggle('hidden', q.art !== 'link');
  }

  // Search / link / file (admins only)
  const edit = document.getElementById('muellEditBox');
  edit.classList.toggle('hidden', !canEdit);
  if (!canEdit) return;
  document.getElementById('muellEditTitle').textContent = k ? 'Anderen Müllkalender suchen (ersetzt den jetzigen)' : 'Müllkalender suchen';
  const homeAdr = muellHomeAddress();
  const useHome = !!homeAdr && !muellManualMode;
  const line = document.getElementById('muellHomeLine');
  line.classList.toggle('hidden', !useHome);
  if (useHome) line.innerHTML = `<span>🏠</span><span class="min-w-0"><b class="font-medium">${escapeHtml(homeAdr)}</b><small>Suche für euer Zuhause</small></span>`;
  document.getElementById('muellManualBox').classList.toggle('hidden', useHome || !muellKi);
  const tgl = document.getElementById('muellManualToggle');
  tgl.classList.toggle('hidden', !homeAdr || !muellKi);
  tgl.textContent = muellManualMode ? '🏠 Zuhause verwenden' : 'Andere Adresse';
  document.getElementById('muellSearchBtn').classList.toggle('hidden', !muellKi);
  document.getElementById('muellSearchBtn').disabled = muellBusy;
  if (!homeAdr && muellKi) document.getElementById('muellPlaceInput').placeholder = 'PLZ und Ort (kein Zuhause angegeben), z. B. 50667 Köln';
  else document.getElementById('muellPlaceInput').placeholder = 'PLZ und Ort, z. B. 50667 Köln';
  if (!muellKi) document.getElementById('muellManualDetails').open = true;
}

function muellStartProgress() {
  const box = document.getElementById('muellProgress');
  const txt = document.getElementById('muellProgressText');
  const steps = ['Die KI sucht euren Entsorger …', 'Die KI sucht den Kalender-Link …', 'Seiten des Entsorgers werden durchsucht …', 'Gefundene Kalender werden heruntergeladen und geprüft …', 'Dauert etwas länger – gleich geschafft …'];
  let i = 0;
  txt.textContent = steps[0];
  box.classList.remove('hidden');
  clearInterval(muellProgressTimer);
  muellProgressTimer = setInterval(() => { i = Math.min(i + 1, steps.length - 1); txt.textContent = steps[i]; }, 15000);
}
function muellStopProgress() {
  clearInterval(muellProgressTimer);
  muellProgressTimer = null;
  document.getElementById('muellProgress').classList.add('hidden');
}
function muellRenderResults(body) {
  const box = document.getElementById('muellResults');
  muellHits = Array.isArray(body && body.treffer) ? body.treffer : [];
  const seiten = Array.isArray(body && body.seiten) ? body.seiten : [];
  let html = '';
  muellHits.forEach((h, i) => {
    const arten = Array.isArray(h.arten) ? h.arten : [];
    const dates = (h.naechste || []).map(x => `<span><i style="background:${escapeHtml(muellArtFarbeFrom(x.t, arten))}"></i>${escapeHtml(muellFmtShort(x.d))} – ${escapeHtml(x.t)}</span>`).join('');
    html += `<div class="muell-hit">
      <div class="muell-hit-head">
        <div class="min-w-0">
          <div class="muell-hit-title">${escapeHtml(h.titel || 'Abfallkalender')}</div>
          <div class="muell-hit-sub">${escapeHtml(h.anbieter || '')} · ${h.anzahl} Termine bis ${escapeHtml(muellFmtLong(h.bis))}</div>
          <div class="muell-hit-sub">${escapeHtml(arten.map(a => a.name).join(', '))}</div>
        </div>
        <button type="button" class="muell-take" data-muelltake="${i}">Übernehmen</button>
      </div>
      ${dates ? `<div class="muell-hit-dates">${dates}</div>` : ''}
    </div>`;
  });
  if (!muellHits.length || seiten.length) {
    html += `<div class="muell-pages">
      <p>${muellHits.length ? 'Weitere Seiten des Entsorgers:' : `Keine Kalenderdatei direkt gefunden${body && body.entsorger ? ' – zuständig ist wohl <b>' + escapeHtml(body.entsorger) + '</b>' : ''}. ${seiten.length ? 'Hier gibt es den Kalender für eure Straße zum Herunterladen:' : ''}`}</p>
      ${body && body.hinweis && !muellHits.length ? `<p>${escapeHtml(body.hinweis)}</p>` : ''}
      ${seiten.map(s => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.titel || s.url)}<small>${escapeHtml(s.url)}</small></a>`).join('')}
      ${!muellHits.length ? '<p>Dort die .ics-Datei herunterladen oder den Link kopieren und unten bei „Link oder Datei selbst angeben“ einfügen.</p>' : ''}
    </div>`;
  }
  box.innerHTML = html;
  if (!muellHits.length) document.getElementById('muellManualDetails').open = true;
}
async function muellPost(path, data) {
  const res = await apiFetch('/api/pinn/muell/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
  if (res.status === 404) throw new Error('Der Server-Teil (pb_hooks/muell.pb.js) fehlt noch.');
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error || 'Das hat nicht geklappt.');
  return body;
}
function muellConfirmReplace() {
  const k = muellData && muellData.kalender;
  if (!k) return true;
  return confirm(`Den bisherigen Müllkalender „${(k.quelle && k.quelle.titel) || 'Müllkalender'}“ ersetzen?\n\nJede Familie hat genau einen Müllkalender – der alte wird dabei überschrieben.`);
}
function muellOfflineMsg(e) {
  return navigator.onLine === false ? 'Keine Verbindung – der Müllkalender lässt sich nur mit Verbindung zum NAS ändern.' : e.message;
}
function muellDoneMsg(body) {
  const k = body && body.kalender;
  return k ? `Übernommen ✓ – ${k.anzahl} kommende Abfuhrtermine im Kalender` : 'Gespeichert ✓';
}
async function muellSearch() {
  if (muellBusy) return;
  const homeAdr = muellHomeAddress();
  let data;
  if (homeAdr && !muellManualMode) {
    data = { zuhause: true, adresse: homeAdr, plz: homeInfo.plz || '', ort: homeInfo.ort || '' };
  } else {
    const strasse = document.getElementById('muellStreetInput').value.trim();
    const ort = document.getElementById('muellPlaceInput').value.trim();
    if (ort.length < 2) { muellSetStatus('Bitte mindestens Postleitzahl oder Ort angeben.', true); document.getElementById('muellPlaceInput').focus(); return; }
    data = { adresse: [strasse, ort].filter(Boolean).join(', ') };
  }
  muellBusy = true;
  document.getElementById('muellResults').innerHTML = '';
  muellSetStatus('');
  renderMuellSettings();
  muellStartProgress();
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 160000) : null;
  try {
    const res = await apiFetch('/api/pinn/muell/suche', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: ctrl ? ctrl.signal : undefined });
    if (res.status === 404) throw new Error('Der Server-Teil (pb_hooks/muell.pb.js) fehlt noch.');
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(body.error || 'Die Suche hat nicht geklappt.');
    muellRenderResults(body);
    muellSetStatus(body.treffer && body.treffer.length ? `${body.treffer.length === 1 ? '1 Kalender' : body.treffer.length + ' Kalender'} gefunden und geprüft – bitte den passenden übernehmen.` : '');
  } catch (e) {
    muellSetStatus(e && e.name === 'AbortError' ? 'Die Suche hat zu lange gedauert – bitte noch einmal versuchen oder den Link selbst angeben.' : muellOfflineMsg(e), true);
  } finally {
    if (timer) clearTimeout(timer);
    muellStopProgress();
    muellBusy = false;
    renderMuellSettings();
  }
}
async function muellTake(hit, btn) {
  if (!hit || !muellConfirmReplace()) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Wird geladen …'; }
  muellSetStatus('Kalender wird heruntergeladen …');
  try {
    const body = await muellPost('uebernehmen', { url: hit.url, anbieter: hit.anbieter || '', titel: hit.titel || '', adresse: muellManualMode ? '' : muellHomeAddress() });
    muellApply(body, outboxFamily());
    document.getElementById('muellResults').innerHTML = '';
    muellHits = [];
    muellSetStatus(muellDoneMsg(body));
  } catch (e) {
    muellSetStatus(muellOfflineMsg(e), true);
    if (btn) { btn.disabled = false; btn.textContent = 'Übernehmen'; }
  }
}
async function muellSetOptions(patch) {
  muellSetStatus('Wird gespeichert …');
  try {
    const body = await muellPost('optionen', patch);
    muellApply(body, outboxFamily());
    muellSetStatus('Gespeichert ✓');
  } catch (e) {
    muellSetStatus(muellOfflineMsg(e), true);
    renderMuellSettings();
  }
}

document.getElementById('muellSearchBtn').addEventListener('click', () => muellSearch());
document.getElementById('muellPlaceInput').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  ev.target.blur();
  muellSearch();
});
document.getElementById('muellStreetInput').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  document.getElementById('muellPlaceInput').focus();
});
document.getElementById('muellManualToggle').addEventListener('click', () => {
  muellManualMode = !muellManualMode;
  renderMuellSettings();
  if (muellManualMode && !window.matchMedia('(pointer: coarse)').matches) document.getElementById('muellStreetInput').focus();
});
document.getElementById('muellResults').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-muelltake]');
  if (!btn) return;
  muellTake(muellHits[Number(btn.dataset.muelltake)], btn);
});
document.getElementById('muellLinkBtn').addEventListener('click', async () => {
  const inp = document.getElementById('muellLinkInput');
  const url = inp.value.trim();
  if (!/^(https?|webcals?):\/\//i.test(url)) { muellSetStatus('Bitte einen vollständigen Link (https://… oder webcal://…) einfügen.', true); return; }
  if (!muellConfirmReplace()) return;
  const btn = document.getElementById('muellLinkBtn');
  btn.disabled = true;
  muellSetStatus('Kalender wird heruntergeladen und geprüft …');
  try {
    const body = await muellPost('uebernehmen', { url, adresse: muellManualMode ? '' : muellHomeAddress() });
    muellApply(body, outboxFamily());
    inp.value = '';
    document.getElementById('muellResults').innerHTML = '';
    document.getElementById('muellManualDetails').open = false;
    muellSetStatus(muellDoneMsg(body));
  } catch (e) {
    muellSetStatus(muellOfflineMsg(e), true);
  } finally {
    btn.disabled = false;
  }
});
document.getElementById('muellLinkInput').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  document.getElementById('muellLinkBtn').click();
});
document.getElementById('muellFileBtn').addEventListener('click', () => document.getElementById('muellFileInput').click());
document.getElementById('muellFileInput').addEventListener('change', async (ev) => {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  if (file.size > 6 * 1024 * 1024) { muellSetStatus('Die Datei ist zu groß (höchstens 6 MB).', true); return; }
  if (!muellConfirmReplace()) return;
  muellSetStatus('Datei wird geprüft …');
  try {
    const text = await file.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Das ist keine Kalenderdatei (.ics).');
    const body = await muellPost('datei', { name: file.name, text, adresse: muellManualMode ? '' : muellHomeAddress() });
    muellApply(body, outboxFamily());
    document.getElementById('muellResults').innerHTML = '';
    document.getElementById('muellManualDetails').open = false;
    muellSetStatus(muellDoneMsg(body));
  } catch (e) {
    muellSetStatus(muellOfflineMsg(e), true);
  }
});
document.getElementById('muellShowToggle').addEventListener('change', (ev) => muellSetOptions({ anzeigen: ev.target.checked }));
document.getElementById('muellTypes').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-muellart]');
  if (!btn || btn.disabled || !muellData || !muellData.kalender) return;
  const k = muellData.kalender;
  const art = (k.arten || [])[Number(btn.dataset.muellart)];
  if (!art) return;
  const hidden = Array.isArray(k.ausgeblendet) ? k.ausgeblendet.slice() : [];
  const i = hidden.indexOf(art.name);
  if (i >= 0) hidden.splice(i, 1); else hidden.push(art.name);
  muellSetOptions({ ausgeblendet: hidden });
});
document.getElementById('muellRefreshBtn').addEventListener('click', async () => {
  const btn = document.getElementById('muellRefreshBtn');
  btn.disabled = true;
  muellSetStatus('Wird beim Entsorger abgefragt …');
  try {
    const body = await muellPost('aktualisieren', {});
    muellApply(body, outboxFamily());
    muellSetStatus(body.geaendert ? 'Neue Termine übernommen ✓' : 'Alles aktuell ✓');
  } catch (e) {
    muellSetStatus(muellOfflineMsg(e), true);
    loadMuell(true);
  } finally {
    btn.disabled = false;
  }
});
document.getElementById('muellRemoveBtn').addEventListener('click', async () => {
  if (!confirm('Müllkalender entfernen? Die Abfuhrtermine verschwinden für die ganze Familie aus dem Kalender.')) return;
  muellSetStatus('Wird entfernt …');
  try {
    const body = await muellPost('entfernen', {});
    muellApply(body, outboxFamily());
    muellSetStatus('Entfernt ✓');
  } catch (e) {
    muellSetStatus(muellOfflineMsg(e), true);
  }
});
document.getElementById('homeStateSelect').addEventListener('change', (ev) => homeSetOptions({ bundesland: ev.target.value }));
document.getElementById('homeShowHolidays').addEventListener('change', (ev) => homeSetOptions({ feiertage: ev.target.checked }));
document.getElementById('homeShowSchool').addEventListener('change', (ev) => homeSetOptions({ ferien: ev.target.checked }));

async function fetchAppleServerStatus() {
  try {
    const res = await apiFetch('/api/pinn/apple-status');
    if (res.status === 404) {
      appleServerStatus = { configured: false, account: '', hasAppleId: false, hasAppPassword: false, lastSync: null, canEdit: false, error: 'pb_hooks/apple_credentials.pb.js fehlt auf dem Server.' };
    } else {
      appleServerStatus = await res.json();
    }
  } catch (err) {
    appleServerStatus = { configured: false, account: '', hasAppleId: false, hasAppPassword: false, lastSync: null, canEdit: false, error: 'Server nicht erreichbar.' };
  }
  return appleServerStatus;
}

function appleStatusTexts(st) {
  if (!st) return { line: 'Status wird geladen …', detail: '', ok: null };
  if (st.error && !st.canEdit) return { line: 'Status nicht verfügbar', detail: st.error, ok: false };
  if (!st.configured) {
    if (st.error) return { line: 'Apple-ID prüfen', detail: st.error, ok: false };
    return {
      line: 'Nicht eingerichtet',
      detail: st.canEdit ? 'Noch keine Apple-ID für eure Familie hinterlegt.' : 'Noch keine Apple-ID hinterlegt – das kann ein Admin deiner Familie übernehmen.',
      ok: false,
    };
  }
  let detail = '';
  const ls = st.lastSync;
  if (ls && ls.at) {
    const when = new Date(ls.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    detail = (ls.ok ? 'Letzter Abgleich ' : 'Letzter Abgleich fehlgeschlagen ') + when + (ls.message ? ' – ' + ls.message : '');
  } else {
    detail = 'Noch kein Abgleich seit dem letzten Serverstart bzw. dem Speichern der Apple-ID.';
  }
  return { line: 'Verbunden als ' + st.account, detail, ok: !(ls && ls.ok === false) };
}

function renderAppleStatusBox() {
  const t = appleStatusTexts(appleServerStatus);
  const lineEl = document.getElementById('appleCalStatusLine');
  const detailEl = document.getElementById('appleCalStatusDetail');
  const box = document.getElementById('appleCalStatusBox');
  if (!lineEl || !detailEl || !box) return;
  lineEl.textContent = t.line;
  detailEl.textContent = t.detail;
  lineEl.classList.toggle('text-red-600', t.ok === false);
  const loadBtn = document.getElementById('loadAppleCalendarsBtn');
  if (loadBtn) {
    const usable = calendarsUsable();
    loadBtn.disabled = !usable;
    loadBtn.classList.toggle('opacity-50', !usable);
    loadBtn.classList.toggle('hidden', !usable);
  }
  renderAppleCredForm();
  renderGoogleBox();
}

// Is any calendar account connected at all (iCloud and/or Google)?
function calendarsUsable() {
  return !!((appleServerStatus && appleServerStatus.configured) || (googleServerStatus && googleServerStatus.configured));
}

/* ---------- Google Calendar (Android) ---------- */
async function fetchGoogleServerStatus() {
  try {
    const res = await apiFetch('/api/pinn/google-status');
    if (res.status === 404) {
      googleServerStatus = { available: false, configured: false, account: '', error: '', redirectUri: '', lastSync: null, canEdit: false, missingHook: true };
    } else {
      googleServerStatus = await res.json();
    }
  } catch (err) {
    googleServerStatus = { available: false, configured: false, account: '', error: 'Server nicht erreichbar.', redirectUri: '', lastSync: null, canEdit: false };
  }
  return googleServerStatus;
}

function googleRedirectUri() {
  const st = googleServerStatus;
  return (st && st.redirectUri) || (location.origin + '/api/pinn/google/callback');
}

function googleStatusTexts(st) {
  if (!st) return { line: 'Status wird geladen …', detail: '', ok: null };
  if (st.missingHook) return { line: 'Nicht verfügbar', detail: 'pb_hooks/google_credentials.pb.js fehlt auf dem Server.', ok: false };
  if (!st.configured) {
    if (st.error && !st.canEdit && !st.available) return { line: 'Status nicht verfügbar', detail: st.error, ok: false };
    if (!st.available) {
      return {
        line: 'Nicht eingerichtet',
        detail: st.canEdit ? 'Auf dem Server fehlt noch der Google-Zugang für pinn. (einmalige Einrichtung, siehe unten).' : 'Google-Kalender ist auf diesem Server noch nicht eingerichtet.',
        ok: null,
      };
    }
    return {
      line: 'Nicht verbunden',
      detail: st.canEdit ? 'Mit dem Google-Konto anmelden, das auf dem Android-Handy für den Kalender genutzt wird.' : 'Euren Google-Kalender kann ein Admin deiner Familie verbinden.',
      ok: null,
    };
  }
  if (st.error) return { line: 'Verbunden als ' + st.account, detail: st.error, ok: false };
  let detail = '';
  const ls = st.lastSync;
  if (ls && ls.at) {
    const when = new Date(ls.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    detail = (ls.ok ? 'Letzter Abgleich ' : 'Letzter Abgleich fehlgeschlagen ') + when + (ls.message ? ' – ' + ls.message : '');
  } else {
    detail = 'Jetzt unten die Google-Kalender (mit „(Google)“ im Namen) auswählen und speichern.';
  }
  return { line: 'Verbunden als ' + st.account, detail, ok: !(ls && ls.ok === false) };
}

function renderGoogleBox() {
  const lineEl = document.getElementById('googleCalStatusLine');
  const detailEl = document.getElementById('googleCalStatusDetail');
  if (!lineEl || !detailEl) return;
  const st = googleServerStatus;
  const t = googleStatusTexts(st);
  lineEl.textContent = t.line;
  detailEl.textContent = t.detail;
  detailEl.classList.toggle('hidden', !t.detail);
  lineEl.classList.toggle('text-red-600', t.ok === false);
  const canEdit = !!(st && st.canEdit);
  const configured = !!(st && st.configured);
  const available = !!(st && st.available);
  document.getElementById('googleCalActions').classList.toggle('hidden', !(canEdit && (available || configured)));
  const connectBtn = document.getElementById('connectGoogleBtn');
  connectBtn.textContent = configured ? 'Neu verbinden' : 'Mit Google verbinden';
  connectBtn.classList.toggle('hidden', !available);
  connectBtn.classList.toggle('bg-pine', !configured);
  connectBtn.classList.toggle('text-white', !configured);
  connectBtn.classList.toggle('border', configured);
  connectBtn.classList.toggle('border-ink/15', configured);
  connectBtn.classList.toggle('text-ink/70', configured);
  connectBtn.classList.toggle('hover:bg-pine/90', !configured);
  connectBtn.classList.toggle('hover:border-pine', configured);
  connectBtn.classList.toggle('hover:text-pine', configured);
  document.getElementById('removeGoogleBtn').classList.toggle('hidden', !configured);
  const hint = document.getElementById('googleSetupHint');
  const showHint = canEdit && st && !available && !st.missingHook;
  hint.classList.toggle('hidden', !showHint);
  if (showHint) {
    hint.innerHTML = 'Einmalige Einrichtung auf dem NAS: in der <b>.env</b> neben der docker-compose.yaml '
      + '<b>PINN_GOOGLE_CLIENT_ID</b> und <b>PINN_GOOGLE_CLIENT_SECRET</b> eintragen und den Container neu starten. '
      + 'Autorisierte Weiterleitungs-URI im Google-Cloud-Projekt:<br><span class="font-mono text-[10px] text-ink/70" style="word-break:break-all;-webkit-user-select:all;user-select:all">' + escapeHtml(googleRedirectUri()) + '</span>';
  }
}

function showGoogleMsg(text, ok) {
  const el = document.getElementById('googleCalMsg');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
  el.classList.toggle('text-red-600', !ok);
  el.classList.toggle('bg-red-50', !ok);
  el.classList.toggle('text-pine', !!ok);
  el.classList.toggle('bg-pine/5', !!ok);
}

document.getElementById('connectGoogleBtn').addEventListener('click', async () => {
  const btn = document.getElementById('connectGoogleBtn');
  showGoogleMsg('', true);
  btn.disabled = true;
  btn.textContent = 'Weiter zu Google …';
  try {
    const r = await postJson('/api/pinn/google/start', { origin: location.origin });
    if (!r.url) throw new Error('Google-Anmeldung konnte nicht gestartet werden.');
    location.href = r.url; // Google asks for the account and permission and sends the user back to pinn.
  } catch (e) {
    showGoogleMsg(e.message, false);
    btn.disabled = false;
    renderGoogleBox();
  }
});

document.getElementById('removeGoogleBtn').addEventListener('click', async () => {
  if (!confirm('Google-Konto eurer Familie wirklich trennen? Termine aus den Google-Kalendern werden dann nicht mehr angezeigt, bis wieder ein Google-Konto verbunden ist. Die Kalenderauswahl bleibt erhalten.')) return;
  const btn = document.getElementById('removeGoogleBtn');
  btn.disabled = true;
  try {
    await postJson('/api/pinn/google/loeschen', {});
    await refreshAppleServerStatus();
    showGoogleMsg('Google-Konto getrennt.', true);
    loadBirthdays(true); // Birthdays from Google disappear
    if (calendarsUsable()) {
      await loadAppleCalendarList();
    } else {
      document.getElementById('appleCalListWrap').classList.add('hidden');
      document.getElementById('appleCalList').innerHTML = '';
    }
    armModalSnapshot('appleCalendarModal');
    await syncAppleCalendarFile(true);
  } catch (e) {
    showGoogleMsg(e.message, false);
  } finally {
    btn.disabled = false;
  }
});

// Return from the Google sign-in: /?google=verbunden or /?google=fehler&grund=...
async function googleReturnFromUrl() {
  let params;
  try { params = new URLSearchParams(location.search); } catch (e) { return; }
  const result = params.get('google');
  if (!result) return;
  const reason = params.get('grund') || '';
  const note = params.get('hinweis') || '';
  const personal = params.get('privat') === '1';
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignore */ }
  if (isCurrentUserGuest()) return;
  if (personal) { await pinnCalGoogleReturn(result, reason, note); return; } // own Google account (Eigene Kalender)
  setView('einstellungen');
  await openCalendarModal();
  if (result === 'verbunden') {
    showGoogleMsg(note ? 'Verbunden. Achtung: ' + note : 'Google-Konto verbunden. Jetzt die Google-Kalender auswählen und unten speichern.', !note);
  } else {
    showGoogleMsg(reason || 'Google-Konto konnte nicht verbunden werden.', false);
  }
}

// Input for the Apple ID of the own family – only visible to the family's admins.
function renderAppleCredForm() {
  const wrap = document.getElementById('appleCredWrap');
  const hint = document.getElementById('appleCredHint');
  if (!wrap || !hint) return;
  const st = appleServerStatus;
  const canEdit = !!(st && st.canEdit);
  wrap.classList.toggle('hidden', !canEdit);
  hint.classList.toggle('hidden', canEdit || !st || !!st.configured);
  if (!canEdit) return;
  const idInput = document.getElementById('appleIdInput');
  if (!idInput.dataset.touched) idInput.value = st.account || '';
  document.getElementById('saveAppleCredsBtn').textContent = st.configured ? 'Apple-ID ändern' : 'Apple-ID speichern';
  document.getElementById('removeAppleCredsBtn').classList.toggle('hidden', !(st.configured || st.hasAppleId));
}

function showAppleCredsStatus(text, ok) {
  const el = document.getElementById('appleCredsStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('hidden', !text);
  el.classList.toggle('text-red-600', !ok);
  el.classList.toggle('bg-red-50', !ok);
  el.classList.toggle('text-pine', !!ok);
  el.classList.toggle('bg-pine/5', !!ok);
}

document.getElementById('appleIdInput').addEventListener('input', (e) => { e.target.dataset.touched = '1'; });

document.getElementById('saveAppleCredsBtn').addEventListener('click', async () => {
  const idInput = document.getElementById('appleIdInput');
  const pwInput = document.getElementById('appleAppPasswordInput');
  const btn = document.getElementById('saveAppleCredsBtn');
  const appleId = idInput.value.trim();
  const appPassword = pwInput.value.trim();
  showAppleCredsStatus('', true);
  if (!appleId || !appPassword) {
    showAppleCredsStatus('Bitte Apple-ID und App-spezifisches Passwort eingeben.', false);
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Wird bei iCloud geprüft …';
  try {
    const r = await postJson('/api/pinn/apple-zugang', { appleId, appPassword });
    pwInput.value = '';
    delete idInput.dataset.touched;
    try { document.activeElement && document.activeElement.blur(); } catch (e) { /* ignore */ }
    await refreshAppleServerStatus();
    showAppleCredsStatus('Gespeichert. Jetzt die Kalender auswählen und unten speichern.', true);
    document.getElementById('appleCalError').classList.add('hidden');
    if (r.calendars && r.calendars.length) await loadAppleCalendarList(); // iCloud + Google if connected
    armModalSnapshot('appleCalendarModal');
    // If a calendar selection was already saved (e.g. new password), sync again right away
    if (appleCalendar.selectedCalendars.length) triggerFullCalendarResync();
    loadBirthdays(true); // Also take birthdays from the iCloud contacts
  } catch (e) {
    showAppleCredsStatus(e.message, false);
  } finally {
    btn.disabled = false;
    renderAppleCredForm();
  }
});

document.getElementById('removeAppleCredsBtn').addEventListener('click', async () => {
  if (!confirm('Apple-ID eurer Familie wirklich entfernen? Termine aus iCloud werden dann nicht mehr angezeigt, bis wieder eine Apple-ID hinterlegt ist. Die Kalenderauswahl bleibt erhalten.')) return;
  const btn = document.getElementById('removeAppleCredsBtn');
  btn.disabled = true;
  try {
    await postJson('/api/pinn/apple-zugang/loeschen', {});
    const idInput = document.getElementById('appleIdInput');
    delete idInput.dataset.touched;
    document.getElementById('appleAppPasswordInput').value = '';
    document.getElementById('appleCalListWrap').classList.add('hidden');
    document.getElementById('appleCalList').innerHTML = '';
    await refreshAppleServerStatus();
    showAppleCredsStatus('Apple-ID entfernt.', true);
    loadBirthdays(true); // Birthdays from iCloud disappear
    if (googleServerStatus && googleServerStatus.configured) {
      // Google stays connected: reload the list and the events, Google events stay
      await loadAppleCalendarList();
      armModalSnapshot('appleCalendarModal');
      await syncAppleCalendarFile(true);
    } else {
      armModalSnapshot('appleCalendarModal');
      events = []; eventsServer = [];
      renderCalendar();
      renderTasks();
    }
  } catch (e) {
    showAppleCredsStatus(e.message, false);
  } finally {
    btn.disabled = false;
  }
});

function renderAppleCalendarSummary() {
  const accountEl = document.getElementById('appleCalendarAccountLine');
  const listEl = document.getElementById('appleCalendarListSummary');
  const t = appleStatusTexts(appleServerStatus);
  accountEl.textContent = 'iCloud: ' + (t.detail ? t.line + ' · ' + t.detail : t.line);
  accountEl.classList.toggle('text-red-600', t.ok === false);
  const gEl = document.getElementById('googleCalendarAccountLine');
  if (gEl) {
    const gs = googleServerStatus;
    const showG = !!(gs && (gs.configured || gs.available));
    gEl.classList.toggle('hidden', !showG);
    if (showG) {
      const gt = googleStatusTexts(gs);
      gEl.textContent = 'Google: ' + (gs.configured && gt.ok === false && gt.detail ? gt.line + ' · ' + gt.detail : gt.line);
      gEl.classList.toggle('text-red-600', gt.ok === false);
    }
  }
  listEl.innerHTML = '';
  try { renderPinnCalLegacy(); } catch (e) { /* settings not built yet */ }
  if (!calendarsUsable()) return;
  // Show event calendars; the task calendar is ALWAYS listed too, even if it is not
  // additionally selected as a normal event calendar – otherwise it would be missing here entirely.
  const namesToShow = [...appleCalendar.selectedCalendars];
  // COMMENTED OUT (tasks now live on the NAS):
  // if (appleCalendar.taskCalendarName && !namesToShow.includes(appleCalendar.taskCalendarName)) {
  //   namesToShow.push(appleCalendar.taskCalendarName);
  // }
  if (!namesToShow.length) {
    listEl.innerHTML = '<li class="text-xs text-ink/40 italic">Keine Kalender ausgewählt.</li>';
    return;
  }
  namesToShow.forEach(name => {
    const isTaskCal = name === appleCalendar.taskCalendarName;
    const color = appleCalendar.calendarColors[name] || '#9a9284';
    const li = document.createElement('li');
    li.className = 'flex items-center gap-2 text-xs text-ink/70';
    li.innerHTML = `<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${color}"></span><span class="truncate">${escapeHtml(name)}</span>${isTaskCal ? '<span class="text-ink/40 shrink-0">(Aufgaben-Kalender)</span>' : ''}`;
    listEl.appendChild(li);
  });
}

// Fetch the status (iCloud + Google) fresh from the server and update the overview + the open modal, if any.
async function refreshAppleServerStatus() {
  await Promise.all([fetchAppleServerStatus(), fetchGoogleServerStatus()]);
  renderAppleCalendarSummary();
  renderAppleStatusBox();
}

let pendingSelectedCalendars = [];
let pendingCalendarColors = {};
let pendingTaskCalendarName = '';
let pendingShowTaskCalendarAsEvents = false;

document.getElementById('editAppleCalendarBtn').addEventListener('click', () => openCalendarModal());
async function openCalendarModal() {
  document.getElementById('appleCalError').classList.add('hidden');
  document.getElementById('appleCalListWrap').classList.add('hidden');
  document.getElementById('appleCalList').innerHTML = '';
  document.getElementById('taskCalendarWrap').classList.add('hidden');
  pendingSelectedCalendars = [...appleCalendar.selectedCalendars];
  pendingCalendarColors = { ...appleCalendar.calendarColors };
  pendingTaskCalendarName = appleCalendar.taskCalendarName || '';
  pendingShowTaskCalendarAsEvents = !!appleCalendar.showTaskCalendarAsEvents;
  document.getElementById('showTaskCalendarAsEventsCheckbox').checked = pendingShowTaskCalendarAsEvents;
  delete document.getElementById('appleIdInput').dataset.touched;
  document.getElementById('appleAppPasswordInput').value = '';
  showAppleCredsStatus('', true);
  showGoogleMsg('', true);
  renderAppleStatusBox();
  document.getElementById('appleCalendarModal').classList.remove('hidden');
  armModalSnapshot('appleCalendarModal');
  // Fetch the status fresh and – if iCloud or Google is set up – load the calendar list right away.
  await refreshAppleServerStatus();
  armModalSnapshot('appleCalendarModal');
  if (calendarsUsable()) {
    await loadAppleCalendarList();
    armModalSnapshot('appleCalendarModal');
  }
}
function closeAppleCalendarModal() { document.getElementById('appleCalendarModal').classList.add('hidden'); }
document.getElementById('cancelAppleCalendar').addEventListener('click', () => attemptCloseModal('appleCalendarModal', closeAppleCalendarModal));
wireModalOutsideClick('appleCalendarModal', closeAppleCalendarModal);
// Keeps the checkbox of the currently chosen task calendar in the calendar list and the
// "Auch als Termine anzeigen" tick in sync, no matter from which side it is changed.
function syncTaskCalendarCheckbox() {
  const cb = [...document.querySelectorAll('.apple-cal-checkbox')].find(c => c.value === pendingTaskCalendarName);
  if (cb) cb.checked = pendingShowTaskCalendarAsEvents;
  if (!pendingTaskCalendarName) return;
  if (pendingShowTaskCalendarAsEvents) {
    if (!pendingSelectedCalendars.includes(pendingTaskCalendarName)) pendingSelectedCalendars.push(pendingTaskCalendarName);
  } else {
    pendingSelectedCalendars = pendingSelectedCalendars.filter(n => n !== pendingTaskCalendarName);
  }
}

document.getElementById('showTaskCalendarAsEventsCheckbox').addEventListener('change', (e) => {
  pendingShowTaskCalendarAsEvents = e.target.checked;
  syncTaskCalendarCheckbox();
});

function renderAppleCalList(names) {
  const wrap = document.getElementById('appleCalList');
  wrap.innerHTML = '';
  names.forEach((name, i) => {
    if (!pendingCalendarColors[name]) pendingCalendarColors[name] = PALETTE[i % PALETTE.length];
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-ink/5';
    row.innerHTML = `
      <label class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
        <input type="checkbox" class="apple-cal-checkbox" value="${escapeHtml(name)}" ${pendingSelectedCalendars.includes(name) ? 'checked' : ''} />
        <span class="truncate">${escapeHtml(name)}</span>
      </label>
      <button type="button" class="cal-color-swatch w-6 h-6 rounded-full border-2 border-white shadow shrink-0" data-name="${escapeHtml(name)}" style="background:${pendingCalendarColors[name]}" title="Farbe für diesen Kalender ändern (antippen zum Wechseln)"></button>
    `;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('.apple-cal-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      pendingSelectedCalendars = [...wrap.querySelectorAll('.apple-cal-checkbox:checked')].map(c => c.value);
      // Link: if the checkbox concerns exactly the task calendar, update the "Auch als Termine
      // anzeigen" tick as well instead of risking two independent states.
      if (cb.value === pendingTaskCalendarName) {
        pendingShowTaskCalendarAsEvents = cb.checked;
        const showCb = document.getElementById('showTaskCalendarAsEventsCheckbox');
        if (showCb) showCb.checked = cb.checked;
      }
    });
  });
  wrap.querySelectorAll('.cal-color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const idx = PALETTE.indexOf(pendingCalendarColors[name]);
      const next = PALETTE[(idx + 1) % PALETTE.length];
      pendingCalendarColors[name] = next;
      btn.style.background = next;
    });
  });
  document.getElementById('appleCalListWrap').classList.remove('hidden');

  const taskSel = document.getElementById('taskCalendarSelect');
  taskSel.innerHTML = '<option value="">Kein Aufgaben-Kalender</option>' + names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  taskSel.value = pendingTaskCalendarName || '';
  taskSel.onchange = () => {
    pendingTaskCalendarName = taskSel.value;
    document.getElementById('showTaskCalendarAsEventsCheckbox').checked = pendingShowTaskCalendarAsEvents;
    syncTaskCalendarCheckbox();
  };
  // COMMENTED OUT (tasks now live on the NAS): document.getElementById('taskCalendarWrap').classList.remove('hidden');
}

async function loadAppleCalendarList() {
  const errEl = document.getElementById('appleCalError');
  errEl.classList.add('hidden');

  if (!calendarsUsable()) {
    errEl.textContent = (appleServerStatus && appleServerStatus.canEdit)
      ? 'Bitte zuerst oben eine Apple-ID hinterlegen oder ein Google-Konto verbinden.'
      : 'Für eure Familie ist noch kein Kalender verbunden – das kann ein Admin deiner Familie übernehmen.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('loadAppleCalendarsBtn');
  btn.disabled = true;
  btn.textContent = 'Lade Kalender …';
  try {
    const res = await apiFetch('/api/discover-calendars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const result = await res.json();
    if (result.error) {
      errEl.textContent = result.error;
      errEl.classList.remove('hidden');
      return;
    }
    if (!result.calendars || result.calendars.length === 0) {
      errEl.textContent = 'Keine Kalender gefunden.';
      errEl.classList.remove('hidden');
      return;
    }
    renderAppleCalList(result.calendars);
    if (result.warning) {
      // One account (iCloud or Google) did not answer – the other calendars are there anyway
      errEl.textContent = result.warning;
      errEl.classList.remove('hidden');
    }
  } catch (err) {
    errEl.textContent = 'Verbindung zum Server fehlgeschlagen. Bitte NAS/Netzwerk prüfen.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = !calendarsUsable();
    btn.textContent = 'Kalender laden';
  }
}
document.getElementById('loadAppleCalendarsBtn').addEventListener('click', () => loadAppleCalendarList());

// Triggers a REAL sync with iCloud and Google (not just reloading the possibly outdated
// kalender.ics) and then loads the fresh result. Used by the "Jetzt aktualisieren" button
// as well as after saving the calendar selection.
async function triggerFullCalendarResync() {
  const statusEl = document.getElementById('icsSyncStatus');
  if (statusEl) statusEl.textContent = 'Synchronisiere Kalender …';
  try {
    await apiFetch('/api/sync-calendar-now', { method: 'POST' });
  } catch (err) {
    console.error('Sofort-Sync fehlgeschlagen', err);
  }
  await syncAppleCalendarFile(true);
  refreshAppleServerStatus();
}

document.getElementById('saveAppleCalendar').addEventListener('click', async () => {
  // Only keep the colours of the calendars actually selected, drop the rest
  const calendarColors = {};
  pendingSelectedCalendars.forEach(name => { calendarColors[name] = pendingCalendarColors[name] || PALETTE[0]; });
  appleCalendar = { selectedCalendars: pendingSelectedCalendars, calendarColors, taskCalendarName: pendingTaskCalendarName, showTaskCalendarAsEvents: pendingShowTaskCalendarAsEvents };
  document.getElementById('appleCalendarModal').classList.add('hidden');
  renderAppleCalendarSummary();
  await persistState();
  await triggerFullCalendarResync();
});

document.getElementById('disconnectAppleCalendar').addEventListener('click', async () => {
  if (!confirm('Kalenderauswahl wirklich zurücksetzen? Es werden dann keine Termine mehr importiert, bis wieder Kalender ausgewählt sind (Aufgaben bleiben erhalten). Apple-ID und Google-Konto bleiben verbunden.')) return;
  appleCalendar = { selectedCalendars: [], calendarColors: {}, taskCalendarName: '', showTaskCalendarAsEvents: false };
  document.getElementById('appleCalendarModal').classList.add('hidden');
  renderAppleCalendarSummary();
  await persistState();
  // Clear locally right away instead of waiting for the server until the next cron run (max. 15 min.)
  events = []; eventsServer = [];
  renderCalendar();
  renderTasks();
});

/* ---------- Settings → Calendar (add calendar) ----------
   Every profile (except guests) signs in with ITS OWN iCloud or Google account and ticks the
   calendars from it in two columns: „Für mich“ (only the own profile sees them) or „Familie“
   (everyone in the family sees and uses them). The other profiles see other people's family calendars only
   as a hint with a masked account (m**l@g***l.com). Without an account, a calendar can also live only
   on the pinn. server. Server: pinn-kalender.js + pinn-kalender-konten.js (routes /api/pinn/kalender/…).
   The former family connection (Bearbeiten → „Kalender verbinden“) only appears as long as calendars
   are selected there. */
const PINN_CAL_SRC_LABEL = { apple: 'iCloud', google: 'Google' };
const PINN_CAL_SRC_ICON = { apple: '🍎', google: '🟢' };
function pinnCalSrcTag(c) {
  return c.quelle ? PINN_CAL_SRC_ICON[c.quelle] + ' ' + PINN_CAL_SRC_LABEL[c.quelle] : '🗄 pinn.';
}
function pinnCalSubLabel(c) {
  let t = (c.geteilt ? '👨‍👩‍👧 Familie' : '🔒 Für mich') + ' · ' + pinnCalSrcTag(c);
  if (c.quelle && c.externName && c.externName !== c.name) t += ' „' + escapeHtml(c.externName) + '“';
  if (c.nurLesen) t += ' · nur lesen';
  return t;
}

let pinnCalKonten = null;    // Status of the own accounts (null = not loaded yet)
let pinnCalKontenErr = '';

function renderPinnCalLegacy() {
  const box = document.getElementById('legacyCalBox');
  if (!box) return;
  const legacy = !!(appleCalendar && Array.isArray(appleCalendar.selectedCalendars) && appleCalendar.selectedCalendars.length);
  box.classList.toggle('hidden', !legacy);
  const btn = document.getElementById('editAppleCalendarBtn');
  if (btn) btn.classList.toggle('hidden', !isCurrentUserAdmin());
  const any = legacy || pinnCals.length > 0;
  document.getElementById('refreshCalendarBtn').classList.toggle('hidden', !any);
  document.getElementById('icsSyncStatus').classList.toggle('hidden', !any);
}

function renderPinnCalAccounts() {
  const box = document.getElementById('pinnCalAccounts');
  if (!box) return;
  if (isCurrentUserGuest() || !pinnCalKonten) { box.innerHTML = ''; return; }
  box.innerHTML = ['apple', 'google'].filter(art => pinnCalKonten[art] && pinnCalKonten[art].verbunden).map(art => {
    const st = pinnCalKonten[art];
    return `<div class="pca-row${st.fehler ? ' err' : ''}">
      <span class="pca-ico">${PINN_CAL_SRC_ICON[art]}</span>
      <span class="pca-txt"><b>${escapeHtml(st.konto || PINN_CAL_SRC_LABEL[art])}</b><small>${st.fehler ? '⚠️ ' + escapeHtml(st.fehler) : PINN_CAL_SRC_LABEL[art] + '-Konto'}</small></span>
      <button type="button" class="pc-edit" data-pca="${art}">Kalender wählen</button>
    </div>`;
  }).join('');
}

function renderPinnCalSettings() {
  const list = document.getElementById('pinnCalList');
  if (!list) return;
  const guest = isCurrentUserGuest();
  document.getElementById('pinnCalBtns').classList.toggle('hidden', guest);
  const mine = pinnCals.filter(c => c.mein);
  const order = [...mine.filter(c => !c.geteilt), ...mine.filter(c => c.geteilt)];
  list.innerHTML = order.map(c => `<li class="pinn-cal-item">
      <span class="pc-dot" style="background:${escapeHtml(c.farbe || PINN_CAL_COLORS[0])}"></span>
      <span class="pc-txt"><b>${escapeHtml(c.name)}</b><small>${pinnCalSubLabel(c)}</small>${c.fehler ? `<small class="err">⚠️ ${escapeHtml(c.fehler)}</small>` : ''}</span>
      ${c.darf ? `<button type="button" class="pc-edit" data-pinncal="${escapeHtml(c.id)}">Bearbeiten</button>` : ''}
    </li>`).join('');
  // Other people's family calendars: only as a hint about which (masked) account they come from
  const fam = pinnCals.filter(c => c.geteilt && !c.mein);
  const famBox = document.getElementById('pinnCalFamily');
  famBox.classList.toggle('hidden', !fam.length);
  famBox.innerHTML = fam.length ? `<p class="pcf-title">👨‍👩‍👧 Familienkalender</p>` + fam.map(c => `<div class="pcf-row">
      <span class="pc-dot" style="background:${escapeHtml(c.farbe || PINN_CAL_COLORS[0])}"></span>
      <span class="pcf-txt"><b>${escapeHtml(c.name)}</b><small>${c.quelle
        ? 'über ' + escapeHtml(c.konto || PINN_CAL_SRC_LABEL[c.quelle]) + ' · ' + PINN_CAL_SRC_LABEL[c.quelle]
        : 'von ' + escapeHtml(c.von || 'der Familie') + ' · pinn.'}${c.nurLesen ? ' · nur lesen' : ''}</small></span>
    </div>`).join('') : '';
  renderPinnCalLegacy();
  renderPinnCalAccounts();
}
document.getElementById('pinnCalList').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-pinncal]');
  if (!btn) return;
  const c = pinnCals.find(x => x.id === btn.dataset.pinncal);
  if (c) openPinnCalModal(c);
});
document.getElementById('pinnCalAccounts').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-pca]');
  if (btn) openPinnCalModal(null, { quelle: btn.dataset.pca });
});
document.getElementById('settingsCalendarAccordion').addEventListener('toggle', (ev) => {
  if (!ev.target.open) return;
  renderPinnCalSettings();
  if (!isCurrentUserGuest()) loadPinnCalKonten();
});

async function loadPinnCalKonten() {
  try {
    const res = await apiFetch('/api/pinn/kalender/konten?origin=' + encodeURIComponent(location.origin));
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(body.error || 'Konten konnten nicht geladen werden.');
    pinnCalKonten = body;
    pinnCalKontenErr = '';
  } catch (err) {
    pinnCalKonten = null;
    pinnCalKontenErr = pinnCalErrorText(err);
  }
  renderPinnCalAccounts();
  renderPinnCalSource();
}

/* ----- Form „Kalender hinzufügen“ / „Kalender bearbeiten“ ----- */
let pinnCalEditing = null;   // Calendar being edited, null = add
let pinnCalColor = PINN_CAL_COLORS[0];
let pinnCalShared = false;   // Calendar without an account or while editing: „Familie“ ticked
let pinnCalSource = 'apple'; // 'apple' | 'google' | '' (without an account, pinn. server only)
let pinnCalExtern = { apple: null, google: null };   // Calendars of the accounts (null = not loaded yet)
let pinnCalExternErr = { apple: '', google: '' };
let pinnCalSel = { apple: {}, google: {} };          // href -> 'ich' | 'familie' | '' (ticked)
let pinnCalSelOrig = { apple: {}, google: {} };      // State from the server
let pinnCalSrcBusy = false;
let pinnCalSrcMsg = '';

function pinnCalChecks(cur, attrs, locked) {
  return ['ich', 'familie'].map(z => `<button type="button" class="pcs-chk${cur === z ? ' on' : ''}" data-ziel="${z}" ${attrs}${locked ? ' disabled' : ''} aria-label="${z === 'ich' ? 'Für mich' : 'Familie'}" aria-pressed="${cur === z}"></button>`).join('');
}
function pinnCalTableHead(first) {
  return `<div class="pcs-row head"><span>${first}</span><span>Für mich</span><span>Familie</span></div>`;
}

function renderPinnCalSource() {
  const wrap = document.getElementById('pinnCalSourceWrap');
  const body = document.getElementById('pinnCalSourceBody');
  const seg = document.getElementById('pinnCalSourceSeg');
  if (!wrap || !body) return;
  const adding = !pinnCalEditing;
  wrap.classList.toggle('hidden', !adding);
  document.getElementById('pinnCalOwnBox').classList.toggle('hidden', adding && !!pinnCalSource);
  const saveBtn = document.getElementById('pinnCalSaveBtn');
  if (!adding) return;
  seg.querySelectorAll('[data-src]').forEach(b => {
    b.classList.toggle('on', b.dataset.src === pinnCalSource);
    b.disabled = pinnCalSrcBusy;
  });
  const msg = pinnCalSrcMsg ? `<p class="${/^✓/.test(pinnCalSrcMsg) ? 'pcs-ok' : 'pcs-err'}">${escapeHtml(pinnCalSrcMsg)}</p>` : '';
  if (!pinnCalSource) {
    body.innerHTML = '<p>Ohne Konto – die Termine liegen nur auf eurem pinn.-Server und sind nur in pinn. sichtbar.</p>';
    saveBtn.classList.remove('hidden');
    saveBtn.textContent = 'Anlegen';
    return;
  }
  const art = pinnCalSource;
  const lbl = PINN_CAL_SRC_LABEL[art];
  saveBtn.classList.add('hidden');
  if (!pinnCalKonten) {
    body.innerHTML = pinnCalKontenErr ? `<p class="pcs-err">${escapeHtml(pinnCalKontenErr)}</p><button type="button" class="pcs-link" data-pcs="konten">Erneut versuchen</button>` : '<p>Lade …</p>';
    return;
  }
  const st = pinnCalKonten[art] || {};
  if (art === 'google' && !st.verfuegbar) {
    const uri = st.weiterleitung || (location.origin + '/api/pinn/google/callback');
    body.innerHTML = `<p><b>Google ist auf eurem pinn.-Server noch nicht freigeschaltet.</b></p>
      ${st.einrichtbar ? `<p>Einmalig die Zugangsdaten aus der Google Cloud Console eintragen (APIs und Dienste → Anmeldedaten → OAuth-Client vom Typ „Webanwendung“):</p>
        <input id="pinnCalGClientId" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" placeholder="Client-ID (…apps.googleusercontent.com)" />
        <input id="pinnCalGClientSecret" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="Clientschlüssel (Client Secret)" />
        <small style="margin-bottom:0.4rem">Autorisierte Weiterleitungs-URI im OAuth-Client:</small>
        <code class="pcs-code">${escapeHtml(uri)}</code>
        <small style="margin-bottom:0.5rem">Im Cloud-Projekt aktivieren: „Google Calendar API“ und „CalDAV API“. Stehen die Werte schon in der .env? Dann reicht es auch, den Container mit „docker compose up -d“ neu zu erstellen – ein einfacher Neustart liest die .env nicht neu ein.</small>
        ${msg}
        <button type="button" class="pcs-btn" id="pinnCalGClientSave"${pinnCalSrcBusy ? ' disabled' : ''}>${pinnCalSrcBusy ? 'Speichere …' : 'Google freischalten'}</button>`
      : `<p>Das kann ein Admin eurer Familie hier einmalig einrichten.</p>${msg}`}`;
    return;
  }
  if (!st.verbunden) {
    if (art === 'apple') {
      const prevId = (document.getElementById('pinnCalAppleId') || {}).value || '';
      body.innerHTML = `<p>Melde dich mit <b>deiner</b> Apple-ID an – danach wählst du die Kalender aus.</p>
        <input id="pinnCalAppleId" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" enterkeyhint="next" placeholder="Apple-ID (E-Mail)" value="${escapeHtml(prevId)}" />
        <input id="pinnCalApplePw" type="password" autocomplete="off" enterkeyhint="go" placeholder="App-spezifisches Passwort (xxxx-xxxx-xxxx-xxxx)" />
        <small style="margin-bottom:0.5rem">Erstellen unter account.apple.com → Anmeldung und Sicherheit → App-spezifische Passwörter. Es liegt verschlüsselt auf eurem NAS.</small>
        ${msg}
        <button type="button" class="pcs-btn" id="pinnCalAppleConnect"${pinnCalSrcBusy ? ' disabled' : ''}>${pinnCalSrcBusy ? 'Prüfe bei iCloud …' : 'Mit iCloud anmelden'}</button>`;
    } else {
      body.innerHTML = `<p>Melde dich mit <b>deinem</b> Google-Konto an – danach wählst du die Kalender aus.</p>
        ${msg}
        <button type="button" class="pcs-btn" id="pinnCalGoogleConnect"${pinnCalSrcBusy ? ' disabled' : ''}>${pinnCalSrcBusy ? 'Weiter zu Google …' : 'Mit Google anmelden'}</button>`;
    }
    return;
  }
  const list = pinnCalExtern[art];
  let picker;
  if (list === null) {
    picker = '<p>Kalender werden geladen …</p>';
  } else if (pinnCalExternErr[art]) {
    picker = `<p class="pcs-err">${escapeHtml(pinnCalExternErr[art])}</p><button type="button" class="pcs-link" data-pcs="reload">Erneut laden</button>`;
  } else if (!list.length) {
    picker = '<p>In diesem Konto wurden keine Kalender gefunden.</p>';
  } else {
    const sel = pinnCalSel[art];
    picker = `<div class="pcs-tbl">${pinnCalTableHead('Kalender')}${list.map((c, i) => `<div class="pcs-row">
        <span class="pcs-name">${escapeHtml(c.name)}${c.nurLesen ? '<small>nur lesen</small>' : ''}</span>
        ${pinnCalChecks(sel[c.href] || '', `data-i="${i}"`, pinnCalSrcBusy)}
      </div>`).join('')}</div>
      <small style="margin-top:0.5rem">„Für mich“ siehst nur du. „Familie“ sehen und nutzen alle in eurer Familie – sie erfahren nur, über welches Konto der Kalender kommt (unkenntlich, z. B. m**l@g***l.com). Termine landen direkt in ${lbl}.</small>`;
    saveBtn.classList.remove('hidden');
    saveBtn.textContent = 'Übernehmen';
  }
  body.innerHTML = `<div class="pcs-acc"><span>${PINN_CAL_SRC_ICON[art]} ${escapeHtml(st.konto || lbl)}</span><button type="button" class="pcs-link red" data-pcs="trennen">Abmelden</button></div>
    ${st.fehler ? `<p class="pcs-err">${escapeHtml(st.fehler)}</p>` : ''}${msg}${picker}`;
}

function renderPinnCalModalParts() {
  const box = document.getElementById('pinnCalColors');
  box.innerHTML = PINN_CAL_COLORS.map(col => `<button type="button" data-col="${col}" class="${col === pinnCalColor ? 'on' : ''}" style="background:${col}" aria-label="Farbe ${col}"></button>`).join('');
  const c = pinnCalEditing;
  const locked = !!(c && !c.mein);
  document.getElementById('pinnCalVisRow').innerHTML = pinnCalTableHead('Sichtbar für') + `<div class="pcs-row">
      <span class="pcs-name">${escapeHtml((document.getElementById('pinnCalNameInput').value || '').trim() || (c ? c.name : 'Neuer Kalender'))}</span>
      ${pinnCalChecks(pinnCalShared ? 'familie' : 'ich', 'data-own="1"', locked)}
    </div>`;
  let hint;
  if (locked) hint = 'Ob der Kalender für die Familie ist, entscheidet nur, wer ihn angelegt hat.';
  else if (c && c.quelle) hint = `Verknüpft mit deinem ${PINN_CAL_SRC_LABEL[c.quelle]}-Kalender „${c.externName || c.name}“${c.nurLesen ? ' (nur lesen)' : ''}${c.konto ? ' · ' + c.konto : ''}.`;
  else hint = pinnCalShared ? 'Alle in eurer Familie sehen den Kalender und können Termine darin anlegen.' : 'Nur du siehst diesen Kalender und seine Termine.';
  document.getElementById('pinnCalShareHint').textContent = hint;
  document.getElementById('pinnCalDeleteBtn').textContent = (c && c.quelle) ? 'Entfernen' : 'Löschen';
  renderPinnCalSource();
}

function openPinnCalModal(cal, opts) {
  opts = opts || {};
  pinnCalEditing = cal || null;
  const used = pinnCals.map(c => (c.farbe || '').toUpperCase());
  pinnCalColor = cal ? (cal.farbe || PINN_CAL_COLORS[0]) : (PINN_CAL_COLORS.find(c => !used.includes(c.toUpperCase())) || PINN_CAL_COLORS[pinnCals.length % PINN_CAL_COLORS.length]);
  pinnCalShared = cal ? !!cal.geteilt : false;
  if (!cal) {
    if (opts.quelle !== undefined) pinnCalSource = opts.quelle;
    else if (pinnCalKonten && pinnCalKonten.google && pinnCalKonten.google.verbunden && !(pinnCalKonten.apple && pinnCalKonten.apple.verbunden)) pinnCalSource = 'google';
    else pinnCalSource = 'apple';
  }
  pinnCalSrcBusy = false;
  pinnCalSrcMsg = opts.msg || '';
  pinnCalExtern = { apple: null, google: null };
  pinnCalExternErr = { apple: '', google: '' };
  pinnCalSel = { apple: {}, google: {} };
  pinnCalSelOrig = { apple: {}, google: {} };
  document.getElementById('pinnCalModalTitle').textContent = cal ? 'Kalender bearbeiten' : 'Kalender hinzufügen';
  const saveBtn = document.getElementById('pinnCalSaveBtn');
  saveBtn.textContent = cal ? 'Speichern' : 'Anlegen';
  saveBtn.classList.remove('hidden');
  document.getElementById('pinnCalNameInput').value = cal ? cal.name : '';
  document.getElementById('pinnCalModalStatus').textContent = '';
  document.getElementById('pinnCalDeleteBtn').classList.toggle('hidden', !cal);
  renderPinnCalModalParts();
  document.getElementById('pinnCalModal').classList.remove('hidden');
  armModalSnapshot('pinnCalModal');
  if (!cal) loadPinnCalKonten().then(() => pinnCalEnsureExtern());
}
// Load the calendars of the chosen account as soon as it is connected
function pinnCalEnsureExtern() {
  const art = pinnCalSource;
  if (!art || pinnCalEditing || !pinnCalKonten || !pinnCalKonten[art] || !pinnCalKonten[art].verbunden) return;
  if (pinnCalExtern[art] === null) loadPinnCalExtern(art);
}
async function loadPinnCalExtern(art) {
  pinnCalExtern[art] = null;
  pinnCalExternErr[art] = '';
  renderPinnCalSource();
  try {
    const res = await postJson('/api/pinn/kalender/konten/liste', { art });
    pinnCalSetExtern(art, Array.isArray(res.extern) ? res.extern : []);
  } catch (err) {
    pinnCalExtern[art] = [];
    pinnCalExternErr[art] = pinnCalErrorText(err);
  }
  renderPinnCalSource();
}
function pinnCalSetExtern(art, list) {
  pinnCalExtern[art] = list;
  pinnCalSel[art] = {};
  pinnCalSelOrig[art] = {};
  list.forEach(c => { pinnCalSel[art][c.href] = c.ziel || ''; pinnCalSelOrig[art][c.href] = c.ziel || ''; });
}
function pinnCalSelChanges(art) {
  const out = [];
  Object.keys(pinnCalSel[art] || {}).forEach(href => {
    if ((pinnCalSel[art][href] || '') !== (pinnCalSelOrig[art][href] || '')) out.push({ href, ziel: pinnCalSel[art][href] || '' });
  });
  return out;
}
function closePinnCalModal() { document.getElementById('pinnCalModal').classList.add('hidden'); }
function attemptClosePinnCalModal() {
  const pending = !pinnCalEditing && pinnCalSource && pinnCalSelChanges(pinnCalSource).length;
  if (pending) {
    if (!confirm('Wirklich abbrechen? Deine Auswahl wird nicht übernommen.')) return;
    closePinnCalModal();
    return;
  }
  attemptCloseModal('pinnCalModal', closePinnCalModal);
}
document.getElementById('pinnCalAddBtn').addEventListener('click', () => openPinnCalModal(null));
document.getElementById('pinnCalCancelBtn').addEventListener('click', attemptClosePinnCalModal);
document.getElementById('pinnCalModal').addEventListener('click', (ev) => {
  if (ev.target.id === 'pinnCalModal') attemptClosePinnCalModal();
});
document.getElementById('pinnCalColors').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-col]');
  if (!b) return;
  pinnCalColor = b.dataset.col;
  renderPinnCalModalParts();
});
document.getElementById('pinnCalNameInput').addEventListener('input', () => {
  const n = document.querySelector('#pinnCalVisRow .pcs-row:not(.head) .pcs-name');
  if (n) n.textContent = document.getElementById('pinnCalNameInput').value.trim() || (pinnCalEditing ? pinnCalEditing.name : 'Neuer Kalender');
});
// Tick for the own calendar (without an account / editing): exactly one column
document.getElementById('pinnCalVisRow').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-own]');
  if (!b || b.disabled) return;
  pinnCalShared = b.dataset.ziel === 'familie';
  renderPinnCalModalParts();
});
document.getElementById('pinnCalSourceSeg').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-src]');
  if (!b || b.disabled || pinnCalEditing) return;
  pinnCalSource = b.dataset.src;
  pinnCalSrcMsg = '';
  document.getElementById('pinnCalModalStatus').textContent = '';
  renderPinnCalModalParts();
  if (!pinnCalSource) setTimeout(() => { try { document.getElementById('pinnCalNameInput').focus(); } catch (e) { /* ignore */ } }, 60);
  pinnCalEnsureExtern();
});
document.getElementById('pinnCalSourceBody').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  if (ev.target.id === 'pinnCalAppleId') { ev.preventDefault(); document.getElementById('pinnCalApplePw').focus(); }
  else if (ev.target.id === 'pinnCalApplePw') { ev.preventDefault(); ev.target.blur(); pinnCalConnectApple(); }
  else if (ev.target.id === 'pinnCalGClientId') { ev.preventDefault(); document.getElementById('pinnCalGClientSecret').focus(); }
  else if (ev.target.id === 'pinnCalGClientSecret') { ev.preventDefault(); ev.target.blur(); pinnCalSaveGoogleClient(); }
});
// Keep the input fields in the form visible when the keyboard appears
document.getElementById('pinnCalModal').addEventListener('focusin', (ev) => {
  if (!ev.target.matches('input')) return;
  setTimeout(() => { try { ev.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ignore */ } }, 300);
});
async function pinnCalConnectApple() {
  const appleId = (document.getElementById('pinnCalAppleId').value || '').trim();
  const appPassword = (document.getElementById('pinnCalApplePw').value || '').trim();
  if (!appleId || !appPassword) { pinnCalSrcMsg = 'Bitte Apple-ID und App-spezifisches Passwort eingeben.'; renderPinnCalSource(); return; }
  pinnCalSrcBusy = true;
  pinnCalSrcMsg = '';
  renderPinnCalSource();
  try {
    const res = await postJson('/api/pinn/kalender/konten/apple', { appleId, appPassword, origin: location.origin });
    pinnCalKonten = res.konten || pinnCalKonten;
    pinnCalSetExtern('apple', Array.isArray(res.extern) ? res.extern : []);
    pinnCalSrcMsg = '✓ Angemeldet – jetzt die Kalender anhaken.';
    renderPinnCalAccounts();
  } catch (err) {
    pinnCalSrcMsg = pinnCalErrorText(err);
  } finally {
    pinnCalSrcBusy = false;
    renderPinnCalSource();
  }
}
async function pinnCalSaveGoogleClient() {
  const clientId = (document.getElementById('pinnCalGClientId').value || '').trim();
  const clientSecret = (document.getElementById('pinnCalGClientSecret').value || '').trim();
  if (!clientId || !clientSecret) { pinnCalSrcMsg = 'Bitte Client-ID und Clientschlüssel eintragen.'; renderPinnCalSource(); return; }
  pinnCalSrcBusy = true;
  pinnCalSrcMsg = '';
  renderPinnCalSource();
  try {
    const res = await postJson('/api/pinn/kalender/konten/google-client', { clientId, clientSecret, origin: location.origin });
    if (res.konten) pinnCalKonten = res.konten; else await loadPinnCalKonten();
    pinnCalSrcMsg = '✓ Google ist freigeschaltet – jetzt anmelden.';
  } catch (err) {
    pinnCalSrcMsg = pinnCalErrorText(err);
  } finally {
    pinnCalSrcBusy = false;
    renderPinnCalSource();
  }
}
document.getElementById('pinnCalSourceBody').addEventListener('click', async (ev) => {
  // Ticks in the account's calendar list: one column per calendar, tap again = untick
  const chk = ev.target.closest('.pcs-chk[data-i]');
  if (chk) {
    if (chk.disabled) return;
    const art = pinnCalSource;
    const cal = (pinnCalExtern[art] || [])[parseInt(chk.dataset.i, 10)];
    if (!cal) return;
    const z = chk.dataset.ziel;
    pinnCalSel[art][cal.href] = pinnCalSel[art][cal.href] === z ? '' : z;
    const row = chk.parentElement;
    row.querySelectorAll('.pcs-chk').forEach(b => {
      const on = pinnCalSel[art][cal.href] === b.dataset.ziel;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.getElementById('pinnCalModalStatus').textContent = '';
    return;
  }
  if (ev.target.closest('#pinnCalAppleConnect')) { pinnCalConnectApple(); return; }
  if (ev.target.closest('#pinnCalGClientSave')) { pinnCalSaveGoogleClient(); return; }
  if (ev.target.closest('#pinnCalGoogleConnect')) {
    pinnCalSrcBusy = true;
    pinnCalSrcMsg = '';
    renderPinnCalSource();
    try {
      const r = await postJson('/api/pinn/kalender/konten/google/start', { origin: location.origin });
      if (!r.url) throw new Error('Google-Anmeldung konnte nicht gestartet werden.');
      location.href = r.url; // Google asks for the account and permission and sends the user back to pinn.
    } catch (err) {
      pinnCalSrcBusy = false;
      pinnCalSrcMsg = pinnCalErrorText(err);
      renderPinnCalSource();
    }
    return;
  }
  const act = ev.target.closest('[data-pcs]');
  if (!act) return;
  const art = pinnCalSource;
  if (act.dataset.pcs === 'konten') { loadPinnCalKonten().then(() => pinnCalEnsureExtern()); return; }
  if (act.dataset.pcs === 'reload') { loadPinnCalExtern(art); return; }
  if (act.dataset.pcs === 'trennen') {
    const lbl = PINN_CAL_SRC_LABEL[art];
    const n = pinnCals.filter(c => c.mein && c.quelle === art).length;
    if (!confirm(`Von deinem ${lbl}-Konto abmelden?` + (n ? ` Deine ${n} Kalender daraus verschwinden aus pinn. – auch die für die Familie. In ${lbl} bleiben sie mit allen Terminen erhalten.` : ''))) return;
    try {
      const res = await postJson('/api/pinn/kalender/konten/trennen', { art, origin: location.origin });
      pinnCalKonten = res.konten || null;
      pinnCalExtern[art] = null;
      pinnCalSel[art] = {};
      pinnCalSelOrig[art] = {};
      pinnCalSrcMsg = '';
      renderPinnCalSource();
      await pinnCalAfterChange(res);
    } catch (err) {
      pinnCalSrcMsg = pinnCalErrorText(err);
      renderPinnCalSource();
    }
  }
});
function pinnCalErrorText(err) {
  if (navigator.onLine === false) return 'Keine Verbindung – Kalender lassen sich nur mit Verbindung zum NAS hinzufügen und ändern.';
  if (/404|Not Found/i.test(err && err.message)) return 'Auf dem NAS fehlt noch der Server-Teil (pb_hooks/kalender.pb.js, pinn-kalender.js und pinn-kalender-konten.js).';
  return (err && err.message) || 'Aktion fehlgeschlagen.';
}
async function pinnCalAfterChange(res) {
  if (res && Array.isArray(res.kalender)) setPinnCals(res.kalender);
  renderPinnCalSettings();
  await syncAppleCalendarFile(true); // Fetch the calendar file fresh (new calendars/events)
}
// Take over the ticks from an account
async function pinnCalSaveSelection() {
  const art = pinnCalSource;
  const st = document.getElementById('pinnCalModalStatus');
  const changes = pinnCalSelChanges(art);
  if (!changes.length) { closePinnCalModal(); return; }
  const removing = changes.filter(c => !c.ziel).length;
  if (removing && !confirm(`${removing} Kalender aus pinn. entfernen? In ${PINN_CAL_SRC_LABEL[art]} bleiben sie mit allen Terminen erhalten.`)) return;
  const btn = document.getElementById('pinnCalSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Übernehme …';
  pinnCalSrcBusy = true;
  st.textContent = '';
  try {
    const res = await postJson('/api/pinn/kalender/konten/auswahl', { art, auswahl: changes });
    closePinnCalModal();
    document.getElementById('pinnCalStatus').textContent = res.hinweis || 'Auswahl übernommen.';
    await pinnCalAfterChange(res);
  } catch (err) {
    st.textContent = pinnCalErrorText(err);
  } finally {
    pinnCalSrcBusy = false;
    btn.disabled = false;
    btn.textContent = 'Übernehmen';
    renderPinnCalSource();
  }
}
document.getElementById('pinnCalSaveBtn').addEventListener('click', async () => {
  if (!pinnCalEditing && pinnCalSource) { pinnCalSaveSelection(); return; }
  const name = document.getElementById('pinnCalNameInput').value.trim();
  const st = document.getElementById('pinnCalModalStatus');
  if (!name) { st.textContent = 'Bitte einen Namen eingeben.'; return; }
  const btn = document.getElementById('pinnCalSaveBtn');
  btn.disabled = true;
  st.textContent = '';
  try {
    const payload = { name, farbe: pinnCalColor };
    if (pinnCalEditing) payload.id = pinnCalEditing.id;
    if (!pinnCalEditing || pinnCalEditing.mein) payload.geteilt = pinnCalShared;
    const res = await postJson('/api/pinn/kalender/eigene/speichern', payload);
    closePinnCalModal();
    document.getElementById('pinnCalStatus').textContent = pinnCalEditing
      ? 'Kalender gespeichert.'
      : `Kalender „${name}“ angelegt – er steht jetzt beim Anlegen von Terminen zur Auswahl.`;
    await pinnCalAfterChange(res);
  } catch (err) {
    st.textContent = pinnCalErrorText(err);
  } finally {
    btn.disabled = false;
    btn.textContent = pinnCalEditing ? 'Speichern' : 'Anlegen';
  }
});
document.getElementById('pinnCalDeleteBtn').addEventListener('click', async () => {
  const c = pinnCalEditing;
  if (!c) return;
  const who = c.geteilt ? ' für die ganze Familie' : '';
  const q = c.quelle
    ? `„${c.name}“ aus pinn. entfernen?${c.geteilt ? ' Auch die Familie sieht ihn dann nicht mehr.' : ''} In ${PINN_CAL_SRC_LABEL[c.quelle]} bleibt er mit allen Terminen erhalten.`
    : `Kalender „${c.name}“ mit allen seinen Terminen${who} löschen? Das kann nicht rückgängig gemacht werden.`;
  if (!confirm(q)) return;
  const st = document.getElementById('pinnCalModalStatus');
  try {
    const res = await postJson('/api/pinn/kalender/eigene/loeschen', { id: c.id });
    closePinnCalModal();
    document.getElementById('pinnCalStatus').textContent = c.quelle ? `„${c.name}“ entfernt.` : `Kalender „${c.name}“ gelöscht.`;
    await pinnCalAfterChange(res);
  } catch (err) {
    st.textContent = pinnCalErrorText(err);
  }
});
// Return from the Google sign-in (/?google=…&privat=1)
async function pinnCalGoogleReturn(result, reason, note) {
  setView('einstellungen');
  const acc = document.getElementById('settingsCalendarAccordion');
  if (acc && !acc.open) acc.open = true;
  setTimeout(() => { try { document.getElementById('settingsCalendarAccordion').scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* ignore */ } }, 120);
  openPinnCalModal(null, {
    quelle: 'google',
    msg: result === 'verbunden'
      ? (note ? 'Angemeldet. Achtung: ' + note : '✓ Bei Google angemeldet – jetzt die Kalender anhaken.')
      : (reason || 'Google-Konto konnte nicht verbunden werden.'),
  });
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('kalenderkonto');

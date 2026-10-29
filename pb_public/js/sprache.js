/* pinn. – Settings → Language & region (js/sprache.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the language dropdown, country, currency, number format and temperature unit with a live preview (renderLanguageSettings,
   renderRegionSettings, renderRegionPreview, initLanguageSettings) and saving them (remembered on the device, stored in the
   profile, then pinn. reloads). Also i18nT (overridden later by the definition in js/smarthome.js, as before).
   Texts: key based since 1.111.0 – tk('settings.region.…') here, data-tk in src/teile/seiten/einstellungen.html,
   texts in pb_public/i18n/<code>.i18n.js. */

/* ---------- Language & region (Settings → Language & region) ----------
   The languages are in PINN_LANGUAGES, countries, currencies and emergency numbers in PINN_REGION (both
   at the top in <head>). Chosen in the dropdowns, applied only with „Speichern“: remembered on the device,
   stored in the profile (applies on all devices) and pinn. reloads – the switch needs the
   original texts of the page or the newly set formatters. Country and currency names come
   from the browser in the chosen language (Intl.DisplayNames), there is no translation list for them. */
function pinnLangCode() {
  return (window.PINN_I18N && PINN_I18N.stored()) || 'en';
}
let langPendingCode = '';
let regionPending = null;
function i18nT(s) { return window.PINN_I18N ? PINN_I18N.t(s) : s; }
function renderLanguageSettings() {
  const btn = document.getElementById('langDdBtn');
  if (!btn || !window.PINN_LANGUAGES) return;
  // Hidden languages (prepared, not offered yet) stay out of the list
  const langs = window.PINN_I18N && PINN_I18N.available ? PINN_I18N.available() : window.PINN_LANGUAGES;
  if (!langPendingCode || !langs.some(l => l.code === langPendingCode)) langPendingCode = (window.PINN_I18N && PINN_I18N.current) || 'en';
  const sel = langs.find(l => l.code === langPendingCode) || langs[0];
  document.getElementById('langDdFlag').innerHTML = sel.flag;
  document.getElementById('langDdName').textContent = sel.name;
  const list = document.getElementById('langDdList');
  list.innerHTML = langs.map(l => `<button type="button" role="option" class="lang-dd-opt${l.code === sel.code ? ' sel' : ''}" data-lang="${l.code}" aria-selected="${l.code === sel.code}">`
    + `<span class="lang-flag">${l.flag}</span><span>${escapeHtml(l.name)}</span><span class="lang-dd-check">✓</span></button>`).join('');
}
function renderRegionSettings() {
  const R = window.PINN_REGION;
  const cSel = document.getElementById('regionCountrySelect');
  if (!R || !cSel) return;
  if (!regionPending) regionPending = R.stored();
  const p = regionPending;
  // Country: alphabetical in the app's language, with flag
  const countries = R.COUNTRIES.map(r => ({ code: r[0], name: R.countryName(r[0]) }))
    .sort((a, b) => a.name.localeCompare(b.name, (window.PINN_I18N && PINN_I18N.language.locale) || undefined));
  cSel.innerHTML = countries.map(c => `<option value="${c.code}">${escapeHtml((R.flag(c.code) + ' ' + c.name).trim())}</option>`).join('');
  cSel.value = p.land;
  // Currency: „Automatisch“ = currency of the country
  const row = R.country(p.land);
  const autoCur = row ? row[2] : R.currency;
  const curLabel = c => `${c} · ${R.currencyName(c)}`;
  const wSel = document.getElementById('regionCurrencySelect');
  wSel.innerHTML = `<option value="auto">${escapeHtml(tk('settings.region.automatic') + ' – ' + curLabel(autoCur))}</option>`
    + R.CURRENCIES.map(c => `<option value="${c}">${escapeHtml(curLabel(c))}</option>`).join('');
  wSel.value = p.waehrung;
  // Number format: „Automatisch“ = as usual in the country
  const fSel = document.getElementById('regionFormatSelect');
  fSel.innerHTML = `<option value="auto">${escapeHtml(tk('settings.region.automaticCountry') + ' – ' + R.numSample(p.land))}</option>`
    + Object.keys(R.FORMATS).map(k => `<option value="${k}">${escapeHtml(R.FORMATS[k].sample)}</option>`).join('');
  fSel.value = p.zahlen;
  // Temperature: „Automatisch“ = Fahrenheit in the USA (and a few other countries), Celsius elsewhere
  const tSel = document.getElementById('regionTempSelect');
  if (tSel) {
    const autoF = R.FAHRENHEIT && R.FAHRENHEIT.includes(p.land);
    const unitLabel = u => tk(u === 'F' ? 'settings.region.fahrenheit' : 'settings.region.celsius');
    tSel.innerHTML = `<option value="auto">${escapeHtml(tk('settings.region.automaticCountry') + ' – ' + unitLabel(autoF ? 'F' : 'C'))}</option>`
      + ['C', 'F'].map(u => `<option value="${u}">${escapeHtml(unitLabel(u))}</option>`).join('');
    tSel.value = p.temperatur || 'auto';
  }
  renderRegionPreview();
}
function renderRegionPreview() {
  const R = window.PINN_REGION;
  const box = document.getElementById('regionPreview');
  if (!R || !box || !regionPending) return;
  const pv = R.preview(regionPending);
  const n = pv.notruf;
  const call = (ic, label, nr) => `<span class="rp-call"><span>${ic}</span>${escapeHtml(tk(label))} <b>${escapeHtml(nr)}</b></span>`;
  const calls = [];
  if (n.polizei === n.rettung && n.rettung === n.feuer) calls.push(call('🆘', 'emergency.call', n.polizei));
  else {
    calls.push(call('🚓', 'emergency.police', n.polizei));
    if (n.rettung === n.feuer) calls.push(call('🚑', 'emergency.ambulanceFire', n.rettung));
    else { calls.push(call('🚑', 'emergency.ambulance', n.rettung)); calls.push(call('🚒', 'emergency.fire', n.feuer)); }
  }
  if (n.allgemein && ![n.polizei, n.rettung, n.feuer].includes(n.allgemein)) calls.push(call('🆘', 'emergency.general', n.allgemein));
  box.innerHTML = `
    <div class="rp-k">${escapeHtml(tk('settings.region.example'))}</div>
    <div class="rp-money">${escapeHtml(pv.money)} · 🌡️ ${escapeHtml(String(R.temp(21, pv.tempUnit)) + (pv.tempUnit === 'F' ? ' °F' : ' °C'))}</div>
    <div class="rp-k mt-3">${escapeHtml(tk('settings.region.emergencyNumbers'))} · ${escapeHtml((R.flag(pv.row[0]) + ' ' + R.countryName(pv.row[0])).trim())}</div>
    <div class="rp-calls">${calls.join('')}</div>
    <p class="rp-note">${escapeHtml(tk('settings.region.appliesTo'))}</p>`;
}
function setLanguageDropdown(open) {
  const dd = document.getElementById('langDropdown');
  if (!dd) return;
  dd.classList.toggle('open', open);
  document.getElementById('langDdList').classList.toggle('hidden', !open);
  document.getElementById('langDdBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
}
function initLanguageSettings() {
  const btn = document.getElementById('langDdBtn');
  if (!btn) return;
  renderLanguageSettings();
  renderRegionSettings();
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setLanguageDropdown(document.getElementById('langDdList').classList.contains('hidden'));
  });
  document.getElementById('langDdList').addEventListener('click', (e) => {
    const opt = e.target.closest('[data-lang]');
    if (!opt) return;
    e.stopPropagation();
    langPendingCode = opt.dataset.lang;
    document.getElementById('langStatus').textContent = '';
    renderLanguageSettings();
    setLanguageDropdown(false);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#langDropdown')) setLanguageDropdown(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setLanguageDropdown(false); });
  // Changing the country: currency and number format „Automatisch“ follow the country
  document.getElementById('regionCountrySelect').addEventListener('change', (e) => {
    if (!regionPending) regionPending = PINN_REGION.stored();
    regionPending.land = e.target.value;
    document.getElementById('langStatus').textContent = '';
    renderRegionSettings();
  });
  document.getElementById('regionCurrencySelect').addEventListener('change', (e) => {
    if (!regionPending) regionPending = PINN_REGION.stored();
    regionPending.waehrung = e.target.value;
    document.getElementById('langStatus').textContent = '';
    renderRegionPreview();
  });
  document.getElementById('regionFormatSelect').addEventListener('change', (e) => {
    if (!regionPending) regionPending = PINN_REGION.stored();
    regionPending.zahlen = e.target.value;
    document.getElementById('langStatus').textContent = '';
    renderRegionPreview();
  });
  document.getElementById('regionTempSelect').addEventListener('change', (e) => {
    if (!regionPending) regionPending = PINN_REGION.stored();
    regionPending.temperatur = e.target.value;
    document.getElementById('langStatus').textContent = '';
    renderRegionPreview();
  });
  document.getElementById('langSaveBtn').addEventListener('click', async () => {
    const status = document.getElementById('langStatus');
    const code = langPendingCode;
    if (!window.PINN_I18N || !PINN_I18N.find(code)) return;
    const langChanged = code !== PINN_I18N.current;
    const regionChanged = window.PINN_REGION && regionPending ? PINN_REGION.save(regionPending) : false;
    if (!langChanged && !regionChanged) { status.textContent = tk('settings.region.alreadyActive'); return; }
    PINN_I18N.switchTo(code, true); // remember first, reloading happens after saving in the profile
    status.textContent = tk('settings.region.savedReloading');
    if (currentUser()) {
      personalDesign = { werte: currentDesignValues(), stand: Date.now() };
      writeDesignCache(true);
      clearTimeout(personalDesignSaveTimer);
      // Offline: the state stays remembered as „pending“ and is sent after reloading
      try { await Promise.race([pushPersonalDesign(), new Promise(r => setTimeout(r, 3000))]); } catch (e) { /* later */ }
    }
    try { sessionStorage.removeItem('pinn.sprache.reload'); sessionStorage.removeItem('pinn.region.reload'); } catch (e) { /* ignore */ }
    location.reload();
  });
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('sprache');

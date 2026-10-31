/* pinn. – Languages (js/sprachen.js)
   Part of the app code that used to be an inline script in the <head> of index.html (since 1.100.0 its own file,
   loaded with <script src> at exactly the same place). Classic script, no build step. It must run while the
   page is being parsed: after js/textkern.js and before js/region.js, PocketBase and all other files in js/.
   The text file of the chosen language (i18n/<code>.i18n.js) is added with document.write right behind this
   script, so its texts are there before any other app file runs.
   Contents: PINN_LANGUAGES (list of languages with flag and locale) and window.PINN_I18N (current language,
   language, stored, find, available, switchTo, wohnform, setWohnform, tk, has, famIcon, apply, keys, keysFail), plus the
   global tk(). Everything else sits in one IIFE – the only global names are PINN_LANGUAGES, PINN_I18N and tk.
   Needs js/textkern.js (plural rules, placeholders), which index.html loads right before this file.
   Since 1.119.3 there is no dictionary any more: every text of the app comes from a key (roadmap step 6 is done).
   The old German → translation dictionaries (pb_public/lang/), the MutationObserver that translated the screen,
   the alert/confirm/prompt and date wrappers and the flat share term rules are gone. Stored standard names
   (categories, places, units …) are shown in the chosen language by i18nT in js/standardnamen.js. */

/* ==========================================================
   Languages (i18n)
   ----------------------------------------------------------
   The code asks for a text by its key – tk('settings.region.title') in JavaScript, data-tk="settings.region.title"
   in HTML. Every language has a file pb_public/i18n/<code>.i18n.js with all keys (German included, English is the
   reference). Only the file of the chosen language is loaded. See .github/CONTRIBUTING.md → "Texts".
   Order of the language choice: stored on the device (or in the profile, after sign-in) →
   language of the device, if available → English (default).
   Hidden languages (hidden: true) are prepared but not offered yet; for testing they can be
   unlocked on one device with localStorage.setItem('pinn.sprachen.alle', '1'). A hidden language is translated
   step by step, so it also loads the English file: keys it does not have yet show the English text (since 1.120.0).
   Dates: always format with PINN_I18N.language.locale (never a fixed 'de-DE').
   ========================================================== */
window.PINN_LANGUAGES = [
  { code: 'en', name: 'English', locale: 'en-GB',
    flag: '<svg viewBox="0 0 60 30" aria-hidden="true"><clipPath id="fl-gb-c"><path d="M0,0v30h60V0z"/></clipPath><clipPath id="fl-gb-t"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath><g clip-path="url(#fl-gb-c)"><path d="M0,0v30h60V0z" fill="#012169"/><path d="M0,0 60,30M60,0 0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 60,30M60,0 0,30" clip-path="url(#fl-gb-t)" stroke="#C8102E" stroke-width="4"/><path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></g></svg>' },
  { code: 'fr', name: 'Français', locale: 'fr-FR',
    flag: '<svg viewBox="0 0 3 2" aria-hidden="true"><path d="M0,0h3v2H0z" fill="#ED2939"/><path d="M0,0h2v2H0z" fill="#fff"/><path d="M0,0h1v2H0z" fill="#002395"/></svg>' },
  { code: 'es', name: 'Español', locale: 'es-ES',
    flag: '<svg viewBox="0 0 750 500" aria-hidden="true"><path d="M0,0h750v500H0z" fill="#AA151B"/><path d="M0,125h750v250H0z" fill="#F1BF00"/></svg>' },
  { code: 'it', name: 'Italiano', locale: 'it-IT',
    flag: '<svg viewBox=\"0 0 3 2\" aria-hidden=\"true\"><path d=\"M0,0h3v2H0z\" fill=\"#CE2B37\"/><path d=\"M0,0h2v2H0z\" fill=\"#fff\"/><path d=\"M0,0h1v2H0z\" fill=\"#009246\"/></svg>' },
  { code: 'pt', name: 'Português', locale: 'pt-BR',
    flag: '<svg viewBox=\"0 0 20 14\" aria-hidden=\"true\"><path d=\"M0,0h20v14H0z\" fill=\"#009C3B\"/><path d=\"M10,1.6L18,7L10,12.4L2,7z\" fill=\"#FFDF00\"/><circle cx=\"10\" cy=\"7\" r=\"3.1\" fill=\"#002776\"/></svg>' },
  { code: 'zh', name: '中文', locale: 'zh-CN',
    flag: '<svg viewBox=\"0 0 30 20\" aria-hidden=\"true\"><path d=\"M0,0h30v20H0z\" fill=\"#DE2910\"/><path d=\"M5,2.2l1.2,3.7h3.9l-3.1,2.3l1.2,3.7L5,9.6L1.9,11.9l1.2-3.7L0,5.9h3.9z\" fill=\"#FFDE00\"/></svg>' },
  { code: 'ja', name: '日本語', locale: 'ja-JP',
    flag: '<svg viewBox="0 0 30 20" aria-hidden="true"><path d="M0,0h30v20H0z" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#BC002D"/></svg>' },
  { code: 'ko', name: '한국어', locale: 'ko-KR',
    flag: '<svg viewBox="0 0 36 24" aria-hidden="true"><path d="M0,0h36v24H0z" fill="#fff"/><path d="M12,12A6,6 0 0 1 24,12A3,3 0 0 1 18,12A3,3 0 0 0 12,12z" fill="#CD2E3A"/><path d="M24,12A6,6 0 0 1 12,12A3,3 0 0 1 18,12A3,3 0 0 0 24,12z" fill="#0047A0"/><g fill="#000"><g transform="translate(6.5,4.5) rotate(-57)"><rect x="-2.5" y="-2.0" width="5" height="0.8"/><rect x="-2.5" y="-0.4" width="5" height="0.8"/><rect x="-2.5" y="1.2000000000000002" width="5" height="0.8"/></g><g transform="translate(29.5,19.5) rotate(-57)"><rect x="-2.5" y="-2.0" width="2.1" height="0.8"/><rect x="0.4" y="-2.0" width="2.1" height="0.8"/><rect x="-2.5" y="-0.4" width="2.1" height="0.8"/><rect x="0.4" y="-0.4" width="2.1" height="0.8"/><rect x="-2.5" y="1.2000000000000002" width="2.1" height="0.8"/><rect x="0.4" y="1.2000000000000002" width="2.1" height="0.8"/></g><g transform="translate(29.5,4.5) rotate(57)"><rect x="-2.5" y="-2.0" width="2.1" height="0.8"/><rect x="0.4" y="-2.0" width="2.1" height="0.8"/><rect x="-2.5" y="-0.4" width="5" height="0.8"/><rect x="-2.5" y="1.2000000000000002" width="2.1" height="0.8"/><rect x="0.4" y="1.2000000000000002" width="2.1" height="0.8"/></g><g transform="translate(6.5,19.5) rotate(57)"><rect x="-2.5" y="-2.0" width="5" height="0.8"/><rect x="-2.5" y="-0.4" width="2.1" height="0.8"/><rect x="0.4" y="-0.4" width="2.1" height="0.8"/><rect x="-2.5" y="1.2000000000000002" width="5" height="0.8"/></g></g></svg>' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE',
    flag: '<svg viewBox="0 0 5 3" aria-hidden="true"><path d="M0,0h5v3H0z"/><path d="M0,1h5v2H0z" fill="#D00"/><path d="M0,2h5v1H0z" fill="#FFCE00"/></svg>' },
  // Being translated step by step (since 1.120.0), not offered until i18n/ru.i18n.js is complete
  { code: 'ru', name: 'Русский', locale: 'ru-RU', hidden: true,
    flag: '<svg viewBox="0 0 9 6" aria-hidden="true"><path d="M0,0h9v6H0z" fill="#fff"/><path d="M0,2h9v4H0z" fill="#0039A6"/><path d="M0,4h9v2H0z" fill="#D52B1E"/></svg>' },
];
(function () {
  var KEY = 'pinn.sprache';
  var DEFAULT = 'en';
  var LANGS = window.PINN_LANGUAGES;
  var ALL = false;   // hidden languages unlocked on this device (for testing a new language)
  try { ALL = localStorage.getItem('pinn.sprachen.alle') === '1'; } catch (e) { /* private mode */ }
  for (var li = 0; li < LANGS.length; li++) if (!LANGS[li].i18n) LANGS[li].i18n = 'i18n/' + LANGS[li].code + '.i18n.js';
  function find(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return (LANGS[i].hidden && !ALL) ? null : LANGS[i];
    return null;
  }
  function readStored() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function writeStored(code) { try { localStorage.setItem(KEY, code); } catch (e) { /* private mode/full */ } }
  function deviceLang() {
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < list.length; i++) { var c = String(list[i] || '').slice(0, 2).toLowerCase(); if (find(c)) return c; }
    return '';
  }
  var stored = readStored();
  var code = find(stored) ? stored : (deviceLang() || DEFAULT);
  var lang = find(code) || find(DEFAULT);

  // Living arrangement of the own family: "familie" (default) or "wg" (flat share). Comes with the family data
  // (Settings → Family members) and is remembered on the device, so pinn. shows the matching terms
  // right from the start (family → flat share, family members → flatmates …) – through the "<key>#wg" variants.
  var WG_KEY = 'pinn.wohnform';
  function readWohnform() { try { return localStorage.getItem(WG_KEY) === 'wg' ? 'wg' : 'familie'; } catch (e) { return 'familie'; } }
  var wohnform = readWohnform();
  function busy() {
    var a = document.activeElement;
    return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.nodeName) || a.isContentEditable);
  }

  var api = window.PINN_I18N = {
    current: lang.code,
    language: lang,
    defaultCode: DEFAULT,
    // Stored language of this device (for the personal settings)
    stored: function () { return find(readStored()) ? readStored() : lang.code; },
    find: find,
    // Languages that can be chosen (without hidden ones)
    available: function () { var out = []; for (var i = 0; i < LANGS.length; i++) if (find(LANGS[i].code)) out.push(LANGS[i]); return out; },
    // Switch language: remember it and reload (all texts and formatters are set up while the page loads)
    switchTo: function (c, noReload) {
      if (!find(c)) return false;
      writeStored(c);
      if (c === lang.code || noReload) return false;
      try {
        if (sessionStorage.getItem('pinn.sprache.reload') === c) return false; // no reload loop
        sessionStorage.setItem('pinn.sprache.reload', c);
      } catch (e) { return false; }
      location.reload();
      return true;
    },
    wohnform: wohnform,
    // Apply the living arrangement: remember it and – if it changed – reload. soft = the change came from
    // another device: if someone is typing, reload only once the input is finished or the app is in the background.
    setWohnform: function (v, soft) {
      v = v === 'wg' ? 'wg' : 'familie';
      try { localStorage.setItem(WG_KEY, v); } catch (e) { return false; }
      if (v === wohnform) return false;
      try {
        if (sessionStorage.getItem('pinn.wohnform.reload') === v) return false; // no reload loop
        sessionStorage.setItem('pinn.wohnform.reload', v);
      } catch (e) { return false; }
      if (!soft || !busy()) { location.reload(); return true; }
      var later = function () {
        if (!document.hidden && busy()) return;
        document.removeEventListener('visibilitychange', later);
        document.removeEventListener('focusout', tick);
        location.reload();
      };
      var tick = function () { setTimeout(later, 400); };
      document.addEventListener('visibilitychange', later);
      document.addEventListener('focusout', tick);
      return true;
    },
  };
  try { if (sessionStorage.getItem('pinn.sprache.reload') === lang.code) sessionStorage.removeItem('pinn.sprache.reload'); } catch (e) { /* ignore */ }
  try { if (sessionStorage.getItem('pinn.wohnform.reload') === wohnform) sessionStorage.removeItem('pinn.wohnform.reload'); } catch (e) { /* ignore */ }
  document.documentElement.lang = lang.code;
  document.documentElement.setAttribute('data-wohnform', wohnform);

  // Raise with every change to a text file in i18n/, otherwise devices keep using the old file.
  // .github/scripts/check-keys.js makes sure it matches src/version.txt.
  var FILE_VERSION = '1.120.2';

  // Invisible until the texts are in place (no short flash of English placeholder texts)
  var style = document.createElement('style');
  style.textContent = 'html.pinn-i18n-wait body{visibility:hidden}';
  document.head.appendChild(style);
  document.documentElement.classList.add('pinn-i18n-wait');
  var reveal = function () { document.documentElement.classList.remove('pinn-i18n-wait'); };
  setTimeout(reveal, 4000);

  /* ---------- Key-based texts ----------
     tk(key, values) returns the text of the chosen language: plural form by values.n, placeholders {name}
     filled from values (js/textkern.js). In a flat share a variant "<key>#wg" wins if the file has one.
     HTML: data-tk="key" (text), data-tk-html="key" (markup from the language file),
     data-tk-attr="placeholder:key;title:key" (attributes). The static HTML is filled in right before the app
     scripts run (src/rahmen.html calls PINN_I18N.apply(document.body)), so the scripts may change these texts
     afterwards; the sweep when the page is ready only fills in elements that were not done yet. For HTML that
     is added later call PINN_I18N.apply(element). Inside [data-no-term] (sign-in, main admin, the switch
     between family and flat share) the flat share variant is never used. A missing key shows the key itself
     and a warning in the console; texts already in an element with data-tk stay as they are.
     The family emoji: PINN_I18N.famIcon() in JavaScript, data-fam-ico on an element in HTML – a flat share
     gets the flatmates emoji instead (the texts of the files carry it in their "#wg" variants already). */
  var KEYS = null;     // key -> entry of the chosen language
  var BACKUP = null;   // English entries for a hidden language that is not fully translated yet
  var FAM_ICON = '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67';   // family
  var WG_ICON = '\uD83E\uDDD1\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1';    // people holding hands (flat share)
  function famIcon(plain) { return (wohnform === 'wg' && !plain) ? WG_ICON : FAM_ICON; }
  var warned = {};
  var keysDone = typeof WeakSet === 'function' ? new WeakSet() : null;   // elements filled in already
  // plain = keep the family terms (no flat share variant), e.g. inside [data-no-term]
  function entryOf(map, key, plain) {
    if (!map) return undefined;
    if (!plain && wohnform === 'wg' && map[key + '#wg'] !== undefined) return map[key + '#wg'];
    return map[key];
  }
  function keyEntry(key, plain) {
    var e = entryOf(KEYS, key, plain);
    return (e === undefined && BACKUP) ? entryOf(BACKUP, key, plain) : e;
  }
  function tk(key, vals, plain) {
    var e = entryOf(KEYS, key, plain), code = lang.code;
    if (e === undefined && BACKUP) { e = entryOf(BACKUP, key, plain); code = DEFAULT; }   // English plural rules
    if (e === undefined) {
      if (!warned[key]) { warned[key] = 1; try { console.warn('[pinn.] text key missing: ' + key); } catch (x) { /* no console */ } }
      return String(key);
    }
    var K = window.PINN_TEXTKERN;
    return K ? K.text(e, code, vals) : (typeof e === 'string' ? e : '');
  }
  function has(key) { return keyEntry(key) !== undefined; }
  // onlyNew = skip elements that were filled in before (their text may have been changed by the app since)
  function applyKeys(root, onlyNew) {
    if (!KEYS || !root) return;
    var list = [];
    var SEL = '[data-tk],[data-tk-html],[data-tk-attr],[data-fam-ico]';
    if (root.nodeType === 1 && root.matches && root.matches(SEL)) list.push(root);
    if (root.querySelectorAll) list = list.concat(Array.prototype.slice.call(root.querySelectorAll(SEL)));
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (keysDone) { if (onlyNew && keysDone.has(el)) continue; keysDone.add(el); }
      var plain = wohnform === 'wg' && !!el.closest && !!el.closest('[data-no-term]');
      if (el.getAttribute('data-fam-ico') !== null) el.textContent = famIcon(plain);
      var k = el.getAttribute('data-tk');
      if (k && has(k)) el.textContent = tk(k, null, plain);
      k = el.getAttribute('data-tk-html');
      if (k && has(k)) el.innerHTML = tk(k, null, plain);
      var pairs = (el.getAttribute('data-tk-attr') || '').split(';');
      for (var j = 0; j < pairs.length; j++) {
        var c = pairs[j].indexOf(':');
        if (c < 1) continue;
        var name = pairs[j].slice(0, c).trim(), key = pairs[j].slice(c + 1).trim();
        if (name && has(key)) el.setAttribute(name, tk(key, null, plain));
      }
    }
  }
  api.tk = tk;
  api.has = has;
  api.famIcon = famIcon;
  api.apply = function (root) { applyKeys(root, false); };
  // Called by i18n/<code>.i18n.js with all texts of the language
  api.keys = function (c, data) {
    if (lang.hidden && c === DEFAULT && c !== lang.code) { if (!BACKUP) BACKUP = data || {}; return; }
    if (c !== lang.code || KEYS) return;
    KEYS = data || {};
  };
  // The text file could not be loaded: keys are shown as they are (the start check reports it)
  api.keysFail = function () { if (!KEYS) { KEYS = {}; api.keysMissing = lang.i18n; } };
  window.tk = tk;
  document.write('<script src="' + lang.i18n + '?v=' + FILE_VERSION + '" onerror="PINN_I18N.keysFail()"><\/script>');
  // A hidden language (only for testing) is not complete yet: English fills the gaps
  if (lang.hidden && lang.code !== DEFAULT) document.write('<script src="i18n/' + DEFAULT + '.i18n.js?v=' + FILE_VERSION + '"><\/script>');

  // When the page is ready: fill in what is still missing and show the page
  var ready = function () { applyKeys(document, true); reveal(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('sprachen');

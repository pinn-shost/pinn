/* pinn. – Winter & Christmas look (js/winterzeit.js, since 1.145.0)
   Classic script, no build step: loaded after js/dunkelzeit.js (the load order is listed in src/rahmen.html and in
   pinn-setup.sh). The styles are in css/winterzeit.css.
   Contents:
   - Calendar: winter look from 1 December to 6 January, Christmas extras from 1 to 26 December (device time).
   - Switch: personal design value seasonFx (on by default, see currentDesignValues in js/design.js) – applies on every
     device of the profile. Before sign-in (and on the family dashboard) the last state of the device is used.
   - Movement only now and then, to save battery: a short snow shower when pinn. is opened, after a longer break and
     when the logo is tapped; at Christmas Santa flies across the top every few minutes (more often on 24 December).
     Nothing moves in idle mode (class pinn-ruhe), in the background or with "reduce motion".
   - Preview button in the settings: shows the Christmas look for one minute at any time of the year.
   The look only adds classes on <html> and one fixed layer – it never changes the layout (see css/winterzeit.css). */

var seasonFx = true;                 // personal switch
var seasonPreviewUntil = 0;          // ms timestamp – preview of the Christmas look runs until then
var seasonPreviewTimer = null;
var seasonSantaTimer = null;
var seasonDayTimer = null;
var seasonLiveTimer = null;
var seasonLayer = null;
var seasonHiddenAt = 0;
var seasonStarted = false;           // first snow shower after the start done?
var seasonLastFlurry = 0;
var SEASON_DEVICE_KEY = 'pinn.saison';        // '1' | '0' – last state of the switch on this device
var SEASON_SANTA_KEY = 'pinn.saison.santa';   // time of the last flight on this device
var SEASON_FLURRY_MS = 32000;                 // length of a snow shower
var SEASON_BREAK_MS = 20 * 60 * 1000;         // pinn. in the background at least this long -> new shower when it comes back

// Which parts of the look belong to the date? (month 11 = December, 0 = January)
function seasonPhase(now) {
  var m = now.getMonth(), d = now.getDate();
  return {
    winter: (m === 11) || (m === 0 && d <= 6),
    xmas: m === 11 && d <= 26,
    eve: m === 11 && d === 24,
  };
}

function seasonPreviewing() { return Date.now() < seasonPreviewUntil; }

// Phase that is shown right now (switch, date and preview together)
function seasonCurrent() {
  if (seasonPreviewing()) return { winter: true, xmas: true, eve: false };
  if (!seasonFx) return { winter: false, xmas: false, eve: false };
  return seasonPhase(new Date());
}

function seasonReduceMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function seasonIdle() { return document.documentElement.classList.contains('pinn-ruhe'); }
function seasonCanMove() { return !document.hidden && !seasonIdle() && !seasonReduceMotion(); }

// Sets the classes on <html> and starts or stops the movement
function seasonApply() {
  var p = seasonCurrent();
  var root = document.documentElement;
  root.classList.toggle('pinn-winter', p.winter);
  root.classList.toggle('pinn-xmas', p.xmas);
  if (!p.winter) {
    seasonStopMotion();
  } else {
    if (!seasonStarted) {
      seasonStarted = true;
      setTimeout(function () { seasonFlurry(); }, 1200);
    }
    seasonScheduleSanta();
  }
  seasonScheduleDayChange();
}

function seasonStopMotion() {
  if (seasonSantaTimer) { clearTimeout(seasonSantaTimer); seasonSantaTimer = null; }
  if (seasonLiveTimer) { clearTimeout(seasonLiveTimer); seasonLiveTimer = null; }
  document.documentElement.classList.remove('pinn-season-live');
  if (seasonLayer) { seasonLayer.remove(); seasonLayer = null; }
}

// Re-check at the next midnight (the look appears on 1 December and disappears on 7 January on its own)
function seasonScheduleDayChange() {
  if (seasonDayTimer) clearTimeout(seasonDayTimer);
  var now = new Date();
  var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  seasonDayTimer = setTimeout(function () { seasonDayTimer = null; seasonApply(); }, Math.min(next - now, 24 * 3600 * 1000));
}

// Fixed layer for snow and Santa: above the app, below pop-ups – above the sign-in and the dashboard while they are open
function seasonGetLayer() {
  if (!seasonLayer || !seasonLayer.isConnected) {
    seasonLayer = document.createElement('div');
    seasonLayer.className = 'pinn-season-layer';
    seasonLayer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(seasonLayer);
  }
  var front = ['loginScreen', 'dashboardScreen'].some(function (id) {
    var el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
  seasonLayer.style.zIndex = front ? '401' : '150';
  return seasonLayer;
}
function seasonLayerTidy() {
  if (seasonLayer && !seasonLayer.firstChild) { seasonLayer.remove(); seasonLayer = null; }
}

// A short snow shower (light flakes, ends on its own)
function seasonFlurry() {
  if (!seasonCurrent().winter || !seasonCanMove()) return;
  var now = Date.now();
  if (now - seasonLastFlurry < 4000) return;
  seasonLastFlurry = now;
  var layer = seasonGetLayer();
  var narrow = window.innerWidth < 640;
  var count = narrow ? 16 : 28;
  for (var i = 0; i < count; i++) {
    var flake = document.createElement('span');
    flake.className = 'pinn-season-flake';
    var dur = 7 + Math.random() * 6;
    var wait = Math.random() * 6;
    var rounds = Math.max(1, Math.round((SEASON_FLURRY_MS / 1000 - wait) / dur));
    flake.style.setProperty('--x', (Math.random() * 100).toFixed(1) + 'vw');
    flake.style.setProperty('--s', (3 + Math.random() * 4).toFixed(1) + 'px');
    flake.style.setProperty('--o', (0.55 + Math.random() * 0.4).toFixed(2));
    flake.style.setProperty('--d', dur.toFixed(2) + 's');
    flake.style.setProperty('--w', wait.toFixed(2) + 's');
    flake.style.setProperty('--n', String(rounds));
    flake.style.setProperty('--dx', ((Math.random() - 0.5) * 70).toFixed(0) + 'px');
    flake.addEventListener('animationend', function (e) { e.target.remove(); seasonLayerTidy(); });
    layer.appendChild(flake);
  }
  // Fairy lights twinkle only while it snows
  document.documentElement.classList.add('pinn-season-live');
  if (seasonLiveTimer) clearTimeout(seasonLiveTimer);
  seasonLiveTimer = setTimeout(function () {
    seasonLiveTimer = null;
    document.documentElement.classList.remove('pinn-season-live');
  }, SEASON_FLURRY_MS);
}

// Santa with his sleigh and three reindeer (drawn here, no image file needed)
var SEASON_SANTA_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 62">'
  + '<g fill="none" stroke="#8a6a3c" stroke-width="1"><path d="M70 38 Q100 30 128 33 Q150 30 172 28"/><path d="M70 41 Q105 40 136 39"/></g>'
  // reindeer (body, neck, head, legs, antlers)
  + '<g fill="#8b5a2b" stroke="#6d4420" stroke-width=".6">'
  + '<ellipse cx="112" cy="36" rx="12" ry="5.5"/><path d="M121 33 L126 26 L129 27 L126 34Z"/><ellipse cx="129" cy="25" rx="4.2" ry="2.8"/>'
  + '<ellipse cx="150" cy="33" rx="12" ry="5.5"/><path d="M159 30 L164 23 L167 24 L164 31Z"/><ellipse cx="167" cy="22" rx="4.2" ry="2.8"/>'
  + '<ellipse cx="186" cy="30" rx="12" ry="5.5"/><path d="M195 27 L200 20 L203 21 L200 28Z"/><ellipse cx="203" cy="19" rx="4.2" ry="2.8"/>'
  + '</g>'
  + '<g stroke="#6d4420" stroke-width="1.6" stroke-linecap="round">'
  + '<path d="M104 40 L99 47 M108 41 L106 48 M118 40 L123 46 M121 39 L127 44"/>'
  + '<path d="M142 37 L137 44 M146 38 L144 45 M156 37 L161 43 M159 36 L165 41"/>'
  + '<path d="M178 34 L173 41 M182 35 L180 42 M192 34 L197 40 M195 33 L201 38"/>'
  + '</g>'
  + '<g fill="none" stroke="#c9a46a" stroke-width="1.1" stroke-linecap="round">'
  + '<path d="M127 23 L125 17 M125 19 L122 17 M129 23 L131 17 M131 19 L134 17"/>'
  + '<path d="M165 20 L163 14 M163 16 L160 14 M167 20 L169 14 M169 16 L172 14"/>'
  + '<path d="M201 17 L199 11 M199 13 L196 11 M203 17 L205 11 M205 13 L208 11"/>'
  + '</g>'
  + '<circle cx="207.4" cy="19.4" r="1.9" fill="#ff2a2a"/><circle cx="207.4" cy="19.4" r="3.4" fill="#ff2a2a" opacity=".25"/>'
  // sleigh with Santa and his sack
  + '<path d="M16 34 Q30 30 46 33" fill="#7a4a24"/><ellipse cx="22" cy="31" rx="9" ry="7" fill="#8a5a2e"/>'
  + '<circle cx="51" cy="22" r="5" fill="#f3d2b5"/><path d="M45 21 Q51 9 58 17 L56 21Z" fill="#c8102e"/><circle cx="58.5" cy="17" r="1.8" fill="#fff"/>'
  + '<path d="M45.5 21.5 H57" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'
  + '<path d="M51 24 Q55 33 59 26 Q57 24 51 24Z" fill="#fff"/>'
  + '<path d="M42 27 Q50 22 58 27 L60 38 H42Z" fill="#c8102e"/><path d="M57 29 L66 31" stroke="#c8102e" stroke-width="3.2" stroke-linecap="round"/>'
  + '<path d="M10 33 Q12 45 24 46 H64 Q74 46 74 36 Q70 40 64 40 H30 Q22 40 20 33Z" fill="#b5122b"/>'
  + '<path d="M14 40 Q20 44 28 44 H66" fill="none" stroke="#f2c94c" stroke-width="1.2"/>'
  + '<path d="M14 50 H70 Q78 50 80 44" fill="none" stroke="#d4a43a" stroke-width="2.2" stroke-linecap="round"/>'
  + '<path d="M26 46 V50 M58 46 V50" stroke="#d4a43a" stroke-width="1.6"/>'
  + '</svg>';

function seasonSanta() {
  if (!seasonCurrent().xmas || !seasonCanMove()) return false;
  var layer = seasonGetLayer();
  if (layer.querySelector('.pinn-santa')) return false;
  var santa = document.createElement('div');
  santa.className = 'pinn-santa' + (Math.random() < 0.5 ? ' rtl' : '');
  santa.style.setProperty('--y', 'calc(env(safe-area-inset-top, 0px) + ' + Math.round(14 + Math.random() * 46) + 'px)');
  santa.style.setProperty('--d', (window.innerWidth < 640 ? 8 : 12) + 's');
  santa.innerHTML = SEASON_SANTA_SVG;  // fixed markup from this file – no user or translated text
  santa.addEventListener('animationend', function (e) {
    if (e.target !== santa) return;
    santa.remove();
    seasonLayerTidy();
  });
  layer.appendChild(santa);
  try { localStorage.setItem(SEASON_SANTA_KEY, String(Date.now())); } catch (e) { /* storage full or blocked */ }
  return true;
}

// Next flight: soon after the start when he has not flown on this device for a while, then every few minutes
function seasonScheduleSanta() {
  if (seasonSantaTimer) { clearTimeout(seasonSantaTimer); seasonSantaTimer = null; }
  var p = seasonCurrent();
  if (!p.xmas || seasonReduceMotion()) return;
  var last = 0;
  try { last = Number(localStorage.getItem(SEASON_SANTA_KEY)) || 0; } catch (e) { last = 0; }
  var gap = p.eve ? (2 + Math.random()) * 60000 : (5 + Math.random() * 4) * 60000;
  var wait = Math.max(9000, last + gap - Date.now());
  seasonSantaTimer = setTimeout(function () {
    seasonSantaTimer = null;
    seasonSanta();
    seasonScheduleSanta();
  }, wait);
}

// Takes the switch from the personal design (called by applyPersonalDesign in js/design.js)
function seasonLoad(w) {
  seasonFx = !(w && w.seasonFx === false);
  try { localStorage.setItem(SEASON_DEVICE_KEY, seasonFx ? '1' : '0'); } catch (e) { /* storage full or blocked */ }
  seasonApply();
  seasonSyncInputs();
}

function seasonSyncInputs() {
  var t = document.getElementById('seasonFxToggle');
  if (t) t.checked = seasonFx;
}

function seasonPreview() {
  seasonPreviewUntil = Date.now() + 60000;
  seasonLastFlurry = 0;
  seasonApply();
  seasonFlurry();
  setTimeout(seasonSanta, 1500);
  if (seasonPreviewTimer) clearTimeout(seasonPreviewTimer);
  seasonPreviewTimer = setTimeout(function () {
    seasonPreviewTimer = null;
    seasonPreviewUntil = 0;
    seasonApply();
  }, 60500);
}

// Tap on the logo: more snow (and at Christmas maybe Santa)
function seasonLogoTap() {
  if (!seasonCurrent().winter) return;
  seasonLastFlurry = 0;
  seasonFlurry();
  if (seasonCurrent().xmas && Math.random() < 0.5) setTimeout(seasonSanta, 900);
}

(function seasonInit() {
  try { seasonFx = localStorage.getItem(SEASON_DEVICE_KEY) !== '0'; } catch (e) { seasonFx = true; }
  var toggle = document.getElementById('seasonFxToggle');
  if (toggle) {
    toggle.addEventListener('change', function () {
      seasonFx = !!toggle.checked;
      try { localStorage.setItem(SEASON_DEVICE_KEY, seasonFx ? '1' : '0'); } catch (e) { /* storage full or blocked */ }
      seasonLastFlurry = 0;
      seasonStarted = false;
      seasonApply();
      if (typeof savePersonalDesign === 'function') savePersonalDesign();
    });
  }
  var btn = document.getElementById('seasonPreviewBtn');
  if (btn) btn.addEventListener('click', seasonPreview);
  document.querySelectorAll('.pinn-logo-wrap').forEach(function (el) { el.addEventListener('click', seasonLogoTap); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { seasonHiddenAt = Date.now(); return; }
    var away = seasonHiddenAt ? Date.now() - seasonHiddenAt : 0;
    seasonHiddenAt = 0;
    seasonApply();
    if (away >= SEASON_BREAK_MS) seasonFlurry();
  });
  seasonApply();
  seasonSyncInputs();
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('winterzeit');

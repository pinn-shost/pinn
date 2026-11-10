/* pinn. – Winter & Christmas look (js/winterzeit.js, since 1.145.0)
   Classic script, no build step: loaded after js/dunkelzeit.js (the load order is listed in src/rahmen.html and in
   pinn-setup.sh). The styles are in css/winterzeit.css.
   Contents:
   - Calendar: winter look from 1 December to 6 January, Christmas extras from 1 to 26 December (device time).
   - Switch: personal design value seasonFx (on by default, see currentDesignValues in js/design.js) – applies on every
     device of the profile. Before sign-in (and on the family dashboard) the last state of the device is used.
   - Movement only now and then, to save battery: a short snow shower when pinn. is opened, after a longer break and
     when the logo is tapped; at Christmas Santa flies across the top every 10–18 minutes (every 4–6 on 24 December).
     Nothing moves in idle mode (class pinn-ruhe), in the background or with "reduce motion".
   - Preview button in the settings: shows the Christmas look for one minute at any time of the year.
   - Snow on text: every letter of the headings, the family name and the dashboard clock is measured; snow lies only on its
     upward-facing parts (flat tops get a layer, round tops a blob in the middle, steep sides stay free). Recalculated when
     a text, the size or the font changes. Dashboard tiles get a snow cap of their own, each one a little different.
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
    seasonSnowStop();
  } else {
    seasonSnowStart();
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
  var gap = p.eve ? (4 + Math.random() * 2) * 60000 : (10 + Math.random() * 8) * 60000;
  var wait = Math.max(9000, last + gap - Date.now());
  seasonSantaTimer = setTimeout(function () {
    seasonSantaTimer = null;
    seasonSanta();
    seasonScheduleSanta();
  }, wait);
}

// ---------- Snow lying on text and tiles ----------
var SEASON_TEXT_SNOW = '#mainGrid h2.font-serif:not(.truncate), #mainGrid h3.font-serif:not(.truncate), .nt-famname, '
  + '#dashboardScreen .dash-head h1, #dashClock';
var SEASON_TILE_SNOW = '#dashTiles .dash-tile';
var SEASON_NO_HOLLY = '.nt-famname, #dashClock';   // small or changing every minute: snow only
var seasonSnowKeys = new WeakMap();                    // element -> state the current snow was made for
var seasonSnowMO = null;
var seasonSnowIO = null;
var seasonSnowTimer = null;
var seasonSnowCanvas = null;
// Letters and digits of every script get snow; emoji and symbols do not (old browsers without Unicode classes: simpler rule)
var SEASON_SNOW_LETTER = (function () {
  try { return new RegExp('[\\p{L}\\p{N}]', 'u'); } catch (e) { return /[0-9A-Za-z\u00C0-\u024F\u0370-\u052F\u0590-\u06FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/; }
})();

function seasonSnowStart() {
  if (seasonSnowMO || typeof MutationObserver !== 'function') { seasonSnowScanSoon(); return; }
  seasonSnowMO = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var rec = records[i], t = rec.target;
      if (rec.type === 'attributes') { seasonSnowScanSoon(); return; }
      // Flakes and Santa come and go in their own layer – that is no reason to measure again
      if (seasonLayer && (t === seasonLayer || seasonLayer.contains(t))) continue;
      var changed = Array.prototype.slice.call(rec.addedNodes).concat(Array.prototype.slice.call(rec.removedNodes));
      if (t === document.body && changed.length && changed.every(function (nd) {
        return nd.classList && nd.classList.contains('pinn-season-layer');
      })) continue;
      seasonSnowScanSoon();
      return;
    }
  });
  seasonSnowMO.observe(document.body, { childList: true, subtree: true, characterData: true });
  // Dark mode changes the colour of the snow outline
  seasonSnowMO.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  if (typeof IntersectionObserver === 'function') {
    seasonSnowIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) seasonSnowUpdate(e.target); });
    });
  }
  window.addEventListener('resize', seasonSnowScanSoon);
  if (document.fonts) {
    if (document.fonts.ready) document.fonts.ready.then(seasonSnowRedoAll);
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', seasonSnowRedoAll);
  }
  seasonSnowScanSoon();
}

function seasonSnowStop() {
  if (seasonSnowMO) { seasonSnowMO.disconnect(); seasonSnowMO = null; }
  if (seasonSnowIO) { seasonSnowIO.disconnect(); seasonSnowIO = null; }
  if (seasonSnowTimer) { clearTimeout(seasonSnowTimer); seasonSnowTimer = null; }
  window.removeEventListener('resize', seasonSnowScanSoon);
  if (document.fonts && document.fonts.removeEventListener) document.fonts.removeEventListener('loadingdone', seasonSnowRedoAll);
  document.querySelectorAll('.pinn-snowy').forEach(function (el) {
    el.classList.remove('pinn-snowy');
    ['--pinn-snow', '--pinn-snow-pad', '--pinn-snow-w', '--pinn-snow-h'].forEach(function (v) { el.style.removeProperty(v); });
  });
  seasonSnowKeys = new WeakMap();
}

function seasonSnowRedoAll() {
  seasonSnowKeys = new WeakMap();
  seasonSnowScanSoon();
}

function seasonSnowScanSoon() {
  if (seasonSnowTimer) clearTimeout(seasonSnowTimer);
  seasonSnowTimer = setTimeout(seasonSnowScan, 250);
}

function seasonSnowScan() {
  seasonSnowTimer = null;
  if (!seasonCurrent().winter) return;
  document.querySelectorAll(SEASON_TEXT_SNOW + ', ' + SEASON_TILE_SNOW).forEach(function (el) {
    if (seasonSnowIO) seasonSnowIO.observe(el);   // observing twice is harmless
    seasonSnowUpdate(el);
  });
}

// Small seeded random generator: the same text or tile always gets the same snow
function seasonRandom(text) {
  var h = 2166136261;
  for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function () {
    h += 0x6D2B79F5;
    var t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seasonSnowUpdate(el) {
  if (!seasonCurrent().winter || !el.isConnected) return;
  var box = el.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return;   // not shown right now – done when it appears
  var dark = document.documentElement.classList.contains('dark');
  var xmas = seasonCurrent().xmas;
  var tile = el.matches(SEASON_TILE_SNOW);
  var key = [tile ? 'tile' : el.textContent, Math.round(box.width), Math.round(box.height), dark, xmas,
    tile ? '' : getComputedStyle(el).font].join('|');
  if (seasonSnowKeys.get(el) === key && el.classList.contains('pinn-snowy')) return;
  seasonSnowKeys.set(el, key);
  var res = tile ? seasonTileSnow(el, box, dark) : seasonTextSnow(el, box, dark, xmas && !el.matches(SEASON_NO_HOLLY));
  if (!res) {
    el.classList.remove('pinn-snowy');
    return;
  }
  el.style.setProperty('--pinn-snow', 'url("data:image/svg+xml,' + encodeURIComponent(res.svg) + '")');
  el.style.setProperty('--pinn-snow-pad', res.pad + 'px');
  el.style.setProperty('--pinn-snow-w', res.w + 'px');
  el.style.setProperty('--pinn-snow-h', res.h + 'px');
  el.classList.add('pinn-snowy');
}

// Snow on the upward-facing parts of a contour.
// tops: y of the topmost ink for every column (null = no ink), step: column width in px, hMax: thickest snow in px.
// Returns the outline as SVG path data.
function seasonSnowPath(tops, step, hMax, rnd, sink) {
  var n = tops.length, h = new Array(n).fill(0), i, j;
  var ph1 = rnd() * 6.28, ph2 = rnd() * 6.28, f1 = 0.55 + rnd() * 0.5, f2 = 1.6 + rnd() * 0.9;
  var k = Math.max(1, Math.round(1.2 / step));
  for (i = 0; i < n; i++) {
    if (tops[i] === null) continue;
    var l = i, r = i;
    for (j = 1; j <= k; j++) { if (i - j >= 0 && tops[i - j] !== null) l = i - j; else break; }
    for (j = 1; j <= k; j++) { if (i + j < n && tops[i + j] !== null) r = i + j; else break; }
    var slope = r > l ? Math.abs(tops[r] - tops[l]) / ((r - l) * step) : 1;
    var flat = Math.max(0, 1 - slope / 0.9);
    flat = flat * flat * (3 - 2 * flat);
    var x = i * step / Math.max(hMax, 1);
    var bump = 0.8 + 0.2 * Math.sin(x * f1 + ph1) + 0.12 * Math.sin(x * f2 + ph2);
    h[i] = hMax * flat * bump;
  }
  // Soften the snow into lumps (only along ink, gaps stay free)
  var rad = Math.max(1, Math.round(hMax * 0.7 / step)), soft = h.slice();
  for (i = 0; i < n; i++) {
    if (tops[i] === null) continue;
    var sum = 0, cnt = 0;
    for (j = -rad; j <= rad; j++) {
      var q = i + j;
      if (q < 0 || q >= n || tops[q] === null) continue;
      sum += h[q]; cnt++;
    }
    soft[i] = Math.min(h[i] * 1.15 + 0.2, sum / cnt);
  }
  // Runs of snow; at a letter edge it hangs over a little
  var minH = Math.max(0.35, hMax * 0.12), d = '', edge = '';
  i = 0;
  while (i < n) {
    if (tops[i] === null || soft[i] < minH) { i++; continue; }
    var a = i;
    while (i < n && tops[i] !== null && soft[i] >= minH * 0.6) i++;
    var b = i - 1;
    var pts = [];
    var over = function (from, dir) {
      var m = Math.round(Math.min(soft[from] * 0.5, 1.6) / step);
      var res = [];
      for (var s2 = 1; s2 <= m; s2++) {
        var q2 = from + dir * s2;
        if (q2 < 0 || q2 >= n || tops[q2] !== null) break;
        res.push({ x: q2, t: tops[from] + s2 * step * 0.6, h: soft[from] * (1 - s2 / (m + 1)) });
      }
      return res;
    };
    var left = over(a, -1).reverse(), right = over(b, 1);
    left.forEach(function (p) { pts.push(p); });
    for (j = a; j <= b; j++) pts.push({ x: j, t: tops[j], h: soft[j] });
    right.forEach(function (p) { pts.push(p); });
    if (pts.length < 2) continue;
    var every = Math.max(1, Math.round(1 / step)), top = [], bottom = [];
    for (j = 0; j < pts.length; j++) {
      if (j % every && j !== pts.length - 1) continue;
      var px = (pts[j].x * step + step / 2).toFixed(1);
      top.push(px + ' ' + (pts[j].t - pts[j].h).toFixed(1));
      bottom.push(px + ' ' + (pts[j].t + sink).toFixed(1));
    }
    d += 'M' + top.join('L') + 'L' + bottom.reverse().join('L') + 'Z';
    edge += 'M' + top.join('L');
  }
  return { d: d, edge: edge, h: soft };
}

var SEASON_HOLLY = '<path d="M12 11C9 7 4 6 1 8C3 9 3 11 2 13C5 12 6 14 7 15C9 13 11 13 12 11Z" fill="#2f7a43"/>'
  + '<path d="M12 11C15 7 20 6 23 8C21 9 21 11 22 13C19 12 18 14 17 15C15 13 13 13 12 11Z" fill="#276b39"/>'
  + '<circle cx="10" cy="7" r="2.6" fill="#d1263b"/><circle cx="14.2" cy="6.4" r="2.6" fill="#e23447"/>'
  + '<circle cx="12.2" cy="3.4" r="2.4" fill="#c41d33"/><circle cx="13" cy="2.7" r=".7" fill="#fff" opacity=".7"/>';

// The snow is white with a fine blue-grey line all around (since 1.146.1 also in light mode – with a line only along the
// upper edge the white snow melted into the light background and seemed to float above the letters) and a light
// blue shade along its lower edge, so it reads as a soft layer lying on the letter.
function seasonSnowSvg(w, h, paths, edge, extra, dark, fill) {
  var line = '<path d="' + paths + '" fill="none" stroke="' + (dark ? '#9fb6ca' : '#8aa6bf') + '" stroke-width=".75" stroke-linejoin="round"/>';
  var shade = fill ? '' : '<path d="' + paths + '" fill="url(#ps)"/>';
  var defs = fill ? '' : '<defs><linearGradient id="ps" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#ffffff" stop-opacity="0"/>'
    + '<stop offset="1" stop-color="#c9dae9"/></linearGradient></defs>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '">' + defs
    + '<path d="' + paths + '" fill="' + (fill || '#ffffff') + '"/>' + shade + line + (extra || '') + '</svg>';
}

// Text: draw every letter where it really is (wrapped lines included) and read its top edge from the canvas
function seasonTextSnow(el, box, dark, holly) {
  var cs = getComputedStyle(el);
  var size = parseFloat(cs.fontSize) || 16;
  var pad = Math.ceil(size * 0.45);
  var w = Math.ceil(box.width) + 2, h = Math.ceil(box.height) + pad;
  if (w > 2400 || h > 600) return null;
  var S = 2;
  if (!seasonSnowCanvas) seasonSnowCanvas = document.createElement('canvas');
  var cv = seasonSnowCanvas;
  cv.width = w * S; cv.height = h * S;
  var ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  var range = document.createRange();
  var lines = [], node, count = 0;
  while ((node = walker.nextNode()) && count < 120) {
    var pcs = getComputedStyle(node.parentElement);
    if (pcs.visibility === 'hidden') continue;
    ctx.font = pcs.fontStyle + ' ' + pcs.fontWeight + ' ' + pcs.fontSize + ' ' + pcs.fontFamily;
    var upper = pcs.textTransform === 'uppercase';
    var text = node.data;
    for (var i = 0; i < text.length && count < 120; i++) {
      var code = text.charCodeAt(i);
      var len = (code >= 0xD800 && code <= 0xDBFF) ? 2 : 1;
      var ch = text.substr(i, len);
      i += len - 1;
      if (/\s/.test(ch) || !SEASON_SNOW_LETTER.test(ch)) continue;
      range.setStart(node, i - len + 1); range.setEnd(node, i + 1);
      var rects = range.getClientRects();
      if (!rects.length || rects[0].width < 0.5) continue;
      var rc = rects[0];
      var m = ctx.measureText(upper ? ch.toUpperCase() : ch);
      var asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
      var base = (asc && desc) ? rc.top + rc.height * asc / (asc + desc) : rc.top + rc.height * 0.8;
      var x = rc.left - box.left, y = base - box.top + pad;
      ctx.fillText(upper ? ch.toUpperCase() : ch, x, y);
      count++;
      // Group letters into lines by their baseline
      var line = null;
      for (var L = 0; L < lines.length; L++) if (Math.abs(lines[L].base - y) < size * 0.4) { line = lines[L]; break; }
      if (!line) { line = { base: y, top: rc.top - box.top + pad, x0: x, x1: x + rc.width, glyphs: [] }; lines.push(line); }
      line.glyphs.push([x, x + rc.width]);
      line.top = Math.min(line.top, rc.top - box.top + pad);
      line.x0 = Math.min(line.x0, x); line.x1 = Math.max(line.x1, x + rc.width);
    }
  }
  if (!count) return null;
  var img = ctx.getImageData(0, 0, cv.width, cv.height).data;
  var cols = w * S, step = 1 / S, rnd = seasonRandom(el.textContent);
  var hMax = size * 0.2, d = '', edge = '', extra = '';
  lines.forEach(function (line, li) {
    var tops = new Array(cols).fill(null);
    var y0 = Math.max(0, Math.floor(line.top * S)), y1 = Math.min(cv.height, Math.ceil((line.base + size * 0.35) * S));
    var c0 = Math.max(0, Math.floor(line.x0 * S) - 2), c1 = Math.min(cols, Math.ceil(line.x1 * S) + 2);
    for (var c = c0; c < c1; c++) {
      for (var y = y0; y < y1; y++) {
        if (img[(y * cols + c) * 4 + 3] > 110) { tops[c] = y / S; break; }
      }
    }
    // Only the top of each letter: parts lying much lower than the letter's highest point (the foot of an L, the
    // middle of a K) stay free – snow would not reach them past the upper part
    line.glyphs.forEach(function (g) {
      var a = Math.max(c0, Math.floor(g[0] * S)), b = Math.min(c1, Math.ceil(g[1] * S));
      var hi = Infinity, q;
      for (q = a; q < b; q++) if (tops[q] !== null && tops[q] < hi) hi = tops[q];
      if (hi === Infinity) return;
      for (q = a; q < b; q++) if (tops[q] !== null && tops[q] > hi + size * 0.3) tops[q] = null;
    });
    var res = seasonSnowPath(tops, step, hMax, rnd, 0.6);
    d += res.d;
    edge += res.edge;
    if (holly && li === 0) {
      // Holly on the thickest spot of the first line, in its front part
      var best = -1, bh = 0, lim = c0 + (c1 - c0) * 0.6;
      for (var q = c0; q < lim; q++) if (tops[q] !== null && res.h[q] > bh) { bh = res.h[q]; best = q; }
      if (best >= 0 && bh > hMax * 0.4) {
        var hs = size * 0.55 / 24;
        var hx = best * step - 12 * hs, hy = tops[best] - res.h[best] - 12 * hs;
        extra = '<g transform="translate(' + hx.toFixed(1) + ' ' + hy.toFixed(1) + ') scale(' + hs.toFixed(3) + ')">' + SEASON_HOLLY + '</g>';
      }
    }
  });
  if (!d) return null;
  return { svg: seasonSnowSvg(w, h, d, edge, extra, dark), pad: pad, w: w, h: h };
}

// Dashboard tile: snow cap along the rounded top edge, a few drops hanging over – every tile a little different
function seasonTileSnow(el, box, dark) {
  var w = Math.round(box.width), radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  var pad = 22, h = pad + Math.min(radius, 30) + 12, step = 0.5;
  var idx = Array.prototype.indexOf.call(el.parentNode ? el.parentNode.children : [], el);
  var rnd = seasonRandom('tile' + idx + (el.textContent || '').trim().slice(0, 20));
  var n = Math.round(w / step), tops = new Array(n);
  for (var i = 0; i < n; i++) {
    var x = i * step + step / 2, t = 0;
    if (x < radius) t = radius - Math.sqrt(Math.max(0, radius * radius - (radius - x) * (radius - x)));
    else if (x > w - radius) t = radius - Math.sqrt(Math.max(0, radius * radius - (x - (w - radius)) * (x - (w - radius))));
    tops[i] = t + pad;
  }
  var res = seasonSnowPath(tops, step, 10 + rnd() * 7, rnd, 1.5);
  if (!res.d) return null;
  // A few drops hanging over the edge, and a soft shade so the cap stands out on the light tiles
  var drops = '', count = 1 + Math.floor(rnd() * 3);
  for (var k = 0; k < count; k++) {
    var dx = radius + rnd() * Math.max(10, w - 2 * radius);
    var len = 3 + rnd() * 6, y = pad + 1;
    drops += 'M' + (dx - 2.6).toFixed(1) + ' ' + y + 'Q' + (dx - 2.4).toFixed(1) + ' ' + (y + len).toFixed(1) + ' ' + dx.toFixed(1)
      + ' ' + (y + len + 1.8).toFixed(1) + 'Q' + (dx + 2.4).toFixed(1) + ' ' + (y + len).toFixed(1) + ' ' + (dx + 2.6).toFixed(1) + ' ' + y + 'Z';
  }
  var defs = '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + (dark ? '#ffffff' : '#f2f7fb') + '"/>'
    + '<stop offset=".55" stop-color="' + (dark ? '#ffffff' : '#eaf1f7') + '"/><stop offset="1" stop-color="#d5e2ee"/></linearGradient></defs>';
  var dropsSvg = '<path d="' + drops + '" fill="#ffffff" stroke="#a9bfd1" stroke-width=".7"/>';
  var svg = seasonSnowSvg(w, h, res.d, res.edge, dropsSvg, dark, 'url(#g)').replace('<path', defs + '<path');
  return { svg: svg, pad: pad, w: w, h: h };
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
